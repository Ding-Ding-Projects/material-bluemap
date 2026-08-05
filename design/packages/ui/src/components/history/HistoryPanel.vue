<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCameraPlusOutline,
    mdiContentCopy,
    mdiDownload,
    mdiFilterVariant,
    mdiFolderClockOutline,
    mdiRefresh,
    mdiScissorsCutting,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VDivider,
    VIcon,
    VMenu,
    VNumberInput,
    VProgressLinear,
} from "vuetify/components";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ChangelogDateFilter from "../changelog/ChangelogDateFilter.vue";
import { formatDay, type DayKey } from "../changelog/changelogDates.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import MenuSearchList, { type MenuSearchItem } from "../menuSearch/MenuSearchList.vue";
import { raiseNotice } from "../../stores/notices.js";

import HistoryComparison from "./HistoryComparison.vue";
import HistoryRevisionRow from "./HistoryRevisionRow.vue";
import { readableDiff } from "./historyDiff.js";
import { mergeSettingsBack } from "./historyRestore.js";
import {
    actionFacets,
    daysWithRevisions,
    exportComparison,
    exportRevisions,
    filterRevisions,
    historySpan,
    searchCorpus,
    EXPORT_EXTENSIONS,
    type ExportFormat,
} from "./historyModel.js";
import { currentRevisionId, groupRevisionsByDay } from "./historyTimeline.js";
import {
    useHistoryHost,
    type HistoryComparisonFile,
    type HistoryHost,
    type HistoryListing,
    type HistoryRevision,
    type HistoryStatus,
} from "./historyHost.js";

/**
 * The version history of one BlueMap config folder: browse, compare, diff, restore, label,
 * trim and export.
 *
 * ### What this panel is looking at
 *
 * A separate Git repository, kept beside this application's own data, holding a mirror of
 * the config folder. Never a `.git` inside the folder the person chose - the header states
 * where the repository actually is, because a version-control feature that does not say
 * where it put a repository is one people rightly distrust.
 *
 * ### Why a restore is safe to press
 *
 * The main process snapshots what is on disk *before* it writes anything back, then records
 * the restore as a new revision on top. Nothing is rewritten and nothing is dropped, so the
 * state a restore replaced is still in this list afterwards and can be restored in turn.
 * That is the property that makes this panel usable rather than frightening, and it is
 * worth saying on screen, which the footer does. It holds for a whole-folder restore, for a
 * single file, and for a single setting alike.
 *
 * ### Any two revisions, not only a revision and its parent
 *
 * Choosing A on one row and B on another compares them however far apart they are. This is
 * the question people actually arrive with - "what has changed since the config last
 * worked" - and without it they were reading four patches and merging them in their head,
 * or giving up and restoring the whole folder, which loses every good change made since.
 *
 * ### Grouped by day, with the live state marked
 *
 * A history that is doing its job gets long, and forty rows of timestamps is not something
 * anybody scans. The rows are grouped by their local day with a summary per day, and the
 * revision that is on disk right now is marked from the *unfiltered* list, because the
 * newest row of a filtered view is merely the newest thing that matched.
 *
 * ### Only one thing here destroys anything
 *
 * Trimming a history removes revisions for good. It is the single call on the host that
 * takes anything away, and the single control in this panel behind the two-key
 * super-confirmation gate. Everything else, restore included, only ever adds.
 *
 * ### Appearance
 *
 * The whole panel is one `AppearanceTarget`, under `history.panel`, so it carries the same
 * right-click **Edit appearance...**, the same keyboard path, and the same non-modal,
 * anchored editor as everything else in this application.
 */
const props = withDefaults(
    defineProps<{
        /** The config folder whose history this is. Absolute. */
        folder: string;
        /** Injected in tests; the desktop shell's bridge is found automatically. */
        host?: HistoryHost | null;
        /** Rows shown before the list scrolls inside its own bound. */
        maxRows?: number;
    }>(),
    // `host` deliberately has no default. Under `exactOptionalPropertyTypes` a default of
    // `undefined` is not assignable, and the distinction matters anyway: absent means "find
    // the shell's bridge", whereas an explicit `null` means "there is no host", which is
    // what the test for the browser-tab case passes in.
    { maxRows: 200 },
);

const { t, locale } = useI18n();

const injected = useHistoryHost();
const host = computed<HistoryHost | null>(() => (props.host === undefined ? injected : props.host));

const status = ref<HistoryStatus | null>(null);
const listing = ref<HistoryListing | null>(null);
const loading = ref(false);
const busy = ref(false);

const localeTag = computed(() => (locale.value === "none" ? "en" : locale.value));

/**
 * What the host can do beyond the eight methods every build has.
 *
 * Asked of the host rather than assumed, because a desktop shell built before these
 * arrived still keeps a perfectly good history and must not lose the panel over three
 * controls. Each is offered only when its method is really there.
 */
const canCompare = computed(() => typeof host.value?.compare === "function");
const canRestorePart = computed(
    () => typeof host.value?.restoreFiles === "function" && typeof host.value?.restoreSettings === "function",
);

