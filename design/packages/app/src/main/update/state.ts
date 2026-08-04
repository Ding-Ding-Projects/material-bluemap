/**
 * What the app knows about a newer version of itself, as a value.
 *
 * A pure reducer over a small union, deliberately separated from the thing that talks to
 * Squirrel. Everything interesting about an updater is a state rule - what a failure is
 * allowed to overwrite, what a manual check may interrupt, what a restart is allowed to
 * do - and a rule that only exists inside an event handler on a live `autoUpdater` is a
 * rule nobody can test without an update server.
 *
 * ## The two rules that matter
 *
 * **A staged update survives a later failure.** Once an installer is downloaded and
 * verified, the app can install it whether or not the next scheduled check reaches the
 * server. Letting a network blip roll `ready` back to `failed` would take a working update
 * away from somebody who was about to restart into it, which is the exact opposite of what
 * a failed check means.
 *
 * **`checking` is not a status.** It is a flag laid over whatever is already known,
 * because the honest thing to show while a check runs is "you are on 0.1.0, and I am
 * looking" rather than a blank screen that has forgotten what it knew a second ago. That
 * is also what makes the ready-survives-a-check rule expressible at all.
 */

import type { UpdateFailure } from "./failure.js";

export type UpdateStatus =
    /** This build cannot update itself. {@link UpdateState.unsupportedReason} says why. */
    | "unsupported"
    /** Nothing known yet: no check has finished since the app started. */
    | "idle"
    /** A check finished and this is the newest version. */
    | "up-to-date"
    /** A newer version exists, and this build is not going to download it. */
    | "available"
    /** A newer version exists and the bytes are coming down now. */
    | "downloading"
    /** Downloaded, verified and staged. One restart away. */
    | "ready"
    /** The last check or download did not finish. {@link UpdateState.failure} says why. */
    | "failed";

export interface UpdateState {
    readonly status: UpdateStatus;
    /** True while a check is in flight, whatever the status underneath it is. */
    readonly checking: boolean;
    /** The version running right now. Never guessed, never styled by a funny level. */
    readonly currentVersion: string;
    /** The newer version, when one has been named. Null while it is merely known to exist. */
    readonly newVersion: string | null;
    /** The version staged and ready to install. Null unless `status` is `ready`. */
    readonly readyVersion: string | null;
    /** The release notes as the feed gave them, or null. Rendered, never printed raw. */
    readonly releaseNotes: string | null;
    /** Where to read the notes in full. Always https; the shell refuses anything else. */
    readonly releaseNotesUrl: string | null;
    /** The last thing that went wrong, kept even when `status` is `ready`. */
    readonly failure: UpdateFailure | null;
    /** ISO-8601 with offset. Null until a check has finished one way or the other. */
    readonly lastCheckedAt: string | null;
    /** True when the user pressed Check for updates rather than the schedule firing. */
    readonly lastCheckWasManual: boolean;
    /** Why this build cannot update itself. Null unless `status` is `unsupported`. */
    readonly unsupportedReason: string | null;
    /**
     * True while a render is running.
     *
     * Carried in the state rather than asked for at restart time so the banner can say, in
     * advance, that Restart is being held - a button that silently refuses when pressed is
     * indistinguishable from a button that is broken.
     */
    readonly renderInProgress: boolean;
    /** Where updates are fetched from. The credential is never part of this. */
    readonly feedUrl: string | null;
}

export type UpdateEvent =
    | { readonly type: "unsupported"; readonly reason: string }
    | { readonly type: "feed"; readonly url: string }
    | { readonly type: "check-started"; readonly manual: boolean }
    | { readonly type: "up-to-date"; readonly at: string }
    /** A newer version exists and the engine has begun fetching it. */
    | { readonly type: "downloading"; readonly version: string | null }
    /** A newer version exists and nothing here is going to fetch it. */
    | { readonly type: "available"; readonly version: string | null; readonly notesUrl: string | null }
    | {
          readonly type: "downloaded";
          readonly version: string;
          readonly notes: string | null;
          readonly notesUrl: string | null;
          readonly at: string;
      }
    | { readonly type: "failed"; readonly failure: UpdateFailure; readonly at: string }
    | { readonly type: "render-activity"; readonly active: boolean };

