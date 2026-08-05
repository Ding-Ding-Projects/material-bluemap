// @vitest-environment jsdom

/**
 * The release asset list, and the regex builder anchored to its search bar.
 *
 * The contract this file defends is not "a builder exists somewhere in the app". It is
 * that *this field* has one, that opening it from here writes back into here, and that
 * the pattern it produces filters this list rather than some other. So every assertion
 * goes through the rendered DOM of this component: the activator is found inside this
 * field's own subtree, the pattern is typed into the builder that opened from it, and the
 * result is read off the list of file names on screen.
 *
 * The plain-text default gets its own test for the same reason it exists: a query that
 * happens to look like a pattern must be matched literally until somebody deliberately
 * turns regex on. A search bar that quietly reinterprets what was typed is the failure
 * mode the contract calls out by name.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import ReleaseAssetList from "./ReleaseAssetList.vue";
import type { DiscoveredRelease } from "./downloadBridge.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays both observe their
    // own size. Without these the mount throws before any assertion runs.
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

    /*
     * This one is the difference between a builder that opens in a test and one that
     * looks broken. Vuetify positions an overlay through a location strategy that reads
     * `visualViewport` unguarded, and jsdom does not define it. The reference is thrown
     * inside a Vue watcher, so nothing surfaces: the menu's model flips, the effect
     * throws on its way to placing the card, and the click appears to have done nothing
     * at all. Every anchored-overlay test in this package needs this stub, and the
     * symptom without it gives no hint of the cause.
     */
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

/**
 * A release with names that are long, similar and differ in the middle, which is the
 * shape that makes this list worth searching at all.
 */
const RELEASE: DiscoveredRelease = {
    tag: "v1.4.0",
    name: "Har Gow",
    htmlUrl: "https://github.com/owner/repo/releases/tag/v1.4.0",
    downloads: [
        { name: "overworld-1.20-hires.zip", split: true, parts: 3, bytes: 4_030_000_000 },
        { name: "overworld-1.21-hires.zip", split: true, parts: 3, bytes: 4_120_000_000 },
        { name: "the-nether-1.21-lowres.zip", split: false, parts: 1, bytes: 610_000_000 },
        { name: "map-only-1.21.zip", split: false, parts: 1, bytes: 88_000_000 },
    ],
};

const vuetify = createVuetify();

/** The options `i18n.ts` ships: no messages, so every key falls back to its English. */
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

/**
 * Wrapped in `VApp` and attached to the document.
 *
 * Both are load-bearing rather than ceremony. The builder is a Vuetify menu, whose
 * content is teleported into the overlay container that `VApp` renders; without the
 * wrapper there is no container, and the builder opens into nowhere. Testing it any
 * other way would test a builder that is not the one the application mounts.
 */
const Host = defineComponent({
    setup() {
        return () =>
            h(VApp, null, {
                default: () => [h(ReleaseAssetList, { release: RELEASE, starting: [], active: [] })],
            });
    },
});

function render(): VueWrapper {
    return mount(Host, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n()] },
    }) as unknown as VueWrapper;
}

afterEach(() => {
    document.body.innerHTML = "";
});

/** The overlay opens across several ticks: the activator, the transition and the content. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

/** The asset names currently on screen, which is what "filtered" has to be read from. */
function names(wrapper: VueWrapper): string[] {
    return wrapper.findAll(".mb-release-assets__name").map((node) => node.text());
}

/** This field's own input, found inside this field rather than anywhere on the page. */
function searchInput(wrapper: VueWrapper) {
    return wrapper.get(".mb-release-assets__search .mb-config-search input");
}

/**
 * Opens the builder from this field's own activator and returns the pattern editor.
 *
 * The activator is looked up inside `.mb-release-assets__search`, so a builder belonging
 * to some other search bar on some other surface could not satisfy this test.
 */
async function openBuilder(wrapper: VueWrapper): Promise<HTMLTextAreaElement> {
    // Vuetify binds the activator's click handler from a post-flush watcher, one tick
    // after mount. Clicking before that lands hits a button with no listener on it yet,
    // and the menu silently does not open - which looks exactly like a broken builder.
    await settle();

    const activator = wrapper.get(
        '.mb-release-assets__search [aria-label="Open the regex builder"]',
    );
    expect(activator.attributes("aria-expanded")).toBe("false");

    await activator.trigger("click");
    await settle();

    const editor = document.querySelector<HTMLTextAreaElement>(".mb-config-regex__pattern textarea");
    if (editor === null) throw new Error("the builder did not open from this field");
    return editor;
}

/** Types into a real DOM node the builder owns, the way somebody would. */
async function type(element: HTMLTextAreaElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event("input"));
    await settle();
}

