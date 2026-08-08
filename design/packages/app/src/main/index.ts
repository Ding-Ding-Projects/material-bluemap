import {
    app,
    autoUpdater,
    BrowserWindow,
    ipcMain,
    session,
    clipboard,
    dialog,
    shell,
} from "electron";
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
} from "@worldlens/server";
import { LocalMapHandler, defaultStorageDirectory } from "./render/index.js";
import { upstreamJavaEngine } from "./render/engine.js";
import { installRenderIpc } from "./render/ipc.js";
import type { RenderIpc } from "./render/ipc.js";
import { installDownloadIpc } from "./download/ipc.js";
import type { DownloadIpc } from "./download/ipc.js";
import { releaseTokenSource } from "./download/token.js";
import { totalmem } from "node:os";
import {
    createFileUpdateFeedHandoff,
    engineFromAutoUpdater,
    installUpdateIpc,
    resolveFeed,
    UPDATE_EVENT_CHANNEL,
    type InstalledUpdates,
} from "./update/index.js";
import {
    DownloadConcurrencyStore,
    RenderMemoryStore,
    registerFileHandlers,
    windowsMapStorageDefault,
} from "./files/index.js";
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
import {
    registerWorldSourceHandlers,
    registerSshWorldSourceHandlers,
    WORLD_SOURCE_SSH_EVENT_CHANNEL,
} from "./worldsource/index.js";
import type { WorldSourceIpc, WorldSourceSshIpc } from "./worldsource/index.js";
import { RemoteRenderOrchestrator, registerRemoteHandlers } from "./remote/index.js";
import type { RemoteIpc } from "./remote/index.js";
import {
    RemoteHostingOrchestrator,
    REMOTE_HOSTING_EVENT_CHANNEL,
    registerRemoteHostingHandlers,
} from "./remote/index.js";
import type { RemoteHostingIpc } from "./remote/index.js";
import { DOWNLOAD_EVENT_CHANNEL } from "./download/ipc.js";
import { RENDER_EVENT_CHANNEL } from "./render/ipc.js";
import { installCiRenderIpc } from "./cirender/ipc.js";
import type { CiRenderIpc } from "./cirender/ipc.js";
import { installPagesIpc, PAGES_EVENT_CHANNEL } from "./pages/index.js";
import type { PagesIpc } from "./pages/index.js";
import { installPreviewIpc, PreviewNetworkStore, PREVIEW_EVENT_CHANNEL } from "./preview/index.js";
import type { PreviewIpc } from "./preview/index.js";
import { installWorldRepoIpc, WORLD_REPO_EVENT_CHANNEL } from "./worldrepo/index.js";
import type { WorldRepoIpc } from "./worldrepo/index.js";
import { DOCKERWORLD_EVENT_CHANNEL, registerDockerWorldHandlers } from "./dockerworld/index.js";
import type { DockerWorldIpc } from "./dockerworld/index.js";
import {
    PROJECT_AUTOSAVE_EVENT_CHANNEL,
    registerProjectHandlers,
    wireAutosaveQuitFlush,
} from "./project/index.js";
import type { AutosaveOutcome, ProjectIpc } from "./project/index.js";
import { installBackupIpc } from "./backup/ipc.js";
import type { BackupIpc } from "./backup/ipc.js";
import { installGitHubIpc } from "./github/ipc.js";
import type { GitHubIpc } from "./github/ipc.js";
import { openExternalHttps } from "./github/external.js";
import { registerJavaHandlers, JAVA_PROVISION_EVENT_CHANNEL } from "./java/ipc.js";
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
import { registerSysdepHandlers, SYSDEP_INSTALL_EVENT_CHANNEL } from "./sysdeps/ipc.js";
import type { SysdepIpc } from "./sysdeps/ipc.js";
import { spawnProcessRunner } from "./sysdeps/process.js";
import { registerGhCliHandlers } from "./ghcli/ipc.js";
import type { GhCliIpc } from "./ghcli/ipc.js";
import { nodeProcessRunner } from "./cirender/gh.js";
import { LEGACY_MATERIAL_BLUEMAP_IDENTITY, WORLDLENS_IDENTITY } from "@worldlens/shared";
import { migrateWorldlensProfile } from "./migration/index.js";

const dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Pin storage to the immutable product identity before Electron initializes a renderer.
 * A user-configurable display name is renderer state and never reaches either call.
 */
const applicationDataDirectory = app.getPath("appData");
app.setName(WORLDLENS_IDENTITY.shippedName);
app.setPath("userData", join(applicationDataDirectory, WORLDLENS_IDENTITY.dataDirectoryName));

async function requestProfileMigrationConsent(): Promise<"accept" | "deny"> {
    const answer = await dialog.showMessageBox({
        type: "question",
        title: "Bring your existing profile to Worldlens?",
        message: "Worldlens found data from Material BlueMap.",
        detail:
            "Copy and verify your consent record, settings, GitHub credential references, projects, histories, " +
            "cache and maps for Worldlens. The old profile stays in place so this can be retried or rolled back.\n\n" +
            `Legacy profile folder: ${LEGACY_MATERIAL_BLUEMAP_IDENTITY.dataDirectorySegments.join("\\")}\n` +
            `Worldlens profile folder: ${WORLDLENS_IDENTITY.dataDirectoryName}`,
        buttons: ["Copy and verify", "Not now"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
    });
    return answer.response === 0 ? "accept" : "deny";
}

async function prepareWorldlensProfile(): Promise<boolean> {
    const outcome = await migrateWorldlensProfile({
        appDataDirectory: applicationDataDirectory,
        requestConsent: requestProfileMigrationConsent,
    });
    if (
        outcome.kind === "no-legacy-profile" ||
        outcome.kind === "already-migrated" ||
        outcome.kind === "denied" ||
        outcome.kind === "migrated"
    ) {
        console.info(`[worldlens] profile migration: ${outcome.kind}`);
        return true;
    }

    const detail =
        outcome.kind === "collision"
            ? `Both profiles contain different versions of: ${outcome.paths.join(", ")}. Neither profile was changed.`
            : outcome.message;
    console.error(`[worldlens] profile migration ${outcome.kind}: ${detail}`);
    dialog.showErrorBox(
        "Worldlens kept your old profile safe",
        `${detail}\n\nWorldlens did not open because continuing could hide or overwrite data. ` +
            "The Material BlueMap profile remains intact; correct the reported problem and start Worldlens again.",
    );
    return false;
}

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
        },
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
            remoteProxy.setProfile({
                id: profile.id,
                name: profile.name,
                baseUrl: profile.baseUrl,
            });
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
        // The heap ceiling somebody chose in Settings, read fresh for every render rather
        // than captured here - `files/renderMemory.ts`'s own store already re-reads the
        // machine's memory and the stored file on every call, so this is never stale.
        jvmArgs: () => getRenderMemoryStore().jvmArgs(),
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
        // The worker count somebody chose in Settings, read fresh for every download
        // rather than captured here - `files/downloadConcurrency.ts`'s own store already
        // re-reads its file on every call, so this is never stale.
        concurrency: () => getDownloadConcurrencyStore().concurrency(),
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
 * settings row can state a version somebody measured instead of one it inferred.
 * `java:runtime` never provisions on its own: asking what is installed must not
 * download two hundred megabytes as a side effect.
 *
 * `java:provision` is the separate, explicit action that does download one - gated on
 * consent already given (`java:acceptDownloadConsent`) and, like `bedrock:convert`,
 * reachable only from a button somebody pressed. `ensure: ensureJava` is passed in
 * directly: its return type carries more than `java/ipc.ts`'s own `JavaEnsureCallResult`
 * needs, which is fine, and its parameter type accepts everything that module ever
 * calls it with - see the doc comment on `JavaEnsureCallOptions` for why the two files
 * do not import each other's types to get there.
 */
let javaIpc: JavaIpc | null = null;

