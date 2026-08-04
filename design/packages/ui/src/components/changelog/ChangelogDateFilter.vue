<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCalendarRange, mdiChevronLeft, mdiChevronRight, mdiClose } from "@mdi/js";
import {
    VBtn,
    VCard,
    VCardText,
    VChip,
    VDivider,
    VMenu,
    VSelect,
    VTextField,
} from "vuetify/components";
import {
    type DayKey,
    type DayParseError,
    type PresetId,
    PRESET_IDS,
    dayInputHint,
    dayKey,
    formatDay,
    inRange,
    monthGrid,
    monthLabels,
    orderRange,
    parseDayInput,
    presetRange,
    shiftDays,
    shiftMonths,
    todayKey,
    weekStart,
    weekdayLabels,
} from "./changelogDates.js";

/**
 * The changelog's date filter: two typed fields, and a calendar anchored beside them.
 *
 * Both routes edit the same range and neither owns it. Typing `2026-08-04` moves the calendar
 * to August and highlights the day; clicking the 4th of August writes `2026-08-04` into the
 * field. What the two must never do is fight: the field's text is local state, and it is
 * rewritten from the range only when the range changed somewhere else, so a half-typed date is
 * never yanked out from under the person typing it.
 *
 * ### An invalid entry keeps what was typed
 *
 * This is the rule that makes the field usable. `2026-08` is reported as incomplete and left
 * alone, because somebody four keystrokes into a date has not made a mistake yet. `2026-02-31`
 * is reported as a date that does not exist. In both cases the text stays exactly as entered
 * and the range keeps its previous value, so nothing is silently applied and nothing is
 * silently discarded.
 *
 * ### The calendar is an overlay, and obeys the rules for one
 *
 * It is a card, so it paints its own background, border and elevation rather than letting the
 * page read through it. It is bounded to the viewport and scrolls inside that bound rather than
 * clipping its own last row, and it opens below and to the start of the button that summoned
 * it, so it never covers that button.
 */
const props = withDefaults(
    defineProps<{
        from: DayKey | null;
        to: DayKey | null;
        /** Oldest day the changelog records, which bounds the year jump. */
        earliest: DayKey | null;
        /** Newest day the changelog records. */
        latest: DayKey | null;
        /** Days that actually carry an entry, marked in the grid. */
        daysWithEntries?: ReadonlySet<string>;
    }>(),
    { daysWithEntries: () => new Set<string>() },
);

const emit = defineEmits<{ "update:from": [value: DayKey | null]; "update:to": [value: DayKey | null] }>();

const { t, locale } = useI18n();

const open = ref(false);
const gridRef = ref<HTMLElement | null>(null);

const localeTag = computed(() => (locale.value === "none" ? "en" : locale.value));

/**
 * Vuetify aside, `exactOptionalPropertyTypes` makes a defaulted optional prop `T | undefined`
 * at every use site, so it is normalised once here rather than coalesced in six places in the
 * template.
 */
const markedDays = computed(() => props.daysWithEntries ?? new Set<string>());
const starts = computed(() => weekStart(localeTag.value));
const months = computed(() => monthLabels(localeTag.value));
const weekdays = computed(() => weekdayLabels(localeTag.value, starts.value));
const hint = computed(() => dayInputHint(localeTag.value));

/* -------------------------------------------------------------------------- */
/* The two typed fields                                                       */
/* -------------------------------------------------------------------------- */

const fromText = ref(props.from ?? "");
const toText = ref(props.to ?? "");
const fromError = ref<DayParseError | null>(null);
const toError = ref<DayParseError | null>(null);

/**
 * Only rewrites the text when the range moved to a day the text does not already describe.
 *
 * Without that guard, typing into the field would round-trip through the parent and come back
 * as a reformatted string mid-keystroke.
 */
watch(
    () => props.from,
    (value) => {
        if (parseDayInput(fromText.value, localeTag.value).day !== value) fromText.value = value ?? "";
        fromError.value = null;
    },
);
watch(
    () => props.to,
    (value) => {
        if (parseDayInput(toText.value, localeTag.value).day !== value) toText.value = value ?? "";
        toError.value = null;
    },
);

function commit(which: "from" | "to", text: string): void {
    const parsed = parseDayInput(text, localeTag.value);
    if (which === "from") fromError.value = parsed.error;
    else toError.value = parsed.error;

    // An unusable entry leaves the range alone. Clearing it on every bad keystroke would make
    // the list flicker back to unfiltered while somebody is halfway through a date.
    if (parsed.error !== null) return;

    const next = orderRange(
        which === "from" ? { from: parsed.day, to: props.to } : { from: props.from, to: parsed.day },
    );
    if (next.from !== props.from) emit("update:from", next.from);
    if (next.to !== props.to) emit("update:to", next.to);
}

