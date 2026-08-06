<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiChevronDown,
    mdiChevronUp,
    mdiDatabaseOutline,
    mdiDocker,
    mdiRefresh,
    mdiStop,
    mdiTrayArrowDown,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VBtnToggle,
    VCard,
    VCardText,
    VCardTitle,
    VCheckbox,
    VChip,
    VProgressLinear,
    VSelect,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import DockerStateNote from "../remote/DockerStateNote.vue";
import { describeDocker, dockerNotProbed, type DockerNote } from "../remote/dockerStates.js";
import { resolveRuntimeBridge, type RuntimeBridge } from "../remote/remoteBridge.js";
import PathField from "../PathField.vue";
import { raiseNotice } from "../../stores/notices.js";
import {
    resolveDockerWorldSourceBridge,
    type DockerContainerDetail,
    type DockerContainerSummary,
    type DockerMount,
    type DockerSourceRequest,
    type DockerVolumeDetail,
    type DockerVolumeSummary,
    type DockerWorldEvent,
    type DockerWorldFailure,
    type DockerWorldFingerprint,
    type DockerWorldSourceBridge,
} from "./dockerWorldSourceBridge.js";

const props = withDefaults(
    defineProps<{
        bridge?: DockerWorldSourceBridge | null;
        runtimeBridge?: RuntimeBridge | null;
    }>(),
    {},
);

const emit = defineEmits<{ use: [folder: string] }>();
const { t } = useI18n();
const bridge = props.bridge === undefined ? resolveDockerWorldSourceBridge() : props.bridge;
const runtime = props.runtimeBridge === undefined ? resolveRuntimeBridge() : props.runtimeBridge;

const open = ref(false);
const loading = ref(false);
const dockerNote = ref<DockerNote | null>(null);
const failure = ref<DockerWorldFailure | null>(null);
const containers = ref<readonly DockerContainerSummary[]>([]);
const volumes = ref<readonly DockerVolumeSummary[]>([]);
const kind = ref<"container" | "volume">("container");
const selectedContainerId = ref<string | null>(null);
const selectedVolumeName = ref<string | null>(null);
const container = ref<DockerContainerDetail | null>(null);
const volume = ref<DockerVolumeDetail | null>(null);
const selectedMountDestination = ref<string | null>(null);
const destination = ref("");
const acknowledgeLiveRisk = ref(false);
const inspecting = ref(false);
const fingerprintLoading = ref(false);
const fingerprint = ref<DockerWorldFingerprint | null | undefined>(undefined);

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");
const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const searchCorpus = computed(() =>
    [
        t("world.docker.refresh", "Check Docker and refresh the lists"),
        t("world.docker.container", "Container"),
        t("world.docker.volume", "Named volume"),
        t("world.docker.mount", "World mount inside the container"),
        t("world.docker.destination", "Local destination folder"),
        t("world.docker.fetch", "Fetch this world"),
    ].join("\n"),
);
const noSearchMatch = computed(
    () => matcher.value.active && !matcher.value.test(searchCorpus.value),
);

const containerItems = computed(() =>
    containers.value.map((entry) => ({
        title: `${entry.name} · ${entry.image}`,
        subtitle: entry.status,
        value: entry.id,
    })),
);
const volumeItems = computed(() =>
    volumes.value.map((entry) => ({
        title: entry.name,
        subtitle: entry.driver,
        value: entry.name,
    })),
);
const mounts = computed<readonly DockerMount[]>(() =>
    (container.value?.mounts ?? []).filter(
        (mount) => mount.type === "bind" || mount.type === "volume",
    ),
);
const mountItems = computed(() =>
    mounts.value.map((mount) => ({
        title: mount.destination,
        subtitle: `${mount.type} · ${mount.readOnly ? t("world.docker.readOnly", "read only") : t("world.docker.writableAtSource", "source is writable by the container")}`,
        value: mount.destination,
    })),
);

const source = computed<DockerSourceRequest | null>(() => {
    if (kind.value === "volume") {
        return selectedVolumeName.value === null
            ? null
            : { kind: "volume", volumeName: selectedVolumeName.value };
    }
    return selectedContainerId.value === null || selectedMountDestination.value === null
        ? null
        : {
              kind: "container",
              containerId: selectedContainerId.value,
              mountDestination: selectedMountDestination.value,
          };
});

