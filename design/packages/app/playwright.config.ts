import { defineConfig } from "@playwright/test";

/**
 * Electron screenshot and E2E harness. Kept separate from the vitest unit suite:
 * vitest owns `src/**\/*.test.ts`, playwright owns `test/*.spec.ts`, and the two
 * never collect each other's files.
 */
export default defineConfig({
    // Before the application is launched at all: refuse to photograph a build that is
    // older than the code. The renderer is built by `packages/ui`, not by `packages/app`,
    // so a Vue change plus an app rebuild produces captures of the previous interface -
    // silently, and with every test passing. See test/freshBundle.ts.
    globalSetup: "./test/freshBundle.ts",
    testDir: "./test",
    testMatch: /.*\.spec\.ts/,
    // Electron launches one app instance shared across the file, so parallelism
    // inside a file would race the same window.
    fullyParallel: false,
    workers: 1,
    // A capture that "passes" because it silently retried is not evidence.
    retries: 0,
    timeout: 120_000,
    reporter: [["list"]],
    use: {
        trace: "retain-on-failure",
    },
});
