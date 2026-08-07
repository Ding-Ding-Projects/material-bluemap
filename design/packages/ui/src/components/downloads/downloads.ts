/**
 * Releases, and the downloads of them, watched from the interface.
 *
 * A release of this project carries worlds and rendered maps, and those are not files a
 * browser fetches in a moment: a GitHub asset is capped at two gigabytes, so anything
 * larger is published as 1.7 GB parts with a SHA-256 for every part beside them, and the
 * application downloads, verifies and rejoins them. A twenty-gigabyte world is therefore
 * tens of minutes of work with four distinct phases, which is why the main process pushes
 * progress rather than answering questions about it, and why this holds the latest of each
 * fact: which phase, how many bytes of how many, which part, how long is left.
 *
 * Three decisions here are worth stating, because each of them is the difference between a
 * surface that can be trusted and one that merely looks busy.
 *
 * **Every event makes a row, whoever started it.** The main process broadcasts to every
 * window, so a download started by another window, or before this surface was opened,
 * arrives here as well and is shown. Nothing is filtered to "mine": a download that is
 * invisible is a download somebody starts a second copy of.
 *
 * **The record on disk never overwrites what the events said.** {@link Downloads.reconcile}
 * exists so that a download already in flight when this mounts is not missing, and it
 * merges rather than replaces. Events are live and the record is a snapshot, so a row the
 * events are driving keeps its own state.
 *
 * **Cancelled is not failed.** Cancelling keeps every byte already transferred, because
 * each part is checksummed individually and the next attempt continues from the byte this
 * one stopped at. Somebody who pressed Stop is told exactly that, and offered the resume
 * it makes possible, rather than an error about something that did not go wrong.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import type {
    DiscoveredRelease,
    DownloadBridge,
    DownloadEvent,
    DownloadFailure,
    DownloadPhase,
    DownloadRequest,
    DownloadResult,
    DownloadSummary,
    DownloadTaskProgress,
    ReleaseCoordinates,
    SettingsTarget,
} from "./downloadBridge.js";
import { formatDuration } from "../world/renderRun.js";
import type { Translate } from "../world/worldFolder.js";

/**
 * Where the surface looks when nobody has said otherwise.
 *
 * This project's own releases are what carry the worlds and the rendered maps, so they are
 * the honest default for somebody who has no world yet. Every field stays editable,
 * because a fork, a mirror or a private repository of somebody's own worlds is exactly the
 * case a hard-coded repository would refuse to serve.
 */
export const DEFAULT_RELEASE: Required<Pick<ReleaseCoordinates, "owner" | "repo">> & { readonly tag: string } = {
    owner: "Ding-Ding-Projects",
    repo: "worldlens",
    /** Blank, which the main process reads as `latest`. */
    tag: "",
};

/** How many log lines are kept per download. The panel is not a terminal. */
export const LOG_LIMIT = 100;

export type DownloadRowState =
    /** In flight now. */
    | "running"
    /**
     * A record that says it was running, for a download the main process is not running.
     * The application stopped, or the machine did, before it could write an ending.
     */
    | "interrupted"
    | "finished"
    | "failed"
    | "cancelled";

export interface DownloadLogLine {
    readonly id: number;
    readonly level: string;
    readonly message: string;
    readonly at: string;
}

/** One download, as the surface shows it, whether it is live or read back from disk. */
export interface DownloadRow {
    readonly downloadId: string;
    /** The name the download presents, e.g. `world.zip`. Empty when only the id is known. */
    readonly asset: string;
    /** `owner/repo`, which only the record carries: no event mentions it. */
    readonly repository: string;
    /** The release tag. Empty when only the id is known. */
    readonly tag: string;
    readonly state: DownloadRowState;
    readonly phase: DownloadPhase | null;
    readonly task: DownloadTaskProgress | null;
    /** The size of the whole download, once something has said. Zero until then. */
    readonly bytes: number;
    readonly parts: number;
    readonly split: boolean;
    readonly archive: string | null;
    /** Where the archive was unpacked, which is the folder a world is rendered from. */
    readonly content: string | null;
    readonly sha256: string | null;
    readonly failure: DownloadFailure | null;
    readonly startedAt: string | null;
    readonly finishedAt: string | null;
    readonly durationMs: number | null;
    /** True once an event for this download has been seen in this session. */
    readonly live: boolean;
    readonly cancelling: boolean;
    readonly log: readonly DownloadLogLine[];
}

