<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDatabaseOutline, mdiDatabasePlus, mdiDeleteOutline } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VBtnToggle,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VChip,
    VDialog,
    VDivider,
    VList,
    VListItem,
    VSpacer,
    VTextField,
} from "vuetify/components";
import type { FieldMeta, PlainValue, ProjectFile } from "@material-bluemap/config";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ConfigSuperConfirm from "../config/ConfigSuperConfirm.vue";
import { createSettingMatcher } from "../config/regexEngine.js";
import { clearFieldValue, replaceText, setFieldValue } from "../config/configModel.js";
import {
    findStorage,
    mapsUsingStorage,
    newStorageText,
    openStorageFile,
    storageCarriesCredentials,
    storageIdProblem,
    storageTypeOf,
    withStorageAdded,
    withStorageConfig,
    withStorageRemoved,
    withStorageType,
} from "./projectModel.js";

/**
 * A project's storages: where the tiles each map draws actually go.
 *
 * The settings are rendered by `../config/ConfigFileForm.vue`, the same component the
 * options editor uses, and the two shapes a storage file can take are handled the way
 * `../config/StoragesScreen.vue` handles them: one file with two Java classes behind it,
 * so switching the type re-opens it against the other descriptor rather than leaving SQL
 * keys sitting in a file storage.
 *
 * ## The one refusal that is this panel's own
 *
 * `projectFileSchema` will not accept a storage carrying `connection-properties`, and that
 * is not a tidiness rule. A project file lives inside a world folder, and world folders are
 * zipped up and sent to other people; `connection-properties` is where a database user name
 * and password live. So a project names a storage and holds its non-secret shape, and a
 * credentialled storage belongs in the config folder the app keeps under its own data
 * directory. This says so on the field rather than letting the save fail with a schema
 * error nobody can act on.
 */
const props = withDefaults(
    defineProps<{
        project: ProjectFile;
        selectedId?: string | null;
        highlightPath?: string | null;
        /** Where the app writes renders, used as the root of a new file storage. */
        defaultRoot?: string;
        separator?: string;
    }>(),
    { selectedId: null, highlightPath: null, defaultRoot: "", separator: "/" },
);

const emit = defineEmits<{
    "update:project": [value: ProjectFile];
    "update:selectedId": [value: string | null];
    consent: [];
    notify: [message: string];
}>();

const { t } = useI18n();

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so the
 * optional pass-through is normalised once here rather than coalesced at the binding.
 */
const highlight = computed(() => props.highlightPath ?? null);

const query = ref("");
const regexMode = ref(false);
const flags = ref("im");

const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));

const storages = computed(() => props.project.storages);

const listed = computed(() =>
    storages.value.filter((storage) => matcher.value.test(`${storage.id}\n${storageTypeOf(storage)}`)),
);

const searchSummary = computed(() =>
    matcher.value.error !== null
        ? t("project.storages.badPattern", "The pattern is not valid, so nothing is listed.")
        : matcher.value.active
          ? t(
                "project.storages.listSummary",
                { shown: listed.value.length, total: storages.value.length },
                "{shown} of {total} storages match.",
            )
          : "",
);

const selected = computed(() => (props.selectedId === null ? undefined : findStorage(props.project, props.selectedId)));

watch(
    () => props.project,
    () => {
        if (props.selectedId !== null && findStorage(props.project, props.selectedId) !== undefined) return;
        emit("update:selectedId", storages.value[0]?.id ?? null);
    },
    { immediate: true },
);

const file = computed(() => (selected.value === undefined ? null : openStorageFile(selected.value)));

const selectedType = computed<"file" | "sql">(() => (selected.value === undefined ? "file" : storageTypeOf(selected.value)));

const credentialled = computed(() => selected.value !== undefined && storageCarriesCredentials(selected.value.config));

/* -------------------------------------------------------------------------- */
/* Editing                                                                    */
/* -------------------------------------------------------------------------- */

function onSet(field: FieldMeta, value: PlainValue): void {
    const storage = selected.value;
    const open = file.value;
    if (storage === undefined || open === null) return;
    emit("update:project", withStorageConfig(props.project, storage.id, setFieldValue(open, field, value).text));
}

function onClear(field: FieldMeta): void {
    const storage = selected.value;
    const open = file.value;
    if (storage === undefined || open === null) return;
    emit("update:project", withStorageConfig(props.project, storage.id, clearFieldValue(open, field).text));
}

function onRawText(text: string): void {
    const storage = selected.value;
    const open = file.value;
    if (storage === undefined || open === null) return;
    emit("update:project", withStorageConfig(props.project, storage.id, replaceText(open, text).text));
}

