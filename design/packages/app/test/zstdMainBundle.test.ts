/**
 * Regression test for the main process's zstd-wasm crash.
 *
 * `Compression.ZSTD` (packages/engine/src/storage/compression/Compression.ts) is backed
 * by `@bokuweb/zstd-wasm`, whose node entry point locates its `.wasm` binary with
 * `readFile(resolve(__dirname, './zstd.wasm'))`. `build.mjs` bundles the main process to a
 * single ESM file with esbuild, which leaves a bundled CommonJS module's `__dirname`
 * references untouched - and plain ESM has no such global - so loading zstd previously threw
 * `ReferenceError: __dirname is not defined` before any decompression ran, and even if it
 * hadn't, the `.wasm` binary was never copied anywhere the bundle could find it.
 *
 * This exercises the exact bundling shape `build.mjs` produces for the real main process -
 * same esbuild options, same compat banner, same wasm-copy step - against a real
 * `@bokuweb/zstd-wasm` compress/decompress round trip, so a regression in either the banner
 * or the asset copy fails here instead of only inside a packaged app.
 *
 * The bundle is run with a genuine child `node` process, not a dynamic `import()` inside this
 * test file. Electron's real main process is plain Node/V8; this test file is not - it runs
 * under vitest's vite-node loader, which (unlike plain Node) quietly supplies its own
 * `__dirname`/`__filename` globals to every ESM module it executes for CommonJS
 * compatibility. Importing the bundle directly here would make the un-shimmed "old
 * behaviour" case pass for the wrong reason (vite-node's own shim papering over the exact
 * bug this test exists to catch) rather than genuinely reproducing the crash.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import { afterAll, describe, expect, it } from "vitest";

import { copyZstdWasmAsset, nodeBuiltinRequireShimBanner } from "../build.mjs";

const ROUND_TRIP_TEXT = "worldlens zstd main-process bundle regression test";

/**
 * The banner `build.mjs` shipped before this fix: a real `require`, but no `__dirname`/
 * `__filename`. Bundling with no banner at all fails earlier, on zstd-wasm's own
 * `require("fs/promises")` call, and never reaches the `__dirname` reference this test
 * exists to catch - this is what the main process actually ran.
 */
const preFixBannerWithoutDirnameShim =
    "import { createRequire as __mbmCreateRequire } from 'node:module';\n" +
    "const require = __mbmCreateRequire(import.meta.url);\n";

/** `packages/app/`, so esbuild resolves `@bokuweb/zstd-wasm` the same way build.mjs's real bundle does. */
const appPackageDir = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * Scratch output lives inside the workspace rather than the OS temp dir, purely so it sits
 * beside everything else this package writes to disk during a build. Gitignored; removed
 * again in `afterAll`.
 */
const scratchRoot = join(appPackageDir, "test", ".zstd-bundle-scratch");
mkdirSync(scratchRoot, { recursive: true });

interface BundleResult {
    /** Exit code of the child `node` process that ran the bundle. */
    status: number | null;
    stdout: string;
    stderr: string;
}

/**
 * Bundles a throwaway entry point that round-trips through `@bokuweb/zstd-wasm` exactly the
 * way `Compression.ZSTD.compress`/`.decompress` do, then runs the bundle in a fresh `node`
 * child process and reports what happened.
 */
async function runZstdRoundTripBundle(options: {
    workDir: string;
    outName: string;
    banner?: string;
    copyWasm?: boolean;
}): Promise<BundleResult> {
    const entry = join(options.workDir, `${options.outName}-entry.mjs`);
    writeFileSync(
        entry,
        [
            "import { init, compress, decompress } from '@bokuweb/zstd-wasm';",
            `const TEXT = ${JSON.stringify(ROUND_TRIP_TEXT)};`,
            "await init();",
            "const original = new TextEncoder().encode(TEXT);",
            "const compressed = compress(original, 3);",
            "const restored = decompress(compressed);",
            "process.stdout.write(new TextDecoder().decode(restored));",
            "",
        ].join("\n"),
    );

    const outfile = join(options.workDir, `${options.outName}.mjs`);
    await build({
        entryPoints: [entry],
        outfile,
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node22",
        banner: options.banner === undefined ? undefined : { js: options.banner },
        // The entry point lives in a scratch directory that is not itself a package, so
        // esbuild's own node_modules walk (which starts from each resolved file's real
        // location on disk, exactly like build.mjs's real bundling of
        // engine/src/storage/compression/Compression.ts) never reaches this package's
        // node_modules on its own. `nodePaths` is esbuild's NODE_PATH-style extra search
        // list for bare imports, and pointing it at packages/app/node_modules - where the
        // devDependency added alongside this fix links `@bokuweb/zstd-wasm` - closes that gap.
        nodePaths: [join(appPackageDir, "node_modules")],
    });

    if (options.copyWasm) {
        copyZstdWasmAsset(dirname(outfile));
    }

    try {
        const stdout = execFileSync(process.execPath, [outfile], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        });
        return { status: 0, stdout, stderr: "" };
    } catch (error) {
        const failure = error as { status: number | null; stdout: string; stderr: string };
        return { status: failure.status, stdout: failure.stdout, stderr: failure.stderr };
    }
}

describe("zstd-wasm through build.mjs's main-process bundle shape", () => {
    afterAll(() => {
        rmSync(scratchRoot, { recursive: true, force: true });
    });

    it("compresses and decompresses once the compat banner and wasm copy are applied", async () => {
        const workDir = mkdtempSync(join(scratchRoot, "fixed-"));
        const result = await runZstdRoundTripBundle({
            workDir,
            outName: "fixed",
            banner: nodeBuiltinRequireShimBanner,
            copyWasm: true,
        });

        expect(result.stderr).toBe("");
        expect(result.status).toBe(0);
        expect(result.stdout).toBe(ROUND_TRIP_TEXT);
    });

    it("reproduces the pre-fix ReferenceError when the bundle has no __dirname shim or shipped wasm asset", async () => {
        const workDir = mkdtempSync(join(scratchRoot, "noshim-"));
        // The original require-only banner and no wasm copy: exactly what the main-process
        // bundle looked like before this fix.
        const result = await runZstdRoundTripBundle({
            workDir,
            outName: "noshim",
            banner: preFixBannerWithoutDirnameShim,
        });

        // The exact wording Node uses for "a bundled CommonJS module's bare `__dirname`
        // reference doesn't work inside this ESM module" varies by Node version - some throw
        // `ReferenceError: __dirname is not defined`, others throw an ERR_AMBIGUOUS_MODULE_SYNTAX
        // ReferenceError that names `__dirname` explicitly instead. Both are the same underlying
        // defect this fix addresses, so match on what stays true across versions: it's a
        // ReferenceError, and it names `__dirname`.
        expect(result.status).not.toBe(0);
        expect(result.stderr).toMatch(/ReferenceError/);
        expect(result.stderr).toMatch(/__dirname/);
    });
});
