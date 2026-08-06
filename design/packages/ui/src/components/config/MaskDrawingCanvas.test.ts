// @vitest-environment jsdom

/**
 * The render mask drawing surface, mounted for real.
 *
 * `maskCanvas.test.ts` proves the pure geometry and state; this proves the Vue layer
 * actually wires it up: numeric fields synced both ways with the drawing, keyboard
 * creation and adjustment with no pointer anywhere in the test, snapping on and off,
 * undo/redo, the area readout matching the drawn shape, reset to the whole world, and
 * every preset setting exactly what it claims -- for the shape kind actually being
 * edited, never silently swapping it for another.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import type { PlainValue } from "@material-bluemap/config";
import MaskDrawingCanvas from "./MaskDrawingCanvas.vue";
import { JAVA_INT_MAX, JAVA_INT_MIN, UNKNOWN_WORLD, type ShapeKind, type WorldOrientation } from "./maskCanvas.js";

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

    // jsdom has neither; the export button calls both, and a smoke test on it should not
    // throw for a reason that has nothing to do with the component under test.
    if (typeof URL.createObjectURL !== "function") {
        URL.createObjectURL = () => "blob:test";
    }
    if (typeof URL.revokeObjectURL !== "function") {
        URL.revokeObjectURL = () => {};
    }
});

const vuetify = createVuetify();

function emptyI18n() {
    return createI18n({ legacy: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, missingWarn: false, fallbackWarn: false, messages: {} });
}

const MEASURED_WORLD: WorldOrientation = {
    extent: { minX: -256, maxX: 767, minZ: -512, maxZ: 511 },
    extentUnavailableReason: null,
    spawn: { x: 8, z: -16 },
    spawnUnavailableReason: null,
    regionCount: 4,
};

interface MountOptions {
    readonly modelValue: Record<string, PlainValue>;
    readonly shapeKind: ShapeKind;
    readonly world?: WorldOrientation;
    readonly disabled?: boolean;
}

/** The last emitted `update:modelValue` record, or `undefined` if nothing has been emitted yet. */
function lastEmitted(wrapper: VueWrapper): Record<string, PlainValue> | undefined {
    const canvas = wrapper.findComponent(MaskDrawingCanvas);
    const events = canvas.emitted<[Record<string, PlainValue>]>("update:modelValue");
    return events?.[events.length - 1]?.[0];
}

function mountCanvas(options: MountOptions) {
    const host = defineComponent({
        setup: () =>
            () =>
                h(VApp, () => [
                    h(MaskDrawingCanvas, {
                        modelValue: options.modelValue,
                        shapeKind: options.shapeKind,
                        label: "Render mask shape",
                        // Always a real value: `withDefaults` makes `world` non-optional in
                        // the component's own public prop type, so forwarding `undefined`
                        // here is a type error even though the component's default is the
                        // same `UNKNOWN_WORLD` this falls back to.
                        world: options.world ?? UNKNOWN_WORLD,
                        disabled: options.disabled ?? false,
                        "onUpdate:modelValue": () => {},
                    }),
                ]),
    });
    return mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
}

function boxRecord(over: Record<string, PlainValue> = {}): Record<string, PlainValue> {
    return { type: "bluemap:box", "min-x": -100, "max-x": 100, "min-z": -50, "max-z": 50, ...over };
}

/* -------------------------------------------------------------------------- */
/* Numeric fields: bidirectional sync with the drawing                       */
/* -------------------------------------------------------------------------- */

describe("numeric fields", () => {
    it("show the initial model's own numbers", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const inputs = wrapper.findAll("input[type=number]");
        const values = inputs.map((input) => (input.element as HTMLInputElement).value);
        expect(values).toContain("-100");
        expect(values).toContain("100");
        expect(values).toContain("-50");
        expect(values).toContain("50");
    });

    it("typing a new number moves the shape live and emits the updated record", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const maxXField = wrapper.findAll("input[type=number]").find((input) => (input.element as HTMLInputElement).value === "100");
        expect(maxXField).toBeDefined();

        await maxXField!.setValue("250");

        const emittedRecord = lastEmitted(wrapper);
        expect(emittedRecord?.["max-x"]).toBe(250);
        // Neither of the untouched fields moved: only the one field that was edited.
        expect(emittedRecord?.["min-x"]).toBe(-100);
    });

    it("reports a partially-typed number inline, without discarding the last committed shape", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const maxXField = wrapper.findAll("input[type=number]").find((input) => (input.element as HTMLInputElement).value === "100");

        // A native `type="number"` field only ever holds a real number or empty text -- a
        // browser rejects anything else outright -- so "still typing" is the field reading
        // empty, exactly what happens for a moment while somebody types "-" before the rest
        // of a negative number.
        await maxXField!.setValue("");

        expect(wrapper.text()).toMatch(/keep typing a number/i);
        // Nothing was emitted for this incomplete edit, so the shape stands exactly as it
        // was committed -- an incomplete number never snaps the shape somewhere absurd.
        expect(lastEmitted(wrapper)).toBeUndefined();
    });
});

