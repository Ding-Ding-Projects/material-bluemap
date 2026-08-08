// @vitest-environment jsdom

/**
 * The notification corner, mounted, with its stack now a `<TransitionGroup>`.
 *
 * `motion.test.ts` reads the rules; what it cannot see is what turning the stack into a
 * transition group did to the corner itself. Three things had to survive it, and all three
 * are things this project has broken before by animating something:
 *
 *  - the stack is still one element with one class and one live region. `App.test.ts`,
 *    `notificationContract.test.ts` and every screenshot in `docs/` know the corner by
 *    `.mb-config-notices__stack`, and a transition that renamed it would be a refactor
 *    wearing a presentation change's clothes;
 *  - a toast on its way out never takes an interaction with it. The exit lasts `short3`, and
 *    for all of it the toast is still painted, still in the stack, and still holding a
 *    dismiss button attached to a notice that has already been sent away. So the dismiss is
 *    exercised twice in a row, with the first exit still in flight;
 *  - nothing is stranded. A transition that never resolves leaves a dismissed toast painted
 *    in the corner for good, which is worse than the blink it replaced.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import ConfigNotifications from "./ConfigNotifications.vue";
import { createNoticeState, notify, type NoticeState } from "./notifications.js";

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

    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });
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

let wrapper: VueWrapper<InstanceType<typeof ConfigNotifications>> | null = null;
let state: NoticeState;

/** Warnings and errors, so nothing dismisses itself out from under an assertion. */
function raiseThree(): void {
    notify(state, "error", "the first one");
    notify(state, "warning", "the second one");
    notify(state, "error", "the third one");
}

function open(): VueWrapper<InstanceType<typeof ConfigNotifications>> {
    wrapper = mount(ConfigNotifications, {
        props: { state },
        // The transition machinery itself is what this file is about, so the stubs Vue Test
        // Utils installs for `<Transition>` and `<TransitionGroup>` by default are turned
        // off: with them on, the group renders as a `transition-group-stub` that skips every
        // enter, leave and move, and every assertion below would pass without exercising a
        // single thing the change actually made.
        global: {
            plugins: [vuetify, i18n],
            stubs: { transition: false, "transition-group": false },
        },
        attachTo: document.body,
    });
    return wrapper;
}

/** Lets the transition run its frame as well as its tick. */
async function settle(): Promise<void> {
    await nextTick();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
    await nextTick();
}

beforeEach(() => {
    state = createNoticeState();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

const toasts = (view: VueWrapper<InstanceType<typeof ConfigNotifications>>) =>
    view.findAll(".mb-config-notices__toast");

const dismissButtons = (view: VueWrapper<InstanceType<typeof ConfigNotifications>>) =>
    view.findAll(".mb-config-notices__dismiss");

describe("the stack the transition group renders", () => {
    it("is still one element, with the class and the live region the corner is known by", async () => {
        raiseThree();
        const view = open();
        await settle();

        const stack = view.findAll(".mb-config-notices__stack");
        expect(stack).toHaveLength(1);
        expect(stack[0]?.element.tagName).toBe("DIV");
        expect(stack[0]?.attributes("aria-live")).toBe("polite");
        expect(toasts(view)).toHaveLength(3);
        // Every toast is a child of that one element, not of a wrapper the group invented.
        for (const toast of toasts(view)) {
            expect(toast.element.parentElement).toBe(stack[0]?.element);
        }
    });
});

describe("nothing is unclickable while a toast leaves", () => {
    it("dismisses the next toast with the previous one still on its way out", async () => {
        raiseThree();
        const view = open();
        await settle();
        expect(state.live).toHaveLength(3);

        // No `settle()` between these two: the first exit is deliberately still in flight
        // when the second dismiss is aimed. That is the whole shape of the defect - a
        // control that stops working because something already dismissed is lying over it.
        await dismissButtons(view)[0]?.trigger("click");
        await nextTick();

        // Found by what it says rather than by its position, because the toast on its way
        // out is still in the document and still holds position 0 - which is precisely why
        // it has to be click-through while it is there.
        const second = toasts(view).find((toast) => toast.text().includes("the second one"));
        expect(second, "the second toast is gone before it was dismissed").not.toBeUndefined();
        await second?.find(".mb-config-notices__dismiss").trigger("click");
        await nextTick();

        expect(state.live.map((notice) => notice.message)).toEqual(["the third one"]);
    });

    it("marks the leaving toast with the class that makes it click-through", async () => {
        // jsdom attaches no stylesheet, so the `pointer-events: none` itself is asserted in
        // `motion.test.ts` against the rule. What only a mounted test can show is that the
        // rule is ever reached: that Vue really puts `.mb-notice-leave-active` on the toast
        // for the length of its exit, which is what turns that declaration into the reason a
        // dismissed toast cannot cover the one underneath it.
        raiseThree();
        const view = open();
        await settle();

        await dismissButtons(view)[0]?.trigger("click");
        await nextTick();

        const leaving = toasts(view).find((toast) => toast.text().includes("the first one"));
        expect(leaving, "the exit is not animated at all").not.toBeUndefined();
        expect(leaving?.classes()).toContain("mb-notice-leave-active");
    });

    it("strands nothing: a dismissed toast really leaves the corner", async () => {
        raiseThree();
        const view = open();
        await settle();

        await dismissButtons(view)[0]?.trigger("click");
        await settle();

        expect(state.live).toHaveLength(2);
        expect(toasts(view)).toHaveLength(2);
        expect(view.text()).not.toContain("the first one");
    });

    it("keeps the dismiss-all control working, and empties the stack when it is used", async () => {
        raiseThree();
        const view = open();
        await settle();

        await view.find(".mb-config-notices__dismiss-all").trigger("click");
        await settle();

        expect(state.live).toHaveLength(0);
        expect(toasts(view)).toHaveLength(0);
    });
});

describe("arriving", () => {
    it("adds a toast to the same stack rather than replacing what is there", async () => {
        notify(state, "error", "the first one");
        const view = open();
        await settle();
        expect(toasts(view)).toHaveLength(1);

        notify(state, "error", "the second one");
        await settle();

        expect(toasts(view)).toHaveLength(2);
        expect(view.findAll(".mb-config-notices__stack")).toHaveLength(1);
        expect(view.text()).toContain("the first one");
        expect(view.text()).toContain("the second one");
    });
});
