// @vitest-environment jsdom

/**
 * The history comparison's own "Export" menu, mounted.
 *
 * Everything else about this panel is proved through `HistoryPanel.test.ts`, which mounts
 * this component only to check the wiring at its boundary (swap, close, restore). What that
 * file does not exercise is the "Export" picker itself: whether it carries a search field at
 * all, whether typing into it really narrows the four formats, and whether Escape behaves the
 * two-step way every other filterable context menu in this application does. That is what
 * this file proves.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { h, nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import HistoryComparison from "./HistoryComparison.vue";
import type { HistoryComparisonFile, HistoryRevision } from "./historyHost.js";

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
});

const FROM: HistoryRevision = {
    id: "a1",
    shortId: "a1",
    at: "2026-08-01T10:00:00-04:00",
    label: "Older",
    action: "save",
    changes: [],
    note: null,
    restoredFrom: null,
};

const TO: HistoryRevision = {
    id: "b2",
    shortId: "b2",
    at: "2026-08-02T10:00:00-04:00",
    label: "Newer",
    action: "save",
    changes: [],
    note: null,
    restoredFrom: null,
};

const FILES: HistoryComparisonFile[] = [
    { path: "core.conf", status: "modified", patch: "@@ -1 +1 @@", before: "a", after: "b", withheld: null },
];

function renderComparison(): VueWrapper {
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
            default: () => h(HistoryComparison, { from: FROM, to: TO, files: FILES }),
        },
    });
}

/** The comparison instance nested inside the `VApp` wrapper, for reading its own emits. */
function comparison(wrap: VueWrapper) {
    return wrap.findComponent(HistoryComparison);
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
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

/**
 * Vuetify binds the activator's click handler from a post-flush watcher, one tick after
 * mount. Clicking before that lands hits a button with no listener on it yet, and the menu
 * silently does not open, so this settles first and again after the click itself.
 */
async function openExportMenu(): Promise<void> {
    await settle();
    const button = wrapper?.findAll("button").find((candidate) => candidate.text().includes("Export"));
    await button?.trigger("click");
    await settle();
}

describe("the export menu", () => {
    it("carries its own search field, filtering the four formats down as it is typed", async () => {
        wrapper = renderComparison();
        await openExportMenu();

        expect(document.body.textContent).toContain("Markdown file");
        expect(document.body.textContent).toContain("JSON file");
        expect(document.body.textContent).toContain("CSV file");
        expect(document.body.textContent).toContain("Plain text file");

        const search = document.querySelector<HTMLInputElement>(".mb-menu-search input[type='text']");
        expect(search).not.toBeNull();
        search!.value = "json";
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(document.body.textContent).toContain("JSON file");
        expect(document.body.textContent).not.toContain("Markdown file");
        expect(document.body.textContent).not.toContain("Plain text file");
    });

    it("shows the honest no-match state when nothing survives the filter", async () => {
        wrapper = renderComparison();
        await openExportMenu();

        const search = document.querySelector<HTMLInputElement>(".mb-menu-search input[type='text']");
        search!.value = "nothing matches this at all";
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();

        expect(document.body.textContent).toContain("No command here matches that");
    });

    it("downloads the chosen format and closes the menu", async () => {
        wrapper = renderComparison();
        await openExportMenu();

        const item = [...document.querySelectorAll<HTMLElement>(".v-list-item")].find((row) =>
            row.textContent?.includes("JSON file"),
        );
        item?.click();
        await settle();

        expect(comparison(wrapper).emitted("download")?.[0]).toEqual(["json"]);
        expect(document.body.textContent).not.toContain("Markdown file");
    });

    it("Escape clears a typed query before it closes the menu", async () => {
        wrapper = renderComparison();
        await openExportMenu();

        const search = document.querySelector<HTMLInputElement>(".mb-menu-search input[type='text']");
        search!.value = "json";
        search!.dispatchEvent(new Event("input", { bubbles: true }));
        await settle();
        expect(document.body.textContent).not.toContain("Markdown file");

        search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
        await settle();

        // The query cleared and the menu is still open: the full list is back.
        expect(search!.value).toBe("");
        expect(document.body.textContent).toContain("Markdown file");

        // A second Escape, with nothing left to clear, reaches the menu itself.
        search!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await settle();

        expect(document.querySelectorAll(".mb-menu-search")).toHaveLength(0);
    });
});
