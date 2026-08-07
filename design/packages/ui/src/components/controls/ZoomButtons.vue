<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiMinus, mdiPlus } from "@mdi/js";
import { MapControls } from "@worldlens/viewer";
import { blueMapApp } from "../../stores/bluemap.js";

/**
 * Port of upstream Controls/ZoomButtons.vue.
 *
 * Upstream was a fixed bottom-right column of two `SvgButton` divs (no role, no tabindex,
 * no keyboard path) feeding the same `mouseZoom.deltaZoom` accumulator the scroll wheel
 * uses, so the easing is shared. The MD3 rebuild keeps that single accumulator exactly and
 * replaces the chrome with a real M3 surface holding two real buttons.
 *
 * Visibility is decided by the parent (upstream: `showMapMenu && showZoomButtons && state
 * !== 'free'`), because `appState.controls.showZoomButtons` belongs to the settings menu.
 */
const { t } = useI18n();

/**
 * `controlsManager.controls` is null for the whole duration of a view transition, and is the
 * free-flight controls (which have no zoom) in free-flight mode. Narrowing on MapControls
 * covers both without a cast, and matches upstream's optional-chained duck test.
 */
function zoom(delta: number): void {
    const controls = blueMapApp.value?.mapViewer.controlsManager.controls;
    if (controls instanceof MapControls) {
        controls.mouseZoom.deltaZoom += delta;
    }
}
</script>

<template>
    <div class="mb-zoom-buttons mb-interactive">
        <v-card class="mb-zoom-buttons__surface" rounded="xl" elevation="3" color="surface">
            <v-tooltip :text="t('zoomButtons.zoomIn', 'Zoom in')" location="start">
                <template #activator="{ props: tooltipProps }">
                    <v-btn
                        v-bind="tooltipProps"
                        class="mb-zoom-buttons__btn mb-zoom-buttons__btn--in"
                        variant="text"
                        :icon="mdiPlus"
                        :aria-label="t('zoomButtons.zoomIn', 'Zoom in')"
                        @click="zoom(-3)"
                    />
                </template>
            </v-tooltip>
            <v-divider class="mb-zoom-buttons__divider" />
            <v-tooltip :text="t('zoomButtons.zoomOut', 'Zoom out')" location="start">
                <template #activator="{ props: tooltipProps }">
                    <v-btn
                        v-bind="tooltipProps"
                        class="mb-zoom-buttons__btn mb-zoom-buttons__btn--out"
                        variant="text"
                        :icon="mdiMinus"
                        :aria-label="t('zoomButtons.zoomOut', 'Zoom out')"
                        @click="zoom(3)"
                    />
                </template>
            </v-tooltip>
        </v-card>
    </div>
</template>

<style scoped>
.mb-zoom-buttons {
    position: fixed;
    right: calc(12px + env(safe-area-inset-right, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}

.mb-zoom-buttons__surface {
    display: flex;
    flex-direction: column;
}

/*
 * 48px is the minimum comfortable hit target; Vuetify's default icon button is exactly that.
 * The buttons carry the card's corner radius themselves rather than being clipped by
 * `overflow: hidden` on the card, because that clip also cut off the focus ring.
 */
.mb-zoom-buttons__btn {
    width: 48px;
    height: 48px;
    border-radius: 0;
}

.mb-zoom-buttons__btn--in {
    border-radius: 24px 24px 0 0;
}

.mb-zoom-buttons__btn--out {
    border-radius: 0 0 24px 24px;
}

.mb-zoom-buttons__divider {
    opacity: 0.6;
}
</style>
