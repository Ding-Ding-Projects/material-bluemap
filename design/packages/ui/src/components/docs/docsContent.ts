/**
 * Every article under `docs/`, bundled into the application at build time.
 *
 * `docs/` is read-only source for this package: nothing here writes to it, and nothing at
 * runtime fetches it over the network. `import.meta.glob` reads the files at build time and
 * inlines their raw text into the bundle, exactly as `packages/site/src/content/captures.ts`
 * bundles the committed screenshot PNGs - eager, so a fresh clone has the whole docs browser
 * with no workflow artifact and no network round trip, and `?raw` rather than `?url` because
 * Markdown source is text to parse, not an asset to link to.
 *
 * The set of bundled articles is therefore derived from `docs/` itself: whatever
 * `import.meta.glob` finds is what ships. `docsContent.test.ts` proves that set actually matches
 * the real directory by reading it a second way, with plain `node:fs`, so a glob pattern that
 * quietly stopped matching (a typo, a directory rename) fails a test instead of shipping a docs
 * browser that is missing articles nobody notices are gone.
 */

import { type DocsArticle, buildArticle, idFromFile } from "./docsModel.js";

const modules = import.meta.glob("../../../../../../docs/*.md", {
    eager: true,
    query: "?raw",
    import: "default",
}) as Record<string, string>;

function fileOf(path: string): string {
    return path.slice(path.lastIndexOf("/") + 1);
}

/** Every bundled article, in the order `import.meta.glob` returned its keys (alphabetical). */
export const DOCS_ARTICLES: readonly DocsArticle[] = Object.entries(modules)
    .map(([path, markdown]) => buildArticle(fileOf(path), markdown))
    .sort((a, b) => a.file.localeCompare(b.file));

export const DOCS_ARTICLES_BY_ID: ReadonlyMap<string, DocsArticle> = new Map(
    DOCS_ARTICLES.map((article) => [article.id, article]),
);

export const DOCS_ARTICLE_IDS: ReadonlySet<string> = new Set(DOCS_ARTICLES.map((article) => article.id));

/** For the completeness guard: the real filenames this bundle was built from. */
export function bundledFilenames(): readonly string[] {
    return DOCS_ARTICLES.map((article) => article.file);
}

/** `docsModel.idFromFile`, re-exported so a caller need not import both modules for one lookup. */
export { idFromFile };
