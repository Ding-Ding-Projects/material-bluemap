<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCheckCircleOutline, mdiCloudUploadOutline, mdiRefresh, mdiStopCircleOutline } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VRadio, VRadioGroup, VTextField } from "vuetify/components";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import {
    resolveHostingBridge,
    type RemoteHostingBindMode,
    type RemoteHostingBridge,
    type RemoteHostingRecord,
    type RemoteHostMapRequest,
    type RemoteTarget,
} from "./hostingBridge.js";

/**
 * Publishing an already-rendered map to a Linux server the person owns, over SSH, in a
 * Docker container that keeps answering after this application closes.
 *
 * ## Why the world is uploaded again, for a map that already rendered
 *
 * The engine constructs a real map on every start of the container, `-w` included, and
 * that construction opens the world's own files whether or not anything is re-rendered.
 * So the world goes up alongside the tiles - see `remote/hosting.ts`'s own top comment for
 * the fuller explanation, which is worth reading before this ever surprises somebody.
 *
 * ## The one choice this panel refuses to make quietly
 *
 * `bindMode` decides whether the published port answers only on that server's own loopback
 * (reachable through an SSH tunnel you open yourself) or on every interface it has (the
 * whole internet, over plain HTTP - this application has no TLS anywhere in this server).
 * The warning for the public choice is shown before it is ever the selected value, not
 * after, and it is the same sentence at every funny level: voice is what may move, not the
 * fact that there is no certificate here.
 *
 * ## Verified means genuinely connected to, never "docker said so"
 *
 * `record.verified` only ever becomes true after a real check succeeded: a TCP connection
 * from this computer for a public bind, or a check run on the remote host itself, over the
 * same SSH connection, for a loopback one. See `remote/hosting.ts`.
 */
const props = withDefaults(
    defineProps<{
        bridge?: RemoteHostingBridge | null | undefined;
        target: RemoteTarget | null;
        renderId: string;
        maps: readonly RemoteHostMapRequest[];
        /** Defaults to `renderId`: one hosted publication per render, unless given otherwise. */
        hostingId?: string | undefined;
    }>(),
    {},
);

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveHostingBridge() : props.bridge;

const effectiveHostingId = computed(() => props.hostingId ?? props.renderId);

const port = ref(8100);
const bindMode = ref<RemoteHostingBindMode>("loopback");

const record = ref<RemoteHostingRecord | null>(null);
const busy = ref(false);
const refreshing = ref(false);
const stopping = ref(false);
const errorMessage = ref<string | null>(null);

const isHosted = computed(() => record.value !== null);

const canPublish = computed(
    () =>
        bridge !== null &&
        props.target !== null &&
        props.maps.length > 0 &&
        Number.isInteger(port.value) &&
        port.value > 0 &&
        port.value <= 65_535 &&
        !busy.value,
);

async function loadRecord(): Promise<void> {
    if (bridge === null) return;
    record.value = await bridge.remoteHostingRecord(effectiveHostingId.value);
    if (record.value !== null) {
        port.value = record.value.publish.hostPort;
        bindMode.value = record.value.publish.bindMode;
    }
}

async function publish(): Promise<void> {
    if (bridge === null || props.target === null || busy.value) return;
    busy.value = true;
    errorMessage.value = null;
    try {
        const result = await bridge.startRemoteHosting({
            target: props.target,
            hostingId: effectiveHostingId.value,
            renderId: props.renderId,
            maps: props.maps,
            publish: { hostPort: port.value, bindMode: bindMode.value },
        });
        if (result.ok) {
            record.value = result.record;
        } else {
            errorMessage.value = result.failure.message;
        }
    } catch (error) {
        errorMessage.value = t(
            "remote.targets.bridgeFailed",
            { message: error instanceof Error ? error.message : String(error) },
            "The application could not check that machine: {message}",
        );
    } finally {
        busy.value = false;
    }
}

async function refresh(): Promise<void> {
    if (bridge === null || refreshing.value) return;
    refreshing.value = true;
    try {
        record.value = await bridge.refreshRemoteHosting(effectiveHostingId.value);
    } finally {
        refreshing.value = false;
    }
}

/**
 * Tears the container down and, unless the target keeps its files, removes the remote
 * copy of the world too - named `removeHosting` rather than `stop` so this destructive
 * call site is one `superConfirmPolicy.test.ts`'s own net actually catches, the same way
 * `PagesScreen.vue`'s `removeHosting` is. Only ever reached from `ConfigSuperConfirm`'s
 * `@confirm`, never from the button that opens it.
 */
async function removeHosting(): Promise<void> {
    if (bridge === null || stopping.value) return;
    stopping.value = true;
    errorMessage.value = null;
    try {
        const result = await bridge.stopRemoteHosting(effectiveHostingId.value);
        if (result.ok) {
            record.value = null;
        } else {
            errorMessage.value = result.failure.message;
        }
    } finally {
        stopping.value = false;
    }
}

let stopWatching: (() => void) | null = null;

onMounted(() => {
    void loadRecord();
    if (bridge !== null) {
        stopWatching = bridge.onRemoteHostingEvent((event) => {
            if (event.hostingId !== effectiveHostingId.value) return;
            if (event.type === "finished") record.value = event.record;
        });
    }
});

onBeforeUnmount(() => stopWatching?.());

watch(
    () => props.renderId,
    () => void loadRecord(),
);

defineExpose({ record, publish, refresh, removeHosting, canPublish, port, bindMode });
</script>

