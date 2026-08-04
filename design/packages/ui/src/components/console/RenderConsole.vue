<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowDownBoldBoxOutline,
    mdiContentCopy,
    mdiDownloadOutline,
    mdiLightbulbOnOutline,
    mdiAlertOutline,
} from "@mdi/js";
import { VBtn, VChip, VChipGroup, VIcon, VTooltip } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { ConsoleAnnotation } from "./annotations.js";
import {
    CONSOLE_LEVELS,
    LEVEL_TAGS,
    clockText,
    consoleText,
    countByLevel,
    describeSlice,
    isAtBottom,
    selectRows,
    type ConsoleLevel,
    type ConsoleLine,
    type ConsoleRow,
} from "./consoleModel.js";
import type { SettingsTarget } from "../world/worldBridge.js";

/**
 * The engine's output, as a console rather than as a disclosure.
 *
 * What this replaces was a collapsible `<pre>` over the last two hundred lines. It was
 * honest and it was unusable: a render of a real world produces thousands of lines, the
 * two hundred kept were whichever two hundred happened to be last, every level looked
 * identical, and there was no way to search any of it. The one line that says why a
 * render failed is usually in the first ten seconds of output, which is exactly the part
 * that had already been thrown away.
 *
 * Four decisions carry most of the value here.
 *
 * **Colour is never the only signal.** Every line prints its level as text in a
 * fixed-width column beside the colour, so the distinction survives a colour-blind
 * reader, a monochrome display, and a copy-paste into a bug report. The colours
 * themselves are declared per theme rather than taken from Vuetify's status palette,
 * because the default warning amber is under 3:1 on a light surface and a warning nobody
 * can read is not a warning.
 *
 * **The view follows only when it is already at the bottom.** A console that scrolls on
 * every new line cannot be read while it is running: you scroll up to look at an error,
 * the engine prints its next progress tick a second later, and you are back at the
 * bottom. `isAtBottom` decides it, from three numbers, and is tested on its own. When the
 * view is detached a control appears to get back, so being detached is a visible state
 * rather than a stuck one.
 *
 * **The cap is stated.** Ten thousand lines are kept and the count that were dropped is
 * printed under the log. A ring that quietly forgets its own beginning looks exactly like
 * a complete log, which is the worse failure of the two.
 *
 * **Everything is searchable.** The search is the shared field, so it arrives with the
 * anchored regex builder like every other search surface in this app, and it matches this
 * app's advice as well as the engine's line, because a reader who searches for a word
 * they can see on screen and gets nothing concludes the search is broken.
 */
const props = withDefaults(
    defineProps<{
        lines: readonly ConsoleLine[];
        /** How many lines the cap has dropped off the front of this render. */
        dropped?: number;
        cap: number;
        /** Height of the scrolling area. A caller that has more room can ask for more. */
        height?: string;
    }>(),
    { dropped: 0, height: "clamp(180px, 34vh, 460px)" },
);

const emit = defineEmits<{
    /** Sends somebody to the setting a piece of advice points at. */
    settings: [target: SettingsTarget];
}>();

const { t } = useI18n();

const query = ref("");
const regex = ref(false);
const flags = ref("i");
const chosenLevels = ref<ConsoleLevel[]>([]);

const scroller = ref<HTMLElement | null>(null);
/**
 * Whether the view is riding the bottom.
 *
 * Starts true so an empty console begins attached; it is recomputed from the container
 * on every scroll, so the first time somebody scrolls away it becomes false and stays
 * false until they come back.
 */
const following = ref(true);
const copyState = ref("");

/** What each line reads as, with this app's own status lines translated. */
function lineText(line: ConsoleLine): string {
    return line.text === null ? line.message : t(line.text.key, line.text.values, line.text.fallback);
}

function adviceText(annotation: ConsoleAnnotation): string {
    return t(annotation.text.key, annotation.text.values, annotation.text.fallback);
}

