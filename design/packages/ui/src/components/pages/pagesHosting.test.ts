/**
 * The Pages-hosting store, against a bridge that exists only here.
 *
 * The properties worth pinning are the ones about honesty rather than about plumbing:
 *
 *  - a site is green only when the main process said a request to it answered 200;
 *  - a failure with no row of its own is reported beside the form rather than invented into
 *    the list of real publishes;
 *  - a stale preflight is cleared before a new one is asked for, because a report about the
 *    repository somebody has just typed over is worse than no report at all;
 *  - a progress bar belonging to a finished step is cleared when the next step starts, so a
 *    full bar never sits beside a step that has only just begun.
 */

import { describe, expect, it, vi } from "vitest";

import {
    createPagesHosting,
    phaseLabel,
    sizeLine,
    statusLabel,
    statusTone,
} from "./pagesHosting.js";
import type {
    Answer,
    PagesBridge,
    PagesCandidate,
    PagesEvent,
    PagesPreflight,
    PagesPublishReport,
    PagesRecord,
    PagesResult,
    PagesStopResult,
} from "./pagesBridge.js";

/** `t(key, fallback)` and `t(key, named, fallback)`, rendered the way vue-i18n would. */
const t = ((key: string, second: unknown, third?: string): string => {
    const template = typeof second === "string" ? second : (third ?? key);
    if (typeof second !== "object" || second === null) return template;
    return template.replace(/\{(\w+)\}/g, (_whole, name: string) =>
        String((second as Record<string, unknown>)[name] ?? ""),
    );
}) as never;

interface FakeBridge extends PagesBridge {
    fire(event: PagesEvent): void;
    readonly requests: unknown[];
}

function fakeBridge(overrides: Partial<PagesBridge> = {}): FakeBridge {
    const listeners: ((event: PagesEvent) => void)[] = [];
    const requests: unknown[] = [];
    const base: PagesBridge = {
        listRenders: () => Promise.resolve({ ok: true, value: [] }),
        preflight: (request) => {
            requests.push(request);
            return Promise.resolve({ ok: false, message: "not asked" });
        },
        publish: (request) => {
            requests.push(request);
            return Promise.resolve({
                ok: false,
                failure: { code: "x", message: "no", detail: null, needsGhSignIn: false },
            });
        },
        onEvent: (listener) => {
            listeners.push(listener);
            return () => listeners.splice(listeners.indexOf(listener), 1);
        },
        listOwners: () => Promise.resolve({ ok: true, value: [] }),
        listPublished: () => Promise.resolve({ ok: true, value: [] }),
        removeHosting: () =>
            Promise.resolve({
                ok: false,
                failure: { code: "x", message: "no", detail: null, needsGhSignIn: false },
            }),
        cancel: () => Promise.resolve(true),
        canListOwners: true,
        canListPublished: true,
        canStop: true,
        canCancel: true,
    };
    const bridge = { ...base, ...overrides };
    return {
        ...bridge,
        onEvent: bridge.onEvent,
        requests,
        fire(event) {
            for (const listener of [...listeners]) listener(event);
        },
    };
}

function report(overrides: Partial<PagesPublishReport> = {}): PagesPublishReport {
    return {
        renderId: "world-1",
        owner: "octocat",
        repo: "maps",
        branch: "gh-pages",
        repositoryUrl: "https://github.com/octocat/maps",
        commit: "c".repeat(40),
        pushVerified: true,
        status: "live",
        url: "https://octocat.github.io/maps/",
        verified: true,
        httpStatus: 200,
        site: {
            servable: true,
            changedSettings: true,
            addedNoJekyll: true,
            maps: [{ id: "world", missing: [] }],
            totalBytes: 2_000_000,
            fileCount: 1_234,
            oversizedFiles: [],
            overSoftLimit: false,
            notes: [],
        },
        notes: [],
        ...overrides,
    };
}

