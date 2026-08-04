<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiEject,
    mdiFolderPlusOutline,
    mdiPencilOutline,
    mdiRefresh,
} from "@mdi/js";
import { VAlert, VBtn, VChip, VIcon, VProgressCircular, VTextField } from "vuetify/components";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useConfigHost } from "../config/configHost.js";
import {
    describeFolderOrigin,
    describeFolderResolution,
    describeFolderState,
    displayName,
    nextOptionIndex,
    samePath,
    sortWorldsByLastPlayed,
    worldDetailLine,
    worldAtPath,
    worldOptionName,
    worldSearchText,
    type MinecraftFolder,
    type MinecraftWorldSummary,
    type WorldCatalogBridge,
} from "./worldCatalog.js";

/**
 * The worlds already on this machine, offered as a list.
 *
 * Somebody creating a map almost always wants a world they already have, and until now
 * the only way to name one was to know where Minecraft keeps its saves and type the path
 * without a mistake. This asks the shell instead: the default Minecraft folder for this
 * platform, plus every folder the person has mounted, each scanned for worlds and each
 * world listed with the facts people actually choose by, most recently played first.
 *
 * ## It is an addition, not a replacement
 *
 * Nothing here is required to make a map. The step around this keeps its path field, its
 * folder picker and its drop target, and a world on a USB stick or pulled off a server is
 * named directly with nothing mounted and nothing configured. A world that happens to sit
 * inside a mounted folder is resolved to the row it already has rather than listed twice.
 *
 * ## Why a listbox
 *
 * Because that is what it is: one thing chosen from many. A stack of cards would need a
 * tab press per world to walk ninety saves, and would announce no position, no count and
 * no selected state. The rows carry their details in their accessible names for the same
 * reason they carry them on screen: "New World (2)" four times over is not a choice
 * anybody can make, and the details are the entire difference between the four.
 *
 * Focus and selection are deliberately separate here. In a plain listbox selection
 * follows focus, but choosing a world runs a folder inspection, and moving the arrow key
 * down ninety rows would start ninety of them. Arrows move focus; Enter, Space or a click
 * chooses, and `aria-selected` marks the world the wizard is actually pointed at.
 *
 * ## Mounted folders
 *
 * People keep several Minecraft installations on one machine. The detected default is
 * entry one and is there without anybody adding it; the rest are mounted by hand, take
 * either an installation or the `saves` folder inside it, and are labelled so that two
 * folders both called `saves` can be told apart. Unmounting takes a row out of this list
 * and touches nothing on disk, which is said in as many words beside the control, because
 * "unmount" next to a list of somebody's worlds reads as "delete" to a reasonable person.
 */
const props = defineProps<{
    /** The world folder the wizard is pointed at, so the matching row reads as selected. */
    modelValue: string;
    /** The shell. Null means this build cannot look for worlds, and nothing is rendered. */
    bridge: WorldCatalogBridge | null;
}>();

const emit = defineEmits<{
    /** A world was chosen. The step fills its field and inspects the folder as usual. */
    choose: [folder: string];
}>();

const { t } = useI18n();
const host = useConfigHost();

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

const folders = ref<readonly MinecraftFolder[]>([]);
/** Worlds by folder id, so one folder finishing does not wait for another. */
const worldsByFolder = ref<Record<string, readonly MinecraftWorldSummary[]>>({});
/** Folder ids still being read, which is what makes the progress per mount real. */
const scanning = ref<readonly string[]>([]);
/** Why a folder's scan failed, keyed by folder id. */
const scanFailures = ref<Record<string, string>>({});
const loadingFolders = ref(false);
const listFailure = ref<string | null>(null);

/**
 * Reads the folder list, then each folder's worlds.
 *
 * The folder list is awaited because the rows cannot be drawn without it, and the scans
 * are started together and awaited separately: a folder on a network drive that takes ten
 * seconds must not keep the four local folders that took ten milliseconds off the screen.
 */
async function load(): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;

    loadingFolders.value = true;
    listFailure.value = null;
    try {
        folders.value = await bridge.listMinecraftFolders();
    } catch (error) {
        listFailure.value = error instanceof Error ? error.message : String(error);
        folders.value = [];
        return;
    } finally {
        loadingFolders.value = false;
    }

    await Promise.all(folders.value.filter((folder) => folder.state === "ok").map(scan));
}

