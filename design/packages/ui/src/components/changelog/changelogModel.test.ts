/**
 * The changelog's filters and its exports.
 *
 * The claims worth pinning here are the ones a reader would be misled by if they broke
 * quietly. That the two filters compose with "and" rather than one overriding the other. That a
 * version filtered down to nothing disappears while a version that genuinely shipped nothing
 * stays and says so, because those two facts must never look the same. And that an export
 * states what was filtered out of it and keeps the full SHA in text, so a changelog that has
 * left this app is still traceable to the commits it describes.
 */

import { describe, expect, it } from "vitest";
import { createSettingMatcher } from "../config/regexEngine.js";
import {
    type ChangelogEntry,
    type ChangelogVersion,
    type ExportLabels,
    changelogSampleText,
    commitUrl,
    entryMatches,
    entrySearchText,
    filterChangelog,
    toMarkdown,
    toPlainText,
} from "./changelogModel.js";

const REPO = "https://github.com/Ding-Ding-Projects/worldlens";

function entry(overrides: Partial<ChangelogEntry> & { sha: string }): ChangelogEntry {
    return {
        shortSha: overrides.sha.slice(0, 10),
        date: "2026-08-03T12:00:00-04:00",
        subject: "A change",
        details: "",
        category: "interface",
        areas: ["interface"],
        files: 1,
        ...overrides,
    };
}

const roboto = entry({
    sha: "5c89904000000000000000000000000000000001",
    date: "2026-08-01T10:00:00-04:00",
    subject: "Bundle Roboto, the typeface every surface asked for",
    details: "Windows ships no Roboto, so the chrome rendered in Arial.",
    category: "interface",
    areas: ["interface", "docs"],
});

const tiles = entry({
    sha: "499e338000000000000000000000000000000002",
    date: "2026-08-04T09:00:00-04:00",
    subject: "Load a boundary tile's chunks before judging it ungenerated",
    category: "engine",
    areas: ["engine"],
});

const merged = entry({
    sha: "94725e3000000000000000000000000000000003",
    date: "2026-08-02T09:00:00-04:00",
    subject: "Merge the porting branch",
    category: "build",
    areas: ["build"],
    summarizes: 4,
});

const versions: ChangelogVersion[] = [
    {
        version: "0.1.0-build.117",
        tag: "v0.1.0-build.117",
        date: "2026-08-04T00:04:51-04:00",
        commit: "7a56827700000000000000000000000000000010",
        entries: [tiles],
    },
    {
        version: "0.1.0-build.100",
        tag: "v0.1.0-build.100",
        date: "2026-08-02T10:00:00-04:00",
        commit: "744f7da50000000000000000000000000000011",
        entries: [merged, roboto],
    },
    {
        version: "0.1.0-build.99",
        tag: "v0.1.0-build.99",
        date: "2026-08-02T10:00:00-04:00",
        commit: "744f7da50000000000000000000000000000011",
        entries: [],
    },
];

const unfiltered = { matcher: () => true, from: null, to: null, active: false };

describe("filtering", () => {
    it("shows everything when nothing is filtering", () => {
        const view = filterChangelog(versions, [], unfiltered);
        expect(view.shown).toBe(3);
        expect(view.total).toBe(3);
        expect(view.versions).toHaveLength(3);
    });

    it("counts the unreleased entries in the total, because they are part of the record", () => {
        const view = filterChangelog(versions, [entry({ sha: "a".repeat(40) })], unfiltered);
        expect(view.total).toBe(4);
        expect(view.unreleasedEntries).toHaveLength(1);
    });

    it("composes the date range with the search rather than letting either win", () => {
        const matcher = createSettingMatcher("tile", false, "i");
        const both = filterChangelog(versions, [], {
            matcher: matcher.test,
            from: "2026-08-01",
            to: "2026-08-03",
            active: true,
        });
        // "tile" matches only the entry dated the 4th, which the range excludes. A filter that
        // overrode the other would show one entry here.
        expect(both.shown).toBe(0);

        const searchOnly = filterChangelog(versions, [], {
            matcher: matcher.test,
            from: null,
            to: null,
            active: true,
        });
        expect(searchOnly.shown).toBe(1);
    });

    it("filters on the commit's own day, taken from its own offset", () => {
        const view = filterChangelog(versions, [], {
            matcher: () => true,
            from: "2026-08-04",
            to: "2026-08-04",
            active: true,
        });
        expect(view.shown).toBe(1);
        expect(view.versions[0]?.entries[0]?.sha).toBe(tiles.sha);
    });

    it("keeps a version that shipped nothing, and marks it, while nothing is filtering", () => {
        // Not a match and not a mistake: a release that carried no changes of its own. Hiding
        // it would leave a gap in the version list that a reader would read as lost history.
        const view = filterChangelog(versions, [], unfiltered);
        const build99 = view.versions.find((v) => v.version.tag === "v0.1.0-build.99");
        expect(build99?.empty).toBe(true);
        expect(build99?.entries).toEqual([]);
    });

    it("drops both the filtered-out versions and the empty one once a filter is on", () => {
        const view = filterChangelog(versions, [], {
            matcher: createSettingMatcher("Roboto", false, "i").test,
            from: null,
            to: null,
            active: true,
        });
        const tags = view.versions.map((filtered) => filtered.version.tag);
        expect(tags).toEqual(["v0.1.0-build.100"]);
        // A version with no text and no dates in it cannot have matched anything, so leaving it
        // on screen beside a result would claim it did.
        expect(tags).not.toContain("v0.1.0-build.99");
    });

    it("groups an entry under one category, in the fixed category order", () => {
        const view = filterChangelog(versions, [], unfiltered);
        const build100 = view.versions.find((v) => v.version.tag === "v0.1.0-build.100");
        expect(build100?.sections.map((section) => section.category)).toEqual(["interface", "build"]);
    });

    it("searches the body and the SHA, not only the subject", () => {
        const text = entrySearchText(roboto);
        expect(text).toContain("Arial");
        expect(text).toContain(roboto.sha);
        expect(entryMatches(roboto, { ...unfiltered, matcher: createSettingMatcher("arial", false, "i").test })).toBe(true);
        expect(entryMatches(roboto, { ...unfiltered, matcher: createSettingMatcher(roboto.shortSha, false, "i").test })).toBe(true);
    });

    it("supports a regular expression, because the search bar offers one", () => {
        const matcher = createSettingMatcher("^Load .*chunks", true, "im");
        const view = filterChangelog(versions, [], { matcher: matcher.test, from: null, to: null, active: true });
        expect(view.shown).toBe(1);
    });

    it("previews the builder against the corpus the search actually runs over", () => {
        const sample = changelogSampleText(versions, []);
        expect(sample.split("\n")).toHaveLength(3);
        expect(sample).toContain(tiles.shortSha);
    });
});

