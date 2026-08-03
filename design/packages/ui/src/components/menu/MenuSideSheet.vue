<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiClose } from "@mdi/js";
import {
    VBtn,
    VDivider,
    VIcon,
    VNavigationDrawer,
    VToolbar,
    VToolbarTitle,
    VTooltip,
} from "vuetify/components";

/**
 * MD3 replacement for upstream `Menu/SideMenu.vue`: the sliding panel the whole menu lives
 * in. Upstream hand-rolled a fixed 20em panel with a fading `<Transition>`; this is a
 * Vuetify side sheet with the same geometry and the same two controls.
 *
 * The leading button is back/close exactly as upstream's morphing hamburger was: at the
 * bottom of the page stack it closes the sheet, deeper in it goes up one page. The trailing
 * close-everything button only appears when there is somewhere to go back to.
 *
 * Upstream's hamburger-to-X morph (the double `$nextTick` dance) is gone deliberately: the
 * sheet covers the control bar's own menu button while open, so there is exactly one button
 * at that position and nothing to morph between.
 */
withDefaults(
    defineProps<{
        title: string;
        open: boolean;
        /** True when the page stack is deeper than one page. */
        back?: boolean;
    }>(),
    { back: false },
);

const emit = defineEmits<{ back: []; close: [] }>();

const { t } = useI18n();
</script>

<template>
    <v-navigation-drawer
        class="mb-side-sheet"
        :model-value="open"
        :scrim="false"
        location="left"
        width="320"
        temporary
        :aria-label="title"
        @keydown.esc="emit('back')"
        @update:model-value="(value: boolean) => !value && emit('close')"
    >
        <template #prepend>
            <v-toolbar class="mb-side-sheet__bar" density="comfortable" flat color="surface">
                <template #prepend>
                    <v-btn
                        icon
                        :aria-label="
                            back ? t('menu.back', 'Back') : t('menu.close', 'Close the menu')
                        "
                        variant="text"
                        @click="emit('back')"
                    >
                        <!-- The icon goes in the default slot: `icon="<path>"` and slot
                             content are mutually exclusive in VBtn, and the tooltip needs
                             to be a child for `activator="parent"`. -->
                        <v-icon :icon="back ? mdiArrowLeft : mdiClose" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="back ? t('menu.back', 'Back') : t('menu.close', 'Close the menu')"
                        />
                    </v-btn>
                </template>

                <v-toolbar-title class="mb-side-sheet__title">{{ title }}</v-toolbar-title>

                <template #append>
                    <v-btn
                        v-if="back"
                        icon
                        :aria-label="t('menu.close', 'Close the menu')"
                        variant="text"
                        @click="emit('close')"
                    >
                        <v-icon :icon="mdiClose" />
                        <v-tooltip
                            activator="parent"
                            location="bottom"
                            :text="t('menu.close', 'Close the menu')"
                        />
                    </v-btn>
                    <div v-else class="mb-side-sheet__balance" aria-hidden="true" />
                </template>
            </v-toolbar>
            <v-divider />
        </template>

        <slot />
    </v-navigation-drawer>
</template>

<style>
.mb-side-sheet.v-navigation-drawer {
    /* Above the floating control bar, below Vuetify's overlay stack (menus, dialogs). */
    z-index: 1500 !important;
    max-width: 100vw;
    pointer-events: auto;
}

.mb-side-sheet .mb-side-sheet__title {
    text-align: center;
    font-size: 1rem;
    overflow-wrap: anywhere;
    white-space: normal;
    line-height: 1.25;
}

.mb-side-sheet__balance {
    width: 48px;
}

.mb-side-sheet .v-navigation-drawer__content {
    overscroll-behavior: contain;
    padding-block-end: 16px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-side-sheet.v-navigation-drawer,
    .mb-side-sheet .v-navigation-drawer__content {
        transition-duration: 0.01ms !important;
    }
}
</style>
