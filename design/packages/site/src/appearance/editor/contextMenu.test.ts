// @vitest-environment jsdom

/**
 * Regression guard for the "Edit appearance..." context menu's own search field.
 *
 * The menu's item list is short, but the contract makes no exception for that: every
 * search bar in this application offers the anchored regex builder, full stop. This menu
 * shipped with a plain substring filter and no builder at all until this file's own
 * commit, which is exactly the kind of gap that looks harmless one field at a time and
 * adds up to "not really every search bar" in practice. This test exists so a future
 * simplification cannot quietly drop the builder again without turning the suite red.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { AppearanceController } from "../controller.js";
import { AppearanceStore } from "../store.js";
import { Preferences } from "../../platform/Preferences.js";
import {
    installRovingAppearanceFocus,
    openElementMenu,
    registerAppearanceTarget,
} from "./contextMenu.js";

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

describe("the appearance editor's context menu search", () => {
    beforeEach(() => {
        cells.clear();
        document.body.replaceChildren();
    });

    it("carries a real input plus its own anchored regex builder button, not a bare field", () => {
        const panel = openMenu();
        const input = panel.querySelector<HTMLInputElement>("input[type='search']");
        expect(input).not.toBeNull();
        const builderButton = panel.querySelector<HTMLButtonElement>(".mbm-search__builder");
        expect(
            builderButton,
            "the menu's search field has no adjacent regex builder button",
        ).not.toBeNull();
    });

    it("still filters items by plain substring, unchanged for a visitor who never opens the builder", () => {
        const panel = openMenu();
        const input = panel.querySelector<HTMLInputElement>("input[type='search']")!;
        const labelsOf = (): string[] =>
            [...panel.querySelectorAll(".md-menu__item-label")].map((el) => el.textContent ?? "");

        expect(labelsOf().length).toBeGreaterThan(0);

        input.value = "reset";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(labelsOf().some((label) => /reset/i.test(label))).toBe(true);
        expect(labelsOf().every((label) => /reset/i.test(label))).toBe(true);
    });

    it("filters by real regex once the builder switches the field to regex mode", () => {
        const panel = openMenu();
        const labelsOf = (): string[] =>
            [...panel.querySelectorAll(".md-menu__item-label")].map((el) => el.textContent ?? "");
        expect(labelsOf().length).toBe(2); // "Edit appearance..." and "Reset appearance"

        const input = panel.querySelector<HTMLInputElement>("input[type='search']")!;

        // Typed as plain text first: "Edit|Reset" is not a literal substring of either
        // label, so the ordinary (non-regex) path correctly finds nothing.
        input.value = "^(Edit|Reset)";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(labelsOf().length).toBe(0);

        const builderButton = panel.querySelector<HTMLButtonElement>(".mbm-search__builder")!;
        builderButton.click();

        // The builder opens its own anchored popover; find the pattern input and the
        // regex-mode switch inside it rather than assuming a fixed DOM position.
        const patternInput = document.querySelector<HTMLInputElement>("input.mbm-input--code");
        const regexToggle = document.querySelector<HTMLInputElement>("input.mbm-switch__input");
        expect(patternInput, "the regex builder popover never opened").not.toBeNull();
        expect(regexToggle).not.toBeNull();

        // Same characters, switched to regex mode: alternation now genuinely matches both
        // items, which only real regex evaluation (not a substring filter) can produce.
        regexToggle!.checked = true;
        regexToggle!.dispatchEvent(new Event("change", { bubbles: true }));
        patternInput!.value = "^(Edit|Reset)";
        patternInput!.dispatchEvent(new Event("input", { bubbles: true }));
        expect(labelsOf().length).toBe(2);

        // Switching back to plain mode restores the independently-remembered plain query,
        // and with it the original zero-match result -- proving the mode genuinely drives
        // the matcher both ways rather than only turning regex on.
        regexToggle!.checked = false;
        regexToggle!.dispatchEvent(new Event("change", { bubbles: true }));
        expect(labelsOf().length).toBe(0);
    });

    /**
     * Regression guard for the menu closing itself the instant its own regex builder is
     * interacted with.
     *
     * `openElementMenu`'s `AnchoredPanel` uses the default `dismissBoundary` (the zero-size
     * pointer-anchor span), and the search field's builder opens through its own, independent
     * `AnchoredPanel` whose popover is appended straight to `document.body` -- never nested
     * inside the menu's own `panel.element`. A pointerdown inside that popover therefore lands
     * outside both "the menu's own element" and "the pointer-anchor span", so without the
     * dismissal primitive recognising that the popover was opened from a control living inside
     * the menu's own content, the menu's document-level pointerdown listener (registered first,
     * since the menu opens before its builder does) would close the whole menu and leave the
     * builder popover open and orphaned.
     */
    it("stays open when its own regex builder popover is clicked into, instead of closing under it", () => {
        const panel = openMenu();
        const builderButton = panel.querySelector<HTMLButtonElement>(".mbm-search__builder")!;
        builderButton.click();

        const patternInput = document.querySelector<HTMLInputElement>("input.mbm-input--code");
        expect(patternInput, "the regex builder popover never opened").not.toBeNull();
        expect(panel.hidden, "the menu closed itself merely from opening the builder").toBe(false);

        // The reported failure: a pointerdown landing inside the builder's own popover, not
        // inside the menu's element and not inside its pointer-anchor span.
        patternInput!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        patternInput!.value = "abc";
        patternInput!.dispatchEvent(new Event("input", { bubbles: true }));

        expect(
            panel.hidden,
            "the menu closed itself when its own builder popover was interacted with",
        ).toBe(false);
        expect(
            document.querySelector("input.mbm-input--code"),
            "the builder popover was left open and orphaned by the menu closing under it",
        ).not.toBeNull();
    });
});

