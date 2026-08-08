import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { IpcRendererEvent } from "electron";
import type { UpdateState, UpdateRestartResult } from "../main/update/index.js";
import type { EulaLoadResult } from "../main/eula/index.js";
import type {
    CiBootstrapEvent,
    CiBootstrapResult,
    CiOwnerChoicesAnswer,
    CiPreflight,
    CiRepositoryNameAvailability,
    CiScheduleStatus,
    CiScheduleWriteResult,
    CiSyncEvent,
    CiSyncRequest,
    CiSyncResult,
    CiSyncState,
} from "../main/cirender/index.js";
import type {
    Answer as PagesAnswer,
    PagesCandidate,
    PagesEvent,
    PagesOwner,
    PagesPreflight,
    PagesPublishRequest,
    PagesRecord,
    PagesResult,
    PagesStopResult,
    PagesTarget,
} from "../main/pages/index.js";
import type {
    PreviewAvailability,
    PreviewEvent,
    PreviewNetworkReadout,
    PreviewStartAnswer,
    PreviewStartRequest,
    PreviewStatusAnswer,
} from "../main/preview/index.js";
import type { RemoteHostEvent } from "../main/remote/index.js";
import type {
    DownloadConcurrencyReadout,
    DownloadConcurrencyWriteResult,
    MapStorageDefaultReadout,
    RenderMemoryReadout,
    RenderMemoryWriteResult,
    RevealResult,
    RevealRootReadout,
} from "../main/files/index.js";
import type {
    BackupEvent,
    BackupListing,
    BackupRequest,
    BackupResult,
    BackupSourceKind,
    RepositoryChoice,
    RepositoryReport,
} from "../main/backup/index.js";
import type {
    BedrockDetectResult,
    ChunkerStatus,
    ConversionOutcome,
    ConversionProgressEvent,
    ConversionRecord,
} from "../main/bedrock/index.js";
import type {
    AgentAvailability,
    DiagnoseAnswer,
    FailureSummary,
    RepairAnswer,
} from "../main/repair/index.js";
import type {
    ProfilesHistoryListing,
    ProfilesSaveResult,
    ProfilesState,
} from "../main/profiles/index.js";
import type {
    AppSettingsHistoryListing,
    AppSettingsSaveResult,
    AppSettingsState,
} from "../main/settings/index.js";
import type { RestoreResult } from "../main/history/index.js";
import {
    toBridgeCoordinates,
    toBridgeDiscoveryResult,
    type BridgeReleaseCoordinates,
    type WorldSourceDiscoverAnswer,
    type WorldSourceReferenceAnswer,
} from "./worldSourceBridge.js";

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
/* Reading a world folder                                                     */
/* -------------------------------------------------------------------------- */

export interface WorldFolderEntry {
    /** Relative to the folder that was read, forward slashes, no leading `./`. */
    path: string;
    directory: boolean;
}

/** A dimension a Spigot/Paper-style server split into its own sibling folder. Mirrors `main/world/inspect.ts`. */
export interface ServerSiblingDimension {
    worldFolder: string;
    regionFiles: number;
    regionExtent: { minX: number; maxX: number; minZ: number; maxZ: number } | null;
}

/**
 * A shallow reading of a folder somebody picked, for deciding whether it is a world.
 *
 * Region files are **counted, not listed**. A mature world holds tens of thousands of
 * `.mca` files and their names answer no question the wizard asks; sending the list
 * across the bridge would move megabytes to compute a number. The key is the directory
 * holding them relative to the chosen folder (`region`, `DIM-1/region`), and the empty
 * key is the chosen folder itself.
 */
export interface WorldFolderListing {
    /** The folder that was read, absolute. */
    folder: string;
    entries: WorldFolderEntry[];
    regionFiles: Record<string, number>;
    regionExtents: Record<string, { minX: number; maxX: number; minZ: number; maxZ: number }>;
    spawn: { x: number; z: number } | null;
    spawnError: string | null;
    /** The nether and/or the end, when a server split them into sibling folders instead. */
    serverSiblings: Record<string, ServerSiblingDimension>;
}

/* -------------------------------------------------------------------------- */
/* Finding the worlds already on this machine                                 */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `MinecraftFolder` in `main/world/mounts.ts`.
 *
 * One row of the list of places worlds are offered from: the Minecraft folder this
 * machine's platform puts them in, plus every folder the person has mounted themselves.
 * `state` is checked afresh every time the list is asked for, so a folder on a drive that
 * is currently unplugged reports `missing` and keeps its row rather than disappearing.
 */
export interface MinecraftFolder {
    id: string;
    label: string;
    labelled: boolean;
    chosenPath: string;
    savesPath: string;
    resolution: "installation" | "saves";
    /** True for a folder the app found by itself. Those are never unmounted. */
    builtIn: boolean;
    origin: "appdata" | "home" | "application-support" | "beside-executable" | null;
    state: "ok" | "missing" | "not-a-folder" | "unreadable";
    stateDetail: string | null;
    mountedAt: string | null;
}

/** Mirrors `MinecraftWorldSummary` in `main/world/catalog.ts`. */
export interface MinecraftWorldSummary {
    folderId: string;
    path: string;
    directoryName: string;
    /** `LevelName` from `level.dat`, which is not the folder name. Null when unreadable. */
    name: string | null;
    /** Milliseconds since the epoch, or null when this world has never recorded one. */
    lastPlayed: number | null;
    versionName: string | null;
    snapshot: boolean | null;
    gameMode: "survival" | "creative" | "adventure" | "spectator" | null;
    hardcore: boolean | null;
    cheats: boolean | null;
    /** Decimal text, because a 64-bit seed does not survive a JavaScript number. */
    seed: string | null;
    regionFiles: Record<string, number>;
    sizeBytes: number | null;
    sizeComplete: boolean;
    /** Why the details are missing, when they are. The world is still listed either way. */
    detailsError: string | null;
}

export interface SavesScan {
    folderId: string;
    savesPath: string;
    worlds: MinecraftWorldSummary[];
    truncated: boolean;
}

export type FolderScanResult =
    { ok: true; scan: SavesScan } | { ok: false; folderId: string; message: string };

export type MountFolderResult =
    { ok: true; folder: MinecraftFolder; alreadyMounted: boolean } | { ok: false; message: string };

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
    /**
     * The complete `maps/<id>.conf` body to render with, as HOCON.
     *
     * The five fields above are the ones this bridge understands well enough to
     * validate. A map has ninety-odd more, and an interface that collects them all and
     * then hands over five has quietly discarded the rest of what somebody asked for -
     * which is worse than never offering them, because the settings screen said they
     * were applied.
     *
     * So the whole body travels as text. The main process still owns the keys that are
     * structural rather than cosmetic - `world`, `dimension`, `storage` - and overrides
     * them, because a render whose storage points somewhere the app does not serve
     * produces tiles nobody can see. Everything else is passed through exactly as
     * written.
     */
    config?: string;
}

