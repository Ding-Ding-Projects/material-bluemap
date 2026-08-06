/** Typed surface of the Electron preload bridge (absent when running in a browser). */
interface MojangConsentRecord {
    accepted: boolean;
    acceptedAt: string | null;
    documentUrl: string;
    termsVersion: number;
    appVersion: string | null;
}

interface FirstRunState {
    completed: boolean;
    completedAt: string | null;
}

/**
 * Reading and writing a BlueMap config folder.
 *
 * Mirrors `ConfigBridge` in the preload, which mirrors `main/config/ipc.ts`. Every path is
 * relative to the config folder and spelled with forward slashes; the main process refuses
 * one that escapes it, or that is not a config file BlueMap would load, rather than
 * resolving it.
 */
interface BlueMapConfigFile {
    /** Relative to the config folder, e.g. `maps/overworld.conf`. */
    path: string;
    text: string;
}

interface BlueMapConfigFolderContents {
    /** The folder that was read, absolute. */
    folder: string;
    files: BlueMapConfigFile[];
}

interface BlueMapPickDirectoryOptions {
    title: string;
    /** Where the picker opens. Ignored unless it is a full path. */
    startIn?: string;
}

interface BlueMapPickFileOptions {
    title: string;
    /** Extensions without the dot, e.g. `["jar"]`. */
    extensions?: string[];
    startIn?: string;
}

interface BlueMapSqlProbeRequest {
    connectionUrl: string;
    /** `connection-properties`, which is where the user name and password live. */
    properties: Record<string, string>;
    dialect: string | null;
    driverJar: string | null;
    driverClass: string | null;
}

interface BlueMapSqlProbeResult {
    ok: boolean;
    /** One line for the user. On a driver failure this is the driver's own message. */
    message: string;
    /** Driver or dialect detail worth showing behind a disclosure. */
    detail?: string;
}

interface BlueMapConfigBridge {
    readFolder(folder: string): Promise<BlueMapConfigFolderContents>;
    writeFiles(folder: string, files: BlueMapConfigFile[]): Promise<void>;
    deleteFiles(folder: string, paths: string[]): Promise<void>;
    pickDirectory(options: BlueMapPickDirectoryOptions): Promise<string | null>;
    pickFile(options: BlueMapPickFileOptions): Promise<string | null>;
    testSqlConnection(request: BlueMapSqlProbeRequest): Promise<BlueMapSqlProbeResult>;
    suggestConfigFolder(): Promise<string>;
    /** `\\` on Windows, `/` elsewhere. Used only to build display paths. */
    pathSeparator: string;
}

/* -------------------------------------------------------------------------- */
/* The config folder's local version history                                  */
/* -------------------------------------------------------------------------- */

/**
 * The local, Git-backed history of a config folder.
 *
 * Mirrors `HistoryBridge` in the preload, which mirrors `main/history/ipc.ts`. Three
 * properties of that layer are worth restating here, because they are what the panel on
 * this side is allowed to assume:
 *
 *  - **Nothing rejects.** Every method resolves with a value, failures included, so a
 *    history that cannot be written can never take down the save it was recording.
 *  - **Nothing is rewritten.** A restore writes the old files back and records *that* as a
 *    new revision, so an undo can be undone and that undo undone in turn.
 *  - **Nothing leaves the machine.** The repository lives beside this application's own
 *    data, has no remote, and there is no call here that could give it one.
 */
type BlueMapHistoryChangeStatus = "added" | "modified" | "deleted";

interface BlueMapHistoryFileChange {
    /** Relative to the config folder, forward slashes, e.g. `maps/nether.conf`. */
    path: string;
    status: BlueMapHistoryChangeStatus;
}

/**
 * The grouping word a revision carries.
 *
 * The panel's action filter is built from the words the revisions in front of it actually
 * use, never from this union: a history with no restores in it offers no "restored"
 * filter, and a word added to the main process later needs no change on this side.
 */
