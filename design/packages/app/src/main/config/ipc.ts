/**
 * The config-folder channel between the main process and the options GUI.
 *
 * Everything under `packages/ui/.../config/` is pure: it opens config text, edits it,
 * validates it, and produces a list of files to write, and none of it ever learns where
 * those files live. This is the other half of that seam - the only code in the options
 * editor allowed to touch a disk - and it is written to the shape `configHost.ts` probes
 * for, method for method, because that probe refuses a half-wired bridge outright.
 *
 * Built like `java/ipc.ts` and `world/index.ts`: Electron arrives as a *type*, `IpcMain`
 * and the dialog module are parameters, and the import is erased at build time. The whole
 * of this file is therefore exercised by tests with no Electron runtime anywhere near
 * them, native picker included. Every channel is named once in {@link CONFIG_CHANNELS} so
 * `dispose` cannot drift from the registration.
 *
 * ## The chosen folder is the capability, and the renderer cannot widen it
 *
 * The renderer names the config folder, and then names files "inside" it. That second
 * name is the dangerous one: `../../../.ssh/authorized_keys` is a perfectly ordinary
 * string for a compromised renderer to send, and joining it onto a folder produces a path
 * that is nowhere near the folder. So a relative name is never joined before it has been
 * read, and {@link checkConfigPath} refuses everything that is not one of the shapes
 * BlueMap's own config loader recognises:
 *
 * ```
 * core.conf | webapp.conf | webserver.conf | plugin.conf     (or the .json spelling)
 * maps/<name>.conf
 * storages/<name>.conf
 * ```
 *
 * That is deliberately tighter than "does not escape". Refusing traversal alone would
 * still let the editor be talked into overwriting a `level.dat` in a folder somebody
 * pointed it at by mistake; refusing everything that is not a config file the editor
 * models means the worst a wrong folder costs is a file that was already a config file.
 *
 * Symbolic links are the other way out of a folder, and they do not look like traversal
 * at all. Reading follows `world/inspect.ts`: names come from a directory read, and a
 * directory read never follows a link, so a `maps` that is really a link to somewhere
 * else is simply not descended into. Writing cannot be silent about it the same way - a
 * skipped folder there would become a folder created beside it - so a link in the way is
 * refused by name.
 *
 * ## What crosses
 *
 * Plain objects of strings, built here field by field, because Electron structured-clones
 * what crosses and refuses what it cannot. Errors cross as one sentence: every rejection
 * is rethrown as a fresh `Error` whose message says what could not be done and why, so a
 * subsystem's own stack or syscall noise never becomes interface copy.
 */