async function scan(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;

    scanning.value = [...scanning.value, folder.id];
    try {
        const answer = await bridge.scanMinecraftFolder(folder.id);
        if (answer.ok) {
            worldsByFolder.value = { ...worldsByFolder.value, [folder.id]: answer.scan.worlds };
            const failures = { ...scanFailures.value };
            delete failures[folder.id];
            scanFailures.value = failures;
        } else {
            scanFailures.value = { ...scanFailures.value, [folder.id]: answer.message };
        }
    } catch (error) {
        scanFailures.value = {
            ...scanFailures.value,
            [folder.id]: error instanceof Error ? error.message : String(error),
        };
    } finally {
        scanning.value = scanning.value.filter((id) => id !== folder.id);
    }
}

onMounted(() => {
    void load();
});

const busy = computed(() => loadingFolders.value || scanning.value.length > 0);

/* -------------------------------------------------------------------------- */
/* The worlds                                                                 */
/* -------------------------------------------------------------------------- */

const labelsById = computed(() => {
    const labels: Record<string, string> = {};
    for (const folder of folders.value) labels[folder.id] = folder.label;
    return labels;
});

/** Every world from every mounted folder, most recently played first, across the whole list. */
const allWorlds = computed(() =>
    sortWorldsByLastPlayed(folders.value.flatMap((folder) => worldsByFolder.value[folder.id] ?? [])),
);

function labelFor(world: MinecraftWorldSummary): string | null {
    // Only worth saying which folder a world came from when there is more than one to
    // have come from. On the ordinary machine with one Minecraft installation it is a
    // word repeated on every row that distinguishes nothing.
    if (folders.value.length < 2) return null;
    return labelsById.value[world.folderId] ?? null;
}

/**
 * This list's own query, mode and flags, with its own anchored builder.
 *
 * `ConfigSearchField` rather than a filter box of this surface's own: the same component
 * every other search surface in the app uses, so the plain-text default, the regex
 * opt-in, the anchored builder and the return of focus to the field on close are the
 * shared ones and not another implementation of them. A player with a hundred saves is
 * exactly who needs it, and the names are similar and differ in the middle, which is the
 * case reading down a list handles badly and a pattern handles well.
 */
const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shown = computed(() =>
    allWorlds.value.filter((world) => matcher.value.test(worldSearchText(world, labelFor(world), t))),
);

/** The real corpus, so the builder's preview and this list cannot disagree. */
const sample = computed(() =>
    allWorlds.value.map((world) => worldSearchText(world, labelFor(world), t)).join("\n"),
);

const summary = computed(() =>
    matcher.value.active
        ? t(
              "world.list.searchSummary",
              { shown: shown.value.length, total: allWorlds.value.length },
              "Showing {shown} of {total}",
          )
        : "",
);

function detailsOf(world: MinecraftWorldSummary): string {
    return worldDetailLine(world, labelFor(world), t);
}

function optionNameOf(world: MinecraftWorldSummary): string {
    return worldOptionName(world, labelFor(world), t);
}

/* -------------------------------------------------------------------------- */
/* The listbox                                                                */
/* -------------------------------------------------------------------------- */

/** Which option holds the single tab stop. Focus, not selection: see the note at the top. */
const activeIndex = ref(0);
const optionRefs = ref<HTMLElement[]>([]);

function setOptionRef(element: unknown, index: number): void {
    if (element instanceof HTMLElement) optionRefs.value[index] = element;
}

const activeAt = computed(() => Math.min(Math.max(activeIndex.value, 0), Math.max(shown.value.length - 1, 0)));

/**
 * Whether this row is the world the wizard is pointed at.
 *
 * Compared through the shared `samePath`, which folds separators and case, so a folder
 * that arrived from the picker, from a drop, or typed by hand is recognised as the world
 * already in this list rather than as a different place that happens to look like it.
 * That is what stops the same world being offered twice under two names.
 */
function isChosen(world: MinecraftWorldSummary): boolean {
    return samePath(world.path, props.modelValue);
}

/**
 * Puts the tab stop on the world that is currently chosen.
 *
 * Focus is deliberately not taken. Somebody who has just dropped a folder is looking at
 * the field they dropped it near, and moving the caret out from under them would be the
 * list helping itself rather than them; what this does is make the next Tab land on the
 * row that matters instead of at the top of a list of ninety.
 */