type BlueMapHistoryAction = "started" | "created" | "changed" | "deleted" | "mixed" | "restored" | "pruned";

interface BlueMapHistoryRevision {
    id: string;
    shortId: string;
    /** ISO 8601. */
    at: string;
    /** Always names what changed, e.g. `Deleted the nether map`. Never `Updated`. */
    label: string;
    action: BlueMapHistoryAction;
    changes: BlueMapHistoryFileChange[];
    /** The user's own label for this revision, or null. */
    note: string | null;
    /** Set on a restore: the revision whose contents were written back. */
    restoredFrom: string | null;
}

interface BlueMapHistoryStatus {
    available: boolean;
    version: string | null;
    /** One sentence for the user when `available` is false. Null when it is true. */
    reason: string | null;
    /** Where histories are kept, beside the app's own data and never in a user's folder. */
    root: string;
}

interface BlueMapHistoryListing {
    available: boolean;
    reason: string | null;
    folder: string;
    repository: string;
    revisions: BlueMapHistoryRevision[];
    /** Expected to be empty. Sent so the panel can show that rather than promise it. */
    remotes: string[];
}

type BlueMapHistoryWrite =
    | { ok: true; revision: BlueMapHistoryRevision | null; message: string }
    | { ok: false; message: string };

interface BlueMapHistorySkippedFile {
    path: string;
    reason: string;
}

type BlueMapHistoryRestoreResult =
    | {
          ok: true;
          revision: BlueMapHistoryRevision | null;
          message: string;
          skipped: BlueMapHistorySkippedFile[];
      }
    | { ok: false; message: string };

interface BlueMapHistoryRevisionFile {
    path: string;
    text: string;
}

interface BlueMapHistoryDiffFile {
    path: string;
    status: BlueMapHistoryChangeStatus;
    /** A unified diff, exactly as git wrote it. */
    patch: string;
}

type BlueMapHistoryFilesResult =
    | { ok: true; files: BlueMapHistoryRevisionFile[] }
    | { ok: false; message: string };

type BlueMapHistoryDiffResult =
    | { ok: true; files: BlueMapHistoryDiffFile[] }
    | { ok: false; message: string };

interface BlueMapHistoryComparisonFile extends BlueMapHistoryDiffFile {
    /** The file's whole text at the older end, or null when absent or withheld. */
    before: string | null;
    after: string | null;
    /** Why a side is null despite existing there (too large, not text). Null otherwise. */
    withheld: string | null;
}

type BlueMapHistoryCompareResult =
    | { ok: true; from: string | null; to: string; files: BlueMapHistoryComparisonFile[] }
    | { ok: false; message: string };

interface BlueMapHistoryMergedFile {
    path: string;
    text: string;
}

/* -------------------------------------------------------------------------- */
/* A world's project                                                          */
/* -------------------------------------------------------------------------- */

/** Mirrors `ProjectBridge` in the preload, which mirrors `main/project/`. */
type BlueMapProjectReadFailure =
    | { kind: "absent" }
    | { kind: "unreadable"; message: string }
    | { kind: "not-json"; message: string }
    | { kind: "too-new"; version: number }
    | { kind: "invalid"; problems: string[] };

