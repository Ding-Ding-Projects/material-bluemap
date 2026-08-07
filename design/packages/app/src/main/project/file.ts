/**
 * Reading, writing and finding a project file inside somebody's Minecraft world.
 *
 * The shape of a project is fixed elsewhere - `@worldlens/config` owns the schema,
 * the file name, the format version, and the pure text-to-project reader. Nothing here
 * re-decides any of that. This module is the other half of that seam: the only code in the
 * application allowed to put a byte inside a world folder, written the way `config/ipc.ts`
 * is written, for the same reasons and with the same suspicion.
 *
 * ## Why writing here is treated as more dangerous than writing anywhere else
 *
 * A BlueMap config folder is a folder somebody made for BlueMap. A Minecraft world folder
 * is not: it holds the only copy of a world that may have taken years, and Minecraft is
 * writing to it too. Three rules follow, and each of them exists because of a specific way
 * this could go wrong.
 *
 *  1. **The write is atomic.** The text goes to a temporary file beside the target and is
 *     then renamed over it. `rename` replaces a file in one step on every platform this
 *     ships to, so the failure mode of writing in place - a crash, a full disk, or a
 *     process kill leaving a half-written project that parses as neither the old settings
 *     nor the new ones - cannot happen. What the reader sees is always one complete file.
 *  2. **Nothing is clobbered that was not first read and understood.** A file this build
 *     cannot parse is a file whose contents it cannot claim to be replacing. It might be a
 *     project written by a newer app, and overwriting one of those silently discards every
 *     setting this build does not model - which is exactly the failure
 *     {@link PROJECT_FORMAT_VERSION} exists to prevent, arriving through the back door.
 *     A damaged file can still be replaced, but only when the caller says so in as many
 *     words, and a `too-new` one cannot be replaced at all.
 *  3. **Only one path is ever written.** The file name is a constant and the world folder
 *     is checked before anything is joined onto it, so there is no argument any caller can
 *     send that makes this module touch a second file, a parent directory, or a link
 *     pointing somewhere else entirely.
 *
 * ## What is deliberately not here
 *
 * No history, no IPC, no Electron. `history.ts` binds a save to the version history and
 * `ipc.ts` is the only file in this directory that names a channel, so everything below can
 * be - and is - tested against real temporary directories with nothing else running.
 */

import { randomBytes } from "node:crypto";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

import {
    LEGACY_PROJECT_FILE_NAME,
    PROJECT_FILE_NAME,
    PROJECT_FILE_NAMES,
    PROJECT_FORMAT_VERSION,
    parseProjectFile,
    serializeProjectFile,
    type ProjectFile,
    type ProjectReadFailure,
} from "@worldlens/config";

/**
 * The largest project file this reads or writes.
 *
 * A project carries whole HOCON bodies rather than parsed settings, so it is bigger than
 * most JSON somebody hand-edits - a dozen maps with long `marker-sets` blocks is tens of
 * kilobytes. Four megabytes is far above anything real and low enough that a folder which
 * is not a world, or a file that grew by accident, cannot be read into memory as a project.
 */
export const MAX_PROJECT_BYTES = 4 * 1024 * 1024;

/** The suffix on the temporary file an atomic write goes through. */
export const PROJECT_TEMP_SUFFIX = ".tmp";

/* -------------------------------------------------------------------------- */
/* Checking a world folder, before anything is joined onto it                 */
/* -------------------------------------------------------------------------- */

export type WorldFolderCheck =
    | { readonly ok: true; readonly folder: string }
    | { readonly ok: false; readonly reason: string };

/**
 * The world folder, or a sentence saying why it is not one this will write into.
 *
 * A relative path is refused rather than resolved. Resolving would put a project file
 * beside whatever directory the application happened to be started in, which is a folder
 * nobody chose and, in a packaged build, is inside the installation.
 *
 * A `..` step is refused rather than normalised, even though normalising it would land
 * somewhere legitimate. The reason is that the path is shown back to the user in every
 * message this module produces, and a path that reads as one folder while meaning another
 * is how somebody agrees to a write they did not understand.
 */
