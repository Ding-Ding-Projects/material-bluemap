/**
 * The GitHub sign-in, as the interface holds it.
 *
 * Signing in exists for two jobs the app cannot do anonymously: rendering a world that
 * lives in a private repository, and downloading a release asset that is not public.
 * Nothing else in the app needs it, so the section says that plainly rather than asking
 * for an account because applications ask for accounts.
 *
 * ### Everything on screen came from an event
 *
 * The browser sign-in is a device flow: the app asks GitHub for a short user code, the
 * person types it on github.com, and the app polls until they have. That wait has no
 * known length - it is however long it takes somebody to reach their phone - so the code,
 * the verification address, the seconds left and the outcome are **pushed** on
 * `onGitHubAuthEvent`, and this module holds the latest of each. It starts no clock of its
 * own: the countdown is whatever the last `waiting` event said, because a clock the screen
 * runs by itself keeps counting after a code has died and a screen that keeps counting
 * down to a code nobody can use any more is worse than one that stopped.
 *
 * ### A `failed` event does not always belong to the browser flow
 *
 * The main process emits `failed` for **every** refused sign-in, including a pasted token
 * it turned down, because both paths end in the same place. So a `failed` event only moves
 * the device-flow phase while a device flow is actually in flight; otherwise it is left
 * alone and the pasted-token path reports its own refusal from its own call. Without that
 * rule, a mistyped token would paint the browser panel red about something the browser
 * panel never did.
 *
 * ### The token is never held here
 *
 * {@link GitHubAccountState.signInWithToken} takes the pasted value, hands it to the main
 * process and keeps nothing - not in a ref, not in a message, not in a failure. The main
 * process is the only side that stores a credential, and this module never receives one to
 * store: the account, its scopes and whether it was persisted are the whole of what
 * crosses back.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    canCancelSignIn,
    canReadGitHubStatus,
    canSignInToGitHub,
    canSignInWithToken,
    canSignOut,
    canStartDeviceSignIn,
    canWriteClipboard,
    resolveGitHubBridge,
    type GitHubAccountReadout,
    type GitHubAuthEventReadout,
    type GitHubBridge,
    type GitHubFailureReadout,
    type GitHubSignInOutcome,
    type GitHubSignOutReadout,
    type GitHubStatusReadout,
} from "./githubBridge.js";

/**
 * Where the browser sign-in has got to.
 *
 * `denied`, `expired` and `cancelled` are kept apart from `failed` because each has a
 * different next step and only one of them is a fault: an expired code wants a fresh code,
 * a refusal on the GitHub page wants a decision, a cancellation wants nothing at all, and
 * `failed` is the one where something actually went wrong and the message matters.
 */
export type DeviceFlowPhase =
    | "idle"
    | "starting"
    | "waiting"
    | "signed-in"
    | "denied"
    | "expired"
    | "cancelled"
    | "failed";

/** The device code as GitHub issued it, held exactly as the `code` event delivered it. */
export interface DeviceCodeReadout {
    readonly userCode: string;
    readonly verificationUri: string;
    readonly verificationUriComplete: string | null;
    readonly expiresAt: string;
    readonly intervalSeconds: number;
    /** False when the app could not open a browser; the address is shown to be opened. */
    readonly browserOpened: boolean;
}

export interface GitHubAccountOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: GitHubBridge | null;
}

export interface GitHubAccountState {
    /** True when this build can sign in at all, by either route. */
    readonly supported: boolean;
    /** True when the status can be read, which is what names the signed-in account. */
    readonly canReadStatus: boolean;
    readonly canDeviceSignIn: boolean;
    readonly canCancel: boolean;
    readonly canUseToken: boolean;
    readonly canSignOut: boolean;
    /** True when the app's own clipboard write is there, rather than the browser's. */
    readonly canCopy: boolean;

    readonly status: Ref<GitHubStatusReadout | null>;
    readonly account: Ref<GitHubAccountReadout | null>;
    readonly loading: Ref<boolean>;
    /** A status read that threw, stated rather than swallowed. */
    readonly statusFailure: Ref<string | null>;

    readonly phase: Ref<DeviceFlowPhase>;
    /**
     * True when the sign-in being waited on was already running before this surface
     * subscribed, so its `code` event has been and gone.
     *
     * The panel says so rather than drawing an empty box where a code should be: the code
     * is genuinely not available to it, and only a fresh sign-in can produce another.
     */
    readonly adopted: Ref<boolean>;
    readonly code: Ref<DeviceCodeReadout | null>;
    /** Straight off the event stream. Null when no event has said. */
    readonly secondsRemaining: Ref<number | null>;
    /** Why the browser sign-in ended badly. Null in every other phase. */
    readonly failure: Ref<GitHubFailureReadout | null>;

