/**
 * One search bar, with its own builder anchored to it.
 *
 * Every search surface on the site is built from this. Each call creates a separate model, a
 * separate builder and a separate panel, so two fields on the same page share no state at all:
 * typing in one cannot move the other's pattern, flags or mode.
 *
 * Plain text is the default. The Regex control is the deliberate opt in, and it is mirrored by the
 * switch inside the builder, so either one flips the other.
 */

import { createBuilderController } from "./builderPanel.js";
import { el, localisedLabel, uniqueId } from "./dom.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import { sharedRegexEvaluator } from "./evaluator.js";
import { searchPreferenceStore } from "./preferences.js";
import type { SearchPreferenceStore } from "./preferences.js";
import { SearchQueryModel } from "./queryModel.js";
import type { SearchQuerySnapshot } from "./queryModel.js";
import { label, onSearchLocaleChange, phrase } from "./strings.js";

export interface SearchFieldOptions {
    /** Stable id. Also the preference key, so it must differ between fields. */
    readonly fieldId: string;
    /** The visible label. Search bars are labelled, never placeholder-only. */
    readonly labelText: string;
    readonly placeholder: string;
    /** Optional live providers for shell-owned language settings. */
    readonly labelTextSource?: (() => string) | undefined;
    readonly placeholderSource?: (() => string) | undefined;
    /** Called whenever the query, pattern, flags or mode change. */
    readonly onChange: (snapshot: SearchQuerySnapshot) => void;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
    /** Real text from the surface being searched, used as the builder's starting sample. */
    readonly sampleProvider?: (() => string) | undefined;
    readonly store?: SearchPreferenceStore | undefined;
    readonly persist?: boolean | undefined;
}

export interface SearchFieldView {
    readonly element: HTMLElement;
    readonly model: SearchQueryModel;
    /** Replace the result summary announced to screen readers and shown under the field. */
    setStatus(text: string, secondary?: string | null): void;
    focus(): void;
    destroy(): void;
}

