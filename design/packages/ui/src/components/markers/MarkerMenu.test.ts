// @vitest-environment jsdom

/**
 * The marker list's sort control, mounted.
 *
 * The ordering itself is pure and covered in `markerFilter.test.ts`. What can only be
 * checked here is the wiring: the control is now the shared `MenuChoice` segmented
 * control rather than a second hand-rolled button row, and swapping it must not have
 * quietly changed what clicking a segment does. So these assertions run through the
 * rendered list - click "name", read the order of the rows - because a test that only
 * inspected the component's own `order` ref would pass just as happily against a control
 * wired to nothing.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import MarkerMenu from "./MarkerMenu.vue";
import { MenuChoice } from "../menu/index.js";
import type { AnyMarkerData, AnyMarkerSetData } from "./markerTypes.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's overlays observe their own size.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

function marker(id: string, label: string, x: number): AnyMarkerData {
    return {
        type: "poi",
        sorting: 0,
        listed: true,
        visible: true,
        label,
        id,
        position: { x, y: 0, z: 0 } as AnyMarkerData["position"],
    } as AnyMarkerData;
}

/** Three markers whose alphabetical order is not the order they were declared in. */
function markerSet(): AnyMarkerSetData {
    return {
        id: "bm-root",
        label: "Markers",
        toggleable: true,
        defaultHide: false,
        sorting: 0,
        visible: true,
        listed: true,
        markerSets: [],
        markers: [marker("c", "Zoo", 30), marker("a", "Anvil", 20), marker("b", "Mine", 10)],
        saveState: () => {},
    } as unknown as AnyMarkerSetData;
}

/*
 * Registered the way `vuetify.ts` registers them. `createVuetify()` on its own registers
 * nothing, and this menu reaches for the global tags rather than importing each component,
 * so half its controls would render as unknown elements and the assertions below would be
 * measuring a page the application never shows.
 */
const vuetify = createVuetify({ components, directives });

/** The options `i18n.ts` ships: no messages, so every key falls back to its English string. */
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

function render() {
    return mount(MarkerMenu, {
        props: { markerSet: markerSet() },
        global: { plugins: [vuetify, i18n()] },
    });
}

/** The visible marker labels, in the order the list actually renders them. */
function rowLabels(wrapper: ReturnType<typeof render>): string[] {
    return wrapper.findAll(".mb-marker-item__title").map((row) => row.text());
}

function sortButtons(wrapper: ReturnType<typeof render>) {
    return wrapper.findAll(".mb-marker-menu__sort button");
}

describe("the sort control", () => {
    it("is one labelled group holding upstream's three orders", () => {
        const wrapper = render();

        // The group role lives on MenuChoice's own toggle, named by its visible title
        // through aria-labelledby - one group, not a nested pair.
        const group = wrapper.find(".mb-marker-menu__sort [role='group']");
        expect(group.exists()).toBe(true);
        const labelId = group.attributes("aria-labelledby");
        expect(labelId).toBeTruthy();
        expect(wrapper.find(`#${labelId}`).text()).toBe("Sort by");
        expect(wrapper.find(".mb-marker-menu__sort").attributes("role")).toBeUndefined();

        expect(sortButtons(wrapper).map((button) => button.text())).toEqual([
            "default",
            "name",
            "distance",
        ]);

        wrapper.unmount();
    });

    it("tells assistive technology which order is pressed, not just the stylesheet", async () => {
        const wrapper = render();

        // Vuetify marks the selection with a class only, so without an explicit
        // aria-pressed a screen reader hears three unstated buttons.
        const pressed = () =>
            sortButtons(wrapper).map((button) => button.attributes("aria-pressed"));
        expect(pressed()).toEqual(["true", "false", "false"]);

        await sortButtons(wrapper)[1]?.trigger("click");
        expect(pressed()).toEqual(["false", "true", "false"]);

        wrapper.unmount();
    });

    it("is the shared MenuChoice rather than a second hand-rolled button row", () => {
        const wrapper = render();

        expect(wrapper.findComponent(MenuChoice).exists()).toBe(true);

        wrapper.unmount();
    });

    it("re-sorts the rendered list when a segment is chosen", async () => {
        const wrapper = render();

        expect(rowLabels(wrapper)).toEqual(["Zoo", "Anvil", "Mine"]);

        await sortButtons(wrapper)[1]?.trigger("click");
        expect(rowLabels(wrapper)).toEqual(["Anvil", "Mine", "Zoo"]);

        // Distance is measured from the camera, which is at the origin with no viewer
        // attached, so this is the x ordering: 10, 20, 30.
        await sortButtons(wrapper)[2]?.trigger("click");
        expect(rowLabels(wrapper)).toEqual(["Mine", "Anvil", "Zoo"]);

        wrapper.unmount();
    });

    it("marks the chosen segment, so the current order is visible without reading the list", async () => {
        const wrapper = render();

        // `v-btn--active` is what Vuetify puts on the selected member of a button group.
        expect(wrapper.find(".mb-marker-menu__sort .v-btn--active").text()).toBe("default");

        await sortButtons(wrapper)[1]?.trigger("click");
        expect(wrapper.find(".mb-marker-menu__sort .v-btn--active").text()).toBe("name");

        wrapper.unmount();
    });

    it("names the active order on the collapsed-filter chip, which reads the same state", async () => {
        const wrapper = render();

        await sortButtons(wrapper)[1]?.trigger("click");
        await wrapper.find(".mb-marker-menu__filters-head button").trigger("click");

        expect(wrapper.find(".mb-marker-menu__filters-head .v-chip").text()).toBe("name");

        wrapper.unmount();
    });
});

describe("mirroring the filters-open state into the application-settings history", () => {
    beforeEach(() => {
        vi.mocked(recordAppSetting).mockClear();
    });

    it("mirrors under the markerFiltersOpen key when the filters panel is collapsed", async () => {
        const wrapper = render();

        await wrapper.find(".mb-marker-menu__filters-head button").trigger("click");
        await nextTick();

        expect(recordAppSetting).toHaveBeenCalledWith("markerFiltersOpen", false);

        wrapper.unmount();
    });
});
