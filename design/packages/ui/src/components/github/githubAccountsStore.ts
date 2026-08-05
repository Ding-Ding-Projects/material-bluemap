/**
 * Every GitHub account this computer has stored, as the interface holds it.
 *
 * `githubAccount.ts` next door is "who is signed in right now" - one account, the one every
 * render and download actually runs as. This module is the collection behind it: every
 * account that has ever signed in and is still stored, which one of them is active, and the
 * three things a row can do to one - make it active, sign it out, or renew its token.
 *
 * A build whose preload predates multi-account support has none of the four methods this
 * reads, and {@link GitHubAccountsListState.canList} says so; the section falls back to the
 * single-account facts it always showed rather than drawing a list with nothing to fill it.
 *
 * ### Removing an account never lies about what happens next
 *
 * Removing the *active* account is not the end of the story the way it is for the old
 * single-account sign-out: another stored account can become active in its place. The main
 * process reports exactly which - `fallbackAccount` names it, or is null when nobody else
 * was signed in - and this module keeps that answer on {@link GitHubAccountsListState.removeReport}
 * rather than assuming either outcome. A row that removed the active account and simply
 * re-read the list a moment later would show the fallback account as though it had always
 * been active, with no word said about the switch that just happened.
 *
 * ### Refreshed on every sign-in and sign-out event, not just its own actions
 *
 * Adding an account through the existing device-flow or pasted-token surface, switching
 * accounts from a different tab of this same window, or losing the active account to some
 * other cause all arrive on the same `onGitHubAuthEvent` stream `githubAccount.ts` listens
 * to. This module subscribes independently and reloads the list on every `signed-in` and
 * `signed-out` event, so the list never goes stale behind whichever surface last touched it.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    canListGitHubAccounts,
    canRefreshGitHubAccount,
    canRemoveGitHubAccount,
    canSetActiveGitHubAccount,
    resolveGitHubBridge,
    type GitHubAccountSummaryReadout,
    type GitHubAuthEventReadout,
    type GitHubBridge,
    type GitHubRemoveAccountReadout,
} from "./githubBridge.js";

export interface GitHubAccountsListOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: GitHubBridge | null;
}

/** What the last removal did, kept apart from the list so it can be shown and dismissed. */
export interface RemovalReport {
    readonly id: string;
    readonly report: GitHubRemoveAccountReadout;
}

export interface GitHubAccountsListState {
    /** True when this build can list every stored account at all. */
    readonly canList: boolean;
    readonly canRemove: boolean;
    readonly canSetActive: boolean;
    readonly canRefresh: boolean;

    readonly accounts: Ref<readonly GitHubAccountSummaryReadout[]>;
    readonly activeId: Ref<string | null>;
    readonly loading: Ref<boolean>;
    /** A list read that threw, stated rather than swallowed. */
    readonly listFailure: Ref<string | null>;

    /** The one account id a set-active/remove/refresh call is in flight for, if any. */
    readonly busyId: Ref<string | null>;
    readonly removeReport: Ref<RemovalReport | null>;
    /** Why the last set-active, remove or refresh call did not do what it was asked. */
    readonly actionFailure: Ref<string | null>;

    readonly hasAccounts: ComputedRef<boolean>;

    load(): Promise<void>;
    setActive(id: string): Promise<boolean>;
    /** Removes exactly one account's stored token. Reports the result on {@link removeReport}. */
    removeAccount(id: string): Promise<boolean>;
    refreshAccount(id: string): Promise<boolean>;
    dismissRemoveReport(): void;
    dismissActionFailure(): void;
    /** Stops listening. Called when the surface holding this goes away. */
    dispose(): void;
}

/**
 * Electron's `ipcRenderer.invoke` re-wraps a handler's rejection as
 * `Error invoking remote method '...': Error: <message>`. Stripped before anything renders
 * it, exactly as `githubAccount.ts` does for the same reason.
 */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

/**
 * What one row is found by from this list's own search.
 *
 * Values only, in the order a reader would recognise them: the login first, then the
 * account's name if it has one, then how it signed in, then its scopes when the token
 * reports any. Somebody who can see a fact on a row and types it into the search bar must
 * land on that row.
 */
