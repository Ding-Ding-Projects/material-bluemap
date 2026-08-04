// @vitest-environment jsdom

/**
 * The history panel, mounted.
 *
 * Everything asserted here is a property of the rendered component rather than of the model
 * next door, which has its own tests. The four that matter most:
 *
 *  - **Every control does the thing it looks like it does.** A panel of buttons that render
 *    and emit nothing is the exact failure this project keeps finding, so Record now, the
 *    expander, Restore and the label field are each pressed and each has to reach the host.
 *  - **Restore asks twice.** One click arms it, the second performs it. A single click that
 *    rewrites files on disk from a list of forty rows is a slip nobody recovers gracefully
 *    from, even when it is undoable.
 *  - **A missing history is a sentence, not a dead panel.** Both shapes are covered: no
 *    bridge at all, and a bridge whose machine has no git.
 *  - **The diff is fetched on expand and not before.** Otherwise a four-hundred-revision
 *    history runs four hundred `git diff` calls to draw a list nobody scrolled to.
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import { createI18n } from "vue-i18n";
import { createVuetify } from "vuetify";

import HistoryPanel from "./HistoryPanel.vue";
import type {
    HistoryDiffResult,
    HistoryHost,
    HistoryListing,
    HistoryRestoreResult,
    HistoryRevision,
    HistoryStatus,
    HistoryWrite,
} from "./historyHost.js";

beforeAll(() => {
    // jsdom has no layout engine; Vuetify's overlays and fields observe both of these and the
    // mount throws before any assertion runs without them.
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

const FOLDER = "/srv/bluemap/config";

function revision(partial: Partial<HistoryRevision> & { id: string }): HistoryRevision {
    return {
        shortId: partial.id.slice(0, 12),
        at: "2026-03-04T10:00:00",
        label: "Changed the core settings",
        action: "changed",
        changes: [{ path: "core.conf", status: "modified" }],
        note: null,
        restoredFrom: null,
        ...partial,
    };
}

const REVISIONS: HistoryRevision[] = [
    revision({
        id: "aaaa000000001",
        at: "2026-03-10T09:00:00",
        label: "Deleted the nether map",
        action: "deleted",
        changes: [{ path: "maps/nether.conf", status: "deleted" }],
    }),
    revision({ id: "bbbb000000002", at: "2026-03-05T09:00:00", label: "Added the nether map", action: "created" }),
    revision({ id: "cccc000000003", at: "2026-03-01T09:00:00" }),
];

interface Recorded {
    readonly host: HistoryHost;
    readonly calls: string[];
}

/** A host that records what it was asked, so a control can be proved to have reached it. */
function fakeHost(overrides: Partial<HistoryHost> = {}): Recorded {
    const calls: string[] = [];
    const listing: HistoryListing = {
        available: true,
        reason: null,
        folder: FOLDER,
        repository: "/data/config-history/config-abc123",
        revisions: REVISIONS,
        remotes: [],
    };
    const status: HistoryStatus = {
        available: true,
        version: "2.45.1",
        reason: null,
        root: "/data/config-history",
    };

    const host: HistoryHost = {
        name: "test",
        status: () => {
            calls.push("status");
            return Promise.resolve(status);
        },
        list: () => {
            calls.push("list");
            return Promise.resolve(listing);
        },
        snapshot: () => {
            calls.push("snapshot");
            return Promise.resolve<HistoryWrite>({
                ok: true,
                revision: REVISIONS[0] ?? null,
                message: "Deleted the nether map",
            });
        },
        revisionFiles: () => Promise.resolve({ ok: true, files: [] }),
        diff: (_folder, id) => {
            calls.push(`diff:${id}`);
            return Promise.resolve<HistoryDiffResult>({
                ok: true,
                files: [
                    {
                        path: "maps/nether.conf",
                        status: "deleted",
                        patch: "--- a/maps/nether.conf\n+++ /dev/null\n-world: \"world\"\n",
                    },
                ],
            });
        },
        restore: (_folder, id) => {
            calls.push(`restore:${id}`);
            return Promise.resolve<HistoryRestoreResult>({
                ok: true,
                revision: REVISIONS[0] ?? null,
                message: "Restored",
                skipped: [],
            });
        },
        label: (_folder, id, text) => {
            calls.push(`label:${id}:${text}`);
            return Promise.resolve<HistoryWrite>({ ok: true, revision: null, message: "Labelled" });
        },
        discardOlderRevisions: (_folder, keep) => {
            calls.push(`discard:${String(keep)}`);
            return Promise.resolve<HistoryWrite>({ ok: true, revision: null, message: "Trimmed" });
        },
        ...overrides,
    };

    return { host, calls };
}

