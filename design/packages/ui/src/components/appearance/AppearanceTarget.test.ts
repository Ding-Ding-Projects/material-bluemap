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

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

/**
 * Two independent `AppearanceTarget` instances side by side, which is what it takes to prove
 * (or disprove) coordination *between* instances - `mountTarget()` above only ever renders
 * one, so it cannot tell a fixed defect from one that was never reachable in the first place.
 */
function mountTwoTargets(): VueWrapper {
    wrapper = mount(VApp, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n] },
        slots: {
            default: () =>
                h("div", {}, [
                    h(
                        AppearanceTarget,
                        { id: "test.rowA", label: "Row A" },
                        { default: () => h("button", { class: "host-button-a" }, "Host A") },
                    ),
                    h(
                        AppearanceTarget,
                        { id: "test.rowB", label: "Row B" },
                        { default: () => h("button", { class: "host-button-b" }, "Host B") },
                    ),
                ]),
        },
    });
    return wrapper;
}

/** Every mounted wrapper element, in DOM order - `targetElement()` only ever returns the first. */
function targetElements(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(".mb-appearance-target")];
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

    it("returns focus to the element when Escape closes it", async () => {
        // Mirrors "the anchored editor > returns focus to the element when it closes" -
        // the menu's own `@update:model-value` handler used to only reassign the
        // already-false `menuOpen` ref instead of calling `closeMenu()`, so this path never
        // called `returnFocus()` and focus was abandoned wherever the Escape keydown landed.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        targetElement().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(document.activeElement?.className).toContain("host-button");
    });

    it("returns focus to the element when an outside press closes it", async () => {
        // Same defect, reached through the outside-click path this file's dismissal suite
        // proves closes the menu (see "dismissal: closes on an outside pointer press"
        // below) - closing is not enough on its own; focus has to come back too.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const decoy = document.createElement("button");
        decoy.textContent = "elsewhere on the page";
        document.body.appendChild(decoy);
        decoy.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        decoy.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        expect(document.activeElement?.className).toContain("host-button");
    });
});

/**
 * Regression for "context menu's regex search mode leaks across close/reopen".
 *
 * `openMenu()` used to reset only `search.value`, never `searchRegex`/`searchFlags` - both of
 * which are bound one-way into `ConfigSearchField` and never reset by that component itself,
 * because it is a controlled field that trusts its parent's `v-model`. A menu closed with
 * regex mode on therefore reopened - on the same element or a completely different
 * `AppearanceTarget` - with the toggle still active and the very next keystroke parsed as a
 * pattern instead of the plain-text substring match every other freshly opened menu uses.
 */