/* -------------------------------------------------------------------------- */
/* Words                                                                      */
/* -------------------------------------------------------------------------- */

/** What a phase is called on screen. An unknown phase is shown as it arrives. */
export function phaseLabel(phase: DownloadPhase | null, t: Translate): string {
    switch (phase) {
        case null:
            return "";
        case "resolving":
            return t("downloads.phase.resolving", "Reading the release");
        case "downloading":
            return t("downloads.phase.downloading", "Transferring");
        case "joining":
            return t("downloads.phase.joining", "Putting the parts back together");
        case "extracting":
            return t("downloads.phase.extracting", "Unpacking the archive");
        case "finished":
            return t("downloads.phase.finished", "Finished");
        default:
            return phase;
    }
}

function trimZeros(text: string): string {
    return text.includes(".") ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
}

/** Decimal units, because that is what a release page and a manifest both count in. */
const UNITS: readonly { readonly scale: number; readonly key: string; readonly fallback: string }[] = [
    { scale: 1e12, key: "downloads.size.tb", fallback: "{n} TB" },
    { scale: 1e9, key: "downloads.size.gb", fallback: "{n} GB" },
    { scale: 1e6, key: "downloads.size.mb", fallback: "{n} MB" },
    { scale: 1e3, key: "downloads.size.kb", fallback: "{n} kB" },
];

/**
 * A size in words, to three significant figures.
 *
 * Precision falls as the number grows on purpose: `1.7 GB` is the number the release notes
 * and the manifest both use, and `1.70000000 GB` is the same fact rendered as noise.
 */
export function formatBytes(bytes: number, t: Translate): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "";
    for (const unit of UNITS) {
        if (bytes < unit.scale) continue;
        const value = bytes / unit.scale;
        const digits = value < 10 ? 2 : value < 100 ? 1 : 0;
        // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
        // compiles the fallback as a message too and consumes `{n}` as a named parameter
        // of its own, so a later `replace` has nothing left to substitute and a four
        // gigabyte download reads " GB".
        return t(unit.key, { n: trimZeros(value.toFixed(digits)) }, unit.fallback);
    }
    return t("downloads.size.b", { n: String(Math.round(bytes)) }, "{n} B");
}

/** How much of it has arrived, in exact bytes rendered as sizes. */
export function transferText(task: DownloadTaskProgress | null, t: Translate): string {
    if (task === null || task.bytesTotal <= 0) return "";
    return t(
        "downloads.transfer",
        { done: formatBytes(task.bytesDone, t), total: formatBytes(task.bytesTotal, t) },
        "{done} of {total}",
    );
}

/** Which part, when the download really is in parts. Empty when it is one file. */
export function partsText(task: DownloadTaskProgress | null, t: Translate): string {
    if (task === null || task.partsTotal <= 1) return "";
    return t(
        "downloads.parts",
        { done: String(task.partsDone), total: String(task.partsTotal) },
        "part {done} of {total}",
    );
}

/**
 * How long is left.
 *
 * The main process's own `etaText` is used verbatim when it sent one, because it is its
 * own estimate in its own words. The number is only put into words here when that is all
 * that arrived.
 */
export function etaText(task: DownloadTaskProgress | null, t: Translate): string {
    if (task === null) return "";
    if (task.etaText !== null && task.etaText.trim() !== "") {
        return t("downloads.eta", { eta: task.etaText }, "about {eta} left");
    }
    if (task.etaSeconds === null) return "";
    return t("downloads.eta", { eta: formatDuration(task.etaSeconds, t) }, "about {eta} left");
}

