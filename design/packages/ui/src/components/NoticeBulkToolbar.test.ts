// @vitest-environment jsdom

/**
 * `NoticeBulkToolbar.vue`, mounted: the bulk-action bar that turns a selection into a
 * dismiss, a delete behind the gate, an export that matches the active filter, or a nudge to
 * the read watermark. `noticeBulk.test.ts` already proves the model underneath every one of
 * these; this file proves the wiring - that the right button calls the right function with
 * the right selection, that the preview text really does distinguish "selected" from "will
 * change", that the delete button genuinely will not fire without both keys and a full-range
 * slider, and that `update:selected` really does carry the new set back to whichever parent
 * owns it.
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";
import { VApp, VSlider, VSwitch } from "vuetify/components";
import NoticeBulkToolbar from "./NoticeBulkToolbar.vue";
import { createNoticeState, notify, type Notice, type NoticeState } from "./config/notifications.js";
import { GATE_COMPLETION_HOLD_MS, GATE_TRAVEL_END } from "./confirm/superConfirmGate.js";
import { filterNotices } from "./notifications/noticeCentre.js";
import { createSettingMatcher } from "./config/regexEngine.js";

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

    Element.prototype.scrollIntoView = function scrollIntoView(): void {};

    // Without this the overlay throws asynchronously, after the assertion that opened it has
    // already passed, and the failure is attributed to whichever test ran next.
    document.elementsFromPoint = (): Element[] => [];

    Object.defineProperty(globalThis, "visualViewport", {
        configurable: true,
        value: {
            width: 1024,
            height: 768,
            offsetLeft: 0,
            offsetTop: 0,
            scale: 1,
            addEventListener: () => {},
            removeEventListener: () => {},
        } as unknown as VisualViewport,
    });
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

let writeText: ReturnType<typeof vi.fn>;

beforeEach(() => {
    writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
    });
});

/** Five notices, ids 1..5 in the order raised. */
function fiveState(): NoticeState {
    const state = createNoticeState();
    notify(state, "info", "one");
    notify(state, "info", "two");
    notify(state, "warning", "three");
    notify(state, "error", "four", { title: "Save failed" });
    notify(state, "success", "five");
    return state;
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

function mountToolbar(state: NoticeState, visible: readonly Notice[], selected: ReadonlySet<number>) {
    // Wrapped in VApp, the way NoticeCentrePanel.test.ts wraps its own subject: Vuetify's
    // overlay-based gate needs a real application root to anchor into.
    return mount(
        {
            components: { NoticeBulkToolbar },
            props: ["state", "visible", "selected"],
            emits: ["update:selected"],
            template: `<v-app><NoticeBulkToolbar :state="state" :visible="visible" :selected="selected" @update:selected="$emit('update:selected', $event)" /></v-app>`,
        },
        {
            props: { state, visible, selected },
            global: { plugins: [vuetify, i18n()], components: { VApp } },
            attachTo: document.body,
        },
    ) as unknown as VueWrapper;
}

function buttonByText(view: VueWrapper, text: string) {
    return view.findAll("button").find((button) => button.text().includes(text));
}

/**
 * `mountToolbar` above feeds `selected` through as a static prop, so a `v-if` guarding a
 * button never actually loses that button mid-test - `selected` never changes underneath the
 * child. `NoticeCentrePanel.vue` does not work that way: its real wiring is
 * `selected.value = new Set(next)` on every `update:selected`, so the toolbar re-renders off a
 * genuinely new selection after each action. This harness matches that real wiring, which is
 * what a focus-after-DOM-removal regression needs to actually reproduce.
 */
function mountReactiveToolbar(state: NoticeState, visible: readonly Notice[], initial: ReadonlySet<number>) {
    return mount(
        {
            components: { NoticeBulkToolbar },
            props: ["state", "visible"],
            template: `<v-app><NoticeBulkToolbar :state="state" :visible="visible" :selected="selected" @update:selected="selected = new Set($event)" /></v-app>`,
            data() {
                return { selected: new Set(initial) };
            },
        },
        {
            props: { state, visible },
            global: { plugins: [vuetify, i18n()], components: { VApp } },
            attachTo: document.body,
        },
    ) as unknown as VueWrapper;
}

/**
 * `ConfigSuperConfirm`'s gate is a `v-menu`, which Vuetify teleports to `document.body`
 * outside the mounted wrapper's own element - `view.text()` walks the wrapper's own subtree
 * and never sees it, the same reason `ProfileManager.test.ts` reads the gate through the
 * document rather than the wrapper.
 */
function bodyText(): string {
    return document.body.textContent ?? "";
}

describe("select all, honestly scoped", () => {
    it("selecting all shown picks exactly the filtered ids, not the whole history", async () => {
        const state = fiveState();
        const visible = filterNotices(state.history, {
            levels: [],
            matcher: createSettingMatcher("four", false, "i"),
        });
        const view = mountToolbar(state, visible, new Set());

        expect(buttonByText(view, "Select all 1 shown")).toBeDefined();
        await buttonByText(view, "Select all 1 shown")?.trigger("click");

        const emitted = view.emitted("update:selected") as [Set<number>][];
        expect([...(emitted.at(-1)?.[0] ?? [])]).toEqual([4]);
    });

    it("selecting all in history picks every id regardless of the filter", async () => {
        const state = fiveState();
        const visible = filterNotices(state.history, {
            levels: [],
            matcher: createSettingMatcher("four", false, "i"),
        });
        const view = mountToolbar(state, visible, new Set());

        expect(buttonByText(view, "Select all 5 in history")).toBeDefined();
        await buttonByText(view, "Select all 5 in history")?.trigger("click");

        const emitted = view.emitted("update:selected") as [Set<number>][];
        expect([...(emitted.at(-1)?.[0] ?? [])].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
    });
});

describe("invert", () => {
    it("flips every visible id and leaves anything selected outside it alone", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1, 99]));

        await buttonByText(view, "Invert selection")?.trigger("click");

        const emitted = view.emitted("update:selected") as [Set<number>][];
        expect([...(emitted.at(-1)?.[0] ?? [])].sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 99]);
    });
});

