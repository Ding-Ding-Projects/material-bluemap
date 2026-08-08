<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiCheckboxMultipleMarkedOutline,
    mdiEarth,
    mdiEject,
    mdiFolderPlusOutline,
    mdiPencilOutline,
    mdiPlusCircleOutline,
    mdiRefresh,
    mdiSelectAll,
    mdiSelectInverse,
    mdiSelectOff,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VCheckboxBtn,
    VChip,
    VDivider,
    VIcon,
    VList,
    VListItem,
    VProgressCircular,
    VProgressLinear,
    VSpacer,
    VTextField,
} from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { useConfigHost } from "../config/configHost.js";
import { discoveredWorlds } from "./discoveredWorlds.js";
import {
    describeFolderOrigin,
    describeFolderResolution,
    describeFolderState,
    displayName,
    sortWorldsByLastPlayed,
    worldDetailLine,
    worldOptionName,
    worldSearchText,
    type MinecraftFolder,
    type MinecraftWorldSummary,
    type WorldCatalogBridge,
} from "../world/worldCatalog.js";

/**
 * Worlds this computer already has, that nobody has started a project for yet.
 *
 * `../world/worldCatalog.ts` and the main-process `world/mounts.ts` + `world/catalog.ts`
 * behind it are the one discovery system this application has - the default Minecraft
 * folder, every folder somebody has mounted, every world in each. This component is a
 * second *view* over that same system, not a second implementation of it: every folder read,
 * every world listed, every mount/unmount/rename action here calls exactly the bridge
 * methods `MinecraftWorldList.vue` (the wizard's own world picker) calls, and every fact
 * shown about a world - its name, size, version, seed, last played - is formatted by the
 * exact same pure functions from `worldCatalog.ts` that component uses.
 *
 * The two views differ because the interactions genuinely differ. The wizard picks exactly
 * one world to fill a field; this tab starts projects, potentially many at once, and needs
 * multi-select, a bulk action and a per-row context menu the wizard's simple listbox has no
 * use for - so this is its own template rather than the wizard's component wearing a second
 * hat. See `discoveredWorlds.ts` for the one piece of logic that is genuinely new here:
 * deciding which discovered worlds are not already a project.
 *
 * ## Available, not automatic
 *
 * Nothing here writes a project file on its own. A discovered world is offered, visibly
 * marked as not yet a project (a chip, an outline, its own "Use" action rather than the
 * established list's "Open"), and a click routes into starting one - opening the editor
 * pre-filled for a single world, or writing a default project immediately for however many
 * are selected in bulk. Silently writing a project into every world folder this computer can
 * find would put settings nobody asked for on disk the moment this tab is opened, which is
 * the "built, tested, unreachable" failure mode in reverse: a feature that acts without
 * anybody triggering it.
 */
const props = defineProps<{
    bridge: WorldCatalogBridge | null;
    /** The `world` path of every existing project, so its world is left out of this list. */
    projectWorlds: readonly string[];
}>();

const emit = defineEmits<{
    /** One world, chosen to start a project from. Opens the editor pre-filled, unsaved. */
    use: [world: string];
    /** Several worlds at once. Writes a default project for each immediately. */
    useMany: [worlds: readonly string[]];
    notify: [level: "info" | "success" | "warning" | "error", message: string];
}>();

const { t } = useI18n();
const host = useConfigHost();
const uid = useId();

/* -------------------------------------------------------------------------- */
/* Loading, exactly the pattern MinecraftWorldList.vue uses against the same  */
/* bridge: the folder list first, then each folder's worlds scanned in        */
/* parallel and reported as each one finishes.                                */
/* -------------------------------------------------------------------------- */

const folders = ref<readonly MinecraftFolder[]>([]);
const worldsByFolder = ref<Record<string, readonly MinecraftWorldSummary[]>>({});
const scanning = ref<readonly string[]>([]);
const scanFailures = ref<Record<string, string>>({});
const loadingFolders = ref(false);
const listFailure = ref<string | null>(null);

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

defineExpose({ load });

const busy = computed(() => loadingFolders.value || scanning.value.length > 0);

/* -------------------------------------------------------------------------- */
/* Which worlds, and which of those are not already a project                 */
/* -------------------------------------------------------------------------- */

