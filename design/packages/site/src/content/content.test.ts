/**
 * Invariants the site content has to hold.
 *
 * These are not tests of prose quality. They are the mechanical guarantees the site
 * makes: every article carries the five required sections, every suggested link
 * resolves so a reader never hits a dead end, every source is a real absolute link,
 * and no user-facing string carries a character the project's copy rules forbid.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { articles, findArticle } from "./articles/index.js";
import { releaseAvailability } from "./generated/release.js";
import { screenshotAvailability } from "./generated/screenshots.js";
import { home } from "./home.js";
import { contentPages } from "./pages.js";
import { searchIndex } from "./search.js";
import { downloadCopy } from "./release.js";
import { screenshotsCopy, groupCaptures, screenshotUrl, captureCaption } from "./screenshots.js";
import { REQUIRED_SECTION_IDS } from "./types.js";
import type { Article, Block, Inline, InlineContent, ScreenshotCapture } from "./types.js";

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function inlineStrings(inline: Inline): string[] {
    if (typeof inline === "string") return [inline];
    if ("code" in inline) return [inline.code];
    if ("strong" in inline) return [inline.strong];
    if ("em" in inline) return [inline.em];
    return [inline.link];
}

function contentStrings(content: InlineContent): string[] {
    if (typeof content === "string") return [content];
    if (Array.isArray(content)) return (content as readonly Inline[]).flatMap(inlineStrings);
    return inlineStrings(content as Inline);
}

/** Every user-facing string in a block, code samples included. */
function blockStrings(block: Block): string[] {
    switch (block.kind) {
        case "paragraph":
            return contentStrings(block.content);
        case "list":
            return block.items.flatMap(contentStrings);
        case "table":
            return [
                block.caption,
                ...block.columns,
                ...block.rows.flatMap((row) => row.flatMap(contentStrings)),
            ];
        case "code":
            return [block.language, block.code, ...(block.caption === undefined ? [] : [block.caption])];
        case "definitions":
            return block.items.flatMap((item) => [item.term, ...contentStrings(item.description)]);
        case "callout":
            return [block.title, ...contentStrings(block.content)];
    }
}

function articleStrings(article: Article): string[] {
    return [
        article.title,
        article.summary,
        article.statusNote,
        ...article.sections.flatMap((section) => [section.title, ...section.blocks.flatMap(blockStrings)]),
        ...article.suggested.map((suggestion) => suggestion.reason),
        ...article.sources.map((source) => source.label),
    ];
}

/** Every href the content points at. */
function articleHrefs(article: Article): string[] {
    const fromBlocks = article.sections
        .flatMap((section) => section.blocks)
        .flatMap((block) => {
            const found: string[] = [];
            const visit = (content: InlineContent): void => {
                const runs: readonly Inline[] =
                    typeof content === "string"
                        ? []
                        : Array.isArray(content)
                          ? (content as readonly Inline[])
                          : [content as Inline];
                for (const run of runs) {
                    if (typeof run !== "string" && "href" in run) found.push(run.href);
                }
            };
            switch (block.kind) {
                case "paragraph":
                    visit(block.content);
                    break;
                case "list":
                    block.items.forEach(visit);
                    break;
                case "table":
                    block.rows.forEach((row) => row.forEach(visit));
                    break;
                case "definitions":
                    block.items.forEach((item) => visit(item.description));
                    break;
                case "callout":
                    visit(block.content);
                    break;
                case "code":
                    break;
            }
            return found;
        });
    return [...fromBlocks, ...article.sources.map((source) => source.href)];
}

const EM_DASH = "—";

/* -------------------------------------------------------------------------- */
/* Articles                                                                   */
/* -------------------------------------------------------------------------- */

