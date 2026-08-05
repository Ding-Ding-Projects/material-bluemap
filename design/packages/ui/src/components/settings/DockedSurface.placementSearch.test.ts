// @vitest-environment jsdom

/**
 * The placement chooser's own search field, mounted.
 *
 * The chooser used to be a bare fixed `v-list` -- seven rows (five placements plus two
 * reset actions) with no way to filter them, the last context menu in this application
 * without one. This proves the fix actually filters, rather than trusting
 * `menuCoverage.test.ts`'s source grep alone: typing narrows the placement rows and the
 * reset rows together, the honest no-match state appears when nothing survives, a row that
 * matches by its own reset label stays reachable, and Escape clears the query before it
 * closes the menu, exactly like every other filterable context menu here.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";

import DockedSurface from "./DockedSurface.vue";

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

    // Vuetify's overlay positioning (the placement chooser's own `v-menu`) reads this while
    // open; jsdom has no viewport of its own.
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
    setup() {
        return () =>
            h(VApp, null, {
                default: () => [
                    h(DockedSurface, {
                        surfaceId: "placement-search-test",
                        title: "Settings",
                        open: true,
                        defaultPlacement: "right",
                        "onUpdate:open": () => {},
                    }),
                ],
            });
    },
});

let wrapper: VueWrapper<InstanceType<typeof Host>> | null = null;

async function settle(): Promise<void> {
    for (let index = 0; index < 4; index++) {
        await nextTick();
        await Promise.resolve();
    }
}

function render(): VueWrapper<InstanceType<typeof Host>> {
    wrapper = mount(Host, {
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<InstanceType<typeof Host>>;
    return wrapper;
}

async function openChooser(): Promise<void> {
    const chooser = document.querySelector<HTMLElement>(".mb-docked__placement");
    if (chooser === null) throw new Error("no placement chooser button rendered");
    chooser.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await settle();
}

function searchInput(): HTMLInputElement {
    const input = document.querySelector<HTMLInputElement>(".mb-docked__menu input[type='text']");
    if (input === null) throw new Error("no search field rendered inside the placement menu");
    return input;
}

afterEach(async () => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("DockedSurface: the placement chooser's search field", () => {
    it("carries a search field once opened", async () => {
        render();
        await settle();
        await openChooser();

        expect(document.querySelector(".mb-docked__menu input[type='text']")).not.toBeNull();
        // Every placement starts visible.
        for (const label of ["Floating panel", "Docked to the left", "Docked to the right", "Docked to the top", "Docked to the bottom"]) {
            expect(document.body.textContent).toContain(label);
        }
    });

    it("narrows the placement rows as the search is typed", async () => {
        render();
        await settle();
        await openChooser();

        const search = searchInput();
        search.value = "left";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        const rows = [...document.querySelectorAll(".v-list-item")].map((row) => row.textContent ?? "");
        expect(rows.some((text) => text.includes("Docked to the left"))).toBe(true);
        expect(rows.every((text) => !text.includes("Docked to the right"))).toBe(true);
        expect(rows.every((text) => !text.includes("Floating panel"))).toBe(true);
    });

    it("keeps a reset row reachable by its own label, independent of the placement rows", async () => {
        render();
        await settle();
        await openChooser();

        const search = searchInput();
        search.value = "Put every panel back where it started";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(document.body.textContent).toContain("Put every panel back where it started");
        expect(document.body.textContent).not.toContain("Floating panel");
        expect(document.body.textContent).not.toContain("Docked to the left");
    });

    it("shows the honest no-match state when nothing survives the filter", async () => {
        render();
        await settle();
        await openChooser();

        const search = searchInput();
        search.value = "nothing in this menu is named that";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(document.body.textContent).toContain("No command here matches that");
    });

    it("Escape clears a typed query before it closes the menu", async () => {
        render();
        await settle();
        await openChooser();

        // The chooser button's own tooltip and accessible name both say "Currently: Docked
        // to the right", so the assertions below read the open menu's own rows rather than
        // `document.body.textContent` as a whole -- that text is always present nearby and
        // would make this test pass whether or not the filter actually worked.
        const rowLabels = (): string[] =>
            [...document.querySelectorAll(".mb-docked__menu .v-list-item")].map((row) => row.textContent ?? "");

        const search = searchInput();
        search.value = "left";
        search.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();
        expect(rowLabels().some((text) => text.includes("Docked to the right"))).toBe(false);

        search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await settle();

        expect(search.value).toBe("");
        expect(rowLabels().some((text) => text.includes("Docked to the right"))).toBe(true);

        search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        // The overlay's own leave transition never resolves in jsdom (no real CSS, no
        // `transitionend`), so the popup content can still linger in the DOM after this;
        // `aria-expanded` is what the component itself, and a screen reader, treat as the
        // authoritative open state, and it flips the moment `onEscape` closes the menu.
        expect(document.querySelector(".mb-docked__placement")?.getAttribute("aria-expanded")).toBe("false");
    });
});
