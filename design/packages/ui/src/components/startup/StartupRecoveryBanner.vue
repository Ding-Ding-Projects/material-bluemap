<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy, mdiDownloadOutline, mdiRestart } from "@mdi/js";
import { VAlert, VBtn } from "vuetify/components";
import { raiseNotice } from "../../stores/notices.js";

interface StartupIssue {
    readonly id: string;
    readonly category: string;
    readonly phase: string;
    readonly title: string;
    readonly message: string;
    readonly detail: string | null;
    readonly occurredAt: string;
    readonly recoverable: boolean;
    readonly securityBoundary: boolean;
}

interface StartupSnapshot {
    readonly current: readonly StartupIssue[];
    readonly storageWarning: string | null;
}

interface StartupBridge {
    read(): Promise<StartupSnapshot>;
    copy(): Promise<{ ok: boolean; message: string }>;
    export(format: "json" | "markdown"): Promise<{ ok: boolean; message: string }>;
    retry(): Promise<{ ok: boolean; message: string }>;
}

const props = defineProps<{ bridge?: StartupBridge | null }>();
const { t } = useI18n();
const issues = ref<readonly StartupIssue[]>([]);
const storageWarning = ref<string | null>(null);
const status = ref("");
const busy = ref(false);

function resolveBridge(): StartupBridge | null {
    if (props.bridge !== undefined) return props.bridge;
    const candidate = (globalThis as { worldlens?: { startup?: StartupBridge } }).worldlens
        ?.startup;
    return candidate ?? null;
}

const hasSecurityBoundary = computed(() => issues.value.some((issue) => issue.securityBoundary));

async function run(
    action: (bridge: StartupBridge) => Promise<{ ok: boolean; message: string }>,
): Promise<void> {
    if (busy.value) return;
    const bridge = resolveBridge();
    if (bridge === null) return;
    busy.value = true;
    try {
        const answer = await action(bridge);
        status.value = answer.message;
        raiseNotice(answer.ok ? "success" : "warning", answer.message);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        status.value = message;
        raiseNotice("error", t("startup.actionFailed", "The recovery action failed."), message);
    } finally {
        busy.value = false;
    }
}

onMounted(async () => {
    const bridge = resolveBridge();
    if (bridge === null) return;
    try {
        const snapshot = await bridge.read();
        issues.value = snapshot.current;
        storageWarning.value = snapshot.storageWarning;
        for (const issue of snapshot.current) {
            raiseNotice("error", issue.message, {
                title: issue.title,
                category: `startup:${issue.id}`,
                ...(issue.detail === null ? {} : { detail: issue.detail }),
            });
        }
        if (snapshot.storageWarning !== null) {
            raiseNotice("warning", snapshot.storageWarning, { category: "startup:storage" });
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        raiseNotice(
            "error",
            t("startup.readFailed", "Startup diagnostics could not be read."),
            message,
        );
    }
});
</script>

<template>
    <VAlert
        v-if="issues.length > 0 || storageWarning !== null"
        class="mb-startup-recovery"
        type="error"
        variant="tonal"
        border="start"
        role="alert"
    >
        <template #title>
            {{ t("startup.openedAnyway", "Worldlens opened, but part of startup failed") }}
            <span class="mb-startup-recovery__secondary">Worldlens 照開咗，不過部分啟動失敗</span>
        </template>
        <p>
            {{
                hasSecurityBoundary
                    ? t(
                          "startup.boundary",
                          "The affected path stayed disabled to protect data or security. Nothing was bypassed.",
                      )
                    : t(
                          "startup.partial",
                          "The affected feature stayed disabled. Everything else remains available.",
                      )
            }}
        </p>
        <p class="mb-startup-recovery__secondary">
            出事嗰條路已停用，資料同安全紅線冇被夾硬跨過；其他可用部分照常開工。
        </p>

        <details class="mb-startup-recovery__details">
            <summary>
                {{
                    t(
                        "startup.details",
                        { count: String(issues.length) },
                        "Inspect {count} startup issues",
                    )
                }}
                / 睇清楚 {{ issues.length }} 個啟動問題
            </summary>
            <article v-for="issue in issues" :key="issue.id" class="mb-startup-recovery__issue">
                <strong>{{ issue.title }}</strong>
                <span>{{ issue.category }} · {{ issue.phase }} · {{ issue.occurredAt }}</span>
                <p>{{ issue.message }}</p>
                <pre v-if="issue.detail">{{ issue.detail }}</pre>
            </article>
            <p v-if="storageWarning">{{ storageWarning }}</p>
        </details>

        <div class="mb-startup-recovery__actions">
            <VBtn
                data-test="startup-copy"
                variant="tonal"
                :prepend-icon="mdiContentCopy"
                :disabled="busy"
                @click="run((bridge) => bridge.copy())"
            >
                {{ t("startup.copy", "Copy details") }} / 複製詳情
            </VBtn>
            <VBtn
                data-test="startup-export-json"
                variant="tonal"
                :prepend-icon="mdiDownloadOutline"
                :disabled="busy"
                @click="run((bridge) => bridge.export('json'))"
            >
                {{ t("startup.exportJson", "Export JSON") }}
            </VBtn>
            <VBtn
                data-test="startup-export-markdown"
                variant="tonal"
                :prepend-icon="mdiDownloadOutline"
                :disabled="busy"
                @click="run((bridge) => bridge.export('markdown'))"
            >
                {{ t("startup.exportMarkdown", "Export Markdown") }}
            </VBtn>
            <VBtn
                data-test="startup-retry"
                color="primary"
                :prepend-icon="mdiRestart"
                :loading="busy"
                @click="run((bridge) => bridge.retry())"
            >
                {{ t("startup.restart", "Restart and retry") }} / 重開再試
            </VBtn>
        </div>
        <p class="mb-startup-recovery__status" role="status" aria-live="polite">{{ status }}</p>
    </VAlert>
</template>

<style scoped>
.mb-startup-recovery {
    z-index: 12;
    margin: 8px 12px 0;
    max-block-size: min(46vh, 520px);
    overflow: auto;
    flex: 0 0 auto;
}

.mb-startup-recovery__secondary {
    display: block;
    font-size: 0.86em;
    font-weight: 500;
}

.mb-startup-recovery__details {
    margin-block: 12px;
}

.mb-startup-recovery__details > summary {
    cursor: pointer;
    min-block-size: 44px;
    display: flex;
    align-items: center;
    font-weight: 650;
}

.mb-startup-recovery__issue {
    margin-block: 8px;
    padding: 12px;
    border: 1px solid currentColor;
    border-radius: 12px;
    overflow-wrap: anywhere;
}

.mb-startup-recovery__issue > span {
    display: block;
    font-size: 0.78rem;
    opacity: 0.8;
}

.mb-startup-recovery__issue pre {
    max-block-size: 180px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
}

.mb-startup-recovery__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
}

.mb-startup-recovery__actions :deep(.v-btn) {
    min-block-size: 44px;
    block-size: auto;
    white-space: normal;
}

.mb-startup-recovery__status {
    min-block-size: 1.5em;
    margin-block: 8px 0;
}
</style>
