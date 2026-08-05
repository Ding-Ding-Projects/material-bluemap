// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from "vitest";
import { AppearanceController } from "../appearance/controller.js";
import { APPEARANCE_TARGETS } from "../appearance/model.js";
import { Preferences } from "../platform/Preferences.js";
import { ThemeController } from "../theme/ThemeController.js";
import { createSettingsPage } from "./page.js";
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
