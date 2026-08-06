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
import { FIXED } from "../i18n/strings.js";
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

    it("never uses a status value the renderer does not know how to badge", () => {
        // `FeatureStatus` in types.ts is a closed union, and `main.ts`'s `STATUS_LABEL_KEYS` is
        // typed as `Record<FeatureStatus, FixedKey>`, so an unknown status already fails to
        // compile. This is the runtime half of the same guarantee: it names the exact set the
        // renderer voices a badge for, checks every one of those keys is actually present in the
        // i18n catalogue's FIXED table, and checks every article and every home-page feature card
        // uses one of them. A future status value added to the type without a matching FIXED
        // entry, or a content author reaching for a typo'd string that TypeScript's structural
        // typing happened to let through, fails here rather than rendering an empty badge.
        const KNOWN_STATUSES: readonly FeatureStatus[] = ["shipped", "ported-unverified", "specified"];
        const STATUS_FIXED_KEYS: Readonly<Record<FeatureStatus, string>> = {
            shipped: "status.shipped",
            "ported-unverified": "status.portedUnverified",
            specified: "status.specified",
        };
        for (const status of KNOWN_STATUSES) {
            const key = STATUS_FIXED_KEYS[status];
            expect(Object.prototype.hasOwnProperty.call(FIXED, key), `FIXED has no "${key}" entry`).toBe(true);
        }
        for (const article of articles) {
            expect(KNOWN_STATUSES, `${article.id} has an unrecognised status "${article.status}"`).toContain(
                article.status
            );
        }
        for (const feature of homeFeatures) {
            expect(
                KNOWN_STATUSES,
                `"${feature.title}" has an unrecognised status "${feature.status}"`
            ).toContain(feature.status);
        }
    });

    it("lets no shipped article's own words say its verification never happened", () => {
        // Regression for the exact failure mode a ground-truth pass found across eight articles
        // on 2026-08-05: a status badge promoted (or left) at "shipped" while a leftover sentence
        // still asserted the thing that badge claims never actually ran. "Shipped" now means the
        // exit check genuinely happened; an article that says so in its status and then says the
        // opposite in its body is worse than a missing badge, because a reader has no way to know
        // which of the two sentences to believe.
        //
        // This is deliberately narrow: it bans specific, unambiguous "this has never run at all"
        // phrases rather than short generic ones like "not yet verified" or "has not been proved",
        // because this project's own house style keeps writing real, disclosed residual gaps into
        // shipped articles under headings like "What has not been verified" and "What has not
        // been checked" - a broad ban would flag every one of those true, honest, narrow callouts
        // as if they contradicted the badge, which is exactly the false positive that would teach
        // everyone to ignore this test. The phrases below are the ones that showed up, verbatim or
        // near enough, in the eight articles' callouts before their ground truth was established,
        // naming the whole feature's exit check as never having run - not a residual gap within an
        // otherwise-proven feature, but the entire claim the badge makes.
        const NEVER_RAN_PHRASES = [
            "has not run",
            "have not run",
            "has never run",
            "have never run",
            "has not been run",
            "have not been run",
            "has never been run",
            "have never been run",
            "nobody has ever",
            "no one has ever",
            "exit check has not",
            "exit criteria have not",
            "exit criteria has not",
            "this is why the article's status says ported",
            "is implemented and unproven rather than verified",
        ];
        for (const article of articles.filter((a) => a.status === "shipped")) {
            const haystack = articleStrings(article).join(" \n ").toLowerCase();
            for (const phrase of NEVER_RAN_PHRASES) {
                expect(
                    haystack.includes(phrase),
                    `${article.id} is badged shipped but its own text says "${phrase}"`
                ).toBe(false);
            }
        }
    });

    it("never claims local world rendering does not exist, contradicting the java-render-path article", () => {
        // Regression for a stale pair of lines: viewer-remote-mode used to say local
        // rendering "does not exist yet" and that remote mode is "what remote mode
        // substitutes for today", while the site's own java-render-path article documents
        // that local rendering is real, shipped code driven by upstream's Java engine
        // (decision D17). The two articles must not contradict each other about whether
        // the feature exists.
        const remoteMode = findArticle("viewer-remote-mode");
        const javaRenderPath = findArticle("java-render-path");
        expect(remoteMode).toBeDefined();
        expect(javaRenderPath, "java-render-path is gone; viewer-remote-mode has nothing to agree with").toBeDefined();
        expect(javaRenderPath?.status).not.toBe("specified");

        const claims = [
            remoteMode?.statusNote ?? "",
            ...(remoteMode?.suggested.map((s) => s.reason) ?? []),
        ].join(" \n ");
        expect(claims).not.toMatch(/does not exist yet/i);
        expect(claims).not.toMatch(/what remote mode substitutes for/i);
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
    home.gettingStartedSection,
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
        ...home.gettingStarted.flatMap(blockStrings),
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

    it("reaches every article from the landing page, directly or through a suggestion", () => {
        // The site's own version of "a feature that ships and never appears here is
        // undocumented in practice". The docs tab lists everything, but a reader who
        // arrived at the landing page and never opened that tab should still be able to
        // walk to every article: a card, or a suggestion from one the cards do reach.
        // An article nobody points at is one that will be forgotten the next time this
        // page is edited, which is exactly how a shipped feature goes unmentioned.
        const seeds = [
            ...homeFeatures.map((feature) => feature.articleId),
            ...home.engines.map((engine) => engine.articleId),
        ];

        const reached = new Set<string>();
        const pending = [...seeds];
        for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
            if (reached.has(next)) continue;
            reached.add(next);
            for (const suggestion of findArticle(next)?.suggested ?? []) {
                pending.push(suggestion.articleId);
            }
        }

        const orphans = articles.filter((article) => !reached.has(article.id)).map((article) => article.id);
        expect(orphans, "these articles cannot be walked to from the landing page").toEqual([]);
    });

    it("carries a card for every feature the application surfaces to a user", () => {
        // A named floor rather than a count, so the list can grow without editing a
        // number, and so a card silently disappearing during an edit fails here.
        const carded = new Set(homeFeatures.map((feature) => feature.articleId));
        for (const required of [
            "options-gui",
            "config-rich-controls",
            "config-history",
            "backups",
            "github-sign-in",
            "tabbed-shell",
            "command-palette",
        ]) {
            expect(carded.has(required), `${required} has no card on the landing page`).toBe(true);
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
/* release-downloads                                                         */
/* -------------------------------------------------------------------------- */

describe("release-downloads article", () => {
    // docs/world-sources.md documents a distinct, real module -- main/worldsource/ -- that
    // fetches a world from any public GitHub repository's release and understands two
    // split layouts (this project's own parts manifest, and the far more common plain
    // SHA256SUMS listing). Before this article cited that module and mentioned that
    // capability, a reader here would learn a narrower feature than what actually shipped.
    const article = findArticle("release-downloads");

    it("exists", () => {
        expect(article).toBeDefined();
    });

    it("cites the worldsource module and its doc among its sources", () => {
        const labels = article!.sources.map((source) => source.label);
        expect(labels).toContain("packages/app/src/main/worldsource");
        expect(labels).toContain("docs/world-sources.md");
    });

    it("mentions fetching from any public GitHub repository and both split layouts", () => {
        const haystack = articleStrings(article!).join(" ").toLowerCase();
        expect(haystack).toContain("any public github repository");
        expect(haystack).toContain("sha256sums");
    });
});

/* -------------------------------------------------------------------------- */
/* install                                                                    */
/* -------------------------------------------------------------------------- */

describe("install article", () => {
    // Regression: the "Updates" definition used to say "Nothing in the app checks for
    // updates yet: the update checker is Phase I." That was true when it was written
    // and became false the moment design/packages/app/src/main/update/ shipped a real,
    // tested autoUpdater wiring (checks 30s after launch, every 6h after, a
    // non-blocking restart banner) -- see docs/automatic-updates.md and design/HANDOFF.md's
    // "The app updates itself" line. The article never caught up, so it told a reader the
    // opposite of what the shipped app does.
    const article = findArticle("install");
    const haystack = () => articleStrings(article!).join(" \n ").toLowerCase();

    it("exists", () => {
        expect(article).toBeDefined();
    });

    it("no longer claims nothing checks for updates", () => {
        expect(haystack()).not.toMatch(/nothing in the app checks for updates/i);
        expect(haystack()).not.toMatch(/the update checker is phase i\b/i);
    });

    it("describes the real update behaviour instead", () => {
        expect(haystack()).toMatch(/restart to install/i);
        expect(haystack()).toMatch(/30 seconds after launch|6 hours/i);
    });
});

/* -------------------------------------------------------------------------- */
/* Render-location routes: Docker/local and remote SSH                       */
/* -------------------------------------------------------------------------- */

describe("docker-and-local article", () => {
    // Regression: docs/docker-and-local.md documents a real, shipped, mounted feature
    // (choosing Local vs. Docker as the render runtime, via
    // packages/ui/src/components/remote/RunLocationCard.vue and its 126 main-process
    // tests in packages/app/src/main/runtime/), and the site's article registry used to
    // have no article for it at all.
    const article = findArticle("docker-and-local");

    it("exists", () => {
        expect(article).toBeDefined();
    });

    it("is reachable from a landing-page feature card", () => {
        const carded = new Set(homeFeatures.map((feature) => feature.articleId));
        expect(carded.has("docker-and-local")).toBe(true);
    });

    it("cites the runtime module and the doc it summarises", () => {
        const labels = article!.sources.map((source) => source.label);
        expect(labels).toContain("docs/docker-and-local.md");
    });
});

describe("remote-render article", () => {
    // Regression: docs/remote-render.md documents rendering over SSH, one of three
    // render-location routes HANDOFF.md names together. The GitHub Actions route
    // (render-in-actions.ts) had a full article; this one -- with its own UI
    // (RemotePreflightPanel.vue, mounted inside RunLocationCard.vue) and 154 main-process
    // tests in packages/app/src/main/remote/ -- had none.
    const article = findArticle("remote-render");

    it("exists", () => {
        expect(article).toBeDefined();
    });

    it("is reachable from a landing-page feature card", () => {
        const carded = new Set(homeFeatures.map((feature) => feature.articleId));
        expect(carded.has("remote-render")).toBe(true);
    });

    it("cites the doc it summarises", () => {
        const labels = article!.sources.map((source) => source.label);
        expect(labels).toContain("docs/remote-render.md");
    });
});

describe("ssh-world-sources article", () => {
    // Completeness guard: the SSH fetcher is a separate user journey from rendering on
    // another machine. Its canonical documentation and landing-page route must not
    // disappear just because both features speak SSH.
    const article = findArticle("ssh-world-sources");

    it("exists", () => {
        expect(article).toBeDefined();
    });

    it("is reachable from a landing-page feature card", () => {
        const carded = new Set(homeFeatures.map((feature) => feature.articleId));
        expect(carded.has("ssh-world-sources")).toBe(true);
    });

    it("cites the canonical SSH world-source documentation", () => {
        const labels = article!.sources.map((source) => source.label);
        expect(labels).toContain("docs/ssh-world-sources.md");
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

/* -------------------------------------------------------------------------- */
/* Roadmap mirror                                                             */
/* -------------------------------------------------------------------------- */

describe("roadmap mirror", () => {
    // design/ROADMAP.md is the source of truth (see this file's own doc comment and
    // home.ts's phaseNote); the landing page's phase table is required to say the same
    // thing rather than drift into its own, older story.
    const roadmapPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../ROADMAP.md");
    const roadmapText = readFileSync(roadmapPath, "utf8");
    const phaseH = home.phases.find((phase) => phase.phase === "H");
    const phaseI = home.phases.find((phase) => phase.phase === "I");

    it("has a Phase H row in the roadmap that records SQL storages as done", () => {
        // Regression: ROADMAP.md's Phase H row records SQL storages ported and proven
        // against real MySQL/MariaDB/PostgreSQL servers (issue #32, closed). The site's
        // own mirror used to say only that the command palette landed early and omit
        // SQL storages entirely, which is the gap this asserts against on both sides.
        expect(roadmapText).toMatch(/\|\s*H\s*\|[^\n]*\|[^\n]*SQL storage/i);
        expect(phaseH, "home.ts has no Phase H row").toBeDefined();
        expect(phaseH?.note ?? "").toMatch(/SQL storage/i);
    });

    it("never leaves Phase I saying only Pending once the update checker has shipped", () => {
        // Regression: ROADMAP.md used to state Phase I as a bare "Pending" despite the
        // update checker being built, wired into the main process and documented in
        // docs/automatic-updates.md. home.ts mirrored the same stale line verbatim.
        const phaseIRow = roadmapText.split("\n").find((line) => /^\|\s*I\s*\|/.test(line));
        expect(phaseIRow, "ROADMAP.md has no Phase I row").toBeDefined();
        expect(phaseIRow ?? "").not.toBe("| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |");
        expect(phaseIRow ?? "").toMatch(/update checker/i);

        expect(phaseI, "home.ts has no Phase I row").toBeDefined();
        expect(phaseI?.note ?? "").toMatch(/update checker/i);
    });
});
