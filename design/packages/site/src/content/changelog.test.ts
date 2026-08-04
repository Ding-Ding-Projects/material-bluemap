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
});
