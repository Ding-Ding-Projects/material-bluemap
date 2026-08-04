<script setup lang="ts">
import { computed } from "vue";
import { VBtn, VRadio, VRadioGroup, VSlider } from "vuetify/components";
import SetupText from "./SetupText.vue";
import {
    FUNNY_LEVELS,
    LANGUAGE_MODES,
    resetSetupLanguage,
    useSetupI18n,
    type FunnyLevel,
    type LanguageMode,
} from "./setupI18n.js";

/**
 * The language mode and both funny levels, offered during first-run setup so the rest of
 * the flow can be read in whichever voice somebody wants.
 *
 * Two sliders, not one. The English level and the Cantonese level are independent
 * settings: English can stay buttoned up while Cantonese lets loose, and neither slider
 * moves when the other does. Both persist immediately, so the choice survives closing
 * the app halfway through setup.
 *
 * The funny level restyles the copy around the consent question. It never touches the
 * consent facts themselves, which resolve from the EXACT catalogue with the level not
 * consulted at all (see `setupI18n.ts`).
 *
 * The disclosure under the sliders is not decoration and is not optional. The level styles
 * every message the application produces, errors and warnings included, and somebody is
 * entitled to know that before they move a slider rather than after an error reads oddly.
 * It is rendered at the current level like everything else, and every level of it still
 * says that errors and warnings are included and that the facts do not move.
 *
 * The accessible name of a Vuetify slider comes from its `name` prop, which is what the
 * thumb (the element carrying `role="slider"`) renders as `aria-label`; an `aria-label`
 * passed to `<v-slider>` lands on the wrapper instead and names nothing. `aria-valuetext`
 * is not forwarded either, so the level's name is announced through a polite live region
 * beneath the track rather than being left visible but unspoken.
 */
const i18n = useSetupI18n();

const modeOptions = computed(() =>
    LANGUAGE_MODES.map((mode) => ({
        value: mode,
        label: i18n.t(`language.mode.${mode}` as const),
    })),
);

/** 1 to 5 under the track, so the range is legible without dragging the thumb. */
const ticks = Object.fromEntries(FUNNY_LEVELS.map((level) => [level, String(level)]));

function setMode(value: unknown): void {
    if (typeof value === "string" && (LANGUAGE_MODES as readonly string[]).includes(value)) {
        i18n.setMode(value as LanguageMode);
    }
}

function setFunny(language: "en" | "yue", value: number | number[]): void {
    const level = Array.isArray(value) ? value[0] : value;
    if (typeof level === "number") i18n.setFunny(language, level as FunnyLevel);
}

/**
 * Back to English at level 3 in both languages.
 *
 * No confirmation gate: this changes the wording of the interface and nothing else, so
 * there is nothing here to lose and the whole state is one click away again.
 */
function reset(): void {
    resetSetupLanguage();
}
</script>

<template>
    <section class="mb-setup-language" :aria-label="i18n.t('language.title')">
        <SetupText text-key="language.lead" class="mb-setup-language__lead" />

        <v-radio-group
            :model-value="i18n.mode.value"
            :label="i18n.t('language.title')"
            class="mb-setup-language__modes"
            density="comfortable"
            hide-details
            inline
            @update:model-value="setMode"
        >
            <v-radio
                v-for="option in modeOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
            />
        </v-radio-group>

        <div class="mb-setup-language__sliders">
            <div class="mb-setup-language__slider">
                <p class="mb-setup-language__slider-label">
                    {{ i18n.t("language.funny.en") }}
                </p>
                <v-slider
                    :model-value="i18n.funnyEn.value"
                    :name="i18n.t('language.funny.en')"
                    :min="1"
                    :max="5"
                    :step="1"
                    :ticks="ticks"
                    show-ticks="always"
                    tick-size="3"
                    density="comfortable"
                    hide-details
                    @update:model-value="(value) => setFunny('en', value)"
                />
                <p class="mb-setup-language__level" lang="en" aria-live="polite" aria-atomic="true">
                    {{ i18n.levelName(i18n.funnyEn.value, "en") }}
                </p>
            </div>

            <div class="mb-setup-language__slider">
                <p class="mb-setup-language__slider-label">
                    {{ i18n.t("language.funny.yue") }}
                </p>
                <v-slider
                    :model-value="i18n.funnyYue.value"
                    :name="i18n.t('language.funny.yue')"
                    :min="1"
                    :max="5"
                    :step="1"
                    :ticks="ticks"
                    show-ticks="always"
                    tick-size="3"
                    density="comfortable"
                    hide-details
                    @update:model-value="(value) => setFunny('yue', value)"
                />
                <p
                    class="mb-setup-language__level"
                    lang="zh-HK"
                    aria-live="polite"
                    aria-atomic="true"
                >
                    {{ i18n.levelName(i18n.funnyYue.value, "yue") }}
                </p>
            </div>
        </div>

        <SetupText text-key="language.disclosure" class="mb-setup-language__disclosure" />

        <div class="mb-setup-language__reset">
            <v-btn
                variant="text"
                density="comfortable"
                size="small"
                :text="i18n.t('action.resetLanguage')"
                @click="reset"
            />
        </div>
    </section>
</template>

<style>
.mb-setup-language {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mb-setup-language__lead {
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    font-size: 0.875rem;
}

.mb-setup-language__modes .v-selection-control-group {
    flex-wrap: wrap;
    gap: 4px 16px;
}

.mb-setup-language__sliders {
    display: grid;
    /* Two columns where there is room, one where there is not. At 800x600 and at 200%
       display scale this collapses rather than clipping the second slider off the card. */
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    gap: 4px 24px;
}

.mb-setup-language__slider-label {
    margin: 0;
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgb(var(--v-theme-primary));
}

.mb-setup-language__level {
    margin: 0;
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setup-language__disclosure {
    font-size: 0.8125rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setup-language__reset {
    display: flex;
    /* Trailing, so it reads as the way out of the two controls above it rather than as a
       fourth control in the row. Wraps to its own line where there is no room beside them. */
    justify-content: flex-end;
    flex-wrap: wrap;
}
</style>
