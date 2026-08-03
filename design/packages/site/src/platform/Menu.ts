/**
 * Anchored command menus, built on Overlay.
 *
 * Items render their own label through a callback rather than taking a string, so a caller
 * can bind the label to the translation catalogue and have it follow the language mode and
 * funny levels while the menu is open.
 *
 * Each item shows its keyboard shortcut, right-aligned, taken from the shortcut registry that
 * also binds the key. Items with no shortcut show nothing; a placeholder in that column would
 * be worse than an empty space.
 */

import { Overlay, type OverlayOptions } from "./Overlay.js";
import { el } from "./dom.js";

export interface MenuCommand {
    readonly kind?: "command";
    /** Fill the passed element with the item's label. */
    readonly render: (label: HTMLElement) => void;
    /** Formatted shortcut text, or null when the command has none. */
    readonly shortcut?: string | null;
    readonly disabled?: boolean;
    /** A colour swatch shown before the label, as a CSS colour value. */
    readonly swatch?: string;
    /** Renders a check mark and sets aria-checked, for a menu item that toggles. */
    readonly checked?: boolean;
    readonly onSelect: () => void;
}

export interface MenuSeparator {
    readonly kind: "separator";
}

export interface MenuHeading {
    readonly kind: "heading";
    readonly render: (label: HTMLElement) => void;
}

export type MenuEntry = MenuCommand | MenuSeparator | MenuHeading;

export interface MenuOptions extends Omit<OverlayOptions, "role"> {
    readonly entries: readonly MenuEntry[];
    /** Content shown above the command list, such as a filter field. */
    readonly header?: HTMLElement;
}

export class Menu {
    private readonly overlay: Overlay;
    private readonly list: HTMLElement;
    private readonly initialFocus: HTMLElement | undefined;

    constructor(anchor: HTMLElement, options: MenuOptions) {
        const { entries, header, ...overlayOptions } = options;
        this.initialFocus = options.initialFocus;
        this.overlay = new Overlay(anchor, { ...overlayOptions, role: "menu" });
        this.list = el("ul", { class: "md-menu", attrs: { role: "menu" } });

        if (header !== undefined) this.overlay.element.append(header);
        this.overlay.element.append(this.list);
        this.setEntries(entries);

        this.list.addEventListener("keydown", (event) => this.onKeyDown(event));
    }

    get element(): HTMLElement {
        return this.overlay.element;
    }

    setEntries(entries: readonly MenuEntry[]): void {
        this.list.replaceChildren();
        for (const entry of entries) {
            if (entry.kind === "separator") {
                this.list.append(el("li", { class: "md-menu__separator", attrs: { role: "separator" } }));
                continue;
            }
            if (entry.kind === "heading") {
                const heading = el("li", { class: "md-menu__section-label", attrs: { role: "presentation" } });
                entry.render(heading);
                this.list.append(heading);
                continue;
            }

            const item = el("li", { attrs: { role: "none" } });
            const button = el("button", {
                class: "md-menu__item",
                attrs: {
                    type: "button",
                    role: entry.checked === undefined ? "menuitem" : "menuitemcheckbox",
                    tabindex: "-1",
                    ...(entry.checked === undefined ? {} : { "aria-checked": entry.checked ? "true" : "false" }),
                    ...(entry.disabled === true ? { disabled: true } : {}),
                },
            });

            if (entry.swatch !== undefined) {
                button.append(el("span", { class: "md-menu__swatch", attrs: { style: `background:${entry.swatch}` } }));
            }

            const label = el("span", { class: "md-menu__item-label" });
            entry.render(label);
            button.append(label);

            if (entry.shortcut !== undefined && entry.shortcut !== null) {
                button.append(el("kbd", { class: "md-menu__shortcut", text: entry.shortcut }));
            }

            button.addEventListener("click", () => {
                this.close();
                entry.onSelect();
            });
            item.append(button);
            this.list.append(item);
        }
    }

    show(): void {
        this.overlay.show();
        // Overlay already focused whatever the caller asked for. Only fall back to the first
        // command when no initial focus was named, so a menu with a filter field opens with
        // the caret in the field rather than on the first result.
        if (this.initialFocus === undefined) this.items()[0]?.focus();
    }

    close(): void {
        this.overlay.close();
    }

    reflow(): void {
        this.overlay.reflow();
    }

    private items(): HTMLButtonElement[] {
        return [...this.list.querySelectorAll<HTMLButtonElement>("button.md-menu__item:not(:disabled)")];
    }

    private onKeyDown(event: KeyboardEvent): void {
        const items = this.items();
        if (items.length === 0) return;
        const current = items.findIndex((item) => item === document.activeElement);
        let next = -1;
        if (event.key === "ArrowDown") next = (current + 1) % items.length;
        else if (event.key === "ArrowUp") next = (current - 1 + items.length) % items.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = items.length - 1;
        else return;
        event.preventDefault();
        items[next]?.focus();
    }
}

/**
 * Open a menu at a pointer position rather than beside a control, for a context menu. The
 * anchor is still the element the menu belongs to, so focus returns there on close.
 */
export function openContextMenu(anchor: HTMLElement, x: number, y: number, options: MenuOptions): Menu {
    const marker = el("span", {
        class: "md-context-anchor",
        attrs: { style: `position:fixed;left:${x}px;top:${y}px;width:1px;height:1px` },
    });
    document.body.append(marker);
    const menu = new Menu(marker, {
        ...options,
        onClose: () => {
            marker.remove();
            if (anchor.isConnected) anchor.focus();
            options.onClose?.();
        },
    });
    menu.show();
    return menu;
}