function messageFor(error: DayParseError | null): string {
    switch (error) {
        case "incomplete":
            return t("changelog.date.incomplete", { hint: hint.value }, "Keep going: a whole date looks like {hint}.");
        case "impossible":
            return t("changelog.date.impossible", "That date does not exist on the calendar.");
        case "unparsable":
            return t("changelog.date.unparsable", { hint: hint.value }, "This field reads dates like {hint}.");
        default:
            return "";
    }
}

const fromMessage = computed(() => messageFor(fromError.value));
const toMessage = computed(() => messageFor(toError.value));

/* -------------------------------------------------------------------------- */
/* The calendar                                                               */
/* -------------------------------------------------------------------------- */

const today = computed(() => todayKey());

/** The month on screen, as the first of that month. */
const viewMonth = ref(`${(props.from ?? props.latest ?? todayKey()).slice(0, 7)}-01`);

/** The day arrow keys move, which is the only cell in the grid that is tabbable. */
const focusDay = ref<DayKey>(props.from ?? props.latest ?? todayKey());

const viewYear = computed(() => Number(viewMonth.value.slice(0, 4)));
const viewMonthNumber = computed(() => Number(viewMonth.value.slice(5, 7)));
const weeks = computed(() => monthGrid(viewYear.value, viewMonthNumber.value, starts.value));

/**
 * The years the jump offers: every year the changelog covers, plus the year in view.
 *
 * Offering an unbounded list would be offering years this project did not exist in, and a
 * picker that lets somebody filter to 1997 is a picker that answers "no changes" to a question
 * nobody meant to ask.
 */
const years = computed(() => {
    const first = Number((props.earliest ?? today.value).slice(0, 4));
    const last = Number((props.latest ?? today.value).slice(0, 4));
    const set = new Set<number>();
    for (let year = Math.min(first, last); year <= Math.max(first, last); year++) set.add(year);
    set.add(viewYear.value);
    return [...set].sort((a, b) => b - a);
});

const monthOptions = computed(() =>
    months.value.map((title, index) => ({ title, value: index + 1 })),
);

function setMonth(month: number): void {
    viewMonth.value = dayKey(viewYear.value, month, 1);
}

function setYear(year: number): void {
    viewMonth.value = dayKey(year, viewMonthNumber.value, 1);
}

function stepMonth(delta: number): void {
    viewMonth.value = shiftMonths(viewMonth.value, delta);
}

const range = computed(() => ({ from: props.from, to: props.to }));

function isSelected(key: DayKey): boolean {
    return key === props.from || key === props.to;
}

function isInside(key: DayKey): boolean {
    if (props.from === null || props.to === null) return false;
    return inRange(key, range.value) && !isSelected(key);
}

/**
 * One click starts a range, the next completes it, the third starts over.
 *
 * A single click therefore filters to one day rather than doing nothing until a second click
 * arrives, which is the behaviour of a picker that has understood that most filters are a
 * single day.
 */
function pick(key: DayKey): void {
    focusDay.value = key;
    if (props.from === null || props.to !== null) {
        emit("update:from", key);
        emit("update:to", key);
        return;
    }
    const next = orderRange({ from: props.from, to: key });
    emit("update:from", next.from);
    emit("update:to", next.to);
}

function applyPreset(id: PresetId): void {
    const next = presetRange(id, today.value);
    emit("update:from", next.from);
    emit("update:to", next.to);
    if (next.from !== null) {
        viewMonth.value = `${next.from.slice(0, 7)}-01`;
        focusDay.value = next.from;
    }
}

function presetLabel(id: PresetId): string {
    switch (id) {
        case "today":
            return t("changelog.date.presetToday", "Today");
        case "last7":
            return t("changelog.date.presetLast7", "Last 7 days");
        case "last30":
            return t("changelog.date.presetLast30", "Last 30 days");
        case "thisMonth":
            return t("changelog.date.presetThisMonth", "This month");
        case "thisYear":
            return t("changelog.date.presetThisYear", "This year");
        case "all":
            return t("changelog.date.presetAll", "All time");
    }
}

function clear(): void {
    emit("update:from", null);
    emit("update:to", null);
    fromText.value = "";
    toText.value = "";
    fromError.value = null;
    toError.value = null;
}

/**
 * Arrow-key movement across the grid, with a roving tabindex.
 *
 * Forty-two focusable buttons would mean forty-two tab stops between the calendar and whatever
 * follows it, so exactly one cell is tabbable and the arrows move which one that is. Paging by
 * month and year is on PageUp/PageDown with and without Shift, which is what every other date
 * grid on this platform does.
 */
