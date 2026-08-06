<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiChevronDown,
    mdiChevronUp,
    mdiCloudDownloadOutline,
    mdiFingerprint,
    mdiFolderNetworkOutline,
    mdiRefresh,
    mdiStop,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VProgressLinear,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import PathField from "../PathField.vue";
import RemoteFileBrowser from "../remote/RemoteFileBrowser.vue";
import RemoteTargetEditor from "../remote/RemoteTargetEditor.vue";
import {
    loadTargets,
    resolveRemoteBridge,
    saveTargets,
    type RemoteBridge,
    type RemoteTarget,
    type TargetStorage,
} from "../remote/index.js";
import { raiseNotice } from "../../stores/notices.js";
import {
    resolveSshWorldSourceBridge,
    surveyLooksLikeWorld,
    type SshHostKeyOffer,
    type SshRemoteHostKind,
    type SshRemoteWorldEntry,
    type SshWorldSourceBridge,
    type SshWorldSourceEvent,
} from "./sshWorldSourceBridge.js";

/**
 * The guided SSH route inside the wizard's existing world step.
 *
 * Saved machines and the Explorer-style browser are deliberately the same components remote
 * rendering uses. This panel owns only the world-source sequence: detect the host, stop for
 * an unknown fingerprint, validate and survey the chosen folder, fetch it, then hand the
 * resulting local folder back to the ordinary wizard inspection path.
 */
const props = withDefaults(
    defineProps<{
        bridge?: SshWorldSourceBridge | null;
        remoteBridge?: RemoteBridge | null;
        storage?: TargetStorage | null;
    }>(),
    {},
);

const emit = defineEmits<{ use: [folder: string] }>();
const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveSshWorldSourceBridge() : props.bridge;
const remote = props.remoteBridge === undefined ? resolveRemoteBridge() : props.remoteBridge;
const storage = props.storage;
const open = ref(false);
const targets = ref<readonly RemoteTarget[]>([]);
const selectedId = ref<string | null>(null);
const selected = computed(
    () => targets.value.find((target) => target.id === selectedId.value) ?? null,
);

function replaceTargets(value: readonly RemoteTarget[]): void {
    targets.value = value;
    saveTargets(value, storage);
}

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");
const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const searchCorpus = computed(() =>
    [
        t("world.ssh.machine", "Saved SSH machine"),
        t("world.ssh.detect", "Check operating system and host key"),
        t("world.ssh.remoteFolder", "World folder on that machine"),
        t("world.ssh.localParent", "Local destination folder"),
        t("world.ssh.fetch", "Fetch this world"),
    ].join("\n"),
);
const noSearchMatch = computed(
    () => matcher.value.active && !matcher.value.test(searchCorpus.value),
);

const detecting = ref(false);
const kind = ref<SshRemoteHostKind | null>(null);
const detectMessage = ref<string | null>(null);
const hostKeys = ref<readonly SshHostKeyOffer[]>([]);
const trusting = ref<string | null>(null);
const browsing = ref(false);
const remotePath = ref("");
const pathFailure = ref<string | null>(null);
const surveying = ref(false);
const survey = ref<readonly SshRemoteWorldEntry[] | null>(null);
const surveyFailure = ref<string | null>(null);
const localParent = ref("");
const fetching = ref(false);
const fetchId = ref<string | null>(null);
const fetchLines = ref<string[]>([]);
const fetchFailure = ref<string | null>(null);
const fetchedFolder = ref<string | null>(null);
let baselineActive = new Set<string>();
let stopListening: (() => void) | null = null;
let activePoll: ReturnType<typeof setInterval> | null = null;

const browseRoot = computed(() => (kind.value === "windows" ? "C:\\" : "/"));
const surveyReady = computed(() => survey.value !== null && surveyLooksLikeWorld(survey.value));
const canBrowse = computed(
    () =>
        selected.value !== null &&
        kind.value !== null &&
        kind.value !== "unknown" &&
        remote?.canBrowse === true,
);
const canFetch = computed(
    () =>
        bridge !== null &&
        selected.value !== null &&
        kind.value !== null &&
        kind.value !== "unknown" &&
        surveyReady.value &&
        localParent.value.trim() !== "" &&
        !fetching.value,
);
const phaseProgress = computed(() => {
    if (fetchedFolder.value !== null) return 100;
    if (fetching.value) return 84;
    if (surveyReady.value) return 67;
    if (remotePath.value !== "") return 50;
    if (kind.value !== null) return 34;
    if (selected.value !== null) return 17;
    return 0;
});

