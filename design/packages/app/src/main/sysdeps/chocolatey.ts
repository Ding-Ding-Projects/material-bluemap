/**
 * Driving Chocolatey.
 *
 * Chocolatey is the more cooperative of the two managers for a real progress bar:
 * it emits genuine `Progress: Downloading <name> <version>... NN%` lines with
 * real, monotonically increasing percentages even when piped (confirmed live,
 * repeatedly, including under `--noop`), controlled by its `showDownloadProgress`
 * feature which is on by default. Where winget forces an indeterminate state,
 * Chocolatey earns a real bar.
 *
 * It is also the less structured one for outcomes: unlike winget, `choco` has no
 * dedicated exit code for "the user declined elevation" — a UAC decline inside a
 * wrapped installer just surfaces as the generic failure exit, diagnosable only
 * from the log text. `list`/`search` always exit `0` regardless of whether
 * anything matched, so presence is read from whether stdout is empty, never from
 * the exit code.
 */

import type { RunProcess } from "./process.js";
import type { SysdepProgress } from "./types.js";

export interface ChocolateyAvailability {
    readonly available: boolean;
    readonly version: string | null;
}

export async function detectChocolatey(run: RunProcess): Promise<ChocolateyAvailability> {
    const result = await run({ command: "choco", args: ["--version"] });
    if (result.launchError !== null || result.exitCode !== 0) {
        return { available: false, version: null };
    }
    const version = result.stdout.trim();
    return { available: version.length > 0, version: version.length > 0 ? version : null };
}

export interface ChocolateyPresence {
    readonly installed: boolean;
    readonly version: string | null;
}

/**
 * Whether `packageId` is already on the machine, per `choco list <id> --exact -r`.
 *
 * `-r`/`--limit-output` is the one place Chocolatey's text output is genuinely
 * machine-parseable: an installed package prints exactly `id|version` and an
 * absent one prints nothing, on stdout, every time — confirmed live both ways.
 * The exit code is not used for this: it is `0` either way.
 */
export async function checkChocolateyInstalled(
    run: RunProcess,
    packageId: string,
): Promise<ChocolateyPresence> {
    const result = await run({ command: "choco", args: ["list", packageId, "--exact", "-r"] });
    const line = result.stdout
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    if (line === undefined) return { installed: false, version: null };
    const [id, version] = line.split("|");
    if (id === undefined || id.toLowerCase() !== packageId.toLowerCase()) {
        return { installed: false, version: null };
    }
    return { installed: true, version: version ?? null };
}

const PROGRESS_LINE = /^Progress:\s+Downloading\s+.+?\.\.\.\s*(\d{1,3})%/i;

/** Extracts a real percentage from a Chocolatey progress line, or null if it is not one. */
export function parseChocolateyProgress(line: string): SysdepProgress | null {
    const match = PROGRESS_LINE.exec(line);
    if (match === null) return null;
    const raw = match[1];
    if (raw === undefined) return null;
    const percent = Math.min(100, Math.max(0, Number.parseInt(raw, 10)));
    return { kind: "determinate", percent };
}

export interface ChocolateyInstallOutcome {
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
const NOT_FOUND_PATTERN =
    /is not a recognized|unable to find package|no packages found|was not found/i;
const ALREADY_INSTALLED_PATTERN = /already installed/i;
const ELEVATION_PATTERN =
    /run(?:ning)? as (?:an )?administrator|access is denied|requires? admin|elevat/i;

/**
 * Runs `choco install` for one package and classifies the result.
 *
 * `-y` answers Chocolatey's own confirmation prompts (the package's licence and
 * source terms — Chocolatey's equivalent of winget's `--accept-*` flags, not a
 * substitute for a Windows elevation prompt). `--no-color` keeps the progress
 * regex simple. Download progress is left at its default (on) deliberately —
 * this is the one manager that reports it honestly.
 */
export async function installWithChocolatey(
    run: RunProcess,
    packageId: string,
    options: {
        readonly onProgress?: (progress: SysdepProgress) => void;
        readonly signal?: AbortSignal;
    } = {},
): Promise<ChocolateyInstallOutcome> {
    const result = await run({
        command: "choco",
        args: ["install", packageId, "-y", "--no-color"],
        onLine: (line) => {
            const progress = parseChocolateyProgress(line);
            if (progress !== null) options.onProgress?.(progress);
        },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });

    const combined = `${result.stdout}\n${result.stderr}`;

    if (result.aborted) {
        return { kind: "cancelled", exitCode: result.exitCode, message: combined.trim() };
    }
    if (result.launchError !== null) {
        return { kind: "failed", exitCode: null, message: result.launchError };
    }
    if (result.exitCode === 0) {
        if (ALREADY_INSTALLED_PATTERN.test(combined)) {
            return {
                kind: "already-installed",
                exitCode: result.exitCode,
                message: combined.trim(),
            };
        }
        return { kind: "installed", exitCode: result.exitCode, message: combined.trim() };
    }
    if (NOT_FOUND_PATTERN.test(combined)) {
        return { kind: "not-found", exitCode: result.exitCode, message: combined.trim() };
    }
    if (ELEVATION_PATTERN.test(combined)) {
        return { kind: "declined-elevation", exitCode: result.exitCode, message: combined.trim() };
    }
    if (NETWORK_FAILURE_PATTERN.test(combined)) {
        return { kind: "network-failure", exitCode: result.exitCode, message: combined.trim() };
    }
    return {
        kind: "failed",
        exitCode: result.exitCode,
        message: combined.trim() || "choco exited without output",
    };
}
