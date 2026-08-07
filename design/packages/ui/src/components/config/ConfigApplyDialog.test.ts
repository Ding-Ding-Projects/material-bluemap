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

/**
 * Regression: `<v-list-item :title="path">` bound Vuetify's own `title` *prop* (the text
 * it renders), never an HTML `title` attribute -- `VListItem.js` only ever calls
 * `toDisplayString(props.title)` -- and `.v-list-item-title` defaults to `overflow:
 * hidden; text-overflow: ellipsis; white-space: nowrap`. This is the one dialog in the
 * whole application whose entire job is letting somebody verify exactly which files are
 * about to be overwritten or permanently deleted before that happens; silently ellipsing
 * a long path with no way to recover the rest of it is the single place that must never
 * happen here. The fix moved each path into the `#title` slot with a plain `<span
 * :title="...">`, where the same binding is a genuine DOM attribute.
 */
describe("a long config file path, in the files list", () => {
    const longPath =
        "C:\\Users\\Someone With A Long Name\\Documents\\Worldlens Projects\\survival-server-backups-2026\\config\\maps\\overworld.conf";

    function renderWithPlan(plan: WorkspacePlan) {
        return mount(ConfigApplyDialog, {
            props: { modelValue: true, plan, issues: [], folder: "/srv/bluemap/config", saving: false },
            global: { plugins: [vuetify, i18n()] },
            // `v-dialog` teleports its card straight to `document.body` (Vuetify's own
            // `v-overlay` plumbing), outside whatever element `mount()` would otherwise
            // track -- so this suite reads the live document directly, the same way
            // `tabGroupPickerMount.test.ts` reads a teleported `.mb-config-regex` popover.
            attachTo: document.body,
        });
    }

    /**
     * `getAttribute` rather than a CSS attribute selector: the path itself is the value
     * under test, backslashes and all, and a raw Windows path spliced into a CSS selector
     * string is exactly the kind of value CSS escaping rules were not designed for.
     */
    function titledSpans(): HTMLElement[] {
        return [...document.querySelectorAll<HTMLElement>(".mb-config-apply__list .v-list-item-title span[title]")];
    }

    it("carries a written file's full path as a native title, even once the row truncates it", () => {
        const plan: WorkspacePlan = {
            ...emptyPlan,
            empty: false,
            writes: [{ path: longPath, text: "" }],
        };
        const wrapper = renderWithPlan(plan);
        const spans = titledSpans();
        expect(spans.some((span) => span.getAttribute("title") === longPath)).toBe(true);
        expect(spans.some((span) => span.textContent === longPath)).toBe(true);
        wrapper.unmount();
    });

    it("carries a deleted file's full path as a native title, even once the row truncates it", () => {
        const plan: WorkspacePlan = { ...emptyPlan, empty: false, deletes: [longPath] };
        const wrapper = renderWithPlan(plan);
        const spans = titledSpans();
        expect(spans.some((span) => span.getAttribute("title") === longPath)).toBe(true);
        expect(spans.some((span) => span.textContent === longPath)).toBe(true);
        wrapper.unmount();
    });
});

describe("the config folder path, above the file list", () => {
    /**
     * Regression: `.mb-config-apply__folder` had no `overflow-wrap`, and an absolute
     * Windows path (backslash-separated, no spaces in a project folder someone named
     * without them) gives the browser no natural break point inside this dialog's fixed
     * `max-width: 620`. `test.css` is not enabled for this suite's `vitest.config.ts`, so
     * a `?raw` import reads the exact rule the fix landed in, the same way the
     * tab-group-picker and marker-set suites already do for their own CSS fixes.
     */
    it("sets overflow-wrap: anywhere so a long path wraps instead of overflowing the dialog", async () => {
        const source = (await import("./ConfigApplyDialog.vue?raw")).default as string;
        const match = /\.mb-config-apply__folder\s*\{[^}]*\}/.exec(source);
        expect(match).not.toBeNull();
        expect(match?.[0] ?? "").toMatch(/overflow-wrap:\s*anywhere/);
    });
});

describe("the dialog's own title, in its <v-card-title>", () => {
    /**
     * Regression: `<v-card-title>` defaults to `overflow: hidden; text-overflow: ellipsis;
     * white-space: nowrap` for a single-line block title (Vuetify's own `VCard.css`, the
     * same default the file comment above `.mb-config-apply__title` and the suite above
     * already document for `.v-list-item-title`). `.mb-config-apply__title` turns it into a
     * flex row so the icon sits beside the title, but `display: flex` alone does not clear
     * any of the three inherited properties: `overflow: hidden` still clips, and the
     * inherited `nowrap` means the title can never wrap. The bilingual title of this
     * specific dialog - the one dialog whose entire job is letting somebody verify what is
     * about to be overwritten or deleted - was silently cut off with no ellipsis and no
     * indication anything was missing.
     */
    it("clears the inherited overflow, text-overflow and white-space so the title can wrap", async () => {
        const source = (await import("./ConfigApplyDialog.vue?raw")).default as string;
        const match = /\.mb-config-apply__title\s*\{[^}]*\}/.exec(source);
        expect(match).not.toBeNull();
        const rule = match?.[0] ?? "";
        expect(rule).toMatch(/overflow:\s*visible/);
        expect(rule).toMatch(/text-overflow:\s*clip/);
        expect(rule).toMatch(/white-space:\s*normal/);
    });
});
