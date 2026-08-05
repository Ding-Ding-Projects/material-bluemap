import { describe, expect, it } from "vitest";
import { parseChangelog } from "./changelogParser.js";

describe("changelog parser", () => {
    it("keeps version, category, subject, and verified commit links together", () => {
        const rows = parseChangelog([
            "# Changelog",
            "## 1.2.3 - 2026-08-04",
            "### Rendering",
            "- Paint the map - [`abc1234`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/abc1234567890)",
            "## Unreleased",
            "### Fixes",
            "- Keep the empty state honest",
        ].join("\n"));
        expect(rows).toEqual([
            {
                id: "1.2.3:Rendering:0",
                version: "1.2.3",
                date: "2026-08-04",
                category: "Rendering",
                subject: "Paint the map",
                commit: "abc1234",
                commitUrl: "https://github.com/Ding-Ding-Projects/material-bluemap/commit/abc1234567890",
            },
            {
                id: "Unreleased:Fixes:1",
                version: "Unreleased",
                date: "",
                category: "Fixes",
                subject: "Keep the empty state honest",
                commit: null,
                commitUrl: null,
            },
        ]);
    });

    /**
     * `scripts/build-changelog.mjs` renders a merge commit's entry with prose trailing its
     * commit link - `_(summary of N commits, also listed here)_` - because the merge also
     * summarises the commits it brought in. The `ENTRY` regex used to only strip the link when
     * nothing followed it on the line, so this exact shape (taken from a real "Merge pull
     * request" line in this repository's own CHANGELOG.md) left the raw `- [\`sha\`](url)`
     * markdown sitting inside `subject` and `commit`/`commitUrl` both null. The fix must
     * extract the link regardless of what trails it, and fold that trailing prose back onto
     * the subject rather than dropping it - it is real content ("this summarises 20 commits"),
     * not markup.
     */
    it("extracts the commit link from a merge entry even though prose trails it", () => {
        const rows = parseChangelog([
            "## Unreleased",
            "### Documentation",
            "- Merge pull request #26 from Ding-Ding-Projects/pages-material3-full-continuation - " +
                "[`5c1254ce44`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5c1254ce44e227d2f383d8d67f01dfbee65964d3) " +
                "_(summary of 20 commits, also listed here)_",
        ].join("\n"));
        expect(rows).toEqual([
            {
                id: "Unreleased:Documentation:0",
                version: "Unreleased",
                date: "",
                category: "Documentation",
                subject:
                    "Merge pull request #26 from Ding-Ding-Projects/pages-material3-full-continuation " +
                    "_(summary of 20 commits, also listed here)_",
                commit: "5c1254ce44",
                commitUrl: "https://github.com/Ding-Ding-Projects/material-bluemap/commit/5c1254ce44e227d2f383d8d67f01dfbee65964d3",
            },
        ]);
    });

    it("extracts the commit link when arbitrary trailing prose follows it, not only the merge-summary wording", () => {
        // The regex must not be special-cased to the literal "_(summary of N commits...)_"
        // string - it has to work for whatever legitimately trails a commit link.
        const rows = parseChangelog([
            "## Unreleased",
            "### Notes",
            "- Ship the thing - [`0123456789`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0123456789abcdef0123456789abcdef01234567) (see also #42)",
        ].join("\n"));
        expect(rows).toEqual([
            {
                id: "Unreleased:Notes:0",
                version: "Unreleased",
                date: "",
                category: "Notes",
                subject: "Ship the thing (see also #42)",
                commit: "0123456789",
                commitUrl: "https://github.com/Ding-Ding-Projects/material-bluemap/commit/0123456789abcdef0123456789abcdef01234567",
            },
        ]);
    });

    it("never leaves the raw commit-link markdown embedded in a parsed subject", () => {
        const rows = parseChangelog([
            "## Unreleased",
            "### Documentation",
            "- Merge current default history into Pages continuation - " +
                "[`857a16da4a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/857a16da4af93c85647fdad172695d852ab1c2c6) " +
                "_(summary of 5 commits, also listed here)_",
        ].join("\n"));
        expect(rows).toHaveLength(1);
        expect(rows[0]?.subject).not.toMatch(/\[`[0-9a-f]+`\]\(https:\/\//);
        expect(rows[0]?.commit).not.toBeNull();
        expect(rows[0]?.commitUrl).not.toBeNull();
    });

    it("still parses a genuinely link-less entry as having no commit", () => {
        const rows = parseChangelog(["## Unreleased", "### Fixes", "- Keep the empty state honest"].join("\n"));
        expect(rows).toEqual([
            {
                id: "Unreleased:Fixes:0",
                version: "Unreleased",
                date: "",
                category: "Fixes",
                subject: "Keep the empty state honest",
                commit: null,
                commitUrl: null,
            },
        ]);
    });
});
