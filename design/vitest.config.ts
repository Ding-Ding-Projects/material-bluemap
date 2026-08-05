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

/**
 * `docs/*.md`, one level above the workspace root for the same reason `committedScreenshots`
 * is: `packages/ui/src/components/docs/docsContent.ts` bundles the articles with
 * `import.meta.glob`, and `docsContent.test.ts` proves that bundle complete by reading the same
 * directory again with `node:fs`. Both need the dev-server-style file allow-list opened for
 * `docs/` itself, not only for the screenshots inside it.
 */
const committedDocs = fileURLToPath(new URL("../docs", import.meta.url));

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
            allow: [workspaceRoot, committedScreenshots, committedDocs],
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

        /**
         * Two forks, pinned, rather than vitest's default of one-per-CPU-core.
         *
         * CI run 31034205010 (commit 623db68) failed `pnpm test:ci` on all three of
         * scripts/run-tests-ci.mjs's attempts with the identical shape every time: 515
         * test files passed (515), 7718 tests passed, and the sole failure was
         * `Error: [vitest-worker]: Timeout calling "onTaskUpdate"` - a worker's RPC call
         * reporting a task's state change getting no reply from the main process within
         * vitest's own hardcoded 60-second deadline (see the long comment atop
         * run-tests-ci.mjs; that deadline has no config knob in vitest 3.2.7). Three
         * consecutive misses on a suite where every single test kept passing mean the
         * wrapper's retry can never win: this is not an occasional flake anymore, it is
         * the shared runner's main thread losing the race against its own workers every
         * time the suite runs.
         *
         * `onTaskUpdate` is sent by every worker for every task-state change regardless
         * of which reporter is configured - it is the RPC channel underneath the
         * reporter, not the reporter's console output, so a quieter reporter (`dot`,
         * `basic`) would not have reduced how many of these calls exist. It could only
         * have trimmed the small amount of synchronous work the default reporter does on
         * the receiving end, and in a non-interactive CI run over 500+ files, vitest's
         * own `DefaultReporter` already disables its live summary and only prints one
         * line per passing file (`this.options.summary = false` when `!isTTY`, and
         * `renderSucceed` stays false once `specifications.length > 1`) - confirmed by
         * reading vitest's own bundled reporter and RPC source rather than assumed, so
         * there was very little chatter left to quiet. What is actually being reported
         * is ordinary contention: `pool` already defaults to `"forks"` in vitest 3.2.7,
         * and it already caps concurrency at `cpus - 1` - but that is still several
         * worker processes competing for the one main-process event loop's attention on
         * a shared, oversubscribed runner, and the main thread can fall behind by more
         * than 60 seconds under load severe enough that it never happens on a
         * developer's own machine.
         *
         * The first attempt at a fix here was `poolOptions.forks.singleFork: true` - one
         * worker talking to the main process over one channel, matching a separate,
         * earlier finding in this project that the same setting made a different class of
         * mass-contention failure vanish. Run against this suite's *current* size it is
         * actively dangerous rather than merely slow: a full local run of all 516 files
         * with `singleFork: true` got 432 files in (about the `packages/ui` component
         * tests, which mount real Vue components under jsdom) and then crashed the one
         * and only worker with `FATAL ERROR: Ineffective mark-compacts near heap limit -
         * JavaScript heap out of memory` around a 4 GB heap - proven with vitest's own
         * `--reporter=basic` output and the V8 heap-stats lines it printed on the way
         * down, not assumed from the change alone. A suite this size does not fit in one
         * long-lived process's heap without ever handing memory back, which one worker
         * processing every file in sequence guarantees; that is a strictly worse failure
         * than the timeout it was meant to fix, and it very likely reproduces on CI's
         * smaller runner too; that path was abandoned rather than shipped.
         *
         * `maxForks`/`minForks: 2`, pinned rather than left to vitest's `cpus - 1`
         * default, keeps the fix's actual idea - fewer worker processes contending for
         * the coordinator's attention than the default gives it - while dividing the
         * suite's memory footprint across two long-lived processes instead of
         * concentrating all of it in one, which is what made `singleFork` unsafe. Two is
         * deliberately still more than one: real parallelism stays, so this is not a
         * regression to a serial suite, and it recycles memory the same way the default
         * already does, just with fewer processes splitting the same file set. Splitting
         * the run into CI-level shards was the other real option; it was not taken here
         * because it needs restructuring `.github/workflows/ci.yml`'s `check` job to fan
         * out and reconverge, a materially bigger and riskier change than this one for a
         * suite that is not failing on wall-clock time.
         *
         * Every test still runs, and every file is still verified - only how many OS
         * processes divide that work changes. run-tests-ci.mjs's retry stays in place as
         * a safety net for whatever residual timing flake a shared runner can still
         * produce; it was already correct to retry only this exact signature and to
         * propagate any real test failure immediately.
         */
        pool: "forks",
        poolOptions: {
            forks: {
                maxForks: 2,
                minForks: 2,
            },
        },
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
