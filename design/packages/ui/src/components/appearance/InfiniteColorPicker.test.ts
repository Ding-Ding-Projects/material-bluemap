// @vitest-environment jsdom

/**
 * The picker, mounted.
 *
 * Everything asserted here is a property of the rendered component and could not be checked
 * any other way. The conversions are unit-tested next door against published values; this
 * file is about the wiring, which is exactly the part those tests cannot vouch for: that the
 * continuous field really is two operable sliders rather than a decorative square, that
 * typing a colour in one notation really writes it back, that the notation the user chose is
 * the notation that gets saved, and that a colour outside sRGB is not quietly rounded into it
 * on the way to the record.
 *
 * The last of those is the one worth writing a mounted test for. A picker can convert
 * perfectly and still lose the user's colour at the moment it writes the model, and no amount
 * of testing the maths would notice.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import InfiniteColorPicker from "./InfiniteColorPicker.vue";

beforeAll(() => {
    // jsdom has no layout engine, so none of these exist. Vuetify's overlays observe their
    // own size and position themselves against the visual viewport; without the stubs the
    // mount throws before an assertion runs.
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
    // the assertion that opened it has already passed, and the failure surfaces as an
    // unhandled rejection attributed to whichever test happened to be running next.
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

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

function mountPicker(modelValue: string): VueWrapper {
    wrapper = mount(InfiniteColorPicker, {
        global: { plugins: [vuetify, i18n] },
        props: { modelValue, label: "Text colour" },
    });
    return wrapper;
}

/** The most recent value the picker emitted through its model. */
function lastEmitted(view: VueWrapper): string | null {
    const events = view.emitted("update:modelValue");
    if (events === undefined || events.length === 0) return null;
    const last = events[events.length - 1];
    return (last?.[0] as string | undefined) ?? null;
}

describe("the continuous field", () => {
    it("is two real sliders, not a decorative square", () => {
        // The contract's "never a finite swatch-only chooser" clause, checked at the level
        // that matters for a keyboard user: the field has to be operable without a pointer.
        const view = mountPicker("#ff0000");
        const axes = view.findAll(".mb-color-picker__axis");

        expect(axes).toHaveLength(2);
        expect(axes[0]?.attributes("type")).toBe("range");
        expect(axes[1]?.attributes("type")).toBe("range");
        expect(axes[0]?.attributes("aria-label")).toBe("Saturation");
        expect(axes[1]?.attributes("aria-label")).toBe("Brightness");
    });

    it("has a hue slider and an opacity slider, both labelled", () => {
        const view = mountPicker("#ff0000");
        const labels = view
            .findAll(".mb-color-picker__slider input")
            .map((input) => input.attributes("aria-label"));

        expect(labels).toEqual(["Hue", "Opacity"]);
    });

    it("writes a new colour when an axis moves", async () => {
        const view = mountPicker("#ff0000");
        const saturation = view.findAll(".mb-color-picker__axis")[0];

        await saturation?.setValue("50");
        await saturation?.trigger("input");

        const emitted = lastEmitted(view);
        expect(emitted).not.toBeNull();
        expect(emitted).not.toBe("#ff0000");
    });

    it("keeps the hue when the colour is dragged to black, rather than resetting to red", async () => {
        // Hue is undefined at zero brightness, so deriving it from the colour on every render
        // would throw the user's choice away at the bottom edge of the field and hand back red
        // when they dragged out again.
        const view = mountPicker("hsl(210 100% 50%)");
        const brightness = view.findAll(".mb-color-picker__axis")[1];

        await brightness?.setValue("0");
        await brightness?.trigger("input");
        await brightness?.setValue("80");
        await brightness?.trigger("input");

        const emitted = lastEmitted(view) ?? "";
        expect(emitted).toContain("hsl(210");
    });
});

describe("typing a colour", () => {
    it("accepts any notation and writes it back", async () => {
        const view = mountPicker("#ff0000");
        const field = view.find(".mb-color-picker__raw input");

        await field.setValue("rebeccapurple");
        await field.trigger("blur");

        expect(lastEmitted(view)).toBe("#663399");
    });

    it("reports a value it cannot read instead of falling back to black", async () => {
        const view = mountPicker("#ff0000");
        const field = view.find(".mb-color-picker__raw input");

        await field.setValue("chartruse");
        await field.trigger("blur");

        // Nothing was emitted, so the stored colour is untouched, and the field says why.
        expect(lastEmitted(view)).toBeNull();
        expect(view.text()).toContain("not a colour");
    });

    it("keeps an unreadable stored value on screen rather than replacing it", () => {
        const view = mountPicker("chartruse");
        expect((view.find(".mb-color-picker__raw input").element as HTMLInputElement).value).toBe(
            "chartruse",
        );
    });

    it("treats an empty value as inherit rather than as black", async () => {
        const view = mountPicker("#ff0000");
        const field = view.find(".mb-color-picker__raw input");

        await field.setValue("");
        await field.trigger("blur");

        expect(lastEmitted(view)).toBe("");
    });
});