const liveWarning = computed(() => {
    if (kind.value !== "container" || container.value?.running !== true) return null;
    return t(
        "world.docker.liveRisk",
        { name: container.value.name },
        "{name} is running and may be writing region files now. A live copy can capture a torn .mca region file. Stop the server first, choose a known-good backup instead, or explicitly accept this exact risk for this fetch only.",
    );
});

const fingerprintText = computed(() => {
    if (fingerprint.value === undefined) return null;
    if (fingerprint.value === null) {
        return kind.value === "volume"
            ? t(
                  "world.docker.fingerprintNoneVolume",
                  "This named-volume copy has no cheap fingerprint. Docker must read the volume to know whether it changed.",
              )
            : t(
                  "world.docker.fingerprintNoneContainer",
                  "This container-copy route has no cheap fingerprint. Docker must read the mount to know whether it changed.",
              );
    }
    return t(
        "world.docker.fingerprintBind",
        { regions: fingerprint.value.regions.length },
        "This bind mount is directly readable. Its cheap metadata fingerprint covers {regions} region files without copying world contents.",
    );
});

const canFetchReason = computed(() => {
    if (loading.value || inspecting.value || fingerprintLoading.value)
        return t("world.docker.waiting", "Wait for the current Docker check to finish.");
    if (source.value === null)
        return kind.value === "container"
            ? t(
                  "world.docker.chooseMountReason",
                  "Choose a real container and one of its bind or volume mounts first.",
              )
            : t(
                  "world.docker.chooseVolumeReason",
                  "Choose one of Docker's real named volumes first.",
              );
    if (destination.value.trim() === "")
        return t(
            "world.docker.destinationReason",
            "Choose the exact local folder the fetched world should become.",
        );
    if (liveWarning.value !== null && !acknowledgeLiveRisk.value)
        return t(
            "world.docker.ackReason",
            "Read and acknowledge the live-container warning for this fetch.",
        );
    return null;
});

const fetching = ref(false);
const fetchId = ref<string | null>(null);
const progress = ref<Extract<DockerWorldEvent, { type: "progress" }> | null>(null);
const fetchLines = ref<string[]>([]);
const fetchedFolder = ref<string | null>(null);
let baselineActive = new Set<string>();
let stopListening: (() => void) | null = null;

const progressValue = computed(() => {
    const current = progress.value;
    if (
        current === null ||
        current.filesDone === null ||
        current.filesTotal === null ||
        current.filesTotal === 0
    )
        return null;
    return Math.min(100, (current.filesDone / current.filesTotal) * 100);
});

function resetSelection(): void {
    failure.value = null;
    container.value = null;
    volume.value = null;
    selectedMountDestination.value = null;
    acknowledgeLiveRisk.value = false;
    fingerprint.value = undefined;
}

async function refresh(): Promise<void> {
    if (bridge === null || loading.value) return;
    loading.value = true;
    failure.value = null;
    selectedContainerId.value = null;
    selectedVolumeName.value = null;
    resetSelection();
    try {
        if (runtime === null || !runtime.canProbeDocker) dockerNote.value = dockerNotProbed(t);
        else dockerNote.value = describeDocker(await runtime.dockerRuntime(), t);
        const answer = await bridge.list();
        if (!answer.ok) {
            failure.value = answer.failure;
            containers.value = [];
            volumes.value = [];
            return;
        }
        containers.value = answer.containers;
        volumes.value = answer.volumes;
    } catch (error) {
        failure.value = {
            code: "unusable",
            message: error instanceof Error ? error.message : String(error),
            detail: null,
        };
    } finally {
        loading.value = false;
    }
}

async function inspectContainer(): Promise<void> {
    acknowledgeLiveRisk.value = false;
    fingerprint.value = undefined;
    selectedMountDestination.value = null;
    container.value = null;
    failure.value = null;
    const id = selectedContainerId.value;
    if (bridge === null || id === null) return;
    inspecting.value = true;
    try {
        const answer = await bridge.inspectContainer(id);
        if (!answer.ok) failure.value = answer.failure;
        else container.value = answer.detail;
    } finally {
        inspecting.value = false;
    }
}