export interface RenderRequest {
    maps: RenderMapRequest[];
    /**
     * Where to run the engine. Absent means on this computer, as it always did.
     *
     * An unrecognised value is refused rather than rounded down to local: a request saying
     * something this build does not know was written by somebody who believed something
     * untrue, and rendering it anyway confirms the belief.
     */
    runtime?: "local" | "docker";
    renderId?: string;
    force?: boolean;
    fixEdges?: boolean;
    metrics?: boolean;
    renderThreads?: number;
    renderThreadPriority?: number;
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
    | {
          type: "transfer";
          renderId: string;
          direction: "up" | "down";
          bytesDone: number;
          bytesTotal: number | null;
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

/** Mirrors `SpeedLevelNumber` in `main/runtime/speedControl.ts` - the live speed dial's range. */
export type SpeedLevelNumber = 1 | 2 | 3 | 4 | 5;

/**
 * What one live speed-adjustment request did, and what it did not.
 *
 * Mirrors `SpeedAdjustmentResult` in `main/render/orchestrator.ts` - see that interface's
 * own doc comment for why `appliedNow` and `needsRestart` are two separate booleans rather
 * than one the interface would have to infer from `route` or `reason`.
 */
export interface SpeedAdjustmentResult {
    ok: boolean;
    renderId: string;
    level: SpeedLevelNumber;
    route: "local" | "docker" | "unsupported";
    appliedNow: boolean;
    needsRestart: boolean;
    reason:
        | "applied"
        | "priority-refused"
        | "process-exited"
        | "container-stopped"
        | "not-running"
        | "invalid-level";
    message: string;
    detail: string | null;
}

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
    { started: true; result: RenderResult } | { started: false; refusal: ResumeRefused };

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
/* The Java the app would render with                                         */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the summary types in `main/java/ipc.ts`, restated for the same reason the
 * render types above are: the preload is bundled separately, and importing across that
 * boundary would pull `node:child_process` and the whole discovery layer into the
 * renderer's bundle.
 */
export type JavaSource = "JAVA_HOME" | "PATH" | "provisioned";

export interface JavaVersionSummary {
    /** The feature release: 8, 17, 21, 25. Normalised across both numbering schemes. */
    feature: number;
    /** Exactly as the JVM printed it, e.g. `25.0.3`. */
    version: string;
    /** The runtime line, e.g. `OpenJDK Runtime Environment Temurin-25.0.3+9 (build ...)`. */
    runtime: string | null;
}

export interface JavaInstallationSummary {
    source: JavaSource;
    executable: string;
    /** The JVM's own `java.home`, when it reported one. */
    home: string | null;
    version: JavaVersionSummary;
}

/**
 * A candidate that was looked at and turned down.
 *
 * `reason` is a sentence, not a code: it is shown as written, because "JAVA_HOME points
 * at Java 17" is actionable and "no Java found" on a machine with three JDKs is
 * baffling. The main process strips every absolute path out of it first - a rejected
 * binary's own output can name files that have nothing to do with Java - so the one
 * path that arrives is `executable`, which is the JDK's.
 */
export interface JavaRejectionSummary {
    source: JavaSource;
    executable: string;
    reason: string;
}

export interface JavaRuntimeSummary {
    /** The first candidate that ran and was new enough, or null. */
    installation: JavaInstallationSummary | null;
    /** Every candidate that was looked at and turned down, in the order tried. */
    rejected: JavaRejectionSummary[];
    /** The feature version that was being required, so a message can quote it. */
    required: number;
}

/** Mirrors `JavaDownloadConsentSummary` in `main/java/ipc.ts`. */
export interface JavaDownloadConsentSummary {
    accepted: boolean;
    acceptedAt: string | null;
}

/** Mirrors `JavaProvisionOutcome` in `main/java/ipc.ts`. Never rejects. */
export type JavaProvisionOutcome =
    | { ok: true; installation: JavaInstallationSummary; provisioned: boolean }
    | { ok: false; message: string };

/** Mirrors `ProvisionEvent` in `main/java/provision.ts`. */
export interface JavaProvisionEvent {
    stage: "resolving" | "downloading" | "verifying" | "extracting" | "installing" | "done";
    /** A sentence suitable for a progress notification, already user-readable. */
    message: string;
    received: number | null;
    total: number | null;
}

/* -------------------------------------------------------------------------- */
/* Installing git, the GitHub CLI, Docker Desktop and rsync via winget/Chocolatey */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the types in `main/sysdeps/`, restated for the same reason the Java types
 * above are: the preload is bundled separately, so this is a plain structural copy
 * rather than an import across that boundary.
 *
 * `SysdepProgress` deliberately has no field that can be read as a fabricated
 * percentage: `"determinate"` only ever carries a real number Chocolatey printed,
 * `"indeterminate"` is the honest answer for winget (which drops its own progress bar
 * once stdout is not a real console - see `main/sysdeps/winget.ts`), and `"none"` is
 * for phases with no percentage concept at all.
 */
export type SysdepManagerId = "winget" | "chocolatey";

export type SysdepElevation = "required" | "possible" | "none" | "unknown";

export type SysdepProgress =
    { kind: "determinate"; percent: number } | { kind: "indeterminate" } | { kind: "none" };

export type SysdepPreviewRoute =
    | { kind: "package-manager"; manager: SysdepManagerId; packageId: string }
    | { kind: "unsupported"; reason: string }
    | { kind: "unavailable"; reason: string };

/** One row of the preview shown before the install button is pressed. */
export interface SysdepPreviewRow {
    id: string;
    displayName: string;
    route: SysdepPreviewRoute;
    elevation: SysdepElevation;
    /** The exact sentence to show before the button is pressed. Facts only. */
    elevationDisclosure: string;
    alreadyInstalled: boolean;
    installedVersion: string | null;
}

export type SysdepInstallStage =
    | "queued"
    | "checking-existing"
    | "elevation-notice"
    | "resolving"
    | "downloading"
    | "installing"
    | "verifying"
    | "done"
    | "skipped"
    | "failed"
    | "cancelled";

export interface SysdepInstallEvent {
    dependency: string;
    manager: SysdepManagerId | null;
    stage: SysdepInstallStage;
    message: string;
    progress: SysdepProgress;
}

/**
 * The real outcome of trying to get one dependency onto the machine. Every branch
 * that can genuinely happen is named - there is no generic "error" branch that
 * swallows the interesting ones.
 */
export type SysdepOutcome =
    | {
          kind: "installed";
          dependency: string;
          manager: SysdepManagerId;
          verified: boolean;
          verifiedOutput: string | null;
      }
    | {
          kind: "already-installed";
          dependency: string;
          manager: SysdepManagerId | null;
          verified: boolean;
          verifiedOutput: string | null;
      }
    | {
          kind: "declined-elevation";
          dependency: string;
          manager: SysdepManagerId;
          exitCode: number | null;
      }
    | { kind: "not-found"; dependency: string; manager: SysdepManagerId; packageId: string }
    | { kind: "network-failure"; dependency: string; manager: SysdepManagerId; message: string }
    | {
          kind: "verification-failed";
          dependency: string;
          manager: SysdepManagerId;
          /** The package manager's own exit code - it reported success. */
          exitCode: number | null;
          message: string;
      }
    | {
          kind: "failed";
          dependency: string;
          manager: SysdepManagerId | null;
          exitCode: number | null;
          /** The package manager's real output, never a generic apology. */
          message: string;
      }
    | { kind: "cancelled"; dependency: string }
    | { kind: "unsupported"; dependency: string; message: string };

export interface SysdepBatchResult {
    outcomes: SysdepOutcome[];
    /** True the moment the batch stopped early because of cancellation. */
    cancelled: boolean;
}

/* -------------------------------------------------------------------------- */
/* The BlueMap config folder                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the types in `main/config/ipc.ts`, restated for the same reason the render
 * types above are: the preload is bundled separately, and importing across that boundary
 * would pull `node:fs` and the whole path-safety layer into the renderer's bundle.
 *
 * The options editor probes for every one of these before it offers a single control - a
 * half-wired bridge would present a folder picker that throws the moment somebody clicks
 * it - so this namespace is exposed whole or not at all.
 */
export interface ConfigFile {
    /** Relative to the config folder, always forward slashes, e.g. `maps/overworld.conf`. */
    path: string;
    text: string;
}

export interface ConfigFolderContents {
    /** The folder that was read, absolute. */
    folder: string;
    files: ConfigFile[];
}

export interface ConfigPickDirectoryOptions {
    title: string;
    /** Where the picker opens. Ignored unless it is a full path. */
    startIn?: string;
}

export interface ConfigPickFileOptions {
    title: string;
    /** Extensions without the dot, e.g. `["jar"]`. */
    extensions?: string[];
    startIn?: string;
}

/**
 * The screen-agnostic folder/file picker every path field browses through.
 *
 * A namespace of its own rather than an extension of `ConfigBridge`, because it is reached
 * from screens that never sit under `provideConfigHost()` - Settings, Backup, the remote
 * target editor - and `configHost.ts` refuses a half-wired bridge outright. This one asks
 * nothing of its caller beyond `window.worldlens.dialog` existing.
 */
export interface DialogPickFolderOptions {
    title: string;
    /** Where the picker opens. Ignored unless it names a folder that really exists. */
    startIn?: string;
}

export interface DialogPickFileOptions {
    title: string;
    /** Extensions without the dot, e.g. `["jar"]`. Omitted or empty means every file. */
    extensions?: string[];
    startIn?: string;
}

export interface DialogBridge {
    pickFolder(options: DialogPickFolderOptions): Promise<string | null>;
    pickFile(options: DialogPickFileOptions): Promise<string | null>;
}

/** What the storages screen collects, mirroring `sqlStorageConfigSchema`. */
export interface SqlProbeRequest {
    connectionUrl: string;
    /** `connection-properties`, which is where the user name and password live. */
    properties: Record<string, string>;
    dialect: string | null;
    driverJar: string | null;
    driverClass: string | null;
}

export interface SqlProbeResult {
    ok: boolean;
    /** One line for the user. On a driver failure this is the driver's own message. */
    message: string;
    /** Driver or dialect detail worth showing behind a disclosure. */
    detail?: string;
}

export interface ConfigBridge {
    /** Reads every config file in a folder and in its `maps` and `storages`. */
    readFolder(folder: string): Promise<ConfigFolderContents>;
    /** Creates the folder if needed and writes each file, replacing what is there. */
    writeFiles(folder: string, files: ConfigFile[]): Promise<void>;
    /** Deletes files by path relative to the folder. Missing files are not an error. */
    deleteFiles(folder: string, paths: string[]): Promise<void>;
    pickDirectory(options: ConfigPickDirectoryOptions): Promise<string | null>;
    pickFile(options: ConfigPickFileOptions): Promise<string | null>;
    /** Opens a real connection and reports what the driver said. */
    testSqlConnection(request: SqlProbeRequest): Promise<SqlProbeResult>;
    /** The folder the app would use if the user does not choose one. */
    suggestConfigFolder(): Promise<string>;
    /** `\\` on Windows, `/` elsewhere. Used only to build display paths. */
    pathSeparator: string;
}

/* -------------------------------------------------------------------------- */
/* The config folder's version history                                        */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the types in `main/history/`, restated for the same reason the render types
 * are: the preload is bundled separately, and importing across that boundary would pull
 * `node:child_process` and the whole git layer into the renderer's bundle.
 *
 * Nothing on this namespace rejects. Every method resolves with a value describing what
 * happened, including the failures, because a history write must never be able to take
 * down the save it was recording. See `main/history/ipc.ts` for the whole argument.
 */
export type HistoryChangeStatus = "added" | "modified" | "deleted";

export interface HistoryFileChange {
    /** Relative to the config folder, forward slashes, e.g. `maps/nether.conf`. */
    path: string;
    status: HistoryChangeStatus;
}

/** The word the history panel derives its action filter from. Never a fixed list there. */
export type HistoryAction =
    "started" | "created" | "changed" | "deleted" | "mixed" | "restored" | "pruned";

export interface HistoryRevision {
    id: string;
    shortId: string;
    /** ISO 8601. */
    at: string;
    /** Always names what changed, e.g. `Deleted the nether map`. Never `Updated`. */
    label: string;
    action: HistoryAction;
    changes: HistoryFileChange[];
    /** The user's own label for this revision, or null. */
    note: string | null;
    /** Set on a restore: the revision whose contents were written back. */
    restoredFrom: string | null;
}

export interface HistoryStatus {
    available: boolean;
    version: string | null;
    /** One sentence for the user when `available` is false. Null when it is true. */
    reason: string | null;
    /** Where histories are kept, beside the app's own data and never in a user's folder. */
    root: string;
}

export interface HistoryListing {
    available: boolean;
    reason: string | null;
    folder: string;
    /** The repository's path, shown so the user can see it is not inside their folder. */
    repository: string;
    revisions: HistoryRevision[];
    /** Expected to be empty. Sent so the interface can show that rather than promise it. */
    remotes: string[];
}

export type HistoryWrite =
    | { ok: true; revision: HistoryRevision | null; message: string }
    | { ok: false; message: string };

export interface HistorySkippedFile {
    path: string;
    reason: string;
}

export type HistoryRestoreResult =
    | { ok: true; revision: HistoryRevision | null; message: string; skipped: HistorySkippedFile[] }
    | { ok: false; message: string };

export interface HistoryRevisionFile {
    path: string;
    text: string;
}

export interface HistoryDiffFile {
    path: string;
    status: HistoryChangeStatus;
    /** A unified diff, exactly as git wrote it. */
    patch: string;
}

export type HistoryFilesResult =
    { ok: true; files: HistoryRevisionFile[] } | { ok: false; message: string };
export type HistoryDiffResult =
    { ok: true; files: HistoryDiffFile[] } | { ok: false; message: string };

export interface HistoryComparisonFile extends HistoryDiffFile {
    /** The file's whole text at the older end, or null when absent or withheld. */
    before: string | null;
    after: string | null;
    /** Why a side is null despite existing there (too large, not text). Null otherwise. */
    withheld: string | null;
}

export type HistoryCompareResult =
    | { ok: true; from: string | null; to: string; files: HistoryComparisonFile[] }
    | { ok: false; message: string };

export interface HistoryMergedFile {
    path: string;
    text: string;
}

/* -------------------------------------------------------------------------- */
/* A world's project                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `main/project/`, restated here for the same reason the history types are: the
 * preload is bundled separately, and importing across that boundary would drag the schema
 * and the git layer into the renderer's bundle.
 *
 * Nothing here rejects. A refusal is a value, so the interface can tell "this project was
 * written by a newer app" apart from "the disk is full" - two screens, not one red toast.
 */
export type ProjectReadFailure =
    | { kind: "absent" }
    | { kind: "unreadable"; message: string }
    | { kind: "not-json"; message: string }
    | { kind: "too-new"; version: number }
    | { kind: "invalid"; problems: string[] };

export interface ProjectMapEntry {
    id: string;
    name: string;
    dimension: string;
    /** The complete `maps/<id>.conf` body, HOCON. */
    config: string;
    storage: string;
    sorting: number;
    enabled: boolean;
    /** A world other than the one holding this project, or null for that one. */
    world: string | null;
}

export interface ProjectStorageEntry {
    id: string;
    config: string;
}

export interface ProjectRenderOptions {
    threads: number | null;
    force: boolean;
    fixEdges: boolean;
    metrics: boolean;
    outputFolder: string | null;
}

export interface ProjectFileContents {
    version: number;
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    appVersion: string | null;
    maps: ProjectMapEntry[];
    storages: ProjectStorageEntry[];
    render: ProjectRenderOptions;
    core: string | null;
    webapp: string | null;
    webserver: string | null;
    plugin: string | null;
    fromWizard: boolean;
}

export type ProjectReadOutcome =
    | { ok: true; worldFolder: string; path: string; project: ProjectFileContents; text: string }
    | { ok: false; worldFolder: string; path: string; failure: ProjectReadFailure };

export interface ProjectPresence {
    worldFolder: string;
    path: string;
    /** True when the file is there, whether or not this build could read it. */
    present: boolean;
    name: string | null;
    id: string | null;
    mapCount: number | null;
    updatedAt: string | null;
    fromWizard: boolean | null;
    /** One sentence when a project is there and would not open. Null otherwise. */
    problem: string | null;
}

export type ProjectSaveResult =
    | {
          ok: true;
          path: string;
          project: ProjectFileContents;
          /** False when the project was saved but no record of it could be kept. */
          historyOk: boolean;
          revision: HistoryRevision | null;
          historyMessage: string;
      }
    | { ok: false; reason: string };

export interface ProjectHistoryListing {
    available: boolean;
    reason: string | null;
    worldFolder: string;
    /** Shown so a person can see the history is not inside their world. */
    repository: string;
    revisions: HistoryRevision[];
    remotes: string[];
}

export interface ProjectSummaryRow {
    world: string;
    file: string;
    id: string | null;
    name: string | null;
    maps: number | null;
    createdAt: string | null;
    updatedAt: string | null;
    fromWizard: boolean | null;
    worldName: string | null;
    /** Set when a project is there and would not open. The row still appears. */
    problem: string | null;
}

export interface ProjectListing {
    projects: ProjectSummaryRow[];
    /** How many worlds were looked at, so an empty list can say why it is empty. */
    scanned: number;
    problems: { world: string; message: string }[];
}

export interface ProjectBridge {
    read(worldFolder: string): Promise<ProjectReadOutcome>;
    discover(worldFolder: string): Promise<ProjectPresence>;
    discoverMany(worldFolders: string[]): Promise<ProjectPresence[]>;
    /**
     * Writes the project and records exactly one revision of it.
     *
     * Refuses rather than overwriting a project this build could not read; pass
     * `replaceUnreadable` only after showing somebody what could not be read and asking.
     * It never applies to a project from a newer app, which is refused outright.
     */
    save(
        worldFolder: string,
        project: ProjectFileContents,
        replaceUnreadable?: boolean,
    ): Promise<ProjectSaveResult>;
    history(worldFolder: string, limit?: number): Promise<ProjectHistoryListing>;
    restore(worldFolder: string, id: string): Promise<HistoryRestoreResult>;
    /**
     * Keeps the newest `keep` revisions of this world's project history and removes the
     * rest. **Destructive.** See `main/history/ipc.ts`'s `discardOlderRevisions` for why a
     * settings surface puts this behind a two-key confirmation gate rather than a button.
     */
    discardOlderRevisions(worldFolder: string, keep: number): Promise<HistoryWrite>;

    /**
     * Tells the main process's autosave scheduler that this world's project now looks like
     * this. Fire-and-forget: the scheduler debounces on its own quiet interval, and every
     * attempt it eventually makes is reported through {@link onAutosaveEvent}, not through
     * this call's own return value.
     */
    notifyAutosaveChange(worldFolder: string, project: ProjectFileContents): Promise<void>;
    /**
     * Writes whatever is pending for one world immediately, instead of waiting for the
     * scheduler's debounce. Answers `null` when nothing was pending, which is the ordinary
     * case at most boundaries.
     */
    flushAutosave(
        worldFolder: string,
        reason: "boundary" | "destructive" | "quit",
    ): Promise<ProjectSaveResult | null>;
    /**
     * Every autosave attempt this scheduler makes, automatic or flushed, successful or not.
     * The renderer's own notice policy decides what, if anything, a person is told about
     * one - see `stores/projectAutosaveNotices.ts`.
     */
    onAutosaveEvent(listener: (event: ProjectAutosaveEvent) => void): () => void;

    /**
     * Every world this machine knows about that carries a project.
     *
     * Composed here rather than in the main process because it is the join of two
     * subsystems that were built independently and neither should own the other: the world
     * catalogue knows where worlds are, and the project layer knows which of them carry a
     * file. A folder that cannot be read contributes a problem rather than taking the
     * worlds on every other drive off the screen with it.
     */
    listProjects(): Promise<ProjectListing>;
    /** The same shape the screen wants, over `read`. */
    readProject(
        world: string,
    ): Promise<
        | { ok: true; project: ProjectFileContents; file: string }
        | { ok: false; failure: ProjectReadFailure }
    >;
    writeProject(
        world: string,
        project: ProjectFileContents,
    ): Promise<
        | {
              ok: true;
              file: string;
              historyOk: boolean;
              historyMessage: string;
              revision: HistoryRevision | null;
          }
        | { ok: false; message: string }
    >;
}

/**
 * Why one autosave happened, and what it produced. Mirrors `AutosaveOutcome` in
 * `main/project/autosave.ts`; restated here for the same reason every other bridge type in
 * this file is restated rather than imported - the preload is bundled separately from the
 * main process.
 */
export interface ProjectAutosaveEvent {
    worldFolder: string;
    reason: "quiet" | "boundary" | "destructive" | "quit";
    result: ProjectSaveResult;
}

interface HistoryBridge {
    /** Whether this machine can keep a history at all, and why not when it cannot. */
    status(): Promise<HistoryStatus>;
    /** Every revision for one config folder, newest first. */
    list(folder: string, limit?: number): Promise<HistoryListing>;
    /**
     * Records the folder's current state, if it differs from the last revision.
     *
     * Call it after a save. An unchanged folder records nothing and says so, so calling it
     * more often than needed costs a few milliseconds rather than a panel full of rows
     * describing events that did not happen.
     */
    snapshot(folder: string): Promise<HistoryWrite>;
    /** Every config file exactly as it was at one revision. */
    revisionFiles(folder: string, id: string): Promise<HistoryFilesResult>;
    /** What one revision changed, file by file, as a unified diff. */
    diff(folder: string, id: string): Promise<HistoryDiffResult>;
    /**
     * Writes a revision's files back, and records *that* as a new revision.
     *
     * Nothing is rewritten and nothing is discarded, so the state being replaced stays in
     * the history and the restore can itself be undone.
     */
    restore(folder: string, id: string): Promise<HistoryRestoreResult>;
    /** Attaches the user's own words to a revision. An empty label takes it off again. */
    label(folder: string, id: string, label: string): Promise<HistoryWrite>;
    /**
     * Keeps the newest `keep` revisions and removes the rest. **Destructive.**
     *
     * The only call on this namespace that takes anything away, which is why the interface
     * puts it behind the two-key confirmation gate.
     */
    discardOlderRevisions(folder: string, keep: number): Promise<HistoryWrite>;

    /**
     * What changed between two revisions, with both sides' text.
     *
     * A null `from` means "whatever came before `to`" - its parent, or the empty tree for
     * the very first revision, which otherwise could not be opened at all. Both sides come
     * back whole so the panel can report changed *settings* rather than changed lines; a
     * side too large or not text arrives null with `withheld` saying which.
     */
    compare(folder: string, from: string | null, to: string): Promise<HistoryCompareResult>;
    /** Puts back only the named files of a revision, recorded as a new revision. */
    restoreFiles(folder: string, id: string, paths: string[]): Promise<HistoryRestoreResult>;
    /**
     * Puts back individual settings from files the renderer has already merged.
     *
     * The merge lives in the renderer because the round-tripping HOCON writer does, and a
     * second copy in the main process would be a second HOCON implementation to disagree
     * with the one that writes every save. The main process still checks rather than
     * assumes: the revision exists, every path is one this editor would write, every path
     * is one that revision or the folder holds, and the whole payload is under a cap.
     */
    restoreSettings(
        folder: string,
        id: string,
        files: HistoryMergedFile[],
        keys: string[],
    ): Promise<HistoryRestoreResult>;
}

/* -------------------------------------------------------------------------- */
/* Bedrock Edition worlds: recognising them, and converting them              */
/* -------------------------------------------------------------------------- */

/** What `bedrock:convert` takes. Mirrors the request shape `main/bedrock/ipc.ts` reads. */
export interface BedrockConvertRequest {
    world: string;
    /** Defaults to a sibling of `world` named "<world> (Java)" when left out. */
    output?: string;
    /** A Chunker `EDITION_X_Y_Z` identifier. Defaults to `JAVA_1_21_4` when left out. */
    format?: string;
    /** The source world's measured size, so an out-of-memory failure can name it. */
    sizeBytes?: number | null;
}

/**
 * Detecting a Bedrock world and converting it with Chunker, per `main/bedrock/index.js`.
 *
 * A namespace for the same reason `config` and `history` are: the wizard feature-detects
 * the whole capability at once, because a folder step offering Convert on a bridge that has
 * no `convert` is a button that throws. `detect` is read-only and safe to call as soon as a
 * folder is typed; `convert` is the only method that writes, and it needs a folder chosen by
 * hand - see `docs/bedrock-worlds.md` for why nothing here ever converts as a side effect of
 * looking at a folder.
 */
export interface BedrockBridge {
    detect(folder: string, sizeBytes?: number | null): Promise<BedrockDetectResult>;
    /** Whether Chunker is installed or configured, and what fetching one would get. */
    chunkerStatus(): Promise<ChunkerStatus>;
    /** Downloads the pinned Chunker release, verified against a digest in this app's source. */
    fetchChunker(): Promise<{ ok: boolean; message: string; jarPath: string | null }>;
    /** Converts one world. Resolves when the conversion has ended, whichever way it ended. */
    convert(request: BedrockConvertRequest): Promise<ConversionOutcome & { conversionId: string }>;
    /** Stops a running conversion. False when nothing is running under that id. */
    cancel(conversionId: string): Promise<boolean>;
    /** Whether a world is a conversion, and of what. Null for a native Java world. */
    record(world: string): Promise<ConversionRecord | null>;
    /** Subscribes to conversion progress. Returns the unsubscribe function. */
    onBedrockEvent(listener: (event: ConversionProgressEvent) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* Diagnosing why a render or the web server failed, and repairing it        */
/* -------------------------------------------------------------------------- */

/**
 * Reaching `main/repair/index.js`, per `docs/automatic-repair.md`.
 *
 * The renderer names a failure by the id `repair:remember` returned; it never describes
 * one. Evidence is put on record by the main process at the moment a run fails - see that
 * doc's own "the renderer names a failure; it never describes one" note - so every method
 * here takes an id rather than a payload. Every answer carries its own `ok`, because a
 * refused edit or an unexplained failure is something this screen has to render, not an
 * exception to catch.
 */
export interface RepairBridge {
    /** Whether a local coding agent is installed, for the deterministic pass's last resort. */
    agentAvailability(): Promise<AgentAvailability>;
    /** Every failure still on record, newest first, enough to pick one by. */
    failures(): Promise<readonly FailureSummary[]>;
    /** The deterministic diagnosis for one recorded failure. No model is involved in it. */
    diagnose(id: string): Promise<DiagnoseAnswer>;
    /** Runs the repair pass: the deterministic diagnosis, then the guardrailed agent if allowed. */
    run(id: string): Promise<RepairAnswer>;
}

/* -------------------------------------------------------------------------- */
/* Keeping a Minecraft world in a git repository ("worldrepo")                */
/* -------------------------------------------------------------------------- */

/**
 * Every type below is restated rather than imported from `main/worldrepo/`, the same way
 * `worldSourceBridge.ts` restates `main/worldsource/`'s own types: importing a main-process
 * module - even only for its types - pulls its whole graph, Node built-ins included, into
 * what a bundler has to reason about for the renderer. A doc comment names the real type
 * each one mirrors, so a drift between the two is something a reviewer can actually check.
 */

/** Mirrors `WorldRepoOwner` in `main/worldrepo/repo.ts`. */
export interface WorldRepoOwner {
    login: string;
    kind: "user" | "organization";
}

/** Mirrors `WorldRepoFailure` in `main/worldrepo/repo.ts`. */
export interface WorldRepoFailure {
    code: string;
    message: string;
    detail: string | null;
    /** True when running `gh auth login` in a terminal is what would fix it. */
    needsGhSignIn: boolean;
}

/** Mirrors `WorldRepoTarget` in `main/worldrepo/repo.ts`. */
export interface WorldRepoTarget {
    /** Absolute path to the world folder on disk. Never copied; the git work-tree itself. */
    worldPath: string;
    owner: string;
    repo: string;
    /** Defaults to `"world"` when left out. */
    branch?: string;
}

/** Mirrors `WorldRepoSyncRequest` in `main/worldrepo/repo.ts`. */
export interface WorldRepoSyncRequest extends WorldRepoTarget {
    visibility?: "public" | "private";
    /** Set by the surface once the person has seen the preflight. Refused without it. */
    acknowledgeSync?: boolean;
}

/** Mirrors `WorldRepoReport` in `main/worldrepo/repo.ts`. */
export interface WorldRepoReport {
    fileCount: number;
    bytes: number;
    oversizedFiles: { path: string; bytes: number }[];
    /** False when nothing under the folder looked like a Minecraft world (a `level.dat`). */
    looksLikeWorld: boolean;
    overSoftLimit: boolean;
    overHeavyLimit: boolean;
}

/** Mirrors `WorldRepoMarker` in `main/worldrepo/repo.ts`. */
export interface WorldRepoMarker {
    tool: string;
    version: number;
    branch: string;
    updatedAt: string;
    snapshotId?: string;
    batchCount?: number;
    bytes?: number;
}

/** Mirrors `GhStatus` in `main/cirender/gh.ts`, read here through `WorldRepoPreflight.gh`. */
export interface WorldRepoGhStatus {
    availability: "not-installed" | "signed-out" | "ready";
    /** `gh version 2.62.0 ...`, first line only, or null when it is not installed. */
    version: string | null;
    /** The account `gh auth status` named, when it named one. Never a token. */
    account: string | null;
    /** The host it is signed in to. `github.com` for nearly everybody. */
    host: string | null;
    /** The scopes `gh auth status` named for the active token, or null when it did not say. */
    scopes: string[] | null;
    /** One sentence naming the situation and what would change it. */
    message: string;
}

/** Mirrors `WorldRepoRepositoryReport` in `main/worldrepo/repo.ts`. */
export interface WorldRepoRepositoryReport {
    fullName: string;
    exists: boolean;
    private: boolean | null;
    canWrite: boolean | null;
    htmlUrl: string | null;
    branchExists: boolean;
    branchIsOurs: boolean | null;
    branchMarker: WorldRepoMarker | null;
    /** The branch's current commit, when it has one. The cheap change check other lanes want. */
    branchSha: string | null;
    failure: string | null;
}

/** Mirrors `WorldRepoPreflight` in `main/worldrepo/repo.ts`. */
export interface WorldRepoPreflight {
    worldPath: string;
    owner: string;
    repo: string;
    branch: string;
    world: WorldRepoReport | null;
    worldFailure: string | null;
    gh: WorldRepoGhStatus;
    gitVersion: string | null;
    repository: WorldRepoRepositoryReport | null;
    /** Anything that would stop a sync. Non-empty means the button must not be pressed. */
    blockers: string[];
    /** True, expensive or surprising, but not a refusal. */
    warnings: string[];
    published: WorldRepoRecord | null;
}

/** What this computer remembers about a world it synced. Mirrors `WorldRepoRecord` in `main/worldrepo/repo.ts`. */
export interface WorldRepoRecord {
    version: number;
    worldPath: string;
    owner: string;
    repo: string;
    branch: string;
    stage: string;
    commit: string | null;
    pushVerified: boolean;
    bytes: number;
    fileCount: number;
    syncedAt: string;
}

/** Mirrors `WorldRepoSyncReport` in `main/worldrepo/repo.ts`. */
export interface WorldRepoSyncReport {
    worldPath: string;
    owner: string;
    repo: string;
    branch: string;
    repositoryUrl: string;
    /** The commit that was pushed, read back from git rather than assumed. */
    commit: string;
    /** True only once GitHub reported that branch's head as this commit. */
    pushVerified: boolean;
    bytes: number;
    fileCount: number;
    batchCount: number;
    maxCommitBytes: number;
    maxPushBytes: number;
    notes: string[];
}

/** Mirrors `WorldRepoSyncResult` in `main/worldrepo/repo.ts`. */
export type WorldRepoSyncResult =
    | { ok: true; report: WorldRepoSyncReport; durationMs: number }
    | { ok: false; failure: WorldRepoFailure };

/** Mirrors `WorldRepoRemoveReport` in `main/worldrepo/repo.ts`. */
export interface WorldRepoRemoveReport {
    owner: string;
    repo: string;
    branch: string;
    branchDeleted: boolean;
    notes: string[];
}

/** Mirrors `WorldRepoRemoveResult` in `main/worldrepo/repo.ts`. */
export type WorldRepoRemoveResult =
    { ok: true; report: WorldRepoRemoveReport } | { ok: false; failure: WorldRepoFailure };

/** Mirrors `WorldRepoEvent` in `main/worldrepo/repo.ts`, broadcast on `worldrepo:event`. */
export type WorldRepoEvent =
    | { type: "started"; key: string; target: string; at: string }
    | { type: "phase"; key: string; phase: string; at: string }
    | {
          type: "progress";
          key: string;
          phase: string;
          description: string;
          done: number;
          total: number;
          unit?: "files" | "bytes" | "batches";
          batch?: number;
          batches?: number;
          at: string;
      }
    | { type: "log"; key: string; level: "info" | "warning" | "error"; message: string; at: string }
    | { type: "finished"; key: string; report: WorldRepoSyncReport; durationMs: number; at: string }
    | { type: "failed"; key: string; failure: WorldRepoFailure; at: string }
    | { type: "cancelled"; key: string; at: string };

/** Mirrors `CiBootstrapMarker` in `main/cirender/bootstrap.ts`, read through an adoption signal or plan. */
export interface WorldRepoCiBootstrapMarker {
    tool: string;
    version: number;
    /** Identifies the shipped template set that produced the files this marker lists. */
    templateVersion: string;
    files: string[];
    preparedAt: string;
}

/** Mirrors `AdoptionSignal` in `main/worldrepo/adopt.ts`. */
export interface WorldRepoAdoptionSignal {
    fullName: string;
    /** The world-repo branch this signal checked. */
    branch: string;
    status: "prepared" | "prepared-newer-version" | "not-prepared" | "not-checked" | "unknown";
    /** The world-repo marker, when found - the one whose branch also carries a project. */
    marker: WorldRepoMarker | null;
    /** The CI-bootstrap marker, when found - recognised, but with nothing to restore. */
    bootstrapMarker: WorldRepoCiBootstrapMarker | null;
    /** One sentence, hedged with "looks like" rather than asserted as certain. */
    message: string;
}

/** One repository to check, exactly as much as the check needs. Mirrors `AdoptionCandidateInput`. */
export interface WorldRepoAdoptionCandidate {
    owner: string;
    repo: string;
}

/** Mirrors `AdoptionAttentionItem` in `main/worldrepo/adopt.ts`. */
export interface WorldRepoAdoptionAttentionItem {
    id: "world-folder" | "dependencies" | "remote-host" | "output-folder" | "linked-world";
    /** The map this concerns, for `linked-world`; null for every project-wide item. */
    mapId: string | null;
    message: string;
}

/** Mirrors `AdoptionRestoreSummary` in `main/worldrepo/adopt.ts`. */
export interface WorldRepoAdoptionRestoreSummary {
    projectName: string;
    /** True when the project was never opened in the full editor. */
    fromWizard: boolean;
    maps: { id: string; name: string; dimension: string }[];
    storageIds: string[];
    /** Short, human sentences naming the non-default render options this project set. */
    renderNotes: string[];
    coreCustomized: boolean;
    webappCustomized: boolean;
    webserverCustomized: boolean;
    pluginCustomized: boolean;
}

/** A local project already bound to the same repository, so adoption never duplicates it. Mirrors `AdoptionAlreadyLocal`. */
export interface WorldRepoAdoptionAlreadyLocal {
    worldPath: string;
    branch: string;
    syncedAt: string;
}

/** Mirrors `AdoptionPlan` in `main/worldrepo/adopt.ts`. */
export type WorldRepoAdoptionPlan =
    | {
          ok: true;
          owner: string;
          repo: string;
          branch: string;
          marker: WorldRepoMarker;
          bootstrapMarker: WorldRepoCiBootstrapMarker | null;
          preparedByNewerMarkerVersion: boolean;
          /** The restored project, in the same shape `project.read()` already answers with. */
          project: ProjectFileContents;
          restoring: WorldRepoAdoptionRestoreSummary;
          needsAttention: WorldRepoAdoptionAttentionItem[];
          alreadyLocal: WorldRepoAdoptionAlreadyLocal | null;
      }
    | {
          ok: false;
          owner: string;
          repo: string;
          branch: string;
          reason:
              | "repository-unreadable"
              | "not-prepared"
              | "project-absent"
              | "project-unreadable"
              | "project-too-new"
              | "ci-bootstrap-only";
          message: string;
          /** Present whenever a world marker was found, even alongside a later refusal. */
          marker: WorldRepoMarker | null;
          /** Present whenever a CI-bootstrap marker was found, including for `ci-bootstrap-only`. */
          bootstrapMarker: WorldRepoCiBootstrapMarker | null;
          /** Set only for `project-too-new`. */
          foundFormatVersion: number | null;
      };

/** The IPC envelope most `worldrepo:*` channels answer with, for a call that can genuinely throw. */
type WorldRepoAnswer<T> = { ok: true; value: T } | { ok: false; message: string };

/**
 * Keeping a Minecraft world in a git repository, so a render never has to re-zip it and a
 * later sync only ever sends what changed. Mirrors `main/worldrepo/ipc.ts`'s eleven
 * channels, plus `worldrepo:event` for progress.
 *
 * A namespace for the same reason `bedrock` and `repair` are: the surface feature-detects
 * the whole capability at once, because a screen offering Sync on a bridge that has no
 * `sync` is a button that throws. Every write method here (`sync`, `remove`, `resume`)
 * resolves with a value rather than rejecting, so a refusal - a missing sign-in, a branch
 * this application did not make, a push GitHub rejected - is a sentence the screen renders,
 * never a stack trace.
 */
export interface WorldRepoBridge {
    /** The signed-in GitHub account plus every organisation it can write to. */
    owners(): Promise<WorldRepoAnswer<readonly WorldRepoOwner[]>>;
    /** What a sync would do, before it does any of it. */
    preflight(target: WorldRepoTarget): Promise<WorldRepoAnswer<WorldRepoPreflight>>;
    /** Uploads bounded commits to a leased staging ref, then atomically replaces the world branch. */
    sync(request: WorldRepoSyncRequest): Promise<WorldRepoSyncResult>;
    /** Deletes the branch this application made for a world. Never touches the world folder. */
    remove(target: WorldRepoTarget): Promise<WorldRepoRemoveResult>;
    /** Stops a running sync or remove by its key. False when nothing was running under it. */
    cancel(key: string): Promise<boolean>;
    /** Keys of every sync or remove in flight right now. */
    active(): Promise<readonly string[]>;
    /** Every world this computer remembers syncing, newest first. */
    records(): Promise<WorldRepoAnswer<readonly WorldRepoRecord[]>>;
    /** Continues a sync whose durable stage marker says it was interrupted. */
    resume(target: WorldRepoTarget): Promise<WorldRepoSyncResult>;
    /** The branch's current commit on GitHub, without touching the local git directory. */
    remoteTip(
        owner: string,
        repo: string,
        branch?: string,
    ): Promise<WorldRepoAnswer<{ exists: boolean; sha: string | null }>>;
    /**
     * Which repositories in a list look like ones this application already prepared.
     * Bounded - see `main/worldrepo/adopt.ts` - so a long list never becomes an unbounded
     * number of round trips just because the picker asked about all of them at once.
     */
    adoptionProbe(request: {
        candidates: readonly WorldRepoAdoptionCandidate[];
        branch?: string;
        maxProbes?: number;
    }): Promise<WorldRepoAnswer<readonly WorldRepoAdoptionSignal[]>>;
    /** What adopting one repository would restore, or an honest refusal naming why not. */
    adoptionPlan(request: {
        owner: string;
        repo: string;
        branch?: string;
    }): Promise<WorldRepoAnswer<WorldRepoAdoptionPlan>>;
    /** Subscribes to sync/remove progress. Returns the unsubscribe function. */
    onWorldRepoEvent(listener: (event: WorldRepoEvent) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* A world already on a machine the person owns, fetched over SSH             */
/* -------------------------------------------------------------------------- */

/**
 * A remote target as the settings screen already stores it, restated from `RemoteTarget` in
 * `main/remote/target.ts` rather than imported. Every field is optional here because
 * `worldsource:ssh:*` fills in the same defaults `remote:validate` does - a missing port
 * becomes 22, a missing `docker` becomes `"docker"` - and refuses only what genuinely
 * cannot be defaulted, reported in `SshValidateAnswer.message`. `image`, `docker` and
 * `keepRemoteFiles` exist on the type because it is the same `RemoteTarget` the remote
 * -render lane uses; a world fetch never reads them.
 */
export interface SshRemoteTargetInput {
    id?: string;
    label?: string;
    host?: string;
    port?: number;
    user?: string;
    identityFile?: string | null;
    workDir?: string;
    image?: string;
    docker?: string;
    keepRemoteFiles?: boolean;
}

/** `RemoteTarget`, checked and defaulted. What `validate`/`detect` answer back. */
export interface SshRemoteTarget {
    id: string;
    label: string;
    host: string;
    port: number;
    user: string;
    identityFile: string | null;
    workDir: string;
    image: string;
    docker: string;
    keepRemoteFiles: boolean;
}

/** Mirrors `SshValidateAnswer` in `main/worldsource/sshIpc.ts`. */
export type SshValidateAnswer =
    { ok: true; target: SshRemoteTarget; summary: string } | { ok: false; message: string };

/** Mirrors `HostKeyOffer` in `main/remote/hostkey.ts`. */
export interface SshHostKeyOffer {
    /** `ssh-ed25519`, `ecdsa-sha2-nistp256`, `ssh-rsa`, ... */
    type: string;
    /** The key blob, base64, exactly as `ssh-keyscan` printed it. */
    base64: string;
    /** `SHA256:...`, in OpenSSH's own spelling, so it can be compared by eye. */
    fingerprint: string;
    /** The whole `known_hosts` line, ready to be written if it is approved. */
    line: string;
}

/** Mirrors `RemoteHostKind` in `main/remote/worldsource.ts`. */
export type SshRemoteHostKind = "posix" | "windows" | "unknown";

/** Mirrors `SshDetectAnswer` in `main/worldsource/sshIpc.ts`. */
export type SshDetectAnswer =
    | { ok: true; kind: SshRemoteHostKind; detail: string | null }
    | { ok: false; message: string; hostKeys: readonly SshHostKeyOffer[] };

/** Mirrors `SshTrustAnswer` in `main/worldsource/sshIpc.ts`. */
export interface SshTrustAnswer {
    ok: boolean;
    message: string;
}

/** Mirrors `RemoteWorldPathCheck` in `main/remote/worldsource.ts`. */
export type SshRemoteWorldPathCheck = { ok: true; path: string } | { ok: false; reason: string };

/** Mirrors `RemoteWorldEntry` in `main/remote/worldsource.ts`. */
export interface SshRemoteWorldEntry {
    /** Relative to the world's root, forward-slash separated regardless of the remote OS. */
    path: string;
    size: number;
    mtimeMs: number;
}

/** Mirrors `SshSurveyAnswer` in `main/worldsource/sshIpc.ts`. */
export type SshSurveyAnswer =
    | { ok: true; kind: SshRemoteHostKind; entries: readonly SshRemoteWorldEntry[] }
    | { ok: false; message: string };

/**
 * Mirrors `RemoteWorldChanges` in `main/remote/worldsource.ts`, plus the `anyChange` field
 * the `worldsource:ssh:diff` handler adds on top of it.
 */
export interface SshRemoteWorldChanges {
    added: readonly string[];
    changed: readonly string[];
    removed: readonly string[];
    unchanged: number;
    anyChange: boolean;
}

/**
 * A `RenderFailure` with the SSH-specific reason attached. Mirrors `RemoteFailure` in
 * `main/remote/failure.ts`, which is why it extends the same {@link RenderFailure} this file
 * already restates for local and remote rendering.
 */
export interface SshRemoteFailure extends RenderFailure {
    remoteCode: string;
    /** The target this is about, as `user@host:port`, for a message. Never a key path. */
    target: string | null;
}

/** Mirrors `RemoteWorldFetchResult` in `main/remote/worldsource.ts`. */
export type SshRemoteWorldFetchResult =
    | { ok: true; kind: SshRemoteHostKind; transfer: "rsync" | "scp"; message: string }
    | { ok: false; failure: SshRemoteFailure; hostKeys: readonly SshHostKeyOffer[] };

/** What `worldsource:ssh:fetch` answers with: the fetcher's own id, plus its result. */
export interface SshFetchAnswer {
    id: string;
    result: SshRemoteWorldFetchResult;
}

/** What `fetch` takes. Mirrors `SshWorldSourceRequest` in `main/worldsource/sshFetcher.ts`. */
export interface SshFetchRequest {
    target: SshRemoteTargetInput;
    remotePath: string;
    localPath: string;
}

/** Mirrors `SshWorldSourceEvent` in `main/worldsource/sshFetcher.ts`, broadcast on `worldsource:ssh:event`. */
export type SshWorldSourceEvent =
    | { kind: "line"; id: string; message: string }
    | { kind: "finished"; id: string; result: SshRemoteWorldFetchResult };

/**
 * Fetching a world from a machine the person already owns, reached over SSH - Linux or
 * Windows. Mirrors `main/worldsource/sshIpc.ts`'s nine channels, plus
 * `worldsource:ssh:event` for progress.
 *
 * The guided shape that module's own doc comment describes: `validate` is offline,
 * `detect` connects and says which kind of host answered, `trustHostKey` is the one
 * decision this bridge never makes silently, `checkPath`/`survey`/`diff` are the cheap
 * change check, and `fetch`/`cancel`/`active` are the transfer itself. No method here
 * rejects - every answer, including "this host key has changed", is a sentence a wizard
 * step has to show.
 */
export interface WorldSourceSshBridge {
    /** Checks a target's shape, entirely offline. There is no password field, here or anywhere. */
    validate(target: SshRemoteTargetInput): Promise<SshValidateAnswer>;
    /** Connects, checks the host key, and says which kind of host answered. */
    detect(target: SshRemoteTargetInput): Promise<SshDetectAnswer>;
    /**
     * Records a host key the person has just been shown and accepted.
     *
     * The main process re-scans and writes only a key it offered, so this cannot be used to
     * put a line of its own choosing into a trust store.
     */
    trustHostKey(target: SshRemoteTargetInput, fingerprint: string): Promise<SshTrustAnswer>;
    /** Is the given remote path even shaped like a path on that kind of host. */
    checkPath(path: string, kind: SshRemoteHostKind): Promise<SshRemoteWorldPathCheck>;
    /** Lists every file under a remote world, with its size and modification time. No bytes moved. */
    survey(
        target: SshRemoteTargetInput,
        path: string,
        kind: SshRemoteHostKind,
    ): Promise<SshSurveyAnswer>;
    /** Compares two surveys by path, size and modification time. Pure; no network. */
    diff(
        previous: readonly SshRemoteWorldEntry[],
        current: readonly SshRemoteWorldEntry[],
    ): Promise<SshRemoteWorldChanges>;
    /** Fetches the world. Progress arrives on `onSshWorldSourceEvent`, not the return value alone. */
    fetch(request: SshFetchRequest): Promise<SshFetchAnswer>;
    cancel(id: string): Promise<boolean>;
    active(): Promise<readonly string[]>;
    /** Subscribes to fetch progress. Returns the unsubscribe function. */
    onSshWorldSourceEvent(listener: (event: SshWorldSourceEvent) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* Reading a world out of a Docker container or volume ("dockerworld")        */
/* -------------------------------------------------------------------------- */

/** Mirrors `DockerWorldFailureCode` in `main/dockerworld/failure.ts`. */
export type DockerWorldFailureCode =
    | "invalid-request"
    | "not-installed"
    | "daemon-unreachable"
    | "refused"
    | "unusable"
    | "not-found"
    | "not-a-world"
    | "live-world-not-acknowledged"
    | "copy-failed"
    | "storage-unwritable"
    | "cancelled";

/** Mirrors `DockerWorldFailure` in `main/dockerworld/failure.ts`. */
export interface DockerWorldFailure {
    code: DockerWorldFailureCode;
    /** One sentence naming what is wrong, in words a person can act on. */
    message: string;
    /** Supporting evidence: Docker's own words, a path, an exit code. */
    detail: string | null;
}

/** Mirrors `DockerContainerSummary` in `main/dockerworld/inventory.ts`. */
export interface DockerContainerSummary {
    id: string;
    name: string;
    image: string;
    /** Docker's own status line, e.g. "Up 3 hours" or "Exited (0) 2 days ago". */
    status: string;
    running: boolean;
}

/** Mirrors `DockerVolumeSummary` in `main/dockerworld/inventory.ts`. */
export interface DockerVolumeSummary {
    name: string;
    driver: string;
}

/** Mirrors `DockerMount` in `main/dockerworld/inventory.ts`. */
export interface DockerMount {
    type: string;
    /** The host path for a bind mount, or the mountpoint Docker reports for a volume. */
    source: string;
    /** The volume's name, when `type` is `"volume"`. Null otherwise. */
    volumeName: string | null;
    /** Where this is mounted inside the container. */
    destination: string;
    readOnly: boolean;
}

/** Mirrors `DockerContainerDetail` in `main/dockerworld/inventory.ts`. */
export interface DockerContainerDetail extends DockerContainerSummary {
    mounts: DockerMount[];
    startedAt: string | null;
}

/** Mirrors `DockerVolumeDetail` in `main/dockerworld/inventory.ts`. */
export interface DockerVolumeDetail extends DockerVolumeSummary {
    /** Where the volume's data lives on the daemon's own host. Rarely readable from here directly. */
    mountpoint: string;
}

/** Mirrors `DockerWorldListAnswer` in `main/dockerworld/ipc.ts`. */
export type DockerWorldListAnswer =
    | {
          ok: true;
          containers: readonly DockerContainerSummary[];
          volumes: readonly DockerVolumeSummary[];
      }
    | { ok: false; failure: DockerWorldFailure };

/** Mirrors `DockerContainerAnswer` in `main/dockerworld/ipc.ts`. */
export type DockerContainerAnswer =
    { ok: true; detail: DockerContainerDetail } | { ok: false; failure: DockerWorldFailure };

/** Mirrors `DockerVolumeAnswer` in `main/dockerworld/ipc.ts`. */
export type DockerVolumeAnswer =
    { ok: true; detail: DockerVolumeDetail } | { ok: false; failure: DockerWorldFailure };

/** Mirrors `DockerSourceRequest` in `main/dockerworld/fetch.ts`. */
export type DockerSourceRequest =
    | { kind: "container"; containerId: string; mountDestination: string }
    | { kind: "volume"; volumeName: string };

/** Mirrors `DockerWorldFetchRequest` in `main/dockerworld/fetch.ts`. */
export interface DockerWorldFetchRequest {
    source: DockerSourceRequest;
    /** The local folder the world lands in. Created if it does not exist. */
    destination: string;
    /**
     * True to fetch a live world anyway, having read the running warning `list`,
     * `inspectContainer` or `fingerprint` reported. False or omitted refuses - see
     * `main/dockerworld/failure.ts`'s `liveWorldNotAcknowledged`.
     */
    acknowledgeLiveRisk?: boolean;
    /** The world's dimension, for the post-copy world check. Defaults to the overworld. */
    dimension?: string;
}

/** Mirrors `DockerWorldFetchResult` in `main/dockerworld/fetch.ts`. */
export type DockerWorldFetchResult =
    | { ok: true; fetchId: string; filesCopied: number; filesUnchanged: number }
    | { ok: false; fetchId: string; failure: DockerWorldFailure };

/** Mirrors `DockerWorldEvent` in `main/dockerworld/fetch.ts`. */
export type DockerWorldEvent =
    | { type: "started"; fetchId: string; route: string; at: string }
    | { type: "log"; fetchId: string; level: "info" | "warning"; message: string; at: string }
    | {
          type: "progress";
          fetchId: string;
          phase: "source-copy" | "placement" | "validation";
          filesDone: number | null;
          filesTotal: number | null;
          currentFile: string | null;
          message: string;
          at: string;
      }
    | { type: "finished"; fetchId: string; filesCopied: number; filesUnchanged: number; at: string }
    | { type: "failed"; fetchId: string; failure: DockerWorldFailure; at: string }
    | { type: "cancelled"; fetchId: string; at: string };

/** Mirrors `RegionFingerprint` in `main/dockerworld/change.ts`. */
export interface DockerWorldRegionFingerprint {
    path: string;
    bytes: number;
    /** Unix seconds - `find -printf`/`stat` and Node's own `Stats` agree on that unit. */
    modifiedAt: number;
}

/** Mirrors `WorldFingerprint` in `main/dockerworld/change.ts`. */
export interface DockerWorldFingerprint {
    regions: readonly DockerWorldRegionFingerprint[];
}

/**
 * Mirrors `DockerWorldFingerprintResult` in `main/dockerworld/fetch.ts`. `fingerprint: null`
 * is not a failure - it means the resolved route (a container or volume copy) offers no
 * cheap vantage point; see that module's own doc comment for why.
 */
export type DockerWorldFingerprintResult =
    | { ok: true; fingerprint: DockerWorldFingerprint | null }
    | { ok: false; failure: DockerWorldFailure };

/**
 * Reading a world out of a Docker container or volume, per `main/dockerworld/ipc.ts`. The
 * local daemon only - see that module's own doc comment for why a remote Docker host
 * reached over SSH is not wired to a button yet.
 *
 * A namespace for the same reason `bedrock` and `repair` are: the picker feature-detects
 * the whole capability at once. No method here rejects: every possible answer, including
 * "Docker is not installed", is a sentence the picker has to show, never a stack trace.
 * `fetch` resolves once the copy has ended. `onDockerWorldEvent` separately carries the
 * fetcher's real phase and file-count events so a long operation can report honestly.
 */
export interface DockerWorldBridge {
    /** Every container and volume Docker knows about, running or not. */
    list(): Promise<DockerWorldListAnswer>;
    /** One container's mounts and running state, read fresh - never cached. */
    inspectContainer(id: string): Promise<DockerContainerAnswer>;
    /** One volume's driver and mountpoint. */
    inspectVolume(name: string): Promise<DockerVolumeAnswer>;
    /** Copies a world out. Resolves once the copy has ended, whichever way it ended. */
    fetch(request: DockerWorldFetchRequest): Promise<DockerWorldFetchResult>;
    /** Stops a running fetch. False when nothing is running under that id. */
    cancel(fetchId: string): Promise<boolean>;
    /** Fetch ids still running right now. */
    active(): Promise<readonly string[]>;
    /** The cheap change-check fingerprint for a source, without copying anything. */
    fingerprint(source: DockerSourceRequest): Promise<DockerWorldFingerprintResult>;
    /** The pure half of the change check: no Docker daemon and no network. */
    fingerprintsEqual(a: DockerWorldFingerprint, b: DockerWorldFingerprint): Promise<boolean>;
    /** Real fetch phase/progress events; returns the exact unsubscribe function. */
    onDockerWorldEvent(listener: (event: DockerWorldEvent) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* The profile list's and the application settings' own version history      */
/* -------------------------------------------------------------------------- */

/**
 * The profile list's version history, mirroring `main/profiles/ipc.ts`.
 *
 * A narrower namespace than {@link HistoryBridge}: `profilesHistory:*` has no `folder`
 * argument at all, because there is exactly one profile list per installation rather than
 * one a person chose, and the main-process side offers only what `docs/config-history.md`
 * calls "genuinely wired" today - reading, saving, listing and restoring. Diffing,
 * labelling and discarding older revisions are the config-folder history's own extras and
 * are not offered here; a bridge namespace that promised them would be a control that
 * throws the moment it was pressed.
 *
 * Nothing here rejects, for the same reason nothing on `history` does: every method
 * resolves with a value, failures included.
 */
interface ProfilesHistoryBridge {
    /** The profile list as it is on disk right now. */
    read(): Promise<ProfilesState>;
    /** Writes the profile list and records exactly one revision of it, when it changed. */
    save(state: ProfilesState): Promise<ProfilesSaveResult | { ok: false; message: string }>;
    /** Every revision of the profile list, newest first. */
    list(limit?: number): Promise<ProfilesHistoryListing>;
    /** Puts the profile list back as it was at one revision, recorded as a new revision. */
    restore(id: string): Promise<RestoreResult>;
    /**
     * Keeps the newest `keep` revisions and removes the rest. **Destructive** - see
     * `main/profiles/history.ts`'s `discardOlderProfilesRevisions`.
     */
    discardOlderRevisions(keep: number): Promise<HistoryWrite>;
}

/** The application settings' version history. Same shape as {@link ProfilesHistoryBridge}, same reason. */
interface AppSettingsHistoryBridge {
    read(): Promise<AppSettingsState>;
    save(state: AppSettingsState): Promise<AppSettingsSaveResult | { ok: false; message: string }>;
    list(limit?: number): Promise<AppSettingsHistoryListing>;
    restore(id: string): Promise<RestoreResult>;
    discardOlderRevisions(keep: number): Promise<HistoryWrite>;
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

export type GitHubSignInResult =
    { ok: true; account: GitHubAccount } | { ok: false; failure: GitHubFailure };

export interface GitHubSignOutResult {
    signedOut: boolean;
    /** True only when GitHub confirmed the revocation, never merely because it was asked. */
    revoked: boolean;
    reason: string | null;
    manageUrl: string | null;
    /**
     * Who this fell back to when another account was stored, or null when the sign-out was
     * complete. The legacy single-account channel now falls back rather than always leaving
     * nobody signed in, so a screen that ignores this can report "signed out" beside a
     * still-live account.
     */
    fallbackAccount: GitHubAccount | null;
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

/**
 * One stored account, as the multi-account list shows it - every {@link GitHubAccount}
 * fact, plus an id to act on and whether it is the one every single-account channel above
 * currently resolves to.
 */
export interface GitHubAccountSummary extends GitHubAccount {
    id: string;
    active: boolean;
}

export interface GitHubAccountsList {
    accounts: GitHubAccountSummary[];
    activeId: string | null;
}

/**
 * What removing one stored account actually did.
 *
 * `fallbackAccount` names exactly which account is active afterwards, or is null when
 * nobody else was stored - the honest answer to "who is signed in now", not an assumption
 * that removing the active account always means signing out completely.
 */
export interface GitHubRemoveAccountResult {
    removed: boolean;
    wasActive: boolean;
    newActiveId: string | null;
    revoked: boolean;
    reason: string | null;
    manageUrl: string | null;
    fallbackAccount: GitHubAccount | null;
}

export interface GitHubSetActiveAccountResult {
    ok: boolean;
    activeId: string | null;
    account: GitHubAccount | null;
    reason: string | null;
}

/** Never carries the token itself - that never crosses IPC, refreshed or not. */
export interface GitHubRefreshAccountResult {
    ok: boolean;
    account: GitHubAccount | null;
    failure: GitHubFailure | null;
}

/* -------------------------------------------------------------------------- */
/* The gh command-line tool's OWN accounts - a completely separate store      */
/* -------------------------------------------------------------------------- */

/**
 * One account the `gh` command-line tool itself has stored on this computer - NOT one of
 * this application's own accounts above. `gh` keeps its own credential store, shared by
 * every terminal, script and other tool on this machine, and it can hold different accounts
 * - or a different active one - than this application does. See `main/ghcli/accounts.ts`
 * for the full explanation and why the two are never merged into one list.
 */
export interface GhCliAccount {
    login: string;
    host: string;
    active: boolean;
    scopes: string[];
    /** False when `gh` reported no scope text for this account at all (a fine-grained token). */
    scopesReported: boolean;
    tokenSource: string | null;
    gitProtocol: string | null;
    healthy: boolean;
    stateDetail: string | null;
    /** From this application's own scopes of interest (`repo`, `workflow`), the ones missing. */
    missingAppScopes: string[];
}

export type GhCliAvailability = "not-installed" | "no-accounts" | "ready" | "unrecognised";

export interface GhCliAccountsStatus {
    availability: GhCliAvailability;
    version: string | null;
    accounts: GhCliAccount[];
    source: "json" | "text" | null;
    message: string;
}

/**
 * What switching gh's active account actually did.
 *
 * `ok: true` is only ever reported after the main process re-read the account list and
 * confirmed the switch genuinely took - never from `gh`'s own exit code alone. `message`
 * always names the machine-wide consequence on success: this changes gh for every terminal,
 * script and other tool on the computer, not only this application.
 */
export interface GhCliSwitchResult {
    ok: boolean;
    account: GhCliAccount | null;
    message: string;
}

export /**
 * The backup types come from the main process itself rather than being restated here, so
 * this bridge cannot drift from what actually crosses. Only the two names the UI spells
 * differently are aliased, and `BackupAnswer` is the one shape `main/backup/ipc.ts` keeps
 * private because it is the IPC envelope rather than a subsystem type.
 */
type BackupRepositoryChoice = RepositoryChoice;
type BackupRepositoryReport = RepositoryReport;
type BackupAnswer<T> =
    { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };
/**
 * `backup:createRepository`'s own envelope, carrying a distinguishable failure code -
 * `main/backup/ipc.ts` keeps this private for the same reason it keeps `BackupAnswer`
 * private, so it is restated here rather than imported.
 */
type BackupCreateRepositoryAnswer =
    | { readonly ok: true; readonly value: BackupRepositoryChoice }
    | {
          readonly ok: false;
          readonly code: "name-taken" | "not-signed-in" | "other";
          readonly message: string;
      };

interface BackupSourceReport {
    readonly kind: BackupSourceKind;
    readonly folder: string;
    readonly label: string;
    readonly files: number;
    readonly bytes: number;
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

interface WorldlensBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;

    /**
     * The window buttons, for the app's own title bar.
     *
     * The window is frameless, so the operating system draws no minimise, maximise or
     * close. Without these the only way out of the application is Alt+F4, which is why
     * they are part of the bridge rather than a nicety: a title bar that cannot close
     * its window is not a title bar.
     *
     * Each acts on the window the call came from, resolved in the main process from the
     * sender. The renderer never names a window, so one cannot reach another.
     */
    minimizeWindow(): Promise<void>;
    /** Maximises, or restores if it already is. Returns the state it ended in. */
    toggleMaximizeWindow(): Promise<boolean>;
    closeWindow(): Promise<void>;
    isWindowMaximized(): Promise<boolean>;
    /**
     * Subscribes to maximise-state changes. Returns the unsubscribe function.
     *
     * Pushed rather than polled because the state changes from outside the renderer
     * too - a double-click on the drag region, Win+Up, the window manager - and a title
     * bar showing the restore icon on a window that is not maximised is a button that
     * lies about what it will do.
     */
    onWindowMaximizedChanged(listener: (maximized: boolean) => void): () => void;

    /**
     * Mojang download consent.
     *
     * Asked once, during first-run setup, and remembered afterwards. Nothing in the
     * app may ask again: a render that needs consent and does not have it reports
     * what is missing and points at the setting, rather than putting a licence in
     * front of somebody who is halfway through a task.
     */
    readConsent(): Promise<ConsentRecord>;
    /**
     * Mojang's own EULA text, so it can be read here rather than taken on trust.
     *
     * Never rejects: a refusal carries the reason and any cached copy, because a licence
     * that will not load is a thing to say plainly rather than an empty panel.
     */
    readEulaDocument(request: { refresh: boolean }): Promise<EulaLoadResult>;
    acceptDownload(): Promise<ConsentRecord>;
    revokeDownloadConsent(): Promise<ConsentRecord>;

    /** True only on the very first launch. The shell shows setup when it is. */
    needsFirstRun(): Promise<boolean>;
    /** Called when setup finishes, whichever way consent was answered. */
    completeFirstRun(): Promise<FirstRunState>;

    /**
     * Reads a folder shallowly, so the wizard can say whether it is a world.
     *
     * Rejects when the folder cannot be read, rather than returning an empty listing:
     * "no `level.dat` here" and "this folder does not exist" are different answers, and
     * a wizard that reports the first when the second is true sends somebody looking
     * for a file rather than for a typo in the path.
     */
    inspectWorldFolder(folder: string): Promise<WorldFolderListing>;

    /**
     * The Minecraft folders worlds are offered from: the detected default, then whatever
     * the person has mounted.
     *
     * Never rejects for a folder that is not there. A machine with no Minecraft on it is
     * an ordinary machine, and the answer is a row saying where it looked rather than an
     * error the wizard has to recover from.
     */
    listMinecraftFolders(): Promise<MinecraftFolder[]>;

    /**
     * Adds a Minecraft folder to that list, taking either an installation or the `saves`
     * folder inside it and reporting which it found.
     *
     * A folder that is neither comes back `ok: false` with a sentence naming what was
     * expected. Mounting one that is already listed is not an error: it comes back with
     * `alreadyMounted` so the interface can point at the existing row instead of growing
     * a duplicate.
     */
    mountMinecraftFolder(folder: string): Promise<MountFolderResult>;

    /**
     * Takes a mounted folder off the list.
     *
     * Nothing on disk is touched. No world, no file and no folder is deleted by this; it
     * rewrites one small JSON list and does not open the folder it is forgetting. A
     * detected default is not stored and so cannot be taken out of a list it was never
     * in, which is what `false` means.
     */
    unmountMinecraftFolder(id: string): Promise<boolean>;

    /** Renames a mounted folder. An empty label puts the default name back. */
    labelMinecraftFolder(id: string, label: string): Promise<boolean>;

    /**
     * Reads the worlds in one mounted folder.
     *
     * One folder per call on purpose, so the interface can show each finishing on its
     * own: a folder on a slow network drive is then visibly slow rather than holding up
     * the four local folders that were ready immediately. A folder that cannot be read
     * resolves `ok: false` with its own message rather than rejecting, so one unplugged
     * drive never takes the other folders' worlds off the screen.
     */
    scanMinecraftFolder(id: string): Promise<FolderScanResult>;

    /**
     * The real path of a file or folder the person dropped onto the window.
     *
     * Electron removed `File.path` in version 32, so a drop handler in the renderer sees
     * a `File` with a name and no location. `webUtils.getPathForFile` is the replacement
     * and it can only be called here, in the preload, which is why this exists at all.
     * Null when the object was not a real file - a drag from a browser tab, say - rather
     * than a made-up path.
     */
    pathForDroppedFile(file: File): string | null;

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

    /**
     * Adjusts a running render's speed live, without stopping it.
     *
     * Applies exactly what the render's route can genuinely change right now - OS process
     * priority for a local render, the container's own CPU quota for a Docker render - and
     * reports exactly what it could not: `result.message` and `result.reason` say plainly
     * when part of the requested level only takes effect on the next render. Never rejects,
     * including when the render has already finished or its container has already stopped.
     */
    adjustRenderSpeed(renderId: string, level: SpeedLevelNumber): Promise<SpeedAdjustmentResult>;

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
     * The Java the app would render with, measured rather than inferred.
     *
     * The same pass a render makes - `JAVA_HOME`, then `java` on `PATH`, then the copy
     * the app provisioned - and each candidate is *run* before it is believed, because a
     * path is not evidence: `JAVA_HOME` outlives the JDK it pointed at, and a folder
     * named `jdk-25` can contain a JDK 17. Every rejection comes back with it, so a
     * machine with no suitable Java can be told which of its three JDKs was wrong and
     * why.
     *
     * Rejects when discovery itself failed. Nothing is downloaded: asking what is
     * installed must never be the reason two hundred megabytes leave the machine.
     */
    javaRuntime(): Promise<JavaRuntimeSummary>;

    /**
     * Whether downloading a Java runtime has been agreed to, in the same one-asked-once
     * shape as the Mojang download consent above.
     */
    javaDownloadConsent(): Promise<JavaDownloadConsentSummary>;

    /**
     * Records agreement to download a Java runtime. Idempotent: calling it again keeps
     * the original timestamp.
     */
    acceptJavaDownloadConsent(): Promise<JavaDownloadConsentSummary>;

    /**
     * Downloads, verifies and installs a Temurin JDK, only when consent was already
     * given - the main process refuses otherwise rather than asking on the renderer's
     * behalf. Never rejects: a refusal comes back `ok: false` with a message. Watch
     * `onJavaProvisionEvent` for progress while this is in flight.
     */
    provisionJavaRuntime(): Promise<JavaProvisionOutcome>;

    /**
     * Subscribes to `java:provision` progress. Returns the unsubscribe function.
     *
     * Pushed rather than polled for the same reason render progress is: a ~180 MB
     * download and extraction takes real time, and a spinner for a minute is
     * indistinguishable from a hang.
     */
    onJavaProvisionEvent(listener: (event: JavaProvisionEvent) => void): () => void;

    /**
     * What winget/Chocolatey would do for every known system dependency (git, the
     * GitHub CLI, Docker Desktop, rsync), before anything is downloaded or installed.
     *
     * Detects both package managers and checks every dependency's presence, so the
     * settings screen can show the exact route, the exact elevation disclosure and
     * the exact "already installed" state before the one install button is pressed.
     */
    sysdepsPreview(): Promise<SysdepPreviewRow[]>;

    /**
     * Installs every dependency id in the list, in order. Never rejects: every
     * outcome - installed, already installed, declined elevation, not found, a
     * network failure, cancelled, or a genuine failure with its real exit code -
     * comes back as data in the returned batch result. Watch `onSysdepInstallEvent`
     * for progress while this is in flight.
     */
    installSysdeps(ids: string[]): Promise<SysdepBatchResult>;

    /**
     * Cancels whichever `installSysdeps` batch is currently running. Reports
     * `{ cancelled: false }` when nothing is running rather than pretending it did
     * something. The real child process is what gets killed - see `main/sysdeps/
     * winget.ts`/`chocolatey.ts`, both of which check the real abort before
     * anything else, so a cancelled dependency comes back `"cancelled"`, never
     * folded into a generic failure.
     */
    cancelSysdepInstall(): Promise<{ cancelled: boolean }>;

    /**
     * Subscribes to `sysdeps:install` progress. Returns the unsubscribe function.
     *
     * Pushed rather than polled for the same reason Java provisioning is: a first
     * Docker Desktop download can take minutes, and a spinner for minutes is
     * indistinguishable from a hang.
     */
    onSysdepInstallEvent(listener: (event: SysdepInstallEvent) => void): () => void;

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
     * Answered from `worldsource:discover` rather than `download:discover`: the former is
     * this one's superset - a manifest-shaped or unsplit release is handed straight to the
     * same `ReleaseDownloader`, and a checksum-list release, from any public repository, is
     * additionally understood - so routing every discovery through it is what makes both
     * split layouts and a repository that is not this project's own reachable from this
     * one method rather than needing the panel to ask two different ones.
     *
     * A file too large for a release asset is published in pieces, and this reports it as
     * the one download it really is. `split` and `parts` are there so the interface can
     * say so; nothing else about the split reaches the renderer. See
     * `preload/worldSourceBridge.ts` for exactly how a `kind` becomes a `split`.
     */
    discoverRelease(request: {
        owner: string;
        repo: string;
        tag?: string;
    }): Promise<{ ok: true; release: DiscoveredRelease } | { ok: false; message: string }>;

    /**
     * Downloads one asset, rejoins it if it was split, and unpacks it.
     *
     * Answered from `worldsource:fetch` for the same reason `discoverRelease` is: a
     * manifest-shaped or unsplit request is handed straight to the release downloader this
     * panel already lists, and a checksum-list request is additionally understood, from
     * any public repository. `worldsource:fetch` resolves with exactly the shape
     * `download:start` always did, so nothing here changes for a manifest-shaped download.
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
     * Answered from `worldsource:cancel`, which asks both the checksum-list fetcher's own
     * in-flight map and the shared release downloader - a manifest-shaped download is
     * tracked by the second and a checksum-list one by the first, and the caller does not
     * know which took the request. Asking only `download:cancel` would silently fail to
     * stop the second kind.
     *
     * What is on disk is kept, because every part is checksummed individually and the
     * next attempt continues from the byte this one stopped at.
     */
    cancelDownload(downloadId: string): Promise<boolean>;

    /**
     * Download ids in flight right now.
     *
     * Answered from `worldsource:active` for the same reason `cancelDownload` is: it is
     * the union of what the checksum-list fetcher and the shared downloader each have
     * running, and `download:active` alone would miss the first.
     */
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

    /**
     * Every account this computer has stored, richest first. Additive: a build with no
     * multi-account support simply lacks this method, and the section falls back to the
     * single-account facts above.
     */
    githubListAccounts(): Promise<GitHubAccountsList>;

    /** Removes one specific account's stored token, active or not. */
    githubRemoveAccount(id: string): Promise<GitHubRemoveAccountResult>;

    /** Switches which stored account every single-account channel above resolves to. */
    githubSetActiveAccount(id: string): Promise<GitHubSetActiveAccountResult>;

    /** Renews one specific account's token ahead of its own expiry. */
    githubRefreshAccount(id: string): Promise<GitHubRefreshAccountResult>;

    /* ---------------------------------------------------------------------- */
    /* The gh command-line tool's OWN accounts - a separate credential store   */
    /* ---------------------------------------------------------------------- */

    /**
     * Every account the `gh` command-line tool itself has stored on this computer - not
     * this application's own accounts above, and never merged with them. Absent entirely on
     * a build with no ghCli support; the interface says so plainly rather than showing an
     * empty list that would read as "you have no accounts".
     */
    ghCliListAccounts(): Promise<GhCliAccountsStatus>;

    /**
     * Switches `gh`'s own active account on one host.
     *
     * This changes `gh` for the **whole computer** - every terminal, script and other tool
     * that shells out to `gh`, not only this application. Never rejects: a failure comes
     * back `ok: false` with a message naming the real reason, and a success is only ever
     * reported after re-reading confirmed the switch genuinely took.
     */
    ghCliSwitchAccount(host: string, login: string): Promise<GhCliSwitchResult>;

    /**
     * Reading and writing a BlueMap config folder, for the options screen.
     *
     * A namespace rather than seven more methods on the bridge, because the editor
     * feature-detects the whole capability at once: it presents no folder picker, no save
     * and no connection test unless every one of these is really there, since a bridge
     * that has half of them is a screen full of controls that throw.
     *
     * Nothing here caches. Each call reads or writes the folder it is given, so a config
     * edited in another program is what Reload shows.
     */
    config: ConfigBridge;

    /**
     * The screen-agnostic folder/file picker, for any path field in the app.
     *
     * Unlike `config`, this namespace needs no `provideConfigHost()` ancestor: it is reached
     * straight from `window.worldlens.dialog`, so Settings, Backup and the remote
     * target editor can browse for a path exactly as the world and config screens already do.
     */
    dialog: DialogBridge;

    /**
     * The local version history of a config folder, for the history panel.
     *
     * A namespace for the same reason `config` is: the panel feature-detects the whole
     * capability at once, because a panel offering Restore on a bridge that has no
     * `restore` is a button that throws.
     *
     * The history lives in its own repository beside this application's data. Nothing is
     * ever written into the folder the user chose except by an explicit restore, and
     * nothing is ever sent anywhere: there is no remote, no push and no channel that
     * could accept one.
     */
    history: HistoryBridge;

    /**
     * The server-profile list's own version history: read, save, list, restore. Additive
     * and narrower than {@link HistoryBridge} - see {@link ProfilesHistoryBridge}'s doc for
     * why there is no `folder` argument and no diff, label or discard here.
     */
    profilesHistory: ProfilesHistoryBridge;

    /** The application settings' own version history. Same shape and reason as {@link profilesHistory}. */
    appSettingsHistory: AppSettingsHistoryBridge;

    /** Recognising and converting Bedrock Edition worlds. See {@link BedrockBridge}. */
    bedrock: BedrockBridge;

    /** Diagnosing and repairing a failed render or web server. See {@link RepairBridge}. */
    repair: RepairBridge;

    /**
     * Keeping a Minecraft world in a git repository, so a render never has to re-zip it.
     * See {@link WorldRepoBridge}.
     */
    worldRepo: WorldRepoBridge;

    /**
     * Fetching a world from a machine the person already owns, reached over SSH. See
     * {@link WorldSourceSshBridge}.
     */
    sshWorldSource: WorldSourceSshBridge;

    /** Reading a world out of a Docker container or volume. See {@link DockerWorldBridge}. */
    dockerWorld: DockerWorldBridge;

    /**
     * A world's own record of how it should be rendered, and the history of it.
     *
     * The world list uses `discoverMany` to show which worlds carry a project. A `present`
     * row with a null `name` and a `problem` is a world whose project is there and damaged,
     * which is a different thing to say than "no project" - and the reason this is not a
     * boolean.
     */
    project: ProjectBridge;

    /* ---- Keeping the application current ------------------------------- */

    /**
     * What the updater knows right now.
     *
     * Only a *description* of the feed crosses, never its token: the credential stays in
     * the main process, and a test serialises this whole object to prove it is not in here.
     */
    /* ---- Handing a render to GitHub's machines --------------------------- */

    /**
     * What a sync would do, before it does any of it.
     *
     * Says which credential route would be used, whether the world has to be uploaded at
     * all, what the repository's visibility means, and what a workflow's inputs cannot
     * carry - so the refusals arrive before an upload rather than inside one.
     */
    /* ---- Where a render runs, and containers left behind ------------------ */

    /**
     * Docker's state in five distinct answers, with the client version reported even when
     * the daemon is down - which is what lets a screen say "Docker 29.6.1 is installed but
     * its daemon is not running" rather than collapsing that into "Docker is not available".
     */
    dockerRuntime(): Promise<unknown>;
    /** Where a render could run, and whether each place is actually up. */
    runtimeModes(): Promise<unknown>;
    /** Containers from an earlier session: still running, finished while away, or gone. */
    containerOffers(): Promise<unknown>;
    /** Picks one back up. Reports on the ordinary render events, like any other render. */
    reattachContainer(renderId: string): Promise<unknown>;
    /** Stops a reattached container by asking its daemon, not by hanging up. */
    cancelContainer(renderId: string): Promise<boolean>;
    /** Forgets a record without touching whatever it points at. */
    dismissContainer(renderId: string): Promise<boolean>;

    /* ---- Worlds published as somebody else's release --------------------- */

    /**
     * Reads `owner/repo`, a URL or a release link into the pieces an API path needs.
     *
     * Already in the shape the owner/repository/tag fields take, so the "paste a link"
     * field can write the answer straight into them: `null` when the text named no
     * repository, which a field mid-keystroke does far more often than it names one.
     */
    parseWorldSource(text: string): Promise<BridgeReleaseCoordinates | null>;

    /* ---- Handing a render to a Linux machine over SSH --------------------- */

    /** Checks a target's shape. There is no password field, here or anywhere. */
    validateRemoteTarget(target: unknown): Promise<unknown>;
    /** Says in words what is sent, what is never sent, and what is left behind. */
    describeRemoteTarget(target: unknown): Promise<unknown>;
    /** ssh, host key, docker, disk - in that order, each with its own sentence. */
    remotePreflight(target: unknown): Promise<unknown>;
    /**
     * Records a host key the person has just been shown and accepted.
     *
     * The main process re-scans and writes only a key it offered, so this cannot be used to
     * put a line of its choosing into a trust store.
     */
    trustRemoteHostKey(request: unknown): Promise<unknown>;
    /** Renders there. Progress arrives on the ordinary render events, like a local one. */
    startRemoteRender(request: unknown): Promise<unknown>;
    /** Asks the remote daemon to stop the container, not merely hangs up the ssh. */
    cancelRemoteRender(renderId: string): Promise<boolean>;
    activeRemoteRenders(): Promise<readonly string[]>;

    /* ---- Hosting an already-rendered map on that same kind of machine ------ */

    /**
     * Publishes (or republishes - it is the same call) an already-rendered map to a Linux
     * server, over SSH, in a detached Docker container. Progress arrives on its own event
     * channel; see `RemoteHostingScreen.vue`.
     */
    startRemoteHosting(request: unknown): Promise<unknown>;
    /** Every map this build remembers hosting, newest first. */
    remoteHostingRecords(): Promise<readonly unknown[]>;
    remoteHostingRecord(hostingId: string): Promise<unknown>;
    /** Re-checks whether a hosted map still answers, without transferring anything. */
    refreshRemoteHosting(hostingId: string): Promise<unknown>;
    /**
     * Stops hosting: the container is torn down and, unless the target keeps its files, the
     * remote copy of the world is removed too. The interface puts this behind its own
     * super-confirmation gate before ever calling it.
     */
    stopRemoteHosting(hostingId: string): Promise<unknown>;
    /** Progress and log lines for a hosting run in progress. */
    onRemoteHostingEvent(listener: (event: RemoteHostEvent) => void): () => void;
    /**
     * Lists one folder on the target, for the Explorer-style remote browser.
     *
     * Detects a Linux or a Windows remote and lists it the way that remote actually
     * understands, and reads the same "does this look like a Minecraft world" signal
     * `inspectWorldFolder` reads locally, in the same round trip as the listing. Never
     * rejects: a bad path, a refused permission or a dead connection is an answer the
     * browser renders.
     */
    browseRemoteDirectory(target: unknown, path: string): Promise<unknown>;

    ciRenderPreflight(
        request: CiSyncRequest,
    ): Promise<{ ok: true; value: CiPreflight } | { ok: false; message: string }>;
    startCiRender(request: CiSyncRequest): Promise<CiSyncResult>;
    /** Polls a recorded run without starting anything. Resuming and starting are one call. */
    checkCiRender(syncId: string): Promise<CiSyncResult>;
    listCiRenders(): Promise<
        { ok: true; value: readonly CiSyncState[] } | { ok: false; message: string }
    >;
    cancelCiRender(syncId: string): Promise<boolean>;
    /**
     * Syncs this process is actively driving right now, whether or not they have written a
     * record to disk yet. `listCiRenders` alone cannot show a render started moments ago in
     * another window - `sync()` reads the repository, fingerprints the world and, when
     * reusable, asks GitHub about the previous asset before its first state file is
     * written - so a screen that opens in that gap needs this to avoid looking idle.
     */
    activeCiRenders(): Promise<readonly string[]>;
    onCiRenderEvent(listener: (event: CiSyncEvent) => void): () => void;

    /**
     * The signed-in login plus every organisation, for the setup card's owner field.
     *
     * Given an account id, resolves this for that specific stored account rather than
     * whichever one is active - what the setup card's account picker uses to re-resolve
     * the owner list the moment somebody chooses a different signed-in account.
     */
    ciRenderOwners(accountId?: string): Promise<CiOwnerChoicesAnswer>;
    /** A world or map name, sanitized to a name GitHub's own rules will accept. Pure; no network. */
    suggestCiRepoName(sourceName: string): Promise<string>;
    /** Whether `owner/repo` is free. `"unknown"` rather than a guess when it could not be told. */
    checkCiRepoName(request: {
        owner: string;
        repo: string;
    }): Promise<CiRepositoryNameAvailability>;

    /**
     * Scheduled re-rendering's current status for one repository: on or off, its cadence,
     * and what `.github/workflows/scheduled-render.yml` last found. See
     * docs/scheduled-render.md.
     */
    ciRenderScheduleRead(
        owner: string,
        repo: string,
        accountId?: string,
    ): Promise<{ ok: true; value: CiScheduleStatus } | { ok: false; message: string }>;
    /**
     * Turns scheduled re-rendering on (with a cadence) or off, for one recorded sync.
     * Refused, with the reason, for a world that has never been uploaded - see
     * `CiScheduleWriteResult`.
     */
    ciRenderScheduleWrite(
        syncId: string,
        enabled: boolean,
        cadence: string,
        accountId?: string,
    ): Promise<{ ok: true; value: CiScheduleWriteResult } | { ok: false; message: string }>;

    /**
     * Prepares a repository so a CI render can actually run on it - committing the render
     * workflow additively, whether the repository is truly empty, already has content, or
     * carries a stale copy this application wrote before. See `main/cirender/bootstrap.ts`.
     */
    bootstrapCiRepository(
        owner: string,
        repo: string,
        accountId?: string,
        prefer?: "session" | "gh",
    ): Promise<CiBootstrapResult>;
    onCiBootstrapEvent(listener: (event: CiBootstrapEvent) => void): () => void;

    /* ---- Hosting a rendered map on GitHub Pages -------------------------- */

    /** Renders on this computer with a web root worth publishing. */
    pagesRenders(): Promise<PagesAnswer<readonly PagesCandidate[]>>;
    /** The account, and every organisation it can write to. */
    pagesOwners(): Promise<PagesAnswer<readonly PagesOwner[]>>;
    /**
     * What publishing would do, before it does any of it.
     *
     * Writes nothing: the static-host preparation runs in preview mode, and the repository is
     * only read. `blockers` being non-empty means the publish button must not be pressed.
     */
    pagesPreflight(request: PagesTarget): Promise<PagesAnswer<PagesPreflight>>;
    /**
     * Prepares, stages, force-pushes the publishing branch, turns Pages on and waits.
     *
     * Refuses when the branch exists and carries no marker written by this application, so a
     * mistyped repository name cannot replace somebody else's site.
     */
    publishPages(request: PagesPublishRequest): Promise<PagesResult>;
    /** Turns Pages off and deletes the publishing branch. Destructive; gated in the interface. */
    stopPagesHosting(request: PagesTarget): Promise<PagesStopResult>;
    cancelPagesPublish(renderId: string): Promise<boolean>;
    activePagesPublishes(): Promise<readonly string[]>;
    /** What this computer remembers publishing, so a site can be found again and taken down. */
    publishedPages(): Promise<PagesAnswer<readonly PagesRecord[]>>;
    /** Continue a Pages publish whose durable stage marker says it was interrupted. */
    resumePages(renderId: string): Promise<PagesResult>;
    /** Re-check GitHub Pages and the published URL for one recorded site. */
    refreshPagesStatus(renderId: string): Promise<PagesAnswer<PagesRecord>>;
    onPagesEvent(listener: (event: PagesEvent) => void): () => void;

    /* ---- Watching a render live, in a real browser tab -------------------- */

    /** Whether this render id can be hosted right now, and why not when it cannot. */
    previewAvailability(renderId: string): Promise<PreviewAvailability>;
    /** Starts serving one render's output. Loopback unless `allowNetwork` is explicitly true. */
    startPreview(request: PreviewStartRequest): Promise<PreviewStartAnswer>;
    /** Stops the currently hosted render, if any. False when nothing was running. */
    stopPreview(): Promise<boolean>;
    previewStatus(): Promise<PreviewStatusAnswer>;
    /** Opens the currently hosted preview in the system browser. Never takes a URL - see `main/preview/ipc.ts`. */
    openPreviewInBrowser(): Promise<boolean>;
    /** The persisted default the network-exposure checkbox starts at - never a bypass of it. */
    previewNetworkDefault(): Promise<PreviewNetworkReadout>;
    setPreviewNetworkDefault(allowNetwork: boolean): Promise<PreviewNetworkReadout>;
    onPreviewEvent(listener: (event: PreviewEvent) => void): () => void;

    updateState(): Promise<UpdateState>;
    checkForUpdates(): Promise<UpdateState>;
    /**
     * Quits into the installer, if nothing is in the way.
     *
     * Refuses rather than throwing when a render is running: that is hours of work, and
     * this is the moment the guard is re-read rather than an earlier sample.
     */
    restartToInstallUpdate(): Promise<UpdateRestartResult>;
    onUpdateEvent(listener: (state: UpdateState) => void): () => void;

    /* ---- Folders this application owns ---------------------------------- */

    /** Shows a path in Explorer. Refused unless it is inside a folder this app owns. */
    /**
     * The runtime modes `startRender` actually honours in this build.
     *
     * A claim about the build, not the machine. `runtimeModes()` says whether Docker is
     * running right now; this says whether choosing it would do anything at all. Reading
     * the first as the second offers a choice that renders locally anyway.
     *
     * Asked over IPC rather than answered here: the real list lives in the main process's
     * `render:runtimeModes` handler, and a literal here would be a second place that answer
     * could drift from the first.
     */
    renderRuntimeModes(): Promise<readonly ("local" | "docker")[]>;

    revealPath(path: string): Promise<RevealResult>;
    /** Those folders, read fresh, so a storage directory somebody moved is the one allowed. */
    revealRoots(): Promise<RevealRootReadout[]>;
    /** Where rendered maps would go by default, and why, when OneDrive moved Documents. */
    mapStorageDefault(): Promise<MapStorageDefaultReadout>;
    /** The ceiling the render JVM runs under, with the units stated both ways. */
    renderMemory(): Promise<RenderMemoryReadout>;
    setRenderMemory(setting: {
        mode: "automatic" | "manual";
        megabytes: number;
    }): Promise<RenderMemoryWriteResult>;
    /** How many release-asset parts a download fetches at once, with its bounds. */
    downloadConcurrency(): Promise<DownloadConcurrencyReadout>;
    setDownloadConcurrency(workers: number): Promise<DownloadConcurrencyWriteResult>;

    /* ---- Backing a world or a rendered map up to GitHub ------------------ */

    /** Repositories the signed-in account can actually write to. */
    listBackupRepositories(): Promise<BackupAnswer<readonly BackupRepositoryChoice[]>>;
    /**
     * Creates a brand-new repository for somebody who has none suitable to pick from the
     * list above, and initialises it with one starter commit so a first backup's release
     * never lands on an empty repository. Never overwrites: GitHub itself refuses a name
     * that already exists, reported here with its own `name-taken` code.
     */
    createBackupRepository(request: {
        ownerLogin: string;
        ownerKind: "user" | "organization";
        name: string;
        private: boolean;
    }): Promise<BackupCreateRepositoryAnswer>;
    /** Reads a repository so the surface can warn about a PUBLIC one before packing. */
    inspectBackupRepository(request: {
        owner: string;
        repo: string;
    }): Promise<BackupAnswer<BackupRepositoryReport>>;
    /** Reads a folder well enough to say what backing it up would involve. */
    inspectBackupSource(request: {
        kind: BackupSourceKind;
        folder: string;
    }): Promise<BackupAnswer<BackupSourceReport>>;
    /** Backups already on a repository, read from each release's own small assets. */
    listBackups(request: {
        owner: string;
        repo: string;
    }): Promise<BackupAnswer<readonly BackupListing[]>>;
    /**
     * Packs, splits, publishes and uploads. Takes as long as the world is big; watch
     * `onBackupEvent` for progress. Never rejects: a refusal is `ok: false` with a code.
     */
    startBackup(request: BackupRequest): Promise<BackupResult>;
    /** Stops one. What is packed and uploaded is kept. False when there was nothing to stop. */
    cancelBackup(backupId: string): Promise<boolean>;
    activeBackups(): Promise<readonly string[]>;
    onBackupEvent(listener: (event: BackupEvent) => void): () => void;
}

const bridge: WorldlensBridge = {
    syncProfiles: (profiles) => ipcRenderer.invoke("profiles:sync", profiles),
    writeClipboardText: (text) => ipcRenderer.invoke("clipboard:writeText", text),
    getVersion: () => ipcRenderer.invoke("app:version"),

    minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
    toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggleMaximize"),
    closeWindow: () => ipcRenderer.invoke("window:close"),
    isWindowMaximized: () => ipcRenderer.invoke("window:isMaximized"),

    onWindowMaximizedChanged: (listener) => {
        const forward = (_event: IpcRendererEvent, maximized: boolean): void => listener(maximized);
        ipcRenderer.on("window:maximizedChanged", forward);
        return () => {
            ipcRenderer.off("window:maximizedChanged", forward);
        };
    },

    readConsent: () => ipcRenderer.invoke("consent:read"),
    readEulaDocument: (request) => ipcRenderer.invoke("eula:document", request),
    acceptDownload: () => ipcRenderer.invoke("consent:accept"),
    revokeDownloadConsent: () => ipcRenderer.invoke("consent:revoke"),

    needsFirstRun: () => ipcRenderer.invoke("firstRun:needed"),
    completeFirstRun: () => ipcRenderer.invoke("firstRun:complete"),

    inspectWorldFolder: (folder) => ipcRenderer.invoke("world:inspect", folder),

    listMinecraftFolders: () => ipcRenderer.invoke("world:folders"),
    mountMinecraftFolder: (folder) => ipcRenderer.invoke("world:mount", folder),
    unmountMinecraftFolder: (id) => ipcRenderer.invoke("world:unmount", id),
    labelMinecraftFolder: (id, label) => ipcRenderer.invoke("world:label", id, label),
    scanMinecraftFolder: (id) => ipcRenderer.invoke("world:scan", id),

    pathForDroppedFile: (file) => {
        // Guarded rather than trusted: `webUtils` throws for anything that is not a real
        // `File` from the file system, and a drag out of a browser tab or a text selection
        // produces exactly that. Null says "this drop named no folder", which the step can
        // explain, where a thrown error inside a drop handler would silently do nothing.
        try {
            const path = webUtils.getPathForFile(file);
            return typeof path === "string" && path !== "" ? path : null;
        } catch {
            return null;
        }
    },

    startRender: (request) => ipcRenderer.invoke("render:start", request),
    cancelRender: (renderId) => ipcRenderer.invoke("render:cancel", renderId),
    adjustRenderSpeed: (renderId, level) =>
        ipcRenderer.invoke("render:adjustSpeed", renderId, level),
    activeRenders: () => ipcRenderer.invoke("render:active"),
    listRenders: () => ipcRenderer.invoke("render:list"),
    interruptedRenders: () => ipcRenderer.invoke("render:interrupted"),
    resumeRender: (renderId, maps) => ipcRenderer.invoke("render:resume", renderId, maps),
    dismissResume: (renderId) => ipcRenderer.invoke("render:dismissResume", renderId),
    renderEngine: (renderId) => ipcRenderer.invoke("render:engine", renderId),
    mapStorageDirectory: () => ipcRenderer.invoke("render:storageDirectory"),
    setMapStorageDirectory: (value) => ipcRenderer.invoke("render:setStorageDirectory", value),

    javaRuntime: () => ipcRenderer.invoke("java:runtime"),
    javaDownloadConsent: () => ipcRenderer.invoke("java:downloadConsent"),
    acceptJavaDownloadConsent: () => ipcRenderer.invoke("java:acceptDownloadConsent"),
    provisionJavaRuntime: () => ipcRenderer.invoke("java:provision"),
    onJavaProvisionEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: JavaProvisionEvent): void =>
            listener(payload);
        ipcRenderer.on("java:provisionEvent", forward);
        return () => {
            ipcRenderer.off("java:provisionEvent", forward);
        };
    },

    sysdepsPreview: () => ipcRenderer.invoke("sysdeps:preview"),
    installSysdeps: (ids) => ipcRenderer.invoke("sysdeps:install", ids),
    cancelSysdepInstall: () => ipcRenderer.invoke("sysdeps:cancel"),
    onSysdepInstallEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: SysdepInstallEvent): void =>
            listener(payload);
        ipcRenderer.on("sysdeps:installEvent", forward);
        return () => {
            ipcRenderer.off("sysdeps:installEvent", forward);
        };
    },

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

    // Routed through `worldsource:*` rather than `download:*`: the former is this one's
    // superset, so a manifest-shaped download keeps working exactly as it did and a
    // checksum-list download from any public repository becomes reachable from the same
    // four methods rather than needing the panel to call a second set of channels.
    // `listDownloads` stays on `download:list`, because both paths write the same
    // `DownloadRecord` shape into the same on-disk workspace layout, so it already reads
    // back a checksum-list download with no change of its own.
    discoverRelease: async (request) => {
        const answer = (await ipcRenderer.invoke(
            "worldsource:discover",
            request,
        )) as WorldSourceDiscoverAnswer;
        return toBridgeDiscoveryResult(answer);
    },
    startDownload: (request) => ipcRenderer.invoke("worldsource:fetch", request),
    cancelDownload: (downloadId) => ipcRenderer.invoke("worldsource:cancel", downloadId),
    activeDownloads: () => ipcRenderer.invoke("worldsource:active"),
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

    githubListAccounts: () => ipcRenderer.invoke("github:listAccounts"),
    githubRemoveAccount: (id) => ipcRenderer.invoke("github:removeAccount", { id }),
    githubSetActiveAccount: (id) => ipcRenderer.invoke("github:setActiveAccount", { id }),
    githubRefreshAccount: (id) => ipcRenderer.invoke("github:refreshAccount", { id }),

    ghCliListAccounts: () => ipcRenderer.invoke("ghCli:listAccounts"),
    ghCliSwitchAccount: (host, login) => ipcRenderer.invoke("ghCli:switchAccount", { host, login }),

    config: {
        readFolder: (folder) => ipcRenderer.invoke("config:readFolder", folder),
        writeFiles: (folder, files) => ipcRenderer.invoke("config:writeFiles", folder, files),
        deleteFiles: (folder, paths) => ipcRenderer.invoke("config:deleteFiles", folder, paths),
        pickDirectory: (options) => ipcRenderer.invoke("config:pickDirectory", options),
        pickFile: (options) => ipcRenderer.invoke("config:pickFile", options),
        testSqlConnection: (request) => ipcRenderer.invoke("config:testSqlConnection", request),
        suggestConfigFolder: () => ipcRenderer.invoke("config:suggestFolder"),

        // Read from `process` rather than from `node:path`, because a sandboxed preload
        // has no `node:path` to import: only the limited `process` Electron injects, the
        // context bridge and `electron` itself are there. It is used to build display
        // paths, never to resolve one - every real path is joined in the main process,
        // where the separator is the platform's own.
        pathSeparator: process.platform === "win32" ? "\\" : "/",
    },

    dialog: {
        pickFolder: (options) => ipcRenderer.invoke("dialog:pickFolder", options),
        pickFile: (options) => ipcRenderer.invoke("dialog:pickFile", options),
    },

    worldRepo: {
        owners: () => ipcRenderer.invoke("worldrepo:owners"),
        preflight: (target) => ipcRenderer.invoke("worldrepo:preflight", target),
        sync: (request) => ipcRenderer.invoke("worldrepo:sync", request),
        remove: (target) => ipcRenderer.invoke("worldrepo:remove", target),
        cancel: (key) => ipcRenderer.invoke("worldrepo:cancel", key),
        active: () => ipcRenderer.invoke("worldrepo:active"),
        records: () => ipcRenderer.invoke("worldrepo:records"),
        resume: (target) => ipcRenderer.invoke("worldrepo:resume", target),
        remoteTip: (owner, repo, branch) =>
            ipcRenderer.invoke("worldrepo:remoteTip", { owner, repo, branch }),
        adoptionProbe: (request) => ipcRenderer.invoke("worldrepo:adoptionProbe", request),
        adoptionPlan: (request) => ipcRenderer.invoke("worldrepo:adoptionPlan", request),
        onWorldRepoEvent: (listener) => {
            const forward = (_event: IpcRendererEvent, payload: WorldRepoEvent): void =>
                listener(payload);
            ipcRenderer.on("worldrepo:event", forward);
            return () => {
                ipcRenderer.off("worldrepo:event", forward);
            };
        },
    },

    sshWorldSource: {
        validate: (target) => ipcRenderer.invoke("worldsource:ssh:validate", target),
        detect: (target) => ipcRenderer.invoke("worldsource:ssh:detect", target),
        trustHostKey: (target, fingerprint) =>
            ipcRenderer.invoke("worldsource:ssh:trustHostKey", target, fingerprint),
        checkPath: (path, kind) => ipcRenderer.invoke("worldsource:ssh:checkPath", path, kind),
        survey: (target, path, kind) =>
            ipcRenderer.invoke("worldsource:ssh:survey", target, path, kind),
        diff: (previous, current) => ipcRenderer.invoke("worldsource:ssh:diff", previous, current),
        fetch: (request) => ipcRenderer.invoke("worldsource:ssh:fetch", request),
        cancel: (id) => ipcRenderer.invoke("worldsource:ssh:cancel", id),
        active: () => ipcRenderer.invoke("worldsource:ssh:active"),
        onSshWorldSourceEvent: (listener) => {
            const forward = (_event: IpcRendererEvent, payload: SshWorldSourceEvent): void =>
                listener(payload);
            ipcRenderer.on("worldsource:ssh:event", forward);
            return () => {
                ipcRenderer.off("worldsource:ssh:event", forward);
            };
        },
    },

    dockerWorld: {
        list: () => ipcRenderer.invoke("dockerworld:list"),
        inspectContainer: (id) => ipcRenderer.invoke("dockerworld:inspectContainer", id),
        inspectVolume: (name) => ipcRenderer.invoke("dockerworld:inspectVolume", name),
        fetch: (request) => ipcRenderer.invoke("dockerworld:fetch", request),
        cancel: (fetchId) => ipcRenderer.invoke("dockerworld:cancel", fetchId),
        active: () => ipcRenderer.invoke("dockerworld:active"),
        fingerprint: (source) => ipcRenderer.invoke("dockerworld:fingerprint", source),
        fingerprintsEqual: (a, b) => ipcRenderer.invoke("dockerworld:fingerprintsEqual", a, b),
        onDockerWorldEvent: (listener) => {
            const forward = (_event: IpcRendererEvent, payload: DockerWorldEvent): void =>
                listener(payload);
            ipcRenderer.on("dockerworld:event", forward);
            return () => {
                ipcRenderer.off("dockerworld:event", forward);
            };
        },
    },

    dockerRuntime: () => ipcRenderer.invoke("runtime:docker"),
    runtimeModes: () => ipcRenderer.invoke("runtime:modes"),
    containerOffers: () => ipcRenderer.invoke("runtime:containers"),
    reattachContainer: (renderId) => ipcRenderer.invoke("runtime:reattach", renderId),
    cancelContainer: (renderId) => ipcRenderer.invoke("runtime:cancelContainer", renderId),
    dismissContainer: (renderId) => ipcRenderer.invoke("runtime:dismissContainer", renderId),

    parseWorldSource: async (text) => {
        const reference = (await ipcRenderer.invoke(
            "worldsource:parse",
            text,
        )) as WorldSourceReferenceAnswer | null;
        return toBridgeCoordinates(reference);
    },

    validateRemoteTarget: (target) => ipcRenderer.invoke("remote:validate", target),
    describeRemoteTarget: (target) => ipcRenderer.invoke("remote:describe", target),
    remotePreflight: (target) => ipcRenderer.invoke("remote:preflight", target),
    trustRemoteHostKey: (request) => ipcRenderer.invoke("remote:trustHostKey", request),
    startRemoteRender: (request) => ipcRenderer.invoke("remote:render", request),
    cancelRemoteRender: (renderId) => ipcRenderer.invoke("remote:cancel", renderId),
    activeRemoteRenders: () => ipcRenderer.invoke("remote:active"),
    startRemoteHosting: (request) => ipcRenderer.invoke("hosting:start", request),
    remoteHostingRecords: () => ipcRenderer.invoke("hosting:records"),
    remoteHostingRecord: (hostingId) => ipcRenderer.invoke("hosting:record", hostingId),
    refreshRemoteHosting: (hostingId) => ipcRenderer.invoke("hosting:refresh", hostingId),
    stopRemoteHosting: (hostingId) => ipcRenderer.invoke("hosting:stop", hostingId),
    onRemoteHostingEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: RemoteHostEvent): void =>
            listener(payload);
        ipcRenderer.on("hosting:event", forward);
        return () => {
            ipcRenderer.off("hosting:event", forward);
        };
    },
    browseRemoteDirectory: (target, path) => ipcRenderer.invoke("remote:browse", target, path),

    ciRenderPreflight: (request) => ipcRenderer.invoke("cirender:preflight", request),
    startCiRender: (request) => ipcRenderer.invoke("cirender:start", request),
    checkCiRender: (syncId) => ipcRenderer.invoke("cirender:check", syncId),
    listCiRenders: () => ipcRenderer.invoke("cirender:list"),
    cancelCiRender: (syncId) => ipcRenderer.invoke("cirender:cancel", syncId),
    activeCiRenders: () => ipcRenderer.invoke("cirender:active"),
    onCiRenderEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: CiSyncEvent): void => listener(payload);
        ipcRenderer.on("cirender:event", forward);
        return () => {
            ipcRenderer.off("cirender:event", forward);
        };
    },

    ciRenderOwners: (accountId) =>
        ipcRenderer.invoke("cirender:owners", accountId === undefined ? undefined : { accountId }),
    suggestCiRepoName: (sourceName) => ipcRenderer.invoke("cirender:suggestRepoName", sourceName),
    checkCiRepoName: (request) => ipcRenderer.invoke("cirender:checkRepoName", request),
    ciRenderScheduleRead: (owner, repo, accountId) =>
        ipcRenderer.invoke("cirender:scheduleRead", { owner, repo, accountId }),
    ciRenderScheduleWrite: (syncId, enabled, cadence, accountId) =>
        ipcRenderer.invoke("cirender:scheduleWrite", { syncId, enabled, cadence, accountId }),

    bootstrapCiRepository: (owner, repo, accountId, prefer) =>
        ipcRenderer.invoke("cirender:bootstrap", { owner, repo, accountId, prefer }),
    onCiBootstrapEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: CiBootstrapEvent): void =>
            listener(payload);
        ipcRenderer.on("cirender:bootstrapEvent", forward);
        return () => {
            ipcRenderer.off("cirender:bootstrapEvent", forward);
        };
    },

    pagesRenders: () => ipcRenderer.invoke("pages:renders"),
    pagesOwners: () => ipcRenderer.invoke("pages:owners"),
    pagesPreflight: (request) => ipcRenderer.invoke("pages:preflight", request),
    publishPages: (request) => ipcRenderer.invoke("pages:publish", request),
    stopPagesHosting: (request) => ipcRenderer.invoke("pages:stop", request),
    cancelPagesPublish: (renderId) => ipcRenderer.invoke("pages:cancel", renderId),
    activePagesPublishes: () => ipcRenderer.invoke("pages:active"),
    publishedPages: () => ipcRenderer.invoke("pages:published"),
    resumePages: (renderId) => ipcRenderer.invoke("pages:resume", renderId),
    refreshPagesStatus: (renderId) => ipcRenderer.invoke("pages:status", renderId),
    onPagesEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: PagesEvent): void => listener(payload);
        ipcRenderer.on("pages:event", forward);
        return () => {
            ipcRenderer.off("pages:event", forward);
        };
    },

