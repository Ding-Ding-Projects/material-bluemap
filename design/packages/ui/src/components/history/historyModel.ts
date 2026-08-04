/**
 * Everything the history panel decides, with no Vue, no DOM and no host in it.
 *
 * Three filters compose here - a text search, a date range and a set of actions - and the
 * word *compose* is the whole of the design. Each one narrows what the previous one left,
 * and none of them can override or silently clear another. That sounds obvious written
 * down and it is the thing filter code gets wrong most often: a panel where picking an
 * action resets the date range, or where typing in the search box drops the action chips,
 * makes the user re-apply what they already applied and teaches them not to combine
 * filters at all.
 *
 * ## The actions come from the history, not from a list
 *
 * {@link actionFacets} reads the revisions in front of it and offers exactly the actions
 * they carry, each with its count. A history with no restores in it offers no "restored"
 * chip, so the panel never shows a filter that is guaranteed to find nothing; and a word
 * the main process starts emitting tomorrow appears here with no change to this file. A
 * hard-coded list would drift from the data the day either side changed, and the way it
 * would show up is a filter that quietly excludes revisions nobody can find.
 *
 * ## Nothing here throws
 *
 * An invalid regular expression is a state the panel is *in* while somebody types one, not
 * an error. {@link filterRevisions} narrows to nothing and reports the compile error, which
 * is what `createSettingMatcher` was built to do; the search field renders the message
 * beneath itself and the list shows an honest no-match.
 */

import { dayKey, inRange, type DayKey, type DayRange } from "../changelog/changelogDates.js";
import { createSettingMatcher } from "../config/regexEngine.js";

import type { ReadableFileDiff, SettingChange } from "./historyDiff.js";
import { ACTION_ORDER, type HistoryRevision } from "./historyHost.js";

/**
 * The day a revision falls on, in the reader's own timezone.
 *
 * Local rather than UTC on purpose, and it matters at both ends of a day: somebody who
 * edited a config at eleven at night expects to find it under that evening's date, not
 * under tomorrow's because their offset happens to be positive. The date picker's own
 * `todayKey` reads the local day for the same reason, so the two agree.
 */