<template>
    <v-card variant="tonal" class="mb-hosting-panel" :aria-label="t('hosting.title', 'Host this map on your own server')">
        <v-card-title class="mb-hosting-panel__title">
            {{ t("hosting.title", "Host this map on your own server") }}
        </v-card-title>
        <v-card-text>
            <v-alert v-if="bridge === null" type="info" density="compact" variant="tonal">
                {{
                    t(
                        "remote.unsupported",
                        "This build cannot hand a render to another machine. The desktop application is what runs ssh, checks the host key and copies the world; a browser tab can do none of those.",
                    )
                }}
            </v-alert>

            <template v-else>
                <div class="mb-hosting-panel__grid">
                    <v-text-field
                        :model-value="port"
                        :label="t('remote.targets.field.port', 'Port')"
                        type="number"
                        min="1"
                        max="65535"
                        variant="outlined"
                        density="compact"
                        :disabled="busy"
                        hide-details="auto"
                        @update:model-value="(value: string) => (port = Number(value))"
                    />
                    <v-radio-group
                        v-model="bindMode"
                        :label="t('remote.disclosure.title', { target: 'that server' }, 'What a render on {target} sends')"
                        hide-details="auto"
                        :disabled="busy"
                    >
                        <v-radio :value="'loopback'" :label="t('hosting.bind.loopback', 'Only this server (SSH tunnel needed)')" />
                        <v-radio :value="'public'" :label="t('hosting.bind.public', 'The whole internet')" />
                    </v-radio-group>
                </div>

                <v-alert
                    v-if="bindMode === 'public'"
                    type="warning"
                    density="compact"
                    variant="tonal"
                    class="mb-hosting-panel__alert"
                    role="alert"
                >
                    {{
                        t(
                            "hosting.bind.publicWarning",
                            "Publishing to every interface puts this map on the real internet at that address, over plain HTTP. This application has no TLS anywhere in this server; putting a certificate in front of it is your own responsibility.",
                        )
                    }}
                </v-alert>

                <div class="mb-hosting-panel__actions">
                    <v-btn
                        :prepend-icon="mdiCloudUploadOutline"
                        :disabled="!canPublish"
                        :loading="busy"
                        variant="flat"
                        color="primary"
                        size="small"
                        @click="publish"
                    >
                        {{ isHosted ? t("hosting.update", "Republish") : t("hosting.start", "Publish") }}
                    </v-btn>

                    <v-btn
                        v-if="isHosted"
                        :prepend-icon="mdiRefresh"
                        :loading="refreshing"
                        variant="text"
                        size="small"
                        @click="refresh"
                    >
                        {{ t("hosting.refresh", "Check now") }}
                    </v-btn>

                    <ConfigSuperConfirm
                        v-if="isHosted"
                        :title="t('hosting.stop.confirmTitle', 'Confirm stopping this hosted map')"
                        :action="
                            t(
                                'hosting.stop.confirmBody',
                                'This stops the container on that server and, unless the target keeps its files, removes the uploaded world and its tiles too. Publishing again uploads everything again; it does not resume.',
                            )
                        "
                        :confirm-label="t('hosting.stop', 'Stop hosting')"
                        :disabled="stopping"
                        @confirm="removeHosting"
                    >
                        <template #activator="{ props: activatorProps }">
                            <v-btn
                                v-bind="activatorProps"
                                :prepend-icon="mdiStopCircleOutline"
                                variant="tonal"
                                size="small"
                                :loading="stopping"
                            >
                                {{ t("hosting.stop", "Stop hosting") }}
                            </v-btn>
                        </template>
                    </ConfigSuperConfirm>
                </div>

                <v-alert
                    v-if="errorMessage"
                    type="error"
                    density="compact"
                    variant="tonal"
                    class="mb-hosting-panel__alert"
                    role="alert"
                >
                    {{ errorMessage }}
                </v-alert>

                <div v-if="record" class="mb-hosting-panel__status" role="status">
                    <v-chip
                        :color="record.verified ? 'success' : 'warning'"
                        size="small"
                        variant="tonal"
                        class="mb-hosting-panel__chip"
                    >
                        <template v-if="record.verified">
                            <span class="mb-hosting-panel__chipIcon" aria-hidden="true">
                                <svg viewBox="0 0 24 24" width="16" height="16">
                                    <path :d="mdiCheckCircleOutline" fill="currentColor" />
                                </svg>
                            </span>
                            {{ t("hosting.verified", "Verified, and answering") }}
                        </template>
                        <template v-else>{{ t("hosting.unverified", "Not verified yet") }}</template>
                    </v-chip>

                    <p v-if="record.url" class="mb-hosting-panel__url">
                        <a :href="record.url" target="_blank" rel="noopener noreferrer">{{ record.url }}</a>
                    </p>

                    <ul v-if="record.notes.length > 0" class="mb-hosting-panel__notes">
                        <li v-for="note in record.notes" :key="note">{{ note }}</li>
                    </ul>
                </div>
            </template>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-hosting-panel {
    margin-block-end: 12px;
    border-radius: 16px;
}

.mb-hosting-panel__title {
    font-size: 1rem;
    padding: 10px 14px 0;
}

.mb-hosting-panel__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px 16px;
    margin-block-end: 8px;
}

.mb-hosting-panel__alert {
    margin-block-start: 8px;
}

.mb-hosting-panel__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 8px;
}

.mb-hosting-panel__status {
    margin-block-start: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.mb-hosting-panel__chip {
    align-self: flex-start;
}

.mb-hosting-panel__chipIcon {
    display: inline-flex;
    margin-inline-end: 4px;
}

.mb-hosting-panel__url {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}

.mb-hosting-panel__notes {
    margin: 0 0 0 1.2em;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
