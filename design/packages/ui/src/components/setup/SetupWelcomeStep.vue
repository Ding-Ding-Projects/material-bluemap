<script setup lang="ts">
import { VAlert } from "vuetify/components";
import SetupText from "./SetupText.vue";
import SetupLanguagePanel from "./SetupLanguagePanel.vue";
import { useSetupI18n } from "./setupI18n.js";

/**
 * Step one: what this is, and what it cannot do yet.
 *
 * The limitation is not buried in a changelog and it is not softened. Somebody who
 * installed this to render their own world should find that out on the first screen
 * rather than after choosing a save, configuring a map and pressing a button. It is
 * stated in an alert rather than as body copy so it cannot be skim-read past, and the
 * funny level restyles the sentence around the fact without moving the fact.
 */
const i18n = useSetupI18n();
</script>

<template>
    <div class="mb-setup-step">
        <SetupText tag="h2" text-key="welcome.heading" class="mb-setup-step__heading" />
        <SetupText text-key="welcome.lead" class="mb-setup-step__lead" />
        <SetupText text-key="welcome.what" />

        <v-alert
            type="info"
            variant="tonal"
            density="comfortable"
            class="mb-setup-step__alert"
            :title="i18n.t('welcome.limitations')"
        >
            <SetupText text-key="welcome.cannot" />
        </v-alert>

        <SetupLanguagePanel />
    </div>
</template>

<style>
.mb-setup-step {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.mb-setup-step__heading {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 400;
    line-height: 1.3;
    color: rgb(var(--v-theme-on-surface));
}

.mb-setup-step__lead {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setup-step__alert {
    /* Long bilingual copy at 200% scale must wrap, never clip. */
    overflow-wrap: anywhere;
}
</style>
