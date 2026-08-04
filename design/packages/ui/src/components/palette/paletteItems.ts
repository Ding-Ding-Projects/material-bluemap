/**
 * What a command palette row *is*, and how a query finds one.
 *
 * The palette has three kinds of row and they are not three styles of the same thing.
 *
 *  - A **command** does something the moment it is chosen: reset the camera, and nothing
 *    else happens. It is the only kind that needs no follow-up at all.
 *  - A **setting** carries the real control. Not a link to the screen the control lives
 *    on, not a label describing it: the switch, the number box or the select itself, wired
 *    to the same write path the settings surface uses, so flipping it in the palette and
 *    flipping it on that surface are the same act with the same persistence. Anything less
 *    makes the palette a table of contents, and a table of contents is what the app's menus
 *    already are.
 *  - A **destination** opens a surface. Its `where` is a plain sentence naming what will
 *    appear, because a row that moves somebody somewhere without saying where is worse than
 *    a menu item: at least a menu item sits under a heading that tells you.
 *
 * The split is what keeps the rule "never ship a decorative control" checkable rather than
 * aspirational. A row is a `setting` only when it holds a control that writes; anything that
 * merely leads to a control is a `destination` and is worded as one. A builder that cannot
 * produce a working control for something therefore cannot accidentally dress it up as one
 * - it has to demote the row to a destination and say where it goes, in the type.
 *
 * Searching is done over what the row actually renders - its title, its explanation, its
 * current value, and the words somebody would plausibly type looking for it - rather than
 * over a hand-kept keyword table. `settingsSections.ts` reached the same conclusion for the
 * same reason: a second list is always the one nobody updates, so a person searches for a
 * word that is on screen in front of them and is told there are no matches.
 */

import type { SettingMatcher } from "../config/regexEngine.js";

/**
 * `useI18n().t`, narrowed to the two shapes this package is allowed to call it with.
 *
 * Both overloads are here on purpose. The two-argument form is the common case, and the
 * three-argument form is the *only* correct way to interpolate: vue-i18n compiles the
 * English fallback as a message format of its own, so a `{placeholder}` left in a
 * two-argument fallback is consumed before any chained `replace` can reach it and the value
 * renders as nothing. `i18nFallback.test.ts` scans the whole package for that mistake, and
 * declaring the type this way means a builder in this folder cannot even express it.
 */
export interface Translate {
    (key: string, fallback: string): string;
    (key: string, named: Record<string, unknown>, fallback: string): string;
}

/** One option of a `choice` control: a stable id and the label the user reads. */
export interface PaletteChoice {
    readonly id: string;
    readonly label: string;
}

/**
 * The live control a `setting` row renders.
 *
 * Three kinds, because three is what the settings this palette reaches actually need: a
 * boolean, a bounded number, and a pick from a list. A fourth for free text is deliberately
 * absent rather than defined-and-unused - every free-text setting in this app (the map
 * storage folder, a world path) is validated against the filesystem and offers a browse
 * button, which is a control the palette cannot honestly reproduce in a single row, so
 * those are destinations instead.
 *
 * `set` is the whole contract. It performs the write *and* whatever persistence that write
 * needs, so a caller can never half-apply a change by forgetting the save. Where the
 * settings surface splits "apply while dragging" from "save when let go", this collapses to
 * one call on commit, because a text box commits once on blur or Enter rather than sixty
 * times across a drag.
 */
export type PaletteControl =
    | {
          readonly kind: "toggle";
          readonly value: boolean;
          readonly set: (value: boolean) => void;
      }
    | {
          readonly kind: "number";
          readonly value: number;
          readonly min: number;
          readonly max: number;
          readonly step: number;
          /** Rendered beside the box, e.g. "blocks". Empty when the number needs no unit. */
          readonly unit: string;
          readonly set: (value: number) => void;
      }
    | {
          readonly kind: "choice";
          /** Null when the app cannot currently say which option is in force. */
          readonly value: string | null;
          readonly options: readonly PaletteChoice[];
          readonly set: (id: string) => void;
      };

