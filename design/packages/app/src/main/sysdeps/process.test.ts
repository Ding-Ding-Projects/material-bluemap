import { describe, expect, it } from "vitest";
import { normalizeExitCode, spawnProcessRunner } from "./process.js";

/**
 * Exercises the real `spawn` path against `node` itself, rather than `winget` or
 * `choco` — the same "not a fake" reasoning as `java/probe.ts`'s `execFileRunner`,
 * except this suite proves the runner works at all rather than proving anything
 * about a package manager. Every other test in this directory injects a fake
 * `RunProcess` and never launches a real process.
 */
describe("spawnProcessRunner", () => {
    it("captures stdout and stderr lines in order, and the real exit code", async () => {
        const lines: Array<{ line: string; stream: string }> = [];
        const script =
            "console.log('one'); console.error('two'); console.log('three'); process.exit(7);";
        const result = await spawnProcessRunner({
            command: process.execPath,
            args: ["-e", script],
            onLine: (line, stream) => lines.push({ line, stream }),
        });

        expect(result.exitCode).toBe(7);
        expect(result.launchError).toBeNull();
        expect(result.timedOut).toBe(false);
        expect(result.aborted).toBe(false);
        expect(result.stdout.split("\n")).toEqual(["one", "three"]);
        expect(result.stderr.split("\n")).toEqual(["two"]);

        // stdout and stderr are two independent pipes, read by two independent
        // `readline` interfaces in process.ts, with no coordination between them.
        // Their relative interleaving depends on OS pipe buffering and scheduling,
        // not on anything this code controls, so it is genuinely non-deterministic
        // across platforms — this exact assertion passed on the machine it was
        // written on and failed on Linux CI. Do not assert cross-stream order here.
        // What the runner DOES guarantee, and what actually matters to a caller, is
        // asserted instead: every line arrives exactly once, correctly tagged with
        // its stream, and in the order it was written WITHIN that stream.
        expect(lines).toHaveLength(3);
        expect(lines.filter((entry) => entry.stream === "stdout")).toEqual([
            { line: "one", stream: "stdout" },
            { line: "three", stream: "stdout" },
        ]);
        expect(lines.filter((entry) => entry.stream === "stderr")).toEqual([
            { line: "two", stream: "stderr" },
        ]);
    });

    it("reports a launch error rather than throwing when the binary does not exist", async () => {
        const result = await spawnProcessRunner({
            command: "this-binary-does-not-exist-anywhere-1234",
            args: [],
        });
        expect(result.exitCode).toBeNull();
        expect(result.launchError).not.toBeNull();
    });

    it("kills the process and reports aborted when the signal fires mid-run", async () => {
        const controller = new AbortController();
        const script = "setTimeout(() => process.exit(0), 60000);";
        const resultPromise = spawnProcessRunner({
            command: process.execPath,
            args: ["-e", script],
            signal: controller.signal,
        });
        controller.abort();
        const result = await resultPromise;
        expect(result.aborted).toBe(true);
        expect(result.exitCode).not.toBe(0);
    });

    it("kills the process and reports timedOut when it runs past the deadline", async () => {
        const script = "setTimeout(() => process.exit(0), 60000);";
        const result = await spawnProcessRunner({
            command: process.execPath,
            args: ["-e", script],
            timeoutMs: 200,
        });
        expect(result.timedOut).toBe(true);
    }, 10_000);
});

/**
 * `normalizeExitCode` exists because Node's `close` event hands back a Windows
 * `GetExitCodeProcess` DWORD verbatim — unsigned — while vendor tools that use
 * HRESULT-shaped exit codes (winget's `APPINSTALLER_CLI_ERROR_*` family) document
 * those same bit patterns signed. These tests cover the ordinary cases the
 * conversion must leave alone, not just the large-value case it exists to fix —
 * see `winget.test.ts` for that half, exercised against the real documented
 * winget codes.
 */
describe("normalizeExitCode", () => {
    it("leaves a clean 0 exit unchanged", () => {
        expect(normalizeExitCode(0)).toBe(0);
    });

    it("leaves ordinary small positive codes unchanged", () => {
        expect(normalizeExitCode(1)).toBe(1);
        expect(normalizeExitCode(7)).toBe(7);
        expect(normalizeExitCode(255)).toBe(255);
    });

    it("leaves an already-signed negative code unchanged", () => {
        expect(normalizeExitCode(-1)).toBe(-1);
        expect(normalizeExitCode(-12345)).toBe(-12345);
    });

    it("passes null through untouched, rather than misreading a killed process as a clean exit", () => {
        // `null | 0` is `0` in JavaScript — if this function did not special-case
        // null explicitly, a process killed by a signal (which Node reports as a
        // null exit code) would silently normalise to "0 = success".
        expect(normalizeExitCode(null)).toBeNull();
    });

    it("reinterprets an unsigned 32-bit DWORD as the signed value it represents", () => {
        // 0xFFFFFFFF as an unsigned DWORD is -1 as a signed 32-bit integer — the
        // generic version of the exact reinterpretation winget's exit codes need.
        expect(normalizeExitCode(0xffffffff)).toBe(-1);
        // The high bit set, nothing else: the boundary between "still positive"
        // and "reads as negative" in two's complement 32-bit arithmetic.
        expect(normalizeExitCode(0x80000000)).toBe(-2147483648);
    });
});
