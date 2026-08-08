// @vitest-environment jsdom

/**
 * The tab panel's arrival transition, mounted - the half `motion.test.ts` cannot see.
 *
 * `motion.test.ts` reads the stylesheet and the template as source, which is the only way to
 * assert what a rule *says*, because jsdom attaches no stylesheet and computes no layout.
 * What it cannot answer is what wrapping the panel in a `<Transition>` did to the component:
 * whether a page is still rendered the moment its tab is chosen, whether the transition ever
 * leaves two panels on screen, and whether it quietly started tearing down and rebuilding a
 * page that two tabs happen to share. All three are behaviour, and this is presentation-only
 * work - so all three have to be exactly what they were before the transition existed.
 *
 * The accessibility half is asserted as a property of the wiring rather than of a computed
 * style: the transition is driven by CSS classes and nothing else - no JS hooks, no
 * `:css="false"` - so `styles/motion.scss`'s `prefers-reduced-motion: reduce` block, which
 * turns those exact classes off, is the only thing deciding whether it animates. A
 * JS-animated transition would ignore the media query entirely, which is the defect this
 * project treats as a completion blocker; the assertion below is what stops one being
 * introduced later.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import TabbedNavigation from "./TabbedNavigation.vue";
// The strip's own shipped source, for the layout assertions at the bottom of this file.
import stripSource from "./TabStrip.vue?raw";
import { addTab, setActiveTab, type TabPage, type TabStripState } from "./tabModel.js";
import { DEFAULT_TAB_STORAGE_KEY, writeTabWorkspace } from "./tabStorage.js";

const cells = new Map<string, string>();

beforeAll(() => {
    // Same jsdom gaps `TabbedNavigation.test.ts` fills, for the same reasons: Vuetify's
    // overlays observe their own size, and this jsdom has no storage at all.
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
];

/** How many times each page's slot has been built from scratch since the last reset. */
const mounts = ref<Record<string, number>>({});

/** A page that counts its own mounts, so a remount cannot hide behind identical markup. */
function page(id: string) {
    return defineComponent({
        name: `Page-${id}`,
        setup() {
            mounts.value = { ...mounts.value, [id]: (mounts.value[id] ?? 0) + 1 };
            const pressed = ref(0);
            return () =>
                h("div", { class: `page-${id}` }, [
                    h(
                        "button",
                        {
                            type: "button",
                            class: `press-${id}`,
                            onClick: () => {
                                pressed.value += 1;
                            },
                        },
                        `pressed ${pressed.value}`,
                    ),
                ]);
        },
    });
}

const MapPage = page("map");
const WorldPage = page("world");

const Host = defineComponent({
    setup() {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(
                        TabbedNavigation,
                        { pages: PAGES, windowLabel: "Worldlens", stripLabel: "Main" },
                        { map: () => h(MapPage), world: () => h(WorldPage) },
                    ),
                ],
            });
    },
});

let wrapper: VueWrapper<InstanceType<typeof Host>> | null = null;

function open(): VueWrapper<InstanceType<typeof Host>> {
    wrapper = mount(Host, {
        // Vue Test Utils stubs `<Transition>` by default, and a stubbed transition renders
        // its child straight through - no leave, no `out-in`, nothing to observe. This file
        // exists to observe exactly that, so the stub is turned off.
        global: {
            plugins: [vuetify, i18n],
            stubs: { transition: false, "transition-group": false },
        },
        attachTo: document.body,
    });
    return wrapper;
}

/** Lets Vue's transition machinery run its frame as well as its tick. */
async function settle(): Promise<void> {
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();
}

