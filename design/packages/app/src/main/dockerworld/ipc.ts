/**
 * The Docker-world channel between the main process and the wizard.
 *
 * Built like `worldsource/ipc.ts`: Electron arrives as a *type*, `IpcMain` is a parameter,
 * and the import is erased at build time, so every channel here is exercised in tests with
 * no Electron runtime and no Docker daemon anywhere near them.
 *
 * **No handler here rejects**, for the same reason `worldsource/ipc.ts` gives: every
 * possible answer, including "Docker is not installed", is a sentence the picker has to
 * show, and a rejection would arrive at the renderer as a bare `Error` with a stack in it.
 *
 * This registers the **local** daemon only. `dockerworld/fetch.ts` and its neighbours
 * already take an injectable `CommandRunner` and `FileTransfer` and are tested against both
 * a local and a remote one - reaching a Docker host over SSH is exactly `sshCommandRunner(...)`
 * away - but wiring a *remote target picker* into this channel belongs with whichever
 * surface owns choosing and trusting a remote host, not with this one. Until that is wired,
 * a Docker world reached over SSH is available to the module and its tests, not yet to a
 * button in this application; see `docs/docker-world-source.md`.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { listContainers, listVolumes, inspectContainer, inspectVolume } from "./inventory.js";
import type {
    DockerContainerDetail,
    DockerContainerSummary,
    DockerVolumeDetail,
    DockerVolumeSummary,
    InventoryResult,
} from "./inventory.js";
import { DockerWorldFetcher } from "./fetch.js";
import type {
    DockerSourceRequest,
    DockerWorldFetchRequest,
    DockerWorldFetchResult,
    DockerWorldFetcherOptions,
    DockerWorldFingerprintResult,
} from "./fetch.js";
import { fingerprintsEqual } from "./change.js";
import type { RegionFingerprint, WorldFingerprint } from "./change.js";
import * as failures from "./failure.js";
import type { DockerWorldFailure } from "./failure.js";

/** Renderer broadcast carrying the fetcher's real progress and terminal events. */
export const DOCKERWORLD_EVENT_CHANNEL = "dockerworld:event" as const;

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const DOCKERWORLD_CHANNELS = [
    "dockerworld:list",
    "dockerworld:inspectContainer",
    "dockerworld:inspectVolume",
    "dockerworld:fetch",
    "dockerworld:cancel",
    "dockerworld:active",
    "dockerworld:fingerprint",
    "dockerworld:fingerprintsEqual",
] as const;

export type DockerWorldListAnswer =
    | {
          readonly ok: true;
          readonly containers: readonly DockerContainerSummary[];
          readonly volumes: readonly DockerVolumeSummary[];
      }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export type DockerContainerAnswer =
    | { readonly ok: true; readonly detail: DockerContainerDetail }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export type DockerVolumeAnswer =
    | { readonly ok: true; readonly detail: DockerVolumeDetail }
    | { readonly ok: false; readonly failure: DockerWorldFailure };

export interface DockerWorldIpc {
    readonly fetcher: DockerWorldFetcher;
    dispose(): void;
}

export interface DockerWorldIpcOptions extends DockerWorldFetcherOptions {
    /** Injected so a test can register against a fetcher it fully controls. */
    readonly fetcher?: DockerWorldFetcher;
}

function readSource(value: unknown): DockerSourceRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const kind = record["kind"];
    if (kind === "container") {
        const containerId = record["containerId"];
        const mountDestination = record["mountDestination"];
        if (typeof containerId !== "string" || containerId === "") return null;
        if (typeof mountDestination !== "string" || mountDestination === "") return null;
        return { kind: "container", containerId, mountDestination };
    }
    if (kind === "volume") {
        const volumeName = record["volumeName"];
        if (typeof volumeName !== "string" || volumeName === "") return null;
        return { kind: "volume", volumeName };
    }
    return null;
}

function readFetchRequest(value: unknown): DockerWorldFetchRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const source = readSource(record["source"]);
    const destination = record["destination"];
    if (source === null || typeof destination !== "string" || destination === "") return null;
    const acknowledgeLiveRisk = record["acknowledgeLiveRisk"];
    const dimension = record["dimension"];
    return {
        source,
        destination,
        ...(acknowledgeLiveRisk === true ? { acknowledgeLiveRisk: true } : {}),
        ...(typeof dimension === "string" && dimension !== "" ? { dimension } : {}),
    };
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * A `WorldFingerprint` from whatever the renderer sent back, tolerantly.
 *
 * Same shape `worldsource:ssh:diff`'s own `asEntries` uses: a malformed or missing region
 * entry is dropped rather than thrown on, because the two fingerprints being compared here
 * are only ever ones this same channel handed out a moment earlier - the tolerance is a
 * belt against `structuredClone`-adjacent surprises crossing the bridge, not a real
 * validation boundary.
 */
function asFingerprint(value: unknown): WorldFingerprint {
    if (typeof value !== "object" || value === null) return { regions: [] };
    const regions = (value as Record<string, unknown>)["regions"];
    if (!Array.isArray(regions)) return { regions: [] };
    return {
        regions: regions.filter(
            (entry): entry is RegionFingerprint =>
                typeof entry === "object" &&
                entry !== null &&
                typeof (entry as Record<string, unknown>)["path"] === "string" &&
                typeof (entry as Record<string, unknown>)["bytes"] === "number" &&
                typeof (entry as Record<string, unknown>)["modifiedAt"] === "number",
        ),
    };
}

