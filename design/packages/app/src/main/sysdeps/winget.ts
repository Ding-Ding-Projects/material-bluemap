/**
 * Driving `winget`, the Windows Package Manager.
 *
 * Two facts from the live scout pass shape everything here:
 *
 * 1. **No machine-readable output exists in this CLI version.** `winget list`/`show`
 *    have no `--format`/`--json` flag, so presence has to come from exit codes and,
 *    where a number matters, from parsing the table text.
 * 2. **The animated progress bar disappears when stdout is not a real console.**
 *    A child process spawned by Electron/Node never has one, so a winget-driven
 *    install can only ever report phase changes here — never a percentage. Callers
 *    must not invent one; see `SysdepProgress` in `types.ts`.
 *
 * Exit codes are winget's own named constants (`doc/windows/package-manager/winget/
 * returnCodes.md` in the winget-cli source), reproduced from the scout's live and
 * documented findings rather than guessed at.
 */

import { normalizeExitCode } from "./process.js";
import type { RunProcess } from "./process.js";
import { INDETERMINATE_PROGRESS, NO_PROGRESS } from "./types.js";
import type { SysdepInstallStage, SysdepProgress } from "./types.js";

/** `0` — the operation completed. */
export const WINGET_SUCCESS = 0;
/** `APPINSTALLER_CLI_ERROR_NO_APPLICATIONS_FOUND` — a normal "not installed" answer. */
export const WINGET_NO_APPLICATIONS_FOUND = -1978335212;
/** `APPINSTALLER_CLI_ERROR_PACKAGE_ALREADY_INSTALLED` — a successful no-op. */
export const WINGET_PACKAGE_ALREADY_INSTALLED = -1978335135;
/** `APPINSTALLER_CLI_ERROR_INSTALL_CANCELLED_BY_USER` — the UAC/consent prompt was declined. */
export const WINGET_INSTALL_CANCELLED_BY_USER = -1978334964;
/** `APPINSTALLER_CLI_ERROR_COMMAND_REQUIRES_ADMIN` — refused outright, no prompt shown. */
export const WINGET_COMMAND_REQUIRES_ADMIN = -1978335206;

export interface WingetAvailability {
    readonly available: boolean;
    readonly version: string | null;
}

/**
 * Launches real `winget` and reads what actually came back.
 *
 * Deliberately not a PATH check: winget ships as a Windows App Execution Alias,
 * and the scout's findings flag a documented trap where that alias can resolve on
 * `PATH` while the App Installer package itself is not registered, launching the
 * Microsoft Store instead of winget. Only a real launch with real output proves
 * winget is actually there.
 */
export async function detectWinget(run: RunProcess): Promise<WingetAvailability> {
    const result = await run({ command: "winget", args: ["--version"] });
    if (result.launchError !== null || result.exitCode !== WINGET_SUCCESS) {
        return { available: false, version: null };
    }
    const version = result.stdout.trim();
    return { available: version.length > 0, version: version.length > 0 ? version : null };
}

export interface WingetPresence {
    readonly installed: boolean;
    /** Best-effort, parsed from the table text; null when it could not be found. */
    readonly version: string | null;
}

/**
 * Whether `packageId` is already on the machine, per `winget list --id … --exact`.
 *
 * The exit code alone answers the question — {@link WINGET_SUCCESS} means a row
 * was printed, {@link WINGET_NO_APPLICATIONS_FOUND} means none was. The version is
 * a bonus extracted from the one line containing the package id, on a
 * best-effort basis, because there is no structured field to read it from.
 */
export async function checkWingetInstalled(
    run: RunProcess,
    packageId: string,
): Promise<WingetPresence> {
    const result = await run({
        command: "winget",
        args: ["list", "--id", packageId, "--exact", "--disable-interactivity"],
    });
    if (result.exitCode !== WINGET_SUCCESS) {
        return { installed: false, version: null };
    }
    const row = result.stdout.split(/\r?\n/).find((line) => line.includes(packageId));
    if (row === undefined) return { installed: true, version: null };
    // Columns are whitespace-padded text, not delimited: "Name  Id  Version  ...".
    // Split on runs of 2+ spaces and take the token right after the id column.
    const columns = row
        .split(/\s{2,}/)
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);
    const idIndex = columns.indexOf(packageId);
    const version = idIndex >= 0 ? (columns[idIndex + 1] ?? null) : null;
    return { installed: true, version };
}

