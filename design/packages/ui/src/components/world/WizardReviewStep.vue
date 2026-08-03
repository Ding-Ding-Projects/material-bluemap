<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronUp, mdiContentCopy, mdiInformationOutline } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VIcon,
    VTextField,
} from "vuetify/components";
import type { PlainValue } from "@material-bluemap/config";
import { valueToText } from "../config/fieldValue.js";
import type { FieldChange } from "../config/configModel.js";
import type { RunOptions } from "./wizardModel.js";

/**
 * Step five: exactly what pressing the button will do.
 *
 * The one thing this step must not do is imply more than is true. The engine
 * writes its own config for a single render out of the request it is handed, and
 * that request has room for six of BlueMap's map settings. So the settings that
 * reach this render and the settings carried only by the map config file are
 * listed separately, by name, with the file offered for copying. A wizard that
 * collects 92 settings, applies six of them and says nothing is a wizard that
 * lies to the person using it.
 */
const props = defineProps<{
    world: string;
    mapId: string;
    displayName: string;
    dimensionKey: string;
    dimensionLabel: string;
    storageDirectory: string;
    reaching: readonly FieldChange[];
    carried: readonly FieldChange[];
    configText: string;
    run: RunOptions;
    /** True when Mojang download consent is on record. Never asked for here. */
    consentAccepted: boolean;
    /** True when the app can render locally at all. */
    canRender: boolean;
}>();

const emit = defineEmits<{
    "update:run": [value: RunOptions];
    /** Opens the app's own download-consent setting. */
    consent: [];
}>();

const { t } = useI18n();

const configOpen = ref(false);
const copyState = ref("");

function change(patch: Partial<RunOptions>): void {
    emit("update:run", { ...props.run, ...patch });
}

const threadsText = computed<string>({
    get: () => (props.run.renderThreads === null ? "" : String(props.run.renderThreads)),
    set: (value) => {
        const trimmed = value.trim();
        if (trimmed === "") {
            change({ renderThreads: null });
            return;
        }
        const parsed = Number.parseInt(trimmed, 10);
        change({ renderThreads: Number.isFinite(parsed) && parsed > 0 ? parsed : null });
    },
});

function describeValue(value: PlainValue | undefined): string {
    const text = valueToText(value ?? null);
    return text === "" ? t("world.review.nothing", "nothing") : text;
}

async function copyConfig(): Promise<void> {
    try {
        await navigator.clipboard.writeText(props.configText);
        copyState.value = t("world.review.copied", "Copied the map config exactly as it stands.");
    } catch {
        copyState.value = t("world.review.copyFailed", "Could not reach the clipboard.");
    }
}
</script>

