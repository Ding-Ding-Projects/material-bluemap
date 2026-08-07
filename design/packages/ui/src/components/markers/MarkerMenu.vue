<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { mdiArrowLeft, mdiClose, mdiFilterVariant, mdiMapMarkerOff } from "@mdi/js";
import MarkerRow from "./MarkerRow.vue";
import MarkerSetRow from "./MarkerSetRow.vue";
import MarkerSearchField from "./MarkerSearchField.vue";
import {
    createMarkerMatcher,
    filterMarkerSets,
    filterMarkers,
    findMarkerSetById,
    findPathToSet,
    markerDisplayLabel,
} from "./markerFilter.js";
import { MAX_SAMPLE_LENGTH } from "./regexEngine.js";
import { useMarkerI18n } from "./i18nHelpers.js";
import { MenuChoice } from "../menu/index.js";
import type { MenuChoiceItem } from "../menu/MenuChoice.vue";
import { useBlueMap } from "../menu/useBlueMap.js";
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import type { SearchMode, SortOrder } from "./markerFilter.js";
import type {
    AnyMarkerData,
    AnyMarkerSetData,
    FollowCapableControls,
    FollowCapableControlsData,
} from "./markerTypes.js";
import type { BlueMapApp, MainMenu, MenuPage } from "@worldlens/viewer";

const FILTERS_OPEN_KEY = "worldlens-marker-filters-open";
const EMPTY_POSITION = { x: 0, y: 0, z: 0 };

const props = defineProps<{
    /**
     * The running viewer. Optional: when the menu is rendered inside `MainMenu` the
     * instance arrives through the shared `blueMapKey` injection instead.
     */
    app?: BlueMapApp | null | undefined;
    /**
     * The page this list was opened with. `MainMenu` hands it to the `markers` slot, and
     * its `markerSet` field is the set to show, exactly as upstream's MarkerSetMenu read
     * `menu.currentPage().markerSet`.
     */
    page?: MenuPage | null | undefined;
    /** The set to list, when the caller has it directly rather than as a page. */
    markerSet?: AnyMarkerSetData | null | undefined;
    /**
     * Convenience entry point: look this set up by id in the tree, for example
     * `bm-players` for the player list. Ignored when a set or page is supplied.
     */
    rootSetId?: string | null | undefined;
    /**
     * The shared page stack. When supplied, drilling into a child set pushes a page onto
     * it exactly as upstream did, and this component renders no breadcrumb of its own
     * because the side sheet already shows one. Without it the menu keeps its own
     * drill-down stack and header, so it also works standalone.
     */
    menu?: MainMenu | null | undefined;
}>();

const emit = defineEmits<{
    /** A child set was opened. `title` is the full `parent > child` path. */
    "open-set": [set: AnyMarkerSetData, title: string];
    /** The visible page title changed, so a shell header can follow along. */
    "update:title": [title: string];
    /** A camera move or map switch failed. The shell may surface this as a notification. */
    error: [message: string];
}>();

const { t, tx } = useMarkerI18n();
const app = useBlueMap(() => props.app);

const rootSet = computed<AnyMarkerSetData | null>(
    () => app.value?.mapViewer.markers.data ?? null,
);
const controlsData = computed(() => app.value?.mapViewer.controlsManager.data ?? null);
const cameraPosition = computed(() => controlsData.value?.position ?? EMPTY_POSITION);

/** Where this instance starts: an explicit set, the page's set, a set by id, or the root. */
const entrySet = computed<AnyMarkerSetData | null>(() => {
    const root = rootSet.value;
    if (props.markerSet) return props.markerSet;

    const fromPage = props.page?.markerSet as AnyMarkerSetData | undefined;
    if (fromPage) return fromPage;

    if (props.rootSetId && root) return findMarkerSetById(root, props.rootSetId) ?? root;
    return root;
});

/** Drill-down stack, used only when no shared MainMenu page stack was supplied. */
const stack = ref<AnyMarkerSetData[]>([]);

