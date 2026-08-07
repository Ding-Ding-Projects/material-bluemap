/**
 * `resolveWorldRepoBridge`, against a fake `window.worldlens.worldRepo`.
 *
 * Unlike `pagesBridge.ts` (which degrades method by method because Pages grew its preload
 * gradually), `main/worldrepo/ipc.ts` registers all eleven `worldrepo:*` channels in one call,
 * so this bridge is genuinely all-or-nothing: missing even one method means the preload has
 * not grown this namespace yet, not that one feature within it was deliberately left off.
 */

import { afterEach, describe, expect, it } from "vitest";

import { resolveWorldRepoBridge } from "./worldRepoBridge.js";
import type { WorldRepoBridge } from "./worldRepoBridge.js";

function fullApi(): WorldRepoBridge {
    return {
        owners: () => Promise.resolve({ ok: true, value: [] }),
        preflight: () =>
            Promise.resolve({
                ok: false,
                message: "not asked",
            }),
        sync: () =>
            Promise.resolve({
                ok: false,
                failure: { code: "x", message: "no", detail: null, needsGhSignIn: false },
            }),
        remove: () =>
            Promise.resolve({
                ok: false,
                failure: { code: "x", message: "no", detail: null, needsGhSignIn: false },
            }),
        cancel: () => Promise.resolve(false),
        active: () => Promise.resolve([]),
        records: () => Promise.resolve({ ok: true, value: [] }),
        resume: () =>
            Promise.resolve({
                ok: false,
                failure: { code: "x", message: "no", detail: null, needsGhSignIn: false },
            }),
        remoteTip: () => Promise.resolve({ ok: true, value: { exists: false, sha: null } }),
        adoptionProbe: () => Promise.resolve({ ok: true, value: [] }),
        adoptionPlan: () =>
            Promise.resolve({
                ok: true,
                value: {
                    ok: false,
                    owner: "o",
                    repo: "r",
                    branch: "world",
                    reason: "not-prepared",
                    message: "no",
                    marker: null,
                    bootstrapMarker: null,
                    foundFormatVersion: null,
                },
            }),
        onWorldRepoEvent: () => () => {},
    };
}

afterEach(() => {
    delete (globalThis as { worldlens?: unknown }).worldlens;
});

describe("resolveWorldRepoBridge", () => {
    it("returns null when there is no bridge on window at all", () => {
        expect(resolveWorldRepoBridge()).toBeNull();
    });

    it("returns null when worldlens exists but carries no worldRepo namespace", () => {
        (globalThis as { worldlens?: unknown }).worldlens = {};
        expect(resolveWorldRepoBridge()).toBeNull();
    });

    it("returns null when even one of the eleven methods is missing - genuinely all-or-nothing", () => {
        const incomplete: Partial<WorldRepoBridge> = { ...fullApi() };
        delete incomplete.adoptionPlan;
        (globalThis as { worldlens?: unknown }).worldlens = { worldRepo: incomplete };
        expect(resolveWorldRepoBridge()).toBeNull();
    });

    it("returns a working bridge when every method is present", async () => {
        (globalThis as { worldlens?: unknown }).worldlens = { worldRepo: fullApi() };
        const bridge = resolveWorldRepoBridge();
        expect(bridge).not.toBeNull();
        const owners = await bridge?.owners();
        expect(owners?.ok).toBe(true);
    });

    it("routes every call straight through to the underlying namespace, with the right arguments", async () => {
        const calls: unknown[] = [];
        const api = fullApi();
        (globalThis as { worldlens?: unknown }).worldlens = {
            worldRepo: {
                ...api,
                remoteTip: (owner: string, repo: string, branch?: string) => {
                    calls.push([owner, repo, branch]);
                    return api.remoteTip(owner, repo, branch);
                },
            },
        };
        const bridge = resolveWorldRepoBridge();
        await bridge?.remoteTip("octocat", "world-repo", "world");
        expect(calls).toEqual([["octocat", "world-repo", "world"]]);
    });
});