import type { IpcMain, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { lstat, mkdir, opendir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, posix, win32 } from "node:path";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const CONFIG_CHANNELS = [
    "config:readFolder",
    "config:writeFiles",
    "config:deleteFiles",
    "config:pickDirectory",
    "config:pickFile",
    "config:testSqlConnection",
    "config:suggestFolder",
] as const;

/* -------------------------------------------------------------------------- */
/* What crosses                                                               */
/* -------------------------------------------------------------------------- */

/** One config file, with its path relative to the config folder. */
export interface ConfigFile {
    /** Always forward slashes, e.g. `maps/overworld.conf`. */
    readonly path: string;
    readonly text: string;
}

/** What a config folder held when it was read. */
export interface ConfigFolderContents {
    /** The folder that was read, absolute and exactly as it was given. */
    readonly folder: string;
    readonly files: readonly ConfigFile[];
}

export interface PickDirectoryOptions {
    readonly title: string;
    /** Where the picker opens. Ignored unless it is a full path. */
    readonly startIn?: string;
}

export interface PickFileOptions {
    readonly title: string;
    /** Extensions without the dot, e.g. `["jar"]`. */
    readonly extensions?: readonly string[];
    readonly startIn?: string;
}

/** What the storages screen collects, mirroring `sqlStorageConfigSchema`. */
export interface SqlProbeRequest {
    readonly connectionUrl: string;
    /** `connection-properties`, which is where the user name and password live. */
    readonly properties: Readonly<Record<string, string>>;
    readonly dialect: string | null;
    readonly driverJar: string | null;
    readonly driverClass: string | null;
}

/** Answer from a real connection attempt, or an honest account of why there was none. */
export interface SqlProbeResult {
    readonly ok: boolean;
    /** One line for the user. On a driver failure this is the driver's own message. */
    readonly message: string;
    /** Driver or dialect detail worth showing behind a disclosure. */
    readonly detail?: string;
}

/* -------------------------------------------------------------------------- */
/* What a config folder is allowed to contain                                 */
/* -------------------------------------------------------------------------- */

/** Suffixes BlueMap's `ConfigLoader.REGISTRY` recognises, mirroring the config package. */
export const CONFIG_SUFFIXES = [".conf", ".json"] as const;

/** The two subfolders BlueMap loads a collection of files from. */
export const CONFIG_SUBFOLDERS = ["maps", "storages"] as const;

/**
 * The files the editor models at the top of a config folder.
 *
 * A folder may hold others, and reading reports them so the editor can say it left them
 * alone. Writing does not: every file this editor produces is one of these four, a map or
 * a storage, so anything else arriving on the write channel is a bug on the other side at
 * best, and at worst a renderer that has been talked into overwriting something.
 */
export const ROOT_CONFIG_NAMES = ["core", "webapp", "webserver", "plugin"] as const;

/**
 * Caps, so a folder that is not a config folder cannot turn a read into a file crawler or
 * a write into a way to fill a disk.
 *
 * Both are far above anything real. A generous BlueMap install has a dozen maps; the
 * largest config file anybody writes by hand is a map with a long `marker-sets` block,
 * measured in tens of kilobytes rather than megabytes.
 */
export const MAX_CONFIG_FILES = 512;
export const MAX_CONFIG_BYTES = 4 * 1024 * 1024;

/**
 * Characters no segment may contain.
 *
 * Control characters and the five Windows-reserved punctuation marks, plus `:` which is
 * handled separately because it is also how a drive and an alternate data stream are
 * spelled. None of them can be written on Windows at all, so refusing them by name turns
 * an `EINVAL` nobody can act on into a sentence that names the file.
 */
const FORBIDDEN_IN_SEGMENT = /[\u0000-\u001F<>"|?*]/;

/**
 * Windows device names, which are reserved *before* the suffix.
 *
 * `maps/CON.conf` is not a file on Windows: it is the console. Opening it for writing
 * succeeds, writes nothing to disk, and leaves the editor believing it saved a map. This
 * is the one refusal here that protects against a mistake rather than an attack, and it
 * costs nothing on the platforms where those names are ordinary.
 */
const RESERVED_DEVICE_NAME = /^(?:CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;

/** True for a file name BlueMap would load as a config file. */
export function isConfigFileName(name: string): boolean {
    return CONFIG_SUFFIXES.some((suffix) => name.length > suffix.length && name.endsWith(suffix));
}

/** The file name with its config suffix removed, which is `ConfigManager.getConfigName`. */
export function configNameOf(fileName: string): string {
    for (const suffix of CONFIG_SUFFIXES) {
        if (fileName.endsWith(suffix)) return fileName.slice(0, fileName.length - suffix.length);
    }
    return fileName;
}

export type ConfigPathCheck =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly reason: string };

/**
 * Reads a name the renderer sent and decides whether it may be written or deleted.
 *
 * Nothing here touches a disk, and nothing joins the name onto anything, which is the
 * point: by the time a path is built the shape has already been proved, so there is no
 * moment at which `..` exists as a resolved path that only a later check would catch.
 *
 * The absolute forms are refused in the spelling they arrived in, before separators are
 * normalised, because `C:\x`, `\\server\share\x` and `/x` are each absolute on some
 * platform and this process may not be running on the one the sender had in mind.
 */
export function checkConfigPath(relative: string): ConfigPathCheck {
    const given = relative.trim();
    if (given === "") {
        return { ok: false, reason: "A config file was named with an empty path, so there was nothing to change." };
    }
    if (win32.isAbsolute(given) || posix.isAbsolute(given)) {
        return {
            ok: false,
            reason: `${given} is a full path. Files are named relative to the config folder, like maps/overworld.conf.`,
        };
    }

    const segments = given.replace(/\\/g, "/").split("/");
    for (const segment of segments) {
        if (segment === "") {
            return { ok: false, reason: `${given} has an empty folder name in it, so it does not name a file.` };
        }
        if (segment === "..") {
            return {
                ok: false,
                reason: `${given} points outside the config folder. Only files inside the folder you chose can be changed.`,
            };
        }
        if (segment === ".") {
            return { ok: false, reason: `${given} contains a "." step. Name the file plainly, like maps/overworld.conf.` };
        }
        if (segment.includes(":")) {
            return { ok: false, reason: `${given} names a drive or a stream rather than a file inside the config folder.` };
        }
        if (FORBIDDEN_IN_SEGMENT.test(segment)) {
            return { ok: false, reason: `${given} contains a character that cannot be part of a file name.` };
        }
    }

    const fileName = segments[segments.length - 1] ?? "";
    if (!isConfigFileName(fileName)) {
        return {
            ok: false,
            reason: `${given} is not a config file. BlueMap loads ${CONFIG_SUFFIXES.join(" and ")} files.`,
        };
    }
    const name = configNameOf(fileName);
    if (RESERVED_DEVICE_NAME.test(name)) {
        return { ok: false, reason: `${given} uses a name Windows reserves for a device, so it would not be a file.` };
    }

    if (segments.length === 1) {
        if (!(ROOT_CONFIG_NAMES as readonly string[]).includes(name)) {
            return {
                ok: false,
                reason:
                    `${given} is not one of the config files this editor writes. The folder itself holds ` +
                    `${ROOT_CONFIG_NAMES.join(", ")}; a map goes in maps/ and a storage in storages/.`,
            };
        }
        return { ok: true, path: fileName };
    }

    if (segments.length === 2) {
        const folder = segments[0] ?? "";
        const canonical = CONFIG_SUBFOLDERS.find((known) => known.toLowerCase() === folder.toLowerCase());
        if (canonical === undefined) {
            return {
                ok: false,
                reason: `${given} is not somewhere this editor writes. A map goes in maps/ and a storage in storages/.`,
            };
        }
        return { ok: true, path: `${canonical}/${fileName}` };
    }

    return {
        ok: false,
        reason: `${given} is nested deeper than a BlueMap config folder goes, which is one level.`,
    };
}

/** The checked path, or an error carrying the reason it was refused. */
function requireConfigPath(relative: string): string {
    const checked = checkConfigPath(relative);
    if (!checked.ok) throw new Error(checked.reason);
    return checked.path;
}

/**
 * The chosen folder, or an error saying why it is unusable.
 *
 * A relative path is refused rather than resolved. The editor already refuses one, but
 * the main process cannot take the renderer's word for that: resolving it would read and
 * write beside whatever directory the app happened to start in, which is a folder nobody
 * chose. Returned exactly as given, only trimmed, so every message built from it names the
 * path the person actually typed.
 */
function requireAbsoluteFolder(folder: string): string {
    const trimmed = folder.trim();
    if (trimmed === "") {
        throw new Error("No config folder was given, so there was nothing to open.");
    }
    if (!isAbsolute(trimmed)) {
        throw new Error(
            `${trimmed} is not a full path, so where it points depends on where the app was ` +
                `started. Choose the folder again, or give a path that starts from a drive letter ` +
                `or from the root of the file system.`,
        );
    }
    return trimmed;
}

/**
 * The on-disk spelling of `maps` or `storages`, exact first and then case-insensitively.
 *
 * Windows opens `Maps` and `maps` as the same directory, so a config folder written by a
 * tool that capitalised it holds its maps in the directory this one would write to
 * anyway. Reading it under any other name than the canonical one would show the editor a
 * folder with no maps, and then let it create the ones it already has.
 *
 * The names passed in are always real directories - they come from a directory read,
 * where a symbolic link is not a directory - so nothing matched here is a way out of the
 * chosen folder.
 */
function pickDirectoryName(names: readonly string[], canonical: string): string | null {
    for (const name of names) if (name === canonical) return name;
    const lower = canonical.toLowerCase();
    for (const name of names) if (name.toLowerCase() === lower) return name;
    return null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** A leading byte-order mark, which HOCON's parser reads as part of the first key. */
function withoutBom(text: string): string {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Reads every config file in a folder, and in its `maps` and `storages` subfolders.
 *
 * A missing folder rejects rather than answering with an empty listing, because "this
 * folder holds no config" and "this folder is not there" send somebody to two different
 * places. So does an unreadable `maps`: an editor shown a folder with no maps will offer
 * to create the ones that are sitting in it, and a permission error is a far better answer
 * than that offer.
 *
 * Files the editor does not model are still returned when BlueMap would load them, so the
 * workspace can list them as left alone. Everything else in the folder is ignored: a
 * world, a jar and a log are not this editor's business.
 */
export async function readConfigFolder(folder: string): Promise<ConfigFolderContents> {
    const root = requireAbsoluteFolder(folder);

    const found: { readonly full: string; readonly path: string }[] = [];
    const directories: string[] = [];

    let chosen;
    try {
        chosen = await opendir(root);
    } catch (error) {
        throw unreadable(root, error);
    }

    try {
        for await (const child of chosen) {
            // `isDirectory` and `isFile` are both false for a symbolic link, because a
            // directory read never follows one. That is the whole of the escape guard on
            // this side: only names that are really files here are ever opened.
            if (child.isDirectory()) {
                directories.push(child.name);
                continue;
            }
            if (!child.isFile() || !isConfigFileName(child.name)) continue;
            found.push({ full: join(root, child.name), path: child.name });
        }
    } catch (error) {
        throw unreadable(root, error);
    }

    for (const canonical of CONFIG_SUBFOLDERS) {
        const onDisk = pickDirectoryName(directories, canonical);
        if (onDisk === null) continue;
        const directory = join(root, onDisk);

        let opened;
        try {
            opened = await opendir(directory);
        } catch (error) {
            throw unreadable(directory, error);
        }
        try {
            for await (const child of opened) {
                if (!child.isFile() || !isConfigFileName(child.name)) continue;
                found.push({ full: join(directory, child.name), path: `${canonical}/${child.name}` });
            }
        } catch (error) {
            throw unreadable(directory, error);
        }
    }

    if (found.length > MAX_CONFIG_FILES) {
        throw new Error(
            `${root} holds ${String(found.length)} config files, more than the ${String(MAX_CONFIG_FILES)} this ` +
                `editor opens at once. It is probably not a BlueMap config folder.`,
        );
    }

    // Sorted, so the same folder reads the same way twice. The editor sorts its own
    // entries afterwards, but the `onDisk` list it keeps to decide what is new comes
    // straight from this order.
    found.sort((left, right) => left.path.localeCompare(right.path));

    const files: ConfigFile[] = [];
    for (const file of found) {
        const stats = await lstat(file.full).catch(() => null);
        // Gone between the directory read and here. Reporting it as empty would let the
        // editor write an empty file back over whatever replaced it.
        if (stats === null || !stats.isFile()) continue;
        if (stats.size > MAX_CONFIG_BYTES) {
            throw new Error(
                `${file.path} is ${String(stats.size)} bytes, larger than the ` +
                    `${String(MAX_CONFIG_BYTES)} this editor opens. It was left alone.`,
            );
        }
        let text: string;
        try {
            text = await readFile(file.full, "utf8");
        } catch (error) {
            throw unreadable(file.full, error);
        }
        files.push({ path: file.path, text: withoutBom(text) });
    }

    return { folder: root, files };
}

/* -------------------------------------------------------------------------- */
/* Writing and deleting                                                       */
/* -------------------------------------------------------------------------- */

/** Real subdirectory names, or null when the folder itself is not there. */
async function listDirectoryNames(root: string): Promise<string[] | null> {
    const names: string[] = [];
    let opened;
    try {
        opened = await opendir(root);
    } catch (error) {
        if (errorCode(error) === "ENOENT") return null;
        throw unreadable(root, error);
    }
    try {
        for await (const child of opened) if (child.isDirectory()) names.push(child.name);
    } catch (error) {
        throw unreadable(root, error);
    }
    return names;
}

/**
 * The subfolder to write into, created when it is not there.
 *
 * `directories` holds real directories only, so a `maps` that is a symbolic link never
 * matches and lands here instead, where it is refused. Reading skips a link silently
 * because a folder it cannot descend is a folder with nothing in it; writing cannot, since
 * the alternative is quietly creating a second `maps` beside the one the person set up.
 */
async function subfolderToWrite(root: string, canonical: string, directories: readonly string[]): Promise<string> {
    const existing = pickDirectoryName(directories, canonical);
    if (existing !== null) return existing;

    const path = join(root, canonical);
    const stats = await lstat(path).catch(() => null);
    // A real directory that was not in the listing is one an earlier file in this same
    // batch created. `lstat` does not follow a link, so this stays false for the case the
    // throw below exists for.
    if (stats !== null && stats.isDirectory()) return canonical;
    if (stats !== null) {
        throw new Error(
            stats.isSymbolicLink()
                ? `${path} is a link rather than a folder, so nothing was written through it. ` +
                  `Config files are only written inside the folder you chose.`
                : `${path} is a file rather than a folder, so the ${canonical} it needs cannot be created.`,
        );
    }
    try {
        await mkdir(path);
    } catch (error) {
        throw unwritable(path, error);
    }
    return canonical;
}

/** Refuses a target that exists as anything other than an ordinary file. */
async function requireWritableTarget(path: string): Promise<void> {
    const stats = await lstat(path).catch(() => null);
    if (stats === null || stats.isFile()) return;
    throw new Error(
        stats.isSymbolicLink()
            ? `${path} is a link rather than a file, so nothing was written through it.`
            : `${path} is not a file, so a config file could not be written over it.`,
    );
}

/**
 * Creates the folder if needed and writes each file, replacing what is there.
 *
 * Every path is checked before anything is written, so a batch carrying one name that
 * escapes the folder writes none of the others either. That is the difference between a
 * refusal and a half-applied save: the editor marks a save as done only when this
 * resolves, and a partial write with a clean rejection would leave it believing the whole
 * batch was rolled back.
 *
 * A failure part-way through the writing itself - a full disk, a folder that turned
 * read-only - is not that neat, and is reported as it happened rather than pretended away.
 */
export async function writeConfigFiles(folder: string, files: readonly ConfigFile[]): Promise<void> {
    const root = requireAbsoluteFolder(folder);
    if (files.length === 0) return;
    if (files.length > MAX_CONFIG_FILES) {
        throw new Error(
            `${String(files.length)} files were sent to be written at once, more than the ` +
                `${String(MAX_CONFIG_FILES)} a config folder holds.`,
        );
    }

    const planned = files.map((file) => {
        const path = requireConfigPath(file.path);
        const bytes = Buffer.byteLength(file.text, "utf8");
        if (bytes > MAX_CONFIG_BYTES) {
            throw new Error(
                `${path} is ${String(bytes)} bytes, larger than the ${String(MAX_CONFIG_BYTES)} a config file may be.`,
            );
        }
        return { path, text: file.text };
    });

    try {
        await mkdir(root, { recursive: true });
    } catch (error) {
        throw unwritable(root, error);
    }
    const directories = (await listDirectoryNames(root)) ?? [];

    for (const file of planned) {
        const segments = file.path.split("/");
        const fileName = segments[segments.length - 1] ?? "";
        const canonical = segments.length === 2 ? (segments[0] ?? "") : null;

        const directory =
            canonical === null ? root : join(root, await subfolderToWrite(root, canonical, directories));
        const target = join(directory, fileName);

        await requireWritableTarget(target);
        try {
            await writeFile(target, file.text, "utf8");
        } catch (error) {
            throw unwritable(target, error);
        }
    }
}

/**
 * Deletes files, by path relative to the folder. Missing files are not an error.
 *
 * A save deletes the map somebody removed, and a map they removed twice - once in the
 * editor, once in a file manager - is still a map that is gone. Refusing the whole save
 * over it would leave every other change unwritten to report something nobody needs to
 * know.
 */
export async function deleteConfigFiles(folder: string, paths: readonly string[]): Promise<void> {
    const root = requireAbsoluteFolder(folder);
    if (paths.length === 0) return;
    if (paths.length > MAX_CONFIG_FILES) {
        throw new Error(
            `${String(paths.length)} files were sent to be deleted at once, more than the ` +
                `${String(MAX_CONFIG_FILES)} a config folder holds.`,
        );
    }

    const planned = paths.map(requireConfigPath);
    const directories = await listDirectoryNames(root);
    if (directories === null) return;

    for (const relative of planned) {
        const segments = relative.split("/");
        const fileName = segments[segments.length - 1] ?? "";
        const canonical = segments.length === 2 ? (segments[0] ?? "") : null;

        let directory = root;
        if (canonical !== null) {
            const onDisk = pickDirectoryName(directories, canonical);
            // No `maps` folder means no map file inside it, which is the state the caller
            // was asking for anyway.
            if (onDisk === null) continue;
            directory = join(root, onDisk);
        }

        const target = join(directory, fileName);
        const stats = await lstat(target).catch(() => null);
        if (stats === null) continue;
        if (!stats.isFile()) {
            throw new Error(
                stats.isSymbolicLink()
                    ? `${target} is a link rather than a config file, so it was left alone.`
                    : `${target} is not a file, so it was left alone.`,
            );
        }
        try {
            await unlink(target);
        } catch (error) {
            if (errorCode(error) === "ENOENT") continue;
            throw unwritable(target, error);
        }
    }
}

/* -------------------------------------------------------------------------- */
/* The native pickers                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Just the one method this module needs from Electron's `dialog`.
 *
 * Named as a parameter rather than imported, for the same reason `IpcMain` is: a value
 * import of `electron` would make every test in this directory need an Electron runtime,
 * and the tests for the two picker channels would each open a real window.
 */
export interface OpenDialogHost {
    showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
}

/** The first chosen path, or null for a cancelled picker. */
function chosenPath(answer: OpenDialogReturnValue): string | null {
    if (answer.canceled) return null;
    const first = answer.filePaths[0];
    return first === undefined || first.trim() === "" ? null : first;
}

/**
 * `defaultPath` only when it is a full path.
 *
 * Electron resolves a relative one against the process's working directory, which for a
 * packaged app is wherever it was launched from. A picker that opens somewhere arbitrary
 * is worse than one that opens where the platform would have put it.
 */
function startingFolder(startIn: string | undefined): { defaultPath?: string } {
    if (startIn === undefined) return {};
    const trimmed = startIn.trim();
    return trimmed !== "" && isAbsolute(trimmed) ? { defaultPath: trimmed } : {};
}

export async function pickDirectory(host: OpenDialogHost, options: PickDirectoryOptions): Promise<string | null> {
    const answer = await host.showOpenDialog({
        title: options.title,
        properties: ["openDirectory", "createDirectory"],
        ...startingFolder(options.startIn),
    });
    return chosenPath(answer);
}

export async function pickFile(host: OpenDialogHost, options: PickFileOptions): Promise<string | null> {
    // The dot is not part of an Electron filter, and the field this comes from is written
    // by hand often enough that both spellings arrive.
    const extensions = (options.extensions ?? [])
        .map((extension) => extension.trim().replace(/^\.+/, ""))
        .filter((extension) => extension !== "");

    const answer = await host.showOpenDialog({
        title: options.title,
        properties: ["openFile"],
        ...startingFolder(options.startIn),
        // "All files" beside the narrow filter rather than instead of it: a JDBC driver
        // that arrived named `.jar.bin` is still the driver somebody has, and a picker
        // that cannot see it sends them to rename a file to satisfy a dialog.
        ...(extensions.length === 0
            ? {}
            : {
                  filters: [
                      { name: `${extensions.map((extension) => extension.toUpperCase()).join(", ")} files`, extensions },
                      { name: "All files", extensions: ["*"] },
                  ],
              }),
    });
    return chosenPath(answer);
}

/* -------------------------------------------------------------------------- */
/* Testing an SQL connection                                                  */
/* -------------------------------------------------------------------------- */

/** Where a probe would connect, once something in the process can. */
export interface SqlTarget {
    /** The JDBC URL exactly as the storage file carries it. */
    readonly url: string;
    /** `mysql`, `mariadb`, `postgresql`, ... lower-cased. */
    readonly dialect: string;
    /** `connection-properties`, which is where the user name and password live. */
    readonly properties: Readonly<Record<string, string>>;
}

export interface SqlDriver {
    /** What to call it on screen, e.g. `mysql2`. */
    readonly name: string;
    /** Opens a connection and closes it again. Rejects with whatever the driver said. */
    connect(target: SqlTarget): Promise<void>;
}

/** Finds a driver for a dialect, or null when this build has none for it. */
export type SqlDriverLookup = (dialect: string) => Promise<SqlDriver | null>;

/**
 * The lookup this build ships, and it finds nothing.
 *
 * A JDBC driver is a Java library. BlueMap loads the one named in `driver-jar` inside its
 * own JVM when it renders; this process is Node, and there is no JDBC in it to borrow. The
 * app's dependency tree carries no database client either, and adding one to answer a test
 * button would mean shipping a MySQL, MariaDB, PostgreSQL and SQL Server client with a
 * map renderer.
 *
 * So the honest answer is the one {@link probeSqlConnection} gives: it says the connection
 * was not attempted and why, and it never reports a success nobody observed. The seam is a
 * parameter rather than a constant so a build that does carry a client can hand one in,
 * and so the success and failure paths are covered by tests rather than by hope.
 */
export const noSqlDriver: SqlDriverLookup = () => Promise.resolve(null);

/**
 * The driver name out of a JDBC URL: `jdbc:mysql://host/db` is `mysql`.
 *
 * Null when the text is not a JDBC URL at all, which is the most common thing wrong with
 * one. A delimiter is required after the name because `jdbc:mysql` on its own names no
 * host and no database, so treating it as a URL would only move the failure later.
 *
 * Read case-insensitively, and answered lower-cased. Everybody writes `jdbc:mysql:`, but
 * telling somebody who wrote `JDBC:` that they have not written a JDBC URL is the least
 * useful true sentence available: what they have is a URL with the scheme in the wrong
 * case, and the dialect is what this was asked for.
 */
export function jdbcSubprotocol(url: string): string | null {
    const match = /^jdbc:([A-Za-z0-9][A-Za-z0-9+.-]*)[:/]/i.exec(url.trim());
    return match?.[1]?.toLowerCase() ?? null;
}

/** `bluemap:mysql` and `mysql` name the same dialect; BlueMap resolves the namespace. */
export function dialectName(dialect: string): string {
    const trimmed = dialect.trim();
    const colon = trimmed.lastIndexOf(":");
    return (colon === -1 ? trimmed : trimmed.slice(colon + 1)).toLowerCase();
}

/** One line, so a driver that answers in paragraphs does not become the whole screen. */
function oneLine(text: string): string {
    return text.replace(/\s+/g, " ").trim();
}

/**
 * Opens a connection with these settings and reports what happened.
 *
 * Never rejects and never invents a success. The three answers are: the settings are not a
 * JDBC URL, so nothing was attempted; there is no driver here for this dialect, so nothing
 * was attempted; or a driver tried, and this is what it said.
 *
 * The URL is deliberately never repeated back. A JDBC URL routinely carries a password in
 * its query string, and this message is shown on screen, copied into issues and captured
 * in screenshots. The dialect is enough to say what went wrong without carrying the
 * credential along with it.
 */
export async function probeSqlConnection(request: SqlProbeRequest, lookup: SqlDriverLookup): Promise<SqlProbeResult> {
    const url = request.connectionUrl.trim();
    if (url === "") {
        return { ok: false, message: "No connection URL was given, so there was nothing to connect to." };
    }

    const subprotocol = jdbcSubprotocol(url);
    if (subprotocol === null) {
        return {
            ok: false,
            message:
                "That is not a JDBC connection URL. One starts with jdbc: and then names the driver, " +
                "like jdbc:mysql://localhost:3306/bluemap.",
        };
    }

    // BlueMap picks the dialect from the URL's prefix unless the file names one, so this
    // resolves it the same way round rather than testing a different database than the one
    // the render will use.
    const named = request.dialect === null ? "" : dialectName(request.dialect);
    const dialect = named === "" ? subprotocol : named;

    let driver: SqlDriver | null;
    try {
        driver = await lookup(dialect);
    } catch (error) {
        return {
            ok: false,
            message: `The ${dialect} driver could not be loaded.`,
            detail: oneLine(error instanceof Error ? error.message : String(error)),
        };
    }

    if (driver === null) {
        const jar =
            request.driverJar === null || request.driverJar.trim() === ""
                ? "Set driver-jar and driver-class so BlueMap can find one when it renders."
                : `The driver jar named here (${request.driverJar}) is loaded by BlueMap's own JVM when it renders, not by this app.`;
        return {
            ok: false,
            message: `This build cannot open a ${dialect} connection, so these settings were not tested here.`,
            detail:
                `A JDBC driver is a Java library, and the part of the app that would run this test is not a Java ` +
                `process, so it has nothing to open the connection with. ${jar} The settings are still checked ` +
                `for shape here: the URL is a JDBC URL naming the ${dialect} dialect.`,
        };
    }

    try {
        await driver.connect({ url, dialect, properties: request.properties });
    } catch (error) {
        return {
            ok: false,
            message: oneLine(error instanceof Error ? error.message : String(error)),
            detail: `Reported by ${driver.name}, connecting as ${dialect}.`,
        };
    }
    return {
        ok: true,
        message: `Connected to the ${dialect} database and closed the connection again.`,
        detail: `Opened with ${driver.name}.`,
    };
}

/* -------------------------------------------------------------------------- */
/* Registration                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Where the app would keep a config folder if nobody chooses one.
 *
 * Beside the rendered maps rather than inside them: `defaultStorageDirectory` puts those
 * in `<userData>/maps`, and a config folder holding a `maps` subfolder of its own next to
 * a `maps` folder of tiles is a pair of names nobody would untangle twice.
 */
export function defaultConfigDirectory(dataDir: string): string {
    return join(dataDir, "config");
}

export interface ConfigIpcOptions {
    /** Electron's `userData`. Only used to suggest a folder when nobody has chosen one. */
    readonly dataDir: string;
    /**
     * Electron's `dialog`, or a stand-in.
     *
     * Required rather than defaulted, unlike `discover` in `java/ipc.ts`: the real default
     * would be a value import of `electron`, which is exactly what this module does not do.
     * Passing it in keeps the picker channels honest - they either have a real dialog or
     * they were never registered - and lets a test drive them without opening a window.
     */
    readonly dialog: OpenDialogHost;
    /** Injected so a test can supply a driver this build does not ship. See {@link noSqlDriver}. */
    readonly sqlDriver?: SqlDriverLookup;
}

export interface ConfigIpc {
    dispose(): void;
}

/** The renderer supplies these, so they are checked here rather than trusted. */
function requireText(value: unknown, what: string): string {
    if (typeof value !== "string") throw new Error(`${what} has to be given as text.`);
    return value;
}

function requireFiles(value: unknown): ConfigFile[] {
    if (!Array.isArray(value)) throw new Error("The files to write have to be given as a list.");
    return value.map((entry, index) => {
        if (typeof entry !== "object" || entry === null) {
            throw new Error(`File ${String(index + 1)} of the list is not a file with a path and text.`);
        }
        const file = entry as { path?: unknown; text?: unknown };
        return {
            path: requireText(file.path, `The path of file ${String(index + 1)}`),
            text: requireText(file.text, `The text of file ${String(index + 1)}`),
        };
    });
}

function requirePaths(value: unknown): string[] {
    if (!Array.isArray(value)) throw new Error("The files to delete have to be given as a list.");
    return value.map((entry, index) => requireText(entry, `Path ${String(index + 1)} of the list`));
}

function requireOptions(value: unknown, what: string): Record<string, unknown> {
    if (typeof value !== "object" || value === null) throw new Error(`${what} has to be given as a set of options.`);
    return value as Record<string, unknown>;
}

/** A string, or nothing at all, which `exactOptionalPropertyTypes` keeps distinct. */
function optionalText(value: unknown): { startIn?: string } {
    return typeof value === "string" ? { startIn: value } : {};
}

function optionalExtensions(value: unknown): { extensions?: string[] } {
    if (!Array.isArray(value)) return {};
    const extensions = value.filter((entry): entry is string => typeof entry === "string");
    return extensions.length === 0 ? {} : { extensions };
}

/** Rebuilt field by field, so a property that is not text never reaches a driver. */
function requireSqlRequest(value: unknown): SqlProbeRequest {
    const request = requireOptions(value, "The connection to test");
    const properties: Record<string, string> = {};
    const given = request["properties"];
    if (typeof given === "object" && given !== null) {
        for (const [key, entry] of Object.entries(given)) {
            if (typeof entry === "string") properties[key] = entry;
        }
    }
    const text = (key: string): string | null => {
        const entry = request[key];
        return typeof entry === "string" ? entry : null;
    };
    return {
        connectionUrl: text("connectionUrl") ?? "",
        properties,
        dialect: text("dialect"),
        driverJar: text("driverJar"),
        driverClass: text("driverClass"),
    };
}

/**
 * Runs a handler and makes sure what comes back out of a failure is a sentence.
 *
 * A fresh `Error` rather than the original, so nothing a subsystem attached to its own -
 * a stack, a syscall, a code - travels to a screen that has no use for it. Every message
 * this module raises is already written for a person; this is what stops one that was not,
 * from `node:fs` or from a driver, arriving as interface copy.
 */
async function answering<T>(run: () => Promise<T>): Promise<T> {
    try {
        return await run();
    } catch (error) {
        throw new Error(oneLine(error instanceof Error ? error.message : String(error)));
    }
}

/**
 * Registers the config-folder handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take them off again without leaving a
 * duplicate registration behind - `ipcMain.handle` throws on a channel that already has
 * one.
 *
 * Nothing is cached and nothing is held. Each call reads or writes the folder it was
 * given, which is what lets somebody edit a config in another program, come back and press
 * Reload, and see what is really on disk.
 */
export function registerConfigHandlers(ipcMain: IpcMain, options: ConfigIpcOptions): ConfigIpc {
    const lookup = options.sqlDriver ?? noSqlDriver;

    ipcMain.handle(
        "config:readFolder",
        async (_event: IpcMainInvokeEvent, folder: unknown): Promise<ConfigFolderContents> =>
            await answering(async () => await readConfigFolder(requireText(folder, "A config folder"))),
    );

    ipcMain.handle(
        "config:writeFiles",
        async (_event: IpcMainInvokeEvent, folder: unknown, files: unknown): Promise<void> =>
            await answering(async () => {
                await writeConfigFiles(requireText(folder, "A config folder"), requireFiles(files));
            }),
    );

    ipcMain.handle(
        "config:deleteFiles",
        async (_event: IpcMainInvokeEvent, folder: unknown, paths: unknown): Promise<void> =>
            await answering(async () => {
                await deleteConfigFiles(requireText(folder, "A config folder"), requirePaths(paths));
            }),
    );

    ipcMain.handle(
        "config:pickDirectory",
        async (_event: IpcMainInvokeEvent, given: unknown): Promise<string | null> =>
            await answering(async () => {
                const request = requireOptions(given, "The folder picker");
                return await pickDirectory(options.dialog, {
                    title: requireText(request["title"], "The picker's title"),
                    ...optionalText(request["startIn"]),
                });
            }),
    );

    ipcMain.handle(
        "config:pickFile",
        async (_event: IpcMainInvokeEvent, given: unknown): Promise<string | null> =>
            await answering(async () => {
                const request = requireOptions(given, "The file picker");
                return await pickFile(options.dialog, {
                    title: requireText(request["title"], "The picker's title"),
                    ...optionalExtensions(request["extensions"]),
                    ...optionalText(request["startIn"]),
                });
            }),
    );

    ipcMain.handle(
        "config:testSqlConnection",
        async (_event: IpcMainInvokeEvent, given: unknown): Promise<SqlProbeResult> =>
            await answering(async () => await probeSqlConnection(requireSqlRequest(given), lookup)),
    );

    ipcMain.handle("config:suggestFolder", (_event: IpcMainInvokeEvent): string =>
        defaultConfigDirectory(options.dataDir),
    );

    return {
        dispose(): void {
            for (const channel of CONFIG_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/* -------------------------------------------------------------------------- */
/* Why a path did not work                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Why something could not be read, in words somebody can act on.
 *
 * The path and the reason, and nothing else. The system's own message repeats the path and
 * adds the syscall, which tells the person nothing they can use. The path itself stays -
 * unlike `java/ipc.ts`, which strips them, because there the path came out of a subprocess
 * and here it is the folder the person chose and needs to see.
 */
function unreadable(path: string, error: unknown): Error {
    const code = errorCode(error);
    switch (code) {
        case "ENOENT":
            return new Error(`There is nothing at ${path}.`);
        case "ENOTDIR":
            return new Error(`${path} is a file, not a folder.`);
        case "EACCES":
        case "EPERM":
            return new Error(`${path} could not be read: this account is not allowed to open it.`);
        case "ELOOP":
            return new Error(`${path} could not be read: it is a link that points at itself.`);
        case "EMFILE":
        case "ENFILE":
            return new Error(`${path} could not be read: too many files are open right now.`);
        default:
            return new Error(code === null ? `${path} could not be read.` : `${path} could not be read (${code}).`);
    }
}

/** The same, for a write. The reasons differ enough to be worth their own sentences. */
function unwritable(path: string, error: unknown): Error {
    const code = errorCode(error);
    switch (code) {
        case "EACCES":
        case "EPERM":
            return new Error(`${path} could not be written: this account is not allowed to change it.`);
        case "EROFS":
            return new Error(`${path} could not be written: the disk it is on is read only.`);
        case "ENOSPC":
            return new Error(`${path} could not be written: there is no space left on the disk.`);
        case "ENOENT":
            return new Error(`${path} could not be written: the folder it belongs in is no longer there.`);
        case "ENOTDIR":
            return new Error(`${path} could not be written: something on the way to it is a file, not a folder.`);
        case "EISDIR":
            return new Error(`${path} is a folder, not a file.`);
        case "EBUSY":
            return new Error(`${path} could not be written: another program has it open.`);
        default:
            return new Error(code === null ? `${path} could not be written.` : `${path} could not be written (${code}).`);
    }
}

function errorCode(error: unknown): string | null {
    if (typeof error !== "object" || error === null || !("code" in error)) return null;
    const code = (error as { readonly code?: unknown }).code;
    return typeof code === "string" ? code : null;
}
