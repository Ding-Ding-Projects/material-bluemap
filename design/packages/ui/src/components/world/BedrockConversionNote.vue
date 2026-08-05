<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiCubeOutline, mdiDownload, mdiSwapHorizontal } from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VProgressLinear } from "vuetify/components";
import {
    resolveBedrockBridge,
    type BedrockBridge,
    type BedrockDetectResult,
    type ChunkerStatus,
    type ConversionProgressEvent,
} from "./bedrockBridge.js";

/**
 * Says "this is a Bedrock world, which has to be converted first" instead of the wizard
 * quietly failing a render on it, and offers the one action that actually helps: convert it
 * with Chunker, right here.
 *
 * `bedrock:detect` is read-only and safe to call the moment a folder is typed - see
 * `docs/bedrock-worlds.md` - so this watches the folder step's own `folder` prop and asks
 * on every real change, debounced so a folder still being typed does not fire a request per
 * keystroke. It renders nothing at all for a Java world, an unreadable folder, or a build
 * with no bridge to ask in the first place: the wizard's own inspection already covers the
 * first two, duplicating that copy here would be two components disagreeing about the same
 * folder, and a browser tab that cannot detect Bedrock has nothing true to say about it -
 * exactly the same "no bridge, no list" rule `worldCatalog.ts` states for the world list
 * beside this note.
 *
 * Conversion is the one thing here that writes, and only ever on an explicit click: nothing
 * in this component converts a world because it was looked at.
 */
const props = defineProps<{
    /** The folder currently typed or chosen in the wizard's first step. */
    folder: string;
    /**
     * Injected in tests. Left out, the Electron bridge is probed; `null` says there is
     * deliberately none - a browser tab - in which case this renders nothing rather than a
     * control that would throw.
     */
    bridge?: BedrockBridge | null;
}>();

const emit = defineEmits<{
    /** A conversion finished. The wizard should take this as the world instead. */
    converted: [outputDirectory: string];
}>();

const { t } = useI18n();

const bridge = computed<BedrockBridge | null>(() =>
    props.bridge === undefined ? resolveBedrockBridge() : props.bridge,
);

const detection = ref<BedrockDetectResult | null>(null);
const detecting = ref(false);
let debounce: ReturnType<typeof setTimeout> | null = null;
let requestToken = 0;

async function runDetect(folder: string): Promise<void> {
    const active = bridge.value;
    if (active === null || folder.trim() === "") {
        detection.value = null;
        return;
    }
    const token = ++requestToken;
    detecting.value = true;
    try {
        const result = await active.detect(folder);
        // A later folder may have started a request of its own while this one was in
        // flight; only the newest answer is allowed to land.
        if (token === requestToken) detection.value = result;
    } catch {
        if (token === requestToken) detection.value = null;
    } finally {
        if (token === requestToken) detecting.value = false;
    }
}

watch(
    () => props.folder,
    (folder) => {
        if (debounce !== null) clearTimeout(debounce);
        debounce = setTimeout(() => void runDetect(folder), 400);
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    if (debounce !== null) clearTimeout(debounce);
});

const isBedrock = computed(() => detection.value?.detection.bedrock === true && detection.value.error === null);

/* -------------------------------------------------------------------------- */
/* Chunker itself: found, or fetched on request                               */
/* -------------------------------------------------------------------------- */

/**
 * Whether Chunker is on this machine at all, checked the moment a Bedrock world is
 * detected rather than only discovered by a failed Convert. `bedrock:chunker` already
 * carries everything the button below needs - the exact release that would be fetched,
 * its size, and `fetchChunker`'s own account of what was and was not verified - so this
 * asks for it once up front instead of guessing from `lookup.remedy` after the fact.
 */
const chunkerStatus = ref<ChunkerStatus | null>(null);
const chunkerChecking = ref(false);

async function refreshChunkerStatus(): Promise<void> {
    const active = bridge.value;
    if (active === null) {
        chunkerStatus.value = null;
        return;
    }
    chunkerChecking.value = true;
    try {
        chunkerStatus.value = await active.chunkerStatus();
    } catch {
        // Not knowing is not "found": the row falls back to the Convert button's own
        // failure path below rather than claiming Chunker is ready when the question
        // itself could not be answered.
        chunkerStatus.value = null;
    } finally {
        chunkerChecking.value = false;
    }
}

watch(
    isBedrock,
    (bedrock) => {
        if (bedrock) void refreshChunkerStatus();
        else chunkerStatus.value = null;
    },
    { immediate: true },
);

const chunkerMissing = computed(
    () => chunkerStatus.value?.lookup.found === false,
);

/** `31790149` -> `"~30 MB"`. A rough figure, stated as one, matching the size Chunker's own module quotes in its "not installed" sentence. */
const chunkerSizeText = computed(() => {
    const bytes = chunkerStatus.value?.available.sizeBytes ?? null;
    if (bytes === null || bytes <= 0) return null;
    return `~${String(Math.round(bytes / 1e6))} MB`;
});

