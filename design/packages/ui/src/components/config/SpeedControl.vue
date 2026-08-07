<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiChevronDown, mdiChevronUp, mdiSpeedometer } from "@mdi/js";
import {
    VBtn,
    VBtnToggle,
    VCard,
    VCardText,
    VChip,
    VIcon,
    VTable,
    VTooltip,
} from "vuetify/components";
import type { FieldMeta, PlainValue } from "@worldlens/config";
import ActionArtwork from "../actionArtwork/ActionArtwork.vue";
import { fieldValue, type EditableConfigFile } from "./configModel.js";
import {
    DEFAULT_SPEED_LEVEL,
    SPEED_LEVELS,
    speedLevelFor,
    type SpeedLevel,
} from "./speedLevels.js";

/**
 * The novice "Speed" dial: a 1-5 control that stands in for two raw `core.conf`
 * settings at once, `render-thread-count` and `render-thread-priority`, the
 * second of which lives behind Advanced today because a bare 1-10 JVM thread
 * priority means nothing to somebody who has never heard of one.
 *
 * This never invents a third state. Picking a level writes both raw fields
 * through the same `set` event `ConfigField.vue` uses, so the Advanced sliders
 * below stay the single source of truth and everything this control shows is
 * read straight back out of them. When the two raw values do not match any of
 * the five levels exactly, this shows Custom rather than guessing at the
 * nearest one or silently overwriting what somebody typed by hand -- see
 * `speedLevels.ts` for why that match is exact rather than nearest-neighbour.
 */
const props = withDefaults(
    defineProps<{
        file: EditableConfigFile;
        disabled?: boolean;
    }>(),
    { disabled: false },
);

const emit = defineEmits<{
    set: [field: FieldMeta, value: PlainValue];
}>();

const { t } = useI18n();

const isDisabled = computed(() => props.disabled === true);
const detailsOpen = ref(false);

const threadCountField = computed<FieldMeta | undefined>(() =>
    props.file.descriptor.fields.find((field) => field.path === "render-thread-count"),
);
const threadPriorityField = computed<FieldMeta | undefined>(() =>
    props.file.descriptor.fields.find((field) => field.path === "render-thread-priority"),
);

/** Both raw fields have to exist for the dial to mean anything; true for core.conf always. */
const available = computed(
    () => threadCountField.value !== undefined && threadPriorityField.value !== undefined,
);

const currentThreadCount = computed(() =>
    threadCountField.value ? fieldValue(props.file, threadCountField.value) : undefined,
);
const currentThreadPriority = computed(() =>
    threadPriorityField.value ? fieldValue(props.file, threadPriorityField.value) : undefined,
);

const matchedLevel = computed<SpeedLevel | null>(() =>
    speedLevelFor(currentThreadCount.value, currentThreadPriority.value),
);

/** `VBtnToggle`'s own model: the matched level number, or `undefined` so nothing lights up in Custom. */
const toggleValue = computed<number | undefined>(() => matchedLevel.value?.level ?? undefined);

function chooseLevel(level: SpeedLevel): void {
    if (isDisabled.value) return;
    if (threadCountField.value) emit("set", threadCountField.value, level.threadCount);
    if (threadPriorityField.value) emit("set", threadPriorityField.value, level.threadPriority);
}

/** Vuetify emits `null` when a mandatory-less toggle is clicked back to its own selected value. */
function onToggle(value: number | null): void {
    if (value === null) return;
    const level = SPEED_LEVELS.find((candidate) => candidate.level === value);
    if (level) chooseLevel(level);
}

/**
 * The five level names, looked up rather than built with `` `speed.level.${level}` `` --
 * `catalogueCoverage.test.ts`'s own `CALL_TO_T` scanner (and `appCopy.test.ts`'s matching
 * call-site scanner in the other direction) both read only a translation call whose key is a
 * plain quoted literal, on purpose: a key assembled from a template string cannot be found by
 * grepping the source either, which is the same reason nothing else in this catalogue is
 * looked up dynamically.
 */
