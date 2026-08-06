/**
 * Element context menus, and the keyboard paths that reach the same commands.
 *
 * Right-click is not an accessibility story on its own, so every element that has
 * a menu also answers the context-menu key, Shift+F10, and Alt+Enter. Shift plus
 * right-click skips the menu and opens the appearance editor directly, which is
 * the shortcut the appearance contract asks for where the platform can tell the
 * modifier apart.
 *
 * The menu carries its own search field. It filters which items are visible and
 * changes nothing about what an item does.
 */

import { clear, el, formatShortcut, uniqueId } from "../../platform/dom.js";
import { t } from "../../settings/i18n.js";
import { AnchoredPanel } from "../../search/anchoredPanel.js";
import { attachRegexBuilder } from "../../search/attachBuilder.js";
import { compileMatcher } from "../../tabs/matcher.js";
import type { AppearanceController } from "../controller.js";
import { findTarget, styleId } from "../model.js";
import { openAppearanceEditor } from "./appearanceEditor.js";

export interface MenuItem {
    readonly id: string;
    /** Already-localised label. Menus are built at open time, so this is current. */
    readonly label: string;
    /** Keyboard shortcut parts, for example `["Shift", "F10"]`. Displayed right-aligned. */
    readonly shortcut?: readonly string[] | undefined;
    readonly disabled?: boolean | undefined;
    readonly run: () => void;
}

export interface AppearanceTargetBinding {
    readonly kind: string;
    readonly instance?: string | undefined;
    readonly instanceLabel?: string | undefined;
    /** Items shown above the appearance commands, for example tab management. */
    readonly extraItems?: (() => readonly MenuItem[]) | undefined;
    /** Override the label of the edit command, for tabs and groups. */
    readonly editLabelKey?: string | undefined;
}

let openMenu: AnchoredPanel | null = null;
let pointerAnchor: HTMLElement | null = null;

export function closeElementMenu(): void {
    openMenu?.close();
}

const NATIVELY_FOCUSABLE = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "IFRAME", "SUMMARY"];

/**
 * Give an element a script-reachable focus target without changing the Tab order.
 *
 * The context menu's own keyboard path (`ContextMenu`, Shift+F10) and the appearance
 * editor's "return focus to whatever opened it" both need `element.focus()` to actually
 * move focus. A link, button, form control, or anything the page already gave a
 * `tabindex` can already take focus; a heading, paragraph, card, or footer -- which
 * `decoratePage`'s traversal registers just as readily -- cannot, and `.focus()` on it
 * silently does nothing, dropping the visitor at the top of the document instead of back
 * where they started. `tabindex="-1"` is the standard fix: focusable by script, absent
 * from the natural Tab order, so nothing about ordinary keyboard navigation changes.
 */
function ensureFocusable(element: HTMLElement): void {
    if (element.hasAttribute("tabindex")) return;
    if (NATIVELY_FOCUSABLE.includes(element.tagName)) return;
    if (element.isContentEditable) return;
    element.tabIndex = -1;
}

/**
 * Give a batch of elements that `ensureFocusable` made `tabindex="-1"` a real way in for a
 * keyboard-only visitor, the same roving-tabindex idiom the tab strip already uses for its
 * own arrow-key navigation.
 *
 * `tabindex="-1"` alone is correct for what it was built for -- focus RETURN once a menu
 * opened by mouse closes -- but it is deliberately absent from the Tab order (that is the
 * whole point of `-1`), so a heading, paragraph, table cell or card that has no other
 * focusable ancestor or sibling is otherwise permanently unreachable by keyboard: nothing
 * ever tabs to it, so its own `ContextMenu`/Shift+F10 handler (which only fires when
 * `event.target === element`) never gets a chance to run. Call this once with the group of
 * elements a page just registered (`decoratePage`'s traversal, for example) and exactly one
 * of them joins the Tab order for real; ArrowDown/ArrowRight, ArrowUp/ArrowLeft, Home and End
 * roving-focus across the rest, so every element in the group becomes reachable without
 * turning an entire article into a wall of meaningless Tab stops.
 *
 * Elements that are already natively focusable, or that already carry their own explicit
 * `tabindex`, are left alone -- they already have (or deliberately opted out of) a Tab stop
 * of their own and do not need to borrow this group's.
 */
