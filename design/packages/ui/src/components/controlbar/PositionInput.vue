<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import type { BlueMapApp } from "@material-bluemap/viewer";
import NumberInput from "./NumberInput.vue";
import { useControlBarApp } from "./useControlBarApp.js";

/**
 * MD3 replacement for upstream `ControlBar/PositionInput.vue`: the live X / Y / Z readout,
 * editable.
 *
 * Y is only shown in free flight, because in the perspective and flat views the camera height
 * is driven by the terrain and typing into it would be immediately overwritten.
 *
 * Writing straight into `controlsManager.data.position` is the same path upstream used: the
 * controls manager notices the change on its next frame, moves the camera, fires
 * `bluemapCameraMoved`, and the app's debounced hash update keeps the shareable URL correct.
 */
const props = withDefaults(defineProps<{ app?: BlueMapApp | null }>(), { app: null });

const app = useControlBarApp(() => props.app);
const { t } = useI18n();

const controls = computed(() => app.value?.mapViewer.controlsManager.data ?? null);
const showY = computed(() => app.value?.appState.controls.state === "free");

/** Upstream has no key for a per-axis label; "Position" plus the axis letter reads in every locale. */
const positionLabel = computed(() => t("blockTooltip.position", "Position"));

function commit(axis: "x" | "y" | "z", value: number): void {
    const data = controls.value;
    if (!data) return;
    data.position[axis] = value;
}
</script>

<template>
    <div
        v-if="controls"
        class="mb-cb-position"
        role="group"
        :aria-label="positionLabel"
    >
        <NumberInput
            axis="x"
            :name="`${positionLabel} X`"
            :value="controls.position.x"
            @commit="commit('x', $event)"
        />
        <NumberInput
            v-if="showY"
            axis="y"
            :name="`${positionLabel} Y`"
            :value="controls.position.y"
            @commit="commit('y', $event)"
        />
        <NumberInput
            axis="z"
            :name="`${positionLabel} Z`"
            :value="controls.position.z"
            @commit="commit('z', $event)"
        />
    </div>
</template>

<style>
.mb-cb-position {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}
</style>
