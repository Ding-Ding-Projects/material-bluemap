<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiMapPlus, mdiProgressClock } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VIcon } from "vuetify/components";
import InterruptedRenders from "./InterruptedRenders.vue";
import RenderRunPanel from "./RenderRunPanel.vue";
import WorldWizard from "./WorldWizard.vue";
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
    }>(),
    {},
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
}>();

const { t } = useI18n();

const bridge = props.bridge === undefined ? resolveWorldBridge() : props.bridge;
const optional = props.optionalBridge === undefined ? resolveOptionalWorldBridge() : props.optionalBridge;
const host = props.host === undefined ? createBridgeConfigHost() : props.host;
provideConfigHost(host);

const run = createRenderRun(bridge);
const offers = createResumeOffers(bridge);

const consentAccepted = ref(false);
const storage = ref<{ current: string; default: string } | null>(null);
const startFailure = ref<string | null>(null);
/** The map config the wizard produced, kept so a finished render can still show it. */
const lastConfig = ref("");

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

onMounted(async () => {
    // Asked for here rather than left to the interrupted-renders panel, which only
    // mounts when there is a bridge and only renders when it has something to offer.
    // What is running right now has to be known either way.
    void offers.load();
    if (bridge !== null) {
        try {
            consentAccepted.value = (await bridge.readConsent()).accepted;
        } catch {
            // Not knowing means the review step warns, which is the safe direction:
            // it points at the setting rather than promising a render that would stop.
            consentAccepted.value = false;
        }
    }
    try {
        storage.value = await readStorageDirectory(optional);
    } catch {
        storage.value = null;
    }
});

onBeforeUnmount(() => {
    run.dispose();
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

async function start(request: RenderRequest, configText: string): Promise<void> {
    lastConfig.value = configText;
    startFailure.value = null;
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

        <v-card v-if="wizardOpen" class="mb-world-screen__card">
            <v-card-text>
                <header class="mb-world-screen__intro">
                    <h2 class="mb-world-screen__title">
                        {{ t("world.screen.title", "Make a map") }}
                    </h2>
                    <p class="mb-world-screen__blurb">
                        {{
                            t(
                                "world.screen.blurb",
                                "Point this at a Minecraft world, answer five short steps, and BlueMap renders it into a map you can walk around. Everything it can be told is here, so nothing has to be written into a config file by hand.",
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
                    @start="start"
                    @consent="emit('consent')"
                    @cancel="emit('cancel')"
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
