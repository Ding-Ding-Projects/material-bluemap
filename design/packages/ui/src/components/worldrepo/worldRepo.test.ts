/**
 * The "world kept in a git repository" store, against a bridge that exists only here.
 *
 * The properties worth pinning are the ones about honesty rather than about plumbing:
 *
 *  - a row appears the instant a sync is requested, not only once the first IPC event
 *    round-trips back;
 *  - `pushVerified: false` is reported as a warning notice by the screen, never silently
 *    upgraded to a plain success by the store;
 *  - a stale preflight is cleared before a new one is asked for;
 *  - adoption is a second, unrelated slice of state: probing or planning never touches
 *    `rows` or `records`, and syncing never touches `adoptionSignals` or `plan`;
 *  - `remove` never emits a sync event and is tracked through its own `removingKeys`, because
 *    `main/worldrepo/repo.ts`'s own `remove()` is a plain call, not a phased sync.
 */

import { describe, expect, it } from "vitest";

import { DEFAULT_WORLD_BRANCH, createWorldRepo, targetKey } from "./worldRepo.js";
import type {
    Answer,
    WorldRepoAdoptionPlan,
    WorldRepoAdoptionSignal,
    WorldRepoBridge,
    WorldRepoEvent,
    WorldRepoOwner,
    WorldRepoPreflight,
    WorldRepoRecord,
    WorldRepoRemoveResult,
    WorldRepoSyncResult,
} from "./worldRepoBridge.js";

interface FakeBridge extends WorldRepoBridge {
    fire(event: WorldRepoEvent): void;
}

function fakeBridge(overrides: Partial<WorldRepoBridge> = {}): FakeBridge {
    const listeners: ((event: WorldRepoEvent) => void)[] = [];
    const base: WorldRepoBridge = {
        owners: () => Promise.resolve({ ok: true, value: [] }),
        preflight: () => Promise.resolve({ ok: false, message: "not asked" }),
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
        cancel: () => Promise.resolve(true),
        active: () => Promise.resolve([]),
        records: () => Promise.resolve({ ok: true, value: [] }),
        resume: () =>
            Promise.resolve({
                ok: false,
                failure: { code: "x", message: "no", detail: null, needsGhSignIn: false },
            }),
        remoteTip: () => Promise.resolve({ ok: true, value: { exists: false, sha: null } }),
        adoptionProbe: () => Promise.resolve({ ok: true, value: [] }),
        adoptionPlan: () => Promise.resolve({ ok: false, message: "not asked" }),
        onWorldRepoEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
    };
    const bridge = { ...base, ...overrides };
    return { ...bridge, fire: (event) => { for (const l of [...listeners]) l(event); } };
}

const RECORD: WorldRepoRecord = {
    version: 1,
    worldPath: "/worlds/andyville",
    owner: "octocat",
    repo: "andyville-world",
    branch: "world",
    stage: "finished",
    commit: "abc123",
    pushVerified: true,
    bytes: 512_000_000,
    fileCount: 8_213,
    syncedAt: "2026-08-01T00:00:00.000Z",
};

describe("targetKey", () => {
    it("matches main/worldrepo/repo.ts's own sanitisation exactly", () => {
        expect(targetKey("octo cat", "wor/ld", "ma!in")).toBe("octo_cat__wor_ld__ma_in");
    });

    it("falls back to the default branch for an empty one", () => {
        expect(targetKey("octocat", "world-repo", "")).toBe(`octocat__world-repo__${DEFAULT_WORLD_BRANCH}`);
    });
});

describe("availability", () => {
    it("is unavailable with a null bridge, and every call is a safe no-op", async () => {
        const wr = createWorldRepo(null);
        expect(wr.available).toBe(false);
        await wr.loadOwners();
        await wr.loadRecords();
        expect(await wr.check({ worldPath: "/w", owner: "o", repo: "r" })).toBeNull();
        expect(
            await wr.sync({ worldPath: "/w", owner: "o", repo: "r", acknowledgeSync: true }),
        ).toBeNull();
        expect(await wr.remove({ worldPath: "/w", owner: "o", repo: "r" })).toBe(false);
        expect(wr.rows.value).toEqual([]);
    });
});

