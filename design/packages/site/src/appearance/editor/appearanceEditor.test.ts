// @vitest-environment jsdom

/**
 * Regression guard for the per-element appearance editor's outside-click dismissal.
 *
 * `openAppearanceEditor` anchors its `AnchoredPanel` to the live element being edited so the
 * editor can position itself beside it -- but that element can be large: a whole footer, a
 * whole card, a whole page's wrapping surface. Before this file's own commit, `AnchoredPanel`
 * treated ANY click landing inside that anchor as "inside the panel" and refused to close,
 * because the same `anchor` doubled as both the position reference and the outside-click
 * exemption. A visitor who right-clicked a large surface, opened its appearance editor, and
 * then clicked anywhere else on that same surface would find the editor stuck open -- exactly
 * the reported "menu not closing when clicking off" symptom, one layer over from the menu
 * itself. This pins the fix (`dismissBoundary: null`) so a future edit cannot quietly widen
 * the anchor back into a dismiss boundary.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppearanceController } from "../controller.js";
import { AppearanceStore } from "../store.js";
import { Preferences } from "../../platform/Preferences.js";
import { closeAppearanceEditor, openAppearanceEditor } from "./appearanceEditor.js";

const cells = new Map<string, string>();

beforeEach(() => {
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
    cells.clear();
    document.body.replaceChildren();
});

afterEach(() => {
    closeAppearanceEditor();
    document.body.replaceChildren();
});

function pointerDownOn(target: HTMLElement): void {
    // AnchoredPanel listens for "pointerdown", not "click": a click that starts inside and
    // ends outside must not close the panel, only a press that starts outside should. A plain
    // Event with the right type is enough -- the listener only reads event.target and
    // event.key, and jsdom's PointerEvent support is inconsistent across versions.
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: target, configurable: true });
    target.dispatchEvent(event);
}

function openPanel(): HTMLElement {
    return document.querySelector<HTMLElement>(".mbm-panel")!;
}

function isVisible(panel: HTMLElement): boolean {
    return !panel.hidden;
}

/** A large wrapper standing in for a page root, a footer, or any other big appearance target. */
function buildLargeWrappedSurface(): { wrapper: HTMLDivElement; innerButton: HTMLButtonElement } {
    const wrapper = document.createElement("div");
    wrapper.className = "mb-shell-footer";
    // `registerAppearanceTarget` gives every non-natively-focusable target a `tabindex="-1"`
    // (see `ensureFocusable` in ./contextMenu.ts) so focus-return after close has somewhere
    // to land. Mirrored by hand here rather than going through the full contextmenu/keyboard
    // wiring, which `contextMenu.test.ts` already covers.
    wrapper.tabIndex = -1;
    const heading = document.createElement("h1");
    heading.textContent = "A large registered surface";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Plenty of unrelated content a visitor might click.";
    const innerButton = document.createElement("button");
    innerButton.type = "button";
    innerButton.textContent = "Unrelated control inside the same surface";
    wrapper.append(heading, paragraph, innerButton);
    document.body.append(wrapper);
    return { wrapper, innerButton };
}

function newController(): AppearanceController {
    return new AppearanceController(new Preferences(null), new AppearanceStore());
}

describe("the appearance editor's outside-click dismissal", () => {
    it("closes when a click lands elsewhere inside the large element it was anchored beside", () => {
        const { wrapper, innerButton } = buildLargeWrappedSurface();
        openAppearanceEditor({ anchor: wrapper, kind: "card", controller: newController() });

        const panel = openPanel();
        expect(panel, "the appearance editor never opened").not.toBeNull();
        expect(isVisible(panel)).toBe(true);

        // The click lands on a sibling element *inside* the same registered wrapper -- not on
        // the panel, not on the wrapper itself. Before the fix, `anchor.contains(target)` made
        // this count as "inside" and the editor stayed open forever.
        pointerDownOn(innerButton);
        expect(isVisible(panel)).toBe(false);
    });

    it("closes on a click that lands directly on the anchor element itself", () => {
        const { wrapper } = buildLargeWrappedSurface();
        openAppearanceEditor({ anchor: wrapper, kind: "card", controller: newController() });
        const panel = openPanel();

        pointerDownOn(wrapper);
        expect(isVisible(panel)).toBe(false);
    });

    it("closes on a click genuinely outside the wrapped surface, same as before the fix", () => {
        const { wrapper } = buildLargeWrappedSurface();
        openAppearanceEditor({ anchor: wrapper, kind: "card", controller: newController() });
        const panel = openPanel();

        const elsewhere = document.createElement("div");
        document.body.append(elsewhere);
        pointerDownOn(elsewhere);
        expect(isVisible(panel)).toBe(false);
    });

    it("does not close when the click lands inside the editor panel's own content", () => {
        const { wrapper } = buildLargeWrappedSurface();
        openAppearanceEditor({ anchor: wrapper, kind: "card", controller: newController() });
        const panel = openPanel();

        const resetButton = [...panel.querySelectorAll<HTMLButtonElement>("button")].find(
            (button) => button.textContent === "Reset this element",
        );
        expect(resetButton, "the editor's own reset control is missing").not.toBeUndefined();
        pointerDownOn(resetButton!);
        expect(isVisible(panel)).toBe(true);
    });

    it("closes on Escape and returns focus to the element that opened it", () => {
        const { wrapper, innerButton } = buildLargeWrappedSurface();
        innerButton.focus();
        openAppearanceEditor({ anchor: wrapper, kind: "card", controller: newController() });
        const panel = openPanel();
        expect(isVisible(panel)).toBe(true);

        panel.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(isVisible(panel)).toBe(false);
        expect(document.activeElement).toBe(wrapper);
    });

    it("removes its document-level listeners on close, so a stuck editor cannot leak a permanent handler", () => {
        const addSpy = vi.spyOn(document, "addEventListener");
        const removeSpy = vi.spyOn(document, "removeEventListener");
        const { wrapper, innerButton } = buildLargeWrappedSurface();

        openAppearanceEditor({ anchor: wrapper, kind: "card", controller: newController() });
        const addedKeydown = addSpy.mock.calls.filter(([type]) => type === "keydown").length;
        const addedPointerdown = addSpy.mock.calls.filter(([type]) => type === "pointerdown").length;
        expect(addedKeydown).toBeGreaterThan(0);
        expect(addedPointerdown).toBeGreaterThan(0);

        pointerDownOn(innerButton);
        const removedKeydown = removeSpy.mock.calls.filter(([type]) => type === "keydown").length;
        const removedPointerdown = removeSpy.mock.calls.filter(([type]) => type === "pointerdown").length;
        expect(removedKeydown).toBe(addedKeydown);
        expect(removedPointerdown).toBe(addedPointerdown);

        addSpy.mockRestore();
        removeSpy.mockRestore();
    });

    it("still repositions correctly beside a small, ordinary anchor (a real tab, not a wrapper)", () => {
        const tab = document.createElement("button");
        tab.type = "button";
        tab.textContent = "Docs";
        document.body.append(tab);

        openAppearanceEditor({ anchor: tab, kind: "tab", instance: "docs", controller: newController() });
        const panel = openPanel();
        expect(isVisible(panel)).toBe(true);

        // A click on the small anchor itself is still "inside its own bounds", and a small
        // anchor being a genuine trigger control is exactly the case `dismissBoundary`
        // defaulting to `anchor` exists to protect elsewhere -- but the appearance editor
        // opts out of that default (see the fix), so even this closes it, consistent with
        // every other case above.
        pointerDownOn(tab);
        expect(isVisible(panel)).toBe(false);
    });
});
