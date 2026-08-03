import { contextBridge, ipcRenderer } from "electron";
import type { IpcRendererEvent } from "electron";

/** Mirrors `ConsentRecord` in the main process. */
export interface ConsentRecord {
    accepted: boolean;
    acceptedAt: string | null;
    documentUrl: string;
    termsVersion: number;
    appVersion: string | null;
}

export interface FirstRunState {
    completed: boolean;
    completedAt: string | null;
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the render types in `main/render/`.
 *
 * Restated rather than imported because the preload is bundled separately from the main
 * process and importing across that boundary would pull `node:child_process` and the
 * whole orchestrator into the renderer's bundle.
 */
export interface RenderMapRequest {
    id: string;
    world: string;
    name?: string;
    dimension?: string;
    sorting?: number;
    startPos?: { x: number; z: number };
}

export interface RenderRequest {
    maps: RenderMapRequest[];
    renderId?: string;
    force?: boolean;
    fixEdges?: boolean;
    metrics?: boolean;
    renderThreads?: number;
}

/** Where the interface should send somebody to fix a failure. */
export interface SettingsTarget {
    surface: "settings";
    anchor: "mojang-download-consent" | "java-runtime" | "map-storage-directory" | "world-folder";
    missing: boolean;
}

export interface RenderFailure {
    code: string;
    message: string;
    settings: SettingsTarget | null;
    detail: string | null;
    exitCode: number | null;
}

export interface RenderTaskProgress {
    kind: string;
    mapId: string | null;
    description: string;
    percent: number;
    etaSeconds: number | null;
    etaText: string | null;
}

export interface EngineDescription {
    id: "upstream-java" | "typescript";
    label: string;
    version: string;
    javaVersion: string | null;
}

export type RenderEvent =
    | { type: "started"; renderId: string; mapIds: string[]; engine: EngineDescription; at: string }
    | { type: "phase"; renderId: string; phase: string; at: string }
    | {
          type: "progress";
          renderId: string;
          phase: string;
          task: RenderTaskProgress;
          at: string;
      }
    | { type: "log"; renderId: string; level: string; message: string; at: string }
    | {
          type: "finished";
          renderId: string;
          dataRoot: string;
          mapIds: string[];
          engine: EngineDescription;
          durationMs: number;
          at: string;
      }
    | { type: "failed"; renderId: string; failure: RenderFailure; at: string }
    | { type: "cancelled"; renderId: string; at: string };

export type RenderResult =
    | {
          ok: true;
          renderId: string;
          dataRoot: string;
          mapIds: string[];
          engine: EngineDescription;
          durationMs: number;
      }
    | { ok: false; renderId: string; failure: RenderFailure };

/** Mirrors `RenderSessionMap` in `main/render/session.ts`. */
export interface InterruptedRenderMap {
    id: string;
    world: string;
    dimension: string;
    name: string;
}

/**
 * A render that stopped without finishing, and could be carried on.
 *
 * Mirrors `InterruptedRenderSummary` in `main/render/resume.ts`. `reason` is what keeps a
 * cancellation from being shown as a crash: somebody who pressed Cancel got what they
 * asked for, and telling them something went wrong would be untrue.
 */
export interface InterruptedRenderSummary {
    renderId: string;
    reason: "cancelled" | "failed" | "process-gone";
    maps: InterruptedRenderMap[];
    startedAt: string;
    /** Null for a crash, which never got to write one. */
    interruptedAt: string | null;
    /** The last percentage seen, or null when it died before the first progress line. */
    percent: number | null;
    description: string | null;
    engine: string;
    /** One sentence of facts for the offer. The interface styles it. */
    message: string;
}

/** Mirrors `ResumeRefused` in `main/render/resume.ts`. */
export interface ResumeRefused {
    ok: false;
    renderId: string;
    code: "no-session" | "not-interrupted" | "already-running" | "config-changed";
    /** Says what is wrong and what would fix it. Shown as written. */
    message: string;
}

export type ResumeResult =
    | { started: true; result: RenderResult }
    | { started: false; refusal: ResumeRefused };

export interface RenderSummary {
    renderId: string;
    outcome: "running" | "finished" | "failed" | "cancelled";
    /** e.g. `BlueMap engine (Java) 5.22-27 on Java 25.0.3`. */
    engine: string;
    engineId: "upstream-java" | "typescript";
    maps: { id: string; name: string; world: string; dimension: string }[];
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
    dataRoot: string | null;
}

/* -------------------------------------------------------------------------- */
/* Downloading                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the download types in `main/download/`.
 *
 * Restated rather than imported, for the same reason the render types above are: the
 * preload is bundled separately, and importing across that boundary would pull the
 * archive joiner, the zip reader and `node:fs` into the renderer's bundle.
 */
export interface DownloadRequest {
    owner: string;
    repo: string;
    /** A tag, or `latest` (the default). */
    tag?: string;
    /** The name the download presents, e.g. `world.zip`, split or not. */
    asset?: string;
    /** Unpack the archive afterwards. Defaults to true for a `.zip`. */
    extract?: boolean;
}

export type DownloadPhase = "resolving" | "downloading" | "joining" | "extracting" | "finished";

export interface DownloadFailure {
    code: string;
    message: string;
    settings: SettingsTarget | null;
    detail: string | null;
    status: number | null;
}

export interface DownloadTaskProgress {
    phase: DownloadPhase;
    description: string;
    bytesDone: number;
    bytesTotal: number;
    partsDone: number;
    partsTotal: number;
    /** The part being transferred, or null between parts. */
    currentPart: string | null;
    /** 0 to 100, across every phase. An estimate; the byte counts are exact. */
    percent: number;
    etaSeconds: number | null;
    etaText: string | null;
}

export type DownloadEvent =
    | {
          type: "started";
          downloadId: string;
          asset: string;
          release: string;
          parts: number;
          bytesTotal: number;
          at: string;
      }
    | { type: "phase"; downloadId: string; phase: DownloadPhase; at: string }
    | {
          type: "progress";
          downloadId: string;
          phase: DownloadPhase;
          task: DownloadTaskProgress;
          at: string;
      }
    | {
          type: "log";
          downloadId: string;
          level: "info" | "warning" | "error";
          message: string;
          at: string;
      }
    | {
          type: "finished";
          downloadId: string;
          archive: string;
          content: string | null;
          bytes: number;
          sha256: string;
          durationMs: number;
          at: string;
      }
    | { type: "failed"; downloadId: string; failure: DownloadFailure; at: string }
    | { type: "cancelled"; downloadId: string; at: string };

export type DownloadResult =
    | {
          ok: true;
          downloadId: string;
          archive: string;
          content: string | null;
          bytes: number;
          sha256: string;
          durationMs: number;
      }
    | { ok: false; downloadId: string; failure: DownloadFailure };

export interface DownloadSummary {
    downloadId: string;
    asset: string;
    repository: string;
    tag: string;
    outcome: "running" | "finished" | "failed" | "cancelled";
    bytes: number;
    parts: number;
    /** True when the asset was published in pieces and rejoined on this machine. */
    split: boolean;
    archive: string;
    content: string | null;
    startedAt: string;
    finishedAt: string | null;
    durationMs: number | null;
}

export interface DiscoveredRelease {
    tag: string;
    name: string;
    htmlUrl: string;
    downloads: { name: string; split: boolean; parts: number; bytes: number }[];
}

/* -------------------------------------------------------------------------- */
/* GitHub sign-in                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the types in `main/github/`, restated for the same reason the render types
 * are: the preload is bundled separately, and importing across that boundary would drag
 * the credential store and the whole OAuth flow into the renderer's bundle.
 *
 * The token is deliberately absent from every type here. The renderer is told who is
 * signed in, what that account may do and whether it was stored; the credential itself
 * never leaves the main process, which is the only side that talks to GitHub.
 */
export interface GitHubAccount {
    login: string;
    userId: number | null;
    name: string | null;
    scopes: string[];
    /**
     * False for a GitHub App user token and for a fine-grained personal access token,
     * neither of which reports a scope list. It is not a gap: an App's permissions live
     * on the App and on the repositories it was installed on.
     */
    scopesReported: boolean;
    source: "github-app" | "oauth-app" | "personal-access-token";
    signedInAt: string;
    /** Null when the token does not expire, which is the normal OAuth App answer. */
    expiresAt: string | null;
    /** True when the sign-in can renew itself without the person doing anything. */
    refreshable: boolean;
    /** False when this machine has no credential store; the sign-in lasts this run only. */
    persisted: boolean;
    warnings: string[];
}

export interface GitHubFailure {
    code: string;
    message: string;
    /** Populated for `insufficient-scopes`, so the interface can name them. */
    missingScopes: string[];
    /**
     * True when signing in with the OAuth application instead would likely work. The
     * screen offers that rather than leaving somebody at a dead end.
     */
    offerOAuthFallback: boolean;
}

/**
 * Whether the signed-in account can reach a repository.
 *
 * The `app-not-installed` case is the one worth handling by name. GitHub answers 404
 * both for a repository that does not exist and for one a GitHub App has not been given,
 * so "not found" is the most misleading true thing the app could say.
 */
export type GitHubRepositoryAccess =
    | { ok: true; fullName: string; private: boolean }
    | {
          ok: false;
          failure: {
              code:
                  | "app-not-installed"
                  | "not-found"
                  | "forbidden"
                  | "invalid-token"
                  | "network"
                  | "http";
              message: string;
              manageUrl: string | null;
              offerOAuthFallback: boolean;
          };
      };

export type GitHubSignInResult = { ok: true; account: GitHubAccount } | { ok: false; failure: GitHubFailure };

export interface GitHubSignOutResult {
    signedOut: boolean;
    /** True only when GitHub confirmed the revocation, never merely because it was asked. */
    revoked: boolean;
    reason: string | null;
    manageUrl: string | null;
}

export interface GitHubStatus {
    signedIn: boolean;
    account: GitHubAccount | null;
    /** False when this build has no client configured; only the token path is available. */
    clientConfigured: boolean;
    /** Which of the two registered clients this build signs in with. */
    clientKind: "app" | "oauth" | null;
    encryptionAvailable: boolean;
    requiredScopes: string[];
    signingIn: boolean;
}

/**
 * What the sign-in screen is told while it waits.
 *
 * `code` carries `expiresAt` because the screen has to show the time left. A user code
 * lives about fifteen minutes; a screen that shows the code with no clock and keeps
 * spinning after it dies is indistinguishable from a hang. When it expires the poll
 * stops on its own and a `failed` event with code `expired` arrives, which is the cue to
 * offer a fresh code rather than keep waiting.
 */
export type GitHubAuthEvent =
    | {
          type: "code";
          /** Shown exactly as it arrives, hyphen included: it is what the person types. */
          userCode: string;
          verificationUri: string;
          verificationUriComplete: string | null;
          expiresAt: string;
          expiresInSeconds: number;
          intervalSeconds: number;
          /** False when the browser could not be opened; show the address instead. */
          browserOpened: boolean;
      }
    | { type: "waiting"; secondsRemaining: number; intervalSeconds: number }
    | { type: "signed-in"; account: GitHubAccount }
    | { type: "failed"; failure: GitHubFailure }
    | { type: "cancelled" }
    | { type: "signed-out" };

export interface MaterialBlueMapBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;

