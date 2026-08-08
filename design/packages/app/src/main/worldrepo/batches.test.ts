import { describe, expect, it } from "vitest";

import {
    WORLD_REPO_MAX_INTRODUCED_BYTES,
    WORLD_REPO_MAX_PUSH_BYTES,
    WORLD_REPO_PLANNING_TARGET_BYTES,
    compareWorldRepoPaths,
    gitPackUpperBound,
    planWorldRepoBatches,
} from "./batches.js";

describe("world repository batch planning", () => {
    it("uses decimal 1.5 GB hard ceilings and a decimal 1.4 GB planning target", () => {
        expect(WORLD_REPO_MAX_INTRODUCED_BYTES).toBe(1_500_000_000);
        expect(WORLD_REPO_MAX_PUSH_BYTES).toBe(1_500_000_000);
        expect(WORLD_REPO_PLANNING_TARGET_BYTES).toBe(1_400_000_000);
    });

    it("splits synthetic boundary-sized inputs without allocating their contents", () => {
        const plans = planWorldRepoBatches([
            { path: "z.mca", bytes: 700_000_000 },
            { path: "a.mca", bytes: 700_000_000 },
            { path: "m.mca", bytes: 1 },
        ]);

        expect(plans).toHaveLength(2);
        expect(plans[0]?.files.map((file) => file.path)).toEqual(["a.mca", "m.mca"]);
        expect(plans[1]?.files.map((file) => file.path)).toEqual(["z.mca"]);
        expect(
            plans.every((batch) => batch.planningBytes <= WORLD_REPO_PLANNING_TARGET_BYTES),
        ).toBe(true);
    });

    it("makes three or more deterministic batches under a lowered test target", () => {
        const input = ["é.mca", "b.mca", "A.mca", "a.mca"].map((path) => ({ path, bytes: 60 }));
        const first = planWorldRepoBatches(input, 400);
        const second = planWorldRepoBatches([...input].reverse(), 400);

        expect(first).toHaveLength(4);
        expect(second).toEqual(first);
        expect(first.flatMap((batch) => batch.files.map((file) => file.path))).toEqual(
            [...input.map((file) => file.path)].sort(compareWorldRepoPaths),
        );
    });

    it("accounts for pack framing instead of equating it with raw object bytes", () => {
        expect(gitPackUpperBound([1_400_000_000])).toBeGreaterThan(1_400_000_000);
        expect(gitPackUpperBound([1_400_000_000])).toBeLessThan(WORLD_REPO_MAX_PUSH_BYTES);
        expect(gitPackUpperBound([WORLD_REPO_MAX_PUSH_BYTES])).toBeGreaterThan(
            WORLD_REPO_MAX_PUSH_BYTES,
        );
    });

    it("keeps an empty world representable by one final marker commit", () => {
        expect(planWorldRepoBatches([])).toEqual([
            { index: 0, files: [], sourceBytes: 0, planningBytes: 0 },
        ]);
    });
});
