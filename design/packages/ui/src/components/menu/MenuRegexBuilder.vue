<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy } from "@mdi/js";
import {
    VAlert,
    VBtn,
    VCard,
    VCardText,
    VChip,
    VChipGroup,
    VDivider,
    VTextarea,
} from "vuetify/components";
import {
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    evaluatePattern,
} from "./regex";

/**
 * Anchored regex builder for the menu search bars.
 *
 * Engine: the host runtime's own `RegExp` (ECMAScript), evaluated locally on this thread,
 * which is the same engine the search bar filters with, so a preview here cannot disagree
 * with the result there. Nothing is transmitted or persisted.
 */
const props = defineProps<{
    pattern: string;
    flags: string;
    /** Real corpus from the calling search surface, used as the default sample text. */
    sample: string;
}>();

const emit = defineEmits<{
    "update:pattern": [value: string];
    "update:flags": [value: string];
}>();

const { t } = useI18n();

const patternWrap = ref<HTMLElement | null>(null);
const sampleText = ref(props.sample);
const copyState = ref("");

watch(
    () => props.sample,
    (value) => {
        sampleText.value = value;
    },
);

const pattern = computed<string>({
    get: () => props.pattern,
    set: (value) => emit("update:pattern", value.slice(0, MAX_PATTERN_LENGTH)),
});

const selectedFlags = computed<string[]>({
    get: () => [...props.flags],
    set: (value) => emit("update:flags", value.join("")),
});

const evaluation = computed(() => evaluatePattern(props.pattern, props.flags, sampleText.value));

const captureNames = computed(() => {
    const names = new Set<string>();
    for (const match of evaluation.value.matches) {
        for (const name of Object.keys(match.named)) names.add(name);
    }
    return [...names];
});

interface Token {
    label: string;
    before: string;
    after?: string;
    hint: string;
}

interface TokenGroup {
    title: string;
    tokens: Token[];
}

const tokenGroups = computed<TokenGroup[]>(() => [
    {
        title: t("regexBuilder.group.classes", "Character classes"),
        tokens: [
            { label: "[abc]", before: "[", after: "]", hint: "any one of these characters" },
            { label: "[^abc]", before: "[^", after: "]", hint: "any character except these" },
            { label: "\\d", before: "\\d", hint: "any digit" },
            { label: "\\w", before: "\\w", hint: "any word character" },
            { label: "\\s", before: "\\s", hint: "any whitespace" },
            { label: ".", before: ".", hint: "any character except a line break" },
        ],
    },
    {
        title: t("regexBuilder.group.anchors", "Anchors"),
        tokens: [
            { label: "^", before: "^", hint: "start of text, or of a line with flag m" },
            { label: "$", before: "$", hint: "end of text, or of a line with flag m" },
            { label: "\\b", before: "\\b", hint: "word boundary" },
            { label: "\\B", before: "\\B", hint: "not a word boundary" },
        ],
    },
    {
        title: t("regexBuilder.group.groups", "Groups"),
        tokens: [
            { label: "( )", before: "(", after: ")", hint: "capturing group" },
            { label: "(?: )", before: "(?:", after: ")", hint: "group without capturing" },
            { label: "(?<n> )", before: "(?<name>", after: ")", hint: "named capturing group" },
            { label: "\\1", before: "\\1", hint: "back-reference to group 1" },
        ],
    },
    {
        title: t("regexBuilder.group.alternation", "Alternation"),
        tokens: [{ label: "|", before: "|", hint: "match the left side or the right side" }],
    },
    {
        title: t("regexBuilder.group.quantifiers", "Quantifiers"),
        tokens: [
            { label: "*", before: "*", hint: "zero or more" },
            { label: "+", before: "+", hint: "one or more" },
            { label: "?", before: "?", hint: "zero or one" },
            { label: "{2,5}", before: "{2,5}", hint: "between two and five" },
            { label: "*?", before: "*?", hint: "zero or more, as few as possible" },
        ],
    },
]);

function patternElement(): HTMLTextAreaElement | null {
    return patternWrap.value?.querySelector("textarea") ?? null;
}