describe("clear", () => {
    it("emits an empty set", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1, 2]));

        await buttonByText(view, "Clear selection")?.trigger("click");

        const emitted = view.emitted("update:selected") as [Set<number>][];
        expect(emitted.at(-1)?.[0].size).toBe(0);
    });
});

describe("the selection status", () => {
    it("announces the count selected, live", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1, 3, 5]));
        await settle();

        const status = view.find("[role='status']");
        expect(status.text()).toContain("3 selected");
    });
});

describe("dismiss", () => {
    it("shows the exact count that will actually leave the corner, distinct from the pick count", async () => {
        const state = fiveState();
        state.live = state.live.filter((notice) => notice.id !== 2); // 2 is not showing
        const view = mountToolbar(state, state.history, new Set([1, 2]));
        await settle();

        // 2 selected, but only 1 is currently showing.
        expect(buttonByText(view, "Dismiss 1 selected")).toBeDefined();
    });

    it("clears only the selected ids off the corner, leaves the history, and reports what happened", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1, 3]));

        await buttonByText(view, "Dismiss 2 selected")?.trigger("click");
        await settle();

        expect(state.live.map((notice) => notice.id).sort((a, b) => a - b)).toEqual([2, 4, 5]);
        expect(state.history).toHaveLength(5);
        expect(view.text()).toContain("Done. 2 changed.");

        const emitted = view.emitted("update:selected") as [Set<number>][];
        expect(emitted.at(-1)?.[0].size).toBe(0);
    });

    it("reports the exclusion by name when some of the selection is not currently showing", async () => {
        const state = fiveState();
        state.live = state.live.filter((notice) => notice.id !== 2);
        const view = mountToolbar(state, state.history, new Set([1, 2]));
        await settle();

        expect(view.text()).toContain("1 of the selection were not currently showing");
    });

    it("shows its own honest-preview sentence on screen, not only inside a hover tooltip", async () => {
        // Regression: the sentence used to live only inside a `v-tooltip`, which Vuetify does
        // not mount until the activator is hovered or focused - a fact nobody deciding
        // whether to press the button could actually read just by looking at the panel.
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1, 3]));
        await settle();

        expect(view.text()).toContain("This clears 2 notifications from the corner");
        expect(view.text()).toContain("still in the history");
    });
});

describe("mark as read", () => {
    it("shows the total that will flip, including notices nobody picked", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([2]));
        await settle();

        // Picking id 2 alone advances the watermark past 1 as well, since read is one line.
        expect(buttonByText(view, "Mark 2 as read")).toBeDefined();
        expect(view.text()).toContain("in between");
    });

    it("advances the watermark and reports it, then clears the selection", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([2]));

        await buttonByText(view, "Mark 2 as read")?.trigger("click");
        await settle();

        expect(state.reviewedId).toBe(2);
        expect(view.text()).toContain("Done. 2 changed.");
        const emitted = view.emitted("update:selected") as [Set<number>][];
        expect(emitted.at(-1)?.[0].size).toBe(0);
    });

    it("reports by name when part of the selection has aged out of history, the same way dismiss/delete/export do", async () => {
        // Selection persists across filter changes (this module's whole point), so a picked
        // id can age out of the bounded history before "mark as read" runs. 99 stands in for
        // that: it was selected once but no longer exists in state.history.
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([2, 99]));
        await settle();

        expect(buttonByText(view, "Mark 2 as read")).toBeDefined();
        expect(view.text()).toContain("1 of the selection no longer exist in the history");
    });
});

