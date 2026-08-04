/**
 * Warning about the converter's unbounded memory growth - and, just as importantly, not
 * warning about it when there is nothing to warn about.
 *
 * A warning shown on every world is a warning nobody reads, so the silence on small worlds
 * is asserted here as deliberately as the warning on large ones.
 */

import { describe, expect, it } from "vitest";
import { MEMORY_RISK_THRESHOLD_BYTES, assessMemoryRisk } from "./memory.js";

const MB = 1024 * 1024;

describe("a world comfortably under the threshold", () => {
    it("says nothing alarming at all", () => {
        const risk = assessMemoryRisk(40 * MB);

        expect(risk.level).toBe("low");
        expect(risk.warn).toBe(false);
        // No copy, not merely quiet copy: an interface that renders `detail` unconditionally
        // must have nothing to render.
        expect(risk.title).toBe("");
        expect(risk.detail).toBe("");
    });
});

describe("a world over the threshold", () => {
    const risk = assessMemoryRisk(1400 * MB);

    it("warns before anything runs, sized against the world in front of the person", () => {
        expect(risk.level).toBe("high");
        expect(risk.warn).toBe(true);
        expect(risk.detail).toContain("1.4 GB");
        expect(risk.detail).toContain("200 MB");
    });

    it("says what is likely to happen rather than only that something might", () => {
        expect(risk.detail).toContain("slows down");
        expect(risk.detail).toContain("out-of-memory");
    });

    it("says whose limitation it is", () => {
        expect(risk.detail).toContain("limitation of the converter");
        expect(risk.detail).toContain("not of your world");
    });

    it("never offers more memory as the fix", () => {
        // The whole point. A bigger heap does not fix unbounded growth, it postpones it -
        // and an app that suggests it sends somebody to repeat a twenty-minute failure.
        expect(risk.detail).toContain("not a fix");
        expect(risk.detail).not.toMatch(/-Xmx/);
    });

    it("promises the same cleanup the conversion actually performs", () => {
        expect(risk.detail).toContain("Nothing will be left behind");
        expect(risk.detail).toContain("never modified");
    });

    it("attributes the figure to observation, not to Chunker's documentation", () => {
        // Chunker documents no such limit - its maintainers describe out-of-memory as a
        // world-size-versus-RAM problem. Claiming upstream said this would be a fabrication.
        expect(risk.attribution).toContain("this app's own observation");
        expect(risk.attribution).toContain("not something Chunker");
    });
});

describe("a world near the threshold", () => {
    it("is mentioned without being predicted to fail", () => {
        const risk = assessMemoryRisk(MEMORY_RISK_THRESHOLD_BYTES - 1 * MB);

        expect(risk.level).toBe("approaching");
        expect(risk.warn).toBe(true);
        expect(risk.detail).toContain("may well convert");
    });

    it("stays quiet just below the approaching band", () => {
        expect(assessMemoryRisk(MEMORY_RISK_THRESHOLD_BYTES * 0.5).warn).toBe(false);
    });

    it("treats the threshold itself as high rather than approaching", () => {
        expect(assessMemoryRisk(MEMORY_RISK_THRESHOLD_BYTES).level).toBe("high");
    });
});

describe("a world whose size was never measured", () => {
    it("invents no assessment, and warns about nothing", () => {
        // Inventing a risk from a size nobody measured is the same failure as inventing the
        // size: a confident statement with nothing behind it.
        for (const value of [null, 0, -1]) {
            const risk = assessMemoryRisk(value);
            expect(risk.level).toBe("unknown");
            expect(risk.warn).toBe(false);
            expect(risk.detail).toBe("");
        }
    });
});
