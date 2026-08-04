// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { I18n } from "./I18n.js";
import { Preferences } from "../platform/Preferences.js";

describe("site language and tone settings", () => {
    it("persists two independent funny levels and refreshes bilingual bindings", () => {
        const storage = new Map<string, string>();
        const memoryStorage: Storage = {
            get length() { return storage.size; },
            clear() { storage.clear(); },
            getItem(key) { return storage.get(key) ?? null; },
            key(index) { return [...storage.keys()][index] ?? null; },
            removeItem(key) { storage.delete(key); },
            setItem(key, value) { storage.set(key, value); },
        };
        const prefs = new Preferences(memoryStorage);
        const i18n = new I18n(prefs);
        const node = document.createElement("p");
        document.body.append(node);
        i18n.bindText(node, "site.discoverySubtitle");

        i18n.setMode("bilingual");
        expect(node.querySelector(".i18n-secondary")?.textContent).toContain("每個搜尋");
        const yueBefore = node.querySelector(".i18n-secondary")?.textContent;
        i18n.setFunnyLevel("en", 5);
        expect(node.textContent).toContain("absolutely no excuse");
        expect(node.querySelector(".i18n-secondary")?.textContent).toBe(yueBefore);

        const restored = new I18n(new Preferences(memoryStorage));
        expect(restored.mode).toBe("bilingual");
        expect(restored.funnyEn).toBe(5);
        expect(restored.funnyYue).toBe(3);
        prefs.resetAll();
    });
});
