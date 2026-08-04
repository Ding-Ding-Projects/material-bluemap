/**
 * The tab strip and its panels.
 *
 * Structure, and why:
 *
 *   .tab-bar
 *     .tab-strip[role=tablist]          the tabs themselves
 *       .tab-strip__pinned              pinned pages, always visible, own order
 *       .tab-strip__main                ordinary pages and groups
 *     .tab-bar__actions                 strip-level controls, outside the tablist
 *   .tab-panels                         one panel per open page, one visible
 *
 * The strip-level controls (overflow, the page list) sit outside the tablist so the tablist
 * owns only tabs. Group headers are the one exception: they are buttons inside the tablist,
 * because a control that collapses a group has to sit with the group it collapses. They are
 * announced as buttons and are fully keyboard operable; the alternative, moving them out of
 * the strip, would separate every group's control from the group.
 *
 * Overflow is real, not a scrollbar hiding a problem. Widths are measured with every segment
 * shown, so the decision is made from intrinsic sizes and cannot oscillate, and whatever does
 * not fit moves into a menu that lists it by name. The active page is always kept visible: if
 * it would have been pushed out, it is given room first and drawn at the end of the visible
 * run rather than disappearing.
 *
 * Pinned pages are never hidden by overflow, are excluded from bulk closes unless the visitor
 * explicitly includes them, and keep their full accessible name however narrow they get.
 */

import { GROUP_COLOURS, type GroupColour, type Segment, type TabModel } from "./TabModel.js";
import { Menu, openContextMenu, type MenuEntry } from "../platform/Menu.js";
import { clear, el, icon } from "../platform/dom.js";
import { openBulkCloseDialog, type BulkCloseScope } from "./BulkCloseDialog.js";
import { Overlay } from "../platform/Overlay.js";
import { compileMatcher } from "./matcher.js";
import type { I18n } from "../i18n/I18n.js";
import type { Notifications } from "../notifications/Notifications.js";
import type { RegexBuilderSlot } from "../platform/RegexBuilderSlot.js";
import type { ShortcutRegistry } from "../platform/shortcuts.js";
import type { StringKey } from "../i18n/strings.js";
import type { AppearanceController } from "../appearance/controller.js";
import { openAppearanceEditor } from "../appearance/editor/appearanceEditor.js";
import { t } from "../settings/i18n.js";

export interface TabStripDeps {
    readonly i18n: I18n;
    readonly model: TabModel;
    readonly notifications: Notifications;
    readonly shortcuts: ShortcutRegistry;
    readonly regex: RegexBuilderSlot;
    /** The site-level appearance controller, shared with every tab's editor. */
    readonly appearance: AppearanceController;
}

interface PanelRecord {
    readonly node: HTMLElement;
    rendered: boolean;
    dispose: (() => void) | null;
}

const COLOUR_LABEL: Record<GroupColour, StringKey> = {
    blue: "tabs.colour.blue",
    green: "tabs.colour.green",
    amber: "tabs.colour.amber",
    purple: "tabs.colour.purple",
    red: "tabs.colour.red",
    grey: "tabs.colour.grey",
};

export class TabStrip {
    readonly bar: HTMLElement;
    readonly panels: HTMLElement;

    private readonly deps: TabStripDeps;
    private readonly strip: HTMLElement;
    private readonly pinnedRegion: HTMLElement;
    private readonly mainRegion: HTMLElement;
    private readonly actions: HTMLElement;
    private readonly overflowButton: HTMLButtonElement;
    private readonly listButton: HTMLButtonElement;
    private readonly panelRecords = new Map<string, PanelRecord>();
    private overflowed: string[] = [];
    private dragId: string | null = null;
    /** Groups temporarily opened to reveal a search result, without changing the saved state. */
    private readonly temporarilyRevealed = new Set<string>();

