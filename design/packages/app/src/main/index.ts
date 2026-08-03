import { app, BrowserWindow, ipcMain, session, clipboard, dialog } from "electron";
import {
    acceptDownload,
    completeFirstRun,
    needsFirstRun,
    readConsent,
    revokeDownloadConsent,
} from "./consent.js";
import * as path from "node:path";
import * as fs from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
    HttpServer,
    StaticHandler,
    RemoteProxyHandler,
    type RemoteProfile,
} from "@material-bluemap/server";
import { LocalMapHandler, defaultStorageDirectory } from "./render/index.js";
import { upstreamJavaEngine } from "./render/engine.js";
import { installRenderIpc } from "./render/ipc.js";
import type { RenderIpc } from "./render/ipc.js";
import { installDownloadIpc } from "./download/ipc.js";
import type { DownloadIpc } from "./download/ipc.js";
import { installGitHubIpc } from "./github/ipc.js";
import type { GitHubIpc } from "./github/ipc.js";
import { openExternalHttps } from "./github/external.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/** Built UI bundle (packages/ui/dist), resolved relative to the app package. */
function resolveUiRoot(): string {
    const candidates = [
        path.resolve(dirname, "../../../ui/dist"),
        path.resolve(process.resourcesPath ?? "", "ui"),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, "index.html"))) return candidate;
    }
    throw new Error(`UI bundle not found; looked in: ${candidates.join(", ")}`);
}

const authToken = randomBytes(24).toString("hex");
const remoteProxy = new RemoteProxyHandler();

/**
 * Locally rendered maps, mounted at `/local/{renderId}/`.
 *
 * The local twin of `remoteProxy`: a render's output is a static web root, so pointing
 * the viewer at this path makes it open a map this machine rendered exactly as it opens
 * one on the internet. It is added before the static UI bundle for the same reason the
 * remote proxy is - both own a path prefix, and the static handler is the fallback.
 */
const localMaps = new LocalMapHandler();

async function startEmbeddedServer(): Promise<string> {
    const server = new HttpServer({ host: "127.0.0.1", port: 0, authToken });
    server.addHandler(remoteProxy);
    server.addHandler(localMaps);
    server.addHandler(new StaticHandler(resolveUiRoot()));
    const address = await server.listen();
    app.on("will-quit", () => void server.close());
    return `http://127.0.0.1:${address.port}`;
}

function hardenSession(baseUrl: string): void {
    session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
        // pointer lock is needed by free-flight controls; fullscreen by the UI.
        callback(permission === "pointerLock" || permission === "fullscreen");
    });

    // The embedded server rejects every unauthenticated request with 403. Only the
    // main frame URL carries `?token=`, so without this the renderer's own bundle
    // requests (`/assets/*.js`, `/assets/*.css`, and every later fetch and
    // EventSource) are refused and the window stays blank. Attaching the token as a
    // Bearer header here covers every resource type at the network layer, and keeps
    // it out of the URLs that end up in the DOM.
    session.defaultSession.webRequest.onBeforeSendHeaders(
        { urls: [`${baseUrl}/*`] },
        (details, callback) => {
            callback({
                requestHeaders: {
                    ...details.requestHeaders,
                    Authorization: `Bearer ${authToken}`,
                },
            });
        }
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const headers = { ...details.responseHeaders };
        if (details.url.startsWith(baseUrl) && details.resourceType === "mainFrame") {
            headers["Content-Security-Policy"] = [
                "default-src 'self'; " +
                    "script-src 'self'; " +
                    "style-src 'self' 'unsafe-inline'; " + // Vuetify injects style tags
                    "img-src 'self' data: blob:; " +
                    "font-src 'self' data:; " +
                    "connect-src 'self'; " +
                    "worker-src 'self' blob:; " +
                    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            ];
        }
        callback({ responseHeaders: headers });
    });
}

function registerIpc(): void {
    ipcMain.handle("profiles:sync", (_event, profiles: RemoteProfile[]) => {
        const known = new Set<string>();
        for (const profile of profiles) {
            if (typeof profile.id !== "string" || typeof profile.baseUrl !== "string") continue;
            remoteProxy.setProfile({ id: profile.id, name: profile.name, baseUrl: profile.baseUrl });
            known.add(profile.id);
        }
        for (const existing of remoteProxy.getProfiles()) {
            if (!known.has(existing.id)) remoteProxy.removeProfile(existing.id);
        }
    });
    ipcMain.handle("clipboard:writeText", (_event, text: string) => {
        if (typeof text === "string") clipboard.writeText(text);
    });
    ipcMain.handle("app:version", () => app.getVersion());

    // Window controls for the Material title bar. The window is frameless, so these are
    // the only way it can be moved through its states: without them the app cannot be
    // minimised or closed at all.
    const focused = (event: Electron.IpcMainInvokeEvent): BrowserWindow | null =>
        BrowserWindow.fromWebContents(event.sender);

    ipcMain.handle("window:minimize", (event) => {
        focused(event)?.minimize();
    });
    ipcMain.handle("window:toggleMaximize", (event) => {
        const target = focused(event);
        if (target === null) return false;
        if (target.isMaximized()) target.unmaximize();
        else target.maximize();
        return target.isMaximized();
    });
    ipcMain.handle("window:close", (event) => {
        focused(event)?.close();
    });
    ipcMain.handle("window:isMaximized", (event) => focused(event)?.isMaximized() ?? false);

    // Mojang download consent. Asked once during first-run setup and remembered
    // afterwards, so it never appears on top of a render somebody has started.
    ipcMain.handle("consent:read", () => readConsent());
    ipcMain.handle("consent:accept", () => acceptDownload());
    ipcMain.handle("consent:revoke", () => revokeDownloadConsent());
    ipcMain.handle("firstRun:needed", () => needsFirstRun());
    ipcMain.handle("firstRun:complete", () => completeFirstRun());
}

