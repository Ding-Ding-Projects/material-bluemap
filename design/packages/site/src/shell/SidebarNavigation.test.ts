import { describe, expect, it, vi } from "vitest";
import { Preferences } from "../platform/Preferences.js";
import { AppearanceController } from "../appearance/controller.js";
import { createSettingsPage } from "../settings/page.js";
import {
    applySidebarNavigation,
    SIDEBAR_COLLAPSED_KEY,
    SidebarNavigation,
} from "./SidebarNavigation.js";

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

describe("SidebarNavigation", () => {
    it("starts collapsed on a compact first visit and expanded on a wide first visit", () => {
        expect(new SidebarNavigation(new Preferences(new MemoryStorage()), true).collapsed).toBe(
            true,
        );
        expect(new SidebarNavigation(new Preferences(new MemoryStorage()), false).collapsed).toBe(
            false,
        );
    });

    it("persists an explicit visitor choice across viewport sizes", () => {
        const storage = new MemoryStorage();
        const compact = new SidebarNavigation(new Preferences(storage), true);
        compact.setCollapsed(false);

        const wide = new SidebarNavigation(new Preferences(storage), false);
        expect(wide.collapsed).toBe(false);
        expect(wide.provenance).toBe("stored");
    });

    it("reset returns to the responsive default instead of inventing a fixed value", () => {
        const storage = new MemoryStorage();
        const state = new SidebarNavigation(new Preferences(storage), true);
        state.setCollapsed(false);
        state.reset();

        expect(state.collapsed).toBe(true);
        expect(state.provenance).toBe("responsive default");
        expect(storage.getItem(`mbm-site:${SIDEBAR_COLLAPSED_KEY}`)).toBeNull();
    });

    it("keeps fresh compact and desktop defaults out of changed ids and exports", () => {
        for (const compact of [true, false]) {
            const prefs = new Preferences(new MemoryStorage());
            const sidebar = new SidebarNavigation(prefs, compact);
            const page = createSettingsPage({
                prefs,
                appearance: new AppearanceController(prefs),
                sidebar,
            });
            expect(page.store.getBoolean("tabs.sidebarCollapsed")).toBe(compact);
            expect(page.store.isDefault("tabs.sidebarCollapsed")).toBe(true);
            expect(page.store.provenance("tabs.sidebarCollapsed")).toBe("responsive-default");
            expect(page.store.changedIds()).not.toContain("tabs.sidebarCollapsed");
            expect(page.store.snapshot()).not.toHaveProperty("tabs.sidebarCollapsed");
            page.destroy();
        }
    });

    it("persists an explicit choice even when it equals the current compact default", () => {
        const storage = new MemoryStorage();
        const prefs = new Preferences(storage);
        const compact = new SidebarNavigation(prefs, true);
        const page = createSettingsPage({
            prefs,
            appearance: new AppearanceController(prefs),
            sidebar: compact,
        });

        page.store.set("tabs.sidebarCollapsed", true);
        expect(compact.hasExplicitChoice).toBe(true);
        expect(page.store.isDefault("tabs.sidebarCollapsed")).toBe(false);
        expect(page.store.provenance("tabs.sidebarCollapsed")).toBe("stored");
        expect(page.store.changedIds()).toContain("tabs.sidebarCollapsed");
        expect(page.store.snapshot()).toMatchObject({ "tabs.sidebarCollapsed": true });

        const wide = new SidebarNavigation(new Preferences(storage), false);
        expect(wide.collapsed).toBe(true);
        expect(wide.provenance).toBe("stored");

        page.store.reset("tabs.sidebarCollapsed");
        expect(compact.collapsed).toBe(true);
        expect(page.store.changedIds()).not.toContain("tabs.sidebarCollapsed");
        expect(page.store.snapshot()).not.toHaveProperty("tabs.sidebarCollapsed");
        page.destroy();
    });

    it("notifies the mounted shell when the state changes", () => {
        const state = new SidebarNavigation(new Preferences(new MemoryStorage()), false);
        const listener = vi.fn();
        state.subscribe(listener);
        state.toggle();
        expect(listener).toHaveBeenCalled();
        expect(state.collapsed).toBe(true);
    });
});

// @vitest-environment jsdom
describe("applySidebarNavigation", () => {
    function dom() {
        const workspace = document.createElement("div");
        const topbar = document.createElement("nav");
        const navigation = document.createElement("div");
        navigation.id = "site-primary-navigation";
        const toggle = document.createElement("button");
        toggle.setAttribute("aria-controls", navigation.id);
        topbar.append(toggle, navigation);
        workspace.append(topbar);
        document.body.replaceChildren(workspace);
        return { workspace, topbar, navigation, toggle };
    }

    it("collapses a vertical rail while leaving the toggle focused and available", () => {
        const elements = dom();
        elements.toggle.focus();
        const result = applySidebarNavigation(elements, "left", true, {
            collapse: "Collapse the side navigation",
            expand: "Expand the side navigation",
        });

        expect(result).toEqual({ collapsed: true, chevron: "right" });
        expect(elements.navigation.hidden).toBe(true);
        expect(elements.toggle.hidden).toBe(false);
        expect(elements.toggle.getAttribute("aria-expanded")).toBe("false");
        expect(elements.toggle.getAttribute("aria-label")).toBe("Expand the side navigation");
        expect(document.activeElement).toBe(elements.toggle);
    });

    it("expands the same rail and restores its accessible state", () => {
        const elements = dom();
        applySidebarNavigation(elements, "right", false, {
            collapse: "Collapse the side navigation",
            expand: "Expand the side navigation",
        });
        expect(elements.navigation.hidden).toBe(false);
        expect(elements.toggle.getAttribute("aria-expanded")).toBe("true");
        expect(elements.toggle.title).toBe("Collapse the side navigation");
    });

    it("keeps horizontal navigation visible and removes an inapplicable toggle", () => {
        const elements = dom();
        const result = applySidebarNavigation(elements, "bottom", true, {
            collapse: "Collapse the side navigation",
            expand: "Expand the side navigation",
        });
        expect(result.collapsed).toBe(false);
        expect(elements.navigation.hidden).toBe(false);
        expect(elements.toggle.hidden).toBe(true);
        expect(elements.workspace.dataset.sidebarCollapsed).toBe("false");
    });
});
