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
import { LocalMapHandler } from "./LocalMapHandler.js";
import { RenderOrchestrator } from "./orchestrator.js";
import type {
    RenderEvent,
    RenderRequest,
    RenderResult,
    ResolvedEngine,
} from "./orchestrator.js";
import { describeEngine, readRenderRecord } from "./provenance.js";
import type { RenderRecord } from "./provenance.js";
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
}

export interface RenderIpc {
    readonly orchestrator: RenderOrchestrator;
    readonly mounts: LocalMapHandler;
    /** Mounts every previously finished render so the viewer can open them at once. */
    restoreExisting(): Promise<RenderSummary[]>;
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
    });

    ipcMain.handle("render:start", async (_event: IpcMainInvokeEvent, request: RenderRequest) => {
        return await orchestrator.render(request);
    });

    ipcMain.handle("render:cancel", (_event: IpcMainInvokeEvent, renderId: string) => {
        return typeof renderId === "string" && orchestrator.cancel(renderId);
    });

    ipcMain.handle("render:active", () => orchestrator.activeRenderIds());

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

    return {
        orchestrator,
        mounts: options.mounts,
        async restoreExisting(): Promise<RenderSummary[]> {
            const summaries: RenderSummary[] = [];
            for (const renderId of await listRenderIds(storageDir)) {
                const record = await orchestrator.mountExisting(renderId);
                if (record !== null) summaries.push(toSummary(record, options.mounts));
            }
            return summaries;
        },
        dispose(): void {
            for (const channel of RENDER_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
const RENDER_CHANNELS = [
    "render:start",
    "render:cancel",
    "render:active",
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
        dataRoot: mounted ? LocalMapHandler.dataRoot(record.renderId) : null,
    };
}

export type { RenderResult };
