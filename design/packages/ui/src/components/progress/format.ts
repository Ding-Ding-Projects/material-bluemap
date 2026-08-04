/**
 * Turning the progress facts into text somebody can read.
 *
 * Two rules run through all of it.
 *
 * **A number is localized and its unit is stated.** `1.4 GB of 6.6 GB at 22 MB/s` is a
 * sentence a person can act on; `1503238553` is a fact about a computer. Byte formatting is
 * *imported* from the downloads surface rather than written again, so a world leaving this
 * machine and a map arriving on it read identically — a second implementation would drift
 * to `1.40 GB` against `1.4 GB` and make two screens look like they disagree.
 *
 * **Every phrase carries its value through vue-i18n's three-argument form**, `t(key,
 * values, fallback)`, never `t(key, fallback).replace(...)`. vue-i18n compiles the fallback
 * as a message too and consumes `{done}` as a named parameter of its own, so a later
 * `replace` has nothing left to substitute and the line reads "of maps rendered" with no
 * numbers in it at all.
 */

import { formatBytes } from "../downloads/downloads.js";
import type { Translate } from "../world/worldFolder.js";
import type { ProgressCount, ProgressUnit, TransferStat } from "./progressModel.js";

/**
 * A whole number in the reader's own digits and grouping.
 *
 * `Intl.NumberFormat` rejects a locale that is not a structurally valid BCP-47 tag, and the
 * application deliberately runs with `locale: "none"` when no translations are loaded —
 * which is the state nearly every build is in. So the throw is caught rather than avoided
 * by a validity test that would have to duplicate the specification.
 */
export function formatNumber(value: number, locale?: string): string {
    if (!Number.isFinite(value)) return "";
    try {
        return new Intl.NumberFormat(locale === undefined || locale === "" ? undefined : locale).format(
            value,
        );
    } catch {
        return String(value);
    }
}

/** A percentage to one decimal, with a trailing `.0` trimmed off. */
export function formatPercent(percent: number, locale?: string): string {
    if (!Number.isFinite(percent)) return "";
    const rounded = Math.round(percent * 10) / 10;
    try {
        return new Intl.NumberFormat(locale === undefined || locale === "" ? undefined : locale, {
            style: "percent",
            maximumFractionDigits: 1,
        }).format(rounded / 100);
    } catch {
        return `${String(rounded)}%`;
    }
}

/** How each unit is phrased, with and without a denominator to divide by. */
const UNIT_PHRASES: Readonly<
    Record<
        ProgressUnit,
        {
            readonly known: { readonly key: string; readonly fallback: string };
            readonly unknown: { readonly key: string; readonly fallback: string };
        }
    >
> = {
    maps: {
        known: { key: "progress.count.maps", fallback: "{done} of {total} maps done" },
        unknown: { key: "progress.count.mapsOnly", fallback: "{done} maps done so far" },
    },
    jobs: {
        known: { key: "progress.count.jobs", fallback: "{done} of {total} jobs finished" },
        unknown: { key: "progress.count.jobsOnly", fallback: "{done} jobs finished so far" },
    },
    steps: {
        known: { key: "progress.count.steps", fallback: "step {done} of {total}" },
        unknown: { key: "progress.count.stepsOnly", fallback: "step {done}" },
    },
    files: {
        known: { key: "progress.count.files", fallback: "{done} of {total} files" },
        unknown: { key: "progress.count.filesOnly", fallback: "{done} files so far" },
    },
    bytes: {
        known: { key: "progress.count.bytes", fallback: "{done} of {total}" },
        unknown: { key: "progress.count.bytesOnly", fallback: "{done} so far" },
    },
    tiles: {
        known: { key: "progress.count.tiles", fallback: "{done} of {total} tiles" },
        unknown: { key: "progress.count.tilesOnly", fallback: "{done} tiles so far" },
    },
    regions: {
        known: { key: "progress.count.regions", fallback: "{done} of {total} regions" },
        unknown: { key: "progress.count.regionsOnly", fallback: "{done} regions so far" },
    },
    chunks: {
        known: { key: "progress.count.chunks", fallback: "{done} of {total} chunks" },
        unknown: { key: "progress.count.chunksOnly", fallback: "{done} chunks so far" },
    },
};

/**
 * A count in words, with its unit named.
 *
 * A missing total is phrased differently rather than papered over with a guess, because
 * "{done} maps done so far" is a true statement and "{done} of ? maps" is a puzzle.
 */
export function formatCount(count: ProgressCount, t: Translate, locale?: string): string {
    const phrases = UNIT_PHRASES[count.unit];
    const done = count.unit === "bytes" ? formatBytes(count.done, t) : formatNumber(count.done, locale);
    if (count.total === null) {
        return t(phrases.unknown.key, { done }, phrases.unknown.fallback);
    }
    const total = count.unit === "bytes" ? formatBytes(count.total, t) : formatNumber(count.total, locale);
    return t(phrases.known.key, { done, total }, phrases.known.fallback);
}

function pad(value: number): string {
    return value < 10 ? `0${String(value)}` : String(value);
}

/**
 * An elapsed time as a clock, `4:12` or `1:04:12`.
 *
 * Digits rather than words, and deliberately so: this one is read repeatedly, at a glance,
 * to see whether the second place has moved. Words are for the estimate, which is read once.
 */
export function formatClock(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "";
    const total = Math.floor(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return hours > 0
        ? `${String(hours)}:${pad(minutes)}:${pad(seconds)}`
        : `${String(minutes)}:${pad(seconds)}`;
}

/**
 * A transfer rate.
 *
 * Reuses the byte formatter so `22 MB` reads the same here as it does beside the total, and
 * appends the unit of time rather than leaving a bare number that could be per anything.
 */
export function formatRate(bytesPerSecond: number, t: Translate): string {
    if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "";
    return t("progress.rate", { size: formatBytes(bytesPerSecond, t) }, "{size}/s");
}

/**
 * `1.4 GB of 6.6 GB at 22 MB/s`, dropping whichever parts are not known.
 *
 * A transfer with no known total says how much has moved and at what rate, which is still
 * worth having; it does not invent a size to divide by.
 */
export function formatTransfer(stat: TransferStat, t: Translate): string {
    const done = formatBytes(stat.bytesDone, t);
    const rate = stat.bytesPerSecond === null ? "" : formatRate(stat.bytesPerSecond, t);
    const moved =
        stat.bytesTotal === null
            ? done
            : t(
                  "progress.transfer.of",
                  { done, total: formatBytes(stat.bytesTotal, t) },
                  "{done} of {total}",
              );
    if (rate === "") return moved;
    return t("progress.transfer.at", { moved, rate }, "{moved} at {rate}");
}
