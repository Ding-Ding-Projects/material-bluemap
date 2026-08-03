import { describe, expect, it } from "vitest";

import { BoundedRegexEvaluator } from "./evaluator.js";
import { createInProcessChannel } from "./workerChannel.js";
import type { RegexChannel, RegexResponse } from "./workerChannel.js";

/** A channel that accepts requests and never answers, standing in for a runaway match. */
function silentChannel(): RegexChannel & { terminated: boolean } {
    const channel = {
        terminated: false,
        postMessage() {
            // Deliberately nothing: this is the pattern that never comes back.
        },
        onMessage() {
            // No responses will ever arrive.
        },
        onError() {
            // No errors either.
        },
        terminate() {
            channel.terminated = true;
        },
    };
    return channel;
}

function localEvaluator(): BoundedRegexEvaluator {
    return new BoundedRegexEvaluator({ spawn: () => createInProcessChannel(), timeoutMs: 2000 });
}

describe("BoundedRegexEvaluator", () => {
    it("returns matches for a valid pattern", async () => {
        const evaluator = localEvaluator();
        const outcome = await evaluator.run("\\d+", "g", "a1 b22");
        expect(outcome.status).toBe("ok");
        if (outcome.status === "ok") {
            expect(outcome.result.matches.map((match) => match.value)).toEqual(["1", "22"]);
        }
        evaluator.dispose();
    });

    it("reports an invalid pattern as invalid, with the engine's own message", async () => {
        const evaluator = localEvaluator();
        const outcome = await evaluator.run("(", "", "x");
        expect(outcome.status).toBe("invalid");
        if (outcome.status === "invalid") {
            expect(outcome.message.length).toBeGreaterThan(0);
        }
        evaluator.dispose();
    });

    it("reports an oversized sample as a limit, not as no matches", async () => {
        const evaluator = localEvaluator();
        const outcome = await evaluator.run("a", "", "a".repeat(20001));
        expect(outcome.status).toBe("limit");
        evaluator.dispose();
    });

    it("stops an evaluation that does not come back, and terminates the channel", async () => {
        const channel = silentChannel();
        const evaluator = new BoundedRegexEvaluator({ spawn: () => channel, timeoutMs: 10 });
        const outcome = await evaluator.run("(a+)+$", "", `${"a".repeat(64)}!`);
        expect(outcome.status).toBe("timeout");
        if (outcome.status === "timeout") {
            expect(outcome.limitMs).toBe(10);
        }
        // Terminating is the only way to stop a match that has already started backtracking.
        expect(channel.terminated).toBe(true);
        evaluator.dispose();
    });

    it("fails every request in flight when the channel is terminated", async () => {
        const channel = silentChannel();
        const evaluator = new BoundedRegexEvaluator({ spawn: () => channel, timeoutMs: 10 });
        const [first, second] = await Promise.all([
            evaluator.run("a", "", "a"),
            evaluator.run("b", "", "b"),
        ]);
        expect(first.status).toBe("timeout");
        expect(second.status).toBe("timeout");
        evaluator.dispose();
    });

    it("says plainly when no isolated evaluator can be started", async () => {
        const evaluator = new BoundedRegexEvaluator({ spawn: () => null, timeoutMs: 10 });
        const outcome = await evaluator.run("a", "", "a");
        expect(outcome.status).toBe("unavailable");
        if (outcome.status === "unavailable") {
            expect(outcome.message).toContain("Plain text search still works");
        }
        evaluator.dispose();
    });

    it("recovers after a timeout by spawning a new channel", async () => {
        let spawned = 0;
        const evaluator = new BoundedRegexEvaluator({
            timeoutMs: 10,
            spawn: () => {
                spawned += 1;
                return spawned === 1 ? silentChannel() : createInProcessChannel();
            },
        });
        expect((await evaluator.run("a", "", "a")).status).toBe("timeout");
        const second = await evaluator.run("a", "g", "aa");
        expect(second.status).toBe("ok");
        expect(spawned).toBe(2);
        evaluator.dispose();
    });

    it("filters candidates through the same channel", async () => {
        const evaluator = localEvaluator();
        const outcome = await evaluator.filter("^b", "", ["abc", "bcd"]);
        expect(outcome.status).toBe("ok");
        if (outcome.status === "ok") {
            expect(outcome.result.hits.map((hit) => hit.index)).toEqual([1]);
        }
        evaluator.dispose();
    });

    it("answers unavailable once disposed rather than throwing", async () => {
        const evaluator = localEvaluator();
        evaluator.dispose();
        const outcome = await evaluator.run("a", "", "a");
        expect(outcome.status).toBe("unavailable");
    });
});

describe("createInProcessChannel", () => {
    it("answers with the same protocol the worker uses", () => {
        const channel = createInProcessChannel();
        const seen: RegexResponse[] = [];
        channel.onMessage((response) => seen.push(response));
        channel.postMessage({ id: 5, op: "run", pattern: "a", flags: "", sample: "a" });
        expect(seen[0]).toMatchObject({ id: 5, ok: true, op: "run" });
        channel.terminate();
    });
});
