import { app, autoUpdater, BrowserWindow, ipcMain, session, clipboard, dialog, shell } from "electron";
import {
    acceptDownload,
    completeFirstRun,
    hasAcceptedDownload,
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
import { releaseTokenSource } from "./download/token.js";
import { totalmem } from "node:os";
import {
    engineFromAutoUpdater,
    installUpdateIpc,
    resolveFeed,
    UPDATE_EVENT_CHANNEL,
    type InstalledUpdates,
} from "./update/index.js";
import { RenderMemoryStore, registerFileHandlers, windowsMapStorageDefault } from "./files/index.js";
import { registerEulaHandlers } from "./eula/index.js";
import { join } from "node:path";
import { homedir } from "node:os";
import {
    ContainerHandoffStore,
    ContainerReattacher,
    localContainerAccess,
    localContainerList,
} from "./runtime/index.js";
import { registerRuntimeHandlers } from "./runtime/ipc.js";
import { containerAccessFor } from "./remote/index.js";
import { registerWorldSourceHandlers } from "./worldsource/index.js";
import type { WorldSourceIpc } from "./worldsource/index.js";
import { RemoteRenderOrchestrator, registerRemoteHandlers } from "./remote/index.js";
import type { RemoteIpc } from "./remote/index.js";
import { DOWNLOAD_EVENT_CHANNEL } from "./download/ipc.js";
import { RENDER_EVENT_CHANNEL } from "./render/ipc.js";
import { installCiRenderIpc } from "./cirender/ipc.js";
import type { CiRenderIpc } from "./cirender/ipc.js";
import { installPagesIpc, PAGES_EVENT_CHANNEL } from "./pages/index.js";
import type { PagesIpc } from "./pages/index.js";
import { registerProjectHandlers } from "./project/index.js";
import type { ProjectIpc } from "./project/index.js";
import { installBackupIpc } from "./backup/ipc.js";
import type { BackupIpc } from "./backup/ipc.js";
import { installGitHubIpc } from "./github/ipc.js";
import type { GitHubIpc } from "./github/ipc.js";
import { openExternalHttps } from "./github/external.js";
import { registerJavaHandlers } from "./java/ipc.js";
import type { JavaIpc } from "./java/ipc.js";
import { registerConfigHandlers } from "./config/index.js";
import type { ConfigIpc } from "./config/index.js";
import { registerHistoryHandlers } from "./history/index.js";
import type { HistoryIpc } from "./history/index.js";
import { registerProfilesHistoryHandlers } from "./profiles/index.js";
import type { ProfilesHistoryIpc } from "./profiles/index.js";
import { registerAppSettingsHistoryHandlers } from "./settings/index.js";
import type { AppSettingsHistoryIpc } from "./settings/index.js";
import { registerWorldHandlers } from "./world/index.js";
import type { WorldIpc } from "./world/index.js";
import { registerDialogHandlers } from "./dialogs/ipc.js";
import type { DialogIpc } from "./dialogs/ipc.js";
import { registerBedrockHandlers, BEDROCK_EVENT_CHANNEL } from "./bedrock/index.js";
import type { BedrockIpc } from "./bedrock/index.js";
import { registerRepairHandlers } from "./repair/index.js";
import type { RepairIpc } from "./repair/index.js";
import { ensureJava } from "./java/index.js";

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
        //
        // clipboard-sanitized-write is what the viewer's copy actions use. Denying it
        // made every copy in the map silently do nothing: no error, no refusal, just a
        // click that appeared to work. It was also inconsistent, because the app
        // already grants exactly this capability through the `clipboard:writeText`
        // IPC channel, so the web API was the only door being held shut.
        //
        // "sanitized" is the narrow variant: it writes text and known-safe types on an
        // explicit user action. Reading the clipboard is a different permission and
        // stays denied, because nothing here has a reason to look at what the user
        // copied somewhere else.
        const allowed = ["pointerLock", "fullscreen", "clipboard-sanitized-write"];
        callback(allowed.includes(permission));
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

/**
 * Guards the stateless handlers below against a second registration.
 *
 * `ipcMain.handle` throws on a channel that already has a handler, and `createWindow` is
 * not structurally once-only: the `activate` path calls it again whenever there are no
 * windows left. This product ships for Windows, where `activate` does not fire, so the
 * crash is unreachable today - but the guard costs a boolean, and the alternative is a
 * function whose safety depends on a platform detail held nowhere near it.
 *
 * The three stateful subsystems (`startRendering`, `startDownloads`,
 * `startWorldInspection`) each guard themselves the same way; this one did not.
 */
let ipcRegistered = false;

function registerIpc(): void {
    if (ipcRegistered) return;
    ipcRegistered = true;

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

    // Mojang's licence, fetched and cached so it can be read inside the app rather than
    // taken on trust. A reader only: the acceptance itself stays in `consent.ts`.
    registerEulaHandlers(ipcMain);

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

/**
 * The persisted `-Xmx` ceiling, shared between the render channel (which applies it to
 * every render that does not specify its own) and the files channel (which reads and
 * writes the setting itself). One instance, constructed on first use by whichever of the
 * two runs first - `createWindow` always calls `startRendering()` before
 * `startFileAccess()`, but neither should have to assume that ordering forever.
 */
let renderMemory: RenderMemoryStore | null = null;

function getRenderMemoryStore(): RenderMemoryStore {
    renderMemory ??= new RenderMemoryStore({
        dataDir: app.getPath("userData"),
        totalMemoryBytes: totalmem(),
    });
    return renderMemory;
}

function startRendering(): RenderIpc {
    // `createWindow` runs again on macOS `activate`, and `ipcMain.handle` throws when a
    // channel already has a handler. Registering once is the difference between
    // reopening the window and crashing while reopening it.
    if (renderIpc !== null) return renderIpc;

    const userData = app.getPath("userData");
    // Documents rather than the app's own data folder, because a tile tree is the person's
    // output rather than this application's state - and redirected out of OneDrive when
    // Windows has moved Documents there, with the reason carried alongside so the move is
    // explained rather than discovered. Only a profile that has never chosen a folder is
    // affected, so an existing install keeps its maps exactly where they are.
    const windowsDefault = windowsMapStorageDefault({
        reported: app.getPath("documents"),
        home: app.getPath("home"),
    });
    const storageDir = windowsDefault?.directory ?? defaultStorageDirectory(userData);
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
        // A lazy call to the repair singleton rather than the singleton itself, so this
        // does not care whether `startRepairDiagnostics()` has run yet - it is idempotent
        // (see its own doc comment) and creates itself on first call, which this becomes
        // the moment a render genuinely fails rather than at `createWindow`'s own ordering.
        rememberFailure: (evidence) => startRepairDiagnostics().remember(evidence),
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

function startDownloads(render: RenderIpc, github: GitHubIpc): DownloadIpc {
    if (downloadIpc !== null) return downloadIpc;
    downloadIpc = installDownloadIpc({
        storageDir: () => render.storageDirectory(),
        token: releaseTokenSource({ session: github.session }),
    });
    return downloadIpc;
}

/**
 * Backing a world or a rendered map up to GitHub.
 *
 * Registered once, for the same reason rendering, downloading and sign-in are. It stages
 * into the same folder downloads use, so a backup follows the storage directory somebody
 * chose in setup, and it borrows the downloader's token source so a backup runs under the
 * account signed in inside the application rather than only under `GH_TOKEN`.
 */
let backupIpc: BackupIpc | null = null;

function startBackups(render: RenderIpc, github: GitHubIpc): BackupIpc {
    if (backupIpc !== null) return backupIpc;
    backupIpc = installBackupIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        token: releaseTokenSource({ session: github.session }),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("backup:event", event);
            }
        },
        appVersion: app.getVersion(),
    });
    return backupIpc;
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

