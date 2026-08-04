// @vitest-environment jsdom

/**
 * The corner, mounted, doing what issue #13 says it must.
 *
 * Three of that issue's clauses are behaviour rather than policy, and this is where they are
 * checked against the real component: a message informs without blocking, a failure stays
 * until somebody dismisses it while a confirmation gets out of the way by itself, and
 * several at once stack rather than land on top of one another.
 *
 * The clauses that are promises about code not yet written - that a dialog is only ever for
 * a decision, and that nothing here will ever nag - cannot be mounted. They are enforced as
 * source policy next door in `notificationPolicy.test.ts`, which needs Node's filesystem and
 * so cannot share this file's jsdom environment.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import ConfigNotifications from "../config/ConfigNotifications.vue";
import {
    INFO_TIMEOUT_MS,
    SUCCESS_TIMEOUT_MS,
    createNoticeState,
    notify,
    type NoticeState,
} from "../config/notifications.js";

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

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const Host = defineComponent({
    props: { state: { type: Object as PropType<NoticeState>, required: true } },
    setup(props) {
        return () => h(VApp, null, { default: () => [h(ConfigNotifications, { state: props.state })] });
    },
});

type Host = InstanceType<typeof Host>;

let state: NoticeState;
let wrapper: VueWrapper<Host> | null = null;

beforeEach(() => {
    state = createNoticeState();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.useRealTimers();
});

function corner(): VueWrapper<Host> {
    wrapper = mount(Host, {
        props: { state },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<Host>;
    return wrapper;
}

function toasts(view: VueWrapper<Host>) {
    return view.findAll(".mb-config-notices__toast");
}

/* -------------------------------------------------------------------------- */
/* A message informs, and never blocks                                        */
/* -------------------------------------------------------------------------- */

describe("every level is reported without blocking", () => {
    it("puts information, success, warning and error in the corner and nothing in a dialog", async () => {
        notify(state, "info", "Reading the configuration folder.");
        notify(state, "success", "Wrote 9 files.");
        notify(state, "warning", "These maps have to be rendered again: overworld.");
        notify(state, "error", "The files were not written.");

        const view = corner();
        await nextTick();

        expect(toasts(view)).toHaveLength(4);
        // A modal announces itself three ways, and none of them may be here.
        expect(document.querySelector('[role="dialog"]')).toBeNull();
        expect(document.querySelector('[aria-modal="true"]')).toBeNull();
        expect(document.querySelector(".v-overlay__scrim")).toBeNull();
    });

    it("names the corner as a region, and marks a failure as an alert rather than a status", async () => {
        notify(state, "info", "Reading the configuration folder.");
        notify(state, "error", "The files were not written.");

        const view = corner();
        await nextTick();

        const region = view.find(".mb-config-notices");
        expect(region.attributes("role")).toBe("region");
        expect(region.attributes("aria-label")).toBe("Notifications");

        const [info, failure] = toasts(view);
        expect(info?.attributes("role")).toBe("status");
        expect(failure?.attributes("role")).toBe("alert");
    });

    it("announces new arrivals politely rather than interrupting whatever is being read", async () => {
        notify(state, "info", "Reading the configuration folder.");

        const view = corner();
        await nextTick();

        expect(view.find(".mb-config-notices__stack").attributes("aria-live")).toBe("polite");
    });

    it("offers the actions a caller attached, on the toast itself", async () => {
        let retried = 0;
        notify(state, "error", "The files were not written.", {
            actions: [{ id: "retry", label: "Retry the save", run: () => retried++ }],
        });

        const view = corner();
        await nextTick();

        const retry = view.findAll("button").find((button) => button.text().includes("Retry the save"));
        expect(retry).toBeDefined();
        await retry?.trigger("click");
        expect(retried).toBe(1);
    });

    it("shows a title above the body when the caller gave one", async () => {
        notify(state, "error", "The files were not written.", {
            title: "Save failed",
            detail: "EACCES: permission denied",
        });

        const view = corner();
        await nextTick();

        expect(view.find(".mb-config-notices__title").text()).toBe("Save failed");
        expect(toasts(view)[0]?.text()).toContain("The files were not written.");
    });
});

/* -------------------------------------------------------------------------- */
/* What leaves by itself, and what does not                                   */
/* -------------------------------------------------------------------------- */

describe("how long a message stays on screen", () => {
    it("takes information and success away by themselves", async () => {
        vi.useFakeTimers();
        notify(state, "info", "Reading the configuration folder.");
        notify(state, "success", "Wrote 9 files.");

        const view = corner();
        await nextTick();
        expect(toasts(view)).toHaveLength(2);

        vi.advanceTimersByTime(SUCCESS_TIMEOUT_MS);
        await nextTick();
        expect(toasts(view)).toHaveLength(1);
        expect(toasts(view)[0]?.text()).toContain("Reading the configuration folder.");

        vi.advanceTimersByTime(INFO_TIMEOUT_MS - SUCCESS_TIMEOUT_MS);
        await nextTick();
        expect(toasts(view)).toHaveLength(0);
    });

    it("leaves a warning and an error until somebody dismisses them, however long that is", async () => {
        vi.useFakeTimers();
        notify(state, "warning", "These maps have to be rendered again: overworld.");
        notify(state, "error", "The files were not written.");

        const view = corner();
        await nextTick();

        vi.advanceTimersByTime(60 * 60 * 1000);
        await nextTick();

        expect(toasts(view)).toHaveLength(2);
    });

    it("dismisses on the control, and keeps the notice in the history so the centre still has it", async () => {
        notify(state, "error", "The files were not written.");

        const view = corner();
        await nextTick();

        await view.find(".mb-config-notices__dismiss").trigger("click");
        await nextTick();

        expect(toasts(view)).toHaveLength(0);
        expect(state.history).toHaveLength(1);
    });

    it("labels that control, because it is an icon and nothing else", async () => {
        notify(state, "error", "The files were not written.");

        const view = corner();
        await nextTick();

        expect(view.find(".mb-config-notices__dismiss").attributes("aria-label")).toBe(
            "Dismiss this notification",
        );
    });
});

describe("several at once", () => {
    it("stack as siblings in one column, so a second message cannot land on top of the first", async () => {
        notify(state, "error", "first");
        notify(state, "error", "second");
        notify(state, "error", "third");

        const view = corner();
        await nextTick();

        const parents = new Set(toasts(view).map((toast) => toast.element.parentElement));
        expect(parents.size).toBe(1);
        expect([...parents][0]).toBe(view.find(".mb-config-notices__stack").element);
        expect(toasts(view).map((toast) => toast.text())).toEqual(["first", "second", "third"]);
    });

    it("offers one press that clears them all, once there is more than one to clear", async () => {
        notify(state, "error", "first");
        notify(state, "error", "second");

        const view = corner();
        await nextTick();

        await view.find(".mb-config-notices__dismiss-all").trigger("click");
        await nextTick();

        expect(toasts(view)).toHaveLength(0);
        expect(state.history).toHaveLength(2);
    });
});

/* -------------------------------------------------------------------------- */
/* The way back to a message that has gone                                    */
/* -------------------------------------------------------------------------- */

describe("the bell in the corner", () => {
    it("is present with the history behind it, rather than being a count nobody can open", async () => {
        notify(state, "error", "The files were not written.");

        const view = corner();
        await nextTick();

        const bell = view.find(".mb-notice-bell");
        expect(bell.exists()).toBe(true);
        expect(bell.attributes("aria-label")).toBe("Notification centre. 1 recorded, 1 new.");
        expect(bell.attributes("aria-expanded")).toBe("false");
    });
});
