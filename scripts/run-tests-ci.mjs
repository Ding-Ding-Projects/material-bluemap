#!/usr/bin/env node
/**
 * `vitest run`, retried when - and only when - the sole failure is vitest's own
 * worker-to-main RPC heartbeat, not a real test failure.
 *
 * CI has been failing at ~6-7 minutes with every one of the 470+ test files and every
 * one of the 7000+ tests reported as passed, and the *only* thing that turns the exit
 * code non-zero is an "Unhandled Error: [vitest-worker]: Timeout calling
 * \"onTaskUpdate\"" - vitest's worker telling the main process it finished a task and
 * getting no acknowledgement back within the RPC layer's hardcoded 60-second deadline
 * (`DEFAULT_TIMEOUT` in vitest's own `chunks/index.*.js`; nothing in
 * `vitest.config.ts`, `poolOptions`, or an env var reaches it in vitest 3.2.7 - it is
 * not a configurable value). Cutting a roughly 47,000-line vue-i18n warning flood out
 * of the suite (a real, separate defect: tests intentionally mounting components with
 * an empty locale table, most of them without `missingWarn: false`) cut one CI run's
 * log from ~50,000 lines to ~1,700 and the timeout still fired - so the flood was a
 * genuine problem worth fixing on its own, but it was not the whole story. What is
 * left is ordinary contention on a shared, oversubscribed CI runner: the coordinator
 * is busy for a stretch longer than 60 seconds and one worker's heartbeat lands in
 * that gap. It reproduces locally under load, too - two different unrelated real
 * tests (a real SQLite purge, a real CLI e2e server) missed their own 30-second
 * timeouts on a busy dev machine in the same run that hit this.
 *
 * A test that is already reported "passed" did not fail because of this. So on
 * exactly this failure signature - the run reached a normal summary, no "Test Files"
 * or "Tests" line reports anything failed, and the only error is the RPC-timeout
 * unhandled error - this retries the whole `vitest run` from a clean process. Any
 * other failure shape (an actual failing test, a crash before a summary ever prints,
 * a build/collection error) is propagated immediately on the first attempt: this
 * script never gets a chance to hide a real red test behind a retry.
 *
 *   node scripts/run-tests-ci.mjs
 */

import { spawn } from "node:child_process";

const MAX_ATTEMPTS = 3;

/** vitest's own summary lines, ANSI codes stripped first so these stay plain regexes. */
const TEST_FILES_FAILED_RE = /Test Files\s+\d+\s+failed/;
const TESTS_FAILED_RE = /(?:^|\n)\s*Tests\s+\d+\s+failed/;
const TEST_FILES_PASSED_RE = /Test Files\s+\d+\s+passed/;
const RPC_TIMEOUT_RE = /\[vitest-worker\]:\s*Timeout calling/;

/** @param {string} text */
function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}

/** Runs `vitest run` once, streaming output live while also capturing it for analysis. */
function runOnce() {
    return new Promise((resolvePromise) => {
        const child = spawn("pnpm", ["exec", "vitest", "run"], {
            cwd: process.cwd(),
            shell: process.platform === "win32",
            env: process.env,
        });

        let combined = "";
        child.stdout.on("data", (chunk) => {
            process.stdout.write(chunk);
            combined += chunk.toString("utf8");
        });
        child.stderr.on("data", (chunk) => {
            process.stderr.write(chunk);
            combined += chunk.toString("utf8");
        });
        child.on("close", (code) => resolvePromise({ code, output: stripAnsi(combined) }));
        child.on("error", (err) => resolvePromise({ code: 1, output: String(err) }));
    });
}

/**
 * True only when the run reached vitest's own summary, that summary reports zero
 * failed files and zero failed tests, and the sole error is the worker RPC timeout.
 * Every condition is required - a run that never reaches a summary (a crash, a
 * collection error) reports false, and gets propagated rather than retried.
 */
function isKnownRpcHeartbeatFlakeOnly(output) {
    if (TEST_FILES_FAILED_RE.test(output)) return false;
    if (TESTS_FAILED_RE.test(output)) return false;
    if (!TEST_FILES_PASSED_RE.test(output)) return false;
    return RPC_TIMEOUT_RE.test(output);
}

async function main() {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
            console.log(
                `\n[run-tests-ci] Retry ${attempt}/${MAX_ATTEMPTS}: every test file and every ` +
                    "test passed last attempt; the only failure was vitest's own worker-to-main " +
                    'RPC heartbeat ("[vitest-worker]: Timeout calling ...", a hardcoded 60s ' +
                    "deadline with no config knob in this vitest version), not a real test " +
                    "failure. Running a clean attempt to confirm.\n",
            );
        }

        // Attempts are inherently sequential, so awaiting inside the loop is intentional.
        const { code, output } = await runOnce();
        if (code === 0) process.exit(0);

        if (!isKnownRpcHeartbeatFlakeOnly(output)) {
            console.error(
                `\n[run-tests-ci] vitest exited ${code}, and it is not the known worker-RPC-` +
                    "heartbeat flake - either a real test or file failure was reported, or the " +
                    "run never reached a normal summary. Not retrying.\n",
            );
            process.exit(code ?? 1);
        }
    }

    console.error(
        `\n[run-tests-ci] Hit the worker-RPC-heartbeat flake on all ${MAX_ATTEMPTS} attempts, ` +
            "with every test passing every time. That is no longer plausibly transient - " +
            "failing for real so it gets looked at rather than retried forever.\n",
    );
    process.exit(1);
}

main();