    constructor(deps: TabStripDeps) {
        this.deps = deps;
        const { i18n, model, shortcuts } = deps;

        this.pinnedRegion = el("div", { class: "tab-strip__pinned", attrs: { role: "presentation" } });
        this.mainRegion = el("div", { class: "tab-strip__main", attrs: { role: "presentation" } });
        this.strip = el(
            "div",
            { class: "tab-strip", attrs: { role: "tablist", "aria-orientation": "horizontal" } },
            this.pinnedRegion,
            this.mainRegion,
        );
        i18n.bindAttr(this.strip, "aria-label", "tabs.stripLabel");

        this.overflowButton = el("button", { class: "md-button md-button--text tab-bar__overflow", attrs: { type: "button" } });
        this.overflowButton.hidden = true;
        this.overflowButton.addEventListener("click", () => this.openOverflowMenu());

        this.listButton = el("button", { class: "md-icon-button", attrs: { type: "button" } });
        this.listButton.append(icon("moreHoriz"));
        i18n.bindAttr(this.listButton, "aria-label", "shell.tabListButton");
        this.listButton.addEventListener("click", () => this.openTabListMenu());

        this.actions = el("div", { class: "tab-bar__actions" }, this.overflowButton, this.listButton);
        this.bar = el("div", { class: "tab-bar" }, this.strip, this.actions);
        this.panels = el("div", { class: "tab-panels" });

        this.strip.addEventListener("keydown", (event) => this.onStripKeyDown(event));

        model.subscribe(() => this.render());
        // A language change rewrites every label, which changes every tab's width, so the
        // strip is rebuilt and re-measured rather than left with stale overflow decisions.
        i18n.subscribe(() => this.render());

        if (typeof ResizeObserver !== "undefined") {
            new ResizeObserver(() => this.layout()).observe(this.bar);
        } else {
            window.addEventListener("resize", () => this.layout());
        }

        shortcuts.register({
            id: "tabs.moveLeft",
            parts: ["Shift", "Alt", "ArrowLeft"],
            run: () => this.withActive((id) => model.moveTab(id, -1)),
        });
        shortcuts.register({
            id: "tabs.moveRight",
            parts: ["Shift", "Alt", "ArrowRight"],
            run: () => this.withActive((id) => model.moveTab(id, 1)),
        });
        shortcuts.register({
            id: "tabs.pin",
            parts: ["Shift", "Alt", "P"],
            run: () => this.withActive((id) => this.togglePin(id)),
        });
        shortcuts.register({
            id: "tabs.close",
            parts: ["Shift", "Alt", "W"],
            run: () => this.withActive((id) => this.closeTab(id)),
        });
        shortcuts.register({
            id: "tabs.reopen",
            parts: ["Shift", "Alt", "T"],
            run: () => this.reopenLast(),
        });
        shortcuts.register({
            id: "tabs.list",
            parts: ["Shift", "Alt", "A"],
            run: () => {
                this.listButton.focus();
                this.openTabListMenu();
            },
        });

        this.render();
    }

    /** Page ids currently sitting in the overflow menu rather than on the strip. */
    overflowedIds(): readonly string[] {
        return this.overflowed;
    }

    // ---- rendering -------------------------------------------------------------------

    render(): void {
        const { model } = this.deps;
        clear(this.pinnedRegion);
        clear(this.mainRegion);

        const pinned = model.pinnedIds();
        this.pinnedRegion.hidden = pinned.length === 0;
        for (const id of pinned) this.pinnedRegion.append(this.renderTab(id, true));

        const segments = model.segments();
        if (pinned.length === 0 && segments.length === 0) {
            const empty = el("p", { class: "md-body-medium tab-strip__empty" });
            this.deps.i18n.bindText(empty, "tabs.emptyStrip");
            this.mainRegion.append(empty);
        }
        for (const segment of segments) this.mainRegion.append(this.renderSegment(segment));

        this.renderPanels();
        this.layout();
    }

