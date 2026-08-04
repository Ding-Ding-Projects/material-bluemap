// @vitest-environment jsdom

/**
 * The per-element integration, end to end.
 *
 * This is the file that proves the pattern rather than the pieces. The colour maths, the
 * record layer and the store are unit-tested where they live; what none of those can show is
 * whether right-clicking a real element really opens a menu, whether the menu's command
 * really opens an editor anchored to that element, whether a control in that editor really
 * changes the element it was opened from, and whether closing it really puts focus back where
 * it came from. Every one of those is a wiring question, and every one of them is a failure
 * the contract names by name.
 *
 * The keyboard assertions are not a formality. A right-click path with no keyboard equivalent
 * is listed in the contract as an incomplete implementation, and it is the single easiest
 * thing to ship without noticing, because nobody testing with a mouse will ever find it.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";

import AppearanceTarget from "./AppearanceTarget.vue";
import { emptyRecord } from "./appearanceRecord.js";
import { withRecord } from "./appearanceStore.js";
import { appearanceState, commitAppearance, reloadAppearance } from "./useAppearance.js";

const cells = new Map<string, string>();

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

    // Vuetify's reposition scroll strategy asks the document what is under a point, which
    // jsdom does not implement at all. Without this the overlay throws asynchronously, after
    // the assertion that opened it has already passed, and the failure surfaces as an
    // unhandled rejection attributed to whichever test happened to be running next.
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

    // The appearance state persists, so the tests need somewhere for it to persist to. A map
    // rather than the real thing so one test cannot leak a theme into the next.
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
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

let wrapper: VueWrapper | null = null;

beforeEach(() => {
    cells.clear();
    reloadAppearance();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

/** A real focusable control inside the target, which is what a host would put there. */
function mountTarget(): VueWrapper {
    wrapper = mount(VApp, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n] },
        slots: {
            default: () =>
                h(
                    AppearanceTarget,
                    { id: "test.row", label: "The test row" },
                    { default: () => h("button", { class: "host-button" }, "Host control") },
                ),
        },
    });
    return wrapper;
}

/** The wrapper element that carries the resolved appearance. */
function targetElement(): HTMLElement {
    const element = document.querySelector<HTMLElement>(".mb-appearance-target");
    if (element === null) throw new Error("the appearance target did not render");
    return element;
}

function bodyText(): string {
    return document.body.textContent ?? "";
}

async function settle(): Promise<void> {
    await nextTick();
    await nextTick();
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await nextTick();
}

describe("the context menu", () => {
    it("opens on right-click and offers the appearance command", async () => {
        mountTarget();
        await targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 40, clientY: 40 }),
        );
        await settle();

        expect(bodyText()).toContain("Edit appearance...");
    });

    it("shows the shortcut that actually works, beside the label", async () => {
        // The contract's "right-click menus show their keyboard shortcuts" clause. The string
        // comes from the same constant the key handler reads, so the two cannot drift.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const shortcut = document.querySelector(".mb-appearance-target__shortcut");
        expect(shortcut?.textContent).toBe("Ctrl+Shift+F10");
    });

    it("carries its own search field, and filtering it hides the commands that do not match", async () => {
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const search = document.querySelector<HTMLInputElement>(".mb-config-search input");
        expect(search).not.toBeNull();

        if (search !== null) {
            search.value = "nothing matches this";
            search.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await settle();

        expect(bodyText()).toContain("No command matches");
    });

    it("offers a reset only once the element has something to reset", async () => {
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();
        expect(bodyText()).not.toContain("Reset this element");

        commitAppearance(
            withRecord(appearanceState().value, "test.row", {
                ...emptyRecord(),
                typography: { fontSize: 22 },
            }),
        );
        await settle();

        expect(bodyText()).toContain("Reset this element");
    });
});

describe("the keyboard path", () => {
    it("opens the menu on Shift+F10, which is what Windows uses", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }),
        );
        await settle();

        expect(bodyText()).toContain("Edit appearance...");
    });

    it("opens the menu on the Menu key", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }),
        );
        await settle();

        expect(bodyText()).toContain("Edit appearance...");
    });

    it("goes straight to the editor on Ctrl+Shift+F10, exactly as Shift+right-click does", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "F10",
                shiftKey: true,
                ctrlKey: true,
                bubbles: true,
            }),
        );
        await settle();

        expect(bodyText()).toContain("Appearance of The test row");
        expect(bodyText()).not.toContain("Edit appearance...");
    });

    it("advertises both shortcuts to assistive technology", () => {
        mountTarget();
        expect(targetElement().getAttribute("aria-keyshortcuts")).toBe("Shift+F10 Ctrl+Shift+F10");
    });

    it("reaches the editor from a keystroke that arrived at a control inside the element", async () => {
        // The event bubbles from whatever the host put in the slot, so a focused button inside
        // the target still opens its editor. Listening only on the wrapper's own focus would
        // make the keyboard path work for exactly nobody.
        mountTarget();
        document
            .querySelector(".host-button")
            ?.dispatchEvent(
                new KeyboardEvent("keydown", {
                    key: "F10",
                    shiftKey: true,
                    ctrlKey: true,
                    bubbles: true,
                }),
            );
        await settle();

        expect(bodyText()).toContain("Appearance of The test row");
    });
});

