<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentDuplicate, mdiDeleteOutline, mdiMap, mdiMapPlus } from "@mdi/js";
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
    VTextField,
} from "vuetify/components";
import { DIMENSION_OPTIONS, DIMENSION_TYPE_OPTIONS, type FieldMeta, type MapPreset, type PlainValue } from "@material-bluemap/config";
import ConfigFileForm from "./ConfigFileForm.vue";
import ConfigSearchField from "./ConfigSearchField.vue";
import ConfigSuperConfirm from "./ConfigSuperConfirm.vue";
import { clearFieldValue, fieldValue, replaceText, setFieldValue } from "./configModel.js";
import {
    addMap,
    cloneMap,
    entriesOfKind,
    findEntry,
    isNameAvailable,
    removeEntry,
    replaceFile,
    sanitiseMapId,
    storageIds,
    workspaceIssues,
    type ConfigWorkspace,
} from "./configWorkspace.js";
import { useConfigHost } from "./configHost.js";
import { createSettingMatcher } from "./regexEngine.js";

/**
 * The maps screen: a list of every map config, and the full editor for the one
 * selected.
 *
 * Creating, duplicating and deleting a map all live here because in BlueMap they
 * are all one thing, a file in `maps/`. Duplicating copies the file text rather
 * than re-running the template, so a map somebody spent an afternoon tuning
 * comes across complete, comments and all.
 */
const props = defineProps<{ workspace: ConfigWorkspace; selectedKey: string | null; highlightPath: string | null }>();

const emit = defineEmits<{
    "update:workspace": [value: ConfigWorkspace];
    "update:selectedKey": [value: string | null];
    consent: [];
    notify: [message: string];
}>();

const { t } = useI18n();
const host = useConfigHost();

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a setting name, and
// `m` because a field's searchable text is several lines (label, key, Java field,
// upstream's explanation), so `^` and `$` are only useful per line.
const flags = ref("im");

const createOpen = ref(false);
const createName = ref("");
const createDisplayName = ref("");
const createWorld = ref("");
const createDimension = ref("minecraft:overworld");
const createDimensionType = ref("minecraft:overworld");
const createSorting = ref(0);
const createPreset = ref<MapPreset>("overworld");

const cloneOpen = ref(false);
const cloneName = ref("");
const cloneDisplayName = ref("");

const maps = computed(() => entriesOfKind(props.workspace, "map"));

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const listed = computed(() =>
    maps.value.filter((entry) => {
        const name = entry.name ?? "";
        const field = entry.file.descriptor.fields.find((candidate) => candidate.path === "name");
        const display = field === undefined ? "" : String(fieldValue(entry.file, field) ?? "");
        return matcher.value.test(`${name}\n${entry.id ?? ""}\n${display}`);
    }),
);

const selected = computed(() => (props.selectedKey === null ? undefined : findEntry(props.workspace, props.selectedKey)));

const issues = computed(() => workspaceIssues(props.workspace));

function issuesFor(key: string) {
    return issues.value.filter((issue) => issue.entryKey === key);
}

const selectedIssues = computed(() => (props.selectedKey === null ? [] : issuesFor(props.selectedKey)));

watch(
    () => props.workspace,
    () => {
        if (props.selectedKey !== null && findEntry(props.workspace, props.selectedKey) !== undefined) return;
        emit("update:selectedKey", maps.value[0]?.key ?? null);
    },
    { immediate: true },
);

// `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
// vue-i18n compiles the message itself, so it consumes `{name}`, `{id}` and `{path}` as
// its own named parameters and a later `replace` finds nothing left to substitute. Half
// the messages here are file names and validation errors, so the broken form turns
// "There is already a maps/nether.conf" into a sentence that names no file at all.
const searchSummary = computed(() =>
    matcher.value.error !== null
        ? t("config.maps.badPattern", "The pattern is not valid, so nothing is listed.")
        : matcher.value.active
          ? t(
                "config.maps.listSummary",
                { shown: listed.value.length, total: maps.value.length },
                "{shown} of {total} maps match.",
            )
          : "",
);

// ---- editing the selected map ---------------------------------------------

function onSet(field: FieldMeta, value: PlainValue): void {
    const entry = selected.value;
    if (entry === undefined) return;
    emit("update:workspace", replaceFile(props.workspace, entry.key, setFieldValue(entry.file, field, value)));
}

function onClear(field: FieldMeta): void {
    const entry = selected.value;
    if (entry === undefined) return;
    emit("update:workspace", replaceFile(props.workspace, entry.key, clearFieldValue(entry.file, field)));
}

