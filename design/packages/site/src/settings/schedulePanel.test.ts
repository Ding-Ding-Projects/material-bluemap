// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceController } from "../appearance/controller.js";
import { Preferences } from "../platform/Preferences.js";
import { ThemeController } from "../theme/ThemeController.js";
import { createSettingsPage } from "./page.js";
import { defaultRule } from "./schedule.js";

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

beforeEach(() => {
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
    Element.prototype.scrollIntoView = vi.fn();
});

function page(storage = new MemoryStorage()) {
    const prefs = new Preferences(storage);
    return {
        prefs,
        view: createSettingsPage({
            prefs,
            theme: new ThemeController(prefs),
            appearance: new AppearanceController(prefs),
        }),
    };
}

describe("scheduled settings page", () => {
    it("ships a searchable, teleportable automation tab with guided controls", () => {
        const { view } = page();
        const searchable = view.search.host.listSettings();
        expect(searchable.map((setting) => setting.id)).toEqual(
            expect.arrayContaining(["schedule.rules", "schedule.externalSources"]),
        );

        view.revealSetting("schedule.rules");
        expect(
            view.element.querySelector("#mb-tab-automation")?.getAttribute("aria-selected"),
        ).toBe("true");
        expect(view.element.querySelector("[data-schedule-surface='rules'] select")).toBeInstanceOf(
            HTMLSelectElement,
        );

        const add = view.element.querySelector<HTMLButtonElement>(
            "button[data-i18n-key='schedule.add']",
        );
        add?.click();
        expect(view.element.querySelector("input[type='date']")).toBeInstanceOf(HTMLInputElement);
        expect(view.element.querySelector("input[type='time']")).toBeInstanceOf(HTMLInputElement);
        expect(view.element.textContent).toContain("Timezone");
        expect(view.element.textContent).toContain("Home Assistant");
        view.destroy();
    });

    it("saves a new rule through the editor and records a recoverable history entry", async () => {
        const { view } = page();
        view.activateTab("automation");
        view.element
            .querySelector<HTMLButtonElement>("button[data-i18n-key='schedule.add']")
            ?.click();
        view.element
            .querySelector<HTMLButtonElement>("button[data-i18n-key='schedule.save']")
            ?.click();
        await vi.waitFor(() => {
            expect(view.element.querySelectorAll(".mb-history-row")).toHaveLength(1);
        });
        expect(view.element.querySelectorAll(".mb-history-row")).toHaveLength(1);
        view.destroy();
    });

    it("applies a scheduled theme as the rendered theme while retaining the light base", async () => {
        const storage = new MemoryStorage();
        const prefs = new Preferences(storage);
        prefs.write("theme.mode", "light");
        prefs.writeJson("scheduled-settings.rules", {
            version: 1,
            rules: [
                {
                    ...defaultRule(),
                    timezone: "UTC",
                    startTime: "00:00",
                    endTime: "00:00",
                    values: { "theme.mode": "dark" },
                },
            ],
        });
        const view = createSettingsPage({
            prefs,
            theme: new ThemeController(prefs),
            appearance: new AppearanceController(prefs),
        });
        await vi.waitFor(() => expect(view.store.getString("theme.mode")).toBe("dark"));
        expect(document.documentElement.dataset["theme"]).toBe("dark");
        expect(view.store.snapshot()["theme.mode"]).toBe("light");
        view.destroy();
    });

    it("accepts a session-only Home Assistant token and never stores it", async () => {
        const { prefs, view } = page();
        view.activateTab("automation");
        view.element
            .querySelector<HTMLButtonElement>("button[data-i18n-key='schedule.add']")
            ?.click();
        const source = [...view.element.querySelectorAll<HTMLSelectElement>("select")].find(
            (select) => [...select.options].some((option) => option.value === "home-assistant"),
        );
        if (source === undefined) throw new Error("missing source picker");
        source.value = "home-assistant";
        source.dispatchEvent(new Event("change", { bubbles: true }));
        const token = view.element.querySelector<HTMLInputElement>("input[type='password']");
        expect(token).toBeInstanceOf(HTMLInputElement);
        expect(token?.getAttribute("autocomplete")).toBe("new-password");
        expect(view.element.textContent).toContain("only in memory for the current page session");
        token!.value = "top-secret-session-value";
        view.element
            .querySelector<HTMLButtonElement>("button[data-i18n-key='schedule.useSessionToken']")
            ?.click();
        await vi.waitFor(() => expect(token!.value).toBe(""));
        expect(prefs.read("scheduled-settings.rules", "")).not.toContain(
            "top-secret-session-value",
        );
        expect(view.element.textContent).toContain("loaded in memory");
        view.element
            .querySelector<HTMLButtonElement>("button[data-i18n-key='schedule.clearSessionToken']")
            ?.click();
        expect(view.element.textContent).toContain("No token is loaded");
        view.destroy();
    });
});