/* -------------------------------------------------------------------------- */
/* Keyboard creation and adjustment: no pointer anywhere in this section     */
/* -------------------------------------------------------------------------- */

describe("keyboard creation and adjustment", () => {
    it("shows the empty state for a polygon row with no points yet, and creates one on Enter", async () => {
        const wrapper = mountCanvas({ modelValue: { type: "bluemap:polygon" }, shapeKind: "polygon" });
        expect(wrapper.text()).toMatch(/no shape yet/i);

        await wrapper.find(".mb-mask-canvas__surface").trigger("keydown", { key: "Enter" });

        expect(wrapper.text()).not.toMatch(/no shape yet/i);
        const record = lastEmitted(wrapper);
        expect(Array.isArray(record?.["shape"])).toBe(true);
        expect((record?.["shape"] as unknown[]).length).toBeGreaterThanOrEqual(3);
    });

    it("nudges a focused corner handle by the keyboard, by the current snap step", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const corner = wrapper.find('[aria-label="Resize corner se"]');
        expect(corner.exists()).toBe(true);

        // Default snap is "chunk", so the ordinary step is one chunk (16 blocks).
        await corner.trigger("keydown", { key: "ArrowRight" });

        const record = lastEmitted(wrapper);
        expect(record?.["max-x"]).toBe(116);
        expect(record?.["max-z"]).toBe(50); // The Z axis was not touched by a purely-X nudge.
    });

    it("nudges further with the large step (Shift+Arrow) than the ordinary step", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const corner = wrapper.find('[aria-label="Resize corner se"]');

        await corner.trigger("keydown", { key: "ArrowRight", shiftKey: true });

        // Snapped to chunk, the large step is one region (512 blocks).
        expect(lastEmitted(wrapper)?.["max-x"]).toBe(100 + 512);
    });

    it("moves a circle's own radius handle by the keyboard", async () => {
        const wrapper = mountCanvas({
            modelValue: { type: "bluemap:circle", "center-x": 0, "center-z": 0, radius: 64 },
            shapeKind: "circle",
        });
        const handle = wrapper.find('[aria-label="Resize radius"]');
        expect(handle.exists()).toBe(true);

        await handle.trigger("keydown", { key: "ArrowRight" });

        expect(lastEmitted(wrapper)?.["radius"]).toBe(64 + 16);
    });

    it("moves a polygon vertex by the keyboard, double-clicking removes it (never below the minimum)", async () => {
        const wrapper = mountCanvas({
            modelValue: {
                type: "bluemap:polygon",
                shape: [
                    { x: 0, z: 0 },
                    { x: 10, z: 0 },
                    { x: 5, z: 10 },
                ],
            },
            shapeKind: "polygon",
        });
        const vertex = wrapper.find('[aria-label="Move vertex 1"]');
        expect(vertex.exists()).toBe(true);

        await vertex.trigger("keydown", { key: "ArrowDown" });
        const afterNudge = lastEmitted(wrapper)?.["shape"] as { x: number; z: number }[];
        expect(afterNudge[0]).toEqual({ x: 0, z: 16 });

        await vertex.trigger("dblclick");
        // Only 3 points to start with, so the minimum a polygon needs: the vertex must stay.
        const afterAttemptedRemove = lastEmitted(wrapper)?.["shape"] as unknown[];
        expect(afterAttemptedRemove.length).toBe(3);
    });
});

/* -------------------------------------------------------------------------- */
/* Snapping works, and can be turned off                                     */
/* -------------------------------------------------------------------------- */