watch(
    () => [props.modelValue, shown.value] as const,
    () => {
        const chosen = worldAtPath(shown.value, props.modelValue);
        if (chosen === null) return;
        const index = shown.value.indexOf(chosen);
        if (index >= 0) activeIndex.value = index;
    },
    { immediate: true },
);

async function focusOption(index: number): Promise<void> {
    activeIndex.value = index;
    await nextTick();
    optionRefs.value[index]?.focus();
}

function onListKeydown(event: KeyboardEvent): void {
    const next = nextOptionIndex(event.key, activeAt.value, shown.value.length);
    if (next !== activeAt.value && next >= 0) {
        event.preventDefault();
        void focusOption(next);
    }
}

function choose(world: MinecraftWorldSummary): void {
    emit("choose", world.path);
}

/* -------------------------------------------------------------------------- */
/* Mounting                                                                   */
/* -------------------------------------------------------------------------- */

const mountFailure = ref<string | null>(null);
const mountNotice = ref<string | null>(null);
/** The folder id whose label is being edited, and the text being typed into it. */
const renaming = ref<string | null>(null);
const renameText = ref("");

async function browseForFolder(): Promise<void> {
    if (host === null || props.bridge === null) return;
    const chosen = await host.pickDirectory({
        title: t("world.mounts.pick", "Choose a Minecraft folder, or the saves folder inside one"),
    });
    if (chosen === null) return;
    await mount(chosen);
}

async function mount(folder: string): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;

    mountFailure.value = null;
    mountNotice.value = null;
    const answer = await bridge.mountMinecraftFolder(folder);
    if (!answer.ok) {
        mountFailure.value = answer.message;
        return;
    }
    mountNotice.value = answer.alreadyMounted
        ? t(
              "world.mounts.already",
              { label: answer.folder.label },
              "That folder is already in the list, as {label}. Its worlds are below.",
          )
        : describeFolderResolution(answer.folder, t);
    await load();
}

/**
 * Takes a folder off the list.
 *
 * Named `unmount` rather than any of the words that mean deletion, because it is not one:
 * nothing on disk is touched, no world is lost, and mounting the same folder again puts
 * the row straight back. That is also why there is no super-confirmation gate in front of
 * it. The gate exists for actions somebody cannot undo, and this one is undone by
 * choosing the same folder again from the button beside it.
 */
async function unmount(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;
    await bridge.unmountMinecraftFolder(folder.id);
    mountNotice.value = t(
        "world.mounts.unmounted",
        { label: folder.label },
        "{label} is no longer in this list. Nothing on your disk was changed, and mounting it again brings it straight back.",
    );
    await load();
}

function startRenaming(folder: MinecraftFolder): void {
    renaming.value = folder.id;
    renameText.value = folder.label;
}

async function commitRename(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    renaming.value = null;
    if (bridge === null) return;
    await bridge.labelMinecraftFolder(folder.id, renameText.value);
    await load();
}

/* -------------------------------------------------------------------------- */
/* The honest states                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The real paths that were read, for the empty state.
 *
 * Paths rather than names, because "it looked in your Minecraft folder and found nothing"
 * is the sentence that leaves somebody unable to check. A path is checkable.
 */
const searchedPlaces = computed(() => folders.value.map((folder) => folder.savesPath).join(", "));

/** Where a detected folder came from, shown under its row so the row explains itself. */
function originOf(folder: MinecraftFolder): string | null {
    return describeFolderOrigin(folder, t);
}

/** True once every folder has been read and not one world came back. */
const nothingFound = computed(() => !busy.value && allWorlds.value.length === 0);

function stateOf(folder: MinecraftFolder): string | null {
    return describeFolderState(folder, t);
}

function isScanning(folder: MinecraftFolder): boolean {
    return scanning.value.includes(folder.id);
}

function worldCountOf(folder: MinecraftFolder): number {
    return (worldsByFolder.value[folder.id] ?? []).length;
}

function failureOf(folder: MinecraftFolder): string | null {
    return scanFailures.value[folder.id] ?? null;
}
</script>

