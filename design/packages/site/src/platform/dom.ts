/**
 * Small DOM helpers shared by every part of the site.
 *
 * Nothing here parses HTML from a string. Elements are built node by node and text is set
 * through `textContent`, so no path exists by which content becomes markup.
 */

import { ICONS, type IconName } from "./icons.js";

export interface ElementOptions {
    /** Space-separated class names. */
    class?: string;
    /** Text content. Set as a text node, never parsed as markup. */
    text?: string;
    /** Attributes. `false` removes the attribute; `true` sets it to the empty string. */
    attrs?: Record<string, string | number | boolean>;
    /** data-* values, keyed without the `data-` prefix. */
    data?: Record<string, string>;
    children?: (Node | null | undefined)[];
}

export function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    options: ElementOptions = {},
    ...children: (Node | null | undefined)[]
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (options.class !== undefined) node.className = options.class;
    if (options.text !== undefined) node.textContent = options.text;
    if (options.attrs !== undefined) {
        for (const [name, value] of Object.entries(options.attrs)) {
            if (value === false) continue;
            node.setAttribute(name, value === true ? "" : String(value));
        }
    }
    if (options.data !== undefined) {
        for (const [name, value] of Object.entries(options.data)) node.dataset[name] = value;
    }
    for (const child of [...(options.children ?? []), ...children]) {
        if (child !== null && child !== undefined) node.append(child);
    }
    return node;
}

/**
 * An icon glyph. Always aria-hidden: an icon never carries meaning alone, so the control
 * around it always has a real accessible name.
 */
export function icon(name: IconName, className = "md-icon"): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    svg.setAttribute("class", className);
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name]);
    svg.append(path);
    return svg;
}

export function clear(node: Element): void {
    while (node.firstChild !== null) node.firstChild.remove();
}

let idCounter = 0;

export function uniqueId(prefix: string): string {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
}

/** Elements that can take focus, in document order, skipping anything hidden or disabled. */
export function focusableWithin(root: ParentNode): HTMLElement[] {
    const selector = [
        "a[href]",
        "button:not([disabled])",
        "input:not([disabled])",
        "select:not([disabled])",
        "textarea:not([disabled])",
        '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    return [...root.querySelectorAll<HTMLElement>(selector)].filter(
        (node) => node.offsetParent !== null || node.getClientRects().length > 0,
    );
}

export interface AnchorPlacement {
    /** Preferred side. The overlay flips when the preferred side has no room. */
    side?: "below" | "above";
    /** Preferred inline edge to line up with. */
    align?: "start" | "end";
    gap?: number;
}

/**
 * Position a fixed overlay beside its anchor, kept inside the viewport.
 *
 * The overlay stays visually attached to the control that opened it: it flips to the other
 * side rather than sliding away when space runs out, and its height is bounded by the space
 * actually available so its content scrolls inside the card instead of being cut off.
 */
export function positionOverlay(overlay: HTMLElement, anchor: Element, placement: AnchorPlacement = {}): void {
    const gap = placement.gap ?? 8;
    const margin = 8;
    const rect = anchor.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    const spaceBelow = viewportHeight - rect.bottom - gap - margin;
    const spaceAbove = rect.top - gap - margin;
    const preferBelow = (placement.side ?? "below") === "below";
    const below = preferBelow ? spaceBelow >= 160 || spaceBelow >= spaceAbove : spaceAbove < 160 && spaceBelow > spaceAbove;

    const available = Math.max(140, below ? spaceBelow : spaceAbove);
    overlay.style.setProperty("--md-comp-overlay-max-height", `${Math.floor(available)}px`);

    // Measure after the height bound is applied so the flip decision and the final size agree.
    const size = overlay.getBoundingClientRect();
    const top = below ? rect.bottom + gap : Math.max(margin, rect.top - gap - size.height);
    overlay.style.top = `${Math.round(Math.min(top, viewportHeight - margin - Math.min(size.height, available)))}px`;

    const alignEnd = placement.align === "end";
    const rawLeft = alignEnd ? rect.right - size.width : rect.left;
    const left = Math.min(Math.max(margin, rawLeft), Math.max(margin, viewportWidth - margin - size.width));
    overlay.style.left = `${Math.round(left)}px`;
}

/**
 * Format a keyboard shortcut for display, in the notation the visitor's platform uses.
 * Menus read their shortcut text from here and from nowhere else, so a displayed key and a
 * bound key cannot drift apart.
 */
export function formatShortcut(parts: readonly string[]): string {
    const mac = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
    const symbols: Record<string, string> = mac
        ? { Ctrl: "⌘", Alt: "⌥", Shift: "⇧", Enter: "↩" }
        : {};
    return parts.map((part) => symbols[part] ?? part).join(mac ? "" : "+");
}
