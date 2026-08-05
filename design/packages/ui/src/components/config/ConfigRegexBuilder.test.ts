// @vitest-environment jsdom

/**
 * Regression for the popover's dead Escape key.
 *
 * `ConfigRegexBuilder` lives inside a non-persistent `<v-menu>` in `ConfigSearchField.vue`
 * (and, through it, in every settings search bar this project has, including
 * `MenuSearchList.vue`'s command-menu filter). Its only Escape-to-close path is Vuetify's
 * `VOverlay`, which listens for the key on `window` in the bubble phase - `VMenu` itself has
 * no Escape handling of its own. Both the pattern and the sample `<v-textarea>` used to carry
 * a bare `@keydown.stop`, which called `stopPropagation()` on every key including Escape, so
 * a user who pressed Escape while typing a pattern never closed the popover through that
 * path, even though every other overlay in this app documents "closes on Escape and on a
 * click outside." This mirrors the same fix already proven for the marker search field's own
 * builder in `markers/RegexBuilder.test.ts`.
 *
 * These tests mount the component on its own (no real `VOverlay` above it) and instead
 * assert directly on propagation: a listener above the component must still see an Escape
 * keydown that started in either textarea, while an ordinary letter keydown - the kind that
 * would otherwise leak out to whatever hosts the field - must still be stopped exactly as
 * before.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ConfigRegexBuilder from "./ConfigRegexBuilder.vue";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's inputs observe their own size.
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify({ components, directives });

function i18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function render() {
    const container = document.createElement("div");
    document.body.appendChild(container);

    return mount(ConfigRegexBuilder, {
        props: {
            pattern: "",
            flags: "i",
            sample: "renderThreads\nstorage",
        },
        global: { plugins: [vuetify, i18n()] },
        attachTo: container,
    });
}

/**
 * The two real `<textarea>`s the card renders: the pattern field and the sample field.
 * Excludes the pattern field's own hidden `.v-textarea__sizer` mirror, a readonly clone
 * Vuetify's auto-grow keeps in sync purely to measure height and never dispatches a real
 * key event to.
 */
function textareas(wrapper: ReturnType<typeof render>) {
    return wrapper.findAll("textarea:not(.v-textarea__sizer)");
}

describe("the pattern and sample fields' key handling", () => {
    it("lets an Escape keydown bubble past the field, so the enclosing overlay can still see it", async () => {
        const wrapper = render();
        const fields = textareas(wrapper);
        expect(fields.length).toBe(2);

        for (const field of fields) {
            let seenOnDocument = false;
            const onDocumentKeydown = (event: KeyboardEvent) => {
                if (event.key === "Escape") seenOnDocument = true;
            };
            document.addEventListener("keydown", onDocumentKeydown);

            await field.trigger("keydown", { key: "Escape" });

            document.removeEventListener("keydown", onDocumentKeydown);
            expect(seenOnDocument).toBe(true);
        }

        wrapper.unmount();
    });

    it("still stops an ordinary letter keydown, so it does not leak to whatever hosts this field", async () => {
        const wrapper = render();
        const fields = textareas(wrapper);
        expect(fields.length).toBe(2);

        for (const field of fields) {
            let seenOnDocument = false;
            const onDocumentKeydown = (event: KeyboardEvent) => {
                if (event.key === "a") seenOnDocument = true;
            };
            document.addEventListener("keydown", onDocumentKeydown);

            await field.trigger("keydown", { key: "a" });

            document.removeEventListener("keydown", onDocumentKeydown);
            expect(seenOnDocument).toBe(false);
        }

        wrapper.unmount();
    });
});