describe("export", () => {
    it("copies only the selected notices the active filter is showing, as JSON", async () => {
        const state = fiveState();
        const visible = filterNotices(state.history, {
            levels: [],
            matcher: createSettingMatcher("four", false, "i"),
        });
        // 1 and 4 picked, but the filter only shows 4: export must match what is seen.
        const view = mountToolbar(state, visible, new Set([1, 4]));
        await settle();

        expect(buttonByText(view, "Export 1 as JSON")).toBeDefined();
        await buttonByText(view, "Export 1 as JSON")?.trigger("click");
        await settle();

        expect(writeText).toHaveBeenCalledTimes(1);
        const written = writeText.mock.calls[0]?.[0] as string;
        const parsed = JSON.parse(written) as { id: number }[];
        expect(parsed.map((entry) => entry.id)).toEqual([4]);
        expect(view.text()).toContain("1 of the selection do not match the active filter");
    });

    it("copies as Markdown through the same formatter the single-item copy button uses", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1]));

        await buttonByText(view, "Export 1 as Markdown")?.trigger("click");
        await settle();

        const written = writeText.mock.calls[0]?.[0] as string;
        expect(written).toContain("one");
        expect(view.text()).toContain("Copied 1 to the clipboard.");
    });

    it("reports failure rather than pretending the clipboard worked", async () => {
        writeText.mockImplementation(() => Promise.reject(new Error("denied")));
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1]));

        await buttonByText(view, "Export 1 as JSON")?.trigger("click");
        await settle();

        expect(view.text()).toContain("Could not reach the clipboard.");
    });

    it("shows its own honest-preview sentence on screen, not only inside a hover tooltip", async () => {
        // Regression, the same as dismiss's own sibling test above: the sentence used to live
        // only inside a `v-tooltip`, unreachable by simply reading the panel.
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1]));
        await settle();

        expect(view.text()).toContain("This writes 1 notifications, exactly the ones that match your current filter");
    });
});

