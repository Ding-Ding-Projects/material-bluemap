<script setup lang="ts">
import { computed } from "vue";
import { langAttr, useSetupI18n, type TranslationVars } from "./setupI18n.js";
import type { StringKey } from "./setupStrings.js";

/**
 * One catalogue string, rendered for whichever language mode is active.
 *
 * Bilingual mode keeps English prominent and puts the Cantonese underneath it at a
 * smaller size rather than beside it, so a long pair grows downwards instead of pushing
 * the dialog sideways at 800x600. Each run carries its own `lang`, so a screen reader
 * switches voice per fragment instead of reading Cantonese through an English
 * synthesiser.
 */
const props = withDefaults(
    defineProps<{
        textKey: StringKey;
        vars?: TranslationVars;
        /** The element to render. A heading passes `h2`, body copy takes the default. */
        tag?: string;
    }>(),
    { vars: () => ({}), tag: "p" },
);

const i18n = useSetupI18n();

const text = computed(() => i18n.pair(props.textKey, props.vars));
const primaryLang = computed(() => (i18n.mode.value === "yue" ? langAttr("yue") : langAttr("en")));
</script>

<template>
    <component :is="tag" class="mb-setup-text">
        <span :lang="primaryLang">{{ text.primary }}</span>
        <span v-if="text.secondary !== null" class="mb-setup-text__secondary" lang="zh-HK">
            {{ text.secondary }}
        </span>
    </component>
</template>

<style>
.mb-setup-text {
    margin: 0;
    text-wrap: pretty;
}

.mb-setup-text__secondary {
    display: block;
    margin-block-start: 0.25em;
    font-size: 0.875em;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
