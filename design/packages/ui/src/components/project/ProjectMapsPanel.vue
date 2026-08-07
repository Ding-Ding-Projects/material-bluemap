<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowDown,
    mdiArrowUp,
    mdiDeleteOutline,
    mdiMap,
    mdiMapPlus,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VSelect,
    VSpacer,
    VSwitch,
    VTextField,
} from "vuetify/components";
import { DIMENSION_OPTIONS, type FieldMeta, type PlainValue, type ProjectFile } from "@material-bluemap/config";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { GlossaryTerm } from "../glossary/index.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import { clearFieldValue, replaceText, setFieldValue } from "../config/configModel.js";
import { UNKNOWN_WORLD, type WorldOrientation } from "../config/maskCanvas.js";
import { inspectMaskWorld } from "../config/maskWorld.js";
import {
    PROJECT_PRESETS,
    applyPreset,
    findMap,
    mapIdProblem,
    mapIds,
    openMapFile,
    orderedMaps,
    presetApplicationLines,
    previewMapId,
    storageIds,
    withMapAdded,
    withMapConfig,
    withMapEnabled,
    withMapIdentity,
    withMapMoved,
    withMapRemoved,
    type ProjectPreset,
} from "./projectModel.js";

/**
 * A project's maps: the list, the identity of the one selected, and every setting in its
 * `maps/<id>.conf`.
 *
 * The settings themselves are rendered by `../config/ConfigFileForm.vue`, which is the
 * component the options editor already uses for all ninety-odd of them. Nothing here names
 * a setting: the groups, the controls, the documentation and the defaults are read from
 * `@material-bluemap/config`, so a setting added to the schema appears here with no change
 * to this file.
 *
 * ## Why this is not `../config/MapsScreen.vue`
 *
 * That screen edits a `ConfigWorkspace`, which is a folder of files keyed by file name, and
 * derives a map's id from its file name with `sanitiseMapId` - a rule that allows capitals
 * because it mirrors what BlueMap derives from a file on disk. A project keeps its maps as
 * records with an explicit id that the project schema constrains to `[a-z0-9_-]`, plus two
 * facts a config folder has nowhere to put: which storage the map belongs to, and whether
 * it takes part in a render at all. Routing a project through a workspace and back would
 * lose the second of those on every save, and would apply the looser id rule on the way.
 *
 * So the layout and the behaviour follow that screen deliberately - list on the left,
 * editor on the right, its own search with the anchored builder, the two-key gate on the
 * delete - while the identity above the form is the project's own.
 */
const props = withDefaults(
    defineProps<{
        project: ProjectFile;
        /** The world folder the project lives at the root of; the generated config's `world`. */
        world: string;
        selectedId?: string | null;
        highlightPath?: string | null;
        /** The platform separator, so generated paths read the way the platform writes them. */
        separator?: string;
        /** Where the app writes renders, used as the root of a preset's file storage. */
        defaultRoot?: string;
    }>(),
    { selectedId: null, highlightPath: null, separator: "/", defaultRoot: "" },
);

const emit = defineEmits<{
    "update:project": [value: ProjectFile];
    "update:selectedId": [value: string | null];
    consent: [];
    notify: [message: string];
}>();

const { t } = useI18n();
const uid = useId();
const createNameId = `${uid}-new-map-name`;
const selectedNameId = `${uid}-selected-map-name`;

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so the
 * optional pass-through is normalised once here rather than coalesced at the binding.
 */
const highlight = computed(() => props.highlightPath ?? null);

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a map name, and `m` because a
// row's searchable text is several lines, so `^` and `$` are only useful per line.
const flags = ref("im");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const maps = computed(() => orderedMaps(props.project));

function rowText(id: string, name: string, dimension: string): string {
    return `${name}\n${id}\n${dimension}`;
}

const listed = computed(() => maps.value.filter((map) => matcher.value.test(rowText(map.id, map.name, map.dimension))));

const searchSummary = computed(() =>
    matcher.value.error !== null
        ? t("project.maps.badPattern", "The pattern is not valid, so nothing is listed.")
        : matcher.value.active
          ? t("project.maps.listSummary", { shown: listed.value.length, total: maps.value.length }, "{shown} of {total} maps match.")
          : "",
);

