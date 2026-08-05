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
    /**
     * Which wave of the render this job belongs to, read by the main process from the
     * job's own name. Null for a job that carries no wave in its name - `Build the BlueMap
     * CLI`, `Merge group 0` - and null is the honest answer for those, never a guessed 0.
     */
    readonly wave: number | null;
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

/* -------------------------------------------------------------------------- */
/* Who could own it, and what it might be called                             */
/* -------------------------------------------------------------------------- */

/** One person or organisation the signed-in account could publish a render under. */
export interface CiOwnerChoice {
    readonly login: string;
    readonly kind: "user" | "organization";
}

/**
 * The signed-in login plus its organisations - a **convenience list**, never a permission
 * guarantee. `signedIn: false` means there is nobody to ask yet, which is the "sign in"
 * case; `signedIn: true` with `ok: false` means somebody is signed in but the list itself
 * could not be read, which is the "try again" case. Free-text entry stays available either
 * way, exactly as it does beside `listExistingRepositories` below.
 */
export type CiOwnerChoicesAnswer =
    | { readonly ok: true; readonly login: string; readonly owners: readonly CiOwnerChoice[] }
    | { readonly ok: false; readonly signedIn: boolean; readonly message: string };

/**
 * Whether `owner/repo` is free on GitHub, read live rather than guessed.
 *
 * `unknown` is the honest answer for a network failure, an odd status, or a blank owner or
 * repo - never folded into `available`, because that is exactly the mistake that would send
 * somebody to create a repository GitHub was about to refuse.
 */
export type CiRepositoryNameAvailability =
    | { readonly status: "available"; readonly owner: string; readonly repo: string }
    | {
          readonly status: "taken";
          readonly owner: string;
          readonly repo: string;
          readonly private: boolean;
          readonly htmlUrl: string | null;
      }
    | { readonly status: "unknown"; readonly owner: string; readonly repo: string; readonly message: string };

/**
 * One repository the signed-in account could publish to, offered instead of a typed name.
 *
 * A structural mirror of `backup/backupBridge.ts`'s `RepositoryChoice`, restated for the
 * same reason everything else on this file is: this render never happens without a
 * repository that already exists (see `actions.ts` - there is no create-repository call
 * anywhere in this feature), so the same account listing the backup surface already offers
 * is worth reusing here rather than asking the main process to answer it twice.
 */
