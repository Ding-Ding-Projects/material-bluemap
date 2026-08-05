// @vitest-environment jsdom

/**
 * `SetupStorageStep.vue`, mounted on its own.
 *
 * The one claim only a rendered component can settle: the browse button is really the
 * shared `PathField.vue` affordance now, not the dead `canBrowse`/`browse` pair this step
 * used to gate on a preload method (`chooseMapStorageDirectory`) that no build ever
 * implemented. That means a pick has to reach the real dialog bridge and write straight
 * through the same `update:modelValue` event typing uses, and the button has to disable
 * itself honestly when there is no bridge at all - exactly the two things `PathField.vue`
 * itself is tested against in `PathField.test.ts`, proved again here through the field
 * that actually adopts it.
 *
 * The step's own behaviour that has nothing to do with the browse button - the "use the
 * default" action and the "this is the default" hint - is re-checked too, since both used
 * to live beside the old browse button and must not have moved or gone silent in the
 * rewrite.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import SetupStorageStep from "./SetupStorageStep.vue";
import { defaultMapStorageDir } from "./mapStorage.js";
import { memoryStorage, setSetupStorage } from "./setupPrefs.js";
import { reloadSetupLanguage } from "./setupI18n.js";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size/media observers throw on mount
    // without these, exactly as in PathField.test.ts and FirstRunSetup.test.ts.
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

    Element.prototype.scrollIntoView = (): void => {};
});

const vuetify = createVuetify();

function i18nPlugin() {
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

let wrapper: VueWrapper | null = null;

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    delete (globalThis as { materialBluemap?: unknown }).materialBluemap;
});

function mountStep(
    overrides: Partial<{
        modelValue: string;
        busy: boolean;
        problem: "empty" | "relative" | null;
    }> = {},
): VueWrapper {
    wrapper = mount(SetupStorageStep, {
        props: {
            modelValue: overrides.modelValue ?? "",
            platform: "linux",
            problem: overrides.problem ?? null,
            busy: overrides.busy ?? false,
        },
        global: { plugins: [vuetify, i18nPlugin()] },
    });
    return wrapper;
}

function browseButton(target: VueWrapper) {
    const found = target
        .findAll("button")
        .find((candidate) => (candidate.attributes("aria-label") ?? "").startsWith("Browse for"));
    if (found === undefined) {
        const seen = target.findAll("button").map((button) => button.attributes("aria-label"));
        throw new Error(`no browse button found. Seen aria-labels: ${JSON.stringify(seen)}`);
    }
    return found;
}

function buttonByText(target: VueWrapper, text: string) {
    const found = target
        .findAll("button")
        .find((candidate) => (candidate.text() ?? "").trim() === text);
    if (found === undefined) throw new Error(`no button labelled "${text}"`);
    return found;
}

describe("the browse button", () => {
    it("is the shared PathField affordance: a pick reaches the real dialog bridge and writes through v-model", async () => {
        const calls: Array<{ title: string; startIn?: string }> = [];
        (globalThis as { materialBluemap?: unknown }).materialBluemap = {
            dialog: {
                pickFolder: async (options: { title: string; startIn?: string }) => {
                    calls.push(options);
                    return "/picked/maps";
                },
                pickFile: async () => null,
            },
        };

        const view = mountStep({ modelValue: "/srv/existing/maps" });
        await browseButton(view).trigger("click");
        await view.vm.$nextTick();

        // The field's own title reaches the native dialog, and the current value seeds it -
        // the same contract PathField.test.ts proves in isolation.
        expect(calls).toEqual([{ title: "Choose the map storage folder", startIn: "/srv/existing/maps" }]);
        expect(view.emitted("update:modelValue")).toEqual([["/picked/maps"]]);
    });

    it("changes nothing on a cancelled pick, matching every other picker in the app", async () => {
        (globalThis as { materialBluemap?: unknown }).materialBluemap = {
            dialog: { pickFolder: async () => null, pickFile: async () => null },
        };

        const view = mountStep({ modelValue: "/keep/me" });
        await browseButton(view).trigger("click");
        await view.vm.$nextTick();

        expect(view.emitted("update:modelValue")).toBeUndefined();
    });

    it("disables itself and names the desktop-app boundary when there is no dialog bridge", () => {
        delete (globalThis as { materialBluemap?: unknown }).materialBluemap;

        const view = mountStep();
        const button = browseButton(view);
        expect(button.attributes("disabled")).toBeDefined();
        expect(button.attributes("aria-label")).toBe("Browse for the map storage folder");
    });
});

describe("typing", () => {
    it("still writes through update:modelValue exactly as before the migration", async () => {
        const view = mountStep();
        const input = view.find("input");
        await input.setValue("/typed/maps");

        expect(view.emitted("update:modelValue")).toEqual([["/typed/maps"]]);
    });
});

describe("the use-default action", () => {
    it("still emits useDefault, unaffected by the browse button's migration", async () => {
        const view = mountStep({ modelValue: "/somewhere/else" });
        await buttonByText(view, "Use the default").trigger("click");

        expect(view.emitted("useDefault")).toHaveLength(1);
    });

    it("is disabled once the value already is the default", () => {
        const view = mountStep({ modelValue: defaultMapStorageDir("linux") });
        expect(buttonByText(view, "Use the default").attributes("disabled")).toBeDefined();
    });
});

describe("the default hint", () => {
    it("shows once the value matches the platform default", () => {
        const view = mountStep({ modelValue: defaultMapStorageDir("linux") });
        expect(view.text()).toContain("Default");
    });

    it("stays off when the value has been changed away from the default", () => {
        const view = mountStep({ modelValue: "/srv/maps" });
        expect(view.find(".mb-setup-storage__hint").exists()).toBe(false);
    });
});

describe("validation messages", () => {
    it("still shows the empty-folder message, carried through PathField's error prop", () => {
        const view = mountStep({ modelValue: "", problem: "empty" });
        expect(view.text()).toContain("A folder is needed");
    });
});