export function installRovingAppearanceFocus(elements: readonly HTMLElement[]): () => void {
    const group = elements.filter(
        (element) =>
            element.getAttribute("tabindex") === "-1" &&
            !NATIVELY_FOCUSABLE.includes(element.tagName)
    );
    const first = group[0];
    if (first === undefined) return () => {};

    let activeIndex = 0;
    first.tabIndex = 0;

    const setActive = (index: number, focus: boolean): void => {
        const previous = group[activeIndex];
        if (previous !== undefined) previous.tabIndex = -1;
        activeIndex = index;
        const next = group[activeIndex];
        if (next === undefined) return;
        next.tabIndex = 0;
        if (focus) next.focus();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        if (!(event.target instanceof HTMLElement)) return;
        const index = group.indexOf(event.target);
        if (index < 0) return;
        let next = -1;
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
            next = (index + 1) % group.length;
        } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
            next = (index - 1 + group.length) % group.length;
        } else if (event.key === "Home") {
            next = 0;
        } else if (event.key === "End") {
            next = group.length - 1;
        } else {
            return;
        }
        event.preventDefault();
        setActive(next, true);
    };

    for (const element of group) {
        element.addEventListener("keydown", onKeyDown);
    }

    return () => {
        for (const element of group) {
            element.removeEventListener("keydown", onKeyDown);
        }
    };
}

/**
 * Mark an element as an appearance target and give it a menu.
 *
 * The data attributes are what the managed stylesheet's selectors match, so an
 * element that is registered is themable and an element that is not is visibly
 * absent from the editor list rather than silently unstyleable.
 */
export function registerAppearanceTarget(
    element: HTMLElement,
    binding: AppearanceTargetBinding,
    controller: AppearanceController
): () => void {
    element.dataset["mbKind"] = binding.kind;
    if (binding.instance !== undefined) {
        element.dataset["mbStyle"] = styleId(binding.kind, binding.instance);
    }
    ensureFocusable(element);

    const onContextMenu = (event: MouseEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
            openAppearanceEditor({
                anchor: element,
                kind: binding.kind,
                instance: binding.instance,
                instanceLabel: binding.instanceLabel,
                controller,
            });
            return;
        }
        openElementMenu(element, binding, controller, event.clientX, event.clientY);
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.target !== element) return;
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const rect = element.getBoundingClientRect();
            openElementMenu(element, binding, controller, rect.left, rect.bottom);
            return;
        }
        if (event.altKey && event.key === "Enter") {
            event.preventDefault();
            openAppearanceEditor({
                anchor: element,
                kind: binding.kind,
                instance: binding.instance,
                instanceLabel: binding.instanceLabel,
                controller,
            });
        }
    };

    element.addEventListener("contextmenu", onContextMenu);
    element.addEventListener("keydown", onKeyDown);

    return () => {
        element.removeEventListener("contextmenu", onContextMenu);
        element.removeEventListener("keydown", onKeyDown);
    };
}

export function openElementMenu(
    element: HTMLElement,
    binding: AppearanceTargetBinding,
    controller: AppearanceController,
    clientX: number,
    clientY: number
): void {
    openMenu?.close();
    pointerAnchor?.remove();

    // A zero-size element at the pointer, so the same anchored placement, collision
    // handling, and focus return apply to a menu opened from a click as to one
    // opened from a control.
    const anchor = el("span", { class: "mb-pointer-anchor", attrs: { "aria-hidden": "true" } });
    anchor.style.left = `${clientX}px`;
    anchor.style.top = `${clientY}px`;
    document.body.append(anchor);
    pointerAnchor = anchor;

    let closeMenu = (): void => {
        // Replaced below once the menu itself exists; a close before then has nothing to
        // tear down.
    };
    const panel = new AnchoredPanel({
        anchor,
        returnFocusTo: element,
        title: t("menu.title"),
        onClose: () => {
            closeMenu();
            anchor.remove();
            if (pointerAnchor === anchor) pointerAnchor = null;
            if (openMenu === panel) openMenu = null;
        },
    });
    openMenu = panel;

    const target = findTarget(binding.kind);
    const editLabel =
        binding.editLabelKey !== undefined
            ? t(binding.editLabelKey)
            : binding.kind === "tab"
              ? t("editor.openTab")
              : binding.kind === "tab-group"
                ? t("editor.openGroup")
                : t("editor.open");

    const items: MenuItem[] = [
        ...(binding.extraItems?.() ?? []),
        {
            id: "edit-appearance",
            label: editLabel,
            shortcut: ["Alt", "Enter"],
            run: () => {
                panel.close();
                openAppearanceEditor({
                    anchor: element,
                    kind: binding.kind,
                    instance: binding.instance,
                    instanceLabel: binding.instanceLabel,
                    controller,
                });
            },
        },
        {
            id: "reset-element",
            label: t("editor.resetElement"),
            disabled: !controller.store.has(
                binding.instance === undefined
                    ? binding.kind
                    : styleId(binding.kind, binding.instance)
            ),
            run: () => {
                panel.close();
                controller.store.resetElement(
                    binding.instance === undefined
                        ? binding.kind
                        : styleId(binding.kind, binding.instance)
                );
            },
        },
    ];

    const menu = buildMenu(items, target?.labelKey);
    closeMenu = menu.destroy;
    panel.show(menu.element);
}

