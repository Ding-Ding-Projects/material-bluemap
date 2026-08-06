/**
 * The seam between the `gh` command-line tool's own account surface and the main process.
 *
 * A file of its own, deliberately separate from `githubBridge.ts` next door, for the same
 * reason the two account stores are never merged in the interface: `gh` keeps its own
 * credential store, shared by every terminal, script and other tool on this machine, and it
 * is not this application's own multi-account store `githubBridge.ts` already describes.
 * Reusing that file's `GitHubBridge` type for these two methods would make it look, from a
 * type signature alone, like one list - which is exactly the impression every surface using
 * this module has to avoid giving.
 *
 * Every type here is a structural mirror of what the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported, for the same reason
 * `githubBridge.ts` restates its own slice: this package compiles and runs in three places
 * (the desktop app, a browser tab, and under Vitest) and only the first of them has a
 * preload.
 *
 * **No token ever appears in any of these shapes.** `gh` holds its own credential in its
 * own store; this surface only ever learns account logins, hosts and scopes.
 */

/** One account `gh` itself has stored on this computer - never one of this application's own. */
export interface GhCliAccountReadout {
    readonly login: string;
    readonly host: string;
    /** True for the one account `gh` would use on this host right now. */
    readonly active: boolean;
    readonly scopes: readonly string[];
    /** False when `gh` reported no scope text at all for this account (a fine-grained token). */
    readonly scopesReported: boolean;
    readonly tokenSource: string | null;
    readonly gitProtocol: string | null;
    /** True unless `gh`'s own per-account auth check reported something other than success. */
    readonly healthy: boolean;
    readonly stateDetail: string | null;
    /** From this application's own scopes of interest (`repo`, `workflow`), the ones missing. */
    readonly missingAppScopes: readonly string[];
}

export type GhCliAvailabilityReadout = "not-installed" | "no-accounts" | "ready" | "unrecognised";

export interface GhCliAccountsStatusReadout {
    readonly availability: GhCliAvailabilityReadout;
    readonly version: string | null;
    readonly accounts: readonly GhCliAccountReadout[];
    readonly source: "json" | "text" | null;
    readonly message: string;
}

/**
 * What switching `gh`'s active account actually did.
 *
 * `ok: true` is reported only after the main process re-read the account list and confirmed
 * the switch genuinely took - never from `gh`'s own exit code alone. `message` always names
 * the machine-wide consequence on success.
 */
export interface GhCliSwitchReadout {
    readonly ok: boolean;
    readonly account: GhCliAccountReadout | null;
    readonly message: string;
}

/**
 * The preload's `gh` CLI namespace, both methods optional and feature-detected one at a
 * time, exactly as `GitHubBridge` treats its own methods: a released shell can load a newer
 * renderer than the one it was built beside.
 */
export interface GhCliBridge {
    ghCliListAccounts?: () => Promise<GhCliAccountsStatusReadout>;
    ghCliSwitchAccount?: (host: string, login: string) => Promise<GhCliSwitchReadout>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/** The preload, or null when there is none. */
export function resolveGhCliBridge(): GhCliBridge | null {
    const host = (globalThis as { materialBluemap?: GhCliBridge }).materialBluemap;
    return host ?? null;
}

/** True when this build can list gh's own accounts at all. */
export function canListGhCliAccounts(bridge: GhCliBridge | null): boolean {
    return isFunction(bridge?.ghCliListAccounts);
}

/** True when this build can switch gh's own active account. */
export function canSwitchGhCliAccount(bridge: GhCliBridge | null): boolean {
    return isFunction(bridge?.ghCliSwitchAccount);
}
