// @vitest-environment jsdom

/**
 * TEMPORARY repro-only test, written by a read-only reviewer to check a claimed leak.
 * Not part of the suite; delete after use.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import TabbedNavigation from "./TabbedNavigation.vue";
import type { TabPage } from "./tabModel.js";

const cells = new Map<string, string>();

beforeAll(() => {
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

// A saved layout with a real group ("Alpha") so the "no match" empty state is
// distinguishable from the honest "no groups yet" empty state.
const SAVED_LAYOUT = JSON.stringify({
    version: 1,
    strips: [
        {
            id: "s1",
            windowId: "w1",
            tabs: [
                { id: "t-map", pageId: "map", label: "Map" },
                { id: "t-world", pageId: "world", label: "Make a map" },
                { id: "t-servers", pageId: "servers", label: "Servers" },
            ],
            pinnedOrder: [],
            groups: [
                { id: "g1", name: "Alpha", color: "primary", collapsed: false, tabIds: ["t-world"] },
            ],
            slots: [
                { kind: "tab", tabId: "t-map" },
                { kind: "group", groupId: "g1" },
                { kind: "tab", tabId: "t-servers" },
            ],
            activeTabId: "t-map",
        },
    ],
});

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

const tabs = (view: VueWrapper<InstanceType<typeof Host>>) => view.findAll('[role="tab"]');

async function openGroupPickerFor(view: VueWrapper<InstanceType<typeof Host>>, index: number): Promise<void> {
    await tabs(view)[index]?.trigger("contextmenu");
    await nextTick();
    const items = view.findAll(".mb-tabs-menu__item, [class*='v-list-item']").filter((el) =>
        el.text().includes("Move this tab into group..."),
    );
    expect(items.length).toBeGreaterThan(0);
    await items[0]?.trigger("click");
    await nextTick();
}

describe("REPRO: group picker search leak", () => {
    it("leaks the search query across close/reopen, even onto a different tab", async () => {
        cells.set("material-bluemap-tabs", SAVED_LAYOUT);
        const view = open();
        await nextTick();

        // Open the picker on "Map", search for something that matches nothing.
        await openGroupPickerFor(view, 0);
        expect(document.body.textContent).toContain("Alpha"); // sanity: the group is really there before the search
        const input = document.querySelector('input[type="text"]') as HTMLInputElement | null;
        expect(input).not.toBeNull();
        input!.value = "zzz-no-match";
        input!.dispatchEvent(new Event("input"));
        await nextTick();
        expect(document.body.textContent).toContain("No group's name matches that search");

        // Escape closes it (cancel path).
        const dialog = document.querySelector('[role="dialog"]');
        dialog?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await nextTick();

        // Reopen on the SAME tab ("Map").
        await openGroupPickerFor(view, 0);
        const reopenedInput = document.querySelector('input[type="text"]') as HTMLInputElement | null;
        console.log("REOPEN SAME TAB — input value:", JSON.stringify(reopenedInput?.value));
        console.log("REOPEN SAME TAB — body contains 'Alpha':", document.body.textContent?.includes("Alpha"));
        console.log(
            "REOPEN SAME TAB — body contains no-match message:",
            document.body.textContent?.includes("No group's name matches that search"),
        );

        // Close again, reopen on a DIFFERENT tab ("Servers").
        const dialog2 = document.querySelector('[role="dialog"]');
        dialog2?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await nextTick();

        await openGroupPickerFor(view, 2); // "Servers"
        const reopenedInput2 = document.querySelector('input[type="text"]') as HTMLInputElement | null;
        console.log("REOPEN DIFFERENT TAB — input value:", JSON.stringify(reopenedInput2?.value));
        console.log("REOPEN DIFFERENT TAB — body contains 'Alpha':", document.body.textContent?.includes("Alpha"));
        console.log(
            "REOPEN DIFFERENT TAB — body contains no-match message:",
            document.body.textContent?.includes("No group's name matches that search"),
        );

        wrapper?.unmount();
        wrapper = null;
    });
});
