/**
 * The remote-render channel between the main process and the interface.
 *
 * Built like `runtime/ipc.ts`: Electron arrives as a *type*, `IpcMain` is a parameter, and
 * the import is erased at build time, so every channel below is exercised in tests with no
 * Electron runtime, no SSH client and no server. Every channel is named once in
 * {@link REMOTE_CHANNELS}, so `dispose` cannot drift from the registration.
 *
 * **No handler here rejects.** "Cannot reach the host", "Docker is not installed there" and
 * "that host key is not the one recorded" are all answers a settings screen has to render,
 * and each has a different fix. A rejection would arrive at the renderer as a bare `Error`
 * with a stack in it, and the screen would have to guess.
 *
 * Progress is broadcast on the **render** channel, not on one of this module's own. A
 * remote render appears in the same list, moves the same bar and is stopped by the same
 * button as a local one; a second event channel would mean a second list, and a render in
 * one of them would be a render the other could not see or cancel.
 *
 * ## What this channel will never carry
 *
 * A password, a passphrase, or the contents of a key. `remote:target` returns the stored
 * target as-is because there is nothing secret in one - a host, a port, a user name and the
 * *path* to a key - and {@link validateTarget} drops any field an older build or a hand-edited
 * settings file might have added. `remote:describe` exists so the interface can say out loud
 * what a render will send and what it will leave behind, before it is started.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { CommandRunner } from "../runtime/command.js";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";
import { trustHostKey, type HostKeyOffer } from "./hostkey.js";
import { RemoteRenderOrchestrator } from "./orchestrator.js";
import type { RemoteRenderRequest, RemoteRenderResult } from "./orchestrator.js";
import { preflight, type PreflightReport } from "./preflight.js";
import { describeTarget, validateTarget, type PartialRemoteTarget, type RemoteTarget } from "./target.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const REMOTE_CHANNELS = [
    "remote:validate",
    "remote:describe",
    "remote:preflight",
    "remote:trustHostKey",
    "remote:render",
    "remote:cancel",
    "remote:active",
] as const;

export type ValidateAnswer =
    | { readonly ok: true; readonly target: RemoteTarget; readonly summary: string }
    | { readonly ok: false; readonly message: string };

/**
 * What a remote render will and will not do with somebody's data, in words.
 *
 * Answered before anything runs, so the interface can put it in front of the person rather
 * than beside a log they read afterwards. A copy of a world sitting on a server is a fact
 * they are entitled to know in advance.
 */
export interface RemoteDisclosure {
    readonly target: string;
    readonly sends: readonly string[];
    readonly neverSends: readonly string[];
    readonly leavesBehind: string;
    readonly authentication: string;
}

export type TrustAnswer = { readonly ok: boolean; readonly message: string };

export interface RemoteIpcOptions {
    readonly orchestrator?: RemoteRenderOrchestrator;
    /** The app's own known_hosts. The only trust store this app ever writes to. */
    readonly knownHostsFile: string;
    readonly userKnownHostsFile?: string | null;
    readonly ssh?: string;
    readonly runner?: CommandRunner;
    /** Injected so a test can answer as any preflight state without a server. */
    readonly preflight?: typeof preflight;
    /** Injected so a test can prove a key is recorded without `ssh-keyscan`. */
    readonly trust?: typeof trustHostKey;
}

export interface RemoteIpc {
    readonly orchestrator: RemoteRenderOrchestrator | null;
    dispose(): void;
}

