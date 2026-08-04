/**
 * Calendar days for the changelog's date filter: parsing what a person types, and laying out
 * the months they can point at.
 *
 * A "day key" here is always `YYYY-MM-DD`. Everything downstream compares those strings, never
 * `Date` objects, which is what keeps the filter free of timezone drift: `new Date("2026-08-03")`
 * is midnight UTC, and printing it back in a western timezone gives the 2nd. A changelog whose
 * dates move depending on where it is read cannot be checked against the repository it
 * describes, so the only `Date` arithmetic in this file happens in UTC and comes straight back
 * out as a key.
 *
 * ### What the input accepts
 *
 * Plain ISO (`2026-08-04`) always, in every locale, because it is the form the changelog itself
 * prints and the form somebody pastes. The active locale's own numeric order as well
 * (`8/4/2026` in `en-US`, `04/08/2026` in `en-GB`), worked out from `Intl.DateTimeFormat`
 * rather than from a table of assumptions.
 *
 * ### What a failure does
 *
 * It reports, and it keeps what was typed. Half a date is `incomplete` rather than an error,
 * because somebody typing `2026-08` is not wrong yet, and a field that erases their work at the
 * fifth keystroke is a field nobody can use. A date that is genuinely not a date says which
 * kind of wrong it is, and the caller keeps the text on screen either way.
 */

/** A `YYYY-MM-DD` key, which is the only date representation this filter uses. */
export type DayKey = string;

export const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type DayParseError = "incomplete" | "unparsable" | "impossible";

export interface DayParse {
    /** The parsed day, or null when there is nothing usable yet. */
    readonly day: DayKey | null;
    /** Why there is no day. Null when the field is empty, which is a valid "no bound". */
    readonly error: DayParseError | null;
}

/* -------------------------------------------------------------------------- */
/* Key arithmetic                                                             */
/* -------------------------------------------------------------------------- */

function pad(value: number, width = 2): string {
    return String(value).padStart(width, "0");
}

/** True when a year/month/day triple is a real calendar date. */
export function isRealDate(year: number, month: number, day: number): boolean {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
        date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    );
}

export function dayKey(year: number, month: number, day: number): DayKey {
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function isDayKey(value: string): boolean {
    if (!DAY_KEY.test(value)) return false;
    const [year, month, day] = value.split("-").map(Number);
    return isRealDate(year ?? 0, month ?? 0, day ?? 0);
}

/** The day a `Date` falls on in the reader's own timezone, which is what "today" means here. */
export function todayKey(now: Date = new Date()): DayKey {
    return dayKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** The key `days` after `key`, negative to go back. UTC arithmetic, so no DST surprises. */
export function shiftDays(key: DayKey, days: number): DayKey {
    const [year, month, day] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1));
    date.setUTCDate(date.getUTCDate() + days);
    return dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** The first day of the month `months` away from the month `key` sits in. */
export function shiftMonths(key: DayKey, months: number): DayKey {
    const [year, month] = key.split("-").map(Number);
    const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1 + months, 1));
    return dayKey(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
}

/** Days in the month a key sits in. */
export function daysInMonth(year: number, month: number): number {
    return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/* -------------------------------------------------------------------------- */
/* Parsing what somebody types                                                */
/* -------------------------------------------------------------------------- */

/**
 * The order `year`, `month` and `day` appear in for a locale's numeric date format.
 *
 * Asked of `Intl` rather than assumed, because the assumption is wrong for most of the world
 * and wrong in a way that silently produces a valid-looking date: `04/08/2026` is the 4th of
 * August in `en-GB` and the 8th of April in `en-US`, and nothing about the digits says which.
 */
export function localeDateOrder(locale: string): ("year" | "month" | "day")[] {
    try {
        const parts = new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
        }).formatToParts(new Date(Date.UTC(2026, 7, 4)));
        const order = parts
            .map((part) => part.type)
            .filter((type): type is "year" | "month" | "day" =>
                type === "year" || type === "month" || type === "day",
            );
        if (order.length === 3) return order;
    } catch {
        // An unknown locale tag: fall through to the ISO order rather than throwing at a
        // keystroke. The ISO branch of the parser accepts that shape anyway.
    }
    return ["year", "month", "day"];
}