export function accountSearchText(account: GitHubAccountSummaryReadout): string {
    const parts: string[] = [account.login, account.source];
    if (account.name !== null) parts.push(account.name);
    if (account.scopesReported) parts.push(...account.scopes);
    parts.push(...account.warnings);
    return parts.filter((part) => part.trim().length > 0).join(" ");
}

export function createGitHubAccountsList(
    options: GitHubAccountsListOptions = {},
): GitHubAccountsListState {
    const bridge = options.bridge !== undefined ? options.bridge : resolveGitHubBridge();

    const canList = canListGitHubAccounts(bridge);
    const canRemove = canRemoveGitHubAccount(bridge);
    const canSetActive = canSetActiveGitHubAccount(bridge);
    const canRefresh = canRefreshGitHubAccount(bridge);

    const accounts = ref<readonly GitHubAccountSummaryReadout[]>([]);
    const activeId = ref<string | null>(null);
    const loading = ref(false);
    const listFailure = ref<string | null>(null);

    const busyId = ref<string | null>(null);
    const removeReport = ref<RemovalReport | null>(null);
    const actionFailure = ref<string | null>(null);

    const hasAccounts = computed(() => accounts.value.length > 0);

    async function load(): Promise<void> {
        const list = bridge?.githubListAccounts;
        if (typeof list !== "function") return;
        loading.value = true;
        try {
            const answer = await list();
            accounts.value = answer.accounts;
            activeId.value = answer.activeId;
            listFailure.value = null;
        } catch (error) {
            listFailure.value = describe(error);
        } finally {
            loading.value = false;
        }
    }

    /**
     * The list has no story of its own to tell about *why* an account changed - only that
     * it might have. Every route that changes who is signed in shares this one event
     * stream, so reloading on both event types is what keeps the list in step with a
     * sign-in or sign-out started from anywhere else.
     */
    function handle(event: GitHubAuthEventReadout): void {
        if (event.type === "signed-in" || event.type === "signed-out") void load();
    }

    const unsubscribe =
        bridge?.onGitHubAuthEvent === undefined ? () => undefined : bridge.onGitHubAuthEvent(handle);

    async function setActive(id: string): Promise<boolean> {
        const set = bridge?.githubSetActiveAccount;
        if (typeof set !== "function" || busyId.value !== null) return false;

        busyId.value = id;
        actionFailure.value = null;
        try {
            const outcome = await set(id);
            if (!outcome.ok) {
                actionFailure.value = outcome.reason ?? "Could not switch to that account.";
                return false;
            }
            await load();
            return true;
        } catch (error) {
            actionFailure.value = describe(error);
            return false;
        } finally {
            busyId.value = null;
        }
    }

    /** Removes exactly one account's stored token. Never the currently in-flight one twice. */
    async function removeAccount(id: string): Promise<boolean> {
        const remove = bridge?.githubRemoveAccount;
        if (typeof remove !== "function" || busyId.value !== null) return false;

        busyId.value = id;
        actionFailure.value = null;
        try {
            const report = await remove(id);
            removeReport.value = { id, report };
            await load();
            return report.removed;
        } catch (error) {
            actionFailure.value = describe(error);
            return false;
        } finally {
            busyId.value = null;
        }
    }

    async function refreshAccount(id: string): Promise<boolean> {
        const refresh = bridge?.githubRefreshAccount;
        if (typeof refresh !== "function" || busyId.value !== null) return false;

        busyId.value = id;
        actionFailure.value = null;
        try {
            const outcome = await refresh(id);
            if (!outcome.ok) {
                actionFailure.value = outcome.failure?.message ?? "Could not refresh that account.";
                return false;
            }
            await load();
            return true;
        } catch (error) {
            actionFailure.value = describe(error);
            return false;
        } finally {
            busyId.value = null;
        }
    }

    function dismissRemoveReport(): void {
        removeReport.value = null;
    }

    function dismissActionFailure(): void {
        actionFailure.value = null;
    }

    return {
        canList,
        canRemove,
        canSetActive,
        canRefresh,
        accounts,
        activeId,
        loading,
        listFailure,
        busyId,
        removeReport,
        actionFailure,
        hasAccounts,
        load,
        setActive,
        removeAccount,
        refreshAccount,
        dismissRemoveReport,
        dismissActionFailure,
        dispose: unsubscribe,
    };
}
