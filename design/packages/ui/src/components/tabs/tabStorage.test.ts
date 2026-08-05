/**
 * The round trip, and the six things the contract says must survive it.
 *
 * Tab order, pinned order, groups, group order, collapsed state and membership
 * are asserted individually rather than by comparing two whole structures,
 * because a single `toEqual` on the strip passes just as happily when two of the
 * six are wrong in compensating ways, and says nothing useful when it fails.
 *
 * The rest of the file is about files this build did not write: an older
 * version's, a hand-edited one, a truncated one, and one from a browser that
 * refuses storage outright. Every one of them ends with the application running
 * on its defaults rather than throwing on launch.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import {
    addTab,
    createGroup,
    moveGroup,
    pinTab,
    setGroupCollapsed,
    setTabAppearance,
    setTabDirty,
    tabOrder,
    type TabStripState,
    type TabWorkspaceState,
} from "./tabModel.js";
import {
    DEFAULT_TAB_STORAGE_KEY,
    TAB_STORAGE_VERSION,
    readTabWorkspace,
    writeTabWorkspace,
    type TabStorage,
} from "./tabStorage.js";

/** A storage that is just a map, so a test never depends on a real localStorage. */
function memoryStorage(seed?: string): TabStorage & { readonly cells: Map<string, string> } {
    const cells = new Map<string, string>();
    if (seed !== undefined) cells.set("material-bluemap-tabs", seed);
    return {
        cells,
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => {
            cells.set(key, value);
        },
    };
}

const EMPTY: TabStripState = {
    id: "strip-main",
    label: "Main",
    windowId: "window-1",
    windowLabel: "Material BlueMap",
    tabs: [],
    groups: [],
    pinnedOrder: [],
    slots: [],
    activeTabId: null,
};

/** Pinned tab, two groups in a deliberate order, one of them collapsed. */
function saved(): TabWorkspaceState {
    let strip = ["map", "nether", "end", "settings", "notes"].reduce<TabStripState>(
        (state, id) => addTab(state, { id, pageId: id, label: id.toUpperCase() }),
        EMPTY,
    );
    strip = pinTab(strip, "map");
    strip = createGroup(strip, { id: "g-renders", name: "Renders", color: "tertiary" }, ["nether", "end"]);
    strip = createGroup(strip, { id: "g-admin", name: "Admin", color: "info" }, ["settings"]);
    strip = setGroupCollapsed(strip, "g-admin", true);
    strip = moveGroup(strip, "g-admin", -1);
    return { strips: [strip] };
}

function roundTrip(workspace: TabWorkspaceState): TabWorkspaceState | null {
    const storage = memoryStorage();
    writeTabWorkspace(workspace, storage);
    return readTabWorkspace(storage);
}

describe("what survives a restart", () => {
    const before = saved();
    const after = roundTrip(before);
    const strip = after?.strips[0];
    const original = before.strips[0] as TabStripState;

    it("restores the tabs themselves", () => {
        expect(strip?.tabs.map((tab) => tab.id).sort()).toEqual(["end", "map", "nether", "notes", "settings"]);
    });

    it("restores the left-to-right tab order", () => {
        expect(strip === undefined ? [] : tabOrder(strip).map((tab) => tab.id)).toEqual(
            tabOrder(original).map((tab) => tab.id),
        );
    });

    it("restores the pinned order", () => {
        expect(strip?.pinnedOrder).toEqual(["map"]);
    });

    it("restores group order, which the strip's slots carry", () => {
        expect(strip?.slots).toEqual(original.slots);
        expect(strip?.slots[0]).toEqual({ kind: "group", groupId: "g-admin" });
    });

    it("restores membership and the colour and name of each group", () => {
        expect(strip?.groups.find((group) => group.id === "g-renders")).toMatchObject({
            name: "Renders",
            color: "tertiary",
            tabIds: ["nether", "end"],
        });
    });

    it("restores the collapsed state, per group", () => {
        expect(strip?.groups.find((group) => group.id === "g-admin")?.collapsed).toBe(true);
        expect(strip?.groups.find((group) => group.id === "g-renders")?.collapsed).toBe(false);
    });

    it("restores which tab was active", () => {
        expect(strip?.activeTabId).toBe(original.activeTabId);
    });

    it("carries an appearance record through verbatim, without looking inside it", () => {
        const decorated: TabWorkspaceState = {
            strips: [setTabAppearance(original, "notes", { font: { family: "Roboto", axes: { wght: 620 } } })],
        };
        expect(roundTrip(decorated)?.strips[0]?.tabs.find((tab) => tab.id === "notes")?.appearance).toEqual({
            font: { family: "Roboto", axes: { wght: 620 } },
        });
    });
});

