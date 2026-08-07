// @vitest-environment jsdom

/**
 * The two control behaviours that cannot be proved from the schema, mounted.
 *
 * `packages/config/test/controlPolicy.test.ts` proves that every setting is
 * *declared* with the right control. It cannot prove that the component then
 * renders that control, and the two failures worth guarding here are precisely
 * the ones a declaration test would smile at:
 *
 *  1. **A colour opens the app's one infinite picker**, and what that picker
 *     writes back reaches the file as the hex spelling BlueMap's own parser
 *     reads. The picker speaks CSS and emits whichever notation the user was
 *     working in; a config file that ends up holding `oklch(0.7 0.1 240)` is a
 *     config BlueMap refuses to load, and nothing about the control would look
 *     wrong on screen.
 *  2. **A value the option list cannot express survives being looked at.** This
 *     is the quiet one. Vuetify matches a select item by value, so a control
 *     bound to something no item holds renders empty - identical to an unset
 *     setting - and the next interaction writes the emptiness back. A datapack
 *     dimension, a namespaced key spelled the other way, a resolution of 1.5:
 *     all legal, none in a list this app ships.
 *
 * Both are assertions about the rendered component rather than about a helper,
 * which is why they are mounted rather than unit-tested next door.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VCombobox } from "vuetify/components";
import type { Control, PlainValue } from "@worldlens/config";
import { descriptorFor } from "@worldlens/config";
import ConfigControl from "./ConfigControl.vue";
import ColorField from "../appearance/ColorField.vue";
import PathField from "../PathField.vue";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size and media observers are
    // absent and the mount throws before any assertion runs.
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

/** No messages at all, which is the state the app renders in until a locale loads. */
function emptyI18n() {
    return createI18n({ legacy: false, locale: "none", fallbackLocale: "none", silentFallbackWarn: true, missingWarn: false, fallbackWarn: false, messages: {} });
}

function mountControl(control: Control, modelValue: PlainValue, resetValue: PlainValue = null, label = "Test setting") {
    const host = defineComponent({
        setup: () => () => h(VApp, () => [h(ConfigControl, { control, modelValue, label, resetValue })]),
    });
    return mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
}

/** The control the schema really declares, so these tests cannot drift from it. */
function controlFor(file: "map" | "storage-file" | "storage-sql" | "webapp", path: string): Control {
    const field = descriptorFor(file).fields.find((candidate) => candidate.path === path);
    if (field === undefined) throw new Error(`${file}.${path} is not in the schema`);
    return field.control;
}

