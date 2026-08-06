/**
 * The seam between the backup surface and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
 * `downloadBridge.ts` restates its own: this package compiles and runs in three places and
 * only one of them has a preload. Importing across that boundary would also drag the zip
 * writer, the splitter and `node:fs` into the renderer's bundle, which is exactly what the
 * preload was split out to prevent.
 *
 * Nothing here invents a capability. {@link resolveBackupBridge} returns `null` when the
 * three methods a backup cannot happen without are missing, and the rest are probed one at
 * a time and reported as flags. A missing `cancelBackup` in particular is survivable and
 * must not be hidden: a backup that cannot be stopped is worth knowing about *before* one
 * is started on a twenty gigabyte world, not after.
 *
 * ## The token is not here, and never will be
 *
 * Nothing on this bridge carries a credential in either direction. The main process holds
 * the GitHub session and resolves a token per operation; this side learns whether somebody
 * is signed in only from a refusal that says so.
 */

/* -------------------------------------------------------------------------- */
/* What can be backed up                                                      */
/* -------------------------------------------------------------------------- */

export type BackupSourceKind = "render" | "world";

/** A folder, read well enough to say what backing it up would involve. */
export interface BackupSourceReport {
    readonly kind: BackupSourceKind;
    readonly folder: string;
    readonly label: string;
    readonly files: number;
    readonly bytes: number;
    /** Files deliberately left out, with the reason. Nearly always empty. */
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

/* -------------------------------------------------------------------------- */
/* Where it goes                                                              */
/* -------------------------------------------------------------------------- */

export interface RepositoryChoice {
    readonly owner: string;
    readonly name: string;
    /** `owner/name`, which is what every other call takes. */
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

/** What creating a repository needs: who it belongs to, its name, and its visibility. */
export interface CreateRepositoryRequest {
    readonly ownerLogin: string;
    readonly ownerKind: "user" | "organization";
    readonly name: string;
    readonly private: boolean;
}

/**
 * `name-taken` is its own code rather than folded into `other`, because the field beside
 * it stays exactly what somebody typed and the message beside it can point straight at the
 * name field rather than reading as a generic failure.
 */
export type CreateRepositoryFailureCode = "name-taken" | "not-signed-in" | "other";

export type CreateRepositoryAnswer =
    | { readonly ok: true; readonly value: RepositoryChoice }
    | { readonly ok: false; readonly code: CreateRepositoryFailureCode; readonly message: string };

/**
 * One repository, and what uploading to it would mean.
 *
 * `warning` is never null in practice and is typed as nullable anyway, because a build
 * whose main process says nothing must render nothing rather than an empty alert. A public
 * repository gets `warning`; a private one gets `note`, because private is not the same as
 * free and somebody choosing it to avoid a bill should hear that before forty gigabytes go
 * up rather than after.
 */
export interface RepositoryReport {
    readonly owner: string;
    readonly repo: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
    readonly warning: { readonly level: "warning" | "note"; readonly message: string } | null;
}

/* -------------------------------------------------------------------------- */
/* Making one                                                                 */
/* -------------------------------------------------------------------------- */

export type BackupPhase = "inspecting" | "packing" | "splitting" | "publishing" | "uploading" | "finished";

export interface BackupTaskProgress {
    readonly phase: BackupPhase;
    readonly description: string;
    readonly bytesDone: number;
    readonly bytesTotal: number;
    readonly partsDone: number;
    readonly partsTotal: number;
    readonly currentPart: string | null;
    readonly percent: number;
    readonly etaSeconds: number | null;
    readonly etaText: string | null;
}

export interface BackupFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly status: number | null;
    /** True when signing in again in Settings is the thing that would fix it. */
    readonly needsSignIn: boolean;
}

export interface BackupSummary {
    readonly backupId: string;
    readonly repository: string;
    readonly tag: string;
    readonly releaseUrl: string;
    readonly archive: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly parts: number;
    readonly kind: BackupSourceKind;
    readonly label: string;
}

export interface BackupRequest {
    readonly kind: BackupSourceKind;
    readonly folder: string;
    readonly owner: string;
    readonly repo: string;
    /** Set only once the person has been shown, and accepted, that the repository is public. */
    readonly acknowledgePublic?: boolean;
    /** Carry on with an existing backup rather than starting a new one. */
    readonly resumeTag?: string;
}

export type BackupEvent =
    | {
          readonly type: "started";
          readonly backupId: string;
          readonly repository: string;
          readonly tag: string;
          readonly kind: BackupSourceKind;
          readonly label: string;
          readonly at: string;
      }
    | { readonly type: "phase"; readonly backupId: string; readonly phase: BackupPhase; readonly at: string }
    | {
          readonly type: "progress";
          readonly backupId: string;
          readonly phase: BackupPhase;
          readonly task: BackupTaskProgress;
          readonly at: string;
      }
    | {
          readonly type: "log";
          readonly backupId: string;
          readonly level: "info" | "warning" | "error";
          readonly message: string;
          readonly at: string;
      }
    | {
          readonly type: "finished";
          readonly backupId: string;
          readonly summary: BackupSummary;
          readonly durationMs: number;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly backupId: string; readonly failure: BackupFailure; readonly at: string }
    | { readonly type: "cancelled"; readonly backupId: string; readonly at: string };

export type BackupResult =
    | {
          readonly ok: true;
          readonly backupId: string;
          readonly summary: BackupSummary;
          readonly durationMs: number;
      }
    | { readonly ok: false; readonly backupId: string; readonly failure: BackupFailure };

/* -------------------------------------------------------------------------- */
/* What a repository already holds                                            */
/* -------------------------------------------------------------------------- */

/** One backup found on a repository, read from its release's own small assets. */
export interface BackupListing {
    readonly tag: string;
    readonly name: string;
    readonly releaseUrl: string;
    readonly createdAt: string;
    readonly archive: string;
    readonly bytes: number;
    readonly sha256: string;
    readonly parts: number;
    readonly kind: BackupSourceKind;
    readonly label: string;
    readonly files: number;
    readonly contentBytes: number;
    readonly appVersion: string | null;
    readonly sourceFolder: string;
    /** False for a release whose upload stopped before the pointer went up. */
    readonly complete: boolean;
    /** Set when it is a valid backup this build cannot restore, with the reason. */
    readonly unsupported: string | null;
}

/** Every answer the main process gives to a question that can simply fail. */
export type Answer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly message: string };

