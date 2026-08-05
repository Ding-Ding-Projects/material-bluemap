// @vitest-environment jsdom

/**
 * `NotificationDurationRow.vue`, mounted: that it shows level 3 (Balanced) preselected on
 * a fresh profile, that clicking a level genuinely changes what the shared `notices` queue
 * gives a freshly raised toast - not merely that a button looks pressed - and that Reset
 * puts it back. `noticeDurationLevels.test.ts` and `notifications.test.ts` already prove
 * the underlying rules; this file is the wiring between the buttons on screen and that
 * shared state, the same split every other settings row in this package draws.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { dismissAll, notify } from "../config/notifications.js";
import { DEFAULT_NOTICE_DURATION_LEVEL } from "../config/noticeDurationLevels.js";
import { changeNoticeDuration, notices, raiseNotice } from "../../stores/notices.js";
import NotificationDurationRow from "./NotificationDurationRow.vue";

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

    Element.prototype.scrollIntoView = () => {};
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

beforeEach(() => {
    changeNoticeDuration(DEFAULT_NOTICE_DURATION_LEVEL);
    dismissAll(notices);
    notices.history.length = 0;
});

afterEach(() => {
    changeNoticeDuration(DEFAULT_NOTICE_DURATION_LEVEL);
});

describe("the default view", () => {
    it("shows Balanced preselected, and Reset disabled because it is already the default", () => {
        const wrapper = mount(NotificationDurationRow, { global: { plugins: [vuetify, i18n] } });

        const balanced = wrapper.findAll("button").find((btn) => btn.text().startsWith("3 · Balanced"));
        expect(balanced?.attributes("aria-pressed")).toBe("true");

        const reset = wrapper.findAll("button").find((btn) => btn.text() === "Reset to Balanced");
        expect(reset?.attributes("disabled")).toBeDefined();

        wrapper.unmount();
    });
});

describe("choosing a level", () => {
    it("changes what the shared notice queue actually gives a freshly raised toast", async () => {
        const wrapper = mount(NotificationDurationRow, { global: { plugins: [vuetify, i18n] } });

        const persistent = wrapper.findAll("button").find((btn) => btn.text().startsWith("5 · Stay"));
        await persistent?.trigger("click");
        await wrapper.vm.$nextTick();

        // The row never calls `notify` itself - it only ever changes the queue's own
        // duration level, and this is the queue's own behaviour reacting to that.
        const notice = raiseNotice("info", "would have auto-dismissed before this level");
        expect(notice.timeout).toBeNull();

        wrapper.unmount();
    });

    it("also reaches notify() called directly, not only through raiseNotice", async () => {
        const wrapper = mount(NotificationDurationRow, { global: { plugins: [vuetify, i18n] } });

        const quick = wrapper.findAll("button").find((btn) => btn.text().startsWith("1 · Quick"));
        await quick?.trigger("click");
        await wrapper.vm.$nextTick();

        const notice = notify(notices, "success", "saved");
        expect(notice.timeout).toBe(2000);

        wrapper.unmount();
    });
});

describe("resetting", () => {
    it("puts a changed level back to Balanced", async () => {
        changeNoticeDuration(1);
        const wrapper = mount(NotificationDurationRow, { global: { plugins: [vuetify, i18n] } });

        const reset = wrapper.findAll("button").find((btn) => btn.text() === "Reset to Balanced");
        expect(reset?.attributes("disabled")).toBeUndefined();
        await reset?.trigger("click");
        await wrapper.vm.$nextTick();

        expect(notices.durationLevel).toBe(DEFAULT_NOTICE_DURATION_LEVEL);
        const balanced = wrapper.findAll("button").find((btn) => btn.text().startsWith("3 · Balanced"));
        expect(balanced?.attributes("aria-pressed")).toBe("true");

        wrapper.unmount();
    });
});
