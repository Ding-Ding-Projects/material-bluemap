/**
 * How many release-asset parts a download fetches at once: reading the count, changing
 * it, and putting it back to the shipped default.
 *
 * The number itself, the bounds, and the plain-language explanation all come from
 * `main/files/downloadConcurrency.ts` over the `files:downloadConcurrency` /
 * `files:setDownloadConcurrency` channels - this module adds nothing to what the setting
 * means, it only drives those two calls from a settings row the same way
 * `renderMemorySetting.ts` drives the render-memory channel.
 *
 * Simpler than that sibling on purpose: there is no machine-derived "automatic"
 * recommendation here, because there is nothing about a person's hardware that makes one
 * worker count more correct than another the way half of physical memory is a reasonable
 * heap. The default is a plain, fixed number, so "reset" is just writing that number back
 * rather than switching to a different mode.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import {
    canReadDownloadConcurrency,
    canWriteDownloadConcurrency,
    readDownloadConcurrency,
    resolveSettingsBridge,
    writeDownloadConcurrency,
    type DownloadConcurrencyReadout,
    type SettingsBridge,
} from "./settingsBridge.js";

export type DownloadConcurrencySettingState = "unsupported" | "loading" | "loaded" | "failed";

export interface DownloadConcurrencySettingOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: SettingsBridge | null;
}

export interface DownloadConcurrencySetting {
    readonly state: Ref<DownloadConcurrencySettingState>;
    /** The setting as the main process last reported it. Null before the first load. */
    readonly readout: Ref<DownloadConcurrencyReadout | null>;
    /** The field's value, as typed. Read as a whole number of workers. */
    readonly workers: Ref<string>;
    readonly busy: Ref<boolean>;
    /** A refusal from the main process, or an exception, stated rather than swallowed. */
    readonly failure: Ref<string | null>;
    /** True when the last save landed, cleared as soon as the field changes again. */
    readonly savedJustNow: Ref<boolean>;
    /** Why the field cannot be saved right now, or null. Checked before the round trip. */
    readonly problem: ComputedRef<string | null>;
    /** True when the field differs from what is actually stored. */
    readonly dirty: ComputedRef<boolean>;
    /** True when the stored setting is the shipped default. */
    readonly isDefault: ComputedRef<boolean>;
    /** True when this build can report the setting at all. */
    readonly supported: boolean;
    /** True when this build can change it, not merely report it. */
    readonly canApply: boolean;

    load(): Promise<void>;
    /** Stores whatever the field currently holds. False when it was refused or threw. */
    save(): Promise<boolean>;
    /**
     * Puts the field back to the shipped default and saves immediately.
     *
     * The per-setting reset the settings surface's own conventions call for: one press,
     * no separate confirmation, because going back to the number every fresh install
     * already uses is the least dangerous choice this row can make.
     */
    reset(): Promise<boolean>;
}

function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

export function createDownloadConcurrencySetting(
    options: DownloadConcurrencySettingOptions = {},
): DownloadConcurrencySetting {
    const bridge = options.bridge !== undefined ? options.bridge : resolveSettingsBridge();
    const supported = canReadDownloadConcurrency(bridge);
    const canApply = canWriteDownloadConcurrency(bridge);

    const state = ref<DownloadConcurrencySettingState>(supported ? "loading" : "unsupported");
    const readout = ref<DownloadConcurrencyReadout | null>(null);
    const rawWorkers = ref("");
    const busy = ref(false);
    const failure = ref<string | null>(null);
    const savedJustNow = ref(false);

    // A writable computed wrapper rather than a plain ref, so a fresh edit clears "Saved"
    // immediately instead of leaving it claiming a value that no longer matches the field.
    const workers = computed<string>({
        get: () => rawWorkers.value,
        set: (next) => {
            rawWorkers.value = next;
            savedJustNow.value = false;
        },
    });

    const problem = computed<string | null>(() => {
        const trimmed = workers.value.trim();
        if (trimmed === "") return "Give a number of parts, or reset to the default.";
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed)) return "That is not a number.";
        const bounds = readout.value;
        if (bounds !== null && parsed < bounds.minimumWorkers) {
            return `At least ${String(bounds.minimumWorkers)} part has to be fetched at a time.`;
        }
        if (bounds !== null && parsed > bounds.maximumWorkers) {
            return `That is more than the ${String(bounds.maximumWorkers)} this setting allows.`;
        }
        return null;
    });

    const dirty = computed(() => {
        const current = readout.value;
        if (current === null) return false;
        return String(current.workers) !== workers.value.trim();
    });

    const isDefault = computed(() => readout.value?.isDefault ?? false);

    function applyReadout(next: DownloadConcurrencyReadout): void {
        readout.value = next;
        workers.value = String(next.workers);
    }

    async function load(): Promise<void> {
        if (!supported) {
            state.value = "unsupported";
            return;
        }
        state.value = "loading";
        failure.value = null;
        try {
            const answer = await readDownloadConcurrency(bridge);
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

    async function commit(value: number): Promise<boolean> {
        if (busy.value) return false;
        busy.value = true;
        failure.value = null;
        savedJustNow.value = false;
        try {
            const result = await writeDownloadConcurrency(bridge, value);
            if (!result.ok) {
                failure.value = result.reason;
                return false;
            }
            applyReadout(result.setting);
            savedJustNow.value = true;
            // This setting's real, authoritative copy is `download-concurrency.json` in
            // the main process - it has no dedicated version history of its own the way
            // profiles and the app-settings bag do, so this is the only place a change to
            // it becomes visible in the "Application settings" history at all.
            // Fire-and-forget, the same as every other key `recordAppSetting` carries: a
            // history mirror that fails must never turn a save that worked into one that
            // failed.
            recordAppSetting("downloadConcurrency", result.setting);
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
        return await commit(Number(workers.value.trim()));
    }

    async function reset(): Promise<boolean> {
        const target = readout.value?.defaultWorkers ?? 4;
        return await commit(target);
    }

    return {
        state,
        readout,
        workers,
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