const rows = computed<ConsoleRow[]>(() => props.lines.map((line) => ({ line, text: lineText(line) })));

const matcher = computed(() => createSettingMatcher(query.value, regex.value, flags.value));

const levelSet = computed(() => new Set(chosenLevels.value));

const visible = computed(() => selectRows(rows.value, levelSet.value, matcher.value.test, adviceText));

const counts = computed(() => countByLevel(props.lines));

const slice = computed(() => describeSlice(visible.value.length, props.lines.length, props.dropped, props.cap));

/**
 * The honest "showing X of Y" line under the search field.
 *
 * Always shown rather than only when filtering, because "412 lines" and "412 of 3908
 * lines" answer two different questions and a reader who sees neither has to count.
 */
const summary = computed(() =>
    slice.value.filtered
        ? t(
              "world.console.showingSome",
              { shown: slice.value.shown, kept: slice.value.kept },
              "Showing {shown} of {kept} lines.",
          )
        : t("world.console.showingAll", { kept: slice.value.kept }, "Showing all {kept} lines."),
);

/** What the console is holding, and what it has already let go of. */
const capLine = computed(() =>
    props.dropped > 0
        ? t(
              "world.console.capDropped",
              { cap: props.cap, dropped: props.dropped },
              "Keeping the most recent {cap} lines. {dropped} earlier lines from this render have been dropped.",
          )
        : t("world.console.capIntact", { cap: props.cap }, "Every line is here. The console keeps up to {cap}."),
);

/** Real text for the builder to preview against, rather than an invented sample. */
const sample = computed(() =>
    rows.value
        .slice(-40)
        .map((row) => row.text)
        .join("\n"),
);

const levelLabels = computed<Readonly<Record<ConsoleLevel, string>>>(() => ({
    error: t("world.console.level.error", "Errors"),
    warning: t("world.console.level.warning", "Warnings"),
    info: t("world.console.level.info", "Information"),
    debug: t("world.console.level.debug", "Debug"),
    signal: t("world.console.level.signal", "This app's own status lines"),
    tip: t("world.console.level.tip", "Tips"),
}));

/* -------------------------------------------------------------------------- */
/* Scrolling                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Instant when the reader has asked for less motion.
 *
 * `matchMedia` is feature-detected rather than assumed: jsdom does not implement it, and
 * a console that throws on mount in the test environment is a console nobody can test.
 */
function smoothAllowed(): boolean {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    return query === undefined ? true : !query.matches;
}

function scrollToBottom(): void {
    const element = scroller.value;
    if (element === null) return;
    const top = element.scrollHeight;
    // `scrollTo` with options is missing in jsdom, so the assignment is the fallback
    // rather than the exception: without it the whole follow behaviour throws in tests.
    if (typeof element.scrollTo === "function") {
        element.scrollTo({ top, behavior: smoothAllowed() ? "smooth" : "auto" });
    } else {
        element.scrollTop = top;
    }
    following.value = true;
}

function onScroll(): void {
    const element = scroller.value;
    if (element === null) return;
    following.value = isAtBottom({
        scrollTop: element.scrollTop,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
    });
}

// The line count rather than the array, because the array is replaced on every append
// and watching it deeply would walk ten thousand objects per engine line.
watch(
    () => props.lines.length,
    () => {
        if (!following.value) return;
        void nextTick(() => scrollToBottom());
    },
);

onMounted(() => scrollToBottom());

/* -------------------------------------------------------------------------- */
/* Taking it away                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The header every copy and every export carries.
 *
 * It says which slice this is, because an exported file that covers a tenth of a render
 * and does not say so is worse than no file: the reader draws conclusions from an
 * absence that is an artefact of a filter they cannot see.
 */
