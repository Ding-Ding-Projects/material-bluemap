<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloseCircleOutline, mdiDocker, mdiPlayCircleOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VIcon } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { ContainerOffer, ContainerOffers, StrayContainer } from "./containerOffers.js";

/**
 * Containers left running from an earlier session, offered back.
 *
 * A containerised render outlives the window that started it, so closing the app while one
 * is going in Docker or on a remote host does not stop it - it just stops being watched.
 * This is the panel that makes that fact visible and actionable: pick one up and it reports
 * on the ordinary render list from then on, or say not now and it is offered again next
 * time, or stop it outright.
 *
 * `strays` are shown but never actioned from here, on purpose: a container this app clearly
 * started with no record beside it carries no render id to reattach to or stop by, so the
 * only honest thing is to name it.
 */
const props = defineProps<{ offers: ContainerOffers }>();

const { t } = useI18n();

const all = computed(() => props.offers.offers.value);
const strays = computed(() => props.offers.strays.value);

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

function offerText(offer: ContainerOffer): string[] {
    return [offer.containerName, offer.where, ...offer.mapIds, offer.message].filter((value) => value !== "");
}

const list = computed(() => all.value.filter((offer) => offerText(offer).some((value) => matcher.value.test(value))));
const sample = computed(() => all.value.map((offer) => offerText(offer).join(" ")).join("\n"));

onMounted(() => {
    void props.offers.load();
});

function accept(renderId: string): void {
    void props.offers.accept(renderId);
}

function stop(renderId: string): void {
    void props.offers.stop(renderId);
}

function dismiss(renderId: string): void {
    void props.offers.dismiss(renderId);
}
</script>

<template>
    <section v-if="all.length > 0 || strays.length > 0 || offers.failure.value" class="mb-container-offers">
        <h3 class="mb-container-offers__title">
            <v-icon :icon="mdiDocker" size="20" aria-hidden="true" />
            {{ t("world.containers.title", "Containers left running") }}
        </h3>
        <p class="mb-container-offers__blurb">
            {{ t("world.containers.blurb", "A container can go on rendering after this app closes. Anything listed here was left running from an earlier session; picking one up shows its progress in the render list below, and nothing here is stopped on its own.") }}
        </p>

        <v-alert v-if="offers.failure.value" type="error" density="compact" variant="tonal" class="mb-2" role="alert">
            {{ offers.failure.value }}
        </v-alert>

        <div v-if="all.length > 0" class="mb-container-offers__search">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('world.containers.searchLabel', 'Search these containers')"
                :placeholder="t('world.containers.searchHint', 'a container name, or where it is running')"
                :sample="sample"
            />
        </div>

        <p v-if="all.length > 0 && list.length === 0" class="mb-container-offers__blurb" role="status">
            {{ t("world.containers.noMatch", "No container matches that search. Clearing it brings them all back; nothing was declined.") }}
        </p>

        <v-card v-for="offer in list" :key="offer.renderId" variant="tonal" class="mb-container-offers__card">
            <v-card-title class="mb-container-offers__head">
                <span>{{ offer.containerName }}</span>
                <v-chip size="x-small" variant="outlined">{{ offer.where }}</v-chip>
                <v-chip v-for="mapId in offer.mapIds" :key="mapId" size="x-small" variant="outlined">{{ mapId }}</v-chip>
            </v-card-title>
            <v-card-text>
                <p class="mb-container-offers__line">{{ offer.message }}</p>

                <div class="mb-container-offers__actions">
                    <v-btn
                        v-if="offer.canResume"
                        :prepend-icon="mdiPlayCircleOutline"
                        :disabled="offers.busy.value !== null"
                        :loading="offers.busy.value === offer.renderId"
                        color="primary"
                        variant="tonal"
                        size="small"
                        @click="accept(offer.renderId)"
                    >
                        {{ t("world.containers.pickUp", "Pick this up") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiCloseCircleOutline"
                        :disabled="offers.busy.value !== null"
                        variant="text"
                        size="small"
                        @click="stop(offer.renderId)"
                    >
                        {{ t("world.containers.stop", "Stop it") }}
                    </v-btn>
                    <v-btn
                        :disabled="offers.busy.value !== null"
                        variant="text"
                        size="small"
                        @click="dismiss(offer.renderId)"
                    >
                        {{ t("world.containers.notNow", "Not now") }}
                    </v-btn>
                </div>
            </v-card-text>
        </v-card>

        <v-alert v-if="strays.length > 0" type="info" density="compact" variant="tonal" class="mt-2" role="status">
            <p class="mb-container-offers__line">{{ t("world.containers.strayNote", "This app started these too, but their record is gone, so nothing here can say which render they belong to. They are named rather than stopped.") }}</p>
            <p v-for="stray in strays as StrayContainer[]" :key="stray.containerName" class="mb-container-offers__line mb-container-offers__line--muted">
                {{ stray.containerName }} - {{ stray.where }} - {{ stray.message }}
            </p>
        </v-alert>
    </section>
</template>

<style>
.mb-container-offers {
    margin-block: 12px;
}

.mb-container-offers__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 500;
}

.mb-container-offers__blurb,
.mb-container-offers__line--muted {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-container-offers__search {
    margin-block: 8px;
    max-width: 420px;
}

.mb-container-offers__card {
    margin-block-start: 8px;
    border-radius: 12px;
}

.mb-container-offers__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.9375rem;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * means `offer.containerName` never gets a line to break on, so a long container
     * name was silently cut off with no ellipsis and no indication anything was
     * missing. Same fix as `DockerWorldSourcePanel.vue`'s
     * `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}

.mb-container-offers__line {
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-container-offers__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}
</style>
