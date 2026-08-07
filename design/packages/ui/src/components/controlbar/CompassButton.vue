<script setup lang="ts">
import { computed } from "vue";
import { animate, EasingFunctions } from "@worldlens/viewer";
import type { Animation, BlueMapApp } from "@worldlens/viewer";
import IconButton from "./IconButton.vue";
import { prefersReducedMotion, useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/Compass.vue`.
 *
 * The needle rotates live with `controlsManager.data.rotation`; clicking it eases the camera
 * rotation back to north over 300ms. North and south are painted in two different colours so
 * the heading is readable at a glance, which is functional information rather than chrome.
 */
const props = withDefaults(
    defineProps<{
        /** Accessible name and tooltip text (upstream `compass.tooltip`). */
        label: string;
        app?: BlueMapApp | null;
    }>(),
    { app: null },
);

const app = useControlBarApp(() => props.app);

/**
 * Module level, exactly as upstream: a second click cancels the first animation instead of two
 * of them fighting over the same rotation value. A per-instance ref would change that the
 * moment the bar is re-mounted (which happens on every server-profile switch).
 */
let animation: Animation | undefined;

const controls = computed(() => app.value?.mapViewer.controlsManager.data ?? null);
const rotation = computed(() => controls.value?.rotation ?? 0);

const needleStyle = computed(() => ({ transform: `rotate(${-rotation.value}rad)` }));

/** Camera heading in whole degrees, normalised to 0..359 for the tooltip. */
const heading = computed(() => {
    const degrees = Math.round((rotation.value * 180) / Math.PI);
    return ((degrees % 360) + 360) % 360;
});

function faceNorth(event: MouseEvent): void {
    event.preventDefault();

    const data = controls.value;
    if (!data) return;

    if (animation) animation.cancel();
    animation = undefined;

    if (prefersReducedMotion()) {
        data.rotation = 0;
        return;
    }

    const startRotation = data.rotation;
    animation = animate((t) => {
        data.rotation = startRotation * (1 - EasingFunctions.easeOutQuad!(t));
    }, 300);
}
</script>

<template>
    <IconButton
        v-if="controls"
        class="mb-cb-compass"
        :label="props.label"
        :tooltip="`${props.label} (${heading}°)`"
        @action="faceNorth"
    >
        <template #icon>
            <svg
                class="mb-cb-compass__needle"
                :style="needleStyle"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
            >
                <path class="mb-cb-compass__north" d="M12 1.5 L15 12 L9 12 Z" />
                <path class="mb-cb-compass__south" d="M9 12 L15 12 L12 22.5 Z" />
            </svg>
        </template>
    </IconButton>
</template>

<style>
.mb-cb-compass__needle {
    /* Bigger than a normal 24px icon: the heading has to be readable at a glance. */
    width: 28px;
    height: 28px;
    /* No transition: the needle tracks the camera every frame, so easing it would lag. */
}

.mb-cb-compass__north {
    fill: rgb(var(--v-theme-primary));
}

.mb-cb-compass__south {
    fill: rgba(var(--v-theme-on-surface), 0.38);
}
</style>
