<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCloudSyncOutline, mdiRefresh } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VRadio,
    VRadioGroup,
} from "vuetify/components";
import DockerStateNote from "./DockerStateNote.vue";
import RemotePreflightPanel from "./RemotePreflightPanel.vue";
import RemoteTargetEditor from "./RemoteTargetEditor.vue";
import { describeDocker, dockerNotProbed, type DockerNote } from "./dockerStates.js";
import { hostKeyDecision, type HostKeyDecision } from "./preflightModel.js";
import {
    resolveRemoteBridge,
    resolveRuntimeBridge,
    type PreflightReport,
    type RemoteBridge,
    type RemoteTarget,
    type RuntimeBridge,
} from "./remoteBridge.js";
import {
    loadTargets,
    saveTargets,
    type TargetStorage,
} from "./remoteTargets.js";
import {
    describeChoice,
    effectiveLocation,
    runPlaces,
    type RunLocation,
    type RunPlace,
} from "./runtimeChoice.js";

/**
 * Where this render runs — asked where somebody starts a render, not buried in settings.
 *
 * There are four answers now and this is the one screen that shows all four together:
 *
 * ```
 * on this computer        the engine as an ordinary program. Fastest.
 * in a container here     isolation and a different Java. NOT more processors.
 * on another machine      over SSH, in a container there. Costs an upload of the world.
 * on GitHub's runners     their machines do the work; this one only uploads.
 * ```
 *
 * The first three are a choice this render obeys. The fourth is a whole workflow of its own
 * - a repository, two consents, an upload, a job list - so it is presented here with the
 * others and opened as its own surface rather than crammed into a radio button. Somebody
 * comparing them should see four answers in one place; what they should not get is four
 * different screens to discover independently.
 *
 * ## Nothing here overstates what a build can do
 *
 * Both bridges are probed method by method, exactly as `backupBridge.ts` does. A place this
 * build has no channel for reads **unsupported** and says which channel is missing, rather
 * than being quietly selectable and silently rendering somewhere else. That last failure is
 * the one worth spelling out: a Docker choice that fell back to local without saying so
 * would leave somebody believing they had chosen, which is worse than not offering it.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why these
         * have no default: `undefined` means probe, `null` means there is deliberately no
         * bridge and the unsupported state is what should be shown.
         */
        remoteBridge?: RemoteBridge | null | undefined;
        runtimeBridge?: RuntimeBridge | null | undefined;
        /** True when this build can start a render at all. */
        canRenderLocally?: boolean | undefined;
        location?: RunLocation | undefined;
        /** Same convention again, for the storage saved machines live in. */
        storage?: TargetStorage | null | undefined;
        /** True when the shell can open the GitHub-runners surface. */
        canOpenCi?: boolean | undefined;
    }>(),
    { canRenderLocally: true, location: "local", canOpenCi: false },
);

const emit = defineEmits<{
    "update:location": [value: RunLocation];
    /** The machine a remote render would use, or null. The shell hands this to the router. */
    "update:target": [value: RemoteTarget | null];
    /** Take the person to the surface that renders on GitHub's runners. */
    openCi: [];
}>();

const { t } = useI18n();

const remote = props.remoteBridge === undefined ? resolveRemoteBridge() : props.remoteBridge;
const runtime = props.runtimeBridge === undefined ? resolveRuntimeBridge() : props.runtimeBridge;
/** `undefined` means "use `localStorage`"; `null` means "keep nothing", which tests want. */
const storage = props.storage;

/* -- Docker on this machine ------------------------------------------------ */

const dockerNote = ref<DockerNote | null>(null);
const probing = ref(false);

async function probeDocker(): Promise<void> {
    if (runtime === null) {
        dockerNote.value = dockerNotProbed(t);
        return;
    }
    if (!runtime.canProbeDocker) {
        dockerNote.value = dockerNotProbed(t);
        return;
    }
    probing.value = true;
    try {
        dockerNote.value = describeDocker(await runtime.dockerRuntime(), t);
    } catch {
        // A probe that threw is a broken bridge, not a broken Docker, and saying "this
        // build cannot check" is the honest half of that.
        dockerNote.value = dockerNotProbed(t);
    } finally {
        probing.value = false;
    }
}

/* -- machines -------------------------------------------------------------- */

const targets = ref<readonly RemoteTarget[]>([]);
const selectedId = ref<string | null>(null);

const selected = computed<RemoteTarget | null>(
    () => targets.value.find((candidate) => candidate.id === selectedId.value) ?? null,
);

function replaceTargets(next: readonly RemoteTarget[]): void {
    targets.value = next;
    saveTargets(next, storage);
}

/* -- preflight ------------------------------------------------------------- */

const report = ref<PreflightReport | null>(null);
const checking = ref(false);
const trustMessage = ref<string | null>(null);

const decision = computed<HostKeyDecision>(() =>
    hostKeyDecision(report.value, remote?.canTrustHostKey === true, t),
);