/**
 * Resolved outside the `bedrock.chunkerMissing` call below rather than nested inside it.
 * The catalogue-coverage scan reads a `t(...)` call's own literal arguments to check its
 * placeholders line up with the catalogue; a second `t(...)` call nested inside the first
 * one's argument list confuses that scan into reading the nested call's fallback instead
 * of this one's. Two separate calls, neither nested in the other, is what keeps the scan
 * honest.
 */
const chunkerSizeUnknownText = computed(() => t("bedrock.chunkerSizeUnknown", "an unknown size"));

const fetchingChunker = ref(false);
const fetchFailure = ref<string | null>(null);
const fetchReceived = ref<number | null>(null);
const fetchTotal = ref<number | null>(null);
let unsubscribeFetch: (() => void) | null = null;

const fetchPercent = computed(() => {
    const total = fetchTotal.value;
    const received = fetchReceived.value;
    if (total === null || total <= 0 || received === null) return null;
    return Math.min(100, (received / total) * 100);
});

/**
 * Fetches the Chunker jar, verified against the digest pinned in `main/bedrock/chunker.ts`.
 *
 * A separate button from Convert, on purpose - see `bedrock:fetchChunker`'s own doc
 * comment - and the explanation and size above it are what makes pressing it the moment
 * this row states what will be downloaded and how big, rather than a surprise transfer.
 */
async function fetchChunkerJar(): Promise<void> {
    const active = bridge.value;
    if (active === null || fetchingChunker.value) return;

    fetchingChunker.value = true;
    fetchFailure.value = null;
    fetchReceived.value = null;
    fetchTotal.value = null;
    unsubscribeFetch = active.onBedrockEvent((event) => {
        if (event.kind === "download" && event.conversionId === "chunker") {
            fetchReceived.value = event.received;
            fetchTotal.value = event.total;
        }
    });

    try {
        const result = await active.fetchChunker();
        if (result.ok) {
            await refreshChunkerStatus();
        } else {
            fetchFailure.value = result.message;
        }
    } catch (error) {
        fetchFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        fetchingChunker.value = false;
        unsubscribeFetch?.();
        unsubscribeFetch = null;
    }
}

/* -------------------------------------------------------------------------- */
/* Converting                                                                  */
/* -------------------------------------------------------------------------- */

const converting = ref(false);
const conversionId = ref<string | null>(null);
const phaseText = ref<string | null>(null);
const percent = ref<number | null>(null);
const failure = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

/**
 * The id `bedrock:convert` generates is only reported back on the invoke's own resolution -
 * which does not happen until the conversion is over. The event stream is the only place it
 * arrives sooner, so the first event seen while nothing is adopted yet is trusted as this
 * run's own id. Safe because only one conversion is ever in flight from this component:
 * the button that starts one is hidden for the whole time another is running.
 */
function onEvent(event: ConversionProgressEvent): void {
    if (conversionId.value === null) conversionId.value = event.conversionId;
    if (event.conversionId !== conversionId.value) return;
    if (event.kind === "phase") {
        phaseText.value = phaseLabel(event.phase);
    } else if (event.kind === "progress") {
        percent.value = event.percent;
    }
}

function phaseLabel(phase: string): string {
    switch (phase) {
        case "starting":
            return t("bedrock.phase.starting", "Starting Chunker...");
        case "converting":
            return t("bedrock.phase.converting", "Converting...");
        case "compacting":
            return t("bedrock.phase.compacting", "Compacting...");
        case "verifying":
            return t("bedrock.phase.verifying", "Verifying the converted world...");
        default:
            return phase;
    }
}

async function convert(): Promise<void> {
    const active = bridge.value;
    if (active === null || converting.value) return;

    converting.value = true;
    failure.value = null;
    percent.value = null;
    phaseText.value = phaseLabel("starting");
    // Cleared rather than left over from a previous run, so `onEvent` adopts *this* run's
    // id from its first event instead of comparing every event against a finished one's.
    conversionId.value = null;
    unsubscribe = active.onBedrockEvent(onEvent);

    try {
        const outcome = await active.convert({ world: props.folder });
        conversionId.value = outcome.conversionId;
        if (outcome.ok) {
            emit("converted", outcome.outputDirectory);
        } else {
            failure.value = outcome.message;
        }
    } catch (error) {
        failure.value = error instanceof Error ? error.message : String(error);
    } finally {
        converting.value = false;
        unsubscribe?.();
        unsubscribe = null;
    }
}

async function cancel(): Promise<void> {
    const active = bridge.value;
    const id = conversionId.value;
    if (active === null || id === null) return;
    await active.cancel(id);
}

onBeforeUnmount(() => {
    unsubscribe?.();
    unsubscribeFetch?.();
});
</script>

