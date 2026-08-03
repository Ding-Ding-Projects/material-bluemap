<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiArrowLeft, mdiArrowRight, mdiCheck, mdiPlay } from "@mdi/js";
import { VAlert, VBtn, VDivider, VSpacer } from "vuetify/components";
import type { FieldMeta, PlainValue } from "@material-bluemap/config";
import MapIdentityStep from "./MapIdentityStep.vue";
import MapOptionsStep from "./MapOptionsStep.vue";
import MapStorageStep from "./MapStorageStep.vue";
import WizardReviewStep from "./WizardReviewStep.vue";
import WorldFolderStep from "./WorldFolderStep.vue";
import { createMapWizard, type RunOptions } from "./wizardModel.js";
import { WIZARD_STEPS, WIZARD_STEP_META, type WizardStep } from "./wizardSteps.js";
import type { WorldInspection } from "./worldFolder.js";
import type { RenderRequest } from "./worldBridge.js";

/**
 * The create-a-map wizard: five steps between "no map" and a render running.
 *
 * The rules live in `wizardModel.ts` as plain functions over refs, so what this
 * component does is arrange them: it never decides whether a world is valid, what
 * a map id may contain, or which settings reach a render.
 *
 * The step header is navigation, not decoration. A step nobody can answer yet is
 * disabled and says so; every answered step can be gone back to; and the whole
 * strip is keyboard-reachable with the current step announced.
 */
const props = withDefaults(
    defineProps<{
        /** True when Mojang download consent is on record. Reported, never asked. */
        consentAccepted?: boolean;
        /** True when this build can start a local render. */
        canRender?: boolean;
        /** True when a folder can actually be read and checked. */
        canInspect?: boolean;
        /** Where the app writes renders, once it has said. */
        storage?: { current: string; default: string } | null;
        /** The platform separator, so generated paths read the platform's own way. */
        separator?: string;
        /** Reads a folder and reports whether it is a Minecraft world. */
        probe?: ((folder: string) => Promise<WorldInspection>) | null;
        /** Points rendering at a folder. Its refusal is shown as written. */
        applyStorage?:
            | ((value: string) => Promise<{ ok: true; directory: string } | { ok: false; message: string }>)
            | null;
    }>(),
    {
        consentAccepted: false,
        canRender: false,
        canInspect: false,
        storage: null,
        probe: null,
        applyStorage: null,
    },
);

const emit = defineEmits<{
    /** Everything is answered; start this render with this map config beside it. */
    start: [request: RenderRequest, configText: string];
    /** Opens the app's own download-consent setting. */
    consent: [];
    /** The person closed the wizard without starting anything. */
    cancel: [];
}>();

const { t } = useI18n();

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so
 * the optional flags are normalised once here rather than coalesced at every
 * binding in the template.
 */
const consentGiven = computed(() => props.consentAccepted === true);
const renderable = computed(() => props.canRender === true);
const inspectable = computed(() => props.canInspect === true);

const wizard = createMapWizard({
    separator: props.separator ?? "/",
    ...(props.storage === null ? {} : { storageDirectory: props.storage.current }),
});

const storageApplying = ref(false);
const storageFailure = ref<string | null>(null);
/**
 * The folder the main process last confirmed.
 *
 * Kept as the value rather than as a flag so that editing the field afterwards
 * takes the confirmation away on its own. A tick that stays on while the text
 * beside it changes is a tick that says the wrong thing.
 */
const appliedDirectory = ref<string | null>(null);
const storageApplied = computed(
    () => appliedDirectory.value !== null && appliedDirectory.value === wizard.storageDirectory.value.trim(),
);

/** The app may answer late; the field fills in when it does, unless it was edited. */
watch(
    () => props.storage,
    (storage) => {
        if (storage === null) return;
        wizard.storageDefault.value = storage.default;
        if (wizard.storageDirectory.value.trim() === "") {
            wizard.storageDirectory.value = storage.current;
            wizard.storageKnown.value = true;
        }
    },
    { immediate: true },
);

onMounted(() => {
    if (props.storage !== null) wizard.storageKnown.value = true;
});