describe("the translator", () => {
    it("lists every notation, including the one with nothing to say", () => {
        const view = mountPicker("#123456");
        const rows = view.findAll(".mb-color-picker__row");

        expect(rows).toHaveLength(11);
        expect(view.text()).toContain("no CSS keyword");
    });

    it("shows the keyword when there is one", () => {
        expect(mountPicker("#663399").text()).toContain("rebeccapurple");
    });

    it("filters the rows from its own search bar", async () => {
        const view = mountPicker("#123456");
        await view.find(".mb-config-search input").setValue("OKLCH");
        await nextTick();

        const rows = view.findAll(".mb-color-picker__row");
        expect(rows).toHaveLength(1);
        expect(rows[0]?.text()).toContain("oklch(");
    });

    it("changes the saved notation without changing the colour", async () => {
        const view = mountPicker("#ff0000");
        const oklch = view
            .findAll(".mb-color-picker__row")
            .find((row) => row.text().includes("oklch("));

        // The "Use" button on the OKLCH row.
        await oklch?.findAll("button").at(-1)?.trigger("click");

        const emitted = lastEmitted(view) ?? "";
        expect(emitted.startsWith("oklch(")).toBe(true);
        // Still red: only the notation moved.
        expect(emitted).toContain("29.2");
    });
});

describe("a colour sRGB cannot show", () => {
    it("says which gamut it is in", () => {
        expect(mountPicker("oklch(0.9 0.35 140)").text()).toContain("Outside");
        expect(mountPicker("#ff0000").text()).toContain("sRGB");
    });

    it("warns before writing a notation that would clip it", () => {
        const view = mountPicker("oklch(0.9 0.35 140)");
        expect(view.text()).toContain("outside sRGB");
        expect(view.text()).toContain("Save the clipped value anyway");
    });

    it("refuses to write a clipping notation silently, and says which one it used", async () => {
        // The whole point. The user asked for hexadecimal; hexadecimal cannot hold this
        // colour; the picker writes OKLCH and says so rather than writing a different colour
        // under the notation that was requested.
        const view = mountPicker("oklch(0.9 0.35 140)");
        const hexRow = view
            .findAll(".mb-color-picker__row")
            .find((row) => row.text().includes("Hexadecimal"));

        expect(hexRow?.text()).toContain("Clipped");

        await hexRow?.findAll("button").at(-1)?.trigger("click");
        expect((lastEmitted(view) ?? "").startsWith("oklch(")).toBe(true);
    });

    it("writes the clipped value once the user asks for it explicitly", async () => {
        // Two steps, because that is the real flow: choose hexadecimal, be told it cannot
        // hold this colour, then say to go ahead. The override is a decision the user makes
        // knowing what it costs, which is the difference between this and clipping silently.
        const view = mountPicker("oklch(0.9 0.35 140)");
        const hexRow = view
            .findAll(".mb-color-picker__row")
            .find((row) => row.text().includes("Hexadecimal"));

        await hexRow?.findAll("button").at(-1)?.trigger("click");
        expect((lastEmitted(view) ?? "").startsWith("oklch(")).toBe(true);

        const override = view
            .findAll("button")
            .find((button) => button.text().includes("clipped value anyway"));
        await override?.trigger("click");
        await nextTick();

        expect((lastEmitted(view) ?? "").startsWith("#")).toBe(true);
    });
});

describe("numeric entry", () => {
    it("offers the components of the notation being used, not only red green and blue", async () => {
        const view = mountPicker("oklch(0.6 0.15 250)");
        const labels = view
            .findAll(".mb-color-picker__number label")
            .map((node) => node.text());

        expect(labels.join(" ")).toContain("Lightness");
        expect(labels.join(" ")).toContain("Chroma");
        expect(labels.join(" ")).toContain("Hue");
    });

    it("rebuilds the colour from a component the user typed", async () => {
        const view = mountPicker("rgb(10 20 30)");
        const red = view.findAll(".mb-color-picker__number input")[0];

        await red?.setValue("200");

        expect(lastEmitted(view)).toContain("200");
    });
});

describe("the eyedropper", () => {
    it("is absent rather than dead where the platform has none", () => {
        // A button that cannot do its job is a decorative control, and the rest of this panel
        // is the alternative rather than a missing capability worth apologising for.
        const view = mountPicker("#ff0000");
        expect(view.text()).not.toContain("Pick from the screen");
    });

    it("appears where the platform has one", () => {
        const globals = globalThis as { EyeDropper?: unknown };
        globals.EyeDropper = class {
            open(): Promise<{ sRGBHex: string }> {
                return Promise.resolve({ sRGBHex: "#00ff00" });
            }
        };
        try {
            expect(mountPicker("#ff0000").text()).toContain("Pick from the screen");
        } finally {
            delete globals.EyeDropper;
        }
    });
});
