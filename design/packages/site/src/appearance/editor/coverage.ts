/**
 * Return every user-visible HTMLElement in a rendered surface.
 *
 * Appearance editing is deliberately not a hand-picked list of cards and buttons. A
 * landing page can render a heading, a paragraph, a disclosure summary, a table cell, or
 * a link that still has a colour, typeface, spacing, and focus state. Keeping the traversal
 * here makes the coverage rule testable and gives the shell one definition of "every".
 * Non-rendered document plumbing is excluded because it has no appearance a visitor can
 * edit.
 */
export function appearanceElements(root: HTMLElement): readonly HTMLElement[] {
    return [root, ...root.querySelectorAll<HTMLElement>("*")].filter(
        (element) => element.tagName !== "SCRIPT" && element.tagName !== "STYLE" && element.tagName !== "TEMPLATE",
    );
}
