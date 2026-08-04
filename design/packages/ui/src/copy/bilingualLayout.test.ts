// @vitest-environment jsdom

/**
 * Bilingual mode at a narrow width, proved as far as this environment honestly can.
 *
 * State the limit first, because a test that overclaims is worse than one that is missing:
 * **jsdom has no layout engine.** `getBoundingClientRect` returns zeroes, `<style>` blocks
 * are parsed and never cascaded, and no element in it has ever overlapped another. A test
 * here that asserted "nothing is clipped at 360 pixels" would be asserting nothing at all,
 * and would go green on a build where every second language had been cropped away.
 *
 * What can be proved, and is proved below, is the set of structural properties that decide
 * the layout outcome. Clipping in bilingual mode has exactly two causes, and neither is
 * subtle once it is named:
 *
 *  1. the second language is placed *beside* the first, so a pair that fitted in one
 *     language pushes past the edge in two; or
 *  2. the second language is placed below the first inside a container built for one line,
 *     which crops it invisibly.
 *
 * So: the rendered markup is checked to stack rather than to sit side by side, every
 * container the copy layer's stylesheet touches is checked to both honour the line break
 * and have its single-line clip relaxed, and the panel's own two-column grid is checked to
 * be declared with a collapse rule rather than a fixed pair of columns. Where a real
 * measurement is wanted, it is a screenshot of the packaged application at 360 CSS pixels,
 * and that belongs to the capture harness rather than to this file.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import { h } from "vue";

import SetupText from "../components/setup/SetupText.vue";
import LanguageSettingsRow from "../components/setup/LanguageSettingsRow.vue";
import {
    reloadSetupLanguage,
    setFunnyLevel,
    setLanguageMode,
} from "../components/setup/setupI18n.js";
import { memoryStorage, setSetupStorage } from "../components/setup/setupPrefs.js";

const read = (relative: string): string =>
    readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

beforeAll(() => {
    // Vuetify's fields and overlays observe their own size, and jsdom has neither.
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
    })) as unknown as typeof matchMedia;
});

beforeEach(() => {
    setSetupStorage(memoryStorage());
    reloadSetupLanguage();
});

function mountInApp(component: unknown) {
    return mount(VApp, {
        global: {
            plugins: [
                createVuetify(),
                createI18n({ legacy: false, locale: "en", missingWarn: false, messages: {} }),
            ],
        },
        slots: { default: () => h(component as never) },
        attachTo: document.body,
    });
}

/* -------------------------------------------------------------------------- */
/* The rendered markup stacks                                                 */
/* -------------------------------------------------------------------------- */

describe("a bilingual string in the surfaces that own their own markup", () => {
    it("puts the Cantonese in its own block-level element beneath the English", () => {
        setLanguageMode("bilingual");
        const wrapper = mount(SetupText, { props: { textKey: "action.next" } });

        const spans = wrapper.findAll("span");
        expect(spans).toHaveLength(2);
        expect(spans[0]?.attributes("lang")).toBe("en");
        expect(spans[1]?.attributes("lang")).toBe("zh-HK");
        expect(spans[1]?.classes()).toContain("mb-setup-text__secondary");

        // The class is what makes the pair grow downwards rather than sideways, so its one
        // load-bearing declaration is pinned here rather than left to be deleted by accident.
        const style = read("../components/setup/SetupText.vue");
        expect(style).toMatch(/\.mb-setup-text__secondary\s*\{[^}]*display:\s*block/);
    });

    it("shows one language only, with no empty second element, in either single mode", () => {
        for (const mode of ["en", "yue"] as const) {
            setLanguageMode(mode);
            const wrapper = mount(SetupText, { props: { textKey: "action.next" } });
            expect(wrapper.findAll("span"), mode).toHaveLength(1);
        }
    });
});

/* -------------------------------------------------------------------------- */
/* The stylesheet the flat strings depend on                                  */
/* -------------------------------------------------------------------------- */