/**
 * Reading a folder well enough to tell a world from something that is not one.
 *
 * Registered once, for the same reason rendering, downloading and sign-in are:
 * `ipcMain.handle` throws on a channel that already has a handler, and `createWindow`
 * runs again on macOS `activate`.
 *
 * It holds nothing. The wizard asks about a folder, this reads that folder shallowly and
 * answers, and a folder it cannot read is refused by name rather than reported as an
 * empty one - which is the difference between sending somebody to look for a missing
 * `level.dat` and sending them to look at the path they typed.
 */
let worldIpc: WorldIpc | null = null;

function startWorldInspection(): WorldIpc {
    if (worldIpc !== null) return worldIpc;
    // `userData` is where the list of mounted Minecraft folders is kept, and the
    // executable's own directory is where a portable installation would put its
    // `.minecraft`. Both are passed in rather than read inside `world/`, so the whole
    // directory still runs, and is still tested, with no Electron and no real machine.
    worldIpc = registerWorldHandlers(ipcMain, {
        userDataDirectory: app.getPath("userData"),
        executableDirectory: path.dirname(process.execPath),
    });
    return worldIpc;
}

/**
 * Reporting the Java the app would render with.
 *
 * Registered once, for the same reason everything above it is. Discovery is the same
 * pass a render makes - `JAVA_HOME`, then `java` on `PATH`, then the copy the app
 * provisioned - and it *runs* each candidate rather than believing a path, so the
 * settings row can state a version somebody measured instead of one it inferred. It
 * never provisions: asking what is installed must not download two hundred megabytes.
 */
