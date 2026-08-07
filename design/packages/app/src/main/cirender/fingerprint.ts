/**
 * The change detector, re-exported.
 *
 * The implementation moved to `@worldlens/render-actions`'s `world/fingerprint.ts`,
 * so the scheduled render workflow's cheap "did the world change" check and this
 * application's CI-render sync run the **exact same function** rather than two hand-rolled
 * ones drifting apart. This file exists only so every import already written against
 * `./fingerprint.js` inside `cirender/` keeps working unchanged - `sync.ts`, this folder's
 * own tests, and anything else in the desktop app.
 *
 * See `@worldlens/render-actions`'s `world/fingerprint.ts` for the full contract,
 * what it can miss, and why it is a change detector rather than a content digest.
 */
export {
    fingerprintWorld,
    isUnchanged,
    FingerprintError,
    WORLD_FINGERPRINT_VERSION,
    type WorldFingerprint,
} from "@worldlens/render-actions";
