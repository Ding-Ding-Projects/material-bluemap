// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { I18n } from "../i18n/I18n.js";
import { Preferences } from "../platform/Preferences.js";
import { createCommandPalette, type PaletteCommand } from "./commandPalette.js";

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

/** Let the surface's debounced search run and its results render. */
async function flush(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 50));
}

function palette(list: () => readonly PaletteCommand[]): ReturnType<typeof createCommandPalette> {
    const prefs = new Preferences(new MemoryStorage());
    const i18n = new I18n(prefs);
    return createCommandPalette({ prefs, i18n, list });
}

describe("command palette setting rows", () => {
    it("renders a toggle setting as a real switch, not a link to its tab", async () => {
        let stored = false;
        const view = palette(() => [
            {
                id: "setting-demo-toggle",
                label: "Surface tint",
                description: "Whether cards pick up the accent colour.",
                kind: "setting",
                control: {
                    kind: "toggle",
                    value: stored,
                    set: (value) => {
                        stored = value;
                    },
                },
                run: () => undefined,
            },
        ]);
        view.open();
        await flush();

        const row = view.element.querySelector(".mb-command-palette__setting");
        expect(row).not.toBeNull();
        expect(row?.querySelector("button")).toBeNull();

        const input = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
        expect(input).not.toBeNull();
        expect(input?.getAttribute("role")).toBe("switch");
        expect(input?.checked).toBe(false);

        input!.checked = true;
        input!.dispatchEvent(new Event("change"));
        expect(stored).toBe(true);
        // Writing the control never closes the palette: the visitor is still looking at it.
        expect(view.isOpen()).toBe(true);

        view.close();
    });

    it("renders a choice setting as a real select carrying every option", async () => {
        let stored = "system";
        const view = palette(() => [
            {
                id: "setting-demo-choice",
                label: "Theme",
                description: "Light, dark, or match the system.",
                kind: "setting",
                control: {
                    kind: "choice",
                    value: stored,
                    options: [
                        { id: "system", label: "Match system" },
                        { id: "light", label: "Light" },
                        { id: "dark", label: "Dark" },
                    ],
                    set: (value) => {
                        stored = value;
                    },
                },
                run: () => undefined,
            },
        ]);
        view.open();
        await flush();

        const select = view.element.querySelector<HTMLSelectElement>(
            ".mb-command-palette__setting select",
        );
        expect(select).not.toBeNull();
        expect([...select!.options].map((option) => option.value)).toEqual([
            "system",
            "light",
            "dark",
        ]);
        expect(select!.value).toBe("system");

        select!.value = "dark";
        select!.dispatchEvent(new Event("change"));
        expect(stored).toBe("dark");

        view.close();
    });

    it("renders a number setting as a bounded box that clamps on commit", async () => {
        let stored = 1;
        const view = palette(() => [
            {
                id: "setting-demo-number",
                label: "Motion scale",
                description: "How much animation plays.",
                kind: "setting",
                control: {
                    kind: "number",
                    value: stored,
                    min: 0,
                    max: 2,
                    step: 0.05,
                    unit: "",
                    set: (value) => {
                        stored = value;
                    },
                },
                run: () => undefined,
            },
        ]);
        view.open();
        await flush();

        const input = view.element.querySelector<HTMLInputElement>(
            '.mb-command-palette__setting input[type="number"]',
        );
        expect(input).not.toBeNull();
        expect(input!.value).toBe("1");

        input!.value = "9";
        input!.dispatchEvent(new Event("change"));
        expect(stored).toBe(2);
        expect(input!.value).toBe("2");

        view.close();
    });

    it("still renders a command as a single activating button", async () => {
        let ran = false;
        const view = palette(() => [
            {
                id: "run-me",
                label: "Reset the camera",
                description: "Puts the view back where it started.",
                kind: "command",
                run: () => {
                    ran = true;
                },
            },
        ]);
        view.open();
        await flush();

        const button = view.element.querySelector<HTMLButtonElement>(".mb-command-palette__result");
        expect(button).not.toBeNull();
        button!.click();
        expect(ran).toBe(true);
        expect(view.isOpen()).toBe(false);
    });
});