<template>
    <section class="mb-world-step" :aria-label="t('world.wizard.step.review', 'Review')">
        <h3 class="mb-world-step__title">{{ t("world.review.title", "What is about to happen") }}</h3>

        <v-card variant="tonal" class="mb-world-review__card">
            <v-card-title class="mb-world-review__head">
                <v-icon :icon="mdiInformationOutline" size="20" aria-hidden="true" />
                {{ t("world.review.plan", "The render") }}
            </v-card-title>
            <v-card-text>
                <dl class="mb-world-review__facts">
                    <dt>{{ t("world.review.worldLabel", "World") }}</dt>
                    <dd>{{ world }}</dd>

                    <dt>{{ t("world.review.dimensionLabel", "Dimension") }}</dt>
                    <dd>{{ dimensionLabel }} <span class="mb-world-review__key">{{ dimensionKey }}</span></dd>

                    <dt>{{ t("world.review.mapLabel", "Map") }}</dt>
                    <dd>{{ displayName }} <span class="mb-world-review__key">{{ mapId }}</span></dd>

                    <dt>{{ t("world.review.storageLabel", "Written to") }}</dt>
                    <dd>{{ storageDirectory }}</dd>

                    <dt>{{ t("world.review.engineLabel", "Engine") }}</dt>
                    <dd>
                        {{
                            t(
                                "world.review.engineValue",
                                "BlueMap's own engine, run locally. Its exact version is reported once it starts.",
                            )
                        }}
                    </dd>
                </dl>
            </v-card-text>
        </v-card>

        <!--
            Consent is answered once at first launch and never re-asked. This says
            what is missing and points at the setting, rather than putting a licence
            in front of somebody who is five steps into a wizard.
        -->
        <v-alert v-if="!consentAccepted" type="warning" density="compact" variant="tonal" class="mt-3">
            {{
                t(
                    "world.review.consentMissing",
                    "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
                )
            }}
            <template #append>
                <v-btn variant="tonal" size="small" @click="emit('consent')">
                    {{ t("world.review.consentAction", "Open the setting") }}
                </v-btn>
            </template>
        </v-alert>

        <v-alert v-if="!canRender" type="info" density="compact" variant="tonal" class="mt-3">
            {{
                t(
                    "world.review.noEngine",
                    "This build cannot render locally. Everything above is real and the map config below can be copied out, but starting a render needs the desktop app.",
                )
            }}
        </v-alert>

        <h4 class="mb-world-review__subtitle">{{ t("world.review.howTitle", "How to run it") }}</h4>
        <div class="mb-world-review__run">
            <v-checkbox
                :model-value="run.force"
                :label="t('world.review.force', 'Render everything again')"
                :hint="
                    t(
                        'world.review.forceHint',
                        'Off, only chunks that changed since the last render are drawn. On, every chunk is drawn again, which takes as long as the first render did.',
                    )
                "
                persistent-hint
                color="primary"
                density="compact"
                @update:model-value="(value: boolean | null) => change({ force: value === true })"
            />
            <v-checkbox
                :model-value="run.fixEdges"
                :label="t('world.review.fixEdges', 'Redraw the map edges')"
                :hint="
                    t(
                        'world.review.fixEdgesHint',
                        'Redraws the seams between rendered areas, which is what fixes the visible lines left when a world grows.',
                    )
                "
                persistent-hint
                color="primary"
                density="compact"
                @update:model-value="(value: boolean | null) => change({ fixEdges: value === true })"
            />
            <v-checkbox
                :model-value="run.metrics"
                :label="t('world.review.metrics', 'Let the engine report anonymous usage')"
                :hint="
                    t(
                        'world.review.metricsHint',
                        'Off by default. The only download you agreed to is the Minecraft client; this is a separate outbound report and it is yours to turn on.',
                    )
                "
                persistent-hint
                color="primary"
                density="compact"
                @update:model-value="(value: boolean | null) => change({ metrics: value === true })"
            />
            <v-text-field
                v-model="threadsText"
                :label="t('world.review.threads', 'Render threads')"
                :placeholder="t('world.review.threadsDefault', 'the engine decides')"
                :hint="
                    t(
                        'world.review.threadsHint',
                        'Left empty, the engine uses every processor core but two, so the machine stays usable while it works.',
                    )
                "
                persistent-hint
                type="number"
                min="1"
                variant="outlined"
                density="compact"
            />
        </div>

        <h4 class="mb-world-review__subtitle">{{ t("world.review.changesTitle", "Settings you changed") }}</h4>

        <p v-if="reaching.length === 0 && carried.length === 0" class="mb-world-step__blurb">
            {{ t("world.review.noChanges", "None. Everything is at BlueMap's own default for this dimension.") }}
        </p>

        <template v-else>
            <ul v-if="reaching.length > 0" class="mb-world-review__list">
                <li v-for="entry in reaching" :key="entry.field.path">
                    <strong>{{ entry.field.label }}</strong>
                    <span class="mb-world-review__key">{{ entry.field.path }}</span>
                    <span>{{ describeValue(entry.to) }}</span>
                    <v-chip v-if="entry.invalidatesTiles" size="x-small" color="warning" variant="tonal">
                        {{ t("world.review.reRender", "Re-render") }}
                    </v-chip>
                </li>
            </ul>

            <template v-if="carried.length > 0">
                <v-alert type="info" density="compact" variant="tonal" class="mt-2">
                    {{
                        t(
                            "world.review.carriedNote",
                            "These {n} settings are written into the map config file below. The local engine writes its own config for a single render and reads the world, dimension, name, sort order, starting position and storage from it, so it does not pick these up yet. Copy the file out to keep them.",
                        ).replace("{n}", String(carried.length))
                    }}
                </v-alert>
                <ul class="mb-world-review__list mb-world-review__list--muted">
                    <li v-for="entry in carried" :key="entry.field.path">
                        <strong>{{ entry.field.label }}</strong>
                        <span class="mb-world-review__key">{{ entry.field.path }}</span>
                        <span>{{ describeValue(entry.to) }}</span>
                    </li>
                </ul>
            </template>
        </template>

        <v-card variant="tonal" class="mb-world-review__card">
            <v-card-title class="mb-world-review__head">
                <v-btn
                    :prepend-icon="configOpen ? mdiChevronUp : mdiChevronDown"
                    :aria-expanded="configOpen ? 'true' : 'false'"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click="configOpen = !configOpen"
                >
                    {{
                        configOpen
                            ? t("world.review.hideConfig", "Hide the map config")
                            : t("world.review.showConfig", "Show the map config this produces")
                    }}
                </v-btn>
                <v-btn :prepend-icon="mdiContentCopy" variant="text" size="small" density="comfortable" @click="copyConfig">
                    {{ t("world.review.copy", "Copy") }}
                </v-btn>
            </v-card-title>
            <v-card-text v-if="configOpen">
                <pre class="mb-world-review__pre">{{ configText }}</pre>
            </v-card-text>
        </v-card>
        <p class="mb-world-step__blurb" aria-live="polite">{{ copyState }}</p>
    </section>
</template>

<style>
.mb-world-review__card {
    margin-block-start: 16px;
    border-radius: 12px;
}

.mb-world-review__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.9375rem;
    padding: 4px 8px;
}

.mb-world-review__subtitle {
    margin-block-start: 20px;
    font-size: 0.9375rem;
    font-weight: 500;
}

.mb-world-review__facts {
    display: grid;
    grid-template-columns: minmax(110px, max-content) minmax(0, 1fr);
    gap: 4px 16px;
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-world-review__facts dt {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-review__facts dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.mb-world-review__key {
    margin-inline: 6px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
}

.mb-world-review__run {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 8px 24px;
    margin-block-start: 8px;
}

.mb-world-review__list {
    margin: 8px 0 0 1.2em;
    font-size: 0.8125rem;
    line-height: 1.7;
}

.mb-world-review__list--muted {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-review__pre {
    margin: 0;
    max-height: 40vh;
    overflow: auto;
    white-space: pre;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}
</style>