    private renderSegment(segment: Segment): HTMLElement {
        if (segment.kind === "tab") return this.renderTab(segment.id, false);

        const { i18n, model } = this.deps;
        const group = model.listGroups().find((candidate) => candidate.id === segment.id);
        if (group === undefined) return el("span");

        const collapsed = group.collapsed && !this.temporarilyRevealed.has(group.id);
        const tabsId = `group-tabs-${group.id}`;
        const wrapper = el("div", {
            class: "tab-group",
            attrs: { role: "presentation" },
            data: { colour: group.colour, groupId: group.id },
        });

        const header = el("button", {
            class: "tab-group__header",
            attrs: {
                type: "button",
                "aria-expanded": collapsed ? "false" : "true",
                "aria-controls": tabsId,
                "aria-label": `${group.name} (${segment.members.length})`,
            },
        });
        header.append(el("span", { class: "tab-group__dot", attrs: { "aria-hidden": "true" } }));
        header.append(el("span", { class: "tab-group__name", text: group.name }));
        header.append(el("span", { class: "tab-group__count", text: String(segment.members.length) }));
        header.append(icon(collapsed ? "chevronRight" : "expandMore", "tab-group__chevron"));
        header.addEventListener("click", () => {
            this.temporarilyRevealed.delete(group.id);
            model.setGroupCollapsed(group.id, !group.collapsed);
        });
        header.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            if (event.shiftKey) {
                openAppearanceEditor({
                    anchor: header,
                    kind: "tab-group",
                    instance: group.id,
                    instanceLabel: group.name,
                    controller: this.deps.appearance,
                });
                return;
            }
            this.openGroupMenu(header, group.id, event.clientX, event.clientY);
        });
        header.addEventListener("dragover", (event) => {
            if (this.dragId === null) return;
            event.preventDefault();
            header.classList.add("is-drop-target");
        });
        header.addEventListener("dragleave", () => header.classList.remove("is-drop-target"));
        header.addEventListener("drop", (event) => {
            event.preventDefault();
            header.classList.remove("is-drop-target");
            if (this.dragId === null) return;
            model.setPinned(this.dragId, false);
            model.setGroup(this.dragId, group.id);
        });
        wrapper.append(header);

        const tabs = el("div", { class: "tab-group__tabs", attrs: { role: "presentation", id: tabsId } });
        tabs.hidden = collapsed;
        for (const id of segment.members) tabs.append(this.renderTab(id, false));
        wrapper.append(tabs);
        // A collapsed group must still say how many pages are inside it and be findable by
        // name, so its header keeps the full accessible label above.
        i18n.bindAttr(header, "title", collapsed ? "tabs.group.expand" : "tabs.group.collapse");
        return wrapper;
    }

    private renderTab(id: string, pinned: boolean): HTMLElement {
        const { i18n, model } = this.deps;
        const definition = model.definition(id);
        const active = model.active === id;

        // A div rather than a button, because the close control is a real button and a button
        // cannot contain another button. Enter and Space are handled below, so the element
        // behaves exactly like the button it looks like.
        const tab = el("div", {
            class: `tab${pinned ? " tab--pinned" : ""}${active ? " is-active" : ""}`,
            attrs: {
                role: "tab",
                id: `tab-${id}`,
                "aria-selected": active ? "true" : "false",
                "aria-controls": `panel-${id}`,
                tabindex: active ? "0" : "-1",
                draggable: "true",
            },
            data: { tabId: id },
        });

        if (definition?.icon !== undefined) tab.append(icon(definition.icon, "tab__icon"));
        if (pinned) tab.append(icon("pin", "tab__pin"));

        const label = el("span", { class: "tab__label" });
        if (definition !== undefined) i18n.applyTo(label, definition.label);
        else label.textContent = id;
        tab.append(label);

        // Pinned tabs compress to their icon at narrow widths. The accessible name is the
        // full label either way, so nothing is lost when the text is not shown.
        tab.setAttribute("aria-label", model.label(id));

        if (model.isClosable(id) && !pinned) {
            // Taken out of the tab sequence on purpose: a tablist is one tab stop, and an
            // extra stop per tab would make arrowing through twenty pages take forty presses.
            // The keyboard route is Delete on the focused tab, the context menu, and the
            // Shift+Alt+W shortcut, all of which are listed in the menu with their keys.
            const close = el("button", { class: "md-icon-button tab__close", attrs: { type: "button", tabindex: "-1" } });
            close.append(icon("close"));
            close.setAttribute("aria-label", `${i18n.t("tabs.menu.close")}: ${model.label(id)}`);
            close.addEventListener("click", (event) => {
                event.stopPropagation();
                this.closeTab(id);
            });
            tab.append(close);
        }

        tab.addEventListener("click", () => model.activate(id));
        tab.addEventListener("keydown", (event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            model.activate(id);
        });
        tab.addEventListener("contextmenu", (event) => {
            event.preventDefault();
            if (event.shiftKey) {
                openAppearanceEditor({
                    anchor: tab,
                    kind: "tab",
                    instance: id,
                    instanceLabel: model.label(id),
                    controller: this.deps.appearance,
                });
                return;
            }
            this.openTabMenu(tab, id, event.clientX, event.clientY);
        });
        tab.addEventListener("dragstart", (event) => {
            this.dragId = id;
            event.dataTransfer?.setData("text/plain", id);
            tab.classList.add("is-dragging");
        });
        tab.addEventListener("dragend", () => {
            this.dragId = null;
            tab.classList.remove("is-dragging");
        });
        tab.addEventListener("dragover", (event) => {
            if (this.dragId === null || this.dragId === id) return;
            event.preventDefault();
            tab.classList.add("is-drop-target");
        });
        tab.addEventListener("dragleave", () => tab.classList.remove("is-drop-target"));
        tab.addEventListener("drop", (event) => {
            event.preventDefault();
            tab.classList.remove("is-drop-target");
            if (this.dragId !== null && this.dragId !== id) this.dropOnto(this.dragId, id);
        });

        return tab;
    }

    private renderPanels(): void {
        const { model } = this.deps;
        const open = new Set(model.openIds());

        for (const [id, record] of [...this.panelRecords]) {
            if (open.has(id)) continue;
            record.dispose?.();
            record.node.remove();
            this.panelRecords.delete(id);
        }

        for (const id of model.openIds()) {
            let record = this.panelRecords.get(id);
            if (record === undefined) {
                const node = el("section", {
                    class: "tab-panel",
                    attrs: { role: "tabpanel", id: `panel-${id}`, "aria-labelledby": `tab-${id}`, tabindex: "0" },
                });
                record = { node, rendered: false, dispose: null };
                this.panelRecords.set(id, record);
                this.panels.append(node);
            }
            const active = model.active === id;
            record.node.hidden = !active;
            if (active && !record.rendered) {
                // Pages are drawn the first time they are opened, not up front, so a strip of
                // twenty pages does not build twenty pages nobody asked for.
                const dispose = model.definition(id)?.render(record.node);
                record.dispose = typeof dispose === "function" ? dispose : null;
                record.rendered = true;
            }
        }
    }

    // ---- overflow ---------------------------------------------------------------------

    private layout(): void {
        const children = [...this.mainRegion.children].filter(
            (child): child is HTMLElement => child instanceof HTMLElement,
        );
        for (const child of children) {
            child.hidden = false;
            child.style.removeProperty("order");
        }
        this.overflowButton.hidden = true;
        this.overflowed = [];
        if (children.length === 0) return;

        const gap = Number.parseFloat(getComputedStyle(this.mainRegion).columnGap) || 0;
        const widths = children.map((child) => child.getBoundingClientRect().width);
        const total = widths.reduce((sum, width) => sum + width, 0) + gap * (children.length - 1);
        if (total <= this.mainRegion.clientWidth + 0.5) return;

        // Something has to move into the menu, so make room for the button that opens it and
        // re-read the width the button leaves behind.
        this.overflowButton.hidden = false;
        this.syncOverflowLabel(children.length);
        const budget = this.mainRegion.clientWidth;

        const activeIndex = children.findIndex(
            (child) => child.matches('[aria-selected="true"]') || child.querySelector('[aria-selected="true"]') !== null,
        );
        let used = 0;
        const visible = new Set<number>();
        if (activeIndex >= 0) {
            used += (widths[activeIndex] ?? 0) + gap;
            visible.add(activeIndex);
        }
        for (const [index, child] of children.entries()) {
            if (visible.has(index)) continue;
            const width = (widths[index] ?? 0) + gap;
            if (used + width > budget) {
                child.hidden = true;
                continue;
            }
            used += width;
            visible.add(index);
        }

        // If the active page was not where it would naturally have fitted, draw it at the end
        // of the visible run so it is on screen without reordering everything else.
        if (activeIndex >= 0) {
            const naturalPosition = [...visible].sort((a, b) => a - b).indexOf(activeIndex);
            const lastVisible = Math.max(...visible);
            if (activeIndex > lastVisible || naturalPosition === -1) {
                const activeChild = children[activeIndex];
                if (activeChild !== undefined) activeChild.style.order = "1";
            }
        }

        this.overflowed = children
            .filter((child) => child.hidden)
            .flatMap((child) =>
                child.dataset.tabId !== undefined ? [child] : [...child.querySelectorAll<HTMLElement>("[data-tab-id]")],
            )
            .map((tab) => tab.dataset.tabId ?? "")
            .filter((id) => id.length > 0);

        if (this.overflowed.length === 0) {
            this.overflowButton.hidden = true;
            return;
        }
        this.syncOverflowLabel(this.overflowed.length);
    }

    private syncOverflowLabel(count: number): void {
        clear(this.overflowButton);
        const label = el("span");
        this.deps.i18n.bindText(label, "tabs.overflowButton", { count });
        this.overflowButton.append(label);
        this.overflowButton.append(icon("expandMore"));
    }

    private openOverflowMenu(): void {
        const { i18n, model } = this.deps;
        const entries: MenuEntry[] = this.overflowed.map((id) => ({
            render: (label) => i18n.applyTo(label, model.definition(id)?.label ?? { text: id }),
            onSelect: () => model.activate(id),
        }));
        const menu = new Menu(this.overflowButton, {
            label: i18n.t("tabs.overflowButton", { count: this.overflowed.length }),
            entries,
            search: {
                label: i18n.t("tabs.menu.search"),
                builderLabel: i18n.t("bulk.builderButton"),
                noResults: i18n.t("tabs.menu.noItems"),
            },
            align: "end",
        });
        menu.show();
    }

    // ---- menus -------------------------------------------------------------------------

    private openTabMenu(anchor: HTMLElement, id: string, x: number, y: number): void {
        const { i18n, model, shortcuts } = this.deps;
        const pinned = model.isPinned(id);
        const group = model.groupOf(id);
        const groups = model.listGroups();

        const entries: MenuEntry[] = [
            {
                render: (label) => i18n.bindText(label, pinned ? "tabs.menu.unpin" : "tabs.menu.pin"),
                shortcut: shortcuts.display("tabs.pin"),
                onSelect: () => this.togglePin(id),
            },
            {
                render: (label) => i18n.bindText(label, "tabs.menu.moveLeft"),
                shortcut: shortcuts.display("tabs.moveLeft"),
                onSelect: () => model.moveTab(id, -1),
            },
            {
                render: (label) => i18n.bindText(label, "tabs.menu.moveRight"),
                shortcut: shortcuts.display("tabs.moveRight"),
                onSelect: () => model.moveTab(id, 1),
            },
            { kind: "separator" },
            {
                render: (label) => i18n.bindText(label, "tabs.group.newGroup"),
                onSelect: () => this.promptNewGroup(anchor, id),
            },
        ];

        if (groups.length > 0) {
            entries.push({ kind: "heading", render: (label) => i18n.bindText(label, "tabs.menu.addToGroup") });
            for (const candidate of groups) {
                entries.push({
                    render: (label) => {
                        label.textContent = candidate.name;
                    },
                    swatch: `var(--md-comp-group-${candidate.colour})`,
                    checked: group?.id === candidate.id,
                    onSelect: () => model.setGroup(id, candidate.id),
                });
            }
        }
        if (group !== null) {
            entries.push({
                render: (label) => i18n.bindText(label, "tabs.menu.removeFromGroup"),
                onSelect: () => model.setGroup(id, null),
            });
        }

        entries.push({ kind: "separator" });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.close"),
            shortcut: shortcuts.display("tabs.close"),
            disabled: !model.isClosable(id),
            onSelect: () => this.closeTab(id),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.closeOthers"),
            onSelect: () => this.closeOthers(id),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.closeRight"),
            onSelect: () => this.closeToTheRight(id),
        });
        entries.push({ kind: "separator" });
        entries.push({
            render: (label) => { label.textContent = t("editor.openTab"); },
            shortcut: "Shift + right-click",
            onSelect: () => openAppearanceEditor({
                anchor,
                kind: "tab",
                instance: id,
                instanceLabel: model.label(id),
                controller: this.deps.appearance,
            }),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.closeContaining"),
            onSelect: () => this.openBulkClose(false, { kind: "all", groupId: null }),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.closeNotContaining"),
            onSelect: () => this.openBulkClose(true, { kind: "all", groupId: null }),
        });

        openContextMenu(anchor, x, y, {
            label: i18n.t("tabs.menu.pageActions"),
            entries,
            search: {
                label: i18n.t("tabs.menu.search"),
                builderLabel: i18n.t("bulk.builderButton"),
                noResults: i18n.t("tabs.menu.noItems"),
            },
        });
    }

    private openGroupMenu(anchor: HTMLElement, groupId: string, x: number, y: number): void {
        const { i18n, model, shortcuts } = this.deps;
        const group = model.listGroups().find((candidate) => candidate.id === groupId);
        if (group === undefined) return;
        const segments = model.segments();
        const index = segments.findIndex((segment) => segment.kind === "group" && segment.id === groupId);

        const entries: MenuEntry[] = [
            {
                render: (label) => i18n.bindText(label, group.collapsed ? "tabs.group.expand" : "tabs.group.collapse"),
                onSelect: () => model.setGroupCollapsed(groupId, !group.collapsed),
            },
            {
                render: (label) => i18n.bindText(label, "tabs.group.rename"),
                onSelect: () => this.promptRenameGroup(anchor, groupId, group.name),
            },
            {
                render: (label) => i18n.bindText(label, "tabs.menu.moveLeft"),
                shortcut: shortcuts.display("tabs.moveLeft"),
                onSelect: () => model.moveSegment(index, -1),
            },
            {
                render: (label) => i18n.bindText(label, "tabs.menu.moveRight"),
                shortcut: shortcuts.display("tabs.moveRight"),
                onSelect: () => model.moveSegment(index, 1),
            },
            { kind: "separator" },
            { kind: "heading", render: (label) => i18n.bindText(label, "tabs.group.colour") },
        ];

        for (const colour of GROUP_COLOURS) {
            entries.push({
                render: (label) => i18n.bindText(label, COLOUR_LABEL[colour]),
                swatch: `var(--md-comp-group-${colour})`,
                checked: group.colour === colour,
                onSelect: () => model.setGroupColour(groupId, colour),
            });
        }

        entries.push({ kind: "separator" });
        entries.push({
            render: (label) => { label.textContent = t("editor.openGroup"); },
            shortcut: "Shift + right-click",
            onSelect: () => openAppearanceEditor({
                anchor,
                kind: "tab-group",
                instance: groupId,
                instanceLabel: group.name,
                controller: this.deps.appearance,
            }),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.closeContaining"),
            onSelect: () => this.openBulkClose(false, { kind: "group", groupId }),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.menu.closeNotContaining"),
            onSelect: () => this.openBulkClose(true, { kind: "group", groupId }),
        });
        entries.push({
            render: (label) => i18n.bindText(label, "tabs.group.remove"),
            onSelect: () => model.removeGroup(groupId),
        });

        openContextMenu(anchor, x, y, {
            label: i18n.t("tabs.group.actions"),
            entries,
            search: {
                label: i18n.t("tabs.menu.search"),
                builderLabel: i18n.t("bulk.builderButton"),
                noResults: i18n.t("tabs.menu.noItems"),
            },
        });
    }

    /**
     * The page list: every page the site owns, open or closed, filtered by its own field.
     * The field defaults to plain text and offers the guided builder when one is available,
     * exactly like every other search surface.
     */
    private openTabListMenu(): void {
        const { i18n, model, regex } = this.deps;
        let filterMode: "plain" | "regex" = "plain";
        let filterFlags = "i";

        const header = el("div", { class: "tab-list__header" });
        const filterId = "tab-list-filter";
        const filterLabel = el("label", { class: "md-field__label", attrs: { for: filterId } });
        i18n.bindText(filterLabel, "tabs.filterLabel");
        const filter = el("input", {
            class: "md-field__input",
            attrs: { id: filterId, type: "search", autocomplete: "off", spellcheck: "false" },
        });
        const filterRow = el("div", { class: "tab-list__filter-row" }, filter);
        if (regex.available) {
            const builder = el("button", { class: "md-button md-button--outlined", attrs: { type: "button" } });
            i18n.bindText(builder, "bulk.builderButton");
            builder.addEventListener("click", () => {
                regex.open({
                    anchor: builder,
                    field: filter,
                    pattern: filter.value,
                    flags: filterFlags,
                    mode: filterMode,
                    sample: model.allIds().map((id) => model.label(id)).join("\n"),
                    onChange: (next) => {
                        filterMode = "regex";
                        filterFlags = next.flags;
                        filter.value = next.pattern;
                        rebuild();
                    },
                });
            });
            filterRow.append(builder);
        }
        const filterHelp = el("p", { class: "md-field__help" });
        i18n.bindText(filterHelp, "tabs.listFilterHelp");
        header.append(filterLabel, filterRow, filterHelp);

        const menu = new Menu(this.listButton, {
            label: i18n.t("tabs.listHeading"),
            entries: [],
            header,
            align: "end",
            initialFocus: filter,
        });

        const rebuild = (): void => {
            const spec = { query: filter.value, mode: filterMode, caseSensitive: !filterFlags.includes("i") };
            const matcher = compileMatcher(spec);
            const keep = (label: string): boolean => filter.value.length === 0 || (matcher.ok && matcher.test(label));

            const entries: MenuEntry[] = [];
            const open = model.openIds().filter((id) => keep(model.label(id)));
            for (const id of open) {
                const group = model.groupOf(id);
                entries.push({
                    render: (label) => {
                        i18n.applyTo(label, model.definition(id)?.label ?? { text: id });
                        if (group !== null) label.append(el("span", { class: "tab-list__meta", text: group.name }));
                        if (model.isPinned(id)) label.append(el("span", { class: "tab-list__meta", text: "•" }));
                    },
                    checked: model.active === id,
                    onSelect: () => this.reveal(id),
                });
            }

            const closed = model.recentlyClosedIds().filter((id) => keep(model.label(id)));
            if (closed.length > 0) {
                entries.push({ kind: "separator" });
                entries.push({ kind: "heading", render: (label) => i18n.bindText(label, "tabs.recentlyClosed") });
                for (const id of closed) {
                    entries.push({
                        render: (label) => i18n.applyTo(label, model.definition(id)?.label ?? { text: id }),
                        onSelect: () => model.reopen(id),
                    });
                }
            }

            entries.push({ kind: "separator" });
            entries.push({
                render: (label) => i18n.bindText(label, "tabs.menu.closeContaining"),
                onSelect: () => this.openBulkClose(false, { kind: "all", groupId: null }),
            });
            entries.push({
                render: (label) => i18n.bindText(label, "tabs.menu.closeNotContaining"),
                onSelect: () => this.openBulkClose(true, { kind: "all", groupId: null }),
            });

            menu.setEntries(entries);
            menu.reflow();
        };

        filter.addEventListener("input", rebuild);
        rebuild();
        menu.show();
        filter.focus();
    }

    // ---- actions -----------------------------------------------------------------------

    /**
     * Activate a page and make sure it is actually visible: a result inside a collapsed group
     * expands that group for as long as the visitor stays on the page, without overwriting
     * their saved collapsed preference.
     */
    reveal(tabId: string): void {
        const { model } = this.deps;
        if (!model.isOpen(tabId)) model.reopen(tabId);
        const group = model.groupOf(tabId);
        if (group !== null && group.collapsed) this.temporarilyRevealed.add(group.id);
        model.activate(tabId);
        this.render();
        document.getElementById(`tab-${tabId}`)?.focus();
    }

    private withActive(action: (id: string) => void): void {
        const id = this.deps.model.active;
        if (id !== null) action(id);
    }

    private togglePin(id: string): void {
        const { model, notifications } = this.deps;
        const next = !model.isPinned(id);
        model.setPinned(id, next);
        if (next) {
            notifications.notify({ title: { key: "tabs.pinnedNotice", vars: { label: model.label(id) } } });
        }
    }

    private closeTab(id: string): void {
        const { model, notifications } = this.deps;
        const label = model.label(id);
        if (!model.close(id)) return;
        notifications.notify({
            title: { key: "tabs.closedNotice", vars: { label } },
            actions: [
                {
                    label: { key: "tabs.reopen" },
                    onSelect: () => model.reopen(id),
                },
            ],
        });
    }

    private closeOthers(keepId: string): void {
        const { model } = this.deps;
        for (const id of model.openIds()) {
            if (id === keepId || model.isPinned(id)) continue;
            model.close(id);
        }
    }

    private closeToTheRight(fromId: string): void {
        const { model } = this.deps;
        const visible = model.segments().flatMap((segment) => (segment.kind === "tab" ? [segment.id] : segment.members));
        const index = visible.indexOf(fromId);
        if (index < 0) return;
        for (const id of visible.slice(index + 1)) {
            if (model.isPinned(id)) continue;
            model.close(id);
        }
    }

    private reopenLast(): void {
        const { model, notifications } = this.deps;
        const id = model.reopenLast();
        if (id === null) return;
        notifications.notify({ title: { text: model.label(id) } });
    }

    private openBulkClose(invert: boolean, scope: BulkCloseScope): void {
        const { i18n, model, notifications, regex } = this.deps;
        openBulkCloseDialog({ i18n, model, notifications, regex }, { invert, scope });
    }

    private dropOnto(dragId: string, targetId: string): void {
        const { model } = this.deps;
        if (model.isPinned(targetId)) {
            model.setPinned(dragId, true);
            const pinned = model.pinnedIds();
            model.movePinned(dragId, pinned.indexOf(targetId) - pinned.indexOf(dragId));
            return;
        }

        model.setPinned(dragId, false);
        const targetGroup = model.groupOf(targetId);
        model.setGroup(dragId, targetGroup?.id ?? null);

        if (targetGroup !== null) {
            const segment = model.segments().find((s) => s.kind === "group" && s.id === targetGroup.id);
            if (segment !== undefined && segment.kind === "group") {
                model.moveTab(dragId, segment.members.indexOf(targetId) - segment.members.indexOf(dragId));
            }
            return;
        }

        const segments = model.segments();
        const from = segments.findIndex((s) => s.kind === "tab" && s.id === dragId);
        const to = segments.findIndex((s) => s.kind === "tab" && s.id === targetId);
        if (from >= 0 && to >= 0) model.moveSegment(from, to - from);
    }

    private promptNewGroup(anchor: HTMLElement, tabId: string): void {
        const { i18n, model } = this.deps;
        this.promptText(anchor, "tabs.group.namePrompt", i18n.t("tabs.group.defaultName", { number: model.nextGroupNumber() }), (name) => {
            const groupId = model.createGroup(name);
            model.setPinned(tabId, false);
            model.setGroup(tabId, groupId);
        });
    }

    private promptRenameGroup(anchor: HTMLElement, groupId: string, current: string): void {
        this.promptText(anchor, "tabs.group.rename", current, (name) => this.deps.model.renameGroup(groupId, name));
    }

    /** A small anchored text prompt, so renaming never leaves the page for a browser dialog. */
    private promptText(anchor: HTMLElement, labelKey: StringKey, initial: string, onSubmit: (value: string) => void): void {
        const { i18n } = this.deps;
        const inputId = "tab-prompt-input";
        const label = el("label", { class: "md-field__label", attrs: { for: inputId } });
        i18n.bindText(label, labelKey);
        const input = el("input", {
            class: "md-field__input",
            attrs: { id: inputId, type: "text", value: initial, maxlength: "80", autocomplete: "off" },
        });
        const cancel = el("button", { class: "md-button md-button--text", attrs: { type: "button" } });
        i18n.bindText(cancel, "common.cancel");
        const apply = el("button", { class: "md-button md-button--filled", attrs: { type: "button" } });
        i18n.bindText(apply, "common.apply");

        const overlay = new Overlay(anchor, { label: i18n.t(labelKey), initialFocus: input, role: "dialog" });
        const panel = el(
            "div",
            { class: "tab-prompt" },
            label,
            input,
            el("div", { class: "md-dialog__actions" }, cancel, apply),
        );
        overlay.element.append(panel);

        const submit = (): void => {
            const value = input.value.trim();
            if (value.length === 0) return;
            onSubmit(value);
            overlay.close();
        };
        apply.addEventListener("click", submit);
        cancel.addEventListener("click", () => overlay.close());
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                submit();
            }
        });
        overlay.show();
        input.select();
    }

    // ---- keyboard -----------------------------------------------------------------------

    private onStripKeyDown(event: KeyboardEvent): void {
        const tabs = [...this.strip.querySelectorAll<HTMLElement>('[role="tab"]')].filter(
            (node) => node.offsetParent !== null,
        );
        if (tabs.length === 0) return;
        const current = tabs.findIndex((node) => node === document.activeElement);
        if (current < 0) return;

        let next = -1;
        if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        else if (event.key === "Delete") {
            const id = tabs[current]?.dataset.tabId;
            if (id !== undefined) {
                event.preventDefault();
                this.closeTab(id);
            }
            return;
        } else return;

        event.preventDefault();
        // Manual activation: arrows move focus, Enter or Space opens the page. Automatic
        // activation would draw every page the visitor arrows past.
        tabs[next]?.focus();
    }
}
