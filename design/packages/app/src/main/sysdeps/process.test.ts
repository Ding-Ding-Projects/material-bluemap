import { describe, expect, it } from "vitest";
import { spawnProcessRunner } from "./process.js";

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