/* -------------------------------------------------------------------------- */
/* The three filters                                                          */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const from = ref<DayKey | null>(null);
const to = ref<DayKey | null>(null);
const chosenActions = ref<string[]>([]);

/**
 * The filter row starts collapsed.
 *
 * It describes the collection rather than changing it until somebody touches it, and a
 * panel whose controls take more room than its content has buried the content. The count
 * beside the toggle is what keeps a collapsed row from hiding an active filter silently.
 */
const filtersOpen = ref(false);

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

const exportOpen = ref(false);

const exportItems = computed<MenuSearchItem[]>(() => [
    { id: "markdown", label: t("history.exportMarkdown", "Markdown file") },
    { id: "json", label: t("history.exportJson", "JSON file") },
    { id: "csv", label: t("history.exportCsv", "CSV file") },
    { id: "text", label: t("history.exportPlain", "Plain text file") },
]);

function chooseExport(id: string): void {
    exportOpen.value = false;
    download(id as ExportFormat);
}

const revisions = computed<readonly HistoryRevision[]>(() => listing.value?.revisions ?? []);
const facets = computed(() => actionFacets(revisions.value));
const span = computed(() => historySpan(revisions.value));
const markedDays = computed(() => daysWithRevisions(revisions.value));

const outcome = computed(() =>
    filterRevisions(revisions.value, {
        query: query.value,
        regex: regex.value,
        flags: flags.value,
        range: { from: from.value, to: to.value },
        actions: chosenActions.value,
    }),
);

const shown = computed(() => outcome.value.revisions.slice(0, props.maxRows ?? 200));

/**
 * The revision that is on disk now, taken from the whole history rather than from the view.
 *
 * Marking the first filtered row would be a confident lie in exactly the situation where
 * being wrong about which state is live matters most: somebody hunting through a filtered
 * history for something to restore.
 */
const liveId = computed(() => currentRevisionId(revisions.value));

/** The timeline: the filtered rows, grouped by the local day they fall on. */
const days = computed(() => groupRevisionsByDay(shown.value, liveId.value));

/** Real text for the regex builder's preview, so it previews this history and not a sample. */
const sample = computed(() =>
    revisions.value
        .slice(0, 40)
        .map((revision) => searchCorpus(revision).split("\n")[0] ?? "")
        .join("\n"),
);

const summary = computed(() => {
    const total = revisions.value.length;
    const kept = outcome.value.revisions.length;
    if (total === 0) return "";
    return kept === total
        ? t("history.summaryAll", { total: String(total) }, "{total} revisions")
        : t("history.summary", { kept: String(kept), total: String(total) }, "Showing {kept} of {total} revisions");
});

const activeFilterCount = computed(() => {
    let count = 0;
    if (query.value !== "") count += 1;
    if (from.value !== null || to.value !== null) count += 1;
    count += chosenActions.value.length;
    return count;
});

function toggleAction(action: string): void {
    chosenActions.value = chosenActions.value.includes(action)
        ? chosenActions.value.filter((entry) => entry !== action)
        : [...chosenActions.value, action];
}

function clearFilters(): void {
    query.value = "";
    regex.value = false;
    from.value = null;
    to.value = null;
    chosenActions.value = [];
}

/** A day header, spelled out, with a plain sentence for the undated group. */
function dayTitle(day: DayKey | null): string {
    if (day === null) return t("history.timeline.undated", "Revisions with no readable date");
    return formatDay(day, localeTag.value);
}

/* -------------------------------------------------------------------------- */
/* What a screen reader is told                                               */
/* -------------------------------------------------------------------------- */

/**
 * The one live region for the whole panel.
 *
 * Announcements that only exist on screen - which row the arrows moved to, which end of a
 * comparison was chosen - are invisible to somebody who cannot see the highlight. One
 * polite region carrying a whole sentence is the smallest thing that fixes that; several
 * regions, or a region carrying a fragment, produce announcements that interrupt each other
 * and say less than nothing.
 */
const announcement = ref("");

function announce(message: string): void {
    announcement.value = message;
}

/* -------------------------------------------------------------------------- */
/* Talking to the host                                                        */
/* -------------------------------------------------------------------------- */

const diffs = ref<Record<string, readonly HistoryComparisonFile[]>>({});
const diffErrors = ref<Record<string, string>>({});
const expanded = ref<string | null>(null);

async function refresh(): Promise<void> {
    const current = host.value;
    if (current === null || props.folder === "") return;

    loading.value = true;
    try {
        status.value = await current.status();
        listing.value = await current.list(props.folder);
    } finally {
        loading.value = false;
    }
    // A revision's diff belongs to a revision, and after a reload the ones on screen may
    // not be the ones that were cached.
    diffs.value = {};
    diffErrors.value = {};
    comparison.value = null;
    comparisonError.value = null;
    if (compareA.value !== null || compareB.value !== null) void loadComparison();
}

onMounted(() => void refresh());
watch(
    () => props.folder,
    () => void refresh(),
);

/**
 * Fetches one revision's changes against whatever came before it.
 *
 * Prefers `compare`, which sends both sides' text and so lets the readable diff name the
 * setting, and falls back to `diff`, which only carries the patch. The fallback is why a
 * shell that predates `compare` still opens rows: it gets the raw patch, which is what it
 * always got.
 */
