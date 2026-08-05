/**
 * Site entry point.
 *
 * Wires the independently built modules into one running page: preferences,
 * language, theme and appearance, the tab strip, notifications, the settings
 * surface, the content pages, and the dim sum surprise.
 *
 * Everything here is composition. Behaviour lives in the modules; if a rule is being
 * enforced it is enforced there, not by this file remembering to ask.
 */

import "./theme/tokens.css";
import "./theme/base.css";
import "./tabs/tabs.css";
import "./shell/shell.css";
import "./notifications/notifications.css";
import "./settings/settings.css";
import "./search/search.css";
import "./dimsum/dimsum.css";
import "./content/content.css";

import { AppearanceController } from "./appearance/index.js";
import {
    ARTICLE_CATEGORY_LABELS,
    FEATURE_STATUS_LABELS,
    PHASE_STATUS_LABELS,
    articleCategoryOrder,
    articles,
    articlesInCategory,
    captureCaption,
    captureProvenance,
    contentPages,
    downloadAccessibleName,
    downloadButtonLabel,
    downloadDetailLine,
    downloadCopy,
    featuredCaptures,
    findArticle,
    groupCaptures,
    home,
    releaseAvailability,
    repoCaptures,
    screenshotAvailability,
    screenshotUrl,
    screenshotsCopy,
} from "./content/index.js";
import type {
    EngineRow,
    HomeFeature,
    HomeLink,
    HomeSectionCopy,
    HomeStat,
    RepoCapture,
} from "./content/index.js";
import { maybeShowDimSum } from "./dimsum/index.js";
import { createChangelogView } from "./content/changelogView.js";
import { createDiscoveryView } from "./content/discoveryView.js";
import { I18n } from "./i18n/I18n.js";
import { Notifications } from "./notifications/Notifications.js";
import { Preferences } from "./platform/Preferences.js";
import { RegexBuilderSlot } from "./platform/RegexBuilderSlot.js";
import { ShortcutRegistry } from "./platform/shortcuts.js";
import { confirmDestructive, createSettingsPage } from "./settings/index.js";
import { appendInlineContent, renderBlocks } from "./shell/renderBlocks.js";
import { TabModel } from "./tabs/TabModel.js";
import { TabsController } from "./tabs/index.js";
import { ThemeController } from "./theme/ThemeController.js";
import { createCommandPalette, type PaletteCommand } from "./shell/commandPalette.js";
import { articlePaletteCommands } from "./shell/articleCommands.js";
import { registerAppearanceTarget } from "./appearance/editor/contextMenu.js";
import { appearanceElements } from "./appearance/editor/coverage.js";
import { setSearchLocale } from "./search/strings.js";
import { createSearchSurface } from "./search/searchSurface.js";
import { createBuilderController } from "./search/builderPanel.js";
import { sharedRegexEvaluator } from "./search/evaluator.js";
import { SearchQueryModel } from "./search/queryModel.js";
import type { CandidateField } from "./search/runSearch.js";
import type { NotificationRecord } from "./notifications/Notifications.js";

/* -------------------------------------------------------------------------- */
/* Small DOM helpers                                                          */
/* -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className !== undefined) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function section(host: HTMLElement, heading: string, lede?: string): HTMLElement {
    const wrapper = el("section", "mb-section");
    wrapper.appendChild(el("h2", "mb-section-title", heading));
    if (lede !== undefined) wrapper.appendChild(el("p", "mb-section-lede", lede));
    host.appendChild(wrapper);
    return wrapper;
}

function sectionFor(host: HTMLElement, copy: HomeSectionCopy): HTMLElement {
    return section(host, copy.title, copy.lede);
}

/**
 * The page's own container.
 *
 * Every content-page style is scoped under `.mb-page`, so the pages cannot end up fighting
 * the settings page over the class names they share.
 */
function page(host: HTMLElement): HTMLElement {
    const wrapper = el("div", "mb-page");
    host.replaceChildren(wrapper);
    return wrapper;
}

/** An external link, with the affordances that opening a new context requires. */
function externalLink(link: HomeLink, className?: string): HTMLAnchorElement {
    const anchor = el("a", className, link.label);
    anchor.href = link.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return anchor;
}

function linkList(links: readonly HomeLink[], className = "mb-link-list"): HTMLElement {
    const list = el("ul", className);
    for (const link of links) {
        const item = el("li");
        item.appendChild(externalLink(link));
        list.appendChild(item);
    }
    return list;
}

/**
 * A status badge.
 *
 * The badge is a word before it is a colour, and the note the caller renders beside it says
 * what the word means for that subject. A page that reads the same for shipped and unbuilt
 * work misleads by default, which is the whole reason these exist.
 */
function statusBadge(status: keyof typeof FEATURE_STATUS_LABELS): HTMLElement {
    return el("span", `mb-status mb-status-${status}`, FEATURE_STATUS_LABELS[status]);
}

