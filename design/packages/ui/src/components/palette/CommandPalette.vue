<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowCollapse, mdiArrowExpand, mdiClose } from "@mdi/js";
import { VBtn, VCard, VDialog, VDivider, VIcon, VToolbar, VToolbarTitle, VTooltip } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { blueMapApp } from "../../stores/bluemap.js";
import PaletteRow from "./PaletteRow.vue";
import {
    buildPaletteCatalog,
    type PaletteConfigTarget,
    type PalettePageRef,
    type PaletteSettingsTarget,
    type PaletteShellActions,
} from "./paletteCatalog.js";
import { countByKind, filterItems, groupItems, paletteSample, type PaletteItem } from "./paletteItems.js";
import { readPaletteSize, writePaletteSize, type PaletteSize } from "./palettePrefs.js";

/**
 * One shortcut, and everything the application can do behind it.
 *
 * The problem this solves is not that the app's features are missing. They are all there,
 * behind a settings sheet, a seven-tab options editor, a viewer menu with its own pages, and
 * the shell's floating buttons - which is four separate mental models a person has to hold
 * before they can find a setting whose name they already know. So this is a single surface
 * where everything is one list, and where typing the name of a thing is enough.
 *
 * **Three kinds of row, and the difference is not cosmetic.** A setting carries the real
 * control: changing the theme here changes the theme, through the same `BlueMapApp` method
 * and the same storage key the viewer's settings page writes, because a palette that only
 * *links* to settings is a table of contents and the app already had several of those. A
 * destination opens a surface and says which. A command does its one thing and the palette
 * closes. See `paletteItems.ts` for why that split is a type rather than a convention.
 *
 * **Arriving somewhere means arriving *at the control*.** The four settings a failed render
 * can point at already have a reveal path in this application - the shell opens the settings
 * sheet at an anchor, and the sheet scrolls the row into view, focuses it and outlines it
 * for a moment. Those rows emit exactly the `SettingsTarget` that flow emits, so the shell
 * hands it to the same handler. This adds a second entrance to that path, not a second path.
 *
 * **Size is the user's, and the default is the small one.** A search box that becomes the
 * entire window is overwhelming on a large display and alarming when it was opened by
 * accident, so the bounded card is what an unconfigured install gets; the full-window view
 * is a deliberate choice, remembered, and changeable both from the header and from a row in
 * the list itself.
 *
 * **The search is the project's search.** `ConfigSearchField` with its anchored regex
 * builder, the same component every other search bar in this editor uses, bound to this
 * surface's own query, pattern, flags and mode. Plain text stays the default; regex is an
 * explicit opt-in; the builder previews against the rows actually on screen.
 */
const props = withDefaults(
    defineProps<{
        /** Whether the palette is showing. */
        open: boolean;
        /**
         * True only when the shell can open the options editor at a named tab.
         *
         * Left false, the editor is one row rather than seven, because seven rows that all
         * open the same first tab would be seven rows lying about where they go. See
         * `paletteCatalog.ts`.
         */
        canRouteConfigScreens?: boolean;
        /** The shell's tab strip, passed through so every page is searchable here too. */
        pages?: readonly PalettePageRef[];
    }>(),
    { canRouteConfigScreens: false, pages: () => [] },
);

const emit = defineEmits<{
    "update:open": [value: boolean];
    /** Shaped exactly like the render-failure flow's `SettingsTarget`, so the shell reuses its handler. */
    "reveal-setting": [target: PaletteSettingsTarget];
    /** Open the settings sheet with nothing revealed. */
    "open-settings": [];
    /** Open the options editor; the screen is null when no particular tab was asked for. */
    "open-config": [screen: PaletteConfigTarget];
    /** Open the server-profile manager. */
    "open-profiles": [];
    /** Reveal one of the shell's tabbed pages. */
    "open-page": [pageId: string];
    /** Open the notification centre in the corner. */
    "open-notice-centre": [];
    /** Open the tab strip's finder. */
    "open-tab-finder": [];
    /** Open the changelog, wherever the shell keeps it. */
    "open-changelog": [];
    /** Open the interactive tour. */
    "open-tutorial": [];
    /** Open the docked licence panel the shell mounts. */
    "open-eula": [];
    /** Open the docked "what is this?" panel the shell mounts. */
    "open-welcome": [];
}>();

