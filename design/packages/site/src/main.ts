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

import { AppearanceController } from "./appearance/index.js";
import {
    ARTICLE_CATEGORY_LABELS,
    FEATURE_STATUS_LABELS,
    articleCategoryOrder,
    articles,
    articlesInCategory,
    captureCaption,
    contentPages,
    downloadAccessibleName,
    downloadButtonLabel,
    downloadDetailLine,
    downloadCopy,
    groupCaptures,
    home,
    releaseAvailability,
    screenshotAvailability,
    screenshotUrl,
    screenshotsCopy,
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

function section(host: HTMLElement, heading: string): HTMLElement {
    const wrapper = el("section", "mb-section");
    wrapper.appendChild(el("h2", "mb-section-title", heading));
    host.appendChild(wrapper);
    return wrapper;
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

function renderHome(host: HTMLElement): void {
    host.replaceChildren();

    const hero = el("header", "mb-hero");
    hero.appendChild(el("h1", "mb-hero-title", home.title));
    hero.appendChild(el("p", "mb-hero-tagline", home.tagline));

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

    const intro = el("div", "mb-prose");
    renderBlocks(intro, home.intro);
    host.appendChild(intro);

    const works = section(host, "What works today");
    const worksList = el("ul", "mb-prose-list");
    for (const item of home.worksToday) worksList.appendChild(el("li", undefined, item));
    works.appendChild(worksList);

    const notYet = section(host, "What does not work yet");
    const notYetList = el("ul", "mb-prose-list");
    for (const item of home.notYet) notYetList.appendChild(el("li", undefined, item));
    notYet.appendChild(notYetList);

    const highlights = section(host, "Highlights");
    const grid = el("div", "mb-card-grid");
    for (const highlight of home.highlights) {
        const card = el("article", "mb-card");
        card.appendChild(el("h3", "mb-card-title", highlight.title));
        const body = el("div", "mb-prose");
        renderBlocks(body, [{ kind: "paragraph", content: highlight.body }]);
        card.appendChild(body);
        grid.appendChild(card);
    }
    highlights.appendChild(grid);

    const phases = section(host, "Phase status");
    const scroll = el("div", "mb-table-scroll");
    const table = el("table", "mb-prose-table");
    const caption = el("caption", undefined, "Port progress by phase");
    table.appendChild(caption);
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
        tr.appendChild(el("td", undefined, row.phase));
        tr.appendChild(el("td", undefined, row.scope));
        tr.appendChild(el("td", undefined, row.status));
        tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    phases.appendChild(scroll);
    const phaseNote = el("p", "mb-prose-p mb-note");
    appendInlineContent(phaseNote, home.phaseNote);
    phases.appendChild(phaseNote);

    const build = section(host, "Build it yourself");
    const buildProse = el("div", "mb-prose");
    renderBlocks(buildProse, home.buildIt);
    build.appendChild(buildProse);
}

function renderDocs(host: HTMLElement): void {
    host.replaceChildren();
    host.appendChild(el("h1", "mb-page-title", "Documentation"));
    host.appendChild(
        el(
            "p",
            "mb-page-subtitle",
            contentPages.find((page) => page.id === "docs")?.description ?? ""
        )
    );

    for (const category of articleCategoryOrder) {
        const inCategory = articlesInCategory(category);
        if (inCategory.length === 0) continue;

        const wrapper = section(host, ARTICLE_CATEGORY_LABELS[category]);
        for (const article of inCategory) {
            const details = el("details", "mb-article");
            const summary = el("summary", "mb-article-summary");

            summary.appendChild(el("span", "mb-article-title", article.title));
            // The status badge is not decoration. A documentation site that reads the
            // same for shipped and unbuilt features misleads by default.
            const badge = el(
                "span",
                `mb-status mb-status-${article.status}`,
                FEATURE_STATUS_LABELS[article.status]
            );
            summary.appendChild(badge);
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
                    const target = articles.find((a) => a.id === suggestion.articleId);
                    const li = el("li");
                    li.appendChild(el("strong", undefined, target?.title ?? suggestion.articleId));
                    li.appendChild(document.createTextNode(`: ${suggestion.reason}`));
                    list.appendChild(li);
                }
                body.appendChild(list);
            }

            details.appendChild(body);
            wrapper.appendChild(details);
        }
    }
}

function renderScreenshots(host: HTMLElement): void {
    host.replaceChildren();
    host.appendChild(el("h1", "mb-page-title", "Screenshots"));

    host.appendChild(el("p", "mb-page-subtitle", screenshotsCopy.lead));

    if (!screenshotAvailability.available) {
        // Say plainly that captures are missing rather than showing placeholders that
        // would read as the product.
        host.appendChild(el("h2", "mb-section-title", screenshotsCopy.unavailableHeading));
        host.appendChild(el("p", "mb-prose-p", screenshotsCopy.unavailableLead));
        host.appendChild(el("p", "mb-prose-p", screenshotAvailability.reason));

        const link = el("a", "mb-download-link", screenshotsCopy.unavailableLinkLabel);
        link.href = screenshotsCopy.unavailableLinkHref;
        link.rel = "noopener noreferrer";
        host.appendChild(link);
        return;
    }

    host.appendChild(el("p", "mb-prose-p mb-note", screenshotsCopy.caveat));
    const publicPath = screenshotAvailability.publicPath;

    for (const group of groupCaptures(screenshotAvailability.captures)) {
        const wrapper = section(host, group.title);
        const grid = el("div", "mb-shot-grid");
        for (const capture of group.captures) {
            const figure = el("figure", "mb-shot");
            const img = el("img", "mb-shot-image");
            img.src = screenshotUrl(publicPath, capture.file);
            img.alt = captureCaption(capture);
            img.loading = "lazy";
            figure.appendChild(img);
            figure.appendChild(el("figcaption", "mb-shot-caption", captureCaption(capture)));
            grid.appendChild(figure);
        }
        wrapper.appendChild(grid);
    }
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

function boot(): void {
    const root = document.getElementById("app");
    if (root === null) throw new Error("#app is missing from index.html");
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

    for (const page of contentPages) {
        const render =
            page.id === "home" ? renderHome : page.id === "docs" ? renderDocs : renderScreenshots;
        tabs.registerPage({
            id: page.id,
            label: { text: page.title },
            // Home is the one page a visitor should never be able to close themselves
            // out of, so it is pinned and excluded from bulk closes.
            pinned: page.id === "home",
            closable: page.id !== "home",
            render: (host) => {
                render(host);
            },
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

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
    boot();
}
