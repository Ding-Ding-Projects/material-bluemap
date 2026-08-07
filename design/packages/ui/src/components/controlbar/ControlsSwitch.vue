<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAirplane, mdiCubeOutline, mdiSquareOutline } from "@mdi/js";
import type { BlueMapApp } from "@worldlens/viewer";
import IconButton from "./IconButton.vue";
import { useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/ControlsSwitch.vue`: an MD3 segmented control over
 * the three view modes.
 *
 * Each mode is only offered if the current map declares it. `appState.controls.state` stays the
 * single source of truth (five other surfaces read it), and it is written only by the viewer's
 * own `setPerspectiveView` / `setFlatView` / `setFreeFlight`, at the END of the transition. No
 * local mirror.
 *
 * Leaving free flight passes a `minDistance` of 100 so the camera does not surface inside
 * terrain, exactly as upstream did.
 */
const props = withDefaults(defineProps<{ app?: BlueMapApp | null }>(), { app: null });

const app = useControlBarApp(() => props.app);
const { t } = useI18n();

const map = computed(() => app.value?.mapViewer.data.map ?? null);
const state = computed(() => app.value?.appState.controls.state ?? "perspective");

const isPerspectiveView = computed(() => state.value === "perspective");
const isFlatView = computed(() => state.value === "flat");
const isFreeFlight = computed(() => state.value === "free");

function setPerspectiveView(): void {
    app.value?.setPerspectiveView(500, isFreeFlight.value ? 100 : 0);
}

function setFlatView(): void {
    app.value?.setFlatView(500, isFreeFlight.value ? 100 : 0);
}

function setFreeFlight(): void {
    app.value?.setFreeFlight(500);
}
</script>

<template>
    <div
        v-if="map"
        class="mb-cb-views"
        role="group"
        :aria-label="t('controls.title', 'View / Controls')"
    >
        <IconButton
            v-if="map.perspectiveView"
            :icon="mdiCubeOutline"
            :label="t('controls.perspective.tooltip', 'Perspective-View')"
            :active="isPerspectiveView"
            toggle
            :pressed="isPerspectiveView"
            @action="setPerspectiveView"
        />
        <IconButton
            v-if="map.flatView"
            :icon="mdiSquareOutline"
            :label="t('controls.flatView.tooltip', 'Orthographic / Flat-View')"
            :active="isFlatView"
            toggle
            :pressed="isFlatView"
            @action="setFlatView"
        />
        <IconButton
            v-if="map.freeFlightView"
            :icon="mdiAirplane"
            :label="t('controls.freeFlight.tooltip', 'Free-Flight / Spectator Mode')"
            :active="isFreeFlight"
            toggle
            :pressed="isFreeFlight"
            @action="setFreeFlight"
        />
    </div>
</template>

<style>
/*
 * MD3 segmented control: one container, buttons flush inside it. No padding, so the group is
 * exactly one button tall and both clusters in the bar line up.
 */
.mb-cb-views {
    display: flex;
    align-items: center;
    gap: 0;
    border-radius: calc(var(--mb-cb-size, 40px) / 2);
    background: rgba(var(--v-theme-on-surface), 0.06);
}
</style>