async function inspectVolume(): Promise<void> {
    fingerprint.value = undefined;
    volume.value = null;
    failure.value = null;
    const name = selectedVolumeName.value;
    if (bridge === null || name === null) return;
    inspecting.value = true;
    try {
        const answer = await bridge.inspectVolume(name);
        if (!answer.ok) failure.value = answer.failure;
        else volume.value = answer.detail;
    } finally {
        inspecting.value = false;
    }
    await inspectFingerprint();
}

async function inspectFingerprint(): Promise<void> {
    const selected = source.value;
    if (bridge === null || selected === null || fingerprintLoading.value) return;
    fingerprintLoading.value = true;
    fingerprint.value = undefined;
    try {
        const answer = await bridge.fingerprint(selected);
        if (!answer.ok) failure.value = answer.failure;
        else fingerprint.value = answer.fingerprint;
    } finally {
        fingerprintLoading.value = false;
    }
}

function onEvent(event: DockerWorldEvent): void {
    if (!fetching.value || baselineActive.has(event.fetchId)) return;
    fetchId.value ??= event.fetchId;
    if (event.type === "progress") progress.value = event;
    if (event.type === "log") fetchLines.value = [...fetchLines.value.slice(-7), event.message];
}

async function fetchWorld(): Promise<void> {
    const selected = source.value;
    if (bridge === null || selected === null || canFetchReason.value !== null || fetching.value)
        return;

    // Re-read liveness at the last possible moment. The acknowledgement is deliberately
    // consumed below and never persisted, even when the copy fails.
    const acknowledged = acknowledgeLiveRisk.value;
    if (selected.kind === "container") {
        const fresh = await bridge.inspectContainer(selected.containerId);
        if (!fresh.ok) {
            failure.value = fresh.failure;
            return;
        }
        container.value = fresh.detail;
        if (fresh.detail.running && !acknowledged) return;
    }

    fetching.value = true;
    acknowledgeLiveRisk.value = false;
    failure.value = null;
    fetchedFolder.value = null;
    fetchId.value = null;
    progress.value = null;
    fetchLines.value = [];
    baselineActive = new Set(await bridge.active());
    try {
        const answer = await bridge.fetch({
            source: selected,
            destination: destination.value.trim(),
            ...(acknowledged ? { acknowledgeLiveRisk: true } : {}),
        });
        fetchId.value = answer.fetchId || fetchId.value;
        if (!answer.ok) {
            failure.value = answer.failure;
            raiseNotice("error", answer.failure.message);
            return;
        }
        fetchedFolder.value = destination.value.trim();
        raiseNotice(
            "info",
            t(
                "world.docker.fetchedNotice",
                { folder: fetchedFolder.value },
                "The Docker world was fetched to {folder} and is ready for the wizard to inspect.",
            ),
        );
        emit("use", fetchedFolder.value);
    } catch (error) {
        failure.value = {
            code: "copy-failed",
            message: error instanceof Error ? error.message : String(error),
            detail: null,
        };
        raiseNotice("error", failure.value.message);
    } finally {
        fetching.value = false;
    }
}

async function cancelFetch(): Promise<void> {
    if (bridge === null || fetchId.value === null) return;
    const cancelled = await bridge.cancel(fetchId.value);
    if (!cancelled) {
        failure.value = {
            code: "cancelled",
            message: t(
                "world.docker.cancelMiss",
                "That fetch ended before cancellation reached it.",
            ),
            detail: null,
        };
    }
}

watch(open, (value) => {
    if (value && containers.value.length === 0 && volumes.value.length === 0) void refresh();
});
watch(selectedContainerId, () => void inspectContainer());
watch(selectedVolumeName, () => void inspectVolume());
watch(selectedMountDestination, () => {
    acknowledgeLiveRisk.value = false;
    void inspectFingerprint();
});
watch(kind, () => resetSelection());

onMounted(() => {
    if (bridge !== null) stopListening = bridge.onDockerWorldEvent(onEvent);
});
onBeforeUnmount(() => stopListening?.());

defineExpose({
    open,
    kind,
    containers,
    volumes,
    selectedContainerId,
    selectedVolumeName,
    selectedMountDestination,
    destination,
    acknowledgeLiveRisk,
    container,
    volume,
    fingerprint,
    fetching,
    fetchId,
    progress,
    refresh,
    inspectContainer,
    inspectVolume,
    inspectFingerprint,
    fetchWorld,
    cancelFetch,
});
</script>