/**
 * Regression guard for keyboard reachability and focus return on non-interactive appearance
 * targets (headings, paragraphs, cards, the site footer) -- everything `decoratePage`'s
 * traversal registers that is not already a link, button, or form control. Before this file's
 * own commit those elements had no `tabindex`, so `element.focus()` silently did nothing:
 * the `ContextMenu`/Shift+F10 keyboard path could never reach them, and closing their menu or
 * appearance editor dropped focus at the top of the document instead of returning it.
 */
describe("registerAppearanceTarget keeps every registered element focusable", () => {
    beforeEach(() => {
        cells.clear();
        document.body.replaceChildren();
    });

    function controller(): AppearanceController {
        return new AppearanceController(new Preferences(null), new AppearanceStore());
    }

    it("adds tabindex=-1 to a plain, non-interactive element so it can take focus programmatically", () => {
        const heading = document.createElement("h2");
        heading.textContent = "A registered heading";
        document.body.append(heading);
        expect(heading.hasAttribute("tabindex")).toBe(false);

        registerAppearanceTarget(heading, { kind: "card" }, controller());

        expect(heading.getAttribute("tabindex")).toBe("-1");
        heading.focus();
        expect(document.activeElement).toBe(heading);
    });

    it("leaves a natively focusable element's tab order untouched", () => {
        const button = document.createElement("button");
        button.type = "button";
        document.body.append(button);

        registerAppearanceTarget(button, { kind: "tab" }, controller());

        // Real buttons are focusable via their tag alone; forcing tabindex="-1" onto one
        // would silently remove it from the ordinary Tab order, which is a worse defect
        // than the missing-focus-target bug this function exists to fix.
        expect(button.hasAttribute("tabindex")).toBe(false);
    });

    it("leaves an element's own explicit tabindex alone", () => {
        const div = document.createElement("div");
        div.setAttribute("tabindex", "0");
        document.body.append(div);

        registerAppearanceTarget(div, { kind: "card" }, controller());

        expect(div.getAttribute("tabindex")).toBe("0");
    });
});

/**
 * Regression guard for the actual keyboard-reachability gap left behind by `tabindex="-1"`
 * alone: it fixes focus RETURN (see the describe block above) but is deliberately excluded
 * from the Tab order by spec, so nothing ever tabs a keyboard-only visitor onto a plain
 * heading, paragraph, table cell or card in the first place -- the element's own
 * `ContextMenu`/Shift+F10 handler only runs when it already has focus, and there was no route
 * to get it there. `installRovingAppearanceFocus` is the fix: it takes the group of elements
 * a page just registered and gives exactly one of them a real Tab stop, with arrow keys,
 * Home and End roving focus across the rest -- the same idiom the tab strip already uses for
 * its own keyboard navigation.
 */