function replaceSelection(before: string, after: string, transform?: (value: string) => string) {
    const element = patternElement();
    const current = props.pattern;

    if (!element) {
        emit("update:pattern", (current + before + after).slice(0, MAX_PATTERN_LENGTH));
        return;
    }

    const start = element.selectionStart ?? current.length;
    const end = element.selectionEnd ?? start;
    const selected = transform ? transform(current.slice(start, end)) : current.slice(start, end);
    const next = current.slice(0, start) + before + selected + after + current.slice(end);

    emit("update:pattern", next.slice(0, MAX_PATTERN_LENGTH));

    const caret = start + before.length + selected.length;
    void nextTick(() => {
        element.focus();
        element.setSelectionRange(caret, caret);
    });
}

function insertToken(token: Token): void {
    replaceSelection(token.before, token.after ?? "");
}

/** Escapes every ECMAScript metacharacter in the current selection (or the whole pattern). */
function escapeSelection(): void {
    const element = patternElement();
    if (element && element.selectionStart !== element.selectionEnd) {
        replaceSelection("", "", (value) => value.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"));
        return;
    }
    emit("update:pattern", props.pattern.replace(/[.*+?^${}()|[\]\\/-]/g, "\\$&"));
}

async function copy(value: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
        // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n compiles
        // the fallback as a message too and consumes `{what}` as its own named parameter, so
        // a later `replace` finds nothing left to substitute. Named args also spare the
        // pattern text a second mangling, since `replace` reads `$&` in a copied regex as a
        // substitution of its own.
        copyState.value = t("regexBuilder.copied", { what }, "Copied {what}");
    } catch {
        copyState.value = t("regexBuilder.copyFailed", "Could not reach the clipboard");
    }
}
</script>

