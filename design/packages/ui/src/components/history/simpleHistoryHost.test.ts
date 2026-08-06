/**
 * The probing itself, proven directly rather than only through whichever mutation site
 * happens to call it. `simpleHistoryHostFrom` already had real callers before this file
 * existed (`AppSettings.vue`); `simpleHistorySaveFn` and `simpleHistoryReadFn` are new, and
 * every fire-and-forget call site that uses them (`stores/profiles.ts`) is only as honest
 * as the "answer null rather than throw" contract this file checks directly.
 */

import { describe, expect, it, vi } from "vitest";
import { simpleHistoryHostFrom, simpleHistoryReadFn, simpleHistorySaveFn } from "./simpleHistoryHost.js";

describe("simpleHistoryHostFrom", () => {
    it("returns null for a bridge that is not an object", () => {
        expect(simpleHistoryHostFrom(null, "profilesHistory")).toBeNull();
        expect(simpleHistoryHostFrom(undefined, "profilesHistory")).toBeNull();
        expect(simpleHistoryHostFrom("not an object", "profilesHistory")).toBeNull();
    });

    it("returns null when the named namespace is absent", () => {
        expect(simpleHistoryHostFrom({}, "profilesHistory")).toBeNull();
    });

    it("returns null when the namespace has list but not restore, or the reverse", () => {
        expect(simpleHistoryHostFrom({ profilesHistory: { list: vi.fn() } }, "profilesHistory")).toBeNull();
        expect(simpleHistoryHostFrom({ profilesHistory: { restore: vi.fn() } }, "profilesHistory")).toBeNull();
    });

    it("returns a working host once both list and restore are functions", async () => {
        const list = vi.fn().mockResolvedValue({ available: true, reason: null, repository: "r", revisions: [], remotes: [] });
        const restore = vi.fn().mockResolvedValue({ ok: true });
        const host = simpleHistoryHostFrom({ profilesHistory: { list, restore } }, "profilesHistory");

        expect(host).not.toBeNull();
        await host?.list(5);
        expect(list).toHaveBeenCalledWith(5);
        await host?.restore("abc123");
        expect(restore).toHaveBeenCalledWith("abc123");
    });

    it("leaves discardOlderRevisions off the host when the bridge does not have it - list and restore alone still mount", () => {
        const host = simpleHistoryHostFrom(
            { profilesHistory: { list: vi.fn(), restore: vi.fn() } },
            "profilesHistory",
        );
        expect(host).not.toBeNull();
        expect(host?.discardOlderRevisions).toBeUndefined();
    });

    it("offers discardOlderRevisions, forwarding to the bridge, once the shell has grown it", async () => {
        const discardOlderRevisions = vi.fn().mockResolvedValue({ ok: true, revision: null, message: "Trimmed." });
        const host = simpleHistoryHostFrom(
            { profilesHistory: { list: vi.fn(), restore: vi.fn(), discardOlderRevisions } },
            "profilesHistory",
        );

        expect(host?.discardOlderRevisions).toBeInstanceOf(Function);
        const result = await host?.discardOlderRevisions?.(20);
        expect(discardOlderRevisions).toHaveBeenCalledWith(20);
        expect(result).toEqual({ ok: true, revision: null, message: "Trimmed." });
    });
});

describe("simpleHistorySaveFn", () => {
    it("returns null for a bridge with no save under the namespace", () => {
        expect(simpleHistorySaveFn(null, "profilesHistory")).toBeNull();
        expect(simpleHistorySaveFn({}, "profilesHistory")).toBeNull();
        expect(simpleHistorySaveFn({ profilesHistory: {} }, "profilesHistory")).toBeNull();
        expect(simpleHistorySaveFn({ profilesHistory: { save: "not a function" } }, "profilesHistory")).toBeNull();
    });

    it("forwards the state to the bridge's own save, and forwards its answer back", async () => {
        const save = vi.fn().mockResolvedValue({ ok: true, revision: null });
        const fn = simpleHistorySaveFn({ profilesHistory: { save } }, "profilesHistory");

        expect(fn).not.toBeNull();
        const result = await fn?.({ version: 1, profiles: [], activeId: null });

        expect(save).toHaveBeenCalledWith({ version: 1, profiles: [], activeId: null });
        expect(result).toEqual({ ok: true, revision: null });
    });

    it("reads the appSettingsHistory namespace independently of profilesHistory", () => {
        const bridge = { profilesHistory: { save: vi.fn() }, appSettingsHistory: { save: vi.fn() } };
        expect(simpleHistorySaveFn(bridge, "profilesHistory")).not.toBeNull();
        expect(simpleHistorySaveFn(bridge, "appSettingsHistory")).not.toBeNull();
    });
});

describe("simpleHistoryReadFn", () => {
    it("returns null for a bridge with no read under the namespace", () => {
        expect(simpleHistoryReadFn(null, "appSettingsHistory")).toBeNull();
        expect(simpleHistoryReadFn({}, "appSettingsHistory")).toBeNull();
        expect(simpleHistoryReadFn({ appSettingsHistory: {} }, "appSettingsHistory")).toBeNull();
    });

    it("forwards to the bridge's own read and returns its answer", async () => {
        const read = vi.fn().mockResolvedValue({ version: 1, values: { menuSearch: { open: true } } });
        const fn = simpleHistoryReadFn({ appSettingsHistory: { read } }, "appSettingsHistory");

        expect(fn).not.toBeNull();
        const result = await fn?.();

        expect(read).toHaveBeenCalledWith();
        expect(result).toEqual({ version: 1, values: { menuSearch: { open: true } } });
    });
});