export function revisionDay(at: string): DayKey | null {
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) return null;
    return dayKey(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/**
 * The text one revision is searched over.
 *
 * The label, the user's own note, every changed file's path and the short hash. All of it,
 * because the three things somebody actually searches a history for are "the nether map",
 * "before the server move" and a hash they copied out of a bug report, and a search that
 * only covered the label would find the first and neither of the others.
 */
export function searchCorpus(revision: HistoryRevision): string {
    return [
        revision.label,
        revision.note ?? "",
        revision.action,
        revision.shortId,
        ...revision.changes.map((change) => `${change.status} ${change.path}`),
    ].join("\n");
}

export interface ActionFacet {
    readonly action: string;
    readonly count: number;
}

/**
 * The actions present in these revisions, each with how many carry it.
 *
 * Counted over the *unfiltered* history rather than the filtered view, so the numbers do
 * not change as the user narrows and a chip reading `deleted 3` still means there are three
 * deletions to find. Ordered by {@link ACTION_ORDER} where the word is one this build
 * knows, and alphabetically after that, so an unknown word from a newer main process lands
 * somewhere stable rather than jumping around as counts change.
 */
export function actionFacets(revisions: readonly HistoryRevision[]): ActionFacet[] {
    const counts = new Map<string, number>();
    for (const revision of revisions) {
        counts.set(revision.action, (counts.get(revision.action) ?? 0) + 1);
    }

    return [...counts]
        .map(([action, count]) => ({ action, count }))
        .sort((left, right) => {
            const leftRank = ACTION_ORDER.indexOf(left.action);
            const rightRank = ACTION_ORDER.indexOf(right.action);
            if (leftRank !== rightRank) {
                if (leftRank === -1) return 1;
                if (rightRank === -1) return -1;
                return leftRank - rightRank;
            }
            return left.action.localeCompare(right.action);
        });
}

/** The days that actually carry a revision, which the calendar marks. */
export function daysWithRevisions(revisions: readonly HistoryRevision[]): Set<string> {
    const days = new Set<string>();
    for (const revision of revisions) {
        const day = revisionDay(revision.at);
        if (day !== null) days.add(day);
    }
    return days;
}

/** The oldest and newest day the history covers, which bound the calendar's year jump. */
export function historySpan(revisions: readonly HistoryRevision[]): {
    earliest: DayKey | null;
    latest: DayKey | null;
} {
    const days = [...daysWithRevisions(revisions)].sort();
    return { earliest: days[0] ?? null, latest: days[days.length - 1] ?? null };
}

export interface HistoryFilter {
    /** The search bar's text. Plain-text substring unless `regex` is on. */
    readonly query: string;
    readonly regex: boolean;
    readonly flags: string;
    readonly range: DayRange;
    /** Empty means every action, which is not the same as "none selected shows nothing". */
    readonly actions: readonly string[];
}

export interface FilterOutcome {
    readonly revisions: readonly HistoryRevision[];
    /** The regex compile error, or null. Shown under the field rather than thrown. */
    readonly error: string | null;
    /** True when any of the three filters is doing something. */
    readonly active: boolean;
}

/**
 * Applies the search, the date range and the action set, in that order.
 *
 * An empty `actions` list means *every* action, not *no* action. That is the only sensible
 * reading of a set of chips nobody has touched, and getting it the other way round produces
 * a panel that shows an empty list on open and looks broken.
 */
export function filterRevisions(
    revisions: readonly HistoryRevision[],
    filter: HistoryFilter,
): FilterOutcome {
    const matcher = createSettingMatcher(filter.query, filter.regex, filter.flags);
    const wanted = new Set(filter.actions);

    const kept = revisions.filter((revision) => {
        if (!matcher.test(searchCorpus(revision))) return false;

        if (filter.range.from !== null || filter.range.to !== null) {
            const day = revisionDay(revision.at);
            // A revision whose timestamp cannot be read is kept rather than hidden: it is a
            // real revision, and dropping it out of a date-filtered view would make it
            // findable only by turning the filter off, which nobody would think to do.
            if (day !== null && !inRange(day, filter.range)) return false;
        }

        if (wanted.size > 0 && !wanted.has(revision.action)) return false;
        return true;
    });

    return {
        revisions: kept,
        error: matcher.error,
        active: matcher.active || wanted.size > 0 || filter.range.from !== null || filter.range.to !== null,
    };
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

/** The formats a history can leave in. Every one of them round-trips the same facts. */
export type ExportFormat = "markdown" | "json" | "csv" | "text";

export const EXPORT_FORMATS: readonly ExportFormat[] = ["markdown", "json", "csv", "text"];

/** The file extension each format is written with. */
export const EXPORT_EXTENSIONS: Readonly<Record<ExportFormat, string>> = {
    markdown: "md",
    json: "json",
    csv: "csv",
    text: "txt",
};

/**
 * The strings around an export, supplied by the caller so this file stays free of vue-i18n.
 *
 * `range` is the honest statement of which slice of the history the file holds. An export
 * that silently contained the filtered view with no note of the filter would be a file
 * somebody later reads as the whole history.
 */
export interface ExportLabels {
    readonly title: string;
    readonly folder: string;
    readonly repository: string;
    readonly range: string;
    readonly empty: string;
}

function csvCell(value: string): string {
    return `"${value.replaceAll('"', '""')}"`;
}

/** One revision's files as `added maps/nether.conf; modified core.conf`. */
function changeList(revision: HistoryRevision): string {
    return revision.changes.map((change) => `${change.status} ${change.path}`).join("; ");
}

/**
 * The history on screen, as a file.
 *
 * Every format carries the full revision hash rather than the short one. A short hash is
 * what a person reads; the full one is what makes the export traceable back to the
 * repository it came from, and an export nobody can check against its source is a
 * screenshot with extra steps.
 */
export function exportRevisions(
    revisions: readonly HistoryRevision[],
    format: ExportFormat,
    labels: ExportLabels,
): string {
    if (format === "json") {
        return `${JSON.stringify(
            {
                title: labels.title,
                folder: labels.folder,
                repository: labels.repository,
                range: labels.range,
                revisions: revisions.map((revision) => ({
                    id: revision.id,
                    at: revision.at,
                    label: revision.label,
                    action: revision.action,
                    note: revision.note,
                    restoredFrom: revision.restoredFrom,
                    changes: revision.changes.map((change) => ({ path: change.path, status: change.status })),
                })),
            },
            null,
            4,
        )}\n`;
    }

    if (format === "csv") {
        const rows = [
            ["revision", "at", "action", "label", "note", "restored-from", "changes"].map(csvCell).join(","),
            ...revisions.map((revision) =>
                [
                    revision.id,
                    revision.at,
                    revision.action,
                    revision.label,
                    revision.note ?? "",
                    revision.restoredFrom ?? "",
                    changeList(revision),
                ]
                    .map(csvCell)
                    .join(","),
            ),
        ];
        return `${rows.join("\n")}\n`;
    }

    const head =
        format === "markdown"
            ? [`# ${labels.title}`, "", labels.folder, "", labels.repository, "", labels.range, ""]
            : [labels.title, labels.folder, labels.repository, labels.range, ""];

    if (revisions.length === 0) return `${[...head, labels.empty].join("\n")}\n`;

    const body = revisions.flatMap((revision) => {
        const files = revision.changes.map((change) =>
            format === "markdown" ? `- \`${change.status}\` ${change.path}` : `    ${change.status} ${change.path}`,
        );
        const note = revision.note === null ? [] : [format === "markdown" ? `> ${revision.note}` : `  "${revision.note}"`];

        return format === "markdown"
            ? [`## ${revision.label}`, "", `- ${revision.at} · \`${revision.id}\` · ${revision.action}`, ...note, ...files, ""]
            : [`${revision.at}  ${revision.id}  ${revision.action}`, `  ${revision.label}`, ...note, ...files, ""];
    });

    return `${[...head, ...body].join("\n")}\n`;
}

/* -------------------------------------------------------------------------- */
/* Exporting a comparison                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The strings around a comparison export, supplied by the caller for the same reason
 * {@link ExportLabels} is: this file stays free of vue-i18n so it can be tested as data.
 */
export interface ComparisonExportLabels {
    readonly title: string;
    /** Which two revisions, in which direction. An export without this is unreadable later. */
    readonly between: string;
    readonly empty: string;
}

/** One setting change as `sky-color: #7dabff -> #ffffff`, in every text format. */
function settingLine(change: SettingChange): string {
    if (change.kind === "added") return `${change.key}: (not set) -> ${change.after ?? ""}`;
    if (change.kind === "gone") return `${change.key}: ${change.before ?? ""} -> (not set)`;
    return `${change.key}: ${change.before ?? ""} -> ${change.after ?? ""}`;
}

/**
 * A comparison as a file, in the same four formats the history itself exports to.
 *
 * A comparison somebody worked to construct - two revisions a month apart, in a filtered
 * list of two hundred - is exactly the thing they then want to paste into an issue or keep
 * beside the config they are repairing. An on-screen-only comparison makes them retype it.
 *
 * Every format carries the setting-level reading *and* says which files it could not read,
 * because an export that silently listed six of eight files would be read later as the
 * whole answer.
 */
export function exportComparison(
    files: readonly ReadableFileDiff[],
    format: ExportFormat,
    labels: ComparisonExportLabels,
): string {
    if (format === "json") {
        return `${JSON.stringify(
            {
                title: labels.title,
                between: labels.between,
                files: files.map((file) => ({
                    path: file.path,
                    status: file.status,
                    unreadable: file.unreadable,
                    settingsChanged: file.total,
                    settings: (file.settings ?? []).map((change) => ({
                        key: change.key,
                        kind: change.kind,
                        before: change.before,
                        after: change.after,
                    })),
                })),
            },
            null,
            4,
        )}\n`;
    }

    if (format === "csv") {
        const rows = [
            ["file", "status", "setting", "change", "before", "after"].map(csvCell).join(","),
            ...files.flatMap((file) =>
                (file.settings ?? []).length === 0
                    ? [
                          [file.path, file.status, "", "", "", file.unreadable ?? ""]
                              .map(csvCell)
                              .join(","),
                      ]
                    : (file.settings ?? []).map((change) =>
                          [
                              file.path,
                              file.status,
                              change.key,
                              change.kind,
                              change.before ?? "",
                              change.after ?? "",
                          ]
                              .map(csvCell)
                              .join(","),
                      ),
            ),
        ];
        return `${rows.join("\n")}\n`;
    }

    const head =
        format === "markdown"
            ? [`# ${labels.title}`, "", labels.between, ""]
            : [labels.title, labels.between, ""];

    if (files.length === 0) return `${[...head, labels.empty].join("\n")}\n`;

    const body = files.flatMap((file) => {
        const lines = (file.settings ?? []).map((change) =>
            format === "markdown" ? `- \`${settingLine(change)}\`` : `    ${settingLine(change)}`,
        );
        const note = file.unreadable === null ? [] : [format === "markdown" ? `> ${file.unreadable}` : `  ${file.unreadable}`];

        return format === "markdown"
            ? [`## ${file.status} ${file.path}`, "", ...lines, ...note, ""]
            : [`${file.status}  ${file.path}`, ...lines, ...note, ""];
    });

    return `${[...head, ...body].join("\n")}\n`;
}
