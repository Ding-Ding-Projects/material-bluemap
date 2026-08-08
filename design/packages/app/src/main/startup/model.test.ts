import { describe, expect, it, vi } from "vitest";
import {
    attemptStartupStep,
    redactStartupText,
    SingleFlight,
    type StartupCategory,
    type StartupIssueInput,
} from "./model.js";

describe("startup failure isolation", () => {
    const categories: readonly StartupCategory[] = [
        "profile-migration",
        "configuration",
        "dependency",
        "preload",
        "update",
        "network",
        "initialization",
        "renderer",
    ];

    it.each(categories)("keeps a %s failure inside its own step", async (category) => {
        const reported: StartupIssueInput[] = [];
        const outcome = await attemptStartupStep({
            category,
            phase: `probe-${category}`,
            title: `${category} unavailable`,
            run: () => {
                throw new Error(`${category} exploded`);
            },
            report: (issue) => {
                reported.push(issue);
            },
        });

        expect(outcome).toBeNull();
        expect(reported).toEqual([
            expect.objectContaining({
                category,
                phase: `probe-${category}`,
                message: `${category} exploded`,
                recoverable: true,
                securityBoundary: false,
            }),
        ]);
    });

    it("returns a successful feature without inventing an issue", async () => {
        const report = vi.fn();
        await expect(
            attemptStartupStep({
                category: "configuration",
                phase: "settings",
                title: "Settings unavailable",
                run: () => 42,
                report,
            }),
        ).resolves.toBe(42);
        expect(report).not.toHaveBeenCalled();
    });

    it("redacts credentials before an error reaches disk, the renderer, or an export", () => {
        const source =
            "Authorization: Bearer ghp_1234567890abcdef token=github_pat_1234567890abcdef password=hunter2";
        const redacted = redactStartupText(source);
        expect(redacted).not.toContain("ghp_");
        expect(redacted).not.toContain("github_pat_");
        expect(redacted).not.toContain("hunter2");
        expect(redacted).toContain("[credential removed]");
    });
});

describe("startup re-entry guard", () => {
    it("shares one in-flight launch and allows a later retry", async () => {
        const gate = new SingleFlight<number>();
        let release!: (value: number) => void;
        const operation = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    release = resolve;
                }),
        );

        const first = gate.run(operation);
        const second = gate.run(operation);
        await Promise.resolve();
        expect(operation).toHaveBeenCalledTimes(1);
        expect(gate.running).toBe(true);
        release(7);
        await expect(Promise.all([first, second])).resolves.toEqual([7, 7]);
        expect(gate.running).toBe(false);

        await gate.run(async () => 8);
        expect(operation).toHaveBeenCalledTimes(1);
    });
});
