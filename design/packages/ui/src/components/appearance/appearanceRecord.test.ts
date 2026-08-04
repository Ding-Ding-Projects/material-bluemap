/**
 * Records, resolution, and the two things that must never happen quietly.
 *
 * The first is a reset that pins rather than releases. Removing an opinion has to remove the
 * key, so the element goes back to following whatever is above it; writing today's resolved
 * value back into the record instead looks identical on the day it happens and diverges
 * silently the first time the theme changes.
 *
 * The second is a colour the app cannot read. There is exactly one tempting answer to an
 * unparseable colour - black - and it is the wrong one, because it replaces something the
 * user typed with something they did not, in a way they will not notice until later.
 */

import { describe, expect, it } from "vitest";

import {
    appearanceStyle,
    DEFAULT_SURFACE,
    emptyRecord,
    isRecordEmpty,
    mergeRecords,
    resetSurface,
    resetTypography,
    resolveRecords,
    SURFACE_PROPERTIES,
    type AppearanceRecord,
} from "./appearanceRecord.js";
import { detectTypographyCapabilities, DEFAULT_TYPOGRAPHY } from "./typographySpec.js";

/** Everything supported, which is what this app's Chromium actually reports. */
const CAPABILITIES = detectTypographyCapabilities(null);

function record(partial: Partial<AppearanceRecord>): AppearanceRecord {
    return { ...emptyRecord(), ...partial };
}

describe("an empty record", () => {
    it("holds no opinions and knows it", () => {
        expect(isRecordEmpty(emptyRecord())).toBe(true);
        expect(isRecordEmpty(record({ typography: { bold: true } }))).toBe(false);
        expect(isRecordEmpty(record({ inherit: "builtin.largeText" }))).toBe(false);
        expect(isRecordEmpty(record({ preserved: { future: 1 } }))).toBe(false);
    });

    it("resolves to the app's own defaults", () => {
        const resolved = resolveRecords(emptyRecord());
        expect(resolved.typography).toEqual(DEFAULT_TYPOGRAPHY);
        expect(resolved.surface).toEqual(DEFAULT_SURFACE);
    });
});

describe("merging a chain", () => {
    it("lets a later layer win and leaves untouched properties to the earlier one", () => {
        const merged = mergeRecords(
            record({ typography: { fontSize: 18, bold: true } }),
            record({ typography: { bold: false } }),
        );

        expect(merged.typography).toEqual({ fontSize: 18, bold: false });
    });

    it("keeps unknown keys from every layer rather than letting the last one win alone", () => {
        const merged = mergeRecords(
            record({ preserved: { "typography.wobble": 1 } }),
            record({ preserved: { "surface.sparkle": 2 } }),
        );

        expect(merged.preserved).toEqual({ "typography.wobble": 1, "surface.sparkle": 2 });
    });

    it("does not mutate its inputs", () => {
        const first = record({ typography: { bold: true } });
        mergeRecords(first, record({ typography: { bold: false } }));
        expect(first.typography).toEqual({ bold: true });
    });

    it("resolves the chain into a complete specification", () => {
        const resolved = resolveRecords(
            record({ typography: { fontSize: 18 } }),
            record({ surface: { borderRadius: 8 } }),
        );

        expect(resolved.typography.fontSize).toBe(18);
        expect(resolved.typography.lineHeight).toBe(DEFAULT_TYPOGRAPHY.lineHeight);
        expect(resolved.surface.borderRadius).toBe(8);
    });
});

describe("reset", () => {
    it("removes the opinion rather than writing the current value back", () => {
        // The distinction the whole feature turns on. After a reset the element must have
        // *no* view on its weight, so a later theme change moves it; a record that said 400
        // would look identical today and be pinned forever.
        const before = record({ typography: { fontWeight: 700, fontSize: 18 } });
        const after = resetTypography(before, "fontWeight");

        expect("fontWeight" in after.typography).toBe(false);
        expect(after.typography).toEqual({ fontSize: 18 });
        expect(before.typography.fontWeight).toBe(700);
    });

    it("does the same for a surface property", () => {
        const before = record({ surface: { borderRadius: 8, elevation: 2 } });
        const after = resetSurface(before, "borderRadius");

        expect("borderRadius" in after.surface).toBe(false);
        expect(after.surface).toEqual({ elevation: 2 });
        expect(before.surface.borderRadius).toBe(8);
    });

    it("covers every surface property the editor lists", () => {
        // A property present in the editor but missing from the reset path is a control the
        // user can set and cannot unset, which is worse than not offering it.
        const full: Record<string, unknown> = { ...DEFAULT_SURFACE };
        for (const id of SURFACE_PROPERTIES) {
            const reset = resetSurface(record({ surface: full }), id);
            expect(id in reset.surface).toBe(false);
        }
    });
});