<template>
    <section
        v-if="bridge !== null"
        class="mb-world-list"
        :aria-label="t('world.list.section', 'Worlds already on this computer')"
    >
        <div class="mb-world-list__heading">
            <h4 class="mb-world-list__title">{{ t("world.list.title", "Your Minecraft worlds") }}</h4>
            <v-btn
                :prepend-icon="mdiRefresh"
                :disabled="busy"
                variant="text"
                size="small"
                @click="load"
            >
                {{ t("world.list.rescan", "Look again") }}
            </v-btn>
        </div>

        <p class="mb-world-list__blurb">
            {{
                t(
                    "world.list.blurb",
                    "Found in your Minecraft folder and in any folder you mount below. Choosing one fills in the world field; you can always type or drop a folder instead.",
                )
            }}
        </p>

        <!-- Mounted folders, each with its own state and its own progress. -->
        <ul class="mb-world-list__mounts">
            <li v-for="folder in folders" :key="folder.id" class="mb-world-list__mount">
                <div class="mb-world-list__mount-line">
                    <template v-if="renaming === folder.id">
                        <v-text-field
                            v-model="renameText"
                            :label="t('world.mounts.renameLabel', 'Name for this folder')"
                            variant="outlined"
                            density="compact"
                            hide-details="auto"
                            autofocus
                            @keydown.enter="commitRename(folder)"
                            @blur="commitRename(folder)"
                        />
                    </template>
                    <template v-else>
                        <span class="mb-world-list__mount-name">{{ folder.label }}</span>
                        <v-chip v-if="folder.builtIn" size="x-small" variant="tonal">
                            {{ t("world.mounts.detected", "found automatically") }}
                        </v-chip>
                        <v-chip size="x-small" variant="outlined">
                            {{
                                isScanning(folder)
                                    ? t("world.mounts.scanning", "reading...")
                                    : t("world.mounts.worldCount", { n: worldCountOf(folder) }, "{n} worlds")
                            }}
                        </v-chip>
                        <v-progress-circular
                            v-if="isScanning(folder)"
                            indeterminate
                            size="14"
                            width="2"
                            aria-hidden="true"
                        />
                        <v-btn
                            :icon="mdiPencilOutline"
                            :aria-label="t('world.mounts.rename', { label: folder.label }, 'Rename {label}')"
                            variant="text"
                            size="x-small"
                            density="comfortable"
                            @click="startRenaming(folder)"
                        />
                        <v-btn
                            v-if="!folder.builtIn"
                            :prepend-icon="mdiEject"
                            :aria-label="
                                t(
                                    'world.mounts.unmountOne',
                                    { label: folder.label },
                                    'Unmount {label}. This only takes it out of this list and changes nothing on your disk.',
                                )
                            "
                            variant="text"
                            size="x-small"
                            @click="unmount(folder)"
                        >
                            {{ t("world.mounts.unmount", "Unmount") }}
                        </v-btn>
                    </template>
                </div>
                <p class="mb-world-list__mount-path">{{ folder.savesPath }}</p>
                <p v-if="originOf(folder)" class="mb-world-list__hint">{{ originOf(folder) }}</p>
                <p v-if="stateOf(folder)" class="mb-world-list__mount-state">{{ stateOf(folder) }}</p>
                <p v-if="failureOf(folder)" class="mb-world-list__mount-state">{{ failureOf(folder) }}</p>
            </li>
        </ul>

        <div class="mb-world-list__mount-actions">
            <v-btn
                :prepend-icon="mdiFolderPlusOutline"
                :disabled="host === null"
                variant="tonal"
                size="small"
                @click="browseForFolder"
            >
                {{ t("world.mounts.add", "Mount another Minecraft folder") }}
            </v-btn>
            <span class="mb-world-list__hint">
                {{
                    t(
                        "world.mounts.addHint",
                        "Point it at a Minecraft folder or at the saves folder inside one. Unmounting later only takes it out of this list and never touches your worlds.",
                    )
                }}
            </span>
        </div>

        <v-alert v-if="mountFailure" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ mountFailure }}
        </v-alert>
        <v-alert v-if="mountNotice" type="info" density="compact" variant="tonal" class="mt-2" role="status">
            {{ mountNotice }}
        </v-alert>
        <v-alert v-if="listFailure" type="warning" density="compact" variant="tonal" class="mt-2" role="alert">
            {{ listFailure }}
        </v-alert>

        <!--
            The search stays on screen whenever there is anything to search, filtered list
            or not. A query that matches nothing must leave the field there to be cleared;
            hiding the section around it would take the way back out with it.
        -->
        <div v-if="allWorlds.length > 0" class="mb-world-list__search">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('world.list.searchLabel', 'Search these worlds')"
                :placeholder="t('world.list.searchHint', 'a name, a version, a folder')"
                :sample="sample"
                :summary="summary"
            />
        </div>

        <div v-if="busy" class="mb-world-list__status" role="status" aria-live="polite">
            <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
            <span>{{ t("world.list.scanning", "Reading your Minecraft folders...") }}</span>
        </div>

        <p v-else-if="nothingFound && folders.length === 0" class="mb-world-list__empty" role="status">
            {{
                t(
                    "world.list.noFolders",
                    "No Minecraft folder was found on this computer. Mount one above if Minecraft lives somewhere unusual, or just type or drop the world folder in the field below.",
                )
            }}
        </p>

        <p v-else-if="nothingFound" class="mb-world-list__empty" role="status">
            {{
                t(
                    "world.list.noWorlds",
                    { places: searchedPlaces },
                    "No worlds were found. It looked in: {places}. Mount another folder above, or type or drop a world folder in the field below.",
                )
            }}
        </p>

        <p v-else-if="shown.length === 0" class="mb-world-list__empty" role="status">
            {{
                t(
                    "world.list.noMatch",
                    "No world matches that search. Clearing it brings the whole list back.",
                )
            }}
        </p>

        <ul
            v-else
            class="mb-world-list__options"
            role="listbox"
            :aria-label="t('world.list.listbox', 'Worlds found on this computer, most recently played first')"
            @keydown="onListKeydown"
        >
            <li
                v-for="(world, index) in shown"
                :key="world.path"
                :ref="(element) => setOptionRef(element, index)"
                role="option"
                :aria-selected="isChosen(world) ? 'true' : 'false'"
                :aria-label="optionNameOf(world)"
                :tabindex="index === activeAt ? 0 : -1"
                class="mb-world-list__option"
                :class="{ 'mb-world-list__option--chosen': isChosen(world) }"
                @click="choose(world)"
                @focus="activeIndex = index"
                @keydown.enter.prevent="choose(world)"
                @keydown.space.prevent="choose(world)"
            >
                <span class="mb-world-list__name">
                    {{ displayName(world) }}
                    <v-icon
                        v-if="world.detailsError"
                        :icon="mdiAlertCircleOutline"
                        size="14"
                        aria-hidden="true"
                        class="mb-world-list__warn"
                    />
                </span>
                <!--
                    The details as a real second line of the option rather than a title
                    attribute. A tooltip is not an accessible name, is not readable on a
                    touch screen, and is not what somebody scanning a list actually reads.
                -->
                <span class="mb-world-list__details">{{ detailsOf(world) }}</span>
            </li>
        </ul>
    </section>