const currentSet = computed<AnyMarkerSetData | null>(() => {
    if (props.menu) return entrySet.value;
    return stack.value[stack.value.length - 1] ?? entrySet.value;
});

function labelOf(set: AnyMarkerSetData): string {
    if (set.id === "bm-players") return t("players.title", "Players");
    return set.label || set.id;
}

/**
 * The `parent > child` chain upstream used for page titles. The root set is titled
 * "Markers", except on the player branch, which upstream opens as its own top-level page
 * titled "Players".
 */
function titleChain(set: AnyMarkerSetData): string[] {
    const root = rootSet.value;
    const chain = (root ? findPathToSet(root, set) : null) ?? [set];
    const labels: string[] = [];
    chain.forEach((node, index) => {
        if (index === 0 && node.id === "bm-root") {
            if (chain.length > 1 && chain[1]!.id === "bm-players") return;
            labels.push(t("markers.title", "Markers"));
            return;
        }
        labels.push(labelOf(node));
    });
    return labels.length > 0 ? labels : [t("markers.title", "Markers")];
}

const currentChain = computed(() =>
    currentSet.value ? titleChain(currentSet.value) : [t("markers.title", "Markers")],
);
const currentTitle = computed(() => currentChain.value.join(" > "));
const atRoot = computed(() => stack.value.length === 0);

watch(currentTitle, (title) => emit("update:title", title), { immediate: true });

/** Reset the drill-down when the map changes, so no stale set stays on screen. */
watch(
    () => app.value?.mapViewer.data.map?.id ?? null,
    () => {
        stack.value = [];
    },
);

// ---------------------------------------------------------------- filter state

/** Component-local and deliberately not persisted, matching upstream. */
const search = ref("");
const order = ref<SortOrder>("default");
const mode = ref<SearchMode>("text");
const flags = ref("i");

watch(currentSet, () => {
    search.value = "";
    order.value = "default";
    mode.value = "text";
    flags.value = "i";
});

const filtersOpen = ref(readFiltersOpen());

function readFiltersOpen(): boolean {
    try {
        return localStorage.getItem(FILTERS_OPEN_KEY) !== "false";
    } catch {
        return true;
    }
}

watch(filtersOpen, (open) => {
    try {
        localStorage.setItem(FILTERS_OPEN_KEY, String(open));
    } catch {
        // Storage can be unavailable (private mode). A collapse preference is not worth
        // interrupting the user over.
    }
    // Fire-and-forget mirror into the main process's own settings history, on top of the
    // localStorage write above - see `appSettingsHistorySync.ts`'s own doc comment.
    recordAppSetting("markerFiltersOpen", open);
});

const matcher = computed(() => createMarkerMatcher(search.value, mode.value, flags.value));
const searchError = computed(() => matcher.value.error);

const filteredSets = computed(() =>
    currentSet.value ? filterMarkerSets(currentSet.value.markerSets) : [],
);

const filteredMarkers = computed<AnyMarkerData[]>(() => {
    const set = currentSet.value;
    if (!set || matcher.value.error) return [];
    return filterMarkers(set.markers, matcher.value, order.value, cameraPosition.value);
});

/** Sample text the regex builder starts from: what is actually in this list. */
const sampleSeed = computed(() => {
    const set = currentSet.value;
    if (!set) return "";
    return set.markers
        .filter((marker) => marker.listed)
        .map(markerDisplayLabel)
        .join("\n")
        .slice(0, MAX_SAMPLE_LENGTH);
});

const hasMarkerSection = computed(() => (currentSet.value?.markers.length ?? 0) > 0);
const showDivider = computed(() => filteredSets.value.length > 0 && hasMarkerSection.value);
const isEmpty = computed(() => filteredSets.value.length === 0 && !hasMarkerSection.value);

const filterIsActive = computed(() => search.value.length > 0 || order.value !== "default");