<template>
    <AppearanceTarget
        id="world.docker-source"
        :label="t('world.docker.title', 'World in local Docker')"
        as="section"
    >
        <div class="mb-docker-world" data-test="docker-world-source">
            <v-btn
                :prepend-icon="mdiDocker"
                :append-icon="open ? mdiChevronUp : mdiChevronDown"
                :aria-expanded="open ? 'true' : 'false'"
                aria-controls="mb-docker-world-panel"
                variant="text"
                size="small"
                data-test="docker-open"
                @click="open = !open"
            >
                {{
                    open
                        ? t("world.docker.hide", "Hide Docker worlds")
                        : t("world.docker.show", "World in a local Docker container or volume")
                }}
            </v-btn>

            <v-card
                v-if="open"
                id="mb-docker-world-panel"
                variant="tonal"
                class="mb-docker-world__card"
            >
                <v-card-title>{{ t("world.docker.title", "World in local Docker") }}</v-card-title>
                <v-card-text>
                    <p class="mb-docker-world__blurb">
                        {{
                            t(
                                "world.docker.blurb",
                                "This reads the Docker daemon on this computer only. Choose a container mount or named volume Docker actually reports, copy it read-only into a browsed local folder, then let the ordinary wizard validate that folder.",
                            )
                        }}
                    </p>

                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regexMode"
                        v-model:flags="flags"
                        :label="t('world.docker.search', 'Search this Docker world setup')"
                        :sample="searchCorpus"
                    />
                    <p v-if="noSearchMatch" class="mb-docker-world__blurb" role="status">
                        {{
                            t(
                                "world.docker.noMatch",
                                "No Docker-world control matches that search. Clear it to show the guided flow again.",
                            )
                        }}
                    </p>

                    <v-alert
                        v-if="bridge === null"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="my-3"
                    >
                        {{
                            t(
                                "world.docker.unavailable",
                                "Fetching a Docker world needs the desktop app's complete Docker-world bridge, including progress and cancellation.",
                            )
                        }}
                    </v-alert>

                    <template v-else-if="!noSearchMatch">
                        <div class="mb-docker-world__actions">
                            <v-btn
                                :prepend-icon="mdiRefresh"
                                :loading="loading"
                                :disabled="loading || fetching"
                                variant="tonal"
                                data-test="docker-refresh"
                                @click="refresh"
                            >
                                {{
                                    t("world.docker.refresh", "Check Docker and refresh the lists")
                                }}
                            </v-btn>
                        </div>
                        <DockerStateNote v-if="dockerNote" :note="dockerNote" />
                        <v-alert
                            v-if="failure"
                            type="error"
                            variant="tonal"
                            density="compact"
                            class="my-2"
                            role="alert"
                        >
                            <strong>{{ failure.message }}</strong>
                            <p v-if="failure.detail" class="mb-docker-world__detail">
                                {{ failure.detail }}
                            </p>
                        </v-alert>

                        <template v-if="!failure || containers.length > 0 || volumes.length > 0">
                            <h4>{{ t("world.docker.source", "1. Choose the Docker source") }}</h4>
                            <v-btn-toggle
                                v-model="kind"
                                mandatory
                                divided
                                variant="outlined"
                                density="comfortable"
                            >
                                <v-btn value="container" :prepend-icon="mdiDocker">{{
                                    t("world.docker.container", "Container")
                                }}</v-btn>
                                <v-btn value="volume" :prepend-icon="mdiDatabaseOutline">{{
                                    t("world.docker.volume", "Named volume")
                                }}</v-btn>
                            </v-btn-toggle>

                            <template v-if="kind === 'container'">
                                <v-select
                                    v-model="selectedContainerId"
                                    :items="containerItems"
                                    :label="
                                        t(
                                            'world.docker.containerPicker',
                                            'Container Docker reports',
                                        )
                                    "
                                    :disabled="loading || fetching || containers.length === 0"
                                    item-title="title"
                                    item-value="value"
                                    variant="outlined"
                                    density="compact"
                                    class="mt-3"
                                    data-test="docker-container-picker"
                                />
                                <p v-if="containers.length === 0" class="mb-docker-world__disabled">
                                    {{
                                        t(
                                            "world.docker.noContainers",
                                            "Docker reports no containers, running or stopped. Create or restore the server container first, or use a named volume.",
                                        )
                                    }}
                                </p>
                                <v-select
                                    v-if="container"
                                    v-model="selectedMountDestination"
                                    :items="mountItems"
                                    :label="
                                        t('world.docker.mount', 'World mount inside the container')
                                    "
                                    :disabled="inspecting || fetching || mounts.length === 0"
                                    item-title="title"
                                    item-value="value"
                                    variant="outlined"
                                    density="compact"
                                    data-test="docker-mount-picker"
                                />
                                <p
                                    v-if="container && mounts.length === 0"
                                    class="mb-docker-world__disabled"
                                >
                                    {{
                                        t(
                                            "world.docker.noMounts",
                                            "This container reports no bind mounts or named-volume mounts. A tmpfs or pipe cannot be used as a persistent Minecraft world.",
                                        )
                                    }}
                                </p>
                                <div v-if="container" class="mb-docker-world__status" role="status">
                                    <v-chip
                                        :color="container.running ? 'warning' : 'success'"
                                        size="small"
                                        variant="tonal"
                                    >
                                        {{
                                            container.running
                                                ? t("world.docker.running", "Running")
                                                : t("world.docker.stopped", "Stopped")
                                        }}
                                    </v-chip>
                                    <span>{{ container.status }}</span>
                                </div>
                            </template>

                            <template v-else>
                                <v-select
                                    v-model="selectedVolumeName"
                                    :items="volumeItems"
                                    :label="
                                        t(
                                            'world.docker.volumePicker',
                                            'Named volume Docker reports',
                                        )
                                    "
                                    :disabled="loading || fetching || volumes.length === 0"
                                    item-title="title"
                                    item-value="value"
                                    variant="outlined"
                                    density="compact"
                                    class="mt-3"
                                    data-test="docker-volume-picker"
                                />
                                <p v-if="volumes.length === 0" class="mb-docker-world__disabled">
                                    {{
                                        t(
                                            "world.docker.noVolumes",
                                            "Docker reports no named volumes. Choose a container mount, or create the server volume first.",
                                        )
                                    }}
                                </p>
                                <p v-if="volume" class="mb-docker-world__detail">
                                    {{
                                        t(
                                            "world.docker.volumeDetail",
                                            {
                                                driver: volume.driver,
                                                mountpoint: volume.mountpoint,
                                            },
                                            "Driver: {driver}. Docker's own host mountpoint is {mountpoint}; this app does not read that privileged path directly.",
                                        )
                                    }}
                                </p>
                            </template>

                            <v-progress-linear
                                v-if="inspecting || fingerprintLoading"
                                indeterminate
                                rounded
                                height="6"
                                class="my-2"
                            />
                            <v-alert
                                v-if="fingerprintText"
                                type="info"
                                variant="tonal"
                                density="compact"
                                class="my-2"
                                role="status"
                            >
                                {{ fingerprintText }}
                            </v-alert>

                            <h4>
                                {{
                                    t(
                                        "world.docker.destinationStep",
                                        "2. Choose the exact local destination",
                                    )
                                }}
                            </h4>
                            <PathField
                                v-model="destination"
                                :field="
                                    t(
                                        'world.docker.destinationField',
                                        'the local Docker-world destination folder',
                                    )
                                "
                                :label="t('world.docker.destination', 'Local destination folder')"
                                semantic="folder"
                                :disabled="fetching"
                            />
                            <p class="mb-docker-world__blurb">
                                {{
                                    t(
                                        "world.docker.additive",
                                        "The fetch is additive and read-only at the source. It adds or updates local files and never deletes a local file that disappeared from Docker.",
                                    )
                                }}
                            </p>

                            <v-alert
                                v-if="liveWarning"
                                type="warning"
                                variant="tonal"
                                density="compact"
                                class="my-3"
                                role="alert"
                            >
                                <p>{{ liveWarning }}</p>
                                <v-checkbox
                                    v-model="acknowledgeLiveRisk"
                                    :label="
                                        t(
                                            'world.docker.acknowledge',
                                            { name: container?.name ?? '' },
                                            'I accept the exact torn-region-file risk for this fetch from {name} only.',
                                        )
                                    "
                                    hide-details
                                    data-test="docker-live-ack"
                                />
                            </v-alert>

                            <h4>{{ t("world.docker.fetchStep", "3. Fetch and validate") }}</h4>
                            <div class="mb-docker-world__actions">
                                <v-btn
                                    :prepend-icon="mdiTrayArrowDown"
                                    :loading="fetching"
                                    :disabled="canFetchReason !== null || fetching"
                                    color="primary"
                                    data-test="docker-fetch"
                                    @click="fetchWorld"
                                >
                                    {{ t("world.docker.fetch", "Fetch this world") }}
                                </v-btn>
                                <v-btn
                                    v-if="fetching"
                                    :prepend-icon="mdiStop"
                                    :disabled="fetchId === null"
                                    variant="outlined"
                                    data-test="docker-cancel"
                                    @click="cancelFetch"
                                >
                                    {{ t("world.docker.cancel", "Cancel the fetch") }}
                                </v-btn>
                            </div>
                            <p
                                v-if="canFetchReason && !fetching"
                                class="mb-docker-world__disabled"
                                role="status"
                            >
                                {{ canFetchReason }}
                            </p>

                            <div
                                v-if="fetching || progress"
                                class="mb-docker-world__progress"
                                role="status"
                                aria-live="polite"
                            >
                                <strong>{{
                                    progress?.message ??
                                    t("world.docker.starting", "Starting the Docker-world fetch...")
                                }}</strong>
                                <v-progress-linear
                                    :indeterminate="progressValue === null"
                                    :model-value="progressValue ?? 0"
                                    rounded
                                    height="8"
                                />
                                <span
                                    v-if="
                                        progress?.filesDone !== null &&
                                        progress?.filesTotal !== null
                                    "
                                >
                                    {{
                                        t(
                                            "world.docker.filesProgress",
                                            {
                                                done: progress?.filesDone ?? 0,
                                                total: progress?.filesTotal ?? 0,
                                            },
                                            "{done} of {total} files checked",
                                        )
                                    }}
                                </span>
                                <code v-if="progress?.currentFile">{{ progress.currentFile }}</code>
                                <code v-if="fetchId">{{ fetchId }}</code>
                                <pre v-if="fetchLines.length > 0">{{ fetchLines.join("\n") }}</pre>
                            </div>

                            <v-alert
                                v-if="fetchedFolder"
                                type="success"
                                variant="tonal"
                                density="compact"
                                class="my-2"
                                role="status"
                            >
                                {{
                                    t(
                                        "world.docker.fetched",
                                        { folder: fetchedFolder },
                                        "Fetched and validated {folder}. The ordinary wizard is inspecting that local folder now.",
                                    )
                                }}
                            </v-alert>
                        </template>
                    </template>
                </v-card-text>
            </v-card>
        </div>
    </AppearanceTarget>