function captureFigure(capture: RepoCapture, className: string): HTMLElement {
    const figure = el("figure", className);

    const image = el("img", "mb-shot-image");
    image.src = capture.url;
    image.alt = capture.alt;
    image.loading = "lazy";
    image.decoding = "async";
    // Reserves the window's shape through CSS rather than an inline style, so a lazily
    // loaded capture arriving does not shove the rest of the page down.
    image.dataset.ratio = capture.aspectRatio;
    figure.appendChild(image);

    const caption = el("figcaption", "mb-shot-caption");
    caption.appendChild(el("strong", undefined, capture.title));
    caption.appendChild(document.createTextNode(capture.configuration));
    figure.appendChild(caption);

    return figure;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */
/**
 * How a page moves the visitor somewhere else.
 *
 * The landing page is a way in rather than a wall, which means nearly every claim on it has
 * to be one activation away from the article that backs it. The pages are tabs, so this is
 * the shell handing them the two moves they need instead of them reaching for the tab
 * controller themselves.
 */
interface PageNavigation {
    /** Open the documentation tab, expand one article, and put focus on it. */
    readonly openArticle: (articleRef: string, offset?: number) => void;
    /** Open one of the content tabs by id. */
    readonly openPage: (pageId: string) => void;
}

/* ---- Home ---------------------------------------------------------------- */

/**
 * The eyebrow pill above the H1.
 *
 * The release-availability status word used to be the first line of plain paragraph text
 * a reader hit; here it is promoted to its own small labelled element, which is both a
 * third type rung above the title on the first screen and a preview of the honest answer
 * to "does this actually work" before the reader has scrolled anywhere.
 */
function heroEyebrow(): HTMLElement {
    const text = releaseAvailability.available
        ? `Verified release · v${releaseAvailability.release.version}`
        : "No verified release yet";
    return el("p", "mb-hero-eyebrow", text);
}

/**
 * One compact tonal tile in the hero's stat preview.
 *
 * This is a preview, not a second copy of the record: the same stat, with its full detail
 * sentence, still renders in `renderStats` below in reading order. Marking the preview grid
 * `aria-hidden` (done by the caller) keeps a screen-reader user from hearing every number
 * twice; a sighted visitor gets the colour and the count on the first screen instead of
 * 950 pixels down.
 */
function heroStatTile(stat: HomeStat, tone: number): HTMLElement {
    const tile = el("div", "mb-hero-stat");
    tile.dataset.tone = String(tone);
    tile.appendChild(el("p", "mb-hero-stat-value", stat.value));
    tile.appendChild(el("p", "mb-hero-stat-label", stat.label));
    return tile;
}

function renderHero(host: HTMLElement): void {
    const hero = el("header", "mb-hero");
    const grid = el("div", "mb-hero-grid");

    const main = el("div", "mb-hero-main");
    main.appendChild(heroEyebrow());
    main.appendChild(el("h1", "mb-hero-title", home.title));
    main.appendChild(el("p", "mb-hero-tagline", home.tagline));
    main.appendChild(el("p", "mb-hero-summary", home.summary));

    // The download button is absent, never wrong: if no verified release with a real
    // installer was found at build time, the page says so instead of guessing a URL.
    if (releaseAvailability.available) {
        const release = releaseAvailability.release;
        main.appendChild(el("p", "mb-download-lead", downloadCopy.availableLead));

        const download = el("a", "mb-download");
        download.href = release.installer.url;
        download.textContent = downloadButtonLabel(release);
        download.setAttribute("aria-label", downloadAccessibleName(release));
        download.rel = "noopener noreferrer";
        main.appendChild(download);

        main.appendChild(el("p", "mb-download-detail", downloadDetailLine(release)));
    } else {
        main.appendChild(el("h2", "mb-download-heading", downloadCopy.unavailableHeading));
        main.appendChild(el("p", "mb-download-detail", downloadCopy.unavailableLead));
        main.appendChild(el("p", "mb-download-detail", releaseAvailability.reason));

        const link = el("a", "mb-download-link", downloadCopy.unavailableLinkLabel);
        link.href = downloadCopy.unavailableLinkHref;
        link.rel = "noopener noreferrer";
        main.appendChild(link);
    }
    main.appendChild(el("p", "mb-download-caveat", downloadCopy.caveat));
    grid.appendChild(main);

    // The first row of stats, previewed here rather than only 950px down the page. Every
    // value and label still renders in full, with its detail sentence, in `renderStats`.
    const preview = home.stats.slice(0, 4);
    if (preview.length > 0) {
        const statsGrid = el("div", "mb-hero-stats");
        statsGrid.setAttribute("aria-hidden", "true");
        preview.forEach((stat, index) => statsGrid.appendChild(heroStatTile(stat, index)));
        grid.appendChild(statsGrid);
    }

    hero.appendChild(grid);
    host.appendChild(hero);
}

function renderStats(host: HTMLElement): void {
    const wrapper = sectionFor(host, home.statsSection);
    const grid = el("div", "mb-stat-grid");
    for (const stat of home.stats) {
        const card = el("div", "mb-stat");
        card.appendChild(el("p", "mb-stat-value", stat.value));
        card.appendChild(el("p", "mb-stat-label", stat.label));
        card.appendChild(el("p", "mb-stat-detail", stat.detail));
        grid.appendChild(card);
    }
    wrapper.appendChild(grid);

    const note = el("p", "mb-note");
    appendInlineContent(note, home.statsNote);
    wrapper.appendChild(note);
}

function engineCard(engine: EngineRow, navigation: PageNavigation): HTMLElement {
    const card = el("article", "mb-engine");
    // The flag below is words. This attribute only lets the styling agree with them.
    card.dataset.runs = engine.runsToday ? "true" : "false";

    card.appendChild(el("p", "mb-engine-flag", engine.role));
    card.appendChild(el("h3", "mb-engine-name", engine.name));

    const body = el("p", "mb-card-body");
    appendInlineContent(body, engine.body);
    card.appendChild(body);

    const actions = el("div", "mb-card-actions");
    actions.appendChild(articleButton(engine.articleId, navigation, engine.linkLabel));
    card.appendChild(actions);
    return card;
}

function renderEngines(host: HTMLElement, navigation: PageNavigation): void {
    const wrapper = sectionFor(host, home.enginesSection);

    const grid = el("div", "mb-engine-grid");
    for (const engine of home.engines) grid.appendChild(engineCard(engine, navigation));
    wrapper.appendChild(grid);

    const note = el("p", "mb-note");
    appendInlineContent(note, home.enginesNote);
    wrapper.appendChild(note);
}

function renderShowcase(host: HTMLElement, navigation: PageNavigation): void {
    const wrapper = sectionFor(host, home.showcaseSection);

    // A record whose image did not resolve was dropped upstream of here, so an empty list
    // means the committed captures genuinely were not there. Say so; substitute nothing.
    if (featuredCaptures.length === 0) {
        wrapper.appendChild(el("p", "mb-note", home.showcaseUnavailable));
        return;
    }

    const [lead, ...rest] = featuredCaptures;
    if (lead !== undefined) wrapper.appendChild(captureFigure(lead, "mb-shot-lead"));

    if (rest.length > 0) {
        const strip = el("div", "mb-shot-strip");
        for (const capture of rest) strip.appendChild(captureFigure(capture, "mb-shot"));
        wrapper.appendChild(strip);
    }

    wrapper.appendChild(el("p", "mb-note", home.showcaseCaveat));

    const more = el("button", "mb-card-link", home.showcaseMoreLabel);
    more.type = "button";
    more.addEventListener("click", () => navigation.openPage("screenshots"));
    const actions = el("div", "mb-card-actions");
    actions.appendChild(more);
    wrapper.appendChild(actions);
}

/**
 * The button that takes a card's claim to the article backing it.
 *
 * It is a real control with a real hit target, and its label names the article rather than
 * saying "read more", so it still means something read out of context by a screen reader.
 */
function articleButton(
    articleId: string,
    navigation: PageNavigation,
    label?: string,
): HTMLButtonElement {
    const article = findArticle(articleId);
    const button = el("button", "mb-card-link", label ?? `Read: ${article?.title ?? articleId}`);
    button.type = "button";
    button.addEventListener("click", () => navigation.openArticle(articleId));
    return button;
}

function featureCard(feature: HomeFeature, navigation: PageNavigation): HTMLElement {
    const card = el("article", "mb-card");

    const head = el("div", "mb-card-head");
    head.appendChild(el("h4", "mb-card-title", feature.title));
    head.appendChild(statusBadge(feature.status));
    card.appendChild(head);

    card.appendChild(el("p", "mb-card-body", feature.body));
    // The badge without this line is decoration. This is what it means here, in words.
    card.appendChild(el("p", "mb-status-note", feature.statusNote));

    const actions = el("div", "mb-card-actions");
    actions.appendChild(articleButton(feature.articleId, navigation));
    card.appendChild(actions);

    if (feature.reading !== undefined && feature.reading.length > 0) {
        card.appendChild(linkList(feature.reading, "mb-card-reading"));
    }
    return card;
}

function renderFeatures(host: HTMLElement, navigation: PageNavigation): void {
    const wrapper = sectionFor(host, home.featuresSection);

    for (const group of home.featureGroups) {
        const groupEl = el("div", "mb-feature-group");
        groupEl.appendChild(el("h3", "mb-feature-group-title", group.title));
        groupEl.appendChild(el("p", "mb-section-lede", group.lede));

        const grid = el("div", "mb-card-grid");
        for (const feature of group.features) grid.appendChild(featureCard(feature, navigation));
        groupEl.appendChild(grid);

        wrapper.appendChild(groupEl);
    }
}

function renderNotYet(host: HTMLElement): void {
    const wrapper = sectionFor(host, home.notYetSection);
    const list = el("ul", "mb-prose-list");
    for (const item of home.notYet) list.appendChild(el("li", undefined, item));
    wrapper.appendChild(list);
}

function renderPhases(host: HTMLElement): void {
    const wrapper = sectionFor(host, home.phasesSection);

    const scroll = el("div", "mb-table-scroll");
    const table = el("table", "mb-prose-table");
    table.appendChild(el("caption", undefined, "Port progress by phase"));

    const thead = el("thead");
    const headRow = el("tr");
    for (const column of ["Phase", "Scope", "Status"]) {
        const th = el("th", undefined, column);
        th.scope = "col";
        headRow.appendChild(th);
    }
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el("tbody");
    for (const row of home.phases) {
        const tr = el("tr");

        const phase = el("th", undefined, row.phase);
        phase.scope = "row";
        tr.appendChild(phase);

        const scope = el("td", "mb-phase-scope");
        scope.appendChild(document.createTextNode(row.scope));
        // A note is not a footnote nobody reads: it is where "in progress" is made precise.
        if (row.note !== undefined) scope.appendChild(el("span", "mb-phase-note", row.note));
        tr.appendChild(scope);

        const status = el("td");
        status.appendChild(
            el("span", `mb-status mb-phase-${row.status}`, PHASE_STATUS_LABELS[row.status]),
        );
        tr.appendChild(status);

        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    wrapper.appendChild(scroll);

    const note = el("p", "mb-note");
    appendInlineContent(note, home.phaseNote);
    wrapper.appendChild(note);
}

/**
 * The path for a reader who has never heard of BlueMap before landing on this page.
 *
 * Placed directly after the hero, ahead of the vocabulary-assuming intro paragraphs below
 * it: a visitor who does not yet know what a "world" or a "map" is should not have to read
 * three sections of scale and engine comparisons before finding out what to actually do.
 * The glossary button is a real activation, not a link the block model has no way to wire
 * to the SPA's own navigation.
 */
function renderGettingStarted(host: HTMLElement, navigation: PageNavigation): void {
    const wrapper = sectionFor(host, home.gettingStartedSection);
    const prose = el("div", "mb-prose");
    renderBlocks(prose, home.gettingStarted);
    wrapper.appendChild(prose);

    const actions = el("div", "mb-card-actions");
    actions.appendChild(articleButton("glossary", navigation, "Read the glossary of terms"));
    wrapper.appendChild(actions);
}

function renderHome(host: HTMLElement, navigation: PageNavigation): void {
    const root = page(host);

    renderHero(root);
    renderGettingStarted(root, navigation);

    const intro = el("div", "mb-prose");
    renderBlocks(intro, home.intro);
    root.appendChild(intro);

    renderStats(root);
    renderEngines(root, navigation);
    renderShowcase(root, navigation);
    renderFeatures(root, navigation);
    renderNotYet(root);
    renderPhases(root);

    const build = sectionFor(root, home.buildSection);
    const buildProse = el("div", "mb-prose");
    renderBlocks(buildProse, home.buildIt);
    build.appendChild(buildProse);

    const reading = sectionFor(root, home.readingSection);
    reading.appendChild(linkList(home.furtherReading));
}

/* ---- Documentation ------------------------------------------------------- */

/** The element id an article's disclosure carries, so the home page can reach it. */
function articleElementId(articleId: string): string {
    return `article-${articleId}`;
}

function renderDocs(host: HTMLElement): void {
    const root = page(host);
    root.appendChild(el("h1", "mb-page-title", "Documentation"));
    root.appendChild(
        el(
            "p",
            "mb-page-subtitle",
            contentPages.find((contentPage) => contentPage.id === "docs")?.description ?? "",
        ),
    );

    for (const category of articleCategoryOrder) {
        const inCategory = articlesInCategory(category);
        if (inCategory.length === 0) continue;

        const wrapper = section(root, ARTICLE_CATEGORY_LABELS[category]);
        // A responsive grid of tiles reads as a catalogue; the uniform vertical stack it
        // replaces read as one more settings list. `[open]` articles span the full row
        // (see .mb-article-grid > .mb-article[open] in content.css) so expanded prose,
        // tables and code never get squeezed into a narrow tile.
        const grid = el("div", "mb-article-grid");
        wrapper.appendChild(grid);
        for (const article of inCategory) {
            const details = el("details", "mb-article");
            details.id = articleElementId(article.id);

            const summary = el("summary", "mb-article-summary");
            summary.appendChild(el("span", "mb-article-title", article.title));
            // The status badge is not decoration. A documentation site that reads the
            // same for shipped and unbuilt features misleads by default.
            summary.appendChild(statusBadge(article.status));
            details.appendChild(summary);

            const body = el("div", "mb-article-body");
            body.appendChild(el("p", "mb-article-lede", article.summary));
            body.appendChild(el("p", "mb-status-note", article.statusNote));

            for (const articleSection of article.sections) {
                const heading = el("h3", "mb-article-section", articleSection.title);
                heading.id = `article-${article.id}-${articleSection.id}`;
                body.appendChild(heading);
                const prose = el("div", "mb-prose");
                renderBlocks(prose, articleSection.blocks);
                body.appendChild(prose);
            }

            if (article.suggested.length > 0) {
                body.appendChild(el("h3", "mb-article-section", "Suggested articles"));
                // Its own tonal panel rather than one more plain list under a label, so the
                // one place every article points somewhere else is visually distinct.
                const suggestedBox = el("div", "mb-suggested");
                const list = el("ul", "mb-prose-list");
                for (const suggestion of article.suggested) {
                    const target = findArticle(suggestion.articleId);
                    const li = el("li");
                    li.appendChild(el("strong", undefined, target?.title ?? suggestion.articleId));
                    li.appendChild(document.createTextNode(`: ${suggestion.reason}`));
                    list.appendChild(li);
                }
                suggestedBox.appendChild(list);
                body.appendChild(suggestedBox);
            }

            // Sources were modelled and never rendered, which made every article's
            // evidence unreachable from the article that leaned on it.
            body.appendChild(el("h3", "mb-article-section", "Sources"));
            body.appendChild(linkList(article.sources));

            details.appendChild(body);
            grid.appendChild(details);
        }
    }
}

/* ---- Screenshots --------------------------------------------------------- */

function renderProvenance(host: HTMLElement): void {
    const definitions = el("dl", "mb-prose-definitions");
    const rows: readonly (readonly [string, string])[] = [
        [screenshotsCopy.committedSourceLabel, captureProvenance.capturedBy],
        [screenshotsCopy.committedMethodLabel, captureProvenance.method],
        [screenshotsCopy.committedCommitLabel, captureProvenance.commit],
        [screenshotsCopy.committedRunLabel, captureProvenance.run],
    ];
    for (const [term, value] of rows) {
        definitions.appendChild(el("dt", undefined, term));
        definitions.appendChild(el("dd", undefined, value));
    }
    host.appendChild(definitions);

    const where = el("p", "mb-note");
    where.appendChild(document.createTextNode(`${screenshotsCopy.committedDirectoryLabel} `));
    where.appendChild(externalLink(captureProvenance.directory));
    host.appendChild(where);
}

function renderScreenshots(host: HTMLElement): void {
    const root = page(host);
    root.appendChild(el("h1", "mb-page-title", "Screenshots"));
    root.appendChild(el("p", "mb-page-subtitle", screenshotsCopy.lead));
    root.appendChild(el("p", "mb-note", screenshotsCopy.caveat));

    // The committed set first, because it is the one that exists in every clone. The
    // fetched set below it may or may not have been collected for this build.
    if (repoCaptures.length > 0) {
        const committed = section(
            root,
            screenshotsCopy.committedHeading,
            screenshotsCopy.committedLead,
        );
        const grid = el("div", "mb-shot-grid");
        for (const capture of repoCaptures) grid.appendChild(captureFigure(capture, "mb-shot"));
        committed.appendChild(grid);
        renderProvenance(committed);
    }

    if (!screenshotAvailability.available) {
        // Say plainly that the fetched captures are missing rather than showing
        // placeholders that would read as the product.
        const missing = section(
            root,
            screenshotsCopy.unavailableHeading,
            screenshotsCopy.unavailableLead,
        );
        missing.appendChild(el("p", "mb-prose-p", screenshotAvailability.reason));

        const link = el("a", "mb-download-link", screenshotsCopy.unavailableLinkLabel);
        link.href = screenshotsCopy.unavailableLinkHref;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        missing.appendChild(link);
        return;
    }

    const collected = section(root, screenshotsCopy.ciHeading, screenshotsCopy.ciLead);
    const publicPath = screenshotAvailability.publicPath;

    for (const group of groupCaptures(screenshotAvailability.captures)) {
        collected.appendChild(el("h3", "mb-feature-group-title", group.title));
        collected.appendChild(el("p", "mb-section-lede", group.description));

        const grid = el("div", "mb-shot-grid");
        for (const capture of group.captures) {
            const figure = el("figure", "mb-shot");
            const img = el("img", "mb-shot-image");
            img.src = screenshotUrl(publicPath, capture.file);
            img.alt = capture.alt;
            img.loading = "lazy";
            img.decoding = "async";
            figure.appendChild(img);
            figure.appendChild(el("figcaption", "mb-shot-caption", captureCaption(capture)));
            grid.appendChild(figure);
        }
        collected.appendChild(grid);
    }
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

/** The mount point index.html provides. */
const ROOT_ID = "site-root";

/** The id the skip link jumps to, and the id the main landmark carries. */
const MAIN_CONTENT_ID = "mb-main-content";

/**
 * Renders the failure instead of leaving a blank page.
 *
 * A site that throws during boot shows nothing at all, and "nothing" is
 * indistinguishable from a failed deploy, a network problem, or a browser with
 * scripting disabled. Saying what broke is worth more than a clean console.
 */
function showBootFailure(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    const host = document.getElementById(ROOT_ID) ?? document.body;
    const notice = document.createElement("div");
    notice.className = "mb-boot-error";
    notice.setAttribute("role", "alert");

    const heading = document.createElement("h1");
    heading.textContent = "This page failed to start";
    notice.appendChild(heading);

    const detail = document.createElement("p");
    detail.textContent = message;
    notice.appendChild(detail);

    const link = document.createElement("a");
    link.href = "https://github.com/Ding-Ding-Projects/material-bluemap/issues";
    link.textContent = "Report this";
    link.rel = "noopener noreferrer";
    notice.appendChild(link);

    host.replaceChildren(notice);
}

function boot(): void {
    const root = document.getElementById(ROOT_ID);
    if (root === null) {
        throw new Error(
            `The mount point #${ROOT_ID} is missing from index.html, so there is nowhere to render.`,
        );
    }
    root.replaceChildren();

    const prefs = new Preferences();
    const i18n = new I18n(prefs);
    // The search package owns its own builder copy, but the shell owns the persisted
    // language/tone settings. Keep the two in lock-step from the first paint onward.
    setSearchLocale({ mode: i18n.mode, funnyEn: i18n.funnyEn, funnyYue: i18n.funnyYue });
    i18n.subscribe(() => {
        setSearchLocale({ mode: i18n.mode, funnyEn: i18n.funnyEn, funnyYue: i18n.funnyYue });
    });
    const theme = new ThemeController(prefs);
    const appearance = new AppearanceController(prefs);
    const shortcuts = new ShortcutRegistry();
    const regex = new RegexBuilderSlot();
    let regexFieldId = 0;
    regex.provide({
        open(request) {
            regexFieldId += 1;
            const regexMode = request.mode === "regex";
            const model = new SearchQueryModel({
                fieldId: `shell-regex-${regexFieldId}`,
                initialMode: regexMode ? "regex" : "text",
                initialQuery: regexMode ? "" : request.field.value,
                initialFlags: request.flags,
                persist: false,
            });
            if (regexMode) model.setPattern(request.pattern);
            const unsubscribe = model.subscribe((snapshot) => {
                if (request.field.value !== snapshot.fieldValue)
                    request.field.value = snapshot.fieldValue;
                request.onChange({ pattern: snapshot.pattern, flags: snapshot.flags });
            });
            const controller = createBuilderController({
                model,
                evaluator: sharedRegexEvaluator(),
                fieldLabel: "Search",
                sampleProvider: () => request.sample,
                anchor: request.anchor,
                returnFocusTo: request.field,
            });
            controller.toggle();
            return {
                close() {
                    unsubscribe();
                    controller.destroy();
                },
            };
        },
    });

    const notificationHost = el("div", "mb-notification-host");
    document.body.appendChild(notificationHost);
    const notifications = new Notifications(i18n, notificationHost);

    const model = new TabModel(prefs, i18n);
    const tabs = new TabsController({
        i18n,
        model,
        notifications,
        shortcuts,
        regex,
        appearance,
        confirmDestructive,
    });
    const settingsView = createSettingsPage({ prefs, appearance, theme });
    const tabLabelKey = {
        home: "site.homeTab",
        docs: "site.docsTab",
        screenshots: "site.screenshotsTab",
    } as const;

    /*
     * Following a card from the landing page has to land the visitor on the exact article,
     * opened, with focus on it. Revealing the tab is not enough: a disclosure list of
     * seventeen collapsed articles is a place to start hunting, not an answer.
     *
     * The panel renders synchronously when its tab is activated, so the element exists by
     * the time `reveal` returns. It is still looked up defensively, because a missing
     * article should leave the reader on the documentation tab rather than throw.
     */
    const navigation: PageNavigation = {
        openPage: (pageId) => tabs.reveal(pageId),
        openArticle: (articleRef, offset) => {
            const [articleIdPart, sectionId] = articleRef.split("#", 2);
            const articleId = articleIdPart ?? articleRef;
            tabs.reveal("docs");
            const target = document.getElementById(articleElementId(articleId));
            if (!(target instanceof HTMLDetailsElement)) return;
            target.open = true;
            // A summary is focusable already. Giving it a tabindex of -1 to focus it would
            // take it out of the tab order for good, which is a worse defect than the one
            // it would be fixing.
            const summary = target.querySelector("summary");
            if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
            // Section results carry `article-id#section-id`. Land on the exact heading
            // instead of opening a long disclosure and asking the visitor to hunt again.
            const sectionTarget =
                sectionId === undefined
                    ? null
                    : document.getElementById(`article-${articleId}-${sectionId}`);
            const destination = sectionTarget instanceof HTMLElement ? sectionTarget : target;
            if (offset !== undefined && sectionTarget === null) {
                const textTarget = [
                    ...target.querySelectorAll<HTMLElement>(".mb-prose, .mb-article-lede"),
                ].find((candidate) => candidate.textContent?.length !== 0);
                if (textTarget !== undefined)
                    destination.scrollIntoView({ block: "center", behavior: "auto" });
            }
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            destination.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
            // The same "look here" flash the search results use, so arriving from a card
            // and arriving from a search feel like the same thing.
            destination.classList.add("mb-flash");
            window.setTimeout(() => destination.classList.remove("mb-flash"), 2000);
        },
    };

    for (const contentPage of contentPages) {
        const render = (host: HTMLElement): void => {
            if (contentPage.id === "home") renderHome(host, navigation);
            else if (contentPage.id === "docs") renderDocs(host);
            else renderScreenshots(host);
            decoratePage(host, contentPage.id, appearance);
        };
        tabs.registerPage({
            id: contentPage.id,
            label: { key: tabLabelKey[contentPage.id] },
            // Home is the one page a visitor should never be able to close themselves
            // out of, so it is pinned and excluded from bulk closes.
            pinned: contentPage.id === "home",
            closable: contentPage.id !== "home",
            render,
        });
    }

    tabs.registerPage({
        id: "settings",
        label: { key: "site.settingsTab" },
        closable: true,
        render: (host) => {
            host.replaceChildren(settingsView.element);
            decoratePage(host, "settings", appearance);
        },
    });

    tabs.registerPage({
        id: "search",
        label: { key: "site.searchTab" },
        closable: true,
        render: (host) => {
            host.replaceChildren(
                createDiscoveryView({
                    tabs,
                    settings: settingsView,
                    i18n,
                    openArticle: navigation.openArticle,
                }),
            );
            decoratePage(host, "search", appearance);
        },
    });
    tabs.registerPage({
        id: "changelog",
        label: { key: "site.changelogTab" },
        closable: true,
        render: (host) => {
            host.replaceChildren(createChangelogView(i18n));
            decoratePage(host, "changelog", appearance);
        },
    });
    tabs.registerPage({
        id: "notifications",
        label: { key: "site.notificationsTab" },
        closable: true,
        render: (host) => {
            const view = el("div", "mb-page");
            const title = el("h1", "mb-page-title");
            i18n.bindText(title, "site.notificationTitle");
            view.appendChild(title);
            const fields: readonly CandidateField<NotificationRecord, "title" | "body">[] = [
                { name: "title", get: (record) => i18n.text(record.title) },
                {
                    name: "body",
                    get: (record) => (record.body === null ? "" : i18n.text(record.body)),
                },
            ];
            const search = createSearchSurface({
                fieldId: "notifications.history",
                labelText: i18n.t("site.searchNotifications"),
                placeholder: i18n.t("site.searchNotificationsPlaceholder"),
                labelTextSource: () => i18n.t("site.searchNotifications"),
                placeholderSource: () => i18n.t("site.searchNotificationsPlaceholder"),
                resultsLabel: i18n.t("site.notificationEntries"),
                fields,
                items: () => notifications.list(),
                subscribe: (listener) => notifications.subscribe(listener),
                renderResult: ({ item }) => {
                    const row = el("article", "notification-centre__item");
                    const heading = el("h2", "notification-centre__title", i18n.text(item.title));
                    const time = el(
                        "time",
                        "notification-centre__time",
                        item.at.toLocaleTimeString(),
                    );
                    time.setAttribute("datetime", item.at.toISOString());
                    row.append(heading, time);
                    if (item.body !== null)
                        row.append(el("p", "notification-centre__body", i18n.text(item.body)));
                    return row;
                },
            });
            view.appendChild(search.element);
            const actions = el("div", "mb-changelog-actions");
            const clearButton = el("button", "md-button md-button--outlined");
            clearButton.type = "button";
            i18n.bindText(clearButton, "site.clearNotifications");
            const exportButton = el("button", "md-button md-button--outlined");
            exportButton.type = "button";
            i18n.bindText(exportButton, "site.exportNotifications");
            const status = el("p", "mb-help");
            status.setAttribute("role", "status");
            status.setAttribute("aria-live", "polite");
            clearButton.addEventListener("click", async () => {
                const confirmed = await confirmDestructive(
                    i18n.t("site.clearNotificationsConfirm", {
                        count: notifications.list().length,
                    }),
                );
                if (!confirmed) return;
                notifications.clearAll();
                i18n.bindText(status, "site.notificationsCleared");
            });
            exportButton.addEventListener("click", () => {
                const lines = notifications
                    .list()
                    .map(
                        (record) =>
                            `- ${record.at.toISOString()} [${record.severity}] ${i18n.text(record.title)}${record.body === null ? "" : ` — ${i18n.text(record.body)}`}`,
                    );
                const blob = new Blob(
                    [`# ${i18n.t("site.notificationTitle")}\n\n${lines.join("\n")}\n`],
                    { type: "text/markdown;charset=utf-8" },
                );
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = "material-bluemap-notifications.md";
                link.click();
                URL.revokeObjectURL(url);
                i18n.bindText(status, "site.notificationsExported");
            });
            actions.append(clearButton, exportButton, status);
            view.appendChild(actions);
            host.replaceChildren(view);
            decoratePage(host, "notifications", appearance);
            return () => search.destroy();
        },
    });

    // The first focusable thing on the page: a real jump past the tab strip straight to the
    // page content, for keyboard and screen-reader visitors alike. Invisible until focused.
    const skipLink = el("a", "md-skip-link");
    skipLink.href = `#${MAIN_CONTENT_ID}`;
    i18n.bindText(skipLink, "shell.skipToContent");
    root.appendChild(skipLink);

    // The strip exposes its bar and its panel host separately, so the shell decides
    // the layout rather than the tab module dictating it. Wrapping the bar together with a
    // brand mark in one sticky, elevated topbar is what makes the strip read as the site's
    // own chrome rather than as one more row of content; the tab module's markup, classes
    // and behaviour are untouched by the wrapper.
    const topbar = el("div", "mb-shell-topbar");
    topbar.appendChild(createBrand(i18n, appearance, () => tabs.reveal("home")));
    topbar.appendChild(tabs.strip.bar);
    root.appendChild(topbar);

    const main = el("main", "mb-main");
    main.id = MAIN_CONTENT_ID;
    main.appendChild(tabs.strip.panels);
    root.appendChild(main);

    root.appendChild(createShellFooter(i18n, appearance));

    document.body.appendChild(
        createShellPalette({
            prefs,
            tabs,
            settingsView,
            shortcuts,
            i18n,
            appearance,
            openArticle: navigation.openArticle,
        }),
    );
    tabs.activate("home");

    // 10% per load, non-blocking, never focus-stealing, and there is deliberately no
    // setting to switch it off.
    maybeShowDimSum({ i18n, host: document.body });
}

/**
 * The site's own brand mark.
 *
 * It is a real control, not a logo pasted into the corner: it always returns the visitor to
 * Home, carries a localised accessible name, and is itself an appearance target with the
 * usual context-menu and Shift+right-click editor, exactly like every other element on the
 * page.
 */
function createBrand(
    i18n: I18n,
    appearance: AppearanceController,
    goHome: () => void,
): HTMLButtonElement {
    const brand = el("button", "mb-brand");
    brand.type = "button";

    const mark = el("span", "mb-brand-mark", "M");
    mark.setAttribute("aria-hidden", "true");
    brand.appendChild(mark);

    // The proper noun stays literal text; only the accessible label (below) is localised,
    // matching how every other proper noun on the site is handled.
    brand.appendChild(el("span", "mb-brand-word", "material-bluemap"));

    i18n.bindAttr(brand, "aria-label", "site.brandAria");
    brand.addEventListener("click", goHome);
    registerAppearanceTarget(
        brand,
        { kind: "card", instance: "brand", instanceLabel: "Site brand mark" },
        appearance,
    );
    return brand;
}

/**
 * The one honest line about hosting, repeated at the bottom of every page: no external
 * scripts, fonts, images or analytics. It is itself an appearance target, and its copy
 * follows the language mode and both funny levels exactly like the rest of the site.
 */
function createShellFooter(i18n: I18n, appearance: AppearanceController): HTMLElement {
    const footer = el("footer", "mb-shell-footer");
    const note = el("p", "mb-shell-footer-note");
    i18n.bindText(note, "shell.footerNote");
    footer.appendChild(note);
    registerAppearanceTarget(
        footer,
        { kind: "card", instance: "footer", instanceLabel: "Site footer" },
        appearance,
    );
    return footer;
}

function decoratePage(host: HTMLElement, pageId: string, appearance: AppearanceController): void {
    const target = host.firstElementChild;
    if (!(target instanceof HTMLElement)) return;
    // Do not reduce the appearance contract to the handful of elements that happen to look
    // like cards today. Every rendered element owns a surface, typeface, spacing, and state;
    // the shared traversal keeps headings, prose, summaries, table cells, and links editable
    // as well as controls. The registration is idempotent for elements already decorated by
    // a feature-specific editor (tabs, settings and the palette).
    const candidates = appearanceElements(target);
    candidates.forEach((element, index) => {
        if (element.dataset.mbKind !== undefined) return;
        const readable =
            element.getAttribute("aria-label") ??
            element.textContent?.trim().replace(/\s+/g, " ").slice(0, 72);
        registerAppearanceTarget(
            element,
            {
                kind: "card",
                instance: `page-${pageId}-${index}`,
                instanceLabel:
                    readable === undefined || readable === ""
                        ? `${pageId} element ${index + 1}`
                        : readable,
            },
            appearance,
        );
    });
}

function createShellPalette(options: {
    readonly prefs: Preferences;
    readonly tabs: TabsController;
    readonly settingsView: ReturnType<typeof createSettingsPage>;
    readonly shortcuts: ShortcutRegistry;
    readonly i18n: I18n;
    readonly appearance: AppearanceController;
    readonly openArticle: (articleRef: string) => void;
}): HTMLElement {
    const list = (): readonly PaletteCommand[] => [
        {
            id: "open-home",
            label: options.i18n.t("site.openHome"),
            description: options.i18n.t("site.descriptionHome"),
            kind: "page",
            run: () => options.tabs.reveal("home"),
        },
        {
            id: "open-docs",
            label: options.i18n.t("site.openDocs"),
            description: options.i18n.t("site.descriptionDocs"),
            kind: "page",
            run: () => options.tabs.reveal("docs"),
        },
        {
            id: "open-search",
            label: options.i18n.t("site.openSearch"),
            description: options.i18n.t("site.descriptionSearch"),
            kind: "page",
            run: () => options.tabs.reveal("search"),
        },
        {
            id: "open-changelog",
            label: options.i18n.t("site.openChangelog"),
            description: options.i18n.t("site.descriptionChangelog"),
            kind: "page",
            run: () => options.tabs.reveal("changelog"),
        },
        {
            id: "open-notifications",
            label: options.i18n.t("site.openNotifications"),
            description: options.i18n.t("site.descriptionNotifications"),
            kind: "command",
            run: () => options.tabs.reveal("notifications"),
        },
        {
            id: "open-settings",
            label: options.i18n.t("site.openSettings"),
            description: options.i18n.t("site.descriptionSettings"),
            kind: "page",
            run: () => options.tabs.reveal("settings"),
        },
        ...articlePaletteCommands(
            articles,
            (title) => options.i18n.t("site.openArticle", { title }),
            options.openArticle,
        ),
        ...options.settingsView.search.host.listSettings().map((setting) => ({
            id: `setting-${setting.id}`,
            label: setting.label,
            // A choice control's unselected option labels ride along here too, so typing "dark"
            // finds the theme setting even while "Light" is the one currently in force.
            description:
                setting.control?.kind === "choice"
                    ? `${setting.description} · ${setting.valueText} (${setting.control.options.map((option) => option.label).join(", ")})`
                    : `${setting.description} · ${setting.valueText}`,
            kind: "setting" as const,
            ...(setting.control === undefined ? {} : { control: setting.control }),
            run: () => {
                options.tabs.reveal("settings");
                options.settingsView.revealSetting(setting.id);
            },
        })),
        {
            id: "appearance-editor",
            label: options.i18n.t("site.editAppearance"),
            description: options.i18n.t("site.descriptionAppearance"),
            kind: "appearance",
            run: () => options.tabs.reveal("settings"),
        },
    ];
    const palette = createCommandPalette({ prefs: options.prefs, i18n: options.i18n, list });
    registerAppearanceTarget(
        palette.element,
        {
            kind: "card",
            instance: "command-palette",
            instanceLabel: options.i18n.t("site.commandPalette"),
        },
        options.appearance,
    );
    options.shortcuts.register({
        id: "palette.open",
        parts: ["Ctrl", "Shift", "F"],
        run: () => palette.open(),
    });
    return palette.element;
}

function safeBoot(): void {
    try {
        boot();
    } catch (error) {
        showBootFailure(error);
        throw error;
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", safeBoot, { once: true });
} else {
    safeBoot();
}
