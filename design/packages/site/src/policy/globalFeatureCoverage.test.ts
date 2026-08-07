import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PAGES_FEATURE_COVERAGE, REQUIRED_PAGES_FEATURE_IDS } from "./globalFeatureCoverage.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("hand-written GitHub Pages global-feature coverage", () => {
    it("covers every required id exactly once", () => {
        const actual = PAGES_FEATURE_COVERAGE.map((item) => item.id);
        expect(actual).toEqual(REQUIRED_PAGES_FEATURE_IDS);
        expect(new Set(actual).size).toBe(actual.length);
    });

    it("requires implementation and verification evidence for every applicable feature", () => {
        for (const item of PAGES_FEATURE_COVERAGE) {
            if (item.status !== "implemented") continue;
            expect(
                item.implementation.length,
                `${item.id} has no implementation evidence`,
            ).toBeGreaterThan(0);
            expect(
                item.verification.length,
                `${item.id} has no verification evidence`,
            ).toBeGreaterThan(0);
            for (const path of [...item.implementation, ...item.verification]) {
                expect(
                    existsSync(resolve(repoRoot, path)),
                    `${item.id} points at missing ${path}`,
                ).toBe(true);
            }
        }
    });

    it("requires a concrete public reason for every non-applicable or optional feature", () => {
        for (const item of PAGES_FEATURE_COVERAGE) {
            if (item.status === "implemented") continue;
            expect(item.reason.length, `${item.id} has only a hand-wave`).toBeGreaterThan(120);
        }
    });

    it("leaves no applicable feature incomplete", () => {
        expect(
            PAGES_FEATURE_COVERAGE.some((item) => (item.status as string) === "incomplete"),
        ).toBe(false);
    });
});