function switchType(type: "file" | "sql" | null): void {
    const storage = selected.value;
    if (storage === undefined || type === null || type === selectedType.value) return;
    emit("update:project", withStorageType(props.project, storage.id, type, props.defaultRoot, props.separator));
    emit(
        "notify",
        type === "sql"
            ? t(
                  "project.storages.switchedSql",
                  "This storage is now a database one. Its user name and password do not belong in a project file, so put them in the app's own config folder.",
              )
            : t("project.storages.switchedFile", "This storage now writes tiles into a folder."),
    );
}

/* -------------------------------------------------------------------------- */
/* Adding one                                                                 */
/* -------------------------------------------------------------------------- */

const createOpen = ref(false);
const createId = ref("");
const createType = ref<"file" | "sql">("file");

const createProblem = computed(() =>
    storageIdProblem(
        createId.value.trim(),
        storages.value.map((storage) => storage.id),
    ),
);

const createProblemText = computed(() => {
    const problem = createProblem.value;
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
    // the fallback as a message too, so it consumes `{id}` as its own named parameter and
    // a later replace finds nothing left to substitute.
    return problem === null ? "" : t(problem.key, problem.vars ?? {}, problem.fallback);
});

function openCreate(): void {
    createId.value = "";
    createType.value = "file";
    createOpen.value = true;
}

function confirmCreate(): void {
    if (createProblem.value !== null) return;
    const id = createId.value.trim();
    emit(
        "update:project",
        withStorageAdded(props.project, id, newStorageText(createType.value, props.defaultRoot, props.separator)),
    );
    emit("update:selectedId", id);
    emit("notify", t("project.storages.added", { id }, "Added the storage {id}. It is written when you save."));
    createOpen.value = false;
}

/* -------------------------------------------------------------------------- */
/* Removing one                                                               */
/* -------------------------------------------------------------------------- */

const usedBy = computed(() => (selected.value === undefined ? [] : mapsUsingStorage(props.project, selected.value.id)));

/**
 * What removing a storage costs.
 *
 * The maps still naming it are listed rather than quietly repointed. A storage a map still
 * names is a broken project and BlueMap says so at startup, but silently moving somebody's
 * maps to another storage would be this application deciding where several gigabytes of
 * tiles should go, which is not its decision to make.
 */
const removalCosts = computed(() => {
    const storage = selected.value;
    if (storage === undefined) return [];
    const lines = [
        t("project.storages.deleteStorage", { id: storage.id }, "The storage {id} and every setting in it"),
        t(
            "project.storages.deleteTiles",
            "Tiles already written into it are NOT deleted. They stay wherever they are, and the space is not coming back.",
        ),
    ];
    if (usedBy.value.length > 0) {
        lines.push(
            t(
                "project.storages.deleteUsed",
                { maps: usedBy.value.map((map) => map.id).join(", ") },
                "These maps still name it and would have nowhere to write: {maps}. Point them somewhere else first.",
            ),
        );
    }
    return lines;
});

function confirmRemoval(): void {
    const storage = selected.value;
    if (storage === undefined) return;
    emit("update:project", withStorageRemoved(props.project, storage.id));
    emit("update:selectedId", null);
    emit("notify", t("project.storages.deleted", { id: storage.id }, "The storage {id} is out of this project."));
}
</script>