function exportHeader(): string {
    const scope = slice.value.filtered
        ? t(
              "world.console.exportFiltered",
              { shown: slice.value.shown, kept: slice.value.kept },
              "{shown} of the {kept} lines held, matching the level filter and search that were on screen.",
          )
        : t("world.console.exportAll", { kept: slice.value.kept }, "All {kept} lines the console was holding.");
    const cut =
        props.dropped > 0
            ? t(
                  "world.console.exportDropped",
                  { dropped: props.dropped, cap: props.cap },
                  " {dropped} earlier lines were already dropped: the console keeps the most recent {cap}.",
              )
            : "";
    return `# ${t("world.console.exportTitle", "Material BlueMap render console")}\n# ${scope}${cut}`;
}

function currentText(): string {
    return consoleText(visible.value, adviceText, exportHeader());
}

async function copyAll(): Promise<void> {
    try {
        await navigator.clipboard.writeText(currentText());
        copyState.value = t(
            "world.console.copied",
            { shown: slice.value.shown },
            "Copied {shown} lines, with a header saying which ones.",
        );
    } catch {
        copyState.value = t("world.console.copyFailed", "Could not reach the clipboard.");
    }
}

/**
 * Writes the current slice to a file the reader chooses the home of.
 *
 * Plain text, because the destination is a bug report or a chat message and every one of
 * those wants something that survives being pasted. An object URL is created and given
 * straight back, so nothing is left holding the whole log after the click.
 */
function exportAll(): void {
    const url = globalThis.URL;
    const doc = globalThis.document;
    if (url?.createObjectURL === undefined || doc === undefined) {
        copyState.value = t("world.console.exportUnavailable", "This build cannot write a file from here.");
        return;
    }
    const blob = new Blob([currentText()], { type: "text/plain;charset=utf-8" });
    const href = url.createObjectURL(blob);
    const anchor = doc.createElement("a");
    anchor.href = href;
    anchor.download = "render-console.txt";
    anchor.click();
    url.revokeObjectURL(href);
    copyState.value = t(
        "world.console.exported",
        { shown: slice.value.shown },
        "Exported {shown} lines as plain text, with a header saying which ones.",
    );
}

function openSetting(target: SettingsTarget): void {
    emit("settings", target);
}
</script>

