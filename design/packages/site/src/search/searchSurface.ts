/**
 * The shared shape of a search surface: one field, one results list, one honest status line.
 *
 * Documentation, settings and all four tab searches are built from this, which is what keeps them
 * consistent and keeps their state apart. Each surface makes its own field, and therefore its own
 * model and its own builder.
 *
 * An empty query lists everything rather than nothing, an invalid pattern lists nothing and says
 * why, and a timeout says that the evaluation was stopped. None of those three states is allowed
 * to look like "no results".
 */

import { clearChildren, el, uniqueId } from "./dom.js";
import { sharedRegexEvaluator } from "./evaluator.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import { toHighlightRuns } from "./predicate.js";
import type { MatchSpan } from "./predicate.js";
import type { SearchQuerySnapshot } from "./queryModel.js";
import { buildCandidateIndex, resolveHits, runSearch } from "./runSearch.js";
import type { CandidateField, ResolvedHit } from "./runSearch.js";
import { createSearchField } from "./searchField.js";
import type { SearchFieldView } from "./searchField.js";
import { label, onSearchLocaleChange, phrase, secondaryPhrase } from "./strings.js";

export interface SurfaceResult<TItem, TField extends string> {
    readonly item: TItem;
    /** `null` when there is no query and the item is simply being listed. */
    readonly hit: ResolvedHit<TField> | null;
}

export interface SearchSurfaceOptions<TItem, TField extends string> {
    readonly fieldId: string;
    readonly labelText: string;
    readonly placeholder: string;
    readonly labelTextSource?: (() => string) | undefined;
    readonly placeholderSource?: (() => string) | undefined;
    /** The accessible name of the results list. */
    readonly resultsLabel: string;
    readonly fields: readonly CandidateField<TItem, TField>[];
    readonly items: () => readonly TItem[];
    readonly renderResult: (result: SurfaceResult<TItem, TField>) => HTMLElement;
    /** Subscribe to the host so the surface re-runs when the underlying data changes. */
    readonly subscribe?: ((listener: () => void) => () => void) | undefined;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
    /** Extra note rendered under the field, for scope statements the visitor needs. */
    readonly scopeNote?: string | undefined;
}

export interface SearchSurfaceView<TItem, TField extends string> {
    readonly element: HTMLElement;
    readonly field: SearchFieldView;
    /** The results as last rendered, so a caller can act on the same set the visitor sees. */
    currentResults(): readonly SurfaceResult<TItem, TField>[];
    refresh(): void;
    destroy(): void;
}

