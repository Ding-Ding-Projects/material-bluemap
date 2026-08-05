/**
 * What may be backed up, and what a chosen folder actually turns out to be.
 *
 * Two kinds, because two different things on this computer are worth a backup and they
 * fail in different ways:
 *
 * - a **render**: one workspace under the maps folder, holding the tiles the viewer
 *   serves plus the `render.json` that says which engine produced them. Losing it costs
 *   however many hours the render took;
 * - a **world**: the Minecraft save itself, a folder with a `level.dat` and region files.
 *   Losing it costs the world, and no amount of re-rendering brings it back.
 *
 * The distinction is not decoration. A render can be produced again from a world; a world
 * cannot be produced again from anything. The interface says which of the two a person is
 * about to back up, and the sidecar records it, so a release full of archives is still
 * legible a year later.
 *
 * ## Why a folder is inspected before it is packed
 *
 * Packing is the expensive step and the one that cannot be undone cheaply: it reads every
 * byte of a multi-gigabyte tree and writes them out again. Finding out afterwards that
 * the folder was not a world - because the person picked its parent, which is the single
 * most common way this goes wrong - means an hour spent producing an archive of the wrong
 * thing. Every refusal here names the folder and says what was looked for.
 */

import { stat } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { readFolderContents } from "./archive.js";

export type BackupSourceKind = "render" | "world";

export interface BackupSource {
    readonly kind: BackupSourceKind;
    /** The folder that will be packed, absolute. */
    readonly folder: string;
    /** What to call it on screen and in the archive name. */
    readonly label: string;
    /** How many ordinary files it holds. */
    readonly files: number;
    /** The total size of those files, before the archive's own overhead. */
    readonly bytes: number;
    /**
     * Files deliberately left out, with the reason. Empty for nearly every folder; a
     * count that silently differs from what a file manager shows is how a backup comes
     * to be trusted for something it does not contain.
     */
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
    /** For a render, the engine record beside the tiles, when there is one. */
    readonly renderRecordPath: string | null;
}

export interface BackupSourceRefusal {
    readonly code: "not-a-folder" | "not-a-world" | "not-a-render" | "empty" | "unreadable";
    readonly message: string;
}

export type BackupSourceResult =
    | { readonly ok: true; readonly source: BackupSource }
    | { readonly ok: false; readonly failure: BackupSourceRefusal };

/** What makes a folder a Minecraft world rather than a folder with a world in it. */
const WORLD_MARKER = "level.dat";
/** What a render workspace has beside its `web/` folder. */
const RENDER_MARKER = "render.json";

/**
 * Reads a folder well enough to say whether it is the kind of thing it was offered as.
 *
 * The walk is the same one the pack uses, so the file count and byte total shown before a
 * backup starts are the ones it will actually pack, rather than an estimate that turns
 * out to have counted links or unreadable files.
 */
export async function inspectBackupSource(
    kind: BackupSourceKind,
    folder: string,
    signal?: AbortSignal,
): Promise<BackupSourceResult> {
    const root = resolve(folder);

    const stats = await stat(root).catch(() => null);
    if (stats === null) {
        return refuse("unreadable", `${root} could not be read, so there is nothing to pack.`);
    }
    if (!stats.isDirectory()) {
        return refuse("not-a-folder", `${root} is a file. A backup packs a folder.`);
    }

    if (kind === "world") {
        const marker = await stat(join(root, WORLD_MARKER)).catch(() => null);
        if (marker === null || !marker.isFile()) {
            return refuse(
                "not-a-world",
                `There is no ${WORLD_MARKER} in ${root}, so it is not a Minecraft world. The ` +
                    "world folder is the one holding level.dat and the region folders - often " +
                    "one level below the folder a save is listed under.",
            );
        }
    }

    let recordPath: string | null = null;
    if (kind === "render") {
        const record = await stat(join(root, RENDER_MARKER)).catch(() => null);
        const web = await stat(join(root, "web")).catch(() => null);
        if ((record === null || !record.isFile()) && (web === null || !web.isDirectory())) {
            return refuse(
                "not-a-render",
                `${root} carries neither a ${RENDER_MARKER} nor a web folder, so it is not a ` +
                    "render this application produced. Pick a map from the list rather than a " +
                    "folder, and the right one is chosen for you.",
            );
        }
        recordPath = record !== null && record.isFile() ? join(root, RENDER_MARKER) : null;
    }

    let contents;
    try {
        contents = await readFolderContents(root, signal);
    } catch (error) {
        return refuse("unreadable", error instanceof Error ? error.message : String(error));
    }

    if (contents.entries.length === 0) {
        return refuse(
            "empty",
            `${root} holds no files. An empty backup would upload and restore perfectly and ` +
                "give back nothing, which is worse than no backup at all because it looks like " +
                "one.",
        );
    }

    return {
        ok: true,
        source: {
            kind,
            folder: root,
            label: basename(root),
            files: contents.entries.length,
            bytes: contents.bytes,
            skipped: contents.skipped,
            renderRecordPath: recordPath,
        },
    };
}