let javaIpc: JavaIpc | null = null;

function startJavaDiscovery(): JavaIpc {
    if (javaIpc !== null) return javaIpc;
    javaIpc = registerJavaHandlers(ipcMain, { dataDir: app.getPath("userData") });
    return javaIpc;
}

/**
 * Reading and writing a BlueMap config folder, for the options screen.
 *
 * Registered once, for the same reason everything above it is. It holds nothing and
 * caches nothing: every call reads or writes the folder it was handed, which is what lets
 * somebody edit a config in another program, come back, press Reload and see what is
 * really on disk.
 *
 * The folder is the capability, and the renderer does not get to widen it: a file name
 * that escapes the chosen folder, or that is not one of the config files BlueMap loads, is
 * refused rather than resolved. `dialog` is passed in rather than imported inside, so the
 * whole layer - native pickers included - is exercised by tests with no Electron runtime.
 */
let configIpc: ConfigIpc | null = null;

function startConfigEditing(): ConfigIpc {
    if (configIpc !== null) return configIpc;
    configIpc = registerConfigHandlers(ipcMain, { dataDir: app.getPath("userData"), dialog });
    return configIpc;
}

/**
 * The local version history of each config folder, for the history panel.
 *
 * Registered once, like everything above it. It holds nothing between calls: a repository
 * is derived from the folder it belongs to on every call, so installing Git, deleting a
 * history folder or opening a different project while the app is running all take effect
 * immediately rather than at the next restart.
 *
 * Every history lives in its own repository under `<userData>/config-history/`, never as a
 * `.git` inside the folder the person chose - see `main/history/store.ts` for why that
 * distinction is the whole design. Nothing is ever pushed anywhere: there is no remote and
 * no channel that could accept one.
 */
let historyIpc: HistoryIpc | null = null;

function startConfigHistory(): HistoryIpc {
    if (historyIpc !== null) return historyIpc;
    historyIpc = registerHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
    return historyIpc;
}

/**
 * A world's project file, and the local history of it.
 *
 * Registered once and holding nothing between calls, like the config history beside it. The
 * repository is derived from the world folder on every call and lives under the app's own
 * data directory - never as a `.git` inside somebody's world, which would drop an object
 * store next to their region files and change what every backup tool sees.
 */
let projectIpc: ProjectIpc | null = null;

function startProjects(): ProjectIpc {
    if (projectIpc !== null) return projectIpc;
    projectIpc = registerProjectHandlers(ipcMain, { dataDir: app.getPath("userData") });
    return projectIpc;
}

/**
 * The local version history of the server-profile / maps-and-servers list and of the
 * application's own settings.
 *
 * Registered the same way the config and project histories above are: once, holding nothing
 * between calls, each repository derived on every call from a fixed location beside the
 * application's data. `packages/ui/src/stores/profiles.ts` and the settings surfaces under
 * `packages/ui/src/components/settings/` do not call these channels yet - see
 * `docs/config-history.md` for the migration this is the main-process half of.
 */
let profilesHistoryIpc: ProfilesHistoryIpc | null = null;
let appSettingsHistoryIpc: AppSettingsHistoryIpc | null = null;

function startProfilesHistory(): ProfilesHistoryIpc {
    if (profilesHistoryIpc !== null) return profilesHistoryIpc;
    profilesHistoryIpc = registerProfilesHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
    return profilesHistoryIpc;
}