/* -------------------------------------------------------------------------- */
/* Failures                                                                   */
/* -------------------------------------------------------------------------- */

export type DownloadFailureKind =
    | "release"
    | "asset"
    | "network"
    | "manifest"
    | "integrity"
    | "extract"
    | "storage"
    | "request"
    | "cancelled"
    | "unknown";

/** Sorts a failure into the one of these it is, so each gets its own answer. */
export function classifyDownloadFailure(failure: DownloadFailure): DownloadFailureKind {
    switch (failure.code) {
        case "release-not-found":
            return "release";
        case "asset-not-found":
            return "asset";
        case "network-failed":
            return "network";
        case "manifest-invalid":
            return "manifest";
        case "integrity-failed":
            return "integrity";
        case "extract-failed":
            return "extract";
        case "storage-unwritable":
            return "storage";
        case "invalid-request":
        case "already-running":
            return "request";
        case "cancelled":
            return "cancelled";
        default:
            return "unknown";
    }
}

export interface DownloadRemedy {
    /** The settings row that would fix it, or null when no setting helps. */
    readonly settings: SettingsTarget | null;
    readonly actionKey: string;
    readonly actionFallback: string;
}

export interface DownloadAdvice {
    readonly kind: DownloadFailureKind;
    /** The main process's own sentence, shown as written. */
    readonly message: string;
    /** What it means and what to do, in this app's terms. */
    readonly explanation: string;
    readonly remedy: DownloadRemedy;
    /** The supporting evidence, behind a disclosure. Null when there is none. */
    readonly detail: string | null;
    /** True when starting the same download again would carry on rather than begin. */
    readonly resumable: boolean;
}

/**
 * What a failure means and what is left to do about it.
 *
 * The main process's own `message` is never rewritten or hidden: it names the release, the
 * asset or the part that is wrong, which is the sentence somebody can act on. The
 * explanation sits beside it and says what this application can do next, and in particular
 * whether the bytes already transferred survived, because that is the difference between
 * starting again and carrying on.
 */
export function adviseOnDownloadFailure(failure: DownloadFailure, t: Translate): DownloadAdvice {
    const kind = classifyDownloadFailure(failure);
    const base = { kind, message: failure.message, detail: failure.detail };
    const noRemedy: DownloadRemedy = { settings: null, actionKey: "", actionFallback: "" };

    switch (kind) {
        case "release":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.release",
                    "That release could not be read. Either nothing is published under that tag, or it is private and this machine has not been given a token for it. A public release never needs one.",
                ),
                remedy: noRemedy,
                resumable: false,
            };
        case "asset":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.asset",
                    "The release exists but carries nothing by that name. The names it does carry are listed below, and a split download is named by the whole file rather than by one of its parts.",
                ),
                remedy: noRemedy,
                resumable: false,
            };
        case "network":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.network",
                    "The transfer stopped before it was done. Everything already on disk was kept, so starting it again continues from the byte it reached rather than beginning again.",
                ),
                remedy: noRemedy,
                resumable: true,
            };
        case "manifest":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.manifest",
                    "This download is published in parts, and the file describing how they fit together could not be read. Without it there is no safe way to rejoin them, so nothing was assembled.",
                ),
                remedy: noRemedy,
                resumable: false,
            };
        case "integrity":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.integrity",
                    "What arrived does not match the checksum published beside it, so it was deleted rather than kept. A file that is corrupt and looks complete is worse than no file: it unpacks cleanly and goes wrong later, somewhere else. Starting again re-fetches the part that disagreed.",
                ),
                remedy: noRemedy,
                resumable: true,
            };
        case "extract":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.extract",
                    "The archive itself is verified and still on disk. Unpacking it is what failed, so nothing has to be downloaded again, and the message above says what the archive contained that could not be written.",
                ),
                remedy: noRemedy,
                resumable: true,
            };
        case "storage":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.storage",
                    "The folder downloads are written into could not be created or written. It may be read-only, full, or on a drive that is not connected.",
                ),
                remedy: {
                    settings: failure.settings ?? {
                        surface: "settings",
                        anchor: "map-storage-directory",
                        missing: false,
                    },
                    actionKey: "downloads.fail.storageAction",
                    actionFallback: "Change where downloads are written",
                },
                resumable: true,
            };
        case "request":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.request",
                    "The download was refused before anything was transferred, so nothing was written. The message above says exactly which part of the request was refused.",
                ),
                remedy: noRemedy,
                resumable: false,
            };
        case "cancelled":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.cancelled",
                    "You stopped it. Every byte already transferred is kept, and starting it again carries on from where it stopped.",
                ),
                remedy: noRemedy,
                resumable: true,
            };
        case "unknown":
            return {
                ...base,
                explanation: t(
                    "downloads.fail.unknown",
                    "The download stopped for a reason this screen has no specific answer for. The message above is the one the app itself reported.",
                ),
                remedy: noRemedy,
                resumable: false,
            };
    }
}