interface BlueMapProjectMap {
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

interface BlueMapProjectStorage {
    id: string;
    config: string;
}

interface BlueMapProjectRender {
    threads: number | null;
    force: boolean;
    fixEdges: boolean;
    metrics: boolean;
    outputFolder: string | null;
}

interface BlueMapProjectFile {
    version: number;
    id: string;
    name: string;
    createdAt: string;
    updatedAt: string;
    appVersion: string | null;
    maps: BlueMapProjectMap[];
    storages: BlueMapProjectStorage[];
    render: BlueMapProjectRender;
    core: string | null;
    webapp: string | null;
    webserver: string | null;
    plugin: string | null;
    fromWizard: boolean;
}

type BlueMapProjectReadOutcome =
    | { ok: true; worldFolder: string; path: string; project: BlueMapProjectFile; text: string }
    | { ok: false; worldFolder: string; path: string; failure: BlueMapProjectReadFailure };

interface BlueMapProjectPresence {
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

type BlueMapProjectSaveResult =
    | {
          ok: true;
          path: string;
          project: BlueMapProjectFile;
          historyOk: boolean;
          revision: BlueMapHistoryRevision | null;
          historyMessage: string;
      }
    | { ok: false; reason: string };

interface BlueMapProjectHistoryListing {
    available: boolean;
    reason: string | null;
    worldFolder: string;
    repository: string;
    revisions: BlueMapHistoryRevision[];
    remotes: string[];
}

interface BlueMapProjectBridge {
    read(worldFolder: string): Promise<BlueMapProjectReadOutcome>;
    discover(worldFolder: string): Promise<BlueMapProjectPresence>;
    discoverMany(worldFolders: string[]): Promise<BlueMapProjectPresence[]>;
    save(
        worldFolder: string,
        project: BlueMapProjectFile,
        replaceUnreadable?: boolean,
    ): Promise<BlueMapProjectSaveResult>;
    history(worldFolder: string, limit?: number): Promise<BlueMapProjectHistoryListing>;
    restore(worldFolder: string, id: string): Promise<BlueMapHistoryRestoreResult>;
    /**
     * Keeps the newest `keep` revisions of this world's project history and removes the
     * rest. **Destructive.**
     */
    discardOlderRevisions(worldFolder: string, keep: number): Promise<BlueMapHistoryWrite>;

    /** Tells the autosave scheduler this world's project now looks like this. */
    notifyAutosaveChange(worldFolder: string, project: BlueMapProjectFile): Promise<void>;
    /** Writes whatever is pending for one world immediately. `null` when nothing was pending. */
    flushAutosave(
        worldFolder: string,
        reason: "boundary" | "destructive" | "quit",
    ): Promise<BlueMapProjectSaveResult | null>;
    /** Every autosave attempt this scheduler makes, automatic or flushed, successful or not. */
    onAutosaveEvent(listener: (event: BlueMapProjectAutosaveEvent) => void): () => void;

    /** Every world this machine knows about that carries a project. */
    listProjects(): Promise<{
        projects: {
            world: string;
            file: string;
            id: string | null;
            name: string | null;
            maps: number | null;
            createdAt: string | null;
            updatedAt: string | null;
            fromWizard: boolean | null;
            worldName: string | null;
            problem: string | null;
        }[];
        scanned: number;
        problems: { world: string; message: string }[];
    }>;
    readProject(world: string): Promise<
        | { ok: true; project: BlueMapProjectFile; file: string }
        | { ok: false; failure: BlueMapProjectReadFailure }
    >;
    writeProject(
        world: string,
        project: BlueMapProjectFile,
    ): Promise<
        | { ok: true; file: string; historyOk: boolean; historyMessage: string; revision: BlueMapHistoryRevision | null }
        | { ok: false; message: string }
    >;
}

/** Why one autosave happened, and what it produced. Mirrors `ProjectAutosaveEvent` in the preload. */
interface BlueMapProjectAutosaveEvent {
    worldFolder: string;
    reason: "quiet" | "boundary" | "destructive" | "quit";
    result: BlueMapProjectSaveResult;
}

interface BlueMapHistoryBridge {
    status(): Promise<BlueMapHistoryStatus>;
    list(folder: string, limit?: number): Promise<BlueMapHistoryListing>;
    snapshot(folder: string): Promise<BlueMapHistoryWrite>;
    revisionFiles(folder: string, id: string): Promise<BlueMapHistoryFilesResult>;
    diff(folder: string, id: string): Promise<BlueMapHistoryDiffResult>;
    restore(folder: string, id: string): Promise<BlueMapHistoryRestoreResult>;
    label(folder: string, id: string, label: string): Promise<BlueMapHistoryWrite>;
    /**
     * Keeps the newest `keep` revisions and removes the rest. **Destructive.**
     *
     * The one call here that takes anything away, which is why the panel puts it behind
     * the two-key confirmation gate rather than a plain button.
     */
    discardOlderRevisions(folder: string, keep: number): Promise<BlueMapHistoryWrite>;