export function initialUpdateState(currentVersion: string): UpdateState {
    return {
        status: "idle",
        checking: false,
        currentVersion,
        newVersion: null,
        readyVersion: null,
        releaseNotes: null,
        releaseNotesUrl: null,
        failure: null,
        lastCheckedAt: null,
        lastCheckWasManual: false,
        unsupportedReason: null,
        renderInProgress: false,
        feedUrl: null,
    };
}

/** True once an installer is staged and only a restart stands between here and it. */
export function isReady(state: UpdateState): boolean {
    return state.status === "ready" && state.readyVersion !== null;
}

/**
 * The next state.
 *
 * Total: every event is handled for every status, and nothing here throws. An updater
 * whose reducer can throw is an updater that can wedge the whole subsystem on a stray
 * event from a library nobody controls.
 */
export function reduceUpdate(state: UpdateState, event: UpdateEvent): UpdateState {
    switch (event.type) {
        case "unsupported":
            // Terminal. Nothing this build does afterwards can make it updatable, and a
            // later event arriving anyway must not overwrite the explanation.
            return {
                ...state,
                status: "unsupported",
                checking: false,
                unsupportedReason: event.reason,
            };

        case "feed":
            return state.status === "unsupported" ? state : { ...state, feedUrl: event.url };

        case "check-started":
            if (state.status === "unsupported") return state;
            return { ...state, checking: true, lastCheckWasManual: event.manual };

        case "up-to-date":
            if (state.status === "unsupported") return state;
            // A staged update is not undone by a server that has since forgotten about it.
            // The bytes are already on this machine and they still install.
            if (isReady(state)) {
                return { ...state, checking: false, lastCheckedAt: event.at };
            }
            return {
                ...state,
                status: "up-to-date",
                checking: false,
                newVersion: null,
                failure: null,
                lastCheckedAt: event.at,
            };

        case "downloading":
            if (state.status === "unsupported") return state;
            if (isReady(state)) return { ...state, checking: false };
            return {
                ...state,
                status: "downloading",
                checking: false,
                newVersion: event.version,
                failure: null,
            };

        case "available":
            if (state.status === "unsupported" && state.unsupportedReason !== null) {
                // Worth saying even here: an unpackaged build still benefits from being
                // told a release exists, as long as it does not pretend it can install it.
                return {
                    ...state,
                    checking: false,
                    newVersion: event.version,
                    releaseNotesUrl: event.notesUrl,
                };
            }
            if (isReady(state)) return { ...state, checking: false };
            return {
                ...state,
                status: "available",
                checking: false,
                newVersion: event.version,
                releaseNotesUrl: event.notesUrl,
                failure: null,
            };

        case "downloaded":
            if (state.status === "unsupported") return state;
            return {
                ...state,
                status: "ready",
                checking: false,
                newVersion: event.version,
                readyVersion: event.version,
                releaseNotes: event.notes,
                releaseNotesUrl: event.notesUrl,
                failure: null,
                lastCheckedAt: event.at,
            };

        case "failed":
            if (state.status === "unsupported") return state;
            // Recorded, never promoted over a staged update. The banner shows both: the
            // update is still installable and the last check still failed, and hiding
            // either one is a lie in a different direction.
            if (isReady(state)) {
                return { ...state, checking: false, failure: event.failure, lastCheckedAt: event.at };
            }
            return {
                ...state,
                status: "failed",
                checking: false,
                failure: event.failure,
                lastCheckedAt: event.at,
            };

        case "render-activity":
            return { ...state, renderInProgress: event.active };
    }
}
