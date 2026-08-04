import { el } from "../search/dom.js";
import { mountDocsSearch } from "../search/docsSearch.js";
import { mountSettingsSearch } from "../search/settingsSearch.js";
import {
    createBulkCloseControls,
    createMasterTabSearch,
    createTabGroupNameSearch,
    createTabGroupSearch,
    createTabStripSearch,
} from "../search/tabSearch.js";
import type {
    DocsSearchHost,
    SearchableTab,
    SearchableTabGroup,
    SearchableTabStrip,
    TabCloseReport,
    TabSearchHost,
} from "../search/contract.js";
import { searchableArticles } from "./search.js";
import type { SettingsPageView } from "../settings/page.js";
import type { TabsController } from "../tabs/index.js";
import { STRIP_ID } from "../tabs/index.js";
import type { I18n } from "../i18n/I18n.js";

/** The single discovery page keeps all independently-owned searches visible and independent. */
export function createDiscoveryView(options: {
    readonly tabs: TabsController;
    readonly settings: SettingsPageView;
    readonly i18n: I18n;
    readonly openArticle: (id: string, offset?: number) => void;
}): HTMLElement {
    const root = el("div", { class: "mb-discovery mb-page" });
    const title = el("h1", { class: "mb-page-title" });
    options.i18n.bindText(title, "site.discoveryTitle");
    const subtitle = el("p", { class: "mb-page-subtitle" });
    options.i18n.bindText(subtitle, "site.discoverySubtitle");
    root.append(title, subtitle);

    const docsHost: DocsSearchHost = {
        listArticles: () => searchableArticles(),
        openArticle: (id, offset) => options.openArticle(id, offset),
        subscribe: () => () => undefined,
    };
    const docsSection = el("section", { class: "mb-discovery-section" });
    const docsHeading = el("h2", { class: "mb-section-title" });
    options.i18n.bindText(docsHeading, "site.docsSearchHeading");
    docsSection.append(docsHeading);
    mountDocsSearch(docsSection, { host: docsHost, fieldId: "discover.docs" });
    root.append(docsSection);

    const settingsSection = el("section", { class: "mb-discovery-section" });
    const settingsHeading = el("h2", { class: "mb-section-title" });
    options.i18n.bindText(settingsHeading, "site.settingsSearchHeading");
    settingsSection.append(settingsHeading);
    mountSettingsSearch(settingsSection, { host: options.settings.search.host, fieldId: "discover.settings" });
    root.append(settingsSection);

    const tabHost: TabSearchHost = {
        listWindows: () => [{ id: "window-main", label: document.title || "Material Bluemap" }],
        listStrips: (): readonly SearchableTabStrip[] => [{ id: STRIP_ID, label: "Main tabs", windowId: "window-main", windowLabel: document.title || "Material Bluemap" }],
        listGroups: (): readonly SearchableTabGroup[] => options.tabs.listGroups().map((group) => ({
            id: group.id,
            label: group.name,
            stripId: STRIP_ID,
            stripLabel: "Main tabs",
            windowId: "window-main",
            windowLabel: document.title || "Material Bluemap",
            collapsed: group.collapsed,
            tabCount: options.tabs.listPages().filter((tab) => tab.groupId === group.id && !tab.closed).length,
        })),
        listTabs: (): readonly SearchableTab[] => options.tabs.listPages().filter((tab) => !tab.closed).map((tab) => ({
            id: tab.tabId,
            label: tab.label,
            title: tab.label,
            stripId: STRIP_ID,
            stripLabel: "Main tabs",
            windowId: "window-main",
            windowLabel: tab.windowLabel,
            groupId: tab.groupId,
            groupLabel: tab.groupName,
            groupCollapsed: tab.groupCollapsed,
            pinned: tab.pinned,
            active: options.tabs.model.active === tab.tabId,
        })),
        activeStripId: () => STRIP_ID,
        activateTab: (id) => options.tabs.activate(id),
        revealTab: (id) => options.tabs.reveal(id),
        revealGroup: (id) => {
            const first = options.tabs.listPages().find((tab) => tab.groupId === id && !tab.closed);
            if (first !== undefined) options.tabs.reveal(first.tabId);
        },
        closeTabs: async (ids): Promise<TabCloseReport> => {
            const closed: string[] = [];
            const excluded: { id: string; reason: "pinned" | "unsaved-work" | "protected" | "not-found" }[] = [];
            const failed: { id: string; message: string }[] = [];
            for (const id of ids) {
                if (!options.tabs.model.isOpen(id)) { failed.push({ id, message: "Tab is no longer open." }); continue; }
                if (!options.tabs.model.isClosable(id)) { excluded.push({ id, reason: "protected" }); continue; }
                if (options.tabs.model.close(id)) closed.push(id);
                else failed.push({ id, message: "The tab refused to close." });
            }
            return { closed, excluded, failed };
        },
        subscribe: (listener) => options.tabs.model.subscribe(listener),
    };

    const tabSection = el("section", { class: "mb-discovery-section" });
    const tabHeading = el("h2", { class: "mb-section-title" });
    options.i18n.bindText(tabHeading, "site.tabDiscoveryHeading");
    tabSection.append(tabHeading);
    const current = el("div", { class: "mb-discovery-grid" });
    current.append(
        labelled(options.i18n.t("site.currentStrip"), createTabStripSearch({ host: tabHost }).element),
        labelled(options.i18n.t("site.tabGroups"), createTabGroupNameSearch({ host: tabHost }).element),
        labelled(options.i18n.t("site.everyOpenTab"), createMasterTabSearch({ host: tabHost }).element),
    );
    for (const group of tabHost.listGroups()) {
        current.append(labelled(options.i18n.t("site.groupPrefix", { name: group.label }), createTabGroupSearch({ host: tabHost, groupId: group.id, groupLabel: group.label }).element));
    }
    tabSection.append(current);
    const bulkHeading = el("h3", { class: "mb-section-title" });
    options.i18n.bindText(bulkHeading, "site.bulkCloseHeading");
    tabSection.append(bulkHeading);
    tabSection.append(createBulkCloseControls({ host: tabHost }).element);
    root.append(tabSection);
    return root;
}

function labelled(label: string, node: HTMLElement): HTMLElement {
    const wrapper = el("article", { class: "mb-discovery-card" });
    wrapper.append(el("h3", { class: "mb-card-title", text: label }), node);
    return wrapper;
}
