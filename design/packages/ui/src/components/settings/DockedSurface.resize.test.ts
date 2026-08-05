// @vitest-environment jsdom

/**
 * Resizing a docked edge, and dragging or resizing a floating panel, mounted.
 *
 * The geometry math itself - clamping, bounds, persistence - is proven in
 * `dockPlacement.test.ts` against plain functions and an explicit `memoryStorage()`. What
 * can only be checked against the rendered component is the wiring: that the splitter and
 * the resize/move handles are really there with the right roles and keyboard behaviour,
 * that pressing an arrow key on one of them really changes the panel's own inline style,
 * that a keyboard step really persists through `thicknessFor`/`floatingRectFor`, that a
 * step which would leave the window is clamped rather than applied, and that "put it back
 * where it started" really forgets a resize as well as a placement.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";

import DockedSurface from "./DockedSurface.vue";
import { MINIMUM_THICKNESS } from "./dockPlacement.js";
import {
    floatingRectFor,
    resetAllDockPlacements,
    reloadDockGeometry,
    reloadDockPlacements,
    setDockPlacement,
    thicknessFor,
} from "./useDockPlacement.js";

beforeAll(() => {
    // Same reasoning as `AppSettings.test.ts`: jsdom has no layout engine, so `ResizeObserver`
    // and `matchMedia` do not exist, and Vuetify's components throw on mount without them.
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

    // Vuetify's own overlay positioning (the placement chooser's `v-menu`) reads this to
    // track the window while open; jsdom has no viewport at all.
    (globalThis as unknown as { visualViewport?: unknown }).visualViewport = {
        addEventListener: () => {},
        removeEventListener: () => {},
        width: 1024,
        height: 768,
    };
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
    props: {
        surfaceId: { type: String, required: true },
        defaultPlacement: { type: String as () => "floating" | "left" | "right" | "top" | "bottom", default: "right" },
        // Off by default so every existing test keeps mounting the plain panel it always
        // has. Turned on only by the scroll tests below, which need slot content taller
        // than the panel to have anything to prove.
        tallContent: { type: Boolean, default: false },
    },
    setup(props) {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(
                        DockedSurface,
                        {
                            surfaceId: props.surfaceId,
                            title: "Settings",
                            open: true,
                            defaultPlacement: props.defaultPlacement,
                            "onUpdate:open": () => {},
                        },
                        props.tallContent
                            ? {
                                  default: () => [
                                      h(
                                          "div",
                                          { class: "scroll-test__tall", "data-testid": "tall-marker" },
                                          "content past the fold",
                                      ),
                                  ],
                              }
                            : {},
                    ),
                ],
            });
    },
});

let wrapper: VueWrapper<InstanceType<typeof Host>> | null = null;

function mountSurface(
    surfaceId: string,
    defaultPlacement: "floating" | "left" | "right" | "top" | "bottom" = "right",
    tallContent = false,
): VueWrapper<InstanceType<typeof Host>> {
    wrapper = mount(Host, {
        props: { surfaceId, defaultPlacement, tallContent },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<InstanceType<typeof Host>>;
    return wrapper;
}

async function settle(): Promise<void> {
    for (let index = 0; index < 4; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function panel(): HTMLElement {
    const element = document.querySelector<HTMLElement>(".mb-docked");
    if (element === null) throw new Error("no panel rendered");
    return element;
}

function splitter(): HTMLElement {
    const element = document.querySelector<HTMLElement>('.mb-docked__splitter[role="separator"]');
    if (element === null) throw new Error("no splitter rendered");
    return element;
}

function moveHandle(): HTMLElement {
    const element = document.querySelector<HTMLElement>(".mb-docked__move-handle");
    if (element === null) throw new Error("no move handle rendered");
    return element;
}

function resizeHandle(modifier: "right" | "bottom" | "corner"): HTMLElement {
    const element = document.querySelector<HTMLElement>(`.mb-docked__resize-handle--${modifier}`);
    if (element === null) throw new Error(`no ${modifier} resize handle rendered`);
    return element;
}

function pressArrow(target: HTMLElement, key: string, shiftKey = false): void {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, shiftKey, bubbles: true, cancelable: true }));
}

/** A pointer-drag gesture: down, one move, then up, all bubbling as a real drag would. */
function dispatchDrag(target: HTMLElement, dx: number, dy: number): void {
    const startX = 500;
    const startY = 500;
    target.dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, clientX: startX, clientY: startY, bubbles: true }),
    );
    target.dispatchEvent(
        new PointerEvent("pointermove", { buttons: 1, clientX: startX + dx, clientY: startY + dy, bubbles: true }),
    );
    target.dispatchEvent(
        new PointerEvent("pointerup", { clientX: startX + dx, clientY: startY + dy, bubbles: true }),
    );
}

