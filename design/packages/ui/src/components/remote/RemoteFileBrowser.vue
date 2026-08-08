<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiArrowLeft,
    mdiArrowUp,
    mdiCubeOutline,
    mdiFileOutline,
    mdiFolderOutline,
    mdiLinkVariant,
    mdiRefresh,
} from "@mdi/js";
import { VAlert, VBtn, VIcon, VProgressCircular, VTextField, VTooltip } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import type { RemoteBridge, RemoteEntry, RemoteOs } from "./remoteBridge.js";
import {
    breadcrumbSegments,
    formatEntryModified,
    formatEntrySize,
    joinRemotePath,
    nextRowIndex,
    nextSort,
    normalizeTypedRemotePath,
    parentRemotePath,
    sortRemoteEntries,
    typeAheadIndex,
    worldBadgeFor,
    type SortColumn,
    type SortDirection,
    type WorldBadge,
} from "./remoteBrowse.js";

/**
 * A Windows-Explorer-style browser for a folder on the other end of an SSH connection.
 *
 * Everything a person expects from a real file browser rather than a text box: a clickable
 * breadcrumb, an Up action, double-click (and Enter) to enter a folder, single click to
 * select, sortable columns, type-ahead, Backspace/Alt+Left to go back, and a path field for
 * somebody who already knows where they are going - synchronised with the breadcrumb in
 * both directions. `remoteBrowse.ts` carries every rule this renders; this file is
 * arrangement over that.
 *
 * ## Paging, not virtualising
 *
 * The remote lists at most `DEFAULT_MAX_ENTRIES` (2,048) entries per folder and says so
 * plainly when a folder holds more - see the truncation banner below - rather than
 * rendering an unbounded DOM or streaming further pages on scroll. That cap is what keeps
 * both the SSH round trip and this list responsive; a `region` folder with forty thousand
 * files stays a two-line message here, never four hundred kilobytes of table rows.
 *
 * ## The world badge never claims more than it knows
 *
 * A folder is only badged "Minecraft world" when it has both `level.dat` and a region
 * folder. A folder with only one of the two gets a distinct, honestly-worded "maybe"
 * badge instead of silence or a false positive - see `worldBadgeFor` in `remoteBrowse.ts`.
 */
const props = defineProps<{
    bridge: RemoteBridge | null;
    /** The already-validated target to browse. Never a draft: `RemoteTargetEditor` checks first. */
    target: unknown;
    /** Where the browser opens. The caller decides; this component never guesses a root. */
    startPath: string;
}>();

const emit = defineEmits<{
    /** The person pressed "Use this folder". Always the folder currently open, not a selected row. */
    choose: [path: string];
    cancel: [];
}>();

const { t } = useI18n();

/* -------------------------------------------------------------------------- */
/* Listing state                                                              */
/* -------------------------------------------------------------------------- */

const currentPath = ref(props.startPath);
const pathInput = ref(props.startPath);
const os = ref<RemoteOs | null>(null);
const entries = ref<readonly RemoteEntry[]>([]);
const truncated = ref(false);
const totalEntries = ref(0);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const history = ref<string[]>([]);

async function load(path: string, options: { push?: boolean } = {}): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null || loading.value) return;
    loading.value = true;
    errorMessage.value = null;
    try {
        const outcome = await bridge.browseRemoteDirectory(props.target, path);
        if (!outcome.ok) {
            errorMessage.value = browseFailureMessage(outcome.code, outcome.message);
            return;
        }
        if (options.push !== false && currentPath.value !== "" && currentPath.value !== path) {
            history.value = [...history.value, currentPath.value];
        }
        currentPath.value = outcome.listing.path;
        pathInput.value = outcome.listing.path;
        os.value = outcome.listing.os;
        entries.value = outcome.listing.entries;
        truncated.value = outcome.listing.truncated;
        totalEntries.value = outcome.listing.totalEntries;
        activeIndex.value = 0;
    } catch (error) {
        errorMessage.value = t(
            "remote.browse.bridgeFailed",
            { message: error instanceof Error ? error.message : String(error) },
            "This folder could not be listed: {message}",
        );
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void load(props.startPath, { push: false });
});

/* -------------------------------------------------------------------------- */
/* Navigation                                                                 */
/* -------------------------------------------------------------------------- */

