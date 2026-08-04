<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiAlertOutline, mdiClockOutline, mdiOpenInNew, mdiTimerSandEmpty } from "@mdi/js";
import { VChip, VIcon, VProgressLinear } from "vuetify/components";
import { formatClock, formatCount, formatPercent, formatTransfer } from "./format.js";
import { milestoneKeyOf, shardGroups, summariseShards, timingOf } from "./progressModel.js";
import type { ProgressFacts, ProgressLevel, ProgressText, ShardStat } from "./progressModel.js";
// The estimate is put into words by the same formatter the run panel has always used, so a
// duration reads identically wherever it appears and the `world.run.*` keys a translator
// has already filled in keep working.
import { formatDuration } from "../world/renderRun.js";

/**
 * One surface for every way this application can render.
 *
 * Four routes produce a render — a child process here, a container here, a container on
 * somebody else's machine, and a matrix of jobs on GitHub — and all four hand this the same
 * {@link ProgressFacts}. There is deliberately no route-specific branch anywhere below: a
 * route with shards shows shards because it reported some, not because it is the CI route,
 * and a route with no byte counts shows none because it reported none. A panel per route
 * would be four things to keep correct, and the one that fell behind would be the one
 * nobody was watching.
 *
 * ## What the bars promise
 *
 * A level whose `percent` is null draws indeterminate and says "size unknown" in words. It
 * is never nudged upward to look busy. That is the whole contract: an honest indeterminate
 * bar is believed, and a determinate one that creeps toward 99% is noticed exactly once,
 * after which nothing on this screen is believed again. Where a real count exists it is
 * printed as numbers beside the bar, because "40%" tells nobody whether ten minutes or ten
 * hours remain and "2 of 3 maps done" does.
 *
 * ## The clock is the point
 *
 * Elapsed, and time since anything last arrived. A render that has produced nothing for
 * four minutes is the single most useful fact on the screen and it is the one a percentage
 * cannot express. The clock ticks locally once a second rather than waiting for the next
 * event, because an event-driven clock stops exactly when the answer starts to matter.
 *
 * ## Announcements are milestones
 *
 * The live region is bound to {@link milestoneKeyOf}, which changes on a phase, a count or
 * a stall and not on a percentage. An announcement per progress event is a screen reader
 * reading a number every ten seconds for four hours, which is not a description of a render.
 */

const props = withDefaults(
    defineProps<{
        facts: ProgressFacts;
        /**
         * The current time, for a test that decides what time it is.
         *
         * Null - the default - runs the component's own once-a-second clock.
         */
        now?: number | null;
    }>(),
    { now: null },
);

const { t, locale } = useI18n();

const tick = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
    timer = setInterval(() => {
        tick.value = Date.now();
    }, 1000);
});

onBeforeUnmount(() => {
    if (timer !== null) clearInterval(timer);
    timer = null;
});

const nowMs = computed(() => props.now ?? tick.value);
const timing = computed(() => timingOf(props.facts, nowMs.value));

/** A held phrase spent through vue-i18n's three-argument form, never through `replace`. */
function say(text: ProgressText): string {
    return t(text.key, text.values, text.fallback);
}

function countText(level: ProgressLevel): string {
    return level.count === null ? "" : formatCount(level.count, t, locale.value);
}

function percentText(level: ProgressLevel): string {
    return level.percent === null ? "" : formatPercent(level.percent, locale.value);
}

/**
 * The whole of one bar in a sentence, for `aria-valuetext`.
 *
 * A screen reader reading `aria-valuenow` alone gets "41" and no idea of what. This is the
 * same three facts a sighted reader gets from the row: what it is, how far, and out of how
 * much - with "size unknown" said in as many words when there is no denominator, because
 * silence there is indistinguishable from a bar that has not started.
 */
function valueText(level: ProgressLevel): string {
    const parts = [say(level.label)];
    const count = countText(level);
    if (count !== "") parts.push(count);
    parts.push(
        level.percent === null
            ? t("progress.unknownSize", "size unknown")
            : percentText(level),
    );
    return parts.join(" - ");
}