async function toggleDiff(id: string): Promise<void> {
    if (expanded.value === id) {
        expanded.value = null;
        return;
    }
    expanded.value = id;

    const current = host.value;
    if (current === null || diffs.value[id] !== undefined) return;

    if (typeof current.compare === "function") {
        const answer = await current.compare(props.folder, null, id);
        if (answer.ok) diffs.value = { ...diffs.value, [id]: answer.files };
        else diffErrors.value = { ...diffErrors.value, [id]: answer.message };
        return;
    }

    const answer = await current.diff(props.folder, id);
    if (answer.ok) {
        diffs.value = {
            ...diffs.value,
            [id]: answer.files.map((file) => ({ ...file, before: null, after: null, withheld: null })),
        };
    } else {
        diffErrors.value = { ...diffErrors.value, [id]: answer.message };
    }
}

async function snapshotNow(): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const written = await current.snapshot(props.folder);
        if (!written.ok) raiseNotice("error", written.message);
        else if (written.revision === null) raiseNotice("info", written.message);
        else raiseNotice("success", t("history.snapshotTaken", { label: written.message }, "Recorded: {label}"));
        if (written.ok) await refresh();
    } finally {
        busy.value = false;
    }
}

/** Reports a restore's outcome the same way whichever of the three kinds it was. */
function reportRestore(
    restored: { ok: true; message: string; skipped: readonly { path: string; reason: string }[] } | { ok: false; message: string },
): boolean {
    if (!restored.ok) {
        raiseNotice("error", restored.message);
        return false;
    }
    raiseNotice("success", restored.message);
    for (const skip of restored.skipped) {
        raiseNotice(
            "warning",
            t(
                "history.restoreSkipped",
                { path: skip.path },
                "{path} was left alone, because this editor does not write that file.",
            ),
            skip.reason,
        );
    }
    return true;
}

async function restore(id: string): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const restored = await current.restore(props.folder, id);
        if (reportRestore(restored)) await refresh();
    } finally {
        busy.value = false;
    }
}

/** Puts one file back, leaving every other file in the folder exactly as it is. */
async function restoreOneFile(id: string, path: string): Promise<void> {
    const current = host.value;
    if (current === null || typeof current.restoreFiles !== "function") return;

    busy.value = true;
    try {
        const restored = await current.restoreFiles(props.folder, id, [path]);
        if (reportRestore(restored)) await refresh();
    } finally {
        busy.value = false;
    }
}

/**
 * Puts one setting back, merging it into the file as it is now.
 *
 * The merge happens here rather than in the main process because the HOCON reader and
 * writer that keep comments are this package's. What the main process still does is check
 * the revision exists, check the path is one it would write, snapshot the folder first, and
 * record the result as a new revision. A merge that comes to nothing - because the setting
 * already holds that value, or the file is gone - is reported, never written.
 */
async function restoreOneSetting(id: string, path: string, key: string): Promise<void> {
    const current = host.value;
    if (current === null || typeof current.restoreSettings !== "function") return;

    busy.value = true;
    try {
        const atRevision = await current.revisionFiles(props.folder, id);
        if (!atRevision.ok) {
            raiseNotice("error", atRevision.message);
            return;
        }
        const now = liveId.value === null ? null : await current.revisionFiles(props.folder, liveId.value);
        if (now !== null && !now.ok) {
            raiseNotice("error", now.message);
            return;
        }

        const plan = mergeSettingsBack(
            [{ path, key }],
            new Map(atRevision.files.map((file) => [file.path, file.text])),
            new Map((now?.ok === true ? now.files : []).map((file) => [file.path, file.text])),
        );

        for (const refusal of plan.refused) {
            raiseNotice(
                "warning",
                t(
                    "history.settingRefused",
                    { key: refusal.key },
                    "{key} was left as it is.",
                ),
                refusal.reason,
            );
        }
        for (const reformatted of plan.reformatted) {
            raiseNotice(
                "info",
                t(
                    "history.settingReformatted",
                    { path: reformatted },
                    "{path} is written out again in this editor's own layout, because JSON keeps no comments to preserve.",
                ),
            );
        }
        if (plan.files.length === 0) return;

        const restored = await current.restoreSettings(props.folder, id, plan.files, plan.keys);
        if (reportRestore(restored)) await refresh();
    } finally {
        busy.value = false;
    }
}