export function checkWorldFolder(value: unknown): WorldFolderCheck {
    if (typeof value !== "string") {
        return { ok: false, reason: "A world folder has to be given as text." };
    }
    const trimmed = value.trim();
    if (trimmed === "") {
        return { ok: false, reason: "No world folder was given, so there was no project to look for." };
    }
    if (!isAbsolute(trimmed)) {
        return {
            ok: false,
            reason:
                `${trimmed} is not a full path, so which folder it means depends on where the app ` +
                `was started. Choose the world again.`,
        };
    }
    if (trimmed.split(/[\\/]/).includes("..")) {
        return {
            ok: false,
            reason: `${trimmed} steps out of a folder with "..", so it does not plainly name the world it means.`,
        };
    }
    return { ok: true, folder: trimmed };
}

export type ProjectPathCheck =
    | { readonly ok: true; readonly path: string }
    | { readonly ok: false; readonly reason: string };

/**
 * Whether a name relative to the world folder is the project file.
 *
 * There are exactly two accepted input names during the rename window, and that is the point
 * of having the function at all. Both resolve to the one current output name. It
 * guards the one place a path arrives from somewhere other than this module: a restore
 * takes file names out of a recorded revision, and a revision is a directory on the same
 * disk as everything else. Comparing against the one legal name means a repository somebody
 * edited by hand cannot talk a restore into writing `../../level.dat`.
 */
export function checkProjectPath(relative: string): ProjectPathCheck {
    const given = relative.trim().replace(/\\/g, "/");
    if (!(PROJECT_FILE_NAMES as readonly string[]).includes(given)) {
        return {
            ok: false,
            reason: `${relative} is not the project file. A world holds exactly one, named ${PROJECT_FILE_NAME}.`,
        };
    }
    return { ok: true, path: PROJECT_FILE_NAME };
}

/**
 * Where the project file for a world folder is, absolute.
 *
 * The containment check below looks pointless - the file name is a compile-time constant
 * with no separator in it - and it is kept because that is a property of today's constant
 * rather than of this function. If the name ever gained a separator, every caller here
 * would start writing outside the folder it was handed, silently and everywhere at once.
 * This turns that into a thrown sentence at the one place it could begin.
 */
export function projectFilePath(worldFolder: string): string {
    const root = resolve(worldFolder);
    const path = resolve(join(root, PROJECT_FILE_NAME));
    if (resolve(path, "..") !== root) {
        throw new Error(`${PROJECT_FILE_NAME} does not name a file at the root of ${worldFolder}.`);
    }
    return path;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/** The bytes of a project file, or why there were none. */
export type ProjectTextResult =
    | { readonly ok: true; readonly path: string; readonly text: string }
    | { readonly ok: false; readonly path: string; readonly failure: ProjectReadFailure };

function unreadable(error: unknown): ProjectReadFailure {
    return { kind: "unreadable", message: error instanceof Error ? error.message : String(error) };
}

/**
 * The project file's raw text, without parsing it.
 *
 * Separate from {@link readProject} because two callers need the bytes rather than the
 * settings: the history mirror, which has to record what is actually in the world even when
 * that is something this build cannot parse, and the write guard, which has to know that a
 * file exists before it decides whether replacing it is safe.
 *
 * `lstat` rather than `stat`, so a project file that is really a link to somewhere else is
 * reported as not-a-file instead of being followed out of the world folder.
 */
export async function readProjectText(worldFolder: string): Promise<ProjectTextResult> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) {
        return { ok: false, path: "", failure: { kind: "unreadable", message: checked.reason } };
    }

    const candidates = [
        projectFilePath(checked.folder),
        resolve(join(checked.folder, LEGACY_PROJECT_FILE_NAME)),
    ];
    let path = candidates[0]!;
    let stats = await lstat(path).catch(() => null);
    if (stats === null) {
        path = candidates[1]!;
        stats = await lstat(path).catch(() => null);
    }
    if (stats === null) return { ok: false, path: candidates[0]!, failure: { kind: "absent" } };
    if (!stats.isFile()) {
        return {
            ok: false,
            path,
            failure: {
                kind: "unreadable",
                message: stats.isSymbolicLink()
                    ? `${path} is a link rather than a file, so nothing was read through it.`
                    : `${path} is not a file, so it is not a project.`,
            },
        };
    }
    if (stats.size > MAX_PROJECT_BYTES) {
        return {
            ok: false,
            path,
            failure: {
                kind: "unreadable",
                message:
                    `${path} is ${String(stats.size)} bytes, larger than the ` +
                    `${String(MAX_PROJECT_BYTES)} a project may be. It was left alone.`,
            },
        };
    }

    try {
        const text = await readFile(path, "utf8");
        // A byte-order mark is legal in a file and illegal at the front of JSON, and editors
        // on Windows add one without being asked. Dropping it here means a project somebody
        // opened in Notepad still reads, rather than failing as "not JSON" at character one.
        return { ok: true, path, text: text.charCodeAt(0) === 0xfeff ? text.slice(1) : text };
    } catch (error) {
        return { ok: false, path, failure: unreadable(error) };
    }
}

