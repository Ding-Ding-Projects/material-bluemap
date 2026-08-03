/**
 * Site content: the single entry point the shell imports.
 *
 * ---------------------------------------------------------------------------
 * What this module gives the shell
 * ---------------------------------------------------------------------------
 *
 *   contentPages          the tabs whose content lives here: home, docs, screenshots
 *   home                  landing page copy: intro, what works, what does not,
 *                         highlight cards, the phase table, build instructions
 *   articles              every documentation article, in reading order
 *   articleCategoryOrder  the category order for grouped rendering
 *   findArticle(id)       article lookup, undefined rather than throwing
 *   searchIndex           one search document per article and per section
 *   searchableArticles()  the same index as rows for the docs search surface
 *   releaseAvailability   the download button's data, or a stated reason there is none
 *   screenshotAvailability the gallery's captures, or a stated reason there are none
 *
 * ---------------------------------------------------------------------------
 * How to render it
 * ---------------------------------------------------------------------------
 *
 * Content is structured data, never HTML. Walk the block union and build DOM with
 * `textContent`; nothing here is meant to be passed to `innerHTML`, and nothing in it
 * contains markup. Every block kind has a `kind` discriminant, so a `switch` over it
 * is exhaustive and a new kind becomes a type error rather than a blank area.
 *
 * Two things are load bearing and must reach the page:
 *
 *   1. `Article.status` and `Article.statusNote`. Several articles document work that
 *      is specified or ported but not verified. If the shell renders them identically
 *      to shipped features, the site misleads by default.
 *   2. The `available: false` branches of `releaseAvailability` and
 *      `screenshotAvailability`. Render the stated reason. Never substitute a
 *      placeholder image, and never construct a download URL.
 */

export * from "./types.js";
export * from "./links.js";
export * from "./pages.js";
export * from "./search.js";

export { home } from "./home.js";
export { articles, articleCategoryOrder, findArticle, articlesInCategory } from "./articles/index.js";

export {
    releaseAvailability,
    downloadCopy,
    downloadButtonLabel,
    downloadAccessibleName,
    downloadDetailLine,
    formatBytes,
    formatDate,
} from "./release.js";

export {
    screenshotAvailability,
    screenshotsCopy,
    screenshotUrl,
    captureCaption,
    groupCaptures,
    type CaptureGroup,
} from "./screenshots.js";