export function registerDockerWorldHandlers(
    ipcMain: IpcMain,
    options: DockerWorldIpcOptions = {},
): DockerWorldIpc {
    const fetcher = options.fetcher ?? new DockerWorldFetcher(options);
    // Threaded into every inventory call below so a test can inject a runner rather than
    // this handler reaching for the real `docker` binary on whatever machine runs it - the
    // same reason `fetcher` itself is injectable.
    const inventoryOptions = {
        ...(options.runner === undefined ? {} : { runner: options.runner }),
        ...(options.docker === undefined ? {} : { docker: options.docker }),
    };

    ipcMain.handle("dockerworld:list", async (): Promise<DockerWorldListAnswer> => {
        try {
            const [containers, volumes]: [
                InventoryResult<readonly DockerContainerSummary[]>,
                InventoryResult<readonly DockerVolumeSummary[]>,
            ] = await Promise.all([
                listContainers(inventoryOptions),
                listVolumes(inventoryOptions),
            ]);
            if (!containers.ok) return { ok: false, failure: containers.failure };
            if (!volumes.ok) return { ok: false, failure: volumes.failure };
            return { ok: true, containers: containers.value, volumes: volumes.value };
        } catch (error) {
            // The probes and the parsers underneath promise not to throw, and their own
            // tests hold them to that. This is the belt: a rejection here would cross the
            // bridge as a bare `Error` with a stack in it, and the picker would have to
            // guess what to put on screen.
            return { ok: false, failure: failures.unusable(describe(error)) };
        }
    });

    ipcMain.handle(
        "dockerworld:inspectContainer",
        async (_event: IpcMainInvokeEvent, id: unknown): Promise<DockerContainerAnswer> => {
            if (typeof id !== "string" || id === "") {
                return {
                    ok: false,
                    failure: failures.invalidRequest("A container id is required."),
                };
            }
            try {
                const result = await inspectContainer(id, inventoryOptions);
                return result.ok
                    ? { ok: true, detail: result.value }
                    : { ok: false, failure: result.failure };
            } catch (error) {
                return { ok: false, failure: failures.unusable(describe(error)) };
            }
        },
    );

    ipcMain.handle(
        "dockerworld:inspectVolume",
        async (_event: IpcMainInvokeEvent, name: unknown): Promise<DockerVolumeAnswer> => {
            if (typeof name !== "string" || name === "") {
                return {
                    ok: false,
                    failure: failures.invalidRequest("A volume name is required."),
                };
            }
            try {
                const result = await inspectVolume(name, inventoryOptions);
                return result.ok
                    ? { ok: true, detail: result.value }
                    : { ok: false, failure: result.failure };
            } catch (error) {
                return { ok: false, failure: failures.unusable(describe(error)) };
            }
        },
    );

    ipcMain.handle(
        "dockerworld:fetch",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<DockerWorldFetchResult> => {
            const parsed = readFetchRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    fetchId: "",
                    failure: failures.invalidRequest(
                        "A container or volume, and a destination folder, are required.",
                    ),
                };
            }
            try {
                return await fetcher.fetch(parsed);
            } catch (error) {
                return { ok: false, fetchId: "", failure: failures.copyFailed(describe(error)) };
            }
        },
    );

    ipcMain.handle(
        "dockerworld:cancel",
        (_event: IpcMainInvokeEvent, fetchId: unknown) =>
            typeof fetchId === "string" && fetcher.cancel(fetchId),
    );

    ipcMain.handle("dockerworld:active", () => fetcher.activeFetchIds());

    /**
     * The cheap change-check fingerprint, exposed the same way `worldrepo:remoteTip` and
     * `worldsource:ssh:survey` are: a call the interface can make before deciding whether a
     * fetch is worth doing at all. `fingerprint: null` in the answer is not a failure - see
     * `DockerWorldFetcher.fingerprint`'s own doc comment for when that happens and why.
     */
    ipcMain.handle(
        "dockerworld:fingerprint",
        async (
            _event: IpcMainInvokeEvent,
            request: unknown,
        ): Promise<DockerWorldFingerprintResult> => {
            const source = readSource(request);
            if (source === null) {
                return {
                    ok: false,
                    failure: failures.invalidRequest("A container or volume is required."),
                };
            }
            try {
                return await fetcher.fingerprint(source);
            } catch (error) {
                return { ok: false, failure: failures.unusable(describe(error)) };
            }
        },
    );

    /**
     * The pure half of the change check, exposed the same way `worldsource:ssh:diff` is: no
     * Docker daemon and no network, just a comparison of two already-gathered fingerprints.
     */
    ipcMain.handle(
        "dockerworld:fingerprintsEqual",
        (_event: IpcMainInvokeEvent, a: unknown, b: unknown): boolean =>
            fingerprintsEqual(asFingerprint(a), asFingerprint(b)),
    );

    return {
        fetcher,
        dispose(): void {
            for (const channel of DOCKERWORLD_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
