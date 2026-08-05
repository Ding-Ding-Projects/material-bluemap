<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiMapPlus, mdiProgressClock } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VIcon } from "vuetify/components";
import InterruptedRenders from "./InterruptedRenders.vue";
import RenderRunPanel from "./RenderRunPanel.vue";
import WorldWizard from "./WorldWizard.vue";
import { consentIsAccepted, refreshConsent } from "./consentState.js";
import { createRenderRun } from "./renderRun.js";
import { createResumeOffers } from "./resumeOffers.js";
import {
    canInspectWorlds,
    probeWorldFolder,
    readStorageDirectory,
    resolveOptionalWorldBridge,
    resolveWorldBridge,
    writeStorageDirectory,
    type OptionalWorldBridge,
    type RenderRequest,
    type SettingsTarget,
    type WorldBridge,
} from "./worldBridge.js";
import { createBridgeConfigHost, provideConfigHost, type ConfigHost } from "../config/configHost.js";
import { provideSettingsOpener } from "../downloads/index.js";
import { resolveProjectHost, type ProjectHost } from "../project/projectHost.js";
import { projectFromWizard } from "../project/projectModel.js";
import {
    RunLocationCard,
    createRenderRouter,
    resolveRemoteBridge,
    type RemoteBridge,
    type RemoteTarget,
    type RunLocation,
} from "../remote/index.js";

/**
 * The surface that turns "no map loaded" into a rendered map.
 *
 * Three things live here and they are shown one at a time, because they are three
 * stages of the same job: renders that were cut off and can be carried on, the
 * wizard that makes a new map, and the render that is running or has just ended.
 *
 * A fourth is shown alongside rather than in turn: renders that are in flight right
 * now and are not the one this screen is watching. That happens whenever a render
 * outlives the window that started it - the app is closed and reopened, or a second
 * window is opened - and without it the wizard would cheerfully offer to render a
 * world that is already being drawn. They are deliberately kept apart from the
 * interrupted ones: a running render has not stopped, and offering to carry it on
 * would be offering to start it twice.
 *
 * Nothing here asks for Mojang download consent. It is answered once at first
 * launch and remembered; a render that lacks it comes back with a typed failure
 * and this points at the setting that owns it.
 */
const props = withDefaults(
    defineProps<{
        /**
         * Injected in tests. Left out, the Electron bridge is probed, which is why
         * this has no default: `undefined` means probe, `null` means there is
         * deliberately no bridge.
         */
        bridge?: WorldBridge | null;
        optionalBridge?: OptionalWorldBridge | null;
        /** Same convention, for the file-system host the pickers use. */
        host?: ConfigHost | null;
        /** Same convention, for the host that reads and writes project files. */
        projectHost?: ProjectHost | null;
        /**
         * Bumped by the shell whenever the settings surface closes.
         *
         * The one signal this screen cannot produce for itself. Settings is an in-app
         * dialog rather than another window, so accepting the Mojang download inside it
         * fires no focus or visibility event out here, and without this the review step's
         * own **Open the setting** remedy would keep warning about a consent that has just
         * been given. See `consentState.ts` for why this is a fallback for a shared store
         * rather than the shape this would take if the settings row could publish.
         */
        settingsEpoch?: number;
        /**
         * The remote-render channel, on the same convention as `bridge`.
         *
         * `undefined` means probe the Electron preload, `null` means there is deliberately
         * none and the "where it runs" card should say so rather than offering a machine
         * it cannot reach.
         */
        remoteBridge?: RemoteBridge | null;
        /** True when the shell can open the surface that renders on GitHub's runners. */
        canOpenCi?: boolean;
    }>(),
    { settingsEpoch: 0, canOpenCi: false },
);