describe("installRovingAppearanceFocus gives a registered group a real keyboard entry point", () => {
    beforeEach(() => {
        cells.clear();
        document.body.replaceChildren();
    });

    function controller(): AppearanceController {
        return new AppearanceController(new Preferences(null), new AppearanceStore());
    }

    function registeredHeading(text: string): HTMLHeadingElement {
        const heading = document.createElement("h2");
        heading.textContent = text;
        document.body.append(heading);
        registerAppearanceTarget(heading, { kind: "card" }, controller());
        return heading;
    }

    it("promotes exactly one element of the group into the real Tab order", () => {
        const first = registeredHeading("First");
        const second = registeredHeading("Second");
        const third = registeredHeading("Third");

        // Before the fix is wired in, every registered element is tabindex=-1 and none of
        // them is reachable by Tab at all -- this is the defect itself, reproduced.
        expect(first.getAttribute("tabindex")).toBe("-1");
        expect(second.getAttribute("tabindex")).toBe("-1");
        expect(third.getAttribute("tabindex")).toBe("-1");

        installRovingAppearanceFocus([first, second, third]);

        expect(
            first.getAttribute("tabindex"),
            "no element in the group became a real Tab stop, so a keyboard-only visitor still has no way in",
        ).toBe("0");
        expect(second.getAttribute("tabindex")).toBe("-1");
        expect(third.getAttribute("tabindex")).toBe("-1");
    });

    it("moves the Tab stop and real focus with ArrowDown, reaching an element Tab alone never could", () => {
        const first = registeredHeading("First");
        const second = registeredHeading("Second");
        installRovingAppearanceFocus([first, second]);

        first.focus();
        expect(document.activeElement).toBe(first);

        first.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true }),
        );

        expect(
            document.activeElement,
            "ArrowDown did not move real keyboard focus onto the next registered element",
        ).toBe(second);
        expect(
            second.getAttribute("tabindex"),
            "the newly-focused element did not become the group's real Tab stop",
        ).toBe("0");
        expect(
            first.getAttribute("tabindex"),
            "the previously-focused element kept a Tab stop, which would put two elements in the Tab order at once",
        ).toBe("-1");
    });

    it("wraps ArrowUp from the first element back to the last", () => {
        const first = registeredHeading("First");
        const second = registeredHeading("Second");
        const third = registeredHeading("Third");
        installRovingAppearanceFocus([first, second, third]);

        first.focus();
        first.dispatchEvent(
            new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }),
        );

        expect(document.activeElement).toBe(third);
        expect(third.getAttribute("tabindex")).toBe("0");
    });

    it("jumps to the last element on End and back to the first on Home", () => {
        const first = registeredHeading("First");
        const second = registeredHeading("Second");
        const third = registeredHeading("Third");
        installRovingAppearanceFocus([first, second, third]);

        first.focus();
        first.dispatchEvent(
            new KeyboardEvent("keydown", { key: "End", bubbles: true, cancelable: true }),
        );
        expect(document.activeElement).toBe(third);

        third.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Home", bubbles: true, cancelable: true }),
        );
        expect(document.activeElement).toBe(first);
    });

    it("leaves a natively focusable element out of the roving group entirely", () => {
        const button = document.createElement("button");
        button.type = "button";
        document.body.append(button);
        registerAppearanceTarget(button, { kind: "tab" }, controller());
        const heading = registeredHeading("Only real roving member");

        installRovingAppearanceFocus([button, heading]);

        // The button never had a tabindex attribute at all (see the describe block above);
        // installRovingAppearanceFocus must not add one, since the button already has its
        // own native Tab stop and does not need to borrow the group's.
        expect(button.hasAttribute("tabindex")).toBe(false);
        expect(heading.getAttribute("tabindex")).toBe("0");
    });

    it("does nothing when the group is empty", () => {
        expect(() => installRovingAppearanceFocus([])).not.toThrow();
    });
});