const steps = computed(() =>
    WIZARD_STEP_META.map((meta, index) => ({
        ...meta,
        index,
        reachable: wizard.canReach(meta.id),
        answered: wizard.canLeave(meta.id),
        current: wizard.step.value === meta.id,
    })),
);

const problems = computed(() =>
    // `t(key, named, fallback)`, and no filling afterwards: vue-i18n compiles the
    // fallback as a message too, so it consumes `{id}` as a named parameter of its
    // own and the id the message is complaining about is already gone by the time
    // anything else could substitute it. The values have to go in before the
    // message is compiled, which is what the third argument is for.
    wizard.problemsFor(wizard.step.value).map((problem) => t(problem.key, problem.vars ?? {}, problem.fallback)),
);

const isLast = computed(() => wizard.step.value === "review");
const canStart = computed(() => renderable.value && WIZARD_STEPS.every((step) => wizard.canLeave(step)));

const dimensionLabel = computed(() => wizard.dimension.value?.label ?? wizard.dimensionKey.value);

/* ---- world ---------------------------------------------------------------- */

async function inspect(folder: string): Promise<void> {
    const trimmed = folder.trim();
    if (trimmed === "") {
        wizard.setWorld("");
        return;
    }
    if (props.probe === null) {
        wizard.setWorld(trimmed);
        return;
    }

    wizard.inspecting.value = true;
    try {
        wizard.setWorld(trimmed, await props.probe(trimmed));
    } finally {
        wizard.inspecting.value = false;
    }
}

/* ---- storage -------------------------------------------------------------- */

async function applyStorage(value: string): Promise<void> {
    const trimmed = value.trim();
    if (props.applyStorage === null || trimmed === "" || storageApplying.value) return;
    if (appliedDirectory.value === trimmed) return;

    storageApplying.value = true;
    storageFailure.value = null;
    try {
        const answer = await props.applyStorage(trimmed);
        if (answer.ok) {
            wizard.storageDirectory.value = answer.directory;
            wizard.storageKnown.value = true;
            appliedDirectory.value = answer.directory.trim();
        } else {
            storageFailure.value = answer.message;
            appliedDirectory.value = null;
        }
    } catch (error) {
        storageFailure.value = error instanceof Error ? error.message : String(error);
        appliedDirectory.value = null;
    } finally {
        storageApplying.value = false;
    }
}

/* ---- options -------------------------------------------------------------- */

function setOption(field: FieldMeta, value: PlainValue): void {
    wizard.setOption(field, value);
}

function clearOption(field: FieldMeta): void {
    wizard.clearOption(field);
}

function setRun(value: RunOptions): void {
    wizard.run.value = value;
}

function goTo(step: WizardStep): void {
    wizard.goTo(step);
}

function start(): void {
    if (!canStart.value) return;
    emit("start", wizard.toRenderRequest(), wizard.configText());
}

defineExpose({ wizard });
</script>

