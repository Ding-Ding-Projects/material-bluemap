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
    RepoCapture,
} from "./content/index.js";
import { maybeShowDimSum } from "./dimsum/index.js";
import { I18n } from "./i18n/I18n.js";
import { Notifications } from "./notifications/Notifications.js";
import { Preferences } from "./platform/Preferences.js";
import { RegexBuilderSlot } from "./platform/RegexBuilderSlot.js";
import { ShortcutRegistry } from "./platform/shortcuts.js";
import { createSettingsPage } from "./settings/index.js";
import { appendInlineContent, renderBlocks } from "./shell/renderBlocks.js";
import { TabModel } from "./tabs/TabModel.js";
import { TabsController } from "./tabs/index.js";
import { ThemeController } from "./theme/ThemeController.js";

/* -------------------------------------------------------------------------- */
/* Small DOM helpers                                                          */
/* -------------------------------------------------------------------------- */

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string
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
    readonly openArticle: (articleId: string) => void;
    /** Open one of the content tabs by id. */
    readonly openPage: (pageId: string) => void;
}

/* ---- Home ---------------------------------------------------------------- */

function renderHero(host: HTMLElement): void {
    const hero = el("header", "mb-hero");
    hero.appendChild(el("h1", "mb-hero-title", home.title));
    hero.appendChild(el("p", "mb-hero-tagline", home.tagline));
    hero.appendChild(el("p", "mb-hero-summary", home.summary));

    // The download button is absent, never wrong: if no verified release with a real
    // installer was found at build time, the page says so instead of guessing a URL.
    if (releaseAvailability.available) {
        const release = releaseAvailability.release;
        hero.appendChild(el("p", "mb-download-lead", downloadCopy.availableLead));

        const download = el("a", "mb-download");
        download.href = release.installer.url;
        download.textContent = downloadButtonLabel(release);
        download.setAttribute("aria-label", downloadAccessibleName(release));
        download.rel = "noopener noreferrer";
        hero.appendChild(download);

        hero.appendChild(el("p", "mb-download-detail", downloadDetailLine(release)));
    } else {
        hero.appendChild(el("h2", "mb-download-heading", downloadCopy.unavailableHeading));
        hero.appendChild(el("p", "mb-download-detail", downloadCopy.unavailableLead));
        hero.appendChild(el("p", "mb-download-detail", releaseAvailability.reason));

        const link = el("a", "mb-download-link", downloadCopy.unavailableLinkLabel);
        link.href = downloadCopy.unavailableLinkHref;
        link.rel = "noopener noreferrer";
        hero.appendChild(link);
    }
    hero.appendChild(el("p", "mb-download-caveat", downloadCopy.caveat));
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
function articleButton(articleId: string, navigation: PageNavigation, label?: string): HTMLButtonElement {
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
        status.appendChild(el("span", `mb-status mb-phase-${row.status}`, PHASE_STATUS_LABELS[row.status]));
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

function renderHome(host: HTMLElement, navigation: PageNavigation): void {
    const root = page(host);

    renderHero(root);

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
            contentPages.find((contentPage) => contentPage.id === "docs")?.description ?? ""
        )
    );

    for (const category of articleCategoryOrder) {
        const inCategory = articlesInCategory(category);
        if (inCategory.length === 0) continue;

        const wrapper = section(root, ARTICLE_CATEGORY_LABELS[category]);
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
                body.appendChild(el("h3", "mb-article-section", articleSection.title));
                const prose = el("div", "mb-prose");
                renderBlocks(prose, articleSection.blocks);
                body.appendChild(prose);
            }

            if (article.suggested.length > 0) {
                body.appendChild(el("h3", "mb-article-section", "Suggested articles"));
                const list = el("ul", "mb-prose-list");
                for (const suggestion of article.suggested) {
                    const target = findArticle(suggestion.articleId);
                    const li = el("li");
                    li.appendChild(el("strong", undefined, target?.title ?? suggestion.articleId));
                    li.appendChild(document.createTextNode(`: ${suggestion.reason}`));
                    list.appendChild(li);
                }
                body.appendChild(list);
            }

            // Sources were modelled and never rendered, which made every article's
            // evidence unreachable from the article that leaned on it.
            body.appendChild(el("h3", "mb-article-section", "Sources"));
            body.appendChild(linkList(article.sources));

            details.appendChild(body);
            wrapper.appendChild(details);
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
        const committed = section(root, screenshotsCopy.committedHeading, screenshotsCopy.committedLead);
        const grid = el("div", "mb-shot-grid");
        for (const capture of repoCaptures) grid.appendChild(captureFigure(capture, "mb-shot"));
        committed.appendChild(grid);
        renderProvenance(committed);
    }

    if (!screenshotAvailability.available) {
        // Say plainly that the fetched captures are missing rather than showing
        // placeholders that would read as the product.
        const missing = section(root, screenshotsCopy.unavailableHeading, screenshotsCopy.unavailableLead);
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
            `The mount point #${ROOT_ID} is missing from index.html, so there is nowhere to render.`
        );
    }
    root.replaceChildren();

    const prefs = new Preferences();
    const i18n = new I18n(prefs);
    const theme = new ThemeController(prefs);
    const appearance = new AppearanceController(prefs);
    const shortcuts = new ShortcutRegistry();
    const regex = new RegexBuilderSlot();

    const notificationHost = el("div", "mb-notification-host");
    document.body.appendChild(notificationHost);
    const notifications = new Notifications(i18n, notificationHost);

    const model = new TabModel(prefs, i18n);
    const tabs = new TabsController({ i18n, model, notifications, shortcuts, regex });

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
        openArticle: (articleId) => {
            tabs.reveal("docs");
            const target = document.getElementById(articleElementId(articleId));
            if (!(target instanceof HTMLDetailsElement)) return;
            target.open = true;
            // A summary is focusable already. Giving it a tabindex of -1 to focus it would
            // take it out of the tab order for good, which is a worse defect than the one
            // it would be fixing.
            const summary = target.querySelector("summary");
            if (summary instanceof HTMLElement) summary.focus({ preventScroll: true });
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            target.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
            // The same "look here" flash the search results use, so arriving from a card
            // and arriving from a search feel like the same thing.
            target.classList.add("mb-flash");
            window.setTimeout(() => target.classList.remove("mb-flash"), 2000);
        },
    };

    for (const contentPage of contentPages) {
        const render = (host: HTMLElement): void => {
            if (contentPage.id === "home") renderHome(host, navigation);
            else if (contentPage.id === "docs") renderDocs(host);
            else renderScreenshots(host);
        };
        tabs.registerPage({
            id: contentPage.id,
            label: { text: contentPage.title },
            // Home is the one page a visitor should never be able to close themselves
            // out of, so it is pinned and excluded from bulk closes.
            pinned: contentPage.id === "home",
            closable: contentPage.id !== "home",
            render,
        });
    }

    tabs.registerPage({
        id: "settings",
        label: { text: "Settings" },
        closable: true,
        render: (host) => {
            const view = createSettingsPage({ prefs, appearance, theme });
            host.replaceChildren(view.element);
            return () => view.destroy();
        },
    });

    // The strip exposes its bar and its panel host separately, so the shell decides
    // the layout rather than the tab module dictating it.
    root.appendChild(tabs.strip.bar);
    const main = el("main", "mb-main");
    main.appendChild(tabs.strip.panels);
    root.appendChild(main);
    tabs.activate("home");

    // 10% per load, non-blocking, never focus-stealing, and there is deliberately no
    // setting to switch it off.
    maybeShowDimSum({ i18n, host: document.body });
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
