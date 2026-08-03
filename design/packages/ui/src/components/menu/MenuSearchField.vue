<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiCodeBrackets, mdiMagnify, mdiRegex } from "@mdi/js";
import { VBtn, VIcon, VMenu, VTextField, VTooltip } from "vuetify/components";
import MenuRegexBuilder from "./MenuRegexBuilder.vue";
import { compilePattern } from "./regex";

/**
 * Search field for the menu surfaces, with the full regex builder anchored to this exact
 * field rather than parked in a distant dialog.
 *
 * Plain text is the default; the query only becomes a pattern once the user turns regex on.
 * The field's text *is* the pattern, so the query, the builder's raw editor, the flags and
 * the validation state cannot drift apart: there is one string, edited from two places.
 *
 * Replaces upstream `Menu/TextInput.vue`, and keeps its one piece of real behaviour:
 * keydown is stopped so typing does not drive the WASD/arrow camera controls.
 */
const props = withDefaults(
    defineProps<{
        modelValue: string;
        /** True when the query is treated as a regular expression. */
        regex?: boolean;
        /** Active flags, as a plain string such as "i" or "gim". */
        flags?: string;
        label?: string;
        placeholder?: string;
        /** Real corpus the builder previews against (one candidate per line). */
        sample?: string;
    }>(),
    { regex: false, flags: "i", label: "", placeholder: "", sample: "" },
);

const emit = defineEmits<{
    "update:modelValue": [value: string];
    "update:regex": [value: boolean];
    "update:flags": [value: string];
}>();

const { t } = useI18n();

const anchor = ref<HTMLElement | null>(null);
const builderOpen = ref(false);

const query = computed<string>({
    get: () => props.modelValue,
    set: (value) => emit("update:modelValue", value),
});

const flags = computed<string>({
    get: () => props.flags,
    set: (value) => emit("update:flags", value),
});

const error = computed(() => {
    if (!props.regex || !props.modelValue) return null;
    return compilePattern(props.modelValue, props.flags).error;
});

function toggleRegex(): void {
    emit("update:regex", !props.regex);
}

/**
 * Opening the builder turns regex mode on: the field's text becomes the pattern, so
 * inserting `\d` into a plain-text query would otherwise silently corrupt it. Closing the
 * builder leaves the mode alone; the user turns it back off with the regex toggle, and the
 * literal query is unchanged either way.
 */
function openBuilder(): void {
    if (!props.regex) emit("update:regex", true);
    builderOpen.value = !builderOpen.value;
}

// Vuetify restores focus to a focusable activator; ours is the wrapper, so do it by hand.
watch(builderOpen, (open) => {
    if (open) return;
    void nextTick(() => anchor.value?.querySelector("input")?.focus());
});
</script>

<template>
    <div ref="anchor" class="mb-menu-search">
        <v-text-field
            v-model="query"
            :label="label ?? ''"
            :placeholder="placeholder ?? ''"
            :prepend-inner-icon="mdiMagnify"
            :error-messages="error ? [error] : []"
            :aria-invalid="error ? 'true' : 'false'"
            density="compact"
            variant="outlined"
            hide-details="auto"
            clearable
            spellcheck="false"
            autocapitalize="off"
            autocomplete="off"
            @keydown.stop
        >
            <template #append-inner>
                <v-btn
                    class="mb-menu-search__toggle"
                    icon
                    :color="regex ? 'primary' : undefined"
                    :aria-pressed="regex ? 'true' : 'false'"
                    :aria-label="t('regexBuilder.toggle', 'Use a regular expression')"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click.stop="toggleRegex"
                >
                    <!-- VBtn ignores the `icon` path when the default slot is used, and the
                         tooltip has to be a child for `activator="parent"`. -->
                    <v-icon :icon="mdiRegex" />
                    <v-tooltip
                        activator="parent"
                        location="bottom"
                        :text="t('regexBuilder.toggle', 'Use a regular expression')"
                    />
                </v-btn>
                <v-btn
                    class="mb-menu-search__builder"
                    icon
                    :aria-label="t('regexBuilder.open', 'Open the regex builder')"
                    :aria-expanded="builderOpen ? 'true' : 'false'"
                    variant="text"
                    size="small"
                    density="comfortable"
                    @click.stop="openBuilder"
                >
                    <v-icon :icon="mdiCodeBrackets" />
                    <v-tooltip
                        activator="parent"
                        location="bottom"
                        :text="t('regexBuilder.open', 'Open the regex builder')"
                    />
                </v-btn>
            </template>
        </v-text-field>

        <v-menu
            v-model="builderOpen"
            :activator="anchor ?? undefined"
            :close-on-content-click="false"
            location="bottom start"
            origin="auto"
            offset="4"
        >
            <MenuRegexBuilder v-model:pattern="query" v-model:flags="flags" :sample="sample ?? ''" />
        </v-menu>
    </div>
</template>

<style>
.mb-menu-search {
    padding: 8px 12px;
}

.mb-menu-search .mb-menu-search__toggle,
.mb-menu-search .mb-menu-search__builder {
    margin-inline-start: 2px;
}
</style>
