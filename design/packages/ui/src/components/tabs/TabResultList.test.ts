// @vitest-environment jsdom

/**
 * `TabResultList.vue`, mounted -- what `tabSearch.test.ts` next door cannot prove about a
 * plain function, which is that a search hit actually renders with a real, hoverable full
 * name rather than only whatever `.mb-tabs-results__label`'s `text-overflow: ellipsis`
 * leaves on screen.
 *
 * Shared by the strip search, the master search and (via `TabFinder.vue`) the whole tab
 * discovery surface, so a defect here is a defect in all three at once.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { VApp } from "vuetify/components";
import TabResultList from "./TabResultList.vue";
import tabResultListSource from "./TabResultList.vue?raw";
import type { TabHit } from "./tabSearch.js";

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

const vuetify = createVuetify({ components, directives });

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

function hit(overrides: Partial<TabHit> = {}): TabHit {
    return {
        tabId: "t1",
        label: "Settings",
        windowId: "w1",
        windowLabel: "Worldlens",
        stripId: "s1",
        stripLabel: "Main",
        groupId: null,
        groupName: null,
        groupCollapsed: false,
        pinned: false,
        index: 0,
        ...overrides,
    };
}

let wrapper: VueWrapper | null = null;

function mountList(hits: readonly TabHit[]): VueWrapper {
    const Host = defineComponent({
        setup() {
            return () =>
                h(VApp, null, {
                    default: () => [h(TabResultList, { hits, emptyMessage: "No matches" })],
                });
        },
    });
    wrapper = mount(Host, { global: { plugins: [vuetify, i18n] } }) as VueWrapper;
    return wrapper;
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

describe("a search result row's label", () => {
    /**
     * Regression: `.mb-tabs-results__label` sets `overflow: hidden; text-overflow:
     * ellipsis; white-space: nowrap` with no width cap of its own, so it truncates
     * silently the moment the label plus the row's chips and action buttons no longer
     * fit `TabFinder.vue`'s own `max-width: 460px` popover. `TabButton.vue` -- the tab
     * strip's own button, showing the exact same `label` field -- already solves this
     * with a native `title`; this row had nothing, so the part the ellipsis ate was
     * genuinely unrecoverable for a sighted user (a screen reader still gets it, since
     * the button's own accessible name is its text content).
     */
    it("carries the full label as a native title even once the row truncates it", () => {
        const longLabel =
            "Overworld render configuration for the survival server backups · 生存伺服器備份用嘅 Overworld 渲染設定檔";
        mountList([hit({ label: longLabel })]);
        const button = (wrapper as VueWrapper).find(".mb-tabs-results__go");
        expect(button.exists()).toBe(true);
        expect(button.attributes("title")).toBe(longLabel);
        expect(button.text()).toContain(longLabel);
    });

    it("renders a short label as-is, with the same title contract", () => {
        mountList([hit({ label: "Settings" })]);
        const button = (wrapper as VueWrapper).find(".mb-tabs-results__go");
        expect(button.attributes("title")).toBe("Settings");
        expect(button.text()).toContain("Settings");
    });
});

describe("the label rule that produces that ellipsis", () => {
    /**
     * Regression: the label span is a flex item inside Vuetify's `.v-btn__content`, and a
     * flex item's default `min-width: auto` refuses to shrink below its content -- so the
     * rule's `text-overflow: ellipsis` never fired, and `.v-btn`'s own overflow hard-clipped
     * the label mid-glyph with no ellipsis at all. `min-width: 0` is the shrink floor that
     * lets the ellipsis actually paint; `.mb-tabs-strip__label` in `TabStrip.vue` already
     * sets the same floor on the strip's own labels.
     *
     * Asserted against the component source because this workspace's `vitest.config.ts`
     * does not enable `test.css`, so no stylesheet reaches a mounted component and the
     * cascade the mounted tests above run under is not observable here.
     */
    it("lets the span shrink so the ellipsis can actually fire", () => {
        const rule = /\.mb-tabs-results__label\s*\{[^}]*\}/.exec(tabResultListSource)?.[0] ?? "";
        const declarations = rule.replace(/\/\*[\s\S]*?\*\//g, "");
        expect(declarations).not.toBe("");
        expect(declarations).toContain("min-width: 0");
        expect(declarations).toContain("overflow: hidden");
        expect(declarations).toContain("text-overflow: ellipsis");
        expect(declarations).toContain("white-space: nowrap");
    });
});
