import { build } from "esbuild";

/**
 * esbuild bundles every dependency the main process reaches except `electron` -
 * including pngjs (engine's Texture/LowresTile/atlas code, reached on essentially
 * every render) and anything else transitively pulled in that is itself a
 * CommonJS package. A CommonJS module's own `require("util")`/`require("zlib")`/
 * etc. calls, wrapped by esbuild's `__commonJS` helper, are left as calls to
 * esbuild's `__require` runtime shim rather than converted to static imports -
 * that shim is `typeof require !== "undefined" ? require : (...) => throw`, and a
 * plain Node ESM module (which is what `format: "esm"` produces, and what
 * Electron's ESM main-process entry point runs as) has no global `require` at
 * all. Reproduced directly: bundling a two-line pngjs smoke test with these exact
 * esbuild options throws "Dynamic require of \"util\" is not supported" the
 * moment `pngjs/lib/png.js` is first required - before any PNG operation runs,
 * because `png.js` requires `util` unconditionally at its own top level. Adding
 * `pngjs` (or anything else that hits this) to `external` is the wrong fix here:
 * electron-builder.config.cjs ships `dist/**\/*` and explicitly excludes
 * `node_modules` - the whole design is a self-contained bundle with nothing to
 * resolve an external import against at runtime.
 *
 * The banner below gives the bundle its own real `require`, built from
 * `createRequire(import.meta.url)`, so the shim's `typeof require !== "undefined"`
 * check is true and the call resolves through Node's actual module system - which
 * always knows how to resolve a built-in like "util" or "zlib" regardless of
 * which file's URL created the `require`. This fixes every CommonJS dependency's
 * builtin `require()` uniformly, not only pngjs's, without shipping anything
 * outside the bundle. Verified by reproducing the exact failure and the fix
 * against a real pngjs encode/decode with these same esbuild options.
 */
const nodeBuiltinRequireShimBanner =
    "import { createRequire as __mbmCreateRequire } from 'node:module';\n" +
    "const require = __mbmCreateRequire(import.meta.url);\n";

/** Main process: ESM (Electron ≥28 supports ESM entry points). */
await build({
    entryPoints: ["src/main/index.ts"],
    outfile: "dist/main/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
    banner: { js: nodeBuiltinRequireShimBanner },
});

/** Preload: sandboxed preloads must be CommonJS. */
await build({
    entryPoints: ["src/preload/index.ts"],
    outfile: "dist/preload/index.cjs",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    sourcemap: true,
});

console.log("app build done");