async function applyLabel(id: string, text: string): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const written = await current.label(props.folder, id, text);
        raiseNotice(written.ok ? "success" : "error", written.message);
        if (written.ok) await refresh();
    } finally {
        busy.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Comparing any two revisions                                                */
/* -------------------------------------------------------------------------- */

const compareA = ref<string | null>(null);
const compareB = ref<string | null>(null);
const comparison = ref<readonly HistoryComparisonFile[] | null>(null);
const comparisonError = ref<string | null>(null);

const revisionA = computed(() => revisions.value.find((entry) => entry.id === compareA.value) ?? null);
const revisionB = computed(() => revisions.value.find((entry) => entry.id === compareB.value) ?? null);
const comparing = computed(() => compareA.value !== null || compareB.value !== null);

function roleOf(id: string): "a" | "b" | null {
    if (compareA.value === id) return "a";
    if (compareB.value === id) return "b";
    return null;
}

/**
 * Chooses one end of the comparison.
 *
 * Picking a revision that is already the other end swaps them rather than leaving one
 * revision as both ends, which would compare a moment with itself and report nothing. The
 * announcement names which end it became, because on screen that is a small coloured chip
 * and nothing else.
 */
function pick(id: string, end: "a" | "b"): void {
    if (end === "a") {
        if (compareB.value === id) compareB.value = compareA.value;
        compareA.value = compareA.value === id ? null : id;
    } else {
        if (compareA.value === id) compareA.value = compareB.value;
        compareB.value = compareB.value === id ? null : id;
    }

    const revision = revisions.value.find((entry) => entry.id === id);
    const chosen = roleOf(id);
    announce(
        chosen === null
            ? t("history.compare.unpicked", { label: revision?.label ?? "" }, "{label} is no longer part of the comparison.")
            : chosen === "a"
              ? t("history.compare.pickedA", { label: revision?.label ?? "" }, "{label} is now A, the older end.")
              : t("history.compare.pickedB", { label: revision?.label ?? "" }, "{label} is now B, the newer end."),
    );

    void loadComparison();
}

function swapEnds(): void {
    const held = compareA.value;
    compareA.value = compareB.value;
    compareB.value = held;
    announce(t("history.compare.swapped", "The comparison now runs the other way round."));
    void loadComparison();
}

function stopComparing(): void {
    compareA.value = null;
    compareB.value = null;
    comparison.value = null;
    comparisonError.value = null;
    announce(t("history.compare.stopped", "The comparison is closed."));
}

/**
 * A restore asked for from inside the comparison, which always goes back to A.
 *
 * B is the newer end and usually half of what is on disk already; "put this back" from a
 * comparison can only sensibly mean "return it to how A had it". The guard is not
 * defensive noise: the comparison only renders its restore controls once both ends are
 * chosen, but a null id would reach the main process as an unrecognised revision and come
 * back as a refusal the user could not explain.
 */
function restoreFromComparison(path: string, key: string | null): void {
    const older = compareA.value;
    if (older === null) return;
    if (key === null) void restoreOneFile(older, path);
    else void restoreOneSetting(older, path, key);
}

async function loadComparison(): Promise<void> {
    const current = host.value;
    comparison.value = null;
    comparisonError.value = null;
    if (current === null || typeof current.compare !== "function") return;
    if (compareA.value === null || compareB.value === null) return;

    const answer = await current.compare(props.folder, compareA.value, compareB.value);
    if (answer.ok) comparison.value = answer.files;
    else comparisonError.value = answer.message;
}

/* -------------------------------------------------------------------------- */
/* Walking the list with the keyboard                                         */
/* -------------------------------------------------------------------------- */

/**
 * Which row the arrow keys would move away from.
 *
 * One row in the list is reachable with Tab and the rest are not, which is the roving
 * tabindex pattern: it keeps a two-hundred-row history from being two hundred tab stops
 * standing between the search field and the retention control. Tab still reaches every
 * control *inside* the focused row.
 */
const activeIndex = ref(0);

/**
 * Keyed by revision id rather than by position, which is not a detail.
 *
 * The rows are drawn inside per-day sections, so a row's position in the flat list is not
 * its position in any one of them; and a filter can renumber every row between one render
 * and the next. A map keyed by position would then hand out the wrong element to focus, and
 * the arrow keys would appear to skip rows at random.
 */
const rowRefs = new Map<string, { focusRow: () => void }>();

function keepRow(id: string, instance: unknown): void {
    if (instance === null || instance === undefined) rowRefs.delete(id);
    else rowRefs.set(id, instance as { focusRow: () => void });
}

/** Row `index` of the flat filtered list, whatever day it happens to sit under. */
function focusRowAt(index: number): void {
    const bounded = Math.max(0, Math.min(index, shown.value.length - 1));
    activeIndex.value = bounded;

    const revision = shown.value[bounded];
    if (revision === undefined) return;

    rowRefs.get(revision.id)?.focusRow();
    announce(
        t(
            "history.row.position",
            { position: String(bounded + 1), total: String(shown.value.length), label: revision.label },
            "{position} of {total}. {label}",
        ),
    );
}

/**
 * The list's keyboard, handled once at the list rather than per row.
 *
 * Everything is ignored unless the event came from a row itself, which is what
 * `data-revision` marks. Without that check, typing the letter `a` into the label field
 * inside a row would choose that row as the comparison's older end, and the user would have
 * no idea why.
 */
function onListKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target === null || target.dataset["revision"] === undefined) return;

    const id = target.dataset["revision"];
    const index = shown.value.findIndex((revision) => revision.id === id);
    if (index === -1) return;

    switch (event.key) {
        case "ArrowDown":
            event.preventDefault();
            focusRowAt(index + 1);
            return;
        case "ArrowUp":
            event.preventDefault();
            focusRowAt(index - 1);
            return;
        case "Home":
            event.preventDefault();
            focusRowAt(0);
            return;
        case "End":
            event.preventDefault();
            focusRowAt(shown.value.length - 1);
            return;
        case "Enter":
        case " ":
            event.preventDefault();
            void toggleDiff(id);
            return;
        case "Escape":
            if (!comparing.value) return;
            event.preventDefault();
            stopComparing();
            return;
        default:
            break;
    }

    if (!canCompare.value) return;
    if (event.key === "a" || event.key === "A") {
        event.preventDefault();
        pick(id, "a");
    } else if (event.key === "b" || event.key === "B") {
        event.preventDefault();
        pick(id, "b");
    }
}