interface PaletteItemBase {
    /** Stable across rebuilds, so the active row survives a value changing under it. */
    readonly id: string;
    /** The heading this row is listed under, already translated. */
    readonly group: string;
    readonly title: string;
    /** One sentence saying what it is. Shown under the title and searched. */
    readonly description: string;
    /**
     * Extra words this row should be findable by: the tab it lives on, an option label
     * that is not currently selected, a term somebody would type instead of the title.
     */
    readonly keywords: readonly string[];
}

export interface PaletteCommand extends PaletteItemBase {
    readonly kind: "command";
    readonly run: () => void;
}

export interface PaletteSetting extends PaletteItemBase {
    readonly kind: "setting";
    readonly control: PaletteControl;
}

export interface PaletteDestination extends PaletteItemBase {
    readonly kind: "destination";
    /** Plain sentence naming the surface this opens. Never blank. */
    readonly where: string;
    readonly go: () => void;
}

export type PaletteItem = PaletteCommand | PaletteSetting | PaletteDestination;

/**
 * The current value as one line of searchable text.
 *
 * A `choice` contributes the label of the option in force *and* the labels of the ones that
 * are not, because "how do I make it dark" is a search for an option that is by definition
 * not selected yet. A `toggle` contributes nothing: "true" and "false" are not words anybody
 * types, and adding them would make every switch match a search for "false".
 */
export function controlText(control: PaletteControl): string {
    switch (control.kind) {
        case "toggle":
            return "";
        case "number":
            return control.unit.length > 0 ? `${control.value} ${control.unit}` : String(control.value);
        case "choice":
            return control.options.map((option) => option.label).join(" ");
    }
}

/** Everything one row can be found by, as a single string. */
export function itemHaystack(item: PaletteItem): string {
    const parts = [item.title, item.group, item.description, ...item.keywords];
    if (item.kind === "setting") parts.push(controlText(item.control));
    if (item.kind === "destination") parts.push(item.where);
    return parts.filter((part) => part.trim().length > 0).join("\n");
}

/**
 * The rows a query leaves showing, in the order they were built.
 *
 * An inactive matcher matches everything, which is what an empty search box means. An
 * invalid pattern matches nothing - `createSettingMatcher` has already decided that - rather
 * than quietly falling back to the last pattern that compiled, which would leave results on
 * screen for a search nobody can see any more.
 */
export function filterItems(
    items: readonly PaletteItem[],
    matcher: SettingMatcher,
): PaletteItem[] {
    if (!matcher.active) return [...items];
    if (matcher.error !== null) return [];
    return items.filter((item) => matcher.test(itemHaystack(item)));
}

/**
 * Real text for the regex builder's preview, one row per line.
 *
 * The builder is only worth opening when what it previews is what the search will scan, so
 * this is the same text {@link filterItems} tests, with newlines flattened to spaces so one
 * row stays one candidate line.
 */
export function paletteSample(items: readonly PaletteItem[]): string {
    return items
        .map((item) => itemHaystack(item).replace(/\s+/g, " ").trim())
        .join("\n");
}

export interface PaletteGroup {
    readonly label: string;
    readonly items: readonly PaletteItem[];
}

/**
 * Rows bucketed under their headings, first-seen order preserved.
 *
 * Order comes from the catalogue rather than from an alphabetical sort: the catalogue puts
 * the shell's own destinations first and the deepest viewer settings last, which is roughly
 * the order of how likely somebody is to be looking for them. Sorting would replace that
 * judgement with the accident of what the groups are called in the current language.
 */
export function groupItems(items: readonly PaletteItem[]): PaletteGroup[] {
    const order: string[] = [];
    const buckets = new Map<string, PaletteItem[]>();

    for (const item of items) {
        const bucket = buckets.get(item.group);
        if (bucket === undefined) {
            order.push(item.group);
            buckets.set(item.group, [item]);
        } else {
            bucket.push(item);
        }
    }

    return order.map((label) => ({ label, items: buckets.get(label) ?? [] }));
}

/** How many of each kind a list holds, for an honest "N commands, N settings, N places". */
export function countByKind(items: readonly PaletteItem[]): {
    commands: number;
    settings: number;
    destinations: number;
} {
    let commands = 0;
    let settings = 0;
    let destinations = 0;
    for (const item of items) {
        if (item.kind === "command") commands++;
        else if (item.kind === "setting") settings++;
        else destinations++;
    }
    return { commands, settings, destinations };
}
