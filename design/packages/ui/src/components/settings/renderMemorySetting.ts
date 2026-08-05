/**
 * How much memory a render's JVM may use: reading the ceiling, changing it, and putting
 * it back to automatic.
 *
 * The number itself, the bounds, the machine's own memory and the plain-language
 * explanation all come from `main/files/renderMemory.ts` over the `files:renderMemory` /
 * `files:setRenderMemory` channels — this module adds nothing to what a heap ceiling
 * means, it only drives those two calls from a settings row the same way
 * `mapStorageSetting.ts` drives the storage-directory channel.
 *
 * `RenderMemoryStore` on the main side already refuses a number below its own minimum or
 * above the machine's physical memory and reports why; this module surfaces that refusal
 * rather than re-deciding it, plus one thing worth checking before the round trip: an
 * empty or non-numeric field, so Save can stay disabled instead of sending `NaN` over IPC
 * to be refused a second time.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import {
    canReadRenderMemory,
    canWriteRenderMemory,
    readRenderMemory,
    resolveSettingsBridge,
    writeRenderMemory,
    type RenderMemoryReadout,
    type SettingsBridge,
} from "./settingsBridge.js";

export type RenderMemorySettingState = "unsupported" | "loading" | "loaded" | "failed";

export interface RenderMemorySettingOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: SettingsBridge | null;
}

export interface RenderMemorySetting {
    readonly state: Ref<RenderMemorySettingState>;
    /** The setting as the main process last reported it. Null before the first load. */
    readonly readout: Ref<RenderMemoryReadout | null>;
    /** The mode the controls show right now. Manual reveals the number field. */
    readonly mode: Ref<"automatic" | "manual">;
    /** The manual field's value, in megabytes. Read only while `mode` is "manual". */
    readonly megabytes: Ref<string>;
    readonly busy: Ref<boolean>;
    /** A refusal from the main process, or an exception, stated rather than swallowed. */
    readonly failure: Ref<string | null>;
    /** True when the last save landed, cleared as soon as either control changes again. */
    readonly savedJustNow: Ref<boolean>;
    /** Why the manual field cannot be saved right now, or null. Checked before the round trip. */
    readonly problem: ComputedRef<string | null>;
    /** True when the controls differ from what is actually stored. */
    readonly dirty: ComputedRef<boolean>;
    /** True when the stored setting is "automatic" — the shipped default. */
    readonly isDefault: ComputedRef<boolean>;
    /** True when this build can report the ceiling at all. */
    readonly supported: boolean;
    /** True when this build can change it, not merely report it. */
    readonly canApply: boolean;

    load(): Promise<void>;
    /** Stores whatever the controls currently hold. False when it was refused or threw. */
    save(): Promise<boolean>;
    /**
     * Puts both controls back to automatic and saves immediately.
     *
     * The per-setting reset the settings surface's own conventions call for: one press,
     * no separate confirmation, because choosing "let the app decide" is the least
     * dangerous choice this row can make and is exactly what a fresh install already has.
     */
    reset(): Promise<boolean>;
}

function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

export function createRenderMemorySetting(options: RenderMemorySettingOptions = {}): RenderMemorySetting {
    const bridge = options.bridge !== undefined ? options.bridge : resolveSettingsBridge();
    const supported = canReadRenderMemory(bridge);
    const canApply = canWriteRenderMemory(bridge);

    const state = ref<RenderMemorySettingState>(supported ? "loading" : "unsupported");
    const readout = ref<RenderMemoryReadout | null>(null);
    const rawMode = ref<"automatic" | "manual">("automatic");
    const rawMegabytes = ref("");
    const busy = ref(false);
    const failure = ref<string | null>(null);
    const savedJustNow = ref(false);

    // Writable computed wrappers rather than plain refs, so a fresh edit in either
    // control - flipping the mode, or typing a new number - clears "Saved" immediately
    // instead of leaving it claiming a value that no longer matches what is on screen.
    const mode = computed<"automatic" | "manual">({
        get: () => rawMode.value,
        set: (next) => {
            rawMode.value = next;
            savedJustNow.value = false;
        },
    });
    const megabytes = computed<string>({
        get: () => rawMegabytes.value,
        set: (next) => {
            rawMegabytes.value = next;
            savedJustNow.value = false;
        },
    });

    const problem = computed<string | null>(() => {
        if (mode.value !== "manual") return null;
        const trimmed = megabytes.value.trim();
        if (trimmed === "") return "Give a number of megabytes, or switch back to Automatic.";
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) return "That is not a number.";
        const bounds = readout.value;
        if (bounds !== null && parsed < bounds.minimumMegabytes) {
            return `BlueMap needs at least ${String(bounds.minimumMegabytes)} MB to load its resources at all.`;
        }
        if (bounds !== null && bounds.machineMegabytes > 0 && parsed > bounds.machineMegabytes) {
            return "That is more memory than this machine has.";
        }
        return null;
    });

    const dirty = computed(() => {
        const current = readout.value;
        if (current === null) return false;
        if (current.mode !== mode.value) return true;
        if (mode.value !== "manual") return false;
        return String(current.megabytes) !== megabytes.value.trim();
    });

    const isDefault = computed(() => readout.value?.mode === "automatic");

    function applyReadout(next: RenderMemoryReadout): void {
        readout.value = next;
        mode.value = next.mode;
        megabytes.value = String(next.megabytes);
    }

    async function load(): Promise<void> {
        if (!supported) {
            state.value = "unsupported";
            return;
        }
        state.value = "loading";
        failure.value = null;
        try {
            const answer = await readRenderMemory(bridge);
            if (answer === null) {
                state.value = "unsupported";
                return;
            }
            applyReadout(answer);
            state.value = "loaded";
        } catch (error) {
            failure.value = describe(error);
            state.value = "failed";
        }
    }

    async function commit(request: { mode: "automatic" } | { mode: "manual"; megabytes: number }): Promise<boolean> {
        if (busy.value) return false;
        busy.value = true;
        failure.value = null;
        savedJustNow.value = false;
        try {
            const result = await writeRenderMemory(bridge, request);
            if (!result.ok) {
                failure.value = result.reason;
                return false;
            }
            applyReadout(result.setting);
            savedJustNow.value = true;
            // This setting's real, authoritative copy is `render-memory.json` in the main
            // process - it has no dedicated version history of its own the way profiles and
            // the app-settings bag do, so this is the only place a change to it becomes
            // visible in the "Application settings" history at all. Fire-and-forget, the
            // same as every other key `recordAppSetting` carries: a history mirror that
            // fails must never turn a save that worked into one that failed.
            recordAppSetting("renderMemory", result.setting);
            return true;
        } catch (error) {
            failure.value = describe(error);
            return false;
        } finally {
            busy.value = false;
        }
    }

    async function save(): Promise<boolean> {
        if (problem.value !== null) return false;
        if (mode.value === "automatic") return await commit({ mode: "automatic" });
        return await commit({ mode: "manual", megabytes: Number(megabytes.value.trim()) });
    }

    async function reset(): Promise<boolean> {
        mode.value = "automatic";
        return await commit({ mode: "automatic" });
    }

    return {
        state,
        readout,
        mode,
        megabytes,
        busy,
        failure,
        savedJustNow,
        problem,
        dirty,
        isDefault,
        supported,
        canApply,
        load,
        save,
        reset,
    };
}
