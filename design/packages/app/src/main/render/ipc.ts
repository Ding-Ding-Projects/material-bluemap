/**
 * The render channel between the main process and the interface.
 *
 * This is the only file in `render/` that imports Electron, and the only one that
 * reads `consent.ts`. Everything else takes what it needs as a parameter, which is what
 * lets the parser, the config writer, the runner and the orchestrator be tested without
 * an Electron runtime - and, more usefully, keeps the question "does this render have
 * consent" answerable in one place instead of being re-decided in four.
 *
 * ## Why events are pushed rather than polled
 *
 * A render takes minutes. The capture this was written against went
 * `8.535% -> 88.601%` over four minutes in ten-second steps, which is exactly the shape
 * a person needs to see: a bar that moves, a percentage, and a shrinking estimate. A
 * spinner for four minutes is indistinguishable from a hang, and a hang is what people
 * conclude. So each parsed line is forwarded as it arrives.
 */

import { BrowserWindow, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { hasAcceptedDownload } from "../consent.js";
import { ContainerHandoffStore } from "../runtime/handoff.js";
import type { RuntimeMode } from "../runtime/plan.js";
import { LocalMapHandler } from "./LocalMapHandler.js";
import { RENDER_RUNTIME_MODES, RenderOrchestrator } from "./orchestrator.js";
import type {
    RenderEvent,
    RenderRequest,
    RenderResult,
    ResolvedEngine,
} from "./orchestrator.js";
import { describeEngine, readRenderRecord } from "./provenance.js";
import type { RenderRecord } from "./provenance.js";
import { findInterruptedRenders, planResume } from "./resume.js";
import type { InterruptedRenderSummary, ResumeRefused } from "./resume.js";
import { RenderSessionStore } from "./session.js";
import { expandStorageDirectory, listRenderIds, renderWorkspace } from "./workspace.js";

/** The channel every progress, phase, log and outcome event arrives on. */
export const RENDER_EVENT_CHANNEL = "render:event";

/** What a map's details surface shows: which engine rendered it, and when. */
export interface RenderSummary {
    readonly renderId: string;
    readonly outcome: RenderRecord["outcome"];
    /** e.g. `BlueMap engine (Java) 5.22-27 on Java 25.0.3`. */
    readonly engine: string;
    readonly engineId: RenderRecord["engine"];
    readonly maps: RenderRecord["maps"];
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    /**
     * Where the engine ran, or null when the record does not say.
     *
     * Null is a real answer here, not a missing one: records written before the app could
     * render in a container do not claim to know, and the details surface should say
     * nothing rather than assert "locally" on their behalf.
     */
    readonly runtime: RuntimeMode | null;
    /** Present only when the render finished and is being served. */
    readonly dataRoot: string | null;
}

export interface RenderIpcOptions {
    /** Where renders are written. Already absolute and token-expanded. */
    readonly storageDir: string;
    /** The default, shown to somebody choosing a folder in setup. */
    readonly defaultStorageDir: string;
    /** Home and `%APPDATA%`, for expanding the token form the setup step stores. */
    readonly environment: { readonly home: string; readonly appData?: string | undefined };
    readonly resolveEngine: () => Promise<ResolvedEngine>;
    readonly mounts: LocalMapHandler;
    readonly appVersion?: string | null;
    /** Overridable so a test can watch what was broadcast. Defaults to every window. */
    readonly broadcast?: (event: RenderEvent) => void;
    /**
     * Where a container's name is written down before the container is started.
     *
     * **Pass the same store the container reattacher is given.** Two stores means two
     * instance ids, and a record written by one is a record the other reads as belonging
     * to a dead app - so a container render still in flight is offered back to the person
     * as one to pick up. One is created here when none is supplied, and it is exposed on
     * {@link RenderIpc.containers} so the caller can hand that one to the reattacher
     * instead of building a second.
     */
    readonly containers?: ContainerHandoffStore;
    /** The `docker` binary a container render uses. Defaults to `docker` on the PATH. */
    readonly docker?: string;
    /** The image a container render uses. Defaults to `runtime/plan.ts`'s stock JRE. */
    readonly dockerImage?: string;
    /** The account's home directory, so a container mount of it is refused by name. */
    readonly home?: string | null;
}

/**
 * What `render:resume` answers with.
 *
 * Two shapes rather than one, because a refusal is not a render failure. A render that
 * was refused never started, has no id in flight and no engine to name, and folding it
 * into `RenderResult` would mean inventing a failure code for something that is not a
 * failure of rendering at all. `started` says which of the two this is.
 */
export type ResumeIpcResult =
    | { readonly started: true; readonly result: RenderResult }
    | { readonly started: false; readonly refusal: ResumeRefused };

export interface RenderIpc {
    readonly orchestrator: RenderOrchestrator;
    readonly mounts: LocalMapHandler;
    /** The session store the orchestrator writes through. */
    readonly sessions: RenderSessionStore;
    /**
     * The container records the orchestrator writes through.
     *
     * Hand this to the container reattacher rather than constructing a second store; see
     * the note on {@link RenderIpcOptions.containers} for what two of them cost.
     */
    readonly containers: ContainerHandoffStore;
    /**
     * Where maps are being written right now.
     *
     * A function rather than a value because `render:setStorageDirectory` moves it while
     * the application is running, and anything else that writes beside the maps - the
     * release downloader in particular - has to follow it there rather than keep filling
     * the folder somebody moved away from.
     */
    storageDirectory(): string;
    /**
     * Mounts every previously finished render so the viewer can open them at once, and
     * reconciles any session left `running` by an app that did not come back.
     */
    restoreExisting(): Promise<RenderSummary[]>;
    /** Renders that were cut off and could be carried on, newest first. */
    interruptedRenders(): Promise<InterruptedRenderSummary[]>;
    dispose(): void;
}

function broadcastToWindows(event: RenderEvent): void {
    for (const window of BrowserWindow.getAllWindows()) {
        if (window.isDestroyed()) continue;
        window.webContents.send(RENDER_EVENT_CHANNEL, event);
    }
}

/**
 * Registers the render handlers.
 *
 * Returns the orchestrator so the rest of the main process can use it directly rather
 * than talking to itself over IPC, and a `dispose` so a test or a restart can take the
 * handlers off again without leaving a duplicate registration behind.
 */
export function installRenderIpc(options: RenderIpcOptions): RenderIpc {
    const broadcast = options.broadcast ?? broadcastToWindows;

    // Mutable, and read through a function by everything below, because somebody can
    // change where maps are written from the setup step. A directory captured once at
    // construction would keep writing to the old folder until the app was restarted,
    // with nothing on screen to say the setting had not taken effect.
    let storageDir = options.storageDir;

    // One store per install, constructed here so its instance id is fresh for this
    // launch. That id is what makes a session left `running` by a previous launch
    // recognisable as a render whose app is gone; see the note at the top of session.ts.
    const sessions = new RenderSessionStore({ storageDir: () => storageDir });

    // One per install, for the same reason and with the same instance-id contract as the
    // session store above. See the note on the option for why passing one in matters.
    const containers =
        options.containers ?? new ContainerHandoffStore({ storageDir: () => storageDir });

    const orchestrator = new RenderOrchestrator({
        storageDir: () => storageDir,
        // Read through the existing module, every time, and never asked here. The
        // question was answered once at first launch; a render that finds it missing
        // reports "consent required" with the settings row to change it, and shows
        // nobody a licence in the middle of a task.
        hasConsent: hasAcceptedDownload,
        resolveEngine: options.resolveEngine,
        mounts: options.mounts,
        onEvent: broadcast,
        appVersion: options.appVersion ?? null,
        sessions,
        containers,
        ...(options.docker === undefined ? {} : { docker: options.docker }),
        ...(options.dockerImage === undefined ? {} : { dockerImage: options.dockerImage }),
        ...(options.home === undefined ? {} : { home: options.home }),
    });

    /**
     * Starts a render, wherever the request says to run it.
     *
     * `request.runtime` crosses untouched and is checked on the other side: absent is
     * local, `docker` is honoured or refused with the real reason, and anything else is an
     * invalid request. Validating it here as well would mean two places deciding what a
     * runtime mode is, and the far side is the one that has to be right.
     */
    ipcMain.handle("render:start", async (_event: IpcMainInvokeEvent, request: RenderRequest) => {
        return await orchestrator.render(request);
    });

    /**
     * Where this build can actually run a render.
     *
     * A claim about the **build**, not about the machine: `runtime:modes` answers whether
     * Docker is installed and running right now, and this answers whether choosing it would
     * do anything. A surface that reads the first as the second offers a choice that
     * renders locally anyway, which is worse than offering nothing.
     */
    ipcMain.handle("render:runtimeModes", (): readonly RuntimeMode[] => RENDER_RUNTIME_MODES);

    ipcMain.handle("render:cancel", (_event: IpcMainInvokeEvent, renderId: string) => {
        return typeof renderId === "string" && orchestrator.cancel(renderId);
    });

    ipcMain.handle("render:active", () => orchestrator.activeRenderIds());

    /**
     * Renders that were cut off, and how far each got.
     *
     * Reconciles as it reads, so a session left `running` by an app that crashed stops
     * claiming to be running the first time anybody asks. Nothing here restarts anything:
     * the answer is a list, and the decision is the person's.
     */
    ipcMain.handle("render:interrupted", async () => await interrupted());

    /**
     * Carries an interrupted render on from where it stopped.
     *
     * The same maps, the same config, and no `-f`, so BlueMap's own incremental storage
     * skips every tile already on disk. Nothing is deleted: not the output, and above all
     * not `rstate`, which is the record of what has already been done.
     *
     * The optional second argument is the maps the caller believes it is resuming. Pass
     * it and a settings change since the render died is refused with a message that says
     * so; omit it and the session's own settings are used, which is always consistent.
     */
    ipcMain.handle(
        "render:resume",
        async (
            _event: IpcMainInvokeEvent,
            renderId: unknown,
            maps?: unknown,
        ): Promise<ResumeIpcResult> => {
            if (typeof renderId !== "string") {
                return {
                    started: false,
                    refusal: {
                        ok: false,
                        renderId: "",
                        code: "no-session",
                        message: "A render id is needed to say which render to carry on.",
                    },
                };
            }

            const session = await sessions.read(renderId);
            const decision = planResume(session, {
                running: orchestrator.activeRenderIds().includes(renderId),
                ...(Array.isArray(maps) ? { maps: maps as RenderRequest["maps"] } : {}),
            });
            if (!decision.ok) return { started: false, refusal: decision };
            return { started: true, result: await orchestrator.render(decision.request) };
        },
    );

    /** Declines the offer, so it is made once rather than at every launch. */
    ipcMain.handle("render:dismissResume", async (_event: IpcMainInvokeEvent, renderId: unknown) => {
        if (typeof renderId !== "string") return false;
        return await sessions.dismiss(renderId);
    });

    ipcMain.handle("render:list", async () => await summarise(storageDir, options.mounts));

    // Which engine rendered a given map. The README promises the app never switches
    // engines silently, and this is where the interface gets the answer to check it.
    ipcMain.handle("render:engine", async (_event: IpcMainInvokeEvent, renderId: string) => {
        if (typeof renderId !== "string") return null;
        const record = await readRenderRecord(renderWorkspace(storageDir, renderId).recordFile);
        return record === null ? null : toSummary(record, options.mounts);
    });

    // The real absolute path, which is what `mapStorage.ts` in the setup step says it
    // wants from the bridge: the renderer has no home directory, so it can only show a
    // token like `%APPDATA%\...` until the main process resolves it.
    ipcMain.handle("render:storageDirectory", () => ({
        current: storageDir,
        default: options.defaultStorageDir,
    }));

    ipcMain.handle("render:setStorageDirectory", (_event: IpcMainInvokeEvent, value: unknown) => {
        if (typeof value !== "string") {
            return { ok: false as const, message: "The map storage directory must be text." };
        }
        try {
            storageDir = expandStorageDirectory(value, options.environment);
        } catch (error) {
            // Never silently substitute a directory that works for the one that was
            // asked for. Say what is wrong and keep the previous one.
            return {
                ok: false as const,
                message: error instanceof Error ? error.message : String(error),
            };
        }
        return { ok: true as const, directory: storageDir };
    });

    async function interrupted(): Promise<InterruptedRenderSummary[]> {
        const found = await findInterruptedRenders(sessions);
        return found.map((entry) => entry.summary);
    }

    return {
        orchestrator,
        mounts: options.mounts,
        sessions,
        containers,
        storageDirectory: () => storageDir,
        async restoreExisting(): Promise<RenderSummary[]> {
            // Done first, and on every launch: this is the moment a render that was
            // running when the app died stops being described as running. The list it
            // returns is dropped here because the interface asks for it over IPC; what
            // matters is that the files on disk have been made honest.
            await interrupted();
            const summaries: RenderSummary[] = [];
            for (const renderId of await listRenderIds(storageDir)) {
                const record = await orchestrator.mountExisting(renderId);
                if (record !== null) summaries.push(toSummary(record, options.mounts));
            }
            return summaries;
        },
        interruptedRenders: interrupted,
        dispose(): void {
            for (const channel of RENDER_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
const RENDER_CHANNELS = [
    "render:start",
    "render:runtimeModes",
    "render:cancel",
    "render:active",
    "render:interrupted",
    "render:resume",
    "render:dismissResume",
    "render:list",
    "render:engine",
    "render:storageDirectory",
    "render:setStorageDirectory",
] as const;

async function summarise(storageDir: string, mounts: LocalMapHandler): Promise<RenderSummary[]> {
    const summaries: RenderSummary[] = [];
    for (const renderId of await listRenderIds(storageDir)) {
        const record = await readRenderRecord(renderWorkspace(storageDir, renderId).recordFile);
        if (record !== null) summaries.push(toSummary(record, mounts));
    }
    return summaries;
}

function toSummary(record: RenderRecord, mounts: LocalMapHandler): RenderSummary {
    const mounted = mounts.getMount(record.renderId) !== null;
    return {
        renderId: record.renderId,
        outcome: record.outcome,
        engine: describeEngine(record),
        engineId: record.engine,
        maps: record.maps,
        startedAt: record.startedAt,
        finishedAt: record.finishedAt,
        durationMs: record.durationMs,
        runtime: record.runtime ?? null,
        dataRoot: mounted ? LocalMapHandler.dataRoot(record.renderId) : null,
    };
}

export type { RenderResult };
