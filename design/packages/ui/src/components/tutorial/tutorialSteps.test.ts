import { describe, expect, it } from "vitest";
import { TUTORIAL_STEP_IDS, TUTORIAL_STEPS, tutorialStepIndex } from "./tutorialSteps.js";

describe("the tour's itinerary", () => {
    it("has one step per declared id, in the same order", () => {
        expect(TUTORIAL_STEPS.map((step) => step.id)).toEqual(TUTORIAL_STEP_IDS);
    });

    it("never repeats a step id", () => {
        const ids = TUTORIAL_STEPS.map((step) => step.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it("gives every step a real page id and a non-empty CSS selector", () => {
        for (const step of TUTORIAL_STEPS) {
            expect(step.pageId.length, step.id).toBeGreaterThan(0);
            expect(step.anchor.length, step.id).toBeGreaterThan(0);
            // Every anchor here is a `data-tutorial-anchor` attribute selector - see the
            // module's own header for why an invented class or id is not used instead.
            expect(step.anchor, step.id).toContain("data-tutorial-anchor=");
        }
    });

    it("covers the genuine first-run path: welcome, the wizard, finding a world, rendering, opening the result, publishing, and where to find this again", () => {
        expect(TUTORIAL_STEP_IDS).toEqual([
            "welcome",
            "makeAMap",
            "findWorld",
            "rendering",
            "openMap",
            "publish",
            "wrapUp",
        ]);
    });

    it("tutorialStepIndex finds each step at its real position", () => {
        TUTORIAL_STEPS.forEach((step, index) => {
            expect(tutorialStepIndex(step.id)).toBe(index);
        });
    });
});