const elapsedText = computed(() =>
    timing.value.elapsedMs === null ? "" : formatClock(timing.value.elapsedMs),
);

const sinceText = computed(() =>
    timing.value.sinceEventMs === null ? "" : formatClock(timing.value.sinceEventMs),
);

const sinceProgressText = computed(() =>
    timing.value.sinceProgressMs === null ? "" : formatClock(timing.value.sinceProgressMs),
);

/**
 * How long is left, labelled as the estimate it is.
 *
 * The engine's own words are preferred when it sent any, because they are its estimate in
 * its own terms. A tracker estimate says so, so a number this application worked out is
 * never mistaken for one the engine stood behind. When neither has anything, this is empty:
 * saying nothing is the honest answer to a window with too little data in it, and it is the
 * one case a wild number would be believed.
 */
const estimateText = computed(() => {
    const estimate = props.facts.estimate;
    if (estimate.source === "none") return "";
    const words =
        estimate.text !== null && estimate.text.trim() !== ""
            ? estimate.text
            : estimate.seconds === null
              ? ""
              : formatDuration(estimate.seconds, t);
    if (words === "") return "";
    return estimate.source === "engine"
        ? t("progress.eta.engine", { eta: words }, "About {eta} left, the engine's own estimate")
        : t("progress.eta.tracker", { eta: words }, "About {eta} left, estimated from the rate so far");
});

const shardCount = computed(() => summariseShards(props.facts.shards));
const groups = computed(() => shardGroups(props.facts.shards));
/** True once grouping actually separates anything. One group is a list, not groups. */
const grouped = computed(() => groups.value.length > 1);

function shardStateText(shard: ShardStat): string {
    switch (shard.state) {
        case "queued":
            return t("progress.shard.queued", "Queued");
        case "running":
            return t("progress.shard.running", "Running");
        case "succeeded":
            return t("progress.shard.succeeded", "Finished");
        case "failed":
            return t("progress.shard.failed", "Failed");
        case "cancelled":
            return t("progress.shard.cancelled", "Cancelled");
        case "skipped":
            return t("progress.shard.skipped", "Skipped");
        default:
            return t("progress.shard.unknown", "Finished, in a state this app does not recognise");
    }
}

/**
 * A shard's colour, with no branch that turns an unfinished job into a success.
 *
 * The one thing a progress surface must never draw is a green tick beside a job that has
 * not finished, so `running` is informational and `unknown` is neutral rather than hopeful.
 */
function shardTone(shard: ShardStat): string | undefined {
    switch (shard.state) {
        case "succeeded":
            return "success";
        case "failed":
            return "error";
        case "cancelled":
            return "warning";
        case "running":
            return "info";
        default:
            return undefined;
    }
}

function shardDuration(shard: ShardStat): string {
    if (shard.startedAtMs === null) return "";
    const end = shard.finishedAtMs ?? (props.facts.active ? nowMs.value : null);
    if (end === null) return "";
    return formatClock(Math.max(0, end - shard.startedAtMs));
}

/* -- the live region ------------------------------------------------------- */

const announcement = ref("");

/**
 * Announced on a milestone, never on a tick.
 *
 * The watched key changes when the phase, a coarse count, the stall state or the run's
 * liveness changes. A bar creeping from 41.2% to 41.7% changes none of them, which is
 * exactly the point: an announcement per tile is unusable and gets the whole region muted.
 */
watch(
    () => milestoneKeyOf(props.facts, timing.value),
    () => {
        const parts = props.facts.levels.map((level) => {
            const count = countText(level);
            return count === "" ? say(level.label) : `${say(level.label)}, ${count}`;
        });
        if (props.facts.shards.length > 0) {
            parts.push(formatCount(shardCount.value, t, locale.value));
        }
        if (timing.value.stalled && sinceText.value !== "") {
            parts.push(t("progress.stalled", { since: sinceText.value }, "Nothing has arrived for {since}"));
        }
        announcement.value = parts.join(". ");
    },
    { immediate: true },
);
</script>

