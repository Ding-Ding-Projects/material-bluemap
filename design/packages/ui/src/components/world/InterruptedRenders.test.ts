// @vitest-environment jsdom

/**
 * The unfinished-render list, and the regex builder anchored to its search bar.
 *
 * This list is the one place in the app that holds work nobody can get back any other
 * way: hours of rendering, offered until somebody accepts or declines it. On a machine
 * that renders several worlds it grows, and it is scanned by name. So it gets a search
 * bar with its own builder, and this file proves the builder is genuinely this field's
 * rather than one borrowed from elsewhere on the page: the activator is found inside the
 * field's own subtree, and the pattern typed into it filters this list.
 *
 * Two assertions are here because the failure they catch is quiet rather than loud. A
 * query that matches nothing must not take the search bar off screen with the cards,
 * because then there is nothing left to clear and it reads as the offers having been
 * lost. And a card that is filtered out is filtered out, not dismissed: nothing on this
 * surface may make an offer disappear for good except the button that says so.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import InterruptedRenders from "./InterruptedRenders.vue";
import type { ResumeOffers } from "./resumeOffers.js";
import type { InterruptedRenderSummary } from "./worldBridge.js";

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

    // Vuetify's overlay placement reads `visualViewport` without guarding it, and jsdom
    // does not define it. The reference error is thrown inside a watcher, so the menu's
    // model flips and the card never appears: the builder looks broken when it is not.
    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
});

afterEach(() => {
    document.body.innerHTML = "";
});

function offer(renderId: string, mapName: string, message: string): InterruptedRenderSummary {
    return {
        renderId,
        reason: "process-gone",
        maps: [{ id: mapName, name: mapName, world: "/srv/world", dimension: `minecraft:${mapName}` }],
        startedAt: "2026-08-02T09:14:00.000Z",
        interruptedAt: "2026-08-02T11:02:00.000Z",
        percent: 41,
        description: null,
        engine: "BlueMap 5.22",
        message,
    };
}

const OFFERS: readonly InterruptedRenderSummary[] = [
    offer("render-a", "overworld", "The render process ended before it finished."),
    offer("render-b", "the_nether", "The render process ended before it finished."),
    offer("render-c", "the_end", "The app closed while this render was running."),
];

/** Just enough of the real interface for the component, with no bridge behind it. */
function fakeOffers(): ResumeOffers {
    return {
        offers: ref(OFFERS),
        active: ref([]),
        loading: ref(false),
        failure: ref(null),
        refusals: ref({}),
        busy: ref(null),
        available: true,
        load: async () => {},
        resume: async () => null,
        dismiss: async () => true,
    };
}

const vuetify = createVuetify();

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

/** `VApp` renders the overlay container the anchored builder is teleported into. */
const Host = defineComponent({
    setup() {
        const offers = fakeOffers();
        return () => h(VApp, null, { default: () => [h(InterruptedRenders, { offers })] });
    },
});

function render(): VueWrapper {
    return mount(Host, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n()] },
    }) as unknown as VueWrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/** The map names on the cards currently rendered, which is what filtering has to move. */
function cards(wrapper: VueWrapper): string[] {
    return wrapper.findAll(".mb-world-resume__head").map((node) => node.text());
}

function searchInput(wrapper: VueWrapper) {
    return wrapper.get(".mb-world-resume__search .mb-config-search input");
}

/** Opens the builder from this list's own activator and returns its pattern editor. */
async function openBuilder(wrapper: VueWrapper): Promise<HTMLTextAreaElement> {
    // Vuetify binds the activator's click handler a tick after mount, from a post-flush
    // watcher. Clicking sooner hits a button with no listener yet and nothing happens.
    await settle();

    const activator = wrapper.get('.mb-world-resume__search [aria-label="Open the regex builder"]');
    expect(activator.attributes("aria-expanded")).toBe("false");

    await activator.trigger("click");
    await settle();

    const editor = document.querySelector<HTMLTextAreaElement>(".mb-config-regex__pattern textarea");
    if (editor === null) throw new Error("the builder did not open from this field");
    return editor;
}

async function type(element: HTMLTextAreaElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event("input"));
    await settle();
}

describe("the search bar this list carries", () => {
    it("is the shared settings field, with its own builder anchored to it", async () => {
        const wrapper = render();
        await settle();

        expect(wrapper.find(".mb-world-resume__search .mb-config-search").exists()).toBe(true);
        expect(
            wrapper.find('.mb-world-resume__search [aria-label="Open the regex builder"]').exists(),
        ).toBe(true);

        wrapper.unmount();
    });

    it("offers every unfinished render until somebody types", async () => {
        const wrapper = render();
        await settle();

        expect(cards(wrapper)).toHaveLength(3);
        expect(wrapper.text()).not.toContain("Showing");

        wrapper.unmount();
    });

    it("filters to the render being looked for, and says how much it is hiding", async () => {
        const wrapper = render();
        await settle();

        await searchInput(wrapper).setValue("nether");
        await settle();

        expect(cards(wrapper)).toHaveLength(1);
        expect(cards(wrapper)[0]).toContain("the_nether");
        expect(wrapper.text()).toContain("Showing 1 of 3");

        wrapper.unmount();
    });

    it("treats a pattern-shaped query literally until regex is turned on", async () => {
        const wrapper = render();
        await settle();

        await searchInput(wrapper).setValue("the_.*");
        await settle();

        expect(cards(wrapper)).toHaveLength(0);

        wrapper.unmount();
    });

    it("keeps the search bar on screen when nothing matches, so it can be cleared", async () => {
        const wrapper = render();
        await settle();

        await searchInput(wrapper).setValue("kubernetes");
        await settle();

        expect(cards(wrapper)).toHaveLength(0);
        expect(wrapper.text()).toContain("No unfinished render matches that search");
        expect(wrapper.find(".mb-world-resume__search .mb-config-search").exists()).toBe(true);

        // Filtering hid them; it did not decline them. Clearing brings all three back.
        await searchInput(wrapper).setValue("");
        await settle();
        expect(cards(wrapper)).toHaveLength(3);

        wrapper.unmount();
    });
});

describe("the builder, opened from this field", () => {
    it("applies its pattern to this list, and turns regex on by doing so", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "^the_(nether|end)$");

        expect((searchInput(wrapper).element as HTMLInputElement).value).toBe("^the_(nether|end)$");
        expect(cards(wrapper)).toHaveLength(2);
        expect(
            wrapper
                .get('.mb-world-resume__search [aria-label="Search plain text instead of a regular expression"]')
                .attributes("aria-pressed"),
        ).toBe("true");

        wrapper.unmount();
    });

    it("gives focus back to the field it belongs to when it closes", async () => {
        const wrapper = render();
        await openBuilder(wrapper);

        const activator = wrapper.get('.mb-world-resume__search [aria-label="Open the regex builder"]');
        await activator.trigger("click");
        await settle();

        expect(document.activeElement).toBe(searchInput(wrapper).element);

        wrapper.unmount();
    });

    it("shows an unusable pattern as the error it is rather than running a stale one", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "overworld");
        expect(cards(wrapper)).toHaveLength(1);

        await type(editor, "overworld(");
        expect(cards(wrapper)).toHaveLength(0);
        expect(wrapper.get(".mb-world-resume__search .mb-config-search").text()).toContain(
            "Unterminated group",
        );

        wrapper.unmount();
    });
});
