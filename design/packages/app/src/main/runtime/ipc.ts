/**
 * The runtime channel between the main process and the settings screen.
 *
 * Built like `java/ipc.ts` and `config/ipc.ts`: Electron arrives as a *type*, `IpcMain` is
 * a parameter, and the import is erased at build time, so this module and everything it
 * calls is exercised without an Electron runtime. Every channel is named once in
 * {@link RUNTIME_CHANNELS} so `dispose` cannot drift from the registration.
 *
 * **No handler here rejects.** The question these channels answer is "can I run this in a
 * container?", and every possible answer - including "Docker exploded" - is a sentence the
 * settings row has to show. A rejection would arrive at the renderer as a bare `Error`
 * with a stack in it, and the row would have to guess what to say.
 *
 * What crosses is a fresh plain object built here field by field. Nothing that came out
 * of a subprocess is forwarded by reference, and Docker's own words travel in one clearly
 * named `detail` field rather than being spliced into the sentence.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { probeDocker, type DockerReport, type ProbeDockerOptions } from "./docker.js";
import { DEFAULT_DOCKER_IMAGE, DEFAULT_RUNTIME_MODE, type RuntimeMode } from "./plan.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const RUNTIME_CHANNELS = ["runtime:docker", "runtime:modes"] as const;

/** One place a render or the web server can run, and whether it can right now. */
export interface RuntimeModeSummary {
    readonly id: RuntimeMode;
    readonly available: boolean;
    /** What to show beside the choice, whichever way it went. */
    readonly message: string;
    /** Supporting words from the tool itself, when there are any. */
    readonly detail: string | null;
}

export interface RuntimeModesSummary {
    /** Local, unless somebody changes it. Docker is opt-in. */
    readonly preferred: RuntimeMode;
    readonly modes: readonly RuntimeModeSummary[];
    /** The image a container run would use, so the settings row can name it. */
    readonly dockerImage: string;
}

/**
 * What Docker is doing, as a plain object.
 *
 * The status is the contract and the message is the explanation beside it, the same way
 * `render/failure.ts` splits a code from its sentence: an interface that matches on prose
 * breaks the first time a sentence is improved.
 */
export interface DockerSummary {
    readonly status: DockerReport["status"];
    readonly available: boolean;
    readonly clientVersion: string | null;
    readonly serverVersion: string | null;
    readonly message: string;
    readonly detail: string | null;
}

export function summariseDocker(report: DockerReport): DockerSummary {
    return {
        status: report.status,
        available: report.status === "available",
        clientVersion: report.clientVersion,
        serverVersion: report.serverVersion,
        message: report.message,
        detail: report.detail,
    };
}

/** What is said about the local mode. It needs nothing that could be missing here. */
export const LOCAL_MODE_MESSAGE =
    "Runs the engine as a program on this computer, using the Java runtime the app found or installed.";

export interface RuntimeIpcOptions {
    /** Injected so a test can answer as any Docker state without one installed. */
    readonly probe?: (options?: ProbeDockerOptions) => Promise<DockerReport>;
    readonly docker?: string;
    readonly image?: string;
}

export interface RuntimeIpc {
    dispose(): void;
}

/** A probe that failed in a way Docker itself never reports. Still an answer. */
function unexplained(error: unknown): DockerReport {
    return {
        status: "unusable",
        clientVersion: null,
        serverVersion: null,
        message: "Docker could not be checked on this computer.",
        detail: error instanceof Error ? error.message : String(error),
    };
}

/**
 * Registers the runtime handlers.
 *
 * Nothing is cached. Docker Desktop is started and stopped while an app is open, so an
 * answer kept from launch is an answer that is wrong exactly when somebody has just
 * started Docker and pressed the button again.
 */
export function registerRuntimeHandlers(
    ipcMain: IpcMain,
    options: RuntimeIpcOptions = {},
): RuntimeIpc {
    const probe = options.probe ?? probeDocker;
    const probeOptions: ProbeDockerOptions =
        options.docker === undefined ? {} : { docker: options.docker };

    const look = async (): Promise<DockerReport> => {
        try {
            return await probe(probeOptions);
        } catch (error) {
            return unexplained(error);
        }
    };

    ipcMain.handle(
        "runtime:docker",
        async (_event: IpcMainInvokeEvent): Promise<DockerSummary> => summariseDocker(await look()),
    );

    ipcMain.handle(
        "runtime:modes",
        async (_event: IpcMainInvokeEvent): Promise<RuntimeModesSummary> => {
            const docker = await look();
            return {
                preferred: DEFAULT_RUNTIME_MODE,
                dockerImage: options.image ?? DEFAULT_DOCKER_IMAGE,
                modes: [
                    { id: "local", available: true, message: LOCAL_MODE_MESSAGE, detail: null },
                    {
                        id: "docker",
                        available: docker.status === "available",
                        message: docker.message,
                        detail: docker.detail,
                    },
                ],
            };
        },
    );

    return {
        dispose(): void {
            for (const channel of RUNTIME_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
