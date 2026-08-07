// @vitest-environment jsdom

/**
 * The wizard's review step, and the regex builder anchored to its search bar.
 *
 * This step exists to answer one question honestly: of everything that was changed,
 * which settings reach the render and which are only written into the config file. With
 * thirty changed settings that is two lists to read before pressing a button that runs
 * for hours, so the lists are searchable, with the same anchored builder every other
 * search bar in this app carries.
 *
 * One field over both lists, deliberately, and there is a test for it: the question
 * somebody brings here is "where did my setting end up", and a field per list would
 * answer half of it while making them ask twice. The other assertion worth naming is
 * that the carried-settings note keeps counting every carried setting rather than the
 * filtered ones - it is a statement about what this render will not pick up, and a
 * number that shrank because somebody typed in a search box would be a different claim
 * altogether.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import WizardReviewStep from "./WizardReviewStep.vue";
import wizardReviewStepSource from "./WizardReviewStep.vue?raw";
import type { FieldChange } from "../config/configModel.js";

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

    // Vuetify's overlay placement reads `visualViewport` unguarded and jsdom has none.
    // The reference error is swallowed by a watcher, so the builder silently never
    // appears; this stub is what makes an anchored overlay testable at all here.
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

/**
 * A changed setting, with the three things a row shows: its label, its dotted path and
 * its new value. The rest of `FieldMeta` describes a control this step never renders, so
 * it is left off rather than filled in with numbers no assertion reads.
 */
function change(path: string, label: string, to: string): FieldChange {
    return {
        field: { path, label, key: path.split(".").at(-1) ?? path },
        from: undefined,
        to,
        invalidatesTiles: false,
        invalidationNote: undefined,
    } as unknown as FieldChange;
}

const REACHING: readonly FieldChange[] = [
    change("render-edges", "Render edges", "true"),
    change("ambient-light", "Ambient light", "0.1"),
];

const CARRIED: readonly FieldChange[] = [
    change("sky-color", "Sky colour", "#7dabff"),
    change("void-color", "Void colour", "#000000"),
    change("cave-detection-ocean-floor", "Cave detection ocean floor", "-5"),
];

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

/** `VApp` renders the overlay container the anchored builder teleports into. */
const Host = defineComponent({
    setup() {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(WizardReviewStep, {
                        world: "/srv/world",
                        mapId: "overworld",
                        displayName: "Overworld",
                        dimensionKey: "minecraft:overworld",
                        dimensionLabel: "Overworld",
                        extraDimensions: [],
                        storageDirectory: "/srv/bluemap/maps",
                        reaching: REACHING,
                        carried: CARRIED,
                        configText: "maps: {}",
                        run: { force: false, fixEdges: false, metrics: false, renderThreads: null },
                        consentAccepted: true,
                        canRender: true,
                    }),
                ],
            });
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

/** Every changed-setting row on screen, across both lists. */
function rows(wrapper: VueWrapper): string[] {
    return wrapper.findAll(".mb-world-review__list li").map((node) => node.text());
}

function searchInput(wrapper: VueWrapper) {
    return wrapper.get(".mb-world-review__search .mb-config-search input");
}