</template>

<style>
.mb-docker-world {
    margin-block-start: 16px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-docker-world__card {
    margin-block-start: 8px;
    max-block-size: min(80vh, 760px);
    overflow: auto;
    border-radius: 16px;
}

.mb-docker-world__card > .v-card-title {
    overflow: visible;
    line-height: 1.25;
    text-overflow: clip;
    white-space: normal;
}

.mb-docker-world h4 {
    margin-block: 18px 8px;
    font-size: 0.9375rem;
    font-weight: 600;
}

.mb-docker-world__blurb,
.mb-docker-world__disabled,
.mb-docker-world__detail {
    font-size: 0.8125rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-docker-world__actions,
.mb-docker-world__status {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-docker-world__actions > .v-btn {
    min-block-size: 44px;
    block-size: auto;
    max-inline-size: 100%;
}

.mb-docker-world__actions > .v-btn .v-btn__content {
    padding-block: 6px;
    overflow-wrap: anywhere;
    white-space: normal;
}

.mb-docker-world .v-btn,
.mb-docker-world .v-selection-control,
.mb-docker-world .v-field {
    min-block-size: 44px;
    min-inline-size: 44px;
}

.mb-docker-world .v-btn-toggle,
.mb-docker-world .v-btn-toggle .v-btn {
    block-size: 44px !important;
    min-block-size: 44px !important;
}

.mb-docker-world__progress {
    display: grid;
    gap: 6px;
    margin-block-start: 12px;
    padding: 12px;
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
}

.mb-docker-world__progress code,
.mb-docker-world__progress pre {
    overflow-wrap: anywhere;
    font-family: ui-monospace, "Cascadia Mono", monospace;
    font-size: 0.75rem;
}

.mb-docker-world__progress pre {
    max-block-size: 120px;
    overflow: auto;
    white-space: pre-wrap;
}
</style>
