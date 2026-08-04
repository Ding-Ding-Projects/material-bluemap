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

/**
 * One file at both ends of a comparison, whole.
 *
 * The whole text is what turns a patch into a sentence. `-sky-color: "#7dabff"` next to
 * `+sky-color: "#ffffff"` is two lines a reader has to diff in their head to learn one fact;
 * `sky-color: #7dabff to #ffffff` is the fact. Producing the second needs both files
 * entire, because a setting's value can be spread over lines a patch never carries.
 *
 * Either side is null when the file was not there on that side, which is a different thing
 * from being empty and is reported as a different thing.
 */
export interface HistoryComparisonFile extends HistoryDiffFile {
    readonly before: string | null;
    readonly after: string | null;
    /**
     * Why a side is null despite the file existing there - too large, or not text. Null when
     * nothing was held back. Stated rather than silent, so a file the panel usually explains
     * falling back to a raw patch reads as a reason rather than as a bug.
     */
    readonly withheld: string | null;
}

export type HistoryFilesResult =
    | { readonly ok: true; readonly files: readonly HistoryRevisionFile[] }
    | { readonly ok: false; readonly message: string };

export type HistoryDiffResult =
    | { readonly ok: true; readonly files: readonly HistoryDiffFile[] }
    | { readonly ok: false; readonly message: string };

export type HistoryCompareResult =
    | {
          readonly ok: true;
          /** The older end, echoed back so the panel cannot label the comparison backwards. */
          readonly from: string | null;
          readonly to: string;
          readonly files: readonly HistoryComparisonFile[];
      }
    | { readonly ok: false; readonly message: string };

/** One file's merged text, on its way back to disk as part of a setting-level restore. */
export interface HistoryMergedFile {
    readonly path: string;
    readonly text: string;
}

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

    /*
     * The three below are optional, and that is a deliberate difference from everything
     * above.
     *
     * The methods above are all-or-nothing: a bridge missing any of them yields no host at
     * all, because a panel that presented a Restore button it could not honour would be
     * worse than one that said this build keeps no history. These three are additions to a
     * shipped feature, so the same reasoning points the other way. A desktop shell built
     * before them still keeps a perfectly good history, and refusing the whole panel because
     * it cannot compare two revisions would take away the eight things it can do to punish
     * it for the three it cannot.
     *
     * So they are probed one at a time and the panel offers each control only when its
     * method is really there. Absent is a stated fact next to the control, never a button
     * that throws.
     */

    /**
     * What changed between two revisions, with both sides' text so the panel can name the
     * setting rather than the line. A null `from` means "whatever came before `to`".
     */
    compare?(folder: string, from: string | null, to: string): Promise<HistoryCompareResult>;

    /** Puts back only the named files of a revision, recorded as a new revision. */
    restoreFiles?(folder: string, id: string, paths: readonly string[]): Promise<HistoryRestoreResult>;

    /**
     * Puts back individual settings, by handing the main process files this editor merged.
     *
     * The merge happens here because the HOCON reader and writer that round-trip comments and
     * formatting live in `@material-bluemap/config`, which is the editor's, not the main
     * process's. The main process still checks that the revision exists, that every path is
     * one it would write anyway, and that the file is one that revision or the folder holds -
     * and it still snapshots first and records the result as a new revision.
     */
    restoreSettings?(
        folder: string,
        id: string,
        files: readonly HistoryMergedFile[],
        keys: readonly string[],
    ): Promise<HistoryRestoreResult>;
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
    compare?(folder: string, from: string | null, to: string): Promise<HistoryCompareResult>;
    restoreFiles?(folder: string, id: string, paths: readonly string[]): Promise<HistoryRestoreResult>;
    restoreSettings?(
        folder: string,
        id: string,
        files: readonly HistoryMergedFile[],
        keys: readonly string[],
    ): Promise<HistoryRestoreResult>;
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

        // Spread rather than assigned, because `exactOptionalPropertyTypes` makes
        // `compare: undefined` a different thing from an absent `compare`, and the panel
        // asks the second question - "is this method here?" - not the first.
        ...(typeof ready.compare === "function"
            ? { compare: (folder: string, from: string | null, to: string) => ready.compare?.(folder, from, to) as Promise<HistoryCompareResult> }
            : {}),
        ...(typeof ready.restoreFiles === "function"
            ? {
                  restoreFiles: (folder: string, id: string, paths: readonly string[]) =>
                      ready.restoreFiles?.(folder, id, paths) as Promise<HistoryRestoreResult>,
              }
            : {}),
        ...(typeof ready.restoreSettings === "function"
            ? {
                  restoreSettings: (
                      folder: string,
                      id: string,
                      files: readonly HistoryMergedFile[],
                      keys: readonly string[],
                  ) => ready.restoreSettings?.(folder, id, files, keys) as Promise<HistoryRestoreResult>,
              }
            : {}),
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