function startJavaDiscovery(): JavaIpc {
    if (javaIpc !== null) return javaIpc;
    javaIpc = registerJavaHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        ensure: ensureJava,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(JAVA_PROVISION_EVENT_CHANNEL, event);
            }
        },
    });
    return javaIpc;
}

/**
 * Installing git, the GitHub CLI, Docker Desktop and rsync through winget/Chocolatey,
 * one button, honest progress.
 *
 * Registered once, for the same reason everything above it is. `spawnProcessRunner` is
 * the one real child-process runner this whole layer uses - every dependency's presence
 * check, install and post-install verification goes through it, and every test in
 * `main/sysdeps/` drives a fake instead so nothing there ever launches a real `winget`
 * or `choco` on the machine running the suite.
 */
let sysdepIpc: SysdepIpc | null = null;

function startSysdepInstaller(): SysdepIpc {
    if (sysdepIpc !== null) return sysdepIpc;
    sysdepIpc = registerSysdepHandlers(ipcMain, {
        run: spawnProcessRunner,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(SYSDEP_INSTALL_EVENT_CHANNEL, event);
            }
        },
    });
    return sysdepIpc;
}

/**
 * The `gh` command-line tool's OWN accounts - a completely separate credential store from
 * `startGitHubSignIn()`'s above. Registered once, for the same reason everything else here
 * is. `nodeProcessRunner()` is the one real child-process runner this reuses, exactly as
 * `cirender/`'s own CI-render `gh` fallback already does; every test in `main/ghcli/` drives
 * a fake instead so nothing there ever spawns a real `gh` or touches this machine's real
 * active account.
 */
let ghCliIpc: GhCliIpc | null = null;

function startGhCliAccounts(): GhCliIpc {
    if (ghCliIpc !== null) return ghCliIpc;
    ghCliIpc = registerGhCliHandlers(ipcMain, {
        runner: nodeProcessRunner(),
        openExternal: openExternalHttps,
    });
    return ghCliIpc;
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
 *
 * `wireAutosaveQuitFlush` is hooked in at the same moment the handlers are, so a project with
 * an autosave pending is written and recorded before the application is allowed to exit - see
 * `project/autosave.ts` for what "pending" means and why an ordinary quit with nothing pending
 * is never delayed by this.
 */
let projectIpc: ProjectIpc | null = null;

function startProjects(): ProjectIpc {
    if (projectIpc !== null) return projectIpc;
    projectIpc = registerProjectHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
        autosave: {
            // Every autosave attempt, quiet or flushed, successful or not, is pushed to
            // every open window rather than kept inside the main process. The renderer's
            // own listener decides what to do with it - stay quiet for a routine success
            // and only interrupt for a failure or a restore, per the non-blocking
            // notification rules - but that decision needs the fact first, and this is
            // the one place the fact exists before it crosses the bridge.
            onAutosave: (outcome: AutosaveOutcome) => {
                for (const window of BrowserWindow.getAllWindows()) {
                    if (!window.isDestroyed())
                        window.webContents.send(PROJECT_AUTOSAVE_EVENT_CHANNEL, outcome);
                }
            },
        },
    });
    wireAutosaveQuitFlush(app, projectIpc.autosave);
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
    profilesHistoryIpc = registerProfilesHistoryHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
    });
    return profilesHistoryIpc;
}

function startAppSettingsHistory(): AppSettingsHistoryIpc {
    if (appSettingsHistoryIpc !== null) return appSettingsHistoryIpc;
    appSettingsHistoryIpc = registerAppSettingsHistoryHandlers(ipcMain, {
        dataDir: app.getPath("userData"),
    });
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
            // Both repositories are baked in by build.mjs. The current feed is always tried
            // first; the previous host is a bounded bridge fallback until this profile has
            // actually downloaded from the Worldlens feed. That proof is persisted below,
            // so the handoff does not depend on a repository redirect remaining in place.
            repository: __WORLDLENS_REPOSITORY__,
            legacyRepository: __WORLDLENS_LEGACY_REPOSITORY__,
            environment: process.env,
        }),
        engine: process.platform === "win32" ? engineFromAutoUpdater(autoUpdater) : null,
        feedHandoff: createFileUpdateFeedHandoff(app.getPath("userData")),
        renderInProgress: () => render.orchestrator.activeRenderIds().length > 0,
        broadcast: (state) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(UPDATE_EVENT_CHANNEL, state);
            }
        },
    });
    app.on("will-quit", () => updatesInstalled?.dispose());
}

