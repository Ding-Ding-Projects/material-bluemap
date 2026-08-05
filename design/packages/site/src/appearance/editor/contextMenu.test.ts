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
});
