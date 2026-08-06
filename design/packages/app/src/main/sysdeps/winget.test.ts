import { describe, expect, it } from "vitest";
import {
    WINGET_COMMAND_REQUIRES_ADMIN,
    WINGET_INSTALL_CANCELLED_BY_USER,
    WINGET_NO_APPLICATIONS_FOUND,
    WINGET_PACKAGE_ALREADY_INSTALLED,
    checkWingetInstalled,
    detectWinget,
    installWithWinget,
    parseWingetLine,
    progressForWingetStage,
} from "./winget.js";
import type { RunProcess, RunProcessOptions } from "./process.js";

/** A canned process result, replayed through `onLine` the way the real runner would. */
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
        const stderr = options.stderr ?? "";
        for (const line of stderr.length > 0 ? stderr.split("\n") : []) {
            invocationOptions.onLine?.(line, "stderr");
        }
        return {
            exitCode: options.exitCode === undefined ? 0 : options.exitCode,
            stdout,
            stderr,
            aborted: options.aborted ?? false,
            timedOut: false,
            launchError: options.launchError ?? null,
        };
    };
}

describe("detectWinget", () => {
    it("is available when winget --version exits 0 with a version string", async () => {
        const run = scripted("v1.29.280");
        const result = await detectWinget(run);
        expect(result).toEqual({ available: true, version: "v1.29.280" });
    });

    it("is unavailable when the launch itself fails", async () => {
        const run = scripted("", { launchError: "ENOENT", exitCode: null });
        const result = await detectWinget(run);
        expect(result).toEqual({ available: false, version: null });
    });

    it("is unavailable on a non-zero exit", async () => {
        const run = scripted("", { exitCode: 1 });
        const result = await detectWinget(run);
        expect(result).toEqual({ available: false, version: null });
    });
});

describe("checkWingetInstalled", () => {
    it("reports installed with a best-effort version parsed from the table", async () => {
        const table =
            "Name    Id       Version  Available  Source\n" +
            "Git     Git.Git  2.55.0.2            winget";
        const run = scripted(table, { exitCode: 0 });
        const result = await checkWingetInstalled(run, "Git.Git");
        expect(result.installed).toBe(true);
        expect(result.version).toBe("2.55.0.2");
    });

    it("reports not installed on the documented no-applications-found exit code", async () => {
        const run = scripted("No installed package found matching input criteria.", {
            exitCode: WINGET_NO_APPLICATIONS_FOUND,
        });
        const result = await checkWingetInstalled(run, "Nobody.Fake");
        expect(result).toEqual({ installed: false, version: null });
    });
});

describe("parseWingetLine", () => {
    it.each([
        ["Found GitHub CLI [GitHub.cli] Version 2.97.0", "resolving"],
        ["Downloading https://github.com/cli/cli/releases/download/v2.97.0/gh.msi", "downloading"],
        ["Successfully verified installer hash", "verifying"],
        ["Starting package install...", "installing"],
        ["Installer downloaded: C:\\temp\\gh.msi", "installing"],
        ["Successfully installed", "done"],
        ["This is not a recognised phase line", null],
    ])("%s -> %s", (line, expected) => {
        expect(parseWingetLine(line)).toBe(expected);
    });

    it("never claims a real percentage for any recognised stage", () => {
        for (const stage of [
            "resolving",
            "downloading",
            "verifying",
            "installing",
            "done",
        ] as const) {
            expect(progressForWingetStage(stage).kind).not.toBe("determinate");
        }
    });
});

