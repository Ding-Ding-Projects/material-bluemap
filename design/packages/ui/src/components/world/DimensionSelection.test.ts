// @vitest-environment jsdom

/**
 * The dimension list mounted below the primary dimension picker in `MapIdentityStep.vue`.
 *
 * This is where "detect every dimension and show them" actually lands on screen: every
 * dimension the world folder inspection found, each with its own checkbox, its own real
 * facts (key, vanilla or custom, region count, and where a split-server dimension's data
 * really lives), a search bar wired to the full regex builder, and bulk include/exclude/
 * invert that only ever touches whatever the search is currently showing.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import DimensionSelection from "./DimensionSelection.vue";
import type { WorldDimension } from "./worldFolder.js";

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

const DIMENSIONS: readonly WorldDimension[] = [
    {
        key: "minecraft:overworld",
        dimensionType: "minecraft:overworld",
        label: "Overworld",
        regionDirectory: "region",
        regionFiles: 40,
        preset: "overworld",
        sorting: 0,
        custom: false,
        external: false,
    },
    {
        key: "minecraft:the_nether",
        dimensionType: "minecraft:the_nether",
        label: "The Nether",
        regionDirectory: "DIM-1/region",
        regionFiles: 8,
        preset: "nether",
        sorting: 100,
        custom: false,
        external: false,
    },
    {
        key: "minecraft:the_end",
        dimensionType: "minecraft:the_end",
        label: "The End",
        regionDirectory: "DIM1/region",
        regionFiles: 3,
        preset: "end",
        sorting: 200,
        custom: false,
        external: true,
        worldFolder: "/srv/world_the_end",
    },
    {
        key: "aether:skyland",
        dimensionType: "aether:skyland",
        label: "aether:skyland",
        regionDirectory: "dimensions/aether/skyland/region",
        regionFiles: 5,
        preset: "overworld",
        sorting: 300,
        custom: true,
        external: false,
    },
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

interface Emitted {
    include: string[][];
    exclude: string[][];
    invert: string[][];
}

/** `VApp` renders the overlay container the anchored regex builder teleports into. */
function render(
    props: {
        dimensions?: readonly WorldDimension[];
        primaryKey?: string;
        included?: ReadonlySet<string>;
        dimensionsAreReal?: boolean;
    } = {},
): { wrapper: VueWrapper; emitted: Emitted } {
    const emitted: Emitted = { include: [], exclude: [], invert: [] };

    const Host = defineComponent({
        setup() {
            return () =>
                h(VApp, null, {
                    default: () => [
                        h(DimensionSelection, {
                            dimensions: props.dimensions ?? DIMENSIONS,
                            primaryKey: props.primaryKey ?? "minecraft:overworld",
                            included: props.included ?? new Set<string>(),
                            dimensionsAreReal: props.dimensionsAreReal ?? true,
                            onInclude: (keys: readonly string[]) => emitted.include.push([...keys]),
                            onExclude: (keys: readonly string[]) => emitted.exclude.push([...keys]),
                            onInvert: (keys: readonly string[]) => emitted.invert.push([...keys]),
                        }),
                    ],
                });
        },
    });

    const wrapper = mount(Host, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n()] },
    }) as unknown as VueWrapper;

    return { wrapper, emitted };
}

