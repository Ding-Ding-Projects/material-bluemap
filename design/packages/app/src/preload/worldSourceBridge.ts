/**
 * Pointing the downloads bridge's `discoverRelease` and the "paste a link" field at
 * `main/worldsource/`, without changing what either promises the interface.
 *
 * `worldsource:discover` answers with a release's *sources* - each carrying a `kind`
 * (`manifest`, `checksums` or `whole`) and how it is verified - because that is what the
 * checksum-list path in `main/worldsource/fetcher.ts` needs to choose between them. The
 * downloads bridge has never spoken that shape: it promises `DiscoveredRelease.downloads`,
 * a plain `{ name, split, parts, bytes }[]`, and `ReleaseDownloads.vue` was built against
 * exactly that. {@link toBridgeDiscoveryResult} is the seam - the one place a `kind` turns
 * into a `split` - so the panel keeps working unchanged while what answers it gains the
 * ability to read a `SHA256SUMS` release and a repository that is not this project's own.
 *
 * Kept free of every Electron import on purpose. Requiring the real `electron` package
 * outside an Electron process returns a path string, not the API surface, so a module that
 * touches `contextBridge` at load time cannot be exercised by a plain Node test - and this
 * mapping is exactly the part of the wiring that is worth exercising directly rather than
 * trusting.
 */

/** Mirrors `WorldSourceReference` in `main/worldsource/repository.ts`. */
export interface WorldSourceReferenceAnswer {
    readonly owner: string;
    readonly repo: string;
    /** Null means "whatever is latest", never the literal tag `latest`. */
    readonly tag: string | null;
}

/** Mirrors `WorldSource["kind"]` in `main/worldsource/layout.ts`. */
export type WorldSourceKind = "manifest" | "checksums" | "whole";

/** Mirrors `WorldSourceSummary` in `main/worldsource/fetcher.ts`. */
export interface WorldSourceSummaryAnswer {
    readonly name: string;
    readonly kind: WorldSourceKind;
    readonly parts: number;
    readonly bytes: number;
    readonly verification: "manifest" | "checksum-list" | "none";
}

/** Mirrors `WorldSourceReleaseSummary` in `main/worldsource/fetcher.ts`. */
export interface WorldSourceReleaseSummaryAnswer {
    readonly owner: string;
    readonly repo: string;
    readonly tag: string;
    readonly name: string;
    readonly htmlUrl: string;
    readonly sources: readonly WorldSourceSummaryAnswer[];
}

/** Mirrors `DiscoverAnswer` in `main/worldsource/ipc.ts`. */
export type WorldSourceDiscoverAnswer =
    | { readonly ok: true; readonly release: WorldSourceReleaseSummaryAnswer }
    | { readonly ok: false; readonly message: string; readonly code: string };

/**
 * What `discoverRelease` on the downloads bridge has always promised the interface.
 *
 * Deliberately **not** `readonly`: this has to structurally match `DiscoveredRelease` in
 * `preload/index.ts`, which predates this file and is not readonly either, and a readonly
 * array does not assign to a mutable one even when every element type agrees.
 */
export interface BridgeDiscoveredRelease {
    tag: string;
    name: string;
    htmlUrl: string;
    downloads: {
        name: string;
        split: boolean;
        parts: number;
        bytes: number;
    }[];
}

export type BridgeDiscoveryResult =
    | { ok: true; release: BridgeDiscoveredRelease }
    | { ok: false; message: string };

/**
 * Turns what `worldsource:discover` actually answers into what the panel has always read.
 *
 * A checksum-list world is split every bit as much as a manifest one - fetching it means
 * several HTTP requests either way - so `kind !== "whole"` is `split`, regardless of which
 * of the two ways the parts are verified. `code` is dropped rather than carried through:
 * nothing downstream of the bridge has ever branched on it, and inventing a place for it
 * to go would be a wider contract change than this fix calls for.
 */
export function toBridgeDiscoveryResult(answer: WorldSourceDiscoverAnswer): BridgeDiscoveryResult {
    if (!answer.ok) return { ok: false, message: answer.message };
    return {
        ok: true,
        release: {
            tag: answer.release.tag,
            name: answer.release.name,
            htmlUrl: answer.release.htmlUrl,
            downloads: answer.release.sources.map((source) => ({
                name: source.name,
                split: source.kind !== "whole",
                parts: Math.max(1, source.parts),
                bytes: source.bytes,
            })),
        },
    };
}

/** What the owner/repository/tag fields already take, from `ReleaseCoordinates` in `downloadBridge.ts`. */
export interface BridgeReleaseCoordinates {
    owner: string;
    repo: string;
    tag?: string;
}

/**
 * What a pasted link resolves to, in the shape the three fields already use.
 *
 * `null` for both a `null` reference and one with no tag lets the caller write
 * `parsed.tag ?? ""` either way, matching the blank-means-latest convention the tag field
 * already has, and lets a reference that named no tag leave whatever the field already
 * held rather than being forced to overwrite it with an empty string this function invented.
 */
export function toBridgeCoordinates(
    reference: WorldSourceReferenceAnswer | null,
): BridgeReleaseCoordinates | null {
    if (reference === null) return null;
    return {
        owner: reference.owner,
        repo: reference.repo,
        ...(reference.tag === null ? {} : { tag: reference.tag }),
    };
}