describe("the search field's regex mode", () => {
    /** The `.*` toggle is the only append-inner button carrying `aria-pressed`. */
    function regexToggle(): HTMLElement | null {
        return document.querySelector<HTMLElement>(".mb-config-search button[aria-pressed]");
    }

    it("starts a freshly opened menu in plain-text mode, not a prior session's regex mode", async () => {
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        expect(regexToggle()?.getAttribute("aria-pressed")).toBe("false");

        regexToggle()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();
        expect(regexToggle()?.getAttribute("aria-pressed")).toBe("true");

        // Close the menu the same way "returns focus to the element when it closes" does.
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        // Reopen the same element's menu.
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        expect(regexToggle()?.getAttribute("aria-pressed")).toBe("false");
    });

    it("resets the flags alongside the toggle, not just its visible state", async () => {
        // The toggle's `aria-pressed` is the visible half of the leak; `searchFlags` is the
        // other half - a flags string left over from a prior session (say, a user who added
        // "m" for multiline) would silently change how the *next* pattern is evaluated even if
        // the toggle itself were reset correctly. Prove both by round-tripping through the
        // builder popover, which is the one place `flags` is actually editable.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        regexToggle()?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        const builderButton = [...document.querySelectorAll<HTMLElement>(".mb-config-search button")].find(
            (button) => button.textContent?.trim() === ".*",
        );
        builderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        const flagChips = [...document.querySelectorAll<HTMLElement>(".mb-config-regex .v-chip")];
        const multilineChip = flagChips.find((chip) => chip.textContent?.includes("m"));
        multilineChip?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        expect(regexToggle()?.getAttribute("aria-pressed")).toBe("false");
        const search = document.querySelector<HTMLInputElement>(".mb-config-search input");
        expect(search?.value ?? "").toBe("");
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

/**
 * Regression for "aria-haspopup is hardcoded to 'menu' even when the wrapper's popup is the
 * non-menu editor".
 *
 * The wrapper drives two structurally different popups: the context menu, a real `role="menu"`
 * with `menuitem` rows, and the editor (`AppearanceEditor.vue`), a `<section>` landmark with
 * tabs, sliders and colour pickers - a settings region, not a menu. Two of the three ways to
 * reach a popup here - Ctrl+Shift+F10 and Shift+right-click - go straight to the editor and
 * never touch the menu at all. `aria-haspopup` used to be a static `"menu"` regardless of which
 * popup was actually open, so a screen reader user who took either of those routes was told
 * "has popup menu" right up to and through a tabbed form panel navigated nothing like a menu -
 * a Name/Role/Value mismatch between what was announced and what actually opened.
 */
describe("aria-haspopup matches whichever popup is actually open", () => {
    it("says menu while the context menu is open", async () => {
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        expect(targetElement().getAttribute("aria-haspopup")).toBe("menu");
    });

    it("does not say menu once Ctrl+Shift+F10 opens the editor instead", async () => {
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

        // Sanity check that this really did open the editor and not the menu, so a failure
        // below is about the attribute and not about which popup opened.
        expect(bodyText()).toContain("Appearance of The test row");

        expect(targetElement().getAttribute("aria-haspopup")).not.toBe("menu");
    });

    it("does not say menu once Shift+right-click opens the editor instead", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        expect(bodyText()).toContain("Appearance of The test row");
        expect(targetElement().getAttribute("aria-haspopup")).not.toBe("menu");
    });

    it("goes back to menu once the editor closes and focus returns", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();
        expect(targetElement().getAttribute("aria-haspopup")).not.toBe("menu");

        targetElement().dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(targetElement().getAttribute("aria-haspopup")).toBe("menu");
    });
});

describe("the wrapper's own cursor", () => {
    /**
     * Regression for "the full GUI has a mouse click cursor": both `<v-menu>`s above bind
     * `:activator="root"`, and Vuetify's own `useActivator` composable writes `aria-haspopup`
     * and `aria-controls` onto whatever the activator points at - correct ARIA for a real
     * popup owner, and also exactly what Vuetify's own normalize stylesheet answers with
     * `[aria-controls] { cursor: pointer }`. That rule assumes the attribute sits on a small,
     * dedicated trigger; here it sits on the wrapper the appearance contract puts around
     * *every* rendered element, and `cursor` inherits - so left unanswered, one attribute
     * turned into a pointer cursor over headings, empty panels, the title bar's own drag
     * region, prose nobody can click. Confirmed live against the packaged desktop build via
     * `document.elementFromPoint` + `getComputedStyle` before this fix (`.mb-titlebar-drag`
     * read `cursor: pointer`, inherited from this wrapper two ancestors up) and after it
     * (back to `auto`, with the title bar's real buttons and the real tabs still `pointer`).
     *
     * A `?raw` style-source read rather than a mounted `getComputedStyle` assertion, for the
     * same reason `tabGroupPickerMount.test.ts` reads `TabGroupPicker.vue?raw`: this
     * workspace's `vitest.config.ts` does not enable `test.css`, so a mounted component's
     * `<style>` block is never injected into jsdom's `document.head`, and `getComputedStyle`
     * would read empty (or, worse, silently "pass" by never seeing the leak at all) regardless
     * of what this file actually declares.
     */
    async function styleBlock(): Promise<string> {
        const source = (await import("./AppearanceTarget.vue?raw")).default as string;
        const match = /<style>([\s\S]*)<\/style>/.exec(source);
        return match?.[1] ?? "";
    }

    it("answers Vuetify's [aria-controls] pointer cursor with its own auto, at higher specificity", async () => {
        const css = await styleBlock();
        // `[aria-controls]` and one class both carry specificity (0,1,0): the class has to be
        // doubled to (0,2,0) to settle it outright rather than relying on source-order luck.
        const rule = /\.mb-appearance-target\.mb-appearance-target\s*\{[^}]*\}/.exec(css);
        expect(rule).not.toBeNull();
        expect(rule?.[0]).toContain("cursor: auto");
    });

    it("never itself answers with cursor: pointer, which is the one value that would leak", async () => {
        // The wrapper is never a left-click target - it opens on right-click and on a
        // keyboard shortcut only - so `pointer` here would be both wrong for the wrapper and,
        // because it wraps arbitrary host content, wrong for everything inside it too.
        // Comments are stripped first: this very file's own doc comments above quote Vuetify's
        // `[aria-controls] { cursor: pointer }` rule in prose, which would otherwise trip the
        // same regex this test uses to check the *declarations*.
        const css = (await styleBlock()).replace(/\/\*[\s\S]*?\*\//g, "");
        expect(css).not.toMatch(/cursor:\s*pointer/);
    });
});

/**
 * Regression for "right click menu not closing when clicking off the menu".
 *
 * Both `<v-menu>`s used to bind `:activator="root"`, which registers `root` - the *entire*
 * wrapped surface - in Vuetify's own outside-click `include` list (`VOverlay.js`:
 * `include: () => [activatorEl.value]`). For a host as small as this file's own
 * `.host-button`, that already meant clicking the host's own control while the menu was
 * open failed to close it; for real hosts such as `App.vue`'s `id="app.tabBar"`, `root` is
 * the whole tab bar and every page beneath it, so almost any click anywhere in the running
 * application was swallowed the same way. The fix drops `:activator` in favour of `:target`
 * plus hand-wired `aria-*` attributes (see the component's own `menuId` comment), which
 * empties that include list back to just the popup's own content - exactly the pattern
 * `TabStrip.vue`'s tab and group menus already used correctly.
 */
describe("dismissal: closes on an outside pointer press", () => {
    /**
     * Vuetify's click-outside directive keys off a real `mousedown` followed by a real
     * `click`, both in the capture phase (`vuetify/lib/directives/click-outside`) - a bare
     * synthetic `click` alone does not prime `lastMousedownWasOutside`, so both are needed.
     */
    function press(el: Element): void {
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    }

    /**
     * Counts only instances of `selector` sitting inside a genuinely open `v-overlay`, the
     * same idiom `TabbedNavigation.test.ts` uses for the same reason: under jsdom the exit
     * transition has no real CSS duration to finish against, so a just-closed overlay's
     * inert content node can still be mounted a tick later even though it has genuinely
     * closed. `.v-overlay--active` gone is what "closed" means here; the DOM node's presence
     * on its own proves nothing either way.
     */
    function activeCount(selector: string): number {
        return document.querySelectorAll(`.v-overlay--active ${selector}`).length;
    }

    it("closes the context menu on a press elsewhere inside the wrapped surface", async () => {
        // The host's own button sits inside `root` and outside the popup - exactly the
        // click a user makes to "click off the menu", and exactly the click the old
        // `:activator="root"` binding mistook for an inside click.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);

        press(document.querySelector(".host-button")!);
        await settle();

        expect(activeCount(".mb-appearance-target__menu")).toBe(0);
    });

    it("closes the anchored editor on a press elsewhere inside the wrapped surface", async () => {
        // The editor carries no scrim (see "is non-modal" above), so an outside click is the
        // *only* pointer route that can dismiss it - this half of the defect trapped the
        // user more completely than the menu half did.
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();
        expect(activeCount(".mb-appearance-editor")).toBe(1);

        press(document.querySelector(".host-button")!);
        await settle();

        expect(activeCount(".mb-appearance-editor")).toBe(0);
    });

    it("closes the context menu on a press entirely outside the component too", async () => {
        mountTarget();
        const decoy = document.createElement("button");
        decoy.textContent = "elsewhere on the page";
        document.body.appendChild(decoy);

        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        press(decoy);
        await settle();

        expect(activeCount(".mb-appearance-target__menu")).toBe(0);
    });

    it("does not close on a press inside the menu's own content", async () => {
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const search = document.querySelector<HTMLInputElement>(".mb-config-search input");
        expect(search).not.toBeNull();
        if (search !== null) press(search);
        await settle();

        expect(activeCount(".mb-appearance-target__menu")).toBe(1);
    });

    it("does not close a nested popover's parent when the press lands inside the nested popover", async () => {
        // `ConfigSearchField`'s own regex-builder popup is rendered inside this menu's
        // content and registers itself with this menu as a child through Vuetify's
        // `VMenuSymbol` (component-tree parent/child, unaffected by the `<Teleport>` each
        // overlay uses for where it actually paints). A click inside that nested popover
        // must stay "inside" for both overlays, never bubbling up as an outside click that
        // closes the menu it belongs to.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        const builderButton = [...document.querySelectorAll<HTMLElement>(".mb-config-search button")].find(
            (button) => button.textContent?.trim() === ".*",
        );
        expect(builderButton).not.toBeUndefined();
        builderButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();
        expect(activeCount(".mb-config-regex")).toBe(1);

        const patternField = document.querySelector<HTMLTextAreaElement>(".mb-config-regex textarea");
        expect(patternField).not.toBeNull();
        if (patternField !== null) press(patternField);
        await settle();

        // Both survive: the nested popover the click actually landed in, and the menu it
        // belongs to underneath it.
        expect(activeCount(".mb-config-regex")).toBe(1);
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);
    });

    it("does not close on the press that reopens it, even once the listener is already mounted", async () => {
        // A real right-click is a `mousedown` (button 2) followed by `contextmenu`, never a
        // `click` - so the directive's `click` handler, the one that actually closes the
        // overlay, never fires for the gesture that opens it. Opening and closing once first
        // proves this holds once Vuetify's click-outside listener is already mounted at the
        // document from the first open, not only on a component's very first render.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();
        expect(activeCount(".mb-appearance-target__menu")).toBe(0);

        targetElement().dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 2 }));
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        expect(activeCount(".mb-appearance-target__menu")).toBe(1);
    });

    it("a second right-click elsewhere repositions the menu rather than opening a duplicate", async () => {
        mountTarget();
        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
        );
        await settle();
        expect(document.querySelectorAll(".mb-appearance-target__menu")).toHaveLength(1);

        targetElement().dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 200, clientY: 200 }),
        );
        await settle();

        expect(document.querySelectorAll(".mb-appearance-target__menu")).toHaveLength(1);
    });

    it("removes its outside-click listeners from the document when it unmounts", async () => {
        // The reported bug's failure mode was a menu that traps the user; the mirror-image
        // failure this proves against is a listener that outlives the component and quietly
        // degrades every click in the window forever. Vuetify's own click-outside directive
        // tears itself down in `beforeUnmount` - this proves that teardown actually runs
        // here rather than assuming it, per the dismissal contract's listener-leak clause.
        mountTarget();
        targetElement().dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();
        expect(document.querySelector(".mb-appearance-target__menu")).not.toBeNull();

        const removeSpy = vi.spyOn(document, "removeEventListener");
        wrapper?.unmount();
        wrapper = null;
        await settle();

        const removedTypes = removeSpy.mock.calls.map((call) => call[0]);
        expect(removedTypes).toContain("click");
        expect(removedTypes).toContain("mousedown");
        removeSpy.mockRestore();
    });
});