const breadcrumbs = computed(() => (os.value === null ? [] : breadcrumbSegments(currentPath.value, os.value)));
const canGoUp = computed(() => os.value !== null && parentRemotePath(currentPath.value, os.value) !== null);
const canGoBack = computed(() => history.value.length > 0);

function goUp(): void {
    if (os.value === null) return;
    const parent = parentRemotePath(currentPath.value, os.value);
    if (parent !== null) void load(parent);
}

function goBack(): void {
    const previous = history.value.at(-1);
    if (previous === undefined) return;
    history.value = history.value.slice(0, -1);
    void load(previous, { push: false });
}

function openBreadcrumb(path: string): void {
    if (path !== currentPath.value) void load(path);
}

function enter(entry: RemoteEntry): void {
    if (!entry.directory || os.value === null) return;
    void load(joinRemotePath(currentPath.value, entry.name, os.value));
}

function submitTypedPath(): void {
    if (os.value === null) return;
    const normalised = normalizeTypedRemotePath(pathInput.value, os.value);
    if (normalised === "" || normalised === currentPath.value) return;
    void load(normalised);
}

/**
 * Backspace and Alt+Left go back, everywhere in the panel except while somebody is actually
 * typing in the path field - Backspace there has to keep deleting a character.
 */
function onPanelKeydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
    if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
        return;
    }
    if (event.key === "Backspace" && !typing) {
        event.preventDefault();
        goBack();
    }
}

/* -------------------------------------------------------------------------- */
/* Search, sort                                                               */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");
const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const sort = ref<{ column: SortColumn; direction: SortDirection }>({ column: "name", direction: "ascending" });

function clickColumn(column: SortColumn): void {
    sort.value = nextSort(sort.value, column);
}

function ariaSortOf(column: SortColumn): "ascending" | "descending" | "none" {
    return sort.value.column === column ? sort.value.direction : "none";
}

const filtered = computed(() => entries.value.filter((entry) => matcher.value.test(entry.name)));
const shown = computed(() => sortRemoteEntries(filtered.value, sort.value.column, sort.value.direction));

const sample = computed(() => entries.value.map((entry) => entry.name).join("\n"));
const searchSummary = computed(() =>
    matcher.value.active
        ? t(
              "remote.browse.searchSummary",
              { shown: shown.value.length, total: entries.value.length },
              "Showing {shown} of {total}",
          )
        : "",
);

/* -------------------------------------------------------------------------- */
/* The grid: selection, keyboard, type-ahead                                  */
/* -------------------------------------------------------------------------- */

const activeIndex = ref(0);
const rowRefs = ref<HTMLElement[]>([]);
const activeAt = computed(() => Math.min(Math.max(activeIndex.value, 0), Math.max(shown.value.length - 1, 0)));

function setRowRef(element: unknown, index: number): void {
    if (element instanceof HTMLElement) rowRefs.value[index] = element;
}

async function focusRow(index: number): Promise<void> {
    activeIndex.value = index;
    await nextTick();
    rowRefs.value[index]?.focus();
}

function onGridKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter") {
        const row = shown.value[activeAt.value];
        if (row !== undefined) {
            event.preventDefault();
            enter(row);
        }
        return;
    }
    const next = nextRowIndex(event.key, activeAt.value, shown.value.length);
    if (next !== activeAt.value && next >= 0) {
        event.preventDefault();
        void focusRow(next);
        return;
    }
    // A single printable character that is not a shortcut already handled above is
    // type-ahead, exactly as Explorer's own list does.
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const jump = typeAheadIndex(shown.value, event.key, activeAt.value);
        if (jump !== activeAt.value) {
            event.preventDefault();
            void focusRow(jump);
        }
    }
}

watch(shown, () => {
    if (activeIndex.value >= shown.value.length) activeIndex.value = Math.max(shown.value.length - 1, 0);
});

/* -------------------------------------------------------------------------- */
/* The world badge, worded                                                    */
/* -------------------------------------------------------------------------- */

function badgeOf(entry: RemoteEntry): WorldBadge {
    return worldBadgeFor(entry);
}

