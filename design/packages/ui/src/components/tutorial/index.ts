/**
 * The interactive tour: a guided walkthrough of the genuine first-run path, anchored to real
 * controls in the running shell.
 *
 * Mount {@link TutorialOverlay} once, at the shell, handing it a `revealPage` callback so it
 * can switch the tab strip to whichever page a step is about. It resolves its own state
 * (`createTutorialController`) and listens for its own open requests
 * (`onTutorialLaunchRequested`); nothing else needs to reach into it directly.
 *
 * To open it from somewhere else in the tree - the Info page, the docs browser, a command
 * palette row - call {@link requestTutorialLaunch}. To let a step advance itself when the
 * user does the real thing rather than clicking Next, call {@link emitTutorialSignal} from
 * wherever that thing actually happens.
 */

export { default as TutorialOverlay } from "./TutorialOverlay.vue";

export {
    createTutorialController,
    markTutorialOffered,
    tutorialCompleted,
    tutorialOffered,
} from "./tutorialController.js";
export type { TutorialController } from "./tutorialController.js";

export {
    TUTORIAL_STEPS,
    TUTORIAL_STEP_IDS,
    tutorialStepIndex,
} from "./tutorialSteps.js";
export type { TutorialSignal, TutorialStep, TutorialStepId } from "./tutorialSteps.js";

export {
    emitTutorialSignal,
    onTutorialSignal,
    resetTutorialSignals,
    tutorialSignalCount,
} from "./tutorialSignals.js";

export {
    onTutorialLaunchRequested,
    requestTutorialLaunch,
    resetTutorialLaunchRequests,
    tutorialLaunchCount,
} from "./tutorialLaunch.js";

export { tutorialProgressText, tutorialStepBody, tutorialStepTitle } from "./tutorialCopy.js";
export type { Translate as TutorialTranslate } from "./tutorialCopy.js";

export {
    placeTutorialCard,
    placeTutorialHighlight,
    TUTORIAL_CARD_MARGIN,
} from "./tutorialPlacement.js";
export type { TutorialPoint, TutorialRect, TutorialSize } from "./tutorialPlacement.js";
