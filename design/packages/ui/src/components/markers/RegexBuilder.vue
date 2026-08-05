<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { mdiCheck, mdiClose, mdiContentCopy, mdiDownload, mdiRestore } from "@mdi/js";
import {
    MAX_EVAL_MS,
    MAX_MATCHES,
    MAX_PATTERN_LENGTH,
    MAX_SAMPLE_LENGTH,
    SUPPORTED_FLAGS,
    escapeLiteral,
    evaluatePattern,
} from "./regexEngine.js";
import { useMarkerI18n } from "./i18nHelpers.js";
import type { SearchMode } from "./markerFilter.js";

const props = defineProps<{
    /** The literal query in plain-text mode, the pattern in regex mode. Two-way with the field. */
    pattern: string;
    flags: string;
    mode: SearchMode;
    /** Seed for the sample text, normally the labels currently in the list. */
    sampleSeed: string;
}>();

const emit = defineEmits<{
    "update:pattern": [value: string];
    "update:flags": [value: string];
    "update:mode": [value: SearchMode];
    close: [];
}>();

const { tx } = useMarkerI18n();

const patternWrap = ref<HTMLElement | null>(null);
const sample = ref(props.sampleSeed);
const sampleEdited = ref(false);
const notice = ref("");

watch(
    () => props.sampleSeed,
    (seed) => {
        if (!sampleEdited.value) sample.value = seed;
    },
);

const flagList = computed(() => props.flags.split(""));

/**
 * Plain-text search is a case-insensitive substring test, so the preview escapes the
 * query and forces `i`. What the preview shows is then exactly what the list will do.
 */
const previewPattern = computed(() =>
    props.mode === "regex" ? props.pattern : escapeLiteral(props.pattern),
);
const previewFlags = computed(() => (props.mode === "regex" ? props.flags : "i"));

const evaluation = computed(() =>
    evaluatePattern(previewPattern.value, previewFlags.value, sample.value),
);

const patternError = computed(() => evaluation.value.error);

interface Token {
    label: string;
    before: string;
    after: string;
    hint: string;
}

interface TokenGroup {
    id: string;
    title: string;
    tokens: Token[];
}

function token(label: string, before: string, hint: string, after = ""): Token {
    return { label, before, after, hint };
}

const tokenGroups = computed<TokenGroup[]>(() => [
    {
        id: "characters",
        title: tx("markerRegex.group.characters", "Characters"),
        tokens: [
            token(".", ".", tx("markerRegex.token.any", "any character")),
            token("\\d", "\\d", tx("markerRegex.token.digit", "a digit")),
            token("\\D", "\\D", tx("markerRegex.token.notDigit", "not a digit")),
            token("\\w", "\\w", tx("markerRegex.token.word", "a word character")),
            token("\\W", "\\W", tx("markerRegex.token.notWord", "not a word character")),
            token("\\s", "\\s", tx("markerRegex.token.space", "whitespace")),
            token("\\S", "\\S", tx("markerRegex.token.notSpace", "not whitespace")),
            token("[abc]", "[", tx("markerRegex.token.class", "one of these characters"), "]"),
            token(
                "[^abc]",
                "[^",
                tx("markerRegex.token.negClass", "none of these characters"),
                "]",
            ),
            token("[a-z]", "[a-z]", tx("markerRegex.token.range", "a character range")),
        ],
    },
    {
        id: "anchors",
        title: tx("markerRegex.group.anchors", "Anchors"),
        tokens: [
            token("^", "^", tx("markerRegex.token.start", "start of input")),
            token("$", "$", tx("markerRegex.token.end", "end of input")),
            token("\\b", "\\b", tx("markerRegex.token.wordEdge", "word boundary")),
            token("\\B", "\\B", tx("markerRegex.token.notWordEdge", "not a word boundary")),
        ],
    },
    {
        id: "groups",
        title: tx("markerRegex.group.groups", "Groups and captures"),
        tokens: [
            token("( )", "(", tx("markerRegex.token.capture", "capturing group"), ")"),
            token("(?: )", "(?:", tx("markerRegex.token.nonCapture", "non-capturing group"), ")"),
            token(
                "(?<name> )",
                "(?<name>",
                tx("markerRegex.token.namedCapture", "named capturing group"),
                ")",
            ),
            token("(?= )", "(?=", tx("markerRegex.token.lookahead", "positive lookahead"), ")"),
            token("(?! )", "(?!", tx("markerRegex.token.negLookahead", "negative lookahead"), ")"),
            token("\\1", "\\1", tx("markerRegex.token.backreference", "back-reference to group 1")),
        ],
    },
    {
        id: "alternation",
        title: tx("markerRegex.group.alternation", "Alternation"),
        tokens: [
            token("|", "|", tx("markerRegex.token.or", "either side matches")),
            token("(a|b)", "(", tx("markerRegex.token.orGroup", "a group of alternatives"), "|)"),
        ],
    },
    {
        id: "quantifiers",
        title: tx("markerRegex.group.quantifiers", "Quantifiers"),
        tokens: [
            token("*", "*", tx("markerRegex.token.star", "zero or more")),
            token("+", "+", tx("markerRegex.token.plus", "one or more")),
            token("?", "?", tx("markerRegex.token.optional", "zero or one")),
            token("{n}", "{2}", tx("markerRegex.token.exactly", "exactly n times")),
            token("{n,}", "{2,}", tx("markerRegex.token.atLeast", "n or more times")),
            token("{n,m}", "{2,5}", tx("markerRegex.token.between", "between n and m times")),
            token("*?", "*?", tx("markerRegex.token.lazy", "lazy, as few as possible")),
        ],
    },
]);

