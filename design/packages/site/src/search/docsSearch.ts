/**
 * Documentation search: article titles and article body text, with its own anchored builder.
 *
 * Body text is searched, so a result says which part matched and shows the surrounding sentence
 * rather than only the title. Opening a body result carries the match offset back to the host, so
 * the article can scroll to the place the visitor actually searched for.
 */

import type { DocsSearchHost, SearchableArticle } from "./contract.js";
import { el } from "./dom.js";
import type { BoundedRegexEvaluator } from "./evaluator.js";
import { excerptAround } from "./predicate.js";
import type { CandidateField } from "./runSearch.js";
import { createSearchSurface, highlightedText, metaChip } from "./searchSurface.js";
import type { SearchSurfaceView } from "./searchSurface.js";
import { label, phrase } from "./strings.js";

type ArticleField = "title" | "body";

const ARTICLE_FIELDS: readonly CandidateField<SearchableArticle, ArticleField>[] = [
    { name: "title", get: (article) => article.title },
    { name: "body", get: (article) => article.body },
];

export interface DocsSearchOptions {
    readonly host: DocsSearchHost;
    readonly fieldId?: string;
    readonly evaluator?: BoundedRegexEvaluator | undefined;
}

export function createDocsSearch(
    options: DocsSearchOptions,
): SearchSurfaceView<SearchableArticle, ArticleField> {
    const host = options.host;

    return createSearchSurface<SearchableArticle, ArticleField>({
        fieldId: options.fieldId ?? "docs",
        labelText: label("docsFieldLabel"),
        placeholder: phrase("docsPlaceholder"),
        resultsLabel: label("docsFieldLabel"),
        fields: ARTICLE_FIELDS,
        items: () => host.listArticles(),
        subscribe: (listener) => host.subscribe(listener),
        evaluator: options.evaluator,
        renderResult: ({ item, hit }) => {
            const button = el("button", {
                class: "mbm-result",
                attrs: { type: "button", "aria-label": label("docsOpen", { title: item.title }) },
            });

            const titleSpan =
                hit !== null && hit.field === "title"
                    ? highlightedText(item.title, hit.span, "mbm-result__title")
                    : el("span", { class: "mbm-result__title", text: item.title });
            button.append(titleSpan);

            const meta = el("div", { class: "mbm-result__meta" });
            if (item.sectionLabel !== undefined) {
                meta.append(metaChip(phrase("docsResultIn", { section: item.sectionLabel })));
            }
            if (hit !== null) {
                meta.append(
                    metaChip(hit.field === "title" ? phrase("docsTitleHit") : phrase("docsBodyHit")),
                );
            }
            if (meta.childElementCount > 0) {
                button.append(meta);
            }

            if (hit !== null && hit.field === "body") {
                const excerpt = excerptAround(hit.value, hit.span);
                const line = el("span", { class: "mbm-result__excerpt" });
                if (excerpt.truncatedStart) {
                    line.append(document.createTextNode("... "));
                }
                line.append(highlightedText(excerpt.text, excerpt.span, "mbm-result__excerpt-text"));
                if (excerpt.truncatedEnd) {
                    line.append(document.createTextNode(" ..."));
                }
                button.append(line);
            }

            button.addEventListener("click", () => {
                if (hit !== null && hit.field === "body" && hit.span !== null) {
                    host.openArticle(item.id, hit.span.start);
                } else {
                    host.openArticle(item.id);
                }
            });

            return button;
        },
    });
}

/** Mount the documentation search into a container. */
export function mountDocsSearch(
    container: HTMLElement,
    options: DocsSearchOptions,
): SearchSurfaceView<SearchableArticle, ArticleField> {
    const view = createDocsSearch(options);
    container.append(view.element);
    return view;
}
