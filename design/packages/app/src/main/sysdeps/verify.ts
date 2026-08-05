/**
 * Confirming an installed tool actually runs, the same discipline `java/probe.ts`
 * applies to a discovered JVM: a package manager reporting a success exit code is
 * not proof the tool works, so every install here is followed by really running
 * it and reading what comes back, never trusted from the exit code alone.
 */

import type { RunProcess } from "./process.js";
import type { SysdepVerifyCommand } from "./types.js";

/** How long a verification run is given before it is treated as a failure. */
export const VERIFY_TIMEOUT_MS = 10_000;

export interface SysdepVerifyResult {
    readonly ok: boolean;
    /** Bounded, single-line output kept for the outcome message. */
    readonly output: string;
}

function firstLine(text: string, maxLength = 300): string {
    const line = text
        .split(/\r?\n/)
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);
    if (line === undefined) return "";
    return line.length > maxLength ? `${line.slice(0, maxLength - 1)}…` : line;
}

/** Runs `verify.command verify.args` and checks the output against `outputPattern`. */
export async function verifySysdep(
    run: RunProcess,
    verify: SysdepVerifyCommand,
): Promise<SysdepVerifyResult> {
    const result = await run({
        command: verify.command,
        args: verify.args,
        timeoutMs: VERIFY_TIMEOUT_MS,
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    if (result.launchError !== null) {
        return { ok: false, output: `could not be run (${result.launchError})` };
    }
    if (result.timedOut) {
        return { ok: false, output: "did not answer in time" };
    }
    if (!verify.outputPattern.test(combined)) {
        const noise = firstLine(combined);
        return {
            ok: false,
            output:
                noise.length === 0
                    ? "ran but printed no recognizable output"
                    : `ran but printed: ${noise}`,
        };
    }
    return { ok: true, output: firstLine(combined) };
}
