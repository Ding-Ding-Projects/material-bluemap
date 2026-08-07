<script setup lang="ts">
import { computed } from "vue";
import { ACTION_ARTWORK, type ActionArtworkId } from "./actionArtwork.js";

const props = withDefaults(
    defineProps<{
        artwork: ActionArtworkId;
        /** A translated description may replace the semantic English fallback. */
        alt?: string;
        eager?: boolean;
    }>(),
    { alt: "", eager: false },
);

const record = computed(() => ACTION_ARTWORK[props.artwork]);
const semanticAlt = computed(() => props.alt.trim() || record.value.alt);
</script>

<template>
    <figure class="mb-action-artwork" :data-action-artwork="artwork">
        <img
            class="mb-action-artwork__image"
            :src="record.source"
            :alt="semanticAlt"
            :loading="eager ? 'eager' : 'lazy'"
            decoding="async"
        />
    </figure>
</template>

<style>
.mb-action-artwork {
    inline-size: 100%;
    margin: 0 0 16px;
    overflow: hidden;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 16px;
    background: rgb(var(--v-theme-surface-container));
    aspect-ratio: 16 / 7;
}

.mb-action-artwork__image {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
    object-position: center;
}

@media (max-width: 560px) {
    .mb-action-artwork {
        aspect-ratio: 4 / 3;
        border-radius: 12px;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-action-artwork,
    .mb-action-artwork__image {
        animation: none !important;
        transition: none !important;
    }
}
</style>
