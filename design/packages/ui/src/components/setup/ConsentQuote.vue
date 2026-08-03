<script setup lang="ts">
import { computed, useId } from "vue";
import { VIcon } from "vuetify/components";
import { mdiOpenInNew } from "@mdi/js";
import { useSetupI18n } from "./setupI18n.js";
import { CONSENT_QUOTE, CONSENT_QUOTE_TRANSLATION, MOJANG_EULA_URL } from "./setupStrings.js";

/**
 * The text being agreed to, and the link to the document itself.
 *
 * One component, used by the first-run consent step and by the settings row, so the two
 * surfaces cannot drift into quoting slightly different things. Somebody accepting from
 * Settings months later reads exactly what somebody accepting during setup read.
 *
 * The quotation is upstream BlueMap's own wording, verbatim, and stays in English in
 * every language mode. In Cantonese and bilingual modes a translation follows it under a
 * label that says what it is: a reading of the quotation, not the quotation.
 */
const i18n = useSetupI18n();

const quoteId = useId();

const showTranslation = computed(() => i18n.mode.value !== "en");
</script>

<template>
    <div class="mb-consent-quote-block">
        <figure class="mb-setup-quote" role="group" :aria-labelledby="quoteId">
            <figcaption :id="quoteId" class="mb-setup-quote__caption">
                {{ i18n.t("consent.quoteLabel") }}
            </figcaption>
            <blockquote
                class="mb-setup-quote__text"
                lang="en"
                cite="https://github.com/BlueMap-Minecraft/BlueMap"
            >
                <p v-for="line in CONSENT_QUOTE" :key="line">{{ line }}</p>
            </blockquote>
            <template v-if="showTranslation">
                <p class="mb-setup-quote__translation-label">
                    {{ i18n.t("consent.translationLabel") }}
                </p>
                <div class="mb-setup-quote__translation" lang="zh-HK">
                    <p v-for="line in CONSENT_QUOTE_TRANSLATION" :key="line">{{ line }}</p>
                </div>
            </template>
        </figure>

        <p class="mb-setup-step__link">
            <a
                :href="MOJANG_EULA_URL"
                class="mb-setup-link"
                target="_blank"
                rel="noreferrer noopener"
            >
                {{ i18n.t("action.openEula") }}
                <v-icon :icon="mdiOpenInNew" size="small" aria-hidden="true" />
            </a>
        </p>
    </div>
</template>

<style>
.mb-consent-quote-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.mb-setup-quote {
    margin: 0;
    padding: 12px 16px;
    border-radius: 12px;
    border-inline-start: 4px solid rgb(var(--v-theme-primary));
    background: rgba(var(--v-theme-primary), 0.08);
}

.mb-setup-quote__caption {
    margin-block-end: 8px;
    font-size: 0.8125rem;
    font-weight: 500;
    color: rgb(var(--v-theme-primary));
}

.mb-setup-quote__text {
    margin: 0;
    /* The quotation is the one thing here that must never be cut off, at any width or
       display scale, so long URLs wrap inside it instead of overflowing the card. */
    overflow-wrap: anywhere;
}

.mb-setup-quote__text p,
.mb-setup-quote__translation p {
    margin: 0 0 4px;
    font-size: 0.875rem;
    line-height: 1.5;
}

.mb-setup-quote__text p:last-child,
.mb-setup-quote__translation p:last-child {
    margin-block-end: 0;
}

.mb-setup-quote__translation-label {
    margin: 12px 0 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-setup-quote__translation {
    overflow-wrap: anywhere;
}

.mb-setup-step__link {
    margin: 0;
}

.mb-setup-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    /* A 44px row keeps the link a real touch target rather than a line of text. */
    min-height: 44px;
    color: rgb(var(--v-theme-primary));
    text-decoration: underline;
}

.mb-setup-link:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
    border-radius: 4px;
}
</style>
