// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { AppearanceController } from "../appearance/controller.js";
import { APPEARANCE_TARGETS } from "../appearance/model.js";
import { Preferences } from "../platform/Preferences.js";
import { ThemeController } from "../theme/ThemeController.js";
import { createSettingsPage } from "./page.js";
import { setI18nState } from "./i18n.js";
import { SETTINGS_TABS } from "./schema.js";
import type { SearchableSetting } from "../search/contract.js";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number {
        return this.values.size;
    }
    clear(): void {
        this.values.clear();
    }
    getItem(key: string): string | null {
        return this.values.get(key) ?? null;
    }
    key(index: number): string | null {
        return [...this.values.keys()][index] ?? null;
    }
    removeItem(key: string): void {
        this.values.delete(key);
    }
    setItem(key: string, value: string): void {
        this.values.set(key, value);
    }
}

const storage = new MemoryStorage();

beforeEach(() => {
    storage.clear();
    window.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
    })) as typeof window.matchMedia;
    // jsdom implements no layout, so it has never defined scrollIntoView. revealSetting calls
    // it on the real DOM path, which nothing here exercised until the appearance-target reveal
    // tests below, so the gap only shows up now rather than in the browser this ships to.
    if (typeof Element.prototype.scrollIntoView !== "function") {
        Element.prototype.scrollIntoView = () => undefined;
    }
});

function findSetting(settings: readonly SearchableSetting[], id: string): SearchableSetting {
    const found = settings.find((setting) => setting.id === id);
    if (found === undefined) throw new Error(`No searchable setting for ${id}`);
    return found;
}

describe("searchable settings carry a live control the palette can write through", () => {
    it("gives a toggle setting a real switch that writes through the store", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });

        const before = findSetting(page.search.host.listSettings(), "theme.surfaceTint");
        if (before.control?.kind !== "toggle") throw new Error("expected a toggle control");
        expect(before.control.value).toBe(true);

        before.control.set(false);
        expect(page.store.getBoolean("theme.surfaceTint")).toBe(false);

        const after = findSetting(page.search.host.listSettings(), "theme.surfaceTint");
        if (after.control?.kind !== "toggle") throw new Error("expected a toggle control");
        expect(after.control.value).toBe(false);

        page.destroy();
    });

    it("gives a select setting a choice control listing every option, translated", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });

        const mode = findSetting(page.search.host.listSettings(), "theme.mode");
        if (mode.control?.kind !== "choice") throw new Error("expected a choice control");
        expect(mode.control.options.map((option) => option.id)).toEqual([
            "system",
            "light",
            "dark",
        ]);
        expect(mode.control.options.every((option) => option.label.length > 0)).toBe(true);

        mode.control.set("dark");
        expect(page.store.getString("theme.mode")).toBe("dark");

        page.destroy();
    });

    it("gives slider and number settings a bounded number control with their unit", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        const settings = page.search.host.listSettings();

        const scale = findSetting(settings, "motion.scale");
        if (scale.control?.kind !== "number") throw new Error("expected a number control");
        expect(scale.control.min).toBe(0);
        expect(scale.control.max).toBe(2);
        expect(scale.control.unit).toBe("");
        scale.control.set(1.5);
        expect(page.store.getNumber("motion.scale")).toBe(1.5);

        const width = findSetting(settings, "shape.borderWidth");
        if (width.control?.kind !== "number") throw new Error("expected a number control");
        expect(width.control.unit).toBe("px");

        page.destroy();
    });

    it("leaves colour and font settings without a control, since neither fits one row honestly", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        const settings = page.search.host.listSettings();

        expect(findSetting(settings, "theme.accent").control).toBeUndefined();
        expect(findSetting(settings, "type.family").control).toBeUndefined();

        page.destroy();
    });
});

