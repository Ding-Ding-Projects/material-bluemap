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
    it("persists confirmation for the exact current and legacy repository/channel pair", () => {
        const directory = root();
        const handoff = createFileUpdateFeedHandoff(
            directory,
            () => new Date("2026-08-07T06:00:00.000Z"),
        );

        const current = "github-release:Ding-Ding-Projects/worldlens:win32-x64";
        const legacy = "github-release:Ding-Ding-Projects/material-bluemap:win32-x64";
        expect(handoff.isCurrentConfirmed(current, legacy)).toBe(false);
        handoff.confirmCurrent(current, legacy);

        const nextLaunch = createFileUpdateFeedHandoff(directory);
        expect(nextLaunch.isCurrentConfirmed(current, legacy)).toBe(true);
        expect(nextLaunch.isCurrentConfirmed(`${current}-arm64`, legacy)).toBe(false);
        expect(
            JSON.parse(readFileSync(join(directory, UPDATE_FEED_HANDOFF_FILE), "utf8")),
        ).toMatchObject({
            version: 2,
            currentIdentity: current,
            legacyIdentity: legacy,
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
