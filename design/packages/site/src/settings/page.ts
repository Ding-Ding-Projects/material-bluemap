/**
 * The settings page.
 *
 * Tabs across the top, one panel each, every row built from the declaration in
 * `schema.ts`. Every row carries its own reset, the page carries a global one, and
 * the search field at the top searches every tab rather than only the one on
 * screen: a visitor who knows a setting's name should not have to know which tab
 * it lives under.
 *
 * The search field is owned here; the regex builder is not. `SettingsSearchHooks`
 * is the whole boundary, and `settings/README` documents how the search module
 * attaches to it.
 */

import { clear, el, uniqueId } from "../platform/dom.js";
import { announce, flashAttention } from "./dom.js";
import { fillPhrase, searchableText, setI18nState, subscribeI18n, t } from "./i18n.js";
import type { FunnyLevel, LanguageMode } from "./i18n.js";
import type { Preferences } from "../platform/Preferences.js";
import type { ThemeController } from "../theme/ThemeController.js";
import { THEME_MODES, DENSITIES } from "../theme/ThemeController.js";
import type { SearchableSetting, SettingsSearchHost } from "../search/contract.js";
import { attachRegexBuilder } from "../search/attachBuilder.js";
import { SettingsStore } from "./store.js";
import { SETTINGS, SETTINGS_TABS } from "./schema.js";
import type { ActionSetting, SettingDefinition, SettingsTab } from "./types.js";
import { isStoredSetting } from "./types.js";
import { confirmDestructive } from "./confirm.js";
import type { AppearanceController } from "../appearance/controller.js";
import { APPEARANCE_TARGETS } from "../appearance/model.js";
import { openAppearanceEditor } from "../appearance/editor/appearanceEditor.js";
import { registerAppearanceTarget } from "../appearance/editor/contextMenu.js";
import { createPresetsPanel } from "../appearance/presetsPanel.js";
import type { ControlRow } from "../appearance/editor/controls.js";
import {
    colorRow,
    fontRow,
    numberRow,
    selectRow,
    sliderRow,
    textRow,
    toggleRow,
} from "../appearance/editor/controls.js";
import { downloadFile, pickFile } from "./dom.js";

/**
 * What the search module attaches to.
 *
 * `input` is the field the visitor types in. `builderSlot` is an empty container
 * inside the field, sized for a trigger button, and `anchorHost` is the element an
 * anchored builder panel should hang off so it stays visually attached to this
 * field rather than to the page.
 *
 * `setMatcher` installs a predicate that replaces the built-in plain-text one.
 * Passing `null` restores plain text, which stays the default until the visitor
 * deliberately turns regular expressions on.
 */
export interface SettingsSearchHooks {
    readonly input: HTMLInputElement;
    readonly builderSlot: HTMLElement;
    readonly anchorHost: HTMLElement;
    readonly host: SettingsSearchHost;
    setMatcher(matcher: ((setting: SearchableSetting) => boolean) | null): void;
    /** Report that the current pattern is invalid, so the page says so instead of filtering. */
    setInvalid(invalid: boolean): void;
    onQueryChange(listener: (query: string) => void): () => void;
    rerun(): void;
}

export interface SettingsPageOptions {
    readonly prefs: Preferences;
    readonly appearance: AppearanceController;
    /** When supplied the theme setting drives this controller instead of storing a copy. */
    readonly theme?: ThemeController | undefined;
}

export interface SettingsPageView {
    readonly element: HTMLElement;
    readonly store: SettingsStore;
    readonly search: SettingsSearchHooks;
    activateTab(tabId: string): void;
    revealSetting(id: string): void;
    refresh(): void;
    destroy(): void;
}

