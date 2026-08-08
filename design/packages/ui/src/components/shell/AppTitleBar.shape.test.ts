/**
 * The window's caption buttons stay square, against a shape default that would round them.
 *
 * `vuetify.ts` now defaults every `VBtn` in the application to `rounded: "pill"`, which is
 * the point of the M3 Expressive shape language and right for every button in the product
 * except exactly these three. A window's minimise, maximise and close are a platform
 * convention: they fill the title bar's full height and butt against the window's own
 * corner, and rendering them as three floating pills reads as a toolbar somebody left in
 * the corner rather than as the window controls.
 *
 * This is a real regression rather than a hypothetical one. `.mb-titlebar-button.v-btn`
 * has always declared `border-radius: 0`, and it has never been what decided the corner:
 * Vuetify emits its radius as a `!important` utility class, which outranks an ordinary
 * declaration whatever its specificity. Under the blueprint's own `rounded-xl` these
 * buttons were already rendering at 24px, unnoticed, and the new default would have taken
 * them to a full pill. The fix is `rounded="0"` on each button - a prop, which is the only
 * thing that beats a prop-driven utility - and this file is what keeps it there.
 *
 * Asserted against the template source rather than a mounted component: the corner is
 * decided by a class Vuetify emits from a prop, `vitest.config.ts` does not enable
 * `test.css`, and no stylesheet is attached to a mounted component here - so a mounted
 * assertion could only re-read the prop this already reads, one indirection further from
 * the thing that matters. `App.shellFabClearance.test.ts` reads its own rules the same way
 * and for the same reason.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const source = readFileSync(fileURLToPath(new URL("./AppTitleBar.vue", import.meta.url)), "utf8");

/** The template's three caption `VBtn` blocks, each from its tag to its first `>`. */
function captionButtons(): string[] {
    return [...source.matchAll(/<VBtn\b[^>]*class="mb-titlebar-button[^"]*"[^>]*>/gs)].map(
        (match) => match[0],
    );
}

describe("the window's caption buttons", () => {
    it("are the three the title bar draws: minimise, maximise and close", () => {
        expect(captionButtons()).toHaveLength(3);
    });

    it("each pin their own corner to square, which is what beats the pill default", () => {
        for (const button of captionButtons()) {
            expect(button, `a caption button does not set rounded="0":\n${button}`).toMatch(
                /rounded="0"/,
            );
        }
    });

    it("keeps the stylesheet's own border-radius: 0 for the build no default reaches", () => {
        // The browser build installs the same Vuetify defaults, but this declaration is
        // what a host that somehow renders the bar without them still gets. Cheap, and it
        // documents that the two are saying the same thing rather than disagreeing.
        const rule = /\.mb-titlebar-button\.v-btn\s*\{[^}]*\}/s.exec(source)?.[0] ?? "";
        expect(rule).toContain("border-radius: 0");
    });

    it("never lets a caption button carry a rounded value that is not square", () => {
        // The general form: any other `rounded` on one of these is the regression coming
        // back wearing a different number.
        for (const button of captionButtons()) {
            const rounded = /rounded="([^"]*)"/.exec(button)?.[1];
            expect(rounded).toBe("0");
        }
    });
});