<template>
    <v-alert
        v-if="isBedrock"
        type="warning"
        variant="tonal"
        density="comfortable"
        class="mb-bedrock-note mt-3"
        role="status"
    >
        <template #prepend><v-icon :icon="mdiCubeOutline" /></template>

        <p class="mb-bedrock-note__title">
            {{
                t(
                    "bedrock.detected",
                    { name: detection?.name ?? t("bedrock.unnamed", "This world") },
                    "{name} is a Bedrock Edition world, which has to be converted before it can be rendered.",
                )
            }}
        </p>
        <p class="mb-bedrock-note__explanation">{{ detection?.detection.explanation }}</p>

        <v-alert
            v-if="detection?.memory?.warn"
            type="error"
            variant="tonal"
            density="compact"
            class="mt-2"
        >
            <template #prepend><v-icon :icon="mdiAlertOutline" /></template>
            <strong>{{ detection.memory.title }}</strong>
            <p>{{ detection.memory.detail }}</p>
        </v-alert>

        <ul v-if="detection?.fidelity && detection.fidelity.notes.length > 0" class="mb-bedrock-note__fidelity">
            <li v-for="note in detection.fidelity.notes" :key="note.id">
                <strong>{{ note.title }}</strong> {{ note.detail }}
            </li>
        </ul>

        <v-alert v-if="failure" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ failure }}
        </v-alert>

        <div class="mb-bedrock-note__progress" v-if="converting">
            <v-progress-linear :model-value="percent ?? 0" :indeterminate="percent === null" color="primary" />
            <div class="mb-bedrock-note__progress-row">
                <span>{{ phaseText }}</span>
                <v-chip v-if="percent !== null" size="x-small" variant="tonal">{{ Math.round(percent) }}%</v-chip>
            </div>
        </div>

        <!--
            Chunker itself missing is a different problem from a conversion failing, and
            it gets a different control: `bedrock:fetchChunker` was already built as "a
            separate step from converting, and a separate button" - see its own doc
            comment - and until this row read `chunkerStatus`, nothing on screen ever
            called it. Convert stays hidden while Chunker is missing rather than being
            offered and failing, because a button that is certain to fail is worse than
            one that is not shown.
        -->
        <template v-if="chunkerMissing">
            <v-alert
                v-if="fetchFailure"
                type="error"
                density="compact"
                variant="tonal"
                class="mt-2"
                role="alert"
            >
                {{ fetchFailure }}
            </v-alert>

            <div class="mb-bedrock-note__progress" v-if="fetchingChunker">
                <v-progress-linear
                    :model-value="fetchPercent ?? 0"
                    :indeterminate="fetchPercent === null"
                    color="primary"
                />
                <div class="mb-bedrock-note__progress-row">
                    <span>{{ t("bedrock.fetchingChunker", "Downloading Chunker…") }}</span>
                    <v-chip v-if="fetchPercent !== null" size="x-small" variant="tonal">
                        {{ Math.round(fetchPercent) }}%
                    </v-chip>
                </div>
            </div>

            <template v-else>
                <p class="mb-bedrock-note__explanation">
                    {{
                        t(
                            "bedrock.chunkerMissing",
                            { size: chunkerSizeText ?? chunkerSizeUnknownText },
                            "Chunker is a separate open-source converter this app does not bundle. Converting this world means fetching it once ({size}), verified against a digest committed in this app.",
                        )
                    }}
                </p>
                <div class="mb-bedrock-note__actions">
                    <v-btn
                        :prepend-icon="mdiDownload"
                        color="primary"
                        variant="tonal"
                        size="small"
                        @click="fetchChunkerJar"
                    >
                        {{
                            chunkerSizeText === null
                                ? t("bedrock.fetchChunker", "Download Chunker")
                                : t(
                                      "bedrock.fetchChunkerSized",
                                      { size: chunkerSizeText },
                                      "Download Chunker ({size})",
                                  )
                        }}
                    </v-btn>
                </div>
            </template>
        </template>

        <div class="mb-bedrock-note__actions" v-else>
            <v-btn
                v-if="!converting"
                :prepend-icon="mdiSwapHorizontal"
                color="primary"
                variant="flat"
                size="small"
                :disabled="chunkerChecking"
                :title="chunkerChecking ? t('bedrock.checkingChunker', 'Checking whether Chunker is installed…') : undefined"
                @click="convert"
            >
                {{ t("bedrock.convert", "Convert with Chunker") }}
            </v-btn>
            <v-btn v-else variant="text" size="small" @click="cancel">
                {{ t("bedrock.cancel", "Cancel the conversion") }}
            </v-btn>
            <span v-if="chunkerChecking" class="mb-bedrock-note__checking" role="status">
                {{ t("bedrock.checkingChunker", "Checking whether Chunker is installed…") }}
            </span>
        </div>
    </v-alert>
</template>

<style>
.mb-bedrock-note__title {
    font-weight: 500;
    margin: 0;
}

.mb-bedrock-note__explanation {
    font-size: 0.8125rem;
    margin: 4px 0 0;
}

.mb-bedrock-note__fidelity {
    margin: 8px 0 0 1.1em;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-bedrock-note__progress {
    margin-block-start: 10px;
}

.mb-bedrock-note__progress-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-block-start: 4px;
    font-size: 0.75rem;
}

.mb-bedrock-note__actions {
    margin-block-start: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.mb-bedrock-note__checking {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
