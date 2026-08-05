import { describe, expect, it } from "vitest";
import { TUTORIAL_STEPS } from "./tutorialSteps.js";
import { tutorialProgressText, tutorialStepBody, tutorialStepTitle, type Translate } from "./tutorialCopy.js";

/** A `t` that behaves exactly like vue-i18n's fallback path: no catalogue, so the English
 * fallback wins, with named placeholders substituted the way `voiceMessages` would. */
const passthrough: Translate = ((key: string, second: unknown, third?: string) => {
    if (typeof second === "string") return second;
    const fallback = third ?? "";
    const named = (second ?? {}) as Record<string, unknown>;
    return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in named ? String(named[name]) : match,
    );
}) as Translate;

describe("tutorialStepTitle", () => {
    it("returns real, distinct, non-empty prose for every declared step", () => {
        const titles = TUTORIAL_STEPS.map((step) => tutorialStepTitle(step.id, passthrough));
        for (const title of titles) expect(title.length).toBeGreaterThan(0);
        expect(new Set(titles).size).toBe(titles.length);
    });
});

describe("tutorialStepBody", () => {
    it("returns real, distinct, non-empty prose for every declared step", () => {
        const bodies = TUTORIAL_STEPS.map((step) => tutorialStepBody(step.id, passthrough));
        for (const body of bodies) expect(body.length).toBeGreaterThan(0);
        expect(new Set(bodies).size).toBe(bodies.length);
    });
});

describe("tutorialProgressText", () => {
    it("interpolates the step number and the step count", () => {
        expect(tutorialProgressText(3, 7, passthrough)).toBe("Step 3 of 7.");
    });
});
