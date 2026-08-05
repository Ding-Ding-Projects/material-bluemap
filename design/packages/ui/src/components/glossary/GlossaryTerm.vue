<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiInformationOutline } from "@mdi/js";
import { VBtn, VCard, VCardText, VMenu, VTooltip } from "vuetify/components";
import { requestDocsArticle } from "../docs/docsLink.js";
import { GLOSSARY_TERMS, type GlossaryTermId } from "./glossaryTerms.js";

/**
 * A term info affordance: the plain word plus a small button that reveals its definition.
 *
 * **Not a tooltip.** A tooltip only opens on hover, and this project already fixed a case
 * where that made an explanation unreachable by keyboard (`PathField.vue`'s disabled browse
 * button - see its file comment). The reveal here is a real `<v-btn>` opened by click (which
 * a keyboard reaches the same way it reaches any button: Tab, then Enter or Space), holding
 * its content in a `v-menu` exactly like this project's own regex builder toggle
 * (`ConfigSearchField.vue`) and every other click-to-open disclosure in the app - one
 * mechanism, reused rather than invented a second time. `v-menu` teleports its content past
 * whatever card, list or grid the term happens to sit inside, so opening one never fights an
 * ancestor's `overflow: hidden` or squeezes a flex row's other children. The supplementary
 * `v-tooltip` is a hover convenience for a mouse on top of that, never the only way in.
 *
 * The definition text is short by design - one or two sentences, matching what the copy
 * catalogue holds in `glossary.ts` - because the full explanation lives in
 * `docs/glossary.md`. "Read more in the glossary" opens that article at this term's own
 * heading, wherever the Docs tab happens to be (see `docsLink.ts`).
 */
const props = withDefaults(
    defineProps<{
        term: GlossaryTermId;
        /**
         * Overrides the visible word next to the affordance - e.g. rendering the shared
         * "tile" term as "lowres tile" at one call site and "hires tile" at another. Defaults
         * to the term's own label.
         */
        label?: string;
    }>(),
    {},
);

const { t } = useI18n();
const open = ref(false);

const entry = computed(() => GLOSSARY_TERMS[props.term]);
const displayLabel = computed(() => props.label ?? entry.value.label);

/**
 * Resolves the definition through a literal `t("glossary.term.<id>", fallback)` call per
 * term, rather than `t(entry.value.key, entry.value.fallback)`. The catalogue's own coverage
 * scanners (`appCopy.test.ts`, `catalogueCoverage.test.ts`) find a call site only by matching
 * a literal key string directly inside a `t(...)` call in the real source - a key read off
 * an object at runtime is invisible to that scan, exactly as `world.ts`'s file comment
 * documents for `renderRun.ts`'s own computed-key families. Unlike those genuinely dynamic
 * signal names, this component's sixteen terms are a small, fixed set already enumerated in
 * `GlossaryTermId`, so writing them out here is the honest fix rather than the "genuinely
 * uncatalogueable" exemption.
 */
const definitionText = computed(() => {
    const fallback = entry.value.fallback;
    switch (props.term) {
        case "map":
            return t("glossary.term.map", fallback);
        case "world":
            return t("glossary.term.world", fallback);
        case "storage":
            return t("glossary.term.storage", fallback);
        case "render":
            return t("glossary.term.render", fallback);
        case "tile":
            return t("glossary.term.tile", fallback);
        case "mapId":
            return t("glossary.term.mapId", fallback);
        case "project":
            return t("glossary.term.project", fallback);
        case "configFolder":
            return t("glossary.term.configFolder", fallback);
        case "marker":
            return t("glossary.term.marker", fallback);
        case "dimension":
            return t("glossary.term.dimension", fallback);
        case "serverPlugin":
            return t("glossary.term.serverPlugin", fallback);
        case "renderThread":
            return t("glossary.term.renderThread", fallback);
        case "reaches":
            return t("glossary.term.reaches", fallback);
        case "engine":
            return t("glossary.term.engine", fallback);
        case "profile":
            return t("glossary.term.profile", fallback);
        case "blueMapUrl":
            return t("glossary.term.blueMapUrl", fallback);
    }
});
const ariaLabel = computed(() =>
    t("glossary.term.aria", { term: displayLabel.value }, 'What does "{term}" mean?'),
);

function openGlossary(): void {
    requestDocsArticle("glossary", `#${entry.value.anchor}`);
    open.value = false;
}
</script>

<template>
    <span class="mb-glossary-term">
        <span class="mb-glossary-term__label">{{ displayLabel }}</span>
        <v-btn
            class="mb-glossary-term__trigger"
            :icon="mdiInformationOutline"
            :aria-label="ariaLabel"
            :aria-expanded="open ? 'true' : 'false'"
            variant="text"
            size="x-small"
            density="comfortable"
        >
            <v-tooltip activator="parent" location="top" :text="ariaLabel" />
            <v-menu v-model="open" activator="parent" :close-on-content-click="false" location="bottom start" offset="6">
                <v-card class="mb-glossary-term__card" variant="elevated" max-width="300">
                    <v-card-text>
                        <p class="mb-glossary-term__definition">{{ definitionText }}</p>
                        <v-btn variant="text" size="small" class="mb-glossary-term__more" @click="openGlossary">
                            {{ t("glossary.term.more", "Read more in the glossary") }}
                        </v-btn>
                    </v-card-text>
                </v-card>
            </v-menu>
        </v-btn>
    </span>
</template>

<style>
.mb-glossary-term {
    display: inline-flex;
    align-items: center;
    gap: 2px;
}

.mb-glossary-term__trigger.v-btn {
    opacity: 0.75;
}

.mb-glossary-term__trigger.v-btn:hover,
.mb-glossary-term__trigger.v-btn:focus-visible {
    opacity: 1;
}

.mb-glossary-term__definition {
    margin: 0 0 6px;
    font-size: 0.8125rem;
    line-height: 1.45;
}

.mb-glossary-term__more {
    padding-inline: 4px;
}
</style>
