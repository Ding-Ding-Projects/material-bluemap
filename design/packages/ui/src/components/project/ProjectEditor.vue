<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiArrowLeft,
    mdiContentSaveOutline,
    mdiPlay,
    mdiUndoVariant,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VProgressLinear,
    VSpacer,
    VSwitch,
    VTextField,
} from "vuetify/components";
import type { FieldMeta, PlainValue, ProjectFile } from "@material-bluemap/config";
import ConfigFileForm from "../config/ConfigFileForm.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import { clearFieldValue, replaceText, setFieldValue } from "../config/configModel.js";
import { createSettingMatcher } from "../config/regexEngine.js";
import { TabbedNavigation, type TabPage } from "../tabs/index.js";
import ProjectMapsPanel from "./ProjectMapsPanel.vue";
import ProjectStoragesPanel from "./ProjectStoragesPanel.vue";
import {
    SINGLETONS,
    openSingletonFile,
    orderedMaps,
    renderProblems,
    withName,
    withRender,
    withSingleton,
    type SingletonKind,
} from "./projectModel.js";

/**
 * The project editor: every setting a render will use, before the render starts.
 *
 * This is the answer to the question the whole feature exists for - "shouldn't a user
 * configure all the map settings before rendering starts". The guide asks five questions
 * and starts; this holds all of it. Every map with its full config, every storage, how the
 * render itself is run, and the four whole-file settings BlueMap reads once.
 *
 * Nothing here names a BlueMap setting. The maps and storages panels hand their files to
 * `../config/ConfigFileForm.vue`, and so do the four singleton tabs, so the groups, the
 * controls, the documentation and the defaults all come from `@material-bluemap/config`.
 * A setting added to the schema tomorrow appears here with no change to this file.
 *
 * ## Absent is not empty
 *
 * The four singletons start absent, and absent means "this project never touched it, so
 * BlueMap's own default applies at render time". That is why each of those tabs opens an
 * empty body rather than a generated template: a project that shipped a full generated
 * `core.conf` would be asserting a hundred values nobody chose, and a later change to
 * BlueMap's defaults would silently not reach it. The form writes only what somebody
 * actually sets, and a body that ends up with nothing in it is stored as absent again.
 */
const props = withDefaults(
    defineProps<{
        project: ProjectFile;
        /** The world folder the project file lives at the root of. */
        world: string;
        /** True when the project differs from what is on disk. */
        dirty?: boolean;
        saving?: boolean;
        /** Whatever the last save said when it refused, verbatim. */
        saveFailure?: string | null;
        /** False when this build cannot start a render at all. */
        canRender?: boolean;
        /** True while a render is already going, so a second start is refused. */
        rendering?: boolean;
        separator?: string;
        /** Where the app writes renders, used as the root of a new file storage. */
        defaultRoot?: string;
    }>(),
    {
        dirty: false,
        saving: false,
        saveFailure: null,
        canRender: false,
        rendering: false,
        separator: "/",
        defaultRoot: "",
    },
);

const emit = defineEmits<{
    "update:project": [value: ProjectFile];
    save: [];
    /** Throw the unsaved edits away and read the file again. */
    revert: [];
    close: [];
    render: [];
    consent: [];
    notify: [message: string];
}>();

const { t } = useI18n();

