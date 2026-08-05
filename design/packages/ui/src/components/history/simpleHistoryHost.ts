/**
 * The narrow host `SimpleHistoryList.vue` needs: list and restore, nothing else.
 *
 * `historyHost.ts`'s {@link HistoryHost} is built for a config folder's history, which
 * offers eight methods and is all-or-nothing about every one of them. The profile list's
 * and the application settings' own histories are not that: `main/profiles/ipc.ts` and
 * `main/settings/ipc.ts` register only `read`, `save`, `list` and `restore` -
 * `docs/config-history.md` names diffing, labelling and discarding older revisions as
 * config-folder history's own extras that were never built for these two. A browser bound
 * to {@link HistoryHost} would therefore either refuse to mount at all (missing six of
 * eight required methods) or offer buttons for a diff, a label and a discard that throw
 * the moment they are pressed. This is the host shaped for what is genuinely there.
 */

import type { HistoryRestoreResult, HistoryRevision } from "./historyHost.js";

/** What `list()` answers with. Structurally identical for the profile list and the settings. */
export interface SimpleHistoryListing {
    readonly available: boolean;
    /** Why there is no history, when there is none. Null when `available`. */
    readonly reason: string | null;
    /** Where the repository is, shown so a person can see it is not `localStorage`. */
    readonly repository: string;
    readonly revisions: readonly HistoryRevision[];
    /** Expected to be empty. Read so the panel can show that rather than promise it. */
    readonly remotes: readonly string[];
}

/** Everything `SimpleHistoryList.vue` asks of its environment. */
export interface SimpleHistoryHost {
    list(limit?: number): Promise<SimpleHistoryListing>;
    restore(id: string): Promise<HistoryRestoreResult>;
}

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * A host from one namespace of the desktop shell's bridge, or null when this build has
 * neither method.
 *
 * All or nothing, for the same reason {@link historyHostFromBridge} is: a host with `list`
 * and no `restore` would draw a Restore button that throws the moment it is pressed.
 */
export function simpleHistoryHostFrom(
    bridge: unknown,
    namespace: "profilesHistory" | "appSettingsHistory",
): SimpleHistoryHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as Record<string, unknown>)[namespace];
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<Record<"list" | "restore", unknown>>;
    if (!isFunction(candidate.list) || !isFunction(candidate.restore)) return null;

    const ready = api as {
        list(limit?: number): Promise<SimpleHistoryListing>;
        restore(id: string): Promise<HistoryRestoreResult>;
    };
    return {
        list: (limit) => ready.list(limit),
        restore: (id) => ready.restore(id),
    };
}

/**
 * The bridge's `save` for one namespace, when this build has it - probed the same way
 * {@link simpleHistoryHostFrom} probes `list`/`restore`, but kept separate rather than
 * folded into {@link SimpleHistoryHost}: a mutation site calling `save` has no host object
 * of its own to hold onto and no history *panel* to mount, only a single fire-and-forget
 * call to make from a `watch()` callback every time the state it owns changes.
 *
 * Returns null rather than a function that would reject, so every caller's own
 * fire-and-forget wrapper stays a plain `if (save === null) return;` with nothing to catch.
 */
export function simpleHistorySaveFn(
    bridge: unknown,
    namespace: "profilesHistory" | "appSettingsHistory",
): ((state: unknown) => Promise<unknown>) | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as Record<string, unknown>)[namespace];
    if (typeof api !== "object" || api === null) return null;

    const save = (api as Record<string, unknown>)["save"];
    if (!isFunction(save)) return null;

    const ready = save as (state: unknown) => Promise<unknown>;
    return (state) => ready(state);
}

/**
 * The bridge's `read` for one namespace, when this build has it. Same shape and reason as
 * {@link simpleHistorySaveFn} - a live-state read has nowhere to hold a host either, and
 * {@link SimpleHistoryHost} has no `read` of its own because the history *panel* never
 * needs the live state, only the list of revisions behind it.
 */
export function simpleHistoryReadFn(
    bridge: unknown,
    namespace: "profilesHistory" | "appSettingsHistory",
): (() => Promise<unknown>) | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as Record<string, unknown>)[namespace];
    if (typeof api !== "object" || api === null) return null;

    const read = (api as Record<string, unknown>)["read"];
    if (!isFunction(read)) return null;

    const ready = read as () => Promise<unknown>;
    return () => ready();
}