    /**
     * Mojang download consent.
     *
     * Asked once, during first-run setup, and remembered afterwards. Nothing in the
     * app may ask again: a render that needs consent and does not have it reports
     * what is missing and points at the setting, rather than putting a licence in
     * front of somebody who is halfway through a task.
     */
    readConsent(): Promise<ConsentRecord>;
    acceptDownload(): Promise<ConsentRecord>;
    revokeDownloadConsent(): Promise<ConsentRecord>;

    /** True only on the very first launch. The shell shows setup when it is. */
    needsFirstRun(): Promise<boolean>;
    /** Called when setup finishes, whichever way consent was answered. */
    completeFirstRun(): Promise<FirstRunState>;

    /**
     * Renders a world locally, with upstream BlueMap's engine.
     *
     * Resolves when the render has ended, whichever way it ended. It never rejects and
     * never asks for consent: a render without it comes back `ok: false` with
     * `failure.code === "consent-required"` and the settings row to send somebody to.
     * Watch `onRenderEvent` for progress in the meantime.
     */
    startRender(request: RenderRequest): Promise<RenderResult>;

    /** Stops a running render. False when nothing is running under that id. */
    cancelRender(renderId: string): Promise<boolean>;

    /** Render ids in flight right now. */
    activeRenders(): Promise<string[]>;