beforeEach(() => {
    resetAllDockPlacements();
    reloadDockPlacements();
    reloadDockGeometry();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    resetAllDockPlacements();
    reloadDockPlacements();
    reloadDockGeometry();
});

describe("the docked splitter", () => {
    it("renders as a keyboard-focusable separator with a live value", async () => {
        mountSurface("app-settings", "right");
        await settle();

        const handle = splitter();
        expect(handle.getAttribute("tabindex")).toBe("0");
        expect(handle.getAttribute("aria-orientation")).toBe("vertical");
        expect(handle.getAttribute("aria-label")).toContain("Settings");
        expect(Number(handle.getAttribute("aria-valuenow"))).toBeGreaterThan(0);
    });

    it("grows the panel when the arrow key that widens it is pressed", async () => {
        mountSurface("app-settings", "right");
        await settle();

        const before = panel().style.width;
        pressArrow(splitter(), "ArrowLeft");
        await settle();

        const after = panel().style.width;
        expect(parseInt(after, 10)).toBeGreaterThan(parseInt(before, 10));
    });

    it("takes a bigger step with Shift held", async () => {
        mountSurface("app-settings", "right");
        await settle();

        const start = parseInt(panel().style.width, 10);
        pressArrow(splitter(), "ArrowLeft", true);
        await settle();
        const grown = parseInt(panel().style.width, 10) - start;

        // Reset back and take one ordinary step for comparison.
        resetAllDockPlacements();
        reloadDockGeometry();
        await settle();
        const restart = parseInt(panel().style.width, 10);
        pressArrow(splitter(), "ArrowLeft");
        await settle();
        const ordinary = parseInt(panel().style.width, 10) - restart;

        expect(grown).toBeGreaterThan(ordinary);
    });

    it("persists a keyboard resize through thicknessFor, per surface and edge", async () => {
        mountSurface("app-settings", "right");
        await settle();

        pressArrow(splitter(), "ArrowLeft");
        pressArrow(splitter(), "ArrowLeft");
        await settle();

        const stored = thicknessFor("app-settings", "right");
        expect(stored).not.toBeNull();
        expect(stored).toBe(Math.round(parseInt(panel().style.width, 10)));
    });

    it("never shrinks the panel below the minimum usable thickness", async () => {
        mountSurface("app-settings", "right");
        await settle();

        for (let index = 0; index < 60; index++) {
            pressArrow(splitter(), "ArrowRight");
        }
        await settle();

        expect(parseInt(panel().style.width, 10)).toBeGreaterThanOrEqual(MINIMUM_THICKNESS);
    });
});

describe("a floating panel's move handle", () => {
    it("renders as a focusable control with an accessible name naming the panel", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        const handle = moveHandle();
        expect(handle.getAttribute("tabindex")).toBe("0");
        expect(handle.getAttribute("aria-label")).toContain("Settings");
    });

    it("moves the panel when an arrow key is pressed", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        // The panel opens in the bottom-right corner by default (no opener to clear in
        // this test), which is already as far right and as far down as it can go - so the
        // move that actually proves something here is one that pulls it away from the edge
        // it started against.
        const before = parseInt(panel().style.left, 10);
        pressArrow(moveHandle(), "ArrowLeft");
        await settle();
        const after = parseInt(panel().style.left, 10);

        expect(after).toBeLessThan(before);
    });

    it("persists a keyboard move through floatingRectFor", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        pressArrow(moveHandle(), "ArrowDown");
        pressArrow(moveHandle(), "ArrowRight");
        await settle();

        const rect = floatingRectFor("app-settings");
        expect(rect).not.toBeNull();
        expect(rect?.top).toBe(Math.round(parseFloat(panel().style.top)));
        expect(rect?.left).toBe(Math.round(parseFloat(panel().style.left)));
    });

    it("never lets the panel leave the window, however many times it is nudged", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        for (let index = 0; index < 200; index++) {
            pressArrow(moveHandle(), "ArrowLeft", true);
            pressArrow(moveHandle(), "ArrowUp", true);
        }
        await settle();

        const left = parseInt(panel().style.left, 10);
        const top = parseInt(panel().style.top, 10);
        expect(left).toBeGreaterThanOrEqual(0);
        expect(top).toBeGreaterThanOrEqual(0);
    });

    it("moves the panel when dragged with the pointer, not just the plain header background", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        // Regression for the handle that visually claims "grab here to move" (cursor: move,
        // aria-label "Move {title}") but, before this fix, had no pointer handlers of its
        // own - `onHeaderPointerDown` explicitly excludes any press landing inside it, so the
        // gesture went nowhere even though dragging the header background beside it worked.
        expect(floatingRectFor("app-settings")).toBeNull();
        dispatchDrag(moveHandle(), -80, -40);
        await settle();

        const rect = floatingRectFor("app-settings");
        expect(rect).not.toBeNull();
        expect(rect?.top).toBe(Math.round(parseFloat(panel().style.top)));
        expect(rect?.left).toBe(Math.round(parseFloat(panel().style.left)));
    });

    it("persists a pointer-dragged move through floatingRectFor exactly once, without a duplicate from the header behind it", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        const before = { left: parseFloat(panel().style.left), top: parseFloat(panel().style.top) };
        dispatchDrag(moveHandle(), -50, -30);
        await settle();

        const after = { left: parseFloat(panel().style.left), top: parseFloat(panel().style.top) };
        // The drag really moved the panel by (roughly) the gesture's delta, rather than the
        // header's own listener also picking up the bubbled event and applying the delta a
        // second time on top of the handle's own move.
        expect(before.left - after.left).toBeCloseTo(50, 0);
        expect(before.top - after.top).toBeCloseTo(30, 0);
    });
});