function levelLabel(level: number): string {
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

/** What choosing this level would actually write, shown as a tooltip before anybody clicks it. */
function levelSummary(level: SpeedLevel): string {
    return t(
        "speed.levelSummary",
        { count: String(level.threadCount), priority: String(level.threadPriority) },
        "Sets render-thread-count to {count} and render-thread-priority to {priority}.",
    );
}
</script>

<template>
    <v-card v-if="available" variant="tonal" class="mb-speed">
        <v-card-text>
            <ActionArtwork
                artwork="localRenderSpeed"
                :alt="
                    t(
                        'speed.artwork.alt',
                        'A desktop workstation turning terrain chunks into a map at five increasing processing levels',
                    )
                "
            />
            <div class="mb-speed__head">
                <v-icon :icon="mdiSpeedometer" aria-hidden="true" />
                <h3 class="mb-speed__title">{{ t("speed.title", "Speed") }}</h3>
            </div>
            <p class="mb-speed__blurb">
                {{
                    t(
                        "speed.blurb",
                        "One dial for how hard BlueMap leans on this machine while it renders: how many threads it uses, and how much CPU priority they get. Pick a level, or leave the raw settings below exactly as they are.",
                    )
                }}
            </p>

            <!--
                role="group" is what makes aria-label mean anything on Vuetify's toggle root,
                which is otherwise a plain div; aria-pressed is what tells a screen reader
                which button is active, since a VBtnToggle marks selection with a class only.
                Deliberately not `mandatory`: when the raw values match no level, NONE of these
                buttons is selected, which is exactly how Custom is represented here rather
                than as a sixth button.
            -->
            <v-btn-toggle
                :model-value="toggleValue"
                :disabled="isDisabled"
                color="primary"
                variant="outlined"
                density="comfortable"
                divided
                role="group"
                :aria-label="t('speed.pickerLabel', 'Speed, level 1 to 5')"
                class="mb-speed__toggle"
                @update:model-value="(value: number | null) => onToggle(value)"
            >
                <v-tooltip
                    v-for="level in SPEED_LEVELS"
                    :key="level.level"
                    :text="levelSummary(level)"
                    location="top"
                >
                    <template #activator="{ props: levelTip }">
                        <v-btn
                            v-bind="levelTip"
                            :value="level.level"
                            :aria-pressed="matchedLevel?.level === level.level"
                        >
                            {{ levelLabel(level.level) }}
                            <v-chip
                                v-if="level.level === DEFAULT_SPEED_LEVEL"
                                size="x-small"
                                variant="flat"
                                class="ml-2"
                            >
                                {{ t("speed.defaultChip", "BlueMap's default") }}
                            </v-chip>
                        </v-btn>
                    </template>
                </v-tooltip>
            </v-btn-toggle>

            <p
                v-if="matchedLevel === null"
                class="mb-speed__state mb-speed__state--custom"
                role="status"
            >
                {{
                    t(
                        "speed.custom",
                        {
                            count: String(currentThreadCount ?? ""),
                            priority: String(currentThreadPriority ?? ""),
                        },
                        "Custom: render-thread-count is {count} and render-thread-priority is {priority}, which does not match any level. Nothing here has changed them; pick a level below to replace them.",
                    )
                }}
            </p>
            <p
                v-else-if="matchedLevel.level === DEFAULT_SPEED_LEVEL"
                class="mb-speed__state"
                role="status"
            >
                {{
                    t(
                        "speed.appliedDefault",
                        {
                            level: String(matchedLevel.level),
                            count: String(matchedLevel.threadCount),
                            priority: String(matchedLevel.threadPriority),
                        },
                        "Currently set to level {level}, which is also BlueMap's own default: render-thread-count is {count} and render-thread-priority is {priority}.",
                    )
                }}
            </p>
            <p v-else class="mb-speed__state" role="status">
                {{
                    t(
                        "speed.applied",
                        {
                            level: String(matchedLevel.level),
                            count: String(matchedLevel.threadCount),
                            priority: String(matchedLevel.threadPriority),
                        },
                        "Currently set to level {level}: render-thread-count is {count} and render-thread-priority is {priority}.",
                    )
                }}
            </p>

            <v-btn
                :append-icon="detailsOpen ? mdiChevronUp : mdiChevronDown"
                :aria-expanded="detailsOpen ? 'true' : 'false'"
                variant="text"
                size="small"
                density="comfortable"
                class="mb-speed__disclosure"
                @click="detailsOpen = !detailsOpen"
            >
                {{
                    detailsOpen
                        ? t("speed.details.hide", "Hide the details")
                        : t("speed.details.show", "Show exactly what each level sets")
                }}
            </v-btn>

            <v-table
                v-if="detailsOpen"
                density="compact"
                class="mb-speed__table"
                :aria-label="
                    t('speed.table.caption', 'Every level and the exact raw values it writes')
                "
            >
                <thead>
                    <tr>
                        <th scope="col">{{ t("speed.table.level", "Level") }}</th>
                        <th scope="col">
                            {{ t("speed.table.threadCount", "render-thread-count") }}
                        </th>
                        <th scope="col">
                            {{ t("speed.table.threadPriority", "render-thread-priority") }}
                        </th>
                    </tr>
                </thead>
                <tbody>
                    <tr
                        v-for="level in SPEED_LEVELS"
                        :key="level.level"
                        :class="{ 'mb-speed__row--current': matchedLevel?.level === level.level }"
                    >
                        <td>
                            {{ levelLabel(level.level) }}
                            <v-chip
                                v-if="level.level === DEFAULT_SPEED_LEVEL"
                                size="x-small"
                                variant="outlined"
                                class="ml-2"
                            >
                                {{ t("speed.defaultChip", "BlueMap's default") }}
                            </v-chip>
                        </td>
                        <td class="mb-speed__value">{{ level.threadCount }}</td>
                        <td class="mb-speed__value">{{ level.threadPriority }}</td>
                    </tr>
                </tbody>
            </v-table>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-speed {
    border-radius: 12px;
    margin-block-end: 16px;
}

.mb-speed__head {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-block-end: 4px;
}

.mb-speed__title {
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.3;
}

.mb-speed__blurb {
    font-size: 0.8125rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    margin-block-end: 12px;
}

.mb-speed__toggle {
    flex-wrap: wrap;
    height: auto;
}

.mb-speed__toggle .v-btn {
    height: auto;
    padding-block: 8px;
}

.mb-speed__state {
    margin-block-start: 10px;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-speed__state--custom {
    color: rgb(var(--v-theme-warning));
}

.mb-speed__disclosure {
    margin-block-start: 8px;
}

.mb-speed__table {
    margin-block-start: 4px;
    border-radius: 8px;
}

.mb-speed__value {
    font-family: "Roboto Mono", ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
}

.mb-speed__row--current {
    background: rgba(var(--v-theme-primary), 0.08);
}

@media (prefers-reduced-motion: reduce) {
    .mb-speed,
    .mb-speed * {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