/**
 * Local rendering, wired to the same server the viewer already talks to.
 *
 * `installRenderIpc` reads consent through `consent.ts` and never asks: a render without
 * it fails with a typed reason the interface shows as "consent required", with a link to
 * the settings row. Provisioning is deliberately left off, so a missing JDK is reported
 * rather than answered with a two-hundred-megabyte download nobody asked for.
 */
let renderIpc: RenderIpc | null = null;

function startRendering(): RenderIpc {
    // `createWindow` runs again on macOS `activate`, and `ipcMain.handle` throws when a
    // channel already has a handler. Registering once is the difference between
    // reopening the window and crashing while reopening it.
    if (renderIpc !== null) return renderIpc;

    const userData = app.getPath("userData");
    const storageDir = defaultStorageDirectory(userData);
    const render = installRenderIpc({
        storageDir,
        defaultStorageDir: storageDir,
        environment: { home: app.getPath("home"), appData: process.env.APPDATA },
        mounts: localMaps,
        resolveEngine: upstreamJavaEngine({
            dataDir: userData,
            resourcesPath: app.isPackaged ? process.resourcesPath : null,
        }),
        appVersion: app.getVersion(),
    });
    // Maps rendered in an earlier session are served again without re-rendering.
    void render.restoreExisting();
    renderIpc = render;
    return render;
}

/**
 * Downloading worlds and rendered maps that a release published in pieces.
 *
 * Registered once, for the same reason rendering is: `ipcMain.handle` throws on a
 * channel that already has a handler, and `createWindow` runs again on macOS `activate`.
 *
 * The storage directory is read through the render side rather than captured, so a
 * download follows the folder somebody chose in setup instead of filling the one they
 * moved away from.
 */
let downloadIpc: DownloadIpc | null = null;

function startDownloads(render: RenderIpc): DownloadIpc {
    if (downloadIpc !== null) return downloadIpc;
    downloadIpc = installDownloadIpc({ storageDir: () => render.storageDirectory() });
    return downloadIpc;
}

/**
 * GitHub sign-in.
 *
 * Registered once, for the same reason rendering and downloading are. The session it
 * holds is the only thing in the process that has the token: the renderer is told who is
 * signed in and what that account may do, and never the credential itself.
 */
let githubIpc: GitHubIpc | null = null;

function startGitHubSignIn(): GitHubIpc {
    if (githubIpc !== null) return githubIpc;
    githubIpc = installGitHubIpc();
    return githubIpc;
}

async function createWindow(): Promise<void> {
    const baseUrl = await startEmbeddedServer();
    hardenSession(baseUrl);
    registerIpc();
    startDownloads(startRendering());
    startGitHubSignIn();

    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        // 800x600 is the narrowest width the interface is validated at, so it is also
        // the smallest the window may become. Below it, controls start overlapping.
        minWidth: 800,
        minHeight: 600,
        show: false,
        // Frameless: the operating system's title bar is not this product's chrome. The
        // renderer draws a Material one instead, which is the only way the window
        // furniture can follow the app's own theme, density and language.
        frame: false,
        autoHideMenuBar: true,
        backgroundColor: "#0B0E11",
        webPreferences: {
            preload: path.resolve(dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    // Maximised state can change without the app asking: the OS keyboard shortcut, a
    // drag to the top edge, a double click on the drag region. A title bar that only
    // updated when it was the one to act would sit there showing "maximise" on a
    // maximised window, so the state is pushed rather than polled.
    const sendMaximized = (): void => {
        if (!window.isDestroyed()) {
            window.webContents.send("window:maximizedChanged", window.isMaximized());
        }
    };
    window.on("maximize", sendMaximized);
    window.on("unmaximize", sendMaximized);
    window.on("enter-full-screen", sendMaximized);
    window.on("leave-full-screen", sendMaximized);

    // Every outward link, from here and from sign-in, goes through the same https-only
    // guard. One door means one place to get the scheme check right; see github/external.ts.
    window.webContents.setWindowOpenHandler(({ url }) => {
        void openExternalHttps(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(baseUrl)) event.preventDefault();
    });

    window.once("ready-to-show", () => window.show());
    await window.loadURL(`${baseUrl}/?token=${authToken}`);
}

/**
 * Starts the window, and if it cannot start, says so.
 *
 * `void createWindow()` swallowed every startup rejection. The packaged app shipped
 * without the renderer bundle, `resolveUiRoot` threw, the promise was discarded, and
 * the process sat there with no window and no message: indistinguishable from the
 * app not launching. A failure the user cannot see is worse than a crash, because a
 * crash at least tells them something happened.
 */
async function launch(): Promise<void> {
    try {
        await createWindow();
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[material-bluemap] startup failed:", error);
        dialog.showErrorBox(
            "Material BlueMap could not start",
            `${message}\n\nThis is a bug. Please report it with this message at\n` +
                `https://github.com/Ding-Ding-Projects/material-bluemap/issues`
        );
        app.exit(1);
    }
}

app.whenReady().then(() => {
    void launch();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void launch();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
