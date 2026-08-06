/**
 * What a bundled documentation article is, and every pure operation over the set of them.
 *
 * Nothing here touches the DOM, `import.meta.glob`, or vue-i18n, which is deliberate: the parts
 * of a docs browser worth trusting are "which category does this file belong to", "does this
 * href point at another bundled article", and "what does a search actually match" - all
 * questions with one right answer that a unit test proves in a line. `docsContent.ts` is the one
 * module that reaches into `import.meta.glob`; `DocsPage.vue` is the one module that reaches for
 * `renderMarkdown`. Everything else is this file.
 */

import { compileSearchPattern, includesCI } from "../config/regexEngine.js";

/* -------------------------------------------------------------------------- */
/* Shape                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The two categories `docs/README.md` groups its articles under, plus a third this module
 * assigns to anything that is not in either of its tables.
 *
 * `uncategorized` is not a defect in this module: `docs/bluemapgui-parity.md` genuinely is not
 * listed under either heading in `docs/README.md` today, and `docs/README.md` itself is the
 * index rather than an entry in its own tables. Bundling still carries both, which is the whole
 * point of the completeness guard in `docsContent.test.ts` - a file the hand-maintained index
 * forgot is exactly the file a "full means full" rule exists to still surface, rather than
 * silently matching the same gap the index has.
 */
export const DOCS_CATEGORIES = ["application", "rendering", "uncategorized"] as const;
export type DocsCategoryId = (typeof DOCS_CATEGORIES)[number];

export interface DocsArticle {
    /** The filename without its `.md` extension, lowercased: `command-palette`. */
    readonly id: string;
    /** The real filename under `docs/`: `command-palette.md`. */
    readonly file: string;
    /** The article's first level-1 heading, or `file` when it has none. */
    readonly title: string;
    readonly category: DocsCategoryId;
    /** The raw Markdown source, exactly as committed. */
    readonly markdown: string;
}

/* -------------------------------------------------------------------------- */
/* Building an article from its raw source                                   */
/* -------------------------------------------------------------------------- */

/** The id a filename becomes: `Command-Palette.md` and `command-palette.md` are the same id. */
export function idFromFile(file: string): string {
    return file.replace(/\.md$/i, "").toLowerCase();
}

/**
 * The article's title: the text of its first `# ` heading, or the id when it has none. Every
 * article in this repository opens with exactly one level-1 heading, but a bundle that quietly
 * showed the filename for one that did not would still be more honest than one that crashed.
 */
export function titleFromMarkdown(markdown: string, fallbackId: string): string {
    const match = /^#\s+(.+?)\s*$/m.exec(markdown);
    return match?.[1] ?? fallbackId;
}

/**
 * The order `docs/README.md`'s "The application" table lists its rows in, by filename. Order
 * matters here: the index reproduces it rather than sorting alphabetically, exactly as the
 * command palette's own catalogue keeps its groups in the order the surface they describe uses.
 */
export const APPLICATION_ORDER: readonly string[] = [
    "home.md",
    "glossary.md",
    "command-palette.md",
    "notification-centre.md",
    "changelog-viewer.md",
    "tabbed-navigation.md",
    "appearance-editors.md",
    "super-confirmation.md",
    "language-and-tone.md",
    "finding-worlds.md",
    "path-field.md",
    "regex-builder.md",
    "config-history.md",
    "render-mask-drawing.md",
    "eula-and-consent.md",
    "dependency-provisioning.md",
    "automatic-updates.md",
    "render-console.md",
];

/** The same, for the "Rendering" table. */
export const RENDERING_ORDER: readonly string[] = [
    "java-runtime-provisioning.md",
    "docker-and-local.md",
    "automatic-repair.md",
    "render-in-actions.md",
    "ci-repository-setup.md",
    "scheduled-render.md",
    "pages-hosting.md",
    "resumable-renders.md",
    "large-worlds.md",
    "backup.md",
    "world-sources.md",
    "ssh-world-sources.md",
    "docker-world-source.md",
    "world-git-repository.md",
    "repository-adoption.md",
    "remote-render.md",
    "remote-hosting.md",
    "private-world-rendering.md",
    "legacy-1-12-worlds.md",
    "bedrock-worlds.md",
];

/** Which of the two tables a filename is in, or `uncategorized` when it is in neither. */
export function categoryOfFile(file: string): DocsCategoryId {
    if (APPLICATION_ORDER.includes(file)) return "application";
    if (RENDERING_ORDER.includes(file)) return "rendering";
    return "uncategorized";
}

/** Builds one article record from a bundled file's raw source. */
export function buildArticle(file: string, markdown: string): DocsArticle {
    const id = idFromFile(file);
    return {
        id,
        file,
        title: titleFromMarkdown(markdown, id),
        category: categoryOfFile(file),
        markdown,
    };
}

