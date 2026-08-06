// @vitest-environment jsdom

/**
 * Regression guard: the appearance editor must not close itself when a visitor uses its
 * OWN nested colour or font popover.
 *
 * `openAppearanceEditor` passes `dismissBoundary: null` (see `appearanceEditor.ts`) because
 * its `anchor` is the live element being edited -- possibly page-root-sized -- and treating
 * that whole element as "inside" the panel is the original reported bug
 * (`anchoredPanelDismissalPolicy.test.ts`, `appearanceEditor.test.ts`).
 *
 * But `dismissBoundary: null` alone has a second-order failure: `colorRow()` and `fontRow()`
 * in `./controls.ts` each open their own `AnchoredPanel` (a colour-swatch picker, a
 * font-family list) anchored to a `<button>` that lives inside the editor's own rendered
 * content. Every `AnchoredPanel.element` is, per `AnchoredPanel.show()`, always appended as a
 * fresh top-level child of `document.body` -- never nested inside whatever caller opened it.
 * So a pointerdown inside that nested popover lands on a node that is NOT a descendant of the
 * editor panel's own `this.element`, and with `dismissBoundary: null` there was nothing else
 * to stop the editor's document-level pointerdown listener (registered first, so it runs
 * first) from concluding the click was "outside" and calling `this.close()` -- hiding the
 * whole editor and clearing its content out from under the still-open colour/font popover.
 *
 * The fix (see `anchoredPanel.ts`'s `OPEN_PANELS` registry and `isInsideNestedPanel`) makes an
 * `AnchoredPanel` recognise a popover that was itself opened from a control living inside its
 * own content, without widening `dismissBoundary` back into a large static wrapper.
 *
 * ## Why this file drives `fontRow()` rather than `colorRow()`
 *
 * `colorRow()`'s popover is `createColorPicker()` (`../color/picker.ts`), which -- entirely
 * independently of this fix -- currently throws `RangeError: Maximum call stack size
 * exceeded` the instant it renders (its own `render()` dispatches a synthetic `"input"` event
 * on its sliders, which re-triggers the very listeners that call back into `render()`;
 * unconditional infinite recursion, reproducible in any environment, confirmed by isolating
 * `swatchTrigger.click()` down to that single call with no other code involved). That bug is
 * unrelated to overlay dismissal and pre-dates this fix -- no test anywhere calls
 * `createColorPicker()` today -- so it is tracked and fixed separately rather than folded into
 * this file. `fontRow()`'s popover (`buildFontList()`) has no such defect and exercises the
 * exact same `AnchoredPanel` wiring `colorRow()` does (an `AnchoredPanel` constructed with the
 * safe default `dismissBoundary`, anchored to a `<button>` the row renders as part of the
 * editor's own DOM), so it pins the mechanism this fix actually changed.
 *
 * The last test below additionally drives a second, synthetic `AnchoredPanel` pair built the
 * same way `colorRow()` builds its own (anchored to a trigger living inside the editor's
 * content, default `dismissBoundary`) so the fix is also verified against the colour-swatch
 * shape directly, without depending on `createColorPicker()`'s unrelated internals.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AppearanceController } from "../controller.js";
import { AppearanceStore } from "../store.js";
import { Preferences } from "../../platform/Preferences.js";
import { AnchoredPanel } from "../../search/anchoredPanel.js";
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

/** AnchoredPanel listens for "pointerdown", so a plain synthetic Event with the right
 * target is enough -- see the identical helper in appearanceEditor.test.ts for why. */
function pointerDownOn(target: HTMLElement): void {
    const event = new Event("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "target", { value: target, configurable: true });
    target.dispatchEvent(event);
}

function newController(): AppearanceController {
    return new AppearanceController(new Preferences(null), new AppearanceStore());
}

function editorPanel(): HTMLElement {
    const panels = [...document.querySelectorAll<HTMLElement>(".mbm-panel")];
    const found = panels.find((panel) => panel.querySelector(".mb-appearance-editor") !== null);
    expect(found, "the appearance editor panel never opened").not.toBeUndefined();
    return found!;
}

function isVisible(panel: HTMLElement): boolean {
    return !panel.hidden;
}

/** Every `.mbm-panel` that is NOT the editor's own -- i.e. a nested colour/font popover. */
function nestedPopovers(editor: HTMLElement): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(".mbm-panel")].filter((panel) => panel !== editor);
}

