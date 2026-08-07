// @vitest-environment jsdom

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { openConfigFile } from "../config/configModel.js";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import MapOptionsStep from "./MapOptionsStep.vue";
import type { MapOptionsStepExpose } from "./MapOptionsStep.expose.js";
import { mapDescriptor, optionFields, optionGroups } from "./wizardSteps.js";

const vuetify = createVuetify({ components, directives });
const scrollIntoView = vi.fn();
let reducedMotion = false;

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = scrollIntoView;
    globalThis.matchMedia = ((query: string) => ({
        matches: query.includes("prefers-reduced-motion") && reducedMotion,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof matchMedia;
    if (globalThis.CSS === undefined) Object.defineProperty(globalThis, "CSS", { value: {} });
    if (CSS.escape === undefined) CSS.escape = (value: string) => value.replace(/["\\]/g, "\\$&");
});

afterEach(() => {
    reducedMotion = false;
    scrollIntoView.mockClear();
    document.body.innerHTML = "";
});

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

function mountStep() {
    return mount(MapOptionsStep, {
        attachTo: document.body,
        props: {
            file: openConfigFile(mapDescriptor(), "maps/overworld.conf", "ambient-light: 0\n"),
            changedCount: 0,
        },
        global: { plugins: [vuetify, i18n()] },
    });
}

function exposed(wrapper: ReturnType<typeof mountStep>): MapOptionsStepExpose {
    return wrapper.vm as unknown as MapOptionsStepExpose;
}

describe("revealField", () => {
    it("clears a hiding filter, reveals advanced, opens the group, scrolls, focuses, and highlights", async () => {
        const target = optionFields().find((field) => field.advanced);
        if (target === undefined) throw new Error("the map schema has no advanced option");
        const owner = optionGroups().find((group) =>
            group.fields.some((field) => field.path === target.path),
        );
        if (owner === undefined) throw new Error(`no group owns ${target.path}`);

        const wrapper = mountStep();
        wrapper
            .findComponent(ConfigSearchField)
            .vm.$emit("update:modelValue", "nothing matches this filter");
        await flushPromises();
        expect(wrapper.element.querySelector(`[data-field-path="${target.path}"]`)).toBeNull();

        await expect(exposed(wrapper).revealField(target.path)).resolves.toBe(true);
        await flushPromises();

        const element = (wrapper.element as HTMLElement).querySelector<HTMLElement>(
            `[data-field-path="${target.path}"]`,
        );
        expect(element).not.toBeNull();
        expect(element?.classList.contains("mb-config-field--highlight")).toBe(true);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
        expect(element?.contains(document.activeElement)).toBe(true);

        const groupButton = wrapper
            .findAll("button")
            .find((button) => button.text().includes(owner.label));
        expect(groupButton?.attributes("aria-expanded")).toBe("true");
        wrapper.unmount();
    });

    it("uses instant scrolling when reduced motion is requested", async () => {
        reducedMotion = true;
        const target = optionFields().find((field) => !field.advanced);
        if (target === undefined) throw new Error("the map schema has no everyday option");
        const wrapper = mountStep();

        await expect(exposed(wrapper).revealField(target.path)).resolves.toBe(true);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
        wrapper.unmount();
    });

    it("returns false without scrolling or focusing when the path has no owning setting", async () => {
        const wrapper = mountStep();
        const before = document.activeElement;

        await expect(exposed(wrapper).revealField("not-a-setting")).resolves.toBe(false);
        expect(scrollIntoView).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(before);
        wrapper.unmount();
    });
});
// @vitest-environment jsdom
