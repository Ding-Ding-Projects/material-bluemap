/**
 * The gh command-line tool's own accounts, as the interface holds them.
 *
 * `githubAccountsStore.ts` next door is this application's own multi-account store. This
 * module is the completely separate thing: gh's own account list, read fresh every time
 * `load()` is called because gh may also be changed by a terminal or another program with
 * no event this application would ever see. `checkAgain()` is the same honest re-probe as
 * `load()` after either the GUI login flow or an external change.
 *
 * A build whose preload predates this support has `canList === false`, and the surface that
 * mounts this falls back to a plain sentence rather than drawing an empty list - see
 * `GhCliAccountsList.vue`.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    canLoginGhCli,
    canListGhCliAccounts,
    canSwitchGhCliAccount,
    resolveGhCliBridge,
    type GhCliAccountReadout,
    type GhCliAvailabilityReadout,
    type GhCliBridge,
    type GhCliLoginResultReadout,
    type GhCliLoginStateReadout,
    type GhCliSwitchReadout,
} from "./ghCliBridge.js";

export interface GhCliAccountsStoreOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: GhCliBridge | null;
}

/** What the last switch attempt did, kept apart from the list so it can be shown and dismissed. */
export interface GhCliSwitchReport {
    readonly host: string;
    readonly login: string;
    readonly result: GhCliSwitchReadout;
}

export interface GhCliAccountsStoreState {
    readonly canList: boolean;
    readonly canSwitch: boolean;
    readonly canLogin: boolean;

    readonly availability: Ref<GhCliAvailabilityReadout | null>;
    readonly version: Ref<string | null>;
    readonly accounts: Ref<readonly GhCliAccountReadout[]>;
    readonly source: Ref<"json" | "text" | null>;
    /** The main process's own one-sentence explanation of the current state. */
    readonly statusMessage: Ref<string>;
    readonly loading: Ref<boolean>;
    /** A list read that threw, stated rather than swallowed. Distinct from an honest "not-installed" answer. */
    readonly listFailure: Ref<string | null>;

    /** The busy key of the one switch currently in flight (host plus login), if any. */
    readonly busyKey: Ref<string | null>;
    readonly switchReport: Ref<GhCliSwitchReport | null>;
    readonly actionFailure: Ref<string | null>;

    /** Secret-free progress from the main process. */
    readonly loginState: Ref<GhCliLoginStateReadout | null>;
    readonly loginResult: Ref<GhCliLoginResultReadout | null>;
    readonly loginBusy: ComputedRef<boolean>;

    readonly hasAccounts: ComputedRef<boolean>;

    load(): Promise<void>;
    /** Same call as `load()`, named for an explicit re-probe after any account change. */
    checkAgain(): Promise<void>;
    switchAccount(host: string, login: string): Promise<boolean>;
    /** `expectedLogin` is supplied when repairing one account's scopes. */
    startLogin(expectedLogin?: string): Promise<boolean>;
    cancelLogin(): Promise<boolean>;
    clearLogin(): void;
    dismissSwitchReport(): void;
    dismissActionFailure(): void;
}

/**
 * Electron's `ipcRenderer.invoke` re-wraps a handler's rejection as
 * `Error invoking remote method '...': Error: <message>`. Stripped before anything renders
 * it, exactly as `githubAccountsStore.ts` does for the same reason.
 */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

function busyKeyOf(host: string, login: string): string {
    return host + " " + login;
}

/**
 * What one row is found by from this list's own search: the login, the host, how it signed
 * in, its scopes when reported, and the app-scope gap when there is one. Somebody who can
 * see a fact on a row and types it into the search bar must land on that row.
 */
export function ghCliAccountSearchText(account: GhCliAccountReadout): string {
    const parts: string[] = [account.login, account.host];
    if (account.tokenSource !== null) parts.push(account.tokenSource);
    if (account.scopesReported) parts.push(...account.scopes);
    if (account.missingAppScopes.length > 0) parts.push(...account.missingAppScopes);
    if (!account.healthy && account.stateDetail !== null) parts.push(account.stateDetail);
    return parts.filter((part) => part.trim().length > 0).join(" ");
}

