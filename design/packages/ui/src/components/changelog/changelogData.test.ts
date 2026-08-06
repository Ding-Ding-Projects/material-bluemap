/**
 * The generated changelog, checked against the repository it claims to describe.
 *
 * `scripts/build-changelog.mjs` validates every SHA before it writes anything, but that check
 * only runs when somebody runs the generator. This one runs on every `pnpm test`, so a hand
 * edit to the generated file, a rebase that rewrote history, or a merge that resurrected an old
 * copy of the data is caught by the suite rather than by a reader clicking a link into a 404.
 *
 * ### Why the git assertions are conditional
 *
 * A default `actions/checkout` is a depth-1 clone: HEAD is the only commit the runner has, so
 * `git cat-file -e` on an older SHA fails for a reason that has nothing to do with the
 * changelog being correct. The existence check therefore runs where the history is complete -
 * every developer machine, and any CI job checked out with `fetch-depth: 0` - and the shape
 * checks, which need no history at all, run everywhere. A skip is reported in the test name
 * rather than being silent, because a check nobody can tell is not running is a check that
 * eventually stops running everywhere.
 */

import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
    CHANGELOG_REPOSITORY_URL,
    CHANGELOG_UNRELEASED,
    CHANGELOG_VERSIONS,
} from "./changelogData.generated.js";
import { CHANGELOG_CATEGORIES, type ChangelogEntry } from "./changelogModel.js";
import { isDayKey } from "./changelogDates.js";

const entries: ChangelogEntry[] = [
    ...CHANGELOG_UNRELEASED,
    ...CHANGELOG_VERSIONS.flatMap((version) => [...version.entries]),
];

/** True when git is available here and the clone carries its whole history. */
function historyIsComplete(): boolean {
    try {
        const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
            encoding: "utf8",
            stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        return shallow === "false";
    } catch {
        return false;
    }
}

const complete = historyIsComplete();

describe("the generated changelog", () => {
    it("covers every released version, not only the newest", () => {
        expect(CHANGELOG_VERSIONS.length).toBeGreaterThan(0);
        for (const version of CHANGELOG_VERSIONS) {
            expect(version.tag).toMatch(/^v\d+\.\d+\.\d+/);
            expect(version.version).toBe(version.tag.replace(/^v/, ""));
            expect(version.commit).toMatch(/^[0-9a-f]{40}$/);
            expect(isDayKey(version.date.slice(0, 10))).toBe(true);
        }
    });

    it("is ordered newest first, which is the order it is rendered in", () => {
        const days = CHANGELOG_VERSIONS.map((version) => version.date);
        expect([...days].sort().reverse()).toEqual(days);
    });

    it("resolves its commit links against this repository", () => {
        expect(CHANGELOG_REPOSITORY_URL).toBe("https://github.com/Ding-Ding-Projects/material-bluemap");
    });

    it("carries a full SHA on every entry, with the short form a real prefix of it", () => {
        expect(entries.length).toBeGreaterThan(0);
        for (const entry of entries) {
            expect(entry.sha).toMatch(/^[0-9a-f]{40}$/);
            expect(entry.sha.startsWith(entry.shortSha)).toBe(true);
            expect(entry.shortSha.length).toBeGreaterThanOrEqual(7);
        }
    });

    it("renders no two commits the same, so no link is ambiguous", () => {
        const short = new Map<string, string>();
        for (const entry of entries) {
            const existing = short.get(entry.shortSha);
            if (existing !== undefined) expect(existing).toBe(entry.sha);
            short.set(entry.shortSha, entry.sha);
        }
    });

    it("records each commit exactly once across the whole changelog", () => {
        expect(new Set(entries.map((entry) => entry.sha)).size).toBe(entries.length);
    });

    it("files every entry under a category the viewer can label", () => {
        for (const entry of entries) {
            expect(CHANGELOG_CATEGORIES).toContain(entry.category);
            expect(entry.areas).toContain(entry.category);
            for (const area of entry.areas) expect(CHANGELOG_CATEGORIES).toContain(area);
        }
    });

    it("carries a real subject and a real date on every entry", () => {
        for (const entry of entries) {
            expect(entry.subject.trim().length).toBeGreaterThan(0);
            // `git log %cI` prints `Z` rather than `+00:00` for a commit made in UTC, and CI
            // makes plenty of those, so both spellings of the offset are the real shape here.
            expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/);
            expect(isDayKey(entry.date.slice(0, 10))).toBe(true);
        }
    });

    it("marks a summary entry with a count of what it summarises", () => {
        for (const entry of entries) {
            if (entry.summarizes === undefined) continue;
            expect(entry.summarizes).toBeGreaterThan(0);
        }
    });

    it("keeps the trailers out of the bodies it will search and export", () => {
        for (const entry of entries) {
            expect(entry.details).not.toMatch(/Co-Authored-By:\s*$/);
        }
    });

    it.runIf(complete)("references only commits that exist in this repository", () => {
        const shas = [...entries.map((entry) => entry.sha), ...CHANGELOG_VERSIONS.map((v) => v.commit)];
        const answers = execFileSync("git", ["cat-file", "--batch-check"], {
            encoding: "utf8",
            input: shas.map((sha) => `${sha}^{commit}`).join("\n") + "\n",
            maxBuffer: 32 * 1024 * 1024,
        })
            .split("\n")
            .filter((line) => line.trim().length > 0);

        const dead = answers.filter((answer) => !/^[0-9a-f]{40} commit \d+$/.test(answer));
        expect(dead, "the changelog references commits that are not in this repository").toEqual([]);
        expect(answers).toHaveLength(shas.length);
    });

    it.skipIf(complete)("skips the commit-existence check: this clone has no full history", () => {
        expect(complete).toBe(false);
    });

    it.runIf(complete)("says the same thing the git history says about each subject", () => {
        // A spot check rather than all 86: the point is that the subjects were read from git
        // rather than typed, and one mismatch would mean the whole file was.
        for (const entry of entries.slice(0, 5)) {
            const subject = execFileSync("git", ["log", "-1", "--format=%s", entry.sha], {
                encoding: "utf8",
            }).trim();
            expect(subject).toBe(entry.subject);
        }
    });
});