async function openBuilder(wrapper: VueWrapper): Promise<HTMLTextAreaElement> {
    // Vuetify binds the activator's click handler one tick after mount, from a
    // post-flush watcher. A click before that reaches a button with no listener on it.
    await settle();

    const activator = wrapper.get('.mb-world-review__search [aria-label="Open the regex builder"]');
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

describe("the search bar over the settings you changed", () => {
    it("is one field with its own builder, covering both lists rather than one each", async () => {
        const wrapper = render();
        await settle();

        expect(wrapper.findAll(".mb-config-search")).toHaveLength(1);
        expect(
            wrapper.find('.mb-world-review__search [aria-label="Open the regex builder"]').exists(),
        ).toBe(true);
        expect(rows(wrapper)).toHaveLength(5);

        wrapper.unmount();
    });

    it("searches the reaching list and the carried list with the same query", async () => {
        const wrapper = render();
        await settle();

        await searchInput(wrapper).setValue("colour");
        await settle();

        // Both carried, neither reaching: the answer to "where did it end up" is visible
        // in which list survived.
        expect(rows(wrapper)).toHaveLength(2);
        expect(wrapper.text()).toContain("Sky colour");
        expect(wrapper.text()).not.toContain("Render edges");
        expect(wrapper.text()).toContain("Showing 2 of 5");

        wrapper.unmount();
    });

    it("finds a setting by its dotted path as well as by its name", async () => {
        const wrapper = render();
        await settle();

        await searchInput(wrapper).setValue("cave-detection");
        await settle();

        expect(rows(wrapper)).toHaveLength(1);
        expect(rows(wrapper)[0]).toContain("cave-detection-ocean-floor");

        wrapper.unmount();
    });

    it("keeps the carried-settings note counting all of them, not the filtered ones", async () => {
        const wrapper = render();
        await settle();

        expect(wrapper.text()).toContain("These 3 settings are written into the map config file");

        await searchInput(wrapper).setValue("sky");
        await settle();

        // One row survives, and the note still says three, because it is a claim about
        // this render rather than about the search.
        expect(rows(wrapper)).toHaveLength(1);
        expect(wrapper.text()).toContain("These 3 settings are written into the map config file");

        wrapper.unmount();
    });

    it("treats a pattern-shaped query literally until regex is turned on", async () => {
        const wrapper = render();
        await settle();

        await searchInput(wrapper).setValue("sky|void");
        await settle();

        expect(rows(wrapper)).toHaveLength(0);
        expect(wrapper.text()).toContain("No setting you changed matches that search");

        wrapper.unmount();
    });
});

describe("the 'Show the map config this produces' disclosure", () => {
    it("points its aria-controls at the id of the region it reveals", async () => {
        const wrapper = render();
        await settle();

        const toggle = wrapper.get(".mb-world-review__head button");
        expect(toggle.attributes("aria-expanded")).toBe("false");

        const controlsId = toggle.attributes("aria-controls");
        expect(controlsId).toBeTruthy();

        await toggle.trigger("click");
        await settle();

        expect(toggle.attributes("aria-expanded")).toBe("true");
        expect(wrapper.find(`#${controlsId}`).exists()).toBe(true);
        expect(wrapper.get(`#${controlsId}`).text()).toContain("maps: {}");

        wrapper.unmount();
    });
});

describe("the builder, opened from this field", () => {
    it("applies its pattern across both lists, and turns regex on by doing so", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "^(sky|void)-color$");

        expect((searchInput(wrapper).element as HTMLInputElement).value).toBe("^(sky|void)-color$");
        expect(rows(wrapper)).toHaveLength(2);
        expect(
            wrapper
                .get('.mb-world-review__search [aria-label="Search plain text instead of a regular expression"]')
                .attributes("aria-pressed"),
        ).toBe("true");

        wrapper.unmount();
    });

    it("gives focus back to the field it belongs to when it closes", async () => {
        const wrapper = render();
        await openBuilder(wrapper);

        await wrapper
            .get('.mb-world-review__search [aria-label="Open the regex builder"]')
            .trigger("click");
        await settle();

        expect(document.activeElement).toBe(searchInput(wrapper).element);

        wrapper.unmount();
    });

    it("refuses a pattern that would backtrack exponentially, and says what to do instead", async () => {
        const wrapper = render();
        const editor = await openBuilder(wrapper);

        await type(editor, "(\\w+)+$");

        expect(wrapper.get(".mb-world-review__search .mb-config-search").text()).toContain(
            "exponential time",
        );
        expect(rows(wrapper)).toHaveLength(0);

        wrapper.unmount();
    });
});

describe("the review cards' heads, which turn their <v-card-title> into a flex row", () => {
    /**
     * Regression: `<v-card-title>` ships `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` (Vuetify's own `VCard.css`). `.mb-world-review__head` makes it a
     * flex row so an icon, and on the second card two buttons, sit beside the heading -
     * but `display: flex` clears none of the three: `text-overflow` stops applying once the
     * box is a flex container, `overflow: hidden` still clips, and the inherited `nowrap`
     * leaves the text no line to break on. `flex-wrap: wrap` was already there and could
     * only move whole items onto a second row, never shorten one, so the disclosure
     * button's own label was cut off mid-character with no ellipsis.
     *
     * `test.css` is not enabled for this workspace's `vitest.config.ts`, so no cascade is
     * observable from a mounted component here; a `?raw` import reads the exact rule the
     * fix landed in, the way `PagesScreen.test.ts` does for its own CSS fix.
     */
    it("clears the inherited overflow, text-overflow and white-space so the heading can wrap", () => {
        const rule = /\.mb-world-review__head\s*\{[^}]*\}/s.exec(wizardReviewStepSource)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("overflow: visible");
        expect(rule).toContain("text-overflow: clip");
        expect(rule).toContain("white-space: normal");
    });
});
