// @vitest-environment jsdom

/**
 * Regression guard for the typography editor's font-family search.
 *
 * `fontRow` filters a potentially long list of installed and bundled font families, which
 * is exactly the shape of surface the regex-builder contract exists for -- and, until this
 * file's own commit, it ran on a bare substring filter with no builder in reach at all.
 * The desktop app's own typography editor carries the shared search field for its font
 * picker (see `packages/ui/src/components/config/regexPolicy.test.ts`'s
 * `MUST_CARRY_A_SEARCH` list); this pins the site's port of the same control to the same
 * standard so a future rewrite of this popover cannot quietly drop it again.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { fontRow } from "./controls.js";
import type { FontFamilyEntry } from "../type/fonts.js";

const FAMILIES: readonly FontFamilyEntry[] = [
    { id: "roboto", name: "Roboto", stack: "Roboto, sans-serif", source: "system", monospace: false },
    { id: "noto-serif", name: "Noto Serif", stack: "'Noto Serif', serif", source: "system", monospace: false },
    {
        id: "jetbrains-mono",
        name: "JetBrains Mono",
        stack: "'JetBrains Mono', monospace",
        source: "system",
        monospace: true,
    },
];

function buildFontRow(): HTMLElement {
    let value = "";
    const row = fontRow({
        labelKey: "type.family",
        onReset: () => (value = ""),
        isDefault: () => value === "",
        read: () => value,
        write: (next) => (value = next),
        families: () => FAMILIES,
        requestInstalled: () => Promise.resolve("type.fontsUnavailable"),
        installedNoteKey: () => "type.fontsBundledOnly",
    });
    document.body.append(row.element);
    return row.element;
}

function openPopover(row: HTMLElement): void {
    row.querySelector<HTMLButtonElement>(".mb-font-trigger")!.click();
}

describe("the typography editor's font-family search", () => {
    beforeEach(() => {
        document.body.replaceChildren();
    });

    it("carries a real input plus its own anchored regex builder button, not a bare filter", () => {
        const row = buildFontRow();
        openPopover(row);
        const input = document.querySelector<HTMLInputElement>("input[type='search']");
        expect(input, "the font popover never opened a search field").not.toBeNull();
        const builderButton = document.querySelector<HTMLButtonElement>(".mbm-search__builder");
        expect(
            builderButton,
            "the font family search has no adjacent regex builder button",
        ).not.toBeNull();
    });

    it("still filters families by plain substring for a visitor who never opens the builder", () => {
        const row = buildFontRow();
        openPopover(row);
        const input = document.querySelector<HTMLInputElement>("input[type='search']")!;
        const namesOf = (): string[] =>
            [...document.querySelectorAll(".mb-font-name")].map((el) => el.textContent ?? "");

        expect(namesOf()).toEqual(["Roboto", "Noto Serif", "JetBrains Mono"]);

        input.value = "noto";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(namesOf()).toEqual(["Noto Serif"]);
    });

    it("filters by real regex once the builder switches the field to regex mode", () => {
        const row = buildFontRow();
        openPopover(row);
        const input = document.querySelector<HTMLInputElement>("input[type='search']")!;
        const namesOf = (): string[] =>
            [...document.querySelectorAll(".mb-font-name")].map((el) => el.textContent ?? "");

        // Not a literal substring of any family name, so plain mode finds nothing.
        input.value = "^(Roboto|Mono)$";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        expect(namesOf()).toEqual([]);

        document.querySelector<HTMLButtonElement>(".mbm-search__builder")!.click();
        const patternInput = document.querySelector<HTMLInputElement>("input.mbm-input--code");
        const regexToggle = document.querySelector<HTMLInputElement>("input.mbm-switch__input");
        expect(patternInput, "the regex builder popover never opened").not.toBeNull();
        expect(regexToggle).not.toBeNull();

        regexToggle!.checked = true;
        regexToggle!.dispatchEvent(new Event("change", { bubbles: true }));
        patternInput!.value = "^(Roboto|.*Mono)$";
        patternInput!.dispatchEvent(new Event("input", { bubbles: true }));
        expect(namesOf()).toEqual(["Roboto", "JetBrains Mono"]);
    });
});
