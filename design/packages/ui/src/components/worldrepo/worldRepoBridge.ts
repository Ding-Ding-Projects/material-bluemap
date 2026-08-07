/**
 * The seam between the "world kept in a git repository" surface and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes on
 * `window.worldlens.worldRepo`, **restated rather than imported**, for the same reason
 * `pagesBridge.ts` and `backupBridge.ts` restate theirs: this package compiles and runs in
 * three places (inside the Electron shell, inside a plain browser tab, inside vitest) and
 * only the first of those has a preload. Importing across that boundary would also drag a
 * git driver, `node:fs` and a process spawner into the renderer's bundle, which is exactly
 * what the preload was split out to prevent.
 *
 * `main/worldrepo/ipc.ts` registers all eleven `worldrepo:*` channels unconditionally, so
 * unlike `PagesBridge` (which degrades method by method because the Pages feature grew a
 * preload gradually) this bridge is genuinely all-or-nothing: {@link resolveWorldRepoBridge}
 * returns `null` unless every one of them is present as a function.
 *
 * ## No credential crosses this, in either direction
 *
 * There is no token on any of these types and no channel that could carry one.
 * Authentication for both the API and the push is `gh`'s own credential store, held in the
 * main process's child processes and never read from here. When `gh` is signed out this
 * screen learns it from `WorldRepoPreflight.gh`, which names the command to run in a
 * terminal - `gh auth login` cannot be driven from inside an application at all.
 */

/* -------------------------------------------------------------------------- */
/* What crosses                                                                */
/* -------------------------------------------------------------------------- */

export interface WorldRepoOwner {
    readonly login: string;
    readonly kind: "user" | "organization";
}

export interface WorldRepoFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    /** True when running `gh auth login` in a terminal is what would fix it. */
    readonly needsGhSignIn: boolean;
}

export interface WorldRepoTarget {
    /** Absolute path to the world folder on disk. Never copied; the git work-tree itself. */
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    /** Defaults to `"world"` when left out. */
    readonly branch?: string;
}

export interface WorldRepoSyncRequest extends WorldRepoTarget {
    readonly visibility?: "public" | "private";
    /** Set by this screen once the person has seen the preflight. Refused without it. */
    readonly acknowledgeSync?: boolean;
}

export interface WorldRepoReport {
    readonly fileCount: number;
    readonly bytes: number;
    readonly oversizedFiles: readonly { readonly path: string; readonly bytes: number }[];
    /** False when nothing under the folder looked like a Minecraft world (a `level.dat`). */
    readonly looksLikeWorld: boolean;
    readonly overSoftLimit: boolean;
    readonly overHeavyLimit: boolean;
}

export interface WorldRepoMarker {
    readonly tool: string;
    readonly version: number;
    readonly branch: string;
    readonly updatedAt: string;
}

/** Mirrors `GhStatus` in `main/cirender/gh.ts`, read through `WorldRepoPreflight.gh`. */
export interface WorldRepoGhStatus {
    readonly availability: "not-installed" | "signed-out" | "ready";
    readonly version: string | null;
    readonly account: string | null;
    readonly host: string | null;
    readonly scopes: readonly string[] | null;
    readonly message: string;
}

export interface WorldRepoRepositoryReport {
    readonly fullName: string;
    readonly exists: boolean;
    readonly private: boolean | null;
    readonly canWrite: boolean | null;
    readonly htmlUrl: string | null;
    readonly branchExists: boolean;
    readonly branchIsOurs: boolean | null;
    readonly branchMarker: WorldRepoMarker | null;
    readonly branchSha: string | null;
    readonly failure: string | null;
}

export interface WorldRepoPreflight {
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly world: WorldRepoReport | null;
    readonly worldFailure: string | null;
    readonly gh: WorldRepoGhStatus;
    readonly gitVersion: string | null;
    readonly repository: WorldRepoRepositoryReport | null;
    /** Anything that would stop a sync. Non-empty means the button must not be pressed. */
    readonly blockers: readonly string[];
    /** True, expensive or surprising, but not a refusal. */
    readonly warnings: readonly string[];
    readonly published: WorldRepoRecord | null;
}

/** What this computer remembers about a world it synced. */
export interface WorldRepoRecord {
    readonly version: number;
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly stage: string;
    readonly commit: string | null;
    readonly pushVerified: boolean;
    readonly bytes: number;
    readonly fileCount: number;
    readonly syncedAt: string;
}

export interface WorldRepoSyncReport {
    readonly worldPath: string;
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly repositoryUrl: string;
    /** The commit that was pushed, read back from git rather than assumed. */
    readonly commit: string;
    /** True only once GitHub reported that branch's head as this commit. */
    readonly pushVerified: boolean;
    readonly bytes: number;
    readonly fileCount: number;
    readonly notes: readonly string[];
}

