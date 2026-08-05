/**
 * The remote-hosting channel between the main process and the interface.
 *
 * A sibling of `ipc.ts`, in its own file rather than added to that one, so the two features
 * can be worked on independently without one edit colliding with the other. Built the same
 * way: Electron arrives as a *type*, `IpcMain` is a parameter, and every channel is named
 * once in {@link REMOTE_HOSTING_CHANNELS} so `dispose` cannot drift from `register`.
 *
 * **No handler here rejects.** A refused preflight, a host that never answers a published
 * port, and a hosting id nobody recognises are all answers a settings screen renders, not
 * exceptions it catches.
 *
 * `hosting:stop` performs the destructive action. It does not decide whether the person
 * meant it - that decision is the super-confirmation gate in the interface, before this
 * channel is ever called. See `RemoteHostingScreen.vue`.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import * as failures from "./failure.js";
import type { RemoteFailure } from "./failure.js";
import {
    RemoteHostingOrchestrator,
    type RemoteHostRequest,
    type RemoteHostResult,
    type RemoteHostStopResult,
    type RemoteHostingRecord,
} from "./hosting.js";
import { validateTarget, type PartialRemoteTarget } from "./target.js";

export const REMOTE_HOSTING_CHANNELS = [
    "hosting:start",
    "hosting:records",
    "hosting:record",
    "hosting:refresh",
    "hosting:stop",
] as const;

export interface RemoteHostingIpcOptions {
    readonly orchestrator?: RemoteHostingOrchestrator;
}

export interface RemoteHostingIpc {
    readonly orchestrator: RemoteHostingOrchestrator | null;
    dispose(): void;
}

const NOT_CONFIGURED: RemoteFailure = failures.invalidTarget(
    "Hosting a map on another machine is not configured in this build.",
);

export function registerRemoteHostingHandlers(
    ipcMain: IpcMain,
    options: RemoteHostingIpcOptions,
): RemoteHostingIpc {
    const orchestrator = options.orchestrator ?? null;

    ipcMain.handle(
        "hosting:start",
        async (_event: IpcMainInvokeEvent, value: unknown): Promise<RemoteHostResult> => {
            if (orchestrator === null) return { ok: false, hostingId: "", failure: NOT_CONFIGURED };
            const request = asRequest(value);
            if (request === null) {
                return {
                    ok: false,
                    hostingId: "",
                    failure: failures.invalidTarget(
                        "Hosting a map needs a target, a hosting id, a render, and at least one map.",
                    ),
                };
            }
            const checked = validateTarget(request.target);
            if (!checked.ok) return { ok: false, hostingId: request.hostingId, failure: checked.failure };
            try {
                return await orchestrator.host({ ...request.rest, target: checked.target } as RemoteHostRequest);
            } catch (error) {
                return {
                    ok: false,
                    hostingId: request.hostingId,
                    failure: failures.remoteCommandFailed(
                        checked.target.host,
                        "Hosting this map",
                        null,
                        describe(error),
                    ),
                };
            }
        },
    );

    ipcMain.handle(
        "hosting:records",
        async (): Promise<readonly RemoteHostingRecord[]> => (orchestrator === null ? [] : orchestrator.records()),
    );

    ipcMain.handle(
        "hosting:record",
        async (_event: IpcMainInvokeEvent, hostingId: unknown): Promise<RemoteHostingRecord | null> =>
            orchestrator === null || typeof hostingId !== "string" ? null : orchestrator.readRecord(hostingId),
    );

    ipcMain.handle(
        "hosting:refresh",
        async (_event: IpcMainInvokeEvent, hostingId: unknown): Promise<RemoteHostingRecord | null> =>
            orchestrator === null || typeof hostingId !== "string" ? null : orchestrator.refresh(hostingId),
    );

    /**
     * Stops hosting a map. The interface is expected to have already run its own
     * super-confirmation gate before this is ever invoked - see this module's own top
     * comment - so nothing here asks a second time.
     */
    ipcMain.handle(
        "hosting:stop",
        async (_event: IpcMainInvokeEvent, hostingId: unknown): Promise<RemoteHostStopResult> => {
            if (orchestrator === null) return { ok: false, failure: NOT_CONFIGURED };
            if (typeof hostingId !== "string" || hostingId.length === 0) {
                return { ok: false, failure: failures.invalidTarget("A hosting id is required to stop it.") };
            }
            try {
                return await orchestrator.stopHosting(hostingId);
            } catch (error) {
                return {
                    ok: false,
                    failure: failures.remoteCommandFailed(hostingId, "Stopping the hosted map", null, describe(error)),
                };
            }
        },
    );

    return {
        orchestrator,
        dispose(): void {
            for (const channel of REMOTE_HOSTING_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

function asRequest(
    value: unknown,
): { readonly target: PartialRemoteTarget; readonly hostingId: string; readonly rest: Record<string, unknown> } | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const target = record["target"];
    const hostingId = record["hostingId"];
    const renderId = record["renderId"];
    const maps = record["maps"];
    const publish = record["publish"];
    if (typeof target !== "object" || target === null) return null;
    if (typeof hostingId !== "string" || hostingId.length === 0) return null;
    if (typeof renderId !== "string" || renderId.length === 0) return null;
    if (!Array.isArray(maps) || maps.length === 0) return null;
    if (typeof publish !== "object" || publish === null) return null;

    const rest = { ...record };
    delete rest["target"];
    return { target: target as PartialRemoteTarget, hostingId, rest };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