const selected = computed(() => (props.selectedId === null ? undefined : findMap(props.project, props.selectedId)));
const maskWorld = ref<WorldOrientation>(UNKNOWN_WORLD);
let maskWorldRead = 0;

watch(
    [() => props.world, () => selected.value?.dimension ?? "minecraft:overworld"],
    async ([folder, dimension]) => {
        const read = ++maskWorldRead;
        const measured = await inspectMaskWorld(folder, dimension);
        if (read === maskWorldRead) maskWorld.value = measured;
    },
    { immediate: true },
);

/**
 * Keeps a selection pointing at a map that is really there.
 *
 * Renaming a map changes its id, and deleting one takes it away entirely, so a selection
 * held by id goes stale in both cases. Left alone the panel would show its empty state
 * immediately after a rename, which reads as the map having been lost.
 */
watch(
    () => props.project,
    () => {
        if (props.selectedId !== null && findMap(props.project, props.selectedId) !== undefined) return;
        emit("update:selectedId", maps.value[0]?.id ?? null);
    },
    { immediate: true },
);

const file = computed(() => (selected.value === undefined ? null : openMapFile(selected.value)));

const storages = computed(() => storageIds(props.project));

const dimensionItems = computed(() => {
    const known = DIMENSION_OPTIONS.map((option) => ({ value: String(option.value), title: option.label }));
    const current = selected.value?.dimension;
    // A world may hold a dimension this build has never heard of. Adding it to the list is
    // what stops the select from silently showing nothing for a perfectly valid value.
    if (current !== undefined && !known.some((item) => item.value === current)) {
        known.push({ value: current, title: current });
    }
    return known;
});

/* -------------------------------------------------------------------------- */
/* Editing the selected map's settings                                        */
/* -------------------------------------------------------------------------- */

function onSet(field: FieldMeta, value: PlainValue): void {
    const map = selected.value;
    const open = file.value;
    if (map === undefined || open === null) return;
    emit("update:project", withMapConfig(props.project, map.id, setFieldValue(open, field, value).text));
}

function onClear(field: FieldMeta): void {
    const map = selected.value;
    const open = file.value;
    if (map === undefined || open === null) return;
    emit("update:project", withMapConfig(props.project, map.id, clearFieldValue(open, field).text));
}

