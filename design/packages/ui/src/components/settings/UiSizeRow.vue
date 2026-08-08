<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle, VChip } from "vuetify/components";
import {
    DEFAULT_UI_SIZE_LEVEL,
    UI_SIZE_LEVELS,
    changeUiSize,
    currentUiSizeLevel,
    uiSizeLevelByNumber,
    type UiSizeLevel,
} from "./uiSizeSetting.js";
import { uiSizeLevelLabel } from "./settingsCopy.js";

/**
 * How big the whole interface is drawn: five labelled stops from the designed size to
 * double it, applied live so the buttons themselves grow the moment one is pressed -
 * which is the honest preview, and the reassurance that the control that undoes a choice
 * grows along with everything else.
 *
 * No props: this reads and writes `uiSizeSetting.ts`'s one shared readout directly, the
 * same way `NotificationDurationRow.vue` reads the shared notices store - there is
 * exactly one interface to size, and nothing a caller could sensibly hand in two
 * different copies of.
 */
const { t } = useI18n();

const currentLevel = computed<UiSizeLevel["level"]>(() => currentUiSizeLevel.value);

function onToggle(value: UiSizeLevel["level"] | null): void {
    if (value === null) return;
    changeUiSize(value);
}

function onReset(): void {
    changeUiSize(DEFAULT_UI_SIZE_LEVEL);
}

function levelLabel(level: UiSizeLevel["level"]): string {
    return uiSizeLevelLabel(t, level);
}

/** The exact percentage a level sets, so the label names the effect and not only a rank. */
const summary = computed(() =>
    t(
        "settings.uiSize.summary",
        { percent: String(uiSizeLevelByNumber(currentLevel.value).percent) },
        "Everything is drawn at {percent}% of its designed size: text, buttons, icons and the map alike. The change applies immediately and is remembered.",
    ),
);
</script>

<template>
    <div class="mb-ui-size">
        <div
            class="mb-ui-size__toggle-row"
            role="group"
            :aria-label="t('settings.uiSize.pickerLabel', 'Interface size, level 1 to 5')"
        >
            <v-btn-toggle
                :model-value="currentLevel"
                color="primary"
                variant="outlined"
                density="comfortable"
                divided
                mandatory
                class="mb-ui-size__toggle"
                @update:model-value="(value: UiSizeLevel['level'] | null) => onToggle(value)"
            >
                <v-btn
                    v-for="stop in UI_SIZE_LEVELS"
                    :key="stop.level"
                    :value="stop.level"
                    :aria-pressed="currentLevel === stop.level"
                >
                    {{ levelLabel(stop.level) }}
                    <v-chip
                        v-if="stop.level === DEFAULT_UI_SIZE_LEVEL"
                        size="x-small"
                        variant="flat"
                        class="ml-2"
                    >
                        {{ t("settings.uiSize.defaultChip", "Default") }}
                    </v-chip>
                </v-btn>
            </v-btn-toggle>

            <v-btn
                :disabled="currentLevel === DEFAULT_UI_SIZE_LEVEL"
                variant="text"
                @click="onReset"
            >
                {{ t("settings.uiSize.reset", "Reset to Standard") }}
            </v-btn>
        </div>

        <p class="mb-ui-size__summary" role="status">
            {{ summary }}
        </p>
    </div>
</template>

<style>
.mb-ui-size {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-ui-size__toggle-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

/*
 * Five stops have to hold inside a 520px panel that may itself be drawn at 200%, and in
 * bilingual mode where every label carries a second line. `v-btn-toggle` hard-codes a
 * single-row inline flex with a fixed height, which is exactly the sizing failure this
 * whole section exists to fix - so the group is allowed to wrap and to grow, and each
 * button gets its height from its own content instead of from the group's fixed number.
 */
.mb-ui-size__toggle {
    display: grid !important;
    grid-template-columns: repeat(auto-fit, minmax(min(9rem, 100%), 1fr));
    grid-auto-rows: minmax(48px, auto);
    align-items: stretch;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: auto !important;
    min-height: var(--v-btn-height, 36px);
    overflow: visible;
}

.mb-ui-size__toggle .v-btn {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: 100% !important;
    min-height: 48px;
    white-space: normal;
}

.mb-ui-size__toggle .v-btn__content {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-ui-size__summary {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}
</style>
