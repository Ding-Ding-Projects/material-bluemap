/**
 * The in-app documentation browser's own chrome: the page title, the search bar, the category
 * headings, the back button, and the honest states for "nothing matched" and "this build has no
 * bundled documentation at all".
 *
 * This module is deliberately narrow. The article prose itself - the actual text of
 * `docs/*.md` - is documentation content rather than voiced application copy, and stays exactly
 * as its author wrote it in every language mode and at every funny level; nothing in this file
 * touches it. What lives here is the frame around it: the words the *browser* puts on screen
 * that are not part of any article, mirroring exactly what `copy/surfaces/changelog.ts` does for
 * the changelog viewer, which sits beside this one in the Info page and is the closest existing
 * model for "a whole document, rendered and searched, inside a menu page".
 *
 * Per the integration contract this file is written against: this module is intentionally NOT
 * imported by `copy/surfaces/index.ts`. Whoever wires the docs browser into the shell registers
 * it there in the same change that mounts the page, so a key here starts resolving to real
 * copy at the moment the surface using it actually ships, rather than sitting live and untested
 * ahead of the component that reads it.
 */

import type { FixedString, VoicedString } from "../../components/setup/setupStrings.js";

export const DOCSVIEWER_VOICED = {
    /*
     * The page's own opening line. "Bundled" and "no network" are the two facts a reader of
     * this specific page most needs, because they are the two things that make an in-app docs
     * browser worth having over "open the repository": every article is present in this build
     * with nothing fetched, so the browser works exactly as well with the network off as on.
     */
    "docsViewer.lede": {
        en: [
            "Every article this project documents, bundled into this build so it can be read with no network at all.",
            "Every article this project documents, bundled into this build so it can be read with no network at all.",
            "Every article this project documents. It is bundled into this build, so reading it needs no network at all.",
            "Every article this project documents, bundled right into this build. Reading it needs no network, no fetch, nothing missing.",
            "Every article this project documents, baked straight into this build. Reading it needs no network, no fetch, and nothing goes missing just because the wifi did.",
        ],
        yue: [
            "呢個專案有嘅每一篇文件，全部打包咗喺呢個版本入面，唔使上網都睇得到。",
            "呢個專案有嘅每一篇文件，全部打包咗喺呢個版本入面，唔使上網都睇得到。",
            "呢個專案有嘅每一篇文件。全部打包咗喺呢個版本入面，唔使上網都睇得到。",
            "呢個專案有嘅每一篇文件，直接打包埋喺呢個版本入面。唔使上網、唔使攞、乜都唔會走漏。",
            "呢個專案有嘅每一篇文件，實實在在焗埋喺呢個版本入面。唔使上網、唔使攞，就算冇wifi都唔會走漏一篇。",
        ],
    },
    /*
     * The honest count line, matching `changelog.showing` word for word in structure: what is
     * on screen, out of what exists, so a narrowed search never reads as a smaller docs set.
     */
    "docsViewer.showing": {
        en: [
            "Showing {shown} of {total} articles.",
            "Showing {shown} of {total} articles.",
            "Showing {shown} of the {total} articles bundled here.",
            "{shown} of {total} articles on screen.",
            "{shown} of {total} articles on screen. The rest are filtered out, not missing.",
        ],
        yue: [
            "顯示緊 {total} 篇文件入面嘅 {shown} 篇。",
            "顯示緊 {total} 篇文件入面嘅 {shown} 篇。",
            "喺呢度打包咗嘅 {total} 篇文件入面，顯示緊 {shown} 篇。",
            "畫面上有 {total} 篇入面嘅 {shown} 篇。",
            "畫面上有 {total} 篇入面嘅 {shown} 篇。其餘嘅係篩走咗，唔係唔見咗。",
        ],
    },
    "docsViewer.noMatches": {
        en: [
            "Nothing in the documentation matches. {filters} Clear the search to see the rest.",
            "Nothing in the documentation matches. {filters} Clear the search to see the rest.",
            "Nothing in the documentation matches these. {filters} Clear the search to see the rest.",
            "Nothing in the documentation matches. {filters} The rest is hidden rather than gone. Clear the search to see it.",
            "Nothing in the documentation matches, which is a statement about the search and not about the documentation. {filters} The rest is hidden rather than gone. Clear the search to get it back.",
        ],
        yue: [
            "文件入面冇嘢符合。{filters} 清走搜尋條件就見返其餘嘅。",
            "文件入面冇嘢符合。{filters} 清走搜尋條件就見返其餘嘅。",
            "文件入面冇嘢符合呢啲條件。{filters} 清走搜尋條件就見返其餘嘅。",
            "文件入面冇嘢符合。{filters} 其餘嗰啲係收埋咗，唔係冇咗：清走搜尋條件就見返。",
            "文件入面冇嘢符合，呢句講嘅係搜尋條件，唔係講文件本身。{filters} 其餘嗰啲係收埋咗，唔係冇咗：清走搜尋條件就攞得返。",
        ],
    },
    /*
     * The defensive empty state: a build whose docs bundle came out empty. Should never happen
     * with a working build - `docsContent.test.ts` is what actually guards that - but a browser
     * that assumed it and rendered nothing at all would look identical to one that was still
     * loading, which is worse than saying plainly what state it is in.
     */
    "docsViewer.noArticles": {
        en: [
            "This build carries no bundled documentation at all.",
            "This build carries no bundled documentation at all.",
            "This build carries no bundled documentation at all, and none has been invented to fill the page.",
            "This build carries no bundled documentation at all. The page stays empty rather than being padded with something plausible.",
            "This build carries no bundled documentation at all, so the page is staying empty. A docs browser that makes articles up is worse than one with none.",
        ],
        yue: [
            "呢個版本完全冇打包任何文件。",
            "呢個版本完全冇打包任何文件。",
            "呢個版本完全冇打包任何文件，亦都冇作啲嘢出嚟填個版。",
            "呢個版本完全冇打包任何文件。個版就咁空住，唔會屈啲似層層嘅嘢入去。",
            "呢個版本完全冇打包任何文件，所以個版就咁空住。一個識自己作文件嘅瀏覽器，仲衰過一個乜都冇嘅。",
        ],
    },
    /* A selected article id this build's bundle has no entry for: a stale link, a broken build. */
    "docsViewer.articleMissing": {
        en: [
            "This article is not available in this build.",
            "This article is not available in this build.",
            "This article is not available in this build, so nothing further is shown for it.",
            "This article is not part of this build, so there is nothing further to show for it.",
            "This article did not make it into this build, so there is genuinely nothing further to show for it rather than a guess at what it might have said.",
        ],
        yue: [
            "呢篇文件喺呢個版本入面攞唔到。",
            "呢篇文件喺呢個版本入面攞唔到。",
            "呢篇文件喺呢個版本入面攞唔到，所以冇進一步嘅內容可以顯示。",
            "呢篇文件唔屬於呢個版本，所以冇嘢可以再顯示落去。",
            "呢篇文件根本冇入到呢個版本度，所以真係冇進一步內容可以顯示，唔會屈估佢講過啲乜。",
        ],
    },
} as const satisfies Record<string, VoicedString>;