export type ProjectReadOutcome =
    | {
          readonly ok: true;
          readonly worldFolder: string;
          readonly path: string;
          readonly project: ProjectFile;
          readonly text: string;
      }
    | {
          readonly ok: false;
          readonly worldFolder: string;
          readonly path: string;
          readonly failure: ProjectReadFailure;
      };

/**
 * The project a world folder carries, or the reason it carries none this build can use.
 *
 * Every refusal - absent, unreadable, not JSON, from a newer app, structurally wrong - comes
 * from {@link parseProjectFile}, which is pure and lives with the schema. This adds only the
 * disk, so the wording of a refusal cannot drift between the file on disk and the same text
 * arriving over a channel.
 */
export async function readProject(worldFolder: string): Promise<ProjectReadOutcome> {
    const bytes = await readProjectText(worldFolder);
    if (!bytes.ok) {
        return { ok: false, worldFolder, path: bytes.path, failure: bytes.failure };
    }

    const parsed = parseProjectFile(bytes.text);
    if (!parsed.ok) {
        return { ok: false, worldFolder, path: bytes.path, failure: parsed.failure };
    }
    return { ok: true, worldFolder, path: bytes.path, project: parsed.project, text: bytes.text };
}

/* -------------------------------------------------------------------------- */
/* Writing, atomically                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The three file-system calls an atomic write is made of.
 *
 * Injected for one reason, and it is the same reason `history/git.ts` injects a git runner:
 * the property that matters here is what is on disk *after a failure*, and a test cannot
 * produce a failure between the write and the rename by asking the file system nicely.
 * Handing this layer an io whose `rename` refuses reproduces exactly the crash the temporary
 * file exists for, and proves the previous project survived it.
 */
