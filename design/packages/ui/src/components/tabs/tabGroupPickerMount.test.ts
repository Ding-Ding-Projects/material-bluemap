// @vitest-environment jsdom

/**
 * `TabGroupPicker.vue`, mounted: what `tabGroupPicker.test.ts` cannot prove about a plain
 * function, which is that the rendered dialog actually offers a search field wired to the
 * app's own regex matcher, actually renders "New group..." as a real option, actually emits
 * the real events a host can forward straight to `assignTabToGroup`/`createGroup`, and
 * actually moves through the list on the keyboard exactly as its own doc comment claims.
 *
 * Named `tabGroupPickerMount` rather than `TabGroupPicker.test.ts` because this filesystem
 * is case-insensitive and that name collides with `tabGroupPicker.test.ts` next door, which
 * covers the picker's pure model.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import TabGroupPicker from "./TabGroupPicker.vue";
import type { TabStripState } from "./tabModel.js";

beforeAll(() => {
    // jsdom has no layout engine, so Vuetify's own size and media observers are absent and
    // the mount throws before any assertion runs.
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

    // Vuetify's overlay placement reads `visualViewport` unguarded and jsdom has none --
    // see `WizardReviewStep.test.ts`'s own stub for the same reason. Without it the
    // reference error surfaces on `v-menu`'s teardown rather than its opening, which is why
    // this only bit the three tests below that actually leave the popover open at unmount.
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

    // Vuetify's own `v-menu` decides whether a Tab press landed on its content's *last*
    // focusable control (`focusableChildren()`/`getNextElement()` in Vuetify's own
    // `util/helpers.ts`) by checking `getClientRects()` and `offsetParent` to tell a genuinely
    // rendered element from one that only exists in the tree. jsdom has no layout engine, so
    // both are always empty/null for every element, with no exception for a real one mid-list
    // -- every position looks like "the last one" to that check, and `v-menu` closed itself
    // and returned focus to its activator on the very first Tab press instead of only at an
    // actual boundary, which is what made this suite unable to tell a genuine boundary from a
    // press in the middle of the popover's control list. Both are stubbed together because
    // `v-menu`'s own check is an `||`: either one reporting "rendered" is enough, but
    // `getNextElement`'s inner loop separately requires `offsetParent` specifically, so
    // stubbing only `getClientRects` still leaves every candidate skipped there. `offsetParent`
    // is answered as the element's real parent rather than unconditionally `document.body`:
    // the flat, unconditional answer sent something elsewhere in Vuetify's own visibility
    // logic into a loop that never returned.
    Element.prototype.getClientRects = function (): DOMRectList {
        const rect = { x: 0, y: 0, width: 1, height: 1, top: 0, right: 1, bottom: 1, left: 0, toJSON: () => ({}) };
        return Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) }) as unknown as DOMRectList;
    };
    Object.defineProperty(HTMLElement.prototype, "offsetParent", {
        configurable: true,
        get(this: HTMLElement) {
            return this.parentElement;
        },
    });
});

const vuetify = createVuetify();

/**
 * Vuetify's own `v-menu` teleports its content straight to `document.body` and, per
 * `TabGroupPicker.vue`'s own doc comment on `openBuilderElements`, leaves it there
 * `v-show`-hidden between opens of the *same* instance rather than removing it -- but this
 * suite mounts a fresh `TabGroupPicker` (and therefore a fresh regex-builder `v-menu`) in
 * nearly every `it()`, and `document.querySelector(".mb-config-regex")` -- both this file's
 * own `openBuilder` and the component's matching lookup -- takes whichever one is *first* in
 * document order, not whichever belongs to the wrapper this test just mounted. A stray node
 * left behind by an earlier test's `v-menu` therefore shadows the current test's own builder
 * the moment it sorts earlier in the DOM, which is silent right up until a later assertion
 * reads the wrong element's content. Sweeping up after every test is what keeps each one
 * starting from the single builder it opened itself.
 *
 * The same is true of a live listener, not only a live node. `TabGroupPicker.vue` registers
 * its own document-level `keydown` trap in `onMounted` and removes it in `onUnmounted` (see
 * that file's own comment on `onDocumentKeydown`), and `mountPicker` below never called
 * `wrapper.unmount()` at all -- every one of the ~14 tests that used it left its own trap
 * attached to this shared jsdom `document` for the rest of the file's run. That was the
 * actual cause of a residual bug once documented here as unexplained: a Tab keydown fired
 * later in "Tab, with the teleported regex builder open" bubbled to `document` and ran
 * through every still-attached leaked trap in registration order, each one moving focus one
 * further step than the last, landing several controls past where the single, correct trap
 * would have placed it -- reproducing exactly the "passes alone, fails in the full 19-test
 * file" symptom, since an isolated run never accumulates more than the one trap it mounted.
 * `trackedMount` and the sweep below are what stop that for `mountPicker`, the helper every
 * one of those ~14 tests used. `mountAttached` below already unmounts in its own `finally`
 * in every test that calls it, so it is left doing exactly that rather than also routed
 * through this tracker - the two mechanisms would otherwise both try to unmount the same
 * wrapper, and the point of this sweep is to catch what nothing else cleans up, not to
 * duplicate cleanup that already happens.
 */
