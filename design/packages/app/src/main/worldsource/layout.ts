/**
 * Working out what a release is actually offering, whoever published it.
 *
 * `download/release.ts` answers this for releases *this project* published: a
 * `<name>.parts.json` claims its `<name>.001`, `<name>.002`, ... and the pile becomes one
 * download. That is still the best case and is still preferred here, because a manifest
 * carries a whole-file digest and a checksum list does not.
 *
 * It is not the only case. A world backed up by somebody else's script arrives as
 *
 * ```
 * andyville-world-20260804-160001.zip.part.0000   1.70 GB
 * andyville-world-20260804-160001.zip.part.0001   1.70 GB
 * andyville-world-20260804-160001.zip.part.0002   1.70 GB
 * andyville-world-20260804-160001.zip.part.0003   1.52 GB
 * SHA256SUMS                                        448 B
 * ```
 *
 * which is the same idea in a different spelling, and was previously invisible to this
 * app - the release read as five unrelated files, none of which is a world.
 *
 * ## The gap check is the whole point
 *
 * Parts are concatenated in index order. A missing part in the middle does not produce an
 * error; it produces a *shorter archive that still unzips*, with a world that opens and
 * corrupts later. So a run of indices with a hole in it is refused here, by name, before
 * anything is downloaded - rather than discovered as a rendering bug three layers away.
 */

import { availableDownloads } from "../download/release.js";
import type { AvailableDownload, ReleaseAsset, ReleaseInfo } from "../download/release.js";
import { isChecksumAssetName } from "./checksums.js";

/** One published piece of a split archive. */
export interface WorldSourcePart {
    /** The published asset name, e.g. `world.zip.part.0002`. */
    readonly name: string;
    /** The number on the end, as published. May start at 0 or at 1. */
    readonly index: number;
    readonly asset: ReleaseAsset;
}

/** A split published beside a `SHA256SUMS` rather than beside a manifest. */
export interface ChecksumWorldSource {
    readonly kind: "checksums";
    /** The name the archive gets back once joined, e.g. `world.zip`. */
    readonly name: string;
    readonly parts: readonly WorldSourcePart[];
    /** The sum of the published part sizes. Exact, because every part is listed. */
    readonly bytes: number;
    readonly checksums: ReleaseAsset;
}

/** A split published the way this project publishes one, manifest and all. */
export interface ManifestWorldSource {
    readonly kind: "manifest";
    readonly name: string;
    readonly parts: number;
    readonly bytes: number;
    readonly download: AvailableDownload;
}

/** One asset, small enough that nobody split it. */
export interface WholeWorldSource {
    readonly kind: "whole";
    readonly name: string;
    readonly bytes: number;
    readonly asset: ReleaseAsset;
}

export type WorldSource = ChecksumWorldSource | ManifestWorldSource | WholeWorldSource;

/**
 * The numeric tail of a part name, in every spelling seen in the wild.
 *
 * `world.zip.part.0000`, `world.zip.part0000` and `world.zip.001` all mean the same thing.
 *
 * The base is **lazy**, and that is the whole correctness of this pattern rather than a
 * stylistic choice. Greedy, the engine prefers the shortest possible suffix: on
 * `world.zip.part.0000` it stops at the last dot and reports a base of `world.zip.part`,
 * which does not end in `.zip`, so the release reads as having no world in it at all - a
 * silent empty list rather than an error. Lazy, the `part.` is consumed into the suffix
 * where it belongs and the base comes back as `world.zip`.
 *
 * Laziness also still gets the awkward case right: `world.001.002` reads as part 2 of a
 * file genuinely called `world.001`, because the shortest base that leaves a *complete*
 * numeric tail is `world.001`.
 */
const PART_SUFFIX = /^(.+?)\.(?:part[._-]?)?(\d{1,6})$/i;

/** `world.zip.part.0003` -> `{ base: "world.zip", index: 3 }`, or null. */
export function readPartName(name: string): { readonly base: string; readonly index: number } | null {
    const match = PART_SUFFIX.exec(name);
    if (match === null) return null;
    const base = match[1];
    const digits = match[2];
    if (base === undefined || digits === undefined || base === "") return null;
    const index = Number.parseInt(digits, 10);
    return Number.isSafeInteger(index) ? { base, index } : null;
}

/**
 * A gap, a duplicate, or nothing to join. The message names the base it is about.
 *
 * A refusal rather than a best effort: see the note at the top of this file about what a
 * missing middle part produces.
 */
export class WorldSourceLayoutError extends Error {
    /** The archive name the problem is about, so a caller can say which download failed. */
    readonly source: string;

    constructor(message: string, source: string) {
        super(message);
        this.name = "WorldSourceLayoutError";
        this.source = source;
    }
}

