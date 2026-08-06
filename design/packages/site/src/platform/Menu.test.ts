// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import { Menu } from "./Menu.js";

describe("Menu", () => {
    it("gives context menus an accessible local filter and keeps only matching commands", () => {
        const anchor = document.createElement("button");
        document.body.append(anchor);
        const menu = new Menu(anchor, {
            label: "Page actions",
            entries: [
                { render: (label) => (label.textContent = "Pin page"), onSelect: () => undefined },
                { kind: "separator" },
                { render: (label) => (label.textContent = "Close page"), onSelect: () => undefined },
            ],
            search: { label: "Filter menu items", builderLabel: "Build the pattern", noResults: "Nothing matches." },
        });

        menu.show();
        const input = menu.element.querySelector<HTMLInputElement>("input[type='search']");
        expect(input).not.toBeNull();
        expect(input?.getAttribute("aria-controls")).toBe(menu.element.querySelector("ul")?.id);
        expect(menu.element.querySelectorAll("button.md-menu__item")).toHaveLength(2);

        input!.value = "close";
        input!.dispatchEvent(new Event("input", { bubbles: true }));
        expect([...menu.element.querySelectorAll("button.md-menu__item")].map((button) => button.textContent)).toEqual([
            "Close page",
        ]);

        input!.value = "missing";
        input!.dispatchEvent(new Event("input", { bubbles: true }));
        expect(menu.element.querySelector(".md-menu__no-results")?.textContent).toBe("Nothing matches.");
        menu.close();
    });
});

describe("Menu's own regex builder popover", () => {
    afterEach(() => {
        document.body.replaceChildren();
    });

    /**
     * Overlay and AnchoredPanel both listen for "pointerdown" in the capture phase, not
     * "click": a click that starts inside and ends outside must not close either surface, only
     * a press that starts outside should. A plain Event with the right type is enough -- both
     * listeners only read `event.target` -- and jsdom's PointerEvent support is inconsistent
     * across versions. Mirrors the identical helper in appearanceEditor.test.ts.
     */
    function pointerDownOn(target: HTMLElement): void {
        const event = new Event("pointerdown", { bubbles: true, cancelable: true });
        target.dispatchEvent(event);
    }

    it("stays open when the builder it opened is clicked, but still closes on a real outside click", () => {
        // Regression for: the two-menu overlay (a Menu with a `search` option, such as the tab
        // strip's overflow-tab menu and its "list all pages" menu) opens its regex builder as a
        // separate AnchoredPanel appended directly to document.body -- a sibling of the menu's
        // own overlay element, not nested inside it. Overlay's outside-click handler used to
        // check only its own element and anchor, so the very first click inside that builder (a
        // token button, the pattern field, a flag checkbox) read as "outside the menu" and
        // closed the whole menu -- and, via Menu's onClose, the builder with it -- before a
        // visitor could type a single character.
        const anchor = document.createElement("button");
        document.body.append(anchor);
        const menu = new Menu(anchor, {
            label: "Overflowed tabs",
            entries: [
                { render: (label) => (label.textContent = "Tab one"), onSelect: () => undefined },
                { render: (label) => (label.textContent = "Tab two"), onSelect: () => undefined },
            ],
            search: { label: "Filter tabs", builderLabel: "Build the pattern" },
        });
        menu.show();
        expect(menu.element.isConnected).toBe(true);

        const builderButton = menu.element.querySelector<HTMLButtonElement>(".md-menu__builder");
        expect(builderButton).not.toBeNull();
        builderButton!.click();

        const panel = document.querySelector<HTMLElement>(".mbm-panel");
        expect(panel).not.toBeNull();
        expect(panel!.hidden).toBe(false);

        const patternInput = panel!.querySelector<HTMLInputElement>("input[type='text']");
        expect(patternInput).not.toBeNull();

        pointerDownOn(patternInput!);
        expect(menu.element.isConnected, "the menu closed on its own builder's first click").toBe(true);
        expect(panel!.hidden, "the builder closed along with the menu").toBe(false);

        // A genuine outside click must still close both -- proving the fix did not widen the
        // dismiss boundary back to something broad enough to swallow real outside clicks, which
        // is the exact bug class this whole overlay-dismissal effort exists to prevent.
        const elsewhere = document.createElement("div");
        document.body.append(elsewhere);
        pointerDownOn(elsewhere);
        expect(menu.element.isConnected, "a real outside click no longer closes the menu").toBe(false);
    });
});