function startAppSettingsHistory(): AppSettingsHistoryIpc {
    if (appSettingsHistoryIpc !== null) return appSettingsHistoryIpc;
    appSettingsHistoryIpc = registerAppSettingsHistoryHandlers(ipcMain, { dataDir: app.getPath("userData") });
    return appSettingsHistoryIpc;
}

/**
 * Keeping the application current, and reaching the folders it owns.
 *
 * The installer has emitted the pair Electron's updater reads since it was configured and
 * nothing consumed it, so every release so far was an update nobody was offered.
 *
 * `renderInProgress` is a function rather than a value for the same reason `roots` is: both
 * are asked at the moment they matter. A render that started after the check would be hours
 * of work thrown away by a restart, and the maps folder can be moved while the app runs, so
 * a captured list would keep allowing the folder somebody left.
 */
let updatesInstalled: InstalledUpdates | null = null;

function startUpdates(render: RenderIpc): void {
    if (updatesInstalled !== null) return;
    updatesInstalled = installUpdateIpc(ipcMain, {
        currentVersion: app.getVersion(),
        feed: resolveFeed({
            packaged: app.isPackaged,
            platform: process.platform,
            arch: process.arch,
            version: app.getVersion(),
            repository: "Ding-Ding-Projects/material-bluemap",
            environment: process.env,
        }),
        engine: process.platform === "win32" ? engineFromAutoUpdater(autoUpdater) : null,
        renderInProgress: () => render.orchestrator.activeRenderIds().length > 0,
        broadcast: (state) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(UPDATE_EVENT_CHANNEL, state);
            }
        },
    });
    app.on("will-quit", () => updatesInstalled?.dispose());
}

let renderMemory: RenderMemoryStore | null = null;
let filesRegistered = false;

function startFileAccess(render: RenderIpc): RenderMemoryStore {
    renderMemory ??= new RenderMemoryStore({
        dataDir: app.getPath("userData"),
        totalMemoryBytes: totalmem(),
    });
    if (filesRegistered) return renderMemory;
    filesRegistered = true;
    registerFileHandlers(ipcMain, {
        shell,
        documents: { reported: app.getPath("documents"), home: app.getPath("home") },
        memory: renderMemory,
        roots: () => [
            { id: "maps", label: "the folder rendered maps go in", path: render.storageDirectory() },
            { id: "data", label: "this app's own data folder", path: app.getPath("userData") },
        ],
    });
    return renderMemory;
}

/**
 * Handing a render to GitHub's runners.
 *
 * It borrows rather than duplicates: the backup runner uploads the world, the download side
 * fetches the result, and the token comes from the same source the downloader uses. A second
 * uploader would be a second thing to keep correct about digests and resumption.
 *
 * `eulaAccepted` is a reader and nothing else. Mojang's acceptance is a real legal act that
 * lives in `consent.ts`; there is deliberately no channel here whose name could set it.
 */
let ciRenderIpc: CiRenderIpc | null = null;

function startCiRenders(render: RenderIpc, github: GitHubIpc, backup: BackupIpc): CiRenderIpc {
    if (ciRenderIpc !== null) return ciRenderIpc;
    const activeAccountToken = releaseTokenSource({ session: github.session });
    ciRenderIpc = installCiRenderIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        // Resolves the active account, `GH_TOKEN` and all, exactly as before whenever a
        // request names no account. Named explicitly - by the setup card's account picker
        // - the credential comes from that specific stored account's own token instead, via
        // `GitHubAccountsController.accessTokenFor`, without switching which account is
        // active anywhere else in the application. The token itself never crosses back to
        // the renderer either way.
        token: async (accountId) => {
            if (accountId === undefined || accountId === "") return await activeAccountToken();
            const result = await github.accounts.accessTokenFor(accountId);
            return result.ok ? result.token : null;
        },
        eulaAccepted: () => hasAcceptedDownload(),
        backup: backup.runner,
        account: (accountId) => {
            if (accountId === undefined || accountId === "") {
                return github.session.status().account?.login ?? null;
            }
            return github.accounts.listAccounts().accounts.find((entry) => entry.id === accountId)?.login ?? null;
        },
        mounts: localMaps,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("cirender:event", event);
            }
        },
        appVersion: app.getVersion(),
    });
    return ciRenderIpc;
}

