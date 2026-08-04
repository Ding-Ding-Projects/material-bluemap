<script setup lang="ts">
import { computed, nextTick, onMounted, ref, shallowRef, watch } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiContentSaveOutline,
    mdiFolderOpenOutline,
    mdiFolderPlusOutline,
    mdiInformationOutline,
    mdiRefresh,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VDivider,
    VList,
    VListItem,
    VListSubheader,
    VProgressLinear,
    VSpacer,
    VTab,
    VTabs,
    VToolbar,
    VTooltip,
    VWindow,
    VWindowItem,
} from "vuetify/components";
import { EMPTY_INVOCATION, type CliInvocation, type FieldMeta, type PlainValue } from "@material-bluemap/config";
import ConfigApplyDialog from "./ConfigApplyDialog.vue";
import ConfigFileForm from "./ConfigFileForm.vue";
import ConfigSearchField from "./ConfigSearchField.vue";
import MapsScreen from "./MapsScreen.vue";
import RunScreen from "./RunScreen.vue";
import StoragesScreen from "./StoragesScreen.vue";
import { clearFieldValue, fieldValue, replaceText, setFieldValue } from "./configModel.js";
import {
    createWorkspace,
    isWorkspaceDirty,
    loadWorkspace,
    markWorkspaceSaved,
    replaceFile,
    savePlan,
    singletonEntry,
    workspaceIssues,
    type ConfigWorkspace,
    type EntryKind,
} from "./configWorkspace.js";
import { SCREENS, buildSettingIndex, groupMatchesByScreen, searchSettings, workspaceSampleText, type ScreenId } from "./configSearch.js";
import { createBridgeConfigHost, hostMissingReason, provideConfigHost, type ConfigHost } from "./configHost.js";
import { notify } from "./notifications.js";
import { notices } from "../../stores/notices.js";

/**
 * The whole options interface.
 *
 * Everything BlueMap can be told, in one place: the four singleton config files,
 * one editor per map, one per storage, and the command-line flags a run is
 * started with. Nothing is a curated subset. The forms are generated from
 * `@material-bluemap/config`, so what appears here is exactly what BlueMap
 * reads, and a setting added to the schema arrives with its control, its
 * documentation and its re-render warning already attached.
 *
 * Nothing is written until the user saves, and the save dialog states what is
 * about to be written, what is about to be deleted, and which maps have to be
 * rendered again as a result.
 */
const props = withDefaults(
    defineProps<{
        /** Opened automatically when the shell already knows the folder. */
        initialFolder?: string | null;
        /** BlueMap's version, written into a generated core.conf comment. */
        version?: string;
        /** Absolute path of the CLI shadow jar, for the run screen's command. */
        jarPath?: string;
        /**
         * Injected in tests. Left out, the Electron bridge is probed instead,
         * which is why this one has no default: `undefined` means "probe" and
         * `null` means "there is deliberately no host".
         */
        host?: ConfigHost | null;
    }>(),
    { initialFolder: null, version: "5.22", jarPath: "bluemap-cli.jar" },
);

const emit = defineEmits<{
    /** The app shell opens its own download-consent setting. Never asked here. */
    consent: [];
    /** Raised after a successful save, so the shell can offer to start a render. */
    saved: [folder: string];
}>();

const { t } = useI18n();

/*
 * The host is used directly and *also* provided to the descendants that need it.
 *
 * It used to be read back with `useConfigHost()` immediately after providing it, which
 * cannot work and failed silently in the direction that looks fine: Vue's `inject` does
 * not see its own component's `provide`, so `host` was always `null` in the desktop
 * build. Every control that needs a file system - Open, New, Re-read, Save - stayed
 * disabled, and the screen fell back to the honest "this is a browser tab" preview it was
 * written to show in a browser tab. The bridge behind it was fine the whole time; nothing
 * ever asked it anything.
 *
 * Providing to children is still right, so the value is used here and provided from the
 * same expression rather than round-tripped through the injection it just created.
 */
const resolvedHost = props.host === undefined ? createBridgeConfigHost() : props.host;
provideConfigHost(resolvedHost);
const host = resolvedHost;