describe("delete: behind the gate, not a plain click", () => {
    function openGate(view: VueWrapper) {
        const button = buttonByText(view, "Delete");
        return button?.trigger("click");
    }

    async function slideToEnd(view: VueWrapper): Promise<void> {
        view.findComponent(VSlider).vm.$emit("update:modelValue", GATE_TRAVEL_END);
        await settle();
    }

    it("names the exact count and cannot be undone, before anything happens", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1, 2]));
        await openGate(view);
        await settle();

        expect(bodyText()).toContain("This removes 2 notifications from the history for good");
        expect(bodyText()).toContain("cannot be undone");
        expect(state.history).toHaveLength(5); // nothing has happened yet
    });

    it("lists the affected notices by name in the reviewable preview", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([4]));
        await openGate(view);
        await settle();

        expect(bodyText()).toContain("Save failed");
    });

    it("refuses a slider driven to the end with no keys turned", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1]));
        await openGate(view);
        await settle();
        await slideToEnd(view);

        expect(state.history).toHaveLength(5);
    });

    it("refuses one key and a completed slider", async () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set([1]));
        await openGate(view);
        await settle();

        await view.findAllComponents(VSwitch)[0]?.setValue(true);
        await settle();
        await slideToEnd(view);

        expect(state.history).toHaveLength(5);
    });

    it("deletes only once both keys are turned and the slider has gone all the way, and its own completion hold has elapsed", async () => {
        vi.useFakeTimers();
        try {
            const state = fiveState();
            const view = mountToolbar(state, state.history, new Set([1, 3]));
            await openGate(view);
            await settle();

            await view.findAllComponents(VSwitch)[0]?.setValue(true);
            await view.findAllComponents(VSwitch)[1]?.setValue(true);
            await settle();
            await slideToEnd(view);

            vi.advanceTimersByTime(GATE_COMPLETION_HOLD_MS + 10);
            await settle();

            expect(state.history.map((notice) => notice.id).sort((a, b) => a - b)).toEqual([2, 4, 5]);
            expect(view.text()).toContain("Done. 2 changed.");

            const emitted = view.emitted("update:selected") as [Set<number>][];
            expect(emitted.at(-1)?.[0].size).toBe(0);
        } finally {
            vi.useRealTimers();
        }
    });

    it("holds the gate's own completion state before deleting anything, rather than tearing it down the instant it authorizes", async () => {
        // Regression for the delete gate unmounting itself mid-hold: `ConfigSuperConfirm`
        // authorizes the moment the slider reaches the end and then holds its "Authorized."
        // state on screen for GATE_COMPLETION_HOLD_MS before closing. Deleting immediately -
        // the previous behaviour - cleared the very history and selection this button's own
        // `v-if="deleteImp.changingCount > 0"` depends on in that same tick, tearing the
        // still-open gate out of the DOM before a frame of "Authorized." could be seen.
        vi.useFakeTimers();
        try {
            const state = fiveState();
            const view = mountToolbar(state, state.history, new Set([1, 3]));
            await openGate(view);
            await settle();

            await view.findAllComponents(VSwitch)[0]?.setValue(true);
            await view.findAllComponents(VSwitch)[1]?.setValue(true);
            await settle();
            await slideToEnd(view);

            // The gate has just authorized, but its own documented hold has not elapsed yet:
            // nothing should be deleted, and the gate's completion state should still be the
            // thing actually on screen.
            expect(state.history).toHaveLength(5);
            expect(bodyText()).toContain("Authorized");

            vi.advanceTimersByTime(GATE_COMPLETION_HOLD_MS + 10);
            await settle();

            expect(state.history).toHaveLength(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it("offers no delete button at all with an empty selection", () => {
        const state = fiveState();
        const view = mountToolbar(state, state.history, new Set());
        expect(buttonByText(view, "Delete")).toBeUndefined();
    });
});

describe("focus survives the button that removed itself", () => {
    // Dismiss, mark-as-read, clear and delete all empty the selection as part of running,
    // which pulls their own triggering button (or, for dismiss/mark-as-read, the whole
    // `hasSelection` block it lives in) out of the DOM on the very next render. A component
    // with no focus handling of its own leaves that focus on `document.body`, stranding a
    // keyboard or screen-reader user; these prove focus instead lands on the toolbar's
    // always-rendered live-region status paragraph.

    it("dismiss moves focus to the status region instead of stranding it on body", async () => {
        const state = fiveState();
        const view = mountReactiveToolbar(state, state.history, new Set([1, 3]));
        await settle();

        const button = buttonByText(view, "Dismiss 2 selected");
        (button?.element as HTMLElement).focus();
        expect(document.activeElement).toBe(button?.element);

        await button?.trigger("click");
        await settle();
        await settle();

        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(view.find("[role='status']").element);
    });

    it("mark-as-read moves focus to the status region instead of stranding it on body", async () => {
        const state = fiveState();
        const view = mountReactiveToolbar(state, state.history, new Set([2]));
        await settle();

        const button = buttonByText(view, "Mark 2 as read");
        (button?.element as HTMLElement).focus();
        expect(document.activeElement).toBe(button?.element);

        await button?.trigger("click");
        await settle();
        await settle();

        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(view.find("[role='status']").element);
    });

    it("clear selection moves focus to the status region instead of stranding it on body", async () => {
        const state = fiveState();
        const view = mountReactiveToolbar(state, state.history, new Set([1, 2]));
        await settle();

        const button = buttonByText(view, "Clear selection");
        (button?.element as HTMLElement).focus();
        expect(document.activeElement).toBe(button?.element);

        await button?.trigger("click");
        await settle();
        await settle();

        expect(document.activeElement).not.toBe(document.body);
        expect(document.activeElement).toBe(view.find("[role='status']").element);
    });

    it("delete moves focus to the status region after its own completion hold, instead of stranding it on body", async () => {
        // Delete has one more step than the other three: its own gate's `returnFocusTo`
        // targets the "Delete N selected" button, and that button is itself gone by the
        // time the deferred delete actually runs (see `runDelete`'s own comment). This is
        // what proves focus still lands somewhere real rather than on `<body>` regardless.
        vi.useFakeTimers();
        try {
            const state = fiveState();
            const view = mountReactiveToolbar(state, state.history, new Set([1, 3]));
            await settle();

            const openButton = buttonByText(view, "Delete");
            (openButton?.element as HTMLElement).focus();
            expect(document.activeElement).toBe(openButton?.element);

            await openButton?.trigger("click");
            await settle();

            await view.findAllComponents(VSwitch)[0]?.setValue(true);
            await view.findAllComponents(VSwitch)[1]?.setValue(true);
            await settle();
            view.findComponent(VSlider).vm.$emit("update:modelValue", GATE_TRAVEL_END);
            await settle();

            vi.advanceTimersByTime(GATE_COMPLETION_HOLD_MS + 10);
            await settle();
            await settle();

            expect(document.activeElement).not.toBe(document.body);
            expect(document.activeElement).toBe(view.find("[role='status']").element);
        } finally {
            vi.useRealTimers();
        }
    });
});
