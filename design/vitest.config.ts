import { fileURLToPath } from "node:url";

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
    server: {
        fs: {
            // Setting `allow` replaces the default rather than adding to it, so the
            // workspace root has to be restated here or every package stops resolving.
            allow: [workspaceRoot, committedScreenshots],
        },
    },
    test: {
        include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    },
});