/**
 * Publishing a locally rendered map to GitHub Pages.
 *
 * Registered once, for the same reason everything above it is. The storage directory is read
 * through the render side rather than captured, so it publishes the render somebody is
 * actually looking at rather than one in a folder they moved away from.
 *
 * `workRoot` is under this application's own data directory and never inside a render or a
 * world. Publishing stages through a git directory there, with the render's web root as the
 * work tree, so a several-gigabyte tile tree is pushed without being copied first and there is
 * never a `.git` inside somebody's rendered map.
 */
let pagesIpc: PagesIpc | null = null;

function startPagesHosting(render: RenderIpc): PagesIpc {
    if (pagesIpc !== null) return pagesIpc;
    pagesIpc = installPagesIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        workRoot: () => join(app.getPath("userData"), "pages-hosting"),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send(PAGES_EVENT_CHANNEL, event);
            }
        },
    });
    app.on("will-quit", () => pagesIpc?.dispose());
    return pagesIpc;
}

/**
 * Worlds published as somebody else's release, including the split ones.
 *
 * Broadcast on the DOWNLOAD channel and handed the downloader the panel already lists,
 * both deliberately: a world fetched from another repository is a download like any other,
 * and a second instance or a second channel would mean a second list, with a transfer in
 * one of them that the other could neither show nor stop.
 */
let worldSourceIpc: WorldSourceIpc | null = null;

function startWorldSources(render: RenderIpc, downloads: DownloadIpc, github: GitHubIpc): WorldSourceIpc {
    if (worldSourceIpc !== null) return worldSourceIpc;
    worldSourceIpc = registerWorldSourceHandlers(ipcMain, {
        storageDir: () => render.storageDirectory(),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(DOWNLOAD_EVENT_CHANNEL, event);
            }
        },
        token: releaseTokenSource({ session: github.session }),
        downloader: downloads.downloader,
    });
    return worldSourceIpc;
}

/**
 * Handing a render to a Linux machine over SSH.
 *
 * Reports on the RENDER channel for the same reason: a remote render appears in the same
 * list, moves the same bar and is stopped by the same button as a local one.
 *
 * Two `known_hosts` are read - this application's own and the user's - and only the
 * application's is ever written, so trusting a host here never edits a file the rest of
 * their SSH depends on.
 */
let remoteIpc: RemoteIpc | null = null;

/**
 * The record that lets a container outlive the application that started it.
 *
 * Shared by the local Docker path and the remote one on purpose. A container is a
 * container: whichever daemon owns it, the app needs the same four facts to pick it back
 * up - its name, its host, what it was rendering and where the output belongs - and two
 * stores would mean a render that one half of the app could resume and the other could not.
 */
let containerHandoff: ContainerHandoffStore | null = null;

function handoffStore(render: RenderIpc): ContainerHandoffStore {
    // The render IPC builds one and uses it for container renders. Building a second here
    // would give the two halves different instance ids, and a container render currently in
    // flight would then appear in the "left behind by an earlier session" offer list -
    // inviting somebody to reattach to a render that is already running in front of them.
    containerHandoff ??= render.containers;
    return containerHandoff;
}

/**
 * Docker's state, the runnable modes, and containers left behind by an earlier session.
 *
 * Reattaching reports on the RENDER channel rather than one of its own, because a picked-up
 * render is a render: same list, same bar, same cancel button. A second channel would mean a
 * second list, and a render in one of them that the other could neither show nor stop.
 */
let runtimeIpc: { dispose(): void } | null = null;

function startRuntime(render: RenderIpc): void {
    if (runtimeIpc !== null) return;
    const knownHostsFile = join(app.getPath("userData"), "known_hosts");
    const reattacher = new ContainerReattacher({
        store: handoffStore(render),
        access: containerAccessFor({
            local: localContainerAccess(),
            remote: { knownHostsFile, userKnownHostsFile: join(homedir(), ".ssh", "known_hosts") },
        }),
        listContainers: localContainerList(),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(RENDER_EVENT_CHANNEL, event);
            }
        },
    });
    runtimeIpc = registerRuntimeHandlers(ipcMain, { reattacher });
    app.on("will-quit", () => runtimeIpc?.dispose());
}

