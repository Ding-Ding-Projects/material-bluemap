// @vitest-environment jsdom

/**
 * The tab shell, mounted.
 *
 * Everything asserted here is a property of the rendered component and could not
 * be checked any other way: that the strip really exposes `tablist`/`tab`/
 * `tabpanel`, that exactly one tab is really in the page's tab order, that the
 * arrow keys really move both focus and selection, that Delete really closes the
 * focused tab, that the panel really names the tab that selected it, and that a
 * layout really survives being torn down and mounted again. The ordering rules,
 * the four searches and the close plans are unit-tested next door against the
 * same functions this component calls; this file is the wiring, which is exactly
 * the part a green logic test cannot vouch for.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import AppearanceTarget from "../appearance/AppearanceTarget.vue";
import { appearanceTargets } from "../appearance/index.js";
import TabbedNavigation from "./TabbedNavigation.vue";
import type { TabPage } from "./tabModel.js";

const cells = new Map<string, string>();

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist. Vuetify's overlays
    // observe their own size and position against the visual viewport; without
    // them the mount throws before an assertion.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;

    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof globalThis.matchMedia;

    Element.prototype.scrollIntoView = function scrollIntoView(): void {};

    // Vuetify's reposition scroll strategy asks the document what is under a point, which
    // jsdom does not implement at all. Without this the overlay throws asynchronously, after
    // the assertion that opened it has already passed - see AppearanceTarget.test.ts, which
    // hit the same gap first.
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });

    // This jsdom starts without a storage file, so `localStorage` is genuinely
    // absent - which the shell itself handles by keeping the defaults and
    // writing nothing. The persistence test needs somewhere for the layout to
    // land, so a map-backed one is installed here.
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => {
                cells.set(key, value);
            },
            removeItem: (key: string) => {
                cells.delete(key);
            },
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

const vuetify = createVuetify();

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const PAGES: readonly TabPage[] = [
    { id: "map", label: "Map", icon: null },
    { id: "world", label: "Make a map", icon: null },
    { id: "servers", label: "Servers", icon: null },
];

/** The shell, near enough: the props App.vue binds and one slot per page. */
const Host = defineComponent({
    setup() {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(TabbedNavigation, { pages: PAGES, windowLabel: "Material BlueMap", stripLabel: "Main" }, {
                        map: () => h("p", { class: "page-map" }, "the map"),
                        world: () => h("p", { class: "page-world" }, "the wizard"),
                        servers: () => h("p", { class: "page-servers" }, "the servers"),
                    }),
                ],
            });
    },
});

let wrapper: VueWrapper<InstanceType<typeof Host>> | null = null;

function open(): VueWrapper<InstanceType<typeof Host>> {
    wrapper = mount(Host, { global: { plugins: [vuetify, i18n] }, attachTo: document.body });
    return wrapper;
}

