/**
 * The regex builder itself.
 *
 * One builder belongs to one search field. It reads and writes that field's own model, so the
 * pattern, the flags, the validation state and the plain-text-or-regex mode stay in step in both
 * directions, and a builder opened from one field can never write into another.
 *
 * Everything the builder evaluates goes through the bounded worker. Nothing is sent anywhere,
 * nothing is logged, and nothing but the search mode and flags is stored.
 */

import { AnchoredPanel } from "./anchoredPanel.js";
import { clearChildren, el, localisedLabel, uniqueId } from "./dom.js";
import { REGEX_LIMITS, SUPPORTED_FLAGS } from "./engine.js";
import type { RegexMatch, SupportedFlag } from "./engine.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import type { SearchQueryModel, SearchQuerySnapshot } from "./queryModel.js";
import { label, onSearchLocaleChange, phrase, secondaryPhrase } from "./strings.js";
import type { SearchStringKey } from "./strings.js";

interface TokenSpec {
    readonly id: string;
    readonly code: string;
    readonly labelKey: SearchStringKey;
    readonly insert: string;
    /** Offset from the insertion point where the selection should start. */
    readonly selectStart?: number;
    readonly selectLength?: number;
    /** Wrap the current selection instead of replacing it. */
    readonly wrap?: { readonly prefix: string; readonly suffix: string; readonly fallback: string };
}

const TOKENS: readonly TokenSpec[] = [
    { id: "literal", code: "abc", labelKey: "tokenLiteral", insert: "abc", selectStart: 0, selectLength: 3 },
    { id: "any", code: ".", labelKey: "tokenAny", insert: "." },
    { id: "digit", code: "\\d", labelKey: "tokenDigit", insert: "\\d" },
    { id: "word", code: "\\w", labelKey: "tokenWord", insert: "\\w" },
    { id: "space", code: "\\s", labelKey: "tokenSpace", insert: "\\s" },
    { id: "class", code: "[abc]", labelKey: "tokenClass", insert: "[abc]", selectStart: 1, selectLength: 3 },
    {
        id: "negated",
        code: "[^abc]",
        labelKey: "tokenNegatedClass",
        insert: "[^abc]",
        selectStart: 2,
        selectLength: 3,
    },
    { id: "start", code: "^", labelKey: "tokenStart", insert: "^" },
    { id: "end", code: "$", labelKey: "tokenEnd", insert: "$" },
    { id: "boundary", code: "\\b", labelKey: "tokenWordBoundary", insert: "\\b" },
    {
        id: "group",
        code: "( )",
        labelKey: "tokenGroup",
        insert: "(pattern)",
        wrap: { prefix: "(", suffix: ")", fallback: "pattern" },
    },
    {
        id: "named",
        code: "(?<name> )",
        labelKey: "tokenNamedGroup",
        insert: "(?<name>pattern)",
        wrap: { prefix: "(?<name>", suffix: ")", fallback: "pattern" },
    },
    {
        id: "nonCapturing",
        code: "(?: )",
        labelKey: "tokenNonCapturing",
        insert: "(?:pattern)",
        wrap: { prefix: "(?:", suffix: ")", fallback: "pattern" },
    },
    { id: "alternation", code: "|", labelKey: "tokenAlternation", insert: "|" },
    { id: "zeroOrMore", code: "*", labelKey: "tokenZeroOrMore", insert: "*" },
    { id: "oneOrMore", code: "+", labelKey: "tokenOneOrMore", insert: "+" },
    { id: "optional", code: "?", labelKey: "tokenOptional", insert: "?" },
    { id: "range", code: "{1,3}", labelKey: "tokenRange", insert: "{1,3}", selectStart: 1, selectLength: 3 },
    { id: "lazy", code: "*?", labelKey: "tokenLazy", insert: "*?" },
];

const FLAG_LABELS: Record<SupportedFlag, SearchStringKey> = {
    d: "flagIndices",
    g: "flagGlobal",
    i: "flagIgnoreCase",
    m: "flagMultiline",
    s: "flagDotAll",
    u: "flagUnicode",
    v: "flagUnicodeSets",
    y: "flagSticky",
};

const DEFAULT_SAMPLE = "material-bluemap 0.1.0\nBuild 42 patterns\n砌 42 個規則";