function onGridKey(event: KeyboardEvent): void {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const move = moves[event.key];
    let next: DayKey | null = null;

    if (move !== undefined) next = shiftDays(focusDay.value, move);
    else if (event.key === "Home") next = `${focusDay.value.slice(0, 7)}-01`;
    else if (event.key === "End") {
        const first = `${focusDay.value.slice(0, 7)}-01`;
        next = shiftDays(shiftMonths(first, 1), -1);
    } else if (event.key === "PageUp") next = shiftMonths(focusDay.value, event.shiftKey ? -12 : -1);
    else if (event.key === "PageDown") next = shiftMonths(focusDay.value, event.shiftKey ? 12 : 1);
    else return;

    event.preventDefault();
    focusDay.value = next;
    viewMonth.value = `${next.slice(0, 7)}-01`;
    void nextTick(() => {
        const cell = gridRef.value?.querySelector<HTMLElement>(`[data-day="${next}"]`);
        cell?.focus();
    });
}

/** The summary the collapsed control shows, which has to be true whatever the range is. */
const summary = computed(() => {
    const start = props.from === null ? null : formatDay(props.from, localeTag.value);
    const end = props.to === null ? null : formatDay(props.to, localeTag.value);
    if (start === null && end === null) return t("changelog.date.any", "Any date");
    if (start !== null && end !== null && start === end) {
        return t("changelog.date.on", { day: start }, "On {day}");
    }
    if (start !== null && end !== null) {
        return t("changelog.date.between", { from: start, to: end }, "{from} to {to}");
    }
    if (start !== null) return t("changelog.date.after", { from: start }, "From {from}");
    return t("changelog.date.before", { to: end }, "Up to {to}");
});

defineExpose({ summary });
</script>

<template>
    <div class="mb-changelog-dates">
        <v-text-field
            v-model="fromText"
            class="mb-changelog-dates__field"
            :label="t('changelog.date.from', 'From')"
            :placeholder="hint"
            :messages="fromMessage"
            :error="fromError !== null && fromError !== 'incomplete'"
            density="compact"
            variant="outlined"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details="auto"
            @update:model-value="(value: string) => commit('from', value)"
        />
        <v-text-field
            v-model="toText"
            class="mb-changelog-dates__field"
            :label="t('changelog.date.to', 'To')"
            :placeholder="hint"
            :messages="toMessage"
            :error="toError !== null && toError !== 'incomplete'"
            density="compact"
            variant="outlined"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details="auto"
            @update:model-value="(value: string) => commit('to', value)"
        />

        <v-btn
            class="mb-changelog-dates__open"
            :prepend-icon="mdiCalendarRange"
            :aria-label="t('changelog.date.calendar', 'Choose dates on a calendar')"
            :aria-expanded="open ? 'true' : 'false'"
            variant="tonal"
            size="small"
        >
            {{ summary }}
            <v-menu
                v-model="open"
                activator="parent"
                :close-on-content-click="false"
                location="bottom start"
                offset="8"
            >
                <!--
                    A card, so the overlay paints its own surface instead of letting the list
                    behind it read through the dates. Its own scroll container, so a viewport
                    too short for six weeks scrolls the calendar rather than cutting a week off
                    the bottom with nothing to say it is missing.
                -->
                <v-card
                    class="mb-changelog-calendar"
                    role="dialog"
                    :aria-label="t('changelog.date.calendar', 'Choose dates on a calendar')"
                >
                    <v-card-text class="mb-changelog-calendar__body">
                        <div class="mb-changelog-calendar__nav">
                            <v-btn
                                :icon="mdiChevronLeft"
                                :aria-label="t('changelog.date.previousMonth', 'Previous month')"
                                variant="text"
                                size="small"
                                @click="stepMonth(-1)"
                            />
                            <v-select
                                :model-value="viewMonthNumber"
                                :items="monthOptions"
                                :label="t('changelog.date.month', 'Month')"
                                density="compact"
                                variant="outlined"
                                hide-details
                                @update:model-value="(value: number) => setMonth(value)"
                            />
                            <v-select
                                :model-value="viewYear"
                                :items="years"
                                :label="t('changelog.date.year', 'Year')"
                                density="compact"
                                variant="outlined"
                                hide-details
                                @update:model-value="(value: number) => setYear(value)"
                            />
                            <v-btn
                                :icon="mdiChevronRight"
                                :aria-label="t('changelog.date.nextMonth', 'Next month')"
                                variant="text"
                                size="small"
                                @click="stepMonth(1)"
                            />
                        </div>

                        <div class="mb-changelog-calendar__weekdays" aria-hidden="true">
                            <span v-for="label in weekdays" :key="label">{{ label }}</span>
                        </div>

                        <div
                            ref="gridRef"
                            class="mb-changelog-calendar__grid"
                            role="grid"
                            :aria-label="t('changelog.date.grid', 'Days')"
                            @keydown="onGridKey"
                        >
                            <div v-for="(week, index) in weeks" :key="index" class="mb-changelog-calendar__week" role="row">
                                <button
                                    v-for="cell in week"
                                    :key="cell.key"
                                    :data-day="cell.key"
                                    type="button"
                                    role="gridcell"
                                    class="mb-changelog-calendar__day"
                                    :class="{
                                        'is-outside': !cell.inMonth,
                                        'is-selected': isSelected(cell.key),
                                        'is-inside': isInside(cell.key),
                                        'is-today': cell.key === today,
                                        'has-entries': markedDays.has(cell.key),
                                    }"
                                    :tabindex="cell.key === focusDay ? 0 : -1"
                                    :aria-selected="isSelected(cell.key) || isInside(cell.key) ? 'true' : 'false'"
                                    :aria-label="
                                        markedDays.has(cell.key)
                                            ? t(
                                                  'changelog.date.dayWithEntries',
                                                  { day: formatDay(cell.key, localeTag) },
                                                  '{day}, which has changelog entries',
                                              )
                                            : formatDay(cell.key, localeTag)
                                    "
                                    @click="pick(cell.key)"
                                >
                                    {{ cell.day }}
                                </button>
                            </div>
                        </div>

                        <v-divider class="mb-changelog-calendar__rule" />

                        <div class="mb-changelog-calendar__presets">
                            <v-chip
                                v-for="id in PRESET_IDS"
                                :key="id"
                                size="small"
                                variant="outlined"
                                link
                                @click="applyPreset(id)"
                            >
                                {{ presetLabel(id) }}
                            </v-chip>
                        </div>

                        <div class="mb-changelog-calendar__actions">
                            <v-btn
                                :prepend-icon="mdiClose"
                                variant="text"
                                size="small"
                                @click="clear"
                            >
                                {{ t("changelog.date.clear", "Clear the dates") }}
                            </v-btn>
                            <v-btn variant="text" size="small" @click="open = false">
                                {{ t("changelog.date.done", "Done") }}
                            </v-btn>
                        </div>
                    </v-card-text>
                </v-card>
            </v-menu>
        </v-btn>
    </div>