const { t, locale } = useI18n();

const titleId = useId();

/* -------------------------------------------------------------------------- */
/* Size                                                                       */
/* -------------------------------------------------------------------------- */

const size = ref<PaletteSize>(readPaletteSize());

watch(size, (value) => {
    writePaletteSize(value);
});

const sizeLabel = computed(() =>
    size.value === "card"
        ? t("palette.size.toFull", "Fill the window")
        : t("palette.size.toCard", "Shrink to a card"),
);

function toggleSize(): void {
    size.value = size.value === "card" ? "full" : "card";
}

/* -------------------------------------------------------------------------- */
/* The catalogue                                                              */
/* -------------------------------------------------------------------------- */

/*
 * Emitting rather than acting: every destination in this list is a surface the shell already
 * owns and already opens from a button of its own. The palette knowing how to open them
 * itself would be a second copy of that wiring, and the two would drift.
 */
const actions: PaletteShellActions = {
    revealSetting: (target) => emit("reveal-setting", target),
    openSettings: () => emit("open-settings"),
    openConfig: (screen) => emit("open-config", screen),
    openProfiles: () => emit("open-profiles"),
    openPage: (pageId) => emit("open-page", pageId),
    openNoticeCentre: () => emit("open-notice-centre"),
    openTabFinder: () => emit("open-tab-finder"),
    openChangelog: () => emit("open-changelog"),
    openTutorial: () => emit("open-tutorial"),
    openEula: () => emit("open-eula"),
    openWelcome: () => emit("open-welcome"),
};

/**
 * Rebuilt whenever anything it read has changed, which is what makes the rows live.
 *
 * The builders read `appState`, `mapViewer.data` and the uniforms directly, and those are
 * reactive all the way down, so a theme changed on the viewer's own settings page shows in
 * this list without the palette subscribing to anything. `locale` is read here rather than
 * inside the builder for the same reason: the language row has to re-render when the
 * language actually loads, and only a read inside a `computed` does that.
 */
const items = computed<PaletteItem[]>(() =>
    buildPaletteCatalog({
        t,
        app: blueMapApp.value,
        locale: locale.value,
        actions,
        pages: props.pages,
        canRouteConfigScreens: props.canRouteConfigScreens,
        size: size.value,
        setSize: (value) => {
            size.value = value;
        },
    }),
);

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type the name of a setting, and `m`
// because a row's searchable text is several lines - title, explanation, current value - so
// `^` and `$` are only useful per line.
const flags = ref("im");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const visible = computed(() => filterItems(items.value, matcher.value));

const groups = computed(() => groupItems(visible.value));

const sample = computed(() => paletteSample(items.value));

/** An honest count, including the case where the pattern itself is broken. */
const summary = computed(() => {
    if (matcher.value.error !== null) {
        return t("palette.search.badPattern", "The pattern is not valid, so nothing is listed.");
    }
    const counted = countByKind(items.value);
    if (!matcher.value.active) {
        return t(
            "palette.search.total",
            { commands: counted.commands, settings: counted.settings, places: counted.destinations },
            "{commands} commands, {settings} settings and {places} places.",
        );
    }
    return t(
        "palette.search.found",
        { shown: visible.value.length, total: items.value.length },
        "{shown} of {total} rows match.",
    );
});

/* -------------------------------------------------------------------------- */
/* Focus, and moving through the list with the keyboard                       */
/* -------------------------------------------------------------------------- */

const searchRef = ref<InstanceType<typeof ConfigSearchField> | null>(null);
const listRef = ref<HTMLElement | null>(null);

/** Where focus was when the palette opened, so it can be put back where it came from. */
let cameFrom: HTMLElement | null = null;

function searchInput(): HTMLInputElement | null {
    const element = searchRef.value?.$el as HTMLElement | undefined;
    return element?.querySelector("input") ?? null;
}

function focusSearch(): void {
    searchInput()?.focus();
}

