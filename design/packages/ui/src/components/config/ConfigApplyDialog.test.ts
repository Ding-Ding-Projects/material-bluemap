// @vitest-environment jsdom

/**
 * Regression for a dismissal path that ignored the in-flight guard.
 *
 * `ConfigApplyDialog`'s Cancel button was disabled while a save was writing, but that
 * disabled state only ever guarded the one button. `v-dialog` closes itself on Escape and
 * on a click outside of the card by default, and neither of those default dismissal paths
 * looks at whether a button on the card happens to be disabled - so a person could still
 * dismiss the dialog mid-save through either one, walking straight past the guard the
 * disabled Cancel button was supposed to be. For a save that deletes files, `confirmSave`
 * has already started an irreversible `host.deleteFiles` by the time the progress bar is
 * showing, so a dialog that still looks dismissable there is a guard that does not guard
 * anything.
 *
 * The fix binds Vuetify's own `persistent` prop to the same `saving` flag the Cancel
 * button already reads, which is what actually blocks Escape and an outside click. These
 * tests assert on that binding directly rather than simulating a real Escape keypress or
 * an outside click, because `persistent` is the mechanism `v-dialog`'s own Escape and
 * outside-click listeners consult before closing - proving the prop reaches `v-dialog`
 * with the right value in each state is what proves the guard is wired, without
 * re-testing Vuetify's own overlay dismissal internals.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import * as components from "vuetify/components";
import * as directives from "vuetify/directives";
import ConfigApplyDialog from "./ConfigApplyDialog.vue";
import type { WorkspacePlan } from "./configWorkspace.js";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size and media observers are absent and
    // an open v-dialog throws before any assertion runs. Same shims as
    // `configMessages.test.ts` and `AppSettings.test.ts`.
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

    // jsdom has no Visual Viewport API at all, and Vuetify's overlay location strategy
    // reads it the moment the dialog's transition runs.
    (globalThis as unknown as { visualViewport: VisualViewport }).visualViewport = {
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
    } as unknown as VisualViewport;
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

const emptyPlan: WorkspacePlan = {
    writes: [],
    deletes: [],
    created: [],
    entryChanges: [],
    tileInvalidating: [],
    affectedMapIds: [],
    empty: true,
};

function render(saving: boolean) {
    return mount(ConfigApplyDialog, {
        props: {
            modelValue: true,
            plan: emptyPlan,
            issues: [],
            folder: "/srv/bluemap/config",
            saving,
        },
        global: { plugins: [vuetify, i18n()] },
    });
}

function dialogPersistentProp(wrapper: ReturnType<typeof render>): unknown {
    return wrapper.findComponent(components.VDialog).props("persistent");
}

describe("the save dialog's dismissal guard", () => {
    it("is not persistent before a save has started, so Escape and an outside click work as usual", () => {
        const wrapper = render(false);
        expect(dialogPersistentProp(wrapper)).toBe(false);
        wrapper.unmount();
    });

    it("turns persistent while a save is writing, blocking Escape and an outside click the same way the disabled Cancel button blocks a click on it", () => {
        const wrapper = render(true);
        expect(dialogPersistentProp(wrapper)).toBe(true);
        wrapper.unmount();
    });

    it("drops the guard again once saving finishes", async () => {
        const wrapper = render(true);
        expect(dialogPersistentProp(wrapper)).toBe(true);

        await wrapper.setProps({ saving: false });

        expect(dialogPersistentProp(wrapper)).toBe(false);
        wrapper.unmount();
    });
});