function onRawText(text: string): void {
    const entry = selected.value;
    if (entry === undefined) return;
    emit("update:workspace", replaceFile(props.workspace, entry.key, replaceText(entry.file, text)));
}

// ---- create ---------------------------------------------------------------

const createId = computed(() => sanitiseMapId(createName.value.trim()));

const createProblem = computed(() => {
    const name = createName.value.trim();
    if (name === "") return t("config.maps.needName", "Give the file a name. It becomes the map id.");
    if (!isNameAvailable(props.workspace, "map", name)) {
        return t("config.maps.nameTaken", { name }, "There is already a maps/{name}.conf.");
    }
    if (maps.value.some((entry) => entry.id === createId.value)) {
        return t(
            "config.maps.idTaken",
            { id: createId.value },
            'Another map file already becomes the id "{id}". BlueMap refuses to start when two do.',
        );
    }
    if (createWorld.value.trim() === "") return t("config.maps.needWorld", "Pick the world folder, the one that contains level.dat.");
    return null;
});

const createIdNote = computed(() =>
    createName.value.trim() !== "" && createId.value !== createName.value.trim()
        ? t(
              "config.maps.idNote",
              { id: createId.value },
              'BlueMap turns that file name into the map id "{id}", which is what appears in the tile URLs.',
          )
        : "",
);

watch(createDimension, (value) => {
    createDimensionType.value = value;
    createPreset.value = value === "minecraft:the_nether" ? "nether" : value === "minecraft:the_end" ? "end" : "overworld";
    createSorting.value = value === "minecraft:the_nether" ? 100 : value === "minecraft:the_end" ? 200 : 0;
});

async function pickWorld(): Promise<void> {
    if (host === null) return;
    const chosen = await host.pickDirectory({ title: t("config.maps.pickWorld", "Choose the world folder") });
    if (chosen !== null) createWorld.value = chosen;
}

function confirmCreate(): void {
    if (createProblem.value !== null) return;
    const name = createName.value.trim();

    emit(
        "update:workspace",
        addMap(props.workspace, {
            name,
            displayName: createDisplayName.value.trim() === "" ? name : createDisplayName.value.trim(),
            world: createWorld.value.trim(),
            dimension: createDimension.value,
            dimensionType: createDimensionType.value,
            sorting: createSorting.value,
            preset: createPreset.value,
        }),
    );
    emit("update:selectedKey", `map:${name}`);
    emit("notify", t("config.maps.created", { name }, "Added maps/{name}.conf. It is written when you save."));

    createOpen.value = false;
    createName.value = "";
    createDisplayName.value = "";
}

// ---- duplicate -------------------------------------------------------------

const cloneProblem = computed(() => {
    const name = cloneName.value.trim();
    if (name === "") return t("config.maps.needName", "Give the file a name. It becomes the map id.");
    if (!isNameAvailable(props.workspace, "map", name)) {
        return t("config.maps.nameTaken", { name }, "There is already a maps/{name}.conf.");
    }
    return null;
});

function openClone(): void {
    const entry = selected.value;
    if (entry === undefined) return;
    cloneName.value = `${entry.name ?? "map"}_copy`;
    cloneDisplayName.value = t("config.maps.copyOf", { name: entry.name ?? "" }, "Copy of {name}");
    cloneOpen.value = true;
}

function confirmClone(): void {
    const entry = selected.value;
    if (entry === undefined || cloneProblem.value !== null) return;
    const name = cloneName.value.trim();

    emit("update:workspace", cloneMap(props.workspace, entry.key, name, cloneDisplayName.value.trim() || name));
    emit("update:selectedKey", `map:${name}`);
    emit(
        "notify",
        t(
            "config.maps.cloned",
            { from: entry.file.path, name },
            "Copied {from} to maps/{name}.conf, comments and all. It is written when you save.",
        ),
    );
    cloneOpen.value = false;
}

// ---- delete ----------------------------------------------------------------

const deleteAffected = computed(() => {
    const entry = selected.value;
    if (entry === undefined) return [];

    const storage = entry.file.descriptor.fields.find((field) => field.path === "storage");
    const storageId = storage === undefined ? null : String(fieldValue(entry.file, storage) ?? "");

    const lines = [
        t("config.maps.deleteFile", { path: entry.file.path }, "The file {path}"),
        t("config.maps.deleteId", { id: entry.id ?? "" }, 'The map id "{id}", so its tiles stop being served'),
    ];
    if (storageId !== null && storageId !== "") {
        lines.push(
            t(
                "config.maps.deleteTiles",
                { storage: storageId },
                'Already-rendered tiles in storage "{storage}" are NOT deleted. BlueMap leaves them where they are; remove them yourself if you want the space back.',
            ),
        );
    }
    return lines;
});

