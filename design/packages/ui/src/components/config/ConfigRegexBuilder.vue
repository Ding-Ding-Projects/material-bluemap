<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { mdiContentCopy } from "@mdi/js";
import { VAlert, VBtn, VCard, VCardText, VChip, VChipGroup, VDivider, VTextarea } from "vuetify/components";
import {
    MAX_EVAL_MS,
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    escapeLiteral,
    evaluatePattern,
} from "./regexEngine.js";

/**
 * The full regex builder for the settings search bars.
 *
 * It is anchored beside the field that opened it, and it is bound to that field:
 * the pattern and flags are two-way props, so typing in the raw editor changes
 * the search immediately and typing in the search bar changes the editor.
 *
 * The engine is stated in the interface, not only in a comment, because a
 * builder whose dialect a user has to guess is a builder they cannot trust:
 * ECMAScript `RegExp`, evaluated locally on this thread, which is the same
 * engine `createSettingMatcher` filters settings with. Nothing is transmitted
 * and nothing is persisted.
 */
const props = defineProps<{
    pattern: string;
    flags: string;
    /** Real text from the surface that opened this, one candidate per line. */
    sample: string;
}>();

const emit = defineEmits<{ "update:pattern": [value: string]; "update:flags": [value: string] }>();

const { t } = useI18n();

const patternWrap = ref<HTMLElement | null>(null);
const sampleText = ref(props.sample);
const copyState = ref("");

/**
 * Keeps ordinary typing in the pattern and sample fields from leaking out to whatever
 * hosts this popover, without also swallowing Escape.
 *
 * A bare `@keydown.stop` did both: `ConfigSearchField.vue` opens this builder in a
 * `v-menu`, and `VMenu` closes on Escape through a window-level listener it attaches for
 * itself rather than one this component owns, so stopping every key here meant Escape
 * never reached it and the popover looked unresponsive to the one key every other overlay
 * in this app answers to. Matches the fix already applied to `markers/RegexBuilder.vue`,
 * the marker search field's own builder.
 */
function stopUnlessEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape") event.stopPropagation();
}

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

const namedGroups = computed(() => {
    const names = new Set<string>();
    for (const match of evaluation.value.matches) {
        for (const group of match.groups) {
            if (!/^\d+$/.test(group.name)) names.add(group.name);
        }
    }
    return [...names];
});

interface Token {
    readonly label: string;
    readonly before: string;
    readonly after?: string;
    readonly hint: string;
}

interface TokenGroup {
    readonly title: string;
    readonly tokens: readonly Token[];
}

const tokenGroups = computed<TokenGroup[]>(() => [
    {
        title: t("config.regex.group.classes", "Character classes"),
        tokens: [
            { label: "[abc]", before: "[", after: "]", hint: t("config.regex.hint.set", "any one of these characters") },
            { label: "[^abc]", before: "[^", after: "]", hint: t("config.regex.hint.notSet", "any character except these") },
            { label: "\\d", before: "\\d", hint: t("config.regex.hint.digit", "any digit") },
            { label: "\\w", before: "\\w", hint: t("config.regex.hint.word", "any word character") },
            { label: "\\s", before: "\\s", hint: t("config.regex.hint.space", "any whitespace") },
            { label: ".", before: ".", hint: t("config.regex.hint.any", "any character except a line break") },
        ],
    },
    {
        title: t("config.regex.group.anchors", "Anchors"),
        tokens: [
            { label: "^", before: "^", hint: t("config.regex.hint.start", "start of text, or of a line with flag m") },
            { label: "$", before: "$", hint: t("config.regex.hint.end", "end of text, or of a line with flag m") },
            { label: "\\b", before: "\\b", hint: t("config.regex.hint.boundary", "word boundary") },
            { label: "\\B", before: "\\B", hint: t("config.regex.hint.notBoundary", "not a word boundary") },
        ],
    },
    {
        title: t("config.regex.group.groups", "Groups"),
        tokens: [
            { label: "( )", before: "(", after: ")", hint: t("config.regex.hint.capture", "capturing group") },
            { label: "(?: )", before: "(?:", after: ")", hint: t("config.regex.hint.noCapture", "group without capturing") },
            { label: "(?<n> )", before: "(?<name>", after: ")", hint: t("config.regex.hint.named", "named capturing group") },
            { label: "\\1", before: "\\1", hint: t("config.regex.hint.backref", "back-reference to group 1") },
            { label: "(?= )", before: "(?=", after: ")", hint: t("config.regex.hint.lookahead", "followed by") },
            { label: "(?! )", before: "(?!", after: ")", hint: t("config.regex.hint.negLookahead", "not followed by") },
        ],
    },
    {
        title: t("config.regex.group.alternation", "Alternation"),
        tokens: [{ label: "|", before: "|", hint: t("config.regex.hint.or", "match the left side or the right side") }],
    },
    {
        title: t("config.regex.group.quantifiers", "Quantifiers"),
        tokens: [
            { label: "*", before: "*", hint: t("config.regex.hint.star", "zero or more") },
            { label: "+", before: "+", hint: t("config.regex.hint.plus", "one or more") },
            { label: "?", before: "?", hint: t("config.regex.hint.opt", "zero or one") },
            { label: "{2,5}", before: "{2,5}", hint: t("config.regex.hint.range", "between two and five") },
            { label: "*?", before: "*?", hint: t("config.regex.hint.lazy", "zero or more, as few as possible") },
        ],
    },
]);

