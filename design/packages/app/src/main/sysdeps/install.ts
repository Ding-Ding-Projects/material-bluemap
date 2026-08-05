/**
 * Installing a set of system dependencies through winget/Chocolatey, one button,
 * honest progress.
 *
 * This is the one operation the rest of the app talks to. It detects both
 * managers once per batch, picks the route per dependency from `registry.ts`,
 * skips what is already installed (after verifying it still actually runs),
 * discloses elevation before it happens, streams a structured event per line of
 * real progress, verifies every fresh install by running it, and turns every
 * real-world result — success, already there, declined elevation, not found, a
 * network failure, a batch cancelled halfway through — into a named
 * {@link SysdepOutcome} rather than an exception.
 *
 * Never suppresses, bypasses or auto-accepts a Windows elevation prompt: nothing
 * here does anything but call `winget`/`choco` the ordinary way and read what
 * they report. Never passes `--scope user` unless a future registry entry says
 * the manifest supports it — see `registry.ts`, where none currently do.
 */

import { installWithChocolatey } from "./chocolatey.js";
import {
    checkSysdepInstalled,
    detectPackageManagers,
    findSysdepDescriptor,
    resolveSysdepRoute,
} from "./registry.js";
import type { RunProcess } from "./process.js";
import { installWithWinget, progressForWingetStage } from "./winget.js";
import { verifySysdep } from "./verify.js";
import { INDETERMINATE_PROGRESS, NO_PROGRESS } from "./types.js";
import type {
    SysdepBatchResult,
    SysdepInstallEvent,
    SysdepInstallStage,
    SysdepManagerId,
    SysdepOutcome,
    SysdepProgress,
} from "./types.js";

export interface InstallSysdepsOptions {
    readonly ids: readonly string[];
    /** Real spawn in production, a fake in every test — never optional, never guessed. */
    readonly runProcess: RunProcess;
    /** Fired for every phase change, including sub-second progress ticks. */
    readonly onEvent?: (event: SysdepInstallEvent) => void;
    /** Fired exactly once per dependency, the moment its final outcome is known. */
    readonly onOutcome?: (outcome: SysdepOutcome) => void;
    readonly signal?: AbortSignal;
}

function emit(
    options: InstallSysdepsOptions,
    dependency: string,
    manager: SysdepManagerId | null,
    stage: SysdepInstallStage,
    message: string,
    progress: SysdepProgress = NO_PROGRESS,
): void {
    options.onEvent?.({ dependency, manager, stage, message, progress });
}

/**
 * Installs every dependency in `options.ids`, in order, stopping new work the
 * moment cancellation is observed.
 *
 * "In order" rather than in parallel on purpose: two installers racing for the
 * same Windows elevation prompt is a worse experience than a visible queue, and
 * a queue is the only shape that can honestly report "these three finished
 * before you cancelled, this one did not start."
 */
