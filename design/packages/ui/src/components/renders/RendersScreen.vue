<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCheckboxMultipleMarkedOutline,
    mdiCloudSyncOutline,
    mdiConsoleLine,
    mdiDocker,
    mdiLaptop,
    mdiLoading,
    mdiSelectOff,
    mdiSync,
    mdiTrashCanOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VCheckbox,
    VDivider,
    VExpandTransition,
    VIcon,
    VProgressCircular,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { GATE_COMPLETION_HOLD_MS } from "../confirm/superConfirmGate.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import { createCiRenders } from "../cirender/ciRenders.js";
import type { CiRenderBridge } from "../cirender/ciRenderBridge.js";
import { resolveCiRenderBridge } from "../cirender/ciRenderBridge.js";
import RenderProgressDetail from "../progress/RenderProgressDetail.vue";
import { formatPercent } from "../progress/format.js";
import type { ContainerOffersBridge } from "../world/containerOffers.js";
import type { WorldBridge } from "../world/worldBridge.js";
import {
    createActiveRenders,
    searchTextOf,
    type ActiveRenderRow,
    type ConsoleTarget,
    type RenderRouteBucket,
} from "./activeRenders.js";

/**
 * Every render in progress, on every route, in one place - so navigating away from whatever
 * screen started a render never again means losing sight of it.
 *
 * `activeRenders.ts` does all of the actual work: finding what is running, watching it with
 * the exact same {@link RenderProgressDetail}-shaped facts the render console itself draws,
 * and reattaching a container this app found but has not picked back up yet. This component
 * is the list, the search, the bulk selection and the super-confirmation gate around it.
 */

/**
 * `undefined` (the default, when a caller does not pass the prop at all) means "probe the
 * Electron preload"; `null` means "there is deliberately none". The same two-value contract
 * `WorldScreen.vue`'s own `bridge`/`optionalBridge`/`remoteBridge` props use, and for the
 * same reason it goes undefaulted here: giving these a default of `undefined` is what
 * `exactOptionalPropertyTypes` refuses, because it can no longer tell "the caller omitted
 * this prop" from "the caller passed `undefined` on purpose".
 */
const props = defineProps<{
    worldBridge?: WorldBridge | null;
    containerOffersBridge?: ContainerOffersBridge | null;
    ciRenderBridge?: CiRenderBridge | null;
}>();

const emit = defineEmits<{
    /** Take the person to the render's full console and controls, at whichever page owns it. */
    openConsole: [target: ConsoleTarget];
}>();

const { t } = useI18n();

const ciBridge =
    props.ciRenderBridge === undefined ? resolveCiRenderBridge() : props.ciRenderBridge;
const ciRenders = createCiRenders(ciBridge);
const aggregator = createActiveRenders({
    // `props.worldBridge === undefined` means "probe the preload"; `createActiveRenders`
    // itself does that probing when its own option is left out entirely rather than passed
    // as `undefined`, so an explicit `undefined` here would short-circuit the probe. See the
    // props' own doc comment for the same two-value contract on the way in.
    ...(props.worldBridge === undefined ? {} : { worldBridge: props.worldBridge }),
    ...(props.containerOffersBridge === undefined
        ? {}
        : { containerOffersBridge: props.containerOffersBridge }),
    ciRenders,
});

onMounted(() => {
    void aggregator.reconcile();
});

onBeforeUnmount(() => {
    aggregator.dispose();
    ciRenders.dispose();
});

/* -------------------------------------------------------------------------- */
/* Search, with the full regex builder anchored beside the field              */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const filteredRows = computed<readonly ActiveRenderRow[]>(() => {
    const test = matcher.value.test;
    return aggregator.rows.value.filter((row) => test(searchTextOf(row)));
});

const searchSample = computed(() =>
    aggregator.rows.value.map((row) => searchTextOf(row)).join("\n"),
);

/* -------------------------------------------------------------------------- */
/* Selection and bulk cancel, gated behind super confirmation                 */
/* -------------------------------------------------------------------------- */

const selected = ref<Set<string>>(new Set());
const expanded = ref<Set<string>>(new Set());