/*
 * Everything this screen reports goes to the shell's one notification corner, which is
 * mounted in `App.vue` and outlives this component. Two things follow from that, and both
 * are the point rather than an accident: a save that closes the editor can still say where
 * it wrote, and there is no `<ConfigNotifications>` in the template below, because a
 * second mounted copy would paint a second fixed stack and show every notice twice.
 */

const workspace = shallowRef<ConfigWorkspace | null>(null);
const activeScreen = ref<ScreenId>("core");
const selectedMapKey = ref<string | null>(null);
const selectedStorageKey = ref<string | null>(null);
const highlightPath = ref<string | null>(null);

const busy = ref(false);
const applyOpen = ref(false);
const saving = ref(false);
const saveFailure = ref<string | null>(null);

const invocation = ref<CliInvocation>(EMPTY_INVOCATION);
const consentAccepted = ref(false);

const query = ref("");
const regexMode = ref(false);
// `i` because nobody means case-sensitively when they type a setting name, and
// `m` because a field's searchable text is several lines (label, key, Java field,
// upstream's explanation), so `^` and `$` are only useful per line.
const flags = ref("im");

// ---- consent ---------------------------------------------------------------

/**
 * Reads the recorded consent. It is never asked for here.
 *
 * The app asks once at first launch and remembers the answer forever. This
 * screen only reports the state, uses it to fill in `accept-download`, and
 * points at the setting that owns it.
 */
async function readConsent(): Promise<void> {
    const bridge = (window as { materialBluemap?: { readConsent?: () => Promise<{ accepted: boolean }> } }).materialBluemap;
    if (bridge?.readConsent === undefined) return;
    try {
        consentAccepted.value = (await bridge.readConsent()).accepted;
    } catch {
        consentAccepted.value = false;
    }
}

/**
 * Writes `accept-download: true` into core.conf when consent has already been
 * given and the file does not say so yet.
 *
 * The consent record is the source of truth; core.conf is how BlueMap learns
 * about it. Doing this here means a render is not blocked by a key nobody knew
 * they had to tick, and the change is announced and appears in the save plan
 * rather than happening silently.
 */
function syncConsentIntoCore(): void {
    const current = workspace.value;
    if (current === null || !consentAccepted.value) return;

    const core = singletonEntry(current, "core");
    if (core === undefined) return;

    const field = core.file.descriptor.fields.find((candidate) => candidate.path === "accept-download");
    if (field === undefined || fieldValue(core.file, field) === true) return;

    workspace.value = replaceFile(current, core.key, setFieldValue(core.file, field, true));
    notify(
        notices,
        "info",
        t(
            "config.shell.consentApplied",
            "Set accept-download to true in core.conf, from the download consent you already gave. It is written when you save.",
        ),
    );
}

// ---- opening and creating --------------------------------------------------

async function openFolderAt(folder: string): Promise<void> {
    if (host === null) return;

    busy.value = true;
    try {
        const contents = await host.readFolder(folder);
        const loaded = loadWorkspace(contents.folder, contents.files);
        workspace.value = loaded;
        syncConsentIntoCore();
        invocation.value = { ...invocation.value, configFolder: contents.folder };

        const maps = loaded.entries.filter((entry) => entry.kind === "map").length;
        const storages = loaded.entries.filter((entry) => entry.kind === "storage").length;
        // `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
        // vue-i18n compiles the message itself, so it consumes `{folder}` and the counts as
        // its own named parameters and a later `replace` finds nothing left to substitute.
        // These notifications exist to say which folder was read and how much was in it, so
        // the broken form leaves a success toast that reports neither.
        notify(
            notices,
            "success",
            t(
                "config.shell.opened",
                { files: contents.files.length, folder: contents.folder, maps, storages },
                "Read {files} config files from {folder}: {maps} maps and {storages} storages.",
            ),
        );

        if (loaded.unknown.length > 0) {
            notify(
                notices,
                "info",
                t(
                    "config.shell.unknownFiles",
                    { n: loaded.unknown.length },
                    "{n} files in that folder are not BlueMap configs. They are left exactly as they are.",
                ),
                loaded.unknown.join("\n"),
            );
        }
    } catch (error) {
        notify(
            notices,
            "error",
            t("config.shell.openFailed", { folder }, "Could not read {folder}."),
            error instanceof Error ? error.message : String(error),
        );
    } finally {
        busy.value = false;
    }
}

/**
 * Import, in one action: pick a folder that already has BlueMap configs in it
 * and carry on from there, with nothing retyped.
 */