export type WorldRepoSyncResult =
    | { readonly ok: true; readonly report: WorldRepoSyncReport; readonly durationMs: number }
    | { readonly ok: false; readonly failure: WorldRepoFailure };

export interface WorldRepoRemoveReport {
    readonly owner: string;
    readonly repo: string;
    readonly branch: string;
    readonly branchDeleted: boolean;
    readonly notes: readonly string[];
}

export type WorldRepoRemoveResult =
    | { readonly ok: true; readonly report: WorldRepoRemoveReport }
    | { readonly ok: false; readonly failure: WorldRepoFailure };

export type WorldRepoPhase =
    | "preparing"
    | "checking"
    | "staging"
    | "committing"
    | "pushing"
    | "verifying"
    | "finished";

export type WorldRepoEvent =
    | { readonly type: "started"; readonly key: string; readonly target: string; readonly at: string }
    | { readonly type: "phase"; readonly key: string; readonly phase: WorldRepoPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly key: string;
          readonly phase: WorldRepoPhase;
          readonly description: string;
          readonly done: number;
          readonly total: number;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly key: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly key: string;
          readonly report: WorldRepoSyncReport;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly key: string; readonly failure: WorldRepoFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly key: string; readonly at: string };

/* -------------------------------------------------------------------------- */
/* Adoption: recognising a repository this application already prepared       */
/* -------------------------------------------------------------------------- */

export interface WorldRepoCiBootstrapMarker {
    readonly tool: string;
    readonly version: number;
    readonly templateVersion: string;
    readonly files: readonly string[];
    readonly preparedAt: string;
}

export type WorldRepoAdoptionStatus =
    | "prepared"
    | "prepared-newer-version"
    | "not-prepared"
    | "not-checked"
    | "unknown";

/** What is known about whether one repository is one this application prepared. Never a bare boolean. */
export interface WorldRepoAdoptionSignal {
    readonly fullName: string;
    readonly branch: string;
    readonly status: WorldRepoAdoptionStatus;
    readonly marker: WorldRepoMarker | null;
    readonly bootstrapMarker: WorldRepoCiBootstrapMarker | null;
    /** One sentence, hedged with "looks like" rather than asserted as certain. */
    readonly message: string;
}

export interface WorldRepoAdoptionCandidate {
    readonly owner: string;
    readonly repo: string;
}

export type WorldRepoAdoptionAttentionId =
    | "world-folder"
    | "dependencies"
    | "remote-host"
    | "output-folder"
    | "linked-world";

export interface WorldRepoAdoptionAttentionItem {
    readonly id: WorldRepoAdoptionAttentionId;
    /** The map this concerns, for `linked-world`; null for every project-wide item. */
    readonly mapId: string | null;
    readonly message: string;
}

export interface WorldRepoAdoptionRestoreSummary {
    readonly projectName: string;
    readonly fromWizard: boolean;
    readonly maps: readonly { readonly id: string; readonly name: string; readonly dimension: string }[];
    readonly storageIds: readonly string[];
    readonly renderNotes: readonly string[];
    readonly coreCustomized: boolean;
    readonly webappCustomized: boolean;
    readonly webserverCustomized: boolean;
    readonly pluginCustomized: boolean;
}

export interface WorldRepoAdoptionAlreadyLocal {
    readonly worldPath: string;
    readonly branch: string;
    readonly syncedAt: string;
}

/**
 * The project a successful plan would restore.
 *
 * Restated only as far as `main/project/file.ts`'s own schema, and left loose (`unknown` on
 * anything this screen never reads directly) rather than duplicated field for field: this
 * screen never inspects the project itself, only `restoring` (the honest summary above) and
 * `needsAttention`. The raw value is handed straight to `ProjectHost.writeProject` when
 * somebody presses "Adopt this repository", which is the one place its real shape matters,
 * and that call already goes through `@worldlens/config`'s own `ProjectFile` type.
 */
export type WorldRepoAdoptedProject = Record<string, unknown>;

export type WorldRepoAdoptionPlanFailureReason =
    | "repository-unreadable"
    | "not-prepared"
    | "project-absent"
    | "project-unreadable"
    | "project-too-new"
    | "ci-bootstrap-only";

export type WorldRepoAdoptionPlan =
    | {
          readonly ok: true;
          readonly owner: string;
          readonly repo: string;
          readonly branch: string;
          readonly marker: WorldRepoMarker;
          readonly bootstrapMarker: WorldRepoCiBootstrapMarker | null;
          readonly preparedByNewerMarkerVersion: boolean;
          readonly project: WorldRepoAdoptedProject;
          readonly restoring: WorldRepoAdoptionRestoreSummary;
          readonly needsAttention: readonly WorldRepoAdoptionAttentionItem[];
          readonly alreadyLocal: WorldRepoAdoptionAlreadyLocal | null;
      }
    | {
          readonly ok: false;
          readonly owner: string;
          readonly repo: string;
          readonly branch: string;
          readonly reason: WorldRepoAdoptionPlanFailureReason;
          readonly message: string;
          readonly marker: WorldRepoMarker | null;
          readonly bootstrapMarker: WorldRepoCiBootstrapMarker | null;
          readonly foundFormatVersion: number | null;
      };

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

