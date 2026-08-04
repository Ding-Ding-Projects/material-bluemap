// @vitest-environment jsdom

import { describe, expect, it, beforeEach } from "vitest";
import { AppearanceController } from "../appearance/controller.js";
import { Preferences } from "../platform/Preferences.js";
import { ThemeController } from "../theme/ThemeController.js";
import { SETTINGS_TABS } from "./schema.js";
import { createSettingsPage } from "./page.js";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number { return this.values.size; }
    clear(): void { this.values.clear(); }
    getItem(key: string): string | null { return this.values.get(key) ?? null; }
    key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string): void { this.values.delete(key); }
    setItem(key: string, value: string): void { this.values.set(key, value); }
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
});

describe("settings tab search surfaces", () => {
    it("gives every settings tab its own searchable field and builder anchor", () => {
        const prefs = new Preferences(storage);
        const theme = new ThemeController(prefs);
        const appearance = new AppearanceController(prefs);
        const page = createSettingsPage({ prefs, theme, appearance });

        const panelInputs = [...page.element.querySelectorAll<HTMLInputElement>(".mb-settings-panel input[type=search]")];
        const ids = panelInputs.map((input) => input.id);

        expect(panelInputs).toHaveLength(SETTINGS_TABS.length);
        expect(new Set(ids).size).toBe(SETTINGS_TABS.length);
        expect(panelInputs.every((input) => input.closest(".mb-search-row") !== null)).toBe(true);
        expect(page.element.querySelectorAll(".mb-settings-panel .mb-search-builder-slot")).toHaveLength(SETTINGS_TABS.length);

        page.destroy();
    });
});
