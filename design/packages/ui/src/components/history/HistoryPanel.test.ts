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
    HistoryCompareResult,
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

/* -------------------------------------------------------------------------- */
/* The wider panel                                                            */
/* -------------------------------------------------------------------------- */

/** The two config files the comparing host has, at two moments. */
const OLD_CORE = 'accept-download: false\ndata: "bluemap"\n';
const NEW_CORE = 'accept-download: true\ndata: "bluemap"\n';

/**
 * A host that can also compare and restore selectively.
 *
 * Separate from {@link fakeHost} on purpose rather than folded into it: the panel has to
 * work against both, and the difference between the two is exactly what the degradation
 * tests below assert. A single host carrying every method would make "a shell that predates
 * these still works" untestable.
 */
function comparingHost(overrides: Partial<HistoryHost> = {}): Recorded {
    const base = fakeHost();
    const calls = base.calls;

    const host: HistoryHost = {
        ...base.host,
        revisionFiles: (_folder, id) => {
            calls.push(`files:${id}`);
            return Promise.resolve({
                ok: true,
                files: [{ path: "core.conf", text: id === "cccc000000003" ? OLD_CORE : NEW_CORE }],
            });
        },
        compare: (_folder, from, to) => {
            calls.push(`compare:${from ?? "parent"}:${to}`);
            return Promise.resolve<HistoryCompareResult>({
                ok: true,
                from,
                to,
                files: [
                    {
                        path: "core.conf",
                        status: "modified",
                        patch: "--- a/core.conf\n+++ b/core.conf\n-accept-download: false\n+accept-download: true\n",
                        before: OLD_CORE,
                        after: NEW_CORE,
                        withheld: null,
                    },
                ],
            });
        },
        restoreFiles: (_folder, id, paths) => {
            calls.push(`restoreFiles:${id}:${paths.join(",")}`);
            return Promise.resolve<HistoryRestoreResult>({
                ok: true,
                revision: null,
                message: "Put core.conf back",
                skipped: [],
            });
        },
        restoreSettings: (_folder, id, files, keys) => {
            calls.push(`restoreSettings:${id}:${keys.join(",")}:${files[0]?.text ?? ""}`);
            return Promise.resolve<HistoryRestoreResult>({
                ok: true,
                revision: null,
                message: "Put accept-download back",
                skipped: [],
            });
        },
        ...overrides,
    };

    return { host, calls };
}

function row(view: VueWrapper, id: string) {
    return view.find(`[data-revision="${id}"]`);
}

/** The A or B button of one row, found by the accessible name it actually carries. */
function pickButton(view: VueWrapper, id: string, end: "older" | "newer") {
    return view
        .findAll(`[data-revision="${id}"] button`)
        .find((button) => (button.attributes("aria-label") ?? "").includes(`the ${end} end`));
}

describe("comparing any two revisions, which is what a parent-only diff could never do", () => {
    it("offers A and B on every row when the host can compare, and neither when it cannot", async () => {
        const plain = await settled(fakeHost().host);
        // The base host has no `compare`, so no row promises a comparison it cannot perform.
        expect(pickButton(plain, "aaaa000000001", "older")).toBeUndefined();

        wrapper?.unmount();
        const rich = await settled(comparingHost().host);
        expect(pickButton(rich, "aaaa000000001", "older")).toBeDefined();
        expect(pickButton(rich, "aaaa000000001", "newer")).toBeDefined();
    });

    it("compares the two chosen ends, however far apart they are in the list", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        // Pressed rather than emitted, so the buttons themselves are proved to be wired.
        await pickButton(view, "cccc000000003", "older")?.trigger("click");
        await nextTick();
        await pickButton(view, "aaaa000000001", "newer")?.trigger("click");
        await nextTick();
        await Promise.resolve();
        await nextTick();

        // Two revisions apart, in one call, which is the whole point.
        expect(calls).toContain("compare:cccc000000003:aaaa000000001");
        expect(view.findComponent({ name: "HistoryComparison" }).exists()).toBe(true);
        expect(pickButton(view, "cccc000000003", "older")?.attributes("aria-pressed")).toBe("true");
    });

    it("says what changed as a setting, not as a pair of patch lines", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        rows[2]?.vm.$emit("pick", "cccc000000003", "a");
        rows[0]?.vm.$emit("pick", "aaaa000000001", "b");
        await nextTick();
        await Promise.resolve();
        await nextTick();
        await nextTick();

        const text = view.findComponent({ name: "HistoryComparison" }).text();
        expect(text).toContain("accept-download");
        expect(text).toContain("false");
        expect(text).toContain("true");
        // And `data` did not change, so it is not in the list at all.
        expect(text).not.toContain("bluemap");
    });

    it("keeps the raw patch, behind a disclosure rather than in the reader's face", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        rows[2]?.vm.$emit("pick", "cccc000000003", "a");
        rows[0]?.vm.$emit("pick", "aaaa000000001", "b");
        await nextTick();
        await Promise.resolve();
        await nextTick();
        await nextTick();

        const details = view.findComponent({ name: "HistoryComparison" }).find("details");
        expect(details.exists()).toBe(true);
        expect(details.text()).toContain("+accept-download: true");
    });

    it("swaps the two ends rather than making somebody unpick them", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        rows[2]?.vm.$emit("pick", "cccc000000003", "a");
        rows[0]?.vm.$emit("pick", "aaaa000000001", "b");
        await nextTick();
        await Promise.resolve();

        view.findComponent({ name: "HistoryComparison" }).vm.$emit("swap");
        await nextTick();
        await Promise.resolve();

        expect(calls).toContain("compare:aaaa000000001:cccc000000003");
    });

    it("never compares a revision with itself", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        rows[0]?.vm.$emit("pick", "aaaa000000001", "a");
        await nextTick();
        // Choosing the same revision as the other end swaps them rather than making one
        // revision both ends, which would compare a moment with itself and report nothing.
        rows[0]?.vm.$emit("pick", "aaaa000000001", "b");
        await nextTick();
        await Promise.resolve();

        expect(calls.filter((call) => call.startsWith("compare:"))).toEqual([]);
        expect(view.findComponent({ name: "HistoryComparison" }).props("from")).toBeNull();
    });

    it("closes the comparison without disturbing the list behind it", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        rows[2]?.vm.$emit("pick", "cccc000000003", "a");
        await nextTick();
        expect(view.findComponent({ name: "HistoryComparison" }).exists()).toBe(true);

        view.findComponent({ name: "HistoryComparison" }).vm.$emit("close");
        await nextTick();

        expect(view.findComponent({ name: "HistoryComparison" }).exists()).toBe(false);
        expect(view.findAllComponents({ name: "HistoryRevisionRow" })).toHaveLength(3);
    });
});

