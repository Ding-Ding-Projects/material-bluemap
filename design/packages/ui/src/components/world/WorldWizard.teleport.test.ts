// @vitest-environment jsdom

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { findField } from "@worldlens/config";
import WorldWizard from "./WorldWizard.vue";
import type { MapWizard } from "./wizardModel.js";
import { mapDescriptor } from "./wizardSteps.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.scrollIntoView = () => {};
    globalThis.matchMedia = ((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    })) as unknown as typeof matchMedia;
    if (globalThis.CSS === undefined) Object.defineProperty(globalThis, "CSS", { value: {} });
    if (CSS.escape === undefined) CSS.escape = (value: string) => value;
});

const vuetify = createVuetify({ components, directives });
const revealField = vi.fn(async (_path: string) => true);
const MapOptionsStepStub = defineComponent({
    name: "MapOptionsStep",
    setup(_props, { expose }) {
        expose({ revealField });
        return () => h("div", "Options step");
    },
});

beforeEach(() => revealField.mockClear());

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

function mountWizard() {
    return mount(WorldWizard, {
        attachTo: document.body,
        props: { canInspect: false, canRender: false },
        global: {
            plugins: [vuetify, i18n()],
            stubs: { MapOptionsStep: MapOptionsStepStub },
        },
    });
}

function wizardOf(wrapper: ReturnType<typeof mountWizard>): MapWizard {
    return (wrapper.vm as unknown as { wizard: MapWizard }).wizard;
}

describe("Teleport to setting", () => {
    it("calls the options step's typed reveal route with the exact blocking issue path", async () => {
        const wrapper = mountWizard();
        const wizard = wizardOf(wrapper);
        wizard.setWorld("C:/saves/Survival");
        wizard.displayName.value = "Survival";
        wizard.mapId.value = "survival";
        const field = findField(mapDescriptor(), "ambient-light");
        if (field === undefined) throw new Error("ambient-light is absent");
        wizard.setOption(field, "not a number");
        wizard.goTo("options");
        await flushPromises();

        const button = wrapper
            .findAll("button")
            .find((candidate) => candidate.text().includes("Teleport to setting"));
        expect(button).toBeDefined();
        expect(button?.attributes("aria-label")).toBe("Teleport to setting");
        await button?.trigger("click");
        await flushPromises();

        expect(revealField).toHaveBeenCalledWith("ambient-light");
        wrapper.unmount();
    });

    it("keeps a file-wide/no-path step problem text-only", async () => {
        const wrapper = mountWizard();
        await flushPromises();

        expect(wrapper.text()).toContain("Choose the world folder first.");
        expect(
            wrapper
                .findAll("button")
                .some((button) => button.text().includes("Teleport to setting")),
        ).toBe(false);
        wrapper.unmount();
    });
});
// @vitest-environment jsdom
