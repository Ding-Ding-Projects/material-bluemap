<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiContentCopy,
    mdiEye,
    mdiInformationOutline,
    mdiLan,
    mdiOpenInNew,
    mdiPlay,
    mdiStop,
} from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VCardTitle, VCheckbox, VChip, VIcon, VSelect, VTextField } from "vuetify/components";
import { raiseNotice } from "../../stores/notices.js";
import { createPreviewHost } from "./previewHost.js";
import { resolvePreviewBridge } from "./previewBridge.js";
import type { PreviewBridge, PreviewEvent } from "./previewBridge.js";

/**
 * Watching a render live, in a real browser tab, while it is still running.
 *
 * `main/preview/server.ts` serves the render's own output folder directly off this
 * computer's disk - no second engine, nothing waiting for the render to finish - so opening
 * the address here shows exactly the tiles that exist right now, sparse and all, updating
 * as more land. `preview.tileCache.note` below is not a footnote: the browser tab this
 * opens keeps every tile it has already fetched in memory for the life of the page, so a
 * spot already looked at needs an actual reload to show anything new - a silently stale
 * "live" view would be worse than none at all, so that caveat stays on screen the whole
 * time this panel is open, not just the first time.
 *
 * Loopback only, by default, always. The network-exposure checkbox is unticked on every
 * open regardless of what was saved last time - `previewHost.ts`'s `allowNetwork` merely
 * *starts* at the persisted default, per `main/preview/networkExposure.ts`'s own doc
 * comment - and the full consequence sentence sits directly beside it, at every funny
 * level, every time.
 */
const props = withDefaults(
    defineProps<{
        /** Injected in tests. `undefined` probes the real bridge; `null` forces "unsupported". */
        bridge?: PreviewBridge | null | undefined;
    }>(),
    {},
);

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolvePreviewBridge() : props.bridge;
const host = createPreviewHost({ bridge });
onBeforeUnmount(() => host.dispose());

onMounted(() => {
    void host.loadRenders();
});

const networkExplainOpen = ref(false);

const disabledReason = computed<string | null>(() => {
    if (host.status.value.running) return null;
    if (host.selectedRenderId.value === "") return t("preview.noRenders", "No renders on this computer yet.");
    if (host.checkingAvailability.value) return t("preview.checkingAvailability", "Checking...");
    const availability = host.availability.value;
    if (availability === null || availability.ok) return null;
    return availability.code === "on-github-runners"
        ? t(
              "preview.disabled.onGithubRunners",
              "Running on GitHub's own servers, not this computer - nothing here to host yet.",
          )
        : t("preview.disabled.notFound", "No render was found with this render id.");
});

async function onStart(): Promise<void> {
    await host.start();
}

async function onStop(): Promise<void> {
    await host.stop();
}

async function onCopy(): Promise<void> {
    const url = host.status.value.url;
    if (url === null) return;
    try {
        const clipboardBridge = typeof window === "undefined" ? undefined : window.materialBluemap;
        if (clipboardBridge) await clipboardBridge.writeClipboardText(url);
        else await navigator.clipboard.writeText(url);
        raiseNotice("success", t("preview.notice.copied", "The address was copied."));
    } catch {
        // A clipboard write can be refused by the platform; the address is still on
        // screen in the text field either way, so nothing here is otherwise unusable.
    }
}

async function onOpen(): Promise<void> {
    const opened = await host.openInBrowser();
    if (!opened) {
        raiseNotice(
            "warning",
            t(
                "preview.notice.openFailed",
                "Could not open a browser automatically. The address above still works - open it yourself.",
            ),
        );
    }
}

/** Raises the real, honest notice for whatever the main process just reported. */
function announce(event: PreviewEvent): void {
    if (event.type === "started") {
        raiseNotice(
            "success",
            t(
                "preview.notice.started",
                { url: event.url, host: event.host, port: event.port },
                "Now hosting at {url} ({host}:{port}).",
            ),
        );
    } else if (event.type === "stopped") {
        raiseNotice("info", t("preview.notice.stopped", "Stopped hosting. The address no longer answers."));
    } else {
        raiseNotice(
            "error",
            t("preview.notice.failed", { reason: event.reason }, "Could not start hosting: {reason}"),
        );
    }
}

watch(host.lastEvent, (event) => {
    if (event !== null) announce(event);
});

watch(host.startFailure, (reason) => {
    if (reason !== null) {
        raiseNotice("error", t("preview.notice.failed", { reason }, "Could not start hosting: {reason}"));
    }
});

const networkValueLabel = computed(() =>
    host.allowNetwork.value
        ? t("preview.network.on", "on")
        : t("preview.network.off", "off"),
);

const provenanceText = computed(() => {
    const readout = host.networkReadout.value;
    if (readout === null || readout.isDefault) {
        return t(
            "preview.network.provenance.usingDefault",
            "This is the application's own default: off (loopback only). You have not changed it.",
        );
    }
    return t(
        "preview.network.provenance.usingSaved",
        { value: networkValueLabel.value },
        "You saved this yourself: {value}.",
    );
});

const renderItems = computed(() =>
    host.renders.value.map((entry) => ({
        title: entry.running ? `${entry.label} (${t("preview.renderActive.yes", "Still rendering")})` : entry.label,
        value: entry.renderId,
    })),
);
</script>

