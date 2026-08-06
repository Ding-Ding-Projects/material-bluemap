<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { createThroughputTracker } from "./throughputModel.js";
import type { ProgressFacts } from "./progressModel.js";

/**
 * How fast a render is actually moving, right now, said in one line.
 *
 * This exists so a live speed change is not a leap of faith: `LiveSpeedControl.vue` mounts
 * it beside its dial precisely so dragging a level and then watching this number respond is
 * possible. `throughputModel.ts` has the whole honesty argument for why the reading is
 * percent-per-minute rather than an invented tile or chunk count -- upstream's own progress
 * line never carries one, and this file will not pretend it does.
 *
 * A fresh tracker per mount, watching `facts.levels`' own overall percentage - the same
 * number `RenderProgressDetail.vue` already draws as a bar, read here again for a rate
 * instead of a position.
 */
const props = defineProps<{ facts: ProgressFacts }>();

const { t } = useI18n();

const tracker = createThroughputTracker();

/**
 * Bumped every time the tracker's own state changes.
 *
 * `tracker.reading()` reads a plain closure variable, not a Vue ref, so a `computed` that
 * only calls it has nothing reactive to depend on and would cache its first answer forever -
 * silently never updating on screen no matter how many observations arrive afterwards. This
 * is the dependency that makes {@link reading} recompute: written once here so a future
 * caller only has to remember to bump it, not to rediscover the plain-closure-in-a-computed
 * trap `agent-global-memory` has already recorded once as "the value is stored, but nothing
 * reads it".
 */
const version = ref(0);

const overallPercent = computed<number | null>(() => {
    const overall = props.facts.levels.find((level) => level.id === "overall");
    return overall?.percent ?? null;
});

watch(
    overallPercent,
    (percent) => {
        if (percent === null) return;
        tracker.observe(percent, Date.now());
        version.value++;
    },
    { immediate: true },
);

// A render that stops being active leaves its last reading on screen rather than clearing
// it away; a fresh one clears the window itself, because the previous run's rate says
// nothing true about a render that has not started moving yet.
watch(
    () => props.facts.active,
    (active, wasActive) => {
        if (active && !wasActive) {
            tracker.reset();
            version.value++;
        }
    },
);

onBeforeUnmount(() => {
    tracker.reset();
});

const reading = computed(() => {
    void version.value; // establishes the reactive dependency; see `version`'s own comment.
    return tracker.reading();
});

const rateText = computed(() => {
    const value = reading.value.percentPerMinute;
    if (value === null) return "";
    // One decimal place: a render moving at 0.3%/min and one moving at 3.1%/min are very
    // different facts, and rounding both to a whole number would erase that.
    const rounded = Math.round(value * 10) / 10;
    const seconds = Math.max(1, Math.round(reading.value.windowMs / 1000));
    return t(
        "liveSpeed.throughputRate",
        { rate: rounded, seconds },
        "Moving at about {rate}% of the whole render per minute, over the last {seconds} seconds.",
    );
});
</script>

<template>
    <p class="mb-throughput" role="status" aria-live="polite">
        {{ rateText || t("liveSpeed.throughputNone", "Not enough data yet to show a rate.") }}
    </p>
</template>

<style>
.mb-throughput {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