const activeFilterSummary = computed(() => {
    const parts: string[] = [];
    if (search.value) {
        parts.push(
            mode.value === "regex"
                ? tx("markers.filterRegex", "regex: {query}", { query: search.value })
                : tx("markers.filterText", "text: {query}", { query: search.value }),
        );
    }
    if (order.value === "label") parts.push(t("markers.sort.by.label", "name"));
    if (order.value === "distance") parts.push(t("markers.sort.by.distance", "distance"));
    return parts.join(" · ");
});

function clearFilter(): void {
    search.value = "";
    order.value = "default";
    mode.value = "text";
}

const sortChoices = computed(() => [
    { id: "default" as SortOrder, name: t("markers.sort.by.default", "default") },
    { id: "label" as SortOrder, name: t("markers.sort.by.label", "name") },
    { id: "distance" as SortOrder, name: t("markers.sort.by.distance", "distance") },
]);

/**
 * `MenuChoice` hands back the whole choice object, whose id is a plain string because the
 * control knows nothing about sort orders. Looking the id up in the list it was built from
 * narrows it honestly, where an assertion would let anything through and write a value
 * `filterMarkers` has no branch for.
 */
function chooseOrder(choice: MenuChoiceItem): void {
    const chosen = sortChoices.value.find((candidate) => candidate.id === choice.id);
    if (chosen) order.value = chosen.id;
}

// ---------------------------------------------------------------- visibility

/**
 * Every set from the root down to the one on screen. A child that is switched on is still
 * not drawn if one of these is off, because three.js skips the whole subtree of an
 * invisible object. The rows say so rather than implying the markers are on the map. No
 * child flag is rewritten, so the per-set state stays exactly what upstream persisted.
 */
const chainVisible = computed(() => {
    const root = rootSet.value;
    const set = currentSet.value;
    if (!root || !set) return true;
    return (findPathToSet(root, set) ?? [set]).every((node) => node.visible);
});

// ---------------------------------------------------------------- navigation

const busyMarkerId = ref<string | null>(null);
const errorMessage = ref<string | null>(null);
let navigating = false;

const followingId = computed(() => {
    const data = controlsData.value?.controls as FollowCapableControlsData | null | undefined;
    return data?.followingPlayer?.id ?? null;
});

/**
 * Upstream's MarkerItem click, kept step for step: stop following first, resolve a foreign
 * player's map and switch to it, optionally start following, then move the camera.
 * `controlsManager.controls` is null during a view transition, so it is re-read and guarded
 * after every await. Re-entry is refused while one navigation is still running, because
 * the map lookup can take seconds and a second click would race the first.
 */
async function activate(marker: AnyMarkerData, follow: boolean): Promise<void> {
    const instance = app.value;
    if (!instance || navigating) return;

    navigating = true;
    busyMarkerId.value = marker.id;
    errorMessage.value = null;

    try {
        const manager = instance.mapViewer.controlsManager;
        (manager.controls as FollowCapableControls | null)?.stopFollowingPlayerMarker?.();

        if (marker.type === "player") {
            if (marker.foreign) {
                const matchingMap = await instance.findPlayerMap(marker.playerUuid ?? "");
                if (!matchingMap) {
                    errorMessage.value = tx(
                        "markers.playerNotFound",
                        "That player is not on any loaded map right now.",
                    );
                    return;
                }
                await instance.switchMap(matchingMap.data.id);
            }

            const controls = instance.mapViewer.controlsManager
                .controls as FollowCapableControls | null;
            if (follow && controls?.followPlayerMarker && marker.visible) {
                controls.followPlayerMarker(marker);
            }
        } else if (!marker.visible) {
            return;
        }

        instance.mapViewer.controlsManager.position.copy(marker.position);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errorMessage.value = message;
        emit("error", message);
    } finally {
        navigating = false;
        busyMarkerId.value = null;
    }
}

function openSet(set: AnyMarkerSetData): void {
    const title = titleChain(set).join(" > ");

    if (props.menu) {
        const page = props.menu.currentPage();
        // A title thunk keeps the heading re-translating when the language changes;
        // upstream stored a fixed string here and froze it in the old language.
        props.menu.openPage(page.id, () => titleChain(set).join(" > "), { markerSet: set });
    } else {
        stack.value = [...stack.value, set];
    }

    emit("open-set", set, title);
}

