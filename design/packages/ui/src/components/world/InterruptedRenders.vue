<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloseCircleOutline, mdiPlayCircleOutline, mdiRestore } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VIcon, VProgressLinear } from "vuetify/components";
import { describeInterruption, describeProgress, describeRefusal } from "./resumeOffers.js";
import type { ResumeOffers } from "./resumeOffers.js";

/**
 * Renders that stopped without finishing, offered back.
 *
 * A render of a large world runs for hours, and the app closing or the machine
 * sleeping in the middle of one must not cost that work. It does not: BlueMap's
 * storage is incremental, so carrying on skips every tile already drawn. Nothing
 * here restarts anything on its own; it reports what was left unfinished and how
 * far it got, and the person decides.
 *
 * A refused resume is shown as the refusal it is, in the main process's own
 * words, with what it means underneath. `config-changed` is the one that really
 * happens, and it is a reasonable answer rather than a fault.
 */
const props = defineProps<{ offers: ResumeOffers }>();

const emit = defineEmits<{
    /**
     * Carry this one on.
     *
     * Raised rather than handled here because the bridge call resolves only when
     * the resumed render has ENDED, which can be hours later. The shell starts
     * watching its progress the moment this is raised, so the person sees a bar
     * moving rather than a button that appears to have done nothing.
     */
    resume: [renderId: string];
}>();

const { t } = useI18n();

const list = computed(() => props.offers.offers.value);

onMounted(() => {
    void props.offers.load();
});

function refusalFor(renderId: string) {
    const refusal = props.offers.refusals.value[renderId];
    return refusal === undefined ? null : describeRefusal(refusal, t);
}

/** "3 August 2026 at 09:14" in the viewer's locale, or the raw stamp if it will not parse. */
function when(iso: string | null): string {
    if (iso === null) return "";
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return iso;
    try {
        return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(at);
    } catch {
        return iso;
    }
}
</script>

<template>
    <section v-if="list.length > 0 || offers.failure.value" class="mb-world-resume">
        <h3 class="mb-world-resume__title">
            <v-icon :icon="mdiRestore" size="20" aria-hidden="true" />
            {{ t("world.resume.title", "Renders that did not finish") }}
        </h3>
        <p class="mb-world-resume__blurb">
            {{
                t(
                    "world.resume.blurb",
                    "Carrying one on re-runs it against the tiles already on disk, so everything already drawn is skipped. Nothing is deleted either way.",
                )
            }}
        </p>

        <v-alert v-if="offers.failure.value" type="error" density="compact" variant="tonal" class="mb-2" role="alert">
            {{ offers.failure.value }}
        </v-alert>

        <v-card v-for="offer in list" :key="offer.renderId" variant="tonal" class="mb-world-resume__card">
            <v-card-title class="mb-world-resume__head">
                <span>{{ offer.maps.map((map) => map.name).join(", ") || offer.renderId }}</span>
                <v-chip size="x-small" variant="outlined">{{ offer.engine }}</v-chip>
                <v-chip v-if="offer.interruptedAt" size="x-small" variant="outlined">{{ when(offer.interruptedAt) }}</v-chip>
            </v-card-title>
            <v-card-text>
                <p class="mb-world-resume__line">{{ describeInterruption(offer, t) }}</p>
                <p class="mb-world-resume__line">{{ describeProgress(offer, t) }}</p>

                <v-progress-linear
                    v-if="offer.percent !== null"
                    :model-value="offer.percent"
                    :aria-label="t('world.resume.progressLabel', 'How far this render got')"
                    color="primary"
                    height="6"
                    rounded
                    class="my-2"
                />

                <p class="mb-world-resume__line mb-world-resume__line--muted">{{ offer.message }}</p>

                <div class="mb-world-resume__actions">
                    <v-btn
                        :prepend-icon="mdiPlayCircleOutline"
                        :disabled="offers.busy.value !== null"
                        :loading="offers.busy.value === offer.renderId"
                        color="primary"
                        variant="tonal"
                        size="small"
                        @click="emit('resume', offer.renderId)"
                    >
                        {{ t("world.resume.carryOn", "Carry on with this render") }}
                    </v-btn>
                    <v-btn
                        :prepend-icon="mdiCloseCircleOutline"
                        :disabled="offers.busy.value !== null"
                        variant="text"
                        size="small"
                        @click="offers.dismiss(offer.renderId)"
                    >
                        {{ t("world.resume.dismiss", "Do not offer this again") }}
                    </v-btn>
                </div>

                <v-alert
                    v-if="refusalFor(offer.renderId)"
                    type="warning"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                    role="alert"
                >
                    <p class="mb-world-resume__line">{{ refusalFor(offer.renderId)?.title }}</p>
                    <p class="mb-world-resume__line mb-world-resume__line--muted">{{ refusalFor(offer.renderId)?.explanation }}</p>
                </v-alert>
            </v-card-text>
        </v-card>
    </section>
</template>

<style>
.mb-world-resume {
    margin-block: 12px;
}

.mb-world-resume__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 500;
}

.mb-world-resume__blurb,
.mb-world-resume__line--muted {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-resume__card {
    margin-block-start: 8px;
    border-radius: 12px;
}

.mb-world-resume__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.9375rem;
}

.mb-world-resume__line {
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-world-resume__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}
</style>
