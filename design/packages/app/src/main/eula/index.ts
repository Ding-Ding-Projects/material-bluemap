/**
 * Mojang's EULA, fetched and cached so it can be read inside the application.
 *
 * The consent record in `main/consent.ts` has always stored *which document* was
 * accepted. This folder is what makes that address useful to a person: the document is
 * downloaded from it, the readable text is extracted, the copy is kept in the app's data
 * directory with the time it was fetched, and every one of those facts crosses to the
 * window so the viewer can state which of them it is showing.
 *
 * `consent.ts` is not modified by any of this and is not re-implemented here. It remains
 * the only place the answer lives; this is only the document that answer is about.
 */

export { readCachedEula, writeCachedEula, eulaCacheFile, EULA_CACHE_VERSION } from "./cache.js";
export type { CachedEula } from "./cache.js";

export {
    CACHE_MAX_AGE_MS,
    FETCH_TIMEOUT_MS,
    MAX_RESPONSE_BYTES,
    loadEulaDocument,
} from "./document.js";
export type { EulaDocumentReadout, EulaLoadResult, EulaSource, FetchLike, LoadEulaOptions } from "./document.js";

export { EULA_CHANNELS, registerEulaHandlers } from "./ipc.js";
export type { EulaIpc, EulaIpcOptions, EulaRequest } from "./ipc.js";

export {
    MINIMUM_PLAUSIBLE_LENGTH,
    REQUIRED_PHRASES,
    decodeEntities,
    extractDocumentText,
    looksLikeTheEula,
    normaliseWhitespace,
} from "./text.js";
export type { PlausibilityVerdict } from "./text.js";
