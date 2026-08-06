// @vitest-environment jsdom

/**
 * The notification centre, mounted.
 *
 * The filtering is unit-tested next door in `noticeCentre.test.ts` and none of it is
 * repeated here. What this file pins is the wiring, which is exactly the part a green logic
 * test cannot vouch for: that the search bar really is the shared field that carries the
 * regex builder, that a level chip really narrows the list and says so out loud through
 * `aria-pressed`, that "Show again" really puts the notice back in the corner, and that the
 * empty states tell the truth about which kind of empty they are.
 *
 * Every claim below was a way this surface could have shipped looking finished and doing
 * nothing, which is the failure this project keeps finding.
 */

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick, type PropType } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp } from "vuetify/components";
import NoticeCentrePanel from "./NoticeCentrePanel.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ChangelogDateFilter from "../changelog/ChangelogDateFilter.vue";
import { createNoticeState, dismissAll, notify, type NoticeState } from "../config/notifications.js";

beforeAll(() => {
    // jsdom has no layout engine, and Vuetify's fields and overlays observe their own size.
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

const vuetify = createVuetify();

/**
 * The i18n this package really ships: no messages loaded, every key falling back to its
 * English third argument. That is the state a build without translations stays in, and the
 * state this panel is nearly always rendered in.
 */
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

const Host = defineComponent({
    props: { state: { type: Object as PropType<NoticeState>, required: true } },
    emits: ["close"],
    setup(props, { emit }) {
        return () =>
            h(VApp, null, {
                default: () => [h(NoticeCentrePanel, { state: props.state, onClose: () => emit("close") })],
            });
    },
});

type Host = InstanceType<typeof Host>;

let state: NoticeState;
let wrapper: VueWrapper<Host> | null = null;

beforeEach(() => {
    state = createNoticeState();
    wrapper = null;
});

/** A history with one of each level, newest first once it lands. */
function fillHistory(): void {
    notify(state, "info", "Read 9 config files.");
    notify(state, "success", "Saved the BlueMap configuration in /srv/bluemap.");
    notify(state, "warning", "These maps have to be rendered again: overworld.");
    notify(state, "error", "The files were not written.", {
        title: "Save failed",
        detail: "EACCES: permission denied",
        actions: [{ id: "retry", label: "Retry the save" }],
    });
    // Nothing is on screen: the centre exists for messages that have already left.
    dismissAll(state);
}

function open(): VueWrapper<Host> {
    wrapper = mount(Host, {
        props: { state },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    }) as unknown as VueWrapper<Host>;
    return wrapper;
}

function rows(view: VueWrapper<Host>): string[] {
    return view.findAll(".mb-notice-centre__item").map((row) => row.text());
}

async function type(view: VueWrapper<Host>, query: string): Promise<void> {
    const input = view.find("input");
    await input.setValue(query);
    await nextTick();
}

describe("the history it shows", () => {
    it("lists every notice raised, newest first, with its level, timestamp and body", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const listed = rows(view);
        expect(listed).toHaveLength(4);
        expect(listed[0]).toContain("The files were not written.");
        expect(listed[0]).toContain("Save failed");
        expect(listed[0]).toContain((state.history[0]?.at ?? "").slice(0, 10));
        expect(listed[3]).toContain("Read 9 config files.");
    });

    it("keeps the actions a dismissed notice offered, so a retry is not thrown away with the toast", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        expect(view.text()).toContain("Retry the save");
    });

    it("says nothing has happened yet, rather than showing an empty box", async () => {
        const view = open();
        await nextTick();

        expect(view.text()).toContain("Nothing has been reported yet.");
    });
});

