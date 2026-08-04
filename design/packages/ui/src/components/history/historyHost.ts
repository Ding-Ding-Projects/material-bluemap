/**
 * The seam between the history panel and whatever can actually run git.
 *
 * Written to the same shape as `../config/configHost.ts`, and for the same reasons. The
 * panel has to work in three places with three different amounts of privilege:
 *
 *   - inside the Electron shell, where the preload bridge can reach a real repository;
 *   - inside a plain browser tab (`pnpm --filter ui dev`), where it cannot;
 *   - inside vitest, where a fake host makes the whole panel testable with no git and no
 *     file system anywhere near it.
 *
 * A missing host is a stated fact, never a disabled-looking button that silently does
 * nothing. {@link useHistoryHost} returns `null` when nothing is wired up, and the panel
 * says what is missing.
 *
 * ## Why every method is probed one at a time
 *
 * {@link historyHostFromBridge} checks for each function separately and refuses a partial
 * answer. That looks paranoid until you remember that a released desktop shell can load a
 * newer renderer than the one it was built beside: a panel that assumed the whole
 * namespace was present would render a Restore button that throws when pressed, which is
 * far worse than a panel that says this build keeps no history.
 *
 * ## Nothing here rejects
 *
 * Every method resolves with a value, failures included. That is inherited from the main
 * process on purpose - see `main/history/ipc.ts` - and it is what lets the config editor
 * call {@link HistoryHost.snapshot} after a save without wrapping it in anything: the worst
 * a broken history can do to a save is return `{ ok: false }` into a value nobody has to
 * act on.
 */

import { inject, provide, type InjectionKey } from "vue";

/** How one file changed between two revisions. */
export type HistoryChangeStatus = "added" | "modified" | "deleted";

export interface HistoryFileChange {
    /** Relative to the config folder, forward slashes, e.g. `maps/nether.conf`. */
    readonly path: string;
    readonly status: HistoryChangeStatus;
}

/**
 * The grouping word a revision carries.
 *
 * Declared as a plain `string` on {@link HistoryRevision} rather than as this union, and
 * that is deliberate: the panel's action filter is built from the words the revisions in
 * front of it actually use, so a word the main process starts emitting tomorrow appears in
 * the filter with no change here. This type exists to document the ones known today and to
 * give {@link ACTION_ORDER} something to sort by, not to constrain what may arrive.
 */
export type KnownHistoryAction =
    | "started"
    | "created"
    | "changed"
    | "deleted"
    | "mixed"
    | "restored"
    | "pruned";

/** The order actions are offered in, when they are ones this build knows about. */
export const ACTION_ORDER: readonly string[] = [
    "started",
    "created",
    "changed",
    "deleted",
    "mixed",
    "restored",
    "pruned",
];

export interface HistoryRevision {
    readonly id: string;
    readonly shortId: string;
    /** ISO 8601. */
    readonly at: string;
    /** Always names what changed, e.g. `Deleted the nether map`. Never `Updated`. */
    readonly label: string;
    /** Not narrowed to a union. See {@link KnownHistoryAction}. */
    readonly action: string;
    readonly changes: readonly HistoryFileChange[];
    /** The user's own label for this revision, or null. */
    readonly note: string | null;
    /** Set on a restore: the revision whose contents were written back. */
    readonly restoredFrom: string | null;
}

export interface HistoryStatus {
    readonly available: boolean;
    readonly version: string | null;
    /** One sentence for the user when `available` is false. Null when it is true. */
    readonly reason: string | null;
    /** Where histories are kept, beside the app's own data and never in a user's folder. */
    readonly root: string;
}

export interface HistoryListing {
    readonly available: boolean;
    readonly reason: string | null;
    readonly folder: string;
    readonly repository: string;
    readonly revisions: readonly HistoryRevision[];
    /** Expected to be empty. Read so the panel can show that rather than promise it. */
    readonly remotes: readonly string[];
}

export type HistoryWrite =
    | { readonly ok: true; readonly revision: HistoryRevision | null; readonly message: string }
    | { readonly ok: false; readonly message: string };

export interface HistorySkippedFile {
    readonly path: string;
    readonly reason: string;
}

export type HistoryRestoreResult =
    | {
          readonly ok: true;
          readonly revision: HistoryRevision | null;
          readonly message: string;
          readonly skipped: readonly HistorySkippedFile[];
      }
    | { readonly ok: false; readonly message: string };

export interface HistoryRevisionFile {
    readonly path: string;
    readonly text: string;
}

