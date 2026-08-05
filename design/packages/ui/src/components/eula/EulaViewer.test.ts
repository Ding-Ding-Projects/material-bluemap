// @vitest-environment jsdom

/**
 * The EULA viewer's own "Export" menu, mounted.
 *
 * Everything else about this viewer -- the section categorisation, the tab strip wiring, the
 * provenance sentences -- has its own tests next door. What this file proves is narrower:
 * that the "Export" picker carries a search field at all, that typing into it narrows the
 * six rows without changing what any of them does, that a row disabled because no section is
 * active stays disabled even while it is shown and says why, and that Escape behaves the
 * same two-step way every other filterable context menu in this application does.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { computed, h, nextTick, ref } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import EulaViewer from "./EulaViewer.vue";
import type { EulaController, EulaState } from "./eulaBridge.js";
import type { MenuSearchItem } from "../menuSearch/MenuSearchList.vue";

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

    globalThis.visualViewport = {
        width: 1024,
        height: 768,
        offsetLeft: 0,
        offsetTop: 0,
        pageLeft: 0,
        pageTop: 0,
        scale: 1,
        onresize: null,
        onscroll: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;

    const cells = new Map<string, string>();
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

/**
 * Two numbered clauses, which `categoriseEula` reliably splits into two sections: a
 * heading always opens a new one, and "1." / "2." both match the numbered-heading shape.
 */
const TEXT = [
    "1. What you may do",
    "",
    "You may install and use this software for personal, non-commercial purposes.",
    "",
    "2. What you may not do",
    "",
    "You may not redistribute this software without our prior written permission.",
].join("\n");

function fakeController(): EulaController {
    const state = ref<EulaState>({
        source: "cache",
        text: TEXT,
        documentUrl: "https://www.minecraft.net/eula",
        fetchedAt: "2026-08-01T00:00:00Z",
        failure: null,
    });
    return {
        state,
        busy: ref(false),
        available: true,
        isTheDocument: computed(() => true),
        load: async () => {},
    };
}

function render(): VueWrapper {
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
    return mount(VApp, {
        attachTo: document.body,
        global: { plugins: [i18n, createVuetify()] },
        slots: {
            default: () => h(EulaViewer, { controller: fakeController() }),
        },
    });
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    globalThis.localStorage.clear();
});

/** The overlay opens and closes across several ticks: the activator, the transition and the content. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await nextTick();
}

async function openExportMenu(): Promise<void> {
    await settle();
    const button = wrapper?.findAll("button").find((candidate) => candidate.text().includes("Export"));
    if (button === undefined) throw new Error("the export button was not found");
    await button.trigger("click");
    await settle();
}

describe("the export menu", () => {
    it("carries its own search field, listing every row of the picker", async () => {
        wrapper = render();
        await openExportMenu();

        const body = document.body.textContent ?? "";
        expect(body).toContain("Markdown");
        expect(document.querySelector(".mb-menu-search")).not.toBeNull();
    });

    it("narrows the rows as the search is typed", async () => {
        wrapper = render();
        await openExportMenu();

        const search = document.querySelector<HTMLInputElement>(".mb-menu-search input[type='text']");
        expect(search).not.toBeNull();
        // "Copy the whole document" is the only one of the six rows that starts this way;
        // the two Markdown/plain-text export rows both also mention "the whole document"
        // without "Copy", which is exactly why this query is worded to exclude them.
        search!.value = "Copy the whole";
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        const rows = [...document.querySelectorAll(".v-list-item")].map((row) => row.textContent ?? "");
        expect(rows.some((text) => text.includes("Copy the whole document"))).toBe(true);
        expect(rows.every((text) => !text.includes("Markdown"))).toBe(true);
        expect(rows).toHaveLength(1);
    });

    it("shows the honest no-match state when nothing survives the filter", async () => {
        wrapper = render();
        await openExportMenu();

        const search = document.querySelector<HTMLInputElement>(".mb-menu-search input[type='text']");
        search!.value = "nothing in this list is named that";
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(document.body.textContent).toContain("No command here matches that");
    });

    it("Escape clears a typed query before it closes the menu", async () => {
        wrapper = render();
        await openExportMenu();

        const search = document.querySelector<HTMLInputElement>(".mb-menu-search input[type='text']");
        search!.value = "copy all";
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();
        expect(document.body.textContent).not.toContain("Markdown");

        search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await settle();

        expect(search!.value).toBe("");
        expect(document.body.textContent).toContain("Markdown");

        search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(document.querySelectorAll(".mb-menu-search")).toHaveLength(0);
    });

    it("names why the three section-scoped rows are dimmed once no section is open", async () => {
        wrapper = render();
        await settle();
        const viewer = wrapper?.findComponent(EulaViewer);
        if (viewer === undefined) throw new Error("EulaViewer was not found in the tree");

        // The fixture text parses into two sections and seedEulaStrip opens the first one,
        // so this closes both tabs through the real close button rather than reaching into
        // private state - the only way `activeSection` genuinely reaches null.
        for (let round = 0; round < 2; round++) {
            const closeButton = wrapper
                ?.findAll("button")
                .find((button) => (button.attributes("aria-label") ?? "").startsWith("Close "));
            if (closeButton === undefined) throw new Error(`expected a close button to remain, round ${round}`);
            await closeButton.trigger("click");
            await settle();
        }

        expect(viewer.vm.activeSection).toBeNull();

        const items = viewer.vm.exportItems as MenuSearchItem[];
        for (const id of ["section-markdown", "section-text", "copy-section"]) {
            const item = items.find((candidate) => candidate.id === id);
            expect(item?.disabled, id).toBe(true);
            expect(item?.reason, id).toBeTruthy();
        }
        // The two whole-document rows never depended on a section being open and still do not.
        for (const id of ["all-markdown", "all-text", "copy-all"]) {
            const item = items.find((candidate) => candidate.id === id);
            expect(item?.disabled, id).toBeFalsy();
            expect(item?.reason, id).toBeUndefined();
        }
    });
});
