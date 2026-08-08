<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiFolderOpenOutline } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardActions,
    VCardText,
    VCardTitle,
    VDivider,
    VSelect,
    VSpacer,
    VTextField,
} from "vuetify/components";
import { serializeProjectFile, type ProjectFile } from "@worldlens/config";
import ProjectEditor from "./ProjectEditor.vue";
import ProjectList from "./ProjectList.vue";
import DiscoveredWorldsPanel from "./DiscoveredWorldsPanel.vue";
import {
    createProject,
    projectRenderRoute,
    projectToRenderRequest,
    renderProblems,
    touch,
    withRender,
    worldLeaf,
    type ProjectRow,
} from "./projectModel.js";
import {
    hostMissingReason,
    resolveProjectHost,
    type ProjectHost,
    type ProjectListing,
} from "./projectHost.js";
import RenderRunPanel from "../world/RenderRunPanel.vue";
import { createRenderRun } from "../world/renderRun.js";
import { consentIsAccepted, refreshConsent } from "../world/consentState.js";
import { resolveWorldCatalogBridge, type WorldCatalogBridge } from "../world/worldCatalog.js";
import {
    readStorageDirectory,
    resolveOptionalWorldBridge,
    resolveWorldBridge,
    type OptionalWorldBridge,
    type SettingsTarget,
    type WorldBridge,
} from "../world/worldBridge.js";
import {
    createBridgeConfigHost,
    provideConfigHost,
    type ConfigHost,
} from "../config/configHost.js";
import { provideSettingsOpener } from "../downloads/index.js";
import { raiseNotice } from "../../stores/notices.js";

/**
 * Projects: the list of them, the editor for one, and the render one starts.
 *
 * This is the surface the shell mounts. It owns the host and the render, and hands both
 * `ProjectList.vue` and `ProjectEditor.vue` values rather than letting either of them reach
 * for a bridge, so both are mountable in a test with nothing behind them.
 *
 * ## Why the render lives here rather than in the editor
 *
 * A render can be started from a row in the list without opening the project at all, which
 * is the whole promise of the feature: everything was decided once, so running it again is
 * a button rather than five steps. That means the panel following the render has to outlive
 * the editor being closed, so it belongs to the screen that contains both.
 *
 * The engine is the same `createRenderRun` the guide uses. There is one render subsystem in
 * this application, and a project is a different way of describing what to render, not a
 * different way of rendering it.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why this has
         * no default: `undefined` means probe, `null` means there is deliberately none.
         */
        host?: ProjectHost | null;
        bridge?: WorldBridge | null;
        optionalBridge?: OptionalWorldBridge | null;
        /** The same world catalogue `MinecraftWorldList.vue` (the wizard) reads from. */
        worldCatalogBridge?: WorldCatalogBridge | null;
        configHost?: ConfigHost | null;
        /** Bumped by the shell when its settings surface closes. See `consentState.ts`. */
        settingsEpoch?: number;
        /**
         * A world whose project the shell wants opened as soon as this screen exists.
         *
         * A prop rather than an exposed method because this screen lives inside a tab
         * panel, and a panel that is not the active one is never rendered: the shell has no
         * component to call a method on at the moment it decides to navigate. Watching a
         * prop works whether the screen was already there or has just been created.
         */
        openWorld?: string | null;
    }>(),
    { settingsEpoch: 0, openWorld: null },
);

const emit = defineEmits<{
    /** Opens the app's own Mojang download-consent setting. */
    consent: [];
    /** Sends somebody to the setting that fixes a render failure. */
    settings: [target: SettingsTarget];
    /** A render finished and somebody asked to see it. */
    openMap: [dataRoot: string, mapIds: readonly string[]];
    /** Opens the click-and-run GitHub Actions surface with this project's world prefilled. */
    cloudRender: [world: string];
}>();

const { t } = useI18n();

