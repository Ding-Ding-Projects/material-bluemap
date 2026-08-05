// @vitest-environment jsdom

/**
 * `NoticeSelectCheckbox.vue`: the per-row pick-me box, mounted. What matters here is not
 * covered by `noticeBulk.test.ts`, which never touches a component - that a click reports
 * itself as a plain pick, that a shift-click reports itself as a range pick, that the
 * checked state actually reflects the `checked` prop rather than managing its own, and that
 * the accessible name really does name the row.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import NoticeSelectCheckbox from "./NoticeSelectCheckbox.vue";

beforeAll(() => {
    globalThis.ResizeObserver = class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
    } as unknown as typeof ResizeObserver;
});

const vuetify = createVuetify();

function i18n() {
    return createI18n({
        legacy: false,
        locale: "en",
        fallbackLocale: "en",
        missingWarn: false,
        fallbackWarn: false,
        messages: { en: {} },
    });
}

function mountCheckbox(checked: boolean, summary = "Save failed") {
    return mount(NoticeSelectCheckbox, {
        props: { checked, summary },
        global: { plugins: [vuetify, i18n()] },
    });
}

describe("the checked state", () => {
    it("reflects the checked prop rather than managing its own", () => {
        const unchecked = mountCheckbox(false);
        expect(
            (unchecked.find("input[type='checkbox']").element as HTMLInputElement).checked,
        ).toBe(false);

        const checked = mountCheckbox(true);
        expect((checked.find("input[type='checkbox']").element as HTMLInputElement).checked).toBe(
            true,
        );
    });
});

describe("a plain click", () => {
    it("emits pick with shiftKey false", async () => {
        const view = mountCheckbox(false);
        await view.find("input[type='checkbox']").trigger("click", { shiftKey: false });

        expect(view.emitted("pick")).toEqual([[false]]);
    });

    it("does not flip the native checkbox itself, leaving that to the parent", async () => {
        const view = mountCheckbox(false);
        await view.find("input[type='checkbox']").trigger("click");

        // The click is prevented so the native control never moves on its own; only a new
        // `checked` prop from the parent is allowed to change what is rendered.
        expect((view.find("input[type='checkbox']").element as HTMLInputElement).checked).toBe(
            false,
        );
    });
});

describe("a shift-click", () => {
    it("emits pick with shiftKey true", async () => {
        const view = mountCheckbox(false);
        await view.find("input[type='checkbox']").trigger("click", { shiftKey: true });

        expect(view.emitted("pick")).toEqual([[true]]);
    });
});

describe("the accessible name", () => {
    it("names the row by its summary", () => {
        const view = mountCheckbox(false, "Save failed");
        expect(view.find("input[type='checkbox']").attributes("aria-label")).toBe(
            "Select: Save failed",
        );
    });

    it("updates the name when the summary prop changes", async () => {
        const view = mountCheckbox(false, "one");
        await view.setProps({ summary: "two" });
        expect(view.find("input[type='checkbox']").attributes("aria-label")).toBe("Select: two");
    });
});

describe("keyboard reach", () => {
    it("is a real checkbox, reachable and operable from the keyboard by default", () => {
        const view = mountCheckbox(false);
        const input = view.find("input[type='checkbox']");
        expect(input.attributes("tabindex")).not.toBe("-1");
        expect(input.attributes("disabled")).toBeUndefined();
    });
});
