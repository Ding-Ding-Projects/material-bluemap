/**
 * What the update surfaces show, as a value.
 *
 * Pure functions over an {@link UpdateState}, so every rule about when the banner appears,
 * when Restart is reachable and what tone a state carries can be tested without mounting a
 * component or running an updater. The components below are then only markup.
 *
 * ## Why the banner is the ready state and (almost) nothing else
 *
 * A persistent banner is a standing claim on the top of the window, and the project's own
 * rules say plainly that anything which only *informs* is a non-blocking notification
 * rather than a fixture. "There is nothing new" and "the check failed, it will try again"
 * inform; they belong in the notification corner and the settings row.
 *
 * "An update is downloaded and one restart away" is different: it is an offer the user has
 * to be able to take at a moment of their choosing, possibly hours later, and a toast that
 * auto-dismisses would take it away while they were mid-render. So that one persists - and
 * because it persists, it is dismissible, and because it is dismissible it has to be
 * reachable again, which is what {@link dismissUpdate} and the settings row are for.
 */

import { setupStorage } from "../setup/setupPrefs.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import type { UpdateCopyKey } from "./updateCopy.js";
import type { UpdateState, UpdateStatus } from "./updateBridge.js";

/** Where a dismissed version is remembered, so a restart does not resurrect the banner. */
const DISMISSED_KEY = "worldlens.update.dismissed";

/** The version whose banner the user put away, or null. */
export function readDismissedUpdate(): string | null {
    const raw = setupStorage().read(DISMISSED_KEY);
    return raw !== null && raw.trim() !== "" ? raw : null;
}

/**
 * Records that this version's banner was dismissed.
 *
 * Per *version*, never a blanket "do not show update banners": the next release has to be
 * able to announce itself, and a setting that silently suppressed every future update would
 * be a setting that stops the app being updated at all.
 */
export function dismissUpdate(version: string): void {
    setupStorage().write(DISMISSED_KEY, version);
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // write above - see `appSettingsHistorySync.ts`'s own doc comment.
    recordAppSetting("updateDismissed", version);
}

/** Brings the banner back, which is what the settings row's action does. */
export function clearDismissedUpdate(): void {
    setupStorage().remove(DISMISSED_KEY);
}

/* -------------------------------------------------------------------------- */
/* The banner                                                                 */
/* -------------------------------------------------------------------------- */

export type UpdateTone = "info" | "success" | "warning" | "error";

export interface UpdateBannerModel {
    readonly visible: boolean;
    readonly tone: UpdateTone;
    readonly titleKey: UpdateCopyKey;
    readonly bodyKey: UpdateCopyKey;
    /** Interpolated into the copy after the level has chosen it, so it cannot be styled. */
    readonly vars: Readonly<Record<string, string>>;
    /** False while a render is running: pressing it would be refused anyway. */
    readonly canRestart: boolean;
    /** The https release-notes address, or null when the feed gave none. */
    readonly notesUrl: string | null;
    /** The notes themselves, when the feed carried them. Rendered, never printed raw. */
    readonly notes: string | null;
}

const HIDDEN: UpdateBannerModel = {
    visible: false,
    tone: "info",
    titleKey: "update.banner.readyTitle",
    bodyKey: "update.banner.readyBody",
    vars: {},
    canRestart: false,
    notesUrl: null,
    notes: null,
};

/**
 * The banner for a state, or a hidden one.
 *
 * `canRestart` follows the render guard so the button is visibly held rather than silently
 * refusing when pressed - the main process refuses either way, and a control that looks
 * live and does nothing is indistinguishable from a broken one.
 */
export function bannerFor(
    state: UpdateState,
    options: { readonly dismissedVersion?: string | null; readonly canRestart?: boolean } = {},
): UpdateBannerModel {
    const version = state.readyVersion;
    if (state.status !== "ready" || version === null) return HIDDEN;

    const dismissed = options.dismissedVersion ?? null;
    if (dismissed === version) return HIDDEN;

    const held = state.renderInProgress;
    return {
        visible: true,
        tone: held ? "warning" : "success",
        titleKey: "update.banner.readyTitle",
        bodyKey: held ? "update.banner.heldBody" : "update.banner.readyBody",
        vars: { version },
        canRestart: !held && (options.canRestart ?? true),
        notesUrl: state.releaseNotesUrl,
        notes: state.releaseNotes,
    };
}

/* -------------------------------------------------------------------------- */
/* The settings row                                                           */
/* -------------------------------------------------------------------------- */

export interface UpdateStatusModel {
    /** The visible state, in one word the row can also key an icon off. */
    readonly status: UpdateStatus | "checking";
    readonly tone: UpdateTone;
    readonly messageKey: UpdateCopyKey;
    readonly vars: Readonly<Record<string, string>>;
    /** The failure's own sentence, which is already written for a person. */
    readonly failureMessage: string | null;
    /** The updater's own words, for a disclosure. Never the whole message. */
    readonly failureDetail: string | null;
    /** Why this build cannot update itself, when it cannot. */
    readonly unsupportedReason: string | null;
    /** False while a check is already running, so the button cannot start a second. */
    readonly canCheck: boolean;
    /** True when there is a staged update the row should offer to install. */
    readonly canRestart: boolean;
}

/**
 * The whole of what the settings row shows.
 *
 * `checking` wins over the status underneath it only for the *word*: the failure, the
 * versions and the staged update all stay visible, because a check in flight is not a
 * reason to forget what was already known.
 */
export function statusFor(
    state: UpdateState,
    options: { readonly canCheck?: boolean; readonly canRestart?: boolean } = {},
): UpdateStatusModel {
    const staged = state.status === "ready" && state.readyVersion !== null;
    const base = {
        failureMessage: state.failure?.message ?? null,
        failureDetail: state.failure?.detail ?? null,
        unsupportedReason: state.unsupportedReason,
        canCheck: (options.canCheck ?? true) && !state.checking && state.status !== "unsupported",
        canRestart: staged && !state.renderInProgress && (options.canRestart ?? true),
    };

    if (state.checking) {
        return { ...base, status: "checking", tone: "info", messageKey: "update.status.checking", vars: {} };
    }

    switch (state.status) {
        case "unsupported":
            return {
                ...base,
                status: "unsupported",
                tone: "info",
                messageKey: state.newVersion === null ? "update.status.unsupported" : "update.status.available",
                vars: state.newVersion === null ? {} : { version: state.newVersion },
            };
        case "up-to-date":
            return { ...base, status: "up-to-date", tone: "success", messageKey: "update.status.upToDate", vars: {} };
        case "available":
            return {
                ...base,
                status: "available",
                tone: "info",
                messageKey: "update.status.available",
                vars: { version: state.newVersion ?? "" },
            };
        case "downloading":
            return {
                ...base,
                status: "downloading",
                tone: "info",
                messageKey: "update.status.downloading",
                vars: {},
            };
        case "ready":
            return {
                ...base,
                status: "ready",
                tone: state.renderInProgress ? "warning" : "success",
                messageKey: state.renderInProgress ? "update.banner.heldBody" : "update.banner.readyTitle",
                vars: { version: state.readyVersion ?? "" },
            };
        case "failed":
            return { ...base, status: "failed", tone: "error", messageKey: "update.status.failed", vars: {} };
        case "idle":
            return { ...base, status: "idle", tone: "info", messageKey: "update.status.idle", vars: {} };
    }
}

/** A state to render before the main process has answered, so nothing renders undefined. */
export function unknownUpdateState(currentVersion = ""): UpdateState {
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
