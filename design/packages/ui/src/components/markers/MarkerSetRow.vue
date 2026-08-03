<script setup lang="ts">
import { computed } from "vue";
import { mdiChevronRight, mdiEyeOffOutline, mdiFolderOutline } from "@mdi/js";
import {
    countListedMarkerSets,
    countListedMarkers,
    isMarkerSetActive,
} from "./markerFilter.js";
import { useMarkerI18n } from "./i18nHelpers.js";
import type { AnyMarkerSetData } from "./markerTypes.js";

const props = defineProps<{
    markerSet: AnyMarkerSetData;
    /**
     * False when a set further up the tree is hidden. A child keeps its own stored
     * `visible` flag in that case, and three.js still renders nothing, so the row says
     * so instead of claiming the markers are on screen.
     */
    ancestorsVisible: boolean;
}>();

const emit = defineEmits<{ open: [set: AnyMarkerSetData] }>();

const { t, tx, tp } = useMarkerI18n();

const label = computed(() =>
    props.markerSet.id === "bm-players"
        ? t("players.title", "Players")
        : props.markerSet.label || props.markerSet.id,
);

const markerCount = computed(() => countListedMarkers(props.markerSet));
const setCount = computed(() => countListedMarkerSets(props.markerSet));
const active = computed(() => isMarkerSetActive(props.markerSet));

/** True when the set is switched on but an ancestor set is hiding it anyway. */
const hiddenByAncestor = computed(
    () => props.markerSet.visible && !props.ancestorsVisible,
);

const rowIsInteractive = computed(() => active.value || props.markerSet.toggleable);

const openLabel = computed(() => tx("markers.openSet", "Open {name}", { name: label.value }));
const toggleLabel = computed(() =>
    tx("markers.toggleSet", "Show or hide {name}", { name: label.value }),
);

/**
 * Writes the set's own `visible` flag and persists it under upstream's key,
 * `bluemap-markerset-<id>-visible`. The flag is the storage behind the three.js
 * `MarkerSet.visible` property, so the scene updates with it; child sets keep their own
 * flags untouched, exactly as upstream, because three.js already skips the whole subtree
 * of an invisible object.
 */
function setVisible(value: boolean): void {
    if (!props.markerSet.toggleable) return;
    // eslint-disable-next-line vue/no-mutating-props -- the prop is the viewer's own
    // reactive MarkerSet.data object, and mutating it is how the viewer is driven.
    props.markerSet.visible = value;
    // Optional call: upstream's ControlBar substitutes a plain object for the player set
    // when no player set exists yet, and that stand-in has no saveState.
    props.markerSet.saveState?.();
}

function onRowActivate(): void {
    if (active.value) {
        emit("open", props.markerSet);
        return;
    }
    if (props.markerSet.toggleable) setVisible(!props.markerSet.visible);
}
</script>

<template>
    <v-list-item
        class="mb-marker-set"
        :class="{ 'mb-marker-set--muted': hiddenByAncestor }"
        :link="rowIsInteractive"
        @click="rowIsInteractive ? onRowActivate() : undefined"
    >
        <v-tooltip activator="parent" :text="props.markerSet.id" location="bottom" open-delay="700" />

        <template #prepend>
            <v-icon
                :icon="hiddenByAncestor ? mdiEyeOffOutline : mdiFolderOutline"
                class="mb-marker-set__icon"
                aria-hidden="true"
            />
        </template>

        <v-list-item-title class="mb-marker-set__title">{{ label }}</v-list-item-title>
        <v-list-item-subtitle class="mb-marker-set__stats">
            <span v-if="markerCount > 0">
                {{ markerCount }} {{ tp("markers.marker", markerCount, "marker | markers") }}
            </span>
            <span v-if="setCount > 0">
                {{ setCount }} {{ tp("markers.markerSet", setCount, "marker-set | marker-sets") }}
            </span>
            <span v-if="hiddenByAncestor" class="mb-marker-set__hidden-note">
                {{ tx("markers.hiddenByParent", "hidden by a parent set") }}
            </span>
        </v-list-item-subtitle>

        <template #append>
            <div class="mb-marker-set__append">
                <!--
                  VSwitch renders a bare `input type="checkbox"` with no switch role, so it
                  is announced as a checkbox. `role`/`aria-*` are forwarded to that input by
                  Vuetify's own attribute split, which is what names and states it properly.
                -->
                <v-switch
                    v-if="props.markerSet.toggleable"
                    :model-value="props.markerSet.visible"
                    :aria-label="toggleLabel"
                    :aria-checked="props.markerSet.visible"
                    role="switch"
                    color="primary"
                    density="compact"
                    hide-details
                    inset
                    class="mb-marker-set__switch"
                    @click.stop
                    @keydown.enter.stop
                    @keydown.space.stop
                    @update:model-value="setVisible($event === true)"
                />
                <!--
                  `icon` is the boolean shape flag, not the glyph: VBtn only renders the
                  glyph from its `icon` prop when the button has no default slot, so a
                  button carrying a tooltip must draw its own <v-icon>.
                -->
                <v-btn
                    v-if="active"
                    icon
                    :aria-label="openLabel"
                    variant="text"
                    density="comfortable"
                    class="mb-marker-set__open"
                    @click.stop="emit('open', props.markerSet)"
                    @keydown.enter.stop
                    @keydown.space.stop
                >
                    <v-icon :icon="mdiChevronRight" aria-hidden="true" />
                    <v-tooltip activator="parent" :text="openLabel" location="bottom" />
                </v-btn>
            </div>
        </template>
    </v-list-item>
</template>

<style scoped>
.mb-marker-set {
    min-height: 3.5rem;
}

.mb-marker-set--muted .mb-marker-set__title,
.mb-marker-set--muted .mb-marker-set__stats {
    opacity: 0.65;
}

.mb-marker-set__icon {
    opacity: 0.7;
}

/* No ellipsis: long localized set names wrap instead of being cut off. */
.mb-marker-set__title {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    word-break: break-word;
    -webkit-line-clamp: unset;
    line-height: 1.3;
}

.mb-marker-set__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    white-space: normal;
    overflow: visible;
    -webkit-line-clamp: unset;
    opacity: 1;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), 0.7);
}

.mb-marker-set__hidden-note {
    font-style: italic;
}

.mb-marker-set__append {
    display: flex;
    align-items: center;
    gap: 0.125rem;
}

.mb-marker-set__switch :deep(.v-selection-control) {
    min-height: 2.5rem;
}

.mb-marker-set :deep(.v-btn:focus-visible),
.mb-marker-set :deep(.v-selection-control__input input:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-marker-set:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-marker-set :deep(*) {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
