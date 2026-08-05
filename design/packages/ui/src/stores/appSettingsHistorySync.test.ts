// @vitest-environment jsdom

/**
 * `recordAppSetting`'s own contract: merge, never replace; fire-and-forget, never throw;
 * a plain no-op with no bridge at all. `menuPrefs.ts`'s own watcher is the first real
 * caller, and this file proves the mechanism it depends on directly rather than only
 * through that one surface's own behaviour.
 */

import { afterEach, describe, expect, it } from "vitest";
import { recordAppSetting } from "./appSettingsHistorySync.js";

afterEach(() => {
    delete (window as unknown as { materialBluemap?: unknown }).materialBluemap;
});

describe("with no bridge at all", () => {
    it("does nothing, and does not throw", () => {
        expect(() => recordAppSetting("menuSearch", { open: true })).not.toThrow();
    });
});

describe("with a bridge that has save but no read", () => {
    it("still saves, with just the one key - nothing to merge against", async () => {
        const saved: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        recordAppSetting("menuSearch", { open: true });
        await Promise.resolve();
        await Promise.resolve();

        expect(saved).toEqual([{ version: 1, values: { menuSearch: { open: true } } }]);
    });
});

describe("with both read and save", () => {
    it("merges the new key into the bag read returned, rather than replacing it", async () => {
        const saved: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                read: () =>
                    Promise.resolve({
                        version: 1,
                        values: { appearance: { theme: "dark" }, dockPlacement: { main: "left" } },
                    }),
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        recordAppSetting("menuSearch", { open: true });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(saved).toEqual([
            {
                version: 1,
                values: {
                    appearance: { theme: "dark" },
                    dockPlacement: { main: "left" },
                    menuSearch: { open: true },
                },
            },
        ]);
    });

    it("overwrites only its own key when the bag already has one for it", async () => {
        const saved: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                read: () => Promise.resolve({ version: 1, values: { menuSearch: { open: false } } }),
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        recordAppSetting("menuSearch", { open: true });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(saved).toEqual([{ version: 1, values: { menuSearch: { open: true } } }]);
    });

    it("proceeds with just the new key when read rejects, rather than losing the save", async () => {
        const saved: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                read: () => Promise.reject(new Error("git is unavailable")),
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        expect(() => recordAppSetting("menuSearch", { open: true })).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(saved).toEqual([{ version: 1, values: { menuSearch: { open: true } } }]);
    });

    it("never throws when save itself rejects", async () => {
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                read: () => Promise.resolve({ version: 1, values: {} }),
                save: () => Promise.reject(new Error("disk full")),
            },
        };

        expect(() => recordAppSetting("menuSearch", { open: true })).not.toThrow();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        // No assertion beyond "did not throw and produced no unhandled rejection" -
        // vitest itself fails the run on an unhandled rejection surfacing from this test.
    });

    it("treats a bag that is not the expected shape as empty rather than crashing", async () => {
        const saved: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                read: () => Promise.resolve("not an object"),
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        recordAppSetting("menuSearch", { open: true });
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(saved).toEqual([{ version: 1, values: { menuSearch: { open: true } } }]);
    });
});