export function createGhCliAccountsStore(
    options: GhCliAccountsStoreOptions = {},
): GhCliAccountsStoreState {
    const bridge = options.bridge !== undefined ? options.bridge : resolveGhCliBridge();

    const canList = canListGhCliAccounts(bridge);
    const canSwitch = canSwitchGhCliAccount(bridge);
    const canLogin = canLoginGhCli(bridge);

    const availability = ref<GhCliAvailabilityReadout | null>(null);
    const version = ref<string | null>(null);
    const accounts = ref<readonly GhCliAccountReadout[]>([]);
    const source = ref<"json" | "text" | null>(null);
    const statusMessage = ref("");
    const loading = ref(false);
    const listFailure = ref<string | null>(null);

    const busyKey = ref<string | null>(null);
    const switchReport = ref<GhCliSwitchReport | null>(null);
    const actionFailure = ref<string | null>(null);
    const loginState = ref<GhCliLoginStateReadout | null>(null);
    const loginResult = ref<GhCliLoginResultReadout | null>(null);
    const loginInFlight = ref(false);
    let stopLoginEvents: (() => void) | null = null;
    let loginMayHaveChangedAccounts = false;

    const hasAccounts = computed(() => accounts.value.length > 0);
    const loginBusy = computed(() => loginInFlight.value);

    async function load(): Promise<void> {
        const list = bridge?.ghCliListAccounts;
        if (typeof list !== "function") return;
        loading.value = true;
        try {
            const answer = await list();
            availability.value = answer.availability;
            version.value = answer.version;
            accounts.value = answer.accounts;
            source.value = answer.source;
            statusMessage.value = answer.message;
            listFailure.value = null;
        } catch (error) {
            listFailure.value = describe(error);
        } finally {
            loading.value = false;
        }
    }

    async function switchAccount(host: string, login: string): Promise<boolean> {
        const doSwitch = bridge?.ghCliSwitchAccount;
        if (typeof doSwitch !== "function" || busyKey.value !== null) return false;

        busyKey.value = busyKeyOf(host, login);
        actionFailure.value = null;
        try {
            const result = await doSwitch(host, login);
            switchReport.value = { host, login, result };
            if (!result.ok) {
                actionFailure.value = result.message;
                return false;
            }
            await load();
            return true;
        } catch (error) {
            actionFailure.value = describe(error);
            return false;
        } finally {
            busyKey.value = null;
        }
    }

    async function startLogin(expectedLogin?: string): Promise<boolean> {
        const start = bridge?.ghCliStartLogin;
        const subscribe = bridge?.onGhCliLoginState;
        if (typeof start !== "function" || typeof subscribe !== "function" || loginInFlight.value)
            return false;

        stopLoginEvents?.();
        loginMayHaveChangedAccounts = false;
        stopLoginEvents = subscribe((state) => {
            loginState.value = state;
            if (
                state.stage === "storing-credential" ||
                state.stage === "verifying" ||
                state.stage === "succeeded"
            ) {
                loginMayHaveChangedAccounts = true;
            }
        });
        loginInFlight.value = true;
        loginResult.value = null;
        actionFailure.value = null;
        try {
            const result = await start(expectedLogin);
            loginResult.value = result;
            loginState.value = result.state;
            if (result.ok || loginMayHaveChangedAccounts) await load();
            return result.ok;
        } catch (error) {
            actionFailure.value = describe(error);
            return false;
        } finally {
            loginInFlight.value = false;
            stopLoginEvents?.();
            stopLoginEvents = null;
        }
    }

    async function cancelLogin(): Promise<boolean> {
        const cancel = bridge?.ghCliCancelLogin;
        if (typeof cancel !== "function" || !loginInFlight.value) return false;
        try {
            const result = await cancel();
            if (!result.cancelled) actionFailure.value = result.message;
            return result.cancelled;
        } catch (error) {
            actionFailure.value = describe(error);
            return false;
        }
    }

    function clearLogin(): void {
        if (loginInFlight.value) return;
        loginState.value = null;
        loginResult.value = null;
    }

    function dismissSwitchReport(): void {
        switchReport.value = null;
    }

    function dismissActionFailure(): void {
        actionFailure.value = null;
    }

    return {
        canList,
        canSwitch,
        canLogin,
        availability,
        version,
        accounts,
        source,
        statusMessage,
        loading,
        listFailure,
        busyKey,
        switchReport,
        actionFailure,
        loginState,
        loginResult,
        loginBusy,
        hasAccounts,
        load,
        checkAgain: load,
        switchAccount,
        startLogin,
        cancelLogin,
        clearLogin,
        dismissSwitchReport,
        dismissActionFailure,
    };
}

export { busyKeyOf as ghCliBusyKey };
