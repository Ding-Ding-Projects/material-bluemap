/**
 * The seam between the options GUI and whatever can actually touch a disk.
 *
 * Everything else in this folder is pure: it reads and writes strings, and never
 * knows where a config folder lives. That is deliberate. The editor has to work
 * in three places with three different amounts of privilege:
 *
 *   - inside the Electron shell, where a preload bridge can read a folder, write
 *     files, open a native picker and probe a database;
 *   - inside a plain browser tab (`pnpm --filter ui dev`), where none of that
 *     exists;
 *   - inside vitest, where a fake host makes the whole flow testable without a
 *     file system.
 *
 * A missing host is a stated fact, never a disabled-looking button that silently
 * does nothing. {@link useConfigHost} returns `null` when nothing is wired up,
 * and the surfaces that need one say what is missing and keep every read-only
 * capability (editing, validating, previewing and copying the file text) working.
 */

import { inject, provide, type InjectionKey } from "vue";

/** One config file, with its path relative to the config folder. */
export interface HostConfigFile {
    /** Always forward slashes, e.g. `maps/overworld.conf`. */
    readonly path: string;
    readonly text: string;
}

/** What a config folder held when it was read. */
export interface HostFolderContents {
    /** The folder that was read, absolute. */
    readonly folder: string;
    readonly files: readonly HostConfigFile[];
}

/** Answer from a real connection attempt against a database. */
export interface SqlProbeResult {
    readonly ok: boolean;
    /** One line for the user. On failure this is the driver's own message. */
    readonly message: string;
    /** Driver, dialect or stack detail worth showing behind a disclosure. */
    readonly detail?: string;
}

/** What {@link ConfigHost.testSqlConnection} needs to make a real attempt. */
export interface SqlProbeRequest {
    readonly connectionUrl: string;
    readonly properties: Readonly<Record<string, string>>;
    readonly dialect: string | null;
    readonly driverJar: string | null;
    readonly driverClass: string | null;
}

export interface PickDirectoryOptions {
    readonly title: string;
    /** Where the picker opens, when the caller has a sensible guess. */
    readonly startIn?: string;
}

export interface PickFileOptions {
    readonly title: string;
    /** Extensions without the dot, e.g. `["jar"]`. */
    readonly extensions?: readonly string[];
    readonly startIn?: string;
}

/**
 * Everything the editor asks of its environment.
 *
 * Every method may reject. Callers report the rejection verbatim rather than
 * flattening it to "something went wrong": when a write fails because a folder
 * is read-only, that sentence is the whole answer.
 */
export interface ConfigHost {
    /** Named in the interface when a capability is missing, e.g. `Electron shell`. */
    readonly name: string;
    /** `\\` on Windows, `/` elsewhere. Used only to build display paths. */
    readonly separator: string;

    /** Reads every config file under a folder. Missing folder is an error. */
    readFolder(folder: string): Promise<HostFolderContents>;
    /** Creates the folder if needed and writes each file, replacing what is there. */
    writeFiles(folder: string, files: readonly HostConfigFile[]): Promise<void>;
    /** Deletes files, by path relative to the folder. Missing files are not an error. */
    deleteFiles(folder: string, paths: readonly string[]): Promise<void>;

    pickDirectory(options: PickDirectoryOptions): Promise<string | null>;
    pickFile(options: PickFileOptions): Promise<string | null>;

    /** Opens a real connection and reports what the driver said. */
    testSqlConnection(request: SqlProbeRequest): Promise<SqlProbeResult>;

    /** The folder the app would use if the user does not choose one. */
    suggestConfigFolder(): Promise<string>;
}

/**
 * The shape the preload bridge is expected to expose, as an optional extension
 * of the existing `window.materialBluemap` object.
 *
 * This is declared here rather than in `bridge.d.ts` so that the editor compiles
 * against a shell that has not grown these methods yet, and degrades to "no host"
 * at runtime instead of failing to build.
 */
interface BridgeConfigApi {
    readFolder(folder: string): Promise<HostFolderContents>;
    writeFiles(folder: string, files: readonly HostConfigFile[]): Promise<void>;
    deleteFiles(folder: string, paths: readonly string[]): Promise<void>;
    pickDirectory(options: PickDirectoryOptions): Promise<string | null>;
    pickFile(options: PickFileOptions): Promise<string | null>;
    testSqlConnection(request: SqlProbeRequest): Promise<SqlProbeResult>;
    suggestConfigFolder(): Promise<string>;
    pathSeparator?: string;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * Probes `window.materialBluemap.config` and returns a host only when every
 * method is really there.
 *
 * A half-wired bridge is worse than none: it would present a folder picker that
 * throws the moment somebody clicks it. All or nothing is the honest answer.
 */
export function createBridgeConfigHost(): ConfigHost | null {
    if (typeof window === "undefined") return null;

    const root = (window as { materialBluemap?: { config?: unknown } }).materialBluemap;
    const api = root?.config as Partial<BridgeConfigApi> | undefined;
    if (!api) return null;

    const required = [
        api.readFolder,
        api.writeFiles,
        api.deleteFiles,
        api.pickDirectory,
        api.pickFile,
        api.testSqlConnection,
        api.suggestConfigFolder,
    ];
    if (!required.every(isFunction)) return null;

    const complete = api as BridgeConfigApi;
    return {
        name: "Electron shell",
        separator: complete.pathSeparator ?? "/",
        readFolder: (folder) => complete.readFolder(folder),
        writeFiles: (folder, files) => complete.writeFiles(folder, files),
        deleteFiles: (folder, paths) => complete.deleteFiles(folder, paths),
        pickDirectory: (options) => complete.pickDirectory(options),
        pickFile: (options) => complete.pickFile(options),
        testSqlConnection: (request) => complete.testSqlConnection(request),
        suggestConfigFolder: () => complete.suggestConfigFolder(),
    };
}

const CONFIG_HOST: InjectionKey<ConfigHost | null> = Symbol("material-bluemap-config-host");

/** Installs a host for everything below this component. */
export function provideConfigHost(host: ConfigHost | null): void {
    provide(CONFIG_HOST, host);
}

/**
 * The host, or `null` when this build cannot reach a file system.
 *
 * Callers must handle `null` by saying so. Every editing, validation and preview
 * path works without one; only reading a folder, saving, picking a path and
 * probing a database do not.
 */
export function useConfigHost(): ConfigHost | null {
    return inject(CONFIG_HOST, null);
}

/** One sentence explaining what cannot be done and why, for a disabled control. */
export function hostMissingReason(action: string): string {
    return `${action} needs the desktop app. This page is running in a browser tab, which has no access to your file system. Everything else here still works: you can edit, validate and copy the config text.`;
}

/** Joins a folder and a relative config path for display, using the host's separator. */
export function displayPath(host: ConfigHost | null, folder: string | null, relative: string): string {
    if (folder === null) return relative;
    const separator = host?.separator ?? "/";
    const trimmed = folder.replace(/[\\/]+$/, "");
    return `${trimmed}${separator}${relative.split("/").join(separator)}`;
}
