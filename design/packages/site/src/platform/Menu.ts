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
import { el, uniqueId } from "./dom.js";
import { createBuilderController } from "../search/builderPanel.js";
import { sharedRegexEvaluator } from "../search/evaluator.js";
import { SearchQueryModel } from "../search/queryModel.js";

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

export interface MenuSearchOptions {
    /** Accessible label and placeholder for the menu's local filter. */
    readonly label: string;
    /** Label for the adjacent guided regex builder. */
    readonly builderLabel: string;
    /** Honest empty state shown when no command survives the query. */
    readonly noResults?: string;
}

export interface MenuOptions extends Omit<OverlayOptions, "role"> {
    readonly entries: readonly MenuEntry[];
    /** Content shown above the command list, such as a filter field. */
    readonly header?: HTMLElement;
    /** Add a keyboard-accessible filter owned by this menu. */
    readonly search?: MenuSearchOptions;
}

export class Menu {
    private readonly overlay: Overlay;
    private readonly list: HTMLElement;
    private readonly initialFocus: HTMLElement | undefined;
    private readonly searchInput: HTMLInputElement | undefined;
    private readonly searchOptions: MenuSearchOptions | undefined;
    private entries: readonly MenuEntry[] = [];
    private searchModel: SearchQueryModel | null = null;
    private destroySearchModel: (() => void) | null = null;
    private searchBuilder: { readonly element: HTMLElement; toggle(): void; destroy(): void } | null = null;
    /**
     * Releases the search builder's exemption from this menu's own outside-click dismissal.
     * The builder opens as a separate document-body-level popover (see `openSearchBuilder`
     * below), not nested inside `this.overlay.element`, so without an exemption the very first
     * click inside it -- a token button, the pattern field, a flag checkbox -- would read as
     * "outside the menu" and close the menu (and the builder with it) instantly.
     */
    private releaseSearchBuilderExemption: (() => void) | null = null;

    constructor(anchor: HTMLElement, options: MenuOptions) {
        const { entries, header, search, ...overlayOptions } = options;
        this.initialFocus = options.initialFocus;
        this.searchOptions = search;
        this.overlay = new Overlay(anchor, {
            ...overlayOptions,
            role: "menu",
            onClose: () => {
                this.searchBuilder?.destroy();
                this.searchBuilder = null;
                this.releaseSearchBuilderExemption?.();
                this.releaseSearchBuilderExemption = null;
                this.destroySearchModel?.();
                this.destroySearchModel = null;
                this.searchModel = null;
                overlayOptions.onClose?.();
            },
        });
        this.list = el("ul", {
            class: "md-menu",
            attrs: { role: "menu", id: uniqueId("md-menu-list") },
        });

        if (header !== undefined) this.overlay.element.append(header);
        if (search !== undefined) {
            const searchHeader = el("div", { class: "md-menu__search" });
            const searchId = uniqueId("md-menu-search");
            const label = el("label", {
                class: "md-field__label",
                attrs: { for: searchId },
                text: search.label,
            });
            this.searchInput = el("input", {
                class: "md-field__input",
                attrs: {
                    id: searchId,
                    type: "search",
                    autocomplete: "off",
                    spellcheck: "false",
                    placeholder: search.label,
                    "aria-label": search.label,
                    "aria-controls": this.list.id,
                },
            });
            const searchRow = el("div", { class: "md-menu__search-row" });
            const builder = el("button", {
                class: "md-button md-button--outlined md-menu__builder",
                attrs: {
                    type: "button",
                    "aria-label": search.builderLabel,
                    title: search.builderLabel,
                },
                text: ".*",
            });
            this.searchInput.addEventListener("input", () => {
                this.searchModel?.setFieldValue(this.searchInput?.value ?? "");
                this.renderEntries();
            });
            builder.addEventListener("click", () => this.openSearchBuilder(builder, search.label));
            searchRow.append(this.searchInput, builder);
            searchHeader.append(label, searchRow);
            this.overlay.element.append(searchHeader);
        } else {
            this.searchInput = undefined;
        }
        this.overlay.element.append(this.list);
        this.setEntries(entries);

        this.list.addEventListener("keydown", (event) => this.onKeyDown(event));
    }

    get element(): HTMLElement {
        return this.overlay.element;
    }

    setEntries(entries: readonly MenuEntry[]): void {
        this.entries = entries;
        this.renderEntries();
    }

    private renderEntries(): void {
        const query = this.searchInput?.value.trim() ?? "";
        const entries = query.length === 0 ? this.entries : this.filteredEntries();
        this.list.replaceChildren();
        let commandCount = 0;
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

            commandCount += 1;
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
        if (commandCount === 0 && query.length > 0) {
            this.list.append(
                el("li", {
                    class: "md-menu__no-results",
                    attrs: { role: "presentation" },
                    text: this.searchOptions?.noResults ?? "No matching menu items.",
                }),
            );
        }
    }

    private filteredEntries(): readonly MenuEntry[] {
        const result: MenuEntry[] = [];
        let pending: MenuEntry[] = [];
        for (const entry of this.entries) {
            if (entry.kind === "separator" || entry.kind === "heading") {
                pending.push(entry);
                continue;
            }
            const label = el("span");
            entry.render(label);
            const matches = this.matches(label.textContent ?? "");
            if (matches) {
                result.push(...pending, entry);
            }
            pending = [];
        }
        return result;
    }

    private matches(label: string): boolean {
        const snapshot = this.searchModel?.snapshot();
        if (snapshot === undefined || snapshot.mode === "text") {
            return label.toLowerCase().includes((snapshot?.query ?? this.searchInput?.value ?? "").toLowerCase());
        }
        if (snapshot.validation.status === "invalid" || snapshot.pattern.length === 0) return false;
        try {
            const matcher = new RegExp(snapshot.pattern, snapshot.flags);
            matcher.lastIndex = 0;
            return matcher.test(label);
        } catch {
            return false;
        }
    }

    private openSearchBuilder(anchor: HTMLElement, fieldLabel: string): void {
        if (this.searchInput === undefined) return;
        this.searchBuilder?.destroy();
        this.releaseSearchBuilderExemption?.();
        this.releaseSearchBuilderExemption = null;
        this.destroySearchModel?.();
        const model = new SearchQueryModel({
            fieldId: uniqueId("md-menu-search-model"),
            initialQuery: this.searchInput.value,
            persist: false,
        });
        this.searchModel = model;
        this.destroySearchModel = model.subscribe((snapshot) => {
            if (this.searchInput !== undefined && this.searchInput.value !== snapshot.fieldValue) {
                this.searchInput.value = snapshot.fieldValue;
            }
            this.renderEntries();
        });
        this.searchBuilder = createBuilderController({
            model,
            evaluator: sharedRegexEvaluator(),
            fieldLabel,
            sampleProvider: () => this.entries.map((entry) => this.entryLabel(entry)).filter(Boolean).join("\n"),
            anchor,
            returnFocusTo: this.searchInput,
        });
        this.releaseSearchBuilderExemption = this.overlay.addDismissExemption(this.searchBuilder.element);
        this.searchBuilder.toggle();
    }

    private entryLabel(entry: MenuEntry): string {
        if (entry.kind === "separator" || entry.kind === "heading") return "";
        const label = el("span");
        entry.render(label);
        return label.textContent ?? "";
    }

    show(): void {
        this.overlay.show();
        // Overlay already focused whatever the caller asked for. Only fall back to the first
        // command when no initial focus was named, so a menu with a filter field opens with
        // the caret in the field rather than on the first result.
        if (this.initialFocus === undefined) (this.searchInput ?? this.items()[0])?.focus();
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