<template>
    <section class="mb-console" :aria-label="t('world.console.title', 'Render console')">
        <div class="mb-console__controls">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regex"
                v-model:flags="flags"
                :label="t('world.console.search', 'Search the console')"
                :placeholder="t('world.console.searchHint', 'Any word in a line, or in the advice beside it')"
                :sample="sample"
                :summary="summary"
                density="compact"
            />

            <!--
                A fieldset rather than a bare row of chips: the group needs a name a
                screen reader can announce before the six toggles inside it, or the
                first one is read as "error, one" with no context at all.
            -->
            <fieldset class="mb-console__levels">
                <legend>{{ t("world.console.filter", "Show only these levels") }}</legend>
                <v-chip-group v-model="chosenLevels" multiple column selected-class="text-primary">
                    <v-chip
                        v-for="level in CONSOLE_LEVELS"
                        :key="level"
                        :value="level"
                        :aria-label="`${levelLabels[level]}: ${counts[level]}`"
                        size="small"
                        filter
                        variant="outlined"
                    >
                        <span :class="`mb-console__swatch mb-console__swatch--${level}`" aria-hidden="true" />
                        {{ LEVEL_TAGS[level] }}
                        <span class="mb-console__count">{{ counts[level] }}</span>
                    </v-chip>
                </v-chip-group>
                <p v-if="chosenLevels.length === 0" class="mb-console__meta">
                    {{ t("world.console.filterNone", "No level filter: every line is shown.") }}
                </p>
            </fieldset>

            <div class="mb-console__actions">
                <v-btn :prepend-icon="mdiContentCopy" size="small" variant="text" density="comfortable" @click="copyAll">
                    {{ t("world.console.copy", "Copy what is shown") }}
                </v-btn>
                <v-btn
                    :prepend-icon="mdiDownloadOutline"
                    size="small"
                    variant="text"
                    density="comfortable"
                    @click="exportAll"
                >
                    {{ t("world.console.export", "Export as plain text") }}
                </v-btn>
            </div>
            <p class="mb-console__meta" role="status" aria-live="polite">{{ copyState }}</p>
        </div>

        <div class="mb-console__frame">
            <!--
                `role="log"` rather than a plain list: assistive technology then announces
                the lines that arrive rather than re-reading the whole console, which for
                a render that has printed three thousand lines is the difference between
                a usable surface and one that has to be muted. `tabindex` makes the region
                keyboard-scrollable, which is the only way to read it without a mouse.
            -->
            <ol
                ref="scroller"
                class="mb-console__scroll"
                :style="{ height: props.height }"
                role="log"
                tabindex="0"
                :aria-label="t('world.console.output', 'The engine\'s output')"
                @scroll="onScroll"
            >
                <li v-for="row in visible" :key="row.line.id" :class="`mb-console__line mb-console__line--${row.line.level}`">
                    <span class="mb-console__clock">{{ clockText(row.line.at) }}</span>
                    <span class="mb-console__tag" :aria-label="levelLabels[row.line.level]">
                        {{ LEVEL_TAGS[row.line.level] }}
                    </span>
                    <span class="mb-console__text">{{ row.text }}</span>

                    <!--
                        The advice, marked as this app speaking. The engine's line above is
                        never edited: that string is what somebody pastes into a search
                        engine, and an app that improves it has taken away the one thing
                        that was going to help them.
                    -->
                    <div
                        v-for="annotation in row.line.annotations"
                        :key="annotation.kind"
                        :class="`mb-console__advice mb-console__advice--${annotation.tone}`"
                    >
                        <v-icon
                            :icon="annotation.tone === 'tip' ? mdiLightbulbOnOutline : mdiAlertOutline"
                            size="14"
                            aria-hidden="true"
                        />
                        <span class="mb-console__speaker">{{ t("world.console.speaker", "Material BlueMap") }}</span>
                        <span class="mb-console__adviceText">{{ adviceText(annotation) }}</span>
                        <v-btn
                            v-if="annotation.settings"
                            size="x-small"
                            variant="tonal"
                            density="comfortable"
                            @click="openSetting(annotation.settings)"
                        >
                            {{ t("world.console.openSetting", "Open the setting") }}
                        </v-btn>
                    </div>
                </li>

                <li v-if="visible.length === 0" class="mb-console__empty">
                    {{
                        lines.length === 0
                            ? t("world.console.emptyLog", "The engine has not printed anything yet.")
                            : t(
                                  "world.console.emptyMatch",
                                  { kept: lines.length },
                                  "None of the {kept} lines match the level filter and the search.",
                              )
                    }}
                </li>
            </ol>

            <!--
                Only while detached. A permanent button would be a button that does
                nothing for the whole of a render somebody is watching from the bottom.
            -->
            <v-btn
                v-if="!following"
                class="mb-console__jump"
                :prepend-icon="mdiArrowDownBoldBoxOutline"
                size="small"
                variant="flat"
                color="primary"
                @click="scrollToBottom"
            >
                {{ t("world.console.toBottom", "Newest lines") }}
                <v-tooltip
                    activator="parent"
                    location="top"
                    :text="t('world.console.toBottomHint', 'The console stopped following because you scrolled up. This goes back to the newest line and starts following again.')"
                />
            </v-btn>
        </div>

        <p class="mb-console__meta">{{ capLine }}</p>
    </section>
</template>

<style>
.mb-console {
    margin-block-start: 8px;
}