const host = props.host === undefined ? resolveProjectHost() : props.host;
const bridge = props.bridge === undefined ? resolveWorldBridge() : props.bridge;
const optional =
    props.optionalBridge === undefined ? resolveOptionalWorldBridge() : props.optionalBridge;
const worldCatalogBridge =
    props.worldCatalogBridge === undefined ? resolveWorldCatalogBridge() : props.worldCatalogBridge;
const configHost = props.configHost === undefined ? createBridgeConfigHost() : props.configHost;
provideConfigHost(configHost);

/**
 * The route from a failure inside a settings form to the setting that fixes it, provided
 * here rather than threaded through every panel between. A surface mounted without this
 * offer says the setting's name in words instead of showing a button that goes nowhere.
 */
provideSettingsOpener((target) => emit("settings", target));

// Always "local": this screen renders through `bridge` directly, with no router and no
// location picker, so every render it starts runs on this computer. See
// `RenderRunOptions.route`.
const run = createRenderRun(bridge, { route: "local" });

const separator = computed(() => configHost?.separator ?? "/");

/* -------------------------------------------------------------------------- */
/* The list                                                                   */
/* -------------------------------------------------------------------------- */

const listing = ref<ProjectListing>({ projects: [], scanned: 0, problems: [] });
const busy = ref(false);
const listFailure = ref<string | null>(null);
const defaultRoot = ref("");

const rows = computed<ProjectRow[]>(() =>
    listing.value.projects.map((summary) => ({
        world: summary.world,
        file: summary.file,
        id: summary.id,
        name: summary.name,
        maps: summary.maps,
        createdAt: summary.createdAt,
        updatedAt: summary.updatedAt,
        fromWizard: summary.fromWizard,
        worldName: summary.worldName,
        problem: summary.problem,
    })),
);

/** Every project's world, so a discovered world already carrying one is left off that list. */
const projectWorldPaths = computed(() => rows.value.map((row) => row.world));