describe("a floating panel's resize handles", () => {
    it("grows the width from the right-edge handle", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        const before = parseInt(panel().style.width, 10);
        pressArrow(resizeHandle("right"), "ArrowRight");
        await settle();
        expect(parseInt(panel().style.width, 10)).toBeGreaterThan(before);
    });

    it("grows the height from the bottom-edge handle, read from max-height", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        const before = parseInt(panel().style.getPropertyValue("max-height"), 10);
        pressArrow(resizeHandle("bottom"), "ArrowDown");
        await settle();
        expect(parseInt(panel().style.getPropertyValue("max-height"), 10)).toBeGreaterThan(before);
    });

    it("grows both dimensions from the corner handle", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        const beforeWidth = parseInt(panel().style.width, 10);
        const beforeHeight = parseInt(panel().style.getPropertyValue("max-height"), 10);
        pressArrow(resizeHandle("corner"), "ArrowRight");
        pressArrow(resizeHandle("corner"), "ArrowDown");
        await settle();

        expect(parseInt(panel().style.width, 10)).toBeGreaterThan(beforeWidth);
        expect(parseInt(panel().style.getPropertyValue("max-height"), 10)).toBeGreaterThan(beforeHeight);
    });
});

describe("putting a panel back where it started", () => {
    it("forgets a docked resize, not only the placement", async () => {
        mountSurface("app-settings", "right");
        await settle();

        pressArrow(splitter(), "ArrowLeft");
        pressArrow(splitter(), "ArrowLeft");
        await settle();
        expect(thicknessFor("app-settings", "right")).not.toBeNull();

        const resetButton = [...document.querySelectorAll<HTMLElement>('[role="menuitem"], .v-list-item')].find(
            (el) => el.textContent?.includes("Put Settings back where it started") === true,
        );
        // The chooser menu has to be open for its items to exist in the DOM at all.
        const chooser = document.querySelector<HTMLElement>(".mb-docked__placement");
        expect(chooser).not.toBeNull();
        chooser?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        const item = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find((el) =>
            el.textContent?.includes("Put Settings back where it started"),
        );
        expect(item ?? resetButton).toBeDefined();
        (item ?? resetButton)?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        expect(thicknessFor("app-settings", "right")).toBeNull();
    });

    it("forgets a floating drag when every panel is put back", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating");
        await settle();

        pressArrow(moveHandle(), "ArrowRight");
        await settle();
        expect(floatingRectFor("app-settings")).not.toBeNull();

        resetAllDockPlacements();
        await settle();

        expect(floatingRectFor("app-settings")).toBeNull();
    });
});

