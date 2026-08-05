/**
 * The bridge behind `PathField.vue`: the screen-agnostic folder/file picker.
 *
 * `configHost.ts` probes `window.materialBluemap.config` and is only ever installed by three
 * screens (`WorldScreen.vue`, `ProjectsScreen.vue`, `ConfigScreen.vue`) through
 * `provideConfigHost()`. Settings, Backup and the remote target editor sit outside all three,
 * so `useConfigHost()` resolves to `null` there even in the real desktop app. This probes
 * `window.materialBluemap.dialog` directly instead - reachable from anywhere in the renderer,
 * with nothing to provide and nothing to inject.
 *
 * Same all-or-nothing rule as `createBridgeConfigHost`: a half-wired bridge is worse than
 * none, because it would show a working-looking browse button that throws the moment
 * somebody clicks it.
 */

export interface PickFolderOptions {
    readonly title: string;
    /** Where the picker opens. Ignored unless it names a folder that really exists. */
    readonly startIn?: string;
}

export interface PickFileOptions extends PickFolderOptions {
    /** Extensions without the dot, e.g. `["jar"]`. Omitted or empty means every file. */
    readonly extensions?: readonly string[];
}

export interface PathFieldBridge {
    pickFolder(options: PickFolderOptions): Promise<string | null>;
    pickFile(options: PickFileOptions): Promise<string | null>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The dialog half of the preload, or null when this build has none. */
export function resolvePathFieldBridge(): PathFieldBridge | null {
    if (typeof window === "undefined") return null;

    const root = (window as { materialBluemap?: { dialog?: unknown } }).materialBluemap;
    const api = root?.dialog as Partial<PathFieldBridge> | undefined;
    if (!api) return null;
    if (!isFunction(api.pickFolder) || !isFunction(api.pickFile)) return null;

    const complete = api as PathFieldBridge;
    return {
        pickFolder: (options) => complete.pickFolder(options),
        pickFile: (options) => complete.pickFile(options),
    };
}