export interface HistoryDiffFile {
    readonly path: string;
    readonly status: HistoryChangeStatus;
    /** A unified diff, exactly as git wrote it. */
    readonly patch: string;
}

export type HistoryFilesResult =
    | { readonly ok: true; readonly files: readonly HistoryRevisionFile[] }
    | { readonly ok: false; readonly message: string };

export type HistoryDiffResult =
    | { readonly ok: true; readonly files: readonly HistoryDiffFile[] }
    | { readonly ok: false; readonly message: string };

/** Everything the history panel asks of its environment. */
export interface HistoryHost {
    /** Named in the interface when a capability is missing, e.g. `Electron shell`. */
    readonly name: string;

    status(): Promise<HistoryStatus>;
    list(folder: string, limit?: number): Promise<HistoryListing>;
    snapshot(folder: string): Promise<HistoryWrite>;
    revisionFiles(folder: string, id: string): Promise<HistoryFilesResult>;
    diff(folder: string, id: string): Promise<HistoryDiffResult>;
    restore(folder: string, id: string): Promise<HistoryRestoreResult>;
    label(folder: string, id: string, label: string): Promise<HistoryWrite>;
    /**
     * Keeps the newest `keep` revisions and removes the rest. **Destructive.**
     *
     * The only call on this host that takes anything away, and the reason the panel puts a
     * two-key gate in front of it. Everything else here only ever adds a revision.
     */
    discardOlderRevisions(folder: string, keep: number): Promise<HistoryWrite>;
}

/**
 * The shape the preload bridge is expected to expose.
 *
 * Declared here rather than relied on from `bridge.d.ts` so the panel compiles against a
 * shell that has not grown these methods yet, and degrades to "no host" at runtime instead
 * of failing to build.
 */
interface BridgeHistoryApi {
    status(): Promise<HistoryStatus>;
    list(folder: string, limit?: number): Promise<HistoryListing>;
    snapshot(folder: string): Promise<HistoryWrite>;
    revisionFiles(folder: string, id: string): Promise<HistoryFilesResult>;
    diff(folder: string, id: string): Promise<HistoryDiffResult>;
    restore(folder: string, id: string): Promise<HistoryRestoreResult>;
    label(folder: string, id: string, label: string): Promise<HistoryWrite>;
    discardOlderRevisions(folder: string, keep: number): Promise<HistoryWrite>;
}

/** Every method the panel needs, named once so the probe below cannot drift from it. */
const REQUIRED: readonly (keyof BridgeHistoryApi)[] = [
    "status",
    "list",
    "snapshot",
    "revisionFiles",
    "diff",
    "restore",
    "label",
    "discardOlderRevisions",
];

/**
 * A host from the desktop shell's bridge, or null when this build has no history layer.
 *
 * All or nothing. A bridge carrying six of the eight methods is a bridge from a shell that
 * predates two of them, and a panel that used the six would present controls for the other
 * two that fail at the moment they are pressed.
 */
export function historyHostFromBridge(bridge: unknown): HistoryHost | null {
    if (typeof bridge !== "object" || bridge === null) return null;
    const api = (bridge as { history?: unknown }).history;
    if (typeof api !== "object" || api === null) return null;

    const candidate = api as Partial<Record<keyof BridgeHistoryApi, unknown>>;
    for (const method of REQUIRED) {
        if (typeof candidate[method] !== "function") return null;
    }
    const ready = api as BridgeHistoryApi;

    return {
        name: "Electron shell",
        status: () => ready.status(),
        list: (folder, limit) => ready.list(folder, limit),
        snapshot: (folder) => ready.snapshot(folder),
        revisionFiles: (folder, id) => ready.revisionFiles(folder, id),
        diff: (folder, id) => ready.diff(folder, id),
        restore: (folder, id) => ready.restore(folder, id),
        label: (folder, id, text) => ready.label(folder, id, text),
        discardOlderRevisions: (folder, keep) => ready.discardOlderRevisions(folder, keep),
    };
}

const HISTORY_HOST = Symbol("history-host") as InjectionKey<HistoryHost | null>;

/** Puts a host in reach of every history surface below this component. */
export function provideHistoryHost(host: HistoryHost | null): void {
    provide(HISTORY_HOST, host);
}

/**
 * The host, or null when nothing is wired up.
 *
 * Falls back to the window bridge so the panel works when it is mounted without an
 * explicit provider, which is how it is used inside the desktop shell.
 */
export function useHistoryHost(): HistoryHost | null {
    const provided = inject(HISTORY_HOST, undefined);
    if (provided !== undefined) return provided;
    return historyHostFromBridge(typeof window === "undefined" ? null : window.materialBluemap);
}
