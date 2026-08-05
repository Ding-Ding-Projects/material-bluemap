import { describe, expect, it } from "vitest";
import type { RunProcess, RunProcessOptions, ProcessRunResult } from "./process.js";
import { previewSysdeps } from "./preview.js";
import type { SysdepDescriptor } from "./types.js";

const DESCRIPTORS: readonly SysdepDescriptor[] = [
    {
        id: "git",
        displayName: "Git",
        route: "winget",
        primary: { manager: "winget", packageId: "Git.Git" },
        fallback: { manager: "chocolatey", packageId: "git" },
        elevation: "required",
        elevationDisclosure: "Git's installer needs administrator permission.",
        verify: { command: "git", args: ["--version"], outputPattern: /git version/i },
    },
    {
        id: "rsync",
        displayName: "rsync",
        route: "chocolatey",
        primary: { manager: "chocolatey", packageId: "rsync" },
        fallback: null,
        elevation: "unknown",
        elevationDisclosure: "Whether this needs administrator permission depends on this machine's Chocolatey setup.",
        verify: { command: "rsync", args: ["--version"], outputPattern: /rsync\s+version/i },
    },
];

function ok(stdout: string, exitCode = 0): ProcessRunResult {
    return { exitCode, stdout, stderr: "", aborted: false, timedOut: false, launchError: null };
}

interface Script {
    readonly match: (options: RunProcessOptions) => boolean;
    readonly respond: (options: RunProcessOptions) => ProcessRunResult;
}

function scriptedRunner(scripts: readonly Script[]): RunProcess {
    return async (options: RunProcessOptions): Promise<ProcessRunResult> => {
        const script = scripts.find((entry) => entry.match(options));
        if (script === undefined) throw new Error(`no script matched ${options.command} ${options.args.join(" ")}`);
        return script.respond(options);
    };
}

function argsInclude(options: RunProcessOptions, needle: string): boolean {
    return options.args.includes(needle);
}

describe("previewSysdeps", () => {
    it("reports the resolved route, elevation and current presence for each dependency, without installing anything", async () => {
        const calls: string[] = [];
        const run = scriptedRunner([
            {
                match: (o) => o.command === "winget" && o.args[0] === "--version",
                respond: (o) => {
                    calls.push(`${o.command} ${o.args.join(" ")}`);
                    return ok("v1.29.280");
                },
            },
            {
                match: (o) => o.command === "choco" && o.args[0] === "--version",
                respond: (o) => {
                    calls.push(`${o.command} ${o.args.join(" ")}`);
                    return ok("2.7.3");
                },
            },
            {
                match: (o) => o.command === "winget" && o.args[0] === "list" && argsInclude(o, "Git.Git"),
                respond: (o) => {
                    calls.push(`${o.command} ${o.args.join(" ")}`);
                    return ok("Name Id Version\nGit  Git.Git  2.55.0.2", 0);
                },
            },
            {
                match: (o) => o.command === "choco" && o.args[0] === "list" && argsInclude(o, "rsync"),
                respond: (o) => {
                    calls.push(`${o.command} ${o.args.join(" ")}`);
                    return ok("");
                },
            },
        ]);

        const rows = await previewSysdeps(run, DESCRIPTORS);

        expect(rows).toEqual([
            {
                id: "git",
                displayName: "Git",
                route: { kind: "package-manager", manager: "winget", packageId: "Git.Git" },
                elevation: "required",
                elevationDisclosure: "Git's installer needs administrator permission.",
                alreadyInstalled: true,
                installedVersion: "2.55.0.2",
            },
            {
                id: "rsync",
                displayName: "rsync",
                route: { kind: "package-manager", manager: "chocolatey", packageId: "rsync" },
                elevation: "unknown",
                elevationDisclosure:
                    "Whether this needs administrator permission depends on this machine's Chocolatey setup.",
                alreadyInstalled: false,
                installedVersion: null,
            },
        ]);
        expect(calls.some((call) => call.includes("install"))).toBe(false);
    });

    it("reports a dependency as unavailable when neither manager is on the machine", async () => {
        const run = scriptedRunner([{ match: (o) => o.args[0] === "--version", respond: () => ok("", -1) }]);

        const rows = await previewSysdeps(run, DESCRIPTORS);

        expect(rows[0]?.route).toEqual({
            kind: "unavailable",
            reason: "Neither winget nor chocolatey is available on this machine.",
        });
    });

    it("detects each manager exactly once for the whole table, not once per dependency", async () => {
        let wingetVersionCalls = 0;
        let chocoVersionCalls = 0;
        const run = scriptedRunner([
            {
                match: (o) => o.command === "winget" && o.args[0] === "--version",
                respond: () => {
                    wingetVersionCalls += 1;
                    return ok("v1.29.280");
                },
            },
            {
                match: (o) => o.command === "choco" && o.args[0] === "--version",
                respond: () => {
                    chocoVersionCalls += 1;
                    return ok("2.7.3");
                },
            },
            { match: (o) => o.args[0] === "list", respond: () => ok("") },
        ]);

        await previewSysdeps(run, DESCRIPTORS);

        expect(wingetVersionCalls).toBe(1);
        expect(chocoVersionCalls).toBe(1);
    });
});
