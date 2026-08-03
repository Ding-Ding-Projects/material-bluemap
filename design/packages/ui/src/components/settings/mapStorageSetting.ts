/**
 * The map-storage-directory setting: reading it, validating it, and writing it back.
 *
 * None of the rules live here. Where the default is, what counts as an absolute path on
 * each platform, how a trailing separator is normalised and where the choice is
 * persisted are all `setup/mapStorage.ts`, which first-run setup already uses; this is
 * the same functions driven from the settings surface instead of from a wizard step, so
 * a path typed in one place cannot mean something different in the other.
 *
 * Two stores, deliberately, and in this order. The main process owns the real folder and
 * is asked first, because it is the side that can refuse — a path on a disconnected
 * drive, a folder it cannot create — and a refusal that has already been written down
 * locally leaves the app disagreeing with itself about where maps go. Only once it has
 * accepted does the local preference change, to whatever path it accepted, which may not
 * be the string that was typed.
 *
 * In a build with no bridge the local preference is still real: the wizard reads it
 * through `readMapStorageDir()` when it proposes where a new map should be written. So
 * the field saves and means something, and the section says plainly that this build
 * cannot move the folder the desktop app itself renders into.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    currentPlatform,
    defaultMapStorageDir,
    normalizeMapStorageDir,
    readMapStorageDir,
    validateMapStorageDir,
    writeMapStorageDir,
    type MapStorageProblem,
    type SetupPlatform,
} from "../setup/mapStorage.js";
import {
    browseForFolder,
    canBrowseForFolder,
    canWriteStorageDirectory,
    readStorageDirectory,
    resolveSettingsBridge,
    writeStorageDirectory,
    type SettingsBridge,
    type StorageDirectoryReadout,
} from "./settingsBridge.js";

export interface MapStorageSettingOptions {
    /**
     * Injected in tests. Left out, the preload is probed, which is why this has no
     * default: `undefined` means probe, `null` means there is deliberately no bridge.
     */
    bridge?: SettingsBridge | null;
    platform?: SetupPlatform;
}

export interface MapStorageSetting {
    /** What is in the field right now. Two-way. */
    readonly value: Ref<string>;
    /** The last value that was actually stored, so Revert has something to go back to. */
    readonly saved: Ref<string>;
    /** Why the current value cannot be used, or null. */
    readonly problem: ComputedRef<MapStorageProblem>;
    /** True when the field differs from what is stored. */
    readonly dirty: ComputedRef<boolean>;
    /** True when the field holds the platform's own default. */
    readonly isDefault: ComputedRef<boolean>;
    /** True while an await is in flight. Every submitting control disables on it. */
    readonly busy: Ref<boolean>;
    /** A refusal or an exception, stated rather than swallowed. */
    readonly failure: Ref<string | null>;
    /** The absolute folder the main process resolved, or null when it cannot be asked. */
    readonly resolved: Ref<StorageDirectoryReadout | null>;
    /** True when the last save landed, cleared as soon as the field changes again. */
    readonly savedJustNow: Ref<boolean>;
    readonly platform: SetupPlatform;
    /** True when the platform folder picker exists on this build. */
    readonly canBrowse: boolean;
    /** True when this build can move the folder the desktop app renders into. */
    readonly canApply: boolean;

    load(): Promise<void>;
    /** Stores the value. False when it was refused, invalid, or threw. */
    save(): Promise<boolean>;
    browse(): Promise<void>;
    useDefault(): void;
    revert(): void;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createMapStorageSetting(options: MapStorageSettingOptions = {}): MapStorageSetting {
    const bridge = options.bridge !== undefined ? options.bridge : resolveSettingsBridge();
    const platform = options.platform ?? currentPlatform();

    const stored = readMapStorageDir() ?? defaultMapStorageDir(platform);
    const value = ref(stored);
    const saved = ref(stored);
    const busy = ref(false);
    const failure = ref<string | null>(null);
    const resolved = ref<StorageDirectoryReadout | null>(null);
    const savedJustNow = ref(false);

    const problem = computed(() => validateMapStorageDir(value.value, platform));
    const dirty = computed(
        () => normalizeMapStorageDir(value.value, platform) !== normalizeMapStorageDir(saved.value, platform),
    );
    const isDefault = computed(() => value.value.trim() === defaultMapStorageDir(platform));

    /**
     * Re-reads both stores.
     *
     * When nothing has been chosen locally, the resolved absolute path becomes the field's
     * value: it is the real folder, it is what somebody can paste into a file manager, and
     * showing `%APPDATA%\...` beside a main process that has already expanded it is showing
     * the less true of two available answers. A path that *was* chosen is left alone — it
     * is what the person asked for, resolved or not.
     */
    async function load(): Promise<void> {
        const local = readMapStorageDir();
        if (local !== null) {
            value.value = local;
            saved.value = local;
        }

        try {
            resolved.value = await readStorageDirectory(bridge);
        } catch (error) {
            resolved.value = null;
            failure.value = describe(error);
            return;
        }

        if (local === null && resolved.value !== null) {
            value.value = resolved.value.current;
            saved.value = resolved.value.current;
        }
    }

    async function save(): Promise<boolean> {
        // Not a substitute for the disabled Save button: a keyboard submit walks straight
        // past a disabled control, and this is the guard that actually holds.
        if (busy.value) return false;
        if (problem.value !== null) return false;

        busy.value = true;
        failure.value = null;
        savedJustNow.value = false;
        try {
            let target = normalizeMapStorageDir(value.value, platform);

            if (canWriteStorageDirectory(bridge)) {
                const answer = await writeStorageDirectory(bridge, target);
                if (!answer.ok) {
                    failure.value = answer.message;
                    return false;
                }
                // The main process is authoritative about the path it accepted; it may have
                // expanded a token or resolved a link, and storing the typed string instead
                // would leave the two sides naming different folders.
                target = answer.directory;
            }

            saved.value = writeMapStorageDir(target, platform);
            value.value = saved.value;
            savedJustNow.value = true;

            try {
                resolved.value = await readStorageDirectory(bridge);
            } catch {
                // The write landed. Failing to re-read the resolution afterwards is not a
                // failed save, and reporting it as one would be untrue.
            }
            return true;
        } catch (error) {
            failure.value = describe(error);
            return false;
        } finally {
            busy.value = false;
        }
    }

    async function browse(): Promise<void> {
        if (busy.value) return;
        busy.value = true;
        failure.value = null;
        try {
            const chosen = await browseForFolder(bridge, value.value);
            if (chosen !== null) {
                value.value = chosen;
                savedJustNow.value = false;
            }
        } catch (error) {
            failure.value = describe(error);
        } finally {
            busy.value = false;
        }
    }

    function useDefault(): void {
        value.value = defaultMapStorageDir(platform);
        savedJustNow.value = false;
    }

    function revert(): void {
        value.value = saved.value;
        failure.value = null;
        savedJustNow.value = false;
    }

    return {
        value,
        saved,
        problem,
        dirty,
        isDefault,
        busy,
        failure,
        resolved,
        savedJustNow,
        platform,
        canBrowse: canBrowseForFolder(bridge),
        canApply: canWriteStorageDirectory(bridge),
        load,
        save,
        browse,
        useDefault,
        revert,
    };
}