function confirmDelete(): void {
    const entry = selected.value;
    if (entry === undefined) return;

    emit("update:workspace", removeEntry(props.workspace, entry.key));
    emit("notify", t("config.maps.deleted", { path: entry.file.path }, "{path} will be deleted when you save."));
    emit("update:selectedKey", null);
}

const dimensionItems = computed(() => DIMENSION_OPTIONS.map((option) => ({ value: String(option.value), title: option.label })));
const dimensionTypeItems = computed(() => DIMENSION_TYPE_OPTIONS.map((option) => ({ value: String(option.value), title: option.label })));
const storageOptions = computed(() => storageIds(props.workspace));
</script>

<template>
    <div class="mb-config-maps">
        <aside class="mb-config-maps__list" :aria-label="t('config.maps.listLabel', 'Maps')">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('config.maps.search', 'Search maps')"
                :placeholder="t('config.maps.searchHint', 'file name, map id or display name')"
                :sample="maps.map((entry) => `${entry.name}  ${entry.id}`).join('\n')"
                :summary="searchSummary"
            />

            <v-list density="compact" nav class="mt-2">
                <v-list-item
                    v-for="entry in listed"
                    :key="entry.key"
                    :active="entry.key === selectedKey"
                    :prepend-icon="mdiMap"
                    :title="entry.name ?? ''"
                    :subtitle="entry.id ?? ''"
                    @click="emit('update:selectedKey', entry.key)"
                >
                    <template #append>
                        <v-chip v-if="issuesFor(entry.key).some((issue) => issue.severity === 'error')" size="x-small" color="error" variant="flat">
                            {{ t("config.maps.hasError", "problem") }}
                        </v-chip>
                    </template>
                </v-list-item>
            </v-list>

            <p v-if="listed.length === 0" class="mb-config-maps__empty">
                {{
                    maps.length === 0
                        ? t("config.maps.none", "No maps yet. Add one to tell BlueMap what to render.")
                        : t("config.maps.noMatch", "No map matches that search.")
                }}
            </p>

            <v-btn :prepend-icon="mdiMapPlus" color="primary" variant="tonal" block class="mt-2" @click="createOpen = true">
                {{ t("config.maps.new", "New map") }}
            </v-btn>
        </aside>

        <section class="mb-config-maps__editor">
            <template v-if="selected">
                <v-alert
                    v-for="issue in selectedIssues"
                    :key="issue.message"
                    :type="issue.severity === 'error' ? 'error' : 'warning'"
                    density="compact"
                    variant="tonal"
                    class="mb-3"
                >
                    {{ issue.message }}
                </v-alert>

                <div class="mb-config-maps__actions">
                    <v-btn :prepend-icon="mdiContentDuplicate" variant="tonal" size="small" @click="openClone">
                        {{ t("config.maps.duplicate", "Duplicate") }}
                    </v-btn>

                    <ConfigSuperConfirm
                        :title="t('config.maps.deleteTitle', 'Delete this map config')"
                        :action="
                            t(
                                'config.maps.deleteAction',
                                { path: selected.file.path },
                                'This deletes {path} from the config folder when you save. It cannot be undone from here.',
                            )
                        "
                        :affected="deleteAffected"
                        :confirm-label="t('config.maps.deleteConfirm', 'Delete the map config')"
                        @confirm="confirmDelete"
                    >
                        <template #activator="{ props: activatorProps }">
                            <v-btn v-bind="activatorProps" :prepend-icon="mdiDeleteOutline" color="error" variant="tonal" size="small">
                                {{ t("config.maps.delete", "Delete") }}
                            </v-btn>
                        </template>
                    </ConfigSuperConfirm>

                    <v-spacer />
                    <span class="mb-config-maps__storages">
                        {{
                            t(
                                "config.maps.storagesAvailable",
                                { list: storageOptions.join(", ") || "none" },
                                "Storages available: {list}",
                            )
                        }}
                    </span>
                </div>

                <ConfigFileForm
                    :file="selected.file"
                    :title="selected.name ?? ''"
                    :subtitle="
                        t(
                            'config.maps.subtitle',
                            { id: selected.id ?? '' },
                            'Map id {id}. Everything BlueMap reads about this map lives in this one file.',
                        )
                    "
                    :highlight-path="highlightPath"
                    @set="onSet"
                    @clear="onClear"
                    @consent="emit('consent')"
                    @update:text="onRawText"
                />
            </template>

            <p v-else class="mb-config-maps__empty">
                {{ t("config.maps.pick", "Pick a map on the left, or add one.") }}
            </p>
        </section>

        <!-- Creating asks for values, so it is a decision dialog rather than a notification. -->
        <v-dialog v-model="createOpen" max-width="560" scrollable>
            <v-card>
                <v-card-title>{{ t("config.maps.newTitle", "New map") }}</v-card-title>
                <v-card-text class="mb-config-maps__form">
                    <v-text-field
                        v-model="createName"
                        :label="t('config.maps.fileName', 'File name')"
                        :hint="createIdNote"
                        persistent-hint
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                    />
                    <v-text-field
                        v-model="createDisplayName"
                        :label="t('config.maps.displayName', 'Name shown in the web app')"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />
                    <div class="mb-config-maps__world">
                        <v-text-field
                            v-model="createWorld"
                            :label="t('config.maps.world', 'World folder')"
                            variant="outlined"
                            density="compact"
                            spellcheck="false"
                            hide-details="auto"
                        />
                        <v-btn :disabled="host === null" variant="tonal" size="small" @click="pickWorld">
                            {{ t("config.maps.browse", "Browse") }}
                        </v-btn>
                    </div>
                    <v-select
                        v-model="createDimension"
                        :items="dimensionItems"
                        :label="t('config.maps.dimension', 'Dimension')"
                        item-title="title"
                        item-value="value"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />
                    <v-select
                        v-model="createDimensionType"
                        :items="dimensionTypeItems"
                        :label="t('config.maps.dimensionType', 'Dimension type')"
                        item-title="title"
                        item-value="value"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />
                    <v-text-field
                        v-model.number="createSorting"
                        :label="t('config.maps.sorting', 'Sorting')"
                        type="number"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />

                    <v-alert v-if="createProblem" type="warning" density="compact" variant="tonal">{{ createProblem }}</v-alert>
                    <p class="mb-config-maps__note">
                        {{
                            t(
                                "config.maps.templateNote",
                                "The file is written from BlueMap's own template for this dimension, so it arrives with every setting explained in place.",
                            )
                        }}
                    </p>
                </v-card-text>
                <v-divider />
                <v-card-actions>
                    <v-btn variant="text" @click="createOpen = false">{{ t("config.maps.cancel", "Cancel") }}</v-btn>
                    <v-spacer />
                    <v-btn color="primary" variant="flat" :disabled="createProblem !== null" @click="confirmCreate">
                        {{ t("config.maps.create", "Add the map") }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>

        <v-dialog v-model="cloneOpen" max-width="480">
            <v-card>
                <v-card-title>{{ t("config.maps.duplicateTitle", "Duplicate this map") }}</v-card-title>
                <v-card-text class="mb-config-maps__form">
                    <v-text-field
                        v-model="cloneName"
                        :label="t('config.maps.fileName', 'File name')"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        hide-details="auto"
                    />
                    <v-text-field
                        v-model="cloneDisplayName"
                        :label="t('config.maps.displayName', 'Name shown in the web app')"
                        variant="outlined"
                        density="compact"
                        hide-details="auto"
                    />
                    <v-alert v-if="cloneProblem" type="warning" density="compact" variant="tonal">{{ cloneProblem }}</v-alert>
                    <p class="mb-config-maps__note">
                        {{
                            t(
                                "config.maps.duplicateNote",
                                "Every setting and every comment is copied exactly. Only the displayed name changes.",
                            )
                        }}
                    </p>
                </v-card-text>
                <v-divider />
                <v-card-actions>
                    <v-btn variant="text" @click="cloneOpen = false">{{ t("config.maps.cancel", "Cancel") }}</v-btn>
                    <v-spacer />
                    <v-btn color="primary" variant="flat" :disabled="cloneProblem !== null" @click="confirmClone">
                        {{ t("config.maps.duplicate", "Duplicate") }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<style>
.mb-config-maps {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
}

@media (max-width: 900px) {
    .mb-config-maps {
        grid-template-columns: minmax(0, 1fr);
    }
}

.mb-config-maps__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 12px;
}

.mb-config-maps__storages,
.mb-config-maps__empty,
.mb-config-maps__note {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-maps__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.mb-config-maps__world {
    display: flex;
    align-items: flex-start;
    gap: 8px;
}

.mb-config-maps__world .v-text-field {
    flex: 1 1 auto;
    min-width: 0;
}
</style>