beforeEach(() => {
    cells.clear();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

const tabs = (view: VueWrapper<InstanceType<typeof Host>>) => view.findAll('[role="tab"]');

describe("roles and structure", () => {
    it("draws one tablist and one tab per declared page", async () => {
        const view = open();
        await nextTick();

        expect(view.findAll('[role="tablist"]')).toHaveLength(1);
        expect(tabs(view).map((tab) => tab.attributes("title"))).toEqual(["Map", "Make a map", "Servers"]);
    });

    it("selects the first page, and only that tab claims the panel", async () => {
        const view = open();
        await nextTick();

        const selected = tabs(view).filter((tab) => tab.attributes("aria-selected") === "true");
        expect(selected).toHaveLength(1);
        expect(selected[0]?.attributes("title")).toBe("Map");

        const withControls = tabs(view).filter((tab) => tab.attributes("aria-controls") !== undefined);
        expect(withControls).toHaveLength(1);
        expect(withControls[0]?.attributes("aria-controls")).toBe(
            view.find('[role="tabpanel"]').attributes("id"),
        );
    });

    it("puts exactly one tab in the page's tab order", async () => {
        const view = open();
        await nextTick();

        expect(tabs(view).filter((tab) => tab.attributes("tabindex") === "0")).toHaveLength(1);
        expect(tabs(view).filter((tab) => tab.attributes("tabindex") === "-1")).toHaveLength(2);
    });

    it("names the panel by the tab that selected it", async () => {
        const view = open();
        await nextTick();

        const panel = view.find('[role="tabpanel"]');
        const active = tabs(view).find((tab) => tab.attributes("aria-selected") === "true");
        expect(panel.attributes("aria-labelledby")).toBe(active?.attributes("id"));
    });

    it("renders the active page's slot, and only that one", async () => {
        const view = open();
        await nextTick();

        expect(view.find(".page-map").exists()).toBe(true);
        expect(view.find(".page-world").exists()).toBe(false);
    });
});

describe("selecting", () => {
    it("moves selection, the panel and the tab order together on a click", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[1]?.trigger("click");
        await nextTick();

        const list = tabs(view);
        expect(list[1]?.attributes("aria-selected")).toBe("true");
        expect(list[0]?.attributes("aria-selected")).toBe("false");
        expect(list[1]?.attributes("tabindex")).toBe("0");
        expect(view.find(".page-world").exists()).toBe(true);
        expect(view.find(".page-map").exists()).toBe(false);
    });

    it("walks the strip with the arrow keys and stops at the ends", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("keydown", { key: "ArrowRight" });
        await nextTick();
        expect(tabs(view)[1]?.attributes("aria-selected")).toBe("true");

        await tabs(view)[1]?.trigger("keydown", { key: "ArrowLeft" });
        await nextTick();
        expect(tabs(view)[0]?.attributes("aria-selected")).toBe("true");

        // Clamped, not wrapped: the left edge nudged left again stays put.
        await tabs(view)[0]?.trigger("keydown", { key: "ArrowLeft" });
        await nextTick();
        expect(tabs(view)[0]?.attributes("aria-selected")).toBe("true");
    });

    it("jumps to the ends with Home and End", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("keydown", { key: "End" });
        await nextTick();
        expect(tabs(view)[2]?.attributes("aria-selected")).toBe("true");

        await tabs(view)[2]?.trigger("keydown", { key: "Home" });
        await nextTick();
        expect(tabs(view)[0]?.attributes("aria-selected")).toBe("true");
    });
});

describe("the keyboard commands the context menu advertises", () => {
    it("closes the focused tab on Delete", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[1]?.trigger("keydown", { key: "Delete" });
        await nextTick();

        expect(tabs(view).map((tab) => tab.attributes("title"))).toEqual(["Map", "Servers"]);
    });

    it("reorders the focused tab on the reorder chord, without moving the selection", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("keydown", { key: "ArrowRight", ctrlKey: true, shiftKey: true });
        await nextTick();

        const list = tabs(view);
        expect(list.map((tab) => tab.attributes("title"))).toEqual(["Make a map", "Map", "Servers"]);
        // The tab moved; what is selected did not.
        expect(list[1]?.attributes("aria-selected")).toBe("true");
    });

    it("leaves an honest empty state when the last tab closes", async () => {
        const view = open();
        await nextTick();

        for (const title of ["Map", "Make a map", "Servers"]) {
            const tab = tabs(view).find((candidate) => candidate.attributes("title") === title);
            await tab?.trigger("keydown", { key: "Delete" });
            await nextTick();
        }

        expect(tabs(view)).toHaveLength(0);
        expect(view.find('[role="tabpanel"]').exists()).toBe(false);
        expect(view.text()).toContain("Every tab is closed.");
    });
});

describe("the tab and group appearance editors", () => {
    it("registers every open tab as an appearance target the editor can be pointed at", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        open();
        await nextTick();

        const ids = appearanceTargets().value.map((entry) => entry.id);
        expect(ids).toContain("tab.t-map");
        expect(ids).toContain("tab.t-world");
        expect(ids).toContain("tab.t-servers");
    });

    it("lists Edit tab appearance... in the ordinary right-click menu", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("contextmenu");
        await nextTick();

        expect(document.body.textContent).toContain("Edit tab appearance...");
    });

    it("opens the anchored editor straight from a Shift+right-click on a tab", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("contextmenu", { shiftKey: true });
        await nextTick();

        expect(document.body.textContent).toContain("Appearance of Map");
    });

    it("opens the same editor from Ctrl+Shift+F10 on the focused tab", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("keydown", { key: "F10", shiftKey: true, ctrlKey: true });
        await nextTick();

        expect(document.body.textContent).toContain("Appearance of Map");
    });

    it("opens the group's own editor from a Shift+right-click on its header", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = open();
        await nextTick();

        const ids = appearanceTargets().value.map((entry) => entry.id);
        expect(ids).toContain("group.g1");

        await view.find('[aria-expanded="false"]').trigger("contextmenu", { shiftKey: true });
        await nextTick();

        expect(document.body.textContent).toContain("Appearance of Renders");
    });
});