/**
 * The persisted `-Xmx` ceiling, shared between the render channel (which applies it to
 * every render that does not specify its own) and the files channel (which reads and
 * writes the setting itself). One instance, constructed on first use by whichever of the
 * two runs first - `createWindow` always calls `startRendering()` before
 * `startFileAccess()`, but neither should have to assume that ordering forever.
 */
let renderMemory: RenderMemoryStore | null = null;
let downloadConcurrency: DownloadConcurrencyStore | null = null;
let filesRegistered = false;

function getRenderMemoryStore(): RenderMemoryStore {
    renderMemory ??= new RenderMemoryStore({
        dataDir: app.getPath("userData"),
        totalMemoryBytes: totalmem(),
    });
    return renderMemory;
}

/**
 * The persisted "how many parts at once" setting, shared the same way
 * {@link getRenderMemoryStore} is: `startDownloads` reads it on every download,
 * `startFileAccess` registers the channel that reads and writes it, and neither call
 * order is assumed - both create the one instance on whichever of them runs first.
 */
function getDownloadConcurrencyStore(): DownloadConcurrencyStore {
    downloadConcurrency ??= new DownloadConcurrencyStore({ dataDir: app.getPath("userData") });
    return downloadConcurrency;
}

function startFileAccess(render: RenderIpc): RenderMemoryStore {
    const memory = getRenderMemoryStore();
    const concurrency = getDownloadConcurrencyStore();
    if (filesRegistered) return memory;
    filesRegistered = true;
    registerFileHandlers(ipcMain, {
        shell,
        documents: { reported: app.getPath("documents"), home: app.getPath("home") },
        memory,
        downloadConcurrency: concurrency,
        roots: () => [
            {
                id: "maps",
                label: "the folder rendered maps go in",
                path: render.storageDirectory(),
            },
            { id: "data", label: "this app's own data folder", path: app.getPath("userData") },
        ],
    });
    return memory;
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
            return (
                github.accounts.listAccounts().accounts.find((entry) => entry.id === accountId)
                    ?.login ?? null
            );
        },
        mounts: localMaps,
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("cirender:event", event);
            }
        },
        broadcastBootstrap: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send("cirender:bootstrapEvent", event);
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
 * Watching a render live, in a real browser tab, while it is still running - on this
 * machine by default, and on another device on this network only on an explicit opt-in
 * given fresh every time the render screen offers it. See `main/preview/` for the server,
 * the loopback-by-default binding, and the one persisted setting this feature has (which
 * default the opt-in checkbox starts at, never whether exposure happens at all).
 *
 * Registered once, for the same reason everything above it is. `activeRenderIds` is read
 * through the orchestrator on every call rather than captured, so a hosted page's live-
 * status banner keeps tracking a render that is still writing tiles. `githubActiveRenderIds`
 * is the CI-render subsystem's own answer to "is this actually on this machine yet", which
 * is what lets `preview:availability` refuse the one route that genuinely cannot work -
 * nothing a GitHub Actions render writes is on this computer until it has been downloaded -
 * rather than showing a control that would sit there doing nothing.
 */
let previewIpc: PreviewIpc | null = null;
let previewNetworkStore: PreviewNetworkStore | null = null;

function getPreviewNetworkStore(): PreviewNetworkStore {
    previewNetworkStore ??= new PreviewNetworkStore({ dataDir: app.getPath("userData") });
    return previewNetworkStore;
}

