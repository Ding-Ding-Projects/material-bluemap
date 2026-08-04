<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiClose,
    mdiDockBottom,
    mdiDockLeft,
    mdiDockRight,
    mdiDockTop,
    mdiDockWindow,
    mdiRestore,
} from "@mdi/js";
import { VBtn, VDivider, VIcon, VList, VListItem, VMenu, VTooltip } from "vuetify/components";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import {
    DOCK_PLACEMENTS,
    dockStyle,
    resolveDockLayout,
    type DockPlacement,
    type Rect,
} from "./dockPlacement.js";
import { dockPlacementLabel } from "./settingsCopy.js";
import {
    hasStoredPlacement,
    placementFor,
    resetAllDockPlacements,
    resetDockPlacement,
    setDockPlacement,
    useRegisteredDockedSurface,
} from "./useDockPlacement.js";

/**
 * A panel the user decides the position of.
 *
 * Wrap a surface in one of these and it gains: a persisted placement of its own
 * (floating, or docked left, right, top or bottom), a chooser in its own title bar and a
 * keyboard path to it, a geometry that never covers the control that opened it, Escape to
 * close, focus moved in on opening and returned to the opener on closing, and the whole
 * per-element appearance feature on its chrome. The host supplies a title, a body and
 * optionally a row that sits under the title bar; everything else is here so that adding
 * a second docked surface cannot mean a second, subtly different implementation of any of
 * it.
 *
 * ## Not a dialog, in the sense that matters
 *
 * It paints its own surface and sits above the application, but it takes nothing hostage:
 * there is no scrim, the application behind stays visible and usable, and it carries
 * `role="dialog"` **without** `aria-modal`, which is exactly what a non-modal panel is.
 * That is also why it is not built on `v-dialog` or `v-overlay`: those are the components
 * this project reserves for a decision that must be made before continuing, and a panel
 * you can put wherever you like is not one.
 *
 * ## Learning what opened it
 *
 * The geometry needs the opener's rectangle. A host that has the element passes it; a host
 * that does not gets the element that had focus at the moment the surface opened, which
 * for a keyboard user is exactly right and for a mouse user is right whenever the button
 * took focus on click. When neither yields anything the surface simply has no opener to
 * clear, which is stated in the type as `null` rather than guessed at.
 *
 * Focus goes back to that element on close. Losing focus to `<body>` after closing a panel
 * is the most common way a keyboard user gets stranded, and it is invisible to anyone
 * testing with a mouse.
 */
const props = withDefaults(
    defineProps<{
        /** The key this surface's placement is stored under. Stable across builds. */
        surfaceId: string;
        /** The surface's name, for the accessible name and the settings list. */
        title: string;
        open: boolean;
        /** Where it sits until the user says otherwise. */
        defaultPlacement?: DockPlacement;
        /** How thick a docked panel would like to be, in CSS pixels. */
        preferredThickness?: number;
        /** How big a floating panel would like to be. */
        preferredWidth?: number;
        preferredHeight?: number;
        /** The control that opened this. Null falls back to whatever had focus. */
        opener?: HTMLElement | null;
    }>(),
    {
        defaultPlacement: "right",
        preferredThickness: 520,
        preferredWidth: 520,
        preferredHeight: 640,
        opener: null,
    },
);

const emit = defineEmits<{ "update:open": [value: boolean] }>();

const { t } = useI18n();

const titleId = useId();
const root = ref<HTMLElement | null>(null);
const body = ref<HTMLElement | null>(null);
const placementMenuOpen = ref(false);

useRegisteredDockedSurface(() => ({
    id: props.surfaceId,
    label: props.title,
    defaultPlacement: props.defaultPlacement,
}));

/* -------------------------------------------------------------------------- */
/* The opener                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The element that opened this, captured once per opening.
 *
 * Captured rather than read live: by the time the panel has rendered, focus is inside it,
 * so reading `document.activeElement` at layout time would measure the panel against
 * itself.
 */
const opener = ref<HTMLElement | null>(null);

function captureOpener(): void {
    if (props.opener !== null) {
        opener.value = props.opener;
        return;
    }
    const active = globalThis.document?.activeElement;
    opener.value = active instanceof HTMLElement && active !== document.body ? active : null;
}

