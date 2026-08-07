// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { createDiscoveryView } from "./discoveryView.js";

class MemoryStorage implements Storage {
    private readonly values = new Map<string, string>();
    get length(): number { return this.values.size; }
    clear(): void { this.values.clear(); }
    getItem(key: string): string | null { return this.values.get(key) ?? null; }
    key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
    removeItem(key: string): void { this.values.delete(key); }
    setItem(key: string, value: string): void { this.values.set(key, value); }
}

beforeEach(() => {
    document.body.replaceChildren();
});

describe("discovery group searches", () => {
    it("adds and removes a dedicated search when user groups change", () => {
        const storage = new MemoryStorage();
        const i18n = new I18n(new Preferences(storage));
        const firstGroup = {
            id: "group-docs",
            label: "Docs",
            stripId: "main",
            stripLabel: "Main tabs",
            windowId: "window-main",
            windowLabel: "Worldlens",
            collapsed: false,
            tabCount: 1,
        };
        const groups = [firstGroup];
        const listeners = new Set<() => void>();
        const model = {
            active: "home",
            subscribe(listener: () => void): () => void {
                listeners.add(listener);
                return () => listeners.delete(listener);
            },
        };
        const tabs = {
            model,
            listGroups: () => groups,
            listPages: () => [],
            activate: () => undefined,
            reveal: () => undefined,
        };
        const settings = {
            search: {
                host: {
                    listSettings: () => [],
                    activeTabId: () => "general",
                    revealSetting: () => undefined,
                    subscribe: () => () => undefined,
                },
            },
        };

        const view = createDiscoveryView({
            tabs: tabs as never,
            settings: settings as never,
            i18n,
            openArticle: () => undefined,
        });
        document.body.append(view);
        expect(view.querySelectorAll(".mb-discovery-groups .mbm-search")).toHaveLength(1);

        groups.push({ ...firstGroup, id: "group-settings", label: "Settings" });
        for (const listener of [...listeners]) listener();
        expect(view.querySelectorAll(".mb-discovery-groups .mbm-search")).toHaveLength(2);

        groups.splice(0, 1);
        for (const listener of [...listeners]) listener();
        expect(view.querySelectorAll(".mb-discovery-groups .mbm-search")).toHaveLength(1);
    });
});
