import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { StartupIssueStore } from "./store.js";

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function store(): Promise<StartupIssueStore> {
    const root = await mkdtemp(join(tmpdir(), "worldlens-startup-"));
    roots.push(root);
    return new StartupIssueStore(root);
}

describe("persistent startup diagnostics", () => {
    it("writes complete JSONL records outside the profile and reads them back", async () => {
        const subject = await store();
        const issue = subject.record({
            category: "dependency",
            phase: "java",
            title: "Java discovery failed",
            message: "No supported runtime was found.",
            detail: "looked in two declared locations",
        });
        await subject.flush();

        const raw = await readFile(subject.file, "utf8");
        expect(raw.trim()).toBe(JSON.stringify(issue));
        await expect(subject.snapshot()).resolves.toMatchObject({
            sessionId: subject.sessionId,
            current: [issue],
            history: [issue],
            storageWarning: null,
        });
    });

    it("exports both complete JSON and readable Markdown", async () => {
        const subject = await store();
        subject.record({
            category: "update",
            phase: "update-feed",
            title: "Updates unavailable",
            message: "The feed refused the request.",
            detail: "status 503",
        });

        const json = JSON.parse(await subject.format("json")) as {
            history: { category: string; detail: string }[];
        };
        expect(json.history).toEqual([
            expect.objectContaining({ category: "update", detail: "status 503" }),
        ]);

        const markdown = await subject.format("markdown");
        expect(markdown).toContain("# Worldlens startup diagnostics");
        expect(markdown).toContain("Updates unavailable");
        expect(markdown).toContain("status 503");
    });
});