/** Says plainly why a folder was marked - never a bare "yes", so a guess never reads as certainty. */
function badgeReason(badge: WorldBadge): string {
    if (badge.kind === "world") {
        return t(
            "remote.browse.world.reasonFull",
            { regions: badge.regionDimensions.join(", ") },
            "This folder has level.dat and a region folder ({regions}), so it looks like a Minecraft world.",
        );
    }
    if (badge.kind === "partial" && badge.hasLevelDat) {
        return t(
            "remote.browse.world.reasonLevelOnly",
            "This folder has level.dat but no region folder yet, so it is not confirmed as a Minecraft world - it may be a freshly created one.",
        );
    }
    if (badge.kind === "partial") {
        return t(
            "remote.browse.world.reasonRegionOnly",
            { regions: badge.regionDimensions.join(", ") },
            "This folder has a region folder ({regions}) but no level.dat, so it is not confirmed as a Minecraft world.",
        );
    }
    return "";
}

function badgeLabel(badge: WorldBadge): string {
    return badge.kind === "world"
        ? t("remote.browse.world.badge", "Minecraft world")
        : t("remote.browse.world.partialBadge", "Possibly a world");
}

function rowIcon(entry: RemoteEntry): string {
    if (entry.symlink) return mdiLinkVariant;
    if (badgeOf(entry).kind === "world") return mdiCubeOutline;
    return entry.directory ? mdiFolderOutline : mdiFileOutline;
}

/* -------------------------------------------------------------------------- */
/* Failure messages                                                           */
/* -------------------------------------------------------------------------- */

function browseFailureMessage(
    code: "not-found" | "not-a-directory" | "permission-denied" | "symlink-loop" | "unreachable" | "remote-failed",
    fallback: string,
): string {
    switch (code) {
        case "not-found":
            return t("remote.browse.error.notFound", { path: currentOrTyped() }, "There is nothing at {path}.");
        case "not-a-directory":
            return t("remote.browse.error.notDirectory", { path: currentOrTyped() }, "{path} is a file, not a folder.");
        case "permission-denied":
            return t(
                "remote.browse.error.denied",
                { path: currentOrTyped() },
                "{path} could not be read: this account is not allowed to open it.",
            );
        case "symlink-loop":
            return t(
                "remote.browse.error.loop",
                { path: currentOrTyped() },
                "{path} is a link that never resolves to a real folder.",
            );
        case "unreachable":
            return t("remote.browse.error.unreachable", "This remote could not be reached or signed in to.");
        default:
            return fallback;
    }
}

function currentOrTyped(): string {
    return pathInput.value.trim() === "" ? currentPath.value : pathInput.value.trim();
}

defineExpose({ load, currentPath, entries, shown, sort, activeIndex, goUp, goBack, enter, submitTypedPath });
</script>