/**
 * Regression for "docked panels are non scrollable": content taller than the panel used to
 * spill silently past its edge, with nothing to scroll it back into view.
 *
 * jsdom computes no layout at all - not just no clipping, no CSS cascade either, so a
 * `.mb-docked__body { overflow: auto }` rule in `DockedSurface.vue`'s own `<style>` block
 * never reaches `getComputedStyle` here regardless of whether it is right. That is exactly
 * the gap `RenderConsole.test.ts`'s own "the scrolling region" tests work around: the three
 * numbers a scroll rule reads - `scrollHeight`, `clientHeight`, `scrollTop` - are supplied
 * directly rather than produced by a layout engine that does not exist in this environment.
 * The same technique is used here. What a mounted test in this suite *can* still prove, and
 * what actually regressed:
 *
 *  - the body that is supposed to be the scroll container is the one truly holding the slot
 *    content (not a sibling the content silently escaped to, which is exactly how a broken
 *    ancestor chain looks from the DOM's point of view);
 *  - it is keyboard-reachable, per the platform norm for a scrollable region with no other
 *    focusable descendant;
 *  - `scrollTop` actually moves and is read back, so content declared to be "past the fold"
 *    (`scrollHeight > clientHeight`, faked exactly as `RenderConsole.test.ts` fakes it) is
 *    reachable rather than stuck at the top with nothing able to move it;
 *  - for the floating placement specifically, the panel's own rendered `height` is a real
 *    pixel value rather than empty - the precise defect `dockPlacement.test.ts`'s
 *    "gives a floating panel a real height" test pins at the pure-function layer, checked
 *    again here against the actual mounted inline style.
 *
 * The CSS rules that make the scrolling itself happen (`.mb-docked__body`'s `display: flex`
 * and `overflow: auto`, and the matching chain in `EulaSurface.vue` and `EulaViewer.vue`)
 * were checked against a real layout engine (Chromium, via Playwright) while diagnosing this,
 * outside this suite - see the commit message for the measurements.
 */
describe("the content region scrolls when it does not fit", () => {
    it("keeps a docked panel's slot content inside the scroll container, reachable by scrolling", async () => {
        mountSurface("app-settings", "right", true);
        await settle();

        const body = document.querySelector<HTMLElement>(".mb-docked__body");
        expect(body).not.toBeNull();
        if (body === null) throw new Error("unreachable");

        // The content is really inside the element that scrolls, not a sibling it escaped
        // to - the exact shape "docked panels are non scrollable" takes when the ancestor
        // chain between the scroll container and the slot content is broken.
        const marker = body.querySelector<HTMLElement>('[data-testid="tall-marker"]');
        expect(marker).not.toBeNull();

        // A scrollable region with no other focusable descendant is reachable with the
        // keyboard per platform norms, the same contract `RenderConsole.test.ts` checks
        // for `.mb-console__scroll`.
        expect(body.getAttribute("tabindex")).toBe("-1");

        // jsdom computes no layout, so the three numbers a scroll rule reads are supplied
        // directly - see this describe block's own doc comment.
        Object.defineProperty(body, "scrollHeight", { value: 1400, configurable: true });
        Object.defineProperty(body, "clientHeight", { value: 500, configurable: true });
        expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);

        body.scrollTop = 620;
        await body.dispatchEvent(new Event("scroll", { bubbles: true }));
        expect(body.scrollTop).toBe(620);
    });

    it("keeps a floating panel's slot content inside the scroll container, reachable by scrolling", async () => {
        setDockPlacement("app-settings", "floating");
        mountSurface("app-settings", "floating", true);
        await settle();

        const body = document.querySelector<HTMLElement>(".mb-docked__body");
        expect(body).not.toBeNull();
        if (body === null) throw new Error("unreachable");

        const marker = body.querySelector<HTMLElement>('[data-testid="tall-marker"]');
        expect(marker).not.toBeNull();
        expect(body.getAttribute("tabindex")).toBe("-1");

        Object.defineProperty(body, "scrollHeight", { value: 1400, configurable: true });
        Object.defineProperty(body, "clientHeight", { value: 500, configurable: true });
        expect(body.scrollHeight).toBeGreaterThan(body.clientHeight);

        body.scrollTop = 620;
        await body.dispatchEvent(new Event("scroll", { bubbles: true }));
        expect(body.scrollTop).toBe(620);

        // The floating-panel-specific half of the regression: a floating panel's own box
        // used to carry `max-height` with no `height`, which is what left `.mb-docked__body`
        // unbounded in the first place (see `dockPlacement.ts`'s `dockStyle`). Checked here
        // against the actual mounted inline style, not just the pure function.
        const style = panel().style;
        expect(style.height).not.toBe("");
        expect(parseInt(style.height, 10)).toBeGreaterThan(0);
        expect(style.height).toBe(style.getPropertyValue("max-height"));
    });
});
