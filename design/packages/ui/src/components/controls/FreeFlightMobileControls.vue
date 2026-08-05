<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowDownBold,
    mdiArrowUpBold,
    mdiChevronDoubleDown,
    mdiChevronDoubleUp,
} from "@mdi/js";
import type { BlueMapApp } from "@material-bluemap/viewer";
import { blueMapApp } from "../../stores/bluemap.js";

/**
 * Port of upstream Controls/FreeFlightMobileControls.vue.
 *
 * Two clusters of large arrows pinned to the bottom corners while free-flight is active:
 * bottom-left moves along the current heading, bottom-right changes world height. They stay
 * hidden until the first touch anywhere on the window, so a mouse-only desktop never sees
 * them covering the map. While a button is held the camera moves every render frame.
 *
 * Deliberate changes from upstream:
 *  - The stray `console.log` in the touch-stop handler is gone.
 *  - Touch-stop walks every entry in `changedTouches` instead of only the first. Upstream
 *    read `changedTouches[0]` alone, so lifting two fingers in the same event left the other
 *    axis moving forever.
 *  - `preventDefault()` inside a passive listener (which the browser refuses anyway) is
 *    replaced by `touch-action: none` on the buttons, which is what actually stops the
 *    browser from panning or zooming the page under the thumb.
 *  - The buttons are real buttons with accessible names and a keyboard hold path, because
 *    upstream's bare `<div>`s had no role, no tabindex and no keyboard route at all.
 *  - The cluster only reveals itself after a touch, but a touch-capable device can still have a
 *    mouse or trackpad (2-in-1 laptops, touchscreen all-in-ones). The buttons therefore also
 *    bind @mousedown/@mouseup/@mouseleave, reusing the same hold-while-pressed functions the
 *    keyboard path uses, so a mouse click on a revealed button drives movement instead of doing
 *    nothing.
 */
const { t } = useI18n();

/** False until the first touch anywhere on the window; a pointer-only device never flips it. */
const enabled = ref(false);

/** -1 back, 0 still, 1 forward. */
const forward = ref(0);
/** -1 down, 0 still, 1 up (world Y). */
const up = ref(0);

/**
 * Which touch owns each axis. Tracked so releasing one arrow does not cancel the other, and
 * kept out of the reactive graph because nothing renders from it.
 */
let forwardPointer = -1;
let upPointer = -1;

/** Set when a key is holding the axis, so a key release does not cancel a finger. */
let forwardKeyHeld = false;
let upKeyHeld = false;

function enable(): void {
    enabled.value = true;
}

function startForwardTouch(value: number, event: TouchEvent): void {
    forward.value = value;
    forwardPointer = event.changedTouches[0]?.identifier ?? -1;
}

function startUpTouch(value: number, event: TouchEvent): void {
    up.value = value;
    upPointer = event.changedTouches[0]?.identifier ?? -1;
}

function onTouchStop(event: TouchEvent): void {
    const changed = event.changedTouches;
    for (let i = 0; i < changed.length; i++) {
        const identifier = changed.item(i)?.identifier;
        if (identifier === undefined) continue;
        if (identifier === forwardPointer) {
            forwardPointer = -1;
            if (!forwardKeyHeld) forward.value = 0;
        }
        if (identifier === upPointer) {
            upPointer = -1;
            if (!upKeyHeld) up.value = 0;
        }
    }
}

function startForwardKey(value: number): void {
    forwardKeyHeld = true;
    forward.value = value;
}

function stopForwardKey(): void {
    forwardKeyHeld = false;
    if (forwardPointer === -1) forward.value = 0;
}

function startUpKey(value: number): void {
    upKeyHeld = true;
    up.value = value;
}

function stopUpKey(): void {
    upKeyHeld = false;
    if (upPointer === -1) up.value = 0;
}

/**
 * Upstream's per-frame integration, unchanged: forward moves along the current heading on the
 * XZ plane, up moves on world Y, both scaled by the frame delta so the speed is frame-rate
 * independent. Writes go straight to the controls manager, which is the single source of
 * truth for the camera.
 */
function onFrame(event: Event): void {
    if (forward.value === 0 && up.value === 0) return;
    const app = blueMapApp.value;
    if (!app) return;

    const delta = (event as CustomEvent<{ delta: number }>).detail.delta;
    const cm = app.mapViewer.controlsManager;
    cm.position.x += forward.value * Math.sin(cm.rotation) * delta * 0.02;
    cm.position.z += forward.value * -Math.cos(cm.rotation) * delta * 0.02;
    cm.position.y += up.value * delta * 0.01;
}

/**
 * The render-frame event is dispatched on the app's root element, and the whole app is torn
 * down and rebuilt when the active server profile changes, so the listener follows the
 * instance rather than being bound once at mount.
 */
let boundEvents: EventTarget | null = null;

function bindFrameEvents(app: BlueMapApp | null): void {
    if (boundEvents) {
        boundEvents.removeEventListener("bluemapRenderFrame", onFrame);
        boundEvents = null;
    }
    if (app) {
        boundEvents = app.events;
        boundEvents.addEventListener("bluemapRenderFrame", onFrame);
    }
}

watch(blueMapApp, (app) => bindFrameEvents(app), { immediate: true });