/* -------------------------------------------------------------------------- */
/* Grouping, for the index                                                   */
/* -------------------------------------------------------------------------- */

export interface DocsCategoryGroup {
    readonly id: DocsCategoryId;
    readonly articles: readonly DocsArticle[];
}

/**
 * Every category that has at least one article, in `DOCS_CATEGORIES` order, each holding its
 * articles in the order `README.md`'s table lists them (falling back to filename order for
 * `uncategorized`, which has no table to follow).
 */
export function groupByCategory(articles: readonly DocsArticle[]): readonly DocsCategoryGroup[] {
    const orderOf = (article: DocsArticle): number => {
        const order = article.category === "application" ? APPLICATION_ORDER : RENDERING_ORDER;
        const index = order.indexOf(article.file);
        return index === -1 ? order.length : index;
    };

    const groups: DocsCategoryGroup[] = [];
    for (const category of DOCS_CATEGORIES) {
        const members = articles.filter((article) => article.category === category);
        if (members.length === 0) continue;
        const sorted =
            category === "uncategorized"
                ? [...members].sort((a, b) => a.file.localeCompare(b.file))
                : [...members].sort((a, b) => orderOf(a) - orderOf(b));
        groups.push({ id: category, articles: sorted });
    }
    return groups;
}

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

/** Everything the search bar looks at for one article: its title, then its raw source. */
export function articleSearchText(article: DocsArticle): string {
    return `${article.title}\n${article.markdown}`;
}

/**
 * One line per article, which is what the regex builder previews against - the corpus the
 * search actually runs over, exactly as `changelogSampleText` gives the changelog's builder the
 * corpus that filter runs over.
 */
export function docsSampleText(articles: readonly DocsArticle[]): string {
    return articles.map((article) => `${article.file}: ${article.title}`).join("\n");
}

export interface DocsFilter {
    readonly test: (value: string) => boolean;
    readonly error: string | null;
    readonly active: boolean;
}

/**
 * Builds the predicate the docs search filters with, over the app's own bounded regex engine.
 * Plain text is the default and stays a case-insensitive substring match; regex is an explicit
 * opt-in; an invalid pattern matches nothing rather than silently reusing the last one that
 * compiled.
 */
export function createDocsFilter(query: string, regexMode: boolean, flags: string): DocsFilter {
    if (query.length === 0) return { test: () => true, error: null, active: false };

    if (!regexMode) {
        return { test: (value: string) => includesCI(value, query), error: null, active: true };
    }

    const { regexp, error } = compileSearchPattern(query, flags);
    if (!regexp) return { test: () => false, error, active: true };

    return {
        test: (value: string) => {
            regexp.lastIndex = 0;
            return regexp.test(value);
        },
        error: null,
        active: true,
    };
}

/** Every article whose title or content matches, in the same order they were given. */
export function filterArticles(
    articles: readonly DocsArticle[],
    filter: DocsFilter,
): readonly DocsArticle[] {
    return articles.filter((article) => filter.test(articleSearchText(article)));
}

/* -------------------------------------------------------------------------- */
/* Resolving a link inside a rendered article                                */
/* -------------------------------------------------------------------------- */

export interface ResolvedDocsLink {
    readonly id: string;
    /** Includes the leading `#`, or is empty when the link carries no anchor. */
    readonly hash: string;
}

/**
 * A same-directory relative Markdown link: `foo.md`, `./foo.md`, `foo.md#anchor`. Nothing with a
 * `/` in it (`../scripts/README.md`, `sub/foo.md`) matches, on purpose: every hand-written
 * cross-link between these articles is same-directory, and the one link in this repository's
 * documentation that is not - `docs/large-worlds.md`'s `../scripts/README.md` - points outside
 * `docs/` entirely and was never going to resolve to a bundled article regardless of how eagerly
 * this pattern tried to read it as one.
 */
const INTERNAL_LINK = /^\.?\/?([a-z0-9][a-z0-9_-]*)\.md(#.*)?$/i;

/**
 * Resolves a link found inside a rendered article to a bundled article, or `null` when the link
 * is not a same-directory Markdown link, or is one but does not name a bundled article (a typo,
 * or a filename this build genuinely does not carry).
 */
export function resolveInternalLink(
    href: string,
    knownIds: ReadonlySet<string>,
): ResolvedDocsLink | null {
    const match = INTERNAL_LINK.exec(href);
    if (match === null) return null;
    const id = (match[1] ?? "").toLowerCase();
    if (!knownIds.has(id)) return null;
    return { id, hash: match[2] ?? "" };
}