async function reload(): Promise<void> {
    if (host === null) return;
    busy.value = true;
    listFailure.value = null;
    try {
        listing.value = await host.listProjects();
    } catch (error) {
        listFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

/**
 * The settings surface closing is the moment consent can have changed.
 *
 * Rendering a project needs the Mojang download to have been accepted, and this screen
 * offers the same **Open the setting** remedy the guide does. Without this the remedy would
 * be the same dead end it used to be there: the setting opens, accepting it works, and the
 * screen goes on refusing. See `../world/consentState.ts` for why this is an event rather
 * than the shared store it should eventually be.
 */
watch(
    () => props.settingsEpoch,
    () => void refreshConsent(bridge),
);

onMounted(async () => {
    void reload();
    void refreshConsent(bridge);
    try {
        const directory = await readStorageDirectory(optional);
        defaultRoot.value = directory?.current ?? "";
    } catch {
        defaultRoot.value = "";
    }
});

onBeforeUnmount(() => {
    run.dispose();
});

/* -------------------------------------------------------------------------- */
/* The one that is open                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The project being edited, and the copy of it that is on disk.
 *
 * Two refs rather than one plus a dirty flag, because "has this changed" is a question
 * about the two texts and a flag is a third thing that can disagree with both. Serialising
 * both is cheap and exact: the file writer orders its keys, so two projects that differ by
 * nothing serialise identically.
 */
const openWorld = ref<string | null>(null);
const openProject = ref<ProjectFile | null>(null);
const savedProject = ref<ProjectFile | null>(null);
const openFailure = ref<string | null>(null);
const saving = ref(false);
const saveFailure = ref<string | null>(null);

const dirty = computed(
    () =>
        openProject.value !== null &&
        (savedProject.value === null ||
            serializeProjectFile(openProject.value) !== serializeProjectFile(savedProject.value)),
);

let stopAutosaveEvents: (() => void) | null = null;

/**
 * Every project edit reaches the main process's debounced autosave scheduler. The complete
 * project is sent each time, so a later edit replaces an earlier pending snapshot instead
 * of building a queue of stale writes. A failed notification is surfaced, but never makes
 * the field edit itself fail.
 */
watch([openWorld, openProject], ([world, project]) => {
    if (
        world === null ||
        project === null ||
        !dirty.value ||
        host?.notifyAutosaveChange === undefined
    )
        return;
    void host.notifyAutosaveChange(world, project).catch((error: unknown) => {
        raiseNotice(
            "error",
            t(
                "project.autosave.queueFailed",
                { message: error instanceof Error ? error.message : String(error) },
                "This edit is still on screen, but it could not be queued for automatic saving: {message}",
            ),
        );
    });
});

onMounted(() => {
    stopAutosaveEvents =
        host?.onAutosaveEvent?.((event) => {
            if (event.worldFolder !== openWorld.value || !event.result.ok) return;
            // The scheduler returns the exact snapshot it wrote. If another edit arrived while
            // that write was in flight, `openProject` is newer and the dirty comparison remains
            // true; otherwise the saved indicator clears without pretending an older value won.
            savedProject.value = event.result.project;
        }) ?? null;
});

onBeforeUnmount(() => {
    stopAutosaveEvents?.();
    stopAutosaveEvents = null;
});

async function flushPendingAutosave(): Promise<boolean> {
    const world = openWorld.value;
    const project = openProject.value;
    if (world === null || project === null || !dirty.value) return true;
    if (host?.flushAutosave === undefined) {
        await save();
        return !dirty.value;
    }
    try {
        const result = await host.flushAutosave(world, "boundary");
        if (result === null) return true;
        if (!result.ok) {
            saveFailure.value = result.message;
            raiseNotice("error", result.message);
            return false;
        }
        savedProject.value = project;
        saveFailure.value = null;
        return true;
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        saveFailure.value = message;
        raiseNotice("error", message);
        return false;
    }
}

async function open(world: string): Promise<void> {
    if (host === null) return;
    openFailure.value = null;
    saveFailure.value = null;
    busy.value = true;
    try {
        const answer = await host.readProject(world);
        if (!answer.ok) {
            openFailure.value = describeFailure(answer.failure);
            return;
        }
        openWorld.value = world;
        openProject.value = answer.project;
        savedProject.value = answer.project;
    } catch (error) {
        openFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

/**
 * The shell asking for one project in particular, from the guide or from the palette.
 *
 * `immediate` because the usual case is this screen being created *by* the navigation that
 * carries the request, so the prop already holds its value by the time the watcher runs.
 * Declared here rather than beside the other watcher above because it reads `open` and
 * `dirty`, and an immediate watcher written above their declarations runs while both are
 * still in the temporal dead zone.
 *
 * An unsaved project already open is left alone rather than replaced: losing somebody's
 * unsaved edits to honour a navigation is not a trade this makes on its own.
 */
watch(
    () => props.openWorld,
    (world) => {
        if (world === null || world === "" || world === openWorld.value) return;
        if (dirty.value) return;
        void open(world);
    },
    { immediate: true },
);

/**
 * Every way a project file can refuse to be read, in words somebody can act on.
 *
 * `too-new` in particular is a refusal rather than a failure: an older application meeting
 * a newer file must say so and stop rather than guess, because the failure mode of guessing
 * is silently discarding the settings it did not understand the moment it saves.
 */
function describeFailure(failure: {
    kind: string;
    message?: string;
    version?: number;
    problems?: readonly string[];
}): string {
    switch (failure.kind) {
        case "absent":
            return t(
                "project.open.absent",
                "There is no project file in that world folder any more.",
            );
        case "too-new":
            return t(
                "project.open.tooNew",
                { version: String(failure.version ?? "") },
                "That project was written by a newer version of this app (format {version}). Opening it here could silently drop the settings this build does not understand, so it is left alone. Update the app and try again.",
            );
        case "invalid":
            return t(
                "project.open.invalid",
                { problems: (failure.problems ?? []).join("; ") },
                "That project file does not say what a project says: {problems}",
            );
        case "not-json":
            return t(
                "project.open.notJson",
                { message: failure.message ?? "" },
                "That project file is not readable as JSON: {message}",
            );
        default:
            return (
                failure.message ??
                t("project.open.unreadable", "That project file could not be read.")
            );
    }
}

async function closeEditor(flush = true): Promise<void> {
    if (flush && !(await flushPendingAutosave())) return;
    openWorld.value = null;
    openProject.value = null;
    savedProject.value = null;
    saveFailure.value = null;
}

function revert(): void {
    openProject.value = savedProject.value;
    saveFailure.value = null;
}

async function save(): Promise<void> {
    const world = openWorld.value;
    const project = openProject.value;
    if (host === null || world === null || project === null || saving.value) return;

    saving.value = true;
    saveFailure.value = null;
    // `touch` is what clears `fromWizard`: the moment somebody saves an edit, the claim
    // that the guide wrote this and nothing has touched it stops being true.
    const stamped = touch(project);
    try {
        const answer = await host.writeProject(world, stamped);
        if (!answer.ok) {
            saveFailure.value = answer.message;
            return;
        }
        openProject.value = stamped;
        savedProject.value = stamped;
        raiseNotice(
            "success",
            t("project.save.done", { file: answer.file }, "Saved the project to {file}."),
        );
        // The file write above is the thing somebody asked for by pressing Save, and it
        // already succeeded - `answer.ok` said so. `historyOk` is a second, independent
        // promise: that a revision of this save was kept in the local history. When that one
        // breaks, the save itself must still read as the success it was, so this is a
        // second, separate notice rather than folding a failure into the sentence above -
        // and it persists until dismissed, because a broken safety net is not something an
        // auto-dismissing toast should be allowed to say once and forget.
        if (answer.historyOk === false) {
            raiseNotice(
                "warning",
                t(
                    "project.save.historyFailed",
                    { message: answer.historyMessage ?? "" },
                    "The project was saved, but its local history could not be kept: {message}",
                ),
            );
        }
        void reload();
    } catch (error) {
        saveFailure.value = error instanceof Error ? error.message : String(error);
    } finally {
        saving.value = false;
    }
}

/* -------------------------------------------------------------------------- */
/* Starting a new one                                                         */
/* -------------------------------------------------------------------------- */

const createOpen = ref(false);
const createWorld = ref("");
const createRoute = ref<"local" | "github-actions">("local");

const createRouteItems = computed(() => [
    {
        title: t("project.render.routeLocal", "This computer"),
        value: "local" as const,
    },
    {
        title: t(
            "project.render.routeActions",
            "GitHub Actions (works while this computer is off)",
        ),
        value: "github-actions" as const,
    },
]);

const createProblem = computed(() => {
    const path = createWorld.value.trim();
    if (path === "")
        return t("project.create.needWorld", "Choose the world folder this project belongs to.");
    if (!/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(path)) {
        return t(
            "project.create.relative",
            "That path is relative, so where it points depends on where the app was started. Use a full path.",
        );
    }
    if (
        rows.value.some(
            (row) =>
                row.world.replace(/\\/g, "/").toLowerCase() ===
                path.replace(/\\/g, "/").toLowerCase(),
        )
    ) {
        return t(
            "project.create.exists",
            "That world already has a project. Open it rather than starting a second one, because a world holds exactly one project file.",
        );
    }
    return null;
});

async function pickWorld(): Promise<void> {
    if (configHost === null) return;
    const chosen = await configHost.pickDirectory({
        title: t("project.create.pickWorld", "Choose the world folder"),
    });
    if (chosen !== null) createWorld.value = chosen;
}

/**
 * A new project exists in the editor before it exists on disk.
 *
 * Deliberately: somebody who starts one and changes their mind has written nothing into
 * their world folder, and the Save button is what puts it there. That is also why the list
 * does not show it until it has been saved - a row for a file that is not there would be
 * the list asserting something untrue.
 */
function openNewProjectFor(world: string, route: "local" | "github-actions" = "local"): void {
    const project = withRender(createProject(worldLeaf(world)), { route });

    openWorld.value = world;
    openProject.value = project;
    savedProject.value = null;
    saveFailure.value = null;

    raiseNotice(
        "info",
        t(
            "project.create.started",
            "The project is open and automatic saving is on. Add maps or change settings; a quiet pause saves it, and Save now is always available.",
        ),
    );
}

function confirmCreate(): void {
    if (createProblem.value !== null) return;
    const world = createWorld.value.trim();
    const route = createRoute.value;
    createOpen.value = false;
    createWorld.value = "";
    createRoute.value = "local";
    openNewProjectFor(world, route);
}

/* -------------------------------------------------------------------------- */
/* Starting one from a world the catalogue already found                     */
/* -------------------------------------------------------------------------- */

/**
 * One discovered world, chosen to start a project from.
 *
 * The one-click route the contract asks for: no typing, no browsing for the path, straight
 * into the same unsaved-editor state {@link confirmCreate} produces, ready to add maps and
 * save. An unsaved project already open is left alone rather than replaced, exactly as the
 * `openWorld` prop watcher above already treats a navigation request - losing somebody's
 * unsaved edits to honour a click elsewhere in the same tab is not a trade this makes.
 */
function useDiscoveredWorld(world: string): void {
    if (dirty.value) {
        raiseNotice(
            "warning",
            t(
                "project.discovered.unsavedInTheWay",
                "There is an unsaved project open already. Save or close it first, then choose this world again.",
            ),
        );
        return;
    }
    openNewProjectFor(world);
}

/**
 * Several discovered worlds at once: a default project is written for each immediately,
 * rather than opening an editor nobody would review one at a time. Failures are reported
 * per world, the same honesty `forget` below gives a batch delete.
 */
async function useDiscoveredWorlds(worlds: readonly string[]): Promise<void> {
    if (host === null || worlds.length === 0) return;

    busy.value = true;
    const failures: string[] = [];
    let created = 0;
    for (const world of worlds) {
        try {
            const project = touch(createProject(worldLeaf(world)));
            const answer = await host.writeProject(world, project);
            if (answer.ok) created += 1;
            else failures.push(`${world}: ${answer.message}`);
        } catch (error) {
            failures.push(`${world}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    busy.value = false;

    if (created > 0) {
        raiseNotice(
            "success",
            t(
                "project.discovered.createdMany",
                { created },
                "Started {created} projects, with their default maps. Open one to change anything.",
            ),
        );
    }
    for (const failure of failures) {
        raiseNotice(
            "error",
            t(
                "project.discovered.createFailed",
                { failure },
                "This one could not be started: {failure}",
            ),
        );
    }
    void reload();
}

/* -------------------------------------------------------------------------- */
/* Removing one                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Takes project files off the disk. Reached only from behind the two-key gate in
 * `ProjectList.vue`, which names every file and states that the world and its tiles are
 * untouched before either of these runs.
 *
 * Failures are reported per world rather than as one "something went wrong": a batch where
 * three of five were removed has to say which three, or the person has no idea what state
 * their machine is in.
 */
async function forget(worlds: readonly string[]): Promise<void> {
    // Called through the host rather than through a local alias on purpose.
    // `components/confirm/superConfirmPolicy.test.ts` finds destructive call sites by name,
    // and a `remove.call(host, world)` would slip past it - which would leave the one
    // deletion in this feature undeclared in the inventory that exists to catch exactly that.
    const remover = host;
    if (remover === null || remover.deleteProject === undefined || worlds.length === 0) return;

    busy.value = true;
    const failures: string[] = [];
    let gone = 0;
    for (const world of worlds) {
        try {
            const answer = await remover.deleteProject(world);
            if (answer.ok) gone += 1;
            else failures.push(`${world}: ${answer.message}`);
        } catch (error) {
            failures.push(`${world}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    busy.value = false;

    if (openWorld.value !== null && worlds.includes(openWorld.value)) void closeEditor(false);

    if (gone > 0) {
        raiseNotice(
            "success",
            t(
                "project.forget.done",
                { gone },
                "Removed {gone} project files. The worlds themselves are untouched.",
            ),
        );
    }
    for (const failure of failures) {
        raiseNotice(
            "error",
            t("project.forget.failed", { failure }, "This one was not removed: {failure}"),
        );
    }
    void reload();
}

/* -------------------------------------------------------------------------- */
/* Rendering one                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Renders a project with its own settings.
 *
 * The request is built from the file rather than from a form, which is what makes a second
 * render repeat the first without asking anything again. Nothing is asked here at all: the
 * decisions were made in the editor and this reads them.
 */
async function startRender(world: string, project: ProjectFile): Promise<void> {
    if (projectRenderRoute(project) === "github-actions") {
        emit("cloudRender", world);
        return;
    }
    if (run.active.value) return;

    const problems = renderProblems(project);
    if (problems.length > 0) {
        const first = problems[0];
        if (first !== undefined)
            raiseNotice("warning", t(first.key, first.vars ?? {}, first.fallback));
        return;
    }

    if (!consentIsAccepted.value) {
        raiseNotice(
            "warning",
            t(
                "project.render.consentMissing",
                "BlueMap builds its blocks from the Minecraft client files, which are downloaded from Mojang. That download has not been accepted, so this render would stop before it started.",
            ),
            {
                actions: [
                    {
                        id: "open-consent",
                        label: t("project.render.consentAction", "Open the setting"),
                        run: () => emit("consent"),
                    },
                ],
            },
        );
        emit("consent");
        return;
    }

    const result = await run.start(projectToRenderRequest(project, world));
    if (result === null && run.failure.value === null) {
        raiseNotice(
            "error",
            t(
                "project.render.noBridge",
                "This build cannot start a render. Local rendering needs the desktop app.",
            ),
        );
    }
}

/** Renders the project that is open, without re-reading it. */
async function renderOpen(): Promise<void> {
    const world = openWorld.value;
    const project = openProject.value;
    if (world === null || project === null) return;
    if (!(await flushPendingAutosave())) return;
    await startRender(world, project);
}

/**
 * Renders a project straight from its row.
 *
 * The file is read again rather than rendered from the row's summary, because a row knows a
 * name and a count and a render needs every setting. Reading it also means a project that
 * has been edited by hand since the list was built renders as it now is rather than as the
 * list remembers it.
 */
async function renderRow(world: string): Promise<void> {
    if (host === null) return;
    const answer = await host.readProject(world);
    if (!answer.ok) {
        raiseNotice("error", describeFailure(answer.failure));
        return;
    }
    void startRender(world, answer.project);
}

function notify(level: "info" | "success" | "warning" | "error", message: string): void {
    raiseNotice(level, message);
}
</script>

<template>
    <div class="mb-projects-screen">
        <!--
            The render outlives the editor being closed, so it sits above both rather than
            inside either. It renders nothing at all while no render has been started.
        -->
        <RenderRunPanel
            :run="run"
            @open="(dataRoot, mapIds) => emit('openMap', dataRoot, mapIds)"
            @settings="(target) => emit('settings', target)"
            @again="run.reset"
        />

        <v-alert
            v-if="listFailure"
            type="error"
            density="compact"
            variant="tonal"
            class="mb-2"
            role="alert"
        >
            {{ listFailure }}
        </v-alert>

        <v-alert
            v-if="openFailure"
            type="error"
            density="compact"
            variant="tonal"
            class="mb-2"
            role="alert"
        >
            {{ openFailure }}
        </v-alert>

        <ProjectEditor
            v-if="openProject && openWorld !== null"
            :project="openProject"
            :world="openWorld"
            :dirty="dirty"
            :saving="saving"
            :save-failure="saveFailure"
            :can-render="bridge !== null || projectRenderRoute(openProject) === 'github-actions'"
            :rendering="run.active.value"
            :separator="separator"
            :default-root="defaultRoot"
            @update:project="(value) => (openProject = value)"
            @save="save"
            @revert="revert"
            @close="closeEditor"
            @render="renderOpen"
            @consent="emit('consent')"
            @notify="(message) => notify('info', message)"
        />

        <template v-else>
            <!--
                Worlds this computer already found, that nobody has started a project for
                yet - above the established list, so a brand new install shows something
                ready to work with instead of only "no projects yet". See
                `DiscoveredWorldsPanel.vue` and `discoveredWorlds.ts` for the discovered/
                project distinction and why it is drawn this way.
            -->
            <DiscoveredWorldsPanel
                :bridge="worldCatalogBridge"
                :project-worlds="projectWorldPaths"
                @use="useDiscoveredWorld"
                @use-many="useDiscoveredWorlds"
                @notify="notify"
            />

            <ProjectList
                :rows="rows"
                :busy="busy"
                :host-name="host?.name ?? null"
                :can-delete="host?.canDelete ?? false"
                :scanned="listing.scanned"
                :problems="listing.problems"
                @open="open"
                @render="renderRow"
                @forget="(world) => forget([world])"
                @forget-many="forget"
                @refresh="reload"
                @create="createOpen = true"
                @notify="notify"
            />
        </template>

        <!-- Starting one asks for a folder, so it is a decision dialog rather than a notice. -->
        <v-card v-if="createOpen" class="mb-projects-screen__create">
            <v-card-title>{{
                t("project.create.title", "Start a project for a world")
            }}</v-card-title>
            <v-card-text>
                <p class="mb-projects-screen__note">
                    {{
                        t(
                            "project.create.blurb",
                            "The project file lives at the root of the world folder, so the world carries its settings wherever it goes. Automatic saving starts as soon as the project opens.",
                        )
                    }}
                </p>
                <div class="mb-projects-screen__pick">
                    <v-text-field
                        v-model="createWorld"
                        :label="t('project.create.world', 'World folder')"
                        :error-messages="createProblem ? [createProblem] : []"
                        variant="outlined"
                        density="compact"
                        spellcheck="false"
                        hide-details="auto"
                    />
                    <v-btn
                        :prepend-icon="mdiFolderOpenOutline"
                        :disabled="configHost === null"
                        variant="tonal"
                        @click="pickWorld"
                    >
                        {{ t("project.create.browse", "Browse") }}
                    </v-btn>
                </div>
                <v-select
                    v-model="createRoute"
                    :items="createRouteItems"
                    :label="t('project.create.route', 'Render this project on')"
                    :hint="
                        t(
                            'project.create.routeHint',
                            'You can change this later. GitHub Actions installs BlueMap and its dependencies inside the workflow.',
                        )
                    "
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    class="mt-4"
                />
                <p v-if="configHost === null" class="mb-projects-screen__note">
                    {{ hostMissingReason() }}
                </p>
            </v-card-text>
            <v-divider />
            <v-card-actions>
                <v-btn variant="text" @click="createOpen = false">{{
                    t("project.create.cancel", "Cancel")
                }}</v-btn>
                <v-spacer />
                <v-btn
                    color="primary"
                    variant="flat"
                    :disabled="createProblem !== null"
                    @click="confirmCreate"
                >
                    {{ t("project.create.confirm", "Start the project") }}
                </v-btn>
            </v-card-actions>
        </v-card>
    </div>
</template>

<style>
.mb-projects-screen {
    display: flex;
    flex-direction: column;
    gap: 8px;
    inline-size: 100%;
    max-inline-size: 1100px;
    margin-inline: auto;
    padding: 12px;
}

.mb-projects-screen__create {
    border-radius: 16px;
}

.mb-projects-screen__pick {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-block-start: 8px;
}

.mb-projects-screen__pick .v-text-field {
    flex: 1 1 auto;
    min-inline-size: 0;
}

.mb-projects-screen__note {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}
</style>