export function registerRemoteHandlers(ipcMain: IpcMain, options: RemoteIpcOptions): RemoteIpc {
    const orchestrator = options.orchestrator ?? null;
    const runPreflight = options.preflight ?? preflight;
    const recordKey = options.trust ?? trustHostKey;

    const hostKeyOptions = {
        knownHostsFile: options.knownHostsFile,
        ...(options.userKnownHostsFile === undefined
            ? {}
            : { userKnownHostsFile: options.userKnownHostsFile }),
        ...(options.runner === undefined ? {} : { runner: options.runner }),
    };

    ipcMain.handle(
        "remote:validate",
        (_event: IpcMainInvokeEvent, value: unknown): ValidateAnswer => {
            const checked = validateTarget(asPartial(value));
            return checked.ok
                ? { ok: true, target: checked.target, summary: describeTarget(checked.target) }
                : { ok: false, message: checked.failure.message };
        },
    );

    ipcMain.handle(
        "remote:describe",
        (_event: IpcMainInvokeEvent, value: unknown): RemoteDisclosure | { readonly ok: false; readonly message: string } => {
            const checked = validateTarget(asPartial(value));
            if (!checked.ok) return { ok: false, message: checked.failure.message };
            return disclosureFor(checked.target);
        },
    );

    ipcMain.handle(
        "remote:preflight",
        async (
            _event: IpcMainInvokeEvent,
            value: unknown,
            requiredBytes: unknown,
        ): Promise<PreflightReport> => {
            const checked = validateTarget(asPartial(value));
            if (!checked.ok) return refusedPreflight(checked.failure, "the target");
            try {
                return await runPreflight(checked.target, {
                    target: checked.target,
                    ...hostKeyOptions,
                    ...(options.ssh === undefined ? {} : { ssh: options.ssh }),
                    ...(typeof requiredBytes === "number" && Number.isFinite(requiredBytes)
                        ? { requiredBytes }
                        : {}),
                });
            } catch (error) {
                // The preflight promises not to reject and its own tests hold it to that.
                // This is the belt, so a settings row never receives a stack trace.
                return refusedPreflight(
                    failures.remoteCommandFailed(
                        describeTarget(checked.target),
                        "The preflight check",
                        null,
                        describe(error),
                    ),
                    describeTarget(checked.target),
                );
            }
        },
    );

    /**
     * Records a host key the person has looked at and accepted.
     *
     * The fingerprint is all that crosses. `hostkey.ts` re-scans and writes only a key it
     * has just been offered whose fingerprint matches - so this channel cannot be used to
     * put an arbitrary line into a trust store, which is what it would be if the key blob
     * itself came from the renderer.
     */
    ipcMain.handle(
        "remote:trustHostKey",
        async (
            _event: IpcMainInvokeEvent,
            value: unknown,
            fingerprint: unknown,
        ): Promise<TrustAnswer> => {
            const checked = validateTarget(asPartial(value));
            if (!checked.ok) return { ok: false, message: checked.failure.message };
            if (typeof fingerprint !== "string") {
                return { ok: false, message: "A host-key fingerprint is required." };
            }
            try {
                return await recordKey(checked.target, fingerprint, hostKeyOptions);
            } catch (error) {
                return { ok: false, message: describe(error) };
            }
        },
    );

    ipcMain.handle(
        "remote:render",
        async (_event: IpcMainInvokeEvent, value: unknown): Promise<RemoteRenderResult> => {
            if (orchestrator === null) {
                return {
                    ok: false,
                    renderId: "",
                    failure: failures.invalidTarget(
                        "Remote rendering is not configured in this build.",
                    ),
                };
            }
            const request = asRequest(value);
            if (request === null) {
                return {
                    ok: false,
                    renderId: "",
                    failure: failures.invalidTarget(
                        "A remote render needs a target and at least one map.",
                    ),
                };
            }
            const checked = validateTarget(request.target);
            if (!checked.ok) return { ok: false, renderId: "", failure: checked.failure };
            try {
                return await orchestrator.render({
                    ...request.render,
                    target: checked.target,
                } as RemoteRenderRequest);
            } catch (error) {
                return {
                    ok: false,
                    renderId: "",
                    failure: failures.remoteCommandFailed(
                        describeTarget(checked.target),
                        "The remote render",
                        null,
                        describe(error),
                    ),
                };
            }
        },
    );

    ipcMain.handle("remote:cancel", (_event: IpcMainInvokeEvent, renderId: unknown) =>
        typeof renderId === "string" && orchestrator !== null && orchestrator.cancel(renderId),
    );

    ipcMain.handle("remote:active", () => orchestrator?.activeRenderIds() ?? []);

    return {
        orchestrator,
        dispose(): void {
            for (const channel of REMOTE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/** The plain-language disclosure, built from the target rather than written by hand twice. */
export function disclosureFor(target: RemoteTarget): RemoteDisclosure {
    return {
        target: describeTarget(target),
        sends: [
            "The world folders of the maps in this render, copied whole.",
            "The BlueMap engine jar this app runs.",
            "A generated config file naming those maps and their dimensions.",
        ],
        neverSends: [
            "Any GitHub token or sign-in.",
            "Any private key. Authentication uses your SSH agent, or a key file that stays where it is.",
            "Any password. This app never asks for one and the SSH client is told to refuse one.",
            "Any other world, map or setting from this computer.",
        ],
        leavesBehind: target.keepRemoteFiles
            ? `${target.workDir}/<render id>/ is kept on ${target.host}, including a copy of the world. ` +
              "Turn off 'keep remote files' to have it removed when the render ends."
            : `Nothing. ${target.workDir}/<render id>/ is removed when the render ends, whether it ` +
              "succeeded, failed or was cancelled.",
        authentication:
            target.identityFile === null
                ? "Your SSH agent."
                : `The key at ${target.identityFile}, which is read by ssh and never by this app.`,
    };
}

/** A refusal, in the shape a preflight report has, so one renderer path handles both. */
function refusedPreflight(failure: RemoteFailure, target: string): PreflightReport {
    return {
        ok: false,
        target,
        checks: [{ stage: "ssh", ok: false, message: failure.message, detail: failure.detail }],
        failure,
        hostKeys: [] as readonly HostKeyOffer[],
        docker: null,
        freeBytes: null,
        workDir: null,
    };
}

function asPartial(value: unknown): PartialRemoteTarget {
    return typeof value === "object" && value !== null ? (value as PartialRemoteTarget) : {};
}

function asRequest(
    value: unknown,
): { readonly target: PartialRemoteTarget; readonly render: Record<string, unknown> } | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const target = record["target"];
    const maps = record["maps"];
    if (typeof target !== "object" || target === null) return null;
    if (!Array.isArray(maps) || maps.length === 0) return null;
    // The target is taken out and validated separately; everything else travels to the
    // orchestrator as the render request it already is.
    const render = { ...record };
    delete render["target"];
    return { target: target as PartialRemoteTarget, render };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