const labelsById = computed(() => {
    const labels: Record<string, string> = {};
    for (const folder of folders.value) labels[folder.id] = folder.label;
    return labels;
});

function labelFor(world: MinecraftWorldSummary): string | null {
    if (folders.value.length < 2) return null;
    return labelsById.value[world.folderId] ?? null;
}

const allWorlds = computed(() =>
    sortWorldsByLastPlayed(folders.value.flatMap((folder) => worldsByFolder.value[folder.id] ?? [])),
);

/** Every discovered world that is not already a project, deduplicated. See `discoveredWorlds.ts`. */
const available = computed(() => discoveredWorlds(allWorlds.value, props.projectWorlds));

/* -------------------------------------------------------------------------- */
/* This list's own search, wired to the full regex builder like every other   */
/* search surface.                                                            */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
const flags = ref("i");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const shown = computed(() =>
    available.value.filter((world) => matcher.value.test(worldSearchText(world, labelFor(world), t))),
);

const sample = computed(() => available.value.map((world) => worldSearchText(world, labelFor(world), t)).join("\n"));

const summary = computed(() =>
    matcher.value.active
        ? t(
              "project.discovered.searchSummary",
              { shown: shown.value.length, total: available.value.length },
              "Showing {shown} of {total}",
          )
        : "",
);

const searchVisible = computed(() => available.value.length > 3 || query.value.length > 0);

function detailsOf(world: MinecraftWorldSummary): string {
    return worldDetailLine(world, labelFor(world), t);
}

function optionNameOf(world: MinecraftWorldSummary): string {
    return worldOptionName(world, labelFor(world), t);
}

function appearanceIdOf(world: MinecraftWorldSummary): string {
    return `discovered-world.${world.path}`;
}

/* -------------------------------------------------------------------------- */
/* Choosing several, the same shape ProjectList.vue's bulk selection uses     */
/* -------------------------------------------------------------------------- */

const chosen = ref<string[]>([]);

function isChosen(path: string): boolean {
    return chosen.value.includes(path);
}

function toggleChosen(path: string): void {
    chosen.value = isChosen(path) ? chosen.value.filter((candidate) => candidate !== path) : [...chosen.value, path];
}

function chooseAll(): void {
    chosen.value = shown.value.map((world) => world.path);
}

function chooseNone(): void {
    chosen.value = [];
}

function chooseInverse(): void {
    const visible = shown.value.map((world) => world.path);
    chosen.value = visible.filter((path) => !isChosen(path));
}

const bulkLabel = computed(() =>
    t("project.discovered.chosenCount", { chosen: chosen.value.length }, "{chosen} selected"),
);

function useMany(): void {
    if (chosen.value.length === 0) return;
    emit("useMany", chosen.value.slice());
    chosen.value = [];
}

/* -------------------------------------------------------------------------- */
/* The listbox, roving tabindex, focus separate from selection                */
/* -------------------------------------------------------------------------- */

const focusedPath = ref<string | null>(null);

const rovingPath = computed<string | null>(() => {
    const paths = shown.value.map((world) => world.path);
    if (focusedPath.value !== null && paths.includes(focusedPath.value)) return focusedPath.value;
    return paths[0] ?? null;
});

function optionId(path: string): string {
    return `${uid}-discovered-${encodeURIComponent(path)}`;
}

function noteFocus(path: string): void {
    focusedPath.value = path;
}

async function focusOption(path: string): Promise<void> {
    focusedPath.value = path;
    await nextTick(() => document.getElementById(optionId(path))?.focus());
}

const OPEN_KEY = "Enter";
const CHOOSE_KEY = " ";

function keyLabel(key: string): string {
    return key === " " ? "Space" : key;
}

