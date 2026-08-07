<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiRestart, mdiSpeedometer } from "@mdi/js";
import { VBtn, VCard, VCardText, VChip, VIcon } from "vuetify/components";
import { matchThreadCount } from "../config/speedLevels.js";
import type { ThreadCountMatch } from "../config/speedLevels.js";
import { raiseNotice } from "../../stores/notices.js";
import { RenderThroughput } from "../progress/index.js";
import type { RenderRun } from "./renderRun.js";
import type { SpeedAdjustmentResult, SpeedLevelNumber } from "./worldBridge.js";

/**
 * The 1-5 speed dial, drawn beside a render that is **already running**.
 *
 * This is not the pre-render `SpeedControl.vue`, and it does not pretend to be: that dial
 * writes two raw `core.conf` fields a JVM only ever reads at startup, and neither can move
 * on a process that has already started - see `main/runtime/speedControl.ts`'s own header
 * for the full accounting. What genuinely can move here is coarser and outside the JVM
 * entirely: this render's own OS scheduling priority, or a running container's CPU quota.
 * That is real, it is live, and it is everything a click on one of these five buttons does -
 * never more, and {@link deferredNote} says so beside every single outcome.
 *
 * ## Honesty at the moment of the click
 *
 * `run.adjustSpeed(level)` reaches the main process and comes back with a structured
 * {@link SpeedAdjustmentResult} - `appliedNow`, `needsRestart`, the route, and the exact
 * reason - and this component builds its sentence from *those facts*, never by guessing
 * what a level "should" do. A non-blocking notice reports it immediately, and the same
 * facts stay on screen afterwards so nobody has to have caught the toast to know what
 * happened.
 *
 * ## Restarting is offered, never performed behind anybody's back
 *
 * The thread count baked into this render's launch only changes when the render itself
 * restarts. `run.restartWithLevel` does that - stop, wait for the real end, start again
 * with the chosen level's own thread count and JVM thread priority - and it only ever runs from the explicit
 * "Restart at this level" button below, never automatically.
 */
const props = defineProps<{ run: RenderRun }>();

const { t } = useI18n();

const route = computed(() => props.run.progress.value.route);

type DisabledReason = "actions" | "remote" | "unknown";

const disabledReason = computed<DisabledReason | null>(() => {
    const current = route.value;
    if (current === "actions") return "actions";
    if (current === "remote") return "remote";
    if (current === "local" || current === "docker") return null;
    // `null` (nobody has said yet) reads the same as an unrecognised value: nothing here
    // can be safely adjusted, and the reason is that this build does not know where the
    // render is, not that the render is somewhere unreachable.
    return "unknown";
});

const isDisabled = computed(() => disabledReason.value !== null);

const currentMatch = computed<ThreadCountMatch>(() => matchThreadCount(props.run.renderThreads.value));

const pendingLevel = ref<SpeedLevelNumber | null>(null);
const lastOutcome = ref<SpeedAdjustmentResult | null>(null);
const restarting = ref(false);

function routeWord(value: SpeedAdjustmentResult["route"]): string {
    switch (value) {
        case "local":
            return t("liveSpeed.route.local", "local");
        case "docker":
            return t("liveSpeed.route.docker", "docker");
        default:
            return t("liveSpeed.route.unsupported", "this route");
    }
}

/** The one sentence built from the main process's own facts, never guessed here. */
function outcomeText(result: SpeedAdjustmentResult): string {
    const values = { level: result.level, route: routeWord(result.route) };
    return result.appliedNow
        ? t(
              "liveSpeed.outcomeApplied",
              values,
              "Level {level} is now applied to the {route} route, effective immediately.",
          )
        : t(
              "liveSpeed.outcomeBlocked",
              values,
              "Level {level} could not be applied to the {route} route right now.",
          );
}