    /**
     * What changed between two revisions, with both sides' text whole.
     *
     * A null `from` means the parent of `to`, or the empty tree for the first revision.
     * Whole text rather than a patch is what lets the panel report changed settings instead
     * of changed lines: a setting that merely moved in the file is not a change, and a
     * comment somebody added is not a setting change, but a line diff calls both one.
     */
    compare(folder: string, from: string | null, to: string): Promise<BlueMapHistoryCompareResult>;
    /** Puts back only the named files of a revision, recorded as a new revision. */
    restoreFiles(folder: string, id: string, paths: string[]): Promise<BlueMapHistoryRestoreResult>;
    /** Puts back individual settings, from files this side has already merged. */
    restoreSettings(
        folder: string,
        id: string,
        files: BlueMapHistoryMergedFile[],
        keys: string[],
    ): Promise<BlueMapHistoryRestoreResult>;
}

/* -------------------------------------------------------------------------- */
/* The worlds already on this machine                                         */
/* -------------------------------------------------------------------------- */

/**
 * A shallow reading of a folder, for deciding whether it is a Minecraft world.
 *
 * Mirrors `WorldFolderListing` in the preload, which mirrors `main/world/inspect.ts`.
 * Region files are counted rather than listed: a mature world holds tens of thousands of
 * `.mca` files whose names answer no question the wizard asks.
 */
interface BlueMapWorldFolderListing {
    folder: string;
    entries: { path: string; directory: boolean }[];
    regionFiles: Record<string, number>;
    /**
     * The nether and/or the end, when a Spigot/Paper-style server split them into
     * sibling folders instead of nesting them inside this one. Keyed `"nether"` /
     * `"the_end"`.
     */
    serverSiblings: Record<string, { worldFolder: string; regionFiles: number }>;
}

/**
 * One place worlds are offered from.
 *
 * The Minecraft folder this machine's platform puts saves in is found automatically and
 * is the first of these; the rest are folders the person mounted themselves, because one
 * machine commonly holds a vanilla install, a modded instance and an archive on another
 * drive, and the worlds in all of them are worlds somebody might want a map of.
 *
 * `state` is checked afresh every time the list is asked for. A folder on a drive that is
 * unplugged right now reports `missing` and keeps its row: forgetting a mounted folder
 * over an unplugged cable would be discarding a setting on the strength of a cable.
 */
interface BlueMapMinecraftFolder {
    id: string;
    label: string;
    /** True when the label is the person's own rather than the generated one. */
    labelled: boolean;
    /** Exactly what was handed over, which may be the installation or the saves folder. */
    chosenPath: string;
    /** The saves folder it resolved to, which is what is actually read. */
    savesPath: string;
    resolution: "installation" | "saves";
    /** True for a folder the app found by itself. Those are never unmounted. */
    builtIn: boolean;
    origin: "appdata" | "home" | "application-support" | "beside-executable" | null;
    state: "ok" | "missing" | "not-a-folder" | "unreadable";
    stateDetail: string | null;
    mountedAt: string | null;
}

/**
 * One world, with the facts a person actually chooses by.
 *
 * `name` is `LevelName` from `level.dat` and is deliberately not the folder name:
 * Minecraft names the folder when the world is created and never renames it, so a world
 * called "Survival" in the game routinely sits in a folder called "New World (2)".
 * Anything that could not be read is null rather than guessed, and a world whose
 * `level.dat` is unreadable is still listed, carrying `detailsError`.
 */
interface BlueMapMinecraftWorldSummary {
    folderId: string;
    path: string;
    directoryName: string;
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
    /** Keyed by region directory, exactly as the folder inspection reports them. */
    regionFiles: Record<string, number>;
    sizeBytes: number | null;
    /** False when the measurement stopped at its cap, so the size is a floor. */
    sizeComplete: boolean;
    detailsError: string | null;
}

interface BlueMapSavesScan {
    folderId: string;
    savesPath: string;
    worlds: BlueMapMinecraftWorldSummary[];
    truncated: boolean;
}

type BlueMapFolderScanResult =
    | { ok: true; scan: BlueMapSavesScan }
    | { ok: false; folderId: string; message: string };

type BlueMapMountFolderResult =
    | { ok: true; folder: BlueMapMinecraftFolder; alreadyMounted: boolean }
    | { ok: false; message: string };

/* -------------------------------------------------------------------------- */
/* GitHub sign-in                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors the GitHub types in the preload, which mirror `main/github/`.
 *
 * Every name here carries the `BlueMapGitHub` prefix for the same reason
 * `MojangConsentRecord` and `BlueMapConfigFile` carry theirs: this file has no import and
 * no export, so TypeScript reads it in script mode and each of these declarations is
 * *global*. A bare `GitHubAccount` here would collide with any other ambient declaration
 * of that name in the program, and the collision would be reported somewhere other than
 * here.
 *
 * **No token appears in any of them.** The credential stays in the main process, which is
 * the only side that talks to GitHub; the renderer learns who is signed in, what that
 * account may do, and whether the sign-in was stored.
 */
interface BlueMapGitHubAccount {
    login: string;
    userId: number | null;
    name: string | null;
    scopes: string[];
    /** False for a GitHub App token and a fine-grained token: neither reports scopes. */
    scopesReported: boolean;
    source: "github-app" | "oauth-app" | "personal-access-token";
    signedInAt: string;
    /** Null when the token does not expire, which is the normal OAuth App answer. */
    expiresAt: string | null;
    refreshable: boolean;
    /** False when this machine has no credential store; the sign-in lasts this run only. */
    persisted: boolean;
    warnings: string[];
}

interface BlueMapGitHubFailure {
    code: string;
    message: string;
    /** Populated for `insufficient-scopes`, so the interface can name them. */
    missingScopes: string[];
    /** True when signing in with the OAuth application instead would likely work. */
    offerOAuthFallback: boolean;
}

type BlueMapGitHubSignInResult =
    | { ok: true; account: BlueMapGitHubAccount }
    | { ok: false; failure: BlueMapGitHubFailure };

interface BlueMapGitHubSignOutResult {
    signedOut: boolean;
    /** True only when GitHub confirmed the revocation, never merely because it was asked. */
    revoked: boolean;
    reason: string | null;
    manageUrl: string | null;
}

interface BlueMapGitHubStatus {
    signedIn: boolean;
    account: BlueMapGitHubAccount | null;
    /** False when this build has no client configured; only the token path is available. */
    clientConfigured: boolean;
    clientKind: "app" | "oauth" | null;
    encryptionAvailable: boolean;
    requiredScopes: string[];
    signingIn: boolean;
}

/**
 * What the sign-in screen is told while it waits.
 *
 * The only channel the user code, the verification address, the countdown and the expiry
 * arrive on. A device sign-in waits for as long as somebody takes to reach their phone,
 * and none of that is available to a screen that can only ask "are we there yet".
 */
type BlueMapGitHubAuthEvent =
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
    | { type: "signed-in"; account: BlueMapGitHubAccount }
    | { type: "failed"; failure: BlueMapGitHubFailure }
    | { type: "cancelled" }
    | { type: "signed-out" };

/**
 * Whether the signed-in account can reach a repository.
 *
 * `app-not-installed` is the case worth naming. GitHub answers 404 both for a repository
 * that does not exist and for one a GitHub App was never given, so "not found" is the most
 * misleading true thing the app could say.
 */
type BlueMapGitHubRepositoryAccess =
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

interface MaterialBlueMapBridge {
    syncProfiles(profiles: { id: string; name: string; baseUrl: string }[]): Promise<void>;
    writeClipboardText(text: string): Promise<void>;
    getVersion(): Promise<string>;