async function check(): Promise<void> {
    const target = selected.value;
    if (remote === null || target === null || checking.value) return;
    checking.value = true;
    trustMessage.value = null;
    try {
        report.value = await remote.remotePreflight(target);
    } catch (error) {
        // The channel is documented never to reject. This is the belt, so a row never
        // receives a stack trace where a sentence belongs.
        report.value = {
            ok: false,
            target: target.host,
            checks: [
                {
                    stage: "ssh",
                    ok: false,
                    message: t(
                        "remote.preflight.bridgeFailed",
                        { message: error instanceof Error ? error.message : String(error) },
                        "The application could not run the checks: {message}",
                    ),
                    detail: null,
                },
            ],
            failure: null,
            hostKeys: [],
            docker: null,
            freeBytes: null,
            workDir: null,
        };
    } finally {
        checking.value = false;
    }
}

/**
 * Records a fingerprint the person has just compared and accepted.
 *
 * Only the fingerprint crosses. The main process re-scans the host, recomputes, and writes
 * a line only when a freshly offered key matches - so this cannot be used to put a line of
 * its choosing into a trust store, and a host that started answering with a different key
 * between the reading and the pressing is refused rather than recorded.
 */
async function trust(fingerprint: string): Promise<void> {
    const target = selected.value;
    if (remote === null || target === null) return;
    const answer = await remote.trustRemoteHostKey(target, fingerprint);
    trustMessage.value = answer.message;
    // Re-checked rather than assumed: recording a key proves nothing about Docker or disk,
    // and a screen that jumped to "ready" here would be claiming three checks that never ran.
    if (answer.ok) await check();
}

/* -- the choice ------------------------------------------------------------ */

const places = computed<readonly RunPlace[]>(() =>
    runPlaces(
        {
            canRenderLocally: props.canRenderLocally,
            canRenderInDocker: runtime?.renderModes.includes("docker") === true,
            docker: dockerNote.value,
            canRenderRemotely: remote !== null,
            hasTarget: selected.value !== null,
            preflightPassed: report.value?.ok === true,
        },
        t,
    ),
);

const chosen = computed(() => effectiveLocation(props.location, places.value));

/** True when the choice on screen is not the choice that would actually be used. */
const fellBack = computed(() => chosen.value !== props.location);

const choiceLine = computed(() =>
    describeChoice(chosen.value, selected.value?.label ?? null, t),
);

function pick(value: unknown): void {
    if (value === "local" || value === "docker" || value === "remote") {
        emit("update:location", value);
    }
}

/* -- wiring ---------------------------------------------------------------- */

onMounted(() => {
    targets.value = loadTargets(storage);
    void probeDocker();
});

// A different machine has not been checked, whatever the last one proved. Carrying a
// passed preflight across a selection change would be the single most dangerous piece of
// state on this screen: it would let a render start against a host nobody had looked at.
watch(selectedId, () => {
    report.value = null;
    trustMessage.value = null;
    emit("update:target", selected.value);
});

// The selected machine can also be edited or forgotten underneath the selection.
watch(targets, () => {
    if (selectedId.value !== null && selected.value === null) selectedId.value = null;
    else emit("update:target", selected.value);
});

defineExpose({ places, dockerNote, report, decision, targets, selectedId, check, trust, probeDocker });
</script>