/* -------------------------------------------------------------------------- */
/* Rows                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The request that would carry this download on, or null when it cannot be rebuilt.
 *
 * Only the record on disk carries `owner/repo`; no event mentions it. So a row this window
 * started knows it from the request it made, a row read back from disk knows it from the
 * record, and a row adopted from nothing but an id in flight does not know it at all and
 * says so by refusing to offer a resume it cannot perform.
 */
export function requestFor(row: DownloadRow): DownloadRequest | null {
    const parts = row.repository.split("/");
    const owner = (parts[0] ?? "").trim();
    const repo = (parts[1] ?? "").trim();
    if (parts.length !== 2 || owner === "" || repo === "" || row.asset.trim() === "") return null;
    return {
        owner,
        repo,
        ...(row.tag.trim() === "" ? {} : { tag: row.tag.trim() }),
        asset: row.asset,
    };
}

/**
 * True when starting this download again would continue rather than begin.
 *
 * Every part is checksummed on its own, and a ranged request resumes from the byte the
 * last attempt reached, so anything that stopped short can be carried on. A finished
 * download is not offered one, and neither is one that is still going.
 */
export function canResume(row: DownloadRow): boolean {
    if (row.state === "finished" || row.state === "running") return false;
    return requestFor(row) !== null;
}

/** The order rows are shown in: what is happening now, then what stopped, then what is done. */
const RANK: Readonly<Record<DownloadRowState, number>> = {
    running: 0,
    interrupted: 1,
    failed: 2,
    cancelled: 3,
    finished: 4,
};

function blankRow(downloadId: string): DownloadRow {
    return {
        downloadId,
        asset: "",
        repository: "",
        tag: "",
        state: "running",
        phase: null,
        task: null,
        bytes: 0,
        parts: 1,
        split: false,
        archive: null,
        content: null,
        sha256: null,
        failure: null,
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        live: false,
        cancelling: false,
        log: [],
    };
}

/* -------------------------------------------------------------------------- */
/* The surface's state                                                        */
/* -------------------------------------------------------------------------- */

export interface Downloads {
    /** True when this build can download a release at all. */
    readonly available: boolean;
    /** True when a download in flight can be stopped from here. */
    readonly canCancel: boolean;
    /** True when downloads already on disk can be listed. */
    readonly canList: boolean;

    readonly rows: ComputedRef<readonly DownloadRow[]>;
    readonly release: Ref<DiscoveredRelease | null>;
    readonly discovering: Ref<boolean>;
    /** Why the release could not be read, in the main process's own words. */
    readonly discoveryFailure: Ref<string | null>;
    /** Why the downloads on disk could not be listed. */
    readonly listFailure: Ref<string | null>;
    /**
     * A download refused before it had an id, so there is no row for it.
     *
     * A release that does not exist, an asset name nothing matches, or an ambiguous
     * request all fail before a workspace exists, and inventing a row for a download that
     * never began would put a permanent failure in a list of real downloads.
     */
    readonly startFailure: Ref<DownloadFailure | null>;
    /** Asset names asked for and not yet answered, so the button can say so. */
    readonly starting: Ref<readonly string[]>;
    readonly reconciling: Ref<boolean>;