export type Answer<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/**
 * Keeping a Minecraft world in a git repository, and recognising a repository this
 * application already prepared on a computer that has never touched it before.
 *
 * A namespace on `window.worldlens`, mirroring the preload's own `WorldRepoBridge`
 * exactly - see that interface's doc comment in `packages/app/src/preload/index.ts` for why
 * a namespace rather than flat methods: this screen feature-detects the whole capability at
 * once, because a screen offering Sync on a bridge that has no `sync` is a button that
 * throws.
 */
export interface WorldRepoBridge {
    /** The signed-in GitHub account plus every organisation it can write to. */
    owners(): Promise<Answer<readonly WorldRepoOwner[]>>;
    /** What a sync would do, before it does any of it. */
    preflight(target: WorldRepoTarget): Promise<Answer<WorldRepoPreflight>>;
    /** Pushes the world folder itself as one commit, force-replacing the branch each time. */
    sync(request: WorldRepoSyncRequest): Promise<WorldRepoSyncResult>;
    /** Deletes the branch this application made for a world. Never touches the world folder. */
    remove(target: WorldRepoTarget): Promise<WorldRepoRemoveResult>;
    /** Stops a running sync or remove by its key. False when nothing was running under it. */
    cancel(key: string): Promise<boolean>;
    /** Keys of every sync or remove in flight right now. */
    active(): Promise<readonly string[]>;
    /** Every world this computer remembers syncing, newest first. */
    records(): Promise<Answer<readonly WorldRepoRecord[]>>;
    /** Continues a sync whose durable stage marker says it was interrupted. */
    resume(target: WorldRepoTarget): Promise<WorldRepoSyncResult>;
    /** The branch's current commit on GitHub, without touching the local git directory. */
    remoteTip(
        owner: string,
        repo: string,
        branch?: string,
    ): Promise<Answer<{ readonly exists: boolean; readonly sha: string | null }>>;
    /** Which repositories in a list look like ones this application already prepared. */
    adoptionProbe(request: {
        readonly candidates: readonly WorldRepoAdoptionCandidate[];
        readonly branch?: string;
        readonly maxProbes?: number;
    }): Promise<Answer<readonly WorldRepoAdoptionSignal[]>>;
    /** What adopting one repository would restore, or an honest refusal naming why not. */
    adoptionPlan(request: {
        readonly owner: string;
        readonly repo: string;
        readonly branch?: string;
    }): Promise<Answer<WorldRepoAdoptionPlan>>;
    /** Subscribes to sync/remove progress. Returns the unsubscribe function. */
    onWorldRepoEvent(listener: (event: WorldRepoEvent) => void): () => void;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot keep a world in a git repository at all.
 *
 * All eleven methods are required: `main/worldrepo/ipc.ts` registers every one of them in
 * one call, so a bridge missing any of them means the preload has not grown this namespace
 * yet rather than that one feature within it was deliberately left off.
 */
export function resolveWorldRepoBridge(): WorldRepoBridge | null {
    const host = (globalThis as { worldlens?: { worldRepo?: unknown } }).worldlens;
    if (host === undefined) return null;
    const api = host.worldRepo;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<WorldRepoBridge>;
    const required: readonly unknown[] = [
        candidate.owners,
        candidate.preflight,
        candidate.sync,
        candidate.remove,
        candidate.cancel,
        candidate.active,
        candidate.records,
        candidate.resume,
        candidate.remoteTip,
        candidate.adoptionProbe,
        candidate.adoptionPlan,
        candidate.onWorldRepoEvent,
    ];
    if (!required.every(isFunction)) return null;

    const ready = api as WorldRepoBridge;
    return {
        owners: () => ready.owners(),
        preflight: (target) => ready.preflight(target),
        sync: (request) => ready.sync(request),
        remove: (target) => ready.remove(target),
        cancel: (key) => ready.cancel(key),
        active: () => ready.active(),
        records: () => ready.records(),
        resume: (target) => ready.resume(target),
        remoteTip: (owner, repo, branch) => ready.remoteTip(owner, repo, branch),
        adoptionProbe: (request) => ready.adoptionProbe(request),
        adoptionPlan: (request) => ready.adoptionPlan(request),
        onWorldRepoEvent: (listener) => ready.onWorldRepoEvent(listener),
    };
}
