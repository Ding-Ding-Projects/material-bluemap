import { defineConfig } from "vite";

/**
 * The site is served from https://ding-ding-projects.github.io/material-bluemap/, a project
 * subpath rather than a domain root. `base` has to carry that prefix or every emitted asset
 * URL points at the account root and 404s while the deploy itself stays green.
 */
export default defineConfig({
    base: "/material-bluemap/",
    build: {
        target: "es2022",
        sourcemap: true,
        // Everything ships as a real file. Inlining assets as data URIs would bloat the
        // entry chunk that every visitor downloads, for images only 10% of loads ever show.
        assetsInlineLimit: 0,
    },
});