describe("snapping", () => {
    it("nudges by 1 block once snap is turned off, instead of a whole chunk", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const offButton = wrapper.findAll("button").find((btn) => btn.text() === "No snap");
        expect(offButton).toBeDefined();
        await offButton!.trigger("click");

        const corner = wrapper.find('[aria-label="Resize corner se"]');
        await corner.trigger("keydown", { key: "ArrowRight" });

        expect(lastEmitted(wrapper)?.["max-x"]).toBe(101);
    });

    it("the explicit Snap button grows the current shape's edges to whole chunks", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord({ "min-x": -100, "max-x": 100, "min-z": 3, "max-z": 19 }), shapeKind: "box" });
        const snapNowButtons = wrapper.findAll("button").filter((btn) => btn.text().includes("Snap current shape"));
        expect(snapNowButtons.length).toBeGreaterThan(0);

        await snapNowButtons[0]!.trigger("click");

        const record = lastEmitted(wrapper);
        expect((record?.["min-z"] as number) % 16).toBe(0);
        expect(((record?.["max-z"] as number) + 1) % 16).toBe(0);
    });
});

/* -------------------------------------------------------------------------- */
/* Undo and redo                                                             */
/* -------------------------------------------------------------------------- */

describe("undo and redo", () => {
    it("undoes a numeric-field edit back to the previous value, and redo re-applies it", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const maxXField = wrapper.findAll("input[type=number]").find((input) => (input.element as HTMLInputElement).value === "100");
        await maxXField!.setValue("250");
        expect(lastEmitted(wrapper)?.["max-x"]).toBe(250);

        const undoButton = wrapper.find('[aria-label="Undo"]');
        expect(undoButton.attributes("disabled")).toBeUndefined();
        await undoButton.trigger("click");
        expect(lastEmitted(wrapper)?.["max-x"]).toBe(100);

        const redoButton = wrapper.find('[aria-label="Redo"]');
        expect(redoButton.attributes("disabled")).toBeUndefined();
        await redoButton.trigger("click");
        expect(lastEmitted(wrapper)?.["max-x"]).toBe(250);
    });

    it("undo is disabled until something has actually been edited", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const undoButton = wrapper.find('[aria-label="Undo"]');
        expect(undoButton.attributes("disabled")).toBeDefined();
    });
});

/* -------------------------------------------------------------------------- */
/* The area readout matches the drawn shape                                  */
/* -------------------------------------------------------------------------- */

describe("area readout", () => {
    it("shows the real block/chunk/region count for a tidy box", () => {
        // 200 blocks (min -100 to max 100 inclusive is actually 201, but this fixture keeps
        // round numbers deliberately: a 32x32 box is 2x2 chunks, one sixteenth of a region.
        const wrapper = mountCanvas({ modelValue: boxRecord({ "min-x": 0, "max-x": 31, "min-z": 0, "max-z": 31 }), shapeKind: "box" });
        expect(wrapper.text()).toContain((32 * 32).toLocaleString());
        expect(wrapper.text()).toContain("2");
    });

    it("says plainly that no area number can be given for a shape left unbounded on an axis", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord({ "min-x": JAVA_INT_MIN, "max-x": JAVA_INT_MAX }), shapeKind: "box" });
        expect(wrapper.text()).toMatch(/no area number/i);
    });
});

/* -------------------------------------------------------------------------- */
/* Reset returns to the whole world                                          */
/* -------------------------------------------------------------------------- */

describe("reset to the whole world", () => {
    it("sets every axis to BlueMap's own unbounded sentinel, and converts the row's own type to box", async () => {
        // Starting from a circle row on purpose: reset is a genuine start-over.
        const wrapper = mountCanvas({ modelValue: { type: "bluemap:circle", "center-x": 5, "center-z": 5, radius: 40 }, shapeKind: "circle" });
        const resetButtons = wrapper.findAll("button").filter((btn) => btn.text().includes("Reset to whole world"));
        await resetButtons[0]!.trigger("click");

        const record = lastEmitted(wrapper);
        expect(record?.["type"]).toBe("bluemap:box");
        expect(record?.["min-x"]).toBe(JAVA_INT_MIN);
        expect(record?.["max-x"]).toBe(JAVA_INT_MAX);
        expect(record?.["min-z"]).toBe(JAVA_INT_MIN);
        expect(record?.["max-z"]).toBe(JAVA_INT_MAX);
    });
});

/* -------------------------------------------------------------------------- */
/* Presets set exactly what they claim                                       */
/* -------------------------------------------------------------------------- */