async function openFolder(): Promise<void> {
    if (host === null) return;
    const chosen = await host.pickDirectory({ title: t("config.shell.pickFolder", "Choose a BlueMap config folder") });
    if (chosen !== null) await openFolderAt(chosen);
}

/** A fresh folder, generated exactly as the CLI would generate it. */
async function newFolder(): Promise<void> {
    if (host === null) return;

    const folder = await host.pickDirectory({ title: t("config.shell.pickNewFolder", "Choose where the config folder goes") });
    if (folder === null) return;

    const world = await host.pickDirectory({ title: t("config.shell.pickWorld", "Choose the world folder, the one with level.dat") });
    if (world === null) return;

    const separator = host.separator;
    const join = (...parts: string[]): string => parts.join(separator);

    workspace.value = createWorkspace(folder, {
        webroot: join(folder, "web"),
        dataFolder: join(folder, "data"),
        world,
        version: props.version,
    });
    invocation.value = { ...invocation.value, configFolder: folder };
    syncConsentIntoCore();

    notify(
        notices,
        "success",
        t("config.shell.generated", { folder }, "Generated a full config set for {folder}. Nothing is on disk until you save."),
    );
}

/** A workspace with no folder behind it, so the editor is usable in a browser tab. */
function previewWorkspace(): void {
    workspace.value = createWorkspace(null, {
        webroot: "/bluemap/web",
        dataFolder: "/bluemap/data",
        world: "/minecraft/world",
        version: props.version,
    });
    notify(
        notices,
        "info",
        t(
            "config.shell.preview",
            "Loaded a generated config set to look at. It is not on disk, and this build cannot write one; the paths in it are examples.",
        ),
    );
}

onMounted(async () => {
    await readConsent();
    if (props.initialFolder !== null && host !== null) {
        await openFolderAt(props.initialFolder);
        return;
    }
    if (host === null) previewWorkspace();
});

watch(consentAccepted, () => syncConsentIntoCore());

// ---- editing the singleton screens ----------------------------------------

function singleton(kind: EntryKind) {
    return workspace.value === null ? undefined : singletonEntry(workspace.value, kind);
}

const coreEntry = computed(() => singleton("core"));
const webappEntry = computed(() => singleton("webapp"));
const webserverEntry = computed(() => singleton("webserver"));
const pluginEntry = computed(() => singleton("plugin"));

function editSingleton(kind: EntryKind, field: FieldMeta, value: PlainValue): void {
    const current = workspace.value;
    const entry = singleton(kind);
    if (current === null || entry === undefined) return;
    workspace.value = replaceFile(current, entry.key, setFieldValue(entry.file, field, value));
}

function clearSingleton(kind: EntryKind, field: FieldMeta): void {
    const current = workspace.value;
    const entry = singleton(kind);
    if (current === null || entry === undefined) return;
    workspace.value = replaceFile(current, entry.key, clearFieldValue(entry.file, field));
}

function rawSingleton(kind: EntryKind, text: string): void {
    const current = workspace.value;
    const entry = singleton(kind);
    if (current === null || entry === undefined) return;
    workspace.value = replaceFile(current, entry.key, replaceText(entry.file, text));
}

// ---- search across every screen -------------------------------------------

const index = computed(() => (workspace.value === null ? [] : buildSettingIndex(workspace.value)));
const results = computed(() => searchSettings(index.value, query.value, regexMode.value, flags.value));
const grouped = computed(() => (results.value.active ? groupMatchesByScreen(results.value.matches) : []));

const searchSummary = computed(() => {
    if (results.value.error !== null) return t("config.shell.badPattern", "The pattern is not valid, so nothing is listed.");
    if (!results.value.active) return t("config.shell.total", { n: index.value.length }, "{n} settings across every screen.");
    return t(
        "config.shell.found",
        { shown: results.value.matches.length, total: results.value.searched, screens: grouped.value.length },
        "{shown} of {total} settings match, across {screens} screens.",
    );
});

/** Opens the screen a result lives on, reveals its group and marks the row. */
async function goTo(screenId: ScreenId, entryKey: string, path: string): Promise<void> {
    activeScreen.value = screenId;
    if (screenId === "maps") selectedMapKey.value = entryKey;
    if (screenId === "storages") selectedStorageKey.value = entryKey;

    highlightPath.value = null;
    await nextTick();
    highlightPath.value = path;
}

