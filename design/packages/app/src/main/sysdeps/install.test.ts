import { describe, expect, it } from "vitest";
import { installSysdeps } from "./install.js";
import type { RunProcess, RunProcessOptions, ProcessRunResult } from "./process.js";
import type { SysdepInstallEvent, SysdepOutcome } from "./types.js";

type Rule = {
    readonly match: (options: RunProcessOptions) => boolean;
    readonly result: (options: RunProcessOptions) => ProcessRunResult;
};

function key(options: RunProcessOptions): string {
    return `${options.command} ${options.args.join(" ")}`;
}

function commandStartsWith(prefix: string): (options: RunProcessOptions) => boolean {
    return (options) => key(options).startsWith(prefix);
}

function emitAndReturn(
    stdout: string,
    partial: Partial<ProcessRunResult> = {},
): (options: RunProcessOptions) => ProcessRunResult {
    return (options) => {
        for (const line of stdout.length > 0 ? stdout.split("\n") : [])
            options.onLine?.(line, "stdout");
        return {
            exitCode: 0,
            stdout,
            stderr: "",
            aborted: false,
            timedOut: false,
            launchError: null,
            ...partial,
        };
    };
}

function scenario(rules: readonly Rule[]): RunProcess {
    return async (options) => {
        const rule = rules.find((candidate) => candidate.match(options));
        if (rule === undefined) {
            throw new Error(`Unhandled command in test fake: ${key(options)}`);
        }
        return rule.result(options);
    };
}

/** Both managers present, nothing else stubbed - each test adds what its scenario needs. */
const BOTH_MANAGERS_PRESENT: readonly Rule[] = [
    { match: commandStartsWith("winget --version"), result: emitAndReturn("v1.29.280") },
    { match: commandStartsWith("choco --version"), result: emitAndReturn("2.7.3") },
];

