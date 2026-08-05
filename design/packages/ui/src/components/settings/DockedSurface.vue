<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowAll,
    mdiClose,
    mdiDockBottom,
    mdiDockLeft,
    mdiDockRight,
    mdiDockTop,
    mdiDockWindow,
    mdiResizeBottomRight,
    mdiRestore,
} from "@mdi/js";
import { VBtn, VDivider, VIcon, VList, VListItem, VMenu, VTooltip } from "vuetify/components";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import {
    DOCK_PLACEMENTS,
    FLOATING_MARGIN,
    KEYBOARD_STEP,
    KEYBOARD_STEP_LARGE,
    MINIMUM_FLOATING_SIZE,
    clampFloatingRect,
    clampThickness,
    dockAxis,
    dockStyle,
    isDockedEdge,
    resolveDockLayout,
    thicknessBounds,
    type DockPlacement,
    type DockedEdge,
    type FloatingRect,
    type Rect,
} from "./dockPlacement.js";
import { dockPlacementLabel } from "./settingsCopy.js";
import {
    floatingRectFor,
    hasStoredPlacement,
    placementFor,
    resetAllDockPlacements,
    resetDockPlacement,
    setDockFloatingRect,
    setDockPlacement,
    setDockThickness,
    thicknessFor,
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

/** The thickness this surface was resized to on its current docked edge, if any. */
const storedThickness = computed<number | null>(() =>
    isDockedEdge(placement.value) ? thicknessFor(props.surfaceId, placement.value) : null,
);

/** The rectangle this surface was last dragged or resized to while floating, if any. */
const storedFloatingRect = computed<FloatingRect | null>(() => floatingRectFor(props.surfaceId));

const layout = computed(() =>
    resolveDockLayout({
        placement: placement.value,
        viewport: viewport.value,
        opener: openerRect.value,
        preferredThickness: props.preferredThickness,
        preferredSize: { width: props.preferredWidth, height: props.preferredHeight },
        storedThickness: storedThickness.value,
        storedFloatingRect: storedFloatingRect.value,
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
/* Resizing a docked edge, and dragging or resizing a floating panel          */
/*                                                                             */
/* Both lean on the same two guarantees `dockPlacement.ts` already keeps for  */
/* the *automatic* layout above: a docked panel never grows past what        */
/* {@link thicknessBounds} allows, and a floating panel never ends up        */
/* somewhere {@link clampFloatingRect} would not also put it. Every pointer  */
/* drag and every keyboard step below routes its result through the same two */
/* functions the automatic layout is built on, so a user-driven resize can   */
/* never produce a rectangle the automatic layout would not also have        */
/* allowed - including the one invariant that matters most here: a floating  */
/* panel can never be dragged or stepped to somewhere outside the window,    */
/* because that would be a panel nobody can grab back.                       */
/* -------------------------------------------------------------------------- */

const moveInstructionsId = useId();
const resizeInstructionsId = useId();

/** Said out loud, once, when a drag or a keyboard step had to be kept inside the window. */
const geometryNote = ref<string | null>(null);

function announceClamp(): void {
    geometryNote.value = t(
        "panels.geometry.clamped",
        { title: props.title },
        "{title} was kept fully inside the window, so it can always be reached again.",
    );
}

/** The floating rectangle actually on screen right now, whether stored, computed, or default. */
const currentFloatingRect = computed<FloatingRect | null>(() => {
    if (layout.value.placement !== "floating") return null;
    const offset = layout.value.offset ?? { top: FLOATING_MARGIN, left: FLOATING_MARGIN };
    const size = layout.value.size ?? { width: props.preferredWidth, height: props.preferredHeight };
    return { top: offset.top, left: offset.left, width: size.width, height: size.height };
});

/** The thickness actually on screen right now, for whichever edge is docked. */
function currentThickness(): number {
    return layout.value.thickness > 0 ? layout.value.thickness : props.preferredThickness;
}

/**
 * One translation call per edge rather than building the key from `edge` with a template
 * string: a key built that way cannot be found by either of the catalogue's own scanners --
 * `catalogueCoverage.test.ts`'s `CALL_TO_T` looking for a call site to match against a key,
 * and `appCopy.test.ts`'s matching scanner looking the other way for a call site to match
 * against a catalogue entry -- both read only a plain quoted literal as the key, on purpose.
 */
function splitterLabel(edge: DockedEdge): string {
    switch (edge) {
        case "left":
            return t("panels.resize.left", { title: props.title }, "Resize {title} from the left edge");
        case "right":
            return t("panels.resize.right", { title: props.title }, "Resize {title} from the right edge");
        case "top":
            return t("panels.resize.top", { title: props.title }, "Resize {title} from the top edge");
        case "bottom":
            return t("panels.resize.bottom", { title: props.title }, "Resize {title} from the bottom edge");
    }
}

function splitterValueText(): string {
    return t("panels.resize.valueText", { value: Math.round(currentThickness()) }, "{value} pixels");
}

/* ---- Docked splitter: drag with the pointer, step with the keyboard ---- */

let splitterDragOrigin: { readonly pointerPos: number; readonly thickness: number; readonly edge: DockedEdge } | null =
    null;

function onSplitterPointerDown(event: PointerEvent, edge: DockedEdge): void {
    if (event.button !== 0) return;
    splitterDragOrigin = {
        pointerPos: dockAxis(edge) === "horizontal" ? event.clientX : event.clientY,
        thickness: currentThickness(),
        edge,
    };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
}

function onSplitterPointerMove(event: PointerEvent): void {
    if (splitterDragOrigin === null || event.buttons === 0) return;
    const { pointerPos, thickness, edge } = splitterDragOrigin;
    const currentPos = dockAxis(edge) === "horizontal" ? event.clientX : event.clientY;
    const rawDelta = currentPos - pointerPos;
    // The splitter sits on the panel's free edge, which is the opposite side from where the
    // panel is docked - so moving the pointer toward the docked edge grows the panel on a
    // right or bottom dock, and shrinks it on a left or top one.
    const requested = thickness + (edge === "right" || edge === "bottom" ? -rawDelta : rawDelta);
    const next = clampThickness(requested, edge, viewport.value, openerRect.value);
    setDockThickness(props.surfaceId, edge, next);
    if (next !== requested) announceClamp();
}

function onSplitterPointerUp(event: PointerEvent): void {
    if (splitterDragOrigin === null) return;
    splitterDragOrigin = null;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
}

function onSplitterKeydown(event: KeyboardEvent, edge: DockedEdge): void {
    const axis = dockAxis(edge);
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    let delta = 0;
    if (axis === "horizontal") {
        if (event.key === "ArrowLeft") delta = edge === "right" ? step : -step;
        else if (event.key === "ArrowRight") delta = edge === "right" ? -step : step;
        else return;
    } else {
        if (event.key === "ArrowUp") delta = edge === "bottom" ? step : -step;
        else if (event.key === "ArrowDown") delta = edge === "bottom" ? -step : step;
        else return;
    }
    event.preventDefault();
    const requested = currentThickness() + delta;
    const next = clampThickness(requested, edge, viewport.value, openerRect.value);
    setDockThickness(props.surfaceId, edge, next);
    if (next !== requested) announceClamp();
}

/* ---- Floating panel: drag its header to move it ---- */

let headerDragOrigin: { readonly pointerX: number; readonly pointerY: number; readonly rect: FloatingRect } | null =
    null;

/**
 * Starts a move drag from anywhere on the header except an interactive control inside it.
 *
 * The button and the placement chooser still work exactly as before: this only claims the
 * pointer when the press did not land on one of them, mirroring how the frameless title
 * bar's own drag region opts its buttons out with `no-drag`.
 */
function onHeaderPointerDown(event: PointerEvent): void {
    if (layout.value.placement !== "floating" || event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (
        target.closest(
            "button, a, input, [role='menuitem'], .v-btn, .v-field, .mb-docked__resize-handle, .mb-docked__move-handle",
        ) !== null
    ) {
        return;
    }
    const rect = currentFloatingRect.value;
    if (rect === null) return;
    headerDragOrigin = { pointerX: event.clientX, pointerY: event.clientY, rect };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
}

function onHeaderPointerMove(event: PointerEvent): void {
    if (headerDragOrigin === null || event.buttons === 0) return;
    const dx = event.clientX - headerDragOrigin.pointerX;
    const dy = event.clientY - headerDragOrigin.pointerY;
    const requested = { ...headerDragOrigin.rect, left: headerDragOrigin.rect.left + dx, top: headerDragOrigin.rect.top + dy };
    const next = clampFloatingRect(requested, viewport.value);
    setDockFloatingRect(props.surfaceId, next);
    if (next.top !== requested.top || next.left !== requested.left) announceClamp();
}

function onHeaderPointerUp(event: PointerEvent): void {
    if (headerDragOrigin === null) return;
    headerDragOrigin = null;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
    updateMoveAnnouncement();
}

/**
 * The move handle's own pointer handlers.
 *
 * `onHeaderPointerDown` deliberately ignores a press that lands on `.mb-docked__move-handle`
 * (see its own comment), on the assumption that the handle claims the gesture itself - but
 * nothing ever wired that claim up, which left the one control whose whole job is "grab here
 * to move" inert to a mouse or touch drag while the plain header background beside it worked
 * fine. These three exist to be that claim: the same drag math as the header's own handlers,
 * bound directly to the handle, with `stopPropagation` so the same press is not also picked
 * up by the header's listener when the event bubbles past it.
 */
function onMoveHandlePointerDown(event: PointerEvent): void {
    if (layout.value.placement !== "floating" || event.button !== 0) return;
    const rect = currentFloatingRect.value;
    if (rect === null) return;
    event.stopPropagation();
    headerDragOrigin = { pointerX: event.clientX, pointerY: event.clientY, rect };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
}

function onMoveHandlePointerMove(event: PointerEvent): void {
    if (headerDragOrigin === null || event.buttons === 0) return;
    event.stopPropagation();
    onHeaderPointerMove(event);
}

function onMoveHandlePointerUp(event: PointerEvent): void {
    if (headerDragOrigin === null) return;
    event.stopPropagation();
    onHeaderPointerUp(event);
}

function onMoveHandleKeydown(event: KeyboardEvent): void {
    const rect = currentFloatingRect.value;
    if (rect === null) return;
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
        case "ArrowLeft":
            dx = -step;
            break;
        case "ArrowRight":
            dx = step;
            break;
        case "ArrowUp":
            dy = -step;
            break;
        case "ArrowDown":
            dy = step;
            break;
        default:
            return;
    }
    event.preventDefault();
    const requested = { ...rect, left: rect.left + dx, top: rect.top + dy };
    const next = clampFloatingRect(requested, viewport.value);
    setDockFloatingRect(props.surfaceId, next);
    if (next.top !== requested.top || next.left !== requested.left) announceClamp();
    updateMoveAnnouncement();
}

/**
 * The move handle's current position, announced through a live region rather than through
 * `aria-valuenow` - unlike the resize handles, moving is two-dimensional and has no single
 * "value" a `role="slider"` could carry. Updated once per keyboard step and once per
 * completed pointer drag, not on every `pointermove` frame, so a screen reader is not asked
 * to read out a new position sixty times a second while somebody drags with a mouse.
 */
const moveAnnouncement = ref<string>("");

function updateMoveAnnouncement(): void {
    const rect = currentFloatingRect.value;
    moveAnnouncement.value =
        rect === null
            ? ""
            : t(
                  "panels.move.valueText",
                  { left: Math.round(rect.left), top: Math.round(rect.top) },
                  "{left} pixels from the left, {top} pixels from the top",
              );
}

/* ---- Floating panel: resize from its right edge, bottom edge, or corner ---- */

type ResizeAxis = "width" | "height" | "both";

let resizeDragOrigin: {
    readonly pointerX: number;
    readonly pointerY: number;
    readonly rect: FloatingRect;
    readonly axis: ResizeAxis;
} | null = null;

function onResizeHandlePointerDown(event: PointerEvent, axis: ResizeAxis): void {
    if (event.button !== 0) return;
    const rect = currentFloatingRect.value;
    if (rect === null) return;
    resizeDragOrigin = { pointerX: event.clientX, pointerY: event.clientY, rect, axis };
    (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
}

function onResizeHandlePointerMove(event: PointerEvent): void {
    if (resizeDragOrigin === null || event.buttons === 0) return;
    const { pointerX, pointerY, rect, axis } = resizeDragOrigin;
    const dw = axis === "height" ? 0 : event.clientX - pointerX;
    const dh = axis === "width" ? 0 : event.clientY - pointerY;
    const requested = { ...rect, width: rect.width + dw, height: rect.height + dh };
    const next = clampFloatingRect(requested, viewport.value);
    setDockFloatingRect(props.surfaceId, next);
    if (next.width !== requested.width || next.height !== requested.height) announceClamp();
}

function onResizeHandlePointerUp(event: PointerEvent): void {
    if (resizeDragOrigin === null) return;
    resizeDragOrigin = null;
    (event.currentTarget as Element).releasePointerCapture?.(event.pointerId);
}

function onResizeHandleKeydown(event: KeyboardEvent, axis: ResizeAxis): void {
    const rect = currentFloatingRect.value;
    if (rect === null) return;
    const step = event.shiftKey ? KEYBOARD_STEP_LARGE : KEYBOARD_STEP;
    let dw = 0;
    let dh = 0;
    if (axis !== "height") {
        if (event.key === "ArrowRight") dw = step;
        else if (event.key === "ArrowLeft") dw = -step;
    }
    if (axis !== "width") {
        if (event.key === "ArrowDown") dh = step;
        else if (event.key === "ArrowUp") dh = -step;
    }
    if (dw === 0 && dh === 0) return;
    event.preventDefault();
    const requested = { ...rect, width: rect.width + dw, height: rect.height + dh };
    const next = clampFloatingRect(requested, viewport.value);
    setDockFloatingRect(props.surfaceId, next);
    if (next.width !== requested.width || next.height !== requested.height) announceClamp();
}

function resizeHandleValueText(axis: ResizeAxis): string {
    const rect = currentFloatingRect.value;
    if (rect === null) return "";
    if (axis === "width") return t("panels.resize.valueText", { value: Math.round(rect.width) }, "{value} pixels");
    if (axis === "height") return t("panels.resize.valueText", { value: Math.round(rect.height) }, "{value} pixels");
    return t(
        "panels.resize.valueTextSize",
        { width: Math.round(rect.width), height: Math.round(rect.height) },
        "{width} by {height} pixels",
    );
}

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
        geometryNote.value = null;
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
    // Clears the placement, the docked size and the floating rectangle together: see the
    // header note on `resetDockPlacement` in `useDockPlacement.ts` for why "put it back
    // where it started" means all three.
    resetDockPlacement(props.surfaceId);
    placementMenuOpen.value = false;
    geometryNote.value = null;
}

function resetEverything(): void {
    resetAllDockPlacements();
    placementMenuOpen.value = false;
    geometryNote.value = null;
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
        <!--
            The docked splitter: one handle on the panel's free edge, draggable with the
            pointer and steppable with the keyboard. `role="separator"` with an orientation
            and a live value is the same pattern a resizable split view uses everywhere else
            this platform is built on; `aria-describedby` points at the visually hidden
            instructions near the end of this template rather than repeating them in the
            name, which would be read out before every single arrow-key press.
        -->
        <div
            v-if="isDockedEdge(layout.placement)"
            class="mb-docked__splitter"
            :class="`mb-docked__splitter--${dockAxis(layout.placement)}`"
            role="separator"
            tabindex="0"
            :aria-orientation="dockAxis(layout.placement) === 'horizontal' ? 'vertical' : 'horizontal'"
            :aria-valuemin="thicknessBounds(layout.placement, viewport, openerRect).min"
            :aria-valuemax="thicknessBounds(layout.placement, viewport, openerRect).max"
            :aria-valuenow="Math.round(currentThickness())"
            :aria-valuetext="splitterValueText()"
            :aria-label="splitterLabel(layout.placement)"
            :aria-describedby="resizeInstructionsId"
            @pointerdown="onSplitterPointerDown($event, layout.placement)"
            @pointermove="onSplitterPointerMove"
            @pointerup="onSplitterPointerUp"
            @keydown="onSplitterKeydown($event, layout.placement)"
        />

        <!--
            Floating panel: one edge handle per axis, plus a corner handle for both at once.
            The corner has no standard ARIA role for a two-dimensional resize - it is a
            focusable control with an accessible name and documented arrow-key behaviour
            rather than a `separator`, which only ever describes one dimension.
        -->
        <template v-if="layout.placement === 'floating'">
            <div
                class="mb-docked__resize-handle mb-docked__resize-handle--right"
                role="separator"
                tabindex="0"
                aria-orientation="vertical"
                :aria-valuemin="MINIMUM_FLOATING_SIZE"
                :aria-valuemax="Math.round(Math.max(0, viewport.width - FLOATING_MARGIN * 2))"
                :aria-valuenow="Math.round(currentFloatingRect?.width ?? 0)"
                :aria-valuetext="resizeHandleValueText('width')"
                :aria-label="t('panels.resize.right', { title: props.title }, 'Resize {title} from the right edge')"
                :aria-describedby="resizeInstructionsId"
                @pointerdown="onResizeHandlePointerDown($event, 'width')"
                @pointermove="onResizeHandlePointerMove"
                @pointerup="onResizeHandlePointerUp"
                @keydown="onResizeHandleKeydown($event, 'width')"
            />
            <div
                class="mb-docked__resize-handle mb-docked__resize-handle--bottom"
                role="separator"
                tabindex="0"
                aria-orientation="horizontal"
                :aria-valuemin="MINIMUM_FLOATING_SIZE"
                :aria-valuemax="Math.round(Math.max(0, viewport.height - FLOATING_MARGIN * 2))"
                :aria-valuenow="Math.round(currentFloatingRect?.height ?? 0)"
                :aria-valuetext="resizeHandleValueText('height')"
                :aria-label="t('panels.resize.bottom', { title: props.title }, 'Resize {title} from the bottom edge')"
                :aria-describedby="resizeInstructionsId"
                @pointerdown="onResizeHandlePointerDown($event, 'height')"
                @pointermove="onResizeHandlePointerMove"
                @pointerup="onResizeHandlePointerUp"
                @keydown="onResizeHandleKeydown($event, 'height')"
            />
            <div
                class="mb-docked__resize-handle mb-docked__resize-handle--corner"
                tabindex="0"
                :aria-label="t('panels.resize.corner', { title: props.title }, 'Resize {title} from the corner')"
                :aria-describedby="resizeInstructionsId"
                @pointerdown="onResizeHandlePointerDown($event, 'both')"
                @pointermove="onResizeHandlePointerMove"
                @pointerup="onResizeHandlePointerUp"
                @keydown="onResizeHandleKeydown($event, 'both')"
            >
                <v-icon :icon="mdiResizeBottomRight" size="14" />
            </div>
        </template>

        <div class="mb-docked__frame">
            <header
                class="mb-docked__bar"
                @pointerdown="onHeaderPointerDown"
                @pointermove="onHeaderPointerMove"
                @pointerup="onHeaderPointerUp"
            >
                <!--
                    The floating panel's own drag handle. The header itself is draggable too
                    (see the pointer handlers above) - this is the keyboard path, since a
                    `<header>` is not itself focusable and "draggable by the header" still
                    has to be operable without a pointer.
                -->
                <div
                    v-if="layout.placement === 'floating'"
                    class="mb-docked__move-handle"
                    tabindex="0"
                    :aria-label="t('panels.move.handle', { title: props.title }, 'Move {title}')"
                    :aria-describedby="moveInstructionsId"
                    @pointerdown="onMoveHandlePointerDown"
                    @pointermove="onMoveHandlePointerMove"
                    @pointerup="onMoveHandlePointerUp"
                    @keydown="onMoveHandleKeydown"
                >
                    <v-icon :icon="mdiArrowAll" size="16" />
                </div>
                <span class="mb-docked__visually-hidden" role="status" aria-live="polite">
                    {{ moveAnnouncement }}
                </span>

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

            <!--
                Said out loud, once, when a drag or a keyboard step had to be kept inside
                the window - the same "say it rather than silently clamp" pattern as the
                placement adjustment above.
            -->
            <p v-if="geometryNote !== null" class="mb-docked__adjustment" role="status">
                {{ geometryNote }}
            </p>

            <!--
                Read once by a screen reader when a resize or move handle receives focus,
                via `aria-describedby` - not repeated on every arrow-key press the way the
                handles' own `aria-valuetext` is.
            -->
            <span :id="moveInstructionsId" class="mb-docked__visually-hidden">
                {{
                    t(
                        "panels.move.instructions",
                        { title: props.title },
                        "Press an arrow key to move {title}. Hold Shift for a bigger step.",
                    )
                }}
            </span>
            <span :id="resizeInstructionsId" class="mb-docked__visually-hidden">
                {{
                    t(
                        "panels.resize.instructions",
                        { title: props.title },
                        "Press an arrow key to resize {title}. Hold Shift for a bigger step.",
                    )
                }}
            </span>

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

/*
 * A flex column, not a plain block: the host's content - `AppSettings.vue`'s
 * `.mb-settings__body` wrapping `TabbedNavigation`, `EulaSurface.vue`'s
 * `.mb-eula-surface__body` wrapping `EulaViewer`'s `.mb-eula` - is built on the same
 * "flex: 1 1 auto; min-block-size: 0; overflow: auto" idiom this application uses
 * everywhere a strip of chrome sits above scrolling content (see `.mb-shell-tabs` in
 * `App.vue` and `.mb-tabs__panel` in `TabbedNavigation.vue`). That idiom only works when
 * every ancestor up to the nearest bounded box is itself a flex container passing on a
 * real height - a plain block here breaks the chain two levels down: the host's own
 * `flex: 1 1 auto` has nothing to flex against, its height becomes "however tall the
 * content is" rather than "however tall the available space is", and the tab strip or
 * search header that was supposed to stay pinned while only the active tab's content
 * scrolls ends up scrolling away with everything else instead. `overflow: auto` stays
 * here too, as the outer safety net every docked surface keeps regardless of what its
 * host does with the space handed to it.
 */
.mb-docked__body {
    display: flex;
    flex-direction: column;
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

/* -------------------------------------------------------------------------- */
/* Resizing and moving                                                        */
/*                                                                             */
/* No transitions anywhere here, on purpose: this chrome had none before this */
/* feature and a pointer drag has to track the cursor exactly, not ease       */
/* toward it a frame late. With nothing animated there is nothing for         */
/* `prefers-reduced-motion` to turn off, the same reasoning `v-show`'s        */
/* instant jump above already relies on.                                     */
/* -------------------------------------------------------------------------- */

.mb-docked__splitter,
.mb-docked__resize-handle {
    position: absolute;
    z-index: 1;
    touch-action: none;
    background: transparent;
}

.mb-docked__splitter:hover,
.mb-docked__resize-handle:hover {
    background: rgba(var(--v-theme-primary), 0.12);
}

.mb-docked__splitter:focus-visible,
.mb-docked__resize-handle:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
    background: rgba(var(--v-theme-primary), 0.18);
}

.mb-docked__splitter--horizontal {
    /* The panel is docked left or right, so its free edge - and the splitter that resizes
       it - runs top to bottom. */
    top: 0;
    bottom: 0;
    inline-size: 10px;
    cursor: ew-resize;
}

.mb-docked--left .mb-docked__splitter--horizontal {
    inset-inline-end: 0;
}

.mb-docked--right .mb-docked__splitter--horizontal {
    inset-inline-start: 0;
}

.mb-docked__splitter--vertical {
    /* Docked top or bottom: the free edge runs left to right. */
    left: 0;
    right: 0;
    block-size: 10px;
    cursor: ns-resize;
}

.mb-docked--top .mb-docked__splitter--vertical {
    inset-block-end: 0;
}

.mb-docked--bottom .mb-docked__splitter--vertical {
    inset-block-start: 0;
}

.mb-docked__resize-handle--right {
    top: 0;
    bottom: 0;
    right: 0;
    inline-size: 10px;
    cursor: ew-resize;
}

.mb-docked__resize-handle--bottom {
    left: 0;
    right: 0;
    bottom: 0;
    block-size: 10px;
    cursor: ns-resize;
}

.mb-docked__resize-handle--corner {
    right: 0;
    bottom: 0;
    inline-size: 20px;
    block-size: 20px;
    display: flex;
    align-items: flex-end;
    justify-content: flex-end;
    padding: 2px;
    cursor: nwse-resize;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-docked__move-handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 28px;
    block-size: 28px;
    flex: 0 0 auto;
    border-radius: 8px;
    cursor: move;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    touch-action: none;
}

.mb-docked__move-handle:hover {
    background: rgba(var(--v-theme-primary), 0.12);
}

.mb-docked__move-handle:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
    background: rgba(var(--v-theme-primary), 0.18);
}

/* The whole header becomes the drag region only once the panel is floating - docked, it is
   just a title bar, and there is nowhere to drag it to. */
.mb-docked--floating .mb-docked__bar {
    touch-action: none;
}

/* Standard visually-hidden text: read by a screen reader, invisible and out of the way for
   everyone else. Used for the resize/move instructions and the move-position live region. */
.mb-docked__visually-hidden {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
