<script setup lang="ts">
import { VAlert } from "vuetify/components";
import SetupText from "./SetupText.vue";
import { useSetupI18n } from "./setupI18n.js";

/**
 * The "what is this?" content, shared between two places it has to say the same thing:
 * the first-run welcome step, where it is met once, and `WelcomeSurface.vue`, where it
 * stays reachable afterwards. One component rather than two copies, so the answer to
 * "what is BlueMap" cannot drift between the version somebody reads on day one and the
 * version they find later from Home's introduction card or the command palette.
 *
 * Four short facts, in order, before any jargon: what BlueMap is, what this app does
 * with it, what you end up with, and where to go next. The alert at the end is the
 * honest-expectations disclosure the scouting pass asked for at the point of
 * commitment - Java may be provisioned, the Mojang download uses the very next step's
 * answer rather than a second one, restated in `WizardReviewStep.vue`'s own review step
 * right before the render button, because somebody deciding whether to bother at all
 * deserves to know it here too.
 */
const i18n = useSetupI18n();
</script>

<template>
    <div class="mb-welcome-intro">
        <SetupText text-key="welcome.what" />
        <SetupText text-key="welcome.result" />
        <SetupText text-key="welcome.startHere" />

        <v-alert
            type="info"
            variant="tonal"
            density="comfortable"
            class="mb-welcome-intro__alert"
            :title="i18n.t('welcome.limitations')"
        >
            <SetupText text-key="welcome.cannot" />
        </v-alert>
    </div>
</template>

<style>
.mb-welcome-intro {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.mb-welcome-intro__alert {
    /* Long bilingual copy at 200% scale must wrap, never clip. */
    overflow-wrap: anywhere;
}
</style>