/**
 * `TabStrip.vue` opens the ordinary tab menu, the tab's own appearance editor and the
 * "Move this tab into group..." picker as three separate anchored, non-modal overlays
 * (`:scrim="false"` `v-menu`s), each closing the *tab menu* when it opens - but until now
 * the appearance editor and the group picker never closed each other, and the tab menu
 * never closed either of them. Because a `contextmenu` event does not trigger Vuetify's
 * click-outside auto-close, nothing implicitly closed the sibling overlay either, so a
 * second right-click on the same tab could stack any pair of these three on top of one
 * another. These tests reproduce every pairing and assert exactly one overlay survives.
 */
describe("overlay exclusivity: the tab menu, the appearance editor and the group picker", () => {
    /** Finds a `TabMenuList` row by its exact visible label and clicks it. */
    function clickMenuItem(label: string): void {
        const row = [...document.querySelectorAll(".mb-tabs-menu__label")]
            .find((candidate) => candidate.textContent === label)
            ?.closest(".v-list-item");
        expect(row).toBeTruthy();
        row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    /**
     * Counts only instances of `selector` sitting inside a genuinely open `v-overlay`.
     * "Closed is `.v-overlay--active` gone, not the DOM node gone" (see the Escape tests
     * in the `app.tabBar` suite above): under jsdom the exit transition has no real CSS
     * duration to finish against, so a just-closed overlay's inert content node can still
     * be mounted a tick later even though it has genuinely closed. Scoping to the active
     * overlay is what makes "closed" and "still in the DOM" distinguishable here.
     */
    function activeCount(selector: string): number {
        return document.querySelectorAll(`.v-overlay--active ${selector}`).length;
    }

    it("closes the group picker when Shift+right-click opens the appearance editor on the same tab", async () => {
        const view = open();
        await nextTick();

        // Open the picker via the ordinary menu's "Move this tab into group..." row.
        await tabs(view)[0]?.trigger("contextmenu");
        await nextTick();
        clickMenuItem("Move this tab into group...");
        await nextTick();
        expect(activeCount(".mb-tab-group-picker")).toBe(1);

        // Shift+right-click the SAME tab: the direct route to the appearance editor.
        await tabs(view)[0]?.trigger("contextmenu", { shiftKey: true });
        await nextTick();

        expect(activeCount(".mb-appearance-editor")).toBe(1);
        // The picker this opened on top of must not still be showing underneath it.
        expect(activeCount(".mb-tab-group-picker")).toBe(0);
    });

    it("closes the appearance editor when the menu's group picker opens on the same tab", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("contextmenu", { shiftKey: true });
        await nextTick();
        expect(activeCount(".mb-appearance-editor")).toBe(1);

        await tabs(view)[0]?.trigger("contextmenu");
        await nextTick();
        clickMenuItem("Move this tab into group...");
        await nextTick();

        expect(activeCount(".mb-tab-group-picker")).toBe(1);
        // The appearance editor this opened on top of must not still be showing underneath it.
        expect(activeCount(".mb-appearance-editor")).toBe(0);
    });

    it("closes the group picker when a plain right-click reopens the ordinary tab menu on the same tab", async () => {
        const view = open();
        await nextTick();

        await tabs(view)[0]?.trigger("contextmenu");
        await nextTick();
        clickMenuItem("Move this tab into group...");
        await nextTick();
        expect(activeCount(".mb-tab-group-picker")).toBe(1);

        await tabs(view)[0]?.trigger("contextmenu");
        await nextTick();

        expect(activeCount(".mb-tabs-menu")).toBe(1);
        // The picker this reopened on top of must not still be showing underneath it.
        expect(activeCount(".mb-tab-group-picker")).toBe(0);
    });
});

