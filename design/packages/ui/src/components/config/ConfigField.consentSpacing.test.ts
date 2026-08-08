// @vitest-environment jsdom

/**
 * The consent row's missing space, which a real screenshot of the running application is
 * what actually caught.
 *
 * `docs/screenshots/config-screen.png` shows the row reading
 * "Accept the Minecraft client download:not accepted yet, so a render stops before it
 * even starts." - the label, a colon, and then the sentence jammed straight against it.
 * Nothing was misspelled and no string was wrong: the template put `</strong>` on one
 * line and the `<template v-if>` carrying the sentence on the next, and Vue's default
 * whitespace handling (`condense`) deletes a whitespace-only text node that contains a
 * newline. The space between them was that node.
 *
 * It is worth a test of its own because it is invisible to every kind of check this
 * package already runs. The copy catalogue is right, both keys resolve, the funny-level
 * facts survive, the component mounts, and the two `t()` calls are made exactly as
 * intended - the defect lives entirely in the whitespace between two elements, in every
 * language and at every funny level at once. Only rendered text shows it.
 *
 * So this asserts on the rendered text rather than on the source: mount the row in both
 * consent states and require the label and the sentence to be separated. Writing it
 * against `textContent` is deliberate - it is the one representation that would still
 * catch this if the fix were later refactored from a computed back into a template
 * branch, or into a slot, or anywhere else.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import { descriptorFor, type FieldMeta } from "@worldlens/config";
import ConfigField from "./ConfigField.vue";
import { openConfigFile } from "./configModel.js";
import type { AnyDescriptor } from "./configModel.js";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size and media observers are absent.
    // Same shims as `ConfigApplyDialog.test.ts` and `AppSettings.test.ts` next door.
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
});

const vuetify = createVuetify({ components, directives });

const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

/**
 * The real schema's own consent-gated field and a real parsed file, rather than a cast
 * stand-in: `accept-download` is the one field in the product that renders this row, and
 * building the file through `openConfigFile` is what gives the row the parsed document
 * its `explicit`/`value` computeds actually read. A hand-shaped object would prove the
 * spacing of a row nothing in the application renders.
 */
const coreDescriptor = descriptorFor("core") as AnyDescriptor;

const CONSENT_FIELD: FieldMeta = (() => {
    const field = coreDescriptor.fields.find((candidate) => candidate.path === "accept-download");
    if (field === undefined) throw new Error("the core schema no longer has accept-download");
    return field;
})();

/** A file whose one value is the consent answer, which is what `accepted` reads. */
function fileWith(accepted: boolean) {
    return openConfigFile(coreDescriptor, "core.conf", `accept-download: ${accepted}\n`);
}

function renderedText(accepted: boolean): string {
    const wrapper = mount(ConfigField, {
        props: { field: CONSENT_FIELD, file: fileWith(accepted) },
        global: { plugins: [vuetify, i18n] },
    });
    const text = wrapper.get(".mb-config-field__consent-state").text();
    wrapper.unmount();
    return text;
}

describe("the consent row's label and sentence", () => {
    it("are separated by a space when consent has not been given", () => {
        const text = renderedText(false);
        expect(text).toContain("Accept the Minecraft client download:");
        expect(text).not.toContain("download:not");
        expect(text).toMatch(/download:\s+not accepted yet/);
    });

    it("are separated by a space when consent has been given", () => {
        const text = renderedText(true);
        expect(text).not.toContain("download:accepted");
        expect(text).toMatch(/download:\s+accepted, so rendering/);
    });

    it("never runs the colon straight into a word, in either state", () => {
        // The general form of the defect, so a future edit that reintroduces it through
        // some other mechanism - a slot, a second branch, a different element - fails
        // here rather than in somebody's screenshot six weeks later.
        for (const accepted of [true, false]) {
            expect(renderedText(accepted)).not.toMatch(/:\S/);
        }
    });
});
