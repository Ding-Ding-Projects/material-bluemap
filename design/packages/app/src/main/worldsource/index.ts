/**
 * Getting a world out of somebody else's release.
 *
 * `download/` fetches a release asset and rejoins a split published the way this project
 * publishes one. This folder adds the two things that were missing for a world that lives
 * somewhere else:
 *
 * - **any repository.** The lookup always took an owner and a name; what was missing was
 *   the step that turns a pasted `https://github.com/owner/repo/releases/tag/...` into
 *   that pair, and a validator strict enough that nothing which fails GitHub's own name
 *   grammar reaches an API path.
 * - **a split described by `SHA256SUMS`.** Most of the world does not publish a
 *   `<name>.parts.json`; it publishes `world.zip.part.0000`, `world.zip.part.0001`, ...
 *   and a `sha256sum` listing. That release read as a pile of unrelated files before.
 *
 * ```ts
 * import { registerWorldSourceHandlers, parseWorldSourceReference } from "./worldsource/index.js";
 *
 * const reference = parseWorldSourceReference(
 *     "https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001",
 * );
 * const worldSources = registerWorldSourceHandlers(ipcMain, {
 *     storageDir: () => render.storageDirectory(),
 *     onEvent: broadcastDownloadEvent,   // the SAME channel the downloads panel listens on
 *     token: githubToken,
 *     downloader: downloads.downloader,  // share the instance the panel already lists
 * });
 * ```
 *
 * `ipc.ts` is the one module here that names Electron, and only as a type. Everything else
 * takes what it needs as a parameter, which is what lets the reference parser, the
 * checksum reader, the layout reader, the manifest synthesis and the fetcher be tested with
 * no Electron runtime and no network.
 */

export {
    formatReference,
    isValidReference,
    parseWorldSourceReference,
    type WorldSourceReference,
} from "./repository.js";

export {
    CHECKSUM_ASSET_NAMES,
    ChecksumFileError,
    checksumsByName,
    isChecksumAssetName,
    parseChecksums,
    type ChecksumEntry,
} from "./checksums.js";

export {
    WorldSourceLayoutError,
    findWorldSource,
    partCount,
    readPartName,
    worldSourcesIn,
    type ChecksumWorldSource,
    type ManifestWorldSource,
    type WholeWorldSource,
    type WorldSource,
    type WorldSourcePart,
} from "./layout.js";

export {
    compareDigests,
    digestParts,
    type DigestMismatch,
    type DigestOptions,
    type DigestProgress,
    type DigestedPart,
    type DigestedParts,
} from "./verify.js";

export {
    serialiseManifest,
    synthesiseManifest,
    synthesisedManifestName,
    type SynthesiseManifestOptions,
    type SynthesisedPart,
} from "./manifest.js";

export {
    WorldSourceFetcher,
    type WorldSourceFetcherOptions,
    type WorldSourceReleaseSummary,
    type WorldSourceRequest,
    type WorldSourceSummary,
} from "./fetcher.js";

export {
    WORLD_SOURCE_CHANNELS,
    registerWorldSourceHandlers,
    type DiscoverAnswer,
    type WorldSourceIpc,
    type WorldSourceIpcOptions,
} from "./ipc.js";