<template>
    <section class="mb-progress" :aria-label="t('progress.region', 'Render progress in detail')">
        <ul class="mb-progress__levels">
            <li v-for="level in facts.levels" :key="level.id" class="mb-progress__level">
                <div class="mb-progress__head">
                    <span class="mb-progress__label">{{ say(level.label) }}</span>
                    <span v-if="level.count" class="mb-progress__count">{{ countText(level) }}</span>
                    <span v-if="level.percent !== null" class="mb-progress__percent">
                        {{ percentText(level) }}
                    </span>
                    <!--
                        Said in words, not left blank. A bar with no number beside it and no
                        explanation reads as a bar that has not started, and somebody waits
                        for a figure that is never coming.
                    -->
                    <span v-else class="mb-progress__unknown">
                        {{ t("progress.unknownSize", "size unknown") }}
                    </span>
                </div>
                <v-progress-linear
                    :model-value="level.percent ?? 0"
                    :indeterminate="level.percent === null"
                    :aria-label="say(level.label)"
                    :aria-valuenow="level.percent === null ? undefined : Math.round(level.percent)"
                    :aria-valuemin="0"
                    :aria-valuemax="100"
                    :aria-valuetext="valueText(level)"
                    :aria-busy="level.percent === null ? 'true' : undefined"
                    role="progressbar"
                    color="primary"
                    height="8"
                    rounded
                />
                <p v-if="level.detail" class="mb-progress__detail">{{ level.detail }}</p>
            </li>
        </ul>

        <!--
            Elapsed, and how long it has been quiet. The second one is the fact this panel
            exists for: a render that has produced nothing for four minutes looks exactly
            like one that is working, and today that is invisible.
        -->
        <dl class="mb-progress__timing">
            <div v-if="elapsedText" class="mb-progress__timing-pair">
                <dt>
                    <v-icon :icon="mdiClockOutline" size="14" aria-hidden="true" />
                    {{ t("progress.elapsed", "Running for") }}
                </dt>
                <dd>{{ elapsedText }}</dd>
            </div>
            <div v-if="sinceText" class="mb-progress__timing-pair">
                <dt>
                    <v-icon :icon="mdiTimerSandEmpty" size="14" aria-hidden="true" />
                    {{ t("progress.sinceEvent", "Last heard from") }}
                </dt>
                <dd>{{ sinceText }}</dd>
            </div>
            <div v-if="sinceProgressText" class="mb-progress__timing-pair">
                <dt>{{ t("progress.sinceProgress", "Last moved") }}</dt>
                <dd>{{ sinceProgressText }}</dd>
            </div>
        </dl>

        <p v-if="timing.stalled" class="mb-progress__stalled">
            <v-icon :icon="mdiAlertOutline" size="16" color="warning" aria-hidden="true" />
            {{
                t(
                    "progress.stalledLine",
                    { since: sinceText },
                    "Nothing has arrived for {since}. The render may still be working on something it does not report, or it may be stuck.",
                )
            }}
        </p>

        <p v-if="estimateText" class="mb-progress__eta">{{ estimateText }}</p>

        <!-- Bytes, when the route actually counts them. Never derived from anything else. -->
        <ul v-if="facts.transfers.length > 0" class="mb-progress__transfers">
            <li v-for="transfer in facts.transfers" :key="transfer.id">
                <span class="mb-progress__label">{{ say(transfer.label) }}</span>
                <span class="mb-progress__count">{{ formatTransfer(transfer, t) }}</span>
            </li>
        </ul>

        <section v-if="facts.shards.length > 0" class="mb-progress__shards">
            <h4 class="mb-progress__shards-head">
                {{ t("progress.shards", "Jobs") }}
                <v-chip size="x-small" variant="outlined">
                    {{ formatCount(shardCount, t, locale) }}
                </v-chip>
            </h4>
            <template v-for="group in groups" :key="group.name ?? '-'">
                <p v-if="grouped && group.name" class="mb-progress__group">
                    {{ group.name }}
                    <span class="mb-progress__count">{{ formatCount(group.count, t, locale) }}</span>
                </p>
                <ul class="mb-progress__shard-list">
                    <li v-for="shard in group.shards" :key="shard.id" class="mb-progress__shard">
                        <v-chip size="x-small" variant="tonal" :color="shardTone(shard)">
                            {{ shardStateText(shard) }}
                        </v-chip>
                        <span class="mb-progress__shard-name">{{ shard.name }}</span>
                        <span v-if="shardDuration(shard)" class="mb-progress__count">
                            {{ shardDuration(shard) }}
                        </span>
                        <a
                            v-if="shard.url"
                            :href="shard.url"
                            target="_blank"
                            rel="noreferrer noopener"
                            class="mb-progress__shard-link"
                        >
                            <v-icon :icon="mdiOpenInNew" size="14" aria-hidden="true" />
                            {{ t("progress.shardLink", { name: shard.name }, "Open {name}") }}
                        </a>
                    </li>
                </ul>
            </template>
        </section>

        <!--
            What this route cannot report, said out loud. A gap where a number should be
            reads as a defect to the next person and as a decision to nobody.
        -->
        <ul v-if="facts.notes.length > 0" class="mb-progress__notes">
            <li v-for="(note, index) in facts.notes" :key="`${note.key}-${index}`">{{ say(note) }}</li>
        </ul>

        <p class="mb-progress__announce" role="status" aria-live="polite">{{ announcement }}</p>
    </section>