export const DOCSVIEWER_FIXED = {
    /* The shell tab that opens this page. */
    "tabs.page.docs": { en: "Docs", yue: "說明文件" },

    "docsViewer.title": { en: "Documentation", yue: "說明文件" },
    "docsViewer.indexHeading": { en: "Every article", yue: "所有文件" },
    "docsViewer.back": { en: "Back to the index", yue: "返去索引" },

    "docsViewer.search": { en: "Search the documentation", yue: "搜尋說明文件" },
    "docsViewer.searchHint": {
        en: "An article title or a word in its text",
        yue: "文件標題或者內文入面嘅字",
    },
    "docsViewer.clearFilters": { en: "Clear the search", yue: "清走搜尋條件" },

    "docsViewer.category.application": { en: "The application", yue: "程式本身" },
    "docsViewer.category.rendering": { en: "Rendering", yue: "算圖" },
    /*
     * Honest rather than apologetic: `docs/bluemapgui-parity.md` and `docs/README.md` itself
     * are genuinely not listed under either of README's own two headings today, and this label
     * says exactly that instead of implying a defect in the article.
     */
    "docsViewer.category.uncategorized": {
        en: "Elsewhere in the documentation",
        yue: "文件其他部分",
    },

    /* The Info page's own link into this browser - its "Help/About" reachability path. */
    "docsViewer.openFromInfo": { en: "Browse the documentation", yue: "瀏覽說明文件" },

    "docsViewer.articleNav": { en: "Documentation articles", yue: "說明文件文章" },
    "docsViewer.openArticle": { en: "Open {title}", yue: "打開 {title}" },
} as const satisfies Record<string, FixedString>;

export const DOCSVIEWER_FACTS = {
    "docsViewer.lede": {
        en: ["no network"],
        yue: ["唔使上網"],
    },
    "docsViewer.showing": { en: ["{shown}", "{total}"], yue: ["{shown}", "{total}"] },
    "docsViewer.noMatches": { en: ["{filters}", "Clear the search"], yue: ["{filters}", "清走搜尋條件"] },
    "docsViewer.noArticles": {
        en: ["no bundled documentation"],
        yue: ["冇打包任何文件"],
    },
    "docsViewer.articleMissing": {
        en: ["this build"],
        yue: ["呢個版本"],
    },
} as const satisfies Record<
    keyof typeof DOCSVIEWER_VOICED,
    { en: readonly string[]; yue: readonly string[] }
>;
