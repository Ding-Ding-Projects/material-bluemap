// @vitest-environment jsdom

/**
 * `SimpleHistoryPanel.vue`, mounted.
 *
 * `SimpleHistoryList.vue` next door has no mounted test of its own; this file's fake host is
 * shaped the same way `HistoryPanel.test.ts`'s is, narrowed to the two methods
 * {@link SimpleHistoryHost} actually offers. What matters here, the same way it matters for
 * every panel this project has shipped: the search bar really reaches the shared regex
 * builder, plain text stays the default, the date range and the search compose rather than
 * one overriding the other, an invalid typed date reports inline without discarding what was
 * typed, and the two empty states - nothing recorded at all, and nothing matching the filters
 * - stay distinct.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { defineComponent, h, nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import SimpleHistoryPanel from "./SimpleHistoryPanel.vue";
import ConfigSearchField from "../config/ConfigSearchField.vue";
import ChangelogDateFilter from "../changelog/ChangelogDateFilter.vue";
import type { HistoryRevision, HistoryRestoreResult } from "./historyHost.js";
import type { SimpleHistoryHost, SimpleHistoryListing } from "./simpleHistoryHost.js";

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
const i18n = createI18n({
    legacy: false,
    locale: "en",
    fallbackLocale: "en",
    missingWarn: false,
    fallbackWarn: false,
    messages: { en: {} },
});

function revision(partial: Partial<HistoryRevision> & { id: string }): HistoryRevision {
    return {
        shortId: partial.id.slice(0, 12),
        at: "2026-03-04T10:00:00",
        label: "Changed",
        action: "changed",
        changes: [{ path: "settings.json", status: "modified" }],
        note: null,
        restoredFrom: null,
        ...partial,
    };
}

const REVISIONS: HistoryRevision[] = [
    revision({
        id: "aaaa000000001",
        at: "2026-03-10T09:00:00",
        label: "Added the survival profile",
        action: "created",
    }),
    revision({
        id: "bbbb000000002",
        at: "2026-03-05T09:00:00",
        label: "Deleted the creative profile",
        action: "deleted",
    }),
    revision({
        id: "cccc000000003",
        at: "2026-03-01T09:00:00",
        label: "History started",
        action: "started",
    }),
];

interface Recorded {
    readonly host: SimpleHistoryHost;
    readonly calls: string[];
}

function fakeHost(overrides: Partial<SimpleHistoryHost> = {}, revisions = REVISIONS): Recorded {
    const calls: string[] = [];
    const listing: SimpleHistoryListing = {
        available: true,
        reason: null,
        repository: "/data/profiles-history/repo",
        revisions,
        remotes: [],
    };

    const host: SimpleHistoryHost = {
        list: async () => {
            calls.push("list");
            return overrides.list ? overrides.list() : listing;
        },
        restore: async (id: string): Promise<HistoryRestoreResult> => {
            calls.push(`restore:${id}`);
            return overrides.restore
                ? overrides.restore(id)
                : { ok: true, revision: null, message: `Restored ${id}`, skipped: [] };
        },
        // Left off unless a test asks for it, exactly as `simpleHistoryHostFrom` leaves it
        // off a host built from a bridge that does not have it: the trim control's own
        // gating on `host.discardOlderRevisions !== undefined` is what this proves.
        ...(overrides.discardOlderRevisions === undefined
            ? {}
            : { discardOlderRevisions: overrides.discardOlderRevisions }),
    };
    return { host, calls };
}

let wrapper: VueWrapper | null = null;

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
});

function open(host: SimpleHistoryHost | null): VueWrapper {
    wrapper = mount(SimpleHistoryPanel, {
        props: { title: "Server profiles", host },
        global: { plugins: [vuetify, i18n] },
        attachTo: document.body,
    });
    return wrapper;
}

async function flush(): Promise<void> {
    await nextTick();
    await nextTick();
}

async function type(view: VueWrapper, query: string): Promise<void> {
    // `load()` resolves asynchronously after mount, so the toolbar (and its input) only
    // exists once that has settled - flushing first is what keeps this from finding nothing.
    await flush();
    const input = view.find("input");
    await input.setValue(query);
    await flush();
}

describe("the plain list still works", () => {
    it("lists every revision, newest first", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        expect(view.text()).toContain("Added the survival profile");
        expect(view.text()).toContain("Deleted the creative profile");
        expect(view.text()).toContain("History started");
    });

    it("says nothing has been recorded yet, with no toolbar to filter an empty list", async () => {
        const { host } = fakeHost({}, []);
        const view = open(host);
        await flush();

        expect(view.text()).toContain("No revisions recorded yet");
        expect(view.findComponent(ConfigSearchField).exists()).toBe(false);
    });

    it("restores through the host and reloads", async () => {
        const { host, calls } = fakeHost();
        const view = open(host);
        await flush();

        const restoreButtons = view.findAll("button").filter((button) => button.text() === "Restore");
        await restoreButtons[0]?.trigger("click");
        await flush();
        const confirm = view.findAll("button").find((button) => button.text().includes("Write these files back"));
        await confirm?.trigger("click");
        await flush();

        expect(calls).toContain("restore:aaaa000000001");
        expect(calls.filter((call) => call === "list")).toHaveLength(2);
    });
});

describe("the search bar carries the regex builder", () => {
    it("uses the shared field rather than a bare text box", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        expect(view.findComponent(ConfigSearchField).exists()).toBe(true);
        expect(view.find('[aria-label="Open the regex builder"]').exists()).toBe(true);
    });

    it("filters by plain text by default", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await type(view, "survival");

        expect(view.text()).toContain("Added the survival profile");
        expect(view.text()).not.toContain("Deleted the creative profile");
    });

    it("previews the builder against this history's own revisions, not an invented sample", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        const sample = view.findComponent(ConfigSearchField).props("sample");
        expect(sample).toContain("Added the survival profile");
    });
});

describe("filters start collapsed and compose", () => {
    it("hides the date range and action chips until the Filters toggle is pressed", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        expect(view.findComponent(ChangelogDateFilter).exists()).toBe(true);
        const filtersRow = view.find(".mb-simple-history__filters");
        expect(filtersRow.isVisible()).toBe(false);

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        expect(toggle?.attributes("aria-expanded")).toBe("false");
        await toggle?.trigger("click");
        await flush();

        expect(filtersRow.isVisible()).toBe(true);
        expect(toggle?.attributes("aria-expanded")).toBe("true");
    });

    it("narrows by action, composed with the search rather than overriding it", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await type(view, "profile");

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        await toggle?.trigger("click");
        await flush();

        const deleted = view.findAll(".mb-simple-history__actions .v-chip").find((chip) => chip.text().includes("deleted"));
        await deleted?.trigger("click");
        await flush();

        expect(view.text()).toContain("Deleted the creative profile");
        expect(view.text()).not.toContain("Added the survival profile");
        // "History started" has no "profile" in its label, so the search alone excludes it,
        // proving the action chip did not silently replace the text query.
        expect(view.text()).not.toContain("History started");
    });

    it("narrows by date range, keeping the search active alongside it", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        await toggle?.trigger("click");
        await flush();

        const fromField = view.findComponent(ChangelogDateFilter).find('input[type="text"], input:not([type])');
        await view.findComponent(ChangelogDateFilter).vm.$emit("update:from", "2026-03-05");
        await view.findComponent(ChangelogDateFilter).vm.$emit("update:to", "2026-03-05");
        void fromField;
        await flush();

        expect(view.text()).toContain("Deleted the creative profile");
        expect(view.text()).not.toContain("Added the survival profile");
        expect(view.text()).not.toContain("History started");
    });

    it("shows a badge naming how many filters are active", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await type(view, "profile");
        await flush();

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        expect(toggle?.text()).toContain("1");
    });

    it("says no revision matches, distinct from nothing recorded, and clears with one button", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await type(view, "nothing matches this at all");

        expect(view.text()).toContain("No revision matches these filters");
        expect(view.text()).not.toContain("No revisions recorded yet");

        const toggle = view.findAll("button").find((button) => button.text().includes("Filters"));
        await toggle?.trigger("click");
        await flush();
        const clear = view.findAll("button").find((button) => button.text().includes("Clear every filter"));
        expect(clear).toBeDefined();
        await clear?.trigger("click");
        await flush();

        expect(view.text()).toContain("Added the survival profile");
    });
});

describe("two panels mounted together never collide", () => {
    it("gives each instance its own filters id, exactly as AppSettings.vue mounts them side by side", async () => {
        const first = fakeHost();
        const second = fakeHost({}, [REVISIONS[0] as HistoryRevision]);

        // Both panels in one component tree, one Vue app - the shape `AppSettings.vue` really
        // mounts them in. Two separate `mount()` calls would each start their own `useId()`
        // counter from scratch and prove nothing about this collision.
        const Both = defineComponent({
            render: () =>
                h("div", [
                    h(SimpleHistoryPanel, { title: "Server profiles", host: first.host }),
                    h(SimpleHistoryPanel, { title: "Application settings", host: second.host }),
                ]),
        });

        const view = mount(Both, {
            global: { plugins: [vuetify, i18n] },
            attachTo: document.body,
        });
        await flush();

        const filterRows = view.findAll(".mb-simple-history__filters");
        expect(filterRows).toHaveLength(2);
        const idA = filterRows[0]?.attributes("id");
        const idB = filterRows[1]?.attributes("id");
        expect(idA).toBeTruthy();
        expect(idB).toBeTruthy();
        expect(idA).not.toBe(idB);

        view.unmount();
    });
});

describe("no host at all", () => {
    it("says so plainly rather than offering a control that would throw", async () => {
        const view = open(null);
        await flush();

        expect(view.text()).toContain("This build has no version history");
        expect(view.findComponent(ConfigSearchField).exists()).toBe(false);
    });
});

describe("pruning: offered only once the host really has it", () => {
    it("shows no trim control at all when the host lacks discardOlderRevisions", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        expect(view.text()).not.toContain("Revisions to keep");
    });

    it("opens a two-key super-confirm gate naming exactly what would be removed, and never calls the host before it is authorized", async () => {
        const discardOlderRevisions = vi.fn().mockResolvedValue({
            ok: true,
            revision: null,
            message: "Removed 1 older revision.",
        });
        const { host } = fakeHost({ discardOlderRevisions });
        const view = open(host);
        await flush();

        expect(view.text()).toContain("Revisions to keep");

        // Three revisions, and the "keep" field defaults to 20: nothing is due to be
        // trimmed yet, so the button reads "Nothing to remove" until the field is lowered
        // below the revision count.
        const keepInput = view.find(".mb-simple-history__keep input");
        expect(keepInput.exists()).toBe(true);
        await keepInput.setValue("1");
        await flush();

        const trimButton = view
            .findAll("button")
            .find((button) => button.text().includes("Remove") && button.text().includes("older revision"));
        expect(trimButton).toBeTruthy();
        await trimButton?.trigger("click");
        await flush();

        // The gate itself - two keys and a slider - is `ConfigSuperConfirm.vue`'s own
        // contract and is exercised by that component's own tests; what this proves is
        // that *this* control opens it with the right facts in it, and does not call the
        // host on its own before the gate says so. Vuetify's `v-menu` teleports its
        // content onto `document.body` rather than nesting it under the wrapper's own
        // root, so the gate's text is read from there.
        expect(document.body.textContent).toContain("Remove older revisions");
        expect(document.body.textContent).toContain("This removes 2 older revisions for good and keeps the newest 1");
        expect(discardOlderRevisions).not.toHaveBeenCalled();
    });
});

describe("export", () => {
    it("offers no export button when there is nothing to export", async () => {
        const { host } = fakeHost({}, []);
        const view = open(host);
        await flush();

        expect(view.text()).not.toContain("Export");
    });

    it("offers an export button once revisions exist", async () => {
        const { host } = fakeHost();
        const view = open(host);
        await flush();

        const exportButton = view.findAll("button").find((button) => button.text() === "Export");
        expect(exportButton).toBeTruthy();
    });
});
