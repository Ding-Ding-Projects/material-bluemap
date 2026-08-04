<script setup lang="ts">
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronUp } from "@mdi/js";
import { VAlert, VBtn } from "vuetify/components";
import type { DockerNote } from "./dockerStates.js";

/**
 * One of Docker's five states, rendered as the three sentences it deserves.
 *
 * A headline naming the state (with the version in it whenever Docker was willing to say
 * one), what it means, and the single next thing to do. Docker's own words go behind a
 * disclosure rather than into the paragraph, because they are the precise thing to search
 * for and the least readable thing on the screen.
 *
 * The tone is the note's, not this component's: `available` is a success, a stopped daemon
 * is a warning, a missing installation is merely information - because on a machine that
 * renders locally, Docker not being installed is not a problem at all.
 */
defineProps<{ note: DockerNote }>();

const { t } = useI18n();

const detailOpen = ref(false);
</script>

<template>
    <v-alert
        :type="note.tone"
        density="compact"
        variant="tonal"
        class="mb-remote-docker"
        :data-docker-status="note.status"
    >
        <p class="mb-remote-docker__headline">{{ note.headline }}</p>
        <p class="mb-remote-docker__line">{{ note.explanation }}</p>
        <p class="mb-remote-docker__line mb-remote-docker__next">
            <strong>{{ t("remote.docker.nextLabel", "Next:") }}</strong>
            {{ note.nextStep }}
        </p>

        <template v-if="note.detail">
            <v-btn
                :prepend-icon="detailOpen ? mdiChevronUp : mdiChevronDown"
                :aria-expanded="detailOpen ? 'true' : 'false'"
                variant="text"
                size="small"
                density="comfortable"
                @click="detailOpen = !detailOpen"
            >
                {{
                    detailOpen
                        ? t("remote.docker.hideDetail", "Hide what Docker said")
                        : t("remote.docker.showDetail", "Show what Docker said")
                }}
            </v-btn>
            <pre v-if="detailOpen" class="mb-remote-docker__detail">{{ note.detail }}</pre>
        </template>
    </v-alert>
</template>

<style>
.mb-remote-docker {
    margin-block-start: 8px;
}

.mb-remote-docker__headline {
    font-weight: 500;
}

.mb-remote-docker__line {
    margin-block-start: 4px;
    font-size: 0.8125rem;
    line-height: 1.5;
    text-wrap: pretty;
}

.mb-remote-docker__next {
    margin-block-start: 6px;
}

.mb-remote-docker__detail {
    margin-block-start: 6px;
    max-height: 30vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}
</style>