export interface ProjectFileIo {
    writeFile(path: string, text: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    unlink(path: string): Promise<void>;
}

/** The real file system. Everything but a test uses this. */
export const nodeProjectFileIo: ProjectFileIo = {
    writeFile: (path, text) => writeFile(path, text, "utf8"),
    rename: (from, to) => rename(from, to),
    unlink: (path) => unlink(path),
};

/**
 * The temporary file a write goes through.
 *
 * Beside the target rather than in the system temporary directory, because `rename` is only
 * atomic within one file system and a world folder is very often on a different drive to
 * `%TEMP%` - a cross-device rename fails outright, and the fallback every library reaches
 * for is a copy, which is exactly the non-atomic write this is avoiding.
 *
 * The name carries the process id and six random bytes so two saves, in one application or
 * two, cannot pick the same temporary path. They could otherwise rename each other's bytes
 * over the project, and the result would be a complete, valid file holding somebody else's
 * settings - the one corruption that looks entirely healthy afterwards.
 */
function temporaryPath(target: string): string {
    return `${target}.${String(process.pid)}.${randomBytes(6).toString("hex")}${PROJECT_TEMP_SUFFIX}`;
}

export type ProjectWriteResult =
    | {
          readonly ok: true;
          readonly path: string;
          readonly project: ProjectFile;
          /** What was in the file before, when it held a project this build could read. */
          readonly replaced: ProjectFile | null;
      }
    | {
          readonly ok: false;
          readonly reason: string;
          /** Why the existing file stopped the write, when that is what stopped it. */
          readonly failure: ProjectReadFailure | null;
      };

export interface ProjectWriteOptions {
    /**
     * Replace a file this build could not read.
     *
     * Off by default, and it has to be, because the ordinary meaning of an unreadable
     * project is "somebody's settings are in there and this build does not understand
     * them". The interface turns this on only after showing the person what could not be
     * read and asking. It never applies to a `too-new` file: that one is understood well
     * enough to know a newer app wrote it, so replacing it is a known loss rather than an
     * unknown one.
     */
    readonly replaceUnreadable?: boolean;
    /** Injected in tests, to reproduce a failure between the write and the rename. */
    readonly io?: ProjectFileIo;
}

/**
 * Writes text into the world's project file, atomically, with no questions asked.
 *
 * Deliberately unguarded, and deliberately not exported for ordinary saving. Its one caller
 * is a restore, which is putting back bytes that were recorded from this same file earlier -
 * including, legitimately, bytes this build cannot parse. A restore is safe without the
 * guard because the history layer has already snapshotted what is on disk before calling it,
 * so the state being written over is recoverable; an ordinary save has no such record, which
 * is why {@link writeProject} refuses instead.
 */
export async function writeProjectText(
    worldFolder: string,
    text: string,
    io: ProjectFileIo = nodeProjectFileIo,
): Promise<{ readonly ok: true; readonly path: string } | { readonly ok: false; readonly reason: string }> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) return { ok: false, reason: checked.reason };

    const bytes = Buffer.byteLength(text, "utf8");
    if (bytes > MAX_PROJECT_BYTES) {
        return {
            ok: false,
            reason:
                `This project is ${String(bytes)} bytes, larger than the ${String(MAX_PROJECT_BYTES)} ` +
                `a project file may be, so nothing was written.`,
        };
    }

    // The world folder has to already be a directory. Creating one would turn a mistyped
    // path into a new folder full of nothing that looks, at a glance, like a world.
    const folderStats = await lstat(checked.folder).catch(() => null);
    if (folderStats === null || !folderStats.isDirectory()) {
        return {
            ok: false,
            reason: `${checked.folder} is not a folder that exists, so there is no world to save a project into.`,
        };
    }

    const path = projectFilePath(checked.folder);
    const existing = await lstat(path).catch(() => null);
    if (existing !== null && !existing.isFile()) {
        return {
            ok: false,
            reason: existing.isSymbolicLink()
                ? `${path} is a link rather than a file, so nothing was written through it.`
                : `${path} is not a file, so a project could not be written over it.`,
        };
    }

    const temporary = temporaryPath(path);
    try {
        await io.writeFile(temporary, text);
    } catch (error) {
        return {
            ok: false,
            reason: `The project could not be written: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    try {
        await io.rename(temporary, path);
    } catch (error) {
        // The rename is the moment the new project becomes real. Failing here means the old
        // one is still exactly as it was, which is the whole point - so the only thing left
        // to do is take the half-written file away rather than leave litter in a world.
        await io.unlink(temporary).catch(() => undefined);
        return {
            ok: false,
            reason:
                `The project could not be put in place, so the project already in this world was ` +
                `left as it was: ${error instanceof Error ? error.message : String(error)}`,
        };
    }

    return { ok: true, path };
}

/**
 * Saves a project into a world folder, refusing rather than overwriting what it cannot read.
 *
 * The existing file is read *first*, every time, and the answer decides whether writing is
 * allowed at all. That ordering is the guard: checking afterwards, or trusting a value the
 * caller read a moment ago, both leave a window in which the file changed underneath - and
 * the file changing underneath is precisely the case where overwriting it is worst.
 */
export async function writeProject(
    worldFolder: string,
    project: ProjectFile,
    options: ProjectWriteOptions = {},
): Promise<ProjectWriteResult> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) return { ok: false, reason: checked.reason, failure: null };

    const existing = await readProject(checked.folder);
    let replaced: ProjectFile | null = null;

    if (existing.ok) {
        replaced = existing.project;
    } else if (existing.failure.kind === "too-new") {
        return {
            ok: false,
            failure: existing.failure,
            reason:
                `This world's project was made by a newer version of Worldlens ` +
                `(format ${String(existing.failure.version)}, this build reads ${String(PROJECT_FORMAT_VERSION)}). ` +
                `Saving over it would throw away every setting this version does not know about, so ` +
                `nothing was written. Update the app to open it.`,
        };
    } else if (existing.failure.kind !== "absent" && options.replaceUnreadable !== true) {
        return {
            ok: false,
            failure: existing.failure,
            reason:
                `This world already holds a ${PROJECT_FILE_NAME} that could not be read, so it was ` +
                `not written over. Replace it deliberately if it is damaged.`,
        };
    }

    const written = await writeProjectText(
        checked.folder,
        serializeProjectFile(project),
        options.io ?? nodeProjectFileIo,
    );
    if (!written.ok) return { ok: false, reason: written.reason, failure: null };

    return { ok: true, path: written.path, project, replaced };
}