describe("every appearance target is a searchable, teleportable destination", () => {
    it("lists one searchable entry per appearance target, distinct from every stored setting id", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        const settings = page.search.host.listSettings();

        for (const target of APPEARANCE_TARGETS) {
            const entry = findSetting(settings, `element.${target.id}`);
            expect(entry.label.length).toBeGreaterThan(0);
            expect(entry.description.length).toBeGreaterThan(0);
            expect(entry.tabId).toBe("appearance");
            // A dialog's worth of typography, box and state controls does not fit in one row
            // honestly, the same reason colour and font settings above carry no control.
            expect(entry.control).toBeUndefined();
        }

        const ids = new Set(settings.map((setting) => setting.id));
        expect(ids.size).toBe(settings.length);

        page.destroy();
    });

    it("names whether a target is customised or still at its theme default", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });

        const before = findSetting(page.search.host.listSettings(), "element.tab");
        expect(before.valueText.length).toBeGreaterThan(0);

        appearance.store.setBox("tab", "radius", 12);

        const after = findSetting(page.search.host.listSettings(), "element.tab");
        expect(after.valueText).not.toBe(before.valueText);

        page.destroy();
    });

    it("reveals an appearance target by switching to Appearance and focusing its Edit button, exactly like revealSetting does for a stored setting", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        document.body.append(page.element);

        page.activateTab("general");
        expect(page.element.querySelector('[id="mb-panel-appearance"]')?.hasAttribute("hidden")).toBe(
            true,
        );

        page.revealSetting("element.context-menu");

        const panel = page.element.querySelector('[id="mb-panel-appearance"]');
        expect(panel?.hasAttribute("hidden")).toBe(false);
        const row = page.element.querySelector('[data-target-id="context-menu"]');
        expect(row).not.toBeNull();
        const editButton = row?.querySelector("button");
        expect(document.activeElement).toBe(editButton);

        page.element.remove();
        page.destroy();
    });

    it("does nothing for an id that starts with the element prefix but names no real target", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        document.body.append(page.element);

        // Must not throw, and must not move focus or the active tab, for an id nothing owns.
        expect(() => page.revealSetting("element.does-not-exist")).not.toThrow();

        page.element.remove();
        page.destroy();
    });
});

describe("every search field's clear button carries an icon, not word text", () => {
    // A verification pass at 400px found "Clear search" rendered as literal button text
    // inside `.md-icon-button` - a fixed 48x48 box with no overflow guard - so the two-word
    // phrase wrapped past the button's own edges and collided with the field below it. The
    // fix gives the button the same `icon("close")` SVG every other `.md-icon-button` on the
    // site uses (the tab close button, for one), keeping "Clear search" only as the
    // `aria-label`. These assertions would fail if `.textContent = t(...)` ever came back,
    // on the button itself or in the locale-change `refresh()` path that used to overwrite it.

    afterEach(() => {
        // `setI18nState` is a module-level singleton shared by every test file in this
        // process; a test that changes the language mode must put it back or later tests -
        // in this file or another - start seeing Cantonese aria-labels for no reason of
        // their own.
        setI18nState({ mode: "en" });
    });

    function clearButtons(page: { element: HTMLElement }): readonly HTMLButtonElement[] {
        return [...page.element.querySelectorAll<HTMLButtonElement>(".mb-search-row > button.md-icon-button")];
    }

    it("gives the page-level and every per-tab search field an icon-only clear button", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        document.body.append(page.element);

        const buttons = clearButtons(page);
        // One page-level search row plus one per settings tab.
        expect(buttons.length).toBe(1 + SETTINGS_TABS.length);

        for (const button of buttons) {
            expect(button.querySelector("svg")).not.toBeNull();
            // No visible word text as a child - the SVG is `aria-hidden`, so the accessible
            // name comes from the button's own `aria-label` instead.
            expect(button.textContent?.trim()).toBe("");
            expect(button.getAttribute("aria-label")).toBe("Clear search");
        }

        page.element.remove();
        page.destroy();
    });

    it("keeps the icon after a language change re-renders the button's aria-label", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });
        document.body.append(page.element);

        setI18nState({ mode: "yue" });

        const buttons = clearButtons(page);
        expect(buttons.length).toBeGreaterThan(0);
        for (const button of buttons) {
            expect(button.querySelector("svg")).not.toBeNull();
            expect(button.textContent?.trim()).toBe("");
            // The accessible name does re-translate; only the rendered content must not
            // regress to word text.
            expect(button.getAttribute("aria-label")).toBe("清除搜尋");
        }

        page.element.remove();
        page.destroy();
    });
});
