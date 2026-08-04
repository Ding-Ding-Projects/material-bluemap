/**
 * The seam between the CI-render surface and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
 * `backupBridge.ts` and `downloadBridge.ts` restate theirs: this package compiles and runs
 * in three places and only one of them has a preload. Importing across that boundary would
 * also drag the zip writer, the fingerprint walker and `node:fs` into the renderer's
 * bundle, which is exactly what the preload was split out to prevent.
 *
 * Nothing here invents a capability. {@link resolveCiRenderBridge} returns `null` when the
 * three methods a CI render cannot happen without are missing, and the rest are probed one
 * at a time and reported as flags.
 *
 * ## The token is not here, and neither is the licence
 *
 * Nothing on this bridge carries a credential in either direction, and nothing on it can
 * *accept* Mojang's EULA. The surface learns from a refusal that the acceptance is missing
 * and points at the settings row that already asks; it never offers a second place to
 * agree. A legal acceptance with two front doors is one people click through.
 */

/* -------------------------------------------------------------------------- */
/* What the run looks like                                                    */
/* -------------------------------------------------------------------------- */

export type CiRunStatus =
    | "queued"
    | "in_progress"
    | "completed"
    | "waiting"
    | "requested"
    | "pending"
    | "unknown";

export interface CiJobReport {
    readonly id: number;
    readonly name: string;
    readonly status: CiRunStatus;
    /** Null while the job is still going. Never filled in with a guess. */
    readonly conclusion: string | null;
    readonly htmlUrl: string;
    readonly startedAt: string | null;
    readonly completedAt: string | null;
}

export interface CiRunReport {
    readonly runId: number;
    readonly runNumber: number;
    readonly htmlUrl: string;
    readonly status: CiRunStatus;
    readonly conclusion: string | null;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly headSha: string;
    readonly jobs: readonly CiJobReport[];
}

/* -------------------------------------------------------------------------- */
/* Where it goes, and what it would cost                                      */
/* -------------------------------------------------------------------------- */

export interface RepositoryReport {
    readonly owner: string;
    readonly repo: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
    readonly warning: { readonly level: "warning" | "note"; readonly message: string } | null;
}

export interface CiRenderPlan {
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    readonly inputs: Readonly<Record<string, string>>;
    /** Project settings the workflow has no input for. Shown, never acted on. */
    readonly notCarried: readonly string[];
}

export type CiSyncStage = "idle" | "uploaded" | "dispatched" | "rendered" | "failed" | "cancelled";

export interface CiSyncState {
    readonly version: number;
    readonly syncId: string;
    readonly owner: string;
    readonly repo: string;
    readonly worldFolder: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly dimension: string;
    readonly fingerprint: string | null;
    readonly releaseTag: string | null;
    readonly assetName: string | null;
    readonly archiveBytes: number | null;
    readonly archiveSha256: string | null;
    readonly runId: number | null;
    readonly runNumber: number | null;
    readonly runUrl: string | null;
    readonly dispatchedAt: string | null;
    readonly stage: CiSyncStage;
    readonly renderId: string | null;
    readonly artifactSha256: string | null;
    readonly failureCode: string | null;
    readonly failureMessage: string | null;
    readonly updatedAt: string;
}

export type CiRoute = "session" | "gh";

export type GhAvailability = "not-installed" | "signed-out" | "ready";

/** Which credential would drive a sync, and why the other one would not. */
export interface RouteReport {
    readonly route: CiRoute | null;
    /** One sentence for the interface: the credential in play, or why neither can. */
    readonly describe: string;
    readonly session: { readonly signedIn: boolean; readonly usable: boolean; readonly reason: string | null };
    readonly gh: {
        readonly availability: GhAvailability;
        readonly version: string | null;
        readonly account: string | null;
        readonly host: string | null;
        readonly message: string;
        readonly usable: boolean;
        readonly reason: string | null;
    };
    readonly ready: boolean;
    /** False when the chosen route can start a render but cannot upload a world. */
    readonly canUpload: boolean;
}

export interface CiPreflight {
    readonly syncId: string;
    /**
     * Null when the application's own sign-in could not read the repository - the ordinary
     * case for somebody driving a render entirely through `gh`. Nothing invents a
     * public/private answer in its place.
     */
    readonly repository: RepositoryReport | null;
    readonly repositoryFailure: string | null;
    readonly routeReport: RouteReport;
    readonly eulaAccepted: boolean;
    readonly plan: CiRenderPlan | null;
    readonly planFailure: string | null;
    readonly world: { readonly label: string; readonly files: number; readonly bytes: number } | null;
    readonly worldFailure: string | null;
    readonly worldChanged: boolean;
    readonly uploadNeeded: boolean;
    readonly estimatedArchiveBytes: number;
    readonly tooLargeToUpload: boolean;
    readonly state: CiSyncState | null;
    readonly run: CiRunReport | null;
}

/* -------------------------------------------------------------------------- */
/* Running one                                                                */
/* -------------------------------------------------------------------------- */

export type CiSyncPhase =
    | "checking"
    | "uploading"
    | "dispatching"
    | "waiting"
    | "rendering"
    | "downloading"
    | "registering"
    | "finished";

export interface CiSyncFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly status: number | null;
    /** True when signing in again in Settings is the thing that would fix it. */
    readonly needsSignIn: boolean;
    /** True when Mojang's download consent has not been given on this computer. */
    readonly needsEula: boolean;
    /** Which credential was refused. Unactionable advice without it, on a two-sign-in machine. */
    readonly route: CiRoute | null;
    readonly run: CiRunReport | null;
    readonly failingJob: string | null;
    readonly logExcerpt: string | null;
}