describe("syncing: a row appears before the first event round-trips", () => {
    it("shows a syncing row the instant sync() is called", async () => {
        let resolveSync: (result: WorldRepoSyncResult) => void = () => {};
        const bridge = fakeBridge({
            sync: () => new Promise((resolve) => { resolveSync = resolve; }),
        });
        const wr = createWorldRepo(bridge);
        const promise = wr.sync({ worldPath: "/w", owner: "octocat", repo: "andyville-world", branch: "world", acknowledgeSync: true });
        await Promise.resolve();
        expect(wr.rows.value).toHaveLength(1);
        expect(wr.rows.value[0]?.state).toBe("syncing");
        resolveSync({
            ok: true,
            report: {
                worldPath: "/w",
                owner: "octocat",
                repo: "andyville-world",
                branch: "world",
                repositoryUrl: "https://github.com/octocat/andyville-world",
                commit: "abc123",
                pushVerified: true,
                bytes: 100,
                fileCount: 5,
                notes: [],
            },
            durationMs: 10,
        });
        await promise;
    });

    it("reports pushVerified: false as a fact on the row, never silently upgraded", async () => {
        const bridge = fakeBridge();
        const wr = createWorldRepo(bridge);
        const key = targetKey("octocat", "andyville-world", "world");
        bridge.fire({ type: "started", key, target: "octocat/andyville-world#world", at: "t0" });
        bridge.fire({
            type: "finished",
            key,
            report: {
                worldPath: "/w",
                owner: "octocat",
                repo: "andyville-world",
                branch: "world",
                repositoryUrl: "https://github.com/octocat/andyville-world",
                commit: "abc123",
                pushVerified: false,
                bytes: 100,
                fileCount: 5,
                notes: ["unverified"],
            },
            durationMs: 10,
            at: "t1",
        });
        const row = wr.rows.value.find((r) => r.key === key);
        expect(row?.state).toBe("synced");
        expect(row?.report?.pushVerified).toBe(false);
    });

    it("clears the progress bar the moment the phase advances, so a full bar never lingers past its step", () => {
        const bridge = fakeBridge();
        const wr = createWorldRepo(bridge);
        const key = targetKey("octocat", "andyville-world", "world");
        bridge.fire({ type: "started", key, target: "x", at: "t0" });
        bridge.fire({ type: "progress", key, phase: "staging", description: "staging", done: 5, total: 10, at: "t1" });
        expect(wr.rows.value.find((r) => r.key === key)?.progress?.percent).toBe(50);
        bridge.fire({ type: "phase", key, phase: "committing", at: "t2" });
        expect(wr.rows.value.find((r) => r.key === key)?.progress).toBeNull();
    });

    it("reports a refusal both as startFailure and on the optimistic row - never lost, even without a matching event", async () => {
        const bridge = fakeBridge({
            sync: () =>
                Promise.resolve({
                    ok: false,
                    failure: { code: "not-acknowledged", message: "not agreed", detail: null, needsGhSignIn: false },
                }),
        });
        const wr = createWorldRepo(bridge);
        await wr.sync({ worldPath: "/w", owner: "o", repo: "r" });
        expect(wr.startFailure.value?.message).toBe("not agreed");
        const row = wr.rows.value.find((r) => r.owner === "o" && r.repo === "r");
        expect(row?.state).toBe("failed");
        expect(row?.failure?.message).toBe("not agreed");
    });
});

describe("preflight: a stale report never survives a new check", () => {
    it("clears the previous preflight the moment a new check starts", async () => {
        let resolvePreflight: (value: Answer<WorldRepoPreflight>) => void = () => {};
        const bridge = fakeBridge({
            preflight: () => new Promise((resolve) => { resolvePreflight = resolve; }),
        });
        const wr = createWorldRepo(bridge);
        const flight: WorldRepoPreflight = {
            worldPath: "/w",
            owner: "o",
            repo: "r",
            branch: "world",
            world: null,
            worldFailure: null,
            gh: { availability: "ready", version: null, account: null, host: null, scopes: null, message: "ready" },
            gitVersion: null,
            repository: null,
            blockers: [],
            warnings: [],
            published: null,
        };
        const first = wr.check({ worldPath: "/w", owner: "o", repo: "r" });
        resolvePreflight({ ok: true, value: flight });
        await first;
        expect(wr.preflight.value).not.toBeNull();
        const second = wr.check({ worldPath: "/w", owner: "o", repo: "r2" });
        expect(wr.preflight.value).toBeNull();
        resolvePreflight({ ok: true, value: flight });
        await second;
    });
});