/**
 * The user's words were "shift right click for appearance so it doesnt collide" -
 * `App.vue` wraps the whole strip in its own `<AppearanceTarget id="app.tabBar" ...>`,
 * and that wrapper binds the identical `contextmenu` and `ContextMenu`/`Shift+F10`/
 * `Ctrl+Shift+F10` gestures on its own root element. Before the stop-propagation fix in
 * `TabStrip.vue`, a right-click that started on an actual tab bubbled past the strip
 * unimpeded and fired the wrapper's handler too, so the same click opened two independent
 * `v-menu` overlays stacked at the same point - or, on Shift+right-click, opened both the
 * tab's own editor and the wrapper's editor.
 *
 * These tests reproduce that exact structure - a real `AppearanceTarget` around a real
 * `TabbedNavigation`, mirroring `App.vue`'s `app.tabBar` wrapping - without touching
 * `App.vue` itself, so they exercise the same collision the bug report describes.
 */
describe("the app.tabBar wrapper around the whole strip does not collide with a tab's own menu", () => {
    const WrappedHost = defineComponent({
        setup() {
            return () =>
                h(VApp, null, {
                    default: () => [
                        h(
                            AppearanceTarget,
                            { id: "app.tabBar", label: "Tab bar", as: "div" },
                            {
                                default: () =>
                                    h(
                                        TabbedNavigation,
                                        { pages: PAGES, windowLabel: "Material BlueMap", stripLabel: "Main" },
                                        {
                                            map: () => h("p", { class: "page-map" }, "the map"),
                                            world: () => h("p", { class: "page-world" }, "the wizard"),
                                            servers: () => h("p", { class: "page-servers" }, "the servers"),
                                        },
                                    ),
                            },
                        ),
                    ],
                });
        },
    });

    let wrapped: VueWrapper<InstanceType<typeof WrappedHost>> | null = null;

    function openWrapped(): VueWrapper<InstanceType<typeof WrappedHost>> {
        wrapped = mount(WrappedHost, { global: { plugins: [vuetify, i18n] }, attachTo: document.body });
        return wrapped;
    }

    afterEach(() => {
        wrapped?.unmount();
        wrapped = null;
        document.body.innerHTML = "";
    });

    /** The shortcut `<kbd>` on the one menu row whose visible label matches, not the first row with any shortcut. */
    function shortcutFor(label: string): string | null | undefined {
        const row = [...document.querySelectorAll(".mb-tabs-menu__label")]
            .find((candidate) => candidate.textContent === label)
            ?.closest(".v-list-item");
        return row?.querySelector(".mb-tabs-menu__keys")?.textContent;
    }

    it("registers both the tab and the wrapper as separate appearance targets", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        openWrapped();
        await nextTick();

        const ids = appearanceTargets().value.map((entry) => entry.id);
        expect(ids).toContain("app.tabBar");
        expect(ids).toContain("tab.t-map");
    });

    it("opens exactly one menu on an ordinary right-click on a tab, with the working shortcut shown", async () => {
        const view = openWrapped();
        await nextTick();

        const tabEl = view.findAll('[role="tab"]')[0];
        await tabEl?.trigger("contextmenu");
        await nextTick();

        // The tab's own menu, and only it: the wrapper's independent menu never opens.
        expect(document.querySelectorAll(".mb-tabs-menu")).toHaveLength(1);
        expect(document.querySelectorAll(".mb-appearance-target__menu")).toHaveLength(0);

        expect(document.body.textContent).toContain("Edit tab appearance...");
        // The displayed shortcut comes from the same registration `onTabKeydown` binds on
        // this very tab, per the menu-shortcut rule: never one that only fires elsewhere.
        expect(shortcutFor("Edit tab appearance...")).toBe("Ctrl+Shift+F10");
    });

    it("opens the tab's own editor directly on Shift+right-click, never the wrapper's editor too", async () => {
        const view = openWrapped();
        await nextTick();

        const tabEl = view.findAll('[role="tab"]')[0];
        await tabEl?.trigger("contextmenu", { shiftKey: true });
        await nextTick();

        // Straight to the editor: no menu in between, for either surface.
        expect(document.querySelectorAll(".mb-tabs-menu")).toHaveLength(0);
        expect(document.querySelectorAll(".mb-appearance-target__menu")).toHaveLength(0);

        expect(document.querySelectorAll(".mb-appearance-editor")).toHaveLength(1);
        expect(document.body.textContent).toContain("Appearance of Map");
        expect(document.body.textContent).not.toContain("Appearance of Tab bar");
    });

    it("opens the tab's own editor directly on Ctrl+Shift+F10, never the wrapper's editor too", async () => {
        const view = openWrapped();
        await nextTick();

        const tabEl = view.findAll('[role="tab"]')[0];
        await tabEl?.trigger("keydown", { key: "F10", shiftKey: true, ctrlKey: true });
        await nextTick();

        expect(document.querySelectorAll(".mb-appearance-editor")).toHaveLength(1);
        expect(document.body.textContent).toContain("Appearance of Map");
        expect(document.body.textContent).not.toContain("Appearance of Tab bar");
    });

    it("returns focus to the tab when its own menu closes on Escape", async () => {
        const view = openWrapped();
        await nextTick();

        const tabEl = view.findAll('[role="tab"]')[0];
        const domId = tabEl?.attributes("id");
        await tabEl?.trigger("contextmenu");
        await nextTick();
        expect(document.querySelectorAll(".mb-tabs-menu")).toHaveLength(1);

        // Two dispatches, matching AppearanceTarget.test.ts's own proven route: Vuetify's
        // overlay stack learns which overlay is "top" (and so allowed to act on Escape) from
        // a `setTimeout`-debounced recompute, so the first Escape can land before that settles
        // and only the second is guaranteed to be seen.
        tabEl?.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await nextTick();
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await nextTick();

        // Closed is `.v-overlay--active` gone, not the DOM node gone: under jsdom the exit
        // transition has no real CSS duration to finish against, so Vuetify can leave the
        // inert content node mounted a tick longer even once it has genuinely closed.
        expect(document.querySelectorAll(".v-overlay--active")).toHaveLength(0);
        expect(document.activeElement?.id).toBe(domId);
    });

    it("returns focus to the tab when its own editor closes on Escape", async () => {
        const view = openWrapped();
        await nextTick();

        const tabEl = view.findAll('[role="tab"]')[0];
        const domId = tabEl?.attributes("id");
        await tabEl?.trigger("contextmenu", { shiftKey: true });
        await nextTick();
        expect(document.querySelectorAll(".mb-appearance-editor")).toHaveLength(1);

        // Two dispatches, matching AppearanceTarget.test.ts's own proven route - see the
        // comment on the menu's own Escape test above for why one alone is not reliable.
        tabEl?.element.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await nextTick();
        await nextTick();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await nextTick();

        // Closed is `.v-overlay--active` gone, not the DOM node gone - see the comment on
        // the menu's own Escape test above for why.
        expect(document.querySelectorAll(".v-overlay--active")).toHaveLength(0);
        expect(document.activeElement?.id).toBe(domId);
    });

    it("still opens the wrapper's own menu for a right-click that is not on a tab or group", async () => {
        const view = openWrapped();
        await nextTick();

        // The wrapper's `.mb-appearance-target` root: genuine strip chrome, not a tab or a
        // group header, is exactly the case `TabStrip.vue`'s own docs say the wrapper still
        // owns - so this must keep working after the stop-propagation fix.
        const target = view.find(".mb-appearance-target");
        expect(target.exists()).toBe(true);

        target.element.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        await nextTick();

        expect(document.body.textContent).toContain("Edit appearance...");
    });

    it("group header: opens exactly one menu on right-click, with the working shortcut shown", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = openWrapped();
        await nextTick();

        const header = view.find('[aria-expanded="false"]');
        await header.trigger("contextmenu");
        await nextTick();

        expect(document.querySelectorAll(".mb-tabs-menu")).toHaveLength(1);
        expect(document.querySelectorAll(".mb-appearance-target__menu")).toHaveLength(0);
        expect(document.body.textContent).toContain("Edit group appearance...");
        expect(shortcutFor("Edit group appearance...")).toBe("Ctrl+Shift+F10");
    });

    it("group header: opens the group's own editor directly on Shift+right-click, never the wrapper's too", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = openWrapped();
        await nextTick();

        const header = view.find('[aria-expanded="false"]');
        await header.trigger("contextmenu", { shiftKey: true });
        await nextTick();

        expect(document.querySelectorAll(".mb-tabs-menu")).toHaveLength(0);
        expect(document.querySelectorAll(".mb-appearance-editor")).toHaveLength(1);
        expect(document.body.textContent).toContain("Appearance of Renders");
        expect(document.body.textContent).not.toContain("Appearance of Tab bar");
    });
});

