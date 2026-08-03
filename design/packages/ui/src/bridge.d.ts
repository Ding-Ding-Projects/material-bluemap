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
    acceptDownload(): Promise<MojangConsentRecord>;
    revokeDownloadConsent(): Promise<MojangConsentRecord>;

    /** True only on the very first launch. The shell shows setup when it is. */
    needsFirstRun(): Promise<boolean>;
    /** Called when setup finishes, whichever way consent was answered. */
    completeFirstRun(): Promise<FirstRunState>;

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
}

interface Window {
    materialBluemap?: MaterialBlueMapBridge;
}
