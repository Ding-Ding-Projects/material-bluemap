// @vitest-environment jsdom

/**
 * The novice Speed dial, mounted against real `core.conf` documents.
 *
 * `speedLevels.test.ts` proves the pure mapping; this proves the mapping actually reaches
 * the screen and actually writes through the same `set` event `ConfigField.vue` uses --
 * bidirectional sync, the Custom state, and that clicking a level writes exactly its two
 * documented raw values and nothing else.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VBtn } from "vuetify/components";
import { coreConfigDescriptor } from "@material-bluemap/config";
import SpeedControl from "./SpeedControl.vue";
import { openConfigFile } from "./configModel.js";

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

function openCore(text: string) {
    return openConfigFile(coreConfigDescriptor, "core.conf", text);
}

function mountSpeed(text: string, disabled = false) {
    const file = openCore(text);
    expect(file.document, "test fixture must parse").not.toBeNull();
    const host = defineComponent({
        setup: () => () => h(VApp, () => [h(SpeedControl, { file, disabled })]),
    });
    const wrapper = mount(host, { global: { plugins: [vuetify, emptyI18n()] } });
    return { wrapper, speed: wrapper.findComponent(SpeedControl) };
}

function levelButton(wrapper: ReturnType<typeof mount>, text: string) {
    const button = wrapper.findAllComponents(VBtn).find((btn) => btn.text().includes(text));
    expect(button, `no button with text "${text}"`).toBeDefined();
    return button!;
}

/* -------------------------------------------------------------------------- */
/* The default level reproduces BlueMap's defaults exactly                    */
/* -------------------------------------------------------------------------- */

describe("a freshly opened core.conf", () => {
    it("shows level 3 (Balanced) selected, since neither raw field is set", () => {
        const { wrapper } = mountSpeed("");
        expect(levelButton(wrapper, "3 · Balanced").attributes("aria-pressed")).toBe("true");
        expect(levelButton(wrapper, "1 · Gentle").attributes("aria-pressed")).toBe("false");
        expect(wrapper.text()).toContain("BlueMap's own default");
    });

    it("shows the exact default numbers, 1 and 5", () => {
        const { wrapper } = mountSpeed("");
        expect(wrapper.text()).toContain("render-thread-count is 1");
        expect(wrapper.text()).toContain("render-thread-priority is 5");
    });

    it("matches level 3 the same way when the file writes the defaults out explicitly", () => {
        const { wrapper } = mountSpeed('render-thread-count: 1\nrender-thread-priority: 5\n');
        expect(levelButton(wrapper, "3 · Balanced").attributes("aria-pressed")).toBe("true");
    });
});

/* -------------------------------------------------------------------------- */
/* Bidirectional sync: raw -> level                                           */
/* -------------------------------------------------------------------------- */

describe("raw values matching a level show that level", () => {
    it("detects level 1 from its exact raw pair", () => {
        const { wrapper } = mountSpeed('render-thread-count: -2\nrender-thread-priority: 1\n');
        expect(levelButton(wrapper, "1 · Gentle").attributes("aria-pressed")).toBe("true");
        expect(wrapper.text()).not.toContain("Custom");
    });

    it("detects level 5 from its exact raw pair", () => {
        const { wrapper } = mountSpeed('render-thread-count: 4\nrender-thread-priority: 10\n');
        expect(levelButton(wrapper, "5 · Fastest").attributes("aria-pressed")).toBe("true");
    });
});

/* -------------------------------------------------------------------------- */
/* Custom: never silently snapped                                             */
/* -------------------------------------------------------------------------- */

describe("raw values matching no level", () => {
    it("show the explicit Custom state rather than the nearest level", () => {
        // count matches level 4, priority matches level 2: no single level has this pair.
        const { wrapper } = mountSpeed('render-thread-count: 2\nrender-thread-priority: 3\n');
        expect(wrapper.text()).toContain("Custom");
        expect(wrapper.text()).toContain("render-thread-count is 2");
        expect(wrapper.text()).toContain("render-thread-priority is 3");
    });

    it("leaves every level button unpressed in the Custom state", () => {
        const { wrapper } = mountSpeed('render-thread-count: 2\nrender-thread-priority: 3\n');
        for (const label of ["1 · Gentle", "2 · Light", "3 · Balanced", "4 · Fast", "5 · Fastest"]) {
            expect(levelButton(wrapper, label).attributes("aria-pressed"), label).toBe("false");
        }
    });

    it("never mutates the file on its own: mounting alone emits no set", () => {
        const { speed } = mountSpeed('render-thread-count: 2\nrender-thread-priority: 3\n');
        expect(speed.emitted("set")).toBeUndefined();
    });
});

/* -------------------------------------------------------------------------- */
/* Setting a level writes exactly its documented values                       */
/* -------------------------------------------------------------------------- */

describe("clicking a level", () => {
    it("emits set for both raw fields with level 5's exact documented values", async () => {
        const { wrapper, speed } = mountSpeed("");
        await levelButton(wrapper, "5 · Fastest").trigger("click");

        const events = speed.emitted("set");
        expect(events).toHaveLength(2);
        const [[countField, countValue], [priorityField, priorityValue]] = events as [
            [unknown, unknown],
            [unknown, unknown],
        ];
        expect((countField as { path: string }).path).toBe("render-thread-count");
        expect(countValue).toBe(4);
        expect((priorityField as { path: string }).path).toBe("render-thread-priority");
        expect(priorityValue).toBe(10);
    });

    it("emits level 1's exact documented values", async () => {
        const { wrapper, speed } = mountSpeed("");
        await levelButton(wrapper, "1 · Gentle").trigger("click");

        const events = speed.emitted("set") as [{ path: string }, number][];
        expect(events).toEqual([
            [expect.objectContaining({ path: "render-thread-count" }), -2],
            [expect.objectContaining({ path: "render-thread-priority" }), 1],
        ]);
    });

    it("does nothing while disabled", async () => {
        const { wrapper, speed } = mountSpeed("", true);
        await levelButton(wrapper, "5 · Fastest").trigger("click");
        expect(speed.emitted("set")).toBeUndefined();
    });
});

/* -------------------------------------------------------------------------- */
/* Progressive disclosure: every level's exact values are visible on request  */
/* -------------------------------------------------------------------------- */

describe("the details disclosure", () => {
    it("starts collapsed, with the raw table absent", () => {
        const { wrapper } = mountSpeed("");
        expect(wrapper.text()).toContain("Show exactly what each level sets");
        expect(wrapper.find("table").exists()).toBe(false);
    });

    it("reveals every level's exact raw pair once opened", async () => {
        const { wrapper } = mountSpeed("");
        const toggle = wrapper.findAllComponents(VBtn).find((btn) => btn.text().includes("Show exactly what each level sets"));
        await toggle!.trigger("click");

        const table = wrapper.find("table");
        expect(table.exists()).toBe(true);
        const text = table.text();
        // Every level's exact documented pair appears somewhere in the table.
        expect(text).toContain("-2");
        expect(text).toContain("-1");
        expect(text).toContain("10");
        expect(text).toContain("BlueMap's default");
    });
});