async function settle(): Promise<void> {
    for (let index = 0; index < 4; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function rows(wrapper: VueWrapper): string[] {
    return wrapper.findAll(".mb-dimension-select__row").map((node) => node.text());
}

function checkboxFor(wrapper: VueWrapper, key: string): HTMLInputElement {
    const row = wrapper.findAll(".mb-dimension-select__row").find((node) => node.text().includes(key));
    if (row === undefined) throw new Error(`no row for ${key}`);
    return row.get("input[type=checkbox]").element as HTMLInputElement;
}

describe("listing every dimension the world has", () => {
    it("shows every dimension with its key, vanilla-or-custom badge and region count", async () => {
        const { wrapper } = render();
        await settle();

        expect(rows(wrapper)).toHaveLength(4);
        expect(wrapper.text()).toContain("minecraft:the_nether");
        expect(wrapper.text()).toContain("8 regions");
        expect(wrapper.text()).toContain("Vanilla dimension");
        expect(wrapper.text()).toContain("Added by a mod or datapack");

        wrapper.unmount();
    });

    it("never drops an unrecognised custom dimension - it is listed with its real identifier", async () => {
        const { wrapper } = render();
        await settle();

        expect(wrapper.text()).toContain("aether:skyland");

        wrapper.unmount();
    });

    it("names where a split-server dimension's data really lives", async () => {
        const { wrapper } = render();
        await settle();

        expect(wrapper.text()).toContain("/srv/world_the_end");

        wrapper.unmount();
    });

    it("says plainly when a world has nothing besides the Overworld", async () => {
        const { wrapper } = render({ dimensions: [DIMENSIONS[0]!] });
        await settle();

        expect(wrapper.text()).toContain("This world only has the Overworld");
        expect(wrapper.find(".mb-dimension-select__list").exists()).toBe(false);

        wrapper.unmount();
    });

    it("says these are guessed dimensions when nothing could read the folder", async () => {
        const { wrapper } = render({ dimensionsAreReal: false });
        await settle();

        expect(wrapper.text()).toContain("three vanilla dimensions");
        expect(wrapper.find(".mb-dimension-select__list").exists()).toBe(false);

        wrapper.unmount();
    });
});

describe("including and excluding", () => {
    it("marks the primary dimension included, disabled, and says why", async () => {
        const { wrapper } = render();
        await settle();

        const primary = checkboxFor(wrapper, "minecraft:overworld");
        expect(primary.checked).toBe(true);
        expect(primary.disabled).toBe(true);
        expect(wrapper.text()).toContain("This is the map you are customising above");

        wrapper.unmount();
    });

    it("ticking a row emits include with just that dimension's key", async () => {
        const { wrapper, emitted } = render();
        await settle();

        await checkboxFor(wrapper, "minecraft:the_nether").click();
        await settle();

        expect(emitted.include).toContainEqual(["minecraft:the_nether"]);

        wrapper.unmount();
    });

    it("un-ticking an already-included row emits exclude", async () => {
        const { wrapper, emitted } = render({ included: new Set(["minecraft:the_nether"]) });
        await settle();

        const box = checkboxFor(wrapper, "minecraft:the_nether");
        expect(box.checked).toBe(true);
        await box.click();
        await settle();

        expect(emitted.exclude).toContainEqual(["minecraft:the_nether"]);

        wrapper.unmount();
    });

    it("bulk-includes every shown non-primary dimension at once", async () => {
        const { wrapper, emitted } = render();
        await settle();

        const button = wrapper.findAll("button").find((node) => node.text().includes("Include"));
        if (button === undefined) throw new Error("no bulk include button");
        await button.trigger("click");
        await settle();

        expect(emitted.include).toContainEqual([
            "minecraft:the_nether",
            "minecraft:the_end",
            "aether:skyland",
        ]);

        wrapper.unmount();
    });

    it("bulk actions only ever touch what the search is currently showing", async () => {
        const { wrapper, emitted } = render();
        await settle();

        const search = wrapper.get(".mb-dimension-select__search .mb-config-search input");
        await search.setValue("nether");
        await settle();

        const includeButton = wrapper.findAll("button").find((node) => node.text().includes("Include"));
        if (includeButton === undefined) throw new Error("no bulk include button");
        await includeButton.trigger("click");
        await settle();

        expect(emitted.include).toContainEqual(["minecraft:the_nether"]);

        wrapper.unmount();
    });

    it("inverts whichever dimensions the search is currently showing", async () => {
        const { wrapper, emitted } = render({ included: new Set(["minecraft:the_nether"]) });
        await settle();

        const invertButton = wrapper.findAll("button").find((node) => node.text().includes("Invert"));
        if (invertButton === undefined) throw new Error("no invert button");
        await invertButton.trigger("click");
        await settle();

        expect(emitted.invert).toContainEqual([
            "minecraft:the_nether",
            "minecraft:the_end",
            "aether:skyland",
        ]);

        wrapper.unmount();
    });

    it("reports an honest no-match state, and clearing the search brings the list back", async () => {
        const { wrapper } = render();
        await settle();

        const search = wrapper.get(".mb-dimension-select__search .mb-config-search input");
        await search.setValue("does-not-exist");
        await settle();

        expect(wrapper.text()).toContain("No dimension matches that search");
        expect(rows(wrapper)).toHaveLength(0);

        await search.setValue("");
        await settle();

        expect(rows(wrapper)).toHaveLength(4);

        wrapper.unmount();
    });
});