/**
 * An example of what this field accepts, for the hint under it.
 *
 * Built from the same `Intl` answer the parser uses, so the hint cannot promise a format the
 * parser would reject.
 */
export function dayInputHint(locale: string): string {
    const sample = new Date(Date.UTC(2026, 7, 4));
    let localised = "";
    try {
        localised = new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZone: "UTC",
        }).format(sample);
    } catch {
        localised = "";
    }
    return localised === "" || localised === "2026-08-04" ? "2026-08-04" : `2026-08-04, ${localised}`;
}

/**
 * Parses a typed date.
 *
 * ISO is tried first and unconditionally, so the form the changelog prints is always
 * understood no matter what locale is active. Anything else is read as the locale's numeric
 * order. A two-digit year is taken as this century, which is the only reading that is ever
 * meant in a field filtering a repository's own history.
 */
export function parseDayInput(text: string, locale: string): DayParse {
    const trimmed = text.trim();
    if (trimmed.length === 0) return { day: null, error: null };

    const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
    if (iso !== null) {
        const [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
        if (!isRealDate(year, month, day)) return { day: null, error: "impossible" };
        return { day: dayKey(year, month, day), error: null };
    }

    // A year alone, or a year and a month: not wrong, just not finished.
    if (/^\d{4}(-\d{0,2})?$/.test(trimmed)) return { day: null, error: "incomplete" };

    if (/[^\d\s./,-]/.test(trimmed)) return { day: null, error: "unparsable" };

    const numbers = trimmed.split(/[^\d]+/).filter((token) => token.length > 0);
    if (numbers.length < 3) return { day: null, error: "incomplete" };
    if (numbers.length > 3) return { day: null, error: "unparsable" };

    const order = localeDateOrder(locale);
    const values: Record<"year" | "month" | "day", number> = { year: 0, month: 0, day: 0 };
    for (const [index, field] of order.entries()) {
        const token = numbers[index] ?? "";
        values[field] = Number(token);
        if (field === "year" && token.length <= 2) values.year = 2000 + Number(token);
    }

    if (!isRealDate(values.year, values.month, values.day)) {
        return { day: null, error: "impossible" };
    }
    return { day: dayKey(values.year, values.month, values.day), error: null };
}

/** A day key rendered in the reader's locale, for a label rather than for a field. */
export function formatDay(key: DayKey, locale: string): string {
    const [year, month, day] = key.split("-").map(Number);
    try {
        return new Intl.DateTimeFormat(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",
            timeZone: "UTC",
        }).format(new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1)));
    } catch {
        return key;
    }
}

/* -------------------------------------------------------------------------- */
/* The month grid                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The weekday a calendar week starts on, 1 for Monday through 7 for Sunday.
 *
 * `Intl.Locale`'s week information is not implemented everywhere this app runs, so it is
 * feature-detected in both of the shapes engines have shipped it in, and the fallback is stated
 * rather than guessed at: Sunday for the locales that use it, Monday otherwise.
 */
export function weekStart(locale: string): number {
    try {
        const info = new Intl.Locale(locale) as Intl.Locale & {
            weekInfo?: { firstDay?: number };
            getWeekInfo?: () => { firstDay?: number };
        };
        const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
        if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) return firstDay;
    } catch {
        // Unknown tag: the fallback below is as good an answer as any.
    }
    const language = locale.toLowerCase();
    return language.startsWith("en-gb") || !language.startsWith("en") ? 1 : 7;
}

export interface CalendarDay {
    readonly key: DayKey;
    /** The day of the month, which is what the cell shows. */
    readonly day: number;
    /** False for the leading and trailing days borrowed from the neighbouring months. */
    readonly inMonth: boolean;
}

/**
 * Six weeks of days covering the given month, padded from its neighbours.
 *
 * Always six rows, so the grid does not change height as the months are paged through. A
 * calendar that grows and shrinks moves the buttons under the pointer of somebody clicking
 * through months, which is a small thing that makes a picker feel broken.
 */
