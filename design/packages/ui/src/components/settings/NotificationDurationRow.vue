<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle, VChip } from "vuetify/components";
import {
    DEFAULT_NOTICE_DURATION_LEVEL,
    NOTICE_DURATION_LEVELS,
    noticeDurationLevelByNumber,
    type NoticeDurationLevel,
} from "../config/noticeDurationLevels.js";
import { changeNoticeDuration, notices } from "../../stores/notices.js";
import { noticeDurationLevelLabel } from "./settingsCopy.js";

/**
 * How long a non-blocking toast stays before it dismisses itself: the novice dial for
 * `notifications.ts`'s `INFO_TIMEOUT_MS` / `SUCCESS_TIMEOUT_MS`, which every profile used
 * to be stuck with regardless of how quickly they actually read.
 *
 * Unlike the Speed dial this one control can never show "Custom": `notices.durationLevel`
 * is the level, not a pair of raw fields a level is matched against, so there is nothing
 * for it to drift out of sync with. Level 5 is worth calling out on its own — it does not
 * mean "very long", it means an informational or success toast behaves exactly like a
 * warning or an error already does, staying up until it is dismissed by hand or from the
 * notification centre.
 *
 * No props: this reads and writes the one shared `notices` singleton directly, the same
 * way `SurfacePlacementRow.vue` reads `dockedSurfaces()` directly rather than taking it as
 * a prop - both are settings about a single shared piece of shell state, not about
 * anything a caller could sensibly hand in two different copies of.
 */
const { t } = useI18n();

const currentLevel = computed<NoticeDurationLevel["level"]>(() => notices.durationLevel);

function onToggle(value: NoticeDurationLevel["level"] | null): void {
    if (value === null) return;
    changeNoticeDuration(value);
}

function onReset(): void {
    changeNoticeDuration(DEFAULT_NOTICE_DURATION_LEVEL);
}

function levelLabel(level: NoticeDurationLevel["level"]): string {
    return noticeDurationLevelLabel(t, level);
}

/** The exact seconds a level sets, or "stays up" for the top one - shown as a tooltip-free caption. */
function levelSummary(level: NoticeDurationLevel): string {
    if (level.infoTimeoutMs === null || level.successTimeoutMs === null) {
        return t(
            "settings.noticeDuration.levelSummaryPersistent",
            "Informational and success toasts stay on screen until you dismiss them, exactly like a warning or an error already does.",
        );
    }
    return t(
        "settings.noticeDuration.levelSummary",
        {
            info: (level.infoTimeoutMs / 1000).toFixed(1),
            success: (level.successTimeoutMs / 1000).toFixed(1),
        },
        "Informational toasts stay {info} seconds; success toasts stay {success} seconds.",
    );
}
</script>

<template>
    <div class="mb-notice-duration">
        <div
            class="mb-notice-duration__toggle-row"
            role="group"
            :aria-label="t('settings.noticeDuration.pickerLabel', 'Notification duration, level 1 to 5')"
        >
            <v-btn-toggle
                :model-value="currentLevel"
                color="primary"
                variant="outlined"
                density="comfortable"
                divided
                mandatory
                @update:model-value="(value: NoticeDurationLevel['level'] | null) => onToggle(value)"
            >
                <v-btn
                    v-for="level in NOTICE_DURATION_LEVELS"
                    :key="level.level"
                    :value="level.level"
                    :aria-pressed="currentLevel === level.level"
                >
                    {{ levelLabel(level.level) }}
                    <v-chip v-if="level.level === DEFAULT_NOTICE_DURATION_LEVEL" size="x-small" variant="flat" class="ml-2">
                        {{ t("settings.noticeDuration.defaultChip", "Default") }}
                    </v-chip>
                </v-btn>
            </v-btn-toggle>

            <v-btn :disabled="currentLevel === DEFAULT_NOTICE_DURATION_LEVEL" variant="text" @click="onReset">
                {{ t("settings.noticeDuration.reset", "Reset to Balanced") }}
            </v-btn>
        </div>

        <p class="mb-notice-duration__summary" role="status">
            {{ levelSummary(noticeDurationLevelByNumber(currentLevel)) }}
        </p>
    </div>
</template>

<style>
.mb-notice-duration {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-notice-duration__toggle-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

.mb-notice-duration__summary {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}
</style>
