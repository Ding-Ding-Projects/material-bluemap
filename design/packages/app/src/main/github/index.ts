/**
 * GitHub sign-in for the desktop app.
 *
 * Sign-in is the OAuth application's device flow. A GitHub App is registered too and
 * fully supported behind an environment override, for somebody who would rather grant
 * access one repository at a time and accept the installation step and the expiring
 * tokens that come with it. A pasted personal access token is the third way in, for a
 * network that blocks the device endpoint or a person who simply has one already.
 *
 * All three end with a token that has been checked against the API and handed to the
 * operating system's credential store, and none of them ever writes a token to a plain
 * file.
 *
 * Only `ipc.ts` and `external.ts` import Electron. Everything else here is ordinary
 * TypeScript with its clock, its network and its storage passed in, which is why the
 * whole flow - including the parts that are awkward to reach by hand, like a server
 * asking the client to slow down, or a token expiring in the middle of a render - is
 * covered by tests that run in milliseconds.
 */

export {
    APP_INSTALLATIONS_URL,
    GITHUB_API_BASE,
    GITHUB_APP_CLIENT_ID,
    GITHUB_CLIENT_ID_ENV,
    GITHUB_CLIENT_KIND_ENV,
    GITHUB_CLIENT_SECRET_ENV,
    GITHUB_OAUTH_BASE,
    GITHUB_OAUTH_CLIENT_ID,
    PERSONAL_ACCESS_TOKEN_SETTINGS_URL,
    REQUIRED_SCOPES,
    authorizedApplicationUrl,
    clientKindFromId,
    fallbackOAuthClient,
    resolveClient,
    resolveClientSecret,
    scopesForClient,
    tokenSourceForClient,
    type EnvironmentLike,
    type GitHubClient,
    type GitHubClientKind,
    type TokenSource,
} from "./config.js";

export { REDACTED, describeError, redactSecrets } from "./redact.js";

export {
    parseScopeList,
    pollForAccessToken,
    refreshAccessToken,
    requestDeviceCode,
    type AccessTokenGrant,
    type DeviceCodeGrant,
    type DeviceCodeOptions,
    type DeviceCodeResult,
    type DeviceFlowFailure,
    type DeviceFlowFailureCode,
    type FetchLike,
    type PollOptions,
    type PollResult,
    type PollWaitState,
    type RefreshOptions,
    type SleepLike,
} from "./deviceFlow.js";

export {
    checkRepositoryAccess,
    describeMissingInstallation,
    missingScopes,
    revokeToken,
    scopeSatisfied,
    scopeWarnings,
    verifyToken,
    type GitHubIdentity,
    type RepositoryAccess,
    type RepositoryAccessFailure,
    type RepositoryAccessFailureCode,
    type RevocationOutcome,
    type TokenFailure,
    type TokenFailureCode,
    type TokenVerification,
} from "./token.js";

export {
    ENCRYPTION_UNAVAILABLE_MESSAGE,
    TokenStore,
    type CredentialKind,
    type ReadResult,
    type SafeStorageLike,
    type SaveResult,
    type StoredCredential,
    type StoredSecret,
} from "./storage.js";

export {
    GitHubSession,
    type AccessTokenResult,
    type GitHubAccount,
    type GitHubAuthEvent,
    type GitHubFailure,
    type GitHubSessionOptions,
    type GitHubStatus,
    type SignInResult,
    type SignOutResult,
} from "./session.js";

export {
    CREDENTIAL_FILE_NAME,
    GITHUB_EVENT_CHANNEL,
    installGitHubIpc,
    type GitHubIpc,
    type GitHubIpcOptions,
} from "./ipc.js";

export { isExternalUrlAllowed, openExternalHttps } from "./external.js";
