<script setup lang="ts">
import SetupText from "./SetupText.vue";
import SetupLanguagePanel from "./SetupLanguagePanel.vue";
import WelcomeIntro from "./WelcomeIntro.vue";

/**
 * Step one: what this is, what you end up with, where to go next, and what to expect.
 *
 * `WelcomeIntro.vue` carries the actual answer to "what is this" so the same words
 * appear here and in the reachable `WelcomeSurface.vue` panel; this step only adds the
 * setup-specific framing around it (the heading, the "three short steps" lead, and the
 * language picker) and, once "Finish setup" is pressed, `App.vue` lands the person
 * directly on the "Make a map" tab - the concrete half of the "start here" pointer
 * `WelcomeIntro.vue`'s own text states.
 *
 * Nothing here is softened or buried in a changelog: the Java and Mojang-download facts
 * are stated in an alert rather than as body copy so they cannot be skim-read past, and
 * the funny level restyles the sentence around the fact without moving the fact.
 */
</script>

<template>
    <div class="mb-setup-step">
        <SetupText tag="h2" text-key="welcome.heading" class="mb-setup-step__heading" />
        <SetupText text-key="welcome.lead" class="mb-setup-step__lead" />

        <WelcomeIntro />

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
</style>