    /** Every render on disk, finished or not, with the engine that produced it. */
    listRenders(): Promise<RenderSummary[]>;

    /**
     * Renders that were cut off and could be carried on, newest first.
     *
     * Ask on launch. A render of a large world takes hours, and the app closing, the
     * machine sleeping or the power going out in the middle of one must not cost the work
     * already done. This never restarts anything and never discards anything: it reports
     * what was left unfinished and how far it got, and the person decides.
     */
    interruptedRenders(): Promise<InterruptedRenderSummary[]>;

    /**
     * Carries an interrupted render on from where it stopped.
     *
     * Re-runs the same render against the tiles already on disk, so BlueMap's own
     * incremental storage skips everything it has already done. Nothing is deleted.
     *
     * Pass `maps` when the interface has its own idea of the settings to render with: a
     * change since the render died is refused with `code: "config-changed"` and a message
     * explaining that old tiles and new settings would produce a map that is half one and
     * half the other. Omit it to resume with exactly the settings the render started with.
     */
    resumeRender(renderId: string, maps?: RenderMapRequest[]): Promise<ResumeResult>;

    /** Declines a resume offer, so it is made once rather than at every launch. */
    dismissResume(renderId: string): Promise<boolean>;

    /**
     * Which engine rendered a given map, and when.
     *
     * The app never switches renderer silently, and this is how the interface can show
     * that rather than merely promise it.
     */
    renderEngine(renderId: string): Promise<RenderSummary | null>;

