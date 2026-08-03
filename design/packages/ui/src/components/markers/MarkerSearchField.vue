<script setup lang="ts">
import { ref } from "vue";
import { mdiMagnify, mdiRegex } from "@mdi/js";
import RegexBuilder from "./RegexBuilder.vue";
import { MAX_PATTERN_LENGTH } from "./markerFilter.js";
import { useMarkerI18n } from "./i18nHelpers.js";
import type { SearchMode } from "./markerFilter.js";

const props = defineProps<{
    modelValue: string;
    mode: SearchMode;
    flags: string;
    /** Compile error for the current pattern, shown on the field itself. */
    error: string | null;
    /** Sample text the builder starts from, normally the labels currently listed. */
    sampleSeed: string;
}>();

const emit = defineEmits<{
    "update:modelValue": [value: string];
    "update:mode": [value: SearchMode];
    "update:flags": [value: string];
}>();

const { t, tx } = useMarkerI18n();

const builderOpen = ref(false);

function onInput(value: string | null): void {
    emit("update:modelValue", value ?? "");
}
</script>

<template>
    <div class="mb-marker-search">
        <v-text-field
            :model-value="props.modelValue"
            :label="t('markers.searchPlaceholder', 'Search...')"
            :placeholder="t('markers.searchPlaceholder', 'Search...')"
            :error-messages="props.error ? [props.error] : []"
            :maxlength="MAX_PATTERN_LENGTH"
            :prepend-inner-icon="mdiMagnify"
            variant="outlined"
            density="compact"
            hide-details="auto"
            clearable
            autocapitalize="off"
            autocomplete="off"
            spellcheck="false"
            @keydown.stop
            @update:model-value="onInput"
        >
            <template #append-inner>
                <v-chip
                    v-if="props.mode === 'regex'"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    class="mb-marker-search__mode"
                >
                    {{ tx("regexBuilder.modeBadge", "regex") }}
                </v-chip>
                <!--
                  `icon` is the boolean shape flag here: VBtn only draws the glyph from its
                  `icon` prop when the button has no default slot, and this one hosts the
                  anchored builder menu.
                -->
                <v-btn
                    icon
                    :color="props.mode === 'regex' ? 'primary' : undefined"
                    variant="text"
                    density="comfortable"
                    class="mb-marker-search__builder-button"
                    aria-haspopup="dialog"
                    :aria-expanded="builderOpen"
                    :aria-label="
                        props.mode === 'regex'
                            ? tx(
                                  'regexBuilder.openOn',
                                  'Regular expression builder, regular expressions are on',
                              )
                            : tx(
                                  'regexBuilder.openOff',
                                  'Regular expression builder, plain text search is on',
                              )
                    "
                >
                    <v-icon :icon="mdiRegex" aria-hidden="true" />
                    <v-menu
                        v-model="builderOpen"
                        activator="parent"
                        location="bottom end"
                        origin="auto"
                        :close-on-content-click="false"
                        :offset="8"
                    >
                        <RegexBuilder
                            :pattern="props.modelValue"
                            :flags="props.flags"
                            :mode="props.mode"
                            :sample-seed="props.sampleSeed"
                            @update:pattern="emit('update:modelValue', $event)"
                            @update:flags="emit('update:flags', $event)"
                            @update:mode="emit('update:mode', $event)"
                            @close="builderOpen = false"
                        />
                    </v-menu>
                </v-btn>
            </template>
        </v-text-field>
    </div>
</template>

<style scoped>
.mb-marker-search {
    min-width: 0;
}

.mb-marker-search__mode {
    margin-inline-end: 0.25rem;
    align-self: center;
}

.mb-marker-search :deep(.v-field__input) {
    min-width: 0;
}

.mb-marker-search :deep(.v-btn:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-marker-search :deep(*) {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
