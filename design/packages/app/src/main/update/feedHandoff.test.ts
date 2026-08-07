import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { UPDATE_FEED_HANDOFF_FILE, createFileUpdateFeedHandoff } from "./feedHandoff.js";

const roots: string[] = [];

function root(): string {
    const value = mkdtempSync(join(tmpdir(), "worldlens-feed-handoff-"));
    roots.push(value);
    return value;
}

afterEach(() => {
    for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe("the update-feed handoff record", () => {
    it("persists confirmation for the exact current and legacy feed pair", () => {
        const directory = root();
        const handoff = createFileUpdateFeedHandoff(
            directory,
            () => new Date("2026-08-07T06:00:00.000Z"),
        );

        expect(handoff.isCurrentConfirmed("https://current", "https://legacy")).toBe(false);
        handoff.confirmCurrent("https://current", "https://legacy");

        const nextLaunch = createFileUpdateFeedHandoff(directory);
        expect(nextLaunch.isCurrentConfirmed("https://current", "https://legacy")).toBe(true);
        expect(nextLaunch.isCurrentConfirmed("https://moved", "https://legacy")).toBe(false);
        expect(
            JSON.parse(readFileSync(join(directory, UPDATE_FEED_HANDOFF_FILE), "utf8")),
        ).toMatchObject({
            version: 1,
            currentFeed: "https://current",
            legacyFeed: "https://legacy",
            confirmedAt: "2026-08-07T06:00:00.000Z",
        });
    });

    it("treats a corrupt record as unconfirmed instead of trusting or blocking it", () => {
        const directory = root();
        writeFileSync(join(directory, UPDATE_FEED_HANDOFF_FILE), "not json", "utf8");
        expect(
            createFileUpdateFeedHandoff(directory).isCurrentConfirmed(
                "https://current",
                "https://legacy",
            ),
        ).toBe(false);
    });
});