/** A saved layout: one pinned tab, and a collapsed group holding the other two. */
const SAVED_LAYOUT = JSON.stringify({
    version: 1,
    strips: [
        {
            id: "strip-main",
            label: "Main",
            windowId: "window-main",
            windowLabel: "Material BlueMap",
            tabs: [
                { id: "t-map", pageId: "map", label: "Map" },
                { id: "t-world", pageId: "world", label: "Make a map" },
                { id: "t-servers", pageId: "servers", label: "Servers" },
            ],
            groups: [
                {
                    id: "g1",
                    name: "Renders",
                    color: "tertiary",
                    collapsed: true,
                    tabIds: ["t-world", "t-servers"],
                },
            ],
            pinnedOrder: ["t-map"],
            slots: [{ kind: "group", groupId: "g1" }],
            activeTabId: "t-map",
        },
    ],
});

describe("pinned tabs and collapsed groups, as drawn", () => {
    it("keeps a compact pinned tab's full name for assistive technology", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = open();
        await nextTick();

        const pinnedTab = tabs(view).find((tab) => tab.attributes("title") === "Map");
        expect(pinnedTab?.attributes("aria-label")).toBe("Map, pinned");
        // Compact means no visible text, never a missing accessible name.
        expect(pinnedTab?.text()).toBe("");
    });

    it("draws a collapsed group as a header with its name, count and state", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = open();
        await nextTick();

        const header = view.find('[aria-expanded="false"]');
        expect(header.exists()).toBe(true);
        expect(header.attributes("aria-label")).toBe("Renders, 2 tabs");
    });

    it("keeps a collapsed group's members out of the focus order but not out of the strip", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = open();
        await nextTick();

        // Only the pinned tab is drawn, so only it can take focus.
        expect(tabs(view).map((tab) => tab.attributes("title"))).toEqual(["Map"]);

        // The searchable tab list still knows about all three. It is read off the
        // document rather than the wrapper because Vuetify teleports overlay
        // content out of the component's own tree.
        expect(document.body.textContent).toContain("Showing 3 of 3");
    });

    it("expands the group on its header, and writes that preference", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = open();
        await nextTick();

        await view.find('[aria-expanded="false"]').trigger("click");
        await nextTick();

        expect(tabs(view).map((tab) => tab.attributes("title"))).toEqual(["Map", "Make a map", "Servers"]);
        expect(cells.get("material-bluemap-tabs")).toContain('"collapsed":false');
    });
});