describe("a restore can be one file or one setting, not only the whole folder", () => {
    it("asks the host to put back exactly the one file", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        view.findAllComponents({ name: "HistoryRevisionRow" })[0]?.vm.$emit(
            "restoreFile",
            "aaaa000000001",
            "core.conf",
        );
        await nextTick();
        await Promise.resolve();

        expect(calls).toContain("restoreFiles:aaaa000000001:core.conf");
    });

    it("merges one setting into the file as it is now, and sends the merged text", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        // `cccc000000003` is the revision whose core.conf still says false; the newest one
        // says true. Putting the one setting back has to produce false with everything else
        // left alone.
        view.findAllComponents({ name: "HistoryRevisionRow" })[2]?.vm.$emit(
            "restoreSetting",
            "cccc000000003",
            "core.conf",
            "accept-download",
        );
        await nextTick();
        await Promise.resolve();
        await nextTick();
        await Promise.resolve();
        await nextTick();

        const sent = calls.find((call) => call.startsWith("restoreSettings:"));
        expect(sent).toBeDefined();
        expect(sent).toContain("accept-download");
        expect(sent).toContain("accept-download: false");
        // The neighbouring setting rode along untouched rather than being reset.
        expect(sent).toContain('data: "bluemap"');
    });

    it("restores back to A from a comparison, never to the newer end", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        await pickButton(view, "cccc000000003", "older")?.trigger("click");
        await pickButton(view, "aaaa000000001", "newer")?.trigger("click");
        await nextTick();
        await Promise.resolve();
        await nextTick();

        view.findComponent({ name: "HistoryComparison" }).vm.$emit("restoreFile", "core.conf");
        await nextTick();
        await Promise.resolve();

        // B is the newer end and usually half of what is on disk already, so "put this back"
        // can only sensibly mean "return it to how A had it".
        expect(calls).toContain("restoreFiles:cccc000000003:core.conf");
    });

    it("names the value the button will really apply, which differs by where it sits", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        await row(view, "aaaa000000001").trigger("keydown", { key: "Enter" });
        await nextTick();
        await Promise.resolve();
        await nextTick();
        await nextTick();

        // The row shows what this revision did and restores *to* it, so the value named is
        // the newer one. A button promising the wrong one of two similar values looks
        // precise and is wrong, which is worse than promising nothing.
        const inRow = view
            .findAll('[data-revision="aaaa000000001"] button')
            .find((button) => (button.attributes("aria-label") ?? "").includes("Put accept-download back"));
        expect(inRow?.attributes("aria-label")).toContain("back to true");
        expect(inRow?.attributes("aria-label")).toContain("aaaa00000000");
    });

    it("offers no selective restore at all when the host cannot perform one", async () => {
        const { host } = fakeHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        expect(rows[0]?.props("selective")).toBe(false);
    });
});