/** Extensions this offers as a world. Anything else on a release is not a world. */
const ARCHIVE_SUFFIXES = [".zip"] as const;

function looksLikeArchive(name: string): boolean {
    const lowered = name.toLowerCase();
    return ARCHIVE_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

/**
 * Proves a run of indices is complete, and returns them in join order.
 *
 * The run may start at 0 or at 1 - both are published, and neither is wrong - but it has
 * to be contiguous from wherever it starts. Sorted numerically rather than by name,
 * because a publisher who padded to three digits and then produced a thousand parts leaves
 * `.999` sorting after `.1000` in every file manager on earth.
 */
function ordered(parts: WorldSourcePart[], base: string): WorldSourcePart[] {
    const sorted = [...parts].sort((a, b) => a.index - b.index);
    const first = sorted[0];
    if (first === undefined) {
        throw new WorldSourceLayoutError(`${base} has no parts to join.`, base);
    }
    if (first.index > 1) {
        throw new WorldSourceLayoutError(
            `${base} starts at part ${String(first.index)}, so parts before it are missing.`,
            base,
        );
    }
    for (let position = 1; position < sorted.length; position++) {
        const previous = sorted[position - 1];
        const current = sorted[position];
        if (previous === undefined || current === undefined) continue;
        if (current.index === previous.index) {
            throw new WorldSourceLayoutError(
                `${base} publishes part ${String(current.index)} twice (${previous.name} and ${current.name}).`,
                base,
            );
        }
        if (current.index !== previous.index + 1) {
            throw new WorldSourceLayoutError(
                `${base} jumps from part ${String(previous.index)} to ${String(current.index)}; ` +
                    "the parts in between were never published, and joining what is here would " +
                    "produce a shorter archive that still unzips.",
                base,
            );
        }
    }
    return sorted;
}

/**
 * Everything on a release that could be fetched as a world, best format first.
 *
 * Never throws for a release that merely has nothing in it; a release with no world is an
 * empty list and a sentence somewhere else. It *does* throw {@link WorldSourceLayoutError}
 * for a split that is incomplete, because that is a broken publication rather than an
 * absence, and offering it as a download would be offering a world that cannot be built.
 */
export function worldSourcesIn(release: ReleaseInfo): WorldSource[] {
    const manifestSources: ManifestWorldSource[] = [];
    const claimed = new Set<string>();

    // The manifest layout wins wherever it exists. It carries a whole-file digest, which
    // a checksum list does not, so a release that has both is read the stronger way.
    for (const download of availableDownloads(release)) {
        if (download.kind !== "split") continue;
        manifestSources.push({
            kind: "manifest",
            name: download.name,
            parts: download.parts.length,
            bytes: download.bytes,
            download,
        });
        claimed.add(download.manifest.name);
        for (const part of download.parts) claimed.add(part.name);
    }

    const checksums = release.assets.find((asset) => isChecksumAssetName(asset.name));
    const checksumSources: ChecksumWorldSource[] = [];
    if (checksums !== undefined) {
        claimed.add(checksums.name);
        const grouped = new Map<string, WorldSourcePart[]>();
        for (const asset of release.assets) {
            if (claimed.has(asset.name)) continue;
            const read = readPartName(asset.name);
            if (read === null || !looksLikeArchive(read.base)) continue;
            const bucket = grouped.get(read.base) ?? [];
            bucket.push({ name: asset.name, index: read.index, asset });
            grouped.set(read.base, bucket);
        }
        for (const [base, parts] of grouped) {
            const sorted = ordered(parts, base);
            for (const part of sorted) claimed.add(part.name);
            checksumSources.push({
                kind: "checksums",
                name: base,
                parts: sorted,
                bytes: sorted.reduce((total, part) => total + part.asset.size, 0),
                checksums,
            });
        }
    }

    const whole: WholeWorldSource[] = [];
    for (const asset of release.assets) {
        if (claimed.has(asset.name)) continue;
        if (!looksLikeArchive(asset.name)) continue;
        whole.push({ kind: "whole", name: asset.name, bytes: asset.size, asset });
    }

    // Split sources first: they are the large ones, and the reason this exists.
    return [...manifestSources, ...checksumSources, ...whole];
}

/** Finds one source by the name it presents, whichever layout it came from. */
export function findWorldSource(
    sources: readonly WorldSource[],
    name: string,
): WorldSource | null {
    return sources.find((source) => source.name === name) ?? null;
}

/** How many pieces a source arrives in, for a summary row. */
export function partCount(source: WorldSource): number {
    switch (source.kind) {
        case "checksums":
            return source.parts.length;
        case "manifest":
            return source.parts;
        default:
            return 1;
    }
}