describe("persistence", () => {
    it("writes the layout and reads it back on the next mount", async () => {
        const first = open();
        await nextTick();

        await tabs(first)[2]?.trigger("click");
        await nextTick();
        await tabs(first)[0]?.trigger("keydown", { key: "Delete" });
        await nextTick();

        expect(cells.get("material-bluemap-tabs")).toBeDefined();

        first.unmount();
        wrapper = null;

        const second = open();
        await nextTick();

        expect(tabs(second).map((tab) => tab.attributes("title"))).toEqual(["Make a map", "Servers"]);
        const selected = tabs(second).find((tab) => tab.attributes("aria-selected") === "true");
        expect(selected?.attributes("title")).toBe("Servers");
    });

    it("seeds the defaults rather than half-restoring a file it cannot read", async () => {
        cells.set("material-bluemap-tabs", '{"version":1,"strips":[{');

        const view = open();
        await nextTick();

        expect(tabs(view).map((tab) => tab.attributes("title"))).toEqual(["Map", "Make a map", "Servers"]);
    });
});

/**
 * A second host, mounting `TabbedNavigation` directly rather than through `Host`, so a
 * test can reach `revealPage` and `renamePage` off its own component instance the way
 * `App.vue` and every settings-style surface built on top of this component do.
 */
function openDirect(): VueWrapper<InstanceType<typeof TabbedNavigation>> {
    const direct = mount(TabbedNavigation, {
        props: { pages: PAGES, windowLabel: "Material BlueMap", stripLabel: "Main", storageKey: "test-direct-tabs" },
        slots: {
            map: () => h("p", { class: "page-map" }, "the map"),
            world: () => h("p", { class: "page-world" }, "the wizard"),
            servers: () => h("p", { class: "page-servers" }, "the servers"),
        },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    });
    return direct;
}

