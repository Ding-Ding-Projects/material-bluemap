// @vitest-environment jsdom

/**
 * The doc-disclosure and default-provenance line, mounted for a marker set's own
 * container properties.
 *
 * Before this task these four properties (`label`, `sorting`, `toggleable`,
 * `default-hidden`) were hand-written controls with an i18n label and nothing
 * else: no explanation, no way to tell whether a marker set's own record named
 * them or was inheriting `MarkerSet`'s Java defaults. This proves the
 * `MARKER_SET_FIELDS`-driven rendering actually reaches the screen, the same way
 * `ConfigMaskField.test.ts` proves it for a render mask's shape fields.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VBtn, VExpansionPanelTitle } from "vuetify/components";
import { MARKER_SET_FIELDS, type PlainValue } from "@material-bluemap/config";
import ConfigMarkerSetsField from "./ConfigMarkerSetsField.vue";

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
});

const vuetify = createVuetify();

function emptyI18n() {
    return createI18n({ legacy: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, missingWarn: false, fallbackWarn: false, messages: {} });
}

/**
 * Mounts with the given marker sets and opens the first one's expansion panel.
 *
 * `v-expansion-panels` here carries no `v-model`, unlike `ConfigFileForm.vue`'s
 * own panel strip, so a marker set's body -- every field, its doc, its
 * provenance line -- is not in the DOM at all until its panel is opened. Every
 * test below is about that body, so opening it is what the helper does rather
 * than something each test repeats.
 */
async function mountMarkers(modelValue: Record<string, PlainValue> | null) {
    const host = defineComponent({
        setup: () => () => h(VApp, () => [h(ConfigMarkerSetsField, { modelValue, label: "Marker sets", "onUpdate:modelValue": () => {} })]),
    });
    const wrapper = mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
    await wrapper.findComponent(VExpansionPanelTitle).trigger("click");
    return wrapper;
}

const SPAWN_DEFAULT = { spawn: { label: "Spawn", toggleable: true, "default-hidden": false, sorting: 0, markers: {} } };

describe("the doc disclosure, on a real marker set field", () => {
    // `toggleable` is the one deliberately written past three lines, so the
    // toggle is proved against real content rather than a case nothing triggers.
    const toggleableField = MARKER_SET_FIELDS.find((field) => field.path === "toggleable")!;

    it("starts collapsed for a doc past the preview length", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        expect(wrapper.text()).toContain(toggleableField.doc.split("\n").slice(0, 3).join("\n"));
        expect(wrapper.text()).not.toContain("You can change this at any time.");
        expect(wrapper.text()).toContain("Show the rest of the explanation");
    });

    it("reveals the rest once opened, and offers to collapse it again", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        const toggle = wrapper.findAllComponents(VBtn).find((btn) => btn.text().includes("Show the rest of the explanation"));
        expect(toggle).toBeDefined();

        await toggle!.trigger("click");
        expect(wrapper.text()).toContain("You can change this at any time.");
        expect(wrapper.text()).toContain("Show less");
    });

    it("offers no toggle for `label`, which is already short enough to show in full", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        // Only one field on this set (`toggleable`) is long; every other button
        // that mentions "Show the rest" would be a false positive for a field
        // that is already fully shown.
        const toggles = wrapper.findAllComponents(VBtn).filter((btn) => btn.text().includes("Show the rest"));
        expect(toggles).toHaveLength(1);
    });
});

describe("the provenance line, on a real marker set field", () => {
    it("says a genuinely bare set's un-set fields are inherited, naming the real Java default", async () => {
        // `{ markers: {} }` is exactly what `addSet` itself now writes for a brand new
        // set - see the "adding a set" describe block below, which drives the real Add
        // button rather than synthesising this record by hand.
        const wrapper = await mountMarkers({ spawn: { markers: {} } });
        expect(wrapper.text()).toContain("Not set here, so BlueMap uses 0.");
        expect(wrapper.text()).toContain("Not set here, so BlueMap uses on.");
    });

    it("says a field written to exactly the default is set, not inherited", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        expect(wrapper.text()).toContain("Set here, and it matches BlueMap's default.");
    });

    it("says a field written to something else is set, and still names the default", async () => {
        const wrapper = await mountMarkers({ spawn: { label: "Spawn", toggleable: true, "default-hidden": true, sorting: 5, markers: {} } });
        expect(wrapper.text()).toContain("Set here. BlueMap's default is off.");
        expect(wrapper.text()).toContain("Set here. BlueMap's default is 0.");
    });
});

describe("the authored badge", () => {
    it("marks every container property as explained for this app, since map.conf has no per-property comment for any of them", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        expect(wrapper.text()).toContain("Explained for this app");
    });
});

describe("a spot check against MarkerSet's own real behaviour", () => {
    it("explains sorting the way BlueMap's own Javadoc does: lower first, ties arbitrary", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        expect(wrapper.text()).toContain("a lower value sorts earlier");
        expect(wrapper.text()).toContain("arbitrarily");
    });

    it("explains that default-hidden only matters while the set is toggleable", async () => {
        const wrapper = await mountMarkers(SPAWN_DEFAULT);
        expect(wrapper.text()).toContain("Only meaningful while the set is toggleable");
    });
});

/**
 * The Add button itself, which is what actually decides whether the "not set" branch
 * above is reachable in the shipped app or only in a hand-edited file nobody uses this
 * editor to produce.
 *
 * It used to write `label`, `toggleable`, `default-hidden` and `sorting` explicitly the
 * moment a set was created - BlueMap's own real values, but never anything the person
 * asked for, since all they typed was an id. That made every set anybody actually created
 * through this screen read as "Set here" for four things nobody set, and the "Not set
 * here" branch reachable only by hand-editing a file outside the app entirely.
 */
describe("adding a set", () => {
    function mountForAdd() {
        const emitted: (Record<string, PlainValue> | null)[] = [];
        const host = defineComponent({
            setup: () =>
                () =>
                    h(VApp, () => [
                        h(ConfigMarkerSetsField, {
                            modelValue: {},
                            label: "Marker sets",
                            "onUpdate:modelValue": (value: Record<string, PlainValue>) => emitted.push(value),
                        }),
                    ]),
        });
        const wrapper = mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
        return { wrapper, emitted };
    }

    it("writes only the id and an empty markers object, none of the four container properties", async () => {
        const { wrapper, emitted } = mountForAdd();

        await wrapper.find("input").setValue("spawn");
        await wrapper.findAllComponents(VBtn).find((btn) => btn.text() === "Add")!.trigger("click");

        expect(emitted).toHaveLength(1);
        expect(emitted[0]).toEqual({ spawn: { markers: {} } });
    });

    it("makes a freshly created set's own provenance line say every property is inherited", async () => {
        const { wrapper, emitted } = mountForAdd();

        await wrapper.find("input").setValue("spawn");
        await wrapper.findAllComponents(VBtn).find((btn) => btn.text() === "Add")!.trigger("click");
        const written = emitted[0];
        expect(written).toBeDefined();

        // What a parent normally does with this emission - feeds it straight back in as
        // the next `modelValue` - reusing the same helper the rest of this file mounts
        // an already-written record with, so this is a real record read the same way.
        const reopened = await mountMarkers(written ?? null);
        expect(reopened.text()).toContain("Not set here, so BlueMap uses on.");
        expect(reopened.text()).toContain("Not set here, so BlueMap uses off.");
        expect(reopened.text()).toContain("Not set here, so BlueMap uses 0.");
        expect(reopened.text()).toContain("Not set here, so BlueMap uses nothing.");
    });
});