</template>

<style>
.mb-changelog-dates {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
}

.mb-changelog-dates__field {
    min-width: 9rem;
    max-width: 13rem;
    flex: 1 1 9rem;
}

.mb-changelog-dates__open {
    margin-block-start: 2px;
    max-width: 100%;
}

/*
 * The overlay's own bound. `min()` against the viewport is what keeps a short window from
 * clipping the last week of the grid, and the scroll is on the card rather than on the grid so
 * the presets underneath stay reachable too.
 */
.mb-changelog-calendar {
    max-height: min(80vh, 560px);
    max-width: min(96vw, 340px);
    overflow-y: auto;
}

.mb-changelog-calendar__body {
    padding: 12px;
}

.mb-changelog-calendar__nav {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-changelog-calendar__weekdays,
.mb-changelog-calendar__week {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}

.mb-changelog-calendar__weekdays {
    margin-block-start: 8px;
    font-size: 0.6875rem;
    text-align: center;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-changelog-calendar__grid {
    margin-block-start: 2px;
    display: grid;
    gap: 2px;
}

/* 32px keeps the target within reach of the platform's minimum at every display scale. */
.mb-changelog-calendar__day {
    min-height: 32px;
    min-width: 32px;
    border-radius: 8px;
    border: solid 1px transparent;
    background: transparent;
    color: rgb(var(--v-theme-on-surface));
    font-size: 0.8125rem;
    cursor: pointer;
    position: relative;
}

.mb-changelog-calendar__day:hover {
    background: rgba(var(--v-theme-on-surface), 0.08);
}

.mb-changelog-calendar__day:focus-visible {
    outline: solid 2px rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

.mb-changelog-calendar__day.is-outside {
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-changelog-calendar__day.is-today {
    border-color: rgba(var(--v-theme-primary), 0.6);
}

.mb-changelog-calendar__day.is-inside {
    background: rgba(var(--v-theme-primary), 0.14);
}

.mb-changelog-calendar__day.is-selected {
    background: rgb(var(--v-theme-primary));
    color: rgb(var(--v-theme-on-primary));
}

/* A dot for a day that carries an entry. Named in the button's label too, never colour alone. */
.mb-changelog-calendar__day.has-entries::after {
    content: "";
    position: absolute;
    inset-block-end: 3px;
    inset-inline-start: 50%;
    translate: -50% 0;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.7;
}

.mb-changelog-calendar__rule {
    margin-block: 10px 8px;
}

.mb-changelog-calendar__presets {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.mb-changelog-calendar__actions {
    margin-block-start: 8px;
    display: flex;
    justify-content: space-between;
    gap: 4px;
}
</style>