function onOptionKeydown(event: KeyboardEvent, world: MinecraftWorldSummary): void {
    if (event.key === OPEN_KEY) {
        event.preventDefault();
        emit("use", world.path);
        return;
    }
    if (event.key === CHOOSE_KEY || event.key === "Spacebar") {
        event.preventDefault();
        toggleChosen(world.path);
        return;
    }

    const paths = shown.value.map((w) => w.path);
    const here = paths.indexOf(world.path);
    if (here === -1) return;

    let wanted: number;
    if (event.key === "ArrowDown") wanted = here + 1;
    else if (event.key === "ArrowUp") wanted = here - 1;
    else if (event.key === "Home") wanted = 0;
    else if (event.key === "End") wanted = paths.length - 1;
    else return;

    event.preventDefault();
    const target = paths[Math.min(Math.max(wanted, 0), paths.length - 1)];
    if (target !== undefined) void focusOption(target);
}

/* -------------------------------------------------------------------------- */
/* Mounted folders: mount, unmount, rename - the same bridge calls the        */
/* wizard's own world list makes, presented the same honest way.              */
/* -------------------------------------------------------------------------- */

const mountFailure = ref<string | null>(null);
const mountNotice = ref<string | null>(null);
const renaming = ref<string | null>(null);
const renameText = ref("");

async function browseForFolder(): Promise<void> {
    if (host === null || props.bridge === null) return;
    const chosenFolder = await host.pickDirectory({
        title: t("project.discovered.pick", "Choose a Minecraft folder, or the saves folder inside one"),
    });
    if (chosenFolder === null) return;
    await mount(chosenFolder);
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
              "project.discovered.mountAlready",
              { label: answer.folder.label },
              "That folder is already in the list, as {label}. Its worlds are below.",
          )
        : describeFolderResolution(answer.folder, t);
    await load();
}

/**
 * Takes a folder off the list. Never touches a file: it rewrites the small JSON list of
 * mounted folders and nothing else. See `../world/mounts.ts` for the same guarantee on the
 * main-process side, and `MinecraftWorldList.vue` for the identical wording this mirrors.
 */