/* -------------------------------------------------------------------------- */
/* The bridge                                                                 */
/* -------------------------------------------------------------------------- */

export interface BackupBridge {
    listBackupRepositories(): Promise<Answer<readonly RepositoryChoice[]>>;
    /**
     * Optional: creates a brand-new repository for somebody who has none suitable to pick
     * from the list above. Absent on a build that cannot, in which case the screen simply
     * does not offer the "Create a new repository" affordance - the existing owner/repo
     * fields keep working exactly as they always did.
     */
    createBackupRepository?(request: CreateRepositoryRequest): Promise<CreateRepositoryAnswer>;
    inspectBackupRepository(request: {
        owner: string;
        repo: string;
    }): Promise<Answer<RepositoryReport>>;
    inspectBackupSource(request: {
        kind: BackupSourceKind;
        folder: string;
    }): Promise<Answer<BackupSourceReport>>;
    listBackups(request: { owner: string; repo: string }): Promise<Answer<readonly BackupListing[]>>;
    startBackup(request: BackupRequest): Promise<BackupResult>;
    cancelBackup(backupId: string): Promise<boolean>;
    activeBackups(): Promise<readonly string[]>;
    onBackupEvent(listener: (event: BackupEvent) => void): () => void;
    /** True when a backup in flight can actually be stopped from here. */
    readonly canCancel: boolean;
    /** True when the account's repositories can be listed, rather than only typed. */
    readonly canListRepositories: boolean;
    /** True when a repository's existing backups can be listed. */
    readonly canListBackups: boolean;
    /** True when the ids in flight right now can be asked for. */
    readonly canSeeActive: boolean;
    /** True when a new repository can be created from this screen. */
    readonly canCreateRepository: boolean;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    listBackupRepositories: () => Promise<Answer<readonly RepositoryChoice[]>>;
    createBackupRepository: (request: CreateRepositoryRequest) => Promise<CreateRepositoryAnswer>;
    inspectBackupRepository: (request: {
        owner: string;
        repo: string;
    }) => Promise<Answer<RepositoryReport>>;
    inspectBackupSource: (request: {
        kind: BackupSourceKind;
        folder: string;
    }) => Promise<Answer<BackupSourceReport>>;
    listBackups: (request: { owner: string; repo: string }) => Promise<Answer<readonly BackupListing[]>>;
    startBackup: (request: BackupRequest) => Promise<BackupResult>;
    cancelBackup: (backupId: string) => Promise<boolean>;
    activeBackups: () => Promise<readonly string[]>;
    onBackupEvent: (listener: (event: BackupEvent) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build cannot back anything up at all.
 *
 * All or nothing for the three a backup cannot happen without: starting one, hearing about
 * it, and reading the repository first. A bridge carrying `startBackup` and no
 * `onBackupEvent` would present a button that begins hours of invisible work, which is
 * worse than a surface that says the desktop app is needed - a bar that moves is the whole
 * difference between a long upload and a hang, and people quit an application they believe
 * has hung. A bridge with no `inspectBackupRepository` could not tell a person their
 * repository is public before publishing their world to it, which is not a degradation
 * worth shipping either.
 */
export function resolveBackupBridge(): BackupBridge | null {
    const host = (globalThis as { materialBluemap?: Host }).materialBluemap;
    if (host === undefined) return null;

    const { startBackup, onBackupEvent, inspectBackupRepository } = host;
    if (!isFunction(startBackup) || !isFunction(onBackupEvent) || !isFunction(inspectBackupRepository)) {
        return null;
    }

    const canCancel = isFunction(host.cancelBackup);
    const canListRepositories = isFunction(host.listBackupRepositories);
    const canListBackups = isFunction(host.listBackups);
    const canSeeActive = isFunction(host.activeBackups);
    const canCreateRepository = isFunction(host.createBackupRepository);

    const missing = (what: string): Promise<Answer<never>> =>
        Promise.resolve({
            ok: false,
            message: `This build cannot ${what}. The desktop application is what does it.`,
        });

    return {
        startBackup: (request) => startBackup(request),
        inspectBackupRepository: (request) => inspectBackupRepository(request),
        onBackupEvent: (listener) => onBackupEvent(listener),
        inspectBackupSource: (request) =>
            isFunction(host.inspectBackupSource)
                ? host.inspectBackupSource(request)
                : missing("read a folder before packing it"),
        listBackupRepositories: () =>
            isFunction(host.listBackupRepositories)
                ? host.listBackupRepositories()
                : missing("list your repositories"),
        // Left off the returned object entirely when the preload lacks it, exactly like
        // every other optional method on this bridge - the caller checks `canCreateRepository`
        // rather than calling a canned refusal, which is what lets the screen hide the
        // "Create a new repository" affordance outright rather than showing a dead button.
        ...(isFunction(host.createBackupRepository)
            ? { createBackupRepository: (request: CreateRepositoryRequest) => host.createBackupRepository!(request) }
            : {}),
        listBackups: (request) =>
            isFunction(host.listBackups) ? host.listBackups(request) : missing("list existing backups"),
        // False rather than a rejection: "this build cannot stop a backup" and "there was
        // nothing to stop" both leave the backup running, and the surface says which of
        // the two it is from `canCancel` rather than from a thrown error.
        cancelBackup: (backupId) =>
            isFunction(host.cancelBackup) ? host.cancelBackup(backupId) : Promise.resolve(false),
        // An empty list rather than a rejection, for the same reason `activeDownloads`
        // answers that way: not being able to ask what is in flight and nothing being in
        // flight lead to the same screen. What must never happen is a build inventing one.
        activeBackups: () => (isFunction(host.activeBackups) ? host.activeBackups() : Promise.resolve([])),
        canCancel,
        canListRepositories,
        canListBackups,
        canSeeActive,
        canCreateRepository,
    };
}
