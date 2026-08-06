/**
 * The Minecraft folders this machine offers worlds from.
 *
 * One default folder is not enough. People keep a vanilla `.minecraft`, a modded instance
 * under a launcher, a copy of a server's saves pulled off a host, and an archive on a
 * second drive, and the worlds in all of them are worlds they might want a map of. So the
 * default folder found by `locations.ts` is the first entry in a list rather than the only
 * source, and the person can mount as many more as they keep.
 *
 * ## Mounting takes either level, because both are the same intent
 *
 * Somebody who means "my Minecraft install" will hand over `.minecraft`; somebody who
 * means the same thing will hand over `.minecraft/saves`. {@link resolveMinecraftFolder}
 * takes either and records which it found, and the interface shows the resolution, so a
 * mounted folder never leaves a person wondering which of the two it took. A folder that
 * is neither is refused by name with what was expected, and specifically a folder that is
 * itself one world is refused with a sentence saying so, because handing over one world
 * where a folder of worlds was wanted is the mistake people actually make.
 *
 * ## Unmounting is not deleting
 *
 * Unmounting takes an entry out of this list and touches nothing on disk. No world, no
 * file, no folder is removed by anything in this module - the only thing it can write is
 * its own small JSON list. That is why the interface can offer it as an ordinary control
 * rather than behind the destructive-action gate, and why the copy beside it says so in
 * as many words: "unmount", sitting next to a list of somebody's worlds, reads as
 * "delete" to a reasonable person, and being right about that is not the same as their
 * being unreasonable to fear it.
 *
 * ## A folder that has gone away stays listed
 *
 * A mount whose folder is missing or unreadable keeps its row and says which. It does not
 * quietly take itself off the list: a world archive on an external drive is missing every
 * time the drive is unplugged, and an application that forgets a mount over that has
 * thrown away a setting on the strength of a cable.
 */

import { lstat, mkdir, opendir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join } from "node:path";
import {
    defaultLauncherRoots,
    defaultMinecraftFolders,
    type DefaultMinecraftFolderOptions,
    type MinecraftFolderOrigin,
} from "./locations.js";
import { detectLauncherRoot, type LauncherInstance } from "./launcherRoots.js";

/** Which of the two things the person handed over was found. */
export type FolderResolution = "installation" | "saves";

/** Whether a folder can be read right now, checked afresh every time the list is asked for. */
export type FolderState = "ok" | "missing" | "not-a-folder" | "unreadable";

export interface MinecraftFolder {
    /** Stable across restarts. A stored label and a scan request are both keyed by it. */
    readonly id: string;
    /** What the row is called. The person's own label when they have set one. */
    readonly label: string;
    /** True when the label came from the person rather than from the default naming. */
    readonly labelled: boolean;
    /** Exactly the folder that was handed over, or the default that was detected. */
    readonly chosenPath: string;
    /** The `saves` folder it resolved to, which is what is actually read. */
    readonly savesPath: string;
    readonly resolution: FolderResolution;
    /** True for a detected default. Those are never unmounted; the rest are. */
    readonly builtIn: boolean;
    /** Set for a detected default, so a row can say which place it came from. */
    readonly origin: MinecraftFolderOrigin | null;
    readonly state: FolderState;
    /** The system's own words when {@link state} is `unreadable`. */
    readonly stateDetail: string | null;
    /** ISO-8601, for a user-mounted folder. Null for a detected default. */
    readonly mountedAt: string | null;
}

/** A user-mounted folder as it is stored. Detected defaults are never written here. */
interface StoredMount {
    readonly id: string;
    readonly label: string;
    readonly chosenPath: string;
    readonly savesPath: string;
    readonly resolution: FolderResolution;
    readonly mountedAt: string;
}

interface FolderStore {
    readonly version: 1;
    readonly mounts: readonly StoredMount[];
    /** Labels the person gave to detected defaults, keyed by folder id. */
    readonly labels: Readonly<Record<string, string>>;
}

const EMPTY_STORE: FolderStore = { version: 1, mounts: [], labels: {} };

/** Most folders one machine may mount. Generous; the cap exists so the file cannot grow without bound. */
export const MAX_MOUNTS = 64;