describe("turning an appearance into CSS", () => {
    it("emits the typography and the surface together", () => {
        const style = appearanceStyle(
            resolveRecords(
                record({
                    typography: { fontSize: 18, bold: true, textColor: "#ff0000" },
                    surface: { backgroundColor: "black", borderRadius: 8, elevation: 2 },
                }),
            ),
            CAPABILITIES,
        );

        expect(style.style["font-size"]).toBe("18px");
        expect(style.style.color).toBe("rgb(255 0 0)");
        expect(style.style["background-color"]).toBe("rgb(0 0 0)");
        expect(style.style["border-radius"]).toBe("8px");
        expect(style.style["box-shadow"]).toContain("rgba");
        expect(style.unreadableColors).toEqual([]);
    });

    it("resolves an authored colour into a notation every engine paints", () => {
        // The record keeps `oklch(...)`, because that is what the user chose in and what an
        // export should carry. What reaches the style attribute is an `rgb()`, because a
        // record whose meaning depends on the browser version is not a record.
        const style = appearanceStyle(
            resolveRecords(record({ typography: { textColor: "oklch(0.62796 0.25768 29.234)" } })),
            CAPABILITIES,
        );

        expect(style.style.color).toMatch(/^rgb\(25[0-9] \d+ \d+\)$/);
    });

    it("keeps an unreadable colour, refuses to paint it, and says which one it was", () => {
        const style = appearanceStyle(
            resolveRecords(
                record({
                    typography: { textColor: "chartruse" },
                    surface: { backgroundColor: "#ff000" },
                }),
            ),
            CAPABILITIES,
        );

        expect(style.style.color).toBeUndefined();
        expect(style.style["background-color"]).toBeUndefined();
        expect(style.unreadableColors.map((entry) => entry.property)).toEqual([
            "textColor",
            "backgroundColor",
        ]);
        // The user's own text comes back, so the editor can offer it for correction rather
        // than presenting an empty field where their value used to be.
        expect(style.unreadableColors[0]?.authored).toBe("chartruse");
        expect(style.unreadableColors[0]?.error).toBe("unknown-keyword");
        expect(style.unreadableColors[0]?.messageKey).toBe(
            "appearance.color.error.unknown-keyword",
        );
        expect(style.unreadableColors[1]?.error).toBe("bad-hex");
    });

    it("treats an empty colour as inherit rather than as a mistake", () => {
        const style = appearanceStyle(resolveRecords(emptyRecord()), CAPABILITIES);
        expect(style.unreadableColors).toEqual([]);
        expect(style.style.color).toBeUndefined();
    });

    it("does not draw a border that has a colour but no width", () => {
        const style = appearanceStyle(
            resolveRecords(record({ surface: { borderColor: "red" } })),
            CAPABILITIES,
        );
        expect(style.style["border-color"]).toBeUndefined();
        expect(style.style["border-style"]).toBeUndefined();
    });

    it("draws one once it has a width and a style", () => {
        const style = appearanceStyle(
            resolveRecords(
                record({ surface: { borderColor: "red", borderWidth: 2, borderStyle: "solid" } }),
            ),
            CAPABILITIES,
        );
        expect(style.style["border-width"]).toBe("2px");
        expect(style.style["border-style"]).toBe("solid");
        expect(style.style["border-color"]).toBe("rgb(255 0 0)");
    });

    it("clamps elevation to the levels Material actually defines", () => {
        const high = appearanceStyle(
            resolveRecords(record({ surface: { elevation: 99 } })),
            CAPABILITIES,
        );
        const flat = appearanceStyle(
            resolveRecords(record({ surface: { elevation: 0 } })),
            CAPABILITIES,
        );

        expect(high.style["box-shadow"]).toBeTruthy();
        expect(flat.style["box-shadow"]).toBeUndefined();
    });

    it("passes the unsupported list and the notes through, so nothing is swallowed", () => {
        const style = appearanceStyle(
            resolveRecords(record({ typography: { underline: "wavy", strikethrough: "double" } })),
            CAPABILITIES,
        );

        // CSS has one decoration style for all three lines, so one of them cannot be drawn
        // as asked. Both lines are still drawn and the compromise is reported.
        expect(style.style["text-decoration-line"]).toContain("underline");
        expect(style.style["text-decoration-line"]).toContain("line-through");
        expect(style.notes.some((note) => note.code === "decoration-style-conflict")).toBe(true);
    });
});