<template>
    <v-card class="mb-preview" flat>
        <v-card-title class="mb-preview__title">
            <v-icon :icon="mdiEye" size="20" />
            {{ t("preview.title", "Watch it live") }}
        </v-card-title>
        <v-card-text class="mb-preview__body">
            <v-alert v-if="!host.available" type="warning" variant="tonal" density="comfortable">
                {{ t("preview.unsupported", "The desktop application is what hosts a render live.") }}
            </v-alert>

            <template v-else>
                <p class="mb-preview__explain">
                    {{
                        t(
                            "preview.explain",
                            "Serves the render's own folder on this computer, so it can be opened in a browser while it is still running.",
                        )
                    }}
                </p>
                <p class="mb-preview__caveat" role="note">
                    {{
                        t(
                            "preview.tileCache.note",
                            "The browser remembers a tile once it has been shown, so a spot already looked at will not update on its own until the page is reloaded.",
                        )
                    }}
                </p>

                <v-select
                    v-model="host.selectedRenderId.value"
                    :items="renderItems"
                    :label="t('preview.pickRender.label', 'Which render')"
                    :disabled="host.status.value.running"
                    density="comfortable"
                    variant="outlined"
                    hide-details="auto"
                    @update:model-value="(value: string) => host.selectRender(value)"
                />
                <p v-if="host.renders.value.length === 0" class="mb-preview__note">
                    {{ t("preview.noRenders", "No renders on this computer yet.") }}
                </p>

                <div class="mb-preview__network">
                    <v-checkbox
                        :model-value="host.allowNetwork.value"
                        :disabled="host.status.value.running"
                        density="comfortable"
                        hide-details="auto"
                        color="primary"
                        @update:model-value="(value: boolean | null) => host.setAllowNetwork(value === true)"
                    >
                        <template #label>
                            <span>{{ t("preview.network.label", "Also allow other devices on this network") }}</span>
                        </template>
                    </v-checkbox>
                    <v-btn
                        :icon="mdiInformationOutline"
                        size="small"
                        variant="text"
                        :aria-label="t('preview.network.label', 'Also allow other devices on this network')"
                        :aria-expanded="networkExplainOpen"
                        @click="networkExplainOpen = !networkExplainOpen"
                    />
                </div>
                <div v-if="networkExplainOpen" class="mb-preview__explainBox">
                    <p class="mb-preview__consequence">
                        <v-icon :icon="mdiLan" size="16" />
                        {{
                            t(
                                "preview.network.consequence",
                                "Also visible to every other device on this network, with no sign-in - anyone who can reach this computer can open the map.",
                            )
                        }}
                    </p>
                    <p class="mb-preview__provenance">{{ provenanceText }}</p>
                    <p class="mb-preview__bindAddress">
                        {{
                            host.allowNetwork.value
                                ? t("preview.bindAddress.network", "Every device on this network (0.0.0.0)")
                                : t("preview.bindAddress.loopback", "This computer only (127.0.0.1)")
                        }}
                    </p>
                </div>

                <div class="mb-preview__actions">
                    <v-btn
                        v-if="!host.status.value.running"
                        :prepend-icon="mdiPlay"
                        color="primary"
                        variant="tonal"
                        :disabled="!host.canStart.value"
                        :loading="host.starting.value"
                        @click="onStart"
                    >
                        {{ t("preview.start", "Start hosting") }}
                    </v-btn>
                    <v-btn
                        v-else
                        :prepend-icon="mdiStop"
                        color="error"
                        variant="tonal"
                        :loading="host.stopping.value"
                        @click="onStop"
                    >
                        {{ t("preview.stop", "Stop hosting") }}
                    </v-btn>
                    <span v-if="disabledReason !== null" class="mb-preview__disabledReason" role="status">
                        {{ disabledReason }}
                    </span>
                </div>

                <div v-if="host.status.value.running" class="mb-preview__running" role="status" aria-live="polite">
                    <v-chip :color="host.status.value.renderActive ? 'warning' : 'success'" size="small" variant="tonal">
                        {{ t("preview.status.running", "Live") }}
                        -
                        {{
                            host.status.value.renderActive
                                ? t("preview.renderActive.yes", "Still rendering")
                                : t("preview.renderActive.no", "Finished")
                        }}
                    </v-chip>

                    <v-text-field
                        :model-value="host.status.value.url"
                        :label="t('preview.urlLabel', 'Address')"
                        readonly
                        density="comfortable"
                        variant="outlined"
                        hide-details="auto"
                        class="mb-preview__urlField"
                    />
                    <v-btn :prepend-icon="mdiContentCopy" variant="tonal" @click="onCopy">
                        {{ t("preview.copyUrl", "Copy address") }}
                    </v-btn>
                    <v-btn
                        v-if="host.canOpenInBrowser"
                        :prepend-icon="mdiOpenInNew"
                        variant="tonal"
                        @click="onOpen"
                    >
                        {{ t("preview.openInBrowser", "Open in browser") }}
                    </v-btn>
                </div>

                <v-alert
                    v-if="host.startFailure.value !== null"
                    type="error"
                    variant="tonal"
                    density="comfortable"
                    role="alert"
                >
                    {{ t("preview.notice.failed", { reason: host.startFailure.value }, "Could not start hosting: {reason}") }}
                </v-alert>
                <v-alert
                    v-if="host.rendersFailure.value !== null"
                    type="error"
                    variant="tonal"
                    density="comfortable"
                    role="alert"
                >
                    {{ host.rendersFailure.value }}
                </v-alert>
            </template>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-preview__title {
    display: flex;
    align-items: center;
    gap: 8px;
}

.mb-preview__body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.mb-preview__explain,
.mb-preview__caveat,
.mb-preview__note {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}

.mb-preview__network {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-preview__explainBox {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
}

.mb-preview__consequence,
.mb-preview__provenance,
.mb-preview__bindAddress {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
}

.mb-preview__actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
}

.mb-preview__disabledReason {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-preview__running {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 12px;
}

.mb-preview__urlField {
    flex: 1 1 20rem;
    min-width: 12rem;
}
</style>