interface BuiltMenu {
    readonly element: HTMLElement;
    /** Tears down the search field's regex builder: its DOM, and its locale subscription. */
    readonly destroy: () => void;
}

function buildMenu(items: readonly MenuItem[], targetLabelKey: string | undefined): BuiltMenu {
    const container = el("div", { class: "md-menu mb-menu", data: { mbKind: "context-menu" } });
    const searchId = uniqueId("mb-menu-search");
    const search = el("input", {
        class: "md-field__input",
        attrs: {
            id: searchId,
            type: "search",
            autocomplete: "off",
            placeholder: t("menu.search"),
            "aria-label": t("menu.search"),
        },
    });
    // The row the search field and its anchored regex builder button share, matching every
    // other search surface in this application: plain text by default, the guided pattern
    // builder one click away, never a bare field with nowhere for the builder to live.
    const searchRow = el("div", { class: "md-menu__search-row" }, search);
    const list = el("div", {
        class: "mb-menu-list",
        attrs: {
            role: "menu",
            "aria-label": targetLabelKey === undefined ? t("menu.title") : t(targetLabelKey),
        },
    });

    let filterMode: "plain" | "regex" = "plain";
    let filterCaseSensitive = false;

    function render(query: string): void {
        clear(list);
        const matcher =
            query.trim().length === 0
                ? null
                : compileMatcher({ query, mode: filterMode, caseSensitive: filterCaseSensitive });
        const visible = items.filter(
            (item) => matcher === null || (matcher.ok && matcher.test(item.label))
        );
        if (visible.length === 0) {
            list.append(el("p", { class: "md-field__help mb-help", text: t("menu.noItems") }));
            return;
        }
        for (const item of visible) {
            const button = el("button", {
                class: "md-menu__item",
                attrs: { type: "button", role: "menuitem" },
            });
            button.disabled = item.disabled === true;
            button.append(el("span", { class: "md-menu__item-label", text: item.label }));
            if (item.shortcut !== undefined) {
                // The shortcut text comes from the same list the handler binds, so a
                // displayed key and a bound key cannot drift apart.
                const keys = el("kbd", {
                    class: "md-menu__shortcut",
                    text: formatShortcut(item.shortcut),
                });
                keys.setAttribute("aria-hidden", "true");
                button.append(keys);
                button.setAttribute(
                    "aria-keyshortcuts",
                    item.shortcut.join("+").replace("Enter", "Enter")
                );
            }
            button.addEventListener("click", () => {
                if (item.disabled === true) return;
                item.run();
            });
            list.append(button);
        }
    }

    const builder = attachRegexBuilder(search, {
        fieldId: searchId,
        fieldLabel: t("menu.search"),
        container: searchRow,
        persist: false,
        sampleProvider: () => items.map((item) => item.label).join("\n"),
        onChange: (spec) => {
            filterMode = spec.mode;
            filterCaseSensitive = spec.caseSensitive;
            // An invalid pattern is not silently treated as "show everything": compileMatcher
            // reports it unmatched below, exactly as the tab list's own regex filter does.
            render(spec.query);
        },
    });
    list.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        const buttons = [...list.querySelectorAll<HTMLButtonElement>("button:not([disabled])")];
        if (buttons.length === 0) return;
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        const next =
            event.key === "ArrowDown"
                ? buttons[(index + 1 + buttons.length) % buttons.length]
                : buttons[(index - 1 + buttons.length) % buttons.length];
        next?.focus();
    });

    render("");
    container.append(searchRow, list);
    return { element: container, destroy: () => builder.destroy() };
}
