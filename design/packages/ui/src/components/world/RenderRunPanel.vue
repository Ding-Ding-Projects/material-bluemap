<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import {
    mdiAlertCircleOutline,
    mdiCheckCircleOutline,
    mdiChevronDown,
    mdiChevronUp,
    mdiMapSearchOutline,
    mdiRefresh,
    mdiStopCircleOutline,
} from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VCardTitle,
    VChip,
    VIcon,
    VProgressLinear,
} from "vuetify/components";
import RenderConsole from "../console/RenderConsole.vue";
import RenderProgressDetail from "../progress/RenderProgressDetail.vue";
import { LOG_LIMIT, adviseOnFailure, formatDuration, phaseLabel } from "./renderRun.js";
import type { RenderRun } from "./renderRun.js";
import type { SettingsTarget } from "./worldBridge.js";

/**
 * A render, while it happens and after it ends.
 *
 * The progress is the engine's own: which phase, which map, what percentage, and
 * the estimate it computed. It arrives pushed rather than polled because a render
 * moves in ten-second steps over several minutes, and a spinner for four minutes
 * is indistinguishable from a hang.
 *
 * The three endings are three different things on screen. Finished offers the map.
 * Cancelled says the tiles are kept and carrying on later picks up where it
 * stopped. Failed shows the engine's own sentence, what it means, and the one
 * setting that fixes it, which for the two common failures is a real button
 * rather than a stack trace.
 *
 * Every ending also names the engine that produced it, from the `render.json` the
 * render itself wrote. The app promises it never switches renderer silently, and a
 * promise nobody can check is only a promise; this is where the record is read out
 * loud. A build with no record and no live description says nothing rather than
 * naming an engine on the strength of what was expected.
 */
const props = withDefaults(
    defineProps<{
        run: RenderRun;
        /**
         * The current time, handed in by a test that decides what time it is.
         *
         * Null - the default - lets the detail run its own once-a-second clock.
         */
        now?: number | null;
    }>(),
    { now: null },
);

const emit = defineEmits<{
    /** Opens the rendered map. */
    open: [dataRoot: string, mapIds: readonly string[]];
    /** Sends somebody to the setting that fixes a failure. */
    settings: [target: SettingsTarget];
    /** Clears the ended run so another can be started. */
    again: [];
}>();

const { t } = useI18n();

const logOpen = ref(false);
const detailOpen = ref(false);

const state = computed(() => props.run.state.value);

/**
 * The phase, still named in the card's own heading row.
 *
 * The breakdown below names it too, as one of its bars, and that repetition is deliberate
 * rather than an oversight: this panel also renders collapsed inside a wizard step, where
 * the heading row is what somebody reads at a glance, and a heading that says only
 * "Rendering" while the detail says which phase is a heading that made them scroll.
 */
const phaseText = computed(() => phaseLabel(props.run.phase.value, t));

const durationText = computed(() => {
    const ms = props.run.durationMs.value;
    return ms === null ? "" : formatDuration(ms / 1000, t);
});

const advice = computed(() => {
    const failure = props.run.failure.value;
    return failure === null ? null : adviseOnFailure(failure, t);
});

const mapList = computed(() => props.run.mapIds.value.join(", "));

/**
 * The engine that ran, preferring the record over the expectation.
 *
 * `render.json` is written by the render, so it names what actually produced the
 * tiles; the description that arrived on the events is the same engine seen from
 * this end, and stands in while the record is still being read or cannot be. Empty
 * when neither exists, which is the case for a render refused before anything ran.
 */
const engineName = computed(() => props.run.provenance.value?.engine ?? props.run.engine.value?.label ?? "");

const engineLine = computed(() => {
    if (engineName.value === "" || props.run.active.value || state.value === "idle") return "";
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
    // compiles the fallback as a message too and consumes `{engine}` as a named
    // parameter of its own, so a later `replace` has nothing left to substitute and
    // the one line that names the renderer names nothing at all.
    return state.value === "finished"
        ? t("world.run.engineLine", { engine: engineName.value }, "Rendered by: {engine}")
        : t("world.run.engineRan", { engine: engineName.value }, "The engine that ran: {engine}");
});