const mounted: VueWrapper[] = [];

/** Mounts and remembers the wrapper, so `afterEach` can unmount it even if the test never does. */
function trackedMount(...args: Parameters<typeof mount>): VueWrapper {
    const wrapper = mount(...args) as VueWrapper;
    mounted.push(wrapper);
    return wrapper;
}

afterEach(() => {
    document.querySelectorAll(".mb-config-regex").forEach((element) => element.remove());
    while (mounted.length > 0) mounted.pop()?.unmount();
});

function emptyI18n() {
    return createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        missingWarn: false,
        fallbackWarn: false,
        messages: {},
    });
}

const STRIP: TabStripState = {
    id: "s1",
    label: "Main",
    windowId: "w1",
    windowLabel: "Material BlueMap",
    tabs: [],
    pinnedOrder: [],
    slots: [],
    activeTabId: null,
    groups: [
        { id: "g1", name: "Research", color: "primary", collapsed: false, tabIds: ["a", "b"], appearance: null },
        { id: "g2", name: "Reference", color: "secondary", collapsed: false, tabIds: ["c"], appearance: null },
    ],
};

function mountPicker(
    strip: TabStripState = STRIP,
    excludeGroupId: string | null = null,
): VueWrapper {
    const host = defineComponent({
        setup: () =>
            () =>
                h(VApp, () => [h(TabGroupPicker, { strip, excludeGroupId, tabLabel: "Settings" })]),
    });
    return trackedMount(host, { global: { plugins: [vuetify, emptyI18n()] } });
}

function picker(wrapper: VueWrapper) {
    return wrapper.findComponent(TabGroupPicker);
}

function searchInput(wrapper: VueWrapper) {
    return wrapper.find('input[type="text"]');
}

describe("the group list", () => {
    it("renders every group as a row, and New group... after them", () => {
        const wrapper = mountPicker();
        const options = wrapper.findAll('[role="option"]');
        expect(options).toHaveLength(3);
        expect(options[0]?.text()).toContain("Research");
        expect(options[1]?.text()).toContain("Reference");
        expect(options[2]?.text()).toContain("New group...");
    });

    it("excludes the tab's own current group", () => {
        const wrapper = mountPicker(STRIP, "g2");
        const options = wrapper.findAll('[role="option"]');
        expect(options).toHaveLength(2);
        expect(options[0]?.text()).toContain("Research");
        expect(options[0]?.text()).not.toContain("Reference");
    });

    it("shows the honest empty state, and still offers New group..., when the strip has no groups", () => {
        const wrapper = mountPicker({ ...STRIP, groups: [] });
        expect(wrapper.text()).toContain("There are no groups yet");
        const options = wrapper.findAll('[role="option"]');
        expect(options).toHaveLength(1);
        expect(options[0]?.text()).toContain("New group...");
    });

    /**
     * Regression: `.mb-tab-group-picker__swatch` sets `max-width: 220px` with
     * `overflow: hidden; text-overflow: ellipsis` (`TabGroupPicker.vue`'s own `<style>`),
     * so a group name longer than that fits truncates visually. The row's own
     * `aria-label` (`rowName`) still carries the full name for a screen reader, but a
     * sighted user had no way at all to recover the part the ellipsis ate -- no native
     * tooltip, nothing. Group names are free text with no length limit anywhere in
     * `TabGroupMenu.vue`'s create/rename dialog, so this is not a hypothetical: a user
     * naming a group in bilingual mode (English plus Cantonese together, exactly how this
     * project's own bilingual mode renders) blows straight past 220px in a single word.
     */
    it("carries the full group name as a native title, even once the chip truncates it", () => {
        const longName = "Survival server backups · 生存伍器備份檔案归檔";
        const wrapper = mountPicker({
            ...STRIP,
            groups: [{ id: "g1", name: longName, color: "primary", collapsed: false, tabIds: ["a"], appearance: null }],
        });
        const chip = wrapper.find(".mb-tab-group-picker__swatch");
        expect(chip.exists()).toBe(true);
        expect(chip.attributes("title")).toBe(longName);
    });
});

