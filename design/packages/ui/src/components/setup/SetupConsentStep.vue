<script setup lang="ts">
import { computed } from "vue";
import { VAlert } from "vuetify/components";
import SetupText from "./SetupText.vue";
import ConsentQuote from "./ConsentQuote.vue";
import { useSetupI18n } from "./setupI18n.js";

/**
 * Step two: the Mojang consent question.
 *
 * What is on screen, and why each part of it is there:
 *
 *  - **the quotation, verbatim**, in `ConsentQuote`. Upstream BlueMap's own wording from
 *    `core.conf`, character for character. Accepting here is exactly what sets
 *    `accept-download: true`, so the text on screen is the text in the file;
 *  - **a link to the document itself**, opened outside the app;
 *  - **why it is needed, in plain words.** BlueMap textures the map from the real
 *    Minecraft client file, so without it nothing renders on this computer at all;
 *  - **what each answer means**, both spelled out. Declining costs local rendering and
 *    costs nothing else: remote BlueMap servers keep working exactly as they do now;
 *  - **that it is asked once.** Whichever answer is given is remembered, and nothing in
 *    the app asks a second time.
 *
 * Every one of those sentences comes from the EXACT catalogue, so the funny level cannot
 * reach them at any setting. The heading and the lead above them are voiced, which is
 * the whole of what a level is allowed to change here.
 *
 * The buttons live in the dialog's action row, not in this component, so Accept and
 * Decline are rendered by the same code at the same size with nothing to separate them.
 */
const props = defineProps<{
    /** Set once the answer has been given, so a revisit says what is recorded. */
    answer: "accepted" | "declined" | null;
}>();

const i18n = useSetupI18n();

const answered = computed(() => props.answer !== null);
</script>

<template>
    <div class="mb-setup-step">
        <SetupText tag="h2" text-key="consent.heading" class="mb-setup-step__heading" />
        <SetupText text-key="consent.lead" class="mb-setup-step__lead" />

        <SetupText text-key="consent.why" />

        <ConsentQuote />

        <dl class="mb-setup-outcomes">
            <div class="mb-setup-outcomes__item">
                <dt>{{ i18n.t("action.accept") }}</dt>
                <dd><SetupText text-key="consent.ifAccept" /></dd>
            </div>
            <div class="mb-setup-outcomes__item">
                <dt>{{ i18n.t("action.decline") }}</dt>
                <dd><SetupText text-key="consent.ifDecline" /></dd>
            </div>
        </dl>

        <SetupText text-key="consent.askedOnce" class="mb-setup-step__lead" />
        <SetupText text-key="consent.reversible" class="mb-setup-step__lead" />

        <v-alert
            v-if="answered"
            :type="answer === 'accepted' ? 'success' : 'info'"
            variant="tonal"
            density="comfortable"
            role="status"
        >
            <SetupText
                :text-key="answer === 'accepted' ? 'consent.acceptedFact' : 'consent.declinedFact'"
            />
        </v-alert>
    </div>
</template>

<style>
.mb-setup-outcomes {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 12px 24px;
    margin: 0;
}

.mb-setup-outcomes__item > dt {
    margin-block-end: 4px;
    font-size: 0.8125rem;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgb(var(--v-theme-primary));
}

.mb-setup-outcomes__item > dd {
    margin: 0;
    font-size: 0.875rem;
}
</style>