export function monthGrid(year: number, month: number, startsOn: number): CalendarDay[][] {
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 = Sunday
    const isoFirst = firstWeekday === 0 ? 7 : firstWeekday;
    const lead = (isoFirst - startsOn + 7) % 7;

    const start = shiftDays(dayKey(year, month, 1), -lead);
    const weeks: CalendarDay[][] = [];
    let cursor = start;
    for (let week = 0; week < 6; week++) {
        const row: CalendarDay[] = [];
        for (let index = 0; index < 7; index++) {
            const parts = cursor.split("-").map(Number);
            row.push({
                key: cursor,
                day: parts[2] ?? 1,
                inMonth: (parts[1] ?? 0) === month && (parts[0] ?? 0) === year,
            });
            cursor = shiftDays(cursor, 1);
        }
        weeks.push(row);
    }
    return weeks;
}

/** Short weekday names in the grid's own order, for the column headers. */
export function weekdayLabels(locale: string, startsOn: number): string[] {
    // 2026-08-03 is a Monday, so adding (weekday - 1) lands on any weekday wanted.
    const monday = Date.UTC(2026, 7, 3);
    const labels: string[] = [];
    for (let offset = 0; offset < 7; offset++) {
        const weekday = ((startsOn - 1 + offset) % 7) + 1;
        const date = new Date(monday + (weekday - 1) * 86_400_000);
        try {
            labels.push(new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date));
        } catch {
            labels.push(String(weekday));
        }
    }
    return labels;
}

/** Month names for the month jump. */
export function monthLabels(locale: string): string[] {
    const labels: string[] = [];
    for (let month = 0; month < 12; month++) {
        const date = new Date(Date.UTC(2026, month, 15));
        try {
            labels.push(new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(date));
        } catch {
            labels.push(String(month + 1));
        }
    }
    return labels;
}

/* -------------------------------------------------------------------------- */
/* Presets                                                                    */
/* -------------------------------------------------------------------------- */

export type PresetId = "today" | "last7" | "last30" | "thisMonth" | "thisYear" | "all";

export interface DayRange {
    readonly from: DayKey | null;
    readonly to: DayKey | null;
}

export const PRESET_IDS: readonly PresetId[] = [
    "today",
    "last7",
    "last30",
    "thisMonth",
    "thisYear",
    "all",
];

/**
 * The range a preset means, relative to a day the caller supplies.
 *
 * `today` is a parameter rather than a call to `new Date()` inside, so the presets are testable
 * and so a viewer that has been open across midnight can be given a fresh answer instead of a
 * stale one baked in at mount.
 */
export function presetRange(id: PresetId, today: DayKey): DayRange {
    const [year, month] = today.split("-").map(Number);
    switch (id) {
        case "today":
            return { from: today, to: today };
        case "last7":
            return { from: shiftDays(today, -6), to: today };
        case "last30":
            return { from: shiftDays(today, -29), to: today };
        case "thisMonth":
            return {
                from: dayKey(year ?? 1970, month ?? 1, 1),
                to: dayKey(year ?? 1970, month ?? 1, daysInMonth(year ?? 1970, month ?? 1)),
            };
        case "thisYear":
            return { from: dayKey(year ?? 1970, 1, 1), to: dayKey(year ?? 1970, 12, 31) };
        case "all":
            return { from: null, to: null };
    }
}

/**
 * Puts a range the right way round.
 *
 * Clicking the end of a range before its start is an ordinary thing to do, and refusing it
 * with an error message teaches nothing. The two bounds are simply swapped, which is what the
 * user meant.
 */
export function orderRange(range: DayRange): DayRange {
    const { from, to } = range;
    if (from !== null && to !== null && from > to) return { from: to, to: from };
    return range;
}

/** True when a day sits inside a range, either bound optional. */
export function inRange(day: DayKey, range: DayRange): boolean {
    if (range.from !== null && day < range.from) return false;
    if (range.to !== null && day > range.to) return false;
    return true;
}
