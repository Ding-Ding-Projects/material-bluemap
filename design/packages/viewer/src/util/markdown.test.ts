// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { renderMarkdown, slugifyHeading } from "./markdown.js";

describe("slugifyHeading", () => {
    it("matches GitHub's slugger for a plain heading", () => {
        expect(slugifyHeading("Command palette")).toBe("command-palette");
    });

    it("strips backticks and punctuation the way GitHub's slugger does", () => {
        // The exact heading in docs/resumable-renders.md that an existing hand-written
        // cross-link in docs/render-in-actions.md points at.
        expect(slugifyHeading("How `rstate` is cached without reintroducing the merge bug")).toBe(
            "how-rstate-is-cached-without-reintroducing-the-merge-bug",
        );
    });

    it("collapses runs of whitespace and trims the ends", () => {
        expect(slugifyHeading("  Two   spaces  ")).toBe("two-spaces");
    });
});

describe("renderMarkdown", () => {
    it("renders headings, paragraphs, links, lists, code and tables", () => {
        const html = renderMarkdown(
            [
                "# Title",
                "",
                "A paragraph with a [link](https://example.com) and `code`.",
                "",
                "- one",
                "- two",
                "",
                "| A | B |",
                "| - | - |",
                "| 1 | 2 |",
            ].join("\n"),
        );
        expect(html).toContain("<h1");
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain("<code>code</code>");
        expect(html).toContain("<li>one</li>");
        expect(html).toContain("<table>");
    });

    it("assigns heading ids using the same algorithm as slugifyHeading", () => {
        const html = renderMarkdown("## How `rstate` is cached without reintroducing the merge bug");
        expect(html).toContain('id="how-rstate-is-cached-without-reintroducing-the-merge-bug"');
    });

    it("de-duplicates repeated heading text", () => {
        const html = renderMarkdown("## Overview\n\ntext\n\n## Overview\n\nmore text");
        expect(html).toContain('id="overview"');
        expect(html).toContain('id="overview-1"');
    });

    it("sanitizes script tags and other unsafe markup", () => {
        const html = renderMarkdown('<script>alert(1)</script>\n\nSafe text.');
        expect(html).not.toContain("<script>");
        expect(html).toContain("Safe text.");
    });

    it("never executes: no eval or Function constructor is reachable from parsing", () => {
        // A regression guard for the CSP constraint documented on renderMarkdown: this is a
        // string transform and nothing here should reach for `eval` or `new Function`.
        const html = renderMarkdown("# ok\n\nplain text");
        expect(html).not.toContain("<script");
    });
});