function patternElement(): HTMLTextAreaElement | null {
    return patternWrap.value?.querySelector("textarea") ?? null;
}

function replaceSelection(before: string, after: string, transform?: (value: string) => string): void {
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

/** Escapes every metacharacter in the selection, or in the whole pattern. */
function escapeSelection(): void {
    const element = patternElement();
    if (element && element.selectionStart !== element.selectionEnd) {
        replaceSelection("", "", escapeLiteral);
        return;
    }
    emit("update:pattern", escapeLiteral(props.pattern));
}

async function copy(value: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(value);
        // `t(key, named, fallback)` throughout this file, never `t(key, fallback).replace(...)`:
        // vue-i18n compiles the message itself, so it consumes `{what}` and the limit numbers
        // as its own named parameters and a later `replace` finds nothing left to substitute.
        copyState.value = t("config.regex.copied", { what }, "Copied {what} exactly as it is written.");
    } catch {
        copyState.value = t("config.regex.copyFailed", "Could not reach the clipboard.");
    }
}
</script>

<template>
    <v-card class="mb-config-regex" role="dialog" :aria-label="t('config.regex.title', 'Regex builder')" max-width="440">
        <v-card-text class="mb-config-regex__body">
            <h3 class="mb-config-regex__heading">{{ t("config.regex.title", "Regex builder") }}</h3>
            <p class="mb-config-regex__meta">
                {{
                    t(
                        "config.regex.engine",
                        "ECMAScript RegExp, the same engine the search itself runs, evaluated on this machine. Nothing is sent anywhere.",
                    )
                }}
            </p>

            <div ref="patternWrap">
                <v-textarea
                    v-model="pattern"
                    class="mb-config-regex__pattern"
                    :label="t('config.regex.pattern', 'Pattern')"
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
                    @keydown="stopUnlessEscape"
                />
            </div>

            <fieldset class="mb-config-regex__row">
                <legend>{{ t("config.regex.flags", "Flags") }}</legend>
                <v-chip-group v-model="selectedFlags" multiple column selected-class="text-primary">
                    <v-chip v-for="flag in SUPPORTED_FLAGS" :key="flag" :value="flag" size="small" filter variant="outlined">
                        {{ flag }}
                    </v-chip>
                </v-chip-group>
            </fieldset>

            <v-divider class="my-2" />

            <fieldset v-for="group in tokenGroups" :key="group.title" class="mb-config-regex__row">
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

            <fieldset class="mb-config-regex__row">
                <legend>{{ t("config.regex.group.literals", "Literals") }}</legend>
                <v-btn size="small" variant="tonal" density="comfortable" @click="escapeSelection">
                    {{ t("config.regex.escape", "Escape the selection") }}
                </v-btn>
            </fieldset>

            <v-divider class="my-2" />

            <v-textarea
                v-model="sampleText"
                :label="t('config.regex.sample', 'Sample text')"
                :maxlength="MAX_SAMPLE_LENGTH"
                rows="3"
                density="compact"
                variant="outlined"
                spellcheck="false"
                hide-details="auto"
                @keydown="stopUnlessEscape"
            />

            <v-alert v-if="evaluation.error" type="error" density="compact" variant="tonal" class="mt-2" role="alert">
                {{ evaluation.error }}
            </v-alert>

            <div class="mb-config-regex__results" aria-live="polite">
                <p class="mb-config-regex__meta">
                    <template v-if="!pattern">{{ t("config.regex.noPattern", "No pattern yet.") }}</template>
                    <template v-else-if="evaluation.error">
                        {{ t("config.regex.invalid", "The pattern is not valid, so nothing matches.") }}
                    </template>
                    <template v-else>
                        {{
                            t(
                                "config.regex.matchCount",
                                { count: evaluation.matches.length },
                                "{count} matches in the sample",
                            )
                        }}
                        <template v-if="evaluation.truncated">
                            {{ t("config.regex.truncated", { max: MAX_MATCHES }, "(stopped at {max})") }}
                        </template>
                        <template v-if="evaluation.timedOut">
                            {{
                                t(
                                    "config.regex.timedOut",
                                    { ms: MAX_EVAL_MS },
                                    "(stopped after {ms} ms: the pattern is too slow)",
                                )
                            }}
                        </template>
                        <template v-if="evaluation.sampleTruncated">
                            {{
                                t(
                                    "config.regex.sampleCut",
                                    { n: MAX_SAMPLE_LENGTH },
                                    "(only the first {n} characters were scanned)",
                                )
                            }}
                        </template>
                    </template>
                </p>

                <ol v-if="evaluation.matches.length" class="mb-config-regex__matches">
                    <li v-for="(match, index) in evaluation.matches.slice(0, 12)" :key="index">
                        <code>{{ match.text || t("config.regex.empty", "(empty match)") }}</code>
                        <span class="mb-config-regex__at">@{{ match.index }}</span>
                        <span v-if="match.groups.length" class="mb-config-regex__groups">
                            {{ match.groups.map((group) => `${group.name}=${group.value ?? "-"}`).join(" | ") }}
                        </span>
                    </li>
                </ol>

                <p v-if="namedGroups.length" class="mb-config-regex__meta">
                    {{ t("config.regex.namedGroups", "Named groups") }}: {{ namedGroups.join(", ") }}
                </p>
            </div>

            <div class="mb-config-regex__row">
                <v-btn size="small" variant="text" :prepend-icon="mdiContentCopy" @click="copy(pattern, t('config.regex.pattern', 'Pattern'))">
                    {{ t("config.regex.copyPattern", "Copy the pattern") }}
                </v-btn>
                <v-btn size="small" variant="text" :prepend-icon="mdiContentCopy" @click="copy(flags, t('config.regex.flags', 'Flags'))">
                    {{ t("config.regex.copyFlags", "Copy the flags") }}
                </v-btn>
            </div>
            <p class="mb-config-regex__meta" aria-live="polite">{{ copyState }}</p>

            <p class="mb-config-regex__meta">
                {{
                    t(
                        "config.regex.limits",
                        {
                            pattern: MAX_PATTERN_LENGTH,
                            sample: MAX_SAMPLE_LENGTH,
                            matches: MAX_MATCHES,
                            ms: MAX_EVAL_MS,
                        },
                        "Limits: {pattern} characters of pattern, {sample} of sample, {matches} matches, {ms} ms per run.",
                    )
                }}
            </p>
        </v-card-text>
    </v-card>
</template>

<style>
.mb-config-regex {
    max-height: min(70vh, 640px);
    overflow-y: auto;
}

.mb-config-regex__body {
    padding: 12px 16px 16px;
}

.mb-config-regex__heading {
    font-size: 1rem;
    font-weight: 500;
    margin-block-end: 2px;
}

.mb-config-regex__meta {
    font-size: 0.75rem;
    line-height: 1.4;
    margin-block: 4px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-regex__pattern textarea,
.mb-config-regex .mb-config-regex__matches code {
    font-family: "Roboto Mono", ui-monospace, monospace;
}

.mb-config-regex__row {
    border: none;
    padding: 0;
    margin: 4px 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
}

.mb-config-regex__row legend {
    font-size: 0.75rem;
    letter-spacing: 0.05em;
    width: 100%;
    padding: 0;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.mb-config-regex__matches {
    margin: 4px 0 0 1.2em;
    padding: 0;
    font-size: 0.75rem;
    max-height: 9em;
    overflow-y: auto;
}

.mb-config-regex__at,
.mb-config-regex__groups {
    margin-inline-start: 6px;
    color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>