    /** Why a pasted token was turned down. Kept apart from the browser flow's failure. */
    readonly tokenFailure: Ref<GitHubFailureReadout | null>;
    readonly tokenBusy: Ref<boolean>;

    readonly signingOut: Ref<boolean>;
    /** What signing out managed to do, including whether GitHub confirmed the revocation. */
    readonly signOutReport: Ref<GitHubSignOutReadout | null>;

    /** True while a browser sign-in is in flight, which is what a Cancel button acts on. */
    readonly waiting: ComputedRef<boolean>;
    readonly signedIn: ComputedRef<boolean>;

    load(): Promise<void>;
    startDeviceSignIn(options?: { useOAuthFallback?: boolean }): Promise<void>;
    cancelSignIn(): Promise<boolean>;
    /** Hands the pasted token straight to the main process and keeps none of it. */
    signInWithToken(token: string): Promise<boolean>;
    signOut(): Promise<void>;
    /** Copies the user code. False when there was nothing to copy or nowhere to copy to. */
    copyUserCode(): Promise<boolean>;
    /** Clears a finished browser sign-in back to idle, so the panel can be started again. */
    dismissOutcome(): void;
    /** Stops listening. Called when the surface holding this goes away. */
    dispose(): void;
}

/**
 * Electron's `ipcRenderer.invoke` re-wraps a handler's rejection as
 * `Error invoking remote method 'github:status': Error: <message>`. The channel name and
 * the doubled `Error:` are plumbing rather than the sentence the main process wrote, so
 * they are stripped before anything renders the message, exactly as `javaSetting.ts` does.
 */
function describe(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, "");
}

/** A failure this surface made up because the bridge broke its own contract. */
function bridgeFailure(error: unknown): GitHubFailureReadout {
    return {
        code: "bridge-failed",
        message: describe(error),
        missingScopes: [],
        offerOAuthFallback: false,
    };
}

/**
 * Which terminal phase a failure code means.
 *
 * The three named codes come from `deviceFlow.ts`, where they are the three ways a flow
 * ends without an error: the person refused on the page, the code ran out of time, or the
 * wait was stopped. Everything else is a genuine failure whose message is worth reading.
 */
export function classifyAuthFailure(code: string): DeviceFlowPhase {
    switch (code) {
        case "denied":
            return "denied";
        case "expired":
            return "expired";
        case "cancelled":
            return "cancelled";
        default:
            return "failed";
    }
}

/** `mm:ss` for the countdown, or an empty string when no event has said. */
export function formatCountdown(seconds: number | null): string {
    if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return "";
    const whole = Math.floor(seconds);
    const minutes = Math.floor(whole / 60);
    const rest = whole % 60;
    return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/**
 * The code with its characters separated, for the label a screen reader announces.
 *
 * `WDJB-MJHT` read as a word is not a code anybody can type. Spacing the characters is
 * what makes a screen reader spell it out, and it is a presentation of the same string
 * rather than a different one: the visible code is still the verbatim code, hyphen
 * included, because that is what the verification page expects.
 */
export function spellOutCode(userCode: string): string {
    return [...userCode].join(" ");
}

/**
 * An ISO timestamp in the reader's own locale, or null when there is nothing to show.
 *
 * Null in, null out, and a value that is not a date is treated the same way: a signed-in
 * time that cannot be parsed is one fewer fact, never `Invalid Date` on the screen. A
 * runtime with no `Intl` data for the locale falls back to the ISO string, which is still
 * a real timestamp rather than a guess.
 */
export function formatTimestamp(value: string | null, locale: string): string | null {
    if (value === null) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    try {
        return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
            parsed,
        );
    } catch {
        return parsed.toISOString();
    }
}

/**
 * The words this section can be found by from the settings search.
 *
 * Values only - the title and the explanation come from `settingsCopy.ts`, which the
 * component and the search both read. Somebody who can see their login on screen and
 * types it into the search bar must land on this section, so what is on screen is what is
 * listed here.
 */
export function githubSearchValues(state: {
    readonly status: GitHubStatusReadout | null;
    readonly account: GitHubAccountReadout | null;
}): string[] {
    const values: string[] = [];
    const account = state.account ?? state.status?.account ?? null;
    if (account !== null) {
        values.push(account.login, account.source);
        if (account.name !== null) values.push(account.name);
        if (account.scopesReported) values.push(...account.scopes);
        values.push(...account.warnings);
    }
    const status = state.status;
    if (status !== null) {
        values.push(...status.requiredScopes);
        if (status.clientKind !== null) values.push(status.clientKind);
    }
    return values.filter((value) => value.trim().length > 0);
}