window.addEventListener("touchstart", enable, { passive: true });
window.addEventListener("touchend", onTouchStop, { passive: true });
window.addEventListener("touchcancel", onTouchStop, { passive: true });

onBeforeUnmount(() => {
    window.removeEventListener("touchstart", enable);
    window.removeEventListener("touchend", onTouchStop);
    window.removeEventListener("touchcancel", onTouchStop);
    bindFrameEvents(null);
});
</script>

<template>
    <div v-show="enabled" class="mb-ff-controls">
        <div
            class="mb-ff-controls__cluster mb-ff-controls__cluster--move mb-interactive"
            role="group"
            :aria-label="t('freeFlightControls.title', 'Free-Flight Controls')"
        >
            <v-btn
                class="mb-ff-controls__btn"
                variant="flat"
                color="surface"
                elevation="3"
                :icon="mdiArrowUpBold"
                :aria-label="t('freeFlightControls.moveForward', 'Move forward')"
                :aria-pressed="forward === 1"
                @touchstart.passive="startForwardTouch(1, $event)"
                @mousedown="startForwardKey(1)"
                @mouseup="stopForwardKey"
                @mouseleave="stopForwardKey"
                @keydown.enter.prevent="startForwardKey(1)"
                @keydown.space.prevent="startForwardKey(1)"
                @keyup="stopForwardKey"
                @blur="stopForwardKey"
            />
            <v-btn
                class="mb-ff-controls__btn"
                variant="flat"
                color="surface"
                elevation="3"
                :icon="mdiArrowDownBold"
                :aria-label="t('freeFlightControls.moveBackward', 'Move backward')"
                :aria-pressed="forward === -1"
                @touchstart.passive="startForwardTouch(-1, $event)"
                @mousedown="startForwardKey(-1)"
                @mouseup="stopForwardKey"
                @mouseleave="stopForwardKey"
                @keydown.enter.prevent="startForwardKey(-1)"
                @keydown.space.prevent="startForwardKey(-1)"
                @keyup="stopForwardKey"
                @blur="stopForwardKey"
            />
        </div>
        <div
            class="mb-ff-controls__cluster mb-ff-controls__cluster--height mb-interactive"
            role="group"
            :aria-label="t('freeFlightControls.height', 'Height')"
        >
            <v-btn
                class="mb-ff-controls__btn"
                variant="flat"
                color="surface"
                elevation="3"
                :icon="mdiChevronDoubleUp"
                :aria-label="t('freeFlightControls.moveUp', 'Move up')"
                :aria-pressed="up === 1"
                @touchstart.passive="startUpTouch(1, $event)"
                @mousedown="startUpKey(1)"
                @mouseup="stopUpKey"
                @mouseleave="stopUpKey"
                @keydown.enter.prevent="startUpKey(1)"
                @keydown.space.prevent="startUpKey(1)"
                @keyup="stopUpKey"
                @blur="stopUpKey"
            />
            <v-btn
                class="mb-ff-controls__btn"
                variant="flat"
                color="surface"
                elevation="3"
                :icon="mdiChevronDoubleDown"
                :aria-label="t('freeFlightControls.moveDown', 'Move down')"
                :aria-pressed="up === -1"
                @touchstart.passive="startUpTouch(-1, $event)"
                @mousedown="startUpKey(-1)"
                @mouseup="stopUpKey"
                @mouseleave="stopUpKey"
                @keydown.enter.prevent="startUpKey(-1)"
                @keydown.space.prevent="startUpKey(-1)"
                @keyup="stopUpKey"
                @blur="stopUpKey"
            />
        </div>
    </div>
</template>

<style scoped>
/*
 * `--mb-ff-size` and `--mb-ff-gap` are defined on #app in styles/global.scss, including the
 * short-viewport step-down, because the shell reads the same tokens to lift its bottom-left
 * control clear of the movement cluster.
 */
.mb-ff-controls__cluster {
    position: fixed;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    display: flex;
    flex-direction: column;
    gap: var(--mb-ff-gap);
    touch-action: none;
}

.mb-ff-controls__cluster--move {
    left: calc(12px + env(safe-area-inset-left, 0px));
}

.mb-ff-controls__cluster--height {
    right: calc(12px + env(safe-area-inset-right, 0px));
}

.mb-ff-controls__btn {
    width: var(--mb-ff-size);
    height: var(--mb-ff-size);
    touch-action: none;
    /* Upstream let the map read straight through these at 0.5 alpha, which leaves the arrows
       barely legible over bright terrain. An opaque M3 surface (the same treatment the zoom
       cluster uses) keeps the contrast the accessibility rules require; the slight alpha is
       enough to still read as floating over the world. */
    opacity: 0.94;
}

.mb-ff-controls__btn:active,
.mb-ff-controls__btn:hover,
.mb-ff-controls__btn:focus-visible {
    opacity: 1;
}

/* The icon is the whole affordance here, so it takes the accent colour rather than the muted
   default a flat button would inherit, and scales with the button. */
.mb-ff-controls__btn :deep(.v-icon) {
    color: rgb(var(--v-theme-primary));
    font-size: calc(var(--mb-ff-size) * 0.45);
}
</style>