    /**
     * Mojang download consent, asked once during first-run setup and remembered.
     *
     * Nothing in the interface may ask again. A render that needs consent and does
     * not have it reports what is missing and links to the setting; it never puts a
     * licence in front of somebody who is already halfway through a task.
     */
    readConsent(): Promise<MojangConsentRecord>;

    /**
     * Mojang's EULA text. `ok: false` carries a reason and any cached copy.
     *
     * A licence that will not load says so; it is never quietly replaced with something
     * that merely looks like one, and the panel says which of the three it is showing.
     */
    readEulaDocument(request: { refresh: boolean }): Promise<
        | {
              ok: true;
              document: {
                  source: "live" | "cache";
                  text: string;
                  documentUrl: string;
                  fetchedAt: string;
                  characters: number;
              };
          }
        | {
              ok: false;
              reason: string;
              cached: {
                  source: "live" | "cache";
                  text: string;
                  documentUrl: string;
                  fetchedAt: string;
                  characters: number;
              } | null;
          }
    >;
    acceptDownload(): Promise<MojangConsentRecord>;
    revokeDownloadConsent(): Promise<MojangConsentRecord>;

    /** True only on the very first launch. The shell shows setup when it is. */
    needsFirstRun(): Promise<boolean>;
    /** Called when setup finishes, whichever way consent was answered. */
    completeFirstRun(): Promise<FirstRunState>;

