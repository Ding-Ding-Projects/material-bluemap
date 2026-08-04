/**
 * The seam between the update banner and the main process.
 *
 * Every type here is a structural mirror of the one the Electron preload exposes on
 * `window.materialBluemap`, restated rather than imported for the same reason
 * `backupBridge.ts` restates its own: this package compiles and runs in three places and
 * only one of them has a preload.
 *
 * Nothing here invents a capability. {@link resolveUpdateBridge} returns `null` when the
 * two methods an update surface cannot exist without are missing, and the rest are probed
 * one at a time and reported as flags. A missing `restartToInstallUpdate` in particular is
 * survivable and must not be hidden: a Restart button that throws when pressed is far worse
 * than a banner that says this build cannot install the update it found.
 *
 * ## No credential crosses this
 *
 * `feedUrl` is the address updates come from and nothing else. The main process builds it
 * through `describeFeed`, which exists precisely so the interface can say where updates come
 * from without being told how the app authenticates to the server.
 */

export type UpdateStatus =
    | "unsupported"
    | "idle"
    | "up-to-date"
    | "available"
    | "downloading"
    | "ready"
    | "failed";

export type UpdateFailureCode =
    | "offline"
    | "feed-unavailable"
    | "invalid-signature"
    | "corrupt-asset"
    | "not-installed"
    | "staging-failed"
    | "unknown";

export interface UpdateFailure {
    readonly code: UpdateFailureCode;
    /** One sentence, already written for a person. */
    readonly message: string;
    /** The updater's own words, for a disclosure. Null when there were none. */
    readonly detail: string | null;
    readonly retryable: boolean;
}

/** Mirrors `UpdateState` in `main/update/state.ts`, field for field. */
export interface UpdateState {
    readonly status: UpdateStatus;
    readonly checking: boolean;
    readonly currentVersion: string;
    readonly newVersion: string | null;
    readonly readyVersion: string | null;
    readonly releaseNotes: string | null;
    readonly releaseNotesUrl: string | null;
    readonly failure: UpdateFailure | null;
    readonly lastCheckedAt: string | null;
    readonly lastCheckWasManual: boolean;
    readonly unsupportedReason: string | null;
    readonly renderInProgress: boolean;
    readonly feedUrl: string | null;
}

export type UpdateRestartRefusal = "nothing-ready" | "render-in-progress" | "unsupported" | "failed";

export type UpdateRestartResult =
    | { readonly ok: true; readonly version: string }
    | { readonly ok: false; readonly code: UpdateRestartRefusal; readonly message: string };

export interface UpdateBridge {
    state(): Promise<UpdateState>;
    /** Asks now. The answer arrives on {@link UpdateBridge.onUpdateEvent}, not from this. */
    check(): Promise<UpdateState>;
    /** Never rejects: a refusal comes back `ok: false` with a code and a sentence. */
    restart(): Promise<UpdateRestartResult>;
    onUpdateEvent(listener: (state: UpdateState) => void): () => void;
    /** False when this build can report an update but not install one. */
    readonly canRestart: boolean;
    /** False when this build has no manual Check for updates. */
    readonly canCheck: boolean;
}

/** The shape a preload is probed against, one method at a time. */
type Host = Partial<{
    updateState: () => Promise<UpdateState>;
    checkForUpdates: () => Promise<UpdateState>;
    restartToInstallUpdate: () => Promise<UpdateRestartResult>;
    onUpdateEvent: (listener: (state: UpdateState) => void) => () => void;
}>;

function isFunction(value: unknown): value is (...args: never[]) => unknown {
    return typeof value === "function";
}

/**
 * The bridge, or `null` when this build has no updater to talk to at all.
 *
 * All or nothing for the two an update surface cannot exist without: reading the state, and
 * hearing when it changes. A bridge with `updateState` and no `onUpdateEvent` would have to
 * poll, and a banner that polls is either stale or a timer nobody asked for - the whole
 * point of a "ready to install" banner is that it appears the moment the download finishes,
 * without the user doing anything.
 */
export function resolveUpdateBridge(): UpdateBridge | null {
    const host = (globalThis as { materialBluemap?: Host }).materialBluemap;
    if (host === undefined) return null;

    const { updateState, onUpdateEvent } = host;
    if (!isFunction(updateState) || !isFunction(onUpdateEvent)) return null;

    const canRestart = isFunction(host.restartToInstallUpdate);
    const canCheck = isFunction(host.checkForUpdates);

    return {
        state: () => updateState(),
        onUpdateEvent: (listener) => onUpdateEvent(listener),
        // Falls back to reading the state rather than rejecting: "this build has no manual
        // check" and "the check found nothing" both leave the same screen, and `canCheck`
        // is what says which of the two it is.
        check: () => (isFunction(host.checkForUpdates) ? host.checkForUpdates() : updateState()),
        restart: () =>
            isFunction(host.restartToInstallUpdate)
                ? host.restartToInstallUpdate()
                : Promise.resolve({
                      ok: false,
                      code: "unsupported",
                      message:
                          "This build cannot install an update by itself. Download the new version from the " +
                          "project's releases page and run the installer.",
                  }),
        canRestart,
        canCheck,
    };
}