export function createSearchSurface<TItem, TField extends string>(
    options: SearchSurfaceOptions<TItem, TField>,
): SearchSurfaceView<TItem, TField> {
    const root = el("div", { class: "mbm-surface" });
    const listId = uniqueId("mbm-results");
    const list = el("ul", {
        class: "mbm-results",
        attrs: { id: listId, "aria-label": options.resultsLabel },
    });

    const fieldOrder = options.fields.map((entry) => entry.name);
    const evaluator = options.evaluator ?? sharedRegexEvaluator();
    let results: SurfaceResult<TItem, TField>[] = [];
    let sequence = 0;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const field = createSearchField({
        fieldId: options.fieldId,
        labelText: options.labelText,
        placeholder: options.placeholder,
        labelTextSource: options.labelTextSource,
        placeholderSource: options.placeholderSource,
        evaluator,
        sampleProvider: () =>
            options
                .items()
                .slice(0, 20)
                .map((item) => options.fields[0]?.get(item) ?? "")
                .filter((value) => value !== "")
                .join("\n"),
        onChange: () => schedule(),
    });

    root.append(field.element);
    if (options.scopeNote !== undefined) {
        root.append(el("p", { class: "mbm-hint mbm-surface__scope", text: options.scopeNote }));
    }
    root.append(list);

    function schedule(delay = 120): void {
        if (debounce !== null) {
            clearTimeout(debounce);
        }
        debounce = setTimeout(() => {
            debounce = null;
            void run();
        }, delay);
    }

    async function run(): Promise<void> {
        sequence += 1;
        const token = sequence;
        const snapshot: SearchQuerySnapshot = field.model.snapshot();
        const items = options.items();
        const query = field.model.effectiveQuery();

        if (query.kind === "empty") {
            results = items.map((item) => ({ item, hit: null }));
            render();
            field.setStatus(phrase("searchStatusIdle"), secondaryPhrase("searchStatusIdle"));
            return;
        }

        const index = buildCandidateIndex(items, options.fields);
        const outcome = await runSearch(query, index.values, evaluator);
        if (token !== sequence) {
            return;
        }

        switch (outcome.status) {
            case "all":
                results = items.map((item) => ({ item, hit: null }));
                render();
                field.setStatus(phrase("searchStatusIdle"), secondaryPhrase("searchStatusIdle"));
                return;
            case "ok": {
                const resolved = resolveHits(index, fieldOrder, outcome.hits);
                const collected: SurfaceResult<TItem, TField>[] = [];
                for (const hit of resolved) {
                    if (hit.itemIndex < 0 || hit.itemIndex >= items.length) {
                        continue;
                    }
                    collected.push({ item: items[hit.itemIndex] as TItem, hit });
                }
                results = collected;
                render();
                if (results.length === 0) {
                    field.setStatus(
                        phrase("searchStatusNone", { query: snapshot.fieldValue }),
                        secondaryPhrase("searchStatusNone", { query: snapshot.fieldValue }),
                    );
                } else {
                    field.setStatus(
                        phrase("searchStatusCount", {
                            count: results.length,
                            total: items.length,
                        }),
                        secondaryPhrase("searchStatusCount", {
                            count: results.length,
                            total: items.length,
                        }),
                    );
                }
                return;
            }
            case "invalid":
                results = [];
                render();
                field.setStatus(
                    phrase("searchStatusInvalid"),
                    secondaryPhrase("searchStatusInvalid"),
                );
                return;
            case "timeout":
                results = [];
                render();
                field.setStatus(
                    phrase("timedOut", { ms: outcome.limitMs }),
                    secondaryPhrase("timedOut", { ms: outcome.limitMs }),
                );
                return;
            case "limit":
                results = [];
                render();
                field.setStatus(
                    phrase("limitExceeded", { message: outcome.message }),
                    secondaryPhrase("limitExceeded", { message: outcome.message }),
                );
                return;
            default:
                results = [];
                render();
                field.setStatus(outcome.message, null);
        }
    }

    function render(): void {
        clearChildren(list);
        if (results.length === 0) {
            const snapshot = field.model.snapshot();
            const empty =
                snapshot.fieldValue === ""
                    ? phrase("searchStatusIdle")
                    : phrase("searchStatusNone", { query: snapshot.fieldValue });
            list.append(el("li", { class: "mbm-results__empty", text: empty }));
            return;
        }
        for (const result of results) {
            const item = el("li", { class: "mbm-results__item" });
            item.append(options.renderResult(result));
            list.append(item);
        }
    }

    const unsubscribe = options.subscribe?.(() => schedule(0)) ?? null;
    const unsubscribeLocale = onSearchLocaleChange(() => schedule(0));

    schedule(0);

    return {
        element: root,
        field,
        currentResults: () => results,
        refresh: () => schedule(0),
        destroy() {
            if (debounce !== null) {
                clearTimeout(debounce);
            }
            unsubscribe?.();
            unsubscribeLocale();
            field.destroy();
        },
    };
}

/** Highlighted text for a result row, built from runs rather than from any markup. */
export function highlightedText(
    value: string,
    span: MatchSpan | null,
    className = "mbm-result__text",
): HTMLElement {
    const wrapper = el("span", { class: className });
    const runs = toHighlightRuns(value, span === null ? [] : [span]);
    for (const run of runs) {
        wrapper.append(run.matched ? el("mark", { text: run.text }) : document.createTextNode(run.text));
    }
    return wrapper;
}

/** A small metadata chip, for pinned state, group name, strip name and so on. */
export function metaChip(text: string): HTMLElement {
    return el("span", { class: "mbm-chip", text });
}

/** The accessible name for a result action, in both languages when bilingual. */
export function actionLabel(
    key: Parameters<typeof label>[0],
    values: Readonly<Record<string, string | number>>,
): string {
    return label(key, values);
}
