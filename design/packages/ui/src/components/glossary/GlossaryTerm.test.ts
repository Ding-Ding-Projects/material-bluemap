// @vitest-environment jsdom

/**
 * `GlossaryTerm.vue`: a real `<button>` (native keyboard activation, exactly like every other
 * icon button in this app - see `PathField.test.ts`'s own comment on the same point) that
 * opens a click-triggered `v-menu`, never a hover-only tooltip.
 */

import { h, nextTick } from "vue";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import GlossaryTerm from "./GlossaryTerm.vue";
import { GLOSSARY_TERMS, type GlossaryTermId } from "./glossaryTerms.js";
import { resetDocsLink, takePendingDocsArticle } from "../docs/docsLink.js";
import { voiceMessages } from "../../copy/appVoice.js";
import type { LanguageSettings } from "../../copy/appVoice.js";

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

    // Load-bearing for every test below, all of which open a real anchored `v-menu`.
    // Vuetify's location strategy reads `visualViewport` unguarded and asks the document
    // what is under a point, neither of which jsdom implements.
    Element.prototype.scrollIntoView = () => {};
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

const vuetify = createVuetify();

/** English at a mid funny level, from the real catalogue - not a fabricated test fixture. */
const REAL_SETTINGS: LanguageSettings = { mode: "en", funnyEn: 3, funnyYue: 3 };

function i18n() {
    return createI18n({
        legacy: false,
        missingWarn: false,
        fallbackWarn: false,
        locale: "en",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: { en: voiceMessages(REAL_SETTINGS) },
    });
}

/** Mounted inside `VApp` and attached to the document, which a teleported `v-menu` needs. */
function render(term: GlossaryTermId, label?: string): VueWrapper {
    return mount(VApp, {
        attachTo: document.body,
        global: { plugins: [vuetify, i18n()] },
        slots: {
            default: () => h(GlossaryTerm, label === undefined ? { term } : { term, label }),
        },
    });
}

/** The overlay opens and closes across several ticks, exactly as `ChangelogViewer.test.ts` waits. */
async function settle(): Promise<void> {
    for (let index = 0; index < 6; index++) {
        await nextTick();
        await Promise.resolve();
    }
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
    await nextTick();
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    resetDocsLink();
});

describe("the term data every affordance is built from", () => {
    it("gives every term a non-empty label, a catalogue key, an English fallback and an anchor", () => {
        for (const [id, meta] of Object.entries(GLOSSARY_TERMS)) {
            expect(meta.id, id).toBe(id);
            expect(meta.label.length, `${id} label`).toBeGreaterThan(0);
            expect(meta.key.length, `${id} key`).toBeGreaterThan(0);
            expect(meta.fallback.length, `${id} fallback`).toBeGreaterThan(20);
            expect(meta.anchor.length, `${id} anchor`).toBeGreaterThan(0);
        }
    });

    it("gives every term a distinct anchor, so two terms cannot both claim one glossary heading", () => {
        const anchors = Object.values(GLOSSARY_TERMS).map((meta) => meta.anchor);
        expect(new Set(anchors).size).toBe(anchors.length);
    });
});

describe("GlossaryTerm", () => {
    it("shows the term's own label next to a real, named, closed button", () => {
        wrapper = render("storage");
        expect(wrapper.text()).toContain("storage");

        const button = wrapper.findAll("button").find((row) => row.attributes("aria-label")?.includes("storage"));
        expect(button).toBeDefined();
        expect(button?.element.tagName).toBe("BUTTON");
        expect(button?.attributes("aria-expanded")).toBe("false");
    });

    it("lets a call site override the visible word while keeping the same underlying term", () => {
        wrapper = render("tile", "lowres tile");
        expect(wrapper.text()).toContain("lowres tile");
        expect(wrapper.text()).not.toContain("hires tile");
    });

    // A representative sample, not every term: the data-shape test above already proves
    // every entry is well-formed, and repeating this per term would only prove the same
    // resolution path sixteen times.
    it.each<GlossaryTermId>(["map", "storage", "project", "engine", "reaches"])(
        "resolves a real catalogue definition for %s, not the raw key",
        async (term) => {
            wrapper = render(term);
            await settle();
            const button = wrapper.findAll("button")[0];
            expect(button).toBeDefined();
            await button!.trigger("click");
            await settle();

            expect(button?.attributes("aria-expanded")).toBe("true");
            const shown = document.body.textContent ?? "";
            expect(shown).not.toContain(GLOSSARY_TERMS[term].key);
            // The catalogue at funny level 3 may reword the fallback, but it cannot invent a
            // sentence from nothing: something readable is on screen once the menu is open.
            expect(shown.length).toBeGreaterThan(0);
            expect(shown).toContain("Read more in the glossary");
        },
    );

    it("opens with a click, closes again, and returns to the honest aria-expanded=false state", async () => {
        wrapper = render("marker");
        await settle();
        const button = wrapper.findAll("button")[0]!;

        await button.trigger("click");
        await settle();
        expect(button.attributes("aria-expanded")).toBe("true");
        expect(document.body.textContent).toContain("marker set");

        await button.trigger("click");
        await settle();
        expect(button.attributes("aria-expanded")).toBe("false");
    });

    it("asks the docs browser for this term's own glossary heading, and closes on the way", async () => {
        wrapper = render("profile");
        await settle();
        const trigger = wrapper.findAll("button")[0]!;
        await trigger.trigger("click");
        await settle();

        const more = [...document.querySelectorAll("button")].find((row) =>
            row.textContent?.includes("Read more in the glossary"),
        );
        expect(more).toBeDefined();
        more!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await settle();

        expect(takePendingDocsArticle()).toEqual({ id: "glossary", hash: "#profile" });
        expect(trigger.attributes("aria-expanded")).toBe("false");
    });
});