</template>

<style>
.mb-world-list {
    margin-block-start: 16px;
    padding-block-start: 8px;
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.mb-world-list__heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-world-list__title {
    font-size: 0.9375rem;
    font-weight: 500;
    line-height: 1.4;
}

.mb-world-list__blurb,
.mb-world-list__hint,
.mb-world-list__empty {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-world-list__mounts {
    margin-block: 8px;
    padding: 0;
    list-style: none;
}

.mb-world-list__mount {
    padding-block: 6px;
}

.mb-world-list__mount + .mb-world-list__mount {
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.mb-world-list__mount-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-world-list__mount-name {
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-world-list__mount-path {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-list__mount-state {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-warning));
    text-wrap: pretty;
}

.mb-world-list__mount-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 4px;
}

.mb-world-list__search {
    margin-block-start: 12px;
    max-width: 460px;
}

.mb-world-list__status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    margin-block-start: 12px;
}

.mb-world-list__empty {
    margin-block-start: 12px;
}

.mb-world-list__options {
    margin-block-start: 8px;
    padding: 0;
    list-style: none;
    max-height: 320px;
    overflow-y: auto;
}

.mb-world-list__option {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
    min-height: 48px;
    justify-content: center;
}

.mb-world-list__option:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

/*
    A focus ring that is visible on its own, not merely a change of background: the
    keyboard is the whole point of a listbox, and a focused row nobody can see is a list
    somebody has to guess their way down.
*/
.mb-world-list__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-world-list__option--chosen {
    background: rgba(var(--v-theme-primary), 0.12);
}

.mb-world-list__name {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9375rem;
    line-height: 1.3;
}

.mb-world-list__warn {
    color: rgb(var(--v-theme-warning));
}

/* The requested small secondary line: the world's details, under its name. */
.mb-world-list__details {
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

@media (prefers-reduced-motion: reduce) {
    .mb-world-list__option {
        transition: none;
    }
}
</style>