    /**
     * Reads a folder shallowly, so the wizard can say whether it is a world.
     *
     * Rejects when the folder cannot be read rather than returning an empty listing: "no
     * level.dat here" and "this folder does not exist" send somebody to two different
     * places, and reporting the first when the second is true wastes their afternoon.
     */
    inspectWorldFolder(folder: string): Promise<BlueMapWorldFolderListing>;

    /**
     * The Minecraft folders worlds are offered from: the detected default first, then
     * whatever the person has mounted.
     *
     * Never rejects for a folder that is not there. A machine with no Minecraft on it is
     * an ordinary machine, and the honest answer is a row saying where it looked.
     *
     * Declared here because this is the shell this interface ships with.
     * `components/world/worldCatalog.ts` still feature-detects every one of these
     * separately and refuses a partial answer, and it is right to: a released shell can
     * load a newer renderer than the one it was built beside, and a list that throws when
     * it loads is worse than a step that quietly keeps its path field.
     */
    listMinecraftFolders(): Promise<BlueMapMinecraftFolder[]>;

    /**
     * Adds a Minecraft folder to that list, taking either an installation or the `saves`
     * folder inside it and reporting which it found.
     */
    mountMinecraftFolder(folder: string): Promise<BlueMapMountFolderResult>;

    /**
     * Takes a mounted folder off the list, touching nothing on disk.
     *
     * No world, no file and no folder is deleted by this. It rewrites one small JSON list
     * and never opens the folder it is forgetting, which is why the interface offers it
     * as an ordinary control rather than behind the destructive-action gate.
     */
    unmountMinecraftFolder(id: string): Promise<boolean>;

    /** Renames a mounted folder. An empty label puts the generated name back. */
    labelMinecraftFolder(id: string, label: string): Promise<boolean>;

    /**
     * Reads the worlds in one mounted folder.
     *
     * One folder per call, so each finishes on its own and a slow network drive is
     * visibly slow rather than holding up the local folders that were ready at once.
     */
    scanMinecraftFolder(id: string): Promise<BlueMapFolderScanResult>;