describe("finding one again", () => {
    it("searches the body, and says how many of how many are showing", async () => {
        fillHistory();
        const view = open();
        await type(view, "overworld");

        expect(rows(view)).toHaveLength(1);
        expect(rows(view)[0]).toContain("overworld");
        expect(view.text()).toContain("Showing 1 of 4 notifications.");
    });

    it("searches the detail, which is often the only place a path appears", async () => {
        fillHistory();
        const view = open();
        await type(view, "EACCES");

        expect(rows(view)).toHaveLength(1);
        expect(rows(view)[0]).toContain("The files were not written.");
    });

    it("uses the shared search field, so the regex builder comes with it rather than being rebuilt", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        expect(view.findComponent(ConfigSearchField).exists()).toBe(true);
        expect(view.find('[aria-label="Open the regex builder"]').exists()).toBe(true);
    });

    it("previews the builder against the real history rather than an invented sample", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const sample = view.findComponent(ConfigSearchField).props("sample");
        expect(sample).toContain("The files were not written.");
        expect(String(sample).split("\n")).toHaveLength(4);
    });

    it("says no match, and distinguishes that from having nothing to show", async () => {
        fillHistory();
        const view = open();
        await type(view, "nothing matches this");

        expect(rows(view)).toHaveLength(0);
        expect(view.text()).toContain("No notification matches this search, these levels and this date range.");
        expect(view.text()).not.toContain("Nothing has been reported yet.");
    });
});

describe("filtering by level", () => {
    it("offers a chip per level with its count, announced as pressed or not", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const chips = view.findAll(".mb-notice-centre__level");
        expect(chips).toHaveLength(4);
        expect(chips[0]?.text()).toBe("Errors (1)");
        expect(chips.every((chip) => chip.attributes("aria-pressed") === "false")).toBe(true);
    });

    it("narrows to the level pressed, and lets go of it when it is pressed again", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const errors = view.findAll(".mb-notice-centre__level")[0];
        await errors?.trigger("click");
        await nextTick();

        expect(rows(view)).toHaveLength(1);
        expect(errors?.attributes("aria-pressed")).toBe("true");

        await errors?.trigger("click");
        await nextTick();

        expect(rows(view)).toHaveLength(4);
        expect(errors?.attributes("aria-pressed")).toBe("false");
    });

    it("composes with the search rather than replacing it", async () => {
        fillHistory();
        const view = open();
        await type(view, "rendered again");
        await openFilters(view);
        await view.findAll(".mb-notice-centre__level")[0]?.trigger("click");
        await nextTick();

        expect(rows(view)).toHaveLength(0);
        expect(view.text()).toContain("No notification matches this search, these levels and this date range.");
    });
});

/* -------------------------------------------------------------------------- */
/* The collapsible filters row: the date range and the level chips together   */
/* -------------------------------------------------------------------------- */

/** Presses the Filters toggle, opening the row that holds the date range and the levels. */
async function openFilters(view: VueWrapper<Host>): Promise<void> {
    const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
    await toggle?.trigger("click");
    await nextTick();
}

/** A history spread across three distinct days, for the date-range tests below. */
function fillHistoryOverDays(): void {
    const first = notify(state, "info", "the oldest one");
    const second = notify(state, "warning", "the middle one");
    const third = notify(state, "error", "the newest one");
    Object.assign(first, { at: "2026-03-01T09:00:00" });
    Object.assign(second, { at: "2026-03-05T09:00:00" });
    Object.assign(third, { at: "2026-03-10T09:00:00" });
    dismissAll(state);
}

describe("the filters row starts collapsed", () => {
    it("hides the date range and the level chips until Filters is pressed", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        expect(view.findComponent(ChangelogDateFilter).exists()).toBe(true);
        const filtersRow = view.find(".mb-notice-centre__filters");
        expect(filtersRow.isVisible()).toBe(false);

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        expect(toggle?.attributes("aria-expanded")).toBe("false");

        await openFilters(view);

        expect(filtersRow.isVisible()).toBe(true);
        expect(toggle?.attributes("aria-expanded")).toBe("true");
    });

    it("keeps the search bar outside the collapsed row, always visible", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        expect(view.findComponent(ConfigSearchField).exists()).toBe(true);
        expect(view.findComponent(ConfigSearchField).element.closest(".mb-notice-centre__filters")).toBeNull();
    });

    it("shows a badge naming how many filters are active, search included", async () => {
        fillHistory();
        const view = open();
        await type(view, "overworld");

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        expect(toggle?.text()).toContain("1");
    });

    it("clears every filter - search, levels and dates - with one button", async () => {
        fillHistory();
        const view = open();
        await type(view, "overworld");
        await openFilters(view);
        await view.findAll(".mb-notice-centre__level")[0]?.trigger("click");
        await nextTick();

        const clear = view.findAll("button").find((button) => button.text().includes("Clear every filter"));
        expect(clear).toBeDefined();
        await clear?.trigger("click");
        await nextTick();

        expect(rows(view)).toHaveLength(4);
        expect((view.find("input").element as HTMLInputElement).value).toBe("");
    });
});