describe("searching the picker", () => {
    it("narrows to groups whose name matches, in plain text", async () => {
        const wrapper = mountPicker();
        await searchInput(wrapper).setValue("Res");
        const options = wrapper.findAll('[role="option"]');
        // Research, then New group... -- Reference is filtered out, New group... never is.
        expect(options).toHaveLength(2);
        expect(options[0]?.text()).toContain("Research");
        expect(options[1]?.text()).toContain("New group...");
    });

    it("shows the no-match empty state when a plain search finds no group", async () => {
        const wrapper = mountPicker();
        await searchInput(wrapper).setValue("zzz");
        expect(wrapper.text()).toContain("No group's name matches that search");
        const options = wrapper.findAll('[role="option"]');
        expect(options).toHaveLength(1);
        expect(options[0]?.text()).toContain("New group...");
    });

    it("narrows by a regular expression once regex mode is on", async () => {
        const wrapper = mountPicker();
        const toggle = wrapper.find('[aria-label*="regular expression"]');
        expect(toggle.exists()).toBe(true);
        await toggle.trigger("click");
        await searchInput(wrapper).setValue("^Ref");
        const options = wrapper.findAll('[role="option"]');
        expect(options).toHaveLength(2);
        expect(options[0]?.text()).toContain("Reference");
        expect(options[1]?.text()).toContain("New group...");
    });

    /**
     * Regression for a confirmed leak: `TabStrip.vue` mounts exactly one `TabGroupPicker`
     * behind a `v-menu` and keeps that same instance alive across a close --
     * `closeTabGroupPicker` only flips the menu's own `v-model` shut, never the `v-if` that
     * would actually destroy and recreate the component -- so a query typed while moving one
     * tab used to still be sitting in `query` the next time any tab's picker opened, filtering
     * a list the reader has no way to know is filtered. `focus()` is the one call the host
     * already makes on every open (`openTabGroupPicker`'s own `tabGroupPickerRef.value?.focus()`),
     * so it is also where a leftover search, regex mode and flags all get put away -- exercised
     * here directly against the exposed method, the same one `TabStrip.vue` calls, rather than
     * against a full close/reopen round trip through that host component.
     */
    it("puts a typed search away when the host calls focus() again, as it does on every open", async () => {
        const wrapper = mountPicker();
        const toggle = wrapper.find('[aria-label*="regular expression"]');
        await toggle.trigger("click");
        await searchInput(wrapper).setValue("zzz-no-match");
        expect(wrapper.text()).toContain("No group's name matches that search");

        const vm = picker(wrapper).vm as unknown as { focus: () => void };
        vm.focus();
        await nextTick();
        await nextTick();

        expect((searchInput(wrapper).element as HTMLInputElement).value).toBe("");
        expect(toggle.attributes("aria-pressed")).toBe("false");
        const options = wrapper.findAll('[role="option"]');
        expect(options).toHaveLength(3);
        expect(options[0]?.text()).toContain("Research");
        expect(options[1]?.text()).toContain("Reference");
    });
});

describe("choosing an entry", () => {
    it("emits assign with the chosen group's id on click", async () => {
        const wrapper = mountPicker();
        const options = wrapper.findAll('[role="option"]');
        await options[1]?.trigger("click"); // Reference
        expect(picker(wrapper).emitted("assign")).toEqual([["g2"]]);
    });

    it("emits new-group on the New group... row, without an assign alongside it", async () => {
        const wrapper = mountPicker();
        const options = wrapper.findAll('[role="option"]');
        await options[2]?.trigger("click"); // New group...
        expect(picker(wrapper).emitted("new-group")).toHaveLength(1);
        expect(picker(wrapper).emitted("assign")).toBeUndefined();
    });

    it("emits cancel from the Cancel button", async () => {
        const wrapper = mountPicker();
        const buttons = wrapper.findAll("button").filter((btn) => btn.text().includes("Cancel"));
        expect(buttons).toHaveLength(1);
        await buttons[0]?.trigger("click");
        expect(picker(wrapper).emitted("cancel")).toHaveLength(1);
    });
});

