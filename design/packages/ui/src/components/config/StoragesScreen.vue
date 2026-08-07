<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiDatabaseOutline, mdiDatabasePlus, mdiDeleteOutline, mdiFolderOutline, mdiLan } from "@mdi/js";
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
    VProgressCircular,
    VSpacer,
    VTextField,
} from "vuetify/components";
import type { FieldMeta, PlainValue } from "@worldlens/config";
import ConfigFileForm from "./ConfigFileForm.vue";
import ConfigSearchField from "./ConfigSearchField.vue";
import ConfigSuperConfirm from "./ConfigSuperConfirm.vue";
import PathField from "../PathField.vue";
import { clearFieldValue, fieldValue, replaceText, setFieldValue } from "./configModel.js";
import {
    addStorage,
    entriesOfKind,
    findEntry,
    isNameAvailable,
    removeEntry,
    replaceFile,
    setStorageType,
    workspaceIssues,
    type ConfigWorkspace,
} from "./configWorkspace.js";
import { hostMissingReason, useConfigHost, type SqlProbeResult } from "./configHost.js";
import { createSettingMatcher } from "./regexEngine.js";

/**
 * The storages screen.
 *
 * A storage file is one file with two shapes behind it, which is why switching
 * the type re-opens the file against the other descriptor rather than leaving
 * SQL keys sitting in a file storage. The connection test opens a real
 * connection through the host and reports whatever the driver said, verbatim: a
 * test that says "failed" without the driver's own message is a test that sends
 * somebody guessing.
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
const createType = ref<"file" | "sql">("file");
const createRoot = ref("");

const probing = ref(false);
const probeResult = ref<SqlProbeResult | null>(null);

const storages = computed(() => entriesOfKind(props.workspace, "storage"));
const matcher = computed(() => createSettingMatcher(query.value, regexMode.value, flags.value));
const listed = computed(() => storages.value.filter((entry) => matcher.value.test(`${entry.name ?? ""}\n${typeOf(entry.key)}`)));

const selected = computed(() => (props.selectedKey === null ? undefined : findEntry(props.workspace, props.selectedKey)));

const issues = computed(() => workspaceIssues(props.workspace));
const selectedIssues = computed(() => (props.selectedKey === null ? [] : issues.value.filter((issue) => issue.entryKey === props.selectedKey)));

function readString(key: string, path: string): string {
    const entry = findEntry(props.workspace, key);
    if (entry === undefined) return "";
    const field = entry.file.descriptor.fields.find((candidate) => candidate.path === path);
    if (field === undefined) return "";
    const value = fieldValue(entry.file, field);
    return typeof value === "string" ? value : "";
}

function typeOf(key: string): "file" | "sql" {
    return readString(key, "storage-type").endsWith("sql") ? "sql" : "file";
}

const selectedType = computed<"file" | "sql">(() => (props.selectedKey === null ? "file" : typeOf(props.selectedKey)));

watch(
    () => props.workspace,
    () => {
        if (props.selectedKey !== null && findEntry(props.workspace, props.selectedKey) !== undefined) return;
        emit("update:selectedKey", storages.value[0]?.key ?? null);
    },
    { immediate: true },
);

watch(
    () => props.selectedKey,
    () => {
        probeResult.value = null;
    },
);

// ---- editing ---------------------------------------------------------------

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

function switchType(next: "file" | "sql" | null): void {
    const entry = selected.value;
    if (entry === undefined || next === null || next === selectedType.value) return;

    emit("update:workspace", setStorageType(props.workspace, entry.key, next));
    probeResult.value = null;
    // `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
    // vue-i18n compiles the message itself, so it consumes `{type}`, `{name}` and `{path}`
    // as its own named parameters and a later `replace` finds nothing left to substitute.
    // A storage is identified by its name, so the broken form leaves the delete gate and
    // the "already defined" error naming no storage at all.
    emit(
        "notify",
        t(
            "config.storages.switched",
            { type: next },
            "This storage is now {type}. The settings the other type used are still in the file; remove any the validator flags as unknown.",
        ),
    );
}

// ---- connection test -------------------------------------------------------

const canProbe = computed(() => host !== null && selectedType.value === "sql" && readString(props.selectedKey ?? "", "connection-url") !== "");

const probeReason = computed(() => {
    if (host === null) return hostMissingReason(t("config.storages.testing", "Testing a database connection"));
    if (selectedType.value !== "sql") return "";
    if (readString(props.selectedKey ?? "", "connection-url") === "") {
        return t("config.storages.needUrl", "Fill in the connection URL first.");
    }
    return "";
});

async function probe(): Promise<void> {
    const entry = selected.value;
    if (entry === undefined || host === null) return;

    const propertiesField = entry.file.descriptor.fields.find((field) => field.path === "connection-properties");
    const rawProperties = propertiesField === undefined ? {} : fieldValue(entry.file, propertiesField);
    const properties: Record<string, string> = {};
    if (typeof rawProperties === "object" && rawProperties !== null && !Array.isArray(rawProperties)) {
        for (const [key, value] of Object.entries(rawProperties)) properties[key] = typeof value === "string" ? value : String(value ?? "");
    }

    probing.value = true;
    probeResult.value = null;
    try {
        probeResult.value = await host.testSqlConnection({
            connectionUrl: readString(entry.key, "connection-url"),
            properties,
            dialect: readString(entry.key, "dialect") || null,
            driverJar: readString(entry.key, "driver-jar") || null,
            driverClass: readString(entry.key, "driver-class") || null,
        });
    } catch (error) {
        probeResult.value = {
            ok: false,
            message: t("config.storages.probeThrew", "The connection attempt did not complete."),
            detail: error instanceof Error ? error.message : String(error),
        };
    } finally {
        probing.value = false;
    }
}

// ---- create and delete -----------------------------------------------------

const createProblem = computed(() => {
    const name = createName.value.trim();
    if (name === "") return t("config.storages.needName", "Give the file a name. Maps refer to a storage by that name.");
    if (!isNameAvailable(props.workspace, "storage", name)) {
        return t("config.storages.nameTaken", { name }, "There is already a storages/{name}.conf.");
    }
    if (createType.value === "file" && createRoot.value.trim() === "") {
        return t("config.storages.needRoot", "Say where the tiles go. Use the web app's own maps folder unless you have a reason not to.");
    }
    return null;
});

function confirmCreate(): void {
    if (createProblem.value !== null) return;
    const name = createName.value.trim();

    emit("update:workspace", addStorage(props.workspace, name, createType.value, createRoot.value.trim()));
    emit("update:selectedKey", `storage:${name}`);
    emit("notify", t("config.storages.created", { name }, "Added storages/{name}.conf. It is written when you save."));

    createOpen.value = false;
    createName.value = "";
    createRoot.value = "";
}

/** Maps that name this storage, which is what makes deleting it consequential. */
const usedBy = computed(() => {
    const entry = selected.value;
    if (entry === undefined || entry.id === null) return [];
    return entriesOfKind(props.workspace, "map")
        .filter((map) => {
            const field = map.file.descriptor.fields.find((candidate) => candidate.path === "storage");
            return field !== undefined && fieldValue(map.file, field) === entry.id;
        })
        .map((map) => map.id ?? "");
});