beforeEach(() => {
    cells.clear();
    mounts.value = {};
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

const tabs = (view: VueWrapper<InstanceType<typeof Host>>) => view.findAll('[role="tab"]');

describe("switching pages, with the arrival animated", () => {
    it("still renders exactly one panel, holding the page that was just chosen", async () => {
        const view = open();
        await settle();
        expect(view.find(".page-map").exists()).toBe(true);

        await tabs(view)[1]?.trigger("click");
        await settle();

        // `mode="out-in"` is what keeps this true. The default mode would have both pages in
        // the document for the length of the leave - and one of this application's pages
        // owns a map renderer.
        expect(view.findAll('[role="tabpanel"]')).toHaveLength(1);
        expect(view.find(".page-world").exists()).toBe(true);
        expect(view.find(".page-map").exists()).toBe(false);
    });

    it("hands the new page over ready to use, not after an animation has finished", async () => {
        const view = open();
        await settle();

        await tabs(view)[1]?.trigger("click");
        await settle();

        // The transition moves `opacity` and `transform` and touches nothing else. Nothing
        // is disabled, nothing is `inert`, nothing is covered: the first thing a person
        // clicks on the page they just opened has to work.
        const button = view.find(".press-world");
        expect(button.exists()).toBe(true);
        expect(button.attributes("disabled")).toBeUndefined();

        const panel = view.find('[role="tabpanel"]');
        expect(panel.attributes("inert")).toBeUndefined();
        expect(panel.attributes("aria-hidden")).toBeUndefined();
        expect(panel.attributes("style") ?? "").not.toMatch(/pointer-events:\s*none/);

        await button.trigger("click");
        expect(view.find(".press-world").text()).toBe("pressed 1");
    });

    it("keeps the panel named by the tab that selected it", async () => {
        const view = open();
        await settle();

        await tabs(view)[1]?.trigger("click");
        await settle();

        const panel = view.find('[role="tabpanel"]');
        const active = tabs(view).find((tab) => tab.attributes("aria-selected") === "true");
        expect(panel.attributes("aria-labelledby")).toBe(active?.attributes("id"));
        expect(active?.attributes("aria-controls")).toBe(panel.attributes("id"));
    });

    it("builds each page once per visit, exactly as it did before there was a transition", async () => {
        const view = open();
        await settle();
        expect(mounts.value["map"]).toBe(1);

        await tabs(view)[1]?.trigger("click");
        await settle();
        expect(mounts.value["world"]).toBe(1);
        expect(mounts.value["map"]).toBe(1);
    });
});

describe("two tabs showing one page", () => {
    /** A saved workspace with two tabs for `map`, which is what the strip allows. */
    function seedTwoMapTabs(): void {
        const empty: TabStripState = {
            id: "strip-main",
            label: "Main",
            windowId: "window-main",
            windowLabel: "This window",
            placement: "left",
            tabs: [],
            groups: [],
            pinnedOrder: [],
            slots: [],
            activeTabId: null,
        };
        let strip = addTab(empty, { pageId: "map", label: "Map", icon: null });
        strip = addTab(strip, { pageId: "map", label: "Map (2)", icon: null });
        const first = strip.tabs[0];
        writeTabWorkspace(
            { strips: [setActiveTab(strip, first?.id ?? "")] },
            undefined,
            DEFAULT_TAB_STORAGE_KEY,
        );
    }

    it("does not tear the page down and build it again when the two are swapped", async () => {
        // The transition is keyed by the *page*, not by the tab, for exactly this: a tab is
        // not a page, two tabs may name one, and switching between them has never been a
        // reason to lose whatever that page was holding. Keying on the tab would have made
        // the animation look right and quietly reset the page underneath it.
        seedTwoMapTabs();
        const view = open();
        await settle();
        expect(tabs(view)).toHaveLength(2);
        expect(mounts.value["map"]).toBe(1);

        await view.find(".press-map").trigger("click");
        expect(view.find(".press-map").text()).toBe("pressed 1");

        await tabs(view)[1]?.trigger("click");
        await settle();

        expect(mounts.value["map"]).toBe(1);
        expect(view.find(".press-map").text()).toBe("pressed 1");
    });
});

/* -------------------------------------------------------------------------- */
/* The group header row                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The stray "..." a real capture of the running application caught.
 *
 * A group in the strip renders three kinds of child: its disclosure button, the commands
 * menu beside it, and - once expanded - its tabs. A vertical strip turns
 * `.mb-tabs-strip__group` into a column so those tabs stack under the header, and that
 * column made no distinction between the menu button and a tab: the menu dropped onto a
 * full-width row of its own directly beneath the group name. Three seeded groups meant
 * three orphaned rows reading as bare ellipses, each spending 44px of strip height on
 * nothing, in the one placement this application actually ships as its default.
 *
 * No unit test could have seen it. The markup was valid, the button was labelled, every
 * tab assertion passed, and the defect existed only in how a flex column laid the pieces
 * out - which jsdom does not do at all. It took looking at the application.
 *
 * The header and its menu now share `.mb-tabs-strip__group-bar`, which is `row` in every
 * placement. Asserted on the shipped source, the way every other layout regression in this
 * package is: `vitest.config.ts` does not enable `test.css`, so no cascade is observable
 * from a mounted component here.
 */
describe("a group's header and its commands menu", () => {
    it("share one row that stays horizontal in every placement", () => {
        const rule = /\.mb-tabs-strip__group-bar\s*\{[^}]*\}/s.exec(stripSource)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("flex-direction: row");
        expect(rule).toContain("display: flex");
    });

    it("is the wrapper the menu button actually sits in, not a rule with no markup", () => {
        // The rule existing proves nothing if the template never uses the class - which is
        // exactly how a CSS fix rots after somebody edits the template around it.
        expect(stripSource).toContain('class="mb-tabs-strip__group-bar"');
        const bar = stripSource.indexOf('class="mb-tabs-strip__group-bar"');
        expect(bar).toBeGreaterThan(-1);

        // Searched from the wrapper forwards, not from the top of the file: `openGroupMenu`
        // is declared in the script block long before the template uses it, so a bare
        // indexOf would compare the wrapper against the function's own definition.
        const menu = stripSource.indexOf("openGroupMenu(", bar);
        const tabs = stripSource.indexOf("<TabButton", bar);
        expect(menu).toBeGreaterThan(bar);
        // The menu button is inside the header row; the group's tabs come after it, which
        // is what makes the wrapper a header rather than a box around the whole group.
        expect(tabs).toBeGreaterThan(menu);
    });

    it("lets a long group name take the room the menu button does not", () => {
        // Read from the header's own rule rather than from a `.mb-tabs-strip__group-bar > ...`
        // rule of its own. There was one, briefly, and it shadowed this class for
        // `projectSurfaceSizing.test.ts`, which reads the same class by name to check the
        // 44px touch target and silently began reading a rule with no size in it at all.
        // One rule per class is what keeps both checks honest.
        const rule = /^\.mb-tabs-strip__group-head\s*\{[^}]*\}/m.exec(stripSource)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("min-width: 0");
        expect(rule).toContain("flex: 1 1 auto");
        // The touch target the other suite guards, asserted here too so the two rules that
        // now share one block cannot be separated again without both files objecting.
        expect(rule).toContain("44px");
    });
});