const emit = defineEmits<{
    /** Opens the app's own Mojang download-consent setting. */
    consent: [];
    /** Sends somebody to the setting that fixes a render failure. */
    settings: [target: SettingsTarget];
    /** A render finished and somebody asked to see it. */
    openMap: [dataRoot: string, mapIds: readonly string[]];
    /** The wizard was closed without starting anything. */
    cancel: [];
    /**
     * Take the person to the project for this world.
     *
     * Emitted when the guide has just written one, and when the world they chose already
     * had one. The shell owns the navigation; this only says where to go.
     */
    openProject: [world: string];
    /** Take the person to the surface that hands a render to GitHub's runners. */
    openCiRender: [];
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveWorldBridge() : props.bridge;
const optional = props.optionalBridge === undefined ? resolveOptionalWorldBridge() : props.optionalBridge;
const host = props.host === undefined ? createBridgeConfigHost() : props.host;
const projects = props.projectHost === undefined ? resolveProjectHost() : props.projectHost;
provideConfigHost(host);

/**
 * The route from a failure deep inside the wizard to the setting that fixes it.
 *
 * The release downloader lives in the wizard's first step, several components below this
 * one, and a download that cannot write names the storage setting as its remedy. This is
 * the nearest screen that knows how to open one, and providing it here rather than
 * threading an emit through every wizard step keeps the steps in between free of a concern
 * none of them has. A surface mounted without this offer says the setting's name in words
 * instead of showing a button that goes nowhere.
 */
provideSettingsOpener((target) => emit("settings", target));

/* -------------------------------------------------------------------------- */
/* Where this render runs                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The choice, and the routing that makes it real.
 *
 * `createRenderRouter` wraps the ordinary bridge and changes exactly two of its methods, so
 * a render sent over SSH arrives at `RenderRunPanel` as the same events a local one does -
 * same bar, same log, same Cancel button. The alternative was a second progress panel for
 * remote renders, which is a second thing to keep in step and the one that would get behind.
 *
 * The route is read *at the moment a render is started* rather than captured when the router
 * was built, so a machine chosen after the wizard opened is the machine the render goes to.
 */
const remote = props.remoteBridge === undefined ? resolveRemoteBridge() : props.remoteBridge;
const runLocation = ref<RunLocation>("local");
const runTarget = ref<RemoteTarget | null>(null);

const router = createRenderRouter(bridge, remote, () => ({
    location: runLocation.value,
    target: runTarget.value,
}));

// A function, not `runLocation.value` read here: the picker below can change the location
// after this run was constructed, and the panel's route has to say whichever one a render
// actually goes to, not whichever one was chosen first. See `RenderRunOptions.route`.
const run = createRenderRun(router ?? bridge, { route: () => runLocation.value });
const offers = createResumeOffers(bridge);

/**
 * Consent is read, not remembered.
 *
 * It used to be a `ref(false)` filled in once by `onMounted`, which made the review step's
 * remedy a dead end: accepting the download in Settings changed nothing on screen, for the
 * life of the window. `consentState.ts` holds the value now and this only ever reads it,
 * so there is one answer in the application rather than one per surface.
 */
const consentAccepted = consentIsAccepted;
const storage = ref<{ current: string; default: string } | null>(null);
const startFailure = ref<string | null>(null);
/** The map config the wizard produced, kept so a finished render can still show it. */
const lastConfig = ref("");

/* -------------------------------------------------------------------------- */
/* The project this world already has, and the one the guide writes            */
/* -------------------------------------------------------------------------- */

/**
 * The project found at the world the person has chosen, if any.
 *
 * Read as they choose a world rather than at the end, because the point of offering it is
 * that they do not answer five questions first and then find out.
 */
const existingProject = ref<{ name: string; maps: number } | null>(null);
/** The world the guide has just written a project into, so it can be offered. */
const wroteProjectFor = ref<string | null>(null);
const projectFailure = ref<string | null>(null);

/** Which world the last probe was for, so a stale answer cannot overwrite a newer one. */
let probedWorld = "";

async function lookForProject(folder: string): Promise<void> {
    probedWorld = folder;
    if (projects === null || folder === "") {
        existingProject.value = null;
        return;
    }
    try {
        const answer = await projects.readProject(folder);
        // The field can have moved on while this was in flight. Answering for a folder the
        // person is no longer looking at is how a stale offer ends up on screen.
        if (probedWorld !== folder) return;
        existingProject.value = answer.ok ? { name: answer.project.name, maps: answer.project.maps.length } : null;
    } catch {
        if (probedWorld === folder) existingProject.value = null;
    }
}

/**
 * Writes the project the guide's answers describe.
 *
 * This is what stops the guide being a dead end. The same five answers that start a render
 * become a file at the root of the world, so the next render is a button rather than the
 * same five questions - and every setting the guide did not ask about is reachable in the
 * editor rather than gone.
 *
 * A failure here never fails the render. The render is what the person asked for and it is
 * already under way; not being able to write a settings file beside it is worth saying and
 * is not worth stopping for.
 */
async function writeProject(request: RenderRequest, configText: string, storageDirectory: string): Promise<void> {
    const map = request.maps[0];
    if (projects === null || map === undefined || map.world.trim() === "") return;

    const project = projectFromWizard({
        world: map.world,
        mapId: map.id,
        mapName: map.name ?? map.id,
        dimension: map.dimension ?? "minecraft:overworld",
        sorting: map.sorting ?? 0,
        config: configText,
        outputFolder: storageDirectory === "" ? null : storageDirectory,
        force: request.force ?? false,
        fixEdges: request.fixEdges ?? false,
        metrics: request.metrics ?? false,
        threads: request.renderThreads ?? null,
    });

    try {
        const answer = await projects.writeProject(map.world, project);
        if (answer.ok) {
            wroteProjectFor.value = map.world;
            projectFailure.value = null;
        } else {
            projectFailure.value = answer.message;
        }
    } catch (error) {
        projectFailure.value = error instanceof Error ? error.message : String(error);
    }
}

const wizardOpen = computed(() => run.state.value === "idle");
const canInspect = computed(() => canInspectWorlds(optional));
/**
 * The separator generated paths are written with.
 *
 * Falls back to a forward slash rather than to nothing: BlueMap writes forward
 * slashes into its own configs, and leaving it undefined would send the template
 * helper to `node:path`, which a renderer does not have.
 */
const separator = computed(() => host?.separator ?? "/");

/**
 * Renders going on right now that this screen is not already showing.
 *
 * The panel below follows exactly one render, the one this screen started or was
 * asked to watch. Anything else in flight would otherwise be invisible here, so it
 * is named instead, with the one thing that is actually useful to do about it:
 * follow it.
 */
const runningElsewhere = computed(() =>
    offers.active.value.filter((renderId) => renderId !== run.renderId.value),
);

/**
 * Points the panel at a render this screen did not start.
 *
 * Nothing is started, resumed or cancelled: the render is already going, and this
 * only subscribes to the events it is emitting anyway. Refused while the panel is
 * busy with a render of its own, because dropping one for another mid-flight would
 * lose the progress of the first with nothing on screen to say so.
 */
function watchRender(renderId: string): void {
    if (run.active.value) return;
    run.expect(renderId);
}

/**
 * Every moment the consent record can have changed under this screen.
 *
 * Not a poll: each of these is an event, and between them nothing runs. A read that fails
 * leaves the last known answer alone rather than flipping it to "not accepted", so a
 * transient bridge error never looks like the user's own answer changing under them.
 */
function rereadConsent(): void {
    void refreshConsent(bridge);
}

/** The shell closing its settings surface, which is where consent is actually given. */
watch(() => props.settingsEpoch, rereadConsent);

onMounted(async () => {
    // Asked for here rather than left to the interrupted-renders panel, which only
    // mounts when there is a bridge and only renders when it has something to offer.
    // What is running right now has to be known either way.
    void offers.load();
    rereadConsent();

    // The record can also be changed by another window or another process, and those do
    // reach a renderer as real events. Registered here rather than in `consentState.ts`
    // so the listeners live exactly as long as a surface that shows consent is on screen.
    if (typeof window !== "undefined") {
        window.addEventListener("focus", rereadConsent);
        document.addEventListener("visibilitychange", rereadConsent);
    }

    try {
        storage.value = await readStorageDirectory(optional);
    } catch {
        storage.value = null;
    }
});

onBeforeUnmount(() => {
    run.dispose();
    router?.dispose();
    if (typeof window !== "undefined") {
        window.removeEventListener("focus", rereadConsent);
        document.removeEventListener("visibilitychange", rereadConsent);
    }
});

function probe(folder: string) {
    return probeWorldFolder(optional, folder);
}

function applyStorage(value: string) {
    return writeStorageDirectory(optional, value);
}

/**
 * Puts the wizard's config body on the map it describes.
 *
 * The wizard builds exactly one map and exactly one `maps/<id>.conf` for it, so the
 * body belongs to that map and there is no ambiguity to resolve. A request carrying
 * more than one map is not something this wizard produces, and it is left alone
 * deliberately: a single body describes a single map, and spraying it across siblings
 * would render each of them from a config written for another. The main process would
 * then apply the wrong dimension, name and settings to every map but one - which is
 * exactly the silent misapplication this whole change exists to stop.
 *
 * A body already on the map wins, and an empty one is treated as no body at all, so
 * the main process is never handed a file that says nothing.
 */
function withConfig(request: RenderRequest, configText: string): RenderRequest {
    if (configText.trim() === "") return request;
    const only = request.maps.length === 1 ? request.maps[0] : undefined;
    if (only === undefined || only.config !== undefined) return request;
    return { ...request, maps: [{ ...only, config: configText }] };
}

async function start(request: RenderRequest, configText: string, storageDirectory: string): Promise<void> {
    lastConfig.value = configText;
    startFailure.value = null;
    // Written before the render rather than after it, so a render that is cancelled, fails,
    // or outlives the window still leaves the answers behind. A guide whose output survives
    // only a successful render is a guide that asks the same five questions after a crash.
    await writeProject(request, configText, storageDirectory);
    // The config the wizard produced travels with the request rather than being kept
    // beside it. Ninety-odd settings that reach a preview pane and stop there are
    // settings the interface only claimed to apply.
    const result = await run.start(withConfig(request, configText));
    if (result === null && run.failure.value === null) {
        startFailure.value = t("world.screen.noBridge", "This build cannot start a render. Local rendering needs the desktop app.");
    }
    // A render that ended one way or another changes what can be carried on, so
    // the offers are re-read rather than left showing a render that just finished.
    void offers.load();
}

function again(): void {
    run.reset();
    void offers.load();
}

/** The world whose existing project the guide offered to open. */
function openExistingProject(): void {
    if (probedWorld !== "") emit("openProject", probedWorld);
}

/**
 * Carries an interrupted render on.
 *
 * The bridge call resolves only when the resumed render has ended, so the panel
 * starts watching that render id first and shows its progress while the call is
 * still in flight. A refusal is reported by the offer it came from, and the panel
 * goes back to idle rather than showing a render that never started.
 */
async function resume(renderId: string): Promise<void> {
    if (run.active.value) return;
    run.expect(renderId);
    const result = await offers.resume(renderId);
    if (result === null || !result.started) {
        run.reset();
        return;
    }
    run.settle(result.result);
    void offers.load();
}
</script>

<template>
    <div class="mb-world-screen">
        <section
            v-if="runningElsewhere.length > 0"
            class="mb-world-screen__running"
            aria-labelledby="mb-world-screen-running-title"
        >
            <h3 id="mb-world-screen-running-title" class="mb-world-screen__running-title">
                <v-icon :icon="mdiProgressClock" size="20" aria-hidden="true" />
                {{ t("world.screen.runningTitle", "Renders going on right now") }}
            </h3>
            <p class="mb-world-screen__running-blurb">
                {{
                    t(
                        "world.screen.runningBlurb",
                        "These are being drawn on this machine at this moment. They are not waiting to be carried on, and starting one of them again would only be refused.",
                    )
                }}
            </p>
            <ul class="mb-world-screen__running-list">
                <li v-for="renderId in runningElsewhere" :key="renderId" class="mb-world-screen__running-row">
                    <span class="mb-world-screen__running-id">{{ renderId }}</span>
                    <!-- The accessible name opens with the visible label and then names
                         the render, so several identical buttons are told apart without
                         the announced name diverging from the one on screen. -->
                    <v-btn
                        :disabled="run.active.value"
                        :aria-label="t('world.screen.watchOne', { render: renderId }, 'Follow this render, {render}')"
                        variant="text"
                        size="small"
                        @click="watchRender(renderId)"
                    >
                        {{ t("world.screen.watch", "Follow this render") }}
                    </v-btn>
                </li>
            </ul>
        </section>

        <InterruptedRenders v-if="offers.available" :offers="offers" @resume="resume" />

        <RenderRunPanel
            :run="run"
            @open="(dataRoot, mapIds) => emit('openMap', dataRoot, mapIds)"
            @settings="(target) => emit('settings', target)"
            @again="again"
        />

        <v-alert v-if="startFailure" type="error" density="compact" variant="tonal" class="mb-3" role="alert">
            {{ startFailure }}
        </v-alert>

        <!--
            The guide's answers, kept. This is the difference between a wizard and a dead
            end: what was answered once is a file now, editable in full and re-runnable
            without answering anything again.
        -->
        <v-alert
            v-if="wroteProjectFor !== null"
            type="success"
            density="compact"
            variant="tonal"
            class="mb-3"
        >
            {{
                t(
                    "world.screen.wroteProject",
                    "Those answers are now a project at the root of that world, so this render can be repeated without setting anything up again. Every other setting BlueMap has is in the editor.",
                )
            }}
            <template #append>
                <v-btn variant="tonal" size="small" @click="emit('openProject', wroteProjectFor)">
                    {{ t("world.screen.openProject", "Open the project") }}
                </v-btn>
            </template>
        </v-alert>

        <v-alert v-if="projectFailure" type="warning" density="compact" variant="tonal" class="mb-3">
            {{
                t(
                    "world.screen.projectFailed",
                    { message: projectFailure },
                    "The render is going ahead, but the project file could not be written into the world folder, so these answers are not kept: {message}",
                )
            }}
        </v-alert>

        <!--
            Where the render runs, put where the render is started rather than in settings.
            All four answers in one list: this computer, a container on it, a machine over
            SSH, and GitHub's runners. It is above the guide because it changes what the
            guide's last button does, and a choice offered after the button has been pressed
            is not a choice.
        -->
        <RunLocationCard
            v-if="wizardOpen"
            :remote-bridge="remote"
            :can-render-locally="bridge !== null"
            :location="runLocation"
            :can-open-ci="canOpenCi"
            @update:location="(value: RunLocation) => (runLocation = value)"
            @update:target="(value: RemoteTarget | null) => (runTarget = value)"
            @open-ci="emit('openCiRender')"
        />

        <v-card v-if="wizardOpen" class="mb-world-screen__card">
            <v-card-text>
                <header class="mb-world-screen__intro">
                    <h2 class="mb-world-screen__title">
                        {{ t("world.screen.title", "Make a map, the quick way") }}
                    </h2>
                    <p class="mb-world-screen__blurb">
                        {{
                            t(
                                "world.screen.blurb",
                                "Point this at a Minecraft world, answer five short steps, and BlueMap renders it into a map you can walk around. It writes a project into that world as it goes, so the answers are kept: rendering it again is one button, and every setting this guide did not ask about is on the Projects tab.",
                            )
                        }}
                    </p>
                </header>

                <WorldWizard
                    :consent-accepted="consentAccepted"
                    :can-render="bridge !== null"
                    :can-inspect="canInspect"
                    :storage="storage"
                    :separator="separator"
                    :probe="probe"
                    :apply-storage="applyStorage"
                    :existing-project="existingProject"
                    @start="start"
                    @consent="emit('consent')"
                    @cancel="emit('cancel')"
                    @step="rereadConsent"
                    @world="lookForProject"
                    @open-project="openExistingProject"
                />
            </v-card-text>
        </v-card>

        <v-card v-else-if="lastConfig !== ''" variant="tonal" class="mb-world-screen__card">
            <v-card-text>
                <v-btn :prepend-icon="mdiMapPlus" variant="text" size="small" @click="again">
                    {{ t("world.screen.newMap", "Set up another map") }}
                </v-btn>
            </v-card-text>
        </v-card>
    </div>
</template>

<style>
.mb-world-screen {
    display: flex;
    flex-direction: column;
    gap: 4px;
    inline-size: 100%;
    max-inline-size: 960px;
    margin-inline: auto;
    padding: 12px;
}

.mb-world-screen__card {
    border-radius: 16px;
}

.mb-world-screen__title {
    font-size: 1.375rem;
    font-weight: 400;
    line-height: 1.3;
}

.mb-world-screen__blurb {
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-world-screen__intro {
    margin-block-end: 8px;
}

.mb-world-screen__running {
    margin-block: 12px;
}

.mb-world-screen__running-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1rem;
    font-weight: 500;
}

.mb-world-screen__running-blurb {
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    text-wrap: pretty;
}

.mb-world-screen__running-list {
    margin-block-start: 8px;
    padding: 0;
    list-style: none;
}

.mb-world-screen__running-row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
}

.mb-world-screen__running-id {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.8125rem;
    overflow-wrap: anywhere;
}
</style>