describe("commit links", () => {
    it("resolves against the repository the changelog was generated from", () => {
        expect(commitUrl(REPO, roboto.sha)).toBe(`${REPO}/commit/${roboto.sha}`);
        expect(commitUrl(`${REPO}/`, roboto.sha)).toBe(`${REPO}/commit/${roboto.sha}`);
    });
});

const labels: ExportLabels = {
    title: "Changelog",
    range: "This file holds 3 of 3 entries. No filter was applied.",
    unreleased: "Unreleased",
    categories: {
        interface: "Interface",
        engine: "Rendering and world data",
        services: "Server, CLI and configuration",
        shell: "Desktop shell",
        site: "Landing page and documentation site",
        build: "Build, release and tooling",
        docs: "Documentation",
        other: "Elsewhere in the repository",
    },
    noChanges: "No changes were recorded for this version.",
    summary: (count) => `Summary of ${count} commits`,
    noMatches: "Nothing matched these filters.",
};

describe("export", () => {
    const view = filterChangelog(versions, [entry({ sha: "b".repeat(40), subject: "Not yet released" })], unfiltered);

    it("opens with the range statement, so a copied file says what it holds", () => {
        expect(toMarkdown(view, { repositoryUrl: REPO, labels })).toContain(labels.range);
        expect(toPlainText(view, { repositoryUrl: REPO, labels })).toContain(labels.range);
    });

    it("keeps every version, not only the newest", () => {
        const markdown = toMarkdown(view, { repositoryUrl: REPO, labels });
        expect(markdown).toContain("## 0.1.0-build.117");
        expect(markdown).toContain("## 0.1.0-build.100");
        expect(markdown).toContain("## Unreleased");
    });

    it("carries the SHA in text form, which is what keeps a copy traceable", () => {
        expect(toMarkdown(view, { repositoryUrl: REPO, labels })).toContain(
            `[\`${roboto.shortSha}\`](${REPO}/commit/${roboto.sha})`,
        );
        expect(toPlainText(view, { repositoryUrl: REPO, labels })).toContain(`[${roboto.sha}]`);
    });

    it("says a merge entry is a summary rather than letting it read as a change of its own", () => {
        expect(toMarkdown(view, { repositoryUrl: REPO, labels })).toContain("Summary of 4 commits");
    });

    it("states a version that recorded nothing instead of leaving a blank heading", () => {
        expect(toMarkdown(view, { repositoryUrl: REPO, labels })).toContain(labels.noChanges);
    });

    it("honours a selection, and then exports only what was selected", () => {
        const markdown = toMarkdown(view, {
            repositoryUrl: REPO,
            labels,
            selection: new Set([roboto.sha]),
        });
        expect(markdown).toContain(roboto.subject);
        expect(markdown).not.toContain(tiles.subject);
        // A version with nothing recorded is not "selected", so it is not in a selective export.
        expect(markdown).not.toContain(labels.noChanges);
    });

    it("says so honestly when the filters left nothing at all", () => {
        const empty = filterChangelog([], [], unfiltered);
        expect(toMarkdown(empty, { repositoryUrl: REPO, labels })).toContain(labels.noMatches);
        expect(toPlainText(empty, { repositoryUrl: REPO, labels })).toContain(labels.noMatches);
    });
});