const openerRect = ref<Rect | null>(null);

function measureOpener(): void {
    const element = opener.value;
    if (element === null || typeof element.getBoundingClientRect !== "function") {
        openerRect.value = null;
        return;
    }
    const rect = element.getBoundingClientRect();
    // jsdom returns zeroes for everything, and a zero-sized rectangle at the origin is
    // not an opener to clear - treating it as one would pin every panel away from a
    // corner nothing is in.
    if (rect.width <= 0 || rect.height <= 0) {
        openerRect.value = null;
        return;
    }
    openerRect.value = { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/* -------------------------------------------------------------------------- */
/* Geometry                                                                   */
/* -------------------------------------------------------------------------- */

const viewport = ref({
    width: globalThis.innerWidth || 1280,
    height: globalThis.innerHeight || 800,
});

function measureViewport(): void {
    viewport.value = {
        width: globalThis.innerWidth || viewport.value.width,
        height: globalThis.innerHeight || viewport.value.height,
    };
}

function onResize(): void {
    measureViewport();
    measureOpener();
}

onMounted(() => {
    measureViewport();
    globalThis.addEventListener?.("resize", onResize);
});

onBeforeUnmount(() => {
    globalThis.removeEventListener?.("resize", onResize);
});

const placement = computed<DockPlacement>(() => placementFor(props.surfaceId, props.defaultPlacement));

const layout = computed(() =>
    resolveDockLayout({
        placement: placement.value,
        viewport: viewport.value,
        opener: openerRect.value,
        preferredThickness: props.preferredThickness,
        preferredSize: { width: props.preferredWidth, height: props.preferredHeight },
    }),
);

const style = computed(() => dockStyle(layout.value));

/**
 * The sentence shown when the panel is not where it was asked to be.
 *
 * Said out loud rather than silently done: the user chose an edge, and a panel that
 * quietly appears somewhere else reads as the choice not having been saved.
 */
const adjustment = computed<string | null>(() => {
    if (layout.value.fellBackToFloating) {
        return t(
            "dock.adjusted.floating",
            { edge: placementLabel(layout.value.requested), title: props.title },
            "There is not enough room to dock {title} to the {edge} without covering the control that opened it, so it is floating. Your choice is kept.",
        );
    }
    if (layout.value.shrunkToClearOpener) {
        return t(
            "dock.adjusted.shrunk",
            { title: props.title },
            "{title} is narrower than usual so that it does not cover the control that opened it.",
        );
    }
    return null;
});

/* -------------------------------------------------------------------------- */
/* Opening and closing                                                        */
/* -------------------------------------------------------------------------- */

watch(
    () => props.open,
    (isOpen) => {
        if (isOpen) {
            captureOpener();
            measureViewport();
            void nextTick(() => {
                measureOpener();
                // Only when nothing inside has claimed focus already. A host that reveals
                // a particular row on opening - the settings surface does exactly that
                // when a failed render points at a setting - has a better answer than
                // "the top of the panel", and two elements racing for focus is how the
                // ring ends up on whichever won rather than on the thing asked for.
                const active = globalThis.document?.activeElement ?? null;
                if (root.value?.contains(active) === true && active !== root.value) return;
                body.value?.focus();
            });
            return;
        }
        placementMenuOpen.value = false;
        // Back to the button that opened it. Doing this only when focus is still inside
        // the panel keeps a close triggered from elsewhere from stealing focus back.
        const inside = root.value?.contains(globalThis.document?.activeElement ?? null) ?? false;
        if (inside) opener.value?.focus?.();
    },
    { immediate: true },
);

function close(): void {
    emit("update:open", false);
}

/**
 * Escape closes the panel, and the placement menu first when that is open.
 *
 * Bound with Vue's own `.esc` modifier rather than by comparing `event.key` by hand:
 * browsers have shipped `Escape` and `Esc` for the same key and test harnesses synthesise
 * a third spelling, and Vue's key modifier normalises all of them. A hand-rolled
 * comparison against one spelling is a shortcut that silently does nothing on whichever
 * runtime spells it the other way.
 */
function onEscape(event: KeyboardEvent): void {
    event.stopPropagation();
    // A menu is a surface of its own; Escape dismisses that before the panel underneath
    // it, which is what every menu on this platform does.
    if (placementMenuOpen.value) {
        placementMenuOpen.value = false;
        return;
    }
    close();
}

/* -------------------------------------------------------------------------- */
/* The chooser                                                                */
/* -------------------------------------------------------------------------- */

const PLACEMENT_ICONS: Readonly<Record<DockPlacement, string>> = {
    floating: mdiDockWindow,
    left: mdiDockLeft,
    right: mdiDockRight,
    top: mdiDockTop,
    bottom: mdiDockBottom,
};

function placementLabel(value: DockPlacement): string {
    return dockPlacementLabel(t, value);
}

function choose(value: DockPlacement): void {
    setDockPlacement(props.surfaceId, value);
    placementMenuOpen.value = false;
    void nextTick(measureOpener);
}

function resetThis(): void {
    resetDockPlacement(props.surfaceId);
    placementMenuOpen.value = false;
}

function resetEverything(): void {
    resetAllDockPlacements();
    placementMenuOpen.value = false;
}

const customised = computed(() => hasStoredPlacement(props.surfaceId));

/**
 * Opened by the palette as well as by the button.
 *
 * A command palette entry for "move this panel" has to be able to reach the chooser
 * without a pointer, so the imperative handle exists rather than the palette having to
 * find and click a button.
 */
function openPlacementMenu(): void {
    placementMenuOpen.value = true;
}

defineExpose({ openPlacementMenu, placement, layout, element: root });
</script>

<template>
    <!--
        `v-show` rather than `v-if`: the host's body keeps its state (a search query, a
        scroll position, the tab a user was reading) between openings, which is what a
        panel that can be closed by mistake has to do.
    -->
    <aside
        v-show="props.open"
        ref="root"
        class="mb-docked"
        :class="`mb-docked--${layout.placement}`"
        :style="style"
        role="dialog"
        :aria-labelledby="titleId"
        @keydown.esc="onEscape"
    >
        <div class="mb-docked__frame">
            <header class="mb-docked__bar">
                <!--
                    The panel's own heading is an appearance target like everything else
                    this application draws: right-click it for **Edit appearance...**, or
                    Shift+F10 for the same menu from the keyboard. The wrapper is
                    `display: contents` until something needs a box, so it costs the flex
                    row nothing.
                -->
                <AppearanceTarget
                    :id="`docked.${props.surfaceId}.title`"
                    :label="props.title"
                    as="span"
                    class="mb-docked__title-target"
                >
                    <h2 :id="titleId" class="mb-docked__title">{{ props.title }}</h2>
                </AppearanceTarget>

                <div class="mb-docked__bar-actions">
                    <slot name="bar" />

                    <v-btn
                        class="mb-docked__placement"
                        variant="text"
                        size="small"
                        density="comfortable"
                        :aria-label="
                            t(
                                'dock.chooser.label',
                                { title: props.title, current: placementLabel(placement) },
                                'Where {title} sits. Currently: {current}',
                            )
                        "
                        :aria-expanded="placementMenuOpen ? 'true' : 'false'"
                        aria-haspopup="menu"
                    >
                        <v-icon :icon="PLACEMENT_ICONS[placement]" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="
                                t(
                                    'dock.chooser.label',
                                    { title: props.title, current: placementLabel(placement) },
                                    'Where {title} sits. Currently: {current}',
                                )
                            "
                        />
                        <v-menu
                            v-model="placementMenuOpen"
                            activator="parent"
                            :close-on-content-click="false"
                            location="bottom end"
                            offset="4"
                        >
                            <div class="mb-docked__menu" role="none">
                                <v-list
                                    density="compact"
                                    :aria-label="t('dock.chooser.list', 'Placement')"
                                >
                                    <v-list-item
                                        v-for="option in DOCK_PLACEMENTS"
                                        :key="option"
                                        :prepend-icon="PLACEMENT_ICONS[option]"
                                        :title="placementLabel(option)"
                                        :active="option === placement"
                                        role="menuitemradio"
                                        :aria-checked="option === placement ? 'true' : 'false'"
                                        @click="choose(option)"
                                    />
                                </v-list>

                                <v-divider />

                                <v-list density="compact" :aria-label="t('dock.chooser.reset', 'Reset')">
                                    <v-list-item
                                        :prepend-icon="mdiRestore"
                                        :disabled="!customised"
                                        :title="
                                            t(
                                                'dock.reset.one',
                                                { title: props.title },
                                                'Put {title} back where it started',
                                            )
                                        "
                                        @click="resetThis()"
                                    />
                                    <v-list-item
                                        :prepend-icon="mdiRestore"
                                        :title="t('dock.reset.all', 'Put every panel back where it started')"
                                        @click="resetEverything()"
                                    />
                                </v-list>
                            </div>
                        </v-menu>
                    </v-btn>

                    <v-btn
                        icon
                        variant="text"
                        size="small"
                        density="comfortable"
                        :aria-label="t('dock.close', { title: props.title }, 'Close {title}')"
                        @click="close"
                    >
                        <v-icon :icon="mdiClose" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="t('dock.close', { title: props.title }, 'Close {title}')"
                        />
                    </v-btn>
                </div>
            </header>

            <!--
                Stated, not silent. The panel was moved because the placement the user
                asked for would have covered the control they opened it with, and a
                surface that quietly appears somewhere else reads as a lost preference.
            -->
            <p v-if="adjustment !== null" class="mb-docked__adjustment" role="status">
                {{ adjustment }}
            </p>

            <slot name="prepend" />

            <v-divider />

            <div
                ref="body"
                class="mb-docked__body"
                tabindex="-1"
                role="region"
                :aria-label="t('dock.body', { title: props.title }, '{title} contents')"
            >
                <slot />
            </div>
        </div>
    </aside>
</template>

<style>
.mb-docked {
    /* Above the floating control bar, below Vuetify's overlay stack, so a menu or the
       regex builder anchored inside this panel still paints over it. */
    z-index: 1500;
    display: block;
    /* Never wider or taller than the window: at 800x600, and at 200% display scale where
       the viewport is effectively half that, the panel becomes the whole edge rather than
       overflowing it. */
    max-width: 100vw;
    max-height: 100dvh;
    pointer-events: auto;
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.28);
}