<template>
    <div class="mb-project-storages">
        <aside class="mb-project-storages__list" :aria-label="t('project.storages.listLabel', 'Storages in this project')">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('project.storages.search', 'Search storages')"
                :placeholder="t('project.storages.searchHint', 'name or type')"
                :sample="storages.map((storage) => `${storage.id} ${storageTypeOf(storage)}`).join('\n')"
                :summary="searchSummary"
            />

            <v-list density="compact" nav class="mt-2" :aria-label="t('project.storages.listLabel', 'Storages in this project')">
                <v-list-item
                    v-for="storage in listed"
                    :key="storage.id"
                    :active="storage.id === selectedId"
                    :prepend-icon="mdiDatabaseOutline"
                    :title="storage.id"
                    :subtitle="storageTypeOf(storage)"
                    @click="emit('update:selectedId', storage.id)"
                >
                    <template #append>
                        <v-chip v-if="storageCarriesCredentials(storage.config)" size="x-small" color="error" variant="flat">
                            {{ t("project.storages.secretChip", "secret") }}
                        </v-chip>
                    </template>
                </v-list-item>
            </v-list>

            <p v-if="listed.length === 0" class="mb-project-storages__note">
                {{
                    storages.length === 0
                        ? t(
                              "project.storages.none",
                              "This project names no storage of its own, so its maps write into the folder the app renders into. Add one to send them somewhere else.",
                          )
                        : t("project.storages.noMatch", "No storage matches that search.")
                }}
            </p>

            <v-btn :prepend-icon="mdiDatabasePlus" color="primary" variant="tonal" block class="mt-2" @click="openCreate">
                {{ t("project.storages.new", "Add a storage") }}
            </v-btn>
            <!--
                In place rather than as a dialog, for the same reason the map form is: it is
                a form to complete or cancel, not a decision the rest of the application has
                to be stopped for.
            -->
            <v-card v-if="createOpen" variant="tonal" class="mb-project-storages__create mt-2">
                <v-card-title>{{ t("project.storages.newTitle", "Add a storage") }}</v-card-title>
                <v-card-text class="mb-project-storages__form">
                    <v-text-field
                        v-model="createId"
                        :label="t('project.storages.name', 'Storage name')"
                        :error-messages="createProblemText ? [createProblemText] : []"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                        hide-details="auto"
                    />
                    <v-btn-toggle
                        v-model="createType"
                        density="compact"
                        variant="outlined"
                        divided
                        mandatory
                        :aria-label="t('project.storages.typeLabel', 'What this storage writes into')"
                    >
                        <v-btn value="file">{{ t("project.storages.typeFile", "A folder") }}</v-btn>
                        <v-btn value="sql">{{ t("project.storages.typeSql", "A database") }}</v-btn>
                    </v-btn-toggle>
                    <p class="mb-project-storages__note">
                        {{
                            t(
                                "project.storages.newNote",
                                "It is written from BlueMap's own template, so every setting arrives explained. A database storage keeps its user name and password in the app's config folder, never in this file.",
                            )
                        }}
                    </p>
                </v-card-text>
                <v-divider />
                <v-card-actions>
                    <v-btn variant="text" @click="createOpen = false">{{ t("project.storages.cancel", "Cancel") }}</v-btn>
                    <v-spacer />
                    <v-btn color="primary" variant="flat" :disabled="createProblem !== null" @click="confirmCreate">
                        {{ t("project.storages.create", "Add the storage") }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </aside>

        <section class="mb-project-storages__editor">
            <template v-if="selected && file">
                <v-alert v-if="credentialled" type="error" density="compact" variant="tonal" class="mb-3" role="alert">
                    {{
                        t(
                            "project.storages.credentialled",
                            "This storage carries connection-properties, which is where a database user name and password live. A project file travels inside the world folder, so it refuses to hold one. Put this storage in the config folder the app keeps under its own data directory instead; the project will not save while it is here.",
                        )
                    }}
                </v-alert>

                <div class="mb-project-storages__actions">
                    <v-btn-toggle
                        :model-value="selectedType"
                        density="compact"
                        variant="outlined"
                        divided
                        mandatory
                        :aria-label="t('project.storages.typeLabel', 'What this storage writes into')"
                        @update:model-value="(value: unknown) => switchType(value as 'file' | 'sql' | null)"
                    >
                        <v-btn value="file">{{ t("project.storages.typeFile", "A folder") }}</v-btn>
                        <v-btn value="sql">{{ t("project.storages.typeSql", "A database") }}</v-btn>
                    </v-btn-toggle>

                    <v-spacer />

                    <ConfigSuperConfirm
                        :title="t('project.storages.deleteTitle', 'Take this storage out of the project')"
                        :action="
                            t(
                                'project.storages.deleteAction',
                                { id: selected.id },
                                'This removes the storage {id} from this project when you save. It cannot be undone from here.',
                            )
                        "
                        :affected="removalCosts"
                        :confirm-label="t('project.storages.deleteConfirm', { id: selected.id }, 'Remove the storage {id}')"
                        @confirm="confirmRemoval"
                    >
                        <template #activator="{ props: activatorProps }">
                            <v-btn v-bind="activatorProps" :prepend-icon="mdiDeleteOutline" color="error" variant="tonal" size="small">
                                {{ t("project.storages.delete", "Remove this storage") }}
                            </v-btn>
                        </template>
                    </ConfigSuperConfirm>
                </div>

                <ConfigFileForm
                    :file="file"
                    :title="selected.id"
                    :subtitle="
                        t(
                            'project.storages.formSubtitle',
                            { id: selected.id },
                            'Storage {id}. Maps in this project name it to say where their tiles go.',
                        )
                    "
                    :highlight-path="highlight"
                    @set="onSet"
                    @clear="onClear"
                    @consent="emit('consent')"
                    @update:text="onRawText"
                />
            </template>

            <p v-else class="mb-project-storages__note">
                {{ t("project.storages.pick", "Pick a storage on the left, or add one.") }}
            </p>
        </section>

    </div>
</template>

<style>
.mb-project-storages {
    display: grid;
    grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
}

@media (max-width: 900px) {
    .mb-project-storages {
        grid-template-columns: minmax(0, 1fr);
    }
}

.mb-project-storages__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 12px;
}

.mb-project-storages__note {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-project-storages__create {
    border-radius: 12px;
}

.mb-project-storages__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
}

.mb-project-storages__form .v-text-field {
    inline-size: 100%;
}
</style>
