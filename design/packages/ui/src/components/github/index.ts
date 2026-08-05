/**
 * The GitHub sign-in surface.
 *
 * Mount {@link GitHubAccountRow} with one {@link GitHubAccountState}, which
 * {@link createGitHubAccount} builds from the preload. The settings surface does exactly
 * that, as a section of its own, so the sign-in lives where every other app-wide setting
 * lives rather than behind a menu item of its own.
 *
 * Everything is feature-detected: a build whose preload has no GitHub namespace shows one
 * sentence saying so and no controls at all, because the credential is held by the main
 * process and there is nothing to sign in with without one.
 */

export { default as GitHubAccountRow } from "./GitHubAccountRow.vue";
export { default as GitHubAccountsList } from "./GitHubAccountsList.vue";
export { default as GitHubStatusRow } from "./GitHubStatusRow.vue";
export { default as GitHubDeviceFlowPanel } from "./GitHubDeviceFlowPanel.vue";
export { default as GitHubTokenForm } from "./GitHubTokenForm.vue";

export {
    classifyAuthFailure,
    createGitHubAccount,
    formatCountdown,
    formatTimestamp,
    githubSearchValues,
    spellOutCode,
} from "./githubAccount.js";
export type {
    DeviceCodeReadout,
    DeviceFlowPhase,
    GitHubAccountOptions,
    GitHubAccountState,
} from "./githubAccount.js";

export { accountSearchText, createGitHubAccountsList } from "./githubAccountsStore.js";
export type {
    GitHubAccountsListOptions,
    GitHubAccountsListState,
    RemovalReport,
} from "./githubAccountsStore.js";

export {
    canCancelSignIn,
    canListGitHubAccounts,
    canReadGitHubStatus,
    canRefreshGitHubAccount,
    canRemoveGitHubAccount,
    canSetActiveGitHubAccount,
    canSignInToGitHub,
    canSignInWithToken,
    canSignOut,
    canStartDeviceSignIn,
    canWriteClipboard,
    resolveGitHubBridge,
} from "./githubBridge.js";
export type {
    GitHubAccountReadout,
    GitHubAccountSummaryReadout,
    GitHubAccountsListReadout,
    GitHubAuthEventReadout,
    GitHubBridge,
    GitHubFailureReadout,
    GitHubRefreshAccountReadout,
    GitHubRemoveAccountReadout,
    GitHubRepositoryAccessReadout,
    GitHubSetActiveAccountReadout,
    GitHubSignInOutcome,
    GitHubSignOutReadout,
    GitHubStatusReadout,
    GitHubTokenSource,
} from "./githubBridge.js";