.mb-docked--floating {
    border-radius: 16px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

.mb-docked--left {
    border-inline-end: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

.mb-docked--right {
    border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

.mb-docked--top {
    border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

.mb-docked--bottom {
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.14);
}

.mb-docked__frame {
    display: flex;
    flex-direction: column;
    block-size: 100%;
    max-block-size: 100%;
    min-block-size: 0;
    overflow: hidden;
    border-radius: inherit;
}

.mb-docked__bar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    padding: 8px 8px 8px 16px;
}

.mb-docked__title-target {
    flex: 1 1 auto;
    min-inline-size: 0;
}

/* Both, because the wrapper is `display: contents` until the user gives it a background,
   at which point it becomes the flex item and the heading stops being one. */
.mb-docked__title {
    flex: 1 1 auto;
    min-inline-size: 0;
    margin: 0;
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.25;
    /* The longest bilingual label still wraps rather than pushing the buttons off. */
    overflow-wrap: anywhere;
    white-space: normal;
}

.mb-docked__bar-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 0 0 auto;
}

.mb-docked__adjustment {
    margin: 0;
    padding: 8px 16px;
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    background: rgba(var(--v-theme-primary), 0.08);
    text-wrap: pretty;
}

.mb-docked__body {
    flex: 1 1 auto;
    min-block-size: 0;
    overflow: auto;
    overscroll-behavior: contain;
}

.mb-docked__body:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

/*
 * Vuetify signals focus with a low-opacity overlay, which is a tint rather than an
 * indicator. These add a real ring on top of it, on every control this chrome holds.
 */
.mb-docked .v-btn:focus-visible,
.mb-docked a:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-docked .v-field:focus-within {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

.mb-docked__menu {
    inline-size: min(320px, 92vw);
    max-block-size: min(60vh, 420px);
    overflow-y: auto;
    border-radius: 12px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.16);
    background: rgb(var(--v-theme-surface));
    color: rgb(var(--v-theme-on-surface));
    box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.3);
}
</style>
