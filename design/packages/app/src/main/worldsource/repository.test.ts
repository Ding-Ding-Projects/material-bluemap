/**
 * Reading a repository out of whatever somebody had in the clipboard.
 *
 * The refusals matter more than the acceptances here: `owner` is interpolated into a
 * GitHub API path, so anything that gets through this and should not have is a request
 * addressed somewhere nobody meant.
 */

import { describe, expect, it } from "vitest";
import { formatReference, isValidReference, parseWorldSourceReference } from "./repository.js";

describe("parseWorldSourceReference", () => {
    it("reads the bare pair", () => {
        expect(parseWorldSourceReference("cafepromenade/Andyville-World")).toEqual({
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: null,
        });
    });

    it("reads every URL spelling a browser or a clone dialog produces", () => {
        const expected = { owner: "cafepromenade", repo: "Andyville-World", tag: null };
        expect(parseWorldSourceReference("github.com/cafepromenade/Andyville-World")).toEqual(expected);
        expect(parseWorldSourceReference("https://github.com/cafepromenade/Andyville-World")).toEqual(
            expected,
        );
        expect(
            parseWorldSourceReference("https://www.github.com/cafepromenade/Andyville-World/"),
        ).toEqual(expected);
        // The `.git` belongs to the clone URL, not to the repository. Left on, every
        // lookup 404s and the message says the release does not exist.
        expect(
            parseWorldSourceReference("https://github.com/cafepromenade/Andyville-World.git"),
        ).toEqual(expected);
    });

    it("keeps the tag out of a release link, because that link means that release", () => {
        expect(
            parseWorldSourceReference(
                "https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001",
            ),
        ).toEqual({
            owner: "cafepromenade",
            repo: "Andyville-World",
            tag: "andyville-backup-20260804-160001",
        });
    });

    it("keeps a tag that has slashes in it", () => {
        expect(
            parseWorldSourceReference("https://github.com/o/r/releases/tag/release/1.4"),
        ).toEqual({ owner: "o", repo: "r", tag: "release/1.4" });
    });

    it("refuses names GitHub could not have, rather than encoding them and hoping", () => {
        expect(parseWorldSourceReference("../../etc/passwd")).toBeNull();
        expect(parseWorldSourceReference("owner")).toBeNull();
        expect(parseWorldSourceReference("")).toBeNull();
        expect(parseWorldSourceReference("   ")).toBeNull();
        expect(parseWorldSourceReference("-leading/repo")).toBeNull();
        expect(parseWorldSourceReference("a--b/repo")).toBeNull();
        expect(parseWorldSourceReference(`${"x".repeat(40)}/repo`)).toBeNull();
        expect(parseWorldSourceReference("owner/re po")).toBeNull();
    });

    it("refuses another forge rather than treating it as GitHub", () => {
        expect(parseWorldSourceReference("https://gitlab.com/owner/repo")).toBeNull();
        expect(parseWorldSourceReference("ssh://git@example.com/owner/repo")).toBeNull();
    });

    it("never throws on a partly typed field", () => {
        for (const text of ["h", "https:/", "owner/", "/", "//", "github.com/"]) {
            expect(() => parseWorldSourceReference(text)).not.toThrow();
        }
    });
});

describe("isValidReference", () => {
    it("accepts dots and underscores in a repository and not in an owner", () => {
        expect(isValidReference("owner", "my.world_repo-1")).toBe(true);
        expect(isValidReference("own.er", "repo")).toBe(false);
    });
});

describe("formatReference", () => {
    it("is for messages, and reads the way a person would say it", () => {
        expect(formatReference({ owner: "cafepromenade", repo: "Andyville-World" })).toBe(
            "cafepromenade/Andyville-World",
        );
    });
});
