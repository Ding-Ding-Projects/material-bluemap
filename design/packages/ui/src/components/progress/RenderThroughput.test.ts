// @vitest-environment jsdom

/**
 * The throughput readout, mounted.
 *
 * `throughputModel.test.ts` proves the rate math; this proves it actually reaches the
 * screen as the render's own overall percent moves - the evidence a dragged speed level
 * is supposed to produce.
 */

import { beforeAll, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import RenderThroughput from "./RenderThroughput.vue";
import { EMPTY_FACTS } from "./progressModel.js";
import type { ProgressFacts } from "./progressModel.js";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify();

function emptyI18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
}

function factsAt(percent: number): ProgressFacts {
    return {
        ...EMPTY_FACTS,
        active: true,
        levels: [{ id: "overall", label: { key: "progress.level.overall", fallback: "Overall", values: {} }, detail: null, percent, count: null }],
    };
}

function mountThroughput(facts: ProgressFacts) {
    return mount(RenderThroughput, { props: { facts }, global: { plugins: [vuetify, emptyI18n()] } });
}

describe("RenderThroughput", () => {
    it("says there is not enough data yet before a second sample arrives", () => {
        const wrapper = mountThroughput(factsAt(10));
        expect(wrapper.text()).toContain("Not enough data yet");
    });

    it("shows a real rate once two samples far enough apart exist", async () => {
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
        const wrapper = mountThroughput(factsAt(0));
        nowSpy.mockReturnValue(60_000);
        await wrapper.setProps({ facts: factsAt(10) });
        await nextTick();
        expect(wrapper.text()).toContain("Moving at about");
        expect(wrapper.text()).toContain("%");
        nowSpy.mockRestore();
    });

    it("never shows a negative rate when percent briefly goes backwards", async () => {
        const nowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
        const wrapper = mountThroughput(factsAt(50));
        nowSpy.mockReturnValue(60_000);
        await wrapper.setProps({ facts: factsAt(40) });
        await nextTick();
        expect(wrapper.text()).not.toContain("-");
        nowSpy.mockRestore();
    });
});
