// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Preferences } from "./Preferences.js";
import { attachPanelGeometry, panelGeometryFor } from "./PanelGeometry.js";
import { PANEL_GEOMETRY_SURFACES } from "./panelGeometryCoverage.js";
import { AnchoredPanel } from "../search/anchoredPanel.js";
import { Menu } from "./Menu.js";
import { Overlay } from "./Overlay.js";

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
    document.body.replaceChildren();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 800 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 600 });
    window.matchMedia = vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    });
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

    it("instantiates every explicit transient owner and proves real geometry is attached", () => {
        expect(PANEL_GEOMETRY_SURFACES.map((surface) => surface.id)).toEqual([
            "anchored-popover",
            "dialog-overlay",
            "menu-overlay",
            "command-menu",
        ]);
        expect(new Set(PANEL_GEOMETRY_SURFACES.map((surface) => surface.owner)).size).toBe(
            PANEL_GEOMETRY_SURFACES.length,
        );
        expect(PANEL_GEOMETRY_SURFACES.every((surface) => surface.floating)).toBe(true);
        for (const surface of PANEL_GEOMETRY_SURFACES) {
            const anchor = document.createElement("button");
            document.body.append(anchor);
            let element: HTMLElement;
            let close: () => void;
            if (surface.id === "anchored-popover") {
                const owner = new AnchoredPanel({
                    anchor,
                    returnFocusTo: anchor,
                    title: "Coverage popover",
                    geometryId: "coverage-anchored",
                });
                owner.show(document.createElement("button"));
                element = owner.element;
                close = () => owner.destroy();
            } else if (surface.id === "command-menu") {
                const owner = new Menu(anchor, {
                    label: "Coverage menu",
                    geometryId: "coverage-command-menu",
                    entries: [
                        {
                            render: (label) => (label.textContent = "Command"),
                            onSelect: () => undefined,
                        },
                    ],
                });
                owner.show();
                element = owner.element;
                close = () => owner.close();
            } else {
                const owner = new Overlay(anchor, {
                    label: surface.id,
                    role: surface.id === "menu-overlay" ? "menu" : "dialog",
                    geometryId: `coverage-${surface.id}`,
                });
                owner.element.append(document.createElement("button"));
                owner.show();
                element = owner.element;
                close = () => owner.close();
            }
            const controller = panelGeometryFor(element);
            expect(controller, `${surface.owner} returned no geometry controller`).not.toBeNull();
            expect(controller?.floating, `${surface.owner} is not draggable`).toBe(true);
            expect(element.dataset["panelGeometry"]).toBe("floating");
            expect(element.querySelector(".mb-panel-geometry-toolbar")).not.toBeNull();
            close();
            element.remove();
            anchor.remove();
        }
    });
});