function levelLabel(level: SpeedLevelNumber): string {
    switch (level) {
        case 1:
            return t("speed.level.1", "1 · Gentle");
        case 2:
            return t("speed.level.2", "2 · Light");
        case 3:
            return t("speed.level.3", "3 · Balanced");
        case 4:
            return t("speed.level.4", "4 · Fast");
        default:
            return t("speed.level.5", "5 · Fastest");
    }
}

async function chooseLevel(level: SpeedLevelNumber): Promise<void> {
    if (isDisabled.value || pendingLevel.value !== null) return;
    pendingLevel.value = level;
    let result: SpeedAdjustmentResult | null = null;
    try {
        result = await props.run.adjustSpeed(level);
    } finally {
        pendingLevel.value = null;
    }
    lastOutcome.value = result;
    if (result === null) return;
    raiseNotice(result.appliedNow ? "success" : "warning", outcomeText(result), result.message);
}

async function restartNow(): Promise<void> {
    const outcome = lastOutcome.value;
    if (outcome === null || restarting.value) return;
    restarting.value = true;
    try {
        await props.run.restartWithLevel(outcome.level);
    } finally {
        restarting.value = false;
    }
}
</script>

<template>
    <v-card variant="tonal" class="mb-livespeed">
        <v-card-text>
            <div class="mb-livespeed__head">
                <v-icon :icon="mdiSpeedometer" aria-hidden="true" />
                <h3 class="mb-livespeed__title">{{ t("liveSpeed.title", "Adjust speed") }}</h3>
            </div>

            <p v-if="isDisabled" class="mb-livespeed__disabled" role="status">
                {{
                    disabledReason === "actions"
                        ? t(
                              "liveSpeed.disabled.actions",
                              "This render is running on GitHub's own runners. Nothing about its speed is adjustable from here: the machine belongs to GitHub, not to this application.",
                          )
                        : disabledReason === "remote"
                          ? t(
                                "liveSpeed.disabled.remote",
                                "This render is running on another computer over SSH, and live speed changes are not wired for that route yet.",
                            )
                          : t(
                                "liveSpeed.disabled.unknown",
                                "This build does not yet know where this render is running, so there is nothing here it can adjust safely.",
                            )
                }}
            </p>

            <template v-else>
                <p class="mb-livespeed__blurb">
                    {{
                        t(
                            "liveSpeed.blurb",
                            "This changes what can genuinely change while the render is going: the operating system's own priority for it, or a container's CPU allowance. The thread count baked into this render's own launch stays fixed until it restarts.",
                        )
                    }}
                </p>

                <p class="mb-livespeed__current" role="status">
                    <template v-if="currentMatch.kind === 'automatic'">
                        {{
                            t(
                                "liveSpeed.currentAutomatic",
                                "This render's thread count was left at this machine's own automatic default. It only changes if you restart with a level chosen below.",
                            )
                        }}
                    </template>
                    <template v-else-if="currentMatch.kind === 'level'">
                        {{
                            t(
                                "liveSpeed.currentLevel",
                                { level: currentMatch.level.level },
                                "This render started at level {level}. Its thread count and JVM thread priority stay fixed for the life of this render.",
                            )
                        }}
                    </template>
                    <template v-else>
                        {{
                            t(
                                "liveSpeed.currentCustom",
                                { count: currentMatch.threadCount },
                                "This render's thread count is {count}, which does not match any level. It is unchanged, and stays that way for the life of this render.",
                            )
                        }}
                    </template>
                </p>
            </template>

            <div
                class="mb-livespeed__buttons"
                role="group"
                :aria-label="t('liveSpeed.pickerLabel', 'Live speed, level 1 to 5')"
            >
                <v-btn
                    v-for="level in [1, 2, 3, 4, 5] as const"
                    :key="level"
                    :disabled="isDisabled || pendingLevel !== null"
                    :loading="pendingLevel === level"
                    :aria-pressed="lastOutcome?.level === level && lastOutcome.appliedNow"
                    variant="outlined"
                    density="comfortable"
                    size="small"
                    class="mb-livespeed__button"
                    @click="chooseLevel(level)"
                >
                    {{ levelLabel(level) }}
                </v-btn>
            </div>

            <p v-if="!isDisabled" class="mb-livespeed__extremes">
                {{
                    t(
                        "liveSpeed.extremes",
                        "Level 1 leans as lightly as possible on this machine while it renders. Level 5 leans as hard as this application will ever ask for.",
                    )
                }}
            </p>

            <template v-if="lastOutcome">
                <p class="mb-livespeed__outcome" role="status" aria-live="polite">
                    {{ outcomeText(lastOutcome) }}
                </p>
                <p class="mb-livespeed__message">
                    <strong>{{ t("liveSpeed.messageLabel", "The main process said:") }}</strong>
                    {{ lastOutcome.message }}
                </p>
            </template>

            <p v-if="!isDisabled" class="mb-livespeed__deferred">
                {{
                    t(
                        "liveSpeed.deferredNote",
                        "The thread count and thread priority baked into this render's own launch only change on the next render.",
                    )
                }}
            </p>

            <v-btn
                v-if="lastOutcome && !isDisabled"
                :prepend-icon="mdiRestart"
                :loading="restarting"
                :disabled="restarting"
                variant="tonal"
                size="small"
                color="primary"
                class="mb-livespeed__restart"
                @click="restartNow"
            >
                {{ restarting ? t("liveSpeed.restarting", "Restarting...") : t("liveSpeed.restartButton", "Restart at this level") }}
            </v-btn>
            <p v-if="lastOutcome && !isDisabled" class="mb-livespeed__restartOffer">
                {{
                    t(
                        "liveSpeed.restartOffer",
                        { level: lastOutcome.level },
                        "Restarting this render now would launch it fresh at level {level}, applying its thread count and JVM thread priority immediately rather than waiting for the next render. Already-drawn tiles are kept either way.",
                    )
                }}
            </p>

            <div class="mb-livespeed__throughput">
                <v-chip size="x-small" variant="outlined" class="mb-livespeed__throughputLabel">
                    {{ t("liveSpeed.throughputLabel", "Throughput") }}
                </v-chip>
                <RenderThroughput :facts="run.progress.value" />
            </div>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-livespeed {
    border-radius: 12px;
    margin-block: 12px;
    min-inline-size: 0;
    max-inline-size: 100%;
    overflow: hidden;
}