<template>
    <div class="mb-world-wizard">
        <nav class="mb-world-wizard__steps" :aria-label="t('world.wizard.stepsLabel', 'Wizard steps')">
            <v-btn
                v-for="step in steps"
                :key="step.id"
                :disabled="!step.reachable"
                :aria-current="step.current ? 'step' : undefined"
                :color="step.current ? 'primary' : undefined"
                :variant="step.current ? 'tonal' : 'text'"
                :prepend-icon="step.answered && !step.current ? mdiCheck : undefined"
                class="mb-world-wizard__step"
                size="small"
                density="comfortable"
                @click="goTo(step.id)"
            >
                <span class="mb-world-wizard__step-number">{{ step.index + 1 }}</span>
                {{ t(step.key, step.label) }}
            </v-btn>
        </nav>

        <v-divider />

        <div class="mb-world-wizard__body">
            <WorldFolderStep
                v-if="wizard.step.value === 'world'"
                :model-value="wizard.worldPath.value"
                :inspection="wizard.inspection.value"
                :inspecting="wizard.inspecting.value"
                :can-inspect="inspectable"
                @update:model-value="(value: string) => (wizard.worldPath.value = value)"
                @inspect="inspect"
            />

            <MapIdentityStep
                v-else-if="wizard.step.value === 'identity'"
                :display-name="wizard.displayName.value"
                :map-id="wizard.mapId.value"
                :id-follows-name="wizard.idFollowsName.value"
                :dimension-key="wizard.dimensionKey.value"
                :sorting="wizard.sorting.value"
                :dimensions="wizard.dimensions.value"
                :dimensions-are-real="wizard.inspection.value.dimensions.length > 0"
                @update:display-name="(value: string) => (wizard.displayName.value = value)"
                @update:map-id="(value: string) => (wizard.mapId.value = value)"
                @update:id-follows-name="(value: boolean) => (wizard.idFollowsName.value = value)"
                @update:sorting="(value: number) => (wizard.sorting.value = value)"
                @choose-dimension="wizard.chooseDimension"
            />

            <MapOptionsStep
                v-else-if="wizard.step.value === 'options'"
                :file="wizard.file.value"
                :changed-count="wizard.changes.value.length"
                @set="setOption"
                @clear="clearOption"
                @consent="emit('consent')"
                @reset="wizard.resetOptions"
            />

            <MapStorageStep
                v-else-if="wizard.step.value === 'storage'"
                :model-value="wizard.storageDirectory.value"
                :default-directory="wizard.storageDefault.value"
                :known="wizard.storageKnown.value"
                :applying="storageApplying"
                :apply-failure="storageFailure"
                :applied="storageApplied"
                :file="wizard.file.value"
                :problems="problems"
                @update:model-value="(value: string) => (wizard.storageDirectory.value = value)"
                @apply="applyStorage"
                @set="setOption"
                @clear="clearOption"
                @consent="emit('consent')"
            />

            <WizardReviewStep
                v-else
                :world="wizard.worldPath.value"
                :map-id="wizard.mapId.value"
                :display-name="wizard.displayName.value || wizard.mapId.value"
                :dimension-key="wizard.dimensionKey.value"
                :dimension-label="dimensionLabel"
                :storage-directory="wizard.storageDirectory.value"
                :reaching="wizard.reachingChanges.value"
                :carried="wizard.carriedChanges.value"
                :config-text="wizard.file.value.text"
                :run="wizard.run.value"
                :consent-accepted="consentGiven"
                :can-render="renderable"
                @update:run="setRun"
                @consent="emit('consent')"
            />
        </div>

        <!--
            The storage step renders its own problems inline beside the field, so
            they are not repeated here. Every other step gets them in the footer,
            next to the button they block.
        -->
        <v-alert
            v-for="problem in wizard.step.value === 'storage' ? [] : problems"
            :key="problem"
            type="warning"
            density="compact"
            variant="tonal"
            class="mb-world-wizard__problem"
        >
            {{ problem }}
        </v-alert>

        <v-divider />

        <div class="mb-world-wizard__actions">
            <v-btn variant="text" @click="emit('cancel')">{{ t("world.wizard.cancel", "Cancel") }}</v-btn>
            <v-spacer />
            <v-btn
                :prepend-icon="mdiArrowLeft"
                :disabled="wizard.stepIndex.value === 0"
                variant="text"
                @click="wizard.back"
            >
                {{ t("world.wizard.back", "Back") }}
            </v-btn>
            <v-btn
                v-if="!isLast"
                :append-icon="mdiArrowRight"
                :disabled="problems.length > 0"
                color="primary"
                variant="flat"
                @click="wizard.next"
            >
                {{ t("world.wizard.next", "Next") }}
            </v-btn>
            <v-btn v-else :prepend-icon="mdiPlay" :disabled="!canStart" color="primary" variant="flat" @click="start">
                {{ t("world.wizard.start", "Render this map") }}
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-world-wizard {
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.mb-world-wizard__steps {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
    padding: 8px 4px;
}

.mb-world-wizard__step {
    text-transform: none;
    letter-spacing: normal;
}

.mb-world-wizard__step-number {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    inline-size: 20px;
    block-size: 20px;
    margin-inline-end: 6px;
    border-radius: 50%;
    background: rgba(var(--v-theme-on-surface), 0.1);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
}

.mb-world-wizard__body {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 4px;
}

.mb-world-wizard__problem {
    margin: 0 4px 8px;
}

.mb-world-wizard__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 4px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-world-wizard,
    .mb-world-wizard * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
