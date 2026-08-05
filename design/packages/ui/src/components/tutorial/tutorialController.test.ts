import { beforeEach, describe, expect, it } from "vitest";
import { memoryStorage, type SetupStorage } from "../setup/setupPrefs.js";
import {
    createTutorialController,
    markTutorialOffered,
    tutorialCompleted,
    tutorialOffered,
} from "./tutorialController.js";
import { TUTORIAL_STEPS } from "./tutorialSteps.js";

let storage: SetupStorage;

beforeEach(() => {
    // A fresh, real (in-memory) store per test, exactly like `firstRunFlow.ts`'s own tests -
    // this is state that genuinely persists, not a mock of the persistence itself.
    storage = memoryStorage();
});

describe("stepping through the tour", () => {
    it("starts on step one of the real step count", () => {
        const tour = createTutorialController(storage);
        tour.start();

        expect(tour.open.value).toBe(true);
        expect(tour.stepIndex.value).toBe(0);
        expect(tour.stepNumber.value).toBe(1);
        expect(tour.stepCount).toBe(TUTORIAL_STEPS.length);
        expect(tour.currentStep.value.id).toBe(TUTORIAL_STEPS[0]?.id);
    });

    it("advances one step at a time with next()", () => {
        const tour = createTutorialController(storage);
        tour.start();

        tour.next();
        expect(tour.stepIndex.value).toBe(1);
        expect(tour.currentStep.value.id).toBe(TUTORIAL_STEPS[1]?.id);
    });

    it("skip() moves forward exactly like next()", () => {
        const tour = createTutorialController(storage);
        tour.start();

        tour.skip();
        expect(tour.stepIndex.value).toBe(1);
    });

    it("back() does nothing on the first step", () => {
        const tour = createTutorialController(storage);
        tour.start();

        tour.back();
        expect(tour.stepIndex.value).toBe(0);
        expect(tour.canGoBack.value).toBe(false);
    });

    it("back() undoes a next(), and canGoBack reflects position", () => {
        const tour = createTutorialController(storage);
        tour.start();

        tour.next();
        expect(tour.canGoBack.value).toBe(true);
        tour.back();
        expect(tour.stepIndex.value).toBe(0);
        expect(tour.canGoBack.value).toBe(false);
    });

    it("isLastStep is true only on the final step", () => {
        const tour = createTutorialController(storage);
        tour.start();

        for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) {
            expect(tour.isLastStep.value).toBe(false);
            tour.next();
        }
        expect(tour.isLastStep.value).toBe(true);
    });

    it("next() on the last step finishes the tour instead of overrunning the step list", () => {
        const tour = createTutorialController(storage);
        tour.start();

        for (let i = 0; i < TUTORIAL_STEPS.length; i++) tour.next();

        expect(tour.open.value).toBe(false);
        expect(tour.completed.value).toBe(true);
        expect(tour.stepIndex.value).toBe(TUTORIAL_STEPS.length - 1);
    });

    it("exit() closes without marking the tour completed", () => {
        const tour = createTutorialController(storage);
        tour.start();
        tour.next();

        tour.exit();

        expect(tour.open.value).toBe(false);
        expect(tour.completed.value).toBe(false);
    });

    it("finish() can be called directly, marks completed and closes", () => {
        const tour = createTutorialController(storage);
        tour.start();

        tour.finish();

        expect(tour.open.value).toBe(false);
        expect(tour.completed.value).toBe(true);
    });
});

describe("persistence: resumable, and never reappearing uninvited", () => {
    it("resumes at the step it was exited on", () => {
        const first = createTutorialController(storage);
        first.start();
        first.next();
        first.next();
        first.exit();

        const second = createTutorialController(storage);
        second.start();

        expect(second.stepIndex.value).toBe(2);
        expect(second.completed.value).toBe(false);
    });

    it("a completed tour restarts at step one rather than resuming", () => {
        const first = createTutorialController(storage);
        first.start();
        for (let i = 0; i < TUTORIAL_STEPS.length; i++) first.next();
        expect(first.completed.value).toBe(true);

        const second = createTutorialController(storage);
        second.start();

        expect(second.stepIndex.value).toBe(0);
        expect(second.open.value).toBe(true);
    });

    it("completion survives across separate controller instances (a restart of the app)", () => {
        const first = createTutorialController(storage);
        first.start();
        for (let i = 0; i < TUTORIAL_STEPS.length; i++) first.next();

        const second = createTutorialController(storage);
        expect(second.completed.value).toBe(true);
    });

    it("a stored progress index past the real step count falls back to step one", () => {
        storage.write("material-bluemap.tutorial.progress", "999");

        const tour = createTutorialController(storage);
        tour.start();

        expect(tour.stepIndex.value).toBe(0);
    });

    it("a corrupt stored progress index falls back to step one rather than throwing", () => {
        storage.write("material-bluemap.tutorial.progress", "not-a-number");

        const tour = createTutorialController(storage);
        expect(() => tour.start()).not.toThrow();
        expect(tour.stepIndex.value).toBe(0);
    });
});

describe("the one-time invitation flag", () => {
    it("starts unset", () => {
        expect(tutorialOffered(storage)).toBe(false);
    });

    it("is set by markTutorialOffered and stays set", () => {
        markTutorialOffered(storage);
        expect(tutorialOffered(storage)).toBe(true);
    });

    it("is independent of completion", () => {
        markTutorialOffered(storage);
        expect(tutorialCompleted(storage)).toBe(false);

        const tour = createTutorialController(storage);
        tour.start();
        for (let i = 0; i < TUTORIAL_STEPS.length; i++) tour.next();

        // Completing the tour does not itself set or clear the "offered" flag - the two are
        // deliberately separate settings, per `tutorialController.ts`'s own doc comment.
        expect(tutorialOffered(storage)).toBe(true);
    });
});

describe("tutorialCompleted() without constructing a controller", () => {
    it("reads false before any tour has ever finished", () => {
        expect(tutorialCompleted(storage)).toBe(false);
    });

    it("reads true once a tour has finished", () => {
        const tour = createTutorialController(storage);
        tour.start();
        for (let i = 0; i < TUTORIAL_STEPS.length; i++) tour.next();

        expect(tutorialCompleted(storage)).toBe(true);
    });
});