describe("the search bar this list carries", () => {
    it("is the shared settings field, with its own builder anchored to it", () => {
        const wrapper = render();

        expect(wrapper.find(".mb-release-assets__search .mb-config-search").exists()).toBe(true);
        expect(
            wrapper.find('.mb-release-assets__search [aria-label="Open the regex builder"]').exists(),
        ).toBe(true);
        expect(
            wrapper
                .find('.mb-release-assets__search [aria-label="Search with a regular expression"]')
                .exists(),
        ).toBe(true);

        wrapper.unmount();
    });

    it("shows every file until somebody types, and says nothing about filtering", () => {
        const wrapper = render();

        expect(names(wrapper)).toHaveLength(4);
        expect(wrapper.text()).not.toContain("Showing");

        wrapper.unmount();
    });

    it("filters the list down and says honestly how much it is hiding", async () => {
        const wrapper = render();

        await searchInput(wrapper).setValue("nether");
        await nextTick();

        expect(names(wrapper)).toEqual(["the-nether-1.21-lowres.zip"]);
        expect(wrapper.text()).toContain("Showing 1 of 4");

        wrapper.unmount();
    });

    it("matches without regard to case, which is what plain text means here", async () => {
        const wrapper = render();

        await searchInput(wrapper).setValue("OVERWORLD");
        await nextTick();

        expect(names(wrapper)).toHaveLength(2);

        wrapper.unmount();
    });

    it("treats a pattern-shaped query literally until regex is turned on", async () => {
        const wrapper = render();

        // In regex mode this matches every name. Plain text is the default, so it must
        // match none of them: there is no file with a full stop and a star in its name.
        await searchInput(wrapper).setValue(".*");
        await nextTick();

        expect(names(wrapper)).toHaveLength(0);
        expect(wrapper.text()).toContain("No file in this release matches that search");

        wrapper.unmount();
    });

    it("says plainly that nothing matched rather than showing an empty list", async () => {
        const wrapper = render();

        await searchInput(wrapper).setValue("kubernetes");
        await nextTick();

        expect(names(wrapper)).toHaveLength(0);
        expect(wrapper.text()).toContain("No file in this release matches that search");
        // The field is still there to be cleared: an empty result must never take the way
        // back out with it.
        expect(wrapper.find(".mb-release-assets__search .mb-config-search").exists()).toBe(true);

        wrapper.unmount();
    });
});

describe("the builder, opened from this field", () => {
    it("opens from this field's own activator and reports itself expanded", async () => {
        const wrapper = render();
        await openBuilder(wrapper);

        expect(
            wrapper
                .get('.mb-release-assets__search [aria-label="Open the regex builder"]')
                .attributes("aria-expanded"),
        ).toBe("true");
        expect(document.querySelector(".mb-config-regex")?.getAttribute("role")).toBe("dialog");

        wrapper.unmount();
    });

    it("applies its pattern to this field's search, and turns regex on by doing so", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "^overworld-1\\.21");

        expect((searchInput(wrapper).element as HTMLInputElement).value).toBe("^overworld-1\\.21");
        expect(names(wrapper)).toEqual(["overworld-1.21-hires.zip"]);
        expect(
            wrapper
                .get('.mb-release-assets__search [aria-label="Search plain text instead of a regular expression"]')
                .attributes("aria-pressed"),
        ).toBe("true");

        wrapper.unmount();
    });

    it("states the engine and the limits, rather than leaving the dialect to be guessed", async () => {
        const wrapper = render();
        await openBuilder(wrapper);

        const card = document.querySelector(".mb-config-regex")?.textContent ?? "";
        expect(card).toContain("ECMAScript RegExp");
        expect(card).toContain("Limits:");

        wrapper.unmount();
    });

    it("keeps an invalid pattern visible instead of running the last one that compiled", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "overworld");
        expect(names(wrapper)).toHaveLength(2);

        await type(editor, "overworld(");
        // Nothing matches an unusable pattern, and the field itself carries the reason.
        expect(names(wrapper)).toHaveLength(0);
        expect(wrapper.get(".mb-release-assets__search .mb-config-search").text()).toContain(
            "Unterminated group",
        );

        wrapper.unmount();
    });

    it("gives focus back to the field it belongs to when it closes", async () => {
        const wrapper = render();
        await openBuilder(wrapper);

        const activator = wrapper.get('.mb-release-assets__search [aria-label="Open the regex builder"]');
        await activator.trigger("click");
        await settle();

        // Not "somewhere sensible": the exact input the builder was opened from. Anything
        // else strands a keyboard user at the top of the document with their query
        // half-written.
        expect(document.activeElement).toBe(searchInput(wrapper).element);
        expect(activator.attributes("aria-expanded")).toBe("false");

        wrapper.unmount();
    });

    it("refuses a pattern that would backtrack exponentially, in words that say what to do", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "(\\w+)+$");

        expect(wrapper.get(".mb-release-assets__search .mb-config-search").text()).toContain(
            "exponential time",
        );

        wrapper.unmount();
    });
});