/** Parses one line of `winget install`/`download` output into a stage, if it says one. */
export function parseWingetLine(line: string): SysdepInstallStage | null {
    if (/^Found\s/.test(line)) return "resolving";
    if (/^Downloading\s/i.test(line)) return "downloading";
    if (/verified installer hash/i.test(line)) return "verifying";
    if (/^Starting package install/i.test(line)) return "installing";
    if (/^Installer downloaded/i.test(line)) return "installing";
    if (/successfully installed/i.test(line)) return "done";
    return null;
}

/** The progress a winget-parsed stage carries. Never determinate — see the module doc. */
export function progressForWingetStage(stage: SysdepInstallStage): SysdepProgress {
    return stage === "downloading" || stage === "installing" ? INDETERMINATE_PROGRESS : NO_PROGRESS;
}

export interface WingetInstallOutcome {
    readonly kind:
        | "installed"
        | "already-installed"
        | "declined-elevation"
        | "not-found"
        | "network-failure"
        | "cancelled"
        | "failed";
    readonly exitCode: number | null;
    readonly message: string;
}

const NETWORK_FAILURE_PATTERN =
    /unable to connect|could not be resolved|network is unreachable|timed out|no such host|dns/i;

/**
 * Runs `winget install` for one package and classifies the result.
 *
 * `--exact` pins the id, `--disable-interactivity` stops winget from prompting on
 * its own stdin (there is nobody there to answer), `--accept-package-agreements`
 * and `--accept-source-agreements` are winget's own consent flags for the
 * package's licence and the source's terms — separate from, and not a substitute
 * for, the Windows elevation prompt the underlying installer may still raise.
 * `--scope user` is passed only when the caller says the manifest supports it;
 * see `registry.ts` for why that is `false` for every dependency here today.
 */
export async function installWithWinget(
    run: RunProcess,
    packageId: string,
    options: {
        readonly userScope?: boolean;
        readonly onLine?: (stage: SysdepInstallStage, line: string) => void;
        readonly signal?: AbortSignal;
    } = {},
): Promise<WingetInstallOutcome> {
    const args = [
        "install",
        "--id",
        packageId,
        "--exact",
        "--disable-interactivity",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--no-upgrade",
    ];
    if (options.userScope === true) args.push("--scope", "user");

    let lastStage: SysdepInstallStage | null = null;
    const result = await run({
        command: "winget",
        args,
        onLine: (line) => {
            const stage = parseWingetLine(line);
            if (stage !== null) {
                lastStage = stage;
                options.onLine?.(stage, line);
            }
        },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const combined = `${result.stdout}\n${result.stderr}`;

    // Normalise once, at the boundary where the exit code enters from the process
    // runner, rather than re-deriving the unsigned/signed pair at every branch
    // below — see `normalizeExitCode` in `process.ts` for why this is needed at
    // all: Node hands back winget's HRESULT exit codes as unsigned 32-bit values,
    // not the signed form the `WINGET_*` constants above are documented in.
    const exitCode = normalizeExitCode(result.exitCode);

    if (result.aborted) {
        return { kind: "cancelled", exitCode, message: combined.trim() };
    }
    if (exitCode === WINGET_SUCCESS) {
        return { kind: "installed", exitCode, message: combined.trim() };
    }
    if (exitCode === WINGET_PACKAGE_ALREADY_INSTALLED) {
        return { kind: "already-installed", exitCode, message: combined.trim() };
    }
    if (exitCode === WINGET_NO_APPLICATIONS_FOUND) {
        return { kind: "not-found", exitCode, message: combined.trim() };
    }
    if (
        exitCode === WINGET_INSTALL_CANCELLED_BY_USER ||
        exitCode === WINGET_COMMAND_REQUIRES_ADMIN
    ) {
        return { kind: "declined-elevation", exitCode, message: combined.trim() };
    }
    if (result.launchError !== null) {
        return { kind: "failed", exitCode: null, message: result.launchError };
    }
    if (NETWORK_FAILURE_PATTERN.test(combined)) {
        return { kind: "network-failure", exitCode, message: combined.trim() };
    }
    void lastStage;
    return {
        kind: "failed",
        exitCode,
        message: combined.trim() || "winget exited without output",
    };
}