describe("the keyboard", () => {
    it("moves the active option down and up with the arrow keys, wrapping at both ends", async () => {
        const wrapper = mountPicker();
        const root = wrapper.find('[role="dialog"]');
        const options = () => wrapper.findAll('[role="option"]');

        await root.trigger("keydown", { key: "ArrowDown" });
        expect(options()[0]?.attributes("aria-selected")).toBe("true");

        await root.trigger("keydown", { key: "ArrowUp" });
        // Wrapped past the first entry, landing on New group... at the end.
        expect(options()[2]?.attributes("aria-selected")).toBe("true");
    });

    it("commits the active entry on Enter", async () => {
        const wrapper = mountPicker();
        const root = wrapper.find('[role="dialog"]');
        await root.trigger("keydown", { key: "ArrowDown" }); // Research
        await root.trigger("keydown", { key: "Enter" });
        expect(picker(wrapper).emitted("assign")).toEqual([["g1"]]);
    });

    it("does nothing on Enter before anything is active", async () => {
        const wrapper = mountPicker();
        const root = wrapper.find('[role="dialog"]');
        await root.trigger("keydown", { key: "Enter" });
        expect(picker(wrapper).emitted("assign")).toBeUndefined();
        expect(picker(wrapper).emitted("new-group")).toBeUndefined();
    });

    it("cancels on Escape", async () => {
        const wrapper = mountPicker();
        const root = wrapper.find('[role="dialog"]');
        await root.trigger("keydown", { key: "Escape" });
        expect(picker(wrapper).emitted("cancel")).toHaveLength(1);
    });
});

describe("the dialog's own surface", () => {
    /**
     * This suite's `vitest.config.ts` does not enable `test.css`, so a mounted component's
     * `<style>` block is never actually injected into `document.head` under jsdom here --
     * `getComputedStyle` and `document.styleSheets` both come back empty regardless of what
     * `TabGroupPicker.vue` declares, which would make either approach pass or fail for
     * reasons unrelated to this component's own stylesheet. A `?raw` import sidesteps CSS
     * processing entirely (it is Vite's plain-text asset loader, unaffected by the `css`
     * option) and reads the exact rule this fix landed in, the same way a reviewer would.
     */
    async function rootRuleText(): Promise<string> {
        const source = (await import("./TabGroupPicker.vue?raw")).default as string;
        const match = /\.mb-tab-group-picker\s*\{[^}]*\}/.exec(source);
        return match?.[0] ?? "";
    }

    it("paints a background, border and elevation behind its rows, matching AppearanceEditor.vue", async () => {
        // TabStrip.vue opens this picker inside the same scrim-less, click-through
        // `v-menu` (`:open-on-click="false" :close-on-content-click="false" :scrim="false"`)
        // used for AppearanceEditor.vue, which paints nothing behind whatever it opens.
        // Regression for the picker rendering its rows, search field and empty-state text
        // directly over the tab strip with no surface of its own.
        const cssText = await rootRuleText();

        expect(cssText).not.toBe("");
        expect(cssText).toContain("background");
        expect(cssText).toContain("border");
        expect(cssText).toContain("box-shadow");
    });
});

describe("focus", () => {
    it("exposes focus(), which focuses the search field's own input", async () => {
        // jsdom only tracks `document.activeElement` for elements actually connected to the
        // live document, so this one test (and only this one) mounts attached rather than
        // detached the way every other test here does.
        const host = defineComponent({
            setup: () =>
                () =>
                    h(VApp, () => [h(TabGroupPicker, { strip: STRIP, excludeGroupId: null, tabLabel: "Settings" })]),
        });
        const wrapper = mount(host, { global: { plugins: [vuetify, emptyI18n()] }, attachTo: document.body });
        try {
            const vm = picker(wrapper).vm as unknown as { focus: () => void };
            vm.focus();
            await wrapper.vm.$nextTick();
            await new Promise((resolve) => setTimeout(resolve, 0));
            expect(document.activeElement).toBe(searchInput(wrapper).element);
        } finally {
            wrapper.unmount();
        }
    });
});

