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
 * `@worldlens/engine`'s `Compression.ZSTD`, which real Linear-format region
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

/**
 * The repository a build with no CI signal and no explicit override names.
 *
 * Real - it is this project's actual repository today - so a plain `pnpm build` on a
 * workstation still produces something that would work if that build were ever installed,
 * rather than a placeholder that would silently fail to update. It is not used inside CI;
 * see the throw below for why that distinction matters.
 */
export const DEFAULT_REPOSITORY = "Ding-Ding-Projects/worldlens";
export const BUILD_REPOSITORY_VARIABLE = "WORLDLENS_BUILD_REPOSITORY";
export const LEGACY_BUILD_REPOSITORY_VARIABLE = "MATERIAL_BLUEMAP_BUILD_REPOSITORY";

/** What `resolveFeed` (main/update/feed.ts) itself accepts: `owner/repo`, nothing else. */
const REPOSITORY_PATTERN = /^[\w.-]+\/[\w.-]+$/;

/**
 * Which repository this build's shipped updater should ask - decided once, here, at bundle
 * time, and frozen into the bundle by esbuild's `define` in {@link main}.
 *
 * This cannot be read from `process.env` at *runtime* the way `packages/site/vite.config.ts`
 * reads `GITHUB_REPOSITORY` for the Pages base path: a site rebuilds and redeploys on every
 * push, but an installed Electron app is a binary sitting on someone's disk with no
 * `GITHUB_REPOSITORY` anywhere near it. Whatever this function returns during `node
 * build.mjs` is what every future launch of that binary asks, until the person reinstalls it
 * or sets `MATERIAL_BLUEMAP_UPDATE_FEED` (`src/main/update/feed.ts`'s `FEED_URL_VARIABLE`), the
 * runtime override that needs no rebuild and is exactly what a rename leans on.
 *
 * That permanence is exactly why this refuses rather than guesses. 114 installers already
 * shipped with the repository hardcoded as a string literal at the call site; a value that
 * is merely *wrong* here reproduces that exact defect one layer down, and does it silently -
 * a client asking a dead or wrong feed does not error, it just never hears about an update
 * again. So:
 *
 *  - An explicit `MATERIAL_BLUEMAP_BUILD_REPOSITORY` always wins, for a fork or a staging
 *    build that wants to publish somewhere other than where CI would guess.
 *  - Otherwise, GitHub Actions' own `GITHUB_REPOSITORY` is trusted, because every job GitHub
 *    runs sets it unconditionally - this is the same signal `vite.config.ts` and
 *    `scripts/shared.mjs` already use for the same "which repo published this" question.
 *  - Outside CI, with neither set, {@link DEFAULT_REPOSITORY} lets a local `pnpm build` /
 *    `pnpm run make` keep working the way it always did.
 *  - **Inside CI** (`CI` or `GITHUB_ACTIONS` is set) **with `GITHUB_REPOSITORY` missing or
 *    malformed, this throws instead of falling back.** GitHub Actions setting that variable
 *    is not optional, so its absence there means something is wrong with the job - a
 *    workflow that scrubs the environment, a runner outside GitHub's own infrastructure - and
 *    the fallback would be a wrong value baked into a real release rather than a convenience
 *    for a developer's laptop. A build that cannot determine its repository says so at build
 *    time, in a log a release fails loudly on, instead of shipping a binary that asks the
 *    wrong address forever.
 */
export function resolveBuildRepository(env) {
    const current = env[BUILD_REPOSITORY_VARIABLE]?.trim();
    const legacy = env[LEGACY_BUILD_REPOSITORY_VARIABLE]?.trim();
    const explicit = current || legacy;
    if (explicit !== undefined && explicit !== "") {
        if (!REPOSITORY_PATTERN.test(explicit)) {
            throw new Error(
                `${current ? BUILD_REPOSITORY_VARIABLE : LEGACY_BUILD_REPOSITORY_VARIABLE}="${explicit}" is not a well-formed "owner/repo" value, so ` +
                    "the bundle cannot be given it as the update feed's repository.",
            );
        }
        return explicit;
    }

    const fromCi = env["GITHUB_REPOSITORY"]?.trim();
    if (fromCi !== undefined && fromCi !== "") {
        if (!REPOSITORY_PATTERN.test(fromCi)) {
            throw new Error(
                `GITHUB_REPOSITORY="${fromCi}" is not a well-formed "owner/repo" value, so the bundle cannot be ` +
                    "given it as the update feed's repository. This is what GitHub Actions itself set - report it " +
                    "as a workflow bug rather than working around it here.",
            );
        }
        return fromCi;
    }

    if (env["GITHUB_ACTIONS"] === "true" || env["CI"] === "true") {
        throw new Error(
            "This build is running inside CI (CI or GITHUB_ACTIONS is set) but GITHUB_REPOSITORY is missing or " +
                "empty, so there is no way to know which repository this build's shipped update feed should ask. " +
                `Refusing to fall back to ${DEFAULT_REPOSITORY}: a wrong repository baked into a real release is ` +
                "invisible until an update silently stops arriving, which is exactly the failure this check " +
                "exists to catch. Set GITHUB_REPOSITORY (GitHub Actions does this automatically for every job) " +
                `or ${BUILD_REPOSITORY_VARIABLE} explicitly, then rebuild.`,
        );
    }

    return DEFAULT_REPOSITORY;
}

async function main() {
    const repository = resolveBuildRepository(process.env);
    if (
        !process.env[BUILD_REPOSITORY_VARIABLE]?.trim() &&
        process.env[LEGACY_BUILD_REPOSITORY_VARIABLE]?.trim()
    ) {
        console.warn(
            `app build: ${LEGACY_BUILD_REPOSITORY_VARIABLE} is deprecated; use ${BUILD_REPOSITORY_VARIABLE}.`,
        );
    }
    console.log(`app build: update feed repository = ${repository}`);

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
        // Textual substitution: every occurrence of this identifier in the bundled source
        // becomes this JSON string literal. `src/main/globals.d.ts` declares the identifier
        // for TypeScript; `src/main/index.ts` is the only place that reads it.
        define: { __WORLDLENS_REPOSITORY__: JSON.stringify(repository) },
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
