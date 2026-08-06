// @vitest-environment jsdom

/**
 * The mechanism every streaming-output surface shares: follows the bottom, pauses the
 * moment a reader scrolls away without touching the checkbox, resumes when they scroll back,
 * never fights a selection, never moves focus, and jumps instead of animating under reduced
 * motion.
 *
 * `consoleModel.test.ts` already proves `isAtBottom`'s own arithmetic; what is proven here is
 * everything built on top of it - the part that decides *when* to call it, and what to do
 * with the answer.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, ref } from "vue";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));

import { hasSelectionWithin, smoothScrollAllowed, useStickyScroll } from "./stickyScroll.js";
import type { AutoScrollStorage } from "./autoScrollPrefs.js";

beforeAll(() => {
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

/** A container with jsdom-missing layout metrics supplied by hand, per `RenderConsole.test.ts`. */
function makeContainer(scrollHeight: number, clientHeight: number, scrollTop: number): HTMLElement {
    const el = document.createElement("div");
    document.body.appendChild(el);
    Object.defineProperty(el, "scrollHeight", { value: scrollHeight, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: clientHeight, configurable: true });
    el.scrollTop = scrollTop;
    return el;
}

/** Storage that never persists anything and never throws - the "not what this file tests" no-op. */
function inertStorage(): AutoScrollStorage {
    return { getItem: () => null, setItem: () => {} };
}

let surfaceCounter = 0;
/** A fresh surface name per test, so `autoScrollPrefs`'s module-level bag never leaks state. */
function surface(): string {
    surfaceCounter += 1;
    return `test-surface-${surfaceCounter}`;
}

async function flush(): Promise<void> {
    await nextTick();
    await nextTick();
    await nextTick();
}

beforeEach(() => {
    document.body.innerHTML = "";
});

describe("following new content", () => {
    it("scrolls to the bottom when enabled and already at the bottom", async () => {
        const el = makeContainer(1000, 400, 600); // distance 0: at the bottom already
        const container = ref<HTMLElement | null>(el);
        const length = ref(1);
        useStickyScroll({ surface: surface(), defaultEnabled: true, container, length: () => length.value, storage: inertStorage() });

        Object.defineProperty(el, "scrollHeight", { value: 1400, configurable: true }); // more content arrived
        length.value = 2;
        await flush();

        expect(el.scrollTop).toBe(1400);
    });

    it("does not move the view when the preference is off", async () => {
        const el = makeContainer(1000, 400, 600);
        const container = ref<HTMLElement | null>(el);
        const length = ref(1);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: false,
            container,
            length: () => length.value,
            storage: inertStorage(),
        });

        expect(scroll.enabled.value).toBe(false);
        Object.defineProperty(el, "scrollHeight", { value: 1400, configurable: true });
        length.value = 2;
        await flush();

        expect(el.scrollTop).toBe(600);
    });
});

describe("scrolling up pauses, without touching the preference", () => {
    it("marks the view paused the moment it is away from the bottom", () => {
        const el = makeContainer(1000, 400, 600);
        const container = ref<HTMLElement | null>(el);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => 1,
            storage: inertStorage(),
        });

        expect(scroll.paused.value).toBe(false);
        el.scrollTop = 100; // scrolled well away from the bottom
        scroll.onScroll();

        expect(scroll.paused.value).toBe(true);
        // The whole point: the reader did not untick the box, they scrolled to read something.
        expect(scroll.enabled.value).toBe(true);
    });

    it("does not pull a paused view down when more content arrives", async () => {
        const el = makeContainer(1000, 400, 100);
        const container = ref<HTMLElement | null>(el);
        const length = ref(1);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => length.value,
            storage: inertStorage(),
        });
        scroll.onScroll(); // away from the bottom -> paused

        Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
        length.value = 2;
        await flush();

        expect(el.scrollTop).toBe(100);
        expect(scroll.paused.value).toBe(true);
    });

    it("resumes the moment the reader scrolls back to the bottom themselves", () => {
        const el = makeContainer(1000, 400, 100);
        const container = ref<HTMLElement | null>(el);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => 1,
            storage: inertStorage(),
        });
        scroll.onScroll();
        expect(scroll.paused.value).toBe(true);

        el.scrollTop = 600; // back at the bottom, by hand
        scroll.onScroll();

        expect(scroll.paused.value).toBe(false);
    });
});