/**
 * One focus target per row: the button for a command or a destination, and the control
 * itself for a setting.
 *
 * Landing on the control rather than on the row is the point. A setting row exists so the
 * setting can be changed here, so arrowing onto it should leave the switch, the select or
 * the number box focused and ready - not the row around it, from which the user then has to
 * press Tab to reach the thing they came for.
 */
function focusTargets(): HTMLElement[] {
    const root = listRef.value;
    if (root === null) return [];
    return [...root.querySelectorAll<HTMLElement>("[data-palette-row]")].map(
        (row) =>
            row.querySelector<HTMLElement>(
                'button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
            ) ?? row,
    );
}

function move(delta: number): void {
    const targets = focusTargets();
    if (targets.length === 0) return;

    const active = globalThis.document?.activeElement;
    const current = targets.findIndex(
        (target) => target === active || (active !== null && target.contains(active)),
    );
    // From the search box (which is not in the list) down goes to the first row and up goes
    // to the last, so both arrows are useful on the first keystroke after opening.
    const next = current === -1 ? (delta > 0 ? 0 : targets.length - 1) : (current + delta + targets.length) % targets.length;
    targets[next]?.focus();
}

function isTextEntry(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/**
 * Arrow keys walk the list, except where the focused control has a better claim on them.
 *
 * Three things are deliberately not intercepted. A control that has already handled the key
 * and called `preventDefault` - a select opening its menu - keeps it. A number box keeps its
 * arrows, because stepping the value is what an arrow means in a number box and it is half
 * the reason the control is a stepper. And Home and End keep their caret meaning inside any
 * text entry, where jumping to the end of the list would lose the user's place in what they
 * were typing.
 */
function onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;

    const numberBox = event.target instanceof HTMLInputElement && event.target.type === "number";

    if (event.key === "ArrowDown" && !numberBox) {
        event.preventDefault();
        move(1);
    } else if (event.key === "ArrowUp" && !numberBox) {
        event.preventDefault();
        move(-1);
    } else if (event.key === "Home" && !isTextEntry(event.target)) {
        event.preventDefault();
        focusTargets()[0]?.focus();
    } else if (event.key === "End" && !isTextEntry(event.target)) {
        event.preventDefault();
        focusTargets().at(-1)?.focus();
    }
}

/**
 * Enter in the search box takes the obvious next step rather than guessing at an action.
 *
 * Where the first result is a command or a destination, running it is unambiguous and is
 * what somebody typing "servers" and pressing Enter means. Where it is a setting, there is
 * no single obvious thing Enter should do to a select or a number box, so focus moves onto
 * the control and the user says what they want it to be.
 */
function onSearchEnter(): void {
    const first = visible.value[0];
    if (first === undefined) return;
    if (first.kind === "setting") {
        move(1);
        return;
    }
    if (first.kind === "command") first.run();
    else first.go();
    close();
}

function close(): void {
    emit("update:open", false);
}

function onDialog(value: boolean): void {
    if (!value) close();
}

watch(
    () => props.open,
    (open) => {
        if (open) {
            const active = globalThis.document?.activeElement;
            cameFrom = active instanceof HTMLElement ? active : null;
            // A query left over from last time would hide most of the list from somebody who
            // has just pressed the shortcut and expects to see everything.
            query.value = "";
            void nextTick(focusSearch);
            return;
        }
        // Back where it came from, never to `<body>`, or the next keystroke goes nowhere.
        cameFrom?.focus();
        cameFrom = null;
    },
);

/** A row was run or a destination chosen: the palette has done its job and steps out. */
function onActivate(): void {
    close();
}

/*
 * A setting changed and the palette stays open, because somebody adjusting a value usually
 * wants to see the effect and adjust again. Nothing else is needed here: the summary line
 * beneath the search box is already an `aria-live` region and re-renders with the new value,
 * so the change is announced without a second announcement competing with it.
 */
</script>

