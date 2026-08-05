import { build } from "esbuild";
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

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
 * The same problem hits `__dirname`/`__filename`: esbuild leaves a bundled CJS
 * module's own `__dirname` references untouched too, and a plain ESM bundle has
 * no such global either. `@bokuweb/zstd-wasm`'s node entry point (reached from
 * `@material-bluemap/engine`'s `Compression.ZSTD`, which real Linear-format region
 * files decompress through) locates its `.wasm` binary with
 * `readFile(resolve(__dirname, './zstd.wasm'))` at its own top level - so loading
 * it after this bundle previously threw `ReferenceError: __dirname is not
 * defined` before any decompression ran. Reproduced directly the same way as the
 * pngjs case above: bundling a two-line `console.log(__dirname)` snippet with
 * these exact esbuild options leaves `__dirname` untouched in the output, and
 * running the result as `.mjs` throws that exact ReferenceError.
 *
 * The banner below gives the bundle its own real `require`, built from
 * `createRequire(import.meta.url)`, so the shim's `typeof require !== "undefined"`
 * check is true and the call resolves through Node's actual module system - which
 * always knows how to resolve a built-in like "util" or "zlib" regardless of
 * which file's URL created the `require`. It also derives `__dirname`/`__filename`
 * from that same `import.meta.url`, which - because the whole bundle is one
 * module once esbuild is done with it - always points at the bundle's own output
 * directory (`dist/main/`), the same directory `copyZstdWasmAsset` below copies
 * `zstd.wasm` into. This fixes every CommonJS dependency's builtin `require()`
 * and every `__dirname`/`__filename` reference uniformly, not only pngjs's or
 * zstd-wasm's, without shipping anything outside the bundle. Verified by
 * reproducing the exact failures and the fixes against a real pngjs encode/decode
 * and a real zstd compress/decompress round-trip with these same esbuild options.
 */
export const nodeBuiltinRequireShimBanner =
    "import { createRequire as __mbmCreateRequire } from 'node:module';\n" +
    "import { fileURLToPath as __mbmFileURLToPath } from 'node:url';\n" +
    "import { dirname as __mbmDirname } from 'node:path';\n" +
    "const require = __mbmCreateRequire(import.meta.url);\n" +
    "const __filename = __mbmFileURLToPath(import.meta.url);\n" +
    "const __dirname = __mbmDirname(__filename);\n";

/**
 * Copies `@bokuweb/zstd-wasm`'s `.wasm` binary next to the bundle that will look
 * for it at `__dirname` (shimmed above to be that same directory).
 *
 * esbuild inlines a CommonJS dependency's *code* into the bundle, but it has no
 * idea a co-located binary asset that code reads from disk at runtime even
 * exists - `zstd.wasm` sits beside `@bokuweb/zstd-wasm`'s own `index.node.js` in
 * `node_modules`, and nothing about bundling that file's text copies its
 * neighbour. `electron-builder.config.cjs`'s `files: ["dist/**\/*", ...]` ships
 * whatever lands under `dist/`, so copying the wasm binary there is enough - no
 * `extraResources` entry needed.
 *
 * Resolved through `require.resolve` of the package's own root entry point
 * (the only subpath its `exports` field actually permits) rather than a
 * hand-built `node_modules/.pnpm/...` path, so this keeps working across pnpm
 * version bumps and store layout changes.
 */
export function copyZstdWasmAsset(destDir) {
    const require = createRequire(import.meta.url);
    const zstdEntry = require.resolve("@bokuweb/zstd-wasm");
    const zstdWasmSrc = join(dirname(zstdEntry), "zstd.wasm");
    mkdirSync(destDir, { recursive: true });
    cpSync(zstdWasmSrc, join(destDir, "zstd.wasm"));
}

async function main() {
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

    copyZstdWasmAsset("dist/main");

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
}

// Only run the real build when this file is executed directly (`node build.mjs`
// / `npm run build`), not when a test imports its exports to drive esbuild
// against a small throwaway entry point.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    await main();
}