/** Longest label kept. A label is a row heading, not a note. */
export const MAX_LABEL_LENGTH = 80;

/* -------------------------------------------------------------------------- */
/* Resolving what somebody handed over                                        */
/* -------------------------------------------------------------------------- */

export type ResolveResult =
    | {
          readonly ok: true;
          readonly savesPath: string;
          readonly resolution: FolderResolution;
          /**
           * Set only when `chosen` turned out to be a launcher root (see `launcherRoots.ts`):
           * every instance found under it, `savesPath`/`resolution` above describing the
           * first one. `mountMinecraftFolder` mounts every entry here, not only the first,
           * so pointing at a launcher's root picks up all of its instances in one action.
           */
          readonly instances?: readonly LauncherInstance[];
      }
    | { readonly ok: false; readonly message: string };

/**
 * Works out whether a folder is a Minecraft installation, a `saves` folder, or neither.
 *
 * A relative path is refused rather than resolved, exactly as `inspect.ts` refuses one:
 * resolving it would read whatever happens to sit beside the process, which is a folder
 * nobody chose.
 */
export async function resolveMinecraftFolder(chosen: string): Promise<ResolveResult> {
    const folder = chosen.trim();
    if (folder === "") {
        return { ok: false, message: "No folder was given, so there was nothing to mount." };
    }
    if (!isAbsolute(folder)) {
        return {
            ok: false,
            message:
                `${folder} is not a full path, so where it points depends on where the app was ` +
                `started. Choose the folder again, or give a path that starts from a drive ` +
                `letter or from the root of the file system.`,
        };
    }

    const here = await lstat(folder).catch(() => null);
    if (here === null) return { ok: false, message: `There is no folder at ${folder}.` };
    if (!here.isDirectory()) return { ok: false, message: `${folder} is a file, not a folder.` };

    // A Minecraft installation: the folder holds `saves`, which holds the worlds.
    const saves = await findChildDirectory(folder, "saves");
    if (saves !== null) return { ok: true, savesPath: saves, resolution: "installation" };

    // A `saves` folder handed over directly. Two ways of recognising one, because a fresh
    // installation's `saves` is empty and refusing it would be refusing a correct answer.
    if (await holdsWorlds(folder)) return { ok: true, savesPath: folder, resolution: "saves" };
    if (baseName(folder).toLowerCase() === "saves") {
        return { ok: true, savesPath: folder, resolution: "saves" };
    }

    // A launcher's own root: many instances, each with its own `saves`, rather than one
    // `saves` folder directly under `folder`. See `launcherRoots.ts` for exactly what is
    // recognised and why. Checked before the one-world/final refusal below so a folder that
    // *is* a launcher root never reaches either of those misleading messages.
    const launcherInstances = await detectLauncherRoot(folder);
    if (launcherInstances !== null) {
        const primary = launcherInstances[0];
        if (primary !== undefined) {
            return { ok: true, savesPath: primary.savesPath, resolution: "installation", instances: launcherInstances };
        }
    }

    // One world, where a folder of worlds was wanted. Named as such, because this is the
    // mistake people make and "that is not a Minecraft folder" would be true and useless.
    const levelDat = await lstat(join(folder, "level.dat")).catch(() => null);
    if (levelDat !== null && levelDat.isFile()) {
        return {
            ok: false,
            message:
                `${folder} is one world rather than a folder of worlds. Mount the folder above ` +
                `it, ${dirname(folder)}, to get every world beside it. To make a map of this one ` +
                `world on its own, put its path in the world field instead.`,
        };
    }

    return {
        ok: false,
        message:
            `${folder} is neither a Minecraft installation nor a saves folder. A Minecraft ` +
            `installation contains a saves folder; a saves folder contains one directory per ` +
            `world, each with a level.dat in it.`,
    };
}