describe("bilingual.css", () => {
    const css = read("./bilingual.css");

    /**
     * Every selector in the file, with its declaration block.
     *
     * Comments are stripped first, or they attach themselves to the selector that follows
     * and every comparison against a selector string is really a comparison against a
     * paragraph of prose. The `@media` wrapper is unwrapped rather than skipped, so the
     * rules inside it are held to the same gating rule as the rules outside it: a media
     * query is a narrower condition, not an exemption.
     */
    const rules = [
        ...css
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/@media[^{]*\{/g, "")
            .matchAll(/([^{}]+)\{([^}]*)\}/g),
    ].map((match) => ({
        selector: (match[1] ?? "").trim(),
        body: match[2] ?? "",
    }));

    it("parses as a stylesheet with rules in it, so the checks below mean something", () => {
        expect(rules.length).toBeGreaterThan(3);
    });

    it("gates every rule on the bilingual mode, so no other mode can be affected", () => {
        const ungated = rules
            .filter((rule) => !rule.selector.includes('[data-language-mode="bilingual"]'))
            .map((rule) => rule.selector);
        expect(ungated).toEqual([]);
    });

    it("changes no colour, size, font or spacing that is not about fitting a second line", () => {
        const forbidden = /(^|[\s;])(color|background|font-family|font-size|font-weight)\s*:/;
        const offenders = rules.filter((rule) => forbidden.test(rule.body)).map((r) => r.selector);
        expect(offenders).toEqual([]);
    });

    it("honours the line break in every container it names", () => {
        expect(css).toContain("white-space: pre-line");
    });

    /**
     * The containers Vuetify truncates or fixes to one line. Naming a container in the
     * "honour the break" list and leaving its clip in place is the failure this catches:
     * the second language would be present in the DOM, invisible on screen, and nothing
     * would say so.
     */
    it.each([
        [".v-list-item-title", /overflow:\s*visible/],
        [".v-toolbar-title__placeholder", /overflow:\s*visible/],
        [".v-btn", /height:\s*auto/],
        [".v-chip", /height:\s*auto/],
        [".v-tab", /height:\s*auto/],
        [".v-list-item", /height:\s*auto/],
    ])("relaxes the single-line clip on %s", (selector, relaxation) => {
        const owning = rules.filter((rule) =>
            rule.selector
                .split(",")
                .some((part) => part.trim().endsWith(selector) && relaxation.test(rule.body)),
        );
        expect(owning.length, `${selector} honours the break but is still clipped`).toBeGreaterThan(
            0,
        );
    });

    it("wraps rows of controls below 480 pixels, where two languages stop fitting side by side", () => {
        expect(css).toMatch(/@media\s*\(max-width:\s*480px\)/);
        expect(css).toContain("flex-wrap: wrap");
    });
});

/* -------------------------------------------------------------------------- */
/* The language panel itself                                                  */
/* -------------------------------------------------------------------------- */

describe("the language panel at a narrow width", () => {
    it("declares its two sliders as a grid that collapses rather than as two fixed columns", () => {
        const source = read("../components/setup/SetupLanguagePanel.vue");
        // `auto-fit` with a `minmax` floor is the declaration that turns two columns into
        // one when the container is narrower than twice the floor. A hard `1fr 1fr` would
        // keep two columns at any width and squeeze the second slider off the card.
        expect(source).toMatch(/grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(/);
        expect(source).not.toMatch(/grid-template-columns:\s*1fr\s+1fr/);
        expect(source).toMatch(/\.mb-setup-language__modes[^}]*flex-wrap:\s*wrap/s);
    });

    it("renders both languages, with no unresolved placeholder, in bilingual mode", () => {
        setLanguageMode("bilingual");
        setFunnyLevel("en", 5);
        setFunnyLevel("yue", 5);

        const wrapper = mountInApp(LanguageSettingsRow);
        const text = wrapper.text();

        expect(text).toContain("Funny level, English");
        expect(text).toContain("搞笑程度（廣東話）");
        expect(text).not.toMatch(/\{[A-Za-z_$][\w$]*\}/);
        wrapper.unmount();
    });

    it("keeps the disclosure about errors and warnings on screen at the funniest level", () => {
        setLanguageMode("bilingual");
        setFunnyLevel("en", 5);
        setFunnyLevel("yue", 5);

        const wrapper = mountInApp(LanguageSettingsRow);
        const text = wrapper.text();

        expect(text).toContain("errors and warnings");
        expect(text).toContain("錯誤同警告");
        wrapper.unmount();
    });

    it("offers a way back to the defaults from the settings surface", () => {
        setLanguageMode("yue");
        const wrapper = mountInApp(LanguageSettingsRow);
        expect(wrapper.text()).toContain("還原語言同語氣");
        wrapper.unmount();
    });
});