function back(): void {
    if (props.menu) {
        props.menu.closePage();
        return;
    }
    stack.value = stack.value.slice(0, -1);
}

defineExpose({ back, atRoot, title: currentTitle, path: currentChain });
</script>

<template>
    <div class="mb-marker-menu">
        <div v-if="!currentSet" class="mb-marker-menu__empty">
            <p>{{ t("map.unloaded", "No map loaded.") }}</p>
        </div>

        <template v-else>
            <header v-if="!props.menu" class="mb-marker-menu__header">
                <v-btn
                    :icon="mdiArrowLeft"
                    variant="text"
                    density="comfortable"
                    :disabled="atRoot"
                    :aria-label="tx('markers.back', 'Back to the previous marker set')"
                    @click="back"
                />
                <div class="mb-marker-menu__heading">
                    <div v-if="currentChain.length > 1" class="mb-marker-menu__crumbs text-caption">
                        {{ currentChain.slice(0, -1).join(" > ") }}
                    </div>
                    <h2 class="mb-marker-menu__title text-subtitle-1">
                        {{ currentChain[currentChain.length - 1] }}
                    </h2>
                </div>
            </header>

            <v-alert
                v-if="errorMessage"
                type="error"
                variant="tonal"
                density="compact"
                closable
                class="mb-marker-menu__notice"
                :close-label="tx('markers.dismiss', 'Dismiss')"
                @click:close="errorMessage = null"
            >
                {{ errorMessage }}
            </v-alert>

            <div class="mb-marker-menu__scroll">
                <v-list
                    v-if="filteredSets.length > 0"
                    class="mb-marker-menu__list"
                    density="comfortable"
                    :aria-label="tx('markers.setList', 'Marker sets')"
                >
                    <MarkerSetRow
                        v-for="set of filteredSets"
                        :key="set.id"
                        :marker-set="set"
                        :ancestors-visible="chainVisible"
                        @open="openSet"
                    />
                </v-list>

                <v-divider v-if="showDivider" class="mb-marker-menu__divider" />

                <template v-if="hasMarkerSection">
                    <div class="mb-marker-menu__filters">
                        <div class="mb-marker-menu__filters-head">
                            <v-btn
                                :icon="mdiFilterVariant"
                                variant="text"
                                density="comfortable"
                                :aria-expanded="filtersOpen"
                                aria-controls="mb-marker-filters"
                                :aria-label="
                                    filtersOpen
                                        ? tx(
                                              'markers.hideFilters',
                                              'Hide the search and sort controls',
                                          )
                                        : tx(
                                              'markers.showFilters',
                                              'Show the search and sort controls',
                                          )
                                "
                                @click="filtersOpen = !filtersOpen"
                            />
                            <span class="text-caption text-medium-emphasis">
                                {{ tx("markers.filters", "Search and sort") }}
                            </span>
                            <v-chip
                                v-if="!filtersOpen && filterIsActive"
                                size="small"
                                variant="tonal"
                                color="primary"
                                closable
                                :close-label="tx('markers.clearFilter', 'Clear the filter')"
                                @click:close="clearFilter"
                            >
                                {{ activeFilterSummary }}
                            </v-chip>
                        </div>

                        <div
                            v-show="filtersOpen"
                            id="mb-marker-filters"
                            class="mb-marker-menu__filter-body"
                        >
                            <MarkerSearchField
                                v-model="search"
                                v-model:mode="mode"
                                v-model:flags="flags"
                                :error="searchError"
                                :sample-seed="sampleSeed"
                            />

                            <!--
                                No role or aria-label here: MenuChoice's own toggle carries
                                role="group" labelled by its title, and naming the group
                                twice would nest one group inside another.
                            -->
                            <MenuChoice
                                class="mb-marker-menu__sort"
                                :title="t('markers.sort.title', 'Sort by')"
                                :choices="sortChoices"
                                :selection="order"
                                @choice="chooseOrder"
                            />
                        </div>
                    </div>

                    <v-alert
                        v-if="!chainVisible"
                        type="info"
                        variant="tonal"
                        density="compact"
                        class="mb-marker-menu__notice"
                        :icon="mdiMapMarkerOff"
                    >
                        {{
                            tx(
                                "markers.setHidden",
                                "This set is switched off, so its markers are not drawn on the map.",
                            )
                        }}
                    </v-alert>

                    <v-alert
                        v-if="searchError"
                        type="error"
                        variant="tonal"
                        density="compact"
                        class="mb-marker-menu__notice"
                    >
                        {{
                            tx(
                                "markers.badPattern",
                                "That regular expression will not compile: {error}",
                                { error: searchError },
                            )
                        }}
                    </v-alert>

                    <v-list
                        v-else-if="filteredMarkers.length > 0"
                        class="mb-marker-menu__list"
                        density="comfortable"
                        :aria-label="t('markers.title', 'Markers')"
                    >
                        <MarkerRow
                            v-for="marker of filteredMarkers"
                            :key="marker.id"
                            :marker="marker"
                            :debug="app?.appState.debug === true"
                            :following-id="followingId"
                            :busy="busyMarkerId === marker.id"
                            @activate="activate"
                        />
                    </v-list>

                    <div v-else class="mb-marker-menu__empty">
                        <p>{{ tx("markers.noMatches", "No marker matches this search.") }}</p>
                        <v-btn
                            v-if="filterIsActive"
                            size="small"
                            variant="tonal"
                            :prepend-icon="mdiClose"
                            @click="clearFilter"
                        >
                            {{ tx("markers.clearFilter", "Clear the filter") }}
                        </v-btn>
                    </div>
                </template>

                <div v-if="isEmpty" class="mb-marker-menu__empty">
                    <p>{{ tx("markers.emptySet", "This marker set has nothing in it.") }}</p>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.mb-marker-menu {
    /* The app shell sets pointer-events: none on <v-main> so the map stays draggable;
       every interactive panel has to opt back in. */
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    height: 100%;
    color: rgb(var(--v-theme-on-surface));
}

