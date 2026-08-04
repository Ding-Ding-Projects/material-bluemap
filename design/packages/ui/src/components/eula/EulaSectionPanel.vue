<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";

import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import { sectionParagraphs, type EulaSection } from "./eulaSections.js";
import { highlightRuns } from "./eulaSearch.js";

/**
 * One section of the licence, rendered exactly as it arrived.
 *
 * The two rules this component exists to keep:
 *
 *  1. **Nothing is ever handed to `v-html`.** The text came from a third party and the
 *     search puts highlights inside it, which is precisely the shape of the bug that ends
 *     with somebody else's markup running in the app. So the search returns runs of plain
 *     text and this renders a `<mark>` around the ones that matched; the browser never
 *     parses anything from the document.
 *  2. **The paragraphs are the document's paragraphs.** They are the blank-line separated
 *     blocks of the section's own character range, in that order, with nothing merged,
 *     dropped, summarised or reworded. The only interpretation applied anywhere in this
 *     feature is "a blank line ends a paragraph".
 *
 * The whole panel and the heading above it are appearance targets, because reading a
 * licence at 24 point in high contrast is a real accessibility need. Right-click for
 * **Edit appearance...**, Shift+F10 for the same from the keyboard, or Ctrl+Shift+F10
 * straight to the editor.
 */
const props = withDefaults(
    defineProps<{
        /** The whole document. The section indexes into it; it is never re-sliced here. */
        text: string;
        section: EulaSection;
        /** This section's category, already named in the running language. */
        categoryLabel: string;
        /** One-based position, so a reader can cite what they are looking at. */
        position: number;
        total: number;
        query?: string;
        regexMode?: boolean;
        flags?: string;
    }>(),
    { query: "", regexMode: false, flags: "i" },
);

const { t } = useI18n();

const paragraphs = computed(() => sectionParagraphs(props.text, props.section));

const runsFor = (paragraph: string): readonly { text: string; hit: boolean }[] =>
    highlightRuns(paragraph, props.query, props.regexMode, props.flags);

const hits = computed(() =>
    paragraphs.value.reduce(
        (total, paragraph) => total + runsFor(paragraph).filter((run) => run.hit).length,
        0,
    ),
);
</script>

<template>
    <AppearanceTarget
        :id="`eula.section.${props.section.category}`"
        :label="props.categoryLabel"
        as="section"
        class="mb-eula-section"
        :aria-label="
            t(
                'eula.section.label',
                { label: props.categoryLabel, position: props.position, total: props.total },
                '{label}. Section {position} of {total} of Mojang\'s document.',
            )
        "
    >
        <header class="mb-eula-section__head">
            <p class="mb-eula-section__where">
                {{
                    t(
                        "eula.section.where",
                        { position: props.position, total: props.total },
                        "Section {position} of {total}, in the order Mojang's document has them.",
                    )
                }}
            </p>
            <!--
                The document's own heading when it had one, quoted rather than replaced by
                this app's category name. The category is navigation; the heading is text.
            -->
            <p v-if="props.section.heading !== null" class="mb-eula-section__heading" lang="en">
                {{ props.section.heading }}
            </p>
        </header>

        <p v-if="props.query.length > 0" class="mb-eula-section__hits" role="status">
            {{
                hits === 0
                    ? t("eula.search.noneHere", "No match in this section. Nothing has been hidden.")
                    : t("eula.search.hereCount", { n: hits }, "{n} matches highlighted in this section.")
            }}
        </p>

        <div class="mb-eula-section__body" lang="en">
            <p v-for="(paragraph, index) in paragraphs" :key="index" class="mb-eula-section__paragraph">
                <template v-for="(run, runIndex) in runsFor(paragraph)" :key="runIndex">
                    <mark v-if="run.hit" class="mb-eula-section__hit">{{ run.text }}</mark>
                    <template v-else>{{ run.text }}</template>
                </template>
            </p>
        </div>
    </AppearanceTarget>
</template>

<style>
.mb-eula-section {
    display: block;
    padding: 16px;
}

.mb-eula-section__head {
    margin-block-end: 12px;
}

.mb-eula-section__where {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-eula-section__heading {
    margin: 4px 0 0;
    font-size: 1rem;
    font-weight: 600;
    line-height: 1.4;
    overflow-wrap: anywhere;
}

.mb-eula-section__hits {
    margin: 0 0 12px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-eula-section__body {
    /* A readable measure without cutting anything off: the column stops growing, the
       window does not. Long clause references and URLs wrap rather than overflow. */
    max-inline-size: 68ch;
    overflow-wrap: anywhere;
}

.mb-eula-section__paragraph {
    margin: 0 0 12px;
    font-size: 0.9375rem;
    line-height: 1.6;
    /* `pre-wrap` so a line break inside a clause survives. A licence that renumbers its
       own sub-clauses because the renderer collapsed their line breaks is a licence
       nobody can cite. */
    white-space: pre-wrap;
    text-wrap: pretty;
}

.mb-eula-section__paragraph:last-child {
    margin-block-end: 0;
}

.mb-eula-section__hit {
    /* A theme-aware highlight rather than the browser's yellow, which fails contrast
       against a dark surface and is unreadable at the accent colours this app allows. */
    background: rgba(var(--v-theme-primary), 0.28);
    color: inherit;
    border-radius: 3px;
    padding-inline: 1px;
}
</style>