export interface CiSyncSummary {
    readonly syncId: string;
    readonly repository: string;
    readonly releaseTag: string;
    readonly assetName: string;
    readonly runId: number;
    readonly runUrl: string;
    readonly renderId: string;
    readonly dataRoot: string;
    readonly mapId: string;
    readonly mapName: string;
    readonly route: CiRoute;
    readonly uploaded: boolean;
    readonly artifactBytes: number;
    readonly artifactSha256: string;
    readonly verified: boolean;
}

export interface CiSyncRequest {
    readonly worldFolder: string;
    readonly owner: string;
    readonly repo: string;
    readonly mapId?: string;
    readonly acknowledgeUpload?: boolean;
    readonly acknowledgePublic?: boolean;
    readonly forceUpload?: boolean;
    readonly budgetMinutes?: number;
    readonly maxJobs?: number;
    readonly output?: "artifact" | "artifact-and-pages";
    /** Force a credential rather than letting the probe choose. */
    readonly route?: CiRoute;
    readonly follow?: boolean;
}

export type CiSyncEvent =
    | {
          readonly type: "started";
          readonly syncId: string;
          readonly repository: string;
          readonly mapId: string;
          readonly worldFolder: string;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly syncId: string; readonly phase: CiSyncPhase; readonly at: string }
    | {
          readonly type: "log";
          readonly syncId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | { readonly type: "run"; readonly syncId: string; readonly run: CiRunReport; readonly at: string }
    | {
          readonly type: "finished";
          readonly syncId: string;
          readonly summary: CiSyncSummary;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly syncId: string; readonly failure: CiSyncFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly syncId: string; readonly at: string };

export type CiSyncResult =
    | {
          readonly ok: true;
          readonly syncId: string;
          readonly outcome: "rendered";
          readonly summary: CiSyncSummary;
          readonly durationMs: number;
      }
    | {
          readonly ok: true;
          readonly syncId: string;
          readonly outcome: "running";
          readonly run: CiRunReport | null;
          readonly state: CiSyncState;
      }
    | { readonly ok: false; readonly syncId: string; readonly failure: CiSyncFailure };

/** Every answer the main process gives to a question that can simply fail. */
export type Answer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly message: string };

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

export interface CiRenderBridge {
    ciRenderPreflight(request: CiSyncRequest): Promise<Answer<CiPreflight>>;
    startCiRender(request: CiSyncRequest): Promise<CiSyncResult>;
    checkCiRender(syncId: string): Promise<CiSyncResult>;
    listCiRenders(): Promise<Answer<readonly CiSyncState[]>>;
    cancelCiRender(syncId: string): Promise<boolean>;
    onCiRenderEvent(listener: (event: CiSyncEvent) => void): () => void;
    /** True when a sync in flight can actually be stopped from here. */
    readonly canCancel: boolean;
    /** True when the syncs this computer remembers can be listed. */
    readonly canList: boolean;
    /** True when a recorded run can be polled without starting anything. */
    readonly canCheck: boolean;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    ciRenderPreflight: (request: CiSyncRequest) => Promise<Answer<CiPreflight>>;
    startCiRender: (request: CiSyncRequest) => Promise<CiSyncResult>;
    checkCiRender: (syncId: string) => Promise<CiSyncResult>;
    listCiRenders: () => Promise<Answer<readonly CiSyncState[]>>;
    cancelCiRender: (syncId: string) => Promise<boolean>;
    onCiRenderEvent: (listener: (event: CiSyncEvent) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot start a CI render at all.
 *
 * All or nothing for the three it cannot happen without: starting one, hearing about it,
 * and reading the repository first. A bridge carrying `startCiRender` and no
 * `onCiRenderEvent` would present a button that begins hours of invisible work, and a
 * bridge with no `ciRenderPreflight` could not tell somebody their repository is public
 * before their world is published to it. Neither is a degradation worth shipping.
 */
export function resolveCiRenderBridge(): CiRenderBridge | null {
    const host = (globalThis as { materialBluemap?: Host }).materialBluemap;
    if (host === undefined) return null;

    const { startCiRender, onCiRenderEvent, ciRenderPreflight } = host;
    if (!isFunction(startCiRender) || !isFunction(onCiRenderEvent) || !isFunction(ciRenderPreflight)) {
        return null;
    }

    const canCancel = isFunction(host.cancelCiRender);
    const canList = isFunction(host.listCiRenders);
    const canCheck = isFunction(host.checkCiRender);

    return {
        ciRenderPreflight: (request) => ciRenderPreflight(request),
        startCiRender: (request) => startCiRender(request),
        onCiRenderEvent: (listener) => onCiRenderEvent(listener),
        checkCiRender: (syncId) =>
            isFunction(host.checkCiRender)
                ? host.checkCiRender(syncId)
                : Promise.resolve({
                      ok: false,
                      syncId,
                      failure: {
                          code: "unsupported",
                          message: "This build cannot poll a run. The desktop application is what does it.",
                          detail: null,
                          status: null,
                          needsSignIn: false,
                          needsEula: false,
                          route: null,
                          run: null,
                          failingJob: null,
                          logExcerpt: null,
                      },
                  }),
        listCiRenders: () =>
            isFunction(host.listCiRenders)
                ? host.listCiRenders()
                : Promise.resolve({
                      ok: false,
                      message: "This build cannot list past CI renders. The desktop application is what does it.",
                  }),
        // False rather than a rejection: "this build cannot stop a sync" and "there was
        // nothing to stop" both leave the sync running, and the surface says which of the
        // two it is from `canCancel` rather than from a thrown error.
        cancelCiRender: (syncId) =>
            isFunction(host.cancelCiRender) ? host.cancelCiRender(syncId) : Promise.resolve(false),
        canCancel,
        canList,
        canCheck,
    };
}