function startPreviewHosting(render: RenderIpc, ciRender: CiRenderIpc): PreviewIpc {
    if (previewIpc !== null) return previewIpc;
    previewIpc = installPreviewIpc({
        ipcMain,
        storageDir: () => render.storageDirectory(),
        activeRenderIds: () => render.orchestrator.activeRenderIds(),
        githubActiveRenderIds: () => ciRender.sync.activeSyncIds(),
        network: getPreviewNetworkStore(),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed()) window.webContents.send(PREVIEW_EVENT_CHANNEL, event);
            }
        },
        // Deliberately not `openExternalHttps` from `github/external.ts` - that door is
        // https-only by design, and a loopback preview is `http://` on purpose. Safe here
        // regardless: see `preview/ipc.ts`'s own doc comment on `openExternal` for why this
        // channel never opens anything but its own server's own URL.
        openExternal: async (url) => {
            try {
                await shell.openExternal(url);
                return true;
            } catch {
                return false;
            }
        },
    });
    // Async, like every other dispose queued on `will-quit` here (see `startPagesHosting`
    // and `startEmbeddedServer` just above) - the point is that the listener is asked to
    // close rather than left orphaned holding its port, not that quitting waits for it.
    app.on("will-quit", () => void previewIpc?.dispose());
    return previewIpc;
}

/**
 * Keeping a Minecraft world in a git repository, so a render never has to re-zip it.
 *
 * Registered the same way `startPagesHosting` is, and for the same reason: `workRoot` is
 * under this application's own data directory, never inside a world, and a git directory
 * kept there stages against whatever folder the person points at directly - a several
 * -gigabyte world is synced without being copied first, and there is never a `.git`
 * inside somebody's actual world save.
 */
let worldRepoIpc: WorldRepoIpc | null = null;

function startWorldRepoHosting(): WorldRepoIpc {
    if (worldRepoIpc !== null) return worldRepoIpc;
    worldRepoIpc = installWorldRepoIpc({
        ipcMain,
        workRoot: () => join(app.getPath("userData"), "world-repos"),
        broadcast: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (window.isDestroyed()) continue;
                window.webContents.send(WORLD_REPO_EVENT_CHANNEL, event);
            }
        },
    });
    app.on("will-quit", () => worldRepoIpc?.dispose());
    return worldRepoIpc;
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

function startWorldSources(
    render: RenderIpc,
    downloads: DownloadIpc,
    github: GitHubIpc,
): WorldSourceIpc {
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
 * A world that already lives on a machine the person owns, read over SSH rather than
 * zipped up and carried here first.
 *
 * The same `known_hosts` the remote-render side writes, so a host key trusted for one is
 * trusted for the other rather than asking twice for the same machine. Progress and the
 * final result are broadcast on `WORLD_SOURCE_SSH_EVENT_CHANNEL`, a channel of this
 * feature's own - see `worldsource/sshFetcher.ts` for why it does not share the download
 * channel the GitHub world source uses.
 */
let sshWorldSourceIpc: WorldSourceSshIpc | null = null;

function startSshWorldSources(): WorldSourceSshIpc {
    if (sshWorldSourceIpc !== null) return sshWorldSourceIpc;
    sshWorldSourceIpc = registerSshWorldSourceHandlers(ipcMain, {
        knownHostsFile: join(app.getPath("userData"), "known_hosts"),
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(WORLD_SOURCE_SSH_EVENT_CHANNEL, event);
            }
        },
    });
    return sshWorldSourceIpc;
}

/**
 * Reading a world out of a Docker container or volume, without zipping it up first.
 *
 * Registered once, for the same reason everything above it is. The local daemon only -
 * see `dockerworld/ipc.ts`'s own doc comment for why a remote Docker host reached over SSH
 * is not wired to a button yet even though `DockerWorldFetcher` already supports one, and
 * Fetch results still resolve through invoke-and-await. The fetcher's actual phase and file
 * progress is also broadcast so the wizard never has to invent a percentage while waiting.
 */