describe("the host API: revealPage and renamePage", () => {
    it("revealPage activates an existing tab rather than opening a duplicate", async () => {
        const view = openDirect();
        await nextTick();

        expect(tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>)).toHaveLength(3);

        view.vm.revealPage("servers");
        await nextTick();

        const rows = tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>);
        expect(rows).toHaveLength(3);
        expect(rows.find((tab) => tab.attributes("aria-selected") === "true")?.attributes("title")).toBe("Servers");
        view.unmount();
    });

    it("revealPage opens the page when every one of its tabs was closed", async () => {
        const view = openDirect();
        await nextTick();

        await tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>)[2]?.trigger("keydown", {
            key: "Delete",
        });
        await nextTick();
        expect(tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>)).toHaveLength(2);

        view.vm.revealPage("servers");
        await nextTick();

        const rows = tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>);
        expect(rows).toHaveLength(3);
        expect(rows.find((tab) => tab.attributes("aria-selected") === "true")?.attributes("title")).toBe("Servers");
        view.unmount();
    });

    it("renamePage relabels every tab already showing that page, not merely the active one", async () => {
        const view = openDirect();
        await nextTick();

        view.vm.renamePage("servers", "Servers (3)");
        await nextTick();

        const rows = tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>);
        expect(rows.map((tab) => tab.attributes("title"))).toEqual(["Map", "Make a map", "Servers (3)"]);
        view.unmount();
    });

    it("renamePage does nothing when no open tab shows that page", async () => {
        const view = openDirect();
        await nextTick();

        view.vm.renamePage("no-such-page", "Ignored");
        await nextTick();

        const rows = tabs(view as unknown as VueWrapper<InstanceType<typeof Host>>);
        expect(rows.map((tab) => tab.attributes("title"))).toEqual(["Map", "Make a map", "Servers"]);
        view.unmount();
    });
});

/**
 * The new-tab picker's own search field, mounted.
 *
 * It used to be a bare fixed `v-list` of the pages this shell can show -- the last context
 * menu in this application without a search field of its own. This proves the fix actually
 * filters, rather than trusting `menuCoverage.test.ts`'s source grep alone.
 */
describe("the new-tab picker's search field", () => {
    async function settle(): Promise<void> {
        for (let index = 0; index < 4; index++) {
            await nextTick();
            await Promise.resolve();
        }
    }

    async function openNewTabPicker(view: VueWrapper<InstanceType<typeof Host>>): Promise<void> {
        const button = view.find('[aria-label="Open a new tab"]');
        expect(button.exists()).toBe(true);
        await button.trigger("click");
        await settle();
    }

    function newTabSearch(): HTMLInputElement {
        // Vuetify teleports the popup content out of the component's own tree, so this is
        // read off the document, the same way the searchable tab list is read elsewhere in
        // this file.
        const input = document.querySelector<HTMLInputElement>(".mb-tabs-strip__menu-filter input[type='text']");
        if (input === null) throw new Error("no search field rendered inside the new-tab picker");
        return input;
    }

    it("carries a search field once opened, with every page listed", async () => {
        const view = open();
        await nextTick();
        await openNewTabPicker(view);

        expect(newTabSearch()).toBeDefined();
        for (const label of ["Map", "Make a map", "Servers"]) {
            expect(document.body.textContent).toContain(label);
        }
    });

    it("narrows the pages as the search is typed", async () => {
        const view = open();
        await nextTick();
        await openNewTabPicker(view);

        const search = newTabSearch();
        search.value = "Servers";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        const rows = [...document.querySelectorAll(".mb-tabs-strip__sheet .v-list-item")].map(
            (row) => row.textContent ?? "",
        );
        expect(rows.some((text) => text.includes("Servers"))).toBe(true);
        expect(rows.every((text) => !text.includes("Map"))).toBe(true);
    });

    it("shows the honest no-match state when nothing survives the filter", async () => {
        const view = open();
        await nextTick();
        await openNewTabPicker(view);

        const search = newTabSearch();
        search.value = "nothing here is named that";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(document.body.textContent).toContain("No command here matches that");
    });

    it("clicking a filtered page still opens it", async () => {
        const view = open();
        await nextTick();
        await openNewTabPicker(view);

        const search = newTabSearch();
        search.value = "Servers";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        const row = [...document.querySelectorAll(".mb-tabs-strip__sheet .v-list-item")].find((element) =>
            (element.textContent ?? "").includes("Servers"),
        );
        expect(row).toBeDefined();
        row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        expect(tabs(view).map((tab) => tab.attributes("title"))).toEqual(["Map", "Make a map", "Servers", "Servers"]);
    });
});