<template>
    <v-dialog
        class="mb-palette"
        :class="{ 'mb-palette--full': size === 'full' }"
        :model-value="props.open"
        :fullscreen="size === 'full'"
        :max-width="size === 'card' ? 760 : '100%'"
        :content-props="{ 'aria-labelledby': titleId }"
        scrollable
        @update:model-value="onDialog"
    >
        <v-card class="mb-palette__card" @keydown="onKeydown">
            <v-toolbar class="mb-palette__bar" density="comfortable" flat color="surface">
                <v-toolbar-title :id="titleId" class="mb-palette__title">
                    {{ t("palette.title", "Command palette") }}
                </v-toolbar-title>

                <template #append>
                    <v-btn
                        icon
                        variant="text"
                        :aria-label="sizeLabel"
                        :aria-pressed="size === 'full' ? 'true' : 'false'"
                        @click="toggleSize"
                    >
                        <v-icon :icon="size === 'card' ? mdiArrowExpand : mdiArrowCollapse" />
                        <v-tooltip activator="parent" location="bottom" :text="sizeLabel" />
                    </v-btn>

                    <v-btn
                        icon
                        variant="text"
                        :aria-label="t('palette.close', 'Close the command palette')"
                        @click="close"
                    >
                        <v-icon :icon="mdiClose" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="t('palette.close', 'Close the command palette')"
                        />
                    </v-btn>
                </template>
            </v-toolbar>

            <v-divider />

            <div class="mb-palette__search">
                <ConfigSearchField
                    ref="searchRef"
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('palette.search.label', 'Search everything')"
                    :placeholder="t('palette.search.hint', 'a command, a setting, or where you want to go')"
                    :sample="sample"
                    :summary="summary"
                    density="comfortable"
                    @keydown.enter.prevent="onSearchEnter"
                />
            </div>

            <v-divider />

            <div ref="listRef" class="mb-palette__body">
                <template v-for="group in groups" :key="group.label">
                    <h3 class="mb-palette__group">{{ group.label }}</h3>
                    <ul class="mb-palette__list" role="list">
                        <PaletteRow
                            v-for="item in group.items"
                            :key="item.id"
                            :item="item"
                            @activate="onActivate"
                        />
                    </ul>
                </template>

                <p v-if="visible.length === 0" class="mb-palette__empty" role="status">
                    {{
                        matcher.error !== null
                            ? t("palette.search.badPattern", "The pattern is not valid, so nothing is listed.")
                            : t("palette.search.noMatches", "Nothing in this app matches that.")
                    }}
                </p>

                <!--
                    Said plainly rather than left as a gap. With no viewer running there is
                    nothing for a theme select or a render-distance box to change, so those
                    rows are absent rather than present and inert - but somebody who came
                    looking for them deserves to know why they are not here.
                -->
                <p v-if="blueMapApp === null" class="mb-palette__note">
                    {{
                        t(
                            "palette.noMap",
                            "The map's own settings appear here once a map is open. With no map on screen there is nothing for them to change.",
                        )
                    }}
                </p>
            </div>

            <v-divider />

            <p class="mb-palette__hint">
                {{
                    t(
                        "palette.hint",
                        "Up and down move through the list, Enter takes the first result, Escape closes.",
                    )
                }}
            </p>
        </v-card>
    </v-dialog>
</template>

<style>
.mb-palette .mb-palette__card {
    display: flex;
    flex-direction: column;
    /* Bounded so the list scrolls inside the card rather than the card growing past the
       window. In the full-window size the dialog is already the viewport and this is moot. */
    max-height: 80vh;
}

.mb-palette--full .mb-palette__card {
    max-height: 100%;
}

.mb-palette .mb-palette__title {
    font-size: 1rem;
    font-weight: 500;
    overflow-wrap: anywhere;
    white-space: normal;
    line-height: 1.25;
}

.mb-palette__search {
    padding: 12px 16px;
}

.mb-palette__body {
    flex: 1 1 auto;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 8px 8px 16px;
}

.mb-palette__group {
    margin: 12px 0 4px;
    padding-inline: 12px;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-palette__list {
    margin: 0;
    padding: 0;
    list-style: none;
}

.mb-palette__empty,
.mb-palette__note {
    margin: 12px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-palette__hint {
    margin: 0;
    padding: 8px 16px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

@media (prefers-reduced-motion: reduce) {
    .mb-palette .v-overlay__content,
    .mb-palette .v-overlay__scrim {
        transition-duration: 0.01ms !important;
    }
}
</style>
