/**
 * The channel the interface drives "host this render live" through.
 *
 * Built like `pages/ipc.ts`: `IpcMain` is a parameter, `HttpHandler`/networking specifics
 * live in `server.ts` which imports no Electron at all, every channel is named once in
 * {@link PREVIEW_CHANNELS} so `dispose` cannot drift from `install`, and no handler ever
 * rejects - a refusal is always a value with a sentence, per this app's own rule that a
 * rejected `invoke` becomes an unhandled promise in a component and the user sees nothing.
 *
 * ## One server at a time
 *
 * Hosting a second render while one is already being hosted would mean two ports, two URLs,
 * and a "stop" button that needs to say which one it stops. `preview:start` for a
 * **different** render id while one is running is refused, naming the render already being
 * hosted; `preview:start` for the **same** render id, already running, is answered
 * idempotently with the existing address rather than starting a second listener on it.
 *
 * ## The three render routes, and what this channel says about each
 *
 *  - **Local** and **Docker/container**: both write tiles straight onto this machine's
 *    disk - a container's `webRoot` mount is a real bind mount (`runtime/plan.ts`'s
 *    `hostWebRoot`), not a named volume, so the files are exactly as reachable as a local
 *    render's. Both are hostable from the moment their workspace directory exists, whether
 *    the render is still running or long finished.
 *  - **GitHub's runners**: nothing is on this machine while that render is in flight - the
 *    whole point of `cirender/`. `preview:availability` reports that honestly by name
 *    rather than exposing a control that can never work, and points at Pages hosting
 *    instead; once that render's output has been downloaded here (an ordinary local
 *    workspace at that point, same as any other) it hosts exactly like a local render.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { stat } from "node:fs/promises";
import { renderWorkspace } from "../render/workspace.js";
import {
    LOOPBACK_HOST,
    NETWORK_HOST,
    startPreviewServer,
    type PreviewServerHandle,
} from "./server.js";
import { PreviewNetworkStore, type PreviewNetworkSetting } from "./networkExposure.js";

/** The channel every start, stop and failure event arrives on. */
export const PREVIEW_EVENT_CHANNEL = "preview:event";

/** Every channel this module registers, so `dispose` cannot drift from `install`. */
export const PREVIEW_CHANNELS = [
    "preview:availability",
    "preview:start",
    "preview:stop",
    "preview:status",
    "preview:openInBrowser",
    "preview:networkDefault",
    "preview:setNetworkDefault",
] as const;

/**
 * `code` is what the interface switches on to pick localized copy for the two refusals it
 * already knows the shape of; `reason` is the plain-English sentence underneath it, used as
 * a fallback and in any context (a log, a tooltip on a build too old to carry the code) that
 * has no catalogue to reach for.
 */
export type PreviewAvailability =
    | { readonly ok: true }
    | { readonly ok: false; readonly code: "on-github-runners" | "not-found"; readonly reason: string };

export interface PreviewStartRequest {
    readonly renderId: string;
    /** Explicit opt-in only. Absent or false means loopback, exactly like the default. */
    readonly allowNetwork?: boolean;
}

export type PreviewStartAnswer =
    | {
          readonly ok: true;
          readonly renderId: string;
          readonly url: string;
          readonly host: string;
          readonly port: number;
      }
    | { readonly ok: false; readonly reason: string };

export interface PreviewStatusAnswer {
    readonly running: boolean;
    readonly renderId: string | null;
    readonly url: string | null;
    readonly host: string | null;
    readonly port: number | null;
    /** Whether the hosted render is still actively being written to, right now. */
    readonly renderActive: boolean;
}

export type PreviewEvent =
    | { readonly type: "started"; readonly renderId: string; readonly url: string; readonly host: string; readonly port: number; readonly at: string }
    | { readonly type: "stopped"; readonly renderId: string; readonly at: string }
    | { readonly type: "failed"; readonly renderId: string; readonly reason: string; readonly at: string };

export interface PreviewIpcOptions {
    readonly ipcMain: IpcMain;
    /** Where renders are written. A function: the storage folder can move while running. */
    readonly storageDir: () => string;
    /** Renders this process is actively driving locally or in a container, right now. */
    readonly activeRenderIds: () => readonly string[];
    /**
     * Renders currently in flight on GitHub's own runners - nothing is on this machine for
     * one of these yet. Absent (a build with no CI-render subsystem, or a test) means none
     * ever are, which is the honest answer for a build that cannot run one at all.
     */
    readonly githubActiveRenderIds?: (() => readonly string[]) | undefined;
    readonly network: PreviewNetworkStore;
    /** Overridable so a test can watch what was broadcast. */
    readonly broadcast?: ((event: PreviewEvent) => void) | undefined;
    /** Injected only by tests; real callers always get the real port-picking server. */
    readonly start?: typeof startPreviewServer;
    readonly now?: () => string;
    /**
     * Opens a URL in the system browser. True on success.
     *
     * Deliberately **not** `github/external.ts`'s `openExternalHttps` - that door is https
     * only, by design, and a loopback preview is `http://127.0.0.1:<port>/` on purpose (see
     * `server.ts`'s own doc comment on why there is no certificate to have here). Reusing
     * that guard would make the "Open in browser" button silently do nothing.
     *
     * Safe without that guard for a narrower reason: `preview:openInBrowser` below takes no
     * URL from the renderer at all. It only ever opens *this module's own* `handle.url` -
     * a value this file constructed from `startPreviewServer`'s return, never one a
     * component could pass in - so there is nothing here for a compromised or careless
     * caller to redirect to a `file:` URL or any other scheme.
     */
    readonly openExternal?: ((url: string) => Promise<boolean>) | undefined;
}

