// @vitest-environment jsdom

/**
 * Regression guard: Escape while typing in the "Edit appearance..." context menu's own
 * nested regex builder must close only the builder popover, and hand focus back to the
 * menu's search field -- not discard the whole menu.
 *
 * Both the menu's `AnchoredPanel` and the builder's own, independent `AnchoredPanel`
 * (opened lazily from `openMenu()`'s search-row builder button, see
 * `contextMenu.ts`'s `buildMenu` -> `attachRegexBuilder` -> `builderPanel.ts`'s
 * `createBuilderController`) register a capture-phase "keydown" listener on `document`
 * (`anchoredPanel.ts`'s `show()`). The menu's panel is constructed and shown first
 * (`openElementMenu`), so its listener is always added -- and therefore always fires --
 * before the builder's, which is only created once the builder button is clicked. Per the
 * DOM spec, listeners registered on the same node run in the order they were added,
 * regardless of which popover is visually on top.
 *
 * Before the fix (`AnchoredPanel.hasOpenNestedPanel`, checked in `handleKeydown` before
 * acting on Escape), the outer (menu) listener ran first, called `this.close()`, and that
 * synchronously cascaded through `contextMenu.ts`'s `onClose` -> `closeMenu()` ->
 * `builder.destroy()` -> the inner panel's own `close()`/`destroy()` before the inner
 * listener ever got its turn in the same dispatch -- so one Escape press meant to dismiss
 * just the nested builder instead discarded the whole menu and returned focus all the way
 * out to the originally right-clicked element (`returnFocusTo: element`) instead of the
 * menu's own search field.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppearanceController } from "../controller.js";
import { AppearanceStore } from "../store.js";
import { Preferences } from "../../platform/Preferences.js";
import { openElementMenu } from "./contextMenu.js";

const cells = new Map<string, string>();

beforeAll(() => {
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
});

function openMenu(): HTMLElement {
    const target = document.createElement("div");
    document.body.append(target);
    const controller = new AppearanceController(new Preferences(null), new AppearanceStore());
    openElementMenu(target, { kind: "tab" }, controller, 10, 10);
    const panel = document.querySelector<HTMLElement>(".mbm-panel");
    if (panel === null) throw new Error("the appearance context menu did not open");
    return panel;
}

describe("Escape inside the context menu's nested regex builder", () => {
    beforeEach(() => {
        cells.clear();
        document.body.replaceChildren();
    });

    it("closes only the nested regex builder, keeping the menu open with focus back on its search field", () => {
        const panel = openMenu();
        const menuSearch = panel.querySelector<HTMLInputElement>("input[type='search']")!;
        const builderButton = panel.querySelector<HTMLButtonElement>(".mbm-search__builder")!;
        builderButton.click();

        const patternInput = document.querySelector<HTMLInputElement>("input.mbm-input--code");
        expect(patternInput, "the regex builder popover never opened").not.toBeNull();
        patternInput!.focus();

        // The reported failure: Escape while focus sits inside the nested builder's own
        // pattern field, which is what a visitor typing a pattern actually has focused.
        patternInput!.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );

        expect(
            document.querySelector("input.mbm-input--code"),
            "Escape left the builder popover open instead of closing it",
        ).toBeNull();
        expect(
            panel.hidden,
            "Escape discarded the whole menu instead of just the nested builder popover",
        ).toBe(false);
        expect(
            document.activeElement,
            "focus did not return to the menu's own search field after closing just the builder",
        ).toBe(menuSearch);
    });

    it("still closes the menu itself on Escape once no popover is nested inside it", () => {
        const panel = openMenu();
        const menuSearch = panel.querySelector<HTMLInputElement>("input[type='search']")!;
        menuSearch.focus();

        menuSearch.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        );

        // The topmost-popover guard must not swallow Escape when this panel genuinely is
        // the topmost one -- the ordinary, unnested case still has to work.
        expect(panel.hidden, "Escape stopped closing the menu when nothing was nested inside it").toBe(
            true,
        );
    });
});