const deleteAffected = computed(() => {
    const entry = selected.value;
    if (entry === undefined) return [];

    const lines = [t("config.storages.deleteFile", { path: entry.file.path }, "The file {path}")];
    if (usedBy.value.length > 0) {
        lines.push(
            t(
                "config.storages.deleteBreaks",
                { maps: usedBy.value.join(", ") },
                "These maps name this storage and will stop loading until you point them somewhere else: {maps}",
            ),
        );
    }
    lines.push(
        t(
            "config.storages.deleteKeepsTiles",
            "Tiles that are already written are NOT deleted. Removing the config only stops BlueMap using it.",
        ),
    );
    return lines;
});

function confirmDelete(): void {
    const entry = selected.value;
    if (entry === undefined) return;
    emit("update:workspace", removeEntry(props.workspace, entry.key));
    emit("notify", t("config.storages.deleted", { path: entry.file.path }, "{path} will be deleted when you save."));
    emit("update:selectedKey", null);
}
</script>

<template>
    <div class="mb-config-storages">
        <aside class="mb-config-storages__list" :aria-label="t('config.storages.listLabel', 'Storages')">
            <ConfigSearchField
                v-model="query"
                v-model:regex="regexMode"
                v-model:flags="flags"
                :label="t('config.storages.search', 'Search storages')"
                :sample="storages.map((entry) => `${entry.name}  ${typeOf(entry.key)}`).join('\n')"
            />

            <v-list density="compact" nav class="mt-2">
                <v-list-item
                    v-for="entry in listed"
                    :key="entry.key"
                    :active="entry.key === selectedKey"
                    :prepend-icon="typeOf(entry.key) === 'sql' ? mdiDatabaseOutline : mdiFolderOutline"
                    :title="entry.name ?? ''"
                    :subtitle="typeOf(entry.key) === 'sql' ? t('config.storages.sql', 'SQL') : t('config.storages.file', 'File')"
                    @click="emit('update:selectedKey', entry.key)"
                />
            </v-list>

            <v-btn :prepend-icon="mdiDatabasePlus" color="primary" variant="tonal" block class="mt-2" @click="createOpen = true">
                {{ t("config.storages.new", "New storage") }}
            </v-btn>
        </aside>

        <section class="mb-config-storages__editor">
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

                <div class="mb-config-storages__actions">
                    <v-btn-toggle
                        :model-value="selectedType"
                        mandatory
                        density="compact"
                        variant="outlined"
                        divided
                        :aria-label="t('config.storages.type', 'Storage type')"
                        @update:model-value="switchType"
                    >
                        <v-btn value="file" :prepend-icon="mdiFolderOutline" size="small">{{ t("config.storages.file", "File") }}</v-btn>
                        <v-btn value="sql" :prepend-icon="mdiDatabaseOutline" size="small">{{ t("config.storages.sql", "SQL") }}</v-btn>
                    </v-btn-toggle>

                    <v-btn
                        v-if="selectedType === 'sql'"
                        :prepend-icon="mdiLan"
                        :disabled="!canProbe || probing"
                        variant="tonal"
                        size="small"
                        @click="probe"
                    >
                        <v-progress-circular v-if="probing" size="16" width="2" indeterminate class="mr-2" />
                        {{ probing ? t("config.storages.testingNow", "Connecting") : t("config.storages.test", "Test the connection") }}
                    </v-btn>

                    <v-chip v-if="usedBy.length > 0" size="small" variant="tonal">
                        {{ t("config.storages.usedBy", { maps: usedBy.join(", ") }, "Used by {maps}") }}
                    </v-chip>

                    <v-spacer />

                    <ConfigSuperConfirm
                        :title="t('config.storages.deleteTitle', 'Delete this storage config')"
                        :action="
                            t(
                                'config.storages.deleteAction',
                                { path: selected.file.path },
                                'This deletes {path} from the config folder when you save.',
                            )
                        "
                        :affected="deleteAffected"
                        :confirm-label="t('config.storages.deleteConfirm', 'Delete the storage config')"
                        @confirm="confirmDelete"
                    >
                        <template #activator="{ props: activatorProps }">
                            <v-btn v-bind="activatorProps" :prepend-icon="mdiDeleteOutline" color="error" variant="tonal" size="small">
                                {{ t("config.storages.delete", "Delete") }}
                            </v-btn>
                        </template>
                    </ConfigSuperConfirm>
                </div>

                <p v-if="probeReason" class="mb-config-storages__note">{{ probeReason }}</p>

                <v-alert
                    v-if="probeResult"
                    :type="probeResult.ok ? 'success' : 'error'"
                    density="compact"
                    variant="tonal"
                    class="mb-3"
                    role="status"
                >
                    <p>{{ probeResult.message }}</p>
                    <pre v-if="probeResult.detail" class="mb-config-storages__detail">{{ probeResult.detail }}</pre>
                </v-alert>

                <ConfigFileForm
                    :file="selected.file"
                    :title="selected.name ?? ''"
                    :subtitle="
                        t('config.storages.subtitle', { id: selected.id ?? '' }, 'Maps refer to this storage by the name {id}.')
                    "
                    :highlight-path="highlightPath"
                    @set="onSet"
                    @clear="onClear"
                    @consent="emit('consent')"
                    @update:text="onRawText"
                />
            </template>

            <p v-else class="mb-config-storages__note">{{ t("config.storages.pick", "Pick a storage on the left, or add one.") }}</p>
        </section>

        <v-dialog v-model="createOpen" max-width="520">
            <v-card>
                <v-card-title>{{ t("config.storages.newTitle", "New storage") }}</v-card-title>
                <v-card-text class="mb-config-storages__form">
                    <v-text-field
                        v-model="createName"
                        :label="t('config.storages.fileName', 'File name')"
                        :hint="t('config.storages.fileNameHint', 'A map points at this storage by exactly this name.')"
                        persistent-hint
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        autocapitalize="off"
                    />
                    <v-btn-toggle v-model="createType" mandatory density="compact" variant="outlined" divided>
                        <v-btn value="file" size="small">{{ t("config.storages.file", "File") }}</v-btn>
                        <v-btn value="sql" size="small">{{ t("config.storages.sql", "SQL") }}</v-btn>
                    </v-btn-toggle>

                    <PathField
                        v-if="createType === 'file'"
                        v-model="createRoot"
                        field="the folder for rendered tiles"
                        semantic="folder"
                        :label="t('config.storages.root', 'Folder for rendered tiles')"
                        density="compact"
                    />

                    <v-alert v-if="createProblem" type="warning" density="compact" variant="tonal">{{ createProblem }}</v-alert>
                </v-card-text>
                <v-divider />
                <v-card-actions>
                    <v-btn variant="text" @click="createOpen = false">{{ t("config.storages.cancel", "Cancel") }}</v-btn>
                    <v-spacer />
                    <v-btn color="primary" variant="flat" :disabled="createProblem !== null" @click="confirmCreate">
                        {{ t("config.storages.create", "Add the storage") }}
                    </v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </div>
</template>

<style>
.mb-config-storages {
    display: grid;
    grid-template-columns: minmax(200px, 260px) minmax(0, 1fr);
    gap: 20px;
    align-items: start;
}

@media (max-width: 900px) {
    .mb-config-storages {
        grid-template-columns: minmax(0, 1fr);
    }
}

.mb-config-storages__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 12px;
}

.mb-config-storages__note {
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-storages__detail {
    margin-block-start: 6px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    white-space: pre-wrap;
    max-height: 12em;
    overflow: auto;
}

.mb-config-storages__form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
</style>
