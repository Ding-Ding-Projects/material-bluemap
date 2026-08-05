// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppearanceStore, THEME_FORMAT } from "./store.js";

/**
 * The storage this jsdom does not ship with. `AppearanceStore` reads and writes
 * `window.localStorage` directly (wrapped in try/catch, so a genuinely storage-less
 * browser just disables persistence) - but without any implementation at all, every
 * test here would exercise that fallback path rather than the store's real behaviour.
 */
const cells = new Map<string, string>();

beforeAll(() => {
    Object.defineProperty(window, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

describe("AppearanceStore", () => {
    beforeEach(() => {
        cells.clear();
    });

    it("has nothing stored for an element until it is customised", () => {
        const store = new AppearanceStore();
        expect(store.has("card#a")).toBe(false);
        expect(store.get("card#a").typography.fontSize).toBe(0);
    });

    it("stores a typography change and reports the element as customised", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        expect(store.has("card#a")).toBe(true);
        expect(store.get("card#a").typography.fontSize).toBe(18);
    });

    it("drops the element from storage once every property is back at default", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        store.setTypography("card#a", "fontSize", 0);
        expect(store.has("card#a")).toBe(false);
    });

    it("resets one property and leaves a sibling property on the same element alone", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        store.setBox("card#a", "radius", 12);
        store.resetTypographyProperty("card#a", "fontSize");
        expect(store.get("card#a").typography.fontSize).toBe(0);
        expect(store.get("card#a").box.radius).toBe(12);
    });

    it("resetElement clears one element and leaves another element untouched", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        store.setTypography("card#b", "fontSize", 22);
        store.resetElement("card#a");
        expect(store.has("card#a")).toBe(false);
        expect(store.get("card#b").typography.fontSize).toBe(22);
    });

    it("resetAllElements clears every element but keeps saved presets", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        store.savePreset("Loud cards");
        store.resetAllElements();
        expect(store.customisedIds()).toEqual([]);
        expect(store.presets().map((preset) => preset.name)).toEqual(["Loud cards"]);
    });

    it("refuses to save a preset under a name already taken, unless told to overwrite", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        const first = store.savePreset("Theme");
        expect(first.saved).toBe(true);

        store.setTypography("card#a", "fontSize", 30);
        const second = store.savePreset("Theme");
        expect(second.saved).toBe(false);
        expect(second.reason).toBe("name-taken");
        // The first save is untouched: applying it still yields the original value.
        const presetId = store.presets()[0]?.id;
        store.resetAllElements();
        store.applyPreset(presetId ?? "");
        expect(store.get("card#a").typography.fontSize).toBe(18);
    });

    it("overwrites a same-named preset when explicitly asked to", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        store.savePreset("Theme");
        store.setTypography("card#a", "fontSize", 30);
        const replaced = store.savePreset("Theme", true);
        expect(replaced.saved).toBe(true);
        expect(store.presets()).toHaveLength(1);
    });

    it("applyPreset replaces the live styles with the preset's own styles", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 18);
        store.savePreset("Saved");
        store.setTypography("card#b", "fontSize", 40);
        const preset = store.presets()[0];
        expect(preset).toBeDefined();
        store.applyPreset(preset!.id);
        expect(store.get("card#a").typography.fontSize).toBe(18);
        expect(store.has("card#b")).toBe(false);
    });

    it("deletePreset removes a preset and reports failure for an unknown id", () => {
        const store = new AppearanceStore();
        store.savePreset("Throwaway");
        const preset = store.presets()[0];
        expect(store.deletePreset(preset!.id)).toBe(true);
        expect(store.presets()).toEqual([]);
        expect(store.deletePreset("not-real")).toBe(false);
    });

    it("round-trips through exportTheme and importTheme without losing styles or presets", () => {
        const store = new AppearanceStore();
        store.setTypography("card#a", "fontSize", 20);
        store.savePreset("Preset one");
        const exported = store.exportTheme({ "theme.mode": "dark" });
        expect(exported.format).toBe(THEME_FORMAT);
        expect(exported.settings).toEqual({ "theme.mode": "dark" });

        const fresh = new AppearanceStore();
        const report = fresh.importTheme(exported);
        expect(report.error).toBeNull();
        expect(report.stylesApplied).toBe(1);
        expect(report.presetsApplied).toBe(1);
        expect(fresh.get("card#a").typography.fontSize).toBe(20);
        expect(fresh.presets().map((preset) => preset.name)).toEqual(["Preset one"]);
    });

    it("preserves an unrecognised property from an imported theme instead of dropping it", () => {
        const store = new AppearanceStore();
        const report = store.importTheme({
            format: THEME_FORMAT,
            version: 1,
            exportedAt: new Date().toISOString(),
            styles: {
                "card#a": {
                    typography: { fontSize: 20, aFuturePropertyThisBuildHasNeverHeardOf: "value" },
                    box: {},
                    states: {},
                },
            },
            presets: [],
        });
        expect(report.error).toBeNull();
        expect(report.preservedProperties).toContain("typography.aFuturePropertyThisBuildHasNeverHeardOf");
        expect(store.get("card#a").typography.fontSize).toBe(20);
        expect(store.get("card#a").unknown["typography.aFuturePropertyThisBuildHasNeverHeardOf"]).toBe(
            "value",
        );

        // A re-export carries the preserved value back out unchanged.
        const reexported = store.exportTheme();
        expect(reexported.styles["card#a"]?.unknown["typography.aFuturePropertyThisBuildHasNeverHeardOf"]).toBe(
            "value",
        );
    });

    it("refuses a file that is not this site's theme format", () => {
        const store = new AppearanceStore();
        const report = store.importTheme({ format: "someone-elses-format" });
        expect(report.error).toBe("not-a-theme");
        expect(report.stylesApplied).toBe(0);
    });

    it("notifies subscribers with the changed style ids only", () => {
        const store = new AppearanceStore();
        const seen: string[][] = [];
        const unsubscribe = store.subscribe((ids) => seen.push([...ids]));
        store.setTypography("card#a", "fontSize", 18);
        store.setBox("card#b", "radius", 4);
        unsubscribe();
        store.setTypography("card#c", "fontSize", 12);
        expect(seen).toEqual([["card#a"], ["card#b"]]);
    });

    it("persists across a fresh store instance reading the same storage", () => {
        const first = new AppearanceStore();
        first.setTypography("card#a", "fontSize", 26);
        const second = new AppearanceStore();
        expect(second.get("card#a").typography.fontSize).toBe(26);
    });
});