<template>
    <v-card
        class="mb-regex-builder"
        role="dialog"
        :aria-label="t('regexBuilder.title', 'Regex builder')"
        max-width="420"
    >
        <v-card-text class="mb-regex-builder__body">
            <h3 class="mb-regex-builder__heading">{{ t("regexBuilder.title", "Regex builder") }}</h3>
            <p class="mb-regex-builder__engine">
                {{
                    t(
                        "regexBuilder.engine",
                        "ECMAScript RegExp, evaluated locally. Escape a literal with a backslash.",
                    )
                }}
            </p>

            <div ref="patternWrap">
                <v-textarea
                    v-model="pattern"
                    class="mb-regex-builder__pattern"
                    :label="t('regexBuilder.pattern', 'Pattern')"
                    :counter="MAX_PATTERN_LENGTH"
                    :maxlength="MAX_PATTERN_LENGTH"
                    rows="2"
                    auto-grow
                    density="compact"
                    variant="outlined"
                    spellcheck="false"
                    autocapitalize="off"
                    autocomplete="off"
                    hide-details="auto"
                    @keydown.stop
                />
            </div>

            <fieldset class="mb-regex-builder__flags">
                <legend>{{ t("regexBuilder.flags", "Flags") }}</legend>
                <v-chip-group v-model="selectedFlags" multiple column selected-class="text-primary">
                    <v-chip
                        v-for="flag in SUPPORTED_FLAGS"
                        :key="flag"
                        :value="flag"
                        size="small"
                        filter
                        variant="outlined"
                    >
                        {{ flag }}
                    </v-chip>
                </v-chip-group>
            </fieldset>

            <v-divider class="my-2" />

            <fieldset
                v-for="group in tokenGroups"
                :key="group.title"
                class="mb-regex-builder__tokens"
            >
                <legend>{{ group.title }}</legend>
                <v-btn
                    v-for="token in group.tokens"
                    :key="token.label"
                    size="small"
                    variant="tonal"
                    density="comfortable"
                    :title="token.hint"
                    :aria-label="`${token.label}: ${token.hint}`"
                    @click="insertToken(token)"
                >
                    {{ token.label }}
                </v-btn>
            </fieldset>

            <fieldset class="mb-regex-builder__tokens">
                <legend>{{ t("regexBuilder.group.literals", "Literals") }}</legend>
                <v-btn size="small" variant="tonal" density="comfortable" @click="escapeSelection">
                    {{ t("regexBuilder.escape", "Escape selection") }}
                </v-btn>
            </fieldset>

            <v-divider class="my-2" />

            <v-textarea
                v-model="sampleText"
                :label="t('regexBuilder.sample', 'Sample text')"
                :maxlength="MAX_SAMPLE_LENGTH"
                rows="3"
                density="compact"
                variant="outlined"
                spellcheck="false"
                hide-details="auto"
                @keydown.stop
            />

            <v-alert
                v-if="evaluation.error"
                type="error"
                density="compact"
                variant="tonal"
                class="mt-2"
                role="alert"
            >
                {{ evaluation.error }}
            </v-alert>

            <div class="mb-regex-builder__results" aria-live="polite">
                <p class="mb-regex-builder__summary">
                    <template v-if="!pattern">
                        {{ t("regexBuilder.noPattern", "No pattern yet.") }}
                    </template>
                    <template v-else-if="evaluation.error">
                        {{ t("regexBuilder.invalid", "Pattern is not valid, so nothing matches.") }}
                    </template>
                    <template v-else>
                        {{
                            t(
                                "regexBuilder.matchCount",
                                { count: evaluation.matches.length },
                                "{count} matches in the sample",
                            )
                        }}
                        <template v-if="evaluation.truncated">
                            {{
                                t(
                                    "regexBuilder.truncated",
                                    { max: MAX_MATCHES },
                                    "(stopped at {max})",
                                )
                            }}
                        </template>
                        <template v-if="evaluation.timedOut">
                            {{ t("regexBuilder.timedOut", "(stopped: pattern is too slow)") }}
                        </template>
                    </template>
                </p>

                <ol v-if="evaluation.matches.length" class="mb-regex-builder__matches">
                    <li v-for="(match, index) in evaluation.matches.slice(0, 12)" :key="index">
                        <code>{{ match.text || t("regexBuilder.empty", "(empty match)") }}</code>
                        <span class="mb-regex-builder__at">@{{ match.index }}</span>
                        <span v-if="match.groups.length" class="mb-regex-builder__groups">
                            {{ match.groups.map((g) => g ?? "-").join(" | ") }}
                        </span>
                    </li>
                </ol>

                <p v-if="captureNames.length" class="mb-regex-builder__summary">
                    {{ t("regexBuilder.namedGroups", "Named groups") }}:
                    {{ captureNames.join(", ") }}
                </p>
            </div>

            <div class="mb-regex-builder__actions">
                <v-btn
                    size="small"
                    variant="text"
                    :prepend-icon="mdiContentCopy"
                    @click="copy(pattern, t('regexBuilder.pattern', 'Pattern'))"
                >
                    {{ t("regexBuilder.copyPattern", "Copy pattern") }}
                </v-btn>
                <v-btn
                    size="small"
                    variant="text"
                    :prepend-icon="mdiContentCopy"
                    @click="copy(flags, t('regexBuilder.flags', 'Flags'))"
                >
                    {{ t("regexBuilder.copyFlags", "Copy flags") }}
                </v-btn>
            </div>
            <p class="mb-regex-builder__summary" aria-live="polite">{{ copyState }}</p>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-regex-builder {
    max-height: min(70vh, 640px);
    overflow-y: auto;
}

.mb-regex-builder__body {
    padding: 12px 16px 16px;
}

.mb-regex-builder__heading {
    font-size: 1rem;
    font-weight: 500;
    margin-block-end: 2px;
}

.mb-regex-builder__engine,
.mb-regex-builder__summary {
    font-size: 0.75rem;
    line-height: 1.4;
    margin-block: 4px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-regex-builder__pattern textarea,
.mb-regex-builder .mb-regex-builder__matches code {
    font-family: "Roboto Mono", ui-monospace, monospace;
}

.mb-regex-builder__flags,
.mb-regex-builder__tokens {
    border: none;
    padding: 0;
    margin: 4px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.mb-regex-builder__flags legend,
.mb-regex-builder__tokens legend {
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    width: 100%;
    padding: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-regex-builder__matches {
    margin: 4px 0 0 1.2em;
    padding: 0;
    font-size: 0.75rem;
    max-height: 9em;
    overflow-y: auto;
}

.mb-regex-builder__at,
.mb-regex-builder__groups {
    margin-inline-start: 6px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-regex-builder__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-block-start: 4px;
}
</style>
