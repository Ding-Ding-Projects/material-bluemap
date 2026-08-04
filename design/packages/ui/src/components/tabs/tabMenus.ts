/**
 * The rows a tab or group context menu is made of, as data.
 *
 * Two rules push these out of the template and into a list. Every context menu
 * in this application carries its own search field that filters the menu locally
 * without changing what the items do, and every item that has a keyboard
 * shortcut displays it. Both are trivial over an array and miserable over
 * hand-written markup, where a filter means a `v-if` per row and a shortcut
 * column means remembering to add one.
 *
 * The shortcut on an item is the one that **actually works when that menu's
 * object has focus**. It is passed in by the component that also binds the key,
 * so the two cannot drift: an item showing a shortcut that a previous version
 * bound, or that only fires when some other surface has focus, teaches a person
 * to press a key that does nothing. An item with no shortcut carries null and
 * renders no placeholder, because padding the column is worse than leaving it
 * empty.
 */

import { includesCI } from "../config/regexEngine.js";

export interface TabMenuItem {
    readonly id: string;
    readonly label: string;
    /** An `@mdi/js` path. */
    readonly icon: string;
    /** The working shortcut in platform notation, or null when there is none. */
    readonly shortcut: string | null;
    /** True for the ones that destroy something, so the row can be coloured. */
    readonly danger: boolean;
}

/**
 * Filters a menu locally by its visible labels.
 *
 * Plain case-insensitive substring matching, the same `includesCI` every plain
 * search in this application uses, over the label alone. Not the id, not the
 * shortcut: a person filtering a menu is typing what they can read on it, and
 * matching a hidden id would produce a row that appears for no visible reason.
 *
 * An empty query returns everything rather than nothing, so a menu that has just
 * opened is a whole menu.
 */
export function filterMenuItems(
    items: readonly TabMenuItem[],
    query: string,
): readonly TabMenuItem[] {
    if (query.trim() === "") return items;
    return items.filter((item) => includesCI(item.label, query));
}