describe("removal: never a phased sync", () => {
    it("tracks a remove through removingKeys rather than the sync event stream", async () => {
        let resolveRemove: (value: WorldRepoRemoveResult) => void = () => {};
        const bridge = fakeBridge({
            remove: () => new Promise((resolve) => { resolveRemove = resolve; }),
        });
        const wr = createWorldRepo(bridge);
        const key = targetKey(RECORD.owner, RECORD.repo, RECORD.branch);
        const promise = wr.remove({ worldPath: RECORD.worldPath, owner: RECORD.owner, repo: RECORD.repo, branch: RECORD.branch });
        await Promise.resolve();
        expect(wr.removingKeys.value.has(key)).toBe(true);
        expect(wr.rows.value).toEqual([]);
        resolveRemove({ ok: true, report: { owner: RECORD.owner, repo: RECORD.repo, branch: RECORD.branch, branchDeleted: true, notes: [] } });
        expect(await promise).toBe(true);
        expect(wr.removingKeys.value.has(key)).toBe(false);
    });

    it("reloads records after a successful remove", async () => {
        let loaded = 0;
        const bridge = fakeBridge({
            remove: () => Promise.resolve({ ok: true, report: { owner: "o", repo: "r", branch: "world", branchDeleted: true, notes: [] } }),
            records: () => {
                loaded += 1;
                return Promise.resolve({ ok: true, value: [] });
            },
        });
        const wr = createWorldRepo(bridge);
        await wr.remove({ worldPath: "/w", owner: "o", repo: "r" });
        expect(loaded).toBe(1);
    });
});

describe("adoption: a second, unrelated slice of state", () => {
    it("probing never touches rows or records", async () => {
        const signals: WorldRepoAdoptionSignal[] = [
            { fullName: "octocat/andyville-world", branch: "world", status: "prepared", marker: null, bootstrapMarker: null, message: "looks like yours" },
        ];
        const bridge = fakeBridge({ adoptionProbe: () => Promise.resolve({ ok: true, value: signals }) });
        const wr = createWorldRepo(bridge);
        await wr.probeAdoption([{ owner: "octocat", repo: "andyville-world" }]);
        expect(wr.adoptionSignals.value).toEqual(signals);
        expect(wr.rows.value).toEqual([]);
        expect(wr.records.value).toEqual([]);
    });

    it("planning reports an honest refusal without inventing a plan", async () => {
        const bridge = fakeBridge({
            adoptionPlan: () =>
                Promise.resolve({
                    ok: true,
                    value: {
                        ok: false,
                        owner: "octocat",
                        repo: "andyville-world",
                        branch: "world",
                        reason: "not-prepared",
                        message: "does not look like one this application prepared",
                        marker: null,
                        bootstrapMarker: null,
                        foundFormatVersion: null,
                    } satisfies WorldRepoAdoptionPlan,
                }),
        });
        const wr = createWorldRepo(bridge);
        const plan = await wr.planAdoption("octocat", "andyville-world");
        expect(plan?.ok).toBe(false);
        expect(wr.plan.value?.ok).toBe(false);
    });

    it("clearPlan removes the plan without touching adoptionSignals", async () => {
        const bridge = fakeBridge({
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
                    } satisfies WorldRepoAdoptionPlan,
                }),
        });
        const wr = createWorldRepo(bridge);
        await wr.planAdoption("o", "r");
        expect(wr.plan.value).not.toBeNull();
        wr.clearPlan();
        expect(wr.plan.value).toBeNull();
    });
});

describe("owners and records", () => {
    it("loads owners and records", async () => {
        const owners: WorldRepoOwner[] = [{ login: "octocat", kind: "user" }];
        const bridge = fakeBridge({
            owners: () => Promise.resolve({ ok: true, value: owners }),
            records: () => Promise.resolve({ ok: true, value: [RECORD] }),
        });
        const wr = createWorldRepo(bridge);
        await wr.loadOwners();
        await wr.loadRecords();
        expect(wr.owners.value).toEqual(owners);
        expect(wr.records.value).toEqual([RECORD]);
    });

    it("reports a failed load rather than silently keeping an empty list", async () => {
        const bridge = fakeBridge({ records: () => Promise.resolve({ ok: false, message: "network down" }) });
        const wr = createWorldRepo(bridge);
        await wr.loadRecords();
        expect(wr.recordsFailure.value).toBe("network down");
    });
});
