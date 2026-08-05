import { describe, expect, it } from "vitest";
import { placeTutorialCard, placeTutorialHighlight, TUTORIAL_CARD_MARGIN } from "./tutorialPlacement.js";

const VIEWPORT = { width: 1024, height: 768 };
const CARD = { width: 320, height: 180 };

describe("placeTutorialCard", () => {
    it("places the card below the anchor when there is room", () => {
        const anchor = { top: 100, left: 200, width: 80, height: 32 };
        const point = placeTutorialCard(anchor, CARD, VIEWPORT);

        expect(point.top).toBe(anchor.top + anchor.height + TUTORIAL_CARD_MARGIN);
        expect(point.left).toBe(anchor.left);
    });

    it("flips above the anchor when there is no room below but room above", () => {
        // Near the bottom of a 768px-tall viewport, with a 180px card needing 192px of room.
        const anchor = { top: 700, left: 200, width: 80, height: 32 };
        const point = placeTutorialCard(anchor, CARD, VIEWPORT);

        expect(point.top).toBe(anchor.top - CARD.height - TUTORIAL_CARD_MARGIN);
    });

    it("clamps to the viewport when neither above nor below has enough room", () => {
        // A viewport too short for the card either way - a narrow browser window at high zoom.
        const anchor = { top: 40, left: 10, width: 80, height: 32 };
        const tinyViewport = { width: 1024, height: 120 };
        const point = placeTutorialCard(anchor, CARD, tinyViewport);

        expect(point.top).toBeGreaterThanOrEqual(TUTORIAL_CARD_MARGIN);
        expect(point.top + CARD.height).toBeLessThanOrEqual(tinyViewport.height + CARD.height);
    });

    it("clamps horizontally so the card never crosses the right edge", () => {
        const anchor = { top: 100, left: 950, width: 60, height: 32 };
        const point = placeTutorialCard(anchor, CARD, VIEWPORT);

        expect(point.left + CARD.width).toBeLessThanOrEqual(VIEWPORT.width);
        expect(point.left).toBeGreaterThanOrEqual(TUTORIAL_CARD_MARGIN);
    });

    it("clamps horizontally so the card never crosses the left edge", () => {
        const anchor = { top: 100, left: -40, width: 60, height: 32 };
        const point = placeTutorialCard(anchor, CARD, VIEWPORT);

        expect(point.left).toBeGreaterThanOrEqual(TUTORIAL_CARD_MARGIN);
    });

    it("degrades to a viewport-corner-ish position on a zeroed anchor rather than NaN", () => {
        const point = placeTutorialCard(
            { top: 0, left: 0, width: 0, height: 0 },
            CARD,
            { width: 0, height: 0 },
        );

        expect(Number.isFinite(point.top)).toBe(true);
        expect(Number.isFinite(point.left)).toBe(true);
    });
});

describe("placeTutorialHighlight", () => {
    it("pads the anchor's own rect symmetrically", () => {
        const anchor = { top: 100, left: 200, width: 80, height: 32 };
        const box = placeTutorialHighlight(anchor);

        const topPad = anchor.top - box.top;
        const leftPad = anchor.left - box.left;
        expect(topPad).toBeGreaterThan(0);
        expect(leftPad).toBe(topPad);
        expect(box.width).toBe(anchor.width + topPad * 2);
        expect(box.height).toBe(anchor.height + topPad * 2);
    });
});
