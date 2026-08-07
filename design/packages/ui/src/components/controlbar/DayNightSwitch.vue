<script setup lang="ts">
import { computed } from "vue";
import { mdiWeatherNight, mdiWeatherSunny } from "@mdi/js";
import { animate, EasingFunctions } from "@worldlens/viewer";
import type { Animation, BlueMapApp } from "@worldlens/viewer";
import IconButton from "./IconButton.vue";
import { prefersReducedMotion, useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/DayNightSwitch.vue`.
 *
 * `isDay` is derived from the sunlight uniform itself, never from a local boolean: the settings
 * menu has a sunlight slider pointed at the same value, and a mirrored boolean desynchronises
 * the first time it moves. `mapViewer.redraw()` runs on every animation frame for the same
 * reason upstream did it, otherwise the change may not appear until the next camera move.
 *
 * Sunlight is deliberately not persisted (upstream does not save it either), so a reload
 * returns to the map's own `skyLight`.
 */
const props = withDefaults(
    defineProps<{
        /** Accessible name and tooltip text (upstream `lighting.dayNightSwitch.tooltip`). */
        label: string;
        app?: BlueMapApp | null;
    }>(),
    { app: null },
);

const app = useControlBarApp(() => props.app);

/** Module level, as upstream: a second click cancels the running fade rather than racing it. */
let animation: Animation | undefined;

const sunlight = computed(() => app.value?.mapViewer.data.uniforms.sunlightStrength ?? null);
const isDay = computed(() => (sunlight.value?.value ?? 1) > 0.6);

function toggle(event: MouseEvent): void {
    event.preventDefault();

    const viewer = app.value?.mapViewer;
    const uniform = sunlight.value;
    if (!viewer || !uniform) return;

    if (animation) animation.cancel();
    animation = undefined;

    const startValue = uniform.value;
    const targetValue = isDay.value ? 0.25 : 1;

    if (prefersReducedMotion()) {
        uniform.value = targetValue;
        viewer.redraw();
        return;
    }

    animation = animate((t) => {
        const u = EasingFunctions.easeOutQuad!(t);
        uniform.value = startValue * (1 - u) + targetValue * u;
        viewer.redraw();
    }, 300);
}
</script>

<template>
    <IconButton
        v-if="sunlight"
        class="mb-cb-daynight"
        :icon="isDay ? mdiWeatherSunny : mdiWeatherNight"
        :label="props.label"
        toggle
        :pressed="!isDay"
        @action="toggle"
    />
</template>