    /**
     * The real absolute folder maps are written to, and the default.
     *
     * The renderer has no home directory, so it can only show `%APPDATA%\...` or `~/...`
     * until the main process resolves it. This is that resolution.
     */
    mapStorageDirectory(): Promise<{ current: string; default: string }>;

    /** Points rendering at a different folder. Reports why rather than substituting one. */
    setMapStorageDirectory(
        value: string,
    ): Promise<{ ok: true; directory: string } | { ok: false; message: string }>;

    /**
     * Subscribes to render progress. Returns the unsubscribe function.
     *
     * Pushed rather than polled because a render takes minutes and moves in ten-second
     * steps: a spinner for four minutes is indistinguishable from a hang.
     */
    onRenderEvent(listener: (event: RenderEvent) => void): () => void;

    /* ---------------------------------------------------------------------- */
    /* Downloading large worlds and maps                                       */
    /* ---------------------------------------------------------------------- */

    /**
     * What a release offers, without downloading any of it.
     *
     * A file too large for a release asset is published in pieces - `world.zip.001`,
     * `world.zip.002`, ... beside a `world.zip.parts.json` - and this reports it as the
     * one download it really is. `split` and `parts` are there so the interface can say
     * so; nothing else about the split reaches the renderer.
     */
    discoverRelease(request: {
        owner: string;
        repo: string;
        tag?: string;
    }): Promise<
        | { ok: true; release: DiscoveredRelease }
        | { ok: false; message: string }
    >;

    /**
     * Downloads one asset, rejoins it if it was split, and unpacks it.
     *
     * Resolves when the download has ended, whichever way it ended, and never rejects.
     * A failure comes back `ok: false` with a typed `failure.code`. Watch
     * `onDownloadEvent` for progress in the meantime.
     *
     * A public release needs no token. `GH_TOKEN` is used when the environment has one.
     */
    startDownload(request: DownloadRequest): Promise<DownloadResult>;

    /**
     * Stops a running download. False when nothing is running under that id.
     *
     * What is on disk is kept, because every part is checksummed individually and the
     * next attempt continues from the byte this one stopped at.
     */
    cancelDownload(downloadId: string): Promise<boolean>;

    /** Download ids in flight right now. */
    activeDownloads(): Promise<string[]>;

    /** Every download on disk, with what it was and where it came from. */
    listDownloads(): Promise<DownloadSummary[]>;

    /**
     * Subscribes to download progress. Returns the unsubscribe function.
     *
     * Pushed rather than polled for the same reason render progress is: a twenty
     * gigabyte world takes tens of minutes, and a spinner for tens of minutes is
     * indistinguishable from a hang.
     */
    onDownloadEvent(listener: (event: DownloadEvent) => void): () => void;

    /* ---------------------------------------------------------------------- */
    /* GitHub sign-in                                                          */
    /* ---------------------------------------------------------------------- */

    /**
     * Who is signed in, and what this machine can do about it.
     *
     * Reads stored metadata rather than the token, so asking costs nothing and never
     * prompts a credential store. `clientConfigured` false means the browser sign-in is
     * unavailable in this build and only the token path is offered;
     * `encryptionAvailable` false means a sign-in will not survive a restart, which the
     * screen should say before somebody signs in rather than after.
     */
    githubStatus(): Promise<GitHubStatus>;

    /**
     * Starts the browser sign-in and resolves when it is over, whichever way it went.
     *
     * This can take as long as somebody takes to reach their phone, so watch
     * `onGitHubAuthEvent` for the code, the countdown and the outcome. It never rejects:
     * a refusal comes back `ok: false` with a typed `failure.code`.
     *
     * `useOAuthFallback` switches from the GitHub App to the OAuth application. Offer it
     * when a failure comes back with `offerOAuthFallback`, which happens when the App has
     * not been installed on the repository somebody is trying to render.
     */
    githubSignIn(options?: { useOAuthFallback?: boolean }): Promise<GitHubSignInResult>;

    /** Stops a sign-in that is waiting for approval. False when none is running. */
    githubCancelSignIn(): Promise<boolean>;