export function createSettingsPage(options: SettingsPageOptions): SettingsPageView {
    const store = new SettingsStore(options.prefs);
    store.register(SETTINGS);
    installBridges(store, options);

    const rows = new Map<string, { row: ControlRow; container: HTMLElement; tabId: string }>();
    const tabButtons = new Map<string, HTMLButtonElement>();
    const tabBadges = new Map<string, HTMLElement>();
    const panels = new Map<string, HTMLElement>();
    const disposers: (() => void)[] = [];

    let activeTab = SETTINGS_TABS[0]?.id ?? "general";
    let matcher: ((setting: SearchableSetting) => boolean) | null = null;
    let invalidPattern = false;
    let query = "";
    const queryListeners = new Set<(value: string) => void>();

    const root = el("div", {
        class: "mb-settings",
        data: { mbKind: "settings-surface" },
    });

    /* ---------------------------------------------------------- *
     * Header
     * ---------------------------------------------------------- */

    const heading = el("h1", { class: "mb-settings-title" });
    const subtitle = el("p", { class: "mb-settings-subtitle" });
    const storageNotice = el("p", {
        class: "mb-capability-note",
        attrs: { role: "status", hidden: "" },
    });
    const changedNotice = el("p", { class: "mb-settings-changed", attrs: { role: "status" } });

    root.append(el("header", { class: "mb-settings-header" }, heading, subtitle, storageNotice, changedNotice));

    /* ---------------------------------------------------------- *
     * Search
     * ---------------------------------------------------------- */

    const searchId = uniqueId("mb-settings-search");
    const searchInput = el("input", {
        class: "md-field__input mb-search-input",
        attrs: {
            id: searchId,
            type: "search",
            autocomplete: "off",
            spellcheck: "false",
            "aria-describedby": `${searchId}-hint`,
        },
    });
    const builderSlot = el("span", { class: "mb-search-builder-slot" });
    const searchField = el(
        "div",
        { class: "mb-search-field" },
        searchInput,
        builderSlot
    );
    const searchLabel = el("label", { class: "md-field__label", attrs: { for: searchId } });
    const searchHint = el("p", { class: "md-field__help mb-help", attrs: { id: `${searchId}-hint` } });
    const searchSummary = el("div", { class: "mb-search-summary", attrs: { role: "status" } });
    const clearSearch = el("button", {
        class: "md-icon-button",
        text: "Clear",
        attrs: { type: "button" },
    });
    clearSearch.addEventListener("click", () => {
        searchInput.value = "";
        setQuery("");
        searchInput.focus();
    });

    root.append(
        el(
            "div",
            { class: "mb-search-row", data: { mbKind: "toolbar" } },
            searchLabel,
            searchField,
            clearSearch
        ),
        searchHint,
        searchSummary
    );

    searchInput.addEventListener("input", () => {
        setQuery(searchInput.value);
    });

    const installMatcher = (next: ((setting: SearchableSetting) => boolean) | null): void => {
        matcher = next;
        applyFilter();
    };
    const markInvalidPattern = (invalid: boolean): void => {
        invalidPattern = invalid;
        applyFilter();
    };

    // The settings field owns its filter, but the regex builder belongs to this exact
    // field as well.  Keep plain text as the default and only install a matcher after
    // the visitor deliberately switches the adjacent builder to regex mode.
    const attachedSearchBuilder = attachRegexBuilder(searchInput, {
        fieldId: "settings.page",
        fieldLabel: "Search settings",
        container: builderSlot,
        sampleProvider: () => searchableSettings().map((setting) => setting.label).join("\n"),
        onChange: (spec) => {
            if (spec.mode !== "regex") {
                markInvalidPattern(false);
                installMatcher(null);
                return;
            }
            if (!spec.valid) {
                markInvalidPattern(true);
                installMatcher(null);
                return;
            }
            try {
                const expression = new RegExp(spec.query, spec.flags);
                markInvalidPattern(false);
                installMatcher((setting) => expression.test([
                    setting.label,
                    setting.description,
                    setting.valueText,
                    setting.tabLabel,
                    setting.sectionLabel ?? "",
                    ...(setting.keywords ?? []),
                ].join(" ")));
            } catch {
                markInvalidPattern(true);
                installMatcher(null);
            }
        },
    });
    disposers.push(() => attachedSearchBuilder.destroy());

    function setQuery(value: string): void {
        query = value;
        for (const listener of [...queryListeners]) listener(value);
        applyFilter();
    }

    /* ---------------------------------------------------------- *
     * Tabs
     * ---------------------------------------------------------- */

    const tablist = el("div", {
        class: "mb-tabstrip",
        data: { mbKind: "tab-strip" },
        attrs: { role: "tablist" },
    });
    const panelHost = el("div", { class: "mb-settings-panels" });
    root.append(tablist, panelHost);

    for (const tab of SETTINGS_TABS) {
        const button = el("button", {
            class: "mb-tab",
            data: { mbKind: "tab", mbStyle: `tab#settings-${tab.id}` },
            attrs: {
                type: "button",
                role: "tab",
                id: `mb-tab-${tab.id}`,
                "aria-controls": `mb-panel-${tab.id}`,
            },
        });
        const label = el("span", { class: "mb-tab-label" });
        const badge = el("span", { class: "mb-tab-badge", attrs: { hidden: "" } });
        button.append(label, badge);
        button.addEventListener("click", () => {
            activateTab(tab.id);
        });
        button.addEventListener("keydown", (event) => {
            handleTabKey(event, tab.id);
        });
        // Settings tabs are themable elements like any other, and carry the same
        // context menu and keyboard path as a tab anywhere else on the site.
        disposers.push(
            registerAppearanceTarget(
                button,
                {
                    kind: "tab",
                    instance: `settings-${tab.id}`,
                    instanceLabel: t(tab.labelKey),
                },
                options.appearance
            )
        );
        tabButtons.set(tab.id, button);
        tabBadges.set(tab.id, badge);
        tablist.append(button);

        const panel = el("section", {
            class: "mb-settings-panel",
            attrs: {
                role: "tabpanel",
                id: `mb-panel-${tab.id}`,
                "aria-labelledby": `mb-tab-${tab.id}`,
                tabindex: "0",
            },
        });
        panels.set(tab.id, panel);
        panelHost.append(panel);
        buildPanel(tab, panel);
    }

    function handleTabKey(event: KeyboardEvent, tabId: string): void {
        const ids = SETTINGS_TABS.map((tab) => tab.id);
        const index = ids.indexOf(tabId);
        let next: string | undefined;
        switch (event.key) {
            case "ArrowRight":
                next = ids[(index + 1) % ids.length];
                break;
            case "ArrowLeft":
                next = ids[(index - 1 + ids.length) % ids.length];
                break;
            case "Home":
                next = ids[0];
                break;
            case "End":
                next = ids[ids.length - 1];
                break;
            default:
                return;
        }
        if (next === undefined) return;
        event.preventDefault();
        activateTab(next);
        tabButtons.get(next)?.focus();
    }

    /* ---------------------------------------------------------- *
     * Panels
     * ---------------------------------------------------------- */

    function buildPanel(tab: SettingsTab, panel: HTMLElement): void {
        if (tab.descriptionKey !== undefined) {
            const description = el("p", { class: "md-field__help mb-help" });
            fillPhrase(description, tab.descriptionKey);
            panel.append(description);
        }

        for (const group of tab.groups) {
            const section = el("section", {
                class: "mb-settings-group",
                data: { mbKind: "card" },
            });
            const groupHeading = el("h2", { class: "mb-section-title" });
            fillPhrase(groupHeading, group.labelKey);
            section.append(groupHeading);

            for (const definition of SETTINGS) {
                if (definition.tab !== tab.id || definition.group !== group.id) continue;
                const container = el("div", { class: "mb-setting" });
                const row = buildRowFor(definition);
                container.append(row.element);
                section.append(container);
                rows.set(definition.id, { row, container, tabId: tab.id });
            }

            if (tab.id === "appearance" && group.id === "elements") {
                section.append(buildElementsList());
            }
            if (tab.id === "appearance" && group.id === "presets") {
                const presets = createPresetsPanel({
                    controller: options.appearance,
                    settingsSnapshot: () => store.snapshot(),
                    applySettings: (values) => store.import({ values }).applied.length,
                    confirmDestructive,
                });
                section.append(presets.element);
            }
            if (tab.id === "data" && group.id === "transfer") {
                section.append(buildTransfer());
            }
            if (tab.id === "data" && group.id === "resetGroup") {
                section.append(buildGlobalReset());
            }

            panel.append(section);
        }
    }

    function buildRowFor(definition: SettingDefinition): ControlRow {
        if (!isStoredSetting(definition)) {
            return actionRow(definition);
        }
        const base = {
            labelKey: definition.labelKey,
            descriptionKey: definition.descriptionKey,
            onReset: (): void => {
                store.reset(definition.id);
                announce(t("settings.resetOneDone", { name: t(definition.labelKey) }));
            },
            isDefault: (): boolean => store.isDefault(definition.id),
        };
        switch (definition.kind) {
            case "toggle":
                return toggleRow({
                    ...base,
                    read: () => store.getBoolean(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                });
            case "select":
                return selectRow({
                    ...base,
                    choices: definition.options,
                    read: () => store.getString(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                });
            case "slider":
                return sliderRow({
                    ...base,
                    min: definition.min,
                    max: definition.max,
                    step: definition.step,
                    read: () => store.getNumber(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                    valueText:
                        definition.stopLabelKeyPrefix === undefined
                            ? undefined
                            : (value) => t(`${definition.stopLabelKeyPrefix}.${value}`),
                });
            case "number":
                return numberRow({
                    ...base,
                    min: definition.min,
                    max: definition.max,
                    step: definition.step,
                    unit: definition.unit,
                    read: () => store.getNumber(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                });
            case "text":
                return textRow({
                    ...base,
                    maxLength: definition.maxLength,
                    read: () => store.getString(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                });
            case "color":
                return colorRow({
                    ...base,
                    prefs: options.prefs,
                    read: () => store.getString(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                });
            case "font":
                return fontRow({
                    ...base,
                    families: () =>
                        definition.monospaceOnly === true
                            ? options.appearance.families().filter((family) => family.monospace)
                            : options.appearance.families(),
                    requestInstalled: () => options.appearance.requestInstalledFonts(),
                    installedNoteKey: () => options.appearance.installedNoteKey(),
                    read: () => store.getString(definition.id),
                    write: (value) => {
                        store.set(definition.id, value);
                    },
                });
        }
    }

    function actionRow(definition: ActionSetting): ControlRow {
        const button = el("button", {
            class: definition.destructive
                ? "md-button md-button--outlined md-button--danger"
                : "md-button md-button--tonal",
            text: t(definition.actionLabelKey),
            attrs: { type: "button" },
        });
        button.addEventListener("click", () => {
            void definition.run();
        });
        const label = el("span", { class: "md-field__label" });
        fillPhrase(label, definition.labelKey);
        const element = el("div", { class: "mb-property-row" }, label, button);
        if (definition.descriptionKey !== undefined) {
            const description = el("p", { class: "md-field__help mb-help" });
            fillPhrase(description, definition.descriptionKey);
            element.append(description);
        }
        return { element, refresh: () => undefined };
    }

    /* ---------------------------------------------------------- *
     * Appearance: element list
     * ---------------------------------------------------------- */

    function buildElementsList(): HTMLElement {
        const wrapper = el("div", { class: "mb-elements" });
        const help = el("p", { class: "md-field__help mb-help" });
        fillPhrase(help, "elements.help");
        wrapper.append(help);

        const list = el("ul", { class: "mb-element-list" });
        for (const target of APPEARANCE_TARGETS) {
            const item = el("li", { class: "mb-element-item" });
            const name = el("span", { class: "mb-element-name", text: t(target.labelKey) });
            const status = el("span", { class: "mb-element-status" });
            const edit = el("button", {
                class: "md-button md-button--tonal",
                text: t("elements.edit", { name: t(target.labelKey) }),
                attrs: { type: "button" },
            });
            edit.addEventListener("click", () => {
                openAppearanceEditor({
                    anchor: edit,
                    kind: target.id,
                    controller: options.appearance,
                });
            });
            const refreshStatus = (): void => {
                status.textContent = options.appearance.store.has(target.id)
                    ? t("elements.customised")
                    : t("elements.default");
                status.dataset["customised"] = options.appearance.store.has(target.id)
                    ? "true"
                    : "false";
            };
            refreshStatus();
            disposers.push(options.appearance.store.subscribe(refreshStatus));
            item.append(el("span", { class: "mb-element-meta" }, name, status), edit);
            list.append(item);
        }
        wrapper.append(list);
        return wrapper;
    }

    /* ---------------------------------------------------------- *
     * Data tab
     * ---------------------------------------------------------- */

    function buildTransfer(): HTMLElement {
        const wrapper = el("div", { class: "mb-transfer" });
        const status = el("p", { class: "md-field__help mb-help", attrs: { role: "status" } });

        const exportButton = el("button", {
            class: "md-button md-button--tonal",
            text: t("action.exportSettings.button"),
            attrs: { type: "button" },
        });
        exportButton.addEventListener("click", () => {
            const stamp = new Date().toISOString().slice(0, 10);
            downloadFile(
                `material-bluemap-settings-${stamp}.json`,
                `${JSON.stringify({ version: 1, values: store.snapshot() }, null, 4)}\n`,
                "application/json"
            );
        });

        const importButton = el("button", {
            class: "md-button md-button--tonal",
            text: t("action.importSettings.button"),
            attrs: { type: "button" },
        });
        importButton.addEventListener("click", () => {
            void (async (): Promise<void> => {
                const text = await pickFile("application/json,.json");
                if (text === null) return;
                let parsed: unknown;
                try {
                    parsed = JSON.parse(text);
                } catch {
                    status.textContent = t("action.importFailed");
                    announce(status.textContent);
                    return;
                }
                const report = store.import(parsed);
                status.textContent = t("action.importDone", {
                    applied: report.applied.length,
                    preserved: report.preserved.length,
                    rejected: report.rejected.length,
                });
                announce(status.textContent);
                refresh();
            })();
        });

        const exportLabel = el("span", { class: "md-field__label" });
        fillPhrase(exportLabel, "action.exportSettings");
        const exportHelp = el("p", { class: "md-field__help mb-help" });
        fillPhrase(exportHelp, "action.exportSettings.desc");
        const importLabel = el("span", { class: "md-field__label" });
        fillPhrase(importLabel, "action.importSettings");
        const importHelp = el("p", { class: "md-field__help mb-help" });
        fillPhrase(importHelp, "action.importSettings.desc");

        wrapper.append(
            el("div", { class: "mb-property-row" }, exportLabel, exportButton),
            exportHelp,
            el("div", { class: "mb-property-row" }, importLabel, importButton),
            importHelp,
            status
        );
        return wrapper;
    }

    function buildGlobalReset(): HTMLElement {
        const wrapper = el("div", { class: "mb-transfer" });
        const label = el("span", { class: "md-field__label" });
        fillPhrase(label, "action.resetAll");
        const help = el("p", { class: "md-field__help mb-help" });
        fillPhrase(help, "action.resetAll.desc");
        const status = el("p", { class: "md-field__help mb-help", attrs: { role: "status" } });

        const button = el("button", {
            class: "md-button md-button--outlined md-button--danger",
            text: t("action.resetAll.button"),
            attrs: { type: "button" },
        });
        button.addEventListener("click", () => {
            void (async (): Promise<void> => {
                const confirmed = await confirmDestructive(t("action.resetAll.desc"));
                if (!confirmed) return;
                store.resetAll();
                options.appearance.store.resetAllElements();
                status.textContent = t("action.resetAll.done");
                announce(status.textContent);
                refresh();
            })();
        });

        wrapper.append(el("div", { class: "mb-property-row" }, label, button), help, status);
        return wrapper;
    }

    /* ---------------------------------------------------------- *
     * Search behaviour
     * ---------------------------------------------------------- */

    function searchableSettings(): readonly SearchableSetting[] {
        return SETTINGS.filter(isStoredSetting).map((definition) => {
            const tab = SETTINGS_TABS.find((candidate) => candidate.id === definition.tab);
            const group = tab?.groups.find((candidate) => candidate.id === definition.group);
            return {
                id: definition.id,
                label: t(definition.labelKey),
                description:
                    definition.descriptionKey === undefined ? "" : t(definition.descriptionKey),
                valueText: valueTextFor(definition.id),
                tabId: definition.tab,
                tabLabel: tab === undefined ? definition.tab : t(tab.labelKey),
                ...(group === undefined ? {} : { sectionLabel: t(group.labelKey) }),
                keywords: [
                    ...(definition.keywords ?? []),
                    searchableText(definition.labelKey),
                    ...(definition.descriptionKey === undefined
                        ? []
                        : [searchableText(definition.descriptionKey)]),
                ],
            };
        });
    }

    function valueTextFor(id: string): string {
        const definition = store.definition(id);
        if (definition === undefined) return "";
        const value = store.get(id);
        if (definition.kind === "select") {
            const option = definition.options.find((candidate) => candidate.value === value);
            return option === undefined ? String(value) : t(option.labelKey);
        }
        if (definition.kind === "toggle") return value === true ? t("settings.changed") : "";
        return String(value);
    }

    function defaultMatch(setting: SearchableSetting, needle: string): boolean {
        if (needle === "") return true;
        const haystack = [
            setting.label,
            setting.description,
            setting.valueText,
            setting.tabLabel,
            setting.sectionLabel ?? "",
            ...(setting.keywords ?? []),
        ]
            .join(" ")
            .toLowerCase();
        return haystack.includes(needle);
    }

    function applyFilter(): void {
        const needle = query.trim().toLowerCase();
        const active = matcher !== null || needle !== "";
        const settings = searchableSettings();
        const matched = new Set<string>();

        if (invalidPattern) {
            // An invalid pattern filters nothing. Hiding every row because the pattern
            // is half-typed reads as "there are no settings", which is not true.
            for (const setting of settings) matched.add(setting.id);
        } else {
            for (const setting of settings) {
                const hit =
                    matcher !== null ? matcher(setting) : defaultMatch(setting, needle);
                if (hit) matched.add(setting.id);
            }
        }

        for (const [id, entry] of rows) {
            const visible = !active || invalidPattern || matched.has(id);
            entry.container.hidden = !visible;
        }

        const perTab = new Map<string, number>();
        for (const setting of settings) {
            if (!matched.has(setting.id)) continue;
            perTab.set(setting.tabId, (perTab.get(setting.tabId) ?? 0) + 1);
        }
        for (const [tabId, badge] of tabBadges) {
            const count = perTab.get(tabId) ?? 0;
            const show = active && !invalidPattern;
            badge.hidden = !show;
            badge.textContent = show ? String(count) : "";
            const button = tabButtons.get(tabId);
            button?.setAttribute(
                "aria-description",
                show ? t("settings.searchOtherTab", { count, tab: labelForTab(tabId) }) : ""
            );
        }

        renderSummary(active, matched.size, perTab);
    }

    function labelForTab(tabId: string): string {
        const tab = SETTINGS_TABS.find((candidate) => candidate.id === tabId);
        return tab === undefined ? tabId : t(tab.labelKey);
    }

    function renderSummary(active: boolean, total: number, perTab: Map<string, number>): void {
        clear(searchSummary);
        if (invalidPattern) {
            searchSummary.append(el("p", { class: "md-field__help mb-help", text: t("settings.searchInvalid") }));
            return;
        }
        if (!active) return;
        if (total === 0) {
            searchSummary.append(
                el("p", { class: "mb-empty", text: t("settings.searchNoResults") })
            );
            return;
        }
        searchSummary.append(
            el("p", {
                class: "md-field__help mb-help",
                text: total === 1 ? t("settings.searchResultsOne") : t("settings.searchResults", { count: total }),
            })
        );
        // Matches on a tab the visitor is not looking at are named rather than left to
        // be discovered, which is the whole point of searching every tab at once.
        for (const [tabId, count] of perTab) {
            if (tabId === activeTab || count === 0) continue;
            const jump = el("button", {
                class: "md-button md-button--text",
                text: t("settings.searchGoToTab", { tab: labelForTab(tabId) }),
                attrs: { type: "button" },
            });
            jump.addEventListener("click", () => {
                activateTab(tabId);
            });
            searchSummary.append(
                el(
                    "p",
                    { class: "mb-search-othertab" },
                    el("span", {
                        text:
                            count === 1
                                ? t("settings.searchOtherTabOne", { tab: labelForTab(tabId) })
                                : t("settings.searchOtherTab", { count, tab: labelForTab(tabId) }),
                    }),
                    jump
                )
            );
        }
    }

    /* ---------------------------------------------------------- *
     * Public behaviour
     * ---------------------------------------------------------- */

    function activateTab(tabId: string): void {
        if (!panels.has(tabId)) return;
        activeTab = tabId;
        for (const [id, button] of tabButtons) {
            const selected = id === tabId;
            button.setAttribute("aria-selected", selected ? "true" : "false");
            button.tabIndex = selected ? 0 : -1;
        }
        for (const [id, panel] of panels) panel.hidden = id !== tabId;
        applyFilter();
    }

    function revealSetting(id: string): void {
        const entry = rows.get(id);
        if (entry === undefined) return;
        activateTab(entry.tabId);
        entry.container.hidden = false;
        entry.container.scrollIntoView({ block: "center", behavior: "auto" });
        flashAttention(entry.container);
        const focusable = entry.container.querySelector<HTMLElement>(
            "input, select, button:not(.mb-reset), textarea"
        );
        focusable?.focus();
    }

    function refresh(): void {
        fillPhrase(heading, "settings.title");
        fillPhrase(subtitle, "settings.subtitle");
        fillPhrase(searchLabel, "settings.searchLabel");
        fillPhrase(searchHint, "settings.searchHint");
        searchInput.placeholder = t("settings.searchPlaceholder");
        clearSearch.setAttribute("aria-label", t("settings.searchClear"));

        for (const tab of SETTINGS_TABS) {
            const button = tabButtons.get(tab.id);
            const label = button?.querySelector(".mb-tab-label");
            if (label instanceof HTMLElement) fillPhrase(label, tab.labelKey);
        }

        for (const entry of rows.values()) entry.row.refresh();

        const changed = store.changedIds().length;
        changedNotice.textContent =
            changed === 0 ? "" : t("settings.changedCount", { count: changed });

        const error = store.persistenceError();
        storageNotice.hidden = error === null;
        if (error !== null) {
            storageNotice.textContent =
                error === "unavailable"
                    ? t("settings.storageUnavailable")
                    : t("settings.storageWriteFailed");
        }

        applyRoot();
        applyFilter();
    }

    /** Push the site-wide values onto the root element. */
    function applyRoot(): void {
        const resolvedDark =
            options.theme?.resolved === "dark" ||
            (options.theme === undefined && document.documentElement.dataset["theme"] === "dark");
        options.appearance.applyRoot({
            resolvedDark,
            contrast: store.getString("theme.contrast") as "standard" | "medium" | "high",
            fontStack: options.appearance.stackFor(store.getString("type.family")),
            monoStack: options.appearance.stackFor(store.getString("type.mono")),
            fontScale: store.getNumber("type.scale"),
            fontWeight: Number(store.getString("type.weight")),
            cornerScale: store.getNumber("shape.cornerScale"),
            elevationEnabled: store.getBoolean("shape.elevation"),
            borderWidth: store.getNumber("shape.borderWidth"),
            focusWidth: store.getNumber("a11y.focusWidth"),
            focusColor: store.getString("a11y.focusColor"),
            underlineLinks: store.getBoolean("a11y.underlineLinks"),
            minTarget: store.getNumber("a11y.minTarget"),
            textSpacing: store.getBoolean("a11y.textSpacing"),
            motionScale: resolveMotionScale(),
            accentSeed: store.getString("theme.accent"),
        });
        document.documentElement.dataset["surfaceTint"] = store.getBoolean("theme.surfaceTint")
            ? "on"
            : "off";
    }

    function resolveMotionScale(): number {
        const preference = store.getString("motion.reduce");
        if (preference === "always") return 0;
        if (preference === "never") return store.getNumber("motion.scale");
        const systemReduced =
            typeof window.matchMedia === "function" &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        return systemReduced ? 0 : store.getNumber("motion.scale");
    }

    disposers.push(
        store.subscribe(() => {
            syncLanguageFromSettings(store);
            refresh();
        })
    );
    disposers.push(subscribeI18n(() => {
        refresh();
    }));
    disposers.push(options.theme?.subscribe(() => {
        refresh();
    }) ?? (() => undefined));

    syncLanguageFromSettings(store);
    activateTab(activeTab);
    refresh();

    const search: SettingsSearchHooks = {
        input: searchInput,
        builderSlot,
        anchorHost: searchField,
        host: {
            listSettings: () => searchableSettings(),
            activeTabId: () => activeTab,
            revealSetting,
            subscribe: (listener) => store.subscribe(() => {
                listener();
            }),
        },
        setMatcher(next) {
            matcher = next;
            applyFilter();
        },
        setInvalid(invalid) {
            invalidPattern = invalid;
            applyFilter();
        },
        onQueryChange(listener) {
            queryListeners.add(listener);
            return () => {
                queryListeners.delete(listener);
            };
        },
        rerun: applyFilter,
    };

    return {
        element: root,
        store,
        search,
        activateTab,
        revealSetting,
        refresh,
        destroy(): void {
            for (const dispose of disposers) dispose();
            root.remove();
        },
    };
}

/* ------------------------------------------------------------------ *
 * Bridges
 * ------------------------------------------------------------------ */

/**
 * Point the settings that another controller owns at that controller.
 *
 * Theme mode and density belong to the theme controller. The language mode and the
 * two funny levels are stored under the preference keys the pre-paint script in
 * `index.html` already reads, so the page renders in the right language before the
 * first frame instead of flashing English.
 */
function installBridges(store: SettingsStore, options: SettingsPageOptions): void {
    const theme = options.theme;
    if (theme !== undefined) {
        store.bridge("theme.mode", {
            read: () => theme.mode,
            write: (value) => {
                if ((THEME_MODES as readonly string[]).includes(String(value))) {
                    theme.setMode(value as (typeof THEME_MODES)[number]);
                }
            },
            reset: () => {
                theme.setMode("system");
            },
            subscribe: (listener) => theme.subscribe(listener),
        });
        store.bridge("theme.density", {
            read: () => theme.density,
            write: (value) => {
                if ((DENSITIES as readonly string[]).includes(String(value))) {
                    theme.setDensity(value as (typeof DENSITIES)[number]);
                }
            },
            reset: () => {
                theme.setDensity("comfortable");
            },
            subscribe: (listener) => theme.subscribe(listener),
        });
    }

    const prefs = options.prefs;
    const languageListeners = new Set<() => void>();
    const notifyLanguage = (): void => {
        for (const listener of [...languageListeners]) listener();
    };

    store.bridge("language.mode", {
        read: () => prefs.readOneOf<LanguageMode>("language.mode", ["en", "yue", "bilingual"], "en"),
        write: (value) => {
            prefs.write("language.mode", String(value));
            notifyLanguage();
        },
        reset: () => {
            prefs.remove("language.mode");
            notifyLanguage();
        },
        subscribe: (listener) => {
            languageListeners.add(listener);
            return () => {
                languageListeners.delete(listener);
            };
        },
    });

    for (const [id, key] of [
        ["language.funny.en", "language.funny.en"],
        ["language.funny.yue", "language.funny.yue"],
    ] as const) {
        store.bridge(id, {
            read: () => prefs.readInt(key, 3, 1, 5),
            write: (value) => {
                prefs.write(key, String(value));
                notifyLanguage();
            },
            reset: () => {
                prefs.remove(key);
                notifyLanguage();
            },
            subscribe: (listener) => {
                languageListeners.add(listener);
                return () => {
                    languageListeners.delete(listener);
                };
            },
        });
    }
}

/** Push the language settings into the language port, which every phrase reads from. */
function syncLanguageFromSettings(store: SettingsStore): void {
    setI18nState({
        mode: store.getString("language.mode") as LanguageMode,
        funnyEn: store.getNumber("language.funny.en") as FunnyLevel,
        funnyYue: store.getNumber("language.funny.yue") as FunnyLevel,
    });
    const root = document.documentElement;
    const mode = store.getString("language.mode");
    root.dataset["language"] = mode;
    root.lang = mode === "yue" ? "zh-HK" : "en";
    root.dataset["secondaryInline"] = store.getBoolean("language.secondaryInline") ? "true" : "false";
}