function resetAfterTarget(): void {
    kind.value = null;
    detectMessage.value = null;
    hostKeys.value = [];
    remotePath.value = "";
    pathFailure.value = null;
    survey.value = null;
    surveyFailure.value = null;
    fetchFailure.value = null;
    fetchedFolder.value = null;
}

function chooseTarget(id: string | null): void {
    selectedId.value = id;
    resetAfterTarget();
}

async function detect(): Promise<void> {
    const target = selected.value;
    if (bridge === null || target === null || detecting.value) return;
    detecting.value = true;
    detectMessage.value = null;
    hostKeys.value = [];
    kind.value = null;
    survey.value = null;
    try {
        const valid = await bridge.validate(target);
        if (!valid.ok) {
            detectMessage.value = valid.message;
            return;
        }
        const answer = await bridge.detect(valid.target);
        if (answer.ok) {
            kind.value = answer.kind;
            detectMessage.value =
                answer.detail ??
                t("world.ssh.detected", { kind: answer.kind }, "This machine answered as {kind}.");
            remotePath.value = answer.kind === "windows" ? "C:\\" : "/";
        } else {
            detectMessage.value = answer.message;
            hostKeys.value = answer.hostKeys;
        }
    } catch (error) {
        detectMessage.value = error instanceof Error ? error.message : String(error);
    } finally {
        detecting.value = false;
    }
}

async function trust(key: SshHostKeyOffer): Promise<void> {
    const target = selected.value;
    if (bridge === null || target === null || trusting.value !== null) return;
    trusting.value = key.fingerprint;
    try {
        const answer = await bridge.trustHostKey(target, key.fingerprint);
        detectMessage.value = answer.message;
        if (answer.ok) await detect();
    } finally {
        trusting.value = null;
    }
}

function chooseRemoteFolder(path: string): void {
    remotePath.value = path;
    browsing.value = false;
    pathFailure.value = null;
    survey.value = null;
    surveyFailure.value = null;
}

async function surveyRemote(): Promise<void> {
    const target = selected.value;
    const hostKind = kind.value;
    if (bridge === null || target === null || hostKind === null || surveying.value) return;
    surveying.value = true;
    pathFailure.value = null;
    surveyFailure.value = null;
    survey.value = null;
    try {
        const checked = await bridge.checkPath(remotePath.value, hostKind);
        if (!checked.ok) {
            pathFailure.value = checked.reason;
            return;
        }
        remotePath.value = checked.path;
        const answer = await bridge.survey(target, checked.path, hostKind);
        if (!answer.ok) {
            surveyFailure.value = answer.message;
            return;
        }
        survey.value = answer.entries;
        if (!surveyLooksLikeWorld(answer.entries)) {
            surveyFailure.value = t(
                "world.ssh.notWorld",
                "The survey did not find both level.dat and a region file. Choose the world folder itself, not its parent or its region folder.",
            );
        }
    } catch (error) {
        surveyFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        surveying.value = false;
    }
}

function localWorldPath(): string {
    const parent = localParent.value.trim().replace(/[\\/]+$/, "");
    const leaf = remotePath.value.split(/[\\/]/).filter(Boolean).at(-1) ?? "world";
    const separator = parent.includes("\\") ? "\\" : "/";
    return `${parent}${separator}${leaf}`;
}

function listenForFetch(event: SshWorldSourceEvent): void {
    if (!fetching.value || baselineActive.has(event.id)) return;
    fetchId.value ??= event.id;
    if (event.kind === "line") fetchLines.value = [...fetchLines.value.slice(-19), event.message];
}

function startActivePoll(): void {
    if (bridge === null) return;
    activePoll = setInterval(() => {
        void bridge.active().then((ids) => {
            const own = ids.find((id) => !baselineActive.has(id));
            if (own !== undefined) fetchId.value ??= own;
        });
    }, 150);
}

function stopActivePoll(): void {
    if (activePoll !== null) clearInterval(activePoll);
    activePoll = null;
}