let dockerWorldIpc: DockerWorldIpc | null = null;

function startDockerWorld(): DockerWorldIpc {
    if (dockerWorldIpc !== null) return dockerWorldIpc;
    dockerWorldIpc = registerDockerWorldHandlers(ipcMain, {
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(DOCKERWORLD_EVENT_CHANNEL, event);
            }
        },
    });
    return dockerWorldIpc;
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
 * Putting an already-rendered map on a Linux server the person owns, over SSH, in Docker,
 * and leaving it running.
 *
 * A sibling of `remoteIpc` above rather than a mode of it: a render finishes and stops on
 * its own, a hosted map is meant to keep answering after this application closes. See
 * `remote/hosting.ts`'s own top comment for the shape of that difference.
 */
let remoteHostingIpc: RemoteHostingIpc | null = null;

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
 * Hosting an already-rendered map on the person's own Linux server, over the same SSH
 * machinery a remote render uses.
 *
 * The engine is resolved the same way a remote render resolves it - the JRE and jar this
 * build ships - because hosting sends the same two things a render does: the world (the
 * engine builds a real map on every start, `-w` included) and the engine that reads it.
 */
function startRemoteHosting(render: RenderIpc): RemoteHostingIpc {
    if (remoteHostingIpc !== null) return remoteHostingIpc;
    const knownHostsFile = join(app.getPath("userData"), "known_hosts");
    const orchestrator = new RemoteHostingOrchestrator({
        storageDir: () => render.storageDirectory(),
        workRoot: () => join(app.getPath("userData"), "remote-hosting"),
        resolveEngine: upstreamJavaEngine({
            dataDir: app.getPath("userData"),
            resourcesPath: app.isPackaged ? process.resourcesPath : null,
        }),
        onEvent: (event) => {
            for (const window of BrowserWindow.getAllWindows()) {
                if (!window.isDestroyed())
                    window.webContents.send(REMOTE_HOSTING_EVENT_CHANNEL, event);
            }
        },
        knownHostsFile,
        userKnownHostsFile: join(homedir(), ".ssh", "known_hosts"),
    });
    remoteHostingIpc = registerRemoteHostingHandlers(ipcMain, { orchestrator });
    app.on("will-quit", () => remoteHostingIpc?.dispose());
    return remoteHostingIpc;
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
    const ciRender = startCiRenders(render, github, startBackups(render, github));
    startPagesHosting(render);
    startPreviewHosting(render, ciRender);
    startWorldRepoHosting();
    startWorldSources(render, downloads, github);
    startSshWorldSources();
    startDockerWorld();
    startRuntime(render);
    startRemoteRendering(render);
    startRemoteHosting(render);
    startWorldInspection();
    startJavaDiscovery();
    startSysdepInstaller();
    startGhCliAccounts();
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
        console.error("[worldlens] startup failed:", error);
        dialog.showErrorBox(
            "Worldlens could not start",
            `${message}\n\nThis is a bug. Please report it with this message at\n` +
                `https://github.com/Ding-Ding-Projects/worldlens/issues`,
        );
        app.exit(1);
    }
}

const ownsSingleInstance = app.requestSingleInstanceLock();

if (!ownsSingleInstance) {
    // Profile migration happens before any window or writable app-owned store is opened.
    // A second process must therefore stop here, before it can stage or cut over the same
    // profile while the owning process is validating its exact current manifest.
    app.quit();
} else {
    app.on("second-instance", () => {
        const window = BrowserWindow.getAllWindows()[0];
        if (window === undefined || window.isDestroyed()) return;
        if (window.isMinimized()) window.restore();
        window.show();
        window.focus();
    });

    app.whenReady().then(async () => {
        if (!(await prepareWorldlensProfile())) {
            app.exit(1);
            return;
        }
        await launch();
        app.on("activate", () => {
            if (BrowserWindow.getAllWindows().length === 0) void launch();
        });
    });

    app.on("window-all-closed", () => {
        if (process.platform !== "darwin") app.quit();
    });
}