export function createSearchField(options: SearchFieldOptions): SearchFieldView {
    const evaluator = options.evaluator ?? sharedRegexEvaluator();
    const store = options.store ?? searchPreferenceStore();
    const persist = options.persist ?? true;
    const model = new SearchQueryModel({
        fieldId: options.fieldId,
        store,
        persist,
    });

    const inputId = uniqueId("mbm-search");
    const statusId = `${inputId}-status`;
    const optionsId = `${inputId}-options`;
    const hintId = `${inputId}-hint`;

    const root = el("div", { class: "mbm-search" });

    const currentLabel = (): string => options.labelTextSource?.() ?? options.labelText;
    const currentPlaceholder = (): string => options.placeholderSource?.() ?? options.placeholder;

    const labelEl = el("label", {
        class: "mbm-search__label",
        attrs: { for: inputId },
        text: currentLabel(),
    });

    const input = el("input", {
        class: "mbm-input mbm-search__input",
        attrs: {
            id: inputId,
            type: "search",
            placeholder: currentPlaceholder(),
            autocomplete: "off",
            spellcheck: "false",
            "aria-describedby": `${statusId} ${hintId}`,
        },
    });

    const clearButton = el("button", {
        class: "mbm-icon-button mbm-search__clear",
        attrs: { type: "button", "aria-label": label("clearSearch", { field: options.labelText }) },
        text: "✕",
    });

    const builderButton = el("button", {
        class: "mbm-icon-button mbm-search__builder",
        attrs: {
            type: "button",
            "aria-label": label("builderOpenLabel", { field: options.labelText }),
            title: label("builderOpenLabel", { field: options.labelText }),
        },
        text: ".*",
    });

    const row = el("div", {
        class: "mbm-search__row",
        children: [input, clearButton, builderButton],
    });

    // Search options, collapsed by default so the controls do not outweigh the results.
    const optionsToggle = el("button", {
        class: "mbm-search__options-toggle",
        attrs: { type: "button", "aria-controls": optionsId },
        children: [localisedLabel("searchModeLegend")],
    });

    const modeGroup = el("div", {
        class: "mbm-segmented",
        attrs: { role: "radiogroup", "aria-label": label("searchModeLegend") },
    });
    const textModeButton = el("button", {
        class: "mbm-segmented__option",
        attrs: { type: "button", role: "radio" },
        children: [localisedLabel("searchModeText")],
    });
    const regexModeButton = el("button", {
        class: "mbm-segmented__option",
        attrs: { type: "button", role: "radio" },
        children: [localisedLabel("searchModeRegex")],
    });
    modeGroup.append(textModeButton, regexModeButton);

    const caseId = `${inputId}-case`;
    const caseInput = el("input", {
        class: "mbm-check__input",
        attrs: { type: "checkbox", id: caseId },
    });
    const caseField = el("div", {
        class: "mbm-check",
        children: [
            caseInput,
            el("label", {
                class: "mbm-check__label",
                attrs: { for: caseId },
                children: [localisedLabel("matchCase")],
            }),
        ],
    });

    const optionsRow = el("div", {
        class: "mbm-search__options",
        attrs: { id: optionsId },
        children: [modeGroup, caseField],
    });

    const hint = el("p", {
        class: "mbm-hint",
        attrs: { id: hintId },
        text: label("searchModeTextHint"),
    });

    const status = el("p", {
        class: "mbm-search__status",
        attrs: { id: statusId, role: "status", "aria-live": "polite" },
        text: phrase("searchStatusIdle"),
    });

    root.append(labelEl, row, optionsToggle, optionsRow, hint, status);

    const builder = createBuilderController({
        model,
        evaluator,
        fieldLabel: options.labelText,
        fieldLabelSource: currentLabel,
        sampleProvider: options.sampleProvider,
        anchor: builderButton,
        returnFocusTo: input,
    });

    let optionsOpen = store.read(options.fieldId)?.optionsOpen ?? false;

    function applyOptionsState(): void {
        optionsToggle.setAttribute("aria-expanded", optionsOpen ? "true" : "false");
        optionsRow.hidden = !optionsOpen;
    }

    optionsToggle.addEventListener("click", () => {
        optionsOpen = !optionsOpen;
        applyOptionsState();
        if (persist) {
            store.write(options.fieldId, { optionsOpen });
        }
    });

    input.addEventListener("input", () => {
        model.setFieldValue(input.value);
    });

    clearButton.addEventListener("click", () => {
        model.clear();
        input.focus();
    });

    builderButton.addEventListener("click", () => {
        builder.toggle();
    });

    textModeButton.addEventListener("click", () => model.setMode("text"));
    regexModeButton.addEventListener("click", () => model.setMode("regex"));
    for (const button of [textModeButton, regexModeButton]) {
        button.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                event.preventDefault();
                model.setMode("regex");
                regexModeButton.focus();
            } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                event.preventDefault();
                model.setMode("text");
                textModeButton.focus();
            }
        });
    }

    caseInput.addEventListener("change", () => {
        model.setCaseSensitive(caseInput.checked);
    });

    function sync(snapshot: SearchQuerySnapshot): void {
        if (input.value !== snapshot.fieldValue) {
            input.value = snapshot.fieldValue;
        }
        const isRegex = snapshot.mode === "regex";
        textModeButton.setAttribute("aria-checked", isRegex ? "false" : "true");
        regexModeButton.setAttribute("aria-checked", isRegex ? "true" : "false");
        textModeButton.tabIndex = isRegex ? -1 : 0;
        regexModeButton.tabIndex = isRegex ? 0 : -1;
        textModeButton.classList.toggle("is-selected", !isRegex);
        regexModeButton.classList.toggle("is-selected", isRegex);
        root.dataset.mode = snapshot.mode;

        caseInput.checked = snapshot.caseSensitive;
        clearButton.hidden = snapshot.fieldValue === "";

        const invalid = snapshot.validation.status === "invalid";
        input.setAttribute("aria-invalid", invalid ? "true" : "false");
        root.classList.toggle("is-invalid", invalid);
        if (invalid) {
            setStatus(
                phrase("invalidPattern", { message: snapshot.validation.message ?? "" }),
                null,
            );
        }
        options.onChange(snapshot);
    }

    function setStatus(text: string, secondary: string | null = null): void {
        status.replaceChildren(el("span", { text }));
        if (secondary !== null) {
            status.append(
                el("span", {
                    class: "mbm-label__secondary",
                    text: secondary,
                    attrs: { lang: "zh-HK" },
                }),
            );
        }
    }

    const unsubscribeModel = model.subscribe(sync);
    const unsubscribeLocale = onSearchLocaleChange(() => {
        labelEl.textContent = currentLabel();
        input.placeholder = currentPlaceholder();
        hint.textContent = label("searchModeTextHint");
        clearButton.setAttribute("aria-label", label("clearSearch", { field: currentLabel() }));
        builderButton.setAttribute(
            "aria-label",
            label("builderOpenLabel", { field: currentLabel() }),
        );
        builderButton.title = label("builderOpenLabel", { field: currentLabel() });
        modeGroup.setAttribute("aria-label", label("searchModeLegend"));
    });

    applyOptionsState();
    sync(model.snapshot());

    return {
        element: root,
        model,
        setStatus,
        focus() {
            input.focus();
        },
        destroy() {
            unsubscribeModel();
            unsubscribeLocale();
            builder.destroy();
        },
    };
}