<template>
    <div class="mb-remote-browse" tabindex="-1" @keydown="onPanelKeydown">
        <div class="mb-remote-browse__toolbar">
            <v-tooltip :text="t('remote.browse.backAria', 'Go back to the previous folder')" location="bottom">
                <template #activator="{ props: tip }">
                    <v-btn
                        v-bind="tip"
                        :icon="mdiArrowLeft"
                        :disabled="!canGoBack"
                        :aria-label="t('remote.browse.backAria', 'Go back to the previous folder')"
                        variant="text"
                        size="small"
                        @click="goBack"
                    />
                </template>
            </v-tooltip>
            <v-tooltip :text="t('remote.browse.upAria', 'Go up one level')" location="bottom">
                <template #activator="{ props: tip }">
                    <v-btn
                        v-bind="tip"
                        :icon="mdiArrowUp"
                        :disabled="!canGoUp"
                        :aria-label="t('remote.browse.upAria', 'Go up one level')"
                        variant="text"
                        size="small"
                        @click="goUp"
                    />
                </template>
            </v-tooltip>

            <nav class="mb-remote-browse__crumbs" :aria-label="t('remote.browse.breadcrumbAria', 'Current folder path')">
                <template v-for="(crumb, index) in breadcrumbs" :key="crumb.path">
                    <button
                        type="button"
                        class="mb-remote-browse__crumb"
                        :aria-current="index === breadcrumbs.length - 1 ? 'location' : undefined"
                        :disabled="index === breadcrumbs.length - 1"
                        @click="openBreadcrumb(crumb.path)"
                    >
                        {{ crumb.label }}
                    </button>
                    <span v-if="index < breadcrumbs.length - 1" class="mb-remote-browse__crumbSep" aria-hidden="true">›</span>
                </template>
            </nav>

            <v-btn
                :prepend-icon="mdiRefresh"
                :loading="loading"
                variant="text"
                size="small"
                @click="load(currentPath, { push: false })"
            >
                {{ t("remote.browse.refresh", "Refresh") }}
            </v-btn>
        </div>

        <v-text-field
            v-model="pathInput"
            :label="t('remote.browse.pathLabel', 'Path')"
            :hint="t('remote.browse.pathHint', 'Type a path directly, or navigate with the list below.')"
            persistent-hint
            variant="outlined"
            density="compact"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            class="mb-remote-browse__pathField"
            @keydown.enter="submitTypedPath"
        />

        <div v-if="entries.length > 0" class="mb-remote-browse__search">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('remote.browse.searchLabel', 'Search this folder')"
                :placeholder="t('remote.browse.searchHint', 'a name')"
                :sample="sample"
                :summary="searchSummary"
            />
        </div>

        <v-alert v-if="errorMessage" type="error" density="compact" variant="tonal" role="alert" class="mb-remote-browse__alert">
            {{ errorMessage }}
        </v-alert>

        <v-alert
            v-if="truncated"
            type="info"
            density="compact"
            variant="tonal"
            role="status"
            class="mb-remote-browse__alert"
        >
            {{
                t(
                    "remote.browse.truncated",
                    { shown: entries.length, total: totalEntries },
                    "Showing the first {shown} of {total} entries. Use the search above to narrow it down.",
                )
            }}
        </v-alert>

        <div v-if="loading && entries.length === 0" class="mb-remote-browse__status" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("remote.browse.loading", "Listing this folder...") }}</span>
        </div>

        <p v-else-if="!loading && !errorMessage && entries.length === 0" class="mb-remote-browse__empty" role="status">
            {{ t("remote.browse.empty", "This folder is empty.") }}
        </p>

        <p v-else-if="!loading && shown.length === 0 && entries.length > 0" class="mb-remote-browse__empty" role="status">
            {{ t("remote.browse.noMatch", "No entry matches that search.") }}
        </p>

        <div v-else-if="shown.length > 0" class="mb-remote-browse__gridWrap">
            <table role="grid" class="mb-remote-browse__grid" :aria-label="t('remote.browse.gridAria', 'Folder contents')" @keydown="onGridKeydown">
                <thead>
                    <tr role="row">
                        <th role="columnheader" :aria-sort="ariaSortOf('name')">
                            <button type="button" class="mb-remote-browse__sortBtn" @click="clickColumn('name')">
                                {{ t("remote.browse.column.name", "Name") }}
                            </button>
                        </th>
                        <th role="columnheader" :aria-sort="ariaSortOf('size')">
                            <button type="button" class="mb-remote-browse__sortBtn" @click="clickColumn('size')">
                                {{ t("remote.browse.column.size", "Size") }}
                            </button>
                        </th>
                        <th role="columnheader" :aria-sort="ariaSortOf('modified')">
                            <button type="button" class="mb-remote-browse__sortBtn" @click="clickColumn('modified')">
                                {{ t("remote.browse.column.modified", "Modified") }}
                            </button>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="(entry, index) in shown"
                        :key="entry.name"
                        :ref="(element) => setRowRef(element, index)"
                        role="row"
                        :tabindex="index === activeAt ? 0 : -1"
                        :aria-selected="index === activeAt ? 'true' : 'false'"
                        class="mb-remote-browse__row"
                        :class="{ 'mb-remote-browse__row--active': index === activeAt }"
                        @click="activeIndex = index"
                        @dblclick="enter(entry)"
                        @focus="activeIndex = index"
                    >
                        <td role="gridcell" class="mb-remote-browse__nameCell">
                            <v-icon :icon="rowIcon(entry)" size="18" aria-hidden="true" />
                            <span class="mb-remote-browse__name">{{ entry.name }}</span>
                            <span
                                v-if="badgeOf(entry).kind !== 'none'"
                                class="mb-remote-browse__badge"
                                :class="`mb-remote-browse__badge--${badgeOf(entry).kind}`"
                                :aria-label="`${badgeLabel(badgeOf(entry))}. ${badgeReason(badgeOf(entry))}`"
                                :title="badgeReason(badgeOf(entry))"
                            >
                                <v-icon
                                    :icon="badgeOf(entry).kind === 'world' ? mdiCubeOutline : mdiAlertCircleOutline"
                                    size="14"
                                    aria-hidden="true"
                                />
                                {{ badgeLabel(badgeOf(entry)) }}
                            </span>
                        </td>
                        <td role="gridcell" class="mb-remote-browse__sizeCell">
                            {{ formatEntrySize(entry.sizeBytes) ?? "" }}
                        </td>
                        <td role="gridcell" class="mb-remote-browse__modifiedCell">
                            {{ formatEntryModified(entry.modifiedAt) ?? "" }}
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="mb-remote-browse__actions">
            <v-btn variant="flat" color="primary" size="small" @click="emit('choose', currentPath)">
                {{ t("remote.browse.choose", "Use this folder") }}
            </v-btn>
            <v-btn variant="text" size="small" @click="emit('cancel')">
                {{ t("remote.browse.cancel", "Cancel") }}
            </v-btn>
        </div>
    </div>