    /**
     * The real path of a file or folder dropped onto the window.
     *
     * Electron removed `File.path` in version 32, so a drop handler sees a `File` with a
     * name and no location; this is the shell's replacement for it. Null when the drop
     * named no real file, which is what a drag out of a browser tab produces.
     */
    pathForDroppedFile(file: File): string | null;

    /**
     * Who is signed in to GitHub, and what this machine can do about it.
     *
     * Reads stored metadata rather than the credential, so asking costs nothing and never
     * prompts a credential store. `clientConfigured` false means the browser sign-in is
     * unavailable in this build and only the token path is offered; `encryptionAvailable`
     * false means a sign-in will not survive a restart, which the screen says *before*
     * somebody signs in rather than at the next launch when they are signed out again.
     *
     * Declared here because this is the shell this interface ships with. `githubBridge.ts`
     * still probes for every one of these separately and refuses a partial answer, and it
     * is right to: a released shell can load a newer renderer than the one it was built
     * beside, and a Sign in button that throws when pressed is worse than a sentence
     * saying this build cannot sign in.
     */
    githubStatus(): Promise<BlueMapGitHubStatus>;

    /**
     * Starts the browser sign-in and resolves when it is over, whichever way it went.
     *
     * This takes as long as somebody takes to reach their phone, so watch
     * {@link onGitHubAuthEvent} for the code, the countdown and the outcome. It never
     * rejects: a refusal comes back `ok: false` with a typed `failure.code`.
     *
     * `useOAuthFallback` switches from the GitHub App to the OAuth application, and is
     * offered when a failure comes back with `offerOAuthFallback` — which is what a GitHub
     * App that was never installed on the wanted repository produces.
     */
    githubSignIn(options?: { useOAuthFallback?: boolean }): Promise<BlueMapGitHubSignInResult>;

    /** Stops a sign-in that is waiting for approval. False when none is running. */
    githubCancelSignIn(): Promise<boolean>;

    /**
     * Signs in with a personal access token, checking it before believing it.
     *
     * The token is verified against the API on the way in, so a wrong or under-scoped one
     * is named here rather than at the first render. It crosses to the main process and is
     * never handed back.
     */
    githubSignInWithToken(token: string): Promise<BlueMapGitHubSignInResult>;

    /**
     * Deletes the stored token and attempts to revoke it.
     *
     * `revoked` is true only when GitHub confirmed it. A desktop application holds no
     * client secret and GitHub's revocation endpoint wants one, so on a shipped build the
     * honest answer is usually false, with a reason and a link for finishing the job.
     */
    githubSignOut(): Promise<BlueMapGitHubSignOutResult>;

    /** Whether the signed-in account can actually reach a repository. Ask before a render. */
    githubCheckRepository(owner: string, repo: string): Promise<BlueMapGitHubRepositoryAccess>;

    /**
     * Subscribes to sign-in progress. Returns the unsubscribe function.
     *
     * Pushed rather than polled, and not a nicety: the user code, the verification address
     * and the countdown exist nowhere else, so a sign-in surface without this has a
     * spinner and nothing to type.
     */
    onGitHubAuthEvent(listener: (event: BlueMapGitHubAuthEvent) => void): () => void;

    /**
     * The config folder, for the options screen.
     *
     * Declared here because this is the shell this interface ships with. `configHost.ts`
     * still probes for every method one at a time and refuses a partial answer, and it is
     * right to: a released shell can load a newer renderer than the one it was built
     * beside, and a control that throws when clicked is worse than a control that says
     * what it needs.
     */
    config: BlueMapConfigBridge;

    /**
     * The local version history of a config folder, for the history panel.
     *
     * Declared here because this is the shell this interface ships with. `historyHost.ts`
     * still probes for every method one at a time and refuses a partial answer, and it is
     * right to: a released shell can load a newer renderer than the one it was built
     * beside, and a Restore button that throws when pressed is far worse than a panel
     * saying this build keeps no history.
     */
    history: BlueMapHistoryBridge;