describe("installWithWinget", () => {
    it("classifies a clean install as installed", async () => {
        const run = scripted("Found Git [Git.Git] Version 2.55.0.2\nSuccessfully installed", {
            exitCode: 0,
        });
        const outcome = await installWithWinget(run, "Git.Git");
        expect(outcome.kind).toBe("installed");
        expect(outcome.exitCode).toBe(0);
    });

    it("streams every recognised phase line to onLine as it is parsed", async () => {
        const stages: string[] = [];
        const run = scripted(
            "Found Git [Git.Git] Version 2.55.0.2\nDownloading https://example.invalid/git.exe\nSuccessfully installed",
        );
        await installWithWinget(run, "Git.Git", { onLine: (stage) => stages.push(stage) });
        expect(stages).toEqual(["resolving", "downloading", "done"]);
    });

    it("treats the already-installed exit code as a successful no-op", async () => {
        const run = scripted("Found at least one version of the package installed", {
            exitCode: WINGET_PACKAGE_ALREADY_INSTALLED,
        });
        const outcome = await installWithWinget(run, "Git.Git");
        expect(outcome.kind).toBe("already-installed");
    });

    it("treats the no-applications-found exit code as not-found", async () => {
        const run = scripted("No package found matching input criteria", {
            exitCode: WINGET_NO_APPLICATIONS_FOUND,
        });
        const outcome = await installWithWinget(run, "Nobody.Fake");
        expect(outcome.kind).toBe("not-found");
    });

    it("treats a declined UAC prompt as declined-elevation, not a crash", async () => {
        const run = scripted("You cancelled the installation.", {
            exitCode: WINGET_INSTALL_CANCELLED_BY_USER,
        });
        const outcome = await installWithWinget(run, "Docker.DockerDesktop");
        expect(outcome.kind).toBe("declined-elevation");
        expect(outcome.exitCode).toBe(WINGET_INSTALL_CANCELLED_BY_USER);
    });

    it("treats an outright admin refusal as declined-elevation", async () => {
        const run = scripted("This command requires administrator privileges.", {
            exitCode: WINGET_COMMAND_REQUIRES_ADMIN,
        });
        const outcome = await installWithWinget(run, "Docker.DockerDesktop");
        expect(outcome.kind).toBe("declined-elevation");
    });

    it("classifies unrecognised network-looking text as a network failure", async () => {
        const run = scripted("", {
            stderr: "Unable to connect to the remote server",
            exitCode: -1,
        });
        const outcome = await installWithWinget(run, "Git.Git");
        expect(outcome.kind).toBe("network-failure");
    });

    it("carries the real exit code and output on a genuine unexplained failure", async () => {
        const run = scripted("", { stderr: "Something unusual happened", exitCode: -12345 });
        const outcome = await installWithWinget(run, "Git.Git");
        expect(outcome.kind).toBe("failed");
        expect(outcome.exitCode).toBe(-12345);
        expect(outcome.message).toContain("Something unusual happened");
    });

    it("reports cancelled rather than failed when the run was aborted", async () => {
        const run = scripted("", { aborted: true, exitCode: null });
        const outcome = await installWithWinget(run, "Git.Git");
        expect(outcome.kind).toBe("cancelled");
    });

    it("reports a launch failure (winget itself missing) as failed with no exit code", async () => {
        const run = scripted("", { launchError: "ENOENT", exitCode: null });
        const outcome = await installWithWinget(run, "Git.Git");
        expect(outcome.kind).toBe("failed");
        expect(outcome.exitCode).toBeNull();
        expect(outcome.message).toBe("ENOENT");
    });

    // The four tests below feed the fake runner the exit code Node's `close`
    // event ACTUALLY delivers on Windows for these winget outcomes — the
    // unsigned 32-bit reading of the same HRESULT bit pattern the WINGET_*
    // constants above document signed (see `normalizeExitCode` in `process.ts`
    // for the full explanation). Measured live on a real machine:
    //   WINGET_PACKAGE_ALREADY_INSTALLED  -1978335135 signed == 2316632161 unsigned
    //   WINGET_NO_APPLICATIONS_FOUND      -1978335212 signed == 2316632084 unsigned
    //   WINGET_INSTALL_CANCELLED_BY_USER  -1978334964 signed == 2316632332 unsigned
    //   WINGET_COMMAND_REQUIRES_ADMIN     -1978335206 signed == 2316632090 unsigned
    // Every test above this one feeds the fake runner the signed constant
    // directly, which proves the branch logic but nothing about whether a real
    // spawned winget process's exit code would actually reach that branch — it
    // stubs the exact seam where this bug lived. Keep both sets: signed and
    // unsigned must map to the identical outcome, because that is the real
    // contract (`installWithWinget` has to work for a real Node runner AND for
    // an already-signed value produced by any other test double). Do not
    // delete these as "duplicates" of the signed-form tests above — they are
    // the ones that actually catch a regression of the sign bug.
    describe("installWithWinget — unsigned exit codes, as Node's close event delivers them", () => {
        it("treats the unsigned already-installed code as a successful no-op", async () => {
            const run = scripted("Found at least one version of the package installed", {
                exitCode: 2316632161,
            });
            const outcome = await installWithWinget(run, "Git.Git");
            expect(outcome.kind).toBe("already-installed");
            expect(outcome.exitCode).toBe(WINGET_PACKAGE_ALREADY_INSTALLED);
        });

        it("treats the unsigned no-applications-found code as not-found", async () => {
            const run = scripted("No package found matching input criteria", {
                exitCode: 2316632084,
            });
            const outcome = await installWithWinget(run, "Nobody.Fake");
            expect(outcome.kind).toBe("not-found");
            expect(outcome.exitCode).toBe(WINGET_NO_APPLICATIONS_FOUND);
        });

        it("treats the unsigned cancelled-by-user code as declined-elevation, not a crash", async () => {
            const run = scripted("You cancelled the installation.", {
                exitCode: 2316632332,
            });
            const outcome = await installWithWinget(run, "Docker.DockerDesktop");
            expect(outcome.kind).toBe("declined-elevation");
            expect(outcome.exitCode).toBe(WINGET_INSTALL_CANCELLED_BY_USER);
        });

        it("treats the unsigned requires-admin code as declined-elevation", async () => {
            const run = scripted("This command requires administrator privileges.", {
                exitCode: 2316632090,
            });
            const outcome = await installWithWinget(run, "Docker.DockerDesktop");
            expect(outcome.kind).toBe("declined-elevation");
            expect(outcome.exitCode).toBe(WINGET_COMMAND_REQUIRES_ADMIN);
        });
    });

    it("passes --scope user only when explicitly requested", async () => {
        let seenArgs: readonly string[] = [];
        const run: RunProcess = async (options) => {
            seenArgs = options.args;
            return {
                exitCode: 0,
                stdout: "",
                stderr: "",
                aborted: false,
                timedOut: false,
                launchError: null,
            };
        };
        await installWithWinget(run, "Git.Git", { userScope: true });
        expect(seenArgs).toContain("--scope");
        expect(seenArgs).toContain("user");
    });
});