const flagHints = computed<Record<string, string>>(() => ({
    g: tx("markerRegex.flag.g", "global, find every match (preview only)"),
    i: tx("markerRegex.flag.i", "ignore case"),
    m: tx("markerRegex.flag.m", "multiline, ^ and $ match every line"),
    s: tx("markerRegex.flag.s", "dot matches newlines"),
    u: tx("markerRegex.flag.u", "unicode mode"),
    y: tx("markerRegex.flag.y", "sticky, match from lastIndex (preview only)"),
}));

function patternInput(): HTMLTextAreaElement | null {
    return patternWrap.value?.querySelector("textarea") ?? null;
}

/**
 * Keeps ordinary typing (letters, arrows) from leaking out to the marker list's own
 * keyboard shortcuts while the pattern or sample field has focus, without also
 * swallowing Escape.
 *
 * A bare `@keydown.stop` did both, and Vuetify's overlay only closes on Escape through
 * a window-level listener it attaches for the menu this builder lives in - `VMenu` has
 * no handling of its own. Stopping every key here meant Escape never reached that
 * listener, so the popover looked unresponsive to the one key every other overlay in
 * this app answers to. Letting Escape bubble keeps that path working exactly the way it
 * already does for a click on the close button.
 */
function stopUnlessEscape(event: KeyboardEvent): void {
    if (event.key !== "Escape") event.stopPropagation();
}

/** Inserts around the current selection, so wrapping in a group or quantifier works. */
function insert(before: string, after: string): void {
    const element = patternInput();
    const value = props.pattern;

    if (!element) {
        const appended = value + before + after;
        if (appended.length <= MAX_PATTERN_LENGTH) emit("update:pattern", appended);
        return;
    }

    const start = element.selectionStart ?? value.length;
    const end = element.selectionEnd ?? start;
    const selected = value.slice(start, end);
    const next = value.slice(0, start) + before + selected + after + value.slice(end);
    if (next.length > MAX_PATTERN_LENGTH) {
        notice.value = tx("markerRegex.tooLong", "The pattern is already at its maximum length.");
        return;
    }

    emit("update:pattern", next);
    void nextTick(() => {
        element.focus();
        const caret = start + before.length + selected.length;
        element.setSelectionRange(caret, caret);
    });
}

function escapeSelection(): void {
    const element = patternInput();
    const value = props.pattern;
    const start = element?.selectionStart ?? 0;
    const end = element?.selectionEnd ?? value.length;
    const wholeField = start === end;
    const target = wholeField ? value : value.slice(start, end);
    const escaped = escapeLiteral(target);
    const next = wholeField ? escaped : value.slice(0, start) + escaped + value.slice(end);
    if (next.length > MAX_PATTERN_LENGTH) {
        notice.value = tx("markerRegex.tooLong", "The pattern is already at its maximum length.");
        return;
    }
    emit("update:pattern", next);
}

function toggleFlag(flag: string, on: boolean): void {
    const set = new Set(flagList.value);
    if (on) set.add(flag);
    else set.delete(flag);
    emit("update:flags", SUPPORTED_FLAGS.filter((candidate) => set.has(candidate)).join(""));
}

