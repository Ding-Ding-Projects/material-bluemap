import { app, BrowserWindow, ipcMain, session, shell, clipboard } from "electron";
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

async function startEmbeddedServer(): Promise<string> {
    const server = new HttpServer({ host: "127.0.0.1", port: 0, authToken });
    server.addHandler(remoteProxy);
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
}

async function createWindow(): Promise<void> {
    const baseUrl = await startEmbeddedServer();
    hardenSession(baseUrl);
    registerIpc();

    const window = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: "#0B0E11",
        webPreferences: {
            preload: path.resolve(dirname, "../preload/index.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
    });
    window.webContents.on("will-navigate", (event, url) => {
        if (!url.startsWith(baseUrl)) event.preventDefault();
    });

    window.once("ready-to-show", () => window.show());
    await window.loadURL(`${baseUrl}/?token=${authToken}`);
}

app.whenReady().then(() => {
    void createWindow();
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});