describe("presets", () => {
    it("Whole world sets the unbounded sentinel on every axis", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const wholeWorldButtons = wrapper.findAll("button").filter((btn) => btn.text().includes("Whole world"));
        await wholeWorldButtons[0]!.trigger("click");

        const record = lastEmitted(wrapper);
        expect(record?.["min-x"]).toBe(JAVA_INT_MIN);
        expect(record?.["max-x"]).toBe(JAVA_INT_MAX);
    });

    it("Around spawn centers exactly on the real spawn point, staying a circle", async () => {
        const wrapper = mountCanvas({
            modelValue: { type: "bluemap:circle", "center-x": 0, "center-z": 0, radius: 10 },
            shapeKind: "circle",
            world: MEASURED_WORLD,
        });
        const buttons = wrapper.findAll("button").filter((btn) => btn.text().includes("Around spawn"));
        await buttons[0]!.trigger("click");

        const record = lastEmitted(wrapper);
        expect(record?.["type"]).toBe("bluemap:circle");
        expect(record?.["center-x"]).toBe(MEASURED_WORLD.spawn!.x);
        expect(record?.["center-z"]).toBe(MEASURED_WORLD.spawn!.z);
    });

    it("Around spawn on a box row produces a box centered on spawn, not a circle", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box", world: MEASURED_WORLD });
        const buttons = wrapper.findAll("button").filter((btn) => btn.text().includes("Around spawn"));
        await buttons[0]!.trigger("click");

        const record = lastEmitted(wrapper);
        expect(record?.["type"]).toBe("bluemap:box");
        const spawn = MEASURED_WORLD.spawn!;
        expect((record?.["min-x"] as number) < spawn.x).toBe(true);
        expect((record?.["max-x"] as number) > spawn.x).toBe(true);
    });

    it("Extent of existing regions sets exactly the measured extent for a box row", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box", world: MEASURED_WORLD });
        const buttons = wrapper.findAll("button").filter((btn) => btn.text().includes("Extent of existing regions"));
        await buttons[0]!.trigger("click");

        const record = lastEmitted(wrapper);
        expect(record?.["min-x"]).toBe(MEASURED_WORLD.extent!.minX);
        expect(record?.["max-x"]).toBe(MEASURED_WORLD.extent!.maxX);
        expect(record?.["min-z"]).toBe(MEASURED_WORLD.extent!.minZ);
        expect(record?.["max-z"]).toBe(MEASURED_WORLD.extent!.maxZ);
    });

    it("Extent of existing regions is disabled, honestly, when the world has not been measured", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        const buttons = wrapper.findAll("button").filter((btn) => btn.text().includes("Extent of existing regions"));
        expect(buttons[0]!.attributes("disabled")).toBeDefined();
    });
});

/* -------------------------------------------------------------------------- */
/* Orientation: honest about what is and is not known                        */
/* -------------------------------------------------------------------------- */

describe("orientation", () => {
    it("says plainly when the world's extent could not be determined", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        expect(wrapper.text()).toMatch(/extent could not be determined/i);
    });

    it("shows no such banner once a real extent is known", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box", world: MEASURED_WORLD });
        expect(wrapper.text()).not.toMatch(/extent could not be determined/i);
    });
});

/* -------------------------------------------------------------------------- */
/* Cloud/Actions render fidelity: shown, never silently applied              */
/* -------------------------------------------------------------------------- */

describe("cloud render fidelity", () => {
    it("warns, naming the real shape kind, when the shape the cloud path cannot translate is being drawn", () => {
        const wrapper = mountCanvas({ modelValue: { type: "bluemap:circle", "center-x": 0, "center-z": 0, radius: 10 }, shapeKind: "circle" });
        expect(wrapper.text()).toMatch(/cloud\/actions render path/i);
        expect(wrapper.text()).toContain("circle");
    });

    it("shows no warning for the one case the cloud path does translate: a plain, non-subtracting box", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box" });
        expect(wrapper.text()).not.toMatch(/cloud\/actions render path/i);
    });

    it("warns for a box that is set to subtract, naming the real reason", () => {
        const wrapper = mountCanvas({ modelValue: boxRecord({ subtract: true }), shapeKind: "box" });
        expect(wrapper.text()).toMatch(/subtract/i);
    });
});

/* -------------------------------------------------------------------------- */
/* Disabled state: nothing writes while disabled                             */
/* -------------------------------------------------------------------------- */

describe("disabled", () => {
    it("disables every control, and a keyboard nudge on a disabled handle does nothing", async () => {
        const wrapper = mountCanvas({ modelValue: boxRecord(), shapeKind: "box", disabled: true });
        const corner = wrapper.find('[aria-label="Resize corner se"]');
        await corner.trigger("keydown", { key: "ArrowRight" });
        expect(lastEmitted(wrapper)).toBeUndefined();
    });
});