async function fetchWorld(): Promise<void> {
    const target = selected.value;
    if (bridge === null || target === null || !canFetch.value) return;
    fetching.value = true;
    fetchId.value = null;
    fetchLines.value = [];
    fetchFailure.value = null;
    fetchedFolder.value = null;
    baselineActive = new Set(await bridge.active());
    startActivePoll();
    try {
        const answer = await bridge.fetch({
            target,
            remotePath: remotePath.value,
            localPath: localParent.value.trim(),
        });
        fetchId.value = answer.id || fetchId.value;
        if (!answer.result.ok) {
            fetchFailure.value = answer.result.failure.message;
            raiseNotice("error", answer.result.failure.message);
            return;
        }
        fetchedFolder.value = localWorldPath();
        raiseNotice(
            "info",
            t(
                "world.ssh.fetchedNotice",
                { folder: fetchedFolder.value },
                "The SSH world was fetched to {folder} and is ready for the wizard to inspect.",
            ),
        );
        emit("use", fetchedFolder.value);
    } catch (error) {
        fetchFailure.value = error instanceof Error ? error.message : String(error);
        raiseNotice("error", fetchFailure.value);
    } finally {
        stopActivePoll();
        fetching.value = false;
    }
}

async function cancelFetch(): Promise<void> {
    if (bridge === null || fetchId.value === null) return;
    const stopped = await bridge.cancel(fetchId.value);
    if (!stopped) {
        fetchFailure.value = t(
            "world.ssh.cancelMiss",
            "That transfer had already ended before cancellation reached it.",
        );
    }
}

onMounted(() => {
    targets.value = loadTargets(storage);
    if (bridge !== null) stopListening = bridge.onSshWorldSourceEvent(listenForFetch);
});

onBeforeUnmount(() => {
    stopListening?.();
    stopActivePoll();
});

defineExpose({
    targets,
    selectedId,
    kind,
    hostKeys,
    remotePath,
    localParent,
    survey,
    fetchId,
    fetchLines,
    chooseTarget,
    chooseRemoteFolder,
    detect,
    trust,
    surveyRemote,
    fetchWorld,
    cancelFetch,
});
</script>