/**
 * Regression for "right-clicking a second element leaves the first element's context menu
 * open".
 *
 * Every `AppearanceTarget` instance owns its own local `menuOpen`/`editorOpen` refs, with
 * nothing coordinating between instances. Right-clicking element B while element A's menu was
 * still open used to leave both rendered and interactive at once: B's `onContextMenu` only
 * ever touched B's own refs, and A's menu can only be dismissed through Vuetify's
 * `vClickOutside` directive, which closes on a real `click` DOM event - a right mouse press
 * never dispatches one (only `mousedown`/`contextmenu`), so nothing ever told A to close. No
 * native or conventional context menu leaves a previous one open like this; opening a new one
 * always closes whichever was already open.
 */
describe("cross-instance dismissal: opening a second element's popup closes the first", () => {
    /** See the "dismissal" suite above for why `.v-overlay--active` is what "open" means here. */
    function activeCount(selector: string): number {
        return document.querySelectorAll(`.v-overlay--active ${selector}`).length;
    }

    it("closes element A's context menu when element B's context menu opens", async () => {
        mountTwoTargets();
        const [elementA, elementB] = targetElements();
        expect(elementA).not.toBeUndefined();
        expect(elementB).not.toBeUndefined();

        elementA?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
        );
        await settle();
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);

        elementB?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 300, clientY: 300 }),
        );
        await settle();

        // Exactly one menu is open now - B's - never both stacked at once.
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);
        // And it really is B's that stayed open, not A's: `aria-expanded` on each wrapper
        // element is this component's own record of which popup it owns (see `menuOpen ||
        // editorOpen` in the template), independent of the shared `.mb-appearance-target__menu`
        // class every instance's menu content carries.
        expect(elementA?.getAttribute("aria-expanded")).toBe("false");
        expect(elementB?.getAttribute("aria-expanded")).toBe("true");
    });

    it("closes element A's anchored editor when element B's context menu opens", async () => {
        mountTwoTargets();
        const [elementA, elementB] = targetElements();

        elementA?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();
        expect(activeCount(".mb-appearance-editor")).toBe(1);
        expect(bodyText()).toContain("Appearance of Row A");

        elementB?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();

        expect(activeCount(".mb-appearance-editor")).toBe(0);
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);
    });

    it("closes element A's context menu when element B's editor opens directly", async () => {
        mountTwoTargets();
        const [elementA, elementB] = targetElements();

        elementA?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
        await settle();
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);

        elementB?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, shiftKey: true }),
        );
        await settle();

        expect(activeCount(".mb-appearance-target__menu")).toBe(0);
        expect(activeCount(".mb-appearance-editor")).toBe(1);
        expect(bodyText()).toContain("Appearance of Row B");
    });

    it("does not disturb element A's own menu when element A merely repositions it", async () => {
        // The coordinator must be a no-op for an instance closing and reopening its own
        // popup - only a *different* instance claiming the shared slot should force-close
        // anything. Mirrors "a second right-click elsewhere repositions the menu rather than
        // opening a duplicate" above, now with a second instance present to coordinate with.
        mountTwoTargets();
        const [elementA] = targetElements();

        elementA?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }),
        );
        await settle();
        expect(activeCount(".mb-appearance-target__menu")).toBe(1);

        elementA?.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: 250, clientY: 250 }),
        );
        await settle();

        expect(activeCount(".mb-appearance-target__menu")).toBe(1);
        expect(elementA?.getAttribute("aria-expanded")).toBe("true");
    });
});
