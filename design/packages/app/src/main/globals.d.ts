/**
 * Values `build.mjs` bakes into the main-process bundle with esbuild's `define`, rather than
 * anything read from `process.env` at runtime.
 *
 * The shipped binary never runs inside GitHub Actions, so anything the update feed needs to
 * know about *which* repository published it has to be decided once, at bundle time, and
 * frozen into the file esbuild writes. `resolveBuildRepository` in `build.mjs` is what
 * decides the value; this file only tells TypeScript the identifier exists, because a bare
 * `declare const` with no import or export makes this file ambient (script-scope, not a
 * module), and that is what leaves the identifier visible everywhere in this package without
 * an import - exactly like `packages/ui/src/bridge.d.ts` does for the preload bridge.
 *
 * `esbuild --define` is a textual substitution: every occurrence of this exact identifier in
 * the bundled source is replaced with the JSON string literal `resolveBuildRepository`
 * returned, before the file is written. Nothing here or in `build.mjs` makes it optional -
 * every build passes a value or throws - so a missing `define` entry would fail with an
 * esbuild "could not resolve" error rather than silently leaving this `undefined` at runtime.
 */
declare const __MATERIAL_BLUEMAP_REPOSITORY__: string;