/** Clicking a row makes it the one the arrows move from, so the two never disagree. */
function onListFocusIn(event: FocusEvent): void {
    const target = (event.target as HTMLElement | null)?.closest("[data-revision]") as HTMLElement | null;
    const id = target?.dataset["revision"];
    if (id === undefined) return;
    const index = shown.value.findIndex((revision) => revision.id === id);
    if (index !== -1) activeIndex.value = index;
}

// A filter that shortens the list can leave the active index past its end, which would make
// the next arrow press focus nothing at all.
watch(shown, (rows) => {
    if (activeIndex.value > rows.length - 1) activeIndex.value = Math.max(0, rows.length - 1);
});

/* -------------------------------------------------------------------------- */
/* Retention                                                                  */
/* -------------------------------------------------------------------------- */

const keep = ref(50);

const wouldDrop = computed(() => Math.max(0, revisions.value.length - Math.max(1, keep.value)));

const trimAffected = computed(() =>
    outcome.value.revisions
        .slice(Math.max(1, keep.value))
        .slice(0, 8)
        .map((revision) => `${revision.shortId}  ${revision.label}`),
);

/**
 * Removes every revision older than the newest `keep`.
 *
 * The one destructive action in this panel, which is why the button that reaches it is the
 * activator of a super-confirmation gate rather than a button. What it removes cannot be
 * restored by anything in this application afterwards, and the gate's copy says exactly
 * that with the count in it.
 */
