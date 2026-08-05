import { describe, expect, it } from "vitest";
import { createCiRenders } from "./ciRenders.js";
import type { CiRenderBridge, CiSyncResult, CiRepositoryNameAvailability } from "./ciRenderBridge.js";

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function bridgeWithDelayedCheck(): CiRenderBridge {
    return {
        ciRenderPreflight: () => Promise.resolve({ ok: false, message: "not stubbed" }),
        startCiRender: () =>
            Promise.resolve({
                ok: false,
                syncId: "nowhere",
                failure: {
                    code: "test",
                    message: "no",
                    detail: null,
                    status: null,
                    needsSignIn: false,
                    needsEula: false,
                    route: null,
                    run: null,
                    failingJob: null,
                    logExcerpt: null,
                },
            } satisfies CiSyncResult),
        checkCiRender: () =>
            Promise.resolve({ ok: true, syncId: "s", outcome: "running", run: null, state: null as never } as CiSyncResult),
        listCiRenders: () => Promise.resolve({ ok: true, value: [] }),
        cancelCiRender: () => Promise.resolve(true),
        activeCiRenders: () => Promise.resolve([]),
        onCiRenderEvent: () => () => {},
        canCancel: false,
        canList: true,
        canCheck: true,
        canSeeActive: true,
        checkCiRepoName: async ({ owner, repo }): Promise<CiRepositoryNameAvailability> => {
            // The older request ("old-name") resolves slower than the newer one ("new-name"),
            // simulating real network jitter where requests do not resolve in fire order.
            const delay = repo === "old-name" ? 300 : 20;
            await sleep(delay);
            return { status: "taken", owner, repo, private: false, htmlUrl: null };
        },
    };
}

describe("REPRO: checkRepoName sequencing", () => {
    it("a slower stale check can overwrite a faster, newer one", async () => {
        const renders = createCiRenders(bridgeWithDelayedCheck());

        // Fire the stale (slow) request first, then the fresh (fast) one shortly after -
        // exactly what happens when a user edits the repo field again before the first
        // in-flight network call has returned.
        const stale = renders.checkRepoName("owner", "old-name");
        await sleep(5);
        const fresh = renders.checkRepoName("owner", "new-name");

        await Promise.all([stale, fresh]);

        // The user is now looking at "new-name" in the field; the reported availability
        // should match it, not the older, slower request.
        expect(renders.nameAvailability.value?.repo).toBe("new-name");
        renders.dispose();
    });
});