describe("the list is walkable with the keyboard and audible to a screen reader", () => {
    it("gives exactly one row a tab stop and moves it with the arrow keys", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const stops = view.findAll("[data-revision]").map((element) => element.attributes("tabindex"));
        // A two-hundred-row history must not be two hundred tab stops between the search
        // field and the retention control.
        expect(stops.filter((value) => value === "0")).toHaveLength(1);
        expect(row(view, "aaaa000000001").attributes("tabindex")).toBe("0");

        await row(view, "aaaa000000001").trigger("keydown", { key: "ArrowDown" });
        await nextTick();

        expect(row(view, "bbbb000000002").attributes("tabindex")).toBe("0");
        expect(row(view, "aaaa000000001").attributes("tabindex")).toBe("-1");
    });

    it("jumps to the ends with Home and End, and stops rather than wrapping", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        await row(view, "aaaa000000001").trigger("keydown", { key: "End" });
        await nextTick();
        expect(row(view, "cccc000000003").attributes("tabindex")).toBe("0");

        await row(view, "cccc000000003").trigger("keydown", { key: "ArrowDown" });
        await nextTick();
        expect(row(view, "cccc000000003").attributes("tabindex")).toBe("0");

        await row(view, "cccc000000003").trigger("keydown", { key: "Home" });
        await nextTick();
        expect(row(view, "aaaa000000001").attributes("tabindex")).toBe("0");
    });

    it("opens a revision with Enter", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        await row(view, "aaaa000000001").trigger("keydown", { key: "Enter" });
        await nextTick();
        await Promise.resolve();

        expect(calls.some((call) => call.startsWith("compare:parent:aaaa000000001"))).toBe(true);
    });

    it("chooses the two comparison ends with A and B, and drops them with Escape", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        await row(view, "cccc000000003").trigger("keydown", { key: "a" });
        await nextTick();
        await row(view, "aaaa000000001").trigger("keydown", { key: "b" });
        await nextTick();
        await Promise.resolve();

        expect(calls).toContain("compare:cccc000000003:aaaa000000001");

        await row(view, "aaaa000000001").trigger("keydown", { key: "Escape" });
        await nextTick();
        expect(view.findComponent({ name: "HistoryComparison" }).exists()).toBe(false);
    });

    it("ignores a keystroke that came from a control inside a row, not from the row", async () => {
        const { host, calls } = comparingHost();
        const view = await settled(host);

        // Typing the letter `a` into the label field must not choose that row as the older
        // end of a comparison, which is what a handler that ignored the event's target would
        // do.
        const button = view.find('[data-revision="aaaa000000001"] button');
        await button.trigger("keydown", { key: "a" });
        await nextTick();

        expect(calls.filter((call) => call.startsWith("compare:"))).toEqual([]);
    });

    it("carries a live region that says what the keyboard just did", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const region = view.find(".mb-history__announce");
        expect(region.exists()).toBe(true);
        expect(region.attributes("role")).toBe("status");
        expect(region.attributes("aria-live")).toBe("polite");

        await row(view, "aaaa000000001").trigger("keydown", { key: "ArrowDown" });
        await nextTick();

        // "2 of 3. Added the nether map" - position and identity, because the highlight that
        // says both on screen says neither out loud.
        expect(view.find(".mb-history__announce").text()).toContain("2 of 3");
    });

    it("names the whole row in one sentence rather than leaving four chips to be guessed at", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const label = row(view, "aaaa000000001").attributes("aria-label") ?? "";
        expect(label).toContain("Deleted the nether map");
        expect(label).toContain("On disk now");
        expect(row(view, "aaaa000000001").attributes("aria-current")).toBe("true");
        expect(row(view, "bbbb000000002").attributes("aria-current")).toBeUndefined();
    });
});

describe("the timeline groups a long history into days", () => {
    it("draws one heading per day, with what that day amounts to", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const headings = view.findAll(".mb-history__dayHead");
        // Three revisions on three separate days in the fixture.
        expect(headings).toHaveLength(3);
        expect(headings[0]?.text()).toContain("1 revisions");
    });

    it("marks the day holding what is on disk now, and only that day", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        const marked = view.findAll(".mb-history__dayHead").filter((head) => head.text().includes("on disk now"));
        expect(marked).toHaveLength(1);
    });

    it("marks nothing as live when a filter has hidden the live revision", async () => {
        const { host } = comparingHost();
        const view = await settled(host);

        // "core" matches only the two revisions that are not the newest one.
        await view.findComponent({ name: "ConfigSearchField" }).vm.$emit("update:modelValue", "core.conf");
        await nextTick();

        const marked = view.findAll(".mb-history__dayHead").filter((head) => head.text().includes("on disk now"));
        expect(marked).toHaveLength(0);
    });
});

describe("a shell that predates the newer channels still keeps a history", () => {
    it("falls back to the plain diff and shows the raw patch", async () => {
        const { host, calls } = fakeHost();
        const view = await settled(host);

        const expander = view.find('[aria-controls="mb-history-detail-aaaa00000000"]');
        await expander.trigger("click");
        await nextTick();
        await Promise.resolve();
        await nextTick();

        expect(calls).toContain("diff:aaaa000000001");
        // No setting-level reading is possible without both sides' text, so the honest
        // answer is the patch, and it is there.
        expect(view.text()).toContain("maps/nether.conf");
    });

    it("offers no comparison surface at all rather than one that cannot be filled", async () => {
        const { host } = fakeHost();
        const view = await settled(host);

        const rows = view.findAllComponents({ name: "HistoryRevisionRow" });
        expect(rows[0]?.props("comparable")).toBe(false);
        expect(view.findComponent({ name: "HistoryComparison" }).exists()).toBe(false);
    });
});