describe("articles", () => {
    it("has a unique id for every article", () => {
        const ids = articles.map((article) => article.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("carries all five required sections in every article", () => {
        for (const article of articles) {
            const sectionIds = article.sections.map((section) => section.id);
            for (const required of REQUIRED_SECTION_IDS) {
                expect(sectionIds, `${article.id} is missing the ${required} section`).toContain(required);
            }
        }
    });

    it("never leaves a section empty", () => {
        for (const article of articles) {
            for (const section of article.sections) {
                expect(section.blocks.length, `${article.id}/${section.id} has no content`).toBeGreaterThan(0);
            }
        }
    });

    it("ends every article with suggested articles that resolve", () => {
        for (const article of articles) {
            expect(article.suggested.length, `${article.id} is a dead end`).toBeGreaterThan(0);
            for (const suggestion of article.suggested) {
                expect(
                    findArticle(suggestion.articleId),
                    `${article.id} suggests ${suggestion.articleId}, which does not exist`
                ).toBeDefined();
                expect(suggestion.articleId).not.toBe(article.id);
                expect(suggestion.reason.length).toBeGreaterThan(0);
            }
        }
    });

    it("cites at least one source per article, all absolute links", () => {
        for (const article of articles) {
            expect(article.sources.length, `${article.id} cites nothing`).toBeGreaterThan(0);
            for (const href of articleHrefs(article)) {
                expect(href.startsWith("https://"), `${article.id} links to ${href}`).toBe(true);
            }
        }
    });

    it("marks every unimplemented contract as specified rather than shipped", () => {
        const contractArticles = articles.filter((article) => article.category === "contracts");
        expect(contractArticles.length).toBe(5);
        for (const article of contractArticles) {
            expect(article.status, `${article.id} claims more than it should`).toBe("specified");
        }
    });

    it("uses a not-implemented callout in every contract article", () => {
        for (const article of articles.filter((a) => a.category === "contracts")) {
            const tones = article.sections
                .flatMap((section) => section.blocks)
                .filter((block) => block.kind === "callout")
                .map((block) => block.tone);
            expect(tones, `${article.id} never says it is unbuilt`).toContain("not-implemented");
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Copy rules                                                                 */
/* -------------------------------------------------------------------------- */

describe("copy rules", () => {
    const everyString = [
        ...articles.flatMap(articleStrings),
        home.title,
        home.tagline,
        ...home.worksToday,
        ...home.notYet,
        ...home.highlights.flatMap((highlight) => [highlight.title, highlight.body]),
        ...home.intro.flatMap(blockStrings),
        ...home.buildIt.flatMap(blockStrings),
        ...home.phases.flatMap((phase) => [phase.phase, phase.scope, ...(phase.note === undefined ? [] : [phase.note])]),
        ...contentStrings(home.phaseNote),
        ...contentPages.flatMap((page) => [page.title, page.description]),
        ...Object.values(downloadCopy),
        ...Object.values(screenshotsCopy),
    ];

    it("uses no em-dashes anywhere in user-facing copy", () => {
        const offenders = everyString.filter((value) => value.includes(EM_DASH));
        expect(offenders).toEqual([]);
    });

    it("has no empty strings", () => {
        expect(everyString.filter((value) => value.trim().length === 0)).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* Search                                                                     */
/* -------------------------------------------------------------------------- */

describe("search index", () => {
    it("indexes every article and every section", () => {
        const expected = articles.reduce((total, article) => total + 1 + article.sections.length, 0);
        expect(searchIndex.length).toBe(expected);
    });

    it("gives every document a unique id and a non-empty haystack", () => {
        const ids = searchIndex.map((document) => document.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const document of searchIndex) {
            expect(document.haystack.length, `${document.id} indexed nothing`).toBeGreaterThan(0);
            expect(document.haystack).toBe(document.haystack.toLowerCase());
        }
    });

    it("finds body text, not only titles", () => {
        const hits = searchIndex.filter((document) => document.haystack.includes("squirrel"));
        expect(hits.length).toBeGreaterThan(0);
        expect(hits.some((document) => document.sectionId !== null)).toBe(true);
    });
});

/* -------------------------------------------------------------------------- */
/* Screenshots                                                                */
/* -------------------------------------------------------------------------- */

describe("screenshot helpers", () => {
    const capture = (file: string, known = true): ScreenshotCapture => ({
        file,
        title: file,
        windowSize: "1280 by 800",
        displayScale: "100%",
        colourScheme: "system",
        configurationKnown: known,
        widthPx: 1280,
        heightPx: 800,
        byteSize: 1234,
        alt: `capture ${file}`,
    });

    it("keeps the project base path on every image URL", () => {
        expect(screenshotUrl("screenshots", "shell-1280x800.png")).toBe(
            "/material-bluemap/screenshots/shell-1280x800.png"
        );
        expect(screenshotUrl("/screenshots/", "a.png", "/elsewhere")).toBe("/elsewhere/screenshots/a.png");
    });

    it("drops no capture when grouping", () => {
        const captures = [
            capture("shell-1280x800.png"),
            capture("shell-scale-1_5x.png"),
            capture("page-maps.png"),
            capture("theme-dark.png"),
            capture("diagnostic-unmounted.png"),
            capture("something-else.png"),
        ];
        const grouped = groupCaptures(captures).flatMap((group) => group.captures);
        expect(grouped.map((c) => c.file).sort()).toEqual(captures.map((c) => c.file).sort());
    });

    it("says so rather than guessing when the configuration is unknown", () => {
        expect(captureCaption(capture("x.png", false))).toContain("configuration not recorded");
        expect(captureCaption(capture("x.png"))).toContain("1280 by 800");
    });
});

/* -------------------------------------------------------------------------- */
/* Generated modules                                                          */
/* -------------------------------------------------------------------------- */

describe("generated content", () => {
    const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

    it("never claims a capture whose image is not on disk", () => {
        // The images are gitignored build inputs. A generated module committed in the
        // available state would therefore reference files a fresh clone does not have,
        // and the gallery would render ten broken images. This is the guard for that.
        if (!screenshotAvailability.available) return;
        for (const capture of screenshotAvailability.captures) {
            const path = resolve(siteRoot, "public", screenshotAvailability.publicPath, capture.file);
            expect(existsSync(path), `${capture.file} is claimed but not present at ${path}`).toBe(true);
        }
    });

    it("only ever offers an https release asset URL", () => {
        if (!releaseAvailability.available) {
            expect(releaseAvailability.reason.length).toBeGreaterThan(0);
            return;
        }
        const { installer, releaseUrl } = releaseAvailability.release;
        expect(installer.url.startsWith("https://")).toBe(true);
        expect(releaseUrl.startsWith("https://")).toBe(true);
        expect(installer.sizeBytes).toBeGreaterThan(0);
        expect(installer.assetName.length).toBeGreaterThan(0);
    });
});