/**
 * The archive's file name for a source, at a moment.
 *
 * Deliberately readable rather than a hash: it is the name that appears in the release,
 * in the download list, and on somebody's disk after a restore, and `world-overworld-
 * 20260804-101500.zip` answers "what is this" without opening anything. The timestamp is
 * what keeps two backups of the same world apart, and it is UTC because a release read in
 * another timezone should still sort correctly.
 */
export function archiveNameFor(kind: BackupSourceKind, label: string, at: Date): string {
    return `${kind}-${slug(label)}-${stamp(at)}.zip`;
}

/** Every release tag this module writes starts with this; nothing else may. */
const RELEASE_TAG_PREFIX = "mbm-backup-";

/**
 * The release tag for a backup. Unique per backup, and never reused.
 *
 * Every backup is its own new release. Nothing here ever edits or replaces one, so the
 * tag only has to be unique, and a second-resolution UTC stamp with the kind in front is
 * both unique in practice and readable in a tag list. A collision - two backups begun in
 * the same second - is refused by GitHub rather than silently overwriting, which is the
 * behaviour that matters.
 */
export function releaseTagFor(kind: BackupSourceKind, label: string, at: Date): string {
    return `${RELEASE_TAG_PREFIX}${kind}-${slug(label)}-${stamp(at)}`;
}

/**
 * Recovers the archive name a *resumed* backup must reuse, from the tag it is resuming.
 *
 * `releaseTagFor` and `archiveNameFor` are built from the exact same `kind-label-stamp`
 * triple - the tag just carries `RELEASE_TAG_PREFIX` in front and no `.zip` suffix - so
 * the archive name is recoverable from the tag without re-deriving it from the current
 * clock. That recovery is what a resume actually needs: `#run` in `runner.ts` used to
 * call `archiveNameFor(kind, label, at)` with `at` set to *this* call's start time even
 * when resuming, so a part's asset name (which is prefixed with the archive name) came
 * out different from the original upload's the moment a resume started in a different
 * UTC second than the first attempt - the ordinary case for anything that takes more
 * than an instant. `findExistingAssets`'s skip check matches by exact name, so every part
 * silently missed its own already-uploaded twin and was re-uploaded in full, defeating
 * resumability for the one case it exists for. Returns null for a tag this module did
 * not mint (no known prefix), so a caller can fall back rather than trust a guess.
 */
export function archiveNameFromTag(tag: string): string | null {
    if (!tag.startsWith(RELEASE_TAG_PREFIX)) return null;
    return `${tag.slice(RELEASE_TAG_PREFIX.length)}.zip`;
}

/** UTC, to the second, in a form that sorts lexicographically. */
function stamp(at: Date): string {
    return at.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
}

/**
 * A label reduced to something safe in a file name, an asset name and a Git tag at once.
 *
 * A tag may not contain whitespace (the pointer's own grammar refuses it) and an asset
 * name travels through a URL, so the intersection of what all three accept is small. A
 * world called `My World (1.20)` becomes `my-world-1-20`, and the real name survives in
 * the sidecar rather than being lost.
 */
function slug(value: string): string {
    const reduced = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 40);
    return reduced.length > 0 ? reduced : "backup";
}

function refuse(
    code: BackupSourceRefusal["code"],
    message: string,
): { readonly ok: false; readonly failure: BackupSourceRefusal } {
    return { ok: false, failure: { code, message } };
}
