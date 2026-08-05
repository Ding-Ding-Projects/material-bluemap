import { describe, expect, it } from "vitest";

import { contrastReport, formatRatio, relativeLuminance } from "./contrast.js";
import { srgb } from "./value.js";

describe("WCAG contrast reporting", () => {
    it("reports the maximum 21:1 ratio for black on white", () => {
        const report = contrastReport(srgb(0, 0, 0), srgb(1, 1, 1), srgb(1, 1, 1));
        expect(report.ratio).toBeCloseTo(21, 1);
        expect(report.grade).toBe("aaa");
        expect(report.passesAaNormal).toBe(true);
        expect(report.passesAaaNormal).toBe(true);
    });

    it("reports the minimum 1:1 ratio for a colour against itself", () => {
        const grey = srgb(0.5, 0.5, 0.5);
        const report = contrastReport(grey, grey, srgb(1, 1, 1));
        expect(report.ratio).toBeCloseTo(1, 2);
        expect(report.grade).toBe("fail");
    });

    it("is symmetric: swapping foreground and background does not change the ratio", () => {
        const a = srgb(0.9, 0.2, 0.1);
        const b = srgb(0.1, 0.1, 0.4);
        const page = srgb(1, 1, 1);
        const forward = contrastReport(a, b, page);
        const backward = contrastReport(b, a, page);
        expect(forward.ratio).toBeCloseTo(backward.ratio, 6);
    });

    it("flags a translucent foreground as composited", () => {
        const report = contrastReport(srgb(0, 0, 0, 0.5), srgb(1, 1, 1), srgb(1, 1, 1));
        expect(report.composited).toBe(true);
    });

    it("does not flag two fully opaque colours as composited", () => {
        const report = contrastReport(srgb(0, 0, 0), srgb(1, 1, 1), srgb(1, 1, 1));
        expect(report.composited).toBe(false);
    });

    it("grades a ratio under the AA-large threshold as a fail", () => {
        // A mid-grey close enough to white that even large text would not clear 3:1.
        const report = contrastReport(srgb(0.65, 0.65, 0.65), srgb(1, 1, 1), srgb(1, 1, 1));
        expect(report.ratio).toBeLessThan(3);
        expect(report.grade).toBe("fail");
    });

    it("computes relative luminance of white as 1 and black as 0", () => {
        expect(relativeLuminance(srgb(1, 1, 1))).toBeCloseTo(1, 6);
        expect(relativeLuminance(srgb(0, 0, 0))).toBeCloseTo(0, 6);
    });

    it("formats a ratio to two decimal places with the WCAG :1 suffix", () => {
        expect(formatRatio(4.5)).toBe("4.50:1");
        expect(formatRatio(21)).toBe("21.00:1");
    });
});