export async function installSysdeps(options: InstallSysdepsOptions): Promise<SysdepBatchResult> {
    const run = options.runProcess;
    const outcomes: SysdepOutcome[] = [];
    let cancelled = false;

    const availability = await detectPackageManagers(run);

    function settle(outcome: SysdepOutcome): void {
        outcomes.push(outcome);
        options.onOutcome?.(outcome);
    }

    for (const id of options.ids) {
        if (cancelled || options.signal?.aborted === true) {
            cancelled = true;
            emit(options, id, null, "cancelled", `Cancelled before ${id} could start`);
            settle({ kind: "cancelled", dependency: id });
            continue;
        }

        const descriptor = findSysdepDescriptor(id);
        if (descriptor === null) {
            emit(
                options,
                id,
                null,
                "skipped",
                `"${id}" is not a dependency this installer knows about`,
            );
            settle({ kind: "unsupported", dependency: id, message: `Unknown dependency "${id}".` });
            continue;
        }

        emit(options, id, null, "queued", `Waiting to install ${descriptor.displayName}`);

        const route = resolveSysdepRoute(descriptor, availability);
        if (route.kind !== "package-manager") {
            emit(options, id, null, "skipped", route.reason);
            settle({ kind: "unsupported", dependency: id, message: route.reason });
            continue;
        }

        emit(
            options,
            id,
            route.manager,
            "checking-existing",
            `Checking whether ${descriptor.displayName} is already installed`,
        );
        const presence = await checkSysdepInstalled(run, route);
        if (presence.installed) {
            emit(
                options,
                id,
                route.manager,
                "verifying",
                `Confirming the existing ${descriptor.displayName} actually runs`,
            );
            const verify = await verifySysdep(run, descriptor.verify);
            emit(
                options,
                id,
                route.manager,
                "done",
                verify.ok
                    ? `${descriptor.displayName} is already installed (${verify.output})`
                    : `${descriptor.displayName} is reported installed but did not run: ${verify.output}`,
            );
            settle({
                kind: "already-installed",
                dependency: id,
                manager: route.manager,
                verified: verify.ok,
                verifiedOutput: verify.output,
            });
            continue;
        }

        if (descriptor.elevation !== "none") {
            emit(options, id, route.manager, "elevation-notice", descriptor.elevationDisclosure);
        }

        emit(
            options,
            id,
            route.manager,
            "resolving",
            `Resolving ${descriptor.displayName} via ${route.manager === "winget" ? "winget" : "Chocolatey"}`,
        );

        const installOutcome =
            route.manager === "winget"
                ? await installWithWinget(run, route.packageId, {
                      ...(options.signal === undefined ? {} : { signal: options.signal }),
                      onLine: (stage, line) =>
                          emit(options, id, "winget", stage, line, progressForWingetStage(stage)),
                  })
                : await installWithChocolatey(run, route.packageId, {
                      ...(options.signal === undefined ? {} : { signal: options.signal }),
                      onProgress: (progress) =>
                          emit(
                              options,
                              id,
                              "chocolatey",
                              "downloading",
                              `Downloading ${descriptor.displayName}`,
                              progress,
                          ),
                  });

        switch (installOutcome.kind) {
            case "installed":
            case "already-installed": {
                emit(
                    options,
                    id,
                    route.manager,
                    "verifying",
                    `Confirming ${descriptor.displayName} runs`,
                );
                const verify = await verifySysdep(run, descriptor.verify);
                if (verify.ok) {
                    emit(
                        options,
                        id,
                        route.manager,
                        "done",
                        `${descriptor.displayName} is installed (${verify.output})`,
                    );
                    settle({
                        kind: installOutcome.kind,
                        dependency: id,
                        manager: route.manager,
                        verified: true,
                        verifiedOutput: verify.output,
                    });
                } else {
                    emit(
                        options,
                        id,
                        route.manager,
                        "failed",
                        `${route.manager} reported success but ${descriptor.displayName} did not run: ${verify.output}`,
                    );
                    settle({
                        kind: "verification-failed",
                        dependency: id,
                        manager: route.manager,
                        exitCode: installOutcome.exitCode,
                        message: verify.output,
                    });
                }
                break;
            }
            case "declined-elevation": {
                emit(
                    options,
                    id,
                    route.manager,
                    "failed",
                    `The administrator permission prompt for ${descriptor.displayName} was declined or refused.`,
                    INDETERMINATE_PROGRESS,
                );
                settle({
                    kind: "declined-elevation",
                    dependency: id,
                    manager: route.manager,
                    exitCode: installOutcome.exitCode,
                });
                break;
            }
            case "not-found": {
                emit(
                    options,
                    id,
                    route.manager,
                    "failed",
                    `${route.manager} could not find "${route.packageId}".`,
                );
                settle({
                    kind: "not-found",
                    dependency: id,
                    manager: route.manager,
                    packageId: route.packageId,
                });
                break;
            }
            case "network-failure": {
                emit(
                    options,
                    id,
                    route.manager,
                    "failed",
                    `A network problem stopped ${descriptor.displayName} installing: ${installOutcome.message}`,
                );
                settle({
                    kind: "network-failure",
                    dependency: id,
                    manager: route.manager,
                    message: installOutcome.message,
                });
                break;
            }
            case "cancelled": {
                cancelled = true;
                emit(
                    options,
                    id,
                    route.manager,
                    "cancelled",
                    `${descriptor.displayName} was cancelled partway through.`,
                );
                settle({ kind: "cancelled", dependency: id });
                break;
            }
            case "failed": {
                emit(
                    options,
                    id,
                    route.manager,
                    "failed",
                    installOutcome.message || `${route.manager} reported a failure with no output.`,
                );
                settle({
                    kind: "failed",
                    dependency: id,
                    manager: route.manager,
                    exitCode: installOutcome.exitCode,
                    message: installOutcome.message,
                });
                break;
            }
        }
    }

    return { outcomes, cancelled };
}
