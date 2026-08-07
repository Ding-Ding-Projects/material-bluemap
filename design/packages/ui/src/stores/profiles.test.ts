// @vitest-environment jsdom

/**
 * The write path, guarded the way `load()` already guards the read path.
 *
 * `profilesStore` is a module singleton wired to a real `watch()` at import time, so
 * there is nowhere to inject a stand-in `Storage` the way `tabStorage.test.ts` and
 * `appearanceStore.test.ts` do for their own stores - the bare `localStorage` identifier
 * in `profiles.ts` is resolved fresh at call time against whatever `globalThis` holds.
 *
 * That identifier is not usable as-is in this suite: Node's own built-in `localStorage`
 * global is present but inert without `--localstorage-file`, and it is not the same
 * object as jsdom's `window.localStorage`. `ProfileManager.test.ts` hits the identical
 * problem and fixes it the same way - a map-backed stand-in installed on `globalThis`
 * before any mutation runs. Because the watcher only touches `localStorage` once it is
 * actually scheduled (after every `beforeAll` hook has already run), installing the
 * stand-in there is early enough even though `profiles.ts`'s own module-load-time
 * `load()` call already ran against the real, absent one.
 *
 * Before the write-path guard, a `setItem` that throws - a full quota, private
 * browsing - propagated out of the watcher's scheduled job and rejected the promise
 * `nextTick()` returns. The reactive push itself lands synchronously (that part of Vue's
 * reactivity never waits for a flush), but anything that awaited the flush saw the
 * throw. These tests turn `setItem` into exactly that failure and check both that the
 * mutation is still in memory afterwards and that awaiting the flush no longer rejects.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { addProfile, profilesStore, removeProfile, STORAGE_KEY } from "./profiles.js";

const cells = new Map<string, string>();
let throwOnSetItem = false;

beforeAll(() => {
    Object.defineProperty(globalThis, "localStorage", {
        configurable: true,
        value: {
            getItem: (key: string) => cells.get(key) ?? null,
            setItem: (key: string, value: string) => {
                if (throwOnSetItem) {
                    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
                }
                cells.set(key, value);
            },
            removeItem: (key: string) => void cells.delete(key),
            clear: () => cells.clear(),
            key: (index: number) => [...cells.keys()][index] ?? null,
            get length() {
                return cells.size;
            },
        } as unknown as Storage,
    });
});

beforeEach(() => {
    throwOnSetItem = false;
});

afterEach(() => {
    throwOnSetItem = false;
    // The store is a module singleton; leaving a test's profile behind would bleed into
    // whichever test runs next.
    for (const profile of [...profilesStore.profiles]) {
        if (profile.id !== "demo") removeProfile(profile.id);
    }
});

describe("mirroring into the main process's own history", () => {
    afterEach(() => {
        delete (window as unknown as { worldlens?: unknown }).worldlens;
    });

    it("calls profilesHistory.save with the current list, fire-and-forget, whenever it mutates", async () => {
        const saved: unknown[] = [];
        (window as unknown as { worldlens: unknown }).worldlens = {
            syncProfiles: () => Promise.resolve(),
            profilesHistory: {
                save: (state: unknown) => {
                    saved.push(state);
                    return Promise.resolve({ ok: true });
                },
            },
        };

        const created = addProfile({
            name: "Mirrored",
            url: "https://mirrored.example.com",
            trustCustomizations: true,
        });
        await nextTick();

        expect(saved).toHaveLength(1);
        const state = saved[0] as { version: number; profiles: { id: string }[]; activeId: string | null };
        expect(state.version).toBe(1);
        expect(state.profiles.some((profile) => profile.id === created.id)).toBe(true);
        expect(state.activeId).toBe(profilesStore.activeId);
    });

    it("does not throw, and does not block localStorage persistence, when the bridge's save rejects", async () => {
        (window as unknown as { worldlens: unknown }).worldlens = {
            syncProfiles: () => Promise.resolve(),
            profilesHistory: {
                save: () => Promise.reject(new Error("git is unavailable")),
            },
        };

        let created: ReturnType<typeof addProfile> | undefined;
        expect(() => {
            created = addProfile({
                name: "Still Saved Locally",
                url: "https://still-saved.example.com",
                trustCustomizations: false,
            });
        }).not.toThrow();

        await expect(nextTick()).resolves.toBeUndefined();
        // Give the rejected promise's own microtask a turn, so a failure to swallow it
        // would surface as an unhandled rejection this test can see.
        await Promise.resolve();

        expect(cells.get(STORAGE_KEY)).toContain(created?.id ?? "");
    });

    it("is a plain no-op on a build with no bridge at all, exactly like a browser tab", async () => {
        // No `window.worldlens` set - the default state every test in this file
        // starts from otherwise, restated here so this test does not depend on running
        // after one that also left it unset.
        expect(() => {
            addProfile({ name: "No Bridge", url: "https://none.example.com", trustCustomizations: false });
        }).not.toThrow();
        await expect(nextTick()).resolves.toBeUndefined();
    });
});

describe("the write path when localStorage.setItem refuses", () => {
    it("keeps the mutation in memory instead of throwing out of the watcher", async () => {
        throwOnSetItem = true;

        let created: ReturnType<typeof addProfile> | undefined;
        expect(() => {
            created = addProfile({
                name: "Full Disk",
                url: "https://example.com/bluemap",
                trustCustomizations: false,
            });
        }).not.toThrow();

        // The push above is synchronous reactivity; the watcher only calls the throwing
        // `setItem` once the scheduler flushes, which `nextTick` awaits. Before the guard
        // this promise rejected with the storage error instead of resolving.
        await expect(nextTick()).resolves.toBeUndefined();

        expect(profilesStore.profiles.some((profile) => profile.id === created?.id)).toBe(true);
    });

    it("keeps persisting afterwards, so one refusal does not wedge the watcher", async () => {
        throwOnSetItem = true;
        addProfile({ name: "First", url: "https://a.example.com", trustCustomizations: false });
        await nextTick();

        throwOnSetItem = false;
        const second = addProfile({
            name: "Second",
            url: "https://b.example.com",
            trustCustomizations: false,
        });
        await nextTick();

        expect(cells.get(STORAGE_KEY)).toContain(second.id);
    });
});
