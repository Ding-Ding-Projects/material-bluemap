// @vitest-environment jsdom

/**
 * Escape must reach the enclosing menu, not die at this field.
 *
 * `MarkerSearchField` sits inside `MarkerMenu`, which is slotted into `MainMenu`'s wrapping
 * `MenuSideSheet` - a `v-navigation-drawer` whose root carries `@keydown.esc="emit('back')"`
 * relying on native DOM bubbling. Before this fix, `@keydown.stop` on the text field was
 * unconditional, so every keydown - Escape included - was stopped here and never reached
 * that ancestor handler. Escape while focused in the marker search field therefore did
 * nothing: it neither cleared the query nor closed the side sheet.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import MarkerSearchField from "./MarkerSearchField.vue";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's overlays observe their own size.
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
        missingWarn: false,
        fallbackWarn: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
}

function render(modelValue = "") {
    return mount(MarkerSearchField, {
        props: {
            modelValue,
            mode: "text",
            flags: "i",
            error: null,
            sampleSeed: "",
        },
        global: { plugins: [vuetify, i18n()] },
        // Mount inside a listening ancestor so the assertion exercises real DOM bubbling,
        // the same mechanism `MenuSideSheet`'s own `@keydown.esc` relies on - a handler
        // stub attached directly to the wrapper's root would not catch a `stopPropagation()`
        // that happens one element further down, inside `v-text-field`'s own input.
        attachTo: document.body,
    });
}

describe("the marker search field's keydown handling", () => {
    it("lets Escape bubble out to an enclosing listener when the query is already empty", async () => {
        const wrapper = render("");
        let escapeSeenByAncestor = false;
        wrapper.element.parentElement?.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Escape") escapeSeenByAncestor = true;
        });

        const input = wrapper.find("input");
        await input.trigger("keydown", { key: "Escape" });

        expect(escapeSeenByAncestor).toBe(true);

        wrapper.unmount();
    });

    /**
     * The two-step convention `MenuSearchList.vue` established: a non-empty query eats the
     * first Escape and clears itself rather than letting the keystroke close the whole
     * side sheet out from under someone who only meant to see the rest of the marker list
     * again.
     */
    it("clears a non-empty query on the first Escape instead of letting it bubble", async () => {
        const wrapper = render("village");
        let escapeSeenByAncestor = false;
        wrapper.element.parentElement?.addEventListener("keydown", (event: KeyboardEvent) => {
            if (event.key === "Escape") escapeSeenByAncestor = true;
        });

        const input = wrapper.find("input");
        await input.trigger("keydown", { key: "Escape" });

        expect(escapeSeenByAncestor).toBe(false);
        expect(wrapper.emitted("update:modelValue")).toEqual([[""]]);

        wrapper.unmount();
    });

    it("still stops a camera-control key so typing does not drive the viewer", async () => {
        const wrapper = render();
        let sawKeyOnAncestor = false;
        wrapper.element.parentElement?.addEventListener("keydown", () => {
            sawKeyOnAncestor = true;
        });

        const input = wrapper.find("input");
        await input.trigger("keydown", { key: "w" });

        expect(sawKeyOnAncestor).toBe(false);

        wrapper.unmount();
    });
});