export interface CiRepositoryChoice {
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

export type CiRoute = "session" | "gh";

/**
 * What `gh` is on this machine - and a fourth value for "we did not ask".
 *
 * The first three are genuinely different remedies: install it, sign in to it in a terminal,
 * or nothing at all. `not-checked` is none of those. It is what the report says when the
 * in-app sign-in worked and `gh` was deliberately never probed, and keeping it distinct is
 * what stops the surface telling somebody to install software they already have.
 */
export type GhAvailability = "not-installed" | "signed-out" | "ready" | "not-checked";

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
    /**
     * False when the chosen route can start a render but cannot publish a world.
     *
     * Both shipped routes can, so this is true whenever `ready` is - the `gh` transfer is
     * route-aware. It stays on the report because "can start a render" and "can publish a
     * world" are two capabilities, and the surface has to be able to say which is missing
     * rather than showing a button that fails after an hour of packing.
     */
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
    /**
     * Which signed-in account this render authenticates as, by id.
     *
     * Omitted, the main process resolves whichever account is active - the setup card's
     * own default, so a single-account build behaves exactly as it always did. Set from
     * the account picker when somebody signed in to several accounts chooses one that is
     * not the active one. Always an id, never a token: the credential itself never crosses
     * this bridge in either direction.
     */
    readonly accountId?: string;
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
    | {
          readonly type: "phase";
          readonly syncId: string;
          readonly phase: CiSyncPhase;
          /** Which credential is driving this sync, known from the moment it starts working. */
          readonly route: CiRoute;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly syncId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    /**
     * How far the upload has got, in bytes - and in the pieces those bytes are made of.
     *
     * A world is measured in gigabytes and a domestic connection in hours, so a phase label
     * with no number beside it is indistinguishable from a hang for most of an afternoon.
     * `assetsDone`/`assetsTotal`/`asset` are the main process's own count of the pieces it
     * is moving, never derived from the byte counts - a part skipped because it is already
     * on the release moves the asset count without moving a byte.
     */
    | {
          readonly type: "progress";
          readonly syncId: string;
          readonly phase: CiSyncPhase;
          readonly description: string;
          readonly bytesDone: number;
          readonly bytesTotal: number;
          readonly assetsDone: number;
          readonly assetsTotal: number;
          /** The specific piece in flight right now, when the upload named one. */
          readonly asset: string | null;
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
/* Scheduled re-rendering: the honest cadence set, and what the workflow found */
/* -------------------------------------------------------------------------- */

/** The only four choices this screen offers. Never a cron expression. */
export type CiScheduleCadence = "hourly" | "sixHourly" | "daily" | "weekly";

export type CiScheduleCheckResultName = "changed" | "unchanged" | "unknown" | "error";

export interface CiScheduleStatus {
    readonly enabled: boolean;
    /** Null when scheduling has never been configured - genuinely different from "off". */
    readonly cadence: CiScheduleCadence | null;
    readonly lastCheckAt: string | null;
    readonly lastCheckResult: CiScheduleCheckResultName | null;
    readonly lastCheckReason: string | null;
    readonly lastRenderAt: string | null;
    readonly nextCheckAt: string | null;
    readonly checksPerMonth: number | null;
    readonly costDescription: string | null;
}

export interface CiScheduleWriteFailure {
    readonly code: "not-uploaded-yet";
    readonly message: string;
}

export type CiScheduleWriteResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly failure: CiScheduleWriteFailure };

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

export interface CiRenderBridge {
    ciRenderPreflight(request: CiSyncRequest): Promise<Answer<CiPreflight>>;
    startCiRender(request: CiSyncRequest): Promise<CiSyncResult>;
    checkCiRender(syncId: string): Promise<CiSyncResult>;
    listCiRenders(): Promise<Answer<readonly CiSyncState[]>>;
    cancelCiRender(syncId: string): Promise<boolean>;
    /**
     * Syncs this computer is actively driving right now, whether or not they have written
     * a record `listCiRenders` would find yet. What `CiRenders.reconcile()` calls on mount
     * so a render already going in another window is on screen before anybody presses
     * anything, the same reason `backupBridge.ts`'s `activeBackups` exists.
     */
    activeCiRenders(): Promise<readonly string[]>;
    onCiRenderEvent(listener: (event: CiSyncEvent) => void): () => void;
    /** True when a sync in flight can actually be stopped from here. */
    readonly canCancel: boolean;
    /** True when the syncs this computer remembers can be listed. */
    readonly canList: boolean;
    /** True when a recorded run can be polled without starting anything. */
    readonly canCheck: boolean;
    /** True when the ids in flight right now can be asked for. */
    readonly canSeeActive: boolean;

    /*
     * Everything below is optional and additive: the guided "What, and where" card degrades
     * to free text, exactly as it always could, when a build carries none of these. None of
     * the three required methods above depend on any of them.
     */

    /**
     * The signed-in login and its organisations, to choose an owner from rather than type
     * one. Given an account id, resolves this for that specific stored account instead of
     * whichever one is active - what the account picker uses when somebody chooses a
     * different signed-in account.
     */
    listCiOwners?(accountId?: string): Promise<CiOwnerChoicesAnswer>;
    /** A GitHub-safe repository name suggested from a world or map name. Pure, no network. */
    suggestCiRepoName?(sourceName: string): Promise<string>;
    /** Whether `owner/repo` is free on GitHub, right now. */
    checkCiRepoName?(request: {
        readonly owner: string;
        readonly repo: string;
    }): Promise<CiRepositoryNameAvailability>;
    /** The signed-in account's own repositories, to pick an existing one instead of typing it. */
    listExistingRepositories?(): Promise<Answer<readonly CiRepositoryChoice[]>>;
    /** Scheduled re-rendering's current status for one repository. See docs/scheduled-render.md. */
    ciRenderScheduleRead?(owner: string, repo: string, accountId?: string): Promise<Answer<CiScheduleStatus>>;
    /** Turns scheduling on (with a cadence) or off, for one recorded sync. */
    ciRenderScheduleWrite?(
        syncId: string,
        enabled: boolean,
        cadence: CiScheduleCadence,
        accountId?: string,
    ): Promise<Answer<CiScheduleWriteResult>>;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    ciRenderPreflight: (request: CiSyncRequest) => Promise<Answer<CiPreflight>>;
    startCiRender: (request: CiSyncRequest) => Promise<CiSyncResult>;
    checkCiRender: (syncId: string) => Promise<CiSyncResult>;
    listCiRenders: () => Promise<Answer<readonly CiSyncState[]>>;
    cancelCiRender: (syncId: string) => Promise<boolean>;
    activeCiRenders: () => Promise<readonly string[]>;
    onCiRenderEvent: (listener: (event: CiSyncEvent) => void) => () => void;
    // The preload's real names for the four optional additions above. `listBackupRepositories`
    // is the backup surface's own method, named for what it is there rather than for cirender
    // - reused read-only, the way `backup:repositories` was already built to be reused.
    ciRenderOwners: (accountId?: string) => Promise<CiOwnerChoicesAnswer>;
    suggestCiRepoName: (sourceName: string) => Promise<string>;
    checkCiRepoName: (request: {
        owner: string;
        repo: string;
    }) => Promise<CiRepositoryNameAvailability>;
    listBackupRepositories: () => Promise<Answer<readonly CiRepositoryChoice[]>>;
    ciRenderScheduleRead: (owner: string, repo: string, accountId?: string) => Promise<Answer<CiScheduleStatus>>;
    ciRenderScheduleWrite: (
        syncId: string,
        enabled: boolean,
        cadence: CiScheduleCadence,
        accountId?: string,
    ) => Promise<Answer<CiScheduleWriteResult>>;
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
    const canSeeActive = isFunction(host.activeCiRenders);

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
        // An empty list rather than a rejection, for the same reason `cancelCiRender`
        // answers that way: not being able to ask what is in flight and nothing being in
        // flight lead to the same screen. What must never happen is a build inventing one.
        activeCiRenders: () =>
            isFunction(host.activeCiRenders) ? host.activeCiRenders() : Promise.resolve([]),
        canCancel,
        canList,
        canCheck,
        canSeeActive,

        // Left off the object entirely rather than filled with an "unsupported" stand-in,
        // because these four are optional on the interface: a caller checks for the method
        // rather than for a canned refusal, and a build with none of them is exactly as
        // capable as it was before this card existed.
        ...(isFunction(host.ciRenderOwners)
            ? { listCiOwners: (accountId?: string) => host.ciRenderOwners!(accountId) }
            : {}),
        ...(isFunction(host.suggestCiRepoName)
            ? { suggestCiRepoName: (sourceName: string) => host.suggestCiRepoName!(sourceName) }
            : {}),
        ...(isFunction(host.checkCiRepoName)
            ? {
                  checkCiRepoName: (request: { owner: string; repo: string }) =>
                      host.checkCiRepoName!(request),
              }
            : {}),
        ...(isFunction(host.listBackupRepositories)
            ? { listExistingRepositories: () => host.listBackupRepositories!() }
            : {}),
        ...(isFunction(host.ciRenderScheduleRead)
            ? {
                  ciRenderScheduleRead: (owner: string, repo: string, accountId?: string) =>
                      host.ciRenderScheduleRead!(owner, repo, accountId),
              }
            : {}),
        ...(isFunction(host.ciRenderScheduleWrite)
            ? {
                  ciRenderScheduleWrite: (
                      syncId: string,
                      enabled: boolean,
                      cadence: CiScheduleCadence,
                      accountId?: string,
                  ) => host.ciRenderScheduleWrite!(syncId, enabled, cadence, accountId),
              }
            : {}),
    };
}