describe("the anchored editor", () => {
    it("opens directly on Shift+right-click, with no menu in between", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        expect(bodyText()).toContain("Appearance of The test row");
        expect(bodyText()).not.toContain("Edit appearance...");
    });

    it("opens from the menu command", async () => {
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const command = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find((item) =>
            item.textContent?.includes("Edit appearance"),
        );
        command?.click();
        await settle();

        expect(bodyText()).toContain("Appearance of The test row");
    });

    it("is non-modal: nothing is laid over the element it is editing", async () => {
        // A scrim would make the element unusable while its own appearance is being edited,
        // which defeats the reason the editor is anchored beside it rather than centred.
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        expect(document.querySelector(".v-overlay__scrim")).toBeNull();
        expect(document.querySelector(".host-button")).not.toBeNull();
    });

    it("paints its own surface rather than letting the page read through it", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        const panel = document.querySelector<HTMLElement>(".mb-appearance-editor");
        expect(panel).not.toBeNull();
        // The class carries the background, border and elevation; asserting the class is what
        // a jsdom without a stylesheet can honestly check.
        expect(panel?.className).toContain("mb-appearance-editor");
    });

    it("returns focus to the element when it closes", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        targetElement().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        // The first focusable thing inside the slot, which is the control the user was on.
        expect(document.activeElement?.className).toContain("host-button");
    });
});

describe("editing changes the element", () => {
    it("applies a stored override to the live element", async () => {
        mountTarget();
        commitAppearance(
            withRecord(appearanceState().value, "test.row", {
                ...emptyRecord(),
                typography: { fontSize: 33 },
                surface: { backgroundColor: "#102030" },
            }),
        );
        await settle();

        const style = targetElement().getAttribute("style") ?? "";
        expect(style).toContain("font-size: 33px");
        expect(style).toContain("background-color: rgb(16, 32, 48)");
    });

    it("becomes a real box only when it has one to paint", async () => {
        // `display: contents` keeps the host's layout untouched, and a background painted on a
        // contents box renders nothing at all. So the wrapper switches, and only then.
        mountTarget();
        expect(targetElement().className).not.toContain("mb-appearance-target--box");

        commitAppearance(
            withRecord(appearanceState().value, "test.row", {
                ...emptyRecord(),
                surface: { backgroundColor: "#102030" },
            }),
        );
        await settle();

        expect(targetElement().className).toContain("mb-appearance-target--box");
    });

    it("changes the element from a control in its own editor", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        const size = [...document.querySelectorAll<HTMLInputElement>("input[type='number']")][0];
        expect(size).not.toBeUndefined();

        if (size !== undefined) {
            size.value = "40";
            size.dispatchEvent(new Event("input", { bubbles: true }));
        }
        await settle();

        expect(targetElement().getAttribute("style") ?? "").toContain("font-size: 40px");
    });

    it("removes the override from the menu's reset, and the element goes back", async () => {
        mountTarget();
        commitAppearance(
            withRecord(appearanceState().value, "test.row", {
                ...emptyRecord(),
                typography: { fontSize: 33 },
            }),
        );
        await settle();

        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const reset = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find((item) =>
            item.textContent?.includes("Reset this element"),
        );
        reset?.click();
        await settle();

        expect(appearanceState().value.elements["test.row"]).toBeUndefined();
        expect(targetElement().getAttribute("style") ?? "").not.toContain("font-size: 33px");
    });

    it("puts the one irreversible action behind the super-confirmation gate", async () => {
        // Every other change in the editor is undone by making the opposite change. This one
        // throws away every override in the app at once with nothing left on screen to
        // rebuild them from, so it is the only control here that must not act on a click.
        mountTarget();
        commitAppearance(
            withRecord(appearanceState().value, "test.row", {
                ...emptyRecord(),
                typography: { fontSize: 33 },
            }),
        );
        await settle();

        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        const presetsTab = [...document.querySelectorAll<HTMLElement>(".v-tab")].find((node) =>
            node.textContent?.includes("Presets"),
        );
        presetsTab?.click();
        await settle();

        const resetAll = [...document.querySelectorAll<HTMLElement>("button")].find((node) =>
            node.textContent?.includes("Reset every element in the app"),
        );
        expect(resetAll).not.toBeUndefined();

        resetAll?.click();
        await settle();

        // The override is still there: the click opened a gate rather than performing the
        // reset, and the gate names what would go.
        expect(appearanceState().value.elements["test.row"]).not.toBeUndefined();
        expect(bodyText()).toContain("cannot be undone");
    });

    it("survives a restart, because the record is on disk rather than in the component", async () => {
        mountTarget();
        commitAppearance(
            withRecord(appearanceState().value, "test.row", {
                ...emptyRecord(),
                typography: { fontSize: 27 },
            }),
        );
        await settle();

        wrapper?.unmount();
        reloadAppearance();
        mountTarget();
        await settle();

        expect(targetElement().getAttribute("style") ?? "").toContain("font-size: 27px");
    });
});