</template>

<style>
.mb-progress {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-block-start: 8px;
}

.mb-progress__levels,
.mb-progress__transfers,
.mb-progress__shard-list,
.mb-progress__notes {
    list-style: none;
    margin: 0;
    padding: 0;
}

.mb-progress__levels {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.mb-progress__head {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-block-end: 4px;
    font-size: 0.8125rem;
    line-height: 1.4;
}

.mb-progress__label {
    font-weight: 500;
}

.mb-progress__count,
.mb-progress__percent {
    font-variant-numeric: tabular-nums;
}

.mb-progress__percent {
    margin-inline-start: auto;
}

.mb-progress__unknown {
    margin-inline-start: auto;
    font-style: italic;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-progress__detail {
    margin-block-start: 4px;
    font-size: 0.75rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-progress__timing {
    display: flex;
    gap: 16px;
    flex-wrap: wrap;
    margin: 0;
    font-size: 0.75rem;
}

.mb-progress__timing-pair {
    display: flex;
    align-items: center;
    gap: 6px;
}

.mb-progress__timing dt {
    display: flex;
    align-items: center;
    gap: 4px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-progress__timing dd {
    margin: 0;
    font-variant-numeric: tabular-nums;
}

.mb-progress__stalled,
.mb-progress__eta {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.5;
}

.mb-progress__eta {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-progress__transfers li,
.mb-progress__shard {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 0.75rem;
    line-height: 1.6;
}

.mb-progress__shards-head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 500;
}

.mb-progress__group {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-block: 6px 2px;
    font-size: 0.75rem;
    font-weight: 500;
}

.mb-progress__shard-name {
    overflow-wrap: anywhere;
}

.mb-progress__shard-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: rgb(var(--v-theme-primary));
}

.mb-progress__notes {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/*
    Visually hidden, still announced. The milestones are already on screen as bars and
    counts; this exists so a screen reader hears them as one sentence when they change
    rather than having to sweep the region.
*/
.mb-progress__announce {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
}

@media (prefers-reduced-motion: reduce) {
    .mb-progress .v-progress-linear__indeterminate,
    .mb-progress .v-progress-linear__determinate {
        animation-duration: 0.01ms !important;
        transition-duration: 0.01ms !important;
    }
}
</style>
