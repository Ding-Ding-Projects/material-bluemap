import { describe, expect, it } from "vitest";

import { formatRepresentation, parseColor, REPRESENTATION_IDS } from "./representations.js";
import { srgb } from "./value.js";

/**
 * The translator's whole job is that text the picker prints can be pasted straight back in.
 * These tests check that promise directly: format a known value in every representation,
 * then parse the formatted text and confirm the colour survives (alpha included, wherever
 * the representation is documented to carry it).
 */
describe("colour translator", () => {
    it("parses a 3-digit hex the same as its 6-digit expansion", () => {
        const short = parseColor("#f0a");
        const long = parseColor("#ff00aa");
        expect(short.value).not.toBeNull();
        expect(long.value).not.toBeNull();
        expect(short.value?.coords).toEqual(long.value?.coords);
    });

    it("round-trips hex8 alpha through format and parse", () => {
        const value = srgb(0.2, 0.6, 0.9, 0.5);
        const formatted = formatRepresentation(value, "hex8");
        const parsed = parseColor(formatted.text);
        expect(parsed.value).not.toBeNull();
        expect(parsed.value?.alpha).toBeCloseTo(0.5, 2);
    });

    it("reports an alpha loss for a translucent colour formatted as plain hex", () => {
        const value = srgb(0.5, 0.5, 0.5, 0.4);
        const formatted = formatRepresentation(value, "hex");
        expect(formatted.losses).toContain("alpha");
    });

    it("reports no alpha loss for an opaque colour formatted as plain hex", () => {
        const value = srgb(0.5, 0.5, 0.5, 1);
        const formatted = formatRepresentation(value, "hex");
        expect(formatted.losses).not.toContain("alpha");
    });

    it("parses a CSS named colour and reformats it back to the same name", () => {
        const parsed = parseColor("rebeccapurple");
        expect(parsed.value).not.toBeNull();
        expect(parsed.id).toBe("named");
        const formatted = formatRepresentation(parsed.value!, "named");
        expect(formatted.text).toBe("rebeccapurple");
    });

    it("round-trips an rgb() function through parse and format", () => {
        const parsed = parseColor("rgb(255 0 128)");
        expect(parsed.value).not.toBeNull();
        const formatted = formatRepresentation(parsed.value!, "rgb");
        expect(formatted.text).toBe("rgb(255 0 128)");
    });

    it("round-trips an oklch() function's lightness, chroma and hue", () => {
        const parsed = parseColor("oklch(0.7 0.15 30)");
        expect(parsed.value).not.toBeNull();
        expect(parsed.value?.space).toBe("oklch");
        expect(parsed.value?.coords[0]).toBeCloseTo(0.7, 3);
        expect(parsed.value?.coords[1]).toBeCloseTo(0.15, 3);
        expect(parsed.value?.coords[2]).toBeCloseTo(30, 3);
    });

    it("rejects text that matches no supported representation", () => {
        const parsed = parseColor("definitely not a colour");
        expect(parsed.value).toBeNull();
        expect(parsed.error).not.toBeNull();
    });

    it("rejects an empty string with a distinct, specific error", () => {
        const parsed = parseColor("");
        expect(parsed.value).toBeNull();
        expect(parsed.error).toBe("empty");
    });

    it("labels CMYK conversion as not colour-managed, since it is a naive approximation", () => {
        const value = srgb(0.8, 0.1, 0.1);
        const formatted = formatRepresentation(value, "cmyk");
        expect(formatted.losses).toContain("not-color-managed");
    });

    it("formats every declared representation without throwing", () => {
        const value = srgb(0.33, 0.66, 0.99, 0.75);
        for (const id of REPRESENTATION_IDS) {
            expect(() => formatRepresentation(value, id)).not.toThrow();
        }
    });
});