describe("installSysdeps", () => {
    it("reports an already-installed, verified dependency without ever calling install", async () => {
        const calledInstall: string[] = [];
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id Git.Git"),
                result: emitAndReturn("Name  Id       Version\nGit   Git.Git  2.55.0.2"),
            },
            {
                match: commandStartsWith("winget install"),
                result: (options) => {
                    calledInstall.push(key(options));
                    return emitAndReturn("should not run")(options);
                },
            },
            {
                match: commandStartsWith("git --version"),
                result: emitAndReturn("git version 2.55.0.2.windows.1"),
            },
        ]);

        const result = await installSysdeps({ ids: ["git"], runProcess: run });

        expect(calledInstall).toEqual([]);
        expect(result.cancelled).toBe(false);
        expect(result.outcomes).toEqual([
            {
                kind: "already-installed",
                dependency: "git",
                manager: "winget",
                verified: true,
                verifiedOutput: expect.stringContaining("git version") as unknown as string,
            },
        ]);
    });

    it("installs a fresh dependency and verifies it actually runs afterward", async () => {
        const events: SysdepInstallEvent[] = [];
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id GitHub.cli"),
                result: emitAndReturn("No installed package found matching input criteria.", {
                    exitCode: -1978335212,
                }),
            },
            {
                match: commandStartsWith("winget install"),
                result: emitAndReturn(
                    "Found GitHub CLI [GitHub.cli] Version 2.97.0\nSuccessfully installed",
                ),
            },
            {
                match: commandStartsWith("gh --version"),
                result: emitAndReturn("gh version 2.97.0 (2026-01-01)"),
            },
        ]);

        const result = await installSysdeps({
            ids: ["githubCli"],
            runProcess: run,
            onEvent: (event) => events.push(event),
        });

        expect(result.outcomes).toHaveLength(1);
        const outcome = result.outcomes[0];
        expect(outcome?.kind).toBe("installed");
        if (outcome?.kind === "installed") {
            expect(outcome.verified).toBe(true);
            expect(outcome.manager).toBe("winget");
        }
        // The elevation disclosure fires before the install, not after.
        const elevationIndex = events.findIndex((event) => event.stage === "elevation-notice");
        const resolvingIndex = events.findIndex((event) => event.stage === "resolving");
        expect(elevationIndex).toBeGreaterThanOrEqual(0);
        expect(elevationIndex).toBeLessThan(resolvingIndex);
        // winget never gets a fabricated percentage - every progress event it drives stays honest.
        for (const event of events) {
            if (event.manager === "winget") expect(event.progress.kind).not.toBe("determinate");
        }
    });

    it("reports real, growing percentages for a Chocolatey-routed install", async () => {
        const percentages: number[] = [];
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            { match: commandStartsWith("choco list rsync"), result: emitAndReturn("") },
            {
                match: commandStartsWith("choco install rsync"),
                result: emitAndReturn(
                    "Progress: Downloading rsync 6.4.8... 10%\nProgress: Downloading rsync 6.4.8... 60%\nProgress: Downloading rsync 6.4.8... 100%\nrsync has been installed.",
                ),
            },
            {
                match: commandStartsWith("rsync --version"),
                result: emitAndReturn("rsync  version 6.4.8"),
            },
        ]);

        await installSysdeps({
            ids: ["rsync"],
            runProcess: run,
            onEvent: (event) => {
                if (event.progress.kind === "determinate") percentages.push(event.progress.percent);
            },
        });

        expect(percentages).toEqual([10, 60, 100]);
    });

    it("reports declined elevation as a named outcome, not a crash", async () => {
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id Docker.DockerDesktop"),
                result: emitAndReturn("", { exitCode: -1978335212 }),
            },
            {
                match: commandStartsWith("winget install"),
                result: emitAndReturn("You cancelled the installation.", { exitCode: -1978334964 }),
            },
        ]);

        const result = await installSysdeps({ ids: ["dockerDesktop"], runProcess: run });
        expect(result.outcomes).toEqual([
            {
                kind: "declined-elevation",
                dependency: "dockerDesktop",
                manager: "winget",
                exitCode: -1978334964,
            },
        ]);
        expect(result.cancelled).toBe(false);
    });

    it("reports a package the manager could not find as not-found", async () => {
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id Git.Git"),
                result: emitAndReturn("", { exitCode: -1978335212 }),
            },
            {
                match: commandStartsWith("winget install"),
                result: emitAndReturn("No package found matching input criteria.", {
                    exitCode: -1978335212,
                }),
            },
        ]);
        const result = await installSysdeps({ ids: ["git"], runProcess: run });
        expect(result.outcomes).toEqual([
            { kind: "not-found", dependency: "git", manager: "winget", packageId: "Git.Git" },
        ]);
    });

    it("reports a network problem with the real message, not a generic apology", async () => {
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id Git.Git"),
                result: emitAndReturn("", { exitCode: -1978335212 }),
            },
            {
                match: commandStartsWith("winget install"),
                result: emitAndReturn("", {
                    stderr: "Unable to connect to the network endpoint",
                    exitCode: -1,
                }),
            },
        ]);
        const result = await installSysdeps({ ids: ["git"], runProcess: run });
        const outcome = result.outcomes[0];
        expect(outcome?.kind).toBe("network-failure");
        if (outcome?.kind === "network-failure") {
            expect(outcome.message).toContain("Unable to connect");
        }
    });

    it("does not trust a success exit code: verification failure survives as its own outcome", async () => {
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id Git.Git"),
                result: emitAndReturn("", { exitCode: -1978335212 }),
            },
            {
                match: commandStartsWith("winget install"),
                result: emitAndReturn("Successfully installed", { exitCode: 0 }),
            },
            // Reported success by winget, but the executable still is not runnable.
            {
                match: commandStartsWith("git --version"),
                result: emitAndReturn("", { launchError: "spawn git ENOENT", exitCode: null }),
            },
        ]);
        const result = await installSysdeps({ ids: ["git"], runProcess: run });
        expect(result.outcomes).toEqual([
            {
                kind: "verification-failed",
                dependency: "git",
                manager: "winget",
                exitCode: 0,
                message: expect.stringContaining("ENOENT") as unknown as string,
            },
        ]);
    });

    it("leaves an honest partial state when the batch is cancelled mid-way", async () => {
        const run = scenario([
            ...BOTH_MANAGERS_PRESENT,
            {
                match: commandStartsWith("winget list --id Git.Git"),
                result: emitAndReturn("Git  Git.Git  2.55.0.2"),
            },
            {
                match: commandStartsWith("git --version"),
                result: emitAndReturn("git version 2.55.0.2"),
            },
        ]);
        const controller = new AbortController();
        const outcomes: SysdepOutcome[] = [];

        const result = await installSysdeps({
            ids: ["git", "githubCli", "dockerDesktop"],
            runProcess: run,
            signal: controller.signal,
            onOutcome: (outcome) => {
                outcomes.push(outcome);
                // Cancel the instant the first (already-installed) item finishes, before
                // the second item's own work starts.
                if (outcome.dependency === "git") controller.abort();
            },
        });

        expect(result.cancelled).toBe(true);
        expect(outcomes.map((outcome) => outcome.dependency)).toEqual([
            "git",
            "githubCli",
            "dockerDesktop",
        ]);
        expect(outcomes[0]?.kind).toBe("already-installed");
        expect(outcomes[1]?.kind).toBe("cancelled");
        expect(outcomes[2]?.kind).toBe("cancelled");
    });

    it("reports unsupported, not a crash, when no package manager is available", async () => {
        const run = scenario([
            {
                match: commandStartsWith("winget --version"),
                result: emitAndReturn("", { exitCode: null, launchError: "ENOENT" }),
            },
            {
                match: commandStartsWith("choco --version"),
                result: emitAndReturn("", { exitCode: null, launchError: "ENOENT" }),
            },
        ]);
        const result = await installSysdeps({ ids: ["git"], runProcess: run });
        expect(result.outcomes).toHaveLength(1);
        expect(result.outcomes[0]?.kind).toBe("unsupported");
    });

    it("reports an unknown dependency id as unsupported rather than throwing", async () => {
        const run = scenario(BOTH_MANAGERS_PRESENT);
        const result = await installSysdeps({ ids: ["not-a-real-dependency"], runProcess: run });
        expect(result.outcomes).toEqual([
            {
                kind: "unsupported",
                dependency: "not-a-real-dependency",
                message: expect.stringContaining("Unknown dependency") as unknown as string,
            },
        ]);
    });
});