.mb-marker-menu__header {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.5rem 0.25rem;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-marker-menu__heading {
    min-width: 0;
}

.mb-marker-menu__crumbs {
    opacity: 0.7;
    word-break: break-word;
}

.mb-marker-menu__title {
    margin: 0;
    font-weight: 500;
    word-break: break-word;
}

.mb-marker-menu__scroll {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
}

.mb-marker-menu__list {
    background: transparent;
    padding-block: 0;
}

.mb-marker-menu__divider {
    margin-block: 0.25rem;
}

.mb-marker-menu__filters {
    position: sticky;
    top: 0;
    z-index: 1;
    background: rgb(var(--v-theme-surface));
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.mb-marker-menu__filters-head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
    min-width: 0;
}

.mb-marker-menu__filter-body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
}

/*
 * The segmented control is `MenuChoice`, which pads itself for the side sheet's
 * edge-to-edge rows; inside the filter body that inset is already there, so only the
 * padding is overridden here. The label casing stays local too: these are three words
 * naming an order, not commands, so they read as words rather than as SHOUTED buttons.
 */
.mb-marker-menu__sort {
    padding-inline: 0;
}

.mb-marker-menu__sort :deep(.v-btn) {
    text-transform: none;
    letter-spacing: normal;
}

.mb-marker-menu__notice {
    margin: 0.5rem 0.75rem;
}

.mb-marker-menu__empty {
    padding: 1.5rem 1rem;
    text-align: center;
    color: rgba(var(--v-theme-on-surface), 0.7);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
}

.mb-marker-menu__empty p {
    margin: 0;
}

.mb-marker-menu :deep(.v-btn:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-marker-menu :deep(*) {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