describe("a colour setting", () => {
    const skyColor = controlFor("map", "sky-color");

    it("opens the same infinite picker every other colour in the app opens", () => {
        const wrapper = mountControl(skyColor, "#7dabff");
        // Not "a colour picker": *this* one. A second, simpler picker for config
        // colours is exactly the shortcut the appearance contract forbids.
        expect(wrapper.findComponent(ColorField).exists()).toBe(true);
        expect(wrapper.text()).toContain("#7dabff");
    });

    it("writes back the hex spelling BlueMap reads, whatever notation the picker used", async () => {
        const wrapper = mountControl(skyColor, "#7dabff");
        await wrapper.findComponent(ColorField).vm.$emit("update:modelValue", "rgb(255 0 0)");

        const emitted = wrapper.findComponent(ConfigControl).emitted("update:modelValue");
        expect(emitted?.[0]).toEqual(["#ff0000"]);
    });

    it("keeps the alpha channel, because Color.parse reads the eighth byte", async () => {
        const wrapper = mountControl(skyColor, "#7dabff");
        await wrapper.findComponent(ColorField).vm.$emit("update:modelValue", "rgb(255 0 0 / 0.5)");

        const emitted = wrapper.findComponent(ConfigControl).emitted("update:modelValue");
        expect(emitted?.[0]?.[0]).toMatch(/^#ff0000[0-9a-f]{2}$/);
    });

    it("reads clearing as BlueMap's own default, which is the only thing it can honestly mean here", async () => {
        // The shared field's clear button means "inherit from the surface above",
        // a state a config file has no spelling for. Writing "" would produce a
        // file the schema then rejects.
        const wrapper = mountControl(skyColor, "#ff0000", "#7dabff");
        await wrapper.findComponent(ColorField).vm.$emit("update:modelValue", "");

        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")?.[0]).toEqual(["#7dabff"]);
    });

    it("keeps a colour it cannot read rather than replacing it with a guess", () => {
        const wrapper = mountControl(skyColor, "not a colour at all");
        // The text stays; the control says why BlueMap will refuse it. Normalising
        // it on sight would edit a setting the user never opened.
        expect(wrapper.text()).toContain("not a colour at all");
        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")).toBeUndefined();
    });
});

describe("a select bound to a value its options do not hold", () => {
    const storageType = controlFor("storage-file", "storage-type");
    const resolution = controlFor("webapp", "resolution-default");

    it("shows the option a differently-spelled key means, without rewriting the file", () => {
        // `bluemap:file` is the Java default and `file` is what the template
        // writes. Key.parse makes them the same value; a raw comparison does not.
        const wrapper = mountControl(storageType, "bluemap:file");
        const items = wrapper.findComponent(VCombobox).props("items") as { value: string; title: string }[];

        expect(items[0]).toMatchObject({ value: "bluemap:file", title: "File" });
        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")).toBeUndefined();
    });

    it("keeps an unlisted value visible instead of rendering an empty control", () => {
        const wrapper = mountControl(resolution, 1.5);
        const items = wrapper.findComponent(VCombobox).props("items") as { value: number; title: string }[];

        expect(items[0]?.value).toBe(1.5);
        expect(items.some((item) => item.value === 1)).toBe(true);
    });

    it("adds nothing when an option already holds the value verbatim", () => {
        const wrapper = mountControl(resolution, 2);
        const items = wrapper.findComponent(VCombobox).props("items") as { value: number }[];

        expect(items.map((item) => item.value)).toEqual([0.5, 1, 2]);
    });

    it("puts a number back as a number when free entry hands over a string", async () => {
        // `resolution-default` is a Java `float`. A combobox always returns text,
        // and writing "2" where the file wants 2 is the sort of thing HOCON
        // forgives and a reader does not.
        const wrapper = mountControl(resolution, 1);
        await wrapper.findComponent(VCombobox).vm.$emit("update:modelValue", "0.75");

        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")?.[0]).toEqual([0.75]);
    });

    it("leaves a non-numeric entry alone for the schema to report", async () => {
        const wrapper = mountControl(resolution, 1);
        await wrapper.findComponent(VCombobox).vm.$emit("update:modelValue", "huge");

        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")?.[0]).toEqual(["huge"]);
    });
});

describe("a format string", () => {
    it("offers its placeholders as chips, and appends the one that is chosen", async () => {
        const control = descriptorFor("webserver").fields.find((field) => field.path === "log.format")?.control;
        expect(control?.kind).toBe("text");

        const wrapper = mountControl(control as Control, "%1$s");
        expect(wrapper.text()).toContain("%3$s");

        const chips = wrapper.findAll(".mb-config-control__tokens .v-chip");
        expect(chips.length).toBe(7);

        await chips[2]?.trigger("click");
        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")?.[0]).toEqual(["%1$s%3$s"]);
    });
});

describe("a path setting", () => {
    // `world` is a directory picker with no extension filter; `driver-jar` is a file
    // picker scoped to `.jar`. Between them every branch of the folder-or-file mapping
    // this control hands to `PathField` gets exercised against the real schema.
    const worldFolder = controlFor("map", "world");
    const driverJar = controlFor("storage-sql", "driver-jar");

    afterEach(() => {
        delete (window as unknown as { worldlens?: unknown }).worldlens;
    });

    it("renders the one shared PathField, matched to the control's own folder-or-file semantic", () => {
        const folder = mountControl(worldFolder, "/srv/world", null, "World folder").findComponent(PathField);
        expect(folder.exists()).toBe(true);
        expect(folder.props("semantic")).toBe("folder");
        // The field's own label, "World folder", lowercased for "Browse for {field}" - the
        // visible label stays title case, passed through separately.
        expect(folder.props("field")).toBe("world folder");
        expect(folder.props("label")).toBe("World folder");

        const file = mountControl(driverJar, "", null, "Driver jar").findComponent(PathField);
        expect(file.props("semantic")).toBe("file");
        expect(file.props("extensions")).toEqual(["jar"]);
    });

    it("writes back exactly what PathField hands over, the same way every other control does", async () => {
        const wrapper = mountControl(worldFolder, "", null, "World folder");
        await wrapper.findComponent(PathField).vm.$emit("update:modelValue", "/picked/world");

        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")?.[0]).toEqual(["/picked/world"]);
    });

    it("browses through the real bridge end to end: a keyboard-operable button named for the field, writing the pick through to the model", async () => {
        (window as unknown as { worldlens: unknown }).worldlens = {
            dialog: {
                pickFolder: async () => "/picked/world",
                pickFile: async () => null,
            },
        };

        const wrapper = mountControl(worldFolder, "", null, "World folder");
        const button = wrapper.findAll("button").find((candidate) => candidate.attributes("aria-label") === "Browse for world folder");
        if (button === undefined) throw new Error("no browse button named for the field");
        expect(button.element.tagName).toBe("BUTTON");
        expect(button.attributes("disabled")).toBeUndefined();

        await button.trigger("click");
        await flushPromises();

        expect(wrapper.findComponent(ConfigControl).emitted("update:modelValue")?.[0]).toEqual(["/picked/world"]);
    });

    it("disables the button and explains why when there is no bridge, exactly as PathField documents", () => {
        const wrapper = mountControl(worldFolder, "", null, "World folder");
        const button = wrapper.findAll("button").find((candidate) => candidate.attributes("aria-label") === "Browse for world folder");
        if (button === undefined) throw new Error("no browse button named for the field");

        expect(button.attributes("disabled")).toBeDefined();
    });
});
