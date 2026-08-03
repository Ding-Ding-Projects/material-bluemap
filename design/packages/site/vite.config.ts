import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

/** The pnpm workspace root, `design/`, which is what Vite would allow on its own. */
const workspaceRoot = fileURLToPath(new URL("../../", import.meta.url));

/**
 * The capture PNGs committed at the top of the repository.
 *
 * `src/content/captures.ts` bundles them so the landing page has pictures in a fresh
 * clone, rather than depending on a workflow artifact that a clone does not have. They sit
 * above the workspace root, where the dev server's file-serving allow-list stops, so the
 * one directory is named here. The production build is unaffected either way; this is what
 * keeps `pnpm dev` able to serve them.
 */
const committedScreenshots = fileURLToPath(new URL("../../../docs/screenshots", import.meta.url));

/**
 * The site is served from https://ding-ding-projects.github.io/material-bluemap/, a project
 * subpath rather than a domain root. `base` has to carry that prefix or every emitted asset
 * URL points at the account root and 404s while the deploy itself stays green.
 */
export default defineConfig({
    base: "/material-bluemap/",
    server: {
        fs: {
            // Setting `allow` replaces the default rather than adding to it, so the
            // workspace root is restated alongside the one directory being opened.
            allow: [workspaceRoot, committedScreenshots],
        },
    },
    build: {
        target: "es2022",
        sourcemap: true,
        // Everything ships as a real file. Inlining assets as data URIs would bloat the
        // entry chunk that every visitor downloads, for images only 10% of loads ever show.
        assetsInlineLimit: 0,
    },
});
