/**
 * The SSH-world-source channel between the main process and the wizard.
 *
 * Sibling to `worldsource/ipc.ts`, not a replacement for it: that module fetches a world from
 * somebody else's GitHub release, and this one fetches a world from a machine the person
 * already owns, reachable over SSH - Linux or Windows. Built the same way as every other
 * channel set in this application: Electron arrives as a *type*, `IpcMain` is a parameter, and
 * every channel is named once in {@link WORLD_SOURCE_SSH_CHANNELS} so `dispose` cannot drift
 * from the registration.
 *
 * **No handler here rejects.** "That host did not answer", "that host key has changed" and
 * "that is not a Windows path" are all sentences a wizard step has to show, and a rejection
 * would arrive at the renderer as a bare `Error` with a stack in it.
 *
 * ## The guided shape
 *
 * A person configuring this does not know, and should not have to guess, whether their server
 * is Linux or Windows, or what its host key's fingerprint is. So the channels are ordered the
 * way the wizard actually walks them:
 *
 * 1. `validate` - is this a usable target at all, entirely offline;
 * 2. `detect` - connect, check the host key, and say which kind of host answered;
 * 3. `trustHostKey` - the one decision this module refuses to make silently, exactly as
 *    `remote/hostkey.ts` documents;
 * 4. `checkPath` - is the given remote path even shaped like a path on *that* host;
 * 5. `survey` / `diff` - the cheap change check, before anybody commits to a transfer;
 * 6. `fetch` / `cancel` / `active` - the transfer itself.
 *
 * Progress and the final result are broadcast through `onEvent`, on a channel of this
 * feature's own - see `sshFetcher.ts`'s doc comment for why that shape does not fit the
 * existing download channel.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import * as failures from "../remote/failure.js";
import type { RemoteFailure } from "../remote/failure.js";
import { trustHostKey, type HostKeyOffer, type HostKeyOptions } from "../remote/hostkey.js";
import { describeTarget, validateTarget, type PartialRemoteTarget, type RemoteTarget } from "../remote/target.js";
import {
    checkRemoteWorldPath,
    connectAndDetectHost,
    diffRemoteWorldSurveys,
    remoteWorldChanged,
    surveyRemoteWorld,
    type ConnectResult,
    type RemoteHostKind,
    type RemoteWorldChanges,
    type RemoteWorldEntry,
    type RemoteWorldPathCheck,
    type RemoteWorldSurvey,
} from "../remote/worldsource.js";
import { SshWorldSourceFetcher, type SshWorldSourceFetcherOptions, type SshWorldSourceRequest } from "./sshFetcher.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const WORLD_SOURCE_SSH_CHANNELS = [
    "worldsource:ssh:validate",
    "worldsource:ssh:detect",
    "worldsource:ssh:trustHostKey",
    "worldsource:ssh:checkPath",
    "worldsource:ssh:survey",
    "worldsource:ssh:diff",
    "worldsource:ssh:fetch",
    "worldsource:ssh:cancel",
    "worldsource:ssh:active",
] as const;

/**
 * Where `SshWorldSourceEvent` is broadcast - a channel of this feature's own, not the
 * download channel. See `sshFetcher.ts`'s doc comment for why the two shapes do not fit
 * together: a directory copy over `scp` or `rsync` has no parts, joining or extracting phase
 * to report, and forcing this into the download shape would mean phases that are always empty.
 */
export const WORLD_SOURCE_SSH_EVENT_CHANNEL = "worldsource:ssh:event";

export type SshValidateAnswer =
    | { readonly ok: true; readonly target: RemoteTarget; readonly summary: string }
    | { readonly ok: false; readonly message: string };

export type SshDetectAnswer =
    | { readonly ok: true; readonly kind: RemoteHostKind; readonly detail: string | null }
    | { readonly ok: false; readonly message: string; readonly hostKeys: readonly HostKeyOffer[] };

export type SshTrustAnswer = { readonly ok: boolean; readonly message: string };