let wrapper: VueWrapper | null = null;

function render(host: HistoryHost | null): VueWrapper {
    const i18n = createI18n({
        legacy: false,
        locale: "none",
        fallbackLocale: "none",
        silentFallbackWarn: true,
        messages: {},
    });
    wrapper = mount(HistoryPanel, {
        props: { folder: FOLDER, host },
        global: { plugins: [i18n, createVuetify()] },
    });
    return wrapper;
}

/** Mount and let the initial status/list round trip settle. */
async function settled(host: HistoryHost | null): Promise<VueWrapper> {
    const view = render(host);
    await nextTick();
    await Promise.resolve();
    await nextTick();
    await nextTick();
    return view;
}

function buttonSaying(view: VueWrapper, text: string) {
    return view.findAll("button").find((button) => button.text().includes(text));
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    vi.restoreAllMocks();
});

/* -------------------------------------------------------------------------- */

describe("the panel shows the history it was given", () => {
    it("lists every revision by its label, not by a generic word", async () => {
        const { host } = fakeHost();
        const view = await settled(host);

        expect(view.text()).toContain("Deleted the nether map");
        expect(view.text()).toContain("Added the nether map");
        expect(view.text()).toContain("Changed the core settings");
        expect(view.text()).not.toContain("Updated\n");
    });

    it("says where the repository is, so nobody has to trust that it is not in their folder", async () => {
        const { host } = fakeHost();
        const view = await settled(host);
        expect(view.text()).toContain("/data/config-history/config-abc123");
    });

    it("states that the history stays on this machine, from the remote list rather than from hope", async () => {
        const { host } = fakeHost();
        const view = await settled(host);
        expect(view.text()).toContain("stays on this machine");
    });

    it("offers an action chip per action present, each with its count", async () => {
        const { host } = fakeHost();
        const view = await settled(host);

        await (buttonSaying(view, "Filters") as { trigger: (event: string) => Promise<void> }).trigger("click");
        await nextTick();

        const chips = view.findAll(".mb-history__actions .v-chip").map((chip) => chip.text());
        expect(chips.some((text) => text.includes("created"))).toBe(true);
        expect(chips.some((text) => text.includes("deleted"))).toBe(true);
        expect(chips.some((text) => text.includes("changed"))).toBe(true);
        // Nothing here was restored, so no chip promises restores to find.
        expect(chips.some((text) => text.includes("restored"))).toBe(false);
    });
});

describe("every control does what it looks like it does", () => {
    it("records a snapshot when Record now is pressed", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        await (buttonSaying(view, "Record now") as { trigger: (event: string) => Promise<void> }).trigger("click");
        await nextTick();

        expect(calls).toContain("snapshot");
    });

    it("fetches a diff when a revision is expanded, and not before", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        expect(calls.filter((call) => call.startsWith("diff:"))).toEqual([]);

        const expander = view.find('[aria-controls="mb-history-detail-aaaa00000000"]');
        expect(expander.exists()).toBe(true);
        expect(expander.attributes("aria-expanded")).toBe("false");

        await expander.trigger("click");
        await nextTick();
        await Promise.resolve();
        await nextTick();

        expect(calls).toContain("diff:aaaa000000001");
        expect(view.find('[aria-controls="mb-history-detail-aaaa00000000"]').attributes("aria-expanded")).toBe(
            "true",
        );
        expect(view.text()).toContain("maps/nether.conf");
    });

    it("asks a second time before writing a revision back over the folder", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        const restore = buttonSaying(view, "Restore");
        expect(restore).toBeDefined();
        await (restore as { trigger: (event: string) => Promise<void> }).trigger("click");
        await nextTick();

        // Armed, not fired. This is the whole point of the two steps.
        expect(calls.filter((call) => call.startsWith("restore:"))).toEqual([]);

        const confirm = buttonSaying(view, "Write these files back");
        expect(confirm).toBeDefined();
        await (confirm as { trigger: (event: string) => Promise<void> }).trigger("click");
        await nextTick();

        expect(calls).toContain("restore:aaaa000000001");
    });

    it("lets the confirm be taken back without restoring anything", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        await (buttonSaying(view, "Restore") as { trigger: (event: string) => Promise<void> }).trigger("click");
        await nextTick();
        await (buttonSaying(view, "Keep what is there") as { trigger: (event: string) => Promise<void> }).trigger(
            "click",
        );
        await nextTick();

        expect(calls.filter((call) => call.startsWith("restore:"))).toEqual([]);
        expect(buttonSaying(view, "Restore")).toBeDefined();
    });

    it("writes a label through the host, in the user's own words", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        const row = view.findComponent({ name: "HistoryRevisionRow" });
        row.vm.$emit("label", "aaaa000000001", "before the server move");
        await nextTick();

        expect(calls).toContain("label:aaaa000000001:before the server move");
    });
});