/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`, so every
 * optional flag of ours is normalised once here rather than coalesced at each binding.
 */
const isDirty = computed(() => props.dirty === true);
const isSaving = computed(() => props.saving === true);
const renderable = computed(() => props.canRender === true);
const isRendering = computed(() => props.rendering === true);
const separatorValue = computed(() => props.separator ?? "/");
const defaultRootValue = computed(() => props.defaultRoot ?? "");

const TAB_MAPS = "maps";
const TAB_STORAGES = "storages";
const TAB_RENDER = "render";

const tabsNav = ref<InstanceType<typeof TabbedNavigation> | null>(null);
const selectedMap = ref<string | null>(null);
const selectedStorage = ref<string | null>(null);

const maps = computed(() => orderedMaps(props.project));

const problems = computed(() => renderProblems(props.project));
const problemTexts = computed(() =>
    // `t(key, named, fallback)`, and no filling afterwards: vue-i18n compiles the fallback
    // as a message too, so it consumes `{id}` as a named parameter of its own and the id
    // the message is complaining about is gone by the time anything else could put it back.
    problems.value.map((problem) => t(problem.key, problem.vars ?? {}, problem.fallback)),
);

const canStart = computed(() => renderable.value && !isRendering.value && problems.value.length === 0);

const singletonLabels: Record<SingletonKind, string> = {
    core: "Core",
    webapp: "Web app",
    webserver: "Web server",
    plugin: "Plugin",
};

const singletonTabs = computed(() =>
    SINGLETONS.map((kind) => ({
        id: kind,
        label: t(`project.editor.tab.${kind}`, singletonLabels[kind]),
        touched: props.project[kind] !== null,
    })),
);

/* -------------------------------------------------------------------------- */
/* The tabs                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One browser-style tab per section, carried by the project's own `TabbedNavigation`
 * rather than a bespoke `v-tabs`/`v-window` pair: an overflow surface once the strip
 * cannot fit seven tabs, reordering, pinning, grouping, the four tab-discovery searches
 * and a layout that survives a restart under this surface's own storage key.
 *
 * Maps and storages carry a live count in their label, which a plain `TabPage` cannot
 * keep current on its own - the label is read once, when a tab first opens, and after
 * that belongs to the tab rather than the page. The watcher below is what pushes a
 * changed count into any tab already open, through `renamePage`.
 *
 * The small dot that used to sit beside a touched singleton's tab is gone: it lived in
 * `TabButton`'s own fixed rendering, which every `TabbedNavigation` shares, and a tab
 * strip that let one caller inject a bespoke dot would let every caller do the same,
 * which is exactly the drift the shared component exists to prevent. The fact itself is
 * not lost - the paragraph at the top of each singleton's tab still says outright whether
 * this project carries its own file or is following BlueMap's defaults - it is simply
 * read on arrival rather than glanced at from the strip.
 */
const pages = computed<TabPage[]>(() => [
    { id: TAB_MAPS, label: t("project.editor.tab.maps", { maps: maps.value.length }, "Maps ({maps})"), icon: null },
    {
        id: TAB_STORAGES,
        label: t(
            "project.editor.tab.storages",
            { storages: props.project.storages.length },
            "Storages ({storages})",
        ),
        icon: null,
    },
    { id: TAB_RENDER, label: t("project.editor.tab.render", "How it renders"), icon: null },
    ...singletonTabs.value.map((tab) => ({ id: tab.id, label: tab.label, icon: null })),
]);

watch(
    pages,
    (list) => {
        for (const page of list) tabsNav.value?.renamePage(page.id, page.label);
    },
    { deep: true },
);

/* -------------------------------------------------------------------------- */
/* The four singletons                                                        */
/* -------------------------------------------------------------------------- */

function singletonFile(kind: SingletonKind) {
    return openSingletonFile(props.project, kind);
}

function onSingletonSet(kind: SingletonKind, field: FieldMeta, value: PlainValue): void {
    emit("update:project", withSingleton(props.project, kind, setFieldValue(singletonFile(kind), field, value).text));
}

function onSingletonClear(kind: SingletonKind, field: FieldMeta): void {
    emit("update:project", withSingleton(props.project, kind, clearFieldValue(singletonFile(kind), field).text));
}

function onSingletonText(kind: SingletonKind, text: string): void {
    emit("update:project", withSingleton(props.project, kind, replaceText(singletonFile(kind), text).text));
}

/* -------------------------------------------------------------------------- */
/* How the render is run                                                      */
/* -------------------------------------------------------------------------- */

/**
 * This tab's own search, over its own rows.
 *
 * Every settings surface carries one, and a surface is not exempt for being small: somebody
 * who remembers the word "threads" should be able to type it anywhere settings live and
 * land on the control. Plain text stays the default and the anchored builder comes with the
 * shared field.
 */
const runQuery = ref("");
const runRegex = ref(false);
const runFlags = ref("im");

const runMatcher = computed(() => createSettingMatcher(runQuery.value, runRegex.value, runFlags.value));

interface RunRow {
    readonly id: "threads" | "force" | "fixEdges" | "metrics" | "outputFolder";
    readonly label: string;
    readonly hint: string;
}

const runRows = computed<RunRow[]>(() => [
    {
        id: "threads",
        label: t("project.render.threads", "Render threads"),
        hint: t(
            "project.render.threadsHint",
            "How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.",
        ),
    },
    {
        id: "force",
        label: t("project.render.force", "Draw everything again"),
        hint: t(
            "project.render.forceHint",
            "Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.",
        ),
    },
    {
        id: "fixEdges",
        label: t("project.render.fixEdges", "Redraw the edges too"),
        hint: t(
            "project.render.fixEdgesHint",
            "Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.",
        ),
    },
    {
        id: "metrics",
        label: t("project.render.metrics", "Send BlueMap's anonymous usage report"),
        hint: t("project.render.metricsHint", "Off unless deliberately turned on. Nothing about your world is in it."),
    },
    {
        id: "outputFolder",
        label: t("project.render.outputFolder", "Where the rendered map is written"),
        hint: t(
            "project.render.outputFolderHint",
            "Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.",
        ),
    },
]);

const visibleRunRows = computed(() =>
    runRows.value.filter((row) => runMatcher.value.test(`${row.label}\n${row.id}\n${row.hint}`)),
);

function showsRun(id: RunRow["id"]): boolean {
    return visibleRunRows.value.some((row) => row.id === id);
}

const runSummary = computed(() =>
    runMatcher.value.error !== null
        ? t("project.render.badPattern", "The pattern is not valid, so nothing is shown.")
        : runMatcher.value.active
          ? t(
                "project.render.searchSummary",
                { shown: visibleRunRows.value.length, total: runRows.value.length },
                "{shown} of {total} settings match.",
            )
          : "",
);

const runSample = computed(() => runRows.value.map((row) => `${row.label} ${row.hint}`).join("\n"));

function setThreads(value: string): void {
    const trimmed = value.trim();
    if (trimmed === "") {
        emit("update:project", withRender(props.project, { threads: null }));
        return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    emit("update:project", withRender(props.project, { threads: Math.trunc(parsed) }));
}

function setOutputFolder(value: string): void {
    const trimmed = value.trim();
    emit("update:project", withRender(props.project, { outputFolder: trimmed === "" ? null : trimmed }));
}
</script>

<template>
    <div class="mb-project-editor">
        <v-card class="mb-project-editor__head">
            <v-card-text>
                <div class="mb-project-editor__headrow">
                    <v-btn :prepend-icon="mdiArrowLeft" variant="text" size="small" @click="emit('close')">
                        {{ t("project.editor.back", "All projects") }}
                    </v-btn>
                    <v-spacer />
                    <v-chip v-if="project.fromWizard" size="small" variant="tonal">
                        {{ t("project.editor.fromWizard", "made by the guide") }}
                    </v-chip>
                    <v-chip v-if="isDirty" size="small" color="warning" variant="tonal">
                        {{ t("project.editor.unsaved", "unsaved changes") }}
                    </v-chip>
                </div>

                <v-text-field
                    :model-value="project.name"
                    :label="t('project.editor.name', 'Project name')"
                    variant="outlined"
                    density="compact"
                    hide-details="auto"
                    class="mt-2"
                    @update:model-value="(value: string) => emit('update:project', withName(project, value))"
                />

                <p class="mb-project-editor__path">
                    {{ t("project.editor.world", { world }, "Lives at the root of {world}") }}
                </p>
                <p class="mb-project-editor__note">
                    {{
                        t(
                            "project.editor.blurb",
                            "Everything below is applied when this project renders, so a second render repeats the first without asking anything again. The world is wherever this file was found; moving the folder moves the project with it.",
                        )
                    }}
                </p>

                <v-progress-linear v-if="isSaving" indeterminate color="primary" class="mt-2" />

                <v-alert v-if="saveFailure" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
                    {{ saveFailure }}
                </v-alert>

                <v-alert
                    v-for="problem in problemTexts"
                    :key="problem"
                    type="warning"
                    density="compact"
                    variant="tonal"
                    class="mt-2"
                >
                    {{ problem }}
                </v-alert>

                <div class="mb-project-editor__actions">
                    <v-btn
                        :prepend-icon="mdiContentSaveOutline"
                        :disabled="!isDirty || isSaving"
                        color="primary"
                        variant="flat"
                        @click="emit('save')"
                    >
                        {{ t("project.editor.save", "Save the project") }}
                    </v-btn>
                    <v-btn :prepend-icon="mdiUndoVariant" :disabled="!isDirty || isSaving" variant="text" @click="emit('revert')">
                        {{ t("project.editor.revert", "Discard these changes") }}
                    </v-btn>
                    <v-spacer />
                    <v-btn :prepend-icon="mdiPlay" :disabled="!canStart" color="primary" variant="tonal" @click="emit('render')">
                        {{
                            t(
                                "project.editor.render",
                                { maps: maps.filter((map) => map.enabled).length },
                                "Render this project ({maps} maps)",
                            )
                        }}
                    </v-btn>
                </div>

                <p v-if="!renderable" class="mb-project-editor__note">
                    {{
                        t(
                            "project.editor.noEngine",
                            "This build cannot render locally. Every setting here is real and saved to the project either way; starting a render needs the desktop app.",
                        )
                    }}
                </p>
            </v-card-text>
        </v-card>

        <TabbedNavigation
            ref="tabsNav"
            :pages="pages"
            storage-key="material-bluemap-project-editor-tabs"
            :window-label="t('project.editor.windowLabel', 'This project')"
            :strip-label="t('project.editor.tabsLabel', 'Project sections')"
            class="mb-project-editor__tabs"
        >
            <template #maps>
                <ProjectMapsPanel
                    :project="project"
                    :world="world"
                    :separator="separatorValue"
                    :selected-id="selectedMap"
                    @update:project="(value) => emit('update:project', value)"
                    @update:selected-id="(value) => (selectedMap = value)"
                    @consent="emit('consent')"
                    @notify="(message) => emit('notify', message)"
                />
            </template>

            <template #storages>
                <ProjectStoragesPanel
                    :project="project"
                    :default-root="defaultRootValue"
                    :separator="separatorValue"
                    :selected-id="selectedStorage"
                    @update:project="(value) => emit('update:project', value)"
                    @update:selected-id="(value) => (selectedStorage = value)"
                    @consent="emit('consent')"
                    @notify="(message) => emit('notify', message)"
                />
            </template>

            <template #render>
                <section class="mb-project-editor__run" :aria-label="t('project.editor.tab.render', 'How it renders')">
                    <ConfigSearchField
                        v-model="runQuery"
                        v-model:regex="runRegex"
                        v-model:flags="runFlags"
                        :label="t('project.render.search', 'Search these settings')"
                        :placeholder="t('project.render.searchHint', 'threads, edges, output')"
                        :sample="runSample"
                        :summary="runSummary"
                    />

                    <v-text-field
                        v-if="showsRun('threads')"
                        :model-value="project.render.threads ?? ''"
                        :label="t('project.render.threads', 'Render threads')"
                        :hint="t('project.render.threadsHint', 'How many chunks are drawn at once. Left empty, BlueMap decides from the machine it is on, which is usually the right answer.')"
                        persistent-hint
                        type="number"
                        min="1"
                        variant="outlined"
                        density="compact"
                        class="mt-3"
                        @update:model-value="setThreads"
                    />

                    <v-switch
                        v-if="showsRun('force')"
                        :model-value="project.render.force"
                        :label="t('project.render.force', 'Draw everything again')"
                        :hint="t('project.render.forceHint', 'Redraws every chunk rather than only the ones that changed. Slow, and what you want after changing how the map looks.')"
                        persistent-hint
                        color="primary"
                        density="compact"
                        inset
                        @update:model-value="(value: boolean | null) => emit('update:project', withRender(project, { force: value === true }))"
                    />

                    <v-switch
                        v-if="showsRun('fixEdges')"
                        :model-value="project.render.fixEdges"
                        :label="t('project.render.fixEdges', 'Redraw the edges too')"
                        :hint="t('project.render.fixEdgesHint', 'Redraws the boundary between chunks as well as the chunks themselves, which is what fixes seams left by an interrupted render.')"
                        persistent-hint
                        color="primary"
                        density="compact"
                        inset
                        @update:model-value="(value: boolean | null) => emit('update:project', withRender(project, { fixEdges: value === true }))"
                    />

                    <v-switch
                        v-if="showsRun('metrics')"
                        :model-value="project.render.metrics"
                        :label="t('project.render.metrics', 'Send BlueMap\'s anonymous usage report')"
                        :hint="t('project.render.metricsHint', 'Off unless deliberately turned on. Nothing about your world is in it.')"
                        persistent-hint
                        color="primary"
                        density="compact"
                        inset
                        @update:model-value="(value: boolean | null) => emit('update:project', withRender(project, { metrics: value === true }))"
                    />

                    <v-text-field
                        v-if="showsRun('outputFolder')"
                        :model-value="project.render.outputFolder ?? ''"
                        :label="t('project.render.outputFolder', 'Where the rendered map is written')"
                        :hint="t('project.render.outputFolderHint', 'Left empty, the app writes into the folder chosen during setup. This is the one absolute path a project carries, because the output belongs outside the world the file lives in.')"
                        persistent-hint
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        class="mt-3"
                        @update:model-value="setOutputFolder"
                    />

                    <p v-if="visibleRunRows.length === 0" class="mb-project-editor__note">
                        {{ t("project.render.noMatches", "Nothing on this tab matches. The other tabs may still have results.") }}
                    </p>
                </section>
            </template>

            <template v-for="tab in singletonTabs" :key="tab.id" #[tab.id]>
                <p class="mb-project-editor__note">
                    {{
                        tab.touched
                            ? t(
                                  "project.editor.singletonTouched",
                                  { file: `${tab.id}.conf` },
                                  "This project carries its own {file}, so these values are used instead of BlueMap's defaults.",
                              )
                            : t(
                                  "project.editor.singletonAbsent",
                                  { file: `${tab.id}.conf` },
                                  "This project carries no {file} of its own, so BlueMap's own defaults apply. Change anything below and the project starts carrying one, holding only what you set.",
                              )
                    }}
                </p>
                <ConfigFileForm
                    :file="singletonFile(tab.id)"
                    @set="(field, value) => onSingletonSet(tab.id, field, value)"
                    @clear="(field) => onSingletonClear(tab.id, field)"
                    @consent="emit('consent')"
                    @update:text="(text) => onSingletonText(tab.id, text)"
                />
            </template>
        </TabbedNavigation>
    </div>
</template>

<style>
.mb-project-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    inline-size: 100%;
}

.mb-project-editor__head {
    border-radius: 16px;
}

.mb-project-editor__headrow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-project-editor__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}

.mb-project-editor__path {
    margin-block-start: 8px;
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.6875rem;
    color: rgba(var(--v-theme-on-surface), var(--v-disabled-opacity));
    overflow-wrap: anywhere;
}

.mb-project-editor__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-project-editor__tabs {
    flex: 1 1 auto;
    min-height: 0;
}

.mb-project-editor__run {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-inline-size: 720px;
}
</style>