describe("the labels", () => {
    it("never turns a build GitHub merely finished into a site that answers", () => {
        expect(statusTone("live")).toBe("success");
        expect(statusTone("built")).not.toBe("success");
        expect(statusTone("building")).not.toBe("success");
        expect(statusTone("queued")).not.toBe("success");
        expect(statusTone("errored")).toBe("error");
        expect(statusLabel("built", t)).toContain("did not answer");
    });

    it("names each step rather than showing an unlabelled spinner", () => {
        expect(phaseLabel("staging", t)).toContain("Staging");
        expect(phaseLabel("verifying", t)).toContain("answers");
        expect(phaseLabel(null, t)).toBe("Starting");
    });

    it("says the size and the file count, which is what the decision turns on", () => {
        const preflight = {
            site: { totalBytes: 2_000_000, fileCount: 1_234 },
        } as unknown as PagesPreflight;
        expect(sizeLine(preflight, t)).toContain("1234");
        expect(sizeLine(null, t)).toBe("");
    });
});

describe("the store", () => {
    it("reports that this build cannot publish, rather than pretending it can", () => {
        const pages = createPagesHosting(null);
        expect(pages.available).toBe(false);
        expect(pages.canStop).toBe(false);
    });

    it("clears a stale preflight before asking for a new one", async () => {
        const bridge = fakeBridge({
            preflight: () =>
                Promise.resolve({ ok: true, value: { blockers: [] } as unknown as PagesPreflight }),
        });
        const pages = createPagesHosting(bridge);

        await pages.check({ renderId: "world-1", owner: "octocat", repo: "maps" });
        expect(pages.preflight.value).not.toBeNull();

        const slow = fakeBridge({
            preflight: () => Promise.resolve({ ok: false, message: "no such repository" }),
        });
        const second = createPagesHosting(slow);
        await second.check({ renderId: "world-1", owner: "octocat", repo: "typo" });
        expect(second.preflight.value).toBeNull();
        expect(second.preflightFailure.value).toBe("no such repository");
    });

    it("keeps a refusal that never had a row beside the form rather than in the list", async () => {
        const bridge = fakeBridge({
            publish: () =>
                Promise.resolve({
                    ok: false,
                    failure: {
                        code: "not-acknowledged",
                        message: "not agreed to",
                        detail: null,
                        needsGhSignIn: false,
                    },
                } satisfies PagesResult),
        });
        const pages = createPagesHosting(bridge);

        await pages.publish({ renderId: "world-1", owner: "octocat", repo: "maps" });

        expect(pages.startFailure.value?.code).toBe("not-acknowledged");
        expect(pages.rows.value).toEqual([]);
    });

    it("follows a publish through its steps with real numbers", () => {
        const bridge = fakeBridge();
        const pages = createPagesHosting(bridge);

        bridge.fire({
            type: "started",
            renderId: "world-1",
            target: "octocat/maps",
            at: "2026-08-04T12:00:00Z",
        });
        bridge.fire({
            type: "progress",
            renderId: "world-1",
            phase: "staging",
            description: "Staging the map's files",
            done: 500,
            total: 2_000,
            at: "2026-08-04T12:00:01Z",
        });

        const row = pages.rows.value[0];
        expect(row?.state).toBe("publishing");
        expect(row?.progress?.done).toBe(500);
        expect(row?.progress?.percent).toBe(25);

        // The next step's label arrives, and the finished step's bar goes with it.
        bridge.fire({
            type: "phase",
            renderId: "world-1",
            phase: "pushing",
            at: "2026-08-04T12:00:02Z",
        });
        expect(pages.rows.value[0]?.progress).toBeNull();
        expect(pages.rows.value[0]?.phase).toBe("pushing");
    });

    it("carries the report through, unverified status and all", () => {
        const bridge = fakeBridge();
        const pages = createPagesHosting(bridge);

        bridge.fire({
            type: "finished",
            renderId: "world-1",
            report: report({ status: "built", verified: false, httpStatus: 404, pushVerified: false }),
            durationMs: 1_000,
            at: "2026-08-04T12:05:00Z",
        });

        const row = pages.rows.value[0];
        expect(row?.state).toBe("published");
        expect(row?.report?.verified).toBe(false);
        expect(row?.report?.status).toBe("built");
        expect(row?.report?.pushVerified).toBe(false);
        expect(statusTone(row?.report?.status ?? "unknown")).not.toBe("success");
    });

    it("puts a failure and a cancellation in their own states rather than in one bucket", () => {
        const bridge = fakeBridge();
        const pages = createPagesHosting(bridge);

        bridge.fire({
            type: "failed",
            renderId: "a",
            failure: { code: "not-ours", message: "refused", detail: null, needsGhSignIn: false },
            at: "2026-08-04T12:00:00Z",
        });
        bridge.fire({ type: "cancelled", renderId: "b", at: "2026-08-04T12:00:00Z" });

        const states = Object.fromEntries(pages.rows.value.map((row) => [row.renderId, row.state]));
        expect(states["a"]).toBe("failed");
        expect(states["b"]).toBe("cancelled");
    });

    it("sorts what is running above what has finished", () => {
        const bridge = fakeBridge();
        const pages = createPagesHosting(bridge);

        bridge.fire({
            type: "finished",
            renderId: "done",
            report: report({ renderId: "done" }),
            durationMs: 1,
            at: "2026-08-04T12:00:00Z",
        });
        bridge.fire({
            type: "started",
            renderId: "going",
            target: "octocat/maps",
            at: "2026-08-04T11:00:00Z",
        });

        expect(pages.rows.value.map((row) => row.renderId)).toEqual(["going", "done"]);
    });

    it("lists the renders there are, and reports a listing that failed rather than an empty one", async () => {
        const rows: PagesCandidate[] = [
            { renderId: "world-1", webRoot: "/w", maps: ["world"], problem: null },
        ];
        const good = createPagesHosting(fakeBridge({ listRenders: () => Promise.resolve({ ok: true, value: rows }) }));
        await good.loadCandidates();
        expect(good.candidates.value).toEqual(rows);

        const bad = createPagesHosting(
            fakeBridge({ listRenders: () => Promise.resolve({ ok: false, message: "disk gone" }) }),
        );
        await bad.loadCandidates();
        expect(bad.candidates.value).toEqual([]);
        expect(bad.candidatesFailure.value).toBe("disk gone");
    });

    it("refreshes the published list once a site really has been taken down", async () => {
        const published: PagesRecord[] = [
            {
                version: 1,
                renderId: "world-1",
                owner: "octocat",
                repo: "maps",
                branch: "gh-pages",
                url: "https://octocat.github.io/maps/",
                commit: null,
                status: "live",
                verified: true,
                publishedAt: "2026-08-04T12:00:00Z",
            },
        ];
        let remaining: readonly PagesRecord[] = published;
        const bridge = fakeBridge({
            listPublished: () => Promise.resolve({ ok: true, value: remaining } as Answer<readonly PagesRecord[]>),
            removeHosting: () => {
                remaining = [];
                return Promise.resolve({
                    ok: true,
                    report: {
                        owner: "octocat",
                        repo: "maps",
                        branch: "gh-pages",
                        pagesDisabled: true,
                        branchDeleted: true,
                        notes: [],
                    },
                } satisfies PagesStopResult);
            },
        });
        const pages = createPagesHosting(bridge);

        await pages.loadPublished();
        expect(pages.published.value).toHaveLength(1);

        expect(
            await pages.removeHosting({ renderId: "world-1", owner: "octocat", repo: "maps" }),
        ).toBe(true);
        expect(pages.published.value).toEqual([]);
    });

    it("keeps the reason a site could not be taken down, and takes nothing off the list", async () => {
        const bridge = fakeBridge({
            removeHosting: () =>
                Promise.resolve({
                    ok: false,
                    failure: {
                        code: "not-ours",
                        message: "that branch is not ours",
                        detail: null,
                        needsGhSignIn: false,
                    },
                }),
        });
        const pages = createPagesHosting(bridge);
        expect(
            await pages.removeHosting({ renderId: "world-1", owner: "octocat", repo: "maps" }),
        ).toBe(false);
        expect(pages.stopFailure.value).toBe("that branch is not ours");
    });

    it("stops listening when the surface goes away", () => {
        const bridge = fakeBridge();
        const pages = createPagesHosting(bridge);
        pages.dispose();
        bridge.fire({ type: "started", renderId: "x", target: "o/r", at: "2026-08-04T12:00:00Z" });
        expect(pages.rows.value).toEqual([]);
    });

    it("marks a row as stopping the moment the button is pressed", async () => {
        const cancel = vi.fn(() => Promise.resolve(true));
        const bridge = fakeBridge({ cancel });
        const pages = createPagesHosting(bridge);
        await pages.stopPublishing("world-1");
        expect(cancel).toHaveBeenCalledWith("world-1");
        expect(pages.rows.value[0]?.stopping).toBe(true);
    });
});
