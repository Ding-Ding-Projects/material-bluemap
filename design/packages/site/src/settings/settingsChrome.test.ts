// @vitest-environment jsdom

/**
 * The settings surface's card-wall layout, its kicker line, and the shape/elevation this
 * refresh gives its section cards.
 *
 * `page.ts` builds the DOM (`SettingsPageView` mounts fine under jsdom, unlike `main.ts`
 * which boots the whole app as an import side effect), so the kicker element is checked by
 * actually rendering the page. The layout and shape rules live entirely in `settings.css` and
 * have no DOM signal of their own (a class staying `.mb-settings-group` says nothing about
 * whether it is still a single flat column or a two-up card-wall), so those are checked as
 * static source assertions against the stylesheet instead.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { AppearanceController } from "../appearance/controller.js";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { TabModel } from "../tabs/TabModel.js";
import { createSettingsPage } from "./page.js";

const here = dirname(fileURLToPath(import.meta.url));
const settingsCss = readFileSync(resolve(here, "settings.css"), "utf8");

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

describe("settings kicker", () => {
    let prefs: Preferences;
    let appearance: AppearanceController;

    beforeEach(() => {
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
        HTMLElement.prototype.scrollIntoView = (): void => {};
        prefs = new Preferences(new MemoryStorage());
        appearance = new AppearanceController(prefs);
    });

    it("renders a kicker line before the page title, with real text", () => {
        const page = createSettingsPage({ prefs, appearance });
        const kicker = page.element.querySelector(".mb-kicker");
        const heading = page.element.querySelector(".mb-settings-title");
        expect(kicker).not.toBeNull();
        expect(heading).not.toBeNull();
        expect(kicker?.textContent?.trim()).not.toBe("");
        // The kicker precedes the title in the header, matching the "small loud label,
        // then the big title" order every kicker'd page uses.
        const header = page.element.querySelector(".mb-settings-header");
        const children = [...(header?.children ?? [])];
        expect(children.indexOf(kicker as Element)).toBeLessThan(
            children.indexOf(heading as Element),
        );
        page.destroy();
    });
});

describe("tab-strip placement setting", () => {
    it("is searchable, defaults truthfully to left, and drives the real tab model", () => {
        const prefs = new Preferences(new MemoryStorage());
        const model = new TabModel(prefs, new I18n(prefs));
        const page = createSettingsPage({
            prefs,
            appearance: new AppearanceController(prefs),
            tabs: model,
        });

        const searchable = page.search.host
            .listSettings()
            .find((setting) => setting.id === "tabs.placement");
        expect(searchable?.label).toBe("Tab strip edge");
        expect(searchable?.valueText).toBe("Left edge");

        page.revealSetting("tabs.placement");
        const select = [...page.element.querySelectorAll<HTMLSelectElement>("select")].find(
            (candidate) =>
                candidate.closest(".mb-setting")?.textContent?.includes("Tab strip edge"),
        );
        expect(select).toBeDefined();
        expect(select?.value).toBe("left");
        if (select !== undefined) {
            select.value = "right";
            select.dispatchEvent(new Event("change", { bubbles: true }));
        }
        expect(model.placement).toBe("right");
        page.destroy();
    });
});

describe("settings card-wall layout", () => {
    it("keeps the search toolbar out of the card-wall's own layout container", () => {
        // The bug this pass fixed: the toolbar (search row, hint, summary) used to be a
        // bare sibling of the section cards inside the very grid that laid the cards
        // out in two columns, so a near-empty summary claimed a card-sized cell next to
        // a tall settings group. `.mb-settings-panel` is a plain single-column flow now
        // -- the toolbar and the card-wall container stack in it, nothing shares a row.
        const panelRule = /\.mb-settings-panel\s*{[^}]*}/.exec(settingsCss)?.[0] ?? "";
        expect(panelRule).toContain("display: flex");
        expect(panelRule).toContain("flex-direction: column");
        expect(panelRule).not.toMatch(/display:\s*grid/);
    });

    it("lays out the card-wall as two independent columns above the shared breakpoint", () => {
        // Independent flex columns, not a shared CSS Grid: a grid's rows couple both
        // columns to the same row height, so a much taller card in one column opens a
        // dead gap under a shorter card in the other. Two independent columns have no
        // shared row to couple through, at any width.
        const cardsRule = /\.mb-settings-cards\s*{[^}]*}/.exec(settingsCss)?.[0] ?? "";
        expect(cardsRule).toContain("display: flex");
        expect(cardsRule).toContain("flex-direction: column");
        const wideRule =
            /@media \(width >= 56\.25rem\)\s*{\s*\.mb-settings-cards\s*{[^}]*flex-direction:\s*row;/.exec(
                settingsCss,
            );
        expect(wideRule).not.toBeNull();
        const columnWideRule =
            /\.mb-settings-column\s*{[^}]*flex:\s*1 1 0;/.exec(settingsCss) ??
            /flex-direction:\s*row;\s*align-items:\s*flex-start;\s*}\s*\.mb-settings-column\s*{[^}]*flex:\s*1 1 0;/.exec(
                settingsCss,
            );
        expect(columnWideRule).not.toBeNull();
    });

    // The bare `.mb-settings-group {` rule, not the `:root[data-mb-elevation="off"] …,
    // .mb-settings-group {` selector list a few lines above it that also mentions the class.
    const groupRuleSource = /^\.mb-settings-group \{[\s\S]*?\n\}/m.exec(settingsCss)?.[0] ?? "";

    it("gives section cards an asymmetric shape rather than one uniform radius", () => {
        expect(groupRuleSource).toMatch(
            /border-radius:\s*var\(--md-sys-shape-corner-extra-small,\s*4px\)\s+20px\s+20px\s+var\(--md-sys-shape-corner-extra-small,\s*4px\);/,
        );
    });

    it("gives section cards a real elevation tier that rises on hover and focus", () => {
        expect(groupRuleSource).toContain("box-shadow: var(--md-sys-elevation-level1);");
        expect(settingsCss).toMatch(
            /\.mb-settings-group:hover,\s*\.mb-settings-group:focus-within\s*{[^}]*box-shadow:\s*var\(--md-sys-elevation-level2\);/,
        );
    });

    it("drops the hover lift under prefers-reduced-motion", () => {
        expect(settingsCss).toMatch(
            /@media \(prefers-reduced-motion: reduce\)\s*{\s*\.mb-settings-group:hover,\s*\.mb-settings-group:focus-within\s*{\s*transform:\s*none;/,
        );
    });
});

describe("settings search fields", () => {
    it("renders the two settings search inputs as full pills", () => {
        expect(settingsCss).toMatch(
            /\.mb-search-field \.mb-search-input\s*{[^}]*border-radius:\s*var\(--md-sys-shape-corner-full\);/,
        );
    });
});