describe("filtering happens in the component, not only in the model", () => {
    it("removes rows the search does not match", async () => {
        const { host } = fakeHost();
        const view = await settled(host);

        await view.findComponent({ name: "ConfigSearchField" }).vm.$emit("update:modelValue", "nether");
        await nextTick();

        expect(view.text()).toContain("Deleted the nether map");
        expect(view.text()).not.toContain("Changed the core settings");
    });

    it("says plainly when a filter matched nothing, rather than showing an empty box", async () => {
        const { host } = fakeHost();
        const view = await settled(host);

        await view.findComponent({ name: "ConfigSearchField" }).vm.$emit("update:modelValue", "zzzz-nothing");
        await nextTick();

        expect(view.text()).toContain("No revision matches these filters");
    });
});

describe("a history that cannot be kept is a sentence, not a dead panel", () => {
    it("says so when there is no bridge at all", async () => {
        const view = await settled(null);
        expect(view.text()).toContain("no version history");
        // And it offers no control it could not honour.
        expect(buttonSaying(view, "Record now")).toBeUndefined();
    });

    it("repeats the main process's own reason when git is missing from the machine", async () => {
        const { host } = fakeHost({
            status: () =>
                Promise.resolve<HistoryStatus>({
                    available: false,
                    version: null,
                    reason: "Git is not installed on this machine, so the editor cannot keep a version history.",
                    root: "/data/config-history",
                }),
            list: () =>
                Promise.resolve<HistoryListing>({
                    available: false,
                    reason: "Git is not installed on this machine, so the editor cannot keep a version history.",
                    folder: FOLDER,
                    repository: "",
                    revisions: [],
                    remotes: [],
                }),
        });

        const view = await settled(host);
        expect(view.text()).toContain("Git is not installed on this machine");
        expect(buttonSaying(view, "Record now")).toBeUndefined();
    });

    it("says the folder has nothing recorded yet, and how to record the first thing", async () => {
        const { host } = fakeHost({
            list: () =>
                Promise.resolve<HistoryListing>({
                    available: true,
                    reason: null,
                    folder: FOLDER,
                    repository: "/data/config-history/config-abc123",
                    revisions: [],
                    remotes: [],
                }),
        });

        const view = await settled(host);
        expect(view.text()).toContain("Nothing has been recorded for this folder yet");
        expect(buttonSaying(view, "Record now")).toBeDefined();
    });
});

describe("trimming a history is behind the gate, and nothing else is", () => {
    it("puts the two-key gate in front of the one control that removes revisions", async () => {
        const { host } = fakeHost();
        const view = await settled(host);
        expect(view.findComponent({ name: "ConfigSuperConfirm" }).exists()).toBe(true);
    });

    it("removes nothing until the gate says so", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        const trim = view.findAll("button").find((button) => button.text().includes("Remove"));
        await (trim as { trigger: (event: string) => Promise<void> })?.trigger("click");
        await nextTick();

        // Opening the gate is not authorizing it. Only the gate's own completion is.
        expect(calls.filter((call) => call.startsWith("discard:"))).toEqual([]);
    });

    it("asks the host to keep exactly what the retention control says", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        view.findComponent({ name: "ConfigSuperConfirm" }).vm.$emit("confirm");
        await nextTick();

        expect(calls).toContain("discard:50");
    });
});
