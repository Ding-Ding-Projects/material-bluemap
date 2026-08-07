/**
 * The config run screen's two summary cards.
 *
 * Both of them put their heading in a `<v-card-title>` that they turn into a flex row, and
 * that turn is the whole subject of this file. Vuetify's `<v-card-title>` is built for a
 * single-line block title and ships `overflow: hidden; text-overflow: ellipsis;
 * white-space: nowrap` to keep one. `display: flex` clears none of the three: it only stops
 * `text-overflow` from doing anything (ellipsis applies to block containers, not flex ones),
 * which leaves a box that still clips at its edge and still refuses to wrap - so a heading
 * that overran was cut off mid-character with no ellipsis and nothing to say that anything
 * was missing. Every heading here is a translated string, so how long it is depends on the
 * locale rather than on the English in the source.
 *
 * The assertion reads the shipped rule out of the component source. This workspace's
 * `vitest.config.ts` does not enable `test.css`, so no stylesheet is attached to a mounted
 * component and a real cascade is not observable from a test here at all; `PagesScreen.test.ts`
 * and the nine components fixed alongside it check their own CSS fixes the same way.
 */

import { describe, expect, it } from "vitest";

import runScreenSource from "./RunScreen.vue?raw";

describe("the summary cards' heads, which turn their <v-card-title> into a flex row", () => {
    it("clears the inherited overflow, text-overflow and white-space so a heading can wrap", () => {
        const rule = /\.mb-config-run__result-head\s*\{[^}]*\}/s.exec(runScreenSource)?.[0] ?? "";
        expect(rule).not.toBe("");
        expect(rule).toContain("overflow: visible");
        expect(rule).toContain("text-overflow: clip");
        expect(rule).toContain("white-space: normal");
    });

    it("wraps, so the argument-count chip drops to its own line instead of past the edge", () => {
        // The second card's heading carries a chip beside the text. Turning off the clip
        // above is what makes an unwrapped overflow visible rather than hidden; the wrap is
        // what keeps it from happening.
        const rule = /\.mb-config-run__result-head\s*\{[^}]*\}/s.exec(runScreenSource)?.[0] ?? "";
        expect(rule).toContain("flex-wrap: wrap");
    });
});