describe("the appearance editor's nested colour/font popovers", () => {
    it("stays open, and keeps the popover open, when a click lands inside the font list it opened", () => {
        const anchor = document.createElement("div");
        anchor.tabIndex = -1;
        document.body.append(anchor);
        openAppearanceEditor({ anchor, kind: "card", controller: newController() });

        const editor = editorPanel();
        expect(isVisible(editor)).toBe(true);

        const fontTrigger = editor.querySelector<HTMLButtonElement>(".mb-font-trigger");
        expect(fontTrigger, "no font-family trigger rendered in the editor").not.toBeNull();
        fontTrigger!.click();

        const popovers = nestedPopovers(editor);
        expect(popovers, "the font trigger did not open its own popover").toHaveLength(1);
        const fontList = popovers[0]!;
        expect(isVisible(fontList)).toBe(true);

        // A pointerdown that lands *inside the font list itself* -- its search box, one of
        // its font-name buttons -- is not a descendant of the editor panel's own element
        // (the popover is a sibling top-level child of document.body). Before the fix this
        // was read as "outside the editor" and closed it.
        const insideList = fontList.querySelector<HTMLElement>("input, button") ?? fontList;
        pointerDownOn(insideList);

        expect(isVisible(editor), "the editor closed itself from its own font list").toBe(true);
        expect(isVisible(fontList), "the font list closed even though the click landed inside it").toBe(true);
    });

    it("still closes the editor (and its open font list) on a click genuinely outside both", () => {
        const anchor = document.createElement("div");
        anchor.tabIndex = -1;
        document.body.append(anchor);
        openAppearanceEditor({ anchor, kind: "card", controller: newController() });

        const editor = editorPanel();
        const fontTrigger = editor.querySelector<HTMLButtonElement>(".mb-font-trigger")!;
        fontTrigger.click();
        const fontList = nestedPopovers(editor)[0]!;

        const elsewhere = document.createElement("div");
        document.body.append(elsewhere);
        pointerDownOn(elsewhere);

        // A genuinely outside click must still dismiss everything -- the whole point of this
        // package's overlay-dismissal work, and the thing DO NOT REINTRODUCE protects.
        expect(isVisible(editor)).toBe(false);
        expect(isVisible(fontList)).toBe(false);
    });

    it("stays open for a colour-swatch-shaped popover too: same AnchoredPanel wiring colorRow() uses", () => {
        // Mirrors colorRow()'s own construction in ./controls.ts exactly -- an AnchoredPanel
        // left at the safe default dismissBoundary (no override), anchored to a <button> that
        // is a genuine DOM descendant of the editor's rendered content -- without going
        // through createColorPicker(), which has its own, unrelated, pre-existing infinite-
        // recursion defect (see this file's top comment) that would crash before this
        // assertion ever ran.
        const anchor = document.createElement("div");
        anchor.tabIndex = -1;
        document.body.append(anchor);
        openAppearanceEditor({ anchor, kind: "card", controller: newController() });

        const editor = editorPanel();
        const trigger = document.createElement("button");
        trigger.type = "button";
        trigger.className = "mb-color-trigger";
        trigger.textContent = "Choose colour";
        editor.querySelector(".mb-appearance-editor")!.append(trigger);

        const swatchPanel = new AnchoredPanel({
            anchor: trigger,
            returnFocusTo: trigger,
            title: "Colour",
        });
        const swatchContent = document.createElement("div");
        const hexInput = document.createElement("input");
        hexInput.type = "text";
        swatchContent.append(hexInput);
        trigger.addEventListener("click", () => {
            swatchPanel.show(swatchContent);
        });

        trigger.click();
        expect(swatchPanel.isOpen).toBe(true);
        expect(isVisible(editor)).toBe(true);

        pointerDownOn(hexInput);

        expect(isVisible(editor), "the editor closed itself from its own colour swatch popover").toBe(true);
        expect(swatchPanel.isOpen, "the colour swatch popover closed even though the click landed inside it").toBe(
            true,
        );

        const elsewhere = document.createElement("div");
        document.body.append(elsewhere);
        pointerDownOn(elsewhere);
        expect(isVisible(editor)).toBe(false);
        expect(swatchPanel.isOpen).toBe(false);

        swatchPanel.destroy();
    });
});