function setRegexMode(on: boolean): void {
    const next: SearchMode = on ? "regex" : "text";
    if (next !== props.mode) emit("update:mode", next);
}

async function copy(text: string): Promise<void> {
    try {
        const bridge = window.materialBluemap;
        if (bridge) await bridge.writeClipboardText(text);
        else await navigator.clipboard.writeText(text);
        notice.value = tx("markerRegex.copied", "Copied to the clipboard.");
    } catch {
        notice.value = tx("markerRegex.copyFailed", "Could not reach the clipboard.");
    }
}

function download(name: string, type: string, body: string): void {
    const blob = new Blob([body], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
    notice.value = tx("markerRegex.exported", "Exported {name}.", { name });
}

function exportJson(): void {
    download(
        "marker-search-pattern.json",
        "application/json",
        JSON.stringify(
            {
                engine: "ECMAScript RegExp",
                mode: props.mode,
                pattern: props.pattern,
                flags: props.flags,
                sample: sample.value,
                encoding: "UTF-8",
            },
            null,
            4,
        ) + "\n",
    );
}

function exportText(): void {
    download(
        "marker-search-pattern.txt",
        "text/plain",
        [
            "engine: ECMAScript RegExp",
            `mode: ${props.mode}`,
            `pattern: ${props.pattern}`,
            `flags: ${props.flags}`,
            "",
            "sample:",
            sample.value,
            "",
        ].join("\n"),
    );
}

function reset(): void {
    emit("update:pattern", "");
    emit("update:flags", "i");
    emit("update:mode", "text");
    sample.value = props.sampleSeed;
    sampleEdited.value = false;
    notice.value = tx("markerRegex.reset", "Search reset to plain text.");
}

const literalForm = computed(() => `/${props.pattern}/${props.flags}`);
const shownMatches = computed(() => evaluation.value.matches.slice(0, 50));
</script>

<template>
    <v-card
        class="mb-regex-builder"
        role="dialog"
        :aria-label="tx('regexBuilder.title', 'Regular expression builder')"
    >
        <v-toolbar density="compact" color="surface" flat>
            <v-toolbar-title class="text-subtitle-2">
                {{ tx("markerRegex.title", "Regular expression builder") }}
            </v-toolbar-title>
            <v-btn
                :icon="mdiClose"
                variant="text"
                density="comfortable"
                :aria-label="tx('regexBuilder.close', 'Close the regular expression builder')"
                @click="emit('close')"
            />
        </v-toolbar>

        <v-card-text class="mb-regex-builder__body">
            <v-switch
                :model-value="mode === 'regex'"
                :label="tx('regexBuilder.modeRegex', 'Use a regular expression')"
                color="primary"
                density="compact"
                hide-details
                inset
                @update:model-value="setRegexMode($event === true)"
            />

            <p class="mb-regex-builder__note text-medium-emphasis">
                <template v-if="mode === 'text'">
                    {{
                        tx(
                            "markerRegex.plainNote",
                            "Plain text is the default. The query is matched as a literal, ignoring case, against each marker's id, label, player name and player uuid.",
                        )
                    }}
                </template>
                <template v-else>
                    {{
                        tx(
                            "markerRegex.regexNote",
                            "The pattern is tested against each marker's id, label, player name and player uuid. The g and y flags are dropped for that test because they would carry a lastIndex from one field to the next; they still apply to the preview below.",
                        )
                    }}
                </template>
            </p>

            <div ref="patternWrap">
                <v-textarea
                    :model-value="pattern"
                    :label="
                        mode === 'regex'
                            ? tx('regexBuilder.pattern', 'Pattern')
                            : tx('regexBuilder.query', 'Search text')
                    "
                    :error-messages="patternError ? [patternError] : []"
                    :maxlength="MAX_PATTERN_LENGTH"
                    variant="outlined"
                    density="compact"
                    rows="2"
                    auto-grow
                    autocapitalize="off"
                    autocomplete="off"
                    spellcheck="false"
                    hide-details="auto"
                    @keydown="stopUnlessEscape"
                    @update:model-value="emit('update:pattern', $event)"
                />
            </div>

            <div class="mb-regex-builder__row">
                <v-btn size="small" variant="tonal" @click="escapeSelection">
                    {{ tx("markerRegex.escape", "Escape as literal") }}
                </v-btn>
                <v-btn size="small" variant="text" :prepend-icon="mdiRestore" @click="reset">
                    {{ tx("markerRegex.resetButton", "Reset") }}
                </v-btn>
            </div>

            <fieldset class="mb-regex-builder__flags" :disabled="mode !== 'regex'">
                <legend class="text-caption text-medium-emphasis">
                    {{ tx("markerRegex.flags", "Flags") }}
                </legend>
                <div class="mb-regex-builder__flag-list">
                    <v-checkbox-btn
                        v-for="flag of SUPPORTED_FLAGS"
                        :key="flag"
                        :model-value="flagList.includes(flag)"
                        :label="flag + ' · ' + flagHints[flag]"
                        :disabled="mode !== 'regex'"
                        density="compact"
                        hide-details
                        @update:model-value="toggleFlag(flag, $event === true)"
                    />
                </div>
            </fieldset>

            <v-expansion-panels
                v-if="mode === 'regex'"
                variant="accordion"
                multiple
                class="mb-regex-builder__tokens"
            >
                <v-expansion-panel v-for="group of tokenGroups" :key="group.id" :title="group.title">
                    <v-expansion-panel-text>
                        <div class="mb-regex-builder__token-list">
                            <v-btn
                                v-for="tok of group.tokens"
                                :key="tok.label"
                                size="small"
                                variant="outlined"
                                class="mb-regex-builder__token"
                                :aria-label="
                                    tx('regexBuilder.insert', 'Insert') +
                                    ' ' +
                                    tok.label +
                                    ': ' +
                                    tok.hint
                                "
                                @click="insert(tok.before, tok.after)"
                            >
                                <span class="mb-regex-builder__token-label">{{ tok.label }}</span>
                                <span class="mb-regex-builder__token-hint">{{ tok.hint }}</span>
                            </v-btn>
                        </div>
                    </v-expansion-panel-text>
                </v-expansion-panel>
            </v-expansion-panels>
            <p v-else class="mb-regex-builder__note text-medium-emphasis">
                {{
                    tx(
                        "markerRegex.guidedHint",
                        "Switch on regular expressions to insert character classes, anchors, groups, alternation and quantifiers.",
                    )
                }}
            </p>

            <v-textarea
                v-model="sample"
                :label="tx('regexBuilder.sample', 'Sample text')"
                :maxlength="MAX_SAMPLE_LENGTH"
                :hint="
                    tx(
                        'regexBuilder.sampleHint',
                        'Starts from the labels currently in the list. Edit it freely; it is never saved or sent anywhere.',
                    )
                "
                variant="outlined"
                density="compact"
                rows="3"
                persistent-hint
                spellcheck="false"
                @keydown="stopUnlessEscape"
                @update:model-value="sampleEdited = true"
            />

            <v-alert
                v-if="patternError"
                type="error"
                variant="tonal"
                density="compact"
                class="mt-2"
            >
                {{ patternError }}
            </v-alert>

            <div v-else class="mb-regex-builder__results" aria-live="polite">
                <div class="mb-regex-builder__result-head">
                    <v-chip size="small" variant="tonal" :prepend-icon="mdiCheck">
                        {{
                            tx("markerRegex.matchCount", "{count} matches in the sample", {
                                count: evaluation.matches.length,
                            })
                        }}
                    </v-chip>
                    <span v-if="evaluation.truncated" class="text-caption text-warning">
                        {{
                            tx("markerRegex.truncated", "Stopped after {max} matches.", {
                                max: MAX_MATCHES,
                            })
                        }}
                    </span>
                    <span v-if="evaluation.timedOut" class="text-caption text-warning">
                        {{
                            tx("markerRegex.timedOut", "Stopped after {ms} ms.", { ms: MAX_EVAL_MS })
                        }}
                    </span>
                    <span v-if="evaluation.sampleTruncated" class="text-caption text-warning">
                        {{
                            tx("markerRegex.sampleTruncated", "Sample cut to {max} characters.", {
                                max: MAX_SAMPLE_LENGTH,
                            })
                        }}
                    </span>
                </div>

                <ul v-if="shownMatches.length" class="mb-regex-builder__match-list">
                    <li v-for="(match, index) of shownMatches" :key="index">
                        <code>{{
                            match.text === ""
                                ? tx("markerRegex.emptyMatch", "(empty match)")
                                : match.text
                        }}</code>
                        <span class="text-caption text-medium-emphasis">
                            {{ tx("markerRegex.atIndex", "at {index}", { index: match.index }) }}
                        </span>
                        <span
                            v-for="group of match.groups"
                            :key="group.name"
                            class="text-caption text-medium-emphasis"
                        >
                            {{ group.name }}={{
                                group.value ?? tx("markerRegex.unset", "(unset)")
                            }}
                        </span>
                    </li>
                </ul>
                <p v-else class="text-caption text-medium-emphasis">
                    {{ tx("markerRegex.noMatches", "Nothing in the sample matches.") }}
                </p>
            </div>

            <p class="mb-regex-builder__engine text-caption text-medium-emphasis">
                {{
                    tx(
                        "markerRegex.engine",
                        "Engine: ECMAScript RegExp, run by this browser, the same engine the marker search uses. Escaping follows JavaScript regular-expression rules. Limits: pattern {pattern} characters, sample {sample} characters, {matches} matches, {ms} ms per preview run.",
                        {
                            pattern: MAX_PATTERN_LENGTH,
                            sample: MAX_SAMPLE_LENGTH,
                            matches: MAX_MATCHES,
                            ms: MAX_EVAL_MS,
                        },
                    )
                }}
            </p>
        </v-card-text>

        <v-card-actions class="mb-regex-builder__actions">
            <v-btn size="small" variant="text" :prepend-icon="mdiContentCopy" @click="copy(pattern)">
                {{ tx("markerRegex.copyPattern", "Copy pattern") }}
            </v-btn>
            <v-btn
                size="small"
                variant="text"
                :prepend-icon="mdiContentCopy"
                @click="copy(literalForm)"
            >
                {{ tx("markerRegex.copyLiteral", "Copy /pattern/flags") }}
            </v-btn>
            <v-btn size="small" variant="text" :prepend-icon="mdiDownload" @click="exportJson">
                {{ tx("markerRegex.exportJson", "Export JSON") }}
            </v-btn>
            <v-btn size="small" variant="text" :prepend-icon="mdiDownload" @click="exportText">
                {{ tx("markerRegex.exportText", "Export text") }}
            </v-btn>
        </v-card-actions>

        <div class="mb-regex-builder__notice text-caption" role="status" aria-live="polite">
            {{ notice }}
        </div>
    </v-card>
</template>

<style scoped>
.mb-regex-builder {
    width: min(30rem, calc(100vw - 2rem));
    display: flex;
    flex-direction: column;
    max-height: min(80vh, 40rem);
}

.mb-regex-builder__body {
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
}

.mb-regex-builder__row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
}

