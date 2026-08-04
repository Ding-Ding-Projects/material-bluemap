<script setup lang="ts">
import { computed } from "vue";
import { useI18n } from "vue-i18n";
import { VCheckboxBtn } from "vuetify/components";
import { type ChangelogEntry, commitUrl, dayOf } from "./changelogModel.js";
import { formatDay } from "./changelogDates.js";

/**
 * One changelog entry: what changed, which commit changed it, and the message that commit
 * carried.
 *
 * Extracted from the viewer because the unreleased section and every released version render
 * exactly the same row, and two copies of it would be two places for the commit link to rot.
 *
 * The commit reference is a real link to a real commit. The short form is what is rendered,
 * because ten hex digits is what a person can scan, and the full SHA is what the accessible
 * name and every export carry, because that is the form that still resolves in a repository
 * large enough to make the short one ambiguous.
 */
const props = defineProps<{
    entry: ChangelogEntry;
    selected: boolean;
    repositoryUrl: string;
    /** Rendered when the entry is a merge, already localised by the viewer. */
    summaryLabel: string;
}>();

const emit = defineEmits<{ "update:selected": [value: boolean] }>();

const { t, locale } = useI18n();

const url = computed(() => commitUrl(props.repositoryUrl, props.entry.sha));
const day = computed(() =>
    formatDay(dayOf(props.entry.date), locale.value === "none" ? "en" : locale.value),
);
</script>

<template>
    <li class="mb-changelog__entry">
        <v-checkbox-btn
            :model-value="selected"
            :aria-label="t('changelog.select', { subject: entry.subject }, 'Select {subject}')"
            density="compact"
            @update:model-value="(on: boolean | null) => emit('update:selected', on === true)"
        />
        <div class="mb-changelog__entry-body">
            <p class="mb-changelog__subject">{{ entry.subject }}</p>
            <p class="mb-changelog__meta">
                <a
                    class="mb-changelog__sha"
                    :href="url"
                    target="_blank"
                    rel="noopener noreferrer"
                    :aria-label="t('changelog.openCommit', { sha: entry.sha }, 'Open commit {sha}')"
                    >{{ entry.shortSha }}</a
                >
                <span>{{ day }}</span>
                <span v-if="entry.summarizes !== undefined">{{ summaryLabel }}</span>
            </p>
            <!--
                A native disclosure rather than a Vuetify panel: it is keyboard operable and
                announced as one without any wiring, and these bodies are long bilingual prose
                that nobody wants expanded by default.
            -->
            <details v-if="entry.details" class="mb-changelog__details">
                <summary>{{ t("changelog.fullMessage", "Full commit message") }}</summary>
                <pre>{{ entry.details }}</pre>
            </details>
        </div>
    </li>
</template>