    /**
     * A world's own record of how it should be rendered, and the history of it.
     *
     * A `present` row with a null `name` and a `problem` is a world whose project is there
     * and damaged - a different thing to say than "no project", which is why this is not a
     * boolean.
     */
    project: BlueMapProjectBridge;

    /**
     * Backing a world or a rendered map up to GitHub release assets.
     *
     * Declared here because this is the shell this interface ships with. `backupBridge.ts`
     * still probes for every method one at a time and refuses a partial answer, and it is
     * right to: a Back up button that begins hours of invisible work because the shell
     * carries `startBackup` but not `onBackupEvent` is worse than a surface saying this
     * build cannot back anything up. Methods are spelled out rather than imported because
     * this file is ambient: an import would make it a module and take the global with it.
     */
    listBackupRepositories(): Promise<BackupAnswer<readonly BackupRepositoryChoice[]>>;
    inspectBackupRepository(request: { owner: string; repo: string }): Promise<BackupAnswer<BackupRepositoryReport>>;
    inspectBackupSource(request: { kind: BackupSourceKind; folder: string }): Promise<BackupAnswer<BackupSourceReport>>;
    listBackups(request: { owner: string; repo: string }): Promise<BackupAnswer<readonly BackupListing[]>>;
    startBackup(request: BackupRequest): Promise<BackupResult>;
    cancelBackup(backupId: string): Promise<boolean>;
    activeBackups(): Promise<readonly string[]>;
    onBackupEvent(listener: (event: BackupEvent) => void): () => void;
}

/* -------------------------------------------------------------------------- */
/* Backing a world or a rendered map up to GitHub                             */
/* -------------------------------------------------------------------------- */

/**
 * Mirrors `components/backup/backupBridge.ts`, which mirrors `main/backup/ipc.ts`. Names
 * carry a `Backup` prefix where the component's own name would collide with something
 * else already declared globally here.
 */
type BackupSourceKind = "render" | "world";

interface BackupSourceReport {
    readonly kind: BackupSourceKind;
    readonly folder: string;
    readonly label: string;
    readonly files: number;
    readonly bytes: number;
    readonly skipped: readonly { readonly name: string; readonly reason: string }[];
}

interface BackupRepositoryChoice {
    readonly owner: string;
    readonly name: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
}

interface BackupRepositoryReport {
    readonly owner: string;
    readonly repo: string;
    readonly fullName: string;
    readonly private: boolean;
    readonly canWrite: boolean;
    readonly htmlUrl: string;
    readonly warning: { readonly level: "warning" | "note"; readonly message: string } | null;
}

type BackupPhase = "inspecting" | "packing" | "splitting" | "publishing" | "uploading" | "finished";

interface BackupTaskProgress {
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

interface BackupFailure {
    readonly code: string;
    readonly message: string;
    readonly detail: string | null;
    readonly status: number | null;
    /** True when signing in again in Settings is the thing that would fix it. */
    readonly needsSignIn: boolean;
}

interface BackupSummary {
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

interface BackupRequest {
    readonly kind: BackupSourceKind;
    readonly folder: string;
    readonly owner: string;
    readonly repo: string;
    /** Set only once the person has been shown, and accepted, that the repository is public. */
    readonly acknowledgePublic?: boolean;
    /** Carry on with an existing backup rather than starting a new one. */
    readonly resumeTag?: string;
}

type BackupEvent =
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

type BackupResult =
    | {
          readonly ok: true;
          readonly backupId: string;
          readonly summary: BackupSummary;
          readonly durationMs: number;
      }
    | { readonly ok: false; readonly backupId: string; readonly failure: BackupFailure };

/** One backup found on a repository, read from its release's own small assets. */
interface BackupListing {
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

/** Every answer the main process gives to a backup question that can simply fail. */
type BackupAnswer<T> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly message: string };

interface Window {
    materialBluemap?: MaterialBlueMapBridge;
}