async function unmount(folder: MinecraftFolder): Promise<void> {
    const bridge = props.bridge;
    if (bridge === null) return;
    await bridge.unmountMinecraftFolder(folder.id);
    mountNotice.value = t(
        "project.discovered.unmounted",
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

function originOf(folder: MinecraftFolder): string | null {
    return describeFolderOrigin(folder, t);
}

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

/* -------------------------------------------------------------------------- */
/* The honest states: distinguish "still scanning", "no folders added",       */
/* "folders added but no worlds found", "every world already has a project"   */
/* and "no match for the search" - five different facts, five different       */
/* sentences.                                                                 */
/* -------------------------------------------------------------------------- */

const searchedPlaces = computed(() => folders.value.map((folder) => folder.savesPath).join(", "));

const noFoldersAtAll = computed(() => !busy.value && folders.value.length === 0);
const foldersButNoWorlds = computed(() => !busy.value && folders.value.length > 0 && allWorlds.value.length === 0);
const worldsButAllHaveProjects = computed(
    () => !busy.value && allWorlds.value.length > 0 && available.value.length === 0,
);
const noSearchMatch = computed(() => !busy.value && available.value.length > 0 && shown.value.length === 0);
</script>

<template>
    <v-card v-if="bridge !== null" class="mb-discovered" :aria-label="t('project.discovered.cardLabel', 'Worlds ready to use')">
        <v-card-title class="mb-discovered__head mb-responsive-card-title">
            <v-icon :icon="mdiEarth" aria-hidden="true" />
            <span class="mb-responsive-card-title__text">{{ t("project.discovered.title", "Worlds ready to use") }}</span>
            <span class="mb-responsive-card-title__actions">
                <v-btn class="mb-responsive-card-title__action" :prepend-icon="mdiRefresh" variant="text" size="small" :disabled="busy" @click="load">
                    {{ t("project.discovered.rescan", "Look again") }}
                </v-btn>
            </span>
        </v-card-title>

        <v-card-text>
            <p class="mb-discovered__blurb">
                {{
                    t(
                        "project.discovered.blurb",
                        "Found automatically in the default Minecraft folder and in any folder you mount below. None of these has a project yet - choosing one starts one, without typing or browsing for the path.",
                    )
                }}
            </p>

            <ul class="mb-discovered__mounts">
                <li v-for="folder in folders" :key="folder.id" class="mb-discovered__mount">
                    <div class="mb-discovered__mount-line">
                        <template v-if="renaming === folder.id">
                            <v-text-field
                                v-model="renameText"
                                :label="t('project.discovered.renameLabel', 'Name for this folder')"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                autofocus
                                @keydown.enter="commitRename(folder)"
                                @blur="commitRename(folder)"
                            />
                        </template>
                        <template v-else>
                            <span class="mb-discovered__mount-name">{{ folder.label }}</span>
                            <v-chip v-if="folder.builtIn" size="x-small" variant="tonal">
                                {{ t("project.discovered.detected", "found automatically") }}
                            </v-chip>
                            <v-chip size="x-small" variant="outlined">
                                {{
                                    isScanning(folder)
                                        ? t("project.discovered.scanning", "reading...")
                                        : t("project.discovered.worldCount", { n: worldCountOf(folder) }, "{n} worlds")
                                }}
                            </v-chip>
                            <v-progress-circular v-if="isScanning(folder)" indeterminate size="14" width="2" aria-hidden="true" />
                            <v-btn
                                :icon="mdiPencilOutline"
                                :aria-label="t('project.discovered.rename', { label: folder.label }, 'Rename {label}')"
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
                                        'project.discovered.unmountOne',
                                        { label: folder.label },
                                        'Unmount {label}. This only takes it out of this list and changes nothing on your disk.',
                                    )
                                "
                                variant="text"
                                size="x-small"
                                @click="unmount(folder)"
                            >
                                {{ t("project.discovered.unmount", "Unmount") }}
                            </v-btn>
                        </template>
                    </div>
                    <p class="mb-discovered__mount-path">{{ folder.savesPath }}</p>
                    <p v-if="originOf(folder)" class="mb-discovered__hint">{{ originOf(folder) }}</p>
                    <p v-if="stateOf(folder)" class="mb-discovered__mount-state">{{ stateOf(folder) }}</p>
                    <p v-if="failureOf(folder)" class="mb-discovered__mount-state">{{ failureOf(folder) }}</p>
                </li>
            </ul>

            <div class="mb-discovered__mount-actions">
                <v-btn
                    :prepend-icon="mdiFolderPlusOutline"
                    :disabled="host === null"
                    variant="tonal"
                    size="small"
                    @click="browseForFolder"
                >
                    {{ t("project.discovered.add", "Mount another Minecraft folder") }}
                </v-btn>
                <span class="mb-discovered__hint">
                    {{
                        t(
                            "project.discovered.addHint",
                            "Point it at a Minecraft folder or at the saves folder inside one. A launcher root with several instances - like CurseForge's own folder - adds every instance found inside it. Unmounting later only takes it out of this list and never touches your worlds.",
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

            <v-progress-linear v-if="busy" indeterminate color="primary" class="mb-2" />

            <div v-if="searchVisible" class="mb-discovered__search">
                <ConfigSearchField
                    v-model="query"
                    v-model:regex="regexMode"
                    v-model:flags="flags"
                    :label="t('project.discovered.searchLabel', 'Search these worlds')"
                    :placeholder="t('project.discovered.searchHint', 'a name, a version, a folder')"
                    :sample="sample"
                    :summary="summary"
                />
            </div>

            <!-- The bulk bar, once something is chosen. -->
            <div
                v-if="shown.length > 0"
                class="mb-discovered__bulk"
                role="group"
                :aria-label="t('project.discovered.bulkLabel', 'Actions on the chosen worlds')"
            >
                <span class="mb-discovered__bulkcount" aria-live="polite">{{ bulkLabel }}</span>
                <v-btn :prepend-icon="mdiSelectAll" variant="text" size="small" :disabled="shown.length === 0" @click="chooseAll">
                    {{ t("project.discovered.selectShown", { shown: shown.length }, "Select the {shown} shown") }}
                </v-btn>
                <v-btn :prepend-icon="mdiSelectInverse" variant="text" size="small" :disabled="shown.length === 0" @click="chooseInverse">
                    {{ t("project.discovered.selectInverse", "Invert") }}
                </v-btn>
                <v-btn :prepend-icon="mdiSelectOff" variant="text" size="small" :disabled="chosen.length === 0" @click="chooseNone">
                    {{ t("project.discovered.selectNone", "Clear the selection") }}
                </v-btn>
                <v-spacer />
                <v-btn
                    :prepend-icon="mdiCheckboxMultipleMarkedOutline"
                    color="primary"
                    variant="tonal"
                    size="small"
                    :disabled="chosen.length === 0"
                    @click="useMany"
                >
                    {{ t("project.discovered.useMany", { chosen: chosen.length }, "Start projects for {chosen} chosen") }}
                </v-btn>
            </div>

            <p v-if="busy" class="mb-discovered__status" role="status" aria-live="polite">
                <v-progress-circular indeterminate size="18" width="2" aria-hidden="true" />
                <span>{{ t("project.discovered.scanningStatus", "Reading your Minecraft folders...") }}</span>
            </p>

            <p v-else-if="noFoldersAtAll" class="mb-discovered__empty" role="status">
                {{
                    t(
                        "project.discovered.noFolders",
                        "No Minecraft folder was found on this computer. Mount one above if Minecraft lives somewhere unusual.",
                    )
                }}
            </p>

            <p v-else-if="foldersButNoWorlds" class="mb-discovered__empty" role="status">
                {{
                    t(
                        "project.discovered.noWorlds",
                        { places: searchedPlaces },
                        "No worlds were found. It looked in: {places}. Mount another folder above if there is more to look at.",
                    )
                }}
            </p>

            <p v-else-if="worldsButAllHaveProjects" class="mb-discovered__empty" role="status">
                {{
                    t(
                        "project.discovered.allHaveProjects",
                        "Every world this computer can find already has a project below. There is nothing new to start here.",
                    )
                }}
            </p>

            <p v-else-if="noSearchMatch" class="mb-discovered__empty" role="status">
                {{ t("project.discovered.noMatch", "No world matches that search. Clearing it brings the whole list back.") }}
            </p>

            <div
                v-else
                class="mb-discovered__list"
                role="listbox"
                aria-multiselectable="true"
                :aria-label="t('project.discovered.listLabel', 'Worlds ready to use')"
            >
                <AppearanceTarget
                    v-for="world in shown"
                    :id="appearanceIdOf(world)"
                    :key="world.path"
                    :label="displayName(world)"
                    as="div"
                    role="presentation"
                    class="mb-discovered__rowhost"
                >
                    <div class="mb-discovered__row" @contextmenu="noteFocus(world.path)">
                        <v-checkbox-btn
                            :model-value="isChosen(world.path)"
                            :aria-label="t('project.discovered.choose', { name: displayName(world) }, 'Choose {name}')"
                            :tabindex="rovingPath === world.path ? 0 : -1"
                            density="compact"
                            hide-details
                            @update:model-value="toggleChosen(world.path)"
                        />
                        <div
                            :id="optionId(world.path)"
                            class="mb-discovered__option"
                            role="option"
                            :aria-selected="isChosen(world.path) ? 'true' : 'false'"
                            :aria-label="optionNameOf(world)"
                            :tabindex="rovingPath === world.path ? 0 : -1"
                            @click="emit('use', world.path)"
                            @focus="noteFocus(world.path)"
                            @keydown="onOptionKeydown($event, world)"
                        >
                            <span class="mb-discovered__text">
                                <span class="mb-discovered__name">
                                    {{ displayName(world) }}
                                    <v-chip size="x-small" variant="outlined" class="ms-2">
                                        {{ t("project.discovered.notYetChip", "not yet a project") }}
                                    </v-chip>
                                </span>
                                <span class="mb-discovered__subtitle">{{ detailsOf(world) }}</span>
                            </span>
                        </div>
                        <span class="mb-discovered__actions">
                            <v-btn
                                :prepend-icon="mdiPlusCircleOutline"
                                variant="text"
                                size="small"
                                :tabindex="rovingPath === world.path ? 0 : -1"
                                :aria-label="t('project.discovered.useOne', { name: displayName(world) }, 'Start a project for {name}')"
                                @click="emit('use', world.path)"
                            >
                                {{ t("project.discovered.use", "Use") }}
                            </v-btn>
                        </span>
                    </div>

                    <template #menu="{ close }">
                        <v-list density="compact" :aria-label="t('project.discovered.rowMenuLabel', 'What this world can do')">
                            <v-list-item
                                :prepend-icon="mdiPlusCircleOutline"
                                :title="t('project.discovered.menuUse', 'Start a project for this world')"
                                @click="
                                    () => {
                                        close();
                                        emit('use', world.path);
                                    }
                                "
                            >
                                <template #append>
                                    <kbd class="mb-discovered__kbd">{{ t("project.discovered.key.use", keyLabel(OPEN_KEY)) }}</kbd>
                                </template>
                            </v-list-item>
                            <v-list-item
                                :prepend-icon="mdiSelectAll"
                                :title="
                                    isChosen(world.path)
                                        ? t('project.discovered.menuUnchoose', 'Take it out of the selection')
                                        : t('project.discovered.menuChoose', 'Add it to the selection')
                                "
                                @click="
                                    () => {
                                        close();
                                        toggleChosen(world.path);
                                    }
                                "
                            >
                                <template #append>
                                    <kbd class="mb-discovered__kbd">{{ t("project.discovered.key.choose", keyLabel(CHOOSE_KEY)) }}</kbd>
                                </template>
                            </v-list-item>
                        </v-list>
                        <v-divider class="my-1" />
                    </template>
                </AppearanceTarget>
            </div>
        </v-card-text>
    </v-card>
</template>

<style scoped>
.mb-discovered {
    inline-size: 100%;
    border-radius: 16px;
    /* A visibly different treatment from the established projects list below it: a
       discovered world is available, not yet configured, and the border says so before a
       single word is read. */
    border: 1px dashed rgba(var(--v-theme-primary), 0.4);
}

.mb-discovered__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    /*
     * `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title. Flexing it (above) leaves
     * all three in place: `overflow: hidden` still clips, and the inherited `nowrap`
     * means the title cannot wrap even though it now shares its row with the "Look
     * again" button - so the bilingual title was silently cut off with no ellipsis and
     * no indication anything was missing. Same fix as `DockerWorldSourcePanel.vue`'s
     * `.mb-docker-world__card > .v-card-title`.
     */
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
}

.mb-discovered__blurb,
.mb-discovered__hint,
.mb-discovered__empty {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-discovered__mounts {
    margin-block: 8px;
    padding: 0;
    list-style: none;
}

.mb-discovered__mount {
    padding-block: 6px;
}

.mb-discovered__mount + .mb-discovered__mount {
    border-block-start: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.mb-discovered__mount-line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-discovered__mount-name {
    font-size: 0.875rem;
    font-weight: 500;
}

.mb-discovered__mount-path {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    overflow-wrap: anywhere;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-discovered__mount-state {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgb(var(--v-theme-warning));
    text-wrap: pretty;
}

.mb-discovered__mount-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 4px;
}

.mb-discovered__search {
    margin-block: 8px;
    max-width: 460px;
}

.mb-discovered__bulk {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block: 8px;
}

.mb-discovered__bulkcount {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-discovered__status {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8125rem;
    margin-block-start: 12px;
}

.mb-discovered__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-block-start: 8px;
}

.mb-discovered__rowhost {
    display: block;
}

.mb-discovered__row {
    display: flex;
    align-items: center;
    gap: 4px;
}

.mb-discovered__option {
    display: flex;
    flex: 1 1 auto;
    align-items: center;
    gap: 12px;
    min-block-size: 48px;
    min-inline-size: 0;
    padding: 8px 10px;
    border-radius: 8px;
    cursor: pointer;
}

.mb-discovered__option:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
}

.mb-discovered__option:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: -2px;
}

.mb-discovered__option[aria-selected="true"] {
    background: rgba(var(--v-theme-primary), 0.14);
}

.mb-discovered__text {
    display: flex;
    min-inline-size: 0;
    flex-direction: column;
}

.mb-discovered__name {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 2px;
    font-size: 0.9375rem;
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.mb-discovered__subtitle {
    font-size: 0.8125rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-discovered__actions {
    display: inline-flex;
    flex: 0 0 auto;
}

.mb-discovered__kbd {
    padding: 1px 6px;
    border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
    border-radius: 4px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

@media (max-width: 600px) {
    .mb-discovered__bulk {
        gap: 4px;
    }
}
</style>