.mb-livespeed__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-end: 4px;
}

.mb-livespeed__title {
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.3;
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

.mb-livespeed__blurb,
.mb-livespeed__disabled {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin-block-end: 8px;
    overflow-wrap: anywhere;
}

.mb-livespeed__current {
    font-size: 0.75rem;
    line-height: 1.5;
    margin-block-end: 10px;
    overflow-wrap: anywhere;
}

.mb-livespeed__buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-inline-size: 0;
}

.mb-livespeed__button {
    flex: 1 1 9rem;
    min-inline-size: min(9rem, 100%);
    min-block-size: 44px;
    block-size: auto;
}

.mb-livespeed__button .v-btn__content,
.mb-livespeed__restart .v-btn__content {
    white-space: normal;
    overflow-wrap: anywhere;
    text-align: center;
}

.mb-livespeed__extremes {
    margin-block-start: 8px;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-livespeed__outcome {
    margin-block-start: 10px;
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.45;
}

.mb-livespeed__message {
    margin-block-start: 4px;
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-livespeed__deferred {
    margin-block-start: 8px;
    font-size: 0.75rem;
    line-height: 1.45;
    font-style: italic;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-livespeed__restart {
    margin-block-start: 10px;
    min-block-size: 44px;
    block-size: auto;
    max-inline-size: 100%;
}

.mb-livespeed__restartOffer {
    margin-block-start: 4px;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}

.mb-livespeed__disclosure {
    margin-block-start: 10px;
}

.mb-livespeed__throughput {
    margin-block-start: 6px;
    min-inline-size: 0;
    overflow-wrap: anywhere;
}

@media (prefers-reduced-motion: reduce) {
    .mb-livespeed,
    .mb-livespeed * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
