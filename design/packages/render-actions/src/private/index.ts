/**
 * Rendering a world that lives in a private repository, on a public runner.
 *
 * The arrangement: private Actions minutes are expensive and public ones are free, so
 * the rendering happens on the public side while the world and the map it becomes stay
 * encrypted everywhere the public side can see them. `crypto.ts` is the encryption,
 * `ids.ts` makes sure the names give nothing away, and `payload.ts` is the transport -
 * release assets on the private repository rather than Actions artifacts, for reasons
 * set out there and in `docs/private-world-rendering.md`.
 *
 * The trust boundary is described honestly in that document, including the part that
 * cannot be engineered away: while a job runs, the decrypted world is on somebody
 * else's machine.
 */

export {
    IV_BYTES,
    KEY_BYTES,
    PrivateCryptoError,
    TAG_BYTES,
    generateKey,
    keyFromEnvironment,
    parseKey,
    seal,
    unseal,
    type PrivateCryptoFailureCode,
} from "./crypto.js";

export {
    assetPattern,
    deriveProjectId,
    manifestAssetName,
    partAssetName,
    stagingTag,
} from "./ids.js";

export {
    PRIVATE_PART_BYTES,
    PrivatePayloadError,
    isPrivateTransportError,
    manifestAad,
    openPayload,
    partAad,
    readManifest,
    sealPayload,
    type OpenOptions,
    type OpenReport,
    type PartRecord,
    type PayloadFailureCode,
    type PayloadManifest,
    type SealOptions,
    type SealReport,
} from "./payload.js";
