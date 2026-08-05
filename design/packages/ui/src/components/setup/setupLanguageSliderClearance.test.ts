/**
 * The CSS half of "the funny-level caption never lands on top of its own tick label" - the
 * half a mounted test cannot see. jsdom computes no layout at all, so a mounted assertion
 * cannot tell an overlapping paragraph from a cleanly-stacked one; this is the same
 * "read the source, not a stand-in" idiom `components/settings/dockScrollChain.test.ts` and
 * `components/confirm/superConfirmPolicy.test.ts` use for the same reason.
 *
 * A visual audit of the current screenshot set (`docs/visual-audit-2026-08-05.md`) found
 * `.mb-setup-language__level` - the "Balanced" / 中間落墨 line under each slider - rendering
 * stacked on top of the "1" tick label for the Cantonese slider, in both places this
 * component is mounted (the first-run wizard and the Settings drawer's Language and tone
 * section), while the English slider's equivalent line sat cleanly below it. `v-slider`'s
 * tick labels sit at a fixed offset below the track rather than contributing to the
 * slider's own flow height, so the paragraph's clearance depends entirely on its own line
 * box; a CJK font's line-height metrics rendering taller than the Latin fallback's at the
 * same font-size was enough to close that gap for one language and not the other. The fix
 * gives the paragraph an explicit top margin and line-height instead of leaving the gap to
 * whichever font happens to be active.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
    return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
}

describe("the funny-level caption's clearance from its slider's tick labels", () => {
    it("gives .mb-setup-language__level an explicit top margin and line-height, not the font's own defaults", () => {
        const source = read("./SetupLanguagePanel.vue");
        const rule = source.match(/\.mb-setup-language__level\s*\{[^}]*\}/);
        expect(rule, "no rule found for .mb-setup-language__level").not.toBeNull();
        const body = rule?.[0] ?? "";

        const marginMatch = body.match(/margin-block-start:\s*(\d+)px/);
        expect(marginMatch, "no explicit margin-block-start on .mb-setup-language__level").not.toBeNull();
        // A bare few pixels would still be swallowed by the same font-metric difference
        // that caused the overlap; this has to be a real, deliberate gap.
        expect(Number(marginMatch?.[1] ?? 0)).toBeGreaterThanOrEqual(16);

        expect(body).toMatch(/line-height:\s*[\d.]+/);
    });

    it("mounts the same panel, and so the same fix, in both places the audit found the overlap", () => {
        // The first-run wizard imports this component directly. The Settings drawer
        // (components/settings/AppSettings.vue, off-limits to this lane) reaches it one
        // hop further, through LanguageSettingsRow.vue, which this lane can still read -
        // together they prove the drawer's "Language and tone" section mounts the exact
        // same slider pair rather than a second copy of it, so one CSS fix here reaches
        // both surfaces the audit named.
        const welcome = read("./SetupWelcomeStep.vue");
        expect(welcome).toMatch(/import SetupLanguagePanel from "\.\/SetupLanguagePanel\.vue"/);

        const row = read("./LanguageSettingsRow.vue");
        expect(row).toMatch(/import SetupLanguagePanel from "\.\/SetupLanguagePanel\.vue"/);
        expect(row).toMatch(/<SetupLanguagePanel/);
    });
});