<template>
    <AppearanceTarget
        id="world.ssh-source"
        :label="t('world.ssh.title', 'World on an SSH machine')"
        as="section"
    >
        <div class="mb-ssh-world" data-test="ssh-world-source">
            <v-btn
                :prepend-icon="mdiFolderNetworkOutline"
                :append-icon="open ? mdiChevronUp : mdiChevronDown"
                :aria-expanded="open ? 'true' : 'false'"
                aria-controls="mb-ssh-world-panel"
                variant="text"
                size="small"
                data-test="ssh-open"
                @click="open = !open"
            >
                {{
                    open
                        ? t("world.ssh.hide", "Hide SSH worlds")
                        : t("world.ssh.show", "World on another machine over SSH")
                }}
            </v-btn>

            <v-card v-if="open" id="mb-ssh-world-panel" variant="tonal" class="mb-ssh-world__card">
                <v-card-title>{{ t("world.ssh.title", "World on an SSH machine") }}</v-card-title>
                <v-card-text>
                    <p class="mb-ssh-world__blurb">
                        {{
                            t(
                                "world.ssh.blurb",
                                "Choose a saved key-only SSH machine, inspect its real folders, review an unknown fingerprint, then fetch one world into a folder on this computer. Nothing is written to the other machine.",
                            )
                        }}
                    </p>

                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regexMode"
                        v-model:flags="flags"
                        :label="t('world.ssh.search', 'Search this SSH world setup')"
                        :sample="searchCorpus"
                    />
                    <p v-if="noSearchMatch" class="mb-ssh-world__blurb" role="status">
                        {{
                            t(
                                "world.ssh.noMatch",
                                "No SSH setup control matches that search. Clear it to show the whole guided flow again.",
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
                                "world.ssh.unavailable",
                                "Fetching a world over SSH needs the desktop app's complete SSH world-source bridge.",
                            )
                        }}
                    </v-alert>

                    <template v-else-if="!noSearchMatch">
                        <v-progress-linear
                            :model-value="phaseProgress"
                            height="8"
                            rounded
                            class="my-3"
                            data-test="ssh-phase-progress"
                        />

                        <h4>{{ t("world.ssh.machine", "1. Choose a saved SSH machine") }}</h4>
                        <RemoteTargetEditor
                            :bridge="remote"
                            :targets="targets"
                            :selected-id="selectedId"
                            @update:targets="replaceTargets"
                            @update:selected-id="chooseTarget"
                        />

                        <div class="mb-ssh-world__actions">
                            <v-btn
                                :prepend-icon="mdiFingerprint"
                                :disabled="selected === null || detecting"
                                :loading="detecting"
                                variant="tonal"
                                data-test="ssh-detect"
                                @click="detect"
                            >
                                {{
                                    t("world.ssh.detect", "2. Check operating system and host key")
                                }}
                            </v-btn>
                            <p v-if="selected === null" class="mb-ssh-world__disabled">
                                {{
                                    t(
                                        "world.ssh.detectNeedsTarget",
                                        "Choose or add a saved machine before checking it.",
                                    )
                                }}
                            </p>
                        </div>

                        <v-alert
                            v-if="detectMessage"
                            :type="kind === null ? 'warning' : 'info'"
                            variant="tonal"
                            density="compact"
                            class="my-2"
                            role="status"
                        >
                            {{ detectMessage }}
                        </v-alert>

                        <div
                            v-if="hostKeys.length > 0"
                            class="mb-ssh-world__keys"
                            data-test="ssh-host-keys"
                        >
                            <p>
                                {{
                                    t(
                                        "world.ssh.reviewKey",
                                        "Compare one fingerprint with the server itself. Trust only an exact match; a changed key is refused and has no trust button.",
                                    )
                                }}
                            </p>
                            <div
                                v-for="key in hostKeys"
                                :key="key.fingerprint"
                                class="mb-ssh-world__key"
                            >
                                <code>{{ key.type }} {{ key.fingerprint }}</code>
                                <v-btn
                                    :loading="trusting === key.fingerprint"
                                    size="small"
                                    variant="tonal"
                                    @click="trust(key)"
                                >
                                    {{
                                        t(
                                            "world.ssh.trustExact",
                                            "I compared this exact fingerprint; trust it",
                                        )
                                    }}
                                </v-btn>
                            </div>
                        </div>

                        <h4>
                            {{
                                t(
                                    "world.ssh.remoteFolder",
                                    "3. Choose the world folder on that machine",
                                )
                            }}
                        </h4>
                        <div class="mb-ssh-world__actions">
                            <v-btn
                                :prepend-icon="mdiFolderNetworkOutline"
                                :disabled="!canBrowse"
                                variant="tonal"
                                data-test="ssh-browse"
                                @click="browsing = true"
                            >
                                {{ t("world.ssh.browse", "Browse that machine") }}
                            </v-btn>
                            <v-btn
                                :prepend-icon="mdiRefresh"
                                :disabled="remotePath.trim() === '' || kind === null || surveying"
                                :loading="surveying"
                                variant="text"
                                data-test="ssh-survey"
                                @click="surveyRemote"
                            >
                                {{ t("world.ssh.survey", "Check this remote world") }}
                            </v-btn>
                        </div>
                        <p v-if="!canBrowse" class="mb-ssh-world__disabled">
                            {{
                                t(
                                    "world.ssh.browseBlocked",
                                    "A detected, trusted POSIX or Windows host and the remote-directory bridge are required before its folders can be browsed.",
                                )
                            }}
                        </p>
                        <code v-if="remotePath" class="mb-ssh-world__path">{{ remotePath }}</code>
                        <v-alert
                            v-if="pathFailure || surveyFailure"
                            type="warning"
                            variant="tonal"
                            density="compact"
                            class="my-2"
                            role="alert"
                        >
                            {{ pathFailure ?? surveyFailure }}
                        </v-alert>
                        <v-alert
                            v-if="surveyReady"
                            type="success"
                            variant="tonal"
                            density="compact"
                            class="my-2"
                            role="status"
                        >
                            {{
                                t(
                                    "world.ssh.surveyReady",
                                    { files: survey?.length ?? 0 },
                                    "The survey found level.dat, region data and {files} files. No world bytes have moved yet.",
                                )
                            }}
                        </v-alert>

                        <h4>
                            {{
                                t("world.ssh.localParent", "4. Choose the local destination folder")
                            }}
                        </h4>
                        <PathField
                            v-model="localParent"
                            semantic="folder"
                            :field="
                                t(
                                    'world.ssh.localParentField',
                                    'the parent folder for the fetched world',
                                )
                            "
                            :label="t('world.ssh.localParentLabel', 'Fetch into this folder')"
                            :placeholder="
                                t(
                                    'world.ssh.localParentHint',
                                    'the remote world folder will be created inside it',
                                )
                            "
                        />

                        <div class="mb-ssh-world__actions">
                            <v-btn
                                :prepend-icon="mdiCloudDownloadOutline"
                                :disabled="!canFetch"
                                color="primary"
                                data-test="ssh-fetch"
                                @click="fetchWorld"
                            >
                                {{ t("world.ssh.fetch", "5. Fetch this world") }}
                            </v-btn>
                            <v-btn
                                v-if="fetching"
                                :prepend-icon="mdiStop"
                                :disabled="fetchId === null"
                                color="error"
                                variant="tonal"
                                data-test="ssh-cancel"
                                @click="cancelFetch"
                            >
                                {{ t("world.ssh.cancel", "Cancel the transfer") }}
                            </v-btn>
                        </div>
                        <p v-if="!canFetch" class="mb-ssh-world__disabled">
                            {{
                                t(
                                    "world.ssh.fetchBlocked",
                                    "A surveyed world and a local destination are required. The button stays disabled until both are ready.",
                                )
                            }}
                        </p>

                        <div
                            v-if="fetching || fetchLines.length > 0"
                            class="mb-ssh-world__progress"
                            role="status"
                            aria-live="polite"
                        >
                            <strong>{{
                                t(
                                    "world.ssh.transferring",
                                    { lines: fetchLines.length },
                                    "Transfer phase 3 of 3; {lines} progress messages received.",
                                )
                            }}</strong>
                            <code v-if="fetchId">{{ fetchId }}</code>
                            <pre v-if="fetchLines.length > 0">{{ fetchLines.join("\n") }}</pre>
                        </div>
                        <v-alert
                            v-if="fetchFailure"
                            type="error"
                            variant="tonal"
                            density="compact"
                            class="my-2"
                            role="alert"
                            >{{ fetchFailure }}</v-alert
                        >
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
                                    "world.ssh.fetched",
                                    { folder: fetchedFolder },
                                    "Fetched to {folder}. The ordinary wizard is reading that local folder now.",
                                )
                            }}
                        </v-alert>
                    </template>
                </v-card-text>
            </v-card>

            <v-dialog v-model="browsing" max-width="780" scrollable>
                <v-card class="mb-ssh-world__browser">
                    <v-card-title>{{
                        t("world.ssh.browserTitle", "Choose the remote world folder")
                    }}</v-card-title>
                    <v-card-text>
                        <RemoteFileBrowser
                            v-if="browsing && selected !== null"
                            :bridge="remote"
                            :target="selected"
                            :start-path="remotePath.trim() === '' ? browseRoot : remotePath"
                            @choose="chooseRemoteFolder"
                            @cancel="browsing = false"
                        />
                    </v-card-text>
                </v-card>
            </v-dialog>
        </div>
    </AppearanceTarget>