export function createGitHubAccount(options: GitHubAccountOptions = {}): GitHubAccountState {
    const bridge = options.bridge !== undefined ? options.bridge : resolveGitHubBridge();

    const canReadStatus = canReadGitHubStatus(bridge);
    const canDeviceSignIn = canStartDeviceSignIn(bridge);
    const canCancel = canCancelSignIn(bridge);
    const canUseToken = canSignInWithToken(bridge);
    const canEndSession = canSignOut(bridge);
    const canCopy = canWriteClipboard(bridge);
    const supported = canSignInToGitHub(bridge);

    const status = ref<GitHubStatusReadout | null>(null);
    const account = ref<GitHubAccountReadout | null>(null);
    const loading = ref(false);
    const statusFailure = ref<string | null>(null);

    const phase = ref<DeviceFlowPhase>("idle");
    const adopted = ref(false);
    const code = ref<DeviceCodeReadout | null>(null);
    const secondsRemaining = ref<number | null>(null);
    const failure = ref<GitHubFailureReadout | null>(null);

    const tokenFailure = ref<GitHubFailureReadout | null>(null);
    const tokenBusy = ref(false);

    const signingOut = ref(false);
    const signOutReport = ref<GitHubSignOutReadout | null>(null);

    const waiting = computed(() => phase.value === "starting" || phase.value === "waiting");
    const signedIn = computed(() => account.value !== null);

    function clearFlow(): void {
        code.value = null;
        secondsRemaining.value = null;
    }

    function handle(event: GitHubAuthEventReadout): void {
        switch (event.type) {
            case "code":
                // The only place a user code ever comes from. Held verbatim.
                phase.value = "waiting";
                adopted.value = false;
                failure.value = null;
                code.value = {
                    userCode: event.userCode,
                    verificationUri: event.verificationUri,
                    verificationUriComplete: event.verificationUriComplete,
                    expiresAt: event.expiresAt,
                    intervalSeconds: event.intervalSeconds,
                    browserOpened: event.browserOpened,
                };
                secondsRemaining.value = event.expiresInSeconds;
                break;
            case "waiting":
                // Only the clock moves. A `waiting` event that arrives with no code on
                // screen is not enough to draw a panel from, so it does not start one.
                if (code.value !== null) secondsRemaining.value = event.secondsRemaining;
                break;
            case "signed-in":
                // Whichever route produced it, somebody is now signed in.
                account.value = event.account;
                tokenFailure.value = null;
                signOutReport.value = null;
                if (waiting.value) {
                    phase.value = "signed-in";
                    clearFlow();
                }
                break;
            case "failed":
                // Only the browser flow's own failures paint the browser panel; a pasted
                // token that was turned down reports itself from its own call.
                if (waiting.value) {
                    failure.value = event.failure;
                    phase.value = classifyAuthFailure(event.failure.code);
                    clearFlow();
                }
                break;
            case "cancelled":
                if (waiting.value) {
                    phase.value = "cancelled";
                    failure.value = null;
                    clearFlow();
                }
                break;
            case "signed-out":
                account.value = null;
                if (phase.value === "signed-in") phase.value = "idle";
                break;
        }
    }

    const unsubscribe =
        bridge?.onGitHubAuthEvent === undefined ? () => undefined : bridge.onGitHubAuthEvent(handle);

    /** Re-reads the status without disturbing anything the event stream has said. */
    async function refreshStatus(): Promise<void> {
        const read = bridge?.githubStatus;
        if (typeof read !== "function") return;
        try {
            const answer = await read();
            status.value = answer;
            account.value = answer.account;
            statusFailure.value = null;
        } catch (error) {
            statusFailure.value = describe(error);
        }
    }

    async function load(): Promise<void> {
        const read = bridge?.githubStatus;
        if (typeof read !== "function") return;

        loading.value = true;
        try {
            const answer = await read();
            status.value = answer;
            account.value = answer.account;
            statusFailure.value = null;
            // A sign-in that was started before this surface was looking is a fact the
            // status reports, so it is shown as one. The code itself is gone - its event
            // fired before anything here subscribed - and the panel says exactly that
            // rather than drawing an empty box where a code should be.
            if (answer.signingIn && phase.value === "idle") {
                phase.value = "starting";
                adopted.value = true;
            }
        } catch (error) {
            statusFailure.value = describe(error);
        } finally {
            loading.value = false;
        }
    }

    /**
     * The backstop for a sign-in whose events said nothing.
     *
     * The call and the event stream are two routes for the same outcome and neither is
     * guaranteed to arrive first, so whichever gets here first wins and the other is left
     * alone rather than restated.
     */
    function settle(outcome: GitHubSignInOutcome): void {
        if (outcome.ok) {
            account.value = outcome.account;
            if (phase.value !== "signed-in") {
                phase.value = "signed-in";
                clearFlow();
            }
            return;
        }
        if (waiting.value) {
            failure.value = outcome.failure;
            phase.value = classifyAuthFailure(outcome.failure.code);
            clearFlow();
        }
    }

    async function startDeviceSignIn(request: { useOAuthFallback?: boolean } = {}): Promise<void> {
        const start = bridge?.githubSignIn;
        if (typeof start !== "function" || waiting.value) return;

        phase.value = "starting";
        adopted.value = false;
        failure.value = null;
        tokenFailure.value = null;
        signOutReport.value = null;
        clearFlow();

        try {
            settle(await start(request.useOAuthFallback === true ? { useOAuthFallback: true } : {}));
        } catch (error) {
            // The bridge is documented never to reject, so this is a broken bridge rather
            // than a refused sign-in, and saying so is more useful than reporting it as
            // something GitHub decided.
            failure.value = bridgeFailure(error);
            phase.value = "failed";
            clearFlow();
        }
        await refreshStatus();
    }

    async function cancelSignIn(): Promise<boolean> {
        const cancel = bridge?.githubCancelSignIn;
        if (typeof cancel !== "function") return false;
        try {
            const stopped = await cancel();
            // False means the main process had nothing waiting, so this screen's idea of
            // an in-flight sign-in was stale. Re-reading is what corrects it; asserting a
            // cancellation that never happened is what would not.
            if (!stopped) await refreshStatus();
            return stopped;
        } catch (error) {
            failure.value = bridgeFailure(error);
            phase.value = "failed";
            clearFlow();
            return false;
        }
    }

    async function signInWithToken(token: string): Promise<boolean> {
        const signIn = bridge?.githubSignInWithToken;
        if (typeof signIn !== "function" || tokenBusy.value) return false;

        tokenBusy.value = true;
        tokenFailure.value = null;
        signOutReport.value = null;
        try {
            // The pasted value goes straight across and is not held, logged or echoed
            // anywhere on the way. Nothing below this line ever names it again.
            const outcome = await signIn(token);
            if (!outcome.ok) {
                tokenFailure.value = outcome.failure;
                return false;
            }
            account.value = outcome.account;
            phase.value = "signed-in";
            clearFlow();
            return true;
        } catch (error) {
            tokenFailure.value = bridgeFailure(error);
            return false;
        } finally {
            tokenBusy.value = false;
            await refreshStatus();
        }
    }

    async function signOut(): Promise<void> {
        const end = bridge?.githubSignOut;
        if (typeof end !== "function" || signingOut.value) return;

        signingOut.value = true;
        try {
            signOutReport.value = await end();
            account.value = null;
            if (phase.value === "signed-in") phase.value = "idle";
        } catch (error) {
            statusFailure.value = describe(error);
        } finally {
            signingOut.value = false;
            await refreshStatus();
        }
    }

    async function copyUserCode(): Promise<boolean> {
        const value = code.value?.userCode;
        if (value === undefined) return false;
        try {
            const write = bridge?.writeClipboardText;
            if (typeof write === "function") {
                await write(value);
                return true;
            }
            const clipboard = globalThis.navigator?.clipboard;
            if (clipboard === undefined) return false;
            await clipboard.writeText(value);
            return true;
        } catch {
            // The code is on screen either way, which is the thing that has to be true.
            return false;
        }
    }

    function dismissOutcome(): void {
        if (waiting.value) return;
        phase.value = "idle";
        adopted.value = false;
        failure.value = null;
        clearFlow();
    }

    return {
        supported,
        canReadStatus,
        canDeviceSignIn,
        canCancel,
        canUseToken,
        canSignOut: canEndSession,
        canCopy,
        status,
        account,
        loading,
        statusFailure,
        phase,
        adopted,
        code,
        secondsRemaining,
        failure,
        tokenFailure,
        tokenBusy,
        signingOut,
        signOutReport,
        waiting,
        signedIn,
        load,
        startDeviceSignIn,
        cancelSignIn,
        signInWithToken,
        signOut,
        copyUserCode,
        dismissOutcome,
        dispose: unsubscribe,
    };
}
