/**
 * The seam that lets `discoverRelease` on the downloads bridge answer from
 * `worldsource:discover` instead of `download:discover`, without the panel's own contract
 * changing underneath it.
 *
 * This is the part of the wiring gap `docs/world-sources.md` used to warn about that is
 * worth a test of its own: `ReleaseDownloads.vue` was built against
 * `DiscoveredRelease.downloads` - a plain `{ name, split, parts, bytes }[]` - and
 * `worldsource:discover` answers with `sources`, each carrying a `kind` instead of a
 * `split`. A test that only stubbed the IPC channel and asserted on the panel would prove
 * the plumbing connects; it would not prove a checksum-list release renders as a split
 * download rather than crashing on a field that no longer exists.
 */

import { describe, expect, it } from "vitest";
import { toBridgeCoordinates, toBridgeDiscoveryResult } from "./worldSourceBridge.js";
import type { WorldSourceDiscoverAnswer, WorldSourceReferenceAnswer } from "./worldSourceBridge.js";

describe("toBridgeDiscoveryResult", () => {
    it("reports a checksum-list world as split, the same as a manifest one", () => {
        const answer: WorldSourceDiscoverAnswer = {
            ok: true,
            release: {
                owner: "cafepromenade",
                repo: "Andyville-World",
                tag: "andyville-backup-20260804-160001",
                name: "Andyville world",
                htmlUrl: "https://github.com/cafepromenade/Andyville-World/releases/tag/x",
                sources: [
                    {
                        name: "andyville-world-20260804-160001.zip",
                        kind: "checksums",
                        parts: 4,
                        bytes: 6_600_000_000,
                        verification: "checksum-list",
                    },
                ],
            },
        };

        const result = toBridgeDiscoveryResult(answer);

        expect(result).toEqual({
            ok: true,
            release: {
                tag: "andyville-backup-20260804-160001",
                name: "Andyville world",
                htmlUrl: "https://github.com/cafepromenade/Andyville-World/releases/tag/x",
                downloads: [
                    {
                        name: "andyville-world-20260804-160001.zip",
                        split: true,
                        parts: 4,
                        bytes: 6_600_000_000,
                    },
                ],
            },
        });
    });

    it("reports this project's own parts manifest as split too", () => {
        const answer: WorldSourceDiscoverAnswer = {
            ok: true,
            release: {
                owner: "Ding-Ding-Projects",
                repo: "worldlens",
                tag: "v1.4.0",
                name: "Har Gow",
                htmlUrl: "https://github.com/Ding-Ding-Projects/worldlens/releases/tag/v1.4.0",
                sources: [
                    {
                        name: "test-world-seed-1739.zip",
                        kind: "manifest",
                        parts: 3,
                        bytes: 4_030_000_000,
                        verification: "manifest",
                    },
                ],
            },
        };

        const result = toBridgeDiscoveryResult(answer);
        expect(result.ok).toBe(true);
        expect(result.ok && result.release.downloads).toEqual([
            { name: "test-world-seed-1739.zip", split: true, parts: 3, bytes: 4_030_000_000 },
        ]);
    });

    it("reports an unsplit asset as one part, matching what the manifest-only path always said", () => {
        const answer: WorldSourceDiscoverAnswer = {
            ok: true,
            release: {
                owner: "o",
                repo: "r",
                tag: "v1",
                name: "v1",
                htmlUrl: "https://github.com/o/r/releases/tag/v1",
                sources: [
                    { name: "worldlens-setup.exe", kind: "whole", parts: 1, bytes: 91_400_000, verification: "none" },
                ],
            },
        };

        expect(toBridgeDiscoveryResult(answer)).toEqual({
            ok: true,
            release: {
                tag: "v1",
                name: "v1",
                htmlUrl: "https://github.com/o/r/releases/tag/v1",
                downloads: [{ name: "worldlens-setup.exe", split: false, parts: 1, bytes: 91_400_000 }],
            },
        });
    });

    it("passes a release with nothing downloadable through as an empty list, not an error", () => {
        const answer: WorldSourceDiscoverAnswer = {
            ok: true,
            release: {
                owner: "o",
                repo: "r",
                tag: "v1",
                name: "v1",
                htmlUrl: "https://github.com/o/r/releases/tag/v1",
                sources: [],
            },
        };

        expect(toBridgeDiscoveryResult(answer)).toEqual({
            ok: true,
            release: { tag: "v1", name: "v1", htmlUrl: "https://github.com/o/r/releases/tag/v1", downloads: [] },
        });
    });

    it("carries the message through on failure and drops the code, which nothing downstream reads", () => {
        const answer: WorldSourceDiscoverAnswer = {
            ok: false,
            message: "cafepromenade/Andyville-World has no release called 'nope'.",
            code: "release-not-found",
        };

        expect(toBridgeDiscoveryResult(answer)).toEqual({
            ok: false,
            message: "cafepromenade/Andyville-World has no release called 'nope'.",
        });
    });
});

describe("toBridgeCoordinates", () => {
    it("carries a tag through when the pasted link named one", () => {
        const reference: WorldSourceReferenceAnswer = {
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: "andyville-backup-20260804-160001",
        };

        expect(toBridgeCoordinates(reference)).toEqual({
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: "andyville-backup-20260804-160001",
        });
    });

    it("omits the tag key rather than inventing an empty one, when the link named none", () => {
        const reference: WorldSourceReferenceAnswer = { owner: "cafepromenade", repo: "Andyville-World", tag: null };

        const coordinates = toBridgeCoordinates(reference);

        expect(coordinates).toEqual({ owner: "cafepromenade", repo: "Andyville-World" });
        expect(coordinates && "tag" in coordinates).toBe(false);
    });

    it("is null for text that named no repository, so a field mid-keystroke is left alone", () => {
        expect(toBridgeCoordinates(null)).toBeNull();
    });
});