.mb-console__controls {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-console__levels {
    border: none;
    padding: 0;
    margin: 0;
}

.mb-console__levels legend {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    padding: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-console__swatch {
    display: inline-block;
    inline-size: 8px;
    block-size: 8px;
    border-radius: 2px;
    margin-inline-end: 6px;
    background: currentcolor;
}

.mb-console__count {
    margin-inline-start: 6px;
    font-variant-numeric: tabular-nums;
    opacity: 0.7;
}

.mb-console__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
}

.mb-console__meta {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-console__frame {
    position: relative;
}

/*
 * The scrolling log.
 *
 * `user-select: text` is stated rather than assumed, because a list inside a card in a
 * component library is exactly the sort of place a `user-select: none` gets inherited
 * from, and a console whose text cannot be selected is a console nobody can quote.
 */
.mb-console__scroll {
    margin: 0;
    padding: 8px 10px;
    list-style: none;
    overflow: auto;
    overscroll-behavior: contain;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.55;
    user-select: text;
}

.mb-console__scroll:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-console__line {
    display: grid;
    grid-template-columns: auto auto 1fr;
    gap: 0 8px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
}

.mb-console__clock {
    color: rgba(var(--v-theme-on-surface), 0.55);
    font-variant-numeric: tabular-nums;
}

/*
 * The level, as text. This is what keeps the colouring from being the only signal: a
 * reader who cannot distinguish the colours, a monochrome display and a copy-paste into
 * a bug report all still carry the level.
 */
.mb-console__tag {
    inline-size: 5ch;
    font-weight: 600;
    letter-spacing: 0.02em;
}

.mb-console__text {
    grid-column: 3;
}

.mb-console__advice {
    grid-column: 3;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px;
    margin-block: 2px 6px;
    padding: 4px 8px;
    border-inline-start: 3px solid currentcolor;
    border-radius: 0 6px 6px 0;
    background: rgba(var(--v-theme-on-surface), 0.05);
    font-family: Roboto, system-ui, sans-serif;
    white-space: normal;
}

.mb-console__speaker {
    font-weight: 600;
    text-transform: none;
}

.mb-console__adviceText {
    color: rgba(var(--v-theme-on-surface), 0.92);
    flex: 1 1 16ch;
}

.mb-console__empty {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-family: Roboto, system-ui, sans-serif;
}

.mb-console__jump {
    position: absolute;
    inset-block-end: 10px;
    inset-inline-end: 14px;
}

/*
 * The level palette.
 *
 * Declared here rather than taken from Vuetify's status colours because those are tuned
 * for filled chips and buttons: the default warning amber measures under 3:1 as text on
 * a light surface, and a warning that cannot be read is not a warning. Each value below
 * is chosen to clear 4.5:1 against the console's own background in its own theme.
 */
.v-theme--light .mb-console__line--error,
.v-theme--light .mb-console__advice--warning {
    color: #a3231c;
}

.v-theme--light .mb-console__line--warning {
    color: #7a4a00;
}

.v-theme--light .mb-console__line--info,
.v-theme--light .mb-console__line--debug {
    color: #1d1b20;
}

.v-theme--light .mb-console__line--debug {
    opacity: 0.72;
}

.v-theme--light .mb-console__line--tip,
.v-theme--light .mb-console__advice--tip {
    color: #0b57d0;
}

.v-theme--light .mb-console__line--signal {
    color: #45484d;
}

.v-theme--dark .mb-console__line--error,
.v-theme--dark .mb-console__advice--warning {
    color: #f2b8b5;
}

.v-theme--dark .mb-console__line--warning {
    color: #ffb861;
}

.v-theme--dark .mb-console__line--info,
.v-theme--dark .mb-console__line--debug {
    color: #e6e1e5;
}

.v-theme--dark .mb-console__line--debug {
    opacity: 0.72;
}

.v-theme--dark .mb-console__line--tip,
.v-theme--dark .mb-console__advice--tip {
    color: #a8c7fa;
}

.v-theme--dark .mb-console__line--signal {
    color: #b6bac0;
}

/*
 * A console that animates its own scrolling is a console that makes some readers ill.
 * The follow behaviour still works; it simply arrives instantly.
 */
@media (prefers-reduced-motion: reduce) {
    .mb-console__scroll {
        scroll-behavior: auto;
    }
}
</style>