function openMap(): void {
    const root = props.run.dataRoot.value;
    if (root === null) return;
    emit("open", root, props.run.mapIds.value);
}
</script>

<template>
    <v-card v-if="state !== 'idle'" variant="tonal" class="mb-world-run">
        <v-card-title class="mb-world-run__head">
            <v-icon
                :icon="
                    state === 'finished'
                        ? mdiCheckCircleOutline
                        : state === 'failed'
                          ? mdiAlertCircleOutline
                          : mdiMapSearchOutline
                "
                :color="state === 'finished' ? 'success' : state === 'failed' ? 'error' : undefined"
                size="20"
                aria-hidden="true"
            />
            <span>
                {{
                    state === "starting"
                        ? t("world.run.starting", "Starting the render")
                        : state === "running"
                          ? t("world.run.running", "Rendering")
                          : state === "finished"
                            ? t("world.run.finished", "Rendered")
                            : state === "cancelled"
                              ? t("world.run.cancelled", "Stopped")
                              : t("world.run.failed", "The render did not finish")
                }}
            </span>
            <v-chip v-if="mapList" size="x-small" variant="outlined">{{ mapList }}</v-chip>
            <!-- While it runs, the chip is the only place the engine is named. Once it
                 ends, the line below names it from the record instead, so the chip stands
                 down rather than repeating the same string two rows apart. -->
            <v-chip v-if="run.engine.value && run.active.value" size="x-small" variant="outlined">
                {{ run.engine.value.label }}
            </v-chip>
        </v-card-title>

        <v-card-text>
            <template v-if="run.active.value">
                <p class="mb-world-run__line">
                    <strong>{{ phaseText }}</strong>
                </p>

                <!--
                    The breakdown, and the same component a render on GitHub's runners is
                    drawn with. One percentage was never enough: it says nothing about
                    whether ten minutes or ten hours remain, and it cannot say the one thing
                    somebody actually wants to know four minutes in, which is whether
                    anything is still happening. See `components/progress/`.
                -->
                <RenderProgressDetail :facts="run.progress.value" :now="now ?? null" />

                <v-btn
                    :prepend-icon="mdiStopCircleOutline"
                    :disabled="run.cancelling.value"
                    color="error"
                    variant="tonal"
                    size="small"
                    class="mt-2"
                    @click="run.cancel()"
                >
                    {{ run.cancelling.value ? t("world.run.stopping", "Stopping...") : t("world.run.stop", "Stop the render") }}
                </v-btn>
                <p class="mb-world-run__note">
                    {{
                        t(
                            "world.run.stopNote",
                            "Stopping keeps every tile already drawn. Carrying on later picks up from where it stopped rather than starting again.",
                        )
                    }}
                </p>
            </template>

            <template v-else-if="state === 'finished'">
                <p class="mb-world-run__line">
                    {{
                        t(
                            "world.run.finishedLine",
                            { duration: durationText, root: run.dataRoot.value ?? "" },
                            "Finished in {duration}. The tiles are in {root}.",
                        )
                    }}
                </p>
                <div class="mb-world-run__actions">
                    <v-btn
                        :prepend-icon="mdiMapSearchOutline"
                        :disabled="run.dataRoot.value === null"
                        color="primary"
                        variant="flat"
                        size="small"
                        @click="openMap"
                    >
                        {{ t("world.run.open", "Open the map") }}
                    </v-btn>
                    <v-btn :prepend-icon="mdiRefresh" variant="text" size="small" @click="emit('again')">
                        {{ t("world.run.another", "Render another map") }}
                    </v-btn>
                </div>
            </template>

            <template v-else-if="state === 'cancelled'">
                <p class="mb-world-run__line">
                    {{
                        t(
                            "world.run.cancelledLine",
                            "You stopped it. Every tile it had already drawn is still there, and starting this map again carries on from where it stopped.",
                        )
                    }}
                </p>
                <v-btn :prepend-icon="mdiRefresh" variant="text" size="small" @click="emit('again')">
                    {{ t("world.run.startOver", "Set up another render") }}
                </v-btn>
            </template>

            <template v-else-if="advice">
                <v-alert type="error" density="compact" variant="tonal" role="alert">
                    <p class="mb-world-run__failure">{{ advice.message }}</p>
                    <p class="mb-world-run__note">{{ advice.explanation }}</p>
                </v-alert>

                <div class="mb-world-run__actions">
                    <v-btn
                        v-if="advice.remedy.settings && advice.remedy.actionKey"
                        color="primary"
                        variant="tonal"
                        size="small"
                        @click="emit('settings', advice.remedy.settings)"
                    >
                        {{ t(advice.remedy.actionKey, advice.remedy.actionFallback) }}
                    </v-btn>
                    <v-btn :prepend-icon="mdiRefresh" variant="text" size="small" @click="emit('again')">
                        {{ t("world.run.tryAgain", "Set it up again") }}
                    </v-btn>
                    <v-btn
                        v-if="advice.detail"
                        :append-icon="detailOpen ? mdiChevronUp : mdiChevronDown"
                        :aria-expanded="detailOpen ? 'true' : 'false'"
                        aria-controls="mb-world-run-detail"
                        variant="text"
                        size="small"
                        @click="detailOpen = !detailOpen"
                    >
                        {{ detailOpen ? t("world.run.hideDetail", "Hide the detail") : t("world.run.showDetail", "Show what the engine reported") }}
                    </v-btn>
                </div>

                <pre
                    v-if="detailOpen && advice.detail"
                    id="mb-world-run-detail"
                    class="mb-world-run__pre"
                >{{ advice.detail }}</pre>
            </template>

            <p v-if="engineLine" class="mb-world-run__note mb-world-run__engine">{{ engineLine }}</p>

            <!--
                The console is a disclosure rather than always-open because this panel
                also renders in the middle of a wizard, and a four-hundred-pixel log
                between the progress bar and the Stop button pushes the control somebody
                is reaching for off the screen. What is behind the disclosure is a real
                console, not a `<pre>`: levels, search, filter, sticky scrolling, copy and
                export. See `components/console/RenderConsole.vue`.
            -->
            <div v-if="run.log.value.length > 0" class="mb-world-run__logs">
                <v-btn
                    :append-icon="logOpen ? mdiChevronUp : mdiChevronDown"
                    :aria-expanded="logOpen ? 'true' : 'false'"
                    aria-controls="mb-world-run-log"
                    variant="text"
                    size="x-small"
                    density="comfortable"
                    @click="logOpen = !logOpen"
                >
                    {{
                        logOpen
                            ? t("world.run.hideLog", "Hide the console")
                            : t("world.run.showLog", { n: run.log.value.length }, "Show the console ({n} lines)")
                    }}
                </v-btn>
                <RenderConsole
                    v-if="logOpen"
                    id="mb-world-run-log"
                    :lines="run.log.value"
                    :dropped="run.logDropped.value"
                    :cap="LOG_LIMIT"
                    @settings="(target: SettingsTarget) => emit('settings', target)"
                />
            </div>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-world-run {
    border-radius: 12px;
    margin-block: 12px;
}

.mb-world-run__head {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.9375rem;
}

.mb-world-run__line {
    display: flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    margin-block-start: 8px;
    font-size: 0.8125rem;
    line-height: 1.5;
}

.mb-world-run__line strong {
    font-variant-numeric: tabular-nums;
}

.mb-world-run__failure {
    font-size: 0.875rem;
    line-height: 1.5;
}

.mb-world-run__note {
    margin-block-start: 6px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-world-run__engine {
    margin-block-start: 12px;
}

.mb-world-run__actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-start: 12px;
}

.mb-world-run__logs {
    margin-block-start: 12px;
}

.mb-world-run__pre {
    margin-block-start: 8px;
    padding: 8px;
    max-height: 30vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    border-radius: 8px;
    background: rgba(var(--v-theme-on-surface), 0.06);
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-size: 0.75rem;
    line-height: 1.5;
}

@media (prefers-reduced-motion: reduce) {
    .mb-world-run .v-progress-linear__indeterminate {
        animation-duration: 0.01ms !important;
    }
}
</style>