export type SshSurveyAnswer =
    | { readonly ok: true; readonly kind: RemoteHostKind; readonly entries: readonly RemoteWorldEntry[] }
    | { readonly ok: false; readonly message: string };

export type SshFetchAnswer = Awaited<ReturnType<SshWorldSourceFetcher["fetch"]>>;

export interface WorldSourceSshIpcOptions extends SshWorldSourceFetcherOptions {
    /** Injected so a test can register against a fetcher it fully controls. */
    readonly fetcher?: SshWorldSourceFetcher;
    /** Injected so a test can answer detection without a real host. */
    readonly detect?: (target: RemoteTarget, options: HostKeyOptions) => Promise<ConnectResult>;
    readonly survey?: (
        target: RemoteTarget,
        path: string,
        kind: RemoteHostKind,
        options: HostKeyOptions,
    ) => Promise<RemoteWorldSurvey>;
    readonly trust?: typeof trustHostKey;
}

export interface WorldSourceSshIpc {
    readonly fetcher: SshWorldSourceFetcher;
    dispose(): void;
}

export function registerSshWorldSourceHandlers(
    ipcMain: IpcMain,
    options: WorldSourceSshIpcOptions,
): WorldSourceSshIpc {
    const fetcher = options.fetcher ?? new SshWorldSourceFetcher(options);
    const runDetect = options.detect ?? connectAndDetectHost;
    const runSurvey = options.survey ?? surveyRemoteWorld;
    const recordKey = options.trust ?? trustHostKey;

    const hostKeyOptions: HostKeyOptions = {
        knownHostsFile: options.knownHostsFile,
        ...(options.userKnownHostsFile === undefined ? {} : { userKnownHostsFile: options.userKnownHostsFile }),
        ...(options.runner === undefined ? {} : { runner: options.runner }),
    };

    ipcMain.handle(
        "worldsource:ssh:validate",
        (_event: IpcMainInvokeEvent, value: unknown): SshValidateAnswer => {
            const checked = validateTarget(asPartial(value));
            return checked.ok
                ? { ok: true, target: checked.target, summary: describeTarget(checked.target) }
                : { ok: false, message: checked.failure.message };
        },
    );

    ipcMain.handle(
        "worldsource:ssh:detect",
        async (_event: IpcMainInvokeEvent, value: unknown): Promise<SshDetectAnswer> => {
            const checked = validateTarget(asPartial(value));
            if (!checked.ok) return { ok: false, message: checked.failure.message, hostKeys: [] };
            try {
                const result = await runDetect(checked.target, hostKeyOptions);
                return result.ok
                    ? { ok: true, kind: result.detection.kind, detail: result.detection.detail }
                    : { ok: false, message: result.failure.message, hostKeys: result.hostKeys };
            } catch (error) {
                // `connectAndDetectHost` promises not to reject and its own tests hold it to
                // that. This is the belt: a rejection here would cross the bridge as a bare
                // `Error` with a stack in it.
                return { ok: false, message: describe(error), hostKeys: [] };
            }
        },
    );

    /**
     * Records a host key the person has looked at and accepted.
     *
     * The fingerprint is all that crosses, exactly as `remote:trustHostKey` already does it -
     * `hostkey.ts` re-scans the host and writes only a key it has just been offered whose
     * fingerprint matches, so this channel cannot be used to put an arbitrary line into a
     * trust store.
     */
    ipcMain.handle(
        "worldsource:ssh:trustHostKey",
        async (_event: IpcMainInvokeEvent, value: unknown, fingerprint: unknown): Promise<SshTrustAnswer> => {
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
        "worldsource:ssh:checkPath",
        (_event: IpcMainInvokeEvent, path: unknown, kind: unknown): RemoteWorldPathCheck => {
            if (typeof path !== "string") return { ok: false, reason: "A path is required." };
            return checkRemoteWorldPath(path, asHostKind(kind));
        },
    );

    ipcMain.handle(
        "worldsource:ssh:survey",
        async (_event: IpcMainInvokeEvent, value: unknown, path: unknown, kind: unknown): Promise<SshSurveyAnswer> => {
            const checked = validateTarget(asPartial(value));
            if (!checked.ok) return { ok: false, message: checked.failure.message };
            if (typeof path !== "string" || path.trim() === "") {
                return { ok: false, message: "A path to the world on the remote host is required." };
            }
            try {
                const surveyed = await runSurvey(checked.target, path, asHostKind(kind), hostKeyOptions);
                return surveyed.ok
                    ? { ok: true, kind: surveyed.kind, entries: surveyed.entries }
                    : { ok: false, message: surveyed.failure.message };
            } catch (error) {
                return { ok: false, message: describe(error) };
            }
        },
    );

    ipcMain.handle(
        "worldsource:ssh:diff",
        (
            _event: IpcMainInvokeEvent,
            previous: unknown,
            current: unknown,
        ): RemoteWorldChanges & { readonly anyChange: boolean } => {
            const changes = diffRemoteWorldSurveys(asEntries(previous), asEntries(current));
            return { ...changes, anyChange: remoteWorldChanged(changes) };
        },
    );

    ipcMain.handle(
        "worldsource:ssh:fetch",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<SshFetchAnswer> => {
            const parsed = asFetchRequest(request);
            if (parsed === null) {
                return {
                    id: "",
                    result: {
                        ok: false,
                        failure: failures.invalidTarget(
                            "A target, a remote world path and a local destination are all required.",
                        ),
                        hostKeys: [],
                    },
                };
            }
            const checked = validateTarget(parsed.target);
            if (!checked.ok) {
                return { id: "", result: { ok: false, failure: checked.failure, hostKeys: [] } };
            }
            try {
                return await fetcher.fetch({
                    target: checked.target,
                    remotePath: parsed.remotePath,
                    localPath: parsed.localPath,
                });
            } catch (error) {
                return {
                    id: "",
                    result: {
                        ok: false,
                        failure: failureFor(checked.target, error),
                        hostKeys: [],
                    },
                };
            }
        },
    );

    ipcMain.handle("worldsource:ssh:cancel", (_event: IpcMainInvokeEvent, id: unknown) =>
        typeof id === "string" && fetcher.cancel(id),
    );

    ipcMain.handle("worldsource:ssh:active", () => fetcher.activeFetchIds());

    return {
        fetcher,
        dispose(): void {
            for (const channel of WORLD_SOURCE_SSH_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

function asHostKind(value: unknown): RemoteHostKind {
    return value === "windows" || value === "posix" ? value : "unknown";
}

function asPartial(value: unknown): PartialRemoteTarget {
    return typeof value === "object" && value !== null ? (value as PartialRemoteTarget) : {};
}

function asEntries(value: unknown): readonly RemoteWorldEntry[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
        (entry): entry is RemoteWorldEntry =>
            typeof entry === "object" &&
            entry !== null &&
            typeof (entry as Record<string, unknown>)["path"] === "string" &&
            typeof (entry as Record<string, unknown>)["size"] === "number" &&
            typeof (entry as Record<string, unknown>)["mtimeMs"] === "number",
    );
}

function asFetchRequest(
    value: unknown,
): { readonly target: PartialRemoteTarget; readonly remotePath: string; readonly localPath: string } | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const target = record["target"];
    const remotePath = record["remotePath"];
    const localPath = record["localPath"];
    if (typeof target !== "object" || target === null) return null;
    if (typeof remotePath !== "string" || remotePath === "") return null;
    if (typeof localPath !== "string" || localPath === "") return null;
    return { target: target as PartialRemoteTarget, remotePath, localPath };
}

function failureFor(target: RemoteTarget, error: unknown): RemoteFailure {
    return failures.remoteCommandFailed(describeTarget(target), "Fetching the world", null, describe(error));
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

// `SshWorldSourceRequest` is re-exported so a caller that only imports this module - never
// `sshFetcher.ts` directly - can still type the object it builds for `fetcher.fetch(...)`.
export type { SshWorldSourceRequest };