async function trimHistory(): Promise<void> {
    const current = host.value;
    if (current === null) return;

    busy.value = true;
    try {
        const written = await current.discardOlderRevisions(props.folder, Math.max(1, keep.value));
        raiseNotice(written.ok ? "success" : "error", written.message);
        if (written.ok) await refresh();
    } finally {
        busy.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

const exportLabels = computed(() => ({
    title: t("history.exportTitle", "BlueMap config history"),
    folder: t("history.exportFolder", { folder: props.folder }, "Config folder: {folder}"),
    repository: t(
        "history.exportRepository",
        { repository: listing.value?.repository ?? "" },
        "History repository: {repository}",
    ),
    range: outcome.value.active
        ? t(
              "history.exportFiltered",
              {
                  kept: String(outcome.value.revisions.length),
                  total: String(revisions.value.length),
                  days: String(days.value.length),
              },
              "This file holds {kept} of {total} revisions, across {days} days, the ones the filters on screen matched.",
          )
        : t("history.exportAll", "This file holds every revision recorded for this folder."),
    empty: t("history.exportEmpty", "Nothing matched these filters."),
}));

function exportText(format: ExportFormat): string {
    return exportRevisions(outcome.value.revisions, format, exportLabels.value);
}

const comparisonLabels = computed(() => ({
    title: t("history.compare.exportTitle", "What changed between two revisions"),
    between: t(
        "history.compare.exportBetween",
        {
            a: revisionA.value?.shortId ?? "",
            aLabel: revisionA.value?.label ?? "",
            b: revisionB.value?.shortId ?? "",
            bLabel: revisionB.value?.label ?? "",
        },
        "From {a} ({aLabel}) to {b} ({bLabel}).",
    ),
    empty: t("history.compare.exportEmpty", "These two moments hold exactly the same files."),
}));

function comparisonText(format: ExportFormat): string {
    return exportComparison(readableDiff(comparison.value ?? []), format, comparisonLabels.value);
}

/** Writes text to the shell's clipboard when there is one, and to the browser's otherwise. */
async function copyText(text: string): Promise<void> {
    try {
        const bridge = typeof window === "undefined" ? undefined : window.materialBluemap;
        if (bridge) await bridge.writeClipboardText(text);
        else await navigator.clipboard.writeText(text);
        raiseNotice("success", t("history.copied", "What is on screen is on the clipboard."));
    } catch {
        raiseNotice("error", t("history.copyFailed", "Could not reach the clipboard."));
    }
}

async function copyView(): Promise<void> {
    await copyText(exportText("markdown"));
}

async function copyComparison(): Promise<void> {
    await copyText(comparisonText("markdown"));
}

function saveFile(name: string, text: string, format: ExportFormat): void {
    const blob = new Blob([text], {
        type: format === "json" ? "application/json" : format === "csv" ? "text/csv" : "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    raiseNotice("success", t("history.exported", { name }, "Exported {name}."));
}

function download(format: ExportFormat): void {
    saveFile(`bluemap-config-history.${EXPORT_EXTENSIONS[format]}`, exportText(format), format);
}

function downloadComparison(format: ExportFormat): void {
    saveFile(`bluemap-config-comparison.${EXPORT_EXTENSIONS[format]}`, comparisonText(format), format);
}

/* -------------------------------------------------------------------------- */
/* What this panel can say about itself                                       */
/* -------------------------------------------------------------------------- */

const unavailable = computed<string | null>(() => {
    if (host.value === null) {
        return t(
            "history.noHost",
            "This build has no version history, because it is running without the desktop shell that keeps one.",
        );
    }
    if (status.value !== null && !status.value.available) return status.value.reason;
    if (listing.value !== null && !listing.value.available) return listing.value.reason;
    return null;
});

const canWrite = computed(() => host.value !== null && unavailable.value === null);
</script>

<template>
    <AppearanceTarget id="history.panel" :label="t('history.title', 'Version history')" as="div">
    <v-card class="mb-history" :aria-label="t('history.title', 'Version history')">
        <v-card-text>
            <header class="mb-history__head">
                <v-icon :icon="mdiFolderClockOutline" size="24" aria-hidden="true" />
                <div class="mb-history__headText">
                    <h2 class="mb-history__title">{{ t("history.title", "Version history") }}</h2>
                    <p class="mb-history__subtitle">
                        {{
                            t(
                                "history.subtitle",
                                "Every change to this config folder is recorded, so anything you create, edit or delete can be put back.",
                            )
                        }}
                    </p>
                </div>
                <v-btn
                    :icon="mdiRefresh"
                    :aria-label="t('history.reload', 'Read this folder\'s history again')"
                    variant="text"
                    size="small"
                    density="comfortable"
                    :disabled="loading || busy"
                    @click="refresh"
                />
            </header>

            <v-progress-linear v-if="loading || busy" indeterminate color="primary" class="mb-history__progress" />

            <p class="mb-history__announce" role="status" aria-live="polite">{{ announcement }}</p>

            <v-alert v-if="unavailable" type="info" variant="tonal" density="comfortable" class="mb-history__notice">
                {{ unavailable }}
            </v-alert>

            <template v-else>
                <div class="mb-history__toolbar">
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regex"
                        v-model:flags="flags"
                        :label="t('history.search', 'Search this history')"
                        :placeholder="t('history.searchHint', 'A map name, a label, a revision')"
                        :sample="sample"
                        :summary="summary"
                        class="mb-history__search"
                    />

                    <div class="mb-history__toolbarActions">
                        <v-btn
                            :prepend-icon="mdiCameraPlusOutline"
                            variant="tonal"
                            size="small"
                            :disabled="!canWrite || busy"
                            @click="snapshotNow"
                        >
                            {{ t("history.snapshot", "Record now") }}
                        </v-btn>

                        <v-btn
                            :prepend-icon="mdiContentCopy"
                            variant="text"
                            size="small"
                            :aria-label="t('history.copyView', 'Copy what is on screen to the clipboard')"
                            @click="copyView"
                        >
                            {{ t("history.copy", "Copy") }}
                        </v-btn>

                        <v-btn
                            :prepend-icon="mdiDownload"
                            variant="text"
                            size="small"
                            :aria-label="t('history.exportView', 'Export what is on screen to a file')"
                            :aria-expanded="exportOpen ? 'true' : 'false'"
                            aria-haspopup="menu"
                        >
                            {{ t("history.export", "Export") }}
                            <v-menu
                                v-model="exportOpen"
                                activator="parent"
                                :close-on-content-click="false"
                                location="bottom end"
                            >
                                <!--
                                    Rendered from `exportOpen` itself rather than only from
                                    the menu's own visibility, so choosing a format unmounts
                                    the search field and its query immediately rather than
                                    waiting on the overlay's own close transition to finish.
                                -->
                                <MenuSearchList
                                    v-if="exportOpen"
                                    :items="exportItems"
                                    :label="t('history.exportView', 'Export what is on screen to a file')"
                                    @choose="chooseExport"
                                />
                            </v-menu>
                        </v-btn>

                        <v-btn
                            :prepend-icon="mdiFilterVariant"
                            variant="text"
                            size="small"
                            :aria-expanded="filtersOpen ? 'true' : 'false'"
                            aria-controls="mb-history-filters"
                            @click="filtersOpen = !filtersOpen"
                        >
                            {{ t("history.filters", "Filters") }}
                            <v-chip v-if="activeFilterCount > 0" size="x-small" class="ms-1" label>
                                {{ activeFilterCount }}
                            </v-chip>
                        </v-btn>
                    </div>
                </div>

                <div v-show="filtersOpen" id="mb-history-filters" class="mb-history__filters">
                    <ChangelogDateFilter
                        v-model:from="from"
                        v-model:to="to"
                        :earliest="span.earliest"
                        :latest="span.latest"
                        :days-with-entries="markedDays"
                    />

                    <div
                        class="mb-history__actions"
                        role="group"
                        :aria-label="t('history.actionFilter', 'Filter by what a revision did')"
                    >
                        <v-chip
                            v-for="facet in facets"
                            :key="facet.action"
                            :aria-pressed="chosenActions.includes(facet.action) ? 'true' : 'false'"
                            :color="chosenActions.includes(facet.action) ? 'primary' : undefined"
                            :variant="chosenActions.includes(facet.action) ? 'flat' : 'tonal'"
                            size="small"
                            label
                            @click="toggleAction(facet.action)"
                        >
                            {{ facet.action }}
                            <span class="mb-history__facetCount">{{ facet.count }}</span>
                        </v-chip>
                        <span v-if="facets.length === 0" class="mb-history__quiet">
                            {{ t("history.noActions", "Nothing has been recorded yet, so there is nothing to filter.") }}
                        </span>
                    </div>

                    <v-btn v-if="activeFilterCount > 0" variant="text" size="small" @click="clearFilters">
                        {{ t("history.clearFilters", "Clear every filter") }}
                    </v-btn>
                </div>

                <HistoryComparison
                    v-if="comparing"
                    :from="revisionA"
                    :to="revisionB"
                    :files="comparison"
                    :error="comparisonError"
                    :restorable="canWrite && canRestorePart"
                    :busy="busy"
                    @swap="swapEnds"
                    @close="stopComparing"
                    @copy="copyComparison"
                    @download="downloadComparison"
                    @restore-setting="restoreFromComparison"
                    @restore-file="(path) => restoreFromComparison(path, null)"
                />

                <v-divider class="my-2" />

                <p v-if="canCompare && !comparing" class="mb-history__quiet">
                    {{
                        t(
                            "history.compare.hint",
                            "Choose A on one revision and B on another to see everything that changed between them. They do not have to be next to each other.",
                        )
                    }}
                </p>

                <div
                    v-if="shown.length > 0"
                    class="mb-history__timeline"
                    :aria-label="t('history.timeline.label', 'Revisions, grouped by the day they happened')"
                    role="group"
                    @keydown="onListKeydown"
                    @focusin="onListFocusIn"
                >
                    <section v-for="group in days" :key="group.day ?? 'undated'" class="mb-history__day">
                        <h3 class="mb-history__dayHead">
                            <span class="mb-history__dayName">{{ dayTitle(group.day) }}</span>
                            <span class="mb-history__daySummary">
                                {{
                                    t(
                                        "history.timeline.daySummary",
                                        {
                                            revisions: String(group.revisions.length),
                                            files: String(group.files),
                                        },
                                        "{revisions} revisions, {files} files",
                                    )
                                }}
                            </span>
                            <span v-if="group.counts.added > 0" class="mb-history__count" data-kind="added">
                                +{{ group.counts.added }}
                            </span>
                            <span v-if="group.counts.modified > 0" class="mb-history__count" data-kind="modified">
                                ~{{ group.counts.modified }}
                            </span>
                            <span v-if="group.counts.deleted > 0" class="mb-history__count" data-kind="deleted">
                                -{{ group.counts.deleted }}
                            </span>
                            <v-chip v-if="group.holdsCurrent" size="x-small" variant="tonal" color="primary" label>
                                {{ t("history.timeline.holdsCurrent", "Includes what is on disk now") }}
                            </v-chip>
                        </h3>

                        <ul class="mb-history__list">
                            <HistoryRevisionRow
                                v-for="revision in group.revisions"
                                :key="revision.id"
                                :ref="(instance) => keepRow(revision.id, instance)"
                                :revision="revision"
                                :current="revision.id === liveId"
                                :active="shown[activeIndex]?.id === revision.id"
                                :expanded="expanded === revision.id"
                                :diff="diffs[revision.id] ?? null"
                                :diff-error="diffErrors[revision.id] ?? null"
                                :busy="busy"
                                :writable="canWrite"
                                :comparable="canCompare"
                                :selective="canRestorePart"
                                :compare-role="roleOf(revision.id)"
                                @toggle="toggleDiff"
                                @restore="restore"
                                @label="applyLabel"
                                @pick="pick"
                                @restore-file="restoreOneFile"
                                @restore-setting="restoreOneSetting"
                            />
                        </ul>
                    </section>
                </div>

                <p v-else class="mb-history__empty" role="status">
                    {{
                        revisions.length === 0
                            ? t(
                                  "history.emptyHistory",
                                  "Nothing has been recorded for this folder yet. Saving a change records the first revision, or press Record now.",
                              )
                            : t("history.emptyFiltered", "No revision matches these filters.")
                    }}
                </p>

                <p v-if="outcome.revisions.length > shown.length" class="mb-history__quiet">
                    {{
                        t(
                            "history.truncated",
                            { shown: String(shown.length), total: String(outcome.revisions.length) },
                            "Showing the newest {shown} of {total}. Narrow the search or the dates to reach the rest.",
                        )
                    }}
                </p>

                <p v-if="shown.length > 0" class="mb-history__quiet">
                    {{
                        t(
                            "history.keyboardHint",
                            "In the list: up and down move between revisions, Enter opens one, A and B choose the two ends of a comparison, and Escape closes it.",
                        )
                    }}
                </p>

                <v-divider class="my-3" />

                <footer class="mb-history__foot">
                    <div class="mb-history__retention">
                        <v-number-input
                            v-model="keep"
                            :label="t('history.keep', 'Revisions to keep')"
                            :min="1"
                            :max="10000"
                            control-variant="stacked"
                            density="compact"
                            variant="outlined"
                            hide-details="auto"
                            class="mb-history__keep"
                        />

                        <ConfigSuperConfirm
                            :title="t('history.trimTitle', 'Remove older revisions')"
                            :action="
                                t(
                                    'history.trimAction',
                                    { drop: String(wouldDrop), keep: String(Math.max(1, keep)) },
                                    'This removes {drop} older revisions for good and keeps the newest {keep}. What is removed cannot be restored afterwards, by this app or by anything else.',
                                )
                            "
                            :affected="trimAffected"
                            :confirm-label="t('history.trimConfirm', 'Slide to remove the older revisions')"
                            :disabled="!canWrite || busy || wouldDrop === 0"
                            @confirm="trimHistory"
                        >
                            <template #activator="{ props: activator }">
                                <v-btn
                                    v-bind="activator"
                                    :prepend-icon="mdiScissorsCutting"
                                    color="error"
                                    variant="text"
                                    size="small"
                                >
                                    {{
                                        wouldDrop === 0
                                            ? t("history.trimNothing", "Nothing to remove")
                                            : t(
                                                  "history.trim",
                                                  { drop: String(wouldDrop) },
                                                  "Remove {drop} older revisions",
                                              )
                                    }}
                                </v-btn>
                            </template>
                        </ConfigSuperConfirm>
                    </div>

                    <p class="mb-history__quiet">
                        {{
                            t(
                                "history.whereItLives",
                                { repository: listing?.repository ?? "" },
                                "Kept in its own repository at {repository}, beside this app's data. Nothing is written into your config folder except by a restore.",
                            )
                        }}
                    </p>
                    <p class="mb-history__quiet">
                        {{
                            listing && listing.remotes.length === 0
                                ? t(
                                      "history.local",
                                      "This history stays on this machine. It has nowhere to send itself and nothing to send it with.",
                                  )
                                : t(
                                      "history.remote",
                                      { remotes: (listing?.remotes ?? []).join(", ") },
                                      "This history has a remote configured ({remotes}). This app never sends anything to it.",
                                  )
                        }}
                    </p>
                    <p v-if="status?.version" class="mb-history__quiet">
                        {{ t("history.gitVersion", { version: status.version }, "Recorded with Git {version}.") }}
                    </p>
                </footer>
            </template>
        </v-card-text>
    </v-card>
    </AppearanceTarget>
</template>

<style>
.mb-history__head {
    display: flex;
    gap: 10px;
    align-items: flex-start;
}

.mb-history__headText {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-history__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 500;
}

.mb-history__subtitle {
    margin: 2px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history__progress {
    margin-block-start: 8px;
}

/*
 * The live region is off screen rather than hidden: `display: none` and `visibility: hidden`
 * both take an element out of the accessibility tree, which would make this announce
 * nothing at all while looking exactly like a working implementation.
 */
.mb-history__announce {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
}

.mb-history__notice {
    margin-block-start: 12px;
}

.mb-history__toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-start;
    margin-block-start: 12px;
}

.mb-history__search {
    flex: 1 1 260px;
    min-width: 0;
}

.mb-history__toolbarActions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.mb-history__filters {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-block-start: 10px;
}

.mb-history__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
}

.mb-history__facetCount {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.75;
}

/*
 * A flow column with its own bound, so a long history scrolls inside the panel rather than
 * pushing the retention controls off the bottom of it.
 */
.mb-history__timeline {
    max-height: 60vh;
    overflow-y: auto;
}

.mb-history__day + .mb-history__day {
    margin-block-start: 6px;
}

/*
 * The day header stays put while its own revisions scroll past, so the answer to "which day
 * am I looking at" never leaves the screen. It is the whole reason to group at all.
 */
.mb-history__dayHead {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: baseline;
    margin: 0;
    padding: 6px 4px;
    font-size: 0.8125rem;
    font-weight: 500;
    background: rgb(var(--v-theme-surface));
}

.mb-history__dayName {
    font-size: 0.875rem;
}

.mb-history__daySummary {
    font-size: 0.75rem;
    font-weight: 400;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history__count {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
}

.mb-history__count[data-kind="added"] {
    color: rgb(var(--v-theme-success));
}

.mb-history__count[data-kind="deleted"] {
    color: rgb(var(--v-theme-error));
}

.mb-history__list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-history__empty,
.mb-history__inline,
.mb-history__quiet {
    margin: 8px 0 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-history__foot {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.mb-history__retention {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.mb-history__keep {
    flex: 0 1 170px;
}

/*
 * Reduced motion is respected by removing the smooth scroll the timeline would otherwise
 * do when the arrow keys move focus onto a row that is off screen. Vestibular disorders do
 * not care that the movement was small.
 */
@media (prefers-reduced-motion: no-preference) {
    .mb-history__timeline {
        scroll-behavior: smooth;
    }
}
</style>