describe("not fighting a selection", () => {
    it("leaves the view exactly where it is while text inside the container is selected", async () => {
        const el = makeContainer(1000, 400, 600);
        el.appendChild(document.createTextNode("some engine output"));
        const container = ref<HTMLElement | null>(el);
        const length = ref(1);
        useStickyScroll({ surface: surface(), defaultEnabled: true, container, length: () => length.value, storage: inertStorage() });

        const selection = {
            isCollapsed: false,
            anchorNode: el.firstChild,
        } as unknown as Selection;
        vi.spyOn(document, "getSelection").mockReturnValue(selection);

        Object.defineProperty(el, "scrollHeight", { value: 1400, configurable: true });
        length.value = 2;
        await flush();

        expect(el.scrollTop).toBe(600); // untouched
        vi.restoreAllMocks();
    });

    it("still tells the truth about the fold - the jump control can appear without the view moving", async () => {
        const el = makeContainer(1000, 400, 600);
        el.appendChild(document.createTextNode("some engine output"));
        const container = ref<HTMLElement | null>(el);
        const length = ref(1);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => length.value,
            storage: inertStorage(),
        });

        const selection = { isCollapsed: false, anchorNode: el.firstChild } as unknown as Selection;
        vi.spyOn(document, "getSelection").mockReturnValue(selection);

        // Content grows well past the fold while the selection is held.
        Object.defineProperty(el, "scrollHeight", { value: 3000, configurable: true });
        length.value = 2;
        await flush();

        expect(scroll.paused.value).toBe(true);
        expect(el.scrollTop).toBe(600); // still never moved
        vi.restoreAllMocks();
    });

    it("an explicit jump click always executes, selection or not", () => {
        const el = makeContainer(1000, 400, 100);
        el.appendChild(document.createTextNode("some engine output"));
        const container = ref<HTMLElement | null>(el);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => 1,
            storage: inertStorage(),
        });

        const selection = { isCollapsed: false, anchorNode: el.firstChild } as unknown as Selection;
        vi.spyOn(document, "getSelection").mockReturnValue(selection);

        scroll.scrollToBottom();

        expect(el.scrollTop).toBe(1000);
        vi.restoreAllMocks();
    });
});

describe("focus is never moved", () => {
    it("leaves the active element exactly where it was", () => {
        const input = document.createElement("input");
        document.body.appendChild(input);
        input.focus();

        const el = makeContainer(1000, 400, 100);
        const container = ref<HTMLElement | null>(el);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => 1,
            storage: inertStorage(),
        });

        expect(document.activeElement).toBe(input);
        scroll.scrollToBottom();
        expect(document.activeElement).toBe(input);
    });
});

describe("reduced motion", () => {
    it("jumps rather than animates when the reader has asked for less motion", () => {
        globalThis.matchMedia = ((query: string) => ({
            matches: true,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        })) as unknown as typeof globalThis.matchMedia;

        const el = makeContainer(1000, 400, 100);
        const scrollTo = vi.fn();
        (el as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
        const container = ref<HTMLElement | null>(el);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => 1,
            storage: inertStorage(),
        });

        scroll.scrollToBottom();

        expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
    });

    it("animates smoothly with no reduced-motion preference", () => {
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

        const el = makeContainer(1000, 400, 100);
        const scrollTo = vi.fn();
        (el as unknown as { scrollTo: typeof scrollTo }).scrollTo = scrollTo;
        const container = ref<HTMLElement | null>(el);
        const scroll = useStickyScroll({
            surface: surface(),
            defaultEnabled: true,
            container,
            length: () => 1,
            storage: inertStorage(),
        });

        scroll.scrollToBottom();

        expect(scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
    });
});

describe("hasSelectionWithin", () => {
    it("is false with no selection at all", () => {
        vi.spyOn(document, "getSelection").mockReturnValue(null);
        expect(hasSelectionWithin(document.createElement("div"))).toBe(false);
        vi.restoreAllMocks();
    });

    it("is false for a collapsed selection - a caret, not something being read", () => {
        const el = document.createElement("div");
        vi.spyOn(document, "getSelection").mockReturnValue({
            isCollapsed: true,
            anchorNode: el,
        } as unknown as Selection);
        expect(hasSelectionWithin(el)).toBe(false);
        vi.restoreAllMocks();
    });

    it("is false for a real selection anchored outside the container", () => {
        const el = document.createElement("div");
        const elsewhere = document.createElement("span");
        vi.spyOn(document, "getSelection").mockReturnValue({
            isCollapsed: false,
            anchorNode: elsewhere,
        } as unknown as Selection);
        expect(hasSelectionWithin(el)).toBe(false);
        vi.restoreAllMocks();
    });

    it("is true for a real selection anchored inside the container", () => {
        const el = document.createElement("div");
        const text = document.createTextNode("hello");
        el.appendChild(text);
        vi.spyOn(document, "getSelection").mockReturnValue({
            isCollapsed: false,
            anchorNode: text,
        } as unknown as Selection);
        expect(hasSelectionWithin(el)).toBe(true);
        vi.restoreAllMocks();
    });
});

describe("smoothScrollAllowed", () => {
    it("allows smooth motion when matchMedia is missing entirely", () => {
        const original = globalThis.matchMedia;
        // @ts-expect-error deliberately absent, matching a jsdom build without it
        delete globalThis.matchMedia;
        expect(smoothScrollAllowed()).toBe(true);
        globalThis.matchMedia = original;
    });
});
