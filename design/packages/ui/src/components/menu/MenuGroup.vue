<script setup lang="ts">
import { useId } from "vue";
import { VListSubheader } from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/Group.vue`.
 *
 * Upstream drew a 2px box with the title floating on its top-right edge; that is legacy
 * chrome and is gone. What survives is the behaviour: a labelled grouping, and the
 * `max-height: 15em; overflow-y: auto` cap that stops the theme and language lists from
 * pushing the rest of the settings page off screen.
 */
withDefaults(
    defineProps<{
        title?: string;
        /** Caps the content at 15em and scrolls it (upstream's Group content behaviour). */
        scrollable?: boolean;
    }>(),
    { title: "", scrollable: false },
);

const titleId = useId();
</script>

<template>
    <section class="mb-menu-group" role="group" :aria-labelledby="title ? titleId : undefined">
        <v-list-subheader v-if="title" :id="titleId" class="mb-menu-group__title">
            {{ title }}
        </v-list-subheader>
        <div
            class="mb-menu-group__content"
            :class="{ 'mb-menu-group__content--scroll': scrollable }"
        >
            <slot />
        </div>
    </section>
</template>

<style>
.mb-menu-group {
    margin-block-end: 8px;
}

.mb-menu-group__title.v-list-subheader {
    min-height: 32px;
    padding-inline: 16px !important;
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 1;
    color: rgb(var(--v-theme-primary));
}

.mb-menu-group__content--scroll {
    max-height: 15em;
    overflow-y: auto;
    overscroll-behavior: contain;
}
</style>
