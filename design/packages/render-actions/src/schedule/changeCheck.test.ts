import { describe, expect, it } from "vitest";
import { evaluateScheduleChange } from "./changeCheck.js";

describe("the world cannot be found", () => {
    it("is an error, never a change, whatever the source kind", () => {
        for (const kind of ["repository", "release-asset", "url", "git"] as const) {
            const result = evaluateScheduleChange(kind, { digest: "v1:aa" }, null);
            expect(result.result).toBe("error");
        }
    });
});

describe("no earlier check is recorded", () => {
    it("is 'changed', which establishes the baseline and renders once", () => {
        const result = evaluateScheduleChange("repository", null, { digest: "v1:aa" });
        expect(result.result).toBe("changed");
    });
});

describe("repository source", () => {
    it("is unchanged when the fingerprint digest matches", () => {
        const result = evaluateScheduleChange("repository", { digest: "v1:aa" }, { digest: "v1:aa" });
        expect(result.result).toBe("unchanged");
    });

    it("is changed when the fingerprint digest differs", () => {
        const result = evaluateScheduleChange("repository", { digest: "v1:aa" }, { digest: "v1:bb" });
        expect(result.result).toBe("changed");
    });

    it("is an error when a digest is missing from either side", () => {
        expect(evaluateScheduleChange("repository", {}, { digest: "v1:aa" }).result).toBe("error");
        expect(evaluateScheduleChange("repository", { digest: "v1:aa" }, {}).result).toBe("error");
    });
});

describe("release-asset source", () => {
    it("prefers GitHub's own digest when both sides have one", () => {
        const previous = { digest: "sha256:aa", size: 100, updatedAt: "2026-08-01T00:00:00Z" };
        const current = { digest: "sha256:bb", size: 100, updatedAt: "2026-08-01T00:00:00Z" };
        // Same size and time, different digest: the digest wins, so this is "changed".
        expect(evaluateScheduleChange("release-asset", previous, current).result).toBe("changed");
    });

    it("is unchanged when the digest matches even though metadata looks different", () => {
        const previous = { digest: "sha256:aa", size: 100, updatedAt: "2026-08-01T00:00:00Z" };
        const current = { digest: "sha256:aa", size: 999, updatedAt: "2026-08-02T00:00:00Z" };
        expect(evaluateScheduleChange("release-asset", previous, current).result).toBe("unchanged");
    });

    it("falls back to size and upload time when neither side has a digest", () => {
        const previous = { size: 100, updatedAt: "2026-08-01T00:00:00Z" };
        const sameAgain = { size: 100, updatedAt: "2026-08-01T00:00:00Z" };
        const grown = { size: 200, updatedAt: "2026-08-01T00:00:00Z" };
        const reuploaded = { size: 100, updatedAt: "2026-08-02T00:00:00Z" };
        expect(evaluateScheduleChange("release-asset", previous, sameAgain).result).toBe("unchanged");
        expect(evaluateScheduleChange("release-asset", previous, grown).result).toBe("changed");
        expect(evaluateScheduleChange("release-asset", previous, reuploaded).result).toBe("changed");
    });

    it("is an error when even the fallback metadata is missing", () => {
        expect(evaluateScheduleChange("release-asset", {}, { size: 1, updatedAt: "x" }).result).toBe("error");
    });
});

describe("url source", () => {
    it("prefers ETag when both sides sent one", () => {
        expect(
            evaluateScheduleChange("url", { etag: '"a"' }, { etag: '"a"' }).result,
        ).toBe("unchanged");
        expect(
            evaluateScheduleChange("url", { etag: '"a"' }, { etag: '"b"' }).result,
        ).toBe("changed");
    });

    it("falls back to Content-Length and Last-Modified without an ETag", () => {
        const previous = { contentLength: 100, lastModified: "Mon, 01 Aug 2026 00:00:00 GMT" };
        const same = { contentLength: 100, lastModified: "Mon, 01 Aug 2026 00:00:00 GMT" };
        const grown = { contentLength: 200, lastModified: "Mon, 01 Aug 2026 00:00:00 GMT" };
        expect(evaluateScheduleChange("url", previous, same).result).toBe("unchanged");
        expect(evaluateScheduleChange("url", previous, grown).result).toBe("changed");
    });

    it("is 'unknown', never a guessed change, when the server sends no comparable header", () => {
        const result = evaluateScheduleChange("url", {}, {});
        expect(result.result).toBe("unknown");
        expect(result.reason.toLowerCase()).toContain("download");
    });
});

describe("git source", () => {
    it("is unchanged when the branch tip's SHA matches", () => {
        const result = evaluateScheduleChange("git", { sha: "a".repeat(40) }, { sha: "a".repeat(40) });
        expect(result.result).toBe("unchanged");
    });

    it("is changed when the branch tip's SHA differs - the only signal a git source has", () => {
        const result = evaluateScheduleChange("git", { sha: "a".repeat(40) }, { sha: "b".repeat(40) });
        expect(result.result).toBe("changed");
    });

    it("is an error when a SHA is missing from either side, rather than guessing", () => {
        expect(evaluateScheduleChange("git", {}, { sha: "a".repeat(40) }).result).toBe("error");
        expect(evaluateScheduleChange("git", { sha: "a".repeat(40) }, {}).result).toBe("error");
    });
});
