/**
 * `@material-bluemap/parts` - shipping a file that is bigger than the transport allows.
 *
 * A GitHub release asset is capped at 2 GB. A rendered 20 GB world is tens of gigabytes
 * of tiles, and even a modest world archive goes past the cap, so oversized assets are
 * published as fixed-size parts beside a manifest and put back together by whatever
 * consumes them: the desktop application does it automatically after downloading, and
 * `node scripts/join-parts.mjs <manifest>` does it from a command line.
 *
 * Everything here streams. Nothing in this package ever holds a whole archive in memory,
 * because the archives it exists for do not fit in memory.
 */

export {
    DEFAULT_PART_SIZE,
    MIN_PART_SIZE,
    MAX_PART_SIZE,
    PART_SIZE_CHOICES,
    checkPartSize,
    GITHUB_ASSET_LIMIT,
    MANIFEST_SUFFIX,
    PARTS_MANIFEST_VERSION,
    PartsIntegrityError,
    PartsManifestError,
    fileNameFromManifestName,
    isManifestName,
    manifestNameFor,
    parseManifest,
    partNameFor,
    partOffsets,
} from "./manifest.js";
export type { PartRecord, PartsManifest } from "./manifest.js";

export { READ_CHUNK_BYTES, sha256File } from "./hash.js";

export { splitFile } from "./split.js";
export type { SplitOptions, SplitPerformed, SplitProgress, SplitResult, SplitSkipped } from "./split.js";

export { joinParts, readManifest } from "./join.js";
export type { JoinOptions, JoinProgress, JoinResult } from "./join.js";