function startRemoteRendering(render: RenderIpc): RemoteIpc {
    if (remoteIpc !== null) return remoteIpc;
    const knownHostsFile = join(app.getPath("userData"), "known_hosts");
    const orchestrator = new RemoteRenderOrchestrator({
        storageDir: () => render.storageDirectory(),
        resolveEngine: upstreamJavaEngine({
            dataDir: app.getPath("userData"),
            resourcesPath: app.isPackaged ? process.resourcesPath : null,
        }),
        hasConsent: hasAcceptedDownload,
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(RENDER_EVENT_CHANNEL, event);
            }
        },
        knownHostsFile,
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
        // Without this a remote render still works and simply cannot be picked up again.
        handoff: handoffStore(render),
    });
    remoteIpc = registerRemoteHandlers(ipcMain, { orchestrator, knownHostsFile });
    return remoteIpc;
}

/**
 * The one native folder/file picker every path field in the app browses through.
 *
 * Registered once, for the same reason everything above it is. Screen-agnostic on purpose:
 * unlike `config:pickDirectory`/`config:pickFile`, this needs no `provideConfigHost()`
 * ancestor, so Settings, Backup and the remote target editor can browse for a path exactly as
 * the world and config screens already do. `BrowserWindow.fromWebContents` is resolved fresh
 * per request rather than captured, so the picker is always modal to the window that actually
 * asked for it.
 */
let dialogIpc: DialogIpc | null = null;

function startPathDialogs(): DialogIpc {
    if (dialogIpc !== null) return dialogIpc;
    dialogIpc = registerDialogHandlers(ipcMain, {
        dialog,
        resolveWindow: (event) => BrowserWindow.fromWebContents(event.sender),
    });
    return dialogIpc;
}

/**
 * Bedrock world conversion, via Chunker.
 *
 * Registered once, for the same reason everything above it is. `resolveJava` reuses this
 * app's existing Temurin discovery rather than growing a second Java story of its own:
 * Chunker needs Java 17 or newer, which this app's own render requirement already exceeds.
 * Provisioning is left off here, matching `ensureJava`'s own default - asking whether a
 * world can be converted must not be the reason two hundred megabytes leave the machine.
 */
let bedrockIpc: BedrockIpc | null = null;

function startBedrockConversion(): BedrockIpc {
    if (bedrockIpc !== null) return bedrockIpc;
    bedrockIpc = registerBedrockHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        appVersion: app.getVersion(),
        resolveJava: async () => {
            try {
                const java = await ensureJava({ dataDir: app.getPath("userData") });
                return {
                    ok: true,
                    executable: java.installation.executable,
                    version: java.installation.version.version,
                };
            } catch (error) {
                return {
                    ok: false,
                    message: error instanceof Error ? error.message : String(error),
                };
            }
        },
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(BEDROCK_EVENT_CHANNEL, event);
            }
        },
    });
    return bedrockIpc;
}

/**
 * Diagnosing why a render or the web server would not start, and repairing what can be
 * repaired.
 *
 * Registered once, for the same reason everything above it is - see `repair/index.ts` for
 * the two-halves design this hands off to. `allowAgent` is left at its default (never) here
 * because Settings has no control for it yet: leaving the guardrailed agent pass unreachable
 * until something can actually turn it on is the safe default, not a gap.
 */
let repairIpc: RepairIpc | null = null;

function startRepairDiagnostics(): RepairIpc {
    if (repairIpc !== null) return repairIpc;
    repairIpc = registerRepairHandlers(ipcMain);
    return repairIpc;
}

async function createWindow(): Promise<void> {
    const baseUrl = await startEmbeddedServer();
    hardenSession(baseUrl);
    registerIpc();
    const render = startRendering();
    const github = startGitHubSignIn();
    const downloads = startDownloads(render, github);
    startBackups(render, github);
    startCiRenders(render, github, startBackups(render, github));
    startPagesHosting(render);
    startWorldSources(render, downloads, github);
    startRuntime(render);
    startRemoteRendering(render);
    startWorldInspection();
    startJavaDiscovery();
    startConfigEditing();
    startConfigHistory();
    startProjects();
    startProfilesHistory();
    startAppSettingsHistory();
    startFileAccess(render);
    startUpdates(render);
    startPathDialogs();
    startBedrockConversion();
    startRepairDiagnostics();

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