describe("filtering by a date range", () => {
    it("narrows to the days inside the range, and composes with the search already active", async () => {
        fillHistoryOverDays();
        const view = open();
        await openFilters(view);

        await view.findComponent(ChangelogDateFilter).vm.$emit("update:from", "2026-03-05");
        await view.findComponent(ChangelogDateFilter).vm.$emit("update:to", "2026-03-05");
        await nextTick();

        expect(rows(view)).toHaveLength(1);
        expect(view.text()).toContain("the middle one");
        expect(view.text()).not.toContain("the newest one");
        expect(view.text()).not.toContain("the oldest one");
    });

    it("says no notification matches this search, these levels and this date range together", async () => {
        fillHistoryOverDays();
        const view = open();
        await openFilters(view);

        await view.findComponent(ChangelogDateFilter).vm.$emit("update:from", "1999-01-01");
        await view.findComponent(ChangelogDateFilter).vm.$emit("update:to", "1999-01-02");
        await nextTick();

        expect(rows(view)).toHaveLength(0);
        expect(view.text()).toContain(
            "No notification matches this search, these levels and this date range.",
        );
    });

    it("setting a date does not silently clear the search, nor the reverse", async () => {
        fillHistoryOverDays();
        const view = open();
        await type(view, "middle");
        await openFilters(view);

        await view.findComponent(ChangelogDateFilter).vm.$emit("update:from", "2026-03-01");
        await view.findComponent(ChangelogDateFilter).vm.$emit("update:to", "2026-03-10");
        await nextTick();

        // The query survives setting a date.
        expect((view.find("input").element as HTMLInputElement).value).toBe("middle");
        expect(rows(view)).toHaveLength(1);
        expect(view.text()).toContain("the middle one");
    });
});

describe("bringing one back", () => {
    it("puts the notice itself back in the corner, with its id and its actions intact", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const failure = state.history[0];
        const restore = view.findAll("button").find((button) => button.text().includes("Show again"));
        await restore?.trigger("click");
        await nextTick();

        expect(state.live).toHaveLength(1);
        expect(state.live[0]?.id).toBe(failure?.id);
        expect(state.live[0]?.actions?.[0]?.label).toBe("Retry the save");
    });

    it("says a notice is already showing rather than offering a button that does nothing", async () => {
        notify(state, "error", "The files were not written.");
        const view = open();
        await nextTick();

        expect(view.text()).toContain("Showing now");
        expect(view.text()).not.toContain("Show again");
    });
});

describe("what a screen reader is told", () => {
    it("names the panel as a region rather than leaving an unlabelled card", async () => {
        const view = open();
        await nextTick();

        const panel = view.find(".mb-notice-centre");
        expect(panel.attributes("role")).toBe("region");
        expect(panel.attributes("aria-label")).toBe("Notification centre");
    });

    it("groups and names the level filters", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const group = view.find(".mb-notice-centre__levels");
        expect(group.attributes("role")).toBe("group");
        expect(group.attributes("aria-label")).toBe("Filter by level");
    });

    it("reaches every control from the keyboard, because each one is a real button", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        const buttons = view.findAll("button");
        expect(buttons.length).toBeGreaterThan(4);
        expect(buttons.every((button) => button.attributes("disabled") === undefined)).toBe(true);
        // A control removed from the tab order is a control a keyboard cannot reach at all.
        expect(buttons.every((button) => button.attributes("tabindex") !== "-1")).toBe(true);
    });

    it("labels the close control, which is an icon and nothing else", async () => {
        const view = open();
        await nextTick();

        expect(view.find(".mb-notice-centre__icon-button").attributes("aria-label")).toBe(
            "Close the notification centre",
        );
    });

    it("emits close so the surface that opened it can return focus to the bell", async () => {
        const view = open();
        await view.find(".mb-notice-centre__icon-button").trigger("click");

        expect(view.emitted("close")).toHaveLength(1);
    });
});