export interface PreviewIpc {
    dispose(): Promise<void>;
    /** True while a server is running. Used by `main/index.ts` to stop it on quit. */
    isRunning(): boolean;
}

export interface PreviewNetworkReadout extends PreviewNetworkSetting {
    readonly defaultAllowNetwork: boolean;
}

export function installPreviewIpc(options: PreviewIpcOptions): PreviewIpc {
    const broadcast = options.broadcast ?? (() => undefined);
    const now = options.now ?? (() => new Date().toISOString());
    const start = options.start ?? startPreviewServer;

    let handle: PreviewServerHandle | null = null;

    async function workspaceExists(renderId: string): Promise<boolean> {
        try {
            const info = await stat(renderWorkspace(options.storageDir(), renderId).root);
            return info.isDirectory();
        } catch {
            return false;
        }
    }

    async function availability(renderId: string): Promise<PreviewAvailability> {
        if ((options.githubActiveRenderIds?.() ?? []).includes(renderId)) {
            return {
                ok: false,
                code: "on-github-runners",
                reason:
                    "This render is running on GitHub's own servers, not this computer, so there is " +
                    "nothing here yet to host live. Publish it to GitHub Pages once it finishes, or " +
                    "download it to this computer to host it here.",
            };
        }
        if (!(await workspaceExists(renderId))) {
            return { ok: false, code: "not-found", reason: "No render was found with this id." };
        }
        return { ok: true };
    }

    function statusOf(): PreviewStatusAnswer {
        if (handle === null) {
            return { running: false, renderId: null, url: null, host: null, port: null, renderActive: false };
        }
        return {
            running: true,
            renderId: handle.renderId,
            url: handle.url,
            host: handle.host,
            port: handle.port,
            renderActive: options.activeRenderIds().includes(handle.renderId),
        };
    }

    options.ipcMain.handle(
        "preview:availability",
        async (_event: IpcMainInvokeEvent, renderId: unknown): Promise<PreviewAvailability> => {
            if (typeof renderId !== "string" || renderId === "") {
                return { ok: false, code: "not-found", reason: "A render id is required." };
            }
            return await availability(renderId);
        },
    );

    options.ipcMain.handle(
        "preview:start",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<PreviewStartAnswer> => {
            const renderId =
                typeof request === "object" && request !== null
                    ? (request as PreviewStartRequest).renderId
                    : undefined;
            if (typeof renderId !== "string" || renderId === "") {
                return { ok: false, reason: "A render id is required." };
            }
            const allowNetwork =
                typeof request === "object" && request !== null
                    ? (request as PreviewStartRequest).allowNetwork === true
                    : false;

            if (handle !== null) {
                if (handle.renderId === renderId) {
                    // Idempotent: the caller pressed the button twice, or a second window
                    // asked. Neither is an error, and neither should start a second listener.
                    return { ok: true, renderId, url: handle.url, host: handle.host, port: handle.port };
                }
                return {
                    ok: false,
                    reason: `Already hosting a different render (${handle.renderId}). Stop that one first.`,
                };
            }

            const check = await availability(renderId);
            if (!check.ok) return check;

            const workspace = renderWorkspace(options.storageDir(), renderId);
            try {
                const started = await start({
                    renderId,
                    webRoot: workspace.webRoot,
                    isActive: () => options.activeRenderIds().includes(renderId),
                    host: allowNetwork ? NETWORK_HOST : LOOPBACK_HOST,
                });
                handle = started;
                broadcast({
                    type: "started",
                    renderId,
                    url: started.url,
                    host: started.host,
                    port: started.port,
                    at: now(),
                });
                return { ok: true, renderId, url: started.url, host: started.host, port: started.port };
            } catch (error) {
                const reason = error instanceof Error ? error.message : String(error);
                broadcast({ type: "failed", renderId, reason, at: now() });
                return { ok: false, reason: `Could not start hosting: ${reason}` };
            }
        },
    );

    options.ipcMain.handle("preview:stop", async (): Promise<boolean> => {
        if (handle === null) return false;
        const renderId = handle.renderId;
        await handle.stop();
        handle = null;
        broadcast({ type: "stopped", renderId, at: now() });
        return true;
    });

    options.ipcMain.handle("preview:status", (): PreviewStatusAnswer => statusOf());

    options.ipcMain.handle("preview:openInBrowser", async (): Promise<boolean> => {
        if (handle === null) return false;
        const opener = options.openExternal;
        if (opener === undefined) return false;
        return await opener(handle.url);
    });

    options.ipcMain.handle(
        "preview:networkDefault",
        (): PreviewNetworkReadout => ({ ...options.network.read(), defaultAllowNetwork: false }),
    );

    options.ipcMain.handle(
        "preview:setNetworkDefault",
        (_event: IpcMainInvokeEvent, value: unknown): PreviewNetworkReadout => ({
            ...options.network.write(value === true),
            defaultAllowNetwork: false,
        }),
    );

    return {
        async dispose(): Promise<void> {
            for (const channel of PREVIEW_CHANNELS) options.ipcMain.removeHandler(channel);
            if (handle !== null) {
                await handle.stop();
                handle = null;
            }
        },
        isRunning: () => handle !== null,
    };
}
