// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "./Preferences.js";
import { attachPanelGeometry } from "./PanelGeometry.js";
import { PANEL_GEOMETRY_SURFACES } from "./panelGeometryCoverage.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
});

function panel(): HTMLElement {
    const element = document.createElement("section");
    element.getBoundingClientRect = () => {
        const width = Number.parseFloat(element.style.width) || 400;
        const height = Number.parseFloat(element.style.height) || 300;
        const left = Number.parseFloat(element.style.left) || 100;
        const top = Number.parseFloat(element.style.top) || 80;
        return {
            x: left,
            y: top,
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
            toJSON: () => ({}),
        };
    };
    document.body.append(element);
    return element;
}

describe("panel geometry", () => {
    it("adds visible controls, persists keyboard resize/move, and restores the same surface", () => {
        const storage = new MemoryStorage();
        const first = panel();
        const firstController = attachPanelGeometry(first, {
            id: "test-panel",
            floating: true,
            preferences: new Preferences(storage),
        });
        firstController.mountToolbar();
        expect(first.querySelectorAll(".mb-panel-geometry-button")).toHaveLength(4);
        first.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "ArrowRight",
                altKey: true,
                shiftKey: true,
                bubbles: true,
            }),
        );
        first.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true }),
        );
        expect(first.style.width).toBe("424px");
        expect(first.style.top).toBe("104px");
        firstController.destroy();

        const second = panel();
        const secondController = attachPanelGeometry(second, {
            id: "test-panel",
            floating: true,
            preferences: new Preferences(storage),
        });
        secondController.restore();
        expect(second.style.width).toBe("424px");
        expect(second.style.top).toBe("104px");
        secondController.destroy();
    });

    it("bounds restored geometry to the viewport and resets it through an accessible control", () => {
        const storage = new MemoryStorage();
        storage.setItem(
            "mbm-site:panel.geometry.v1.bound-panel",
            JSON.stringify({ version: 1, width: 5000, height: 4000, x: 9000, y: 9000 }),
        );
        const element = panel();
        const reset = vi.fn();
        const controller = attachPanelGeometry(element, {
            id: "bound-panel",
            floating: true,
            preferences: new Preferences(storage),
            onReset: reset,
        });
        controller.mountToolbar();
        controller.restore();
        expect(Number.parseFloat(element.style.width)).toBeLessThanOrEqual(776);
        expect(Number.parseFloat(element.style.height)).toBeLessThanOrEqual(576);
        const resetButton = [...element.querySelectorAll<HTMLButtonElement>("button")].find(
            (button) => button.getAttribute("aria-label")?.startsWith("Reset"),
        );
        resetButton?.click();
        expect(reset).toHaveBeenCalledOnce();
        expect(storage.getItem("mbm-site:panel.geometry.v1.bound-panel")).toBeNull();
        controller.destroy();
    });

    it("keeps the explicit inventory complete and unique", () => {
        expect(PANEL_GEOMETRY_SURFACES.map((surface) => surface.id)).toEqual([
            "anchored-panels",
            "interactive-overlays",
            "site-tab-panels",
            "settings-tab-panels",
        ]);
        expect(new Set(PANEL_GEOMETRY_SURFACES.map((surface) => surface.owner)).size).toBe(
            PANEL_GEOMETRY_SURFACES.length,
        );
        expect(PANEL_GEOMETRY_SURFACES.filter((surface) => surface.floating)).toHaveLength(2);
        for (const surface of PANEL_GEOMETRY_SURFACES) {
            const source = readFileSync(
                resolve(process.cwd(), "packages/site/src", surface.owner),
                "utf8",
            );
            expect(source, `${surface.owner} must attach the shared geometry controller`).toContain(
                "attachPanelGeometry(",
            );
        }
    });
});
