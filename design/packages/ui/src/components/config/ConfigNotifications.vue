<script setup lang="ts">
import { onBeforeUnmount, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiBellOutline, mdiClose } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VList, VListItem, VMenu } from "vuetify/components";
import { dismiss, dismissAll, type Notice, type NoticeState } from "./notifications.js";

/**
 * The notification corner.
 *
 * Toasts stack in the bottom-right, never cover the control that raised them,
 * and never block. Informational and success notices dismiss themselves;
 * warnings and errors stay until dismissed, so a failure cannot scroll past
 * unread. Everything that was raised stays reachable in the history, because a
 * message that vanished and cannot be found again is a message that may as well
 * not have been shown.
 */
const props = defineProps<{ state: NoticeState }>();

const { t } = useI18n();

const timers = new Map<number, ReturnType<typeof setTimeout>>();

function arm(notice: Notice): void {
    if (notice.timeout === null || timers.has(notice.id)) return;
    timers.set(
        notice.id,
        setTimeout(() => {
            timers.delete(notice.id);
            dismiss(props.state, notice.id);
        }, notice.timeout),
    );
}

watch(
    () => props.state.live.map((notice) => notice.id).join(","),
    () => {
        for (const notice of props.state.live) arm(notice);
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
});

function close(id: number): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(id);
    }
    dismiss(props.state, id);
}
</script>

<template>
    <div class="mb-config-notices" role="region" :aria-label="t('config.notices.region', 'Notifications')">
        <div class="mb-config-notices__stack" aria-live="polite">
            <v-alert
                v-for="notice in state.live"
                :key="notice.id"
                :type="notice.level"
                variant="tonal"
                density="compact"
                class="mb-config-notices__toast"
                :role="notice.level === 'error' || notice.level === 'warning' ? 'alert' : 'status'"
            >
                <div class="mb-config-notices__body">
                    <div>
                        <p>{{ notice.message }}</p>
                        <details v-if="notice.detail">
                            <summary>{{ t("config.notices.detail", "Details") }}</summary>
                            <pre class="mb-config-notices__detail">{{ notice.detail }}</pre>
                        </details>
                    </div>
                    <v-btn
                        :icon="mdiClose"
                        :aria-label="t('config.notices.dismiss', 'Dismiss this notification')"
                        variant="text"
                        size="x-small"
                        density="comfortable"
                        @click="close(notice.id)"
                    />
                </div>
            </v-alert>
        </div>

        <div class="mb-config-notices__tools">
            <v-btn
                v-if="state.live.length > 1"
                variant="text"
                size="x-small"
                density="comfortable"
                @click="dismissAll(state)"
            >
                {{ t("config.notices.dismissAll", "Dismiss all") }}
            </v-btn>

            <v-btn
                :prepend-icon="mdiBellOutline"
                :aria-label="t('config.notices.history', 'Notification history')"
                variant="tonal"
                size="small"
                density="comfortable"
            >
                {{ state.history.length }}
                <v-menu activator="parent" location="top end" :close-on-content-click="false">
                    <v-card max-width="420" class="mb-config-notices__history">
                        <v-card-text>
                            <p v-if="state.history.length === 0">
                                {{ t("config.notices.empty", "Nothing has been reported yet.") }}
                            </p>
                            <v-list v-else density="compact">
                                <v-list-item
                                    v-for="notice in state.history"
                                    :key="notice.id"
                                    :title="notice.message"
                                    :subtitle="`${notice.level} · ${notice.at}`"
                                />
                            </v-list>
                        </v-card-text>
                    </v-card>
                </v-menu>
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-config-notices {
    position: fixed;
    inset-block-end: 16px;
    inset-inline-end: 16px;
    z-index: 2400;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    pointer-events: none;
    max-width: min(420px, calc(100vw - 32px));
}

.mb-config-notices__stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-height: 60vh;
    overflow-y: auto;
    pointer-events: auto;
}

.mb-config-notices__toast {
    border-radius: 12px;
}

.mb-config-notices__body {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    font-size: 0.8125rem;
    line-height: 1.45;
}

.mb-config-notices__body > div {
    flex: 1 1 auto;
    min-width: 0;
}

.mb-config-notices__detail {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    white-space: pre-wrap;
    max-height: 10em;
    overflow: auto;
}

.mb-config-notices__tools {
    display: flex;
    align-items: center;
    gap: 8px;
    pointer-events: auto;
}

.mb-config-notices__history {
    max-height: 60vh;
    overflow-y: auto;
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-notices * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