<template>
    <v-card variant="tonal" class="mb-run-location">
        <v-card-title class="mb-run-location__title">
            {{ t("remote.title", "Where this render runs") }}
        </v-card-title>
        <v-card-text>
            <p class="mb-run-location__blurb">
                {{
                    t(
                        "remote.blurb",
                        "The same engine, in four different places. Speed is not what separates them: a container on this computer runs on the same cores and the same disk as the engine does without one, and on Windows it reads your world through a virtual machine's file sharing, so a big world usually renders slower that way. What a container buys is isolation and a different Java. What another machine buys is somebody else's processors, at the cost of uploading the world first.",
                    )
                }}
            </p>

            <v-radio-group
                :model-value="chosen"
                :label="t('remote.choose', 'Run this render')"
                hide-details="auto"
                class="mb-run-location__choices"
                @update:model-value="pick"
            >
                <v-radio
                    v-for="place in places"
                    :key="place.id"
                    :value="place.id"
                    :disabled="!place.selectable"
                    :data-place="place.id"
                    :data-state="place.state"
                >
                    <template #label>
                        <span class="mb-run-location__option">
                            <span class="mb-run-location__optionTitle">{{ place.title }}</span>
                            <span class="mb-run-location__optionSummary">{{ place.summary }}</span>
                            <span v-if="place.reason" class="mb-run-location__optionReason">
                                {{ place.reason }}
                            </span>
                        </span>
                    </template>
                </v-radio>
            </v-radio-group>

            <!--
                The choice on screen and the choice that would be used have to agree. When a
                daemon is stopped or a machine is forgotten under a selection, this says so
                rather than letting a render go somewhere the person did not choose.
            -->
            <v-alert
                v-if="fellBack"
                type="warning"
                density="compact"
                variant="tonal"
                class="mb-run-location__alert"
                role="alert"
            >
                {{
                    t(
                        "remote.fellBack",
                        "That place cannot take a render right now, so this one would run on this computer instead. The reason is beside the choice above.",
                    )
                }}
            </v-alert>

            <p class="mb-run-location__choiceLine" role="status">{{ choiceLine }}</p>

            <!-- Docker's five states, each said differently. -->
            <section class="mb-run-location__section" :aria-label="t('remote.dockerSection', 'Docker on this computer')">
                <div class="mb-run-location__sectionHead">
                    <h4 class="mb-run-location__sectionTitle">
                        {{ t("remote.dockerSection", "Docker on this computer") }}
                    </h4>
                    <v-btn
                        :prepend-icon="mdiRefresh"
                        :loading="probing"
                        variant="text"
                        size="small"
                        @click="probeDocker"
                    >
                        {{ t("remote.dockerRecheck", "Check again") }}
                    </v-btn>
                </div>
                <DockerStateNote v-if="dockerNote" :note="dockerNote" />
            </section>

            <!-- Another machine, over SSH. -->
            <section class="mb-run-location__section" :aria-label="t('remote.machines', 'Machines you can render on')">
                <h4 class="mb-run-location__sectionTitle">
                    {{ t("remote.machines", "Machines you can render on") }}
                </h4>

                <v-alert
                    v-if="remote === null"
                    type="info"
                    density="compact"
                    variant="tonal"
                    class="mb-run-location__alert"
                >
                    {{
                        t(
                            "remote.unsupported",
                            "This build cannot hand a render to another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
                        )
                    }}
                </v-alert>

                <template v-else>
                    <RemoteTargetEditor
                        :bridge="remote"
                        :targets="targets"
                        :selected-id="selectedId"
                        @update:targets="replaceTargets"
                        @update:selected-id="(value: string | null) => (selectedId = value)"
                    />

                    <RemotePreflightPanel
                        v-if="selected"
                        :report="report"
                        :running="checking"
                        :decision="decision"
                        :can-check="true"
                        :target-label="selected.label"
                        @check="check"
                        @trust="trust"
                    />

                    <p v-if="trustMessage" class="mb-run-location__blurb" role="status">{{ trustMessage }}</p>
                </template>
            </section>

            <!--
                The fourth answer. Its own surface rather than a radio button, because it is
                a workflow: a repository, two consents that are never pre-ticked, an upload,
                and a run with per-job states. Named here so all four places are in one list.
            -->
            <section class="mb-run-location__section" :aria-label="t('remote.ciSection', 'On GitHub’s runners')">
                <h4 class="mb-run-location__sectionTitle">
                    {{ t("remote.ciSection", "On GitHub’s runners") }}
                </h4>
                <p class="mb-run-location__blurb">
                    {{
                        t(
                            "remote.ciBlurb",
                            "The answer that suits a machine too slow to render at all: GitHub's runners do the work and this computer only uploads and downloads. It is a workflow rather than a switch — a repository, two consents that are never pre-ticked because a world carries builds and coordinates, and a run you can watch job by job — so it has a screen of its own.",
                        )
                    }}
                </p>
                <p class="mb-run-location__blurb">
                    {{
                        t(
                            "remote.ciCeiling",
                            "It refuses before packing anything when a world would exceed a release asset's ceiling, rather than discovering it after hours of upload.",
                        )
                    }}
                </p>
                <v-btn
                    :prepend-icon="mdiCloudSyncOutline"
                    :disabled="!canOpenCi"
                    variant="tonal"
                    color="primary"
                    size="small"
                    @click="emit('openCi')"
                >
                    {{ t("remote.openCi", "Open the GitHub runners screen") }}
                </v-btn>
                <p v-if="!canOpenCi" class="mb-run-location__blurb">
                    {{
                        t(
                            "remote.ciUnreachable",
                            "This surface has no way to open that screen from here.",
                        )
                    }}
                </p>
            </section>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-run-location {
    margin-block-end: 12px;
    border-radius: 16px;
}

.mb-run-location__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    padding: 10px 14px 0;
}

.mb-run-location__blurb {
    margin-block-start: 6px;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-run-location__choices {
    margin-block-start: 8px;
}

.mb-run-location__option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-block: 4px;
}

.mb-run-location__optionTitle {
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-run-location__optionSummary {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-run-location__optionReason {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-warning));
    text-wrap: pretty;
}

.mb-run-location__choiceLine {
    margin-block-start: 8px;
    font-size: 0.8125rem;
    font-weight: 500;
    text-wrap: pretty;
}

.mb-run-location__alert {
    margin-block-start: 8px;
}

.mb-run-location__section {
    margin-block-start: 20px;
}

.mb-run-location__sectionHead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-run-location__sectionTitle {
    font-size: 0.9375rem;
    font-weight: 500;
}
</style>
