/**
 * Give an existing input its own anchored regex builder.
 *
 * `createSearchField` builds a whole search bar. This is the other half of the integration
 * contract, for a field another module has already built and owns: the tab strip's search box, a
 * settings filter, either bulk-close input. One call adds the builder affordance beside that exact
 * input, binds a model to it in both directions, and reports the resulting query, mode, flags and
 * validation back through `onChange`.
 *
 * Each call creates its own model, its own panel and its own builder, bound to the one input it
 * was given. Attaching to four fields makes four builders, which is the point: a builder always
 * belongs to the field the visitor is typing in, never to whichever field was touched last.
 *
 * The reported mode is named `plain` and `regex` here, because that is the vocabulary the tab
 * matcher already uses. Internally the same value is `text` and `regex`; the two names mean the
 * same thing and the translation happens in this file so neither side has to care.
 */

import { createBuilderController } from "./builderPanel.js";
import { el } from "./dom.js";
import { sharedRegexEvaluator } from "./evaluator.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import type { SearchPreferenceStore } from "./preferences.js";
import { SearchQueryModel } from "./queryModel.js";
import type { SearchQuerySnapshot } from "./queryModel.js";
import { label, onSearchLocaleChange } from "./strings.js";

export type AttachedMode = "plain" | "regex";

/** Everything the owning field needs to run its own search. */
export interface AttachedSpec {
    /** The literal in plain mode, the pattern source in regex mode. */
    readonly query: string;
    readonly mode: AttachedMode;
    readonly caseSensitive: boolean;
    /** The flags the builder is showing. Plain mode uses only the case sensitivity. */
    readonly flags: string;
    /** False when the pattern will not compile. Nothing should be searched while it is false. */
    readonly valid: boolean;
    /** The engine's own message when the pattern is invalid, otherwise `null`. */
    readonly message: string | null;
}

export interface AttachRegexBuilderOptions {
    /** Stable id. Also the preference key, so it must differ between fields. */
    readonly fieldId: string;
    /** The visible name of the field, used in the builder's accessible name. */
    readonly fieldLabel: string;
    readonly onChange?: ((spec: AttachedSpec) => void) | undefined;
    /** Where the builder button goes. Defaults to the input's own parent, right after it. */
    readonly container?: HTMLElement | undefined;
    /** Real text from the surface being searched, used as the builder's starting sample. */
    readonly sampleProvider?: (() => string) | undefined;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
    readonly store?: SearchPreferenceStore | undefined;
    readonly persist?: boolean | undefined;
}

export interface AttachedBuilder {
    readonly model: SearchQueryModel;
    /** The affordance that opens the builder. Already in the DOM beside the field. */
    readonly button: HTMLButtonElement;
    spec(): AttachedSpec;
    setMode(mode: AttachedMode): void;
    open(): void;
    close(): void;
    destroy(): void;
}

/** Translate a model snapshot into the shape an owning field consumes. */
export function specFromSnapshot(snapshot: SearchQuerySnapshot): AttachedSpec {
    return {
        query: snapshot.fieldValue,
        mode: snapshot.mode === "regex" ? "regex" : "plain",
        caseSensitive: snapshot.caseSensitive,
        flags: snapshot.flags,
        valid: snapshot.validation.status !== "invalid",
        message: snapshot.validation.message,
    };
}

export function attachRegexBuilder(
    input: HTMLInputElement,
    options: AttachRegexBuilderOptions,
): AttachedBuilder {
    const model = new SearchQueryModel({
        fieldId: options.fieldId,
        store: options.store,
        persist: options.persist ?? true,
        initialQuery: input.value,
    });

    const button = el("button", {
        class: "mbm-icon-button mbm-search__builder",
        attrs: {
            type: "button",
            "aria-label": label("builderOpenLabel", { field: options.fieldLabel }),
            title: label("builderOpenLabel", { field: options.fieldLabel }),
        },
        text: ".*",
    });

    if (options.container !== undefined) {
        options.container.append(button);
    } else if (input.parentElement !== null) {
        input.parentElement.insertBefore(button, input.nextSibling);
    }

    const builder = createBuilderController({
        model,
        evaluator: options.evaluator ?? sharedRegexEvaluator(),
        fieldLabel: options.fieldLabel,
        sampleProvider: options.sampleProvider,
        anchor: button,
        returnFocusTo: input,
    });

    button.addEventListener("click", () => builder.toggle());

    const onInput = (): void => {
        model.setFieldValue(input.value);
    };
    input.addEventListener("input", onInput);

    const unsubscribeModel = model.subscribe((snapshot) => {
        if (input.value !== snapshot.fieldValue) {
            input.value = snapshot.fieldValue;
        }
        input.setAttribute(
            "aria-invalid",
            snapshot.validation.status === "invalid" ? "true" : "false",
        );
        options.onChange?.(specFromSnapshot(snapshot));
    });

    const unsubscribeLocale = onSearchLocaleChange(() => {
        const name = label("builderOpenLabel", { field: options.fieldLabel });
        button.setAttribute("aria-label", name);
        button.setAttribute("title", name);
    });

    return {
        model,
        button,
        spec: () => specFromSnapshot(model.snapshot()),
        setMode(mode) {
            model.setMode(mode === "regex" ? "regex" : "text");
        },
        open() {
            if (!builder.isOpen()) {
                builder.toggle();
            }
        },
        close() {
            builder.close();
        },
        destroy() {
            input.removeEventListener("input", onInput);
            unsubscribeModel();
            unsubscribeLocale();
            builder.destroy();
            button.remove();
        },
    };
}