.mb-regex-builder__note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.4;
}

.mb-regex-builder__flags {
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    border-radius: 0.5rem;
    padding: 0.25rem 0.75rem 0.5rem;
    min-width: 0;
}

.mb-regex-builder__flag-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    gap: 0 0.75rem;
}

.mb-regex-builder__token-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
}

.mb-regex-builder__token {
    height: auto;
    min-height: 2.75rem;
    padding: 0.25rem 0.625rem;
    text-transform: none;
    letter-spacing: normal;
}

.mb-regex-builder__token :deep(.v-btn__content) {
    flex-direction: column;
    align-items: flex-start;
    row-gap: 0.125rem;
}

.mb-regex-builder__token-label {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.8125rem;
}

.mb-regex-builder__token-hint {
    font-size: 0.6875rem;
    opacity: 0.75;
    white-space: normal;
    text-align: left;
}

.mb-regex-builder__results {
    border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    padding-top: 0.5rem;
}

.mb-regex-builder__result-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
}

.mb-regex-builder__match-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    max-height: 10rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.mb-regex-builder__match-list li {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: baseline;
}

.mb-regex-builder__match-list code {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    background: rgba(var(--v-theme-on-surface), 0.08);
    border-radius: 0.25rem;
    padding: 0 0.25rem;
    word-break: break-all;
}

.mb-regex-builder__engine {
    margin: 0;
    line-height: 1.4;
}

.mb-regex-builder__actions {
    flex-wrap: wrap;
    row-gap: 0.25rem;
}

.mb-regex-builder__notice {
    padding: 0 1rem 0.5rem;
    min-height: 1.25rem;
}

.mb-regex-builder :deep(.v-btn:focus-visible),
.mb-regex-builder :deep(.v-expansion-panel-title:focus-visible) {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .mb-regex-builder :deep(*) {
        transition-duration: 0.01ms !important;
        animation-duration: 0.01ms !important;
    }
}
</style>