// ---- saving ----------------------------------------------------------------

const plan = computed(() => (workspace.value === null ? null : savePlan(workspace.value)));
const issues = computed(() => (workspace.value === null ? [] : workspaceIssues(workspace.value)));
const dirty = computed(() => workspace.value !== null && isWorkspaceDirty(workspace.value));

const saveReason = computed(() => {
    if (host === null) return hostMissingReason(t("config.shell.saving", "Saving a config folder"));
    if (workspace.value === null) return t("config.shell.noFolder", "Open a config folder first.");
    if (workspace.value.folder === null) return t("config.shell.noFolderPath", "This config set is not attached to a folder yet.");
    if (!dirty.value) return t("config.shell.nothingToSave", "Nothing has changed.");
    return "";
});

async function confirmSave(): Promise<void> {
    const current = workspace.value;
    const currentPlan = plan.value;
    if (current === null || currentPlan === null || current.folder === null || host === null) return;

    saving.value = true;
    saveFailure.value = null;
    try {
        if (currentPlan.writes.length > 0) await host.writeFiles(current.folder, currentPlan.writes);
        if (currentPlan.deletes.length > 0) await host.deleteFiles(current.folder, currentPlan.deletes);

        workspace.value = markWorkspaceSaved(current, currentPlan);
        applyOpen.value = false;

        notify(
            notices,
            "success",
            t(
                "config.shell.saved",
                { writes: currentPlan.writes.length, deletes: currentPlan.deletes.length, folder: current.folder },
                "Wrote {writes} files and deleted {deletes} in {folder}.",
            ),
        );

        if (currentPlan.affectedMapIds.length > 0) {
            notify(
                notices,
                "warning",
                t(
                    "config.shell.needsRender",
                    { maps: currentPlan.affectedMapIds.join(", ") },
                    "These maps have to be rendered again before what you see matches what you saved: {maps}.",
                ),
            );
        }

        emit("saved", current.folder);
    } catch (error) {
        saveFailure.value = error instanceof Error ? error.message : String(error);
        notify(notices, "error", t("config.shell.saveFailed", "The files were not written."), saveFailure.value);
    } finally {
        saving.value = false;
    }
}

async function reload(): Promise<void> {
    const folder = workspace.value?.folder;
    if (folder === undefined || folder === null) return;
    await openFolderAt(folder);
}

const errorCount = computed(() => issues.value.filter((issue) => issue.severity === "error").length);
const sample = computed(() => (workspace.value === null ? "" : workspaceSampleText(workspace.value)));

/** Normalised for the same `exactOptionalPropertyTypes` reason as elsewhere. */
const jarPathValue = computed(() => props.jarPath ?? "bluemap-cli.jar");
</script>