    discover(where: ReleaseCoordinates): Promise<DiscoveredRelease | null>;
    start(request: DownloadRequest): Promise<DownloadResult | null>;
    /** Carries a stopped download on. Refused for a row whose request cannot be rebuilt. */
    resume(row: DownloadRow): Promise<DownloadResult | null>;
    cancel(downloadId: string): Promise<boolean>;
    /** Reads what is on disk and what is in flight, and merges it into the rows. */
    reconcile(): Promise<void>;
    /** Stops listening. Called when the surface holding this goes away. */
    dispose(): void;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createDownloads(bridge: DownloadBridge | null): Downloads {
    const byId = ref<Readonly<Record<string, DownloadRow>>>({});
    const release = ref<DiscoveredRelease | null>(null);
    const discovering = ref(false);
    const discoveryFailure = ref<string | null>(null);
    const listFailure = ref<string | null>(null);
    const startFailure = ref<DownloadFailure | null>(null);
    const starting = ref<readonly string[]>([]);
    const reconciling = ref(false);

    let nextLogId = 1;

    const rows = computed<readonly DownloadRow[]>(() =>
        Object.values(byId.value).sort((left, right) => {
            const rank = RANK[left.state] - RANK[right.state];
            if (rank !== 0) return rank;
            // Newest first inside a rank. ISO-8601 sorts correctly as text, and a row with
            // no timestamp is one adopted from an id alone, which goes last rather than
            // pretending to be the oldest thing on screen.
            const leftAt = left.startedAt ?? "";
            const rightAt = right.startedAt ?? "";
            if (leftAt !== rightAt) return rightAt.localeCompare(leftAt);
            return left.downloadId.localeCompare(right.downloadId);
        }),
    );

    function put(row: DownloadRow): void {
        byId.value = { ...byId.value, [row.downloadId]: row };
    }

    function rowFor(downloadId: string): DownloadRow {
        return byId.value[downloadId] ?? blankRow(downloadId);
    }

    function append(row: DownloadRow, level: string, message: string, at: string): readonly DownloadLogLine[] {
        const next = [...row.log, { id: nextLogId++, level, message, at }];
        return next.length > LOG_LIMIT ? next.slice(next.length - LOG_LIMIT) : next;
    }

    function handle(event: DownloadEvent): void {
        // A failure that happened before a workspace existed carries no id, so there is
        // nothing for it to be a row of. It is reported beside the release instead.
        if (event.downloadId === "") {
            if (event.type === "failed") startFailure.value = event.failure;
            return;
        }

        const row = rowFor(event.downloadId);

        switch (event.type) {
            case "started":
                put({
                    ...row,
                    asset: event.asset,
                    tag: event.release,
                    parts: event.parts,
                    split: event.parts > 1,
                    bytes: event.bytesTotal,
                    state: "running",
                    phase: null,
                    task: null,
                    failure: null,
                    startedAt: event.at,
                    finishedAt: null,
                    durationMs: null,
                    cancelling: false,
                    live: true,
                });
                break;
            case "phase":
                put({ ...row, phase: event.phase, live: true });
                break;
            case "progress":
                put({
                    ...row,
                    phase: event.phase,
                    task: event.task,
                    // The transfer's total is the size of the whole download, so it fills
                    // in the size of a row adopted from an id alone. No other phase's
                    // total is: the unpack counts the bytes inside the archive, which is
                    // a larger and different number.
                    bytes: row.bytes > 0 || event.phase !== "downloading" ? row.bytes : event.task.bytesTotal,
                    // Progress on a row that was read back from disk as finished means it
                    // is being fetched again, which is a running download and not a
                    // finished one with a moving bar under it.
                    state: "running",
                    live: true,
                });
                break;
            case "log":
                put({ ...row, log: append(row, event.level, event.message, event.at), live: true });
                break;
            case "finished":
                put({
                    ...row,
                    state: "finished",
                    phase: "finished",
                    archive: event.archive,
                    content: event.content,
                    bytes: event.bytes,
                    sha256: event.sha256,
                    durationMs: event.durationMs,
                    finishedAt: event.at,
                    failure: null,
                    cancelling: false,
                    live: true,
                });
                break;
            case "failed":
                put({
                    ...row,
                    // Cancelling comes back as a failure with this code when the result is
                    // settled rather than as the cancelled event, and somebody who pressed
                    // Stop must never be shown an error.
                    state: event.failure.code === "cancelled" ? "cancelled" : "failed",
                    failure: event.failure.code === "cancelled" ? null : event.failure,
                    finishedAt: event.at,
                    cancelling: false,
                    live: true,
                });
                break;
            case "cancelled":
                put({ ...row, state: "cancelled", failure: null, finishedAt: event.at, cancelling: false, live: true });
                break;
        }
    }

    const unsubscribe = bridge === null ? () => undefined : bridge.onDownloadEvent(handle);

    /**
     * Applies a final result, and stamps the row with where it came from.
     *
     * `owner/repo` reaches the interface in exactly two ways: the record on disk, and the
     * request this window made. Recording it here is what lets a download that failed
     * halfway be carried on without asking anybody to type the repository again.
     */
    function settle(result: DownloadResult, request: DownloadRequest): void {
        if (result.downloadId === "") {
            if (!result.ok) startFailure.value = result.failure;
            return;
        }

        const row = rowFor(result.downloadId);
        const origin = {
            repository: `${request.owner}/${request.repo}`,
            tag: row.tag === "" ? (request.tag ?? "").trim() : row.tag,
            asset: row.asset === "" ? (request.asset ?? "").trim() : row.asset,
        };

        if (result.ok) {
            put({
                ...row,
                ...origin,
                state: "finished",
                phase: "finished",
                archive: result.archive,
                content: result.content,
                bytes: result.bytes,
                sha256: result.sha256,
                durationMs: result.durationMs,
                failure: null,
                cancelling: false,
            });
            return;
        }

        const cancelled = result.failure.code === "cancelled";
        put({
            ...row,
            ...origin,
            state: cancelled ? "cancelled" : "failed",
            failure: cancelled ? null : result.failure,
            cancelling: false,
        });
    }

    async function discover(where: ReleaseCoordinates): Promise<DiscoveredRelease | null> {
        if (bridge === null || discovering.value) return null;
        const owner = where.owner.trim();
        const repo = where.repo.trim();
        const tag = (where.tag ?? "").trim();
        if (owner === "" || repo === "") {
            discoveryFailure.value = null;
            release.value = null;
            return null;
        }

        discovering.value = true;
        discoveryFailure.value = null;
        startFailure.value = null;
        try {
            const answer = await bridge.discoverRelease({ owner, repo, ...(tag === "" ? {} : { tag }) });
            if (answer.ok) {
                release.value = answer.release;
                return answer.release;
            }
            release.value = null;
            discoveryFailure.value = answer.message;
            return null;
        } catch (error) {
            release.value = null;
            discoveryFailure.value = describe(error);
            return null;
        } finally {
            discovering.value = false;
        }
    }

    async function start(request: DownloadRequest): Promise<DownloadResult | null> {
        if (bridge === null) return null;
        // Keyed by asset name rather than by download id, because the id is derived from
        // the release and the asset by the main process and the interface does not know it
        // until the first event arrives.
        const key = (request.asset ?? "").trim();
        if (starting.value.includes(key)) return null;

        starting.value = [...starting.value, key];
        startFailure.value = null;
        try {
            const result = await bridge.startDownload(request);
            settle(result, request);
            return result;
        } catch (error) {
            // The bridge is documented never to reject, so this is a broken bridge rather
            // than a failed download. Saying so is more useful than showing it as a
            // transfer failure it never got as far as.
            startFailure.value = {
                code: "bridge-failed",
                message: describe(error),
                settings: null,
                detail: null,
                status: null,
            };
            return null;
        } finally {
            starting.value = starting.value.filter((name) => name !== key);
        }
    }

    async function resume(row: DownloadRow): Promise<DownloadResult | null> {
        const request = requestFor(row);
        if (request === null) return null;
        return await start(request);
    }

    async function cancel(downloadId: string): Promise<boolean> {
        if (bridge === null) return false;
        const row = byId.value[downloadId];
        if (row === undefined || row.state !== "running") return false;

        put({ ...row, cancelling: true });
        try {
            const stopped = await bridge.cancelDownload(downloadId);
            // False means nothing was running under that id, so the flag comes back off
            // rather than leaving a row that says "Stopping..." for ever.
            if (!stopped) put({ ...rowFor(downloadId), cancelling: false });
            return stopped;
        } catch {
            put({ ...rowFor(downloadId), cancelling: false });
            return false;
        }
    }

    /**
     * Merges what is in flight and what is on disk into the rows.
     *
     * A download outlives the window that started it, so one begun before this surface
     * opened, or from another window, would otherwise be invisible here: the person would
     * be offered a download that is already going, and the main process would refuse it
     * with `already-running` for reasons nothing on screen explained.
     *
     * The two questions are asked separately and answer different things. `listDownloads`
     * reads the records on disk, and a download only writes its record once it has ended,
     * so what is running right now is nearly always absent from it. `activeDownloads`
     * answers exactly that, and an id in flight with no record yet is still worth a row:
     * its name arrives with the next event, and stopping it works from the id alone.
     */
    async function reconcile(): Promise<void> {
        if (bridge === null || reconciling.value) return;
        reconciling.value = true;
        try {
            let active: readonly string[] = [];
            try {
                active = await bridge.activeDownloads();
            } catch {
                // Not knowing what is in flight is not worth failing the whole pass over.
                // The records below are still worth showing, and the worst that follows is
                // a record that says "running" being shown as interrupted, which offers a
                // resume the main process answers with `already-running`.
            }

            try {
                for (const summary of await bridge.listDownloads()) adopt(summary, active.includes(summary.downloadId));
                listFailure.value = null;
            } catch (error) {
                listFailure.value = describe(error);
            }

            for (const downloadId of active) {
                if (byId.value[downloadId] === undefined) put(blankRow(downloadId));
            }
        } finally {
            reconciling.value = false;
        }
    }

    /**
     * Folds one record into the rows without overwriting what the events said.
     *
     * The record is a snapshot and the events are live, so a row the events are driving
     * keeps its own state, phase and progress and takes only the facts no event carries:
     * which repository it came from, and where the archive and its contents ended up.
     */
    function adopt(summary: DownloadSummary, running: boolean): void {
        const row = rowFor(summary.downloadId);
        const state: DownloadRowState = row.live
            ? row.state
            : summary.outcome === "running"
              ? running
                  ? "running"
                  : "interrupted"
              : summary.outcome;

        put({
            ...row,
            asset: summary.asset === "" ? row.asset : summary.asset,
            repository: summary.repository === "" ? row.repository : summary.repository,
            tag: summary.tag === "" ? row.tag : summary.tag,
            state,
            bytes: row.bytes > 0 ? row.bytes : summary.bytes,
            parts: summary.parts > 0 ? summary.parts : row.parts,
            split: summary.split || row.split,
            archive: row.archive ?? (summary.archive === "" ? null : summary.archive),
            content: row.content ?? summary.content,
            startedAt: row.startedAt ?? summary.startedAt,
            finishedAt: row.finishedAt ?? summary.finishedAt,
            durationMs: row.durationMs ?? summary.durationMs,
        });
    }

    return {
        available: bridge !== null,
        canCancel: bridge?.canCancel ?? false,
        canList: bridge?.canList ?? false,
        rows,
        release,
        discovering,
        discoveryFailure,
        listFailure,
        startFailure,
        starting,
        reconciling,
        discover,
        start,
        resume,
        cancel,
        reconcile,
        dispose: unsubscribe,
    };
}
