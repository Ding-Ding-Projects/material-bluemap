import { fileURLToPath } from "node:url";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

/** This directory, `design/`, which is also the pnpm workspace root. */
const workspaceRoot = fileURLToPath(new URL(".", import.meta.url));

/**
 * The capture PNGs committed at the top of the repository.
 *
 * `packages/site` bundles them as ordinary assets so the landing page has pictures in a
 * fresh clone. They sit one level above the workspace root, and Vite's file-serving
 * allow-list stops at that root, so the transform pipeline refuses to read them without
 * being told. Naming the one directory rather than the whole repository keeps the opening
 * as small as the need.
 */
const committedScreenshots = fileURLToPath(new URL("../docs/screenshots", import.meta.url));

export default defineConfig({
    /**
     * Single-file components, so a test can mount one.
     *
     * Almost every test in this workspace is a Node-environment unit test over a plain
     * `.ts` module, and none of them need this. A few behaviours cannot be tested that
     * way at all, though: whether opening a settings surface at an anchor really moves
     * focus onto that row, whether a search really hides a section, whether a close
     * button really emits. Those are properties of the rendered component, and a test
     * that asserts them against a hand-rolled stand-in proves nothing about the thing
     * that ships. Vitest needs the SFC transform to compile the real one.
     *
     * Additive on purpose: the plugin only touches `.vue` files, so every existing test
     * runs exactly as before, and a test that wants a DOM opts into one per file with a
     * `@vitest-environment jsdom` docblock rather than the whole suite paying for it.
     */
    plugins: [vue()],
    server: {
        fs: {
            // Setting `allow` replaces the default rather than adding to it, so the
            // workspace root has to be restated here or every package stops resolving.
            allow: [workspaceRoot, committedScreenshots],
        },
    },
    test: {
        include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],

        /**
         * Vitest's default is five seconds, and this suite failed it three times in one
         * afternoon - the real-git history tests, then the archive test that writes and
         * hashes a megabyte - always on CI and never on a developer machine. None of them
         * were slow: they were competing with a dozen other workers for one shared runner's
         * disk, and five seconds is a bet on the hardware rather than a statement about
         * the code.
         *
         * Thirty seconds is still far below anything an actually-hung test would reach, so
         * a genuine hang is still reported as a hang rather than waited out. Tests that
         * really do need longer keep their own explicit timeout, which now reads as a
         * deliberate claim about that test instead of as a patch applied after CI found it.
         */
        testTimeout: 30_000,
        hookTimeout: 30_000,
        server: {
            deps: {
                /**
                 * Vuetify's published components carry side-effect `.css` imports beside
                 * each `.mjs`. Left external they are loaded by Node, which has no idea
                 * what a stylesheet is and refuses the whole module; processed by Vite
                 * they are handled and dropped. Only tests that actually import Vuetify
                 * are affected, and no test imports it without meaning to.
                 */
                inline: ["vuetify"],
            },
        },
    },
});