function onRawText(text: string): void {
    const map = selected.value;
    const open = file.value;
    if (map === undefined || open === null) return;
    emit("update:project", withMapConfig(props.project, map.id, replaceText(open, text).text));
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The id being typed into the rename field, held apart from the map until it is applied.
 *
 * Applying every keystroke would rename the map to `n`, then `ne`, then `net` on the way to
 * `nether`, and each of those is a real id change that rewrites the config text. So the
 * field holds a draft, the preview shows what it will become, and Apply is what commits it.
 */
const draftId = ref("");
const draftIdTouched = ref(false);

watch(
    selected,
    (map) => {
        draftId.value = map?.id ?? "";
        draftIdTouched.value = false;
    },
    { immediate: true },
);

/** The id the draft becomes, shown live under the field. This is the whole point of it. */
const draftPreview = computed(() => previewMapId(draftId.value));

const draftProblem = computed(() => {
    const map = selected.value;
    if (map === undefined) return null;
    if (draftPreview.value === map.id) return null;
    return mapIdProblem(draftPreview.value, mapIds(props.project, map.id));
});

const draftProblemText = computed(() => {
    const problem = draftProblem.value;
    // `t(key, named, fallback)`, and no filling afterwards: vue-i18n compiles the fallback
    // as a message too, so it consumes `{id}` as a named parameter of its own and the id
    // the message is complaining about is already gone by the time anything else could
    // substitute it. The values have to go in before the message is compiled.
    return problem === null ? "" : t(problem.key, problem.vars ?? {}, problem.fallback);
});

const draftDiffers = computed(() => selected.value !== undefined && draftPreview.value !== selected.value.id);

function applyId(): void {
    const map = selected.value;
    if (map === undefined || !draftDiffers.value || draftProblem.value !== null) return;
    const next = draftPreview.value;
    emit("update:project", withMapIdentity(props.project, map.id, { id: next }));
    emit("update:selectedId", next);
    emit(
        "notify",
        t(
            "project.maps.renamed",
            { from: map.id, to: next },
            "The map id is now {to}. Tiles already rendered under {from} stay where they are; nothing here moves or deletes them.",
        ),
    );
}

function setName(name: string): void {
    const map = selected.value;
    if (map === undefined) return;
    emit("update:project", withMapIdentity(props.project, map.id, { name }));
}

function setDimension(dimension: string): void {
    const map = selected.value;
    if (map === undefined) return;
    emit("update:project", withMapIdentity(props.project, map.id, { dimension }));
}

function setSorting(sorting: number): void {
    const map = selected.value;
    if (map === undefined || !Number.isFinite(sorting)) return;
    emit("update:project", withMapIdentity(props.project, map.id, { sorting: Math.trunc(sorting) }));
}

function setStorage(storage: string): void {
    const map = selected.value;
    if (map === undefined) return;
    emit("update:project", withMapIdentity(props.project, map.id, { storage }));
}

function setEnabled(enabled: boolean): void {
    const map = selected.value;
    if (map === undefined) return;
    emit("update:project", withMapEnabled(props.project, map.id, enabled));
}

function move(delta: -1 | 1): void {
    const map = selected.value;
    if (map === undefined) return;
    emit("update:project", withMapMoved(props.project, map.id, delta));
}

const position = computed(() => maps.value.findIndex((map) => map.id === (selected.value?.id ?? "")));
const canMoveUp = computed(() => position.value > 0);
const canMoveDown = computed(() => position.value >= 0 && position.value < maps.value.length - 1);

/* -------------------------------------------------------------------------- */
/* Adding one                                                                 */
/* -------------------------------------------------------------------------- */

const createOpen = ref(false);
const createName = ref("");
const createId = ref("");
const createIdTouched = ref(false);
const createDimension = ref("minecraft:overworld");

/**
 * The id a new map's name becomes, live, while the name is being typed.
 *
 * This is the preview the whole feature turns on. The id is a folder on disk and a segment
 * of the URL a tile is served from, so somebody typing `My World!` sees `my-world-` while
 * they are typing rather than meeting it for the first time in a path three screens later.
 * Editing the id field directly stops it following the name, exactly as the guide's own
 * identity step does.
 */
const createIdPreview = computed(() => previewMapId(createIdTouched.value ? createId.value : createName.value));

const createProblem = computed(() => mapIdProblem(createIdPreview.value, mapIds(props.project)));

const createProblemText = computed(() => {
    const problem = createProblem.value;
    return problem === null ? "" : t(problem.key, problem.vars ?? {}, problem.fallback);
});

const createDimensionItems = computed(() =>
    DIMENSION_OPTIONS.map((option) => ({ value: String(option.value), title: option.label })),
);

async function openCreate(): Promise<void> {
    createName.value = "";
    createId.value = "";
    createIdTouched.value = false;
    createDimension.value = "minecraft:overworld";
    createOpen.value = true;
    await nextTick();
    document.getElementById(createNameId)?.focus();
}

async function confirmCreate(): Promise<void> {
    if (createProblem.value !== null) return;
    const id = createIdPreview.value;
    const name = createName.value.trim() === "" ? id : createName.value.trim();

    emit(
        "update:project",
        withMapAdded(props.project, {
            id,
            name,
            dimension: createDimension.value,
            world: props.world,
            separator: props.separator,
        }),
    );
    emit("update:selectedId", id);
    emit(
        "notify",
        t(
            "project.maps.added",
            { id },
            "Added the map {id}, written from BlueMap's own template so every setting arrives explained. Nothing is on disk until the project is saved.",
        ),
    );
    createOpen.value = false;
    await nextTick();
    await nextTick();
    document.getElementById(selectedNameId)?.focus();
}

/* -------------------------------------------------------------------------- */
/* Presets: the guided empty state                                           */
/* -------------------------------------------------------------------------- */

/**
 * Preset cards, shown only alongside the true empty state - `maps.length === 0`, not
 * `listed.length === 0`, so a search that happens to match nothing does not surface a set
 * of cards that would create maps the search was trying to find, not add.
 *
 * Every preset composes with the ordinary "Add a map" flow above rather than replacing it:
 * `applyPreset` never overwrites a map, storage or singleton this project already has, so
 * pressing one of these is safe even after somebody has already added maps by hand.
 */
/**
 * Written as a literal `t("<key>", fallback)` per case, on purpose, rather than a lookup
 * table keyed by `preset.id`: a dynamic key is invisible to `catalogueCoverage.test.ts`'s
 * (and this task's own `presets.test.ts`) static scan for real call sites, so a table here
 * would look wired while translating nothing anywhere that actually checks.
 */
function presetTitle(preset: ProjectPreset): string {
    switch (preset.id) {
        case "overworldOnly":
            return t("project.presets.overworldOnly.title", "Start from BlueMap's defaults");
        case "allDimensions":
            return t("project.presets.allDimensions.title", "Overworld, Nether and End");
        case "webServerOff":
            return t("project.presets.webServerOff.title", "All three dimensions, no web server");
        case "fastRender":
            return t("project.presets.fastRender.title", "All three dimensions, faster renders");
    }
}

function presetDescription(preset: ProjectPreset): string {
    switch (preset.id) {
        case "overworldOnly":
            return t(
                "project.presets.overworldOnly.description",
                "Creates one map, the Overworld, written from BlueMap's own template, plus a file storage for its tiles. Every value stays editable afterwards.",
            );
        case "allDimensions":
            return t(
                "project.presets.allDimensions.description",
                "Creates three maps, Overworld, Nether and End, each written from BlueMap's own per-dimension template, sharing one file storage.",
            );
        case "webServerOff":
            return t(
                "project.presets.webServerOff.description",
                "The same three maps as Overworld, Nether and End, plus a webserver.conf that explicitly switches the built-in web server off, for a render-only setup.",
            );
        case "fastRender":
            return t(
                "project.presets.fastRender.description",
                "The same three maps, Overworld, Nether and End, each with its hires layer switched off (enable-hires set to false), which speeds up rendering and shrinks the files, at the cost of close-up 3D detail.",
            );
    }
}

async function usePreset(preset: ProjectPreset): Promise<void> {
    const application = applyPreset(props.project, preset, {
        world: props.world,
        storageRoot: props.defaultRoot,
        separator: props.separator,
    });
    emit("update:project", application.project);
    emit("update:selectedId", application.mapsAdded[0] ?? maps.value[0]?.id ?? null);
    emit("notify", presetApplicationLines(preset, application, t).join(" "));
    await nextTick();
    await nextTick();
    document.getElementById(selectedNameId)?.focus();
}

/* -------------------------------------------------------------------------- */
/* Removing one                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What removing a map costs, said as the gate requires: exactly, and without softening.
 *
 * The tile note is the one people get wrong. Removing a map stops it being rendered and
 * stops it being served, and leaves every tile already drawn exactly where it is - so
 * somebody doing this to reclaim disk space gets none of it back, and somebody doing it to
 * hide a map has left the tiles readable to anything already pointed at them.
 */
const removalCosts = computed(() => {
    const map = selected.value;
    if (map === undefined) return [];
    return [
        t("project.maps.deleteMap", { id: map.id, name: map.name }, "The map {name}, id {id}"),
        t("project.maps.deleteSettings", "Every setting in its config, including anything tuned by hand"),
        t(
            "project.maps.deleteTiles",
            { id: map.id },
            "Tiles already rendered under {id} are NOT deleted. They stay on the disk, and the space is not coming back; remove them yourself if you want it.",
        ),
    ];
});

function confirmRemoval(): void {
    const map = selected.value;
    if (map === undefined) return;
    emit("update:project", withMapRemoved(props.project, map.id));
    emit("update:selectedId", null);
    emit("notify", t("project.maps.deleted", { id: map.id }, "The map {id} is out of this project. It is written when you save."));
}
</script>

<template>
    <div class="mb-project-maps">
        <aside class="mb-project-maps__list" :aria-label="t('project.maps.listLabel', 'Maps in this project')">
            <p class="mb-project-maps__glossaryLine">
                <GlossaryTerm term="map" />
                <GlossaryTerm term="render" />
            </p>
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('project.maps.search', 'Search maps')"
                :placeholder="t('project.maps.searchHint', 'name, id or dimension')"
                :sample="maps.map((map) => rowText(map.id, map.name, map.dimension)).join('\n')"
                :summary="searchSummary"
            />

            <v-list density="compact" nav class="mt-2" :aria-label="t('project.maps.listLabel', 'Maps in this project')">
                <v-list-item
                    v-for="map in listed"
                    :key="map.id"
                    :active="map.id === selectedId"
                    :prepend-icon="mdiMap"
                    :title="map.name"
                    :subtitle="map.id"
                    @click="emit('update:selectedId', map.id)"
                >
                    <template #append>
                        <v-chip v-if="!map.enabled" size="x-small" variant="tonal">
                            {{ t("project.maps.offChip", "off") }}
                        </v-chip>
                    </template>
                </v-list-item>
            </v-list>

            <p v-if="listed.length === 0" class="mb-project-maps__note">
                {{
                    maps.length === 0
                        ? t(
                              "project.maps.none",
                              "A map renders one dimension of this world with its own look and settings. This project has no maps yet, so add one below to say what gets rendered.",
                          )
                        : t("project.maps.noMatch", "No map matches that search.")
                }}
            </p>

            <v-btn :prepend-icon="mdiMapPlus" color="primary" variant="tonal" block class="mt-2" @click="openCreate">
                {{ t("project.maps.new", "Add a map") }}
            </v-btn>

            <!--
                The guided empty state. Shown only when the project truly has no maps yet -
                not merely when a search matches none - so nobody is offered a preset that
                would create the very map their search failed to find. Every card composes
                with "Add a map" above rather than replacing it: applying one never overwrites
                a map, storage or singleton the project already has, so there is no gate here.
            -->
            <template v-if="maps.length === 0">
                <p class="mb-project-maps__presetsHeading">{{ t("project.presets.heading", "Or start from a preset") }}</p>
                <div
                    class="mb-project-maps__presets"
                    role="list"
                    :aria-label="t('project.presets.heading', 'Or start from a preset')"
                >
                    <v-card
                        v-for="preset in PROJECT_PRESETS"
                        :key="preset.id"
                        variant="outlined"
                        role="listitem"
                        class="mb-project-maps__preset"
                    >
                        <v-card-title class="mb-project-maps__presetTitle">{{ presetTitle(preset) }}</v-card-title>
                        <v-card-text class="mb-project-maps__presetDesc">{{ presetDescription(preset) }}</v-card-text>
                        <v-card-actions>
                            <v-btn variant="tonal" color="primary" size="small" block @click="usePreset(preset)">
                                {{ t("project.presets.apply", "Use this preset") }}
                            </v-btn>
                        </v-card-actions>
                    </v-card>
                </div>
            </template>

            <!--
                Adding a map is a form somebody completes or cancels, so it needs their
                attention - but it does not need the rest of the application taken away
                while they fill it in. It opens in place, under the button that asked for
                it, rather than as a dialog: nothing behind it has to be stopped, and the
                map list it is about stays readable beside it.
            -->
            <v-card v-if="createOpen" variant="tonal" class="mb-project-maps__create mt-2">
                <v-card-title>{{ t("project.maps.newTitle", "Add a map to this project") }}</v-card-title>
                <v-card-text class="mb-project-maps__form">
                    <v-text-field
                        :id="createNameId"
                        v-model="createName"
                        :label="t('project.maps.name', 'Name shown in the web app')"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />
                    <v-text-field
                        v-model="createId"
                        :label="t('project.maps.id', 'Map id')"
                        :placeholder="createIdPreview"
                        :error-messages="createProblemText ? [createProblemText] : []"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                        hide-details="auto"
                        @update:model-value="createIdTouched = true"
                    />
                    <p class="mb-project-maps__preview" aria-live="polite">
                        {{
                            createIdPreview === ""
                                ? t("project.maps.idPreviewEmpty", "Type a name and the id appears here.")
                                : t(
                                      "project.maps.idPreviewNew",
                                      { id: createIdPreview },
                                      "Becomes the folder and the address segment {id}",
                                  )
                        }}
                    </p>
                    <v-select
                        v-model="createDimension"
                        :items="createDimensionItems"
                        :label="t('project.maps.dimension', 'Dimension')"
                        item-title="title"
                        item-value="value"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />

                    <v-alert v-if="createProblemText" type="warning" density="compact" variant="tonal">
                        {{ createProblemText }}
                    </v-alert>
                    <p class="mb-project-maps__note">
                        {{
                            t(
                                "project.maps.templateNote",
                                "The map is written from BlueMap's own template for that dimension, so it arrives with every setting explained in place. Every one of them is editable here before anything renders.",
                            )
                        }}
                    </p>
                </v-card-text>
                <v-divider />
                <v-card-actions>
                    <v-btn variant="text" @click="createOpen = false">{{ t("project.maps.cancel", "Cancel") }}</v-btn>
                    <v-spacer />
                    <v-btn color="primary" variant="flat" :disabled="createProblem !== null" @click="confirmCreate">
                        {{ t("project.maps.create", "Add the map") }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </aside>

        <section class="mb-project-maps__editor">
            <template v-if="selected && file">
                <v-card variant="tonal" class="mb-project-maps__identity">
                    <v-card-text>
                        <div class="mb-project-maps__grid">
                            <v-text-field
                                :id="selectedNameId"
                                :model-value="selected.name"
                                :label="t('project.maps.name', 'Name shown in the web app')"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                @update:model-value="setName"
                            />

                            <div class="mb-project-maps__id">
                                <v-text-field
                                    v-model="draftId"
                                    :label="t('project.maps.id', 'Map id')"
                                    :error-messages="draftProblemText ? [draftProblemText] : []"
                                    variant="outlined"
                                    density="compact"
                                    spellcheck="false"
                                    autocapitalize="off"
                                    hide-details="auto"
                                    @update:model-value="draftIdTouched = true"
                                />
                                <!--
                                    The live preview. `aria-live` because the text under the
                                    field changes as a consequence of typing elsewhere in it,
                                    which a screen-reader user would otherwise never hear.
                                -->
                                <p class="mb-project-maps__preview" aria-live="polite">
                                    {{
                                        t(
                                            "project.maps.idPreview",
                                            { id: draftPreview },
                                            "Becomes the folder and the address segment {id}",
                                        )
                                    }}
                                </p>
                                <v-btn
                                    v-if="draftDiffers"
                                    :disabled="draftProblem !== null"
                                    variant="tonal"
                                    size="small"
                                    @click="applyId"
                                >
                                    {{ t("project.maps.applyId", { id: draftPreview }, "Rename to {id}") }}
                                </v-btn>
                            </div>

                            <v-select
                                :model-value="selected.dimension"
                                :items="dimensionItems"
                                :label="t('project.maps.dimension', 'Dimension')"
                                item-title="title"
                                item-value="value"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                @update:model-value="setDimension"
                            />

                            <v-select
                                :model-value="selected.storage"
                                :items="storages"
                                :label="t('project.maps.storage', 'Storage the tiles go into')"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                @update:model-value="setStorage"
                            />

                            <v-text-field
                                :model-value="selected.sorting"
                                :label="t('project.maps.sorting', 'Sorting')"
                                :hint="t('project.maps.sortingHint', 'Lower sorts first in the web app\'s map list.')"
                                type="number"
                                variant="outlined"
                                density="compact"
                                hide-details="auto"
                                @update:model-value="(value: string) => setSorting(Number(value))"
                            />

                            <v-switch
                                :model-value="selected.enabled"
                                :label="
                                    selected.enabled
                                        ? t('project.maps.enabled', 'Rendered when this project runs')
                                        : t('project.maps.disabled', 'Kept in the project, not rendered')
                                "
                                color="primary"
                                density="compact"
                                hide-details
                                inset
                                @update:model-value="(value: boolean | null) => setEnabled(value === true)"
                            />
                        </div>

                        <div class="mb-project-maps__actions">
                            <v-btn
                                :prepend-icon="mdiArrowUp"
                                :disabled="!canMoveUp"
                                variant="text"
                                size="small"
                                :aria-label="t('project.maps.moveUpOne', { name: selected.name }, 'Move {name} earlier in the list')"
                                @click="move(-1)"
                            >
                                {{ t("project.maps.moveUp", "Earlier") }}
                            </v-btn>
                            <v-btn
                                :prepend-icon="mdiArrowDown"
                                :disabled="!canMoveDown"
                                variant="text"
                                size="small"
                                :aria-label="t('project.maps.moveDownOne', { name: selected.name }, 'Move {name} later in the list')"
                                @click="move(1)"
                            >
                                {{ t("project.maps.moveDown", "Later") }}
                            </v-btn>

                            <v-spacer />

                            <ConfigSuperConfirm
                                :title="t('project.maps.deleteTitle', 'Take this map out of the project')"
                                :action="
                                    t(
                                        'project.maps.deleteAction',
                                        { id: selected.id },
                                        'This removes the map {id} and every setting it holds from this project when you save. It cannot be undone from here.',
                                    )
                                "
                                :affected="removalCosts"
                                :confirm-label="t('project.maps.deleteConfirm', { id: selected.id }, 'Remove the map {id}')"
                                @confirm="confirmRemoval"
                            >
                                <template #activator="{ props: activatorProps }">
                                    <v-btn v-bind="activatorProps" :prepend-icon="mdiDeleteOutline" color="error" variant="tonal" size="small">
                                        {{ t("project.maps.delete", "Remove this map") }}
                                    </v-btn>
                                </template>
                            </ConfigSuperConfirm>
                        </div>
                    </v-card-text>
                </v-card>

                <ConfigFileForm
                    :file="file"
                    :title="selected.name"
                    :subtitle="
                        t(
                            'project.maps.formSubtitle',
                            { id: selected.id },
                            'Map {id}. Everything BlueMap reads about this map lives in this one file, and all of it can be set before a render starts.',
                        )
                    "
                    :highlight-path="highlight"
                    :world="maskWorld"
                    @set="onSet"
                    @clear="onClear"
                    @consent="emit('consent')"
                    @update:text="onRawText"
                />
            </template>

            <p v-else class="mb-project-maps__note">
                {{ t("project.maps.pick", "Pick a map on the left, or add one.") }}
            </p>
        </section>

    </div>
</template>

<style>
.mb-project-maps {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
    min-inline-size: 0;
}

/* One column when this editor's own panel is narrow, including high display scales. */
@container project-editor (max-width: 60rem) {
    .mb-project-maps {
        grid-template-columns: minmax(0, 1fr);
    }
}

@media (max-width: 900px) {
    .mb-project-maps {
        grid-template-columns: minmax(0, 1fr);
    }
}

.mb-project-maps__list,
.mb-project-maps__editor,
.mb-project-maps__identity,
.mb-project-maps__create,
.mb-project-maps__preset,
.mb-project-maps__form,
.mb-project-maps__grid,
.mb-project-maps__id {
    min-inline-size: 0;
}

.mb-project-maps .v-btn,
.mb-project-maps .v-list-item {
    min-block-size: 44px;
}

.mb-project-maps .v-btn {
    block-size: auto;
    max-inline-size: 100%;
}

.mb-project-maps .v-btn .v-btn__content,
.mb-project-maps .v-list-item-title,
.mb-project-maps .v-list-item-subtitle,
.mb-project-maps .v-card-title,
.mb-project-maps .v-card-text {
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-project-maps .v-field {
    min-block-size: 44px;
}

.mb-project-maps__identity {
    margin-block-end: 16px;
    border-radius: 12px;
}

.mb-project-maps__grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
    align-items: start;
}

@container project-editor (max-width: 34rem) {
    .mb-project-maps__grid {
        grid-template-columns: minmax(0, 1fr);
    }

    .mb-project-maps__actions > .v-spacer {
        flex-basis: 100%;
        block-size: 0;
    }

    .mb-project-maps__actions .v-btn {
        flex: 1 1 12rem;
    }
}

.mb-project-maps__id {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
}

.mb-project-maps__preview {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.4;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-project-maps__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}

.mb-project-maps__note {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
    overflow-wrap: anywhere;
}

.mb-project-maps__glossaryLine {
    margin-block: 0 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
}

.mb-project-maps__presetsHeading {
    margin-block-start: 16px;
    margin-block-end: 8px;
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-transform: uppercase;
    letter-spacing: 0.02em;
}

.mb-project-maps__presets {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-project-maps__preset {
    border-radius: 12px;
}

.mb-project-maps__presetTitle {
    font-size: 0.875rem;
    line-height: 1.35;
    white-space: normal;
}

.mb-project-maps__presetDesc {
    padding-block-start: 0;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
    overflow-wrap: anywhere;
}

.mb-project-maps__create {
    border-radius: 12px;
}

.mb-project-maps__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
</style>
