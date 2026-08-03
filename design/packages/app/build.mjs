import { build } from "esbuild";

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