/** The exact-named child directory, then the case-insensitive one, which is what Windows would open. */
async function findChildDirectory(folder: string, name: string): Promise<string | null> {
    const exact = join(folder, name);
    const stats = await lstat(exact).catch(() => null);
    if (stats !== null && stats.isDirectory()) return exact;

    const lower = name.toLowerCase();
    try {
        const dir = await opendir(folder);
        for await (const child of dir) {
            if (child.isDirectory() && child.name.toLowerCase() === lower) return join(folder, child.name);
        }
    } catch {
        return null;
    }
    return null;
}

/** True when at least one immediate subdirectory holds a `level.dat`, capped so it stops early. */
async function holdsWorlds(folder: string): Promise<boolean> {
    let looked = 0;
    try {
        const dir = await opendir(folder);
        for await (const child of dir) {
            if (!child.isDirectory()) continue;
            looked += 1;
            if (looked > 256) return false;
            const stats = await lstat(join(folder, child.name, "level.dat")).catch(() => null);
            if (stats !== null && stats.isFile()) return true;
        }
    } catch {
        return false;
    }
    return false;
}

function baseName(folder: string): string {
    const trimmed = folder.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut < 0 ? trimmed : trimmed.slice(cut + 1);
}

/**
 * A stable id for a mounted folder, derived from the path it resolved to.
 *
 * FNV-1a over the path, which is enough for a list of at most a few dozen entries and has
 * the property that matters here: mounting the same folder twice produces the same id, so
 * a duplicate is recognised as one rather than added as a second row of the same worlds.
 */
