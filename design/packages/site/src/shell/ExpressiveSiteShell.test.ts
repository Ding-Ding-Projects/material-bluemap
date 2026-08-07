// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { SidebarNavigation } from "./SidebarNavigation.js";
import { TabModel } from "../tabs/TabModel.js";
import { ExpressiveSiteShell } from "./ExpressiveSiteShell.js";

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

describe("ExpressiveSiteShell", () => {
    it("builds one labelled app shell with real navigation and quick actions", () => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: vi.fn().mockReturnValue({ matches: false }),
        });
        const prefs = new Preferences(new MemoryStorage());
        const i18n = new I18n(prefs);
        const tabs = new TabModel(prefs, i18n);
        const sidebar = new SidebarNavigation(prefs, false);
        const root = document.createElement("div");
        const actions = {
            home: vi.fn(),
            search: vi.fn(),
            settings: vi.fn(),
            notifications: vi.fn(),
            palette: vi.fn(),
        };
        const shell = new ExpressiveSiteShell({
            root,
            i18n,
            tabs,
            sidebar,
            tabBar: Object.assign(document.createElement("div"), { className: "tab-bar" }),
            panels: document.createElement("div"),
            footer: document.createElement("footer"),
            actions,
        });

        expect(root.querySelectorAll(".mb-app-shell")).toHaveLength(1);
        expect(shell.navigation.tagName).toBe("NAV");
        expect(shell.main.id).toBe("mb-main-content");
        expect(shell.skipLink.getAttribute("href")).toBe("#mb-main-content");
        const palette = root.querySelector<HTMLButtonElement>(".mb-app-bar__palette-action");
        palette?.click();
        expect(actions.palette).toHaveBeenCalledOnce();
    });

    it("keeps the mobile navigation toggle reachable when the navigation is collapsed", () => {
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            value: vi.fn().mockReturnValue({ matches: true }),
        });
        const prefs = new Preferences(new MemoryStorage());
        const i18n = new I18n(prefs);
        const tabs = new TabModel(prefs, i18n);
        const sidebar = new SidebarNavigation(prefs, true);
        const root = document.createElement("div");
        const shell = new ExpressiveSiteShell({
            root,
            i18n,
            tabs,
            sidebar,
            tabBar: document.createElement("div"),
            panels: document.createElement("div"),
            footer: document.createElement("footer"),
            actions: { home() {}, search() {}, settings() {}, notifications() {}, palette() {} },
        });

        const toggle = root.querySelector<HTMLButtonElement>(".mb-sidebar-toggle");
        expect(toggle?.hidden).toBe(false);
        expect(toggle?.getAttribute("aria-expanded")).toBe("false");
        expect(shell.element.dataset.navigationOpen).toBe("false");
        toggle?.click();
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        expect(shell.element.dataset.navigationOpen).toBe("true");
    });
});
