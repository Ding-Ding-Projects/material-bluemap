import { defineConfig } from "@playwright/test";

/**
 * Electron screenshot and E2E harness. Kept separate from the vitest unit suite:
 * vitest owns `src/**\/*.test.ts`, playwright owns `test/*.spec.ts`, and the two
 * never collect each other's files.
 */
export default defineConfig({
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
