<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { VAlert, VBtn, VProgressCircular } from "vuetify/components";
import { mdiRefresh } from "@mdi/js";
import HistoryRevisionRow from "./HistoryRevisionRow.vue";
import type { SimpleHistoryHost } from "./simpleHistoryHost.js";

/**
 * Browse and restore for a history that offers only that: the profile list's and the
 * application settings' own, per `main/profiles/ipc.ts` and `main/settings/ipc.ts`.
 *
 * `HistoryPanel.vue` is built for a config folder's full eight-method history - search, a
 * date range, an action filter, comparing two revisions, restoring one file or one setting,
 * discarding older revisions. None of that exists on the other side of {@link SimpleHistoryHost}
 * yet, and a panel that offered it here would be offering buttons that throw. This is the
 * plain list underneath all of that: every revision, newest first, each restorable with the
 * same "click, then confirm in place" gate `HistoryRevisionRow` already provides.
 *
 * A restore here is genuinely not destructive - the state it replaces is recorded as a new
 * revision before anything is overwritten, exactly as the config-folder history promises -
 * so it earns no blocking dialog, only the row's own in-place confirm.
 */
const props = defineProps<{
    /** What this history is of, e.g. "Server profiles". Shown as the section's own heading. */
    title: string;
    /**
     * Left out, the shell's bridge is probed for the given namespace; `null` says there is
     * deliberately none - a browser tab, or a test - and the surface says so rather than
     * pretending a control it cannot honour.
     */
    host: SimpleHistoryHost | null;
}>();

const { t } = useI18n();

type Revision = Awaited<ReturnType<SimpleHistoryHost["list"]>>["revisions"][number];

const loading = ref(true);
const available = ref(true);
const reason = ref<string | null>(null);
const repository = ref("");
const revisions = ref<readonly Revision[]>([]);
const expandedId = ref<string | null>(null);
const busy = ref(false);
const restoreMessage = ref<string | null>(null);
const restoreFailed = ref(false);

/**
 * Never fetched: this host offers no diff channel at all, so every row is told so rather
 * than left spinning on a comparison that will never arrive. `HistoryRevisionRow`'s
 * "reading what changed" spinner only shows while `diff` is null and no `diffError` is
 * given; supplying this unconditionally is what keeps that spinner from running forever.
 */
const diffUnavailable = () =>
    t(
        "history.simple.diffUnavailable",
        "This history does not keep a comparison between revisions, only the list of files each one touched.",
    );

async function load(): Promise<void> {
    if (props.host === null) {
        loading.value = false;
        available.value = false;
        reason.value = null;
        return;
    }
    loading.value = true;
    try {
        const listing = await props.host.list();
        available.value = listing.available;
        reason.value = listing.reason;
        repository.value = listing.repository;
        revisions.value = listing.revisions;
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void load();
});

function toggle(id: string): void {
    expandedId.value = expandedId.value === id ? null : id;
}

async function restore(id: string): Promise<void> {
    if (props.host === null || busy.value) return;
    busy.value = true;
    restoreMessage.value = null;
    restoreFailed.value = false;
    try {
        const result = await props.host.restore(id);
        restoreMessage.value = result.message;
        restoreFailed.value = !result.ok;
        if (result.ok) await load();
    } finally {
        busy.value = false;
    }
}

defineExpose({ reload: load });
</script>

<template>
    <section class="mb-simple-history" :aria-label="title">
        <div class="mb-simple-history__head">
            <h4 class="mb-simple-history__title">{{ title }}</h4>
            <v-btn
                :prepend-icon="mdiRefresh"
                :aria-label="t('history.simple.refresh', { title }, 'Read {title} history again')"
                variant="text"
                size="small"
                :disabled="loading || host === null"
                @click="load"
            >
                {{ t("history.simple.refreshShort", "Refresh") }}
            </v-btn>
        </div>

        <p v-if="host === null" class="mb-simple-history__note">
            {{
                t(
                    "history.noHost",
                    "This build has no version history, because it is running without the desktop shell that keeps one.",
                )
            }}
        </p>

        <div v-else-if="loading" class="mb-simple-history__loading" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("history.simple.loading", "Reading the history...") }}</span>
        </div>

        <p v-else-if="!available" class="mb-simple-history__note" role="status">
            {{ reason ?? t("history.simple.unavailable", "This history is not available right now.") }}
        </p>

        <template v-else>
            <p class="mb-simple-history__repository">{{ repository }}</p>

            <v-alert
                v-if="restoreMessage"
                :type="restoreFailed ? 'error' : 'success'"
                density="compact"
                variant="tonal"
                class="mb-simple-history__alert"
                role="status"
            >
                {{ restoreMessage }}
            </v-alert>

            <p v-if="revisions.length === 0" class="mb-simple-history__note">
                {{
                    t(
                        "history.simple.empty",
                        "No revisions recorded yet. One is kept every time this is saved.",
                    )
                }}
            </p>

            <ul v-else class="mb-simple-history__list">
                <HistoryRevisionRow
                    v-for="(revision, index) in revisions"
                    :key="revision.id"
                    :revision="revision"
                    :current="index === 0"
                    :active="index === 0"
                    :expanded="expandedId === revision.id"
                    :diff="null"
                    :diff-error="diffUnavailable()"
                    :busy="busy"
                    :writable="true"
                    :labellable="false"
                    :comparable="false"
                    :selective="false"
                    @toggle="toggle"
                    @restore="restore"
                />
            </ul>
        </template>
    </section>
</template>

<style>
.mb-simple-history {
    margin-block-end: 20px;
}

.mb-simple-history__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

.mb-simple-history__title {
    font-size: 0.9375rem;
    font-weight: 500;
    margin: 0;
}

.mb-simple-history__note,
.mb-simple-history__repository {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin: 4px 0 0;
}

.mb-simple-history__repository {
    font-family: "Roboto Mono", ui-monospace, monospace;
    word-break: break-all;
}

.mb-simple-history__loading {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-start: 8px;
    font-size: 0.8125rem;
}

.mb-simple-history__alert {
    margin-block-start: 8px;
}

.mb-simple-history__list {
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
    max-height: 360px;
    overflow-y: auto;
}
</style>