/**
 * Takes the project file out of a world folder.
 *
 * A missing file is success, not an error: the caller asked for a world with no project and
 * that is what it has. Used by a restore putting back a revision from before the project
 * existed, which is the one legitimate way a project is removed.
 */
export async function deleteProject(worldFolder: string): Promise<{ ok: true } | { ok: false; reason: string }> {
    const checked = checkWorldFolder(worldFolder);
    if (!checked.ok) return { ok: false, reason: checked.reason };

    const candidates = [
        projectFilePath(checked.folder),
        resolve(join(checked.folder, LEGACY_PROJECT_FILE_NAME)),
    ];
    const present: string[] = [];
    // Validate both candidates before deleting either. Otherwise a valid current file could be
    // removed before a legacy path that is unexpectedly a directory makes the operation refuse.
    for (const path of candidates) {
        const stats = await lstat(path).catch(() => null);
        if (stats === null) continue;
        if (!stats.isFile()) {
            return { ok: false, reason: `${path} is not a file, so it was left alone.` };
        }
        present.push(path);
    }
    for (const path of present) {
        try {
            await unlink(path);
        } catch (error) {
            return {
                ok: false,
                reason: `${path} could not be removed: ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }
    return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* A project arriving from somewhere that is not a disk                       */
/* -------------------------------------------------------------------------- */

export type ProjectValueCheck =
    | { readonly ok: true; readonly project: ProjectFile }
    | { readonly ok: false; readonly failure: ProjectReadFailure };

/**
 * Validates a project that arrived as a structured-cloned object rather than as text.
 *
 * Routed through {@link parseProjectFile} on purpose, by way of one round trip through JSON.
 * The alternative - validating the object against the schema directly - would be one line
 * shorter and would skip the version check that lives in front of the schema, so a renderer
 * could hand over a project claiming to be format 2 and this would happily write a file no
 * other build of the app will ever open again.
 */
export function checkProjectValue(value: unknown): ProjectValueCheck {
    let text: string;
    try {
        text = JSON.stringify(value);
    } catch (error) {
        return {
            ok: false,
            failure: { kind: "not-json", message: error instanceof Error ? error.message : String(error) },
        };
    }
    if (text === undefined) {
        return { ok: false, failure: { kind: "not-json", message: "No project was given." } };
    }

    const parsed = parseProjectFile(text);
    if (parsed.ok) return { ok: true, project: parsed.project };
    return { ok: false, failure: parsed.failure };
}
