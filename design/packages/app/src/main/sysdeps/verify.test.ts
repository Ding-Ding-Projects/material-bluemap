import { describe, expect, it } from "vitest";
import { verifySysdep } from "./verify.js";
import type { RunProcess } from "./process.js";

function fakeRun(result: Partial<Awaited<ReturnType<RunProcess>>>): RunProcess {
    return async () => ({
        exitCode: 0,
        stdout: "",
        stderr: "",
        aborted: false,
        timedOut: false,
        launchError: null,
        ...result,
    });
}

describe("verifySysdep", () => {
    const verify = { command: "git", args: ["--version"], outputPattern: /git version/i };

    it("passes when the output matches the expected pattern", async () => {
        const run = fakeRun({ stdout: "git version 2.55.0.2.windows.1" });
        const result = await verifySysdep(run, verify);
        expect(result.ok).toBe(true);
        expect(result.output).toContain("git version");
    });

    it("fails when a package manager reported success but the tool does not run - the whole point", async () => {
        // This is the "trust nothing but running it" case the brief calls out by name:
        // exit 0 from the package manager proves nothing about whether the executable
        // is actually there, on PATH, and functional (a fresh install can need a shell
        // restart to pick up a PATH change, for instance).
        const run = fakeRun({ launchError: "spawn git ENOENT", exitCode: null });
        const result = await verifySysdep(run, verify);
        expect(result.ok).toBe(false);
        expect(result.output).toContain("ENOENT");
    });

    it("fails when the executable runs but prints something unrecognisable", async () => {
        const run = fakeRun({ stdout: "not actually git, surprise" });
        const result = await verifySysdep(run, verify);
        expect(result.ok).toBe(false);
        expect(result.output).toContain("not actually git");
    });

    it("fails when the process does not answer in time", async () => {
        const run = fakeRun({ timedOut: true, exitCode: null });
        const result = await verifySysdep(run, verify);
        expect(result.ok).toBe(false);
        expect(result.output).toBe("did not answer in time");
    });
});
