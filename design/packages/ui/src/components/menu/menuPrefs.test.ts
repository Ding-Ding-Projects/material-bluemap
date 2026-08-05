// @vitest-environment jsdom

/**
 * `useMenuSearch`'s persistence, and its new mirror into the application-settings history.
 *
 * `openFlags` is a module singleton wired to a real `watch()` at import time, same as
 * `stores/profiles.ts`'s own store - see that file's test for why a stand-in `localStorage`
 * has to be installed on `globalThis` before any mutation runs rather than injected.
 */

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { useMenuSearch } from "./menuPrefs.js";

const cells = new Map<string, string>();

beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => void cells.set(key, value),
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

afterEach(() => {
    delete (window as unknown as { materialBluemap?: unknown }).materialBluemap;
});

describe("mirroring into the application-settings history", () => {
    it("calls appSettingsHistory.save under the menuSearch key when a surface opens", async () => {
        const saved: unknown[] = [];
        (window as unknown as { materialBluemap: unknown }).materialBluemap = {
            appSettingsHistory: {
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        const state = useMenuSearch("world-screen-test");
        state.open = true;
        await nextTick();

        expect(saved).toHaveLength(1);
        const written = saved[0] as { version: number; values: { menuSearch: Record<string, boolean> } };
        expect(written.version).toBe(1);
        expect(written.values.menuSearch["world-screen-test"]).toBe(true);
    });

    it("is a plain no-op with no bridge at all, exactly like a browser tab", async () => {
        const state = useMenuSearch("another-surface-test");
        expect(() => {
            state.open = true;
        }).not.toThrow();
        await expect(nextTick()).resolves.toBeUndefined();
    });
});
