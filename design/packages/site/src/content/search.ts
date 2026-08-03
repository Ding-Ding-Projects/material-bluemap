/**
 * Plain-text extraction and the documentation search index.
 *
 * The index is built from the same structured content the shell renders, so a search
 * result can never point at text that is not on the page. Extraction is deliberately
 * total: every block kind has a case, and adding a new one without handling it is a
 * type error rather than a silently unsearchable section.
 */

import type { Article, Block, Inline, InlineContent } from "./types.js";
import { articles } from "./articles/index.js";

/** One inline run as plain text. */
export function inlineToPlainText(inline: Inline): string {
    if (typeof inline === "string") return inline;
    if ("code" in inline) return inline.code;
    if ("strong" in inline) return inline.strong;
    if ("em" in inline) return inline.em;
    return inline.link;
}

/** A whole inline sequence as plain text. */
export function contentToPlainText(content: InlineContent): string {
    if (typeof content === "string") return content;
    if (Array.isArray(content)) {
        return (content as readonly Inline[]).map(inlineToPlainText).join("");
    }
    return inlineToPlainText(content as Inline);
}

/** A block as plain text, with its parts separated so words do not run together. */
export function blockToPlainText(block: Block): string {
    switch (block.kind) {
        case "paragraph":
            return contentToPlainText(block.content);
        case "list":
            return block.items.map(contentToPlainText).join(" ");
        case "table": {
            const header = block.columns.join(" ");
            const body = block.rows.map((row) => row.map(contentToPlainText).join(" ")).join(" ");
            return [block.caption, header, body].join(" ");
        }
        case "code":
            return [block.caption ?? "", block.code].join(" ");
        case "definitions":
            return block.items.map((item) => `${item.term} ${contentToPlainText(item.description)}`).join(" ");
        case "callout":
            return `${block.title} ${contentToPlainText(block.content)}`;
    }
}

/**
 * One searchable unit. Sections are indexed separately from their article so a result
 * can take the reader to the part that matched rather than to the top of a long page.
 */
export interface SearchDocument {
    /** Unique within the index. Article id, or article id and section id. */
    readonly id: string;
    readonly articleId: string;
    readonly sectionId: string | null;
    /** What to show as the result's heading. */
    readonly title: string;
    /** Where the result lives, for the second line of a result row. */
    readonly breadcrumb: string;
    /** The text that was matched against. Already lower-cased for comparison. */
    readonly haystack: string;
    /** The same text with original casing, for showing an excerpt. */
    readonly text: string;
}

function documentsForArticle(article: Article): SearchDocument[] {
    const summaryText = [article.title, article.summary, article.statusNote].join(" ");
    const documents: SearchDocument[] = [
        {
            id: article.id,
            articleId: article.id,
            sectionId: null,
            title: article.title,
            breadcrumb: "Documentation",
            haystack: summaryText.toLowerCase(),
            text: summaryText,
        },
    ];

    for (const section of article.sections) {
        const text = [section.title, ...section.blocks.map(blockToPlainText)].join(" ");
        documents.push({
            id: `${article.id}#${section.id}`,
            articleId: article.id,
            sectionId: section.id,
            title: `${article.title}: ${section.title}`,
            breadcrumb: article.title,
            haystack: text.toLowerCase(),
            text,
        });
    }

    return documents;
}

/** Build an index over any article list. */
export function buildSearchIndex(source: readonly Article[]): readonly SearchDocument[] {
    return source.flatMap(documentsForArticle);
}

/** The index over every published article. */
export const searchIndex: readonly SearchDocument[] = buildSearchIndex(articles);

/* -------------------------------------------------------------------------- */
/* Adapter for the shell's search surface                                     */
/* -------------------------------------------------------------------------- */

/**
 * The row shape the site's documentation search surface consumes.
 *
 * Declared structurally rather than imported, so the content layer does not depend on
 * the search layer. It is the same shape as the search module's `SearchableArticle`.
 */
export interface SearchableArticleRow {
    readonly id: string;
    readonly title: string;
    readonly href: string;
    readonly sectionLabel?: string;
    readonly body: string;
}

/** Build the href for a result. Section results point at the section within the article. */
export type ArticleHrefBuilder = (articleId: string, sectionId: string | null) => string;

const defaultHref: ArticleHrefBuilder = (articleId, sectionId) =>
    sectionId === null ? `#/docs/${articleId}` : `#/docs/${articleId}/${sectionId}`;

/**
 * The search index as rows for the documentation search surface.
 *
 * A row's `id` is the search document id: the article id for a whole-article row, and
 * `articleId#sectionId` for a section row. Taking everything before the first `#` gives
 * an id that `findArticle` resolves, which is what an open handler needs.
 */
export function searchableArticles(hrefFor: ArticleHrefBuilder = defaultHref): readonly SearchableArticleRow[] {
    return searchIndex.map((document) => {
        const base = {
            id: document.id,
            title: document.title,
            href: hrefFor(document.articleId, document.sectionId),
            body: document.text,
        };
        // exactOptionalPropertyTypes: omit the key rather than setting it undefined.
        return document.sectionId === null ? base : { ...base, sectionLabel: document.breadcrumb };
    });
}
