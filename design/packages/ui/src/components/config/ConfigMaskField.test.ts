// @vitest-environment jsdom

/**
 * The doc-disclosure and default-provenance line, mounted for a render mask's
 * own shape fields.
 *
 * `explainField.test.ts` proves the pure functions behind this pair; this file
 * proves `ConfigMaskField.vue` actually wires them in for a real shape, because a
 * correct helper nobody calls from the template is indistinguishable, from the
 * user's chair, from no helper at all.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VBtn } from "vuetify/components";
import { MASK_SHAPES, type PlainValue } from "@material-bluemap/config";
import ConfigMaskField from "./ConfigMaskField.vue";

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

function mountMask(modelValue: PlainValue[]) {
    const host = defineComponent({
        setup: () => () => h(VApp, () => [h(ConfigMaskField, { modelValue, label: "Render mask", "onUpdate:modelValue": () => {} })]),
    });
    return mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
}

describe("the doc disclosure, on a real shape field", () => {
    // `shape` on a polygon mask is the one deliberately written long enough (past
    // three lines) to prove the toggle really does something, rather than only
    // existing in a case nothing in the schema ever triggers.
    const shapeField = MASK_SHAPES.find((shape) => shape.key === "polygon")!.fields.find((field) => field.path === "shape")!;

    it("starts collapsed and shows the toggle for a doc past the preview length", () => {
        const wrapper = mountMask([{ type: "bluemap:polygon" }]);
        expect(wrapper.text()).toContain(shapeField.doc.split("\n").slice(0, 3).join("\n"));
        expect(wrapper.text()).not.toContain("This only limits X and Z");
        expect(wrapper.text()).toContain("Show the rest of the explanation");
    });

    it("reveals the rest of the explanation once opened, and offers to collapse it again", async () => {
        const wrapper = mountMask([{ type: "bluemap:polygon" }]);
        const toggle = wrapper.findAllComponents(VBtn).find((btn) => btn.text().includes("Show the rest of the explanation"));
        expect(toggle).toBeDefined();

        await toggle!.trigger("click");

        expect(wrapper.text()).toContain("This only limits X and Z");
        expect(wrapper.text()).toContain("Show less");
    });

    it("does not offer a toggle for a shape field short enough to already be shown in full", () => {
        // `center-x` on a circle is a single short sentence: already fully visible,
        // so a toggle here would be a control that does nothing.
        const wrapper = mountMask([{ type: "bluemap:circle" }]);
        const buttons = wrapper.findAllComponents(VBtn).map((btn) => btn.text());
        expect(buttons.some((text) => text.includes("Show the rest"))).toBe(false);
    });
});

describe("the provenance line, on a real shape field", () => {
    it("says a field the row never mentions is inherited, naming the real default", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Not set here, so BlueMap uses off.");
    });

    it("says a field written to exactly the default is set, not inherited", () => {
        // The box's other fields (min-x, max-y, ...) are legitimately still
        // inherited in this fixture, so the assertion is specific to subtract's own
        // line rather than a page-wide absence of "Not set here".
        const wrapper = mountMask([{ type: "bluemap:box", subtract: false }]);
        expect(wrapper.text()).toContain("Set here, and it matches BlueMap's default.");
    });

    it("says a field written to something else is set, and still names the default", () => {
        const wrapper = mountMask([{ type: "bluemap:box", subtract: true }]);
        expect(wrapper.text()).toContain("Set here. BlueMap's default is off.");
    });

    it("reads BlueMap's unbounded sentinel as 'no limit' rather than as -2147483648", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("no limit");
        expect(wrapper.text()).not.toContain("-2147483648");
    });
});

describe("the authored badge", () => {
    it("marks every shape field as explained for this app, since map.conf has no per-field comment for any of them", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Explained for this app");
    });
});

describe("a spot check against the real schema behaviour", () => {
    it("shows the box shape's real sentinel explanation rather than a placeholder", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).toContain("Integer.MIN_VALUE");
    });

    it("shows the circle shape's real validity rule", () => {
        const wrapper = mountMask([{ type: "bluemap:circle" }]);
        expect(wrapper.text()).toContain("Double.MAX_VALUE");
    });
});

/**
 * The list-level cloud/Actions fidelity warning: shown once for the whole mask, never per
 * shape. `cloudFidelityForMask` (`maskCanvas.ts`) is the pure rule this wires in; these tests
 * prove `ConfigMaskField.vue` actually calls it and renders the result, because two ordinary
 * boxes are exactly the case the per-shape `MaskDrawingCanvas.vue` warning cannot catch --
 * each box alone is honored, and only the list as a whole is not.
 */
describe("the list-level cloud/Actions fidelity warning", () => {
    const CLOUD_LABEL = "Cloud/Actions render";
    const WARNING_SNIPPET = "single, non-subtracting box";

    it("does not fire for an empty mask -- no mask is the correct, honored case", () => {
        const wrapper = mountMask([]);
        expect(wrapper.text()).not.toContain(CLOUD_LABEL);
    });

    it("does not fire for exactly one plain box -- the one shape the cloud path actually translates", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }]);
        expect(wrapper.text()).not.toContain(CLOUD_LABEL);
    });

    it("fires for two plain boxes -- the ordinary-looking case that silently loses the whole mask today", () => {
        const wrapper = mountMask([{ type: "bluemap:box" }, { type: "bluemap:box", "min-x": 200 }]);
        const text = wrapper.text();
        expect(text).toContain(CLOUD_LABEL);
        expect(text).toContain(WARNING_SNIPPET);
        // The failure is total, never softened: "the whole world" renders, unmasked.
        expect(text).toContain("whole world");
        expect(text).toContain("unmasked");
        // The working alternative is stated too, not just the failure.
        expect(text.toLowerCase()).toContain("local");
    });

    it("fires for a single subtracting box", () => {
        const wrapper = mountMask([{ type: "bluemap:box", subtract: true }]);
        expect(wrapper.text()).toContain(CLOUD_LABEL);
    });

    it("fires for a single circle", () => {
        const wrapper = mountMask([{ type: "bluemap:circle" }]);
        expect(wrapper.text()).toContain(CLOUD_LABEL);
    });

    it("fires exactly once for a blur that nests two boxes -- the nested list never raises its own top-level warning", () => {
        const wrapper = mountMask([
            { type: "bluemap:blur", masks: [{ type: "bluemap:box" }, { type: "bluemap:box", "min-x": 200 }] },
        ]);
        const occurrences = wrapper.text().split(CLOUD_LABEL).length - 1;
        expect(occurrences).toBe(1);
    });
});
