<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
    mdiCodeTags,
    mdiCrosshairs,
    mdiCrosshairsGps,
    mdiMapMarker,
    mdiVectorLine,
    mdiVectorPolygon,
    mdiVectorSquare,
} from "@mdi/js";
import { markerDisplayLabel } from "./markerFilter.js";
import { useMarkerI18n } from "./i18nHelpers.js";
import type { AnyMarkerData } from "./markerTypes.js";

const STEVE_HEAD = "assets/steve.png";

const props = defineProps<{
    marker: AnyMarkerData;
    /** `appState.debug`, which adds the marker's type to the stats line. */
    debug: boolean;
    /** Id of the player marker the camera is currently following, if any. */
    followingId: string | null;
    /** True while this row's own navigation (map lookup and switch) is still running. */
    busy: boolean;
}>();

const emit = defineEmits<{ activate: [marker: AnyMarkerData, follow: boolean] }>();

const { t, tx } = useMarkerI18n();

const isPlayer = computed(() => props.marker.type === "player");
const label = computed(() => markerDisplayLabel(props.marker));
const isFollowing = computed(
    () => props.followingId !== null && props.followingId === props.marker.id,
);

/**
 * Upstream ignored a click on a hidden marker but still rendered the row as a button.
 * Marking it disabled instead gives assistive technology the same answer the pointer
 * gets. Player rows stay usable while hidden, exactly as upstream, because following a
 * player in another world is how you get taken to it.
 */
const clickable = computed(() => isPlayer.value || props.marker.visible);

const typeIcon = computed(() => {
    switch (props.marker.type) {
        case "poi":
            return mdiMapMarker;
        case "shape":
            return mdiVectorPolygon;
        case "extrude":
            return mdiVectorSquare;
        case "line":
            return mdiVectorLine;
        case "html":
            return mdiCodeTags;
        default:
            return mdiMapMarker;
    }
});

/**
 * `playerHead` is built by the viewer's PlayerMarkerSet from the map's own data root, so
 * it already points through this port's per-profile proxy and survives a map switch.
 * Upstream rebuilt the URL from a map id captured once at setup, which broke on both.
 */
const headFailed = ref(false);
watch(
    () => props.marker.playerHead,
    () => {
        headFailed.value = false;
    },
);
const headSrc = computed(() =>
    headFailed.value ? STEVE_HEAD : (props.marker.playerHead ?? STEVE_HEAD),
);

const position = computed(() => ({
    x: Math.floor(props.marker.position.x),
    y: Math.floor(props.marker.position.y),
    z: Math.floor(props.marker.position.z),
}));

const goToLabel = computed(() => tx("markers.goToMarker", "Go to {name}", { name: label.value }));
</script>

<template>
    <v-list-item
        class="mb-marker-item"
        :class="{ 'mb-marker-item--hidden': !props.marker.visible }"
        :link="clickable"
        :disabled="!clickable || props.busy"
        @click="clickable && !props.busy ? emit('activate', props.marker, false) : undefined"
    >
        <v-tooltip activator="parent" :text="props.marker.id" location="bottom" open-delay="700" />

        <template #prepend>
            <div class="mb-marker-item__icon">
                <img
                    v-if="isPlayer"
                    :key="headSrc"
                    :src="headSrc"
                    :alt="tx('markers.playerHeadAlt', 'Head of {name}', { name: label })"
                    class="mb-marker-item__head"
                    draggable="false"
                    @error="headFailed = true"
                />
                <v-icon v-else :icon="typeIcon" aria-hidden="true" />
            </div>
        </template>

        <v-list-item-title class="mb-marker-item__title">{{ label }}</v-list-item-title>
        <v-list-item-subtitle class="mb-marker-item__stats">
            <span v-if="props.debug">{{ props.marker.type }}-marker</span>
            <span>({{ position.x }} | {{ position.y }} | {{ position.z }})</span>
            <span v-if="!props.marker.visible">
                {{ tx("markers.hiddenMarker", "hidden") }}
            </span>
        </v-list-item-subtitle>

        <template #append>
            <div class="mb-marker-item__actions">
                <v-progress-circular
                    v-if="props.busy"
                    indeterminate
                    size="24"
                    width="2"
                    class="mb-marker-item__busy"
                    :aria-label="tx('markers.locatingPlayer', 'Looking for the player')"
                />
                <template v-else>
                    <!--
                      The whole row moves the camera as well, but a row is a `listitem`, not
                      a button. This is the properly-roled control for the same action, so
                      the list stays valid ARIA while every action still has a real button.
                    -->
                    <!--
                      `icon` here is the boolean shape flag, not the glyph: VBtn only draws
                      the glyph from its `icon` prop when the button has no default slot, so
                      a button carrying a tooltip must render its own <v-icon>.
                    -->
                    <v-btn
                        icon
                        :disabled="!clickable"
                        :aria-label="goToLabel"
                        variant="text"
                        density="comfortable"
                        class="mb-marker-item__goto"
                        @click.stop="emit('activate', props.marker, false)"
                        @keydown.enter.stop
                        @keydown.space.stop
                    >
                        <v-icon :icon="mdiCrosshairs" aria-hidden="true" />
                        <v-tooltip activator="parent" :text="goToLabel" location="bottom" />
                    </v-btn>
                    <v-btn
                        v-if="isPlayer"
                        icon
                        :color="isFollowing ? 'primary' : undefined"
                        :aria-pressed="isFollowing"
                        :aria-label="t('markers.followPlayerTitle', 'Follow Player')"
                        variant="text"
                        density="comfortable"
                        class="mb-marker-item__follow"
                        @click.stop="emit('activate', props.marker, true)"
                        @keydown.enter.stop
                        @keydown.space.stop
                    >
                        <v-icon :icon="mdiCrosshairsGps" aria-hidden="true" />
                        <v-tooltip
                            activator="parent"
                            :text="t('markers.followPlayerTitle', 'Follow Player')"
                            location="bottom"
                        />
                    </v-btn>
                </template>
            </div>
        </template>
    </v-list-item>
</template>

<style scoped>
.mb-marker-item {
    min-height: 3.5rem;
}

/* Upstream's cue for a marker that is switched off: kept as-is, it is state, not chrome. */
.mb-marker-item--hidden {
    opacity: 0.5;
    filter: grayscale(1);
}

.mb-marker-item__icon {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-inline-end: 0.75rem;
}

.mb-marker-item__head {
    width: 2rem;
    height: 2rem;
    /* Minecraft heads are 8x8 source images; keep the blocks crisp. */
    image-rendering: pixelated;
}

/* No ellipsis: long localized marker names wrap instead of being cut off. */
.mb-marker-item__title {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    word-break: break-word;
    -webkit-line-clamp: unset;
    line-height: 1.3;
}

.mb-marker-item__stats {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    white-space: normal;
    overflow: visible;
    -webkit-line-clamp: unset;
    opacity: 1;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), 0.7);
}

.mb-marker-item__actions {
    display: flex;
    align-items: center;
    gap: 0.125rem;
}

.mb-marker-item__busy {
    margin-inline: 0.75rem;
}

.mb-marker-item :deep(.v-btn:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

.mb-marker-item:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-marker-item :deep(*) {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