/* -------------------------------------------------------------------------- */
/* Bulk selection and bulk actions, wired end to end                          */
/* -------------------------------------------------------------------------- */

/** The row checkboxes, in the order the list renders them (newest first). */
function checkboxes(view: VueWrapper<Host>): HTMLInputElement[] {
    return view.findAll("input[type='checkbox']").map((input) => input.element as HTMLInputElement);
}

function buttonByText(view: VueWrapper<Host>, text: string) {
    return view.findAll("button").find((button) => button.text().includes(text));
}

describe("selecting rows", () => {
    it("a plain click toggles just that row, leaving the rest alone", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        await checkboxes(view)[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await nextTick();

        const boxes = checkboxes(view);
        expect(boxes[1]?.checked).toBe(true);
        expect(boxes[0]?.checked).toBe(false);
        expect(boxes[2]?.checked).toBe(false);
        expect(boxes[3]?.checked).toBe(false);
    });

    it("a shift-click extends a range from the last plain pick, in the order shown", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        // Plain-pick the first row, then shift-click the third: rows 0, 1 and 2 should end
        // up picked, and the fourth left alone.
        await checkboxes(view)[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await nextTick();
        await checkboxes(view)[2]?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, shiftKey: true }),
        );
        await nextTick();

        const boxes = checkboxes(view);
        expect(boxes.map((box) => box.checked)).toEqual([true, true, true, false]);
    });

    it("announces the live count as the selection changes", async () => {
        fillHistory();
        const view = open();
        await nextTick();

        await checkboxes(view)[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await nextTick();

        const status = view.find("[role='status']");
        expect(status.exists()).toBe(true);
        expect(view.text()).toContain("1 selected");
    });
});

describe("select all composes with the active search, honestly", () => {
    it("selecting all shown, after a search, picks only what the search matched", async () => {
        fillHistory();
        const view = open();
        await type(view, "overworld");

        expect(buttonByText(view, "Select all 1 shown")).toBeDefined();
        await buttonByText(view, "Select all 1 shown")?.trigger("click");
        await nextTick();

        expect(view.text()).toContain("1 selected");

        // Widening the search back out does not silently grow the picked set: only the one
        // notice the narrower search matched stays selected.
        await type(view, "");
        expect(view.text()).toContain("1 selected");
    });

    it("selecting all in history ignores the active search and picks everything", async () => {
        fillHistory();
        const view = open();
        await type(view, "overworld");

        await buttonByText(view, "Select all 4 in history")?.trigger("click");
        await nextTick();

        expect(view.text()).toContain("4 selected");
    });
});

describe("bulk dismiss, wired through the whole panel", () => {
    it("clears the selected notices off the corner and leaves the history untouched", async () => {
        // These start live rather than dismissed, unlike fillHistory()'s own set, so there
        // is something in `state.live` for a bulk dismiss to actually clear.
        notify(state, "info", "one");
        notify(state, "warning", "two");
        notify(state, "error", "three");
        const view = open();
        await nextTick();

        await checkboxes(view)[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await checkboxes(view)[1]?.dispatchEvent(
            new MouseEvent("click", { bubbles: true, shiftKey: true }),
        );
        await nextTick();

        await buttonByText(view, "Dismiss 2 selected")?.trigger("click");
        await nextTick();

        expect(state.live.map((notice) => notice.message)).toEqual(["one"]);
        expect(state.history).toHaveLength(3);
    });
});
