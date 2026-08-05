/**
 * The changelog page's phone-width overflow, and what keeps it fixed.
 *
 * A visitor on a phone (390-430 CSS px) got a Changelog page that scrolled sideways: the whole
 * `.mb-changelog` section - title, the date-range filter row, the search box, every entry -
 * rendered 701px wide inside a 390px viewport. Measured with the workspace's bundled
 * playwright-core at documentElement.scrollWidth vs clientWidth; confirmed with a min-content
 * probe (`element.style.width = "min-content"`) that isolated `.mb-changelog-entry__subject`
 * as the actual driver, at 823px of unbreakable content.
 *
 * `.mb-changelog` is `display: grid` with no `grid-template-columns`, so it lays out as one
 * implicit `auto` column. An `auto` track's minimum size is the *largest* min-content
 * contribution among every item placed in it - and every direct child of `.mb-changelog`
 * (the title, the filter row, the search surface, every rendered entry) sits in that one
 * column, sharing its width via the grid item default of `justify-self: stretch`. Normal text
 * can still shrink a box down to its widest single word, because word-breaking is a wrap
 * opportunity CSS is allowed to use when computing min-content - but a run with no break
 * opportunity at all (a URL, here) cannot shrink past its own pixel width unless
 * `overflow-wrap: anywhere` says a mid-word break is fine too.
 *
 * That unbreakable run exists because of a *second*, separate bug: `changelogParser.ts`'s
 * `ENTRY` regex only strips a trailing `- [\`hash\`](url)` commit link when nothing follows it
 * on the line. Several "Merge pull request" entries in CHANGELOG.md have trailing prose after
 * the link (`_(summary of N commits, also listed here)_`), so the regex's optional group never
 * matches and the raw markdown - link text and all - becomes the parsed `subject`. That parser
 * gap is tracked separately (it is a data/content bug, not a layout one); the layout still has
 * to survive it, because *any* real commit subject can legitimately contain a long identifier,
 * a URL, or another unbreakable token, parser bug or not.
 *
 * `.mb-changelog-filters` (the date-range filter row) was never the source: its own
 * min-content, tested in isolation, is a modest ~120px. It only overflowed because it shares
 * `.mb-changelog`'s single grid column with the entry that was too wide, and grid items stretch
 * to their track's width by default. Fixing `.mb-changelog-entry__title` (and its commit link,
 * defensively, for the same reason) restored `.mb-changelog-filters` and everything else in the
 * column without touching the filter row's own CSS at all.
 *
 * This file asserts the *mechanism* rather than a rendered measurement, and reads the
 * stylesheet's own source rather than probing `getComputedStyle` in jsdom - the same technique
 * `theme/base.test.ts` uses for its `[hidden]` guard. jsdom has no layout engine: it never
 * computes intrinsic/min-content sizes, never lays out CSS Grid tracks, and
 * `element.scrollWidth`/`clientWidth` are always 0 there. A scrollWidth-based assertion would
 * pass or fail for reasons that have nothing to do with this bug (see the real reproduction in
 * this task's own Playwright-driven verification instead); reading the CSS rule that actually
 * fixes the intrinsic sizing is the assertion that can genuinely fail if the fix regresses.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Normalized to LF: a Windows checkout with core.autocrlf=true (the Git-for-Windows default,
// and this project is Windows-only) reads this file back with CRLF line endings even though
// the committed blob is LF-only. The markers below embed a literal `\n` between a rule's
// selector lines, so an un-normalized CRLF checkout makes `indexOf` fail to find a rule that
// genuinely exists - a false failure that has nothing to do with the stylesheet's content.
const contentCss = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "content.css"), "utf8").replace(
    /\r\n/g,
    "\n"
);

/**
 * The body of the first CSS rule whose selector (or selector list) starts with `marker`,
 * isolated by brace matching so an assertion cannot accidentally pass by matching an
 * unrelated, later rule that happens to share a property. Mirrors
 * `tabs/TabStrip.test.ts`'s `compactBlock()` helper.
 */
function ruleBody(marker: string): string {
    const start = contentCss.indexOf(marker);
    expect(start, `content.css has no rule starting with "${marker}"`).toBeGreaterThan(-1);
    const openBrace = contentCss.indexOf("{", start);
    let depth = 0;
    let index = openBrace;
    for (; index < contentCss.length; index += 1) {
        if (contentCss[index] === "{") depth += 1;
        else if (contentCss[index] === "}") {
            depth -= 1;
            if (depth === 0) break;
        }
    }
    return contentCss.slice(openBrace + 1, index);
}

describe("changelog entry text can break anywhere, not just at spaces", () => {
    it("lets a changelog entry's title/subject shrink past its longest unbreakable run", () => {
        // This is the actual fix: without it, a subject containing a URL or another
        // space-free token forces `.mb-changelog-entry__title`'s (and therefore its
        // grid-column siblings') minimum width up to that token's full pixel width.
        expect(ruleBody(".mb-changelog-entry__title {")).toMatch(/overflow-wrap:\s*anywhere/);
    });

    it("gives the commit link the same defence, since it renders arbitrary link text too", () => {
        expect(ruleBody(".mb-changelog-entry__commit {")).toMatch(/overflow-wrap:\s*anywhere/);
    });
});

describe(".mb-changelog-filters composes with the search surface without a fixed-width regression", () => {
    it("keeps flex-wrap, so the date-range control can drop to its own line at phone widths", () => {
        expect(ruleBody(".mb-changelog-filters,\n.mb-changelog-actions {")).toMatch(/flex-wrap:\s*wrap/);
    });

    it("never pins a fixed pixel width or min-width on the filter row", () => {
        // A `width` or `min-width` in bare px here would be exactly the "fixed min-width" or
        // "date-range control that assumes desktop width" failure mode this row was checked
        // for while root-causing the overflow - it composes with a shared `.mbm-search`
        // surface next to it and must stay free to shrink to whatever the viewport allows.
        const body = ruleBody(".mb-changelog-filters,\n.mb-changelog-actions {");
        expect(body).not.toMatch(/(?<!min-)width:\s*\d/);
        expect(body).not.toMatch(/min-width:\s*\d/);
    });

    it("never sets white-space: nowrap on the filter row (that would refuse to wrap at all)", () => {
        const body = ruleBody(".mb-changelog-filters,\n.mb-changelog-actions {");
        expect(body).not.toMatch(/white-space:\s*nowrap/);
    });
});

describe(".mb-changelog grid column cannot silently reopen the blowout", () => {
    it("still has no explicit grid-template-columns (documents the real mechanism)", () => {
        // If this ever changes to an explicit `minmax(0, 1fr)` or similar, that is a *stronger*
        // guard than the text-level fix above and this test's premise (a single implicit auto
        // column sharing width across every child) would need updating alongside it - this
        // assertion exists so that edit does not happen silently.
        const body = ruleBody(".mb-changelog {");
        expect(body).not.toMatch(/grid-template-columns/);
    });
});
