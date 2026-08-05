/**
 * `remoteRecency.ts`'s own contract: last-used ordering, mirrored into application-settings
 * history the same way `remoteTargets.ts` mirrors the machines list, never touching the
 * target's own validated shape.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/appSettingsHistorySync.js", () => ({ recordAppSetting: vi.fn() }));
import { recordAppSetting } from "../../stores/appSettingsHistorySync.js";

import { loadRecency, orderByRecency, recordUsed, type RecencyMap } from "./remoteRecency.js";
import type { RemoteTarget } from "./remoteBridge.js";
import type { TargetStorage } from "./remoteTargets.js";

function memoryStorage(seed: Record<string, string> = {}): TargetStorage & { cells: Map<string, string> } {
    const cells = new Map(Object.entries(seed));
    return {
        cells,
        getItem: (key) => cells.get(key) ?? null,
        setItem: (key, value) => void cells.set(key, value),
    };
}

function target(id: string, host: string): RemoteTarget {
    return {
        id,
        label: host,
        host,
        port: 22,
        user: "renderer",
        identityFile: null,
        workDir: "~/.material-bluemap/renders",
        image: "",
        docker: "docker",
        keepRemoteFiles: false,
    };
}

beforeEach(() => {
    vi.mocked(recordAppSetting).mockClear();
});

describe("loading the stored map", () => {
    it("answers empty rather than throwing on no storage, rubbish, or the wrong shape", () => {
        expect(loadRecency(null)).toEqual({});
        expect(loadRecency(memoryStorage({ "material-bluemap-remote-target-recency": "{{{" }))).toEqual({});
        expect(loadRecency(memoryStorage({ "material-bluemap-remote-target-recency": "[1,2,3]" }))).toEqual({});
    });

    it("keeps only the entries that are really finite numbers", () => {
        const storage = memoryStorage({
            "material-bluemap-remote-target-recency": JSON.stringify({
                "t-1": 1000,
                "t-2": "not a number",
                "t-3": Number.NaN,
            }),
        });
        expect(loadRecency(storage)).toEqual({ "t-1": 1000 });
    });
});

describe("recording a use", () => {
    it("writes the current time under the machine's id, and mirrors it into history", () => {
        const storage = memoryStorage();
        const before = Date.now();

        const map = recordUsed("t-1", storage);

        expect(map["t-1"]).toBeGreaterThanOrEqual(before);
        expect(loadRecency(storage)).toEqual(map);
        expect(recordAppSetting).toHaveBeenCalledWith("remoteTargetRecency", map);
    });

    it("only touches the one id it was asked about", () => {
        const storage = memoryStorage();
        const first = recordUsed("t-1", storage);
        const second = recordUsed("t-2", storage, first);

        expect(second["t-1"]).toBe(first["t-1"]);
        expect(second["t-2"]).toBeGreaterThanOrEqual(first["t-1"] as number);
    });

    it("never throws when storage refuses to persist", () => {
        const refusing: TargetStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error("quota exceeded");
            },
        };
        expect(() => recordUsed("t-1", refusing)).not.toThrow();
    });
});

describe("ordering machines by recency", () => {
    const a = target("t-1", "a.lan");
    const b = target("t-2", "b.lan");
    const c = target("t-3", "c.lan");

    it("puts the most recently used machine first", () => {
        const recency: RecencyMap = { "t-1": 100, "t-2": 300 };
        expect(orderByRecency([a, b, c], recency).map((t) => t.id)).toEqual(["t-2", "t-1", "t-3"]);
    });

    it("leaves never-used machines after every used one, in their original order", () => {
        const recency: RecencyMap = { "t-3": 100 };
        expect(orderByRecency([a, b, c], recency).map((t) => t.id)).toEqual(["t-3", "t-1", "t-2"]);
    });

    it("changes nothing when nothing has ever been used", () => {
        expect(orderByRecency([a, b, c], {}).map((t) => t.id)).toEqual(["t-1", "t-2", "t-3"]);
    });

    it("is unbothered by a recency entry for a machine that was since forgotten", () => {
        const recency: RecencyMap = { "t-1": 100, "gone": 9_999_999 };
        expect(orderByRecency([b, c], recency).map((t) => t.id)).toEqual(["t-2", "t-3"]);
    });
});