export interface RegexBuilderOptions {
    readonly model: SearchQueryModel;
    readonly evaluator: BoundedRegexEvaluator;
    /** The visible name of the field this builder belongs to. Used in its accessible name. */
    readonly fieldLabel: string;
    readonly fieldLabelSource?: (() => string) | undefined;
    /** Optional real text from the surface being searched, used as the starting sample. */
    readonly sampleProvider?: (() => string) | undefined;
}

export interface RegexBuilderView {
    readonly element: HTMLElement;
    destroy(): void;
    focusPattern(): void;
}

export function createRegexBuilder(options: RegexBuilderOptions): RegexBuilderView {
    const { model, evaluator } = options;
    const fieldLabel = (): string => options.fieldLabelSource?.() ?? options.fieldLabel;
    const root = el("div", { class: "mbm-builder" });
    const patternId = uniqueId("mbm-pattern");
    const sampleId = uniqueId("mbm-sample");
    const patternNoteId = `${patternId}-note`;
    const statusId = uniqueId("mbm-builder-status");

    let sample = options.sampleProvider?.() ?? DEFAULT_SAMPLE;
    if (sample.length > REGEX_LIMITS.maxSampleLength) {
        sample = sample.slice(0, REGEX_LIMITS.maxSampleLength);
    }

    let patternInput!: HTMLInputElement;
    let sampleInput!: HTMLTextAreaElement;
    let statusLine!: HTMLElement;
    let errorLine!: HTMLElement;
    let riskLine!: HTMLElement;
    let previewBox!: HTMLElement;
    let matchList!: HTMLElement;
    let countPill!: HTMLElement;
    let regexToggle!: HTMLInputElement;
    let copyButton!: HTMLButtonElement;
    const flagInputs = new Map<SupportedFlag, HTMLInputElement>();

    let sequence = 0;
    let debounce: ReturnType<typeof setTimeout> | null = null;
    let copyResetTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleEvaluation(delay = 140): void {
        if (debounce !== null) {
            clearTimeout(debounce);
        }
        debounce = setTimeout(() => {
            debounce = null;
            void evaluate();
        }, delay);
    }

    async function evaluate(): Promise<void> {
        const snapshot = model.snapshot();
        sequence += 1;
        const token = sequence;

        if (snapshot.pattern === "") {
            setStatus("patternEmpty", "idle");
            clearError();
            countPill.textContent = "0";
            renderPreview([]);
            renderMatches([]);
            return;
        }
        if (snapshot.validation.status === "invalid") {
            setStatus("invalidPatternShort", "error");
            setError(
                phrase("invalidPattern", { message: snapshot.validation.message ?? "" }),
                secondaryPhrase("invalidPattern", { message: snapshot.validation.message ?? "" }),
            );
            countPill.textContent = "0";
            renderPreview([]);
            renderMatches([]);
            return;
        }

        setStatus("evaluating", "busy");
        const outcome = await evaluator.run(snapshot.pattern, snapshot.flags, sample);
        if (token !== sequence) {
            return;
        }

        if (outcome.status === "ok") {
            clearError();
            const matches = outcome.result.matches;
            countPill.textContent = String(matches.length);
            if (outcome.result.truncated) {
                setStatus("matchTruncated", "ok", { count: matches.length });
            } else if (matches.length === 0) {
                setStatus("matchNone", "ok");
            } else if (matches.length === 1) {
                setStatus("matchOne", "ok");
            } else {
                setStatus("matchMany", "ok", { count: matches.length });
            }
            renderPreview(matches);
            renderMatches(matches);
            return;
        }

        countPill.textContent = "0";
        renderPreview([]);
        renderMatches([]);
        if (outcome.status === "timeout") {
            setStatus("invalidPatternShort", "error");
            setError(
                phrase("timedOut", { ms: outcome.limitMs }),
                secondaryPhrase("timedOut", { ms: outcome.limitMs }),
            );
            return;
        }
        if (outcome.status === "limit") {
            setStatus("invalidPatternShort", "error");
            setError(
                phrase("limitExceeded", { message: outcome.message }),
                secondaryPhrase("limitExceeded", { message: outcome.message }),
            );
            return;
        }
        if (outcome.status === "invalid") {
            setStatus("invalidPatternShort", "error");
            setError(
                phrase("invalidPattern", { message: outcome.message }),
                secondaryPhrase("invalidPattern", { message: outcome.message }),
            );
            return;
        }
        setStatus("invalidPatternShort", "error");
        setError(outcome.message, null);
    }

    function setStatus(
        key: SearchStringKey,
        state: "idle" | "busy" | "ok" | "error",
        values: Readonly<Record<string, string | number>> = {},
    ): void {
        statusLine.dataset.state = state;
        clearChildren(statusLine);
        statusLine.append(
            el("span", { class: "mbm-status__dot", attrs: { "aria-hidden": "true" } }),
            localisedLabel(key, values),
        );
    }

    function setError(message: string, secondary: string | null): void {
        clearChildren(errorLine);
        errorLine.hidden = false;
        errorLine.append(el("span", { text: message }));
        if (secondary !== null) {
            errorLine.append(
                el("span", {
                    class: "mbm-label__secondary",
                    text: secondary,
                    attrs: { lang: "zh-HK" },
                }),
            );
        }
    }

    function clearError(): void {
        errorLine.hidden = true;
        clearChildren(errorLine);
    }

    function renderPreview(matches: readonly RegexMatch[]): void {
        clearChildren(previewBox);
        let cursor = 0;
        for (const match of matches) {
            if (match.index < cursor || match.end > sample.length) {
                continue;
            }
            if (match.index > cursor) {
                previewBox.append(document.createTextNode(sample.slice(cursor, match.index)));
            }
            if (match.index === match.end) {
                previewBox.append(
                    el("span", {
                        class: "mbm-zero-width",
                        text: "|",
                        attrs: { title: label("zeroWidthAt", { index: match.index }) },
                    }),
                );
            } else {
                previewBox.append(el("mark", { text: sample.slice(match.index, match.end) }));
            }
            cursor = match.end;
        }
        previewBox.append(document.createTextNode(sample.slice(cursor)));
    }

    function printable(value: string | null): string {
        return value === null || value === "" ? phrase("captureEmpty") : JSON.stringify(value);
    }

    function renderMatches(matches: readonly RegexMatch[]): void {
        clearChildren(matchList);
        if (matches.length === 0) {
            matchList.append(el("li", { class: "mbm-empty", text: phrase("matchNone") }));
            return;
        }
        matches.forEach((match, position) => {
            const item = el("li", { class: "mbm-match" });
            item.append(
                el("div", {
                    class: "mbm-match__summary",
                    children: [
                        el("code", { text: `#${position + 1} ${printable(match.value)}` }),
                        el("span", {
                            class: "mbm-match__position",
                            text: label("matchPosition", { start: match.index, end: match.end }),
                        }),
                    ],
                }),
            );

            const named = Object.entries(match.namedGroups);
            if (match.captures.length > 0 || named.length > 0) {
                const list = el("ul", { class: "mbm-captures" });
                match.captures.forEach((capture, order) => {
                    list.append(
                        el("li", {
                            children: [
                                el("span", {
                                    text: `${label("captureNumbered", { number: order + 1 })}: `,
                                }),
                                el("code", { text: printable(capture) }),
                            ],
                        }),
                    );
                });
                for (const [name, capture] of named) {
                    list.append(
                        el("li", {
                            children: [
                                el("span", { text: `${label("captureNamed", { name })}: ` }),
                                el("code", { text: printable(capture) }),
                            ],
                        }),
                    );
                }
                const details = el("details", { class: "mbm-match__captures" });
                details.append(el("summary", { text: phrase("capturesLabel") }), list);
                item.append(details);
            }
            matchList.append(item);
        });
    }

    function insertToken(spec: TokenSpec): void {
        const start = patternInput.selectionStart ?? patternInput.value.length;
        const end = patternInput.selectionEnd ?? start;
        const selected = patternInput.value.slice(start, end);
        let insertion: string;
        let selectionStart: number;
        let selectionEnd: number;

        if (spec.wrap !== undefined) {
            const content = selected === "" ? spec.wrap.fallback : selected;
            insertion = `${spec.wrap.prefix}${content}${spec.wrap.suffix}`;
            selectionStart = start + spec.wrap.prefix.length;
            selectionEnd = selectionStart + content.length;
        } else {
            insertion = spec.insert;
            selectionStart = start + (spec.selectStart ?? insertion.length);
            selectionEnd = selectionStart + (spec.selectLength ?? 0);
        }

        const next = `${patternInput.value.slice(0, start)}${insertion}${patternInput.value.slice(end)}`;
        if (next.length > REGEX_LIMITS.maxPatternLength) {
            return;
        }
        patternInput.value = next;
        model.setPattern(next);
        patternInput.focus();
        patternInput.setSelectionRange(selectionStart, selectionEnd);
    }

    async function copyPattern(): Promise<void> {
        const text = model.toLiteral();
        let copied = false;
        try {
            await navigator.clipboard.writeText(text);
            copied = true;
        } catch {
            const helper = el("textarea", { class: "mbm-visually-hidden" });
            helper.value = text;
            helper.readOnly = true;
            document.body.append(helper);
            helper.select();
            try {
                copied = document.execCommand("copy");
            } catch {
                copied = false;
            }
            helper.remove();
        }
        clearChildren(copyButton);
        copyButton.append(localisedLabel(copied ? "copied" : "copyFailed"));
        if (copyResetTimer !== null) {
            clearTimeout(copyResetTimer);
        }
        copyResetTimer = setTimeout(() => {
            clearChildren(copyButton);
            copyButton.append(localisedLabel("copyPattern"));
        }, 2000);
    }

    function exportPattern(): void {
        const snapshot = model.snapshot();
        const payload = JSON.stringify(
            {
                engine: "ECMAScript RegExp",
                pattern: snapshot.pattern,
                flags: snapshot.flags,
                literal: model.toLiteral(),
                mode: snapshot.mode,
            },
            null,
            4,
        );
        const blob = new Blob([payload], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = el("a", { attrs: { href: url, download: phrase("exportedFile") } });
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function syncFromModel(snapshot: SearchQuerySnapshot): void {
        if (patternInput.value !== snapshot.pattern) {
            patternInput.value = snapshot.pattern;
        }
        for (const [flag, input] of flagInputs) {
            input.checked = snapshot.flags.includes(flag);
        }
        regexToggle.checked = snapshot.mode === "regex";
        patternInput.setAttribute(
            "aria-invalid",
            snapshot.validation.status === "invalid" ? "true" : "false",
        );

        riskLine.hidden = snapshot.validation.risk === null;
        if (snapshot.validation.risk !== null) {
            clearChildren(riskLine);
            riskLine.append(
                localisedLabel(
                    snapshot.validation.risk === "nested-quantifier"
                        ? "riskNestedQuantifier"
                        : "riskAlternationLoop",
                ),
            );
        }
        scheduleEvaluation();
    }

    function render(): void {
        clearChildren(root);
        flagInputs.clear();

        // Header
        const header = el("header", { class: "mbm-builder__header" });
        header.append(
            el("div", {
                class: "mbm-builder__title",
                children: [
                    el("h2", { class: "mbm-builder__heading", text: phrase("builderTitle") }),
                    el("p", {
                        class: "mbm-builder__anchor-note",
                        text: label("builderAnchoredNote", { field: fieldLabel() }),
                    }),
                ],
            }),
        );
        countPill = el("span", {
            class: "mbm-pill",
            text: "0",
            attrs: { "aria-hidden": "true" },
        });
        header.append(countPill);
        root.append(header);

        // Engine statement
        root.append(
            el("p", {
                class: "mbm-builder__engine",
                children: [
                    el("strong", { text: `${phrase("engineHeading")}: ` }),
                    el("span", { text: phrase("engineValue") }),
                    el("span", { class: "mbm-builder__escaping", text: ` ${phrase("engineEscaping")}` }),
                ],
            }),
        );

        // Pattern
        const patternSection = el("section", { class: "mbm-builder__section" });
        patternSection.append(
            el("label", {
                class: "mbm-field-label",
                attrs: { for: patternId },
                children: [localisedLabel("patternLabel")],
            }),
        );
        patternInput = el("input", {
            class: "mbm-input mbm-input--code",
            attrs: {
                id: patternId,
                type: "text",
                spellcheck: "false",
                autocomplete: "off",
                autocapitalize: "off",
                autocorrect: "off",
                maxlength: REGEX_LIMITS.maxPatternLength,
                "aria-describedby": `${patternNoteId} ${statusId}`,
            },
        });
        patternInput.value = model.snapshot().pattern;
        patternInput.addEventListener("input", () => {
            model.setPattern(patternInput.value);
        });
        patternSection.append(
            el("div", { class: "mbm-pattern-row", children: [patternInput] }),
            el("p", {
                class: "mbm-hint",
                attrs: { id: patternNoteId },
                text: label("patternLimit", { max: REGEX_LIMITS.maxPatternLength }),
            }),
        );

        riskLine = el("p", { class: "mbm-risk", attrs: { role: "status" } });
        riskLine.hidden = true;
        patternSection.append(riskLine);

        // Regex opt in
        const toggleId = uniqueId("mbm-use-regex");
        regexToggle = el("input", {
            class: "mbm-switch__input",
            attrs: { type: "checkbox", id: toggleId },
        });
        regexToggle.checked = model.snapshot().mode === "regex";
        regexToggle.addEventListener("change", () => {
            model.setMode(regexToggle.checked ? "regex" : "text");
        });
        patternSection.append(
            el("div", {
                class: "mbm-switch",
                children: [
                    regexToggle,
                    el("label", {
                        class: "mbm-switch__label",
                        attrs: { for: toggleId },
                        children: [localisedLabel("builderUseRegex")],
                    }),
                    el("p", { class: "mbm-hint", text: label("builderUseRegexHint") }),
                ],
            }),
        );
        root.append(patternSection);

        // Flags
        const flagFieldset = el("fieldset", { class: "mbm-flags" });
        flagFieldset.append(el("legend", { text: label("flagsLegend") }));
        const flagList = el("div", { class: "mbm-flags__list" });
        const snapshot = model.snapshot();
        for (const flag of SUPPORTED_FLAGS) {
            const inputId = uniqueId(`mbm-flag-${flag}`);
            const input = el("input", {
                class: "mbm-flags__input",
                attrs: { type: "checkbox", id: inputId, value: flag },
            });
            input.checked = snapshot.flags.includes(flag);
            input.addEventListener("change", () => {
                model.setFlag(flag, input.checked);
            });
            flagInputs.set(flag, input);
            flagList.append(
                el("div", {
                    class: "mbm-flags__item",
                    children: [
                        input,
                        el("label", {
                            class: "mbm-flags__label",
                            attrs: { for: inputId },
                            children: [
                                el("code", { text: flag }),
                                localisedLabel(FLAG_LABELS[flag]),
                            ],
                        }),
                    ],
                }),
            );
        }
        flagFieldset.append(flagList);
        root.append(flagFieldset);

        // Guided constructs
        const guided = el("section", { class: "mbm-builder__section" });
        guided.append(
            el("div", {
                class: "mbm-subhead",
                children: [
                    el("h3", { text: phrase("guidedHeading") }),
                    el("span", { class: "mbm-hint", text: label("guidedHint") }),
                ],
            }),
        );
        const grid = el("div", { class: "mbm-tokens" });
        for (const spec of TOKENS) {
            const button = el("button", {
                class: "mbm-token",
                attrs: { type: "button", title: label(spec.labelKey) },
                children: [
                    el("code", { text: spec.code }),
                    el("span", { class: "mbm-token__label", text: phrase(spec.labelKey) }),
                ],
            });
            button.addEventListener("click", () => insertToken(spec));
            grid.append(button);
        }
        guided.append(grid);
        root.append(guided);

        // Sample text
        const sampleSection = el("section", { class: "mbm-builder__section" });
        sampleSection.append(
            el("label", {
                class: "mbm-field-label",
                attrs: { for: sampleId },
                children: [localisedLabel("sampleLabel")],
            }),
        );
        sampleInput = el("textarea", {
            class: "mbm-input mbm-input--code mbm-textarea",
            attrs: {
                id: sampleId,
                rows: 6,
                spellcheck: "false",
                maxlength: REGEX_LIMITS.maxSampleLength,
            },
        });
        sampleInput.value = sample;
        sampleInput.addEventListener("input", () => {
            sample = sampleInput.value;
            scheduleEvaluation();
        });
        sampleSection.append(
            sampleInput,
            el("p", { class: "mbm-hint", text: label("sampleHelp") }),
            el("p", {
                class: "mbm-hint",
                text: label("sampleLimit", { max: REGEX_LIMITS.maxSampleLength }),
            }),
        );
        root.append(sampleSection);

        // Results
        const results = el("section", { class: "mbm-builder__section" });
        results.append(
            el("div", {
                class: "mbm-subhead",
                children: [
                    el("h3", { text: phrase("resultsHeading") }),
                    el("span", { class: "mbm-hint", text: label("previewHint") }),
                ],
            }),
        );
        statusLine = el("p", {
            class: "mbm-status",
            attrs: { id: statusId, role: "status", "aria-live": "polite" },
        });
        errorLine = el("p", { class: "mbm-error", attrs: { role: "alert" } });
        errorLine.hidden = true;
        previewBox = el("div", {
            class: "mbm-preview",
            attrs: { tabindex: "0", role: "group", "aria-label": label("previewLabel") },
        });
        matchList = el("ol", { class: "mbm-matches" });
        results.append(statusLine, errorLine, previewBox, matchList);
        root.append(results);

        // Actions
        copyButton = el("button", {
            class: "mbm-button mbm-button--filled",
            attrs: { type: "button" },
            children: [localisedLabel("copyPattern")],
        });
        copyButton.addEventListener("click", () => void copyPattern());

        const exportButton = el("button", {
            class: "mbm-button",
            attrs: { type: "button" },
            children: [localisedLabel("exportPattern")],
        });
        exportButton.addEventListener("click", exportPattern);

        const resetButton = el("button", {
            class: "mbm-button",
            attrs: { type: "button" },
            children: [localisedLabel("resetBuilder")],
        });
        resetButton.addEventListener("click", () => {
            model.reset();
            sample = options.sampleProvider?.() ?? DEFAULT_SAMPLE;
            sampleInput.value = sample;
            patternInput.value = "";
            scheduleEvaluation(0);
            patternInput.focus();
        });

        root.append(
            el("div", {
                class: "mbm-actions",
                children: [copyButton, exportButton, resetButton],
            }),
        );

        // Safety
        root.append(
            el("section", {
                class: "mbm-safety",
                children: [
                    el("h3", { text: phrase("safetyHeading") }),
                    el("p", { text: label("safetyCopy", { ms: evaluator.limitMs }) }),
                    el("dl", {
                        class: "mbm-safety__list",
                        children: [
                            el("dt", { text: phrase("limitsHeading") }),
                            el("dd", {
                                text: label("limitsValue", {
                                    pattern: REGEX_LIMITS.maxPatternLength,
                                    sample: REGEX_LIMITS.maxSampleLength,
                                    matches: REGEX_LIMITS.maxMatches,
                                }),
                            }),
                            el("dt", { text: phrase("storageHeading") }),
                            el("dd", { text: label("storageValue") }),
                        ],
                    }),
                ],
            }),
        );

        syncFromModel(model.snapshot());
    }

    render();

    const unsubscribeModel = model.subscribe((snapshot) => syncFromModel(snapshot));
    const unsubscribeLocale = onSearchLocaleChange(() => render());

    return {
        element: root,
        destroy() {
            unsubscribeModel();
            unsubscribeLocale();
            if (debounce !== null) {
                clearTimeout(debounce);
            }
            if (copyResetTimer !== null) {
                clearTimeout(copyResetTimer);
            }
        },
        focusPattern() {
            patternInput.focus();
            patternInput.select();
        },
    };
}

/**
 * Bind a builder to an anchor, so a field can open its own builder and nothing else. Each call
 * makes a separate panel and a separate builder bound to the model it was given.
 */
export function createBuilderController(
    options: RegexBuilderOptions & {
        readonly anchor: HTMLElement;
        readonly returnFocusTo: HTMLElement;
    },
): { toggle(): void; close(): void; destroy(): void; isOpen(): boolean } {
    const fieldLabel = (): string => options.fieldLabelSource?.() ?? options.fieldLabel;
    let view: RegexBuilderView | null = null;
    const panel = new AnchoredPanel({
        anchor: options.anchor,
        returnFocusTo: options.returnFocusTo,
        title: label("builderOpenLabel", { field: fieldLabel() }),
        onClose: () => {
            view?.destroy();
            view = null;
        },
    });
    const unsubscribeLocale = onSearchLocaleChange(() => {
        panel.element.setAttribute("aria-label", label("builderOpenLabel", { field: fieldLabel() }));
    });

    return {
        isOpen: () => panel.isOpen,
        toggle() {
            if (panel.isOpen) {
                panel.close();
                return;
            }
            view = createRegexBuilder(options);
            panel.show(view.element);
        },
        close() {
            panel.close();
        },
        destroy() {
            view?.destroy();
            view = null;
            unsubscribeLocale();
            panel.destroy();
        },
    };
}