/**
 * `document.activeElement` is only tracked for elements genuinely connected to the live
 * document, and Vuetify's own overlay plumbing needs a real application root to teleport
 * into -- both reasons `NoticeBulkToolbar.test.ts` and the `focus` suite above already mount
 * attached rather than detached. Every test below does the same for the same two reasons.
 */
function mountAttached(strip: TabStripState = STRIP, excludeGroupId: string | null = null): VueWrapper {
    const host = defineComponent({
        setup: () => () => h(VApp, () => [h(TabGroupPicker, { strip, excludeGroupId, tabLabel: "Settings" })]),
    });
    return mount(host, { global: { plugins: [vuetify, emptyI18n()] }, attachTo: document.body });
}

function cancelButton(wrapper: VueWrapper): HTMLElement {
    const button = wrapper.findAll("button").find((candidate) => candidate.text().includes("Cancel"));
    if (button === undefined) throw new Error("Cancel button not found");
    return button.element as HTMLElement;
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("Tab, with the regex builder closed", () => {
    it("wraps between the search field and the Cancel button at the dialog's own edges", async () => {
        const wrapper = mountAttached();
        try {
            const root = wrapper.find('[role="dialog"]');
            const input = searchInput(wrapper).element as HTMLElement;
            const cancel = cancelButton(wrapper);

            input.focus();
            expect(document.activeElement).toBe(input);

            await root.trigger("keydown", { key: "Tab", shiftKey: true });
            expect(document.activeElement).toBe(cancel);

            await root.trigger("keydown", { key: "Tab" });
            expect(document.activeElement).toBe(input);
        } finally {
            wrapper.unmount();
        }
    });
});

describe("Tab, with the teleported regex builder open", () => {
    /**
     * Regression for the confirmed bug: `focusableElements()`/`trapTab()` computed the trap
     * only from `rootRef.value.querySelectorAll(...)`, but `ConfigSearchField.vue`'s ".*"
     * button opens `ConfigRegexBuilder.vue` inside a `v-menu` that Vuetify teleports straight
     * to `document.body`, entirely outside `rootRef`'s own subtree. A keydown fired while
     * focus sits inside that teleported popover therefore never reached the dialog's own
     * `@keydown` binding at all -- Tab silently did nothing there, and the dialog's own
     * documented contract ("Tab and Shift+Tab wrap ... rather than escaping onto the tab
     * strip behind the picker") went unenforced for exactly the one surface most likely to
     * be open when a user is actually using the keyboard in this dialog.
     *
     * This suite focuses a *middle* element of the popover rather than its first or last, so
     * neither this component's own (previously nonexistent) handling nor Vuetify's own
     * `v-menu` boundary-close behaviour can incidentally paper over the defect: a middle
     * press has nothing to redirect it unless something is actually listening.
     */
    async function openBuilder(wrapper: VueWrapper): Promise<HTMLElement> {
        // Vuetify's `v-menu` binds its activator's click handler one tick after mount, from
        // a post-flush watcher (see `WizardReviewStep.test.ts`'s own `openBuilder`, which
        // settles for this exact reason before ever clicking). A click fired immediately
        // after mount lands on a button with no listener attached yet, so `builderOpen`
        // never flips and the popover this whole suite exists to test never renders --
        // which is a mount-timing gap in the test, not the Tab-trap defect below it.
        await settle();
        const builderButton = wrapper.find('[aria-label="Open the regex builder"]');
        expect(builderButton.exists()).toBe(true);
        await builderButton.trigger("click");
        await settle();
        const builder = document.querySelector<HTMLElement>(".mb-config-regex");
        expect(builder).not.toBeNull();
        return builder as HTMLElement;
    }

    function builderFocusable(builder: HTMLElement): HTMLElement[] {
        return [...builder.querySelectorAll<HTMLElement>('input, button, [tabindex]:not([tabindex="-1"])')].filter(
            (element) => !element.hasAttribute("disabled"),
        );
    }

    /**
     * FOUND AND FIXED: the previously "honestly red" residual above this comment was never a
     * defect in the trap itself. It was a leak in this test file, several hundred lines above
     * `mountAttached`'s own definition: `mountPicker` never unmounted the wrapper it returned,
     * so every one of the ~14 tests that used it (everything under "the group list", "searching
     * the picker", "choosing an entry" and "the keyboard") left its own `TabGroupPicker`
     * instance's `document`-level `keydown` trap attached for the rest of the file's run - see
     * `TabGroupPicker.vue`'s `onMounted`/`onUnmounted` pair, and the comment above `trackedMount`
     * near the top of this file for the full mechanism. By the time this describe block ran,
     * up to fourteen stale traps were listening on the same `document`, each one reading the
     * live, currently-open popover and each moving `document.activeElement` one further step
     * than the last - which is exactly why the middle case landed on one of the *last* controls
     * ("Copy the pattern" / "Copy the flags") rather than one place past where it started, why
     * an isolated run never reproduced it (nothing to leak yet), and why `event.defaultPrevented`
     * was still `true`: `trapAcrossBuilder` genuinely ran, just fourteen times over instead of
     * once. `mountPicker` now routes through `trackedMount`, and this file's own `afterEach`
     * unmounts everything it tracked; 20/20 tests here now pass, run alone or together, checked
     * across several repeated full-file runs rather than once.
     *
     * Ruled out while chasing this, before the actual cause was found: a stale
     * `.mb-config-regex` node left over from an earlier test's `v-menu` shadowing the current
     * one in `document.querySelector` (an `afterEach` sweep of every such node before each test
     * changed nothing on its own - it was necessary, just not sufficient); the popover's own
     * focusable list actually changing shape between the pre-dispatch snapshot and the fresh
     * `openBuilderElements()` read inside the handler (traced directly -- both reads agreed, 31
     * elements, same order, same content - because both reads were of the one real, correctly
     * open popover; the extra movement came from *how many times* that same correct read was
     * acted on, not from what it returned); and Vuetify's shared `useFocusTrap` registry
     * (`retainFocus` is off for this `v-menu`, so nothing of this component's own registers
     * into it). The jsdom layout stubs above remain necessary and correct.
     */
    it("steps Tab through the popover's own controls instead of leaving the keydown unhandled", async () => {
        // A stand-in for "the tab strip behind the picker" / "the rest of the page": a real,
        // independently focusable element sitting in ordinary document order, so an escape
        // has somewhere concrete to land that this assertion can catch.
        const decoy = document.createElement("button");
        decoy.textContent = "outside the dialog";
        document.body.appendChild(decoy);

        const wrapper = mountAttached();
        try {
            const builder = await openBuilder(wrapper);
            const focusable = builderFocusable(builder);
            // At least the pattern textarea, several token buttons, the sample textarea and
            // the two copy buttons -- comfortably more than enough for a genuine middle.
            expect(focusable.length).toBeGreaterThan(4);
            const middleIndex = Math.floor(focusable.length / 2);
            const target = focusable[middleIndex] as HTMLElement;

            target.focus();
            expect(document.activeElement).toBe(target);

            const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
            target.dispatchEvent(event);
            await wrapper.vm.$nextTick();

            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(focusable[middleIndex + 1]);
            expect(document.activeElement).not.toBe(decoy);
        } finally {
            wrapper.unmount();
            decoy.remove();
        }
    });

    it("wraps Shift+Tab from the popover's own first control back to the \".*\" button that opened it", async () => {
        const wrapper = mountAttached();
        try {
            const builder = await openBuilder(wrapper);
            const focusable = builderFocusable(builder);
            const first = focusable[0] as HTMLElement;
            const builderButton = wrapper.find('[aria-label="Open the regex builder"]').element as HTMLElement;

            first.focus();
            expect(document.activeElement).toBe(first);

            const event = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
            first.dispatchEvent(event);
            await wrapper.vm.$nextTick();

            expect(event.defaultPrevented).toBe(true);
            expect(document.activeElement).toBe(builderButton);
        } finally {
            wrapper.unmount();
        }
    });

    it("steps forward from the search field's own \".*\" button into the popover rather than jumping past it to Cancel", async () => {
        const wrapper = mountAttached();
        try {
            const builder = await openBuilder(wrapper);
            const focusable = builderFocusable(builder);
            const builderButton = wrapper.find('[aria-label="Open the regex builder"]').element as HTMLElement;

            builderButton.focus();
            expect(document.activeElement).toBe(builderButton);

            const root = wrapper.find('[role="dialog"]');
            await root.trigger("keydown", { key: "Tab" });

            expect(document.activeElement).toBe(focusable[0]);
        } finally {
            wrapper.unmount();
        }
    });
});
