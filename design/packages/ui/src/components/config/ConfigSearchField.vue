<script setup lang="ts">
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import { mdiClose, mdiMagnify, mdiRegex } from "@mdi/js";
import { VBtn, VMenu, VTextField, VTooltip } from "vuetify/components";
import ConfigRegexBuilder from "./ConfigRegexBuilder.vue";
import { createSettingMatcher } from "./regexEngine.js";

/**
 * A settings search bar, with its own regex builder anchored to it.
 *
 * Every settings surface in this editor gets one of these, bound to that
 * surface's own query, pattern, flags and mode. There is no shared builder
 * holding state for whichever field was touched last: the builder is opened from
 * this field, is anchored beside it, writes back into it, and returns focus to
 * it when it closes.
 *
 * Plain text is the default and stays a case-insensitive substring match. Regex
 * is an explicit opt-in, and turning it off again leaves the literal query
 * exactly as typed rather than rewriting it.
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        regex: boolean;
        flags: string;
        label: string;
        placeholder?: string;
        /** Real corpus for the builder's preview, one candidate per line. */
        sample?: string;
        /** Honest "showing X of Y" line, rendered beneath the field. */
        summary?: string;
        density?: "default" | "comfortable" | "compact";
    }>(),
    { placeholder: "", sample: "", summary: "", density: "compact" },
);

const emit = defineEmits<{
    "update:modelValue": [value: string];
    "update:regex": [value: boolean];
    "update:flags": [value: string];
}>();

const { t } = useI18n();

const builderOpen = ref(false);
const fieldRef = ref<InstanceType<typeof VTextField> | null>(null);

const query = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});


/**
 * Vuetify's props and `exactOptionalPropertyTypes` disagree about `undefined`,
 * so an optional prop of ours is normalised once here rather than coalesced at
 * every binding in the template.
 */
const placeholderValue = computed(() => props.placeholder ?? "");
const sampleValue = computed(() => props.sample ?? "");
const summaryValue = computed(() => props.summary ?? "");
const densityValue = computed<"default" | "comfortable" | "compact">(() => props.density ?? "compact");

/** The compile error, so an invalid pattern is visible rather than silently empty. */
const error = computed(() => createSettingMatcher(props.modelValue, props.regex, props.flags).error);

function toggleRegex(): void {
    emit("update:regex", !props.regex);
    if (props.regex) builderOpen.value = false;
}

/** Focus goes back to the field the builder belongs to, never to the page. */
function closeBuilder(): void {
    builderOpen.value = false;
    const element = fieldRef.value?.$el as HTMLElement | undefined;
    element?.querySelector("input")?.focus();
}

function clear(): void {
    emit("update:modelValue", "");
}
</script>

<template>
    <div class="mb-config-search">
        <v-text-field
            ref="fieldRef"
            v-model="query"
            :label="label"
            :placeholder="placeholderValue"
            :prepend-inner-icon="mdiMagnify"
            :error-messages="error"
            :density="densityValue"
            variant="outlined"
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            hide-details="auto"
            role="searchbox"
        >
            <template #append-inner>
                <v-btn
                    v-if="query"
                    :icon="mdiClose"
                    :aria-label="t('config.search.clear', 'Clear the search')"
                    variant="text"
                    size="x-small"
                    density="comfortable"
                    @click.stop="clear"
                />
                <v-btn
                    :icon="mdiRegex"
                    :aria-label="
                        regex
                            ? t('config.search.regexOff', 'Search plain text instead of a regular expression')
                            : t('config.search.regexOn', 'Search with a regular expression')
                    "
                    :aria-pressed="regex ? 'true' : 'false'"
                    :color="regex ? 'primary' : undefined"
                    variant="text"
                    size="x-small"
                    density="comfortable"
                    @click.stop="toggleRegex"
                >
                    <v-tooltip
                        activator="parent"
                        location="top"
                        :text="
                            regex
                                ? t('config.search.regexOffHint', 'Back to plain text. The query stays exactly as typed.')
                                : t('config.search.regexOnHint', 'Treat the query as a regular expression.')
                        "
                    />
                </v-btn>
                <!--
                    The menu's own activator opens it and keeps `builderOpen` in
                    step through v-model, which is what `aria-expanded` reads. A
                    second click handler here would toggle the same flag twice
                    per click and the builder would never open.
                -->
                <v-btn
                    :aria-label="t('config.search.builder', 'Open the regex builder')"
                    :aria-expanded="builderOpen ? 'true' : 'false'"
                    variant="text"
                    size="x-small"
                    density="comfortable"
                >
                    {{ t("config.search.builderShort", ".*") }}
                    <v-tooltip activator="parent" location="top" :text="t('config.search.builder', 'Open the regex builder')" />
                    <v-menu
                        v-model="builderOpen"
                        activator="parent"
                        :close-on-content-click="false"
                        location="bottom end"
                        offset="8"
                        @update:model-value="(open: boolean) => !open && closeBuilder()"
                    >
                        <ConfigRegexBuilder
                            :pattern="modelValue"
                            :flags="flags"
                            :sample="sampleValue"
                            @update:pattern="
                                (value: string) => {
                                    emit('update:modelValue', value);
                                    if (!regex) emit('update:regex', true);
                                }
                            "
                            @update:flags="(value: string) => emit('update:flags', value)"
                        />
                    </v-menu>
                </v-btn>
            </template>
        </v-text-field>

        <p v-if="summaryValue" class="mb-config-search__summary" aria-live="polite">{{ summaryValue }}</p>
    </div>
</template>

<style>
.mb-config-search {
    min-inline-size: 0;
    max-inline-size: 100%;
}

.mb-config-search .v-field {
    min-block-size: 44px;
}

.mb-config-search .v-btn {
    min-inline-size: 44px;
    min-block-size: 44px;
}

.mb-config-search__summary {
    margin-block-start: 4px;
    font-size: 0.75rem;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
    overflow-wrap: anywhere;
}
</style>
