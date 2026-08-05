import { describe, expect, it } from "vitest";
import {
    checkChocolateyInstalled,
    detectChocolatey,
    installWithChocolatey,
    parseChocolateyProgress,
} from "./chocolatey.js";
import type { RunProcess, RunProcessOptions } from "./process.js";

function scripted(
    stdout: string,
    options: {
        readonly exitCode?: number | null;
        readonly stderr?: string;
        readonly aborted?: boolean;
        readonly launchError?: string | null;
    } = {},
): (invocationOptions: RunProcessOptions) => ReturnType<RunProcess> {
    return async (invocationOptions) => {
        for (const line of stdout.length > 0 ? stdout.split("\n") : []) {
            invocationOptions.onLine?.(line, "stdout");
        }
        return {
            exitCode: options.exitCode === undefined ? 0 : options.exitCode,
            stdout,
            stderr: options.stderr ?? "",
            aborted: options.aborted ?? false,
            timedOut: false,
            launchError: options.launchError ?? null,
        };
    };
}

describe("detectChocolatey", () => {
    it("is available when choco --version exits 0", async () => {
        const run = scripted("2.7.3");
        expect(await detectChocolatey(run)).toEqual({ available: true, version: "2.7.3" });
    });

    it("is unavailable when the launch fails", async () => {
        const run = scripted("", { launchError: "ENOENT", exitCode: null });
        expect(await detectChocolatey(run)).toEqual({ available: false, version: null });
    });
});

describe("checkChocolateyInstalled", () => {
    it("reports installed from the id|version line", async () => {
        const run = scripted("git|2.55.0.2");
        const result = await checkChocolateyInstalled(run, "git");
        expect(result).toEqual({ installed: true, version: "2.55.0.2" });
    });

    it("reports not installed on empty stdout, regardless of the (always-0) exit code", async () => {
        const run = scripted("0 packages installed.", { exitCode: 0 });
        const result = await checkChocolateyInstalled(run, "nobody-fake-package");
        expect(result).toEqual({ installed: false, version: null });
    });
});

describe("parseChocolateyProgress", () => {
    it("extracts a real, bounded percentage", () => {
        expect(parseChocolateyProgress("Progress: Downloading rsync 6.4.8... 42%")).toEqual({
            kind: "determinate",
            percent: 42,
        });
        expect(parseChocolateyProgress("Progress: Downloading rsync 6.4.8... 100%")).toEqual({
            kind: "determinate",
            percent: 100,
        });
    });

    it("returns null for a line that is not a progress line", () => {
        expect(parseChocolateyProgress("rsync v6.4.8 [Approved]")).toBeNull();
    });
});

describe("installWithChocolatey", () => {
    it("classifies a clean install as installed", async () => {
        const run = scripted("rsync v6.4.8 [Approved]\nrsync has been installed.", { exitCode: 0 });
        const outcome = await installWithChocolatey(run, "rsync");
        expect(outcome.kind).toBe("installed");
    });

    it("reports real progress ticks as they are parsed", async () => {
        const percentages: number[] = [];
        const run = scripted(
            "Progress: Downloading rsync 6.4.8... 5%\nProgress: Downloading rsync 6.4.8... 50%\nProgress: Downloading rsync 6.4.8... 100%\nrsync has been installed.",
            { exitCode: 0 },
        );
        await installWithChocolatey(run, "rsync", {
            onProgress: (progress) => {
                if (progress.kind === "determinate") percentages.push(progress.percent);
            },
        });
        expect(percentages).toEqual([5, 50, 100]);
    });

    it("folds Chocolatey's own already-installed warning into already-installed, not installed", async () => {
        const run = scripted("git v2.55.0.2 already installed. Use --force to reinstall.", {
            exitCode: 0,
        });
        const outcome = await installWithChocolatey(run, "git");
        expect(outcome.kind).toBe("already-installed");
    });

    it("classifies a package-not-found message even though the exit code is generic", async () => {
        const run = scripted("nobody-fake-package was not found with the source(s) listed.", {
            exitCode: 1,
        });
        const outcome = await installWithChocolatey(run, "nobody-fake-package");
        expect(outcome.kind).toBe("not-found");
    });

    it("classifies an elevation-shaped failure text as declined-elevation", async () => {
        const run = scripted(
            "ERROR: Access is denied. You are not running as administrator - the installation may fail.",
            { exitCode: 1 },
        );
        const outcome = await installWithChocolatey(run, "docker-cli");
        expect(outcome.kind).toBe("declined-elevation");
    });

    it("classifies network-looking failure text as a network failure", async () => {
        const run = scripted("", { stderr: "The operation has timed out", exitCode: 1 });
        const outcome = await installWithChocolatey(run, "rsync");
        expect(outcome.kind).toBe("network-failure");
    });

    it("carries the real exit code and output on a genuine unexplained failure", async () => {
        const run = scripted("Something chocolatey-specific and unexpected went wrong.", {
            exitCode: 1,
        });
        const outcome = await installWithChocolatey(run, "rsync");
        expect(outcome.kind).toBe("failed");
        expect(outcome.exitCode).toBe(1);
        expect(outcome.message).toContain("unexpected went wrong");
    });

    it("reports cancelled rather than failed when the run was aborted", async () => {
        const run = scripted("", { aborted: true, exitCode: null });
        const outcome = await installWithChocolatey(run, "rsync");
        expect(outcome.kind).toBe("cancelled");
    });
});
