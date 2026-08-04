/**
 * Invariants the site content has to hold.
 *
 * These are not tests of prose quality. They are the mechanical guarantees the site
 * makes: every article carries the five required sections, every suggested link
 * resolves so a reader never hits a dead end, every source is a real absolute link,
 * and no user-facing string carries a character the project's copy rules forbid.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { articles, findArticle } from "./articles/index.js";
import { captureProvenance, featuredCaptures, repoCaptures } from "./captures.js";
import { releaseAvailability } from "./generated/release.js";
import { screenshotAvailability } from "./generated/screenshots.js";
import { home } from "./home.js";
import { contentPages } from "./pages.js";
import { searchIndex } from "./search.js";
import { downloadCopy } from "./release.js";
import { screenshotsCopy, groupCaptures, screenshotUrl, captureCaption } from "./screenshots.js";
import { REQUIRED_SECTION_IDS } from "./types.js";
import type {
    Article,
    Block,
    FeatureStatus,
    HomeLink,
    Inline,
    InlineContent,
    ScreenshotCapture,
} from "./types.js";

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

    it("lets no shipped article carry the callout that means unbuilt", () => {
        // The counterpart of the two rules above, and the one that actually bites now that
        // several features exist beside the contracts they only partly satisfy. A shipped
        // article may say at length what it does not cover, and it says that in a warning;
        // reaching for the not-implemented tone would put the badge and the callout in
        // direct contradiction, and a reader has no way to know which of the two to believe.
        for (const article of articles.filter((a) => a.status === "shipped")) {
            const tones = article.sections
                .flatMap((section) => section.blocks)
                .filter((block) => block.kind === "callout")
                .map((block) => block.tone);
            expect(tones, `${article.id} is badged shipped and calls itself unbuilt`).not.toContain(
                "not-implemented"
            );
        }
    });

    it("makes every shipped article qualify the badge rather than only assert it", () => {
        // A status note that only lists what works is how "shipped" comes to mean nothing.
        // Every subject badged that way here has something real that nobody has verified: a
        // platform it has never run on, a surface nobody has captured, a clause of its own
        // contract it does not reach. The note is where that belongs.
        //
        // A length floor is a weak proxy for saying so and it is the only mechanical one
        // available, because no test can read a sentence and judge whether it was candid.
        // What it does rule out is the one-clause note that asserts the badge and stops,
        // which is the shape this rule exists to prevent; the reviewer does the rest.
        for (const article of articles.filter((a) => a.status === "shipped")) {
            expect(
                article.statusNote.trim().length,
                `${article.id} is badged shipped and explains nothing`
            ).toBeGreaterThan(100);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Copy rules                                                                 */
/* -------------------------------------------------------------------------- */

/** Every feature card on the landing page, across its groups. */
const homeFeatures = home.featureGroups.flatMap((group) => group.features);

/** Every link the landing page points at, whichever shape it came in. */
const homeLinks: readonly HomeLink[] = [
    ...home.furtherReading,
    ...homeFeatures.flatMap((feature) => feature.reading ?? []),
    captureProvenance.directory,
];

/** Every section's title and lede, so headings are covered by the copy rules too. */
const homeSections = [
    home.statsSection,
    home.enginesSection,
    home.showcaseSection,
    home.featuresSection,
    home.notYetSection,
    home.phasesSection,
    home.buildSection,
    home.readingSection,
];

describe("copy rules", () => {
    const everyString = [
        ...articles.flatMap(articleStrings),
        home.title,
        home.tagline,
        home.summary,
        ...home.notYet,
        ...homeSections.flatMap((section) => [section.title, section.lede]),
        ...home.stats.flatMap((stat) => [stat.value, stat.label, stat.detail]),
        ...contentStrings(home.statsNote),
        ...home.engines.flatMap((engine) => [engine.name, engine.role, ...contentStrings(engine.body)]),
        ...contentStrings(home.enginesNote),
        home.showcaseCaveat,
        home.showcaseMoreLabel,
        home.showcaseUnavailable,
        ...home.featureGroups.flatMap((group) => [group.title, group.lede]),
        ...homeFeatures.flatMap((feature) => [feature.title, feature.body, feature.statusNote]),
        ...homeLinks.map((link) => link.label),
        ...home.intro.flatMap(blockStrings),
        ...home.buildIt.flatMap(blockStrings),
        ...home.phases.flatMap((phase) => [phase.phase, phase.scope, ...(phase.note === undefined ? [] : [phase.note])]),
        ...contentStrings(home.phaseNote),
        ...contentPages.flatMap((page) => [page.title, page.description]),
        ...repoCaptures.flatMap((capture) => [capture.title, capture.configuration, capture.alt]),
        ...Object.values(downloadCopy),
        ...Object.values(screenshotsCopy),
    ];

    it("uses no em-dashes anywhere in user-facing copy", () => {
        const offenders = everyString.filter((value) => value.includes(EM_DASH));
        expect(offenders).toEqual([]);
    });

    it("has no blank strings, allowing a single space as a separator", () => {
        // Inline content is a sequence of runs, so the space between two element runs
        // has nowhere to live except its own string: `{strong: "..."}, " ", {code: "..."}`
        // renders as "text code" and dropping it renders as "textcode". A single space
        // is therefore real content, not an oversight.
        //
        // Everything else that trims to nothing still fails: the empty string, and any
        // longer whitespace run, which is always either a mistake or an attempt to lay
        // out text with spaces rather than with the renderer.
        const blank = everyString.filter((value) => value !== " " && value.trim().length === 0);
        expect(blank).toEqual([]);
    });
});