function toggleSelected(key: string): void {
    const next = new Set(selected.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selected.value = next;
}

function toggleExpanded(key: string): void {
    const next = new Set(expanded.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    expanded.value = next;
}

const visibleKeys = computed(() => filteredRows.value.map((row) => row.key));
const hasSelection = computed(() => selected.value.size > 0);

function selectAllVisible(): void {
    selected.value = new Set(visibleKeys.value);
}

function clearSelection(): void {
    selected.value = new Set();
}

/** Selected rows that are actually still cancellable, right now - the honest bulk count. */
const cancellableSelected = computed(() =>
    filteredRows.value.filter((row) => selected.value.has(row.key) && row.canCancel),
);

const cancelAffected = computed<string[]>(() =>
    cancellableSelected.value.slice(0, 10).map((row) => `${row.worldLabel} — ${row.projectLabel}`),
);

const cancelAction = computed(() =>
    t(
        "rendersInProgress.bulk.cancelExplain",
        { count: String(cancellableSelected.value.length) },
        "This stops {count} renders. Every tile each one already finished stays on disk; nothing is deleted, and a stopped render can be carried on later.",
    ),
);

let cancelTimer: ReturnType<typeof setTimeout> | null = null;
const bulkStatus = ref("");

onBeforeUnmount(() => {
    if (cancelTimer !== null) clearTimeout(cancelTimer);
});

function runBulkCancel(): void {
    if (cancelTimer !== null) clearTimeout(cancelTimer);
    const keys = cancellableSelected.value.map((row) => row.key);
    cancelTimer = setTimeout(() => {
        cancelTimer = null;
        void (async () => {
            let ok = 0;
            for (const key of keys) {
                if (await aggregator.cancel(key)) ok++;
            }
            bulkStatus.value = t(
                "rendersInProgress.bulk.cancelDone",
                { count: String(ok), of: String(keys.length) },
                "Stopped {count} of {of}.",
            );
            clearSelection();
        })();
    }, GATE_COMPLETION_HOLD_MS);
}

/* -------------------------------------------------------------------------- */
/* Per-row actions                                                            */
/* -------------------------------------------------------------------------- */

const rowBusy = ref<Set<string>>(new Set());

function withBusy(key: string, work: () => Promise<void>): void {
    const next = new Set(rowBusy.value);
    next.add(key);
    rowBusy.value = next;
    void work().finally(() => {
        const after = new Set(rowBusy.value);
        after.delete(key);
        rowBusy.value = after;
    });
}

function cancelOne(key: string): void {
    withBusy(key, async () => {
        await aggregator.cancel(key);
    });
}

function reattachOne(key: string): void {
    withBusy(key, async () => {
        await aggregator.reattach(key);
    });
}

function openConsole(key: string): void {
    const target = aggregator.consoleTargetFor(key);
    if (target !== null) emit("openConsole", target);
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

function routeIcon(route: RenderRouteBucket): string {
    switch (route) {
        case "local":
            return mdiLaptop;
        case "docker":
            return mdiDocker;
        case "ci":
            return mdiCloudSyncOutline;
    }
}

function routeLabel(route: RenderRouteBucket): string {
    switch (route) {
        case "local":
            return t("rendersInProgress.route.local", "Local process");
        case "docker":
            return t("rendersInProgress.route.docker", "Container (Docker)");
        case "ci":
            return t("rendersInProgress.route.ci", "GitHub's runners");
    }
}

function stateLabel(row: ActiveRenderRow): string {
    switch (row.state) {
        case "starting":
            return t("rendersInProgress.state.starting", "Starting");
        case "running":
            return t("rendersInProgress.state.running", "Running");
        case "finished":
            return t("rendersInProgress.state.finished", "Finished");
        case "failed":
            return t("rendersInProgress.state.failed", "Failed");
        case "cancelled":
            return t("rendersInProgress.state.cancelled", "Stopped");
        case "offer":
            return t("rendersInProgress.state.offer", "Found, not attached");
    }
}

function stateTone(row: ActiveRenderRow): string {
    switch (row.state) {
        case "failed":
            return "error";
        case "cancelled":
            return "warning";
        case "offer":
            return "warning";
        case "finished":
            return "success";
        default:
            return "info";
    }
}

function percentLabel(row: ActiveRenderRow): string {
    return row.percent === null ? "" : formatPercent(row.percent);
}
</script>

<template>
    <div class="mb-renders">
        <header class="mb-renders__head">
            <h2 class="mb-renders__title">
                {{ t("rendersInProgress.title", "Renders in progress") }}
            </h2>
            <p class="mb-renders__blurb">
                {{
                    t(
                        "rendersInProgress.blurb",
                        "Every render this application knows about right now: on this computer, in a container, or on GitHub's runners - including one this app did not start this session.",
                    )
                }}
            </p>
        </header>

        <div class="mb-renders__search">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('rendersInProgress.search.label', 'Search renders')"
                :placeholder="
                    t('rendersInProgress.search.placeholder', 'World, project, route, or state')
                "
                :sample="searchSample"
                :summary="
                    t(
                        'rendersInProgress.search.summary',
                        {
                            shown: String(filteredRows.length),
                            total: String(aggregator.rows.value.length),
                        },
                        'Showing {shown} of {total}',
                    )
                "
            />
        </div>

        <div v-if="visibleKeys.length > 0" class="mb-renders__bulkbar">
            <v-btn
                :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                variant="text"
                size="small"
                @click="selectAllVisible"
            >
                {{
                    t(
                        "rendersInProgress.bulk.selectAll",
                        { count: String(visibleKeys.length) },
                        "Select all {count} shown",
                    )
                }}
            </v-btn>
            <v-btn
                v-if="hasSelection"
                :prepend-icon="mdiSelectOff"
                variant="text"
                size="small"
                @click="clearSelection"
            >
                {{ t("rendersInProgress.bulk.clear", "Clear selection") }}
            </v-btn>

            <p class="mb-renders__bulkstatus" role="status" aria-live="polite">
                {{
                    t(
                        "rendersInProgress.bulk.selected",
                        { count: String(selected.size) },
                        "{count} selected",
                    )
                }}
                <template v-if="bulkStatus">{{ bulkStatus }}</template>
            </p>

            <template v-if="hasSelection && cancellableSelected.length > 0">
                <ConfigSuperConfirm
                    :title="t('rendersInProgress.bulk.cancelTitle', 'Stop selected renders')"
                    :action="cancelAction"
                    :affected="cancelAffected"
                    :confirm-label="
                        t(
                            'rendersInProgress.bulk.cancelConfirmLabel',
                            'Slide to stop the selected renders',
                        )
                    "
                    @confirm="runBulkCancel"
                >
                    <template #activator="{ props: activator }">
                        <v-btn
                            v-bind="activator"
                            :prepend-icon="mdiTrashCanOutline"
                            color="error"
                            variant="tonal"
                            size="small"
                        >
                            {{
                                t(
                                    "rendersInProgress.bulk.cancelButton",
                                    { count: String(cancellableSelected.length) },
                                    "Stop {count} selected",
                                )
                            }}
                        </v-btn>
                    </template>
                </ConfigSuperConfirm>
            </template>
        </div>

        <!--
            Two honestly different empty states. "Still checking" is shown only until the
            first pass over all three routes has actually returned - never confused with the
            state that comes after, which means the check ran and genuinely found nothing.
        -->
        <div
            v-if="aggregator.emptyState.value === 'checking'"
            class="mb-renders__empty"
            data-test="empty-checking"
        >
            <v-progress-circular
                indeterminate
                size="20"
                width="2"
                color="primary"
                aria-hidden="true"
            />
            <p>
                {{
                    t(
                        "rendersInProgress.empty.checking",
                        "Checking every route for a render in progress...",
                    )
                }}
            </p>
        </div>
        <div
            v-else-if="aggregator.emptyState.value === 'empty'"
            class="mb-renders__empty"
            data-test="empty-none"
        >
            <p>
                {{
                    t(
                        "rendersInProgress.empty.none",
                        "Nothing is rendering right now, on this computer, in a container, or on GitHub's runners.",
                    )
                }}
            </p>
        </div>
        <div
            v-else-if="filteredRows.length === 0"
            class="mb-renders__empty"
            data-test="empty-no-match"
        >
            <p>
                {{ t("rendersInProgress.empty.noMatch", "Nothing running matches this search.") }}
            </p>
        </div>

        <ul v-else class="mb-renders__list">
            <li v-for="row in filteredRows" :key="row.key" class="mb-renders__item">
                <AppearanceTarget
                    :id="`renders.row.${row.key}`"
                    :label="`${row.worldLabel} — ${row.projectLabel}`"
                    as="div"
                >
                    <v-card class="mb-renders__card" :class="`mb-renders__card--${row.state}`">
                        <v-card-text class="mb-renders__row">
                            <v-checkbox
                                :model-value="selected.has(row.key)"
                                density="compact"
                                hide-details
                                :aria-label="
                                    t(
                                        'rendersInProgress.row.select',
                                        { world: row.worldLabel },
                                        'Select the render of {world}',
                                    )
                                "
                                @update:model-value="toggleSelected(row.key)"
                            />

                            <v-icon :icon="routeIcon(row.route)" size="20" aria-hidden="true" />

                            <div class="mb-renders__identity">
                                <button
                                    type="button"
                                    class="mb-renders__disclosure"
                                    :aria-expanded="expanded.has(row.key)"
                                    @click="toggleExpanded(row.key)"
                                >
                                    <strong>{{ row.worldLabel }}</strong>
                                    <span class="mb-renders__project">
                                        — {{ row.projectLabel }}</span
                                    >
                                </button>
                                <span class="mb-renders__meta">
                                    {{ routeLabel(row.route) }}
                                    <template v-if="row.routeDetail"
                                        >· {{ row.routeDetail }}</template
                                    >
                                </span>
                            </div>

                            <v-chip size="small" :color="stateTone(row)" variant="tonal">
                                {{ stateLabel(row) }}
                                <template v-if="percentLabel(row) !== ''">
                                    · {{ percentLabel(row) }}</template
                                >
                            </v-chip>

                            <v-icon
                                v-if="rowBusy.has(row.key)"
                                :icon="mdiLoading"
                                class="mb-renders__spin"
                                size="18"
                                aria-hidden="true"
                            />

                            <div class="mb-renders__actions">
                                <v-btn
                                    v-if="row.needsReattach"
                                    :prepend-icon="mdiSync"
                                    size="small"
                                    variant="tonal"
                                    color="primary"
                                    :disabled="row.busy || rowBusy.has(row.key)"
                                    @click="reattachOne(row.key)"
                                >
                                    {{ t("rendersInProgress.row.reattach", "Reattach") }}
                                </v-btn>
                                <v-btn
                                    v-if="row.canOpenConsole"
                                    :prepend-icon="mdiConsoleLine"
                                    size="small"
                                    variant="text"
                                    @click="openConsole(row.key)"
                                >
                                    {{ t("rendersInProgress.row.openConsole", "Open console") }}
                                </v-btn>
                                <v-btn
                                    v-if="row.canCancel"
                                    :prepend-icon="mdiTrashCanOutline"
                                    size="small"
                                    variant="text"
                                    color="error"
                                    :disabled="row.busy || rowBusy.has(row.key)"
                                    @click="cancelOne(row.key)"
                                >
                                    {{ t("rendersInProgress.row.cancel", "Stop") }}
                                </v-btn>
                            </div>
                        </v-card-text>

                        <v-alert
                            v-if="row.errorText !== null"
                            type="error"
                            variant="tonal"
                            density="compact"
                            class="mb-renders__error"
                            :icon="mdiAlertCircleOutline"
                        >
                            {{ row.errorText }}
                        </v-alert>
                        <v-alert
                            v-else-if="row.needsReattach && row.reattachMessage !== null"
                            type="warning"
                            variant="tonal"
                            density="compact"
                            class="mb-renders__error"
                        >
                            {{ row.reattachMessage }}
                        </v-alert>

                        <v-expand-transition>
                            <div v-if="expanded.has(row.key)" class="mb-renders__detail">
                                <v-divider />
                                <RenderProgressDetail :facts="row.facts" />
                            </div>
                        </v-expand-transition>
                    </v-card>
                </AppearanceTarget>
            </li>
        </ul>
    </div>
</template>

<style>
.mb-renders {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    max-width: 100%;
}

.mb-renders__head {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-renders__title {
    font-size: 1.25rem;
    font-weight: 500;
}

.mb-renders__blurb {
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    max-width: 60ch;
}

.mb-renders__search {
    max-width: 480px;
}

.mb-renders__bulkbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mb-renders__bulkstatus {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin-inline-start: 4px;
}

.mb-renders__empty {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 8px;
    font-size: 0.875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-renders__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-renders__card {
    overflow: hidden;
}

.mb-renders__row {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.mb-renders__identity {
    display: flex;
    flex-direction: column;
    min-width: 0;
    flex: 1 1 12rem;
}

.mb-renders__disclosure {
    background: none;
    border: none;
    padding: 0;
    text-align: start;
    cursor: pointer;
    font: inherit;
    color: inherit;
    overflow-wrap: anywhere;
}

.mb-renders__project {
    font-weight: 400;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-renders__meta {
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-renders__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-inline-start: auto;
}

.mb-renders__spin {
    animation: mb-renders-spin 900ms linear infinite;
}

@keyframes mb-renders-spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-renders__spin {
        animation: none;
    }
}

.mb-renders__error {
    margin: 0 16px 12px;
}

.mb-renders__detail {
    padding: 0 16px 16px;
}
</style>