</template>

<style>
.mb-ssh-world {
    margin-block-start: 16px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-ssh-world__card {
    margin-block-start: 8px;
    border-radius: 16px;
}

.mb-ssh-world__card > .v-card-title {
    overflow: visible;
    line-height: 1.25;
    text-overflow: clip;
    white-space: normal;
}

.mb-ssh-world__blurb,
.mb-ssh-world__disabled {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-ssh-world h4 {
    margin-block: 18px 8px;
    font-size: 0.9375rem;
    font-weight: 600;
}

.mb-ssh-world__actions,
.mb-ssh-world__key {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-ssh-world > .v-btn,
.mb-ssh-world__actions > .v-btn,
.mb-ssh-world__key > .v-btn {
    max-inline-size: 100%;
    min-block-size: 44px;
    block-size: auto;
}

.mb-ssh-world__actions > .v-btn {
    flex: 1 1 220px;
}

.mb-ssh-world > .v-btn .v-btn__content,
.mb-ssh-world__actions > .v-btn .v-btn__content,
.mb-ssh-world__key > .v-btn .v-btn__content {
    padding-block: 6px;
    overflow-wrap: anywhere;
    white-space: normal;
}

.mb-ssh-world__keys {
    margin-block: 8px;
    padding: 12px;
    border: 1px solid rgba(var(--v-theme-warning), 0.45);
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
}

.mb-ssh-world__key {
    justify-content: space-between;
    margin-block-start: 8px;
}

.mb-ssh-world__key code,
.mb-ssh-world__path,
.mb-ssh-world__progress code {
    overflow-wrap: anywhere;
    font-family: ui-monospace, "Cascadia Mono", monospace;
}

.mb-ssh-world__progress {
    display: grid;
    gap: 6px;
    margin-block-start: 12px;
    padding: 12px;
    border-radius: 12px;
    background: rgb(var(--v-theme-surface));
}

.mb-ssh-world__progress pre {
    max-block-size: 180px;
    overflow: auto;
    white-space: pre-wrap;
}

.mb-ssh-world__browser {
    max-block-size: min(88vh, 760px);
    overflow: auto;
    border-radius: 16px;
}
</style>