/* -------------------------------------------------------------------------- */
/* The landing page                                                           */
/* -------------------------------------------------------------------------- */

describe("landing page", () => {
    it("has a resolving article behind every feature card", () => {
        expect(homeFeatures.length).toBeGreaterThan(0);
        for (const feature of homeFeatures) {
            expect(
                findArticle(feature.articleId),
                `the "${feature.title}" card points at ${feature.articleId}, which does not exist`
            ).toBeDefined();
        }
    });

    it("never lets a card claim more than the article behind it", () => {
        // A card may be more cautious than its article. It may never be bolder: the page
        // would then advertise as shipped something the documentation calls unbuilt, and
        // the reader has no way to notice unless they open the article.
        const rank: Readonly<Record<FeatureStatus, number>> = {
            specified: 0,
            "ported-unverified": 1,
            shipped: 2,
        };
        for (const feature of homeFeatures) {
            const article = findArticle(feature.articleId);
            if (article === undefined) continue;
            expect(
                rank[feature.status],
                `the "${feature.title}" card says ${feature.status} while ${article.id} says ${article.status}`
            ).toBeLessThanOrEqual(rank[article.status]);
        }
    });

    it("explains every status badge it prints", () => {
        for (const feature of homeFeatures) {
            expect(feature.statusNote.trim().length, `${feature.title} shows a badge and explains nothing`).toBeGreaterThan(20);
        }
    });

    it("says where every headline figure comes from", () => {
        expect(home.stats.length).toBeGreaterThan(0);
        for (const stat of home.stats) {
            expect(stat.value.trim().length).toBeGreaterThan(0);
            expect(stat.detail.trim().length, `the "${stat.label}" figure cites nothing`).toBeGreaterThan(20);
        }
    });

    it("says which engine renders, and names exactly one", () => {
        // The single most misreadable fact on the page. Two engines exist, one renders,
        // and a page that marks both or neither lets a reader conclude the port is done.
        const running = home.engines.filter((engine) => engine.runsToday);
        expect(running.map((engine) => engine.id)).toEqual(["java"]);
        for (const engine of home.engines) {
            expect(findArticle(engine.articleId), `${engine.id} points at a missing article`).toBeDefined();
        }
    });

    it("keeps a list of what is not built, and links out only over https", () => {
        expect(home.notYet.length).toBeGreaterThan(0);
        expect(home.furtherReading.length).toBeGreaterThan(0);
        for (const link of homeLinks) {
            expect(link.label.trim().length).toBeGreaterThan(0);
            expect(link.href.startsWith("https://"), `${link.label} points at ${link.href}`).toBe(true);
        }
    });

    it("mirrors the phase table without inventing a status", () => {
        const allowed = new Set(["done", "in-progress", "pending"]);
        for (const phase of home.phases) {
            expect(allowed.has(phase.status), `phase ${phase.phase} has status ${phase.status}`).toBe(true);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* Committed captures                                                         */
/* -------------------------------------------------------------------------- */

describe("committed captures", () => {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

    it("never claims a capture whose file is not in the repository", () => {
        expect(repoCaptures.length).toBeGreaterThan(0);
        for (const capture of repoCaptures) {
            const path = resolve(repoRoot, "docs/screenshots", capture.file);
            expect(existsSync(path), `${capture.file} is shown but is not at ${path}`).toBe(true);
        }
    });

    it("gives every capture alt text that names the surface", () => {
        for (const capture of repoCaptures) {
            expect(capture.alt.length, `${capture.file} has no usable alt text`).toBeGreaterThan(40);
            expect(capture.configuration.trim().length).toBeGreaterThan(0);
        }
    });

    it("shows a subset of the committed set on the landing page", () => {
        expect(featuredCaptures.length).toBeGreaterThan(1);
        const all = new Set(repoCaptures.map((capture) => capture.file));
        for (const capture of featuredCaptures) expect(all.has(capture.file)).toBe(true);
    });

    it("uses only aspect ratios the stylesheet can actually reserve", () => {
        // The ratio is applied by an attribute selector, so a ratio the stylesheet has no
        // rule for silently loses its reserved box and the gallery shifts as it loads.
        const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "content.css"), "utf8");
        for (const ratio of new Set(repoCaptures.map((capture) => capture.aspectRatio))) {
            expect(css, `content.css has no rule for the ${ratio} ratio`).toContain(
                `[data-ratio="${ratio}"]`
            );
        }
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
