/**
 * Issue #6's contract, kept true by a test rather than by remembering.
 *
 * The rule is short: **every search bar in this application offers the regex builder**,
 * anchored beside the field it belongs to. It is not a rule about most search bars, and
 * it is not satisfied by a builder living somewhere else on the surface.
 *
 * It is also the rule most likely to decay, because nothing about writing a plain
 * `v-text-field` labelled "Search" feels like a violation while you are doing it. A
 * surface ships, the field looks right, and the contract quietly covers one fewer place
 * than it did last week. That is exactly what happened before this test existed: three
 * builders were wired to ten surfaces and four collections had grown their own unsearched
 * lists, while the issue still read "not implemented".
 *
 * So this walks every component in the package and asks two questions:
 *
 *  1. Does this file contain a **search-shaped input** - one whose label, placeholder,
 *     name, model or class says search, filter, find or query?
 *  2. If so, does it get its search from one of the three shared fields, each of which
 *     carries an anchored builder?
 *
 * A file that answers yes and no is a failure. A file that legitimately holds a
 * search-shaped input that is *not* a search - a value editor whose field happens to be
 * called `filter`, say - has to be named in {@link NOT_A_SEARCH_BAR} with the reason, so
 * the exemption is a sentence somebody wrote rather than an absence nobody noticed.
 *
 * What this deliberately does NOT do is check that the builder works. That is what the
 * per-surface mount tests are for, and duplicating them here would make this file slow
 * and fragile without making it stricter.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const UI_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * The three shared search fields. Each one renders its own anchored regex builder, so
 * importing any of them is what "this search bar offers the builder" means in practice.
 *
 * Three rather than one because they belong to three different surface families with
 * different chrome, not because the behaviour differs; they are all plain-text by default
 * with regex as the explicit opt-in.
 */
const SHARED_SEARCH_FIELDS = [
    "ConfigSearchField",
    "MenuSearchField",
    "MenuSearchBar",
    "MarkerSearchField",
];

/** The builders themselves, and the fields that wrap them. Nothing to check here. */
const THE_MACHINERY = new Set([
    "components/config/ConfigSearchField.vue",
    "components/config/ConfigRegexBuilder.vue",
    "components/menu/MenuSearchField.vue",
    "components/menu/MenuSearchBar.vue",
    "components/menu/MenuRegexBuilder.vue",
    "components/markers/MarkerSearchField.vue",
    "components/markers/RegexBuilder.vue",
]);

/**
 * Files holding a search-shaped input that is not a search bar, each with the reason.
 *
 * Keep this short and keep every entry true. An exemption written to make the test pass
 * is worse than no test, because it looks like somebody thought about it.
 */
const NOT_A_SEARCH_BAR: Record<string, string> = {};

/** Every `.vue` under `packages/ui/src`, as paths relative to it. */
function componentFiles(directory: string, found: string[] = []): string[] {
    for (const entry of readdirSync(directory)) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) {
            componentFiles(path, found);
            continue;
        }
        if (entry.endsWith(".vue")) found.push(relative(UI_SRC, path).split("\\").join("/"));
    }
    return found;
}

/**
 * Whether a file holds an input that is meant to search something.
 *
 * Deliberately generous about what counts: it is better to make somebody write one
 * exemption sentence than to let a real search bar through because its label was
 * "Find a map" rather than "Search". The words are matched near an input, not anywhere in
 * the file, so a doc comment explaining a search does not implicate the component.
 */
function hasSearchShapedInput(source: string): boolean {
    const inputs = source.match(/<(?:v-text-field|v-autocomplete|v-combobox|input)\b[^>]*>/gi);
    if (inputs === null) return false;
    return inputs.some((tag) => /search|filter|find|query/i.test(tag));
}

function usesSharedSearchField(source: string): boolean {
    return SHARED_SEARCH_FIELDS.some((field) =>
        new RegExp(`(?:import\\s+${field}\\b|<${field}\\b)`).test(source),
    );
}

describe("every search bar offers the regex builder", () => {
    const files = componentFiles(UI_SRC).filter((file) => !THE_MACHINERY.has(file));

    it("finds the components it is supposed to be watching", () => {
        // A glob that silently matched nothing would pass every assertion below.
        expect(files.length).toBeGreaterThan(40);
    });

    it("gives every search-shaped input a shared field, or a written exemption", () => {
        const undeclared: string[] = [];

        for (const file of files) {
            const source = readFileSync(join(UI_SRC, file), "utf8");
            if (!hasSearchShapedInput(source)) continue;
            if (usesSharedSearchField(source)) continue;
            if (file in NOT_A_SEARCH_BAR) continue;
            undeclared.push(file);
        }

        expect(
            undeclared,
            "Issue #6: every search bar carries the anchored regex builder. Use " +
                "ConfigSearchField (or the menu/marker equivalent) rather than a bare text " +
                "field, so the builder arrives with it. If this input is not a search bar, " +
                "name it in NOT_A_SEARCH_BAR with the reason it is not one.",
        ).toEqual([]);
    });

    it("keeps every exemption pointing at a file that still exists and still looks like a search", () => {
        for (const [file, reason] of Object.entries(NOT_A_SEARCH_BAR)) {
            const source = readFileSync(join(UI_SRC, file), "utf8");
            // A stale exemption is how the guard starts covering less than it says.
            expect(hasSearchShapedInput(source), `${file} no longer holds a search-shaped input`).toBe(true);
            expect(reason.length, `${file} needs a real reason, not a placeholder`).toBeGreaterThan(40);
        }
    });

    it("catches a plain search field, and does not accuse an ordinary one", () => {
        // The detector is the whole test, so it is exercised rather than trusted.
        expect(hasSearchShapedInput('<v-text-field label="Search maps" />')).toBe(true);
        expect(hasSearchShapedInput('<v-text-field v-model="query" />')).toBe(true);
        expect(hasSearchShapedInput('<input type="search" />')).toBe(true);
        expect(hasSearchShapedInput('<v-text-field label="Map name" />')).toBe(false);
        expect(hasSearchShapedInput("<!-- searches the maps -->\n<v-text-field label=\"Name\" />")).toBe(
            false,
        );
        expect(usesSharedSearchField('<ConfigSearchField v-model="query" />')).toBe(true);
        expect(usesSharedSearchField('<v-text-field label="Search" />')).toBe(false);
    });
});