    previewAvailability: (renderId) => ipcRenderer.invoke("preview:availability", renderId),
    startPreview: (request: PreviewStartRequest) => ipcRenderer.invoke("preview:start", request),
    stopPreview: () => ipcRenderer.invoke("preview:stop"),
    previewStatus: () => ipcRenderer.invoke("preview:status"),
    openPreviewInBrowser: () => ipcRenderer.invoke("preview:openInBrowser"),
    previewNetworkDefault: () => ipcRenderer.invoke("preview:networkDefault"),
    setPreviewNetworkDefault: (allowNetwork: boolean) =>
        ipcRenderer.invoke("preview:setNetworkDefault", allowNetwork),
    onPreviewEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: PreviewEvent): void =>
            listener(payload);
        ipcRenderer.on("preview:event", forward);
        return () => {
            ipcRenderer.off("preview:event", forward);
        };
    },

    updateState: () => ipcRenderer.invoke("update:state"),
    checkForUpdates: () => ipcRenderer.invoke("update:check"),
    restartToInstallUpdate: () => ipcRenderer.invoke("update:restart"),
    onUpdateEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, state: UpdateState): void => listener(state);
        ipcRenderer.on("update:event", forward);
        return () => {
            ipcRenderer.off("update:event", forward);
        };
    },

    renderRuntimeModes: () => ipcRenderer.invoke("render:runtimeModes"),

    revealPath: (path) => ipcRenderer.invoke("files:reveal", path),
    revealRoots: () => ipcRenderer.invoke("files:revealRoots"),
    mapStorageDefault: () => ipcRenderer.invoke("files:mapStorageDefault"),
    renderMemory: () => ipcRenderer.invoke("files:renderMemory"),
    setRenderMemory: (setting) => ipcRenderer.invoke("files:setRenderMemory", setting),
    downloadConcurrency: () => ipcRenderer.invoke("files:downloadConcurrency"),
    setDownloadConcurrency: (workers) =>
        ipcRenderer.invoke("files:setDownloadConcurrency", workers),

    project: {
        read: (worldFolder) => ipcRenderer.invoke("project:read", worldFolder),
        discover: (worldFolder) => ipcRenderer.invoke("project:discover", worldFolder),
        discoverMany: (worldFolders) => ipcRenderer.invoke("project:discoverMany", worldFolders),
        save: (worldFolder, project, replaceUnreadable) =>
            ipcRenderer.invoke("project:save", worldFolder, project, replaceUnreadable === true),
        history: (worldFolder, limit) => ipcRenderer.invoke("project:history", worldFolder, limit),
        restore: (worldFolder, id) => ipcRenderer.invoke("project:restore", worldFolder, id),
        discardOlderRevisions: (worldFolder, keep) =>
            ipcRenderer.invoke("project:discardOlder", worldFolder, keep),
        notifyAutosaveChange: (worldFolder, project) =>
            ipcRenderer.invoke("project:autosaveNotify", worldFolder, project),
        flushAutosave: (worldFolder, reason) =>
            ipcRenderer.invoke("project:autosaveFlush", worldFolder, reason),
        onAutosaveEvent: (listener) => {
            const forward = (_event: IpcRendererEvent, payload: ProjectAutosaveEvent): void =>
                listener(payload);
            ipcRenderer.on("project:autosaveEvent", forward);
            return () => {
                ipcRenderer.off("project:autosaveEvent", forward);
            };
        },

        listProjects: async () => {
            const folders = (await ipcRenderer.invoke("world:folders")) as { id: string }[];
            const worlds: { path: string; name: string | null }[] = [];
            const problems: { world: string; message: string }[] = [];
            for (const folder of folders) {
                try {
                    // `world:scan` answers with a result union rather than the scan itself:
                    // one unplugged drive must not take the worlds on every other drive off
                    // the screen with it, so a folder that cannot be read reports its own
                    // message and the rest still list.
                    const result = (await ipcRenderer.invoke("world:scan", folder.id)) as
                        | { ok: true; scan: { worlds: { path: string; name: string | null }[] } }
                        | { ok: false; folderId: string; message: string };
                    if (!result.ok) {
                        problems.push({ world: folder.id, message: result.message });
                        continue;
                    }
                    for (const world of result.scan.worlds) {
                        worlds.push({ path: world.path, name: world.name });
                    }
                } catch (error) {
                    problems.push({
                        world: folder.id,
                        message: error instanceof Error ? error.message : String(error),
                    });
                }
            }
            const presence = (await ipcRenderer.invoke(
                "project:discoverMany",
                worlds.map((world) => world.path),
            )) as ProjectPresence[];
            const named = new Map(worlds.map((world) => [world.path, world.name]));
            return {
                // A project that will not parse is still listed, with its problem: a row
                // that vanishes reads as settings that were lost.
                projects: presence
                    .filter((row) => row.present)
                    .map((row) => ({
                        world: row.worldFolder,
                        file: row.path,
                        id: row.id,
                        name: row.name,
                        maps: row.mapCount,
                        createdAt: null,
                        updatedAt: row.updatedAt,
                        fromWizard: row.fromWizard,
                        worldName: named.get(row.worldFolder) ?? null,
                        problem: row.problem,
                    })),
                scanned: worlds.length,
                problems,
            };
        },
        readProject: async (world) => {
            const outcome = (await ipcRenderer.invoke("project:read", world)) as ProjectReadOutcome;
            return outcome.ok
                ? { ok: true as const, project: outcome.project, file: outcome.path }
                : { ok: false as const, failure: outcome.failure };
        },
        writeProject: async (world, project) => {
            const saved = (await ipcRenderer.invoke(
                "project:save",
                world,
                project,
                false,
            )) as ProjectSaveResult;
            // `historyOk`/`historyMessage`/`revision` travel through rather than being
            // dropped here: a save that wrote the file but could not keep a record of it is
            // still a save the interface must be able to tell apart from one that kept both
            // promises, and this convenience wrapper is the only place that decision could
            // otherwise get lost between `project:save`'s real answer and the caller.
            return saved.ok
                ? {
                      ok: true as const,
                      file: saved.path,
                      historyOk: saved.historyOk,
                      historyMessage: saved.historyMessage,
                      revision: saved.revision,
                  }
                : { ok: false as const, message: saved.reason };
        },
    },

    history: {
        status: () => ipcRenderer.invoke("history:status"),
        list: (folder, limit) => ipcRenderer.invoke("history:list", folder, limit),
        snapshot: (folder) => ipcRenderer.invoke("history:snapshot", folder),
        revisionFiles: (folder, id) => ipcRenderer.invoke("history:revisionFiles", folder, id),
        diff: (folder, id) => ipcRenderer.invoke("history:diff", folder, id),
        restore: (folder, id) => ipcRenderer.invoke("history:restore", folder, id),
        label: (folder, id, label) => ipcRenderer.invoke("history:label", folder, id, label),
        discardOlderRevisions: (folder, keep) =>
            ipcRenderer.invoke("history:discardOlder", folder, keep),
        compare: (folder, from, to) => ipcRenderer.invoke("history:compare", folder, from, to),
        restoreFiles: (folder, id, paths) =>
            ipcRenderer.invoke("history:restoreFiles", folder, id, paths),
        restoreSettings: (folder, id, files, keys) =>
            ipcRenderer.invoke("history:restoreSettings", folder, id, files, keys),
    },

    profilesHistory: {
        read: () => ipcRenderer.invoke("profilesHistory:read"),
        save: (state) => ipcRenderer.invoke("profilesHistory:save", state),
        list: (limit) => ipcRenderer.invoke("profilesHistory:list", limit),
        restore: (id) => ipcRenderer.invoke("profilesHistory:restore", id),
        discardOlderRevisions: (keep) => ipcRenderer.invoke("profilesHistory:discardOlder", keep),
    },

    appSettingsHistory: {
        read: () => ipcRenderer.invoke("settingsHistory:read"),
        save: (state) => ipcRenderer.invoke("settingsHistory:save", state),
        list: (limit) => ipcRenderer.invoke("settingsHistory:list", limit),
        restore: (id) => ipcRenderer.invoke("settingsHistory:restore", id),
        discardOlderRevisions: (keep) => ipcRenderer.invoke("settingsHistory:discardOlder", keep),
    },

    bedrock: {
        detect: (folder, sizeBytes) =>
            ipcRenderer.invoke("bedrock:detect", folder, sizeBytes ?? null),
        chunkerStatus: () => ipcRenderer.invoke("bedrock:chunker"),
        fetchChunker: () => ipcRenderer.invoke("bedrock:fetchChunker"),
        convert: (request) => ipcRenderer.invoke("bedrock:convert", request),
        cancel: (conversionId) => ipcRenderer.invoke("bedrock:cancel", conversionId),
        record: (world) => ipcRenderer.invoke("bedrock:record", world),
        onBedrockEvent: (listener) => {
            const forward = (_event: IpcRendererEvent, payload: ConversionProgressEvent): void =>
                listener(payload);
            ipcRenderer.on("bedrock:event", forward);
            return () => {
                ipcRenderer.off("bedrock:event", forward);
            };
        },
    },

    repair: {
        agentAvailability: () => ipcRenderer.invoke("repair:agent"),
        failures: () => ipcRenderer.invoke("repair:failures"),
        diagnose: (id) => ipcRenderer.invoke("repair:diagnose", id),
        run: (id) => ipcRenderer.invoke("repair:run", id),
    },

    listBackupRepositories: () => ipcRenderer.invoke("backup:repositories"),
    createBackupRepository: (request) => ipcRenderer.invoke("backup:createRepository", request),
    inspectBackupRepository: (request) => ipcRenderer.invoke("backup:inspectRepository", request),
    inspectBackupSource: (request) => ipcRenderer.invoke("backup:inspectSource", request),
    listBackups: (request) => ipcRenderer.invoke("backup:list", request),
    startBackup: (request) => ipcRenderer.invoke("backup:start", request),
    cancelBackup: (backupId) => ipcRenderer.invoke("backup:cancel", backupId),
    activeBackups: () => ipcRenderer.invoke("backup:active"),
    onBackupEvent: (listener) => {
        const forward = (_event: IpcRendererEvent, payload: BackupEvent): void => listener(payload);
        ipcRenderer.on("backup:event", forward);
        return () => {
            ipcRenderer.off("backup:event", forward);
        };
    },
};

contextBridge.exposeInMainWorld("worldlens", bridge);
