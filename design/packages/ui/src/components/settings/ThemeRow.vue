<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VBtn, VBtnToggle } from "vuetify/components";
import { THEME_CHOICES, changeTheme, currentTheme, type ThemeChoice } from "./themeSetting.js";
import { themeChoiceLabel } from "./settingsCopy.js";

/**
 * The theme, reachable without a map: follow the system, dark, light, or the
 * high-contrast scheme. The in-map settings menu has always offered this and only exists
 * while a map is open; this row is the same choice against the same stored record, per
 * `themeSetting.ts`'s own doc comment, so the two controls cannot disagree.
 *
 * `v-btn-toggle` models "nothing pressed" as null, and null is also this setting's
 * follow-the-system value - so the system choice is carried as the string "default" in
 * the toggle and translated at the edge, exactly the way `SettingsMenu.vue`'s own theme
 * group carries it.
 */
const { t } = useI18n();

type ToggleValue = "default" | "dark" | "light" | "contrast";

function toToggle(choice: ThemeChoice): ToggleValue {
    return choice === null ? "default" : choice;
}

function fromToggle(value: ToggleValue): ThemeChoice {
    return value === "default" ? null : value;
}

const selected = computed<ToggleValue>(() => toToggle(currentTheme.value));

function onToggle(value: ToggleValue | null): void {
    if (value === null) return;
    changeTheme(fromToggle(value));
}

function choiceLabel(choice: ThemeChoice): string {
    return themeChoiceLabel(t, choice);
}

const summary = computed(() =>
    t(
        "settings.display.themeSummary",
        "System follows this computer's own light-or-dark choice. Contrast is a high-contrast scheme built for low vision. The same control lives in the open map's own settings menu, and the two always agree.",
    ),
);
</script>

<template>
    <div class="mb-theme-row">
        <div
            class="mb-theme-row__toggle-row"
            role="group"
            :aria-label="t('settings.display.themePickerLabel', 'Colour theme')"
        >
            <v-btn-toggle
                :model-value="selected"
                color="primary"
                variant="outlined"
                density="comfortable"
                divided
                mandatory
                class="mb-theme-row__toggle"
                @update:model-value="(value: ToggleValue | null) => onToggle(value)"
            >
                <v-btn
                    v-for="choice in THEME_CHOICES"
                    :key="toToggle(choice)"
                    :value="toToggle(choice)"
                    :aria-pressed="selected === toToggle(choice)"
                >
                    {{ choiceLabel(choice) }}
                </v-btn>
            </v-btn-toggle>
        </div>

        <p class="mb-theme-row__summary" role="status">
            {{ summary }}
        </p>
    </div>
</template>

<style>
.mb-theme-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-theme-row__toggle-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
}

/*
 * Same sizing bargain as `UiSizeRow.vue`'s toggle, for the same reason: four translated
 * labels - the system one is the longest in every locale - inside a 520px panel that may
 * itself be drawn at 200%, and in bilingual mode each label carries a second line.
 */
.mb-theme-row__toggle {
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

.mb-theme-row__toggle .v-btn {
    width: 100%;
    max-width: 100%;
    min-width: 0;
    height: 100% !important;
    min-height: 48px;
    white-space: normal;
}

.mb-theme-row__toggle .v-btn__content {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
}

.mb-theme-row__summary {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
    text-wrap: pretty;
}
</style>