<template>
    <div class="mb-config-screen">
        <v-toolbar density="comfortable" color="transparent" class="mb-config-screen__bar">
            <v-btn :prepend-icon="mdiFolderOpenOutline" :disabled="host === null || busy" variant="tonal" size="small" @click="openFolder">
                {{ t("config.shell.open", "Open or import a config folder") }}
                <v-tooltip
                    activator="parent"
                    location="bottom"
                    :text="
                        host === null
                            ? hostMissingReason(t('config.shell.reading', 'Reading a config folder'))
                            : t(
                                  'config.shell.openHint',
                                  'Point this at a folder BlueMap already uses. Every file in it is read as it is, comments and all.',
                              )
                    "
                />
            </v-btn>
            <v-btn :prepend-icon="mdiFolderPlusOutline" :disabled="host === null || busy" variant="text" size="small" @click="newFolder">
                {{ t("config.shell.new", "New config folder") }}
            </v-btn>
            <v-btn
                :prepend-icon="mdiRefresh"
                :disabled="host === null || workspace?.folder == null || busy"
                variant="text"
                size="small"
                @click="reload"
            >
                {{ t("config.shell.reload", "Re-read from disk") }}
            </v-btn>

            <v-spacer />

            <v-chip v-if="errorCount > 0" size="small" color="error" variant="flat" class="mr-2">
                {{ t("config.shell.errorCount", { n: errorCount }, "{n} problems") }}
            </v-chip>
            <v-chip v-if="dirty" size="small" color="primary" variant="tonal" class="mr-2">
                {{ t("config.shell.unsaved", "Unsaved changes") }}
            </v-chip>

            <v-btn
                :prepend-icon="mdiContentSaveOutline"
                :disabled="saveReason !== ''"
                color="primary"
                variant="flat"
                size="small"
                @click="applyOpen = true"
            >
                {{ t("config.shell.save", "Save") }}
                <v-tooltip v-if="saveReason" activator="parent" location="bottom" :text="saveReason" />
            </v-btn>
        </v-toolbar>

        <v-progress-linear v-if="busy" indeterminate color="primary" />

        <v-alert v-if="host === null" type="info" density="compact" variant="tonal" class="mb-3">
            {{
                t(
                    "config.shell.browserMode",
                    "This build cannot reach a file system, so nothing can be opened or saved. Every editor below still works, and the file text can be copied out of each screen.",
                )
            }}
        </v-alert>

        <template v-if="workspace">
            <v-card variant="tonal" class="mb-config-screen__search">
                <v-card-text>
                    <ConfigSearchField
                        v-model="query"
                        v-model:regex="regexMode"
                        v-model:flags="flags"
                        :label="t('config.shell.search', 'Search every setting')"
                        :placeholder="t('config.shell.searchHint', 'name, key, or anything in the explanation')"
                        :sample="sample"
                        :summary="searchSummary"
                        density="comfortable"
                    />

                    <div v-if="results.active && results.error === null" class="mb-config-screen__results">
                        <p v-if="grouped.length === 0" class="mb-config-screen__note">
                            {{ t("config.shell.noMatches", "Nothing matches on any screen.") }}
                        </p>
                        <v-list v-else density="compact" class="mb-config-screen__result-list">
                            <template v-for="screen in grouped" :key="screen.screenId">
                                <v-list-subheader>
                                    {{ screen.screenLabel }}
                                    <v-chip size="x-small" variant="outlined" class="ml-2">{{ screen.count }}</v-chip>
                                    <span v-if="screen.screenId !== activeScreen" class="mb-config-screen__elsewhere">
                                        {{ t("config.shell.otherScreen", "on another screen") }}
                                    </span>
                                </v-list-subheader>
                                <template v-for="entry in screen.entries" :key="entry.entryKey">
                                    <v-list-item
                                        v-for="match in entry.matches"
                                        :key="`${entry.entryKey}:${match.field.path}`"
                                        :title="match.field.label"
                                        :subtitle="`${entry.entryLabel} · ${match.location.groupLabel} · ${match.field.path} = ${match.valueText}`"
                                        @click="goTo(screen.screenId, entry.entryKey, match.field.path)"
                                    />
                                </template>
                            </template>
                        </v-list>
                    </div>
                </v-card-text>
            </v-card>

            <v-tabs v-model="activeScreen" density="comfortable" show-arrows class="mb-config-screen__tabs">
                <v-tab v-for="screen in SCREENS" :key="screen.id" :value="screen.id">{{ screen.label }}</v-tab>
            </v-tabs>
            <v-divider />

            <v-window v-model="activeScreen" class="mb-config-screen__window">
                <v-window-item value="core">
                    <ConfigFileForm
                        v-if="coreEntry"
                        :file="coreEntry.file"
                        :highlight-path="highlightPath"
                        @set="(field, value) => editSingleton('core', field, value)"
                        @clear="(field) => clearSingleton('core', field)"
                        @consent="emit('consent')"
                        @update:text="(text) => rawSingleton('core', text)"
                    />
                    <p v-else class="mb-config-screen__note">{{ t("config.shell.missingCore", "This folder has no core.conf.") }}</p>
                </v-window-item>

                <v-window-item value="maps">
                    <MapsScreen
                        :workspace="workspace"
                        :selected-key="selectedMapKey"
                        :highlight-path="highlightPath"
                        @update:workspace="(value) => (workspace = value)"
                        @update:selected-key="(value) => (selectedMapKey = value)"
                        @consent="emit('consent')"
                        @notify="(message) => notify(notices, 'info', message)"
                    />
                </v-window-item>

                <v-window-item value="storages">
                    <StoragesScreen
                        :workspace="workspace"
                        :selected-key="selectedStorageKey"
                        :highlight-path="highlightPath"
                        @update:workspace="(value) => (workspace = value)"
                        @update:selected-key="(value) => (selectedStorageKey = value)"
                        @consent="emit('consent')"
                        @notify="(message) => notify(notices, 'info', message)"
                    />
                </v-window-item>

                <v-window-item value="webapp">
                    <ConfigFileForm
                        v-if="webappEntry"
                        :file="webappEntry.file"
                        :highlight-path="highlightPath"
                        @set="(field, value) => editSingleton('webapp', field, value)"
                        @clear="(field) => clearSingleton('webapp', field)"
                        @consent="emit('consent')"
                        @update:text="(text) => rawSingleton('webapp', text)"
                    />
                    <p v-else class="mb-config-screen__note">{{ t("config.shell.missingWebapp", "This folder has no webapp.conf.") }}</p>
                </v-window-item>

                <v-window-item value="webserver">
                    <ConfigFileForm
                        v-if="webserverEntry"
                        :file="webserverEntry.file"
                        :highlight-path="highlightPath"
                        @set="(field, value) => editSingleton('webserver', field, value)"
                        @clear="(field) => clearSingleton('webserver', field)"
                        @consent="emit('consent')"
                        @update:text="(text) => rawSingleton('webserver', text)"
                    />
                    <p v-else class="mb-config-screen__note">
                        {{ t("config.shell.missingWebserver", "This folder has no webserver.conf.") }}
                    </p>
                </v-window-item>

                <v-window-item value="plugin">
                    <ConfigFileForm
                        v-if="pluginEntry"
                        :file="pluginEntry.file"
                        :highlight-path="highlightPath"
                        @set="(field, value) => editSingleton('plugin', field, value)"
                        @clear="(field) => clearSingleton('plugin', field)"
                        @consent="emit('consent')"
                        @update:text="(text) => rawSingleton('plugin', text)"
                    />
                    <v-alert v-else type="info" density="compact" variant="tonal">
                        {{
                            t(
                                "config.shell.missingPlugin",
                                "This folder has no plugin.conf. The command-line BlueMap never writes one; only a server plugin reads it.",
                            )
                        }}
                    </v-alert>
                </v-window-item>

                <v-window-item value="run">
                    <RunScreen
                        :invocation="invocation"
                        :jar-path="jarPathValue"
                        :consent-accepted="consentAccepted"
                        @update:invocation="(value) => (invocation = value)"
                        @consent="emit('consent')"
                    />
                </v-window-item>
            </v-window>
        </template>

        <v-card v-else variant="tonal" class="mb-config-screen__welcome">
            <v-card-text>
                <p class="mb-config-screen__welcome-head">
                    <v-icon :icon="mdiInformationOutline" size="20" aria-hidden="true" />
                    {{ t("config.shell.welcome", "Nothing is open yet.") }}
                </p>
                <p class="mb-config-screen__note">
                    {{
                        t(
                            "config.shell.welcomeBody",
                            "Open a folder BlueMap already uses to carry on from it, or generate a new set of config files here.",
                        )
                    }}
                </p>
            </v-card-text>
        </v-card>

        <ConfigApplyDialog
            v-if="plan"
            v-model="applyOpen"
            :plan="plan"
            :issues="issues"
            :folder="workspace?.folder ?? null"
            :saving="saving"
            :failure="saveFailure"
            @confirm="confirmSave"
        />
    </div>
</template>

<style>
.mb-config-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px 24px;
    max-width: 1200px;
    margin-inline: auto;
}

.mb-config-screen__bar {
    flex-wrap: wrap;
    gap: 8px;
}

.mb-config-screen__search {
    border-radius: 12px;
}

.mb-config-screen__results {
    margin-block-start: 8px;
}

.mb-config-screen__result-list {
    max-height: 40vh;
    overflow-y: auto;
    background: transparent;
}

.mb-config-screen__elsewhere {
    margin-inline-start: 8px;
    font-size: 0.6875rem;
    font-style: italic;
}

.mb-config-screen__tabs {
    margin-block-start: 8px;
}

.mb-config-screen__window {
    padding-block-start: 16px;
    overflow: visible;
}

.mb-config-screen__note {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-screen__welcome {
    border-radius: 12px;
}

.mb-config-screen__welcome-head {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9375rem;
    margin-block-end: 4px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-config-screen * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