    /**
     * Signs in with a personal access token, checking it before believing it.
     *
     * The token is checked against the API on the way in, so a wrong or over-scoped one
     * is reported here by name rather than at the first render. The token crosses to the
     * main process and is never handed back.
     */
    githubSignInWithToken(token: string): Promise<GitHubSignInResult>;

    /**
     * Deletes the stored token and attempts to revoke it.
     *
     * `revoked` is true only when GitHub confirmed it. A desktop application holds no
     * client secret, and GitHub's revocation endpoint requires one, so on a shipped build
     * the honest answer is usually false with a reason and a link to finish the job.
     */
    githubSignOut(): Promise<GitHubSignOutResult>;

    /**
     * Whether the signed-in account can actually reach a repository.
     *
     * Worth asking before a render rather than during one. A GitHub App only sees the
     * repositories it was installed on, and GitHub reports one it has not been given as
     * "not found", so somebody sent that message goes looking for a spelling mistake
     * instead of at the installation settings.
     */
    githubCheckRepository(owner: string, repo: string): Promise<GitHubRepositoryAccess>;

    /** Subscribes to sign-in progress. Returns the unsubscribe function. */
    onGitHubAuthEvent(listener: (event: GitHubAuthEvent) => void): () => void;
}

const bridge: MaterialBlueMapBridge = {
    syncProfiles: (profiles) => ipcRenderer.invoke("profiles:sync", profiles),
    writeClipboardText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
    getVersion: () => ipcRenderer.invoke("app:version"),

    readConsent: () => ipcRenderer.invoke("consent:read"),
    acceptDownload: () => ipcRenderer.invoke("consent:accept"),
    revokeDownloadConsent: () => ipcRenderer.invoke("consent:revoke"),

    needsFirstRun: () => ipcRenderer.invoke("firstRun:needed"),
    completeFirstRun: () => ipcRenderer.invoke("firstRun:complete"),

    startRender: (request) => ipcRenderer.invoke("render:start", request),
    cancelRender: (renderId) => ipcRenderer.invoke("render:cancel", renderId),
    activeRenders: () => ipcRenderer.invoke("render:active"),
    listRenders: () => ipcRenderer.invoke("render:list"),
    interruptedRenders: () => ipcRenderer.invoke("render:interrupted"),
    resumeRender: (renderId, maps) => ipcRenderer.invoke("render:resume", renderId, maps),
    dismissResume: (renderId) => ipcRenderer.invoke("render:dismissResume", renderId),
    renderEngine: (renderId) => ipcRenderer.invoke("render:engine", renderId),
    mapStorageDirectory: () => ipcRenderer.invoke("render:storageDirectory"),
    setMapStorageDirectory: (value) => ipcRenderer.invoke("render:setStorageDirectory", value),

    onRenderEvent: (listener) => {
        // The renderer never sees the raw IpcRendererEvent: handing it across the
        // context bridge would expose `sender`, and with it a way to send on any
        // channel the main process listens to.
        const forward = (_event: IpcRendererEvent, payload: RenderEvent): void => listener(payload);
        ipcRenderer.on("render:event", forward);
        return () => {
            ipcRenderer.off("render:event", forward);
        };
    },

    discoverRelease: (request) => ipcRenderer.invoke("download:discover", request),
    startDownload: (request) => ipcRenderer.invoke("download:start", request),
    cancelDownload: (downloadId) => ipcRenderer.invoke("download:cancel", downloadId),
    activeDownloads: () => ipcRenderer.invoke("download:active"),
    listDownloads: () => ipcRenderer.invoke("download:list"),

    onDownloadEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: DownloadEvent): void =>
            listener(payload);
        ipcRenderer.on("download:event", forward);
        return () => {
            ipcRenderer.off("download:event", forward);
        };
    },

    githubStatus: () => ipcRenderer.invoke("github:status"),
    githubSignIn: (options) => ipcRenderer.invoke("github:signIn", options ?? {}),
    githubCancelSignIn: () => ipcRenderer.invoke("github:cancelSignIn"),
    githubSignInWithToken: (token) => ipcRenderer.invoke("github:signInWithToken", token),
    githubSignOut: () => ipcRenderer.invoke("github:signOut"),
    githubCheckRepository: (owner, repo) =>
        ipcRenderer.invoke("github:checkRepository", { owner, repo }),

    onGitHubAuthEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: GitHubAuthEvent): void =>
            listener(payload);
        ipcRenderer.on("github:event", forward);
        return () => {
            ipcRenderer.off("github:event", forward);
        };
    },
};

contextBridge.exposeInMainWorld("materialBluemap", bridge);