describe("what deliberately does not survive", () => {
    it("forgets that a tab held unsaved work, because it no longer does", () => {
        const dirty: TabWorkspaceState = { strips: [setTabDirty(saved().strips[0] as TabStripState, "notes", true)] };
        expect(roundTrip(dirty)?.strips[0]?.tabs.every((tab) => !tab.dirty)).toBe(true);
    });

    it("writes no search query or pattern at all", () => {
        const storage = memoryStorage();
        writeTabWorkspace(saved(), storage);
        const raw = storage.cells.get("material-bluemap-tabs") ?? "";
        expect(raw).not.toContain("query");
        expect(raw).not.toContain("pattern");
        expect(raw).not.toContain("flags");
    });
});

describe("files this build did not write", () => {
    it("refuses a version it does not understand rather than half-reading it", () => {
        const storage = memoryStorage(JSON.stringify({ version: TAB_STORAGE_VERSION + 1, strips: [] }));
        expect(readTabWorkspace(storage)).toBeNull();
    });

    it("returns null for nothing saved, so a caller can tell that from an empty strip", () => {
        expect(readTabWorkspace(memoryStorage())).toBeNull();
    });

    it("returns null for truncated JSON instead of throwing on launch", () => {
        expect(readTabWorkspace(memoryStorage('{"version":1,"strips":[{'))).toBeNull();
    });

    it("drops a tab with no id and repairs everything that pointed at it", () => {
        const storage = memoryStorage(
            JSON.stringify({
                version: TAB_STORAGE_VERSION,
                strips: [
                    {
                        id: "strip-main",
                        tabs: [{ id: "a", pageId: "map", label: "A" }, { pageId: "map", label: "nameless" }],
                        groups: [{ id: "g1", name: "One", tabIds: ["a", "ghost"] }],
                        pinnedOrder: ["ghost"],
                        slots: [{ kind: "group", groupId: "g1" }, { kind: "tab", tabId: "ghost" }],
                        activeTabId: "ghost",
                    },
                ],
            }),
        );
        const strip = readTabWorkspace(storage)?.strips[0];
        expect(strip?.tabs.map((tab) => tab.id)).toEqual(["a"]);
        expect(strip?.groups[0]?.tabIds).toEqual(["a"]);
        expect(strip?.pinnedOrder).toEqual([]);
        expect(strip?.activeTabId).toBe("a");
    });

    it("fills in the fields a hand-edited file left out", () => {
        const storage = memoryStorage(
            JSON.stringify({
                version: TAB_STORAGE_VERSION,
                strips: [{ id: "strip-main", tabs: [{ id: "a", pageId: "map" }] }],
            }),
        );
        const strip = readTabWorkspace(storage)?.strips[0];
        expect(strip?.label).toBe("strip-main");
        expect(strip?.windowId).toBe("main");
        expect(strip?.tabs[0]).toMatchObject({ label: "a", icon: null, dirty: false, appearance: null });
        expect(strip?.slots).toEqual([{ kind: "tab", tabId: "a" }]);
    });

    it("refuses a strip with no tabs, so it cannot shadow the defaults", () => {
        const storage = memoryStorage(
            JSON.stringify({ version: TAB_STORAGE_VERSION, strips: [{ id: "strip-main", tabs: [] }] }),
        );
        expect(readTabWorkspace(storage)).toBeNull();
    });
});

describe("storage that refuses", () => {
    it("reads the default and writes nothing when there is no storage at all", () => {
        expect(readTabWorkspace(null)).toBeNull();
        expect(() => {
            writeTabWorkspace(saved(), null);
        }).not.toThrow();
    });

    it("swallows a quota failure, because a remembered layout is not worth a toast", () => {
        const throwing: TabStorage = {
            getItem: () => {
                throw new Error("blocked");
            },
            setItem: () => {
                throw new Error("quota");
            },
        };
        expect(readTabWorkspace(throwing)).toBeNull();
        expect(() => {
            writeTabWorkspace(saved(), throwing);
        }).not.toThrow();
    });
});

describe("mirroring into the application-settings history", () => {
    beforeEach(() => {
        vi.mocked(recordAppSetting).mockClear();
    });

    it("mirrors the workspace under tabs.<storage key>, for the default key", () => {
        const workspace = saved();
        writeTabWorkspace(workspace, memoryStorage());
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith(`tabs.${DEFAULT_TAB_STORAGE_KEY}`, workspace);
    });

    it("namespaces a second tab strip under its own key, so the two cannot collide", () => {
        const workspace = saved();
        writeTabWorkspace(workspace, memoryStorage(), "material-bluemap-settings-tabs");
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith("tabs.material-bluemap-settings-tabs", workspace);
    });

    it("still mirrors when there is no local storage to write to at all", () => {
        const workspace = saved();
        writeTabWorkspace(workspace, null);
        expect(recordAppSetting).toHaveBeenCalledTimes(1);
        expect(recordAppSetting).toHaveBeenCalledWith(`tabs.${DEFAULT_TAB_STORAGE_KEY}`, workspace);
    });
});