export function folderIdFor(savesPath: string): string {
    const normalised = savesPath.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    let hash = 0x811c9dc5;
    for (let index = 0; index < normalised.length; index += 1) {
        hash ^= normalised.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return `mount:${hash.toString(16).padStart(8, "0")}`;
}

/**
 * The name a folder gets when nobody has renamed it.
 *
 * The folder above `saves` rather than `saves` itself, because every one of them is
 * called `saves` and a list of six rows all reading "saves" distinguishes nothing.
 */
export function defaultLabelFor(savesPath: string): string {
    // `dirname` from `node:path` is the *running* platform's, so on a Linux CI runner it
    // does not recognise a backslash and answers "." for every Windows path handed to it -
    // which is how this named a Windows mount "." while passing on a Windows machine. The
    // parent is cut here with the same separator-agnostic rule `baseName` already uses,
    // because a path this function is asked about may have been written on either platform.
    const parent = baseName(parentOf(savesPath));
    const own = baseName(savesPath);
    if (parent === "" || parent === own) return own;
    return parent;
}

/** The folder above, cutting at the last separator of either kind. */
function parentOf(folder: string): string {
    const trimmed = folder.replace(/[\\/]+$/, "");
    const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    return cut <= 0 ? "" : trimmed.slice(0, cut);
}

/* -------------------------------------------------------------------------- */
/* The stored list                                                            */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function readStoredMount(value: unknown): StoredMount | null {
    if (!isRecord(value)) return null;
    const savesPath = typeof value.savesPath === "string" ? value.savesPath.trim() : "";
    if (savesPath === "") return null;
    const resolution = value.resolution === "saves" ? "saves" : "installation";
    return {
        id: typeof value.id === "string" && value.id !== "" ? value.id : folderIdFor(savesPath),
        label: typeof value.label === "string" ? value.label.slice(0, MAX_LABEL_LENGTH) : defaultLabelFor(savesPath),
        chosenPath: typeof value.chosenPath === "string" && value.chosenPath !== "" ? value.chosenPath : savesPath,
        savesPath,
        resolution,
        mountedAt: typeof value.mountedAt === "string" ? value.mountedAt : "",
    };
}

/**
 * Reads the stored list.
 *
 * A missing, unreadable or malformed file means "nothing mounted yet". It never means an
 * error the person has to deal with before they can use the wizard: the detected default
 * is still offered and the manual path field still works, so the worst a broken store can
 * do is cost somebody the folders they added.
 */
export async function readFolderStore(file: string): Promise<FolderStore> {
    let raw: string;
    try {
        raw = await readFile(file, "utf8");
    } catch {
        return EMPTY_STORE;
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return EMPTY_STORE;
    }
    if (!isRecord(parsed)) return EMPTY_STORE;

    const mounts: StoredMount[] = [];
    if (Array.isArray(parsed.mounts)) {
        for (const entry of parsed.mounts) {
            const mount = readStoredMount(entry);
            if (mount !== null && !mounts.some((existing) => existing.id === mount.id)) mounts.push(mount);
            if (mounts.length >= MAX_MOUNTS) break;
        }
    }

    const labels: Record<string, string> = {};
    if (isRecord(parsed.labels)) {
        for (const [key, value] of Object.entries(parsed.labels)) {
            if (typeof value === "string" && value.trim() !== "") {
                labels[key] = value.trim().slice(0, MAX_LABEL_LENGTH);
            }
        }
    }

    return { version: 1, mounts, labels };
}

/**
 * Writes the list.
 *
 * Staged and renamed, the same way `consent.ts` writes its record, so a crash in the
 * middle of a write cannot leave a half-written file that parses as a shorter list than
 * the person actually has.
 */
export async function writeFolderStore(file: string, store: FolderStore): Promise<void> {
    await mkdir(dirname(file), { recursive: true });
    const staging = `${file}.writing`;
    await writeFile(staging, `${JSON.stringify(store, null, 4)}\n`, "utf8");
    await rename(staging, file);
}

/* -------------------------------------------------------------------------- */
/* The list the interface sees                                                */
/* -------------------------------------------------------------------------- */

export interface FolderListOptions extends DefaultMinecraftFolderOptions {
    /** Where the stored list lives. Absent means nothing is persisted this run. */
    readonly storeFile?: string | null;
}

/**
 * Every folder worth offering: the detected defaults first, then whatever was mounted.
 *
 * Each row's state is checked here rather than remembered, because a folder on a drive
 * that is plugged in now was missing an hour ago and will be again. A detected default
 * that does not exist is still listed, with `state: "missing"`, so the interface can say
 * where it looked instead of leaving somebody to guess whether it looked at all.
 */
export async function listMinecraftFolders(options: FolderListOptions): Promise<readonly MinecraftFolder[]> {
    const store = options.storeFile == null ? EMPTY_STORE : await readFolderStore(options.storeFile);
    const folders: MinecraftFolder[] = [];

    for (const candidate of defaultMinecraftFolders(options)) {
        const stored = store.labels[candidate.id];
        const { state, stateDetail } = await folderState(candidate.savesPath);
        // The portable candidate and the Bedrock candidate are only listed when they really
        // exist. The platform's own Java default is listed either way, because "we looked
        // here and found nothing" is the sentence somebody with no Minecraft installed
        // needs; a permanent "missing" row for a portable installation or a Bedrock/Store
        // install nobody has answers no question and clutters every other machine's list.
        if ((candidate.origin === "beside-executable" || candidate.origin === "bedrock-appdata") && state !== "ok") {
            continue;
        }
        folders.push({
            id: candidate.id,
            label: stored ?? defaultLabelFor(candidate.savesPath),
            labelled: stored !== undefined,
            chosenPath: candidate.installationPath,
            savesPath: candidate.savesPath,
            resolution: "installation",
            builtIn: true,
            origin: candidate.origin,
            state,
            stateDetail,
            mountedAt: null,
        });
    }

    // Launcher roots with a multi-instance layout, expanded fresh on every call so a newly
    // installed modpack instance appears without anybody re-mounting anything. Absent
    // entirely (not a "missing" row) when the root itself is not there or holds nothing
    // shaped like an instance - see `defaultLauncherRoots` and `detectLauncherRoot` for why.
    for (const root of defaultLauncherRoots(options)) {
        const instances = await detectLauncherRoot(root.root);
        if (instances === null) continue;
        for (const instance of instances) {
            if (folders.some((existing) => sameFolder(existing.savesPath, instance.savesPath))) continue;
            const id = folderIdFor(instance.savesPath);
            const stored = store.labels[id];
            const { state, stateDetail } = await folderState(instance.savesPath);
            folders.push({
                id,
                label: stored ?? instance.name,
                labelled: stored !== undefined,
                chosenPath: instance.installationPath,
                savesPath: instance.savesPath,
                resolution: "installation",
                builtIn: true,
                origin: root.origin,
                state,
                stateDetail,
                mountedAt: null,
            });
        }
    }

    for (const mount of store.mounts) {
        // A mounted folder that is also a detected default is one folder. Keeping the
        // detected row means the person keeps the sentence saying where it was found.
        if (folders.some((existing) => sameFolder(existing.savesPath, mount.savesPath))) continue;
        const { state, stateDetail } = await folderState(mount.savesPath);
        folders.push({
            id: mount.id,
            label: mount.label === "" ? defaultLabelFor(mount.savesPath) : mount.label,
            labelled: mount.label !== "",
            chosenPath: mount.chosenPath,
            savesPath: mount.savesPath,
            resolution: mount.resolution,
            builtIn: false,
            origin: null,
            state,
            stateDetail,
            mountedAt: mount.mountedAt === "" ? null : mount.mountedAt,
        });
    }

    return folders;
}

function sameFolder(left: string, right: string): boolean {
    return folderIdFor(left) === folderIdFor(right);
}

async function folderState(path: string): Promise<{ state: FolderState; stateDetail: string | null }> {
    try {
        const stats = await lstat(path);
        if (!stats.isDirectory()) return { state: "not-a-folder", stateDetail: null };
        return { state: "ok", stateDetail: null };
    } catch (error) {
        const code =
            isRecord(error) && typeof error.code === "string" ? error.code : null;
        if (code === "ENOENT" || code === "ENOTDIR") return { state: "missing", stateDetail: null };
        return {
            state: "unreadable",
            stateDetail: error instanceof Error ? error.message : String(error),
        };
    }
}

export type MountResult =
    | { readonly ok: true; readonly folder: MinecraftFolder; readonly alreadyMounted: boolean }
    | { readonly ok: false; readonly message: string };

/**
 * Adds a folder to the list.
 *
 * Mounting a folder that is already there is not an error and does not add a second row:
 * it comes back `alreadyMounted`, so the interface can say "that one is already in the
 * list" and highlight the row rather than growing a duplicate somebody then has to tidy.
 */
export async function mountMinecraftFolder(
    chosen: string,
    options: FolderListOptions,
): Promise<MountResult> {
    const resolved = await resolveMinecraftFolder(chosen);
    if (!resolved.ok) return resolved;

    const existing = await listMinecraftFolders(options);

    if (resolved.instances !== undefined && resolved.instances.length > 0) {
        return await mountLauncherInstances(resolved.instances, existing, options);
    }

    const already = existing.find((folder) => sameFolder(folder.savesPath, resolved.savesPath));
    if (already !== undefined) return { ok: true, folder: already, alreadyMounted: true };

    if (existing.length >= MAX_MOUNTS) {
        return {
            ok: false,
            message: `This list already holds ${MAX_MOUNTS} folders, which is as many as it keeps. Unmount one to add another.`,
        };
    }

    const id = folderIdFor(resolved.savesPath);
    const mount: StoredMount = {
        id,
        label: defaultLabelFor(resolved.savesPath),
        chosenPath: chosen.trim(),
        savesPath: resolved.savesPath,
        resolution: resolved.resolution,
        mountedAt: new Date().toISOString(),
    };

    if (options.storeFile != null) {
        const store = await readFolderStore(options.storeFile);
        await writeFolderStore(options.storeFile, { ...store, mounts: [...store.mounts, mount] });
    }

    const { state, stateDetail } = await folderState(resolved.savesPath);
    return {
        ok: true,
        alreadyMounted: false,
        folder: {
            id,
            label: mount.label,
            labelled: false,
            chosenPath: mount.chosenPath,
            savesPath: mount.savesPath,
            resolution: mount.resolution,
            builtIn: false,
            origin: null,
            state,
            stateDetail,
            mountedAt: mount.mountedAt,
        },
    };
}

/**
 * Mounts every instance found under a launcher root in one action.
 *
 * Each instance becomes its own ordinary `StoredMount`, exactly as if it had been mounted
 * one at a time - the same id (derived from its `savesPath`), the same unmount, the same
 * rename. What differs is only how many are added by one call, and that an instance already
 * in the list is left alone rather than duplicated: mounting the same root a second time,
 * after a new modpack instance has appeared, mounts only the new one.
 *
 * Returns the first newly mounted instance as `folder` for the caller's notice, with
 * `alreadyMounted: true` only when *every* instance was already in the list - a root with
 * one new instance among three familiar ones is real progress and is reported as such.
 */
async function mountLauncherInstances(
    instances: readonly LauncherInstance[],
    existing: readonly MinecraftFolder[],
    options: FolderListOptions,
): Promise<MountResult> {
    const toAdd = instances.filter(
        (instance) => !existing.some((folder) => sameFolder(folder.savesPath, instance.savesPath)),
    );

    if (toAdd.length === 0) {
        const first = instances[0];
        const already = first === undefined ? undefined : existing.find((folder) => sameFolder(folder.savesPath, first.savesPath));
        if (already !== undefined) return { ok: true, folder: already, alreadyMounted: true };
    }

    const room = MAX_MOUNTS - existing.length;
    if (room <= 0 || toAdd.length === 0) {
        return {
            ok: false,
            message: `This list already holds ${MAX_MOUNTS} folders, which is as many as it keeps. Unmount one to add another.`,
        };
    }

    const capped = toAdd.slice(0, room);
    const nowIso = new Date().toISOString();
    const newMounts: StoredMount[] = capped.map((instance) => ({
        id: folderIdFor(instance.savesPath),
        label: instance.name,
        chosenPath: instance.installationPath,
        savesPath: instance.savesPath,
        resolution: "installation",
        mountedAt: nowIso,
    }));

    if (options.storeFile != null) {
        const store = await readFolderStore(options.storeFile);
        await writeFolderStore(options.storeFile, { ...store, mounts: [...store.mounts, ...newMounts] });
    }

    const first = newMounts[0];
    if (first === undefined) {
        return { ok: false, message: "No new instance was found to mount." };
    }
    const { state, stateDetail } = await folderState(first.savesPath);
    return {
        ok: true,
        alreadyMounted: false,
        folder: {
            id: first.id,
            label: first.label,
            labelled: false,
            chosenPath: first.chosenPath,
            savesPath: first.savesPath,
            resolution: first.resolution,
            builtIn: false,
            origin: null,
            state,
            stateDetail,
            mountedAt: first.mountedAt,
        },
    };
}

/**
 * Takes a folder off the list.
 *
 * Nothing on disk is touched: this rewrites one JSON file and does not so much as open
 * the folder it is forgetting. False means there was no such entry, or it was a detected
 * default, which is not stored and so cannot be taken out of a list it was never in.
 */
export async function unmountMinecraftFolder(id: string, storeFile: string | null): Promise<boolean> {
    if (storeFile == null) return false;
    const store = await readFolderStore(storeFile);
    const kept = store.mounts.filter((mount) => mount.id !== id);
    if (kept.length === store.mounts.length) return false;
    await writeFolderStore(storeFile, { ...store, mounts: kept });
    return true;
}

/**
 * Renames a folder, or drops the name back to the default when given an empty one.
 *
 * A detected default is renameable too. Its label is stored on its own, keyed by the id
 * that comes from where it was found rather than from its path, so somebody whose home
 * directory moves keeps the name they gave it.
 */
export async function labelMinecraftFolder(
    id: string,
    label: string,
    storeFile: string | null,
): Promise<boolean> {
    if (storeFile == null) return false;
    const trimmed = label.trim().slice(0, MAX_LABEL_LENGTH);
    const store = await readFolderStore(storeFile);

    const mount = store.mounts.find((candidate) => candidate.id === id);
    if (mount !== undefined) {
        const relabelled = store.mounts.map((candidate) =>
            candidate.id === id
                ? { ...candidate, label: trimmed === "" ? defaultLabelFor(candidate.savesPath) : trimmed }
                : candidate,
        );
        await writeFolderStore(storeFile, { ...store, mounts: relabelled });
        return true;
    }

    const labels = { ...store.labels };
    if (trimmed === "") delete labels[id];
    else labels[id] = trimmed;
    await writeFolderStore(storeFile, { ...store, labels });
    return true;
}