</template>

<style>
.mb-remote-browse {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-remote-browse__toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
}

.mb-remote-browse__crumbs {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
}

.mb-remote-browse__crumb {
    background: none;
    border: none;
    padding: 2px 6px;
    border-radius: 6px;
    font: inherit;
    font-size: 0.8125rem;
    color: rgb(var(--v-theme-primary));
    cursor: pointer;
}

.mb-remote-browse__crumb:disabled {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    font-weight: 500;
    cursor: default;
}

.mb-remote-browse__crumb:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 1px;
}

.mb-remote-browse__crumbSep {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.8125rem;
}

.mb-remote-browse__pathField,
.mb-remote-browse__search {
    max-width: 520px;
}

.mb-remote-browse__alert,
.mb-remote-browse__status,
.mb-remote-browse__empty {
    margin-block-start: 4px;
}

.mb-remote-browse__status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
}

.mb-remote-browse__empty {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-remote-browse__gridWrap {
    max-height: 360px;
    overflow-y: auto;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    border-radius: 8px;
}

.mb-remote-browse__grid {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
}

.mb-remote-browse__grid thead th {
    position: sticky;
    top: 0;
    background: rgb(var(--v-theme-surface));
    text-align: left;
    padding: 0;
    border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.12);
    z-index: 1;
}

.mb-remote-browse__sortBtn {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    font: inherit;
    font-weight: 500;
    padding: 8px 10px;
    cursor: pointer;
    color: inherit;
}

.mb-remote-browse__sortBtn:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-remote-browse__row {
    cursor: pointer;
}

.mb-remote-browse__row:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

.mb-remote-browse__row:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-remote-browse__row--active {
    background: rgba(var(--v-theme-primary), 0.1);
}

.mb-remote-browse__grid td {
    padding: 6px 10px;
    border-block-end: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.mb-remote-browse__nameCell {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mb-remote-browse__name {
    overflow-wrap: anywhere;
}

.mb-remote-browse__sizeCell,
.mb-remote-browse__modifiedCell {
    white-space: nowrap;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/*
    The badge never relies on colour alone: an icon plus text carries the meaning, and the
    colour is decoration on top of that, not the message itself.
*/
.mb-remote-browse__badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 0.6875rem;
    font-weight: 500;
    white-space: nowrap;
}

.mb-remote-browse__badge--world {
    background: rgba(var(--v-theme-primary), 0.14);
    color: rgb(var(--v-theme-primary));
}

.mb-remote-browse__badge--partial {
    background: rgba(var(--v-theme-warning), 0.16);
    color: rgb(var(--v-theme-warning));
}

.mb-remote-browse__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
}

/* A remote target is often edited in a narrow dialog. Do not turn its listing into a
   hidden horizontal scroll region: keep the path/name useful, retain size, and remove
   only the least immediate column (timestamp) as width runs out. The world classification
   remains exposed through the badge's accessible name while its visual label collapses to
   the existing icon. */
@media (max-width: 30rem) {
    .mb-remote-browse__gridWrap {
        overflow-x: clip;
    }

    .mb-remote-browse__grid {
        table-layout: fixed;
    }

    .mb-remote-browse__grid th:nth-child(2),
    .mb-remote-browse__sizeCell {
        width: 4.75rem;
    }

    .mb-remote-browse__grid th:nth-child(3),
    .mb-remote-browse__modifiedCell {
        display: none;
    }

    .mb-remote-browse__nameCell,
    .mb-remote-browse__name {
        min-width: 0;
    }

    .mb-remote-browse__badge {
        flex: 0 0 auto;
        gap: 0;
        padding-inline: 4px;
        font-size: 0;
    }
}

@media (prefers-reduced-motion: reduce) {
    .mb-remote-browse__row {
        transition: none;
    }
}
</style>
