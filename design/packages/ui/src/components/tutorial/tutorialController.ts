/**
 * The tour's own state machine: which step is showing, and what survives a restart.
 *
 * Modelled on `components/setup/firstRunFlow.ts`'s `createFirstRunController`: plain
 * functions over refs, storage-backed, nothing that requires mounting a component to prove.
 * Persistence goes through `setupStorage()` (`components/setup/setupPrefs.ts`), the same
 * storage seam the first-run flow and the language settings use - it degrades to an
 * in-memory store under Vitest and in a private-browsing window, so a test never has to stub
 * `localStorage` to exercise this file.
 *
 * ## The three things persistence remembers
 *
 *  - **Completed.** Once every step has been stepped past (Next or Finish on the last one),
 *    the tour never reopens on its own - see the "offered" toast in `App.vue`, which checks
 *    this before it ever raises itself, and only ever raises itself once regardless. Explicit
 *    launches (Info, Docs, the palette) still work afterwards; `start()` on a completed tour
 *    begins again at step one, which is what a person asking for "Replay the tour" wants.
 *  - **In-progress position.** Exiting before the last step - the always-visible close
 *    control, or Escape - does not throw the walkthrough away. `start()` on an incomplete
 *    tour resumes at the step it was left on, which is what "resumable" means in practice:
 *    dismissible at any step without losing the place.
 *  - **Offered.** A single flag, separate from both of the above, that only the one-time
 *    invitation toast in `App.vue` reads and writes. It is what stops that toast from ever
 *    appearing twice, whether or not the tour it offered was ever opened.
 *
 * Nothing here touches the DOM, an anchor selector, or a page id. `TutorialOverlay.vue` is
 * what turns `currentStep` into a highlighted control and a page switch; this file only knows
 * step numbers.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import { setupStorage, type SetupStorage } from "../setup/setupPrefs.js";
import { TUTORIAL_STEPS, type TutorialStep } from "./tutorialSteps.js";

const COMPLETED_KEY = "worldlens.tutorial.completed";
const OFFERED_KEY = "worldlens.tutorial.offered";
const PROGRESS_KEY = "worldlens.tutorial.progress";

export interface TutorialController {
    /** Whether the overlay should be on screen. */
    readonly open: Ref<boolean>;
    readonly stepIndex: Ref<number>;
    readonly currentStep: ComputedRef<TutorialStep>;
    /** One-based, for "Step 3 of 7". */
    readonly stepNumber: ComputedRef<number>;
    readonly stepCount: number;
    readonly canGoBack: ComputedRef<boolean>;
    readonly isLastStep: ComputedRef<boolean>;
    /** Whether every step has ever been stepped past, in any run. */
    readonly completed: Ref<boolean>;

    /** Opens the tour: resumes an incomplete run where it left off, restarts a finished one. */
    start(): void;
    /** Moves to the next step, or completes the tour from the last one. */
    next(): void;
    /** Moves to the previous step. Does nothing on the first one. */
    back(): void;
    /** Moves on without doing what the step suggested. The same motion as `next()`. */
    skip(): void;
    /** Closes the overlay without discarding progress, unless this was the last step. */
    exit(): void;
    /** Marks the tour finished and closes it. */
    finish(): void;
    /** Whether the one-time invitation has already been shown, this install or ever since. */
    hasBeenOffered(): boolean;
    /** Records that the one-time invitation has now been shown. */
    markOffered(): void;
}

/**
 * Whether the tour has ever been completed, without constructing a whole controller for it.
 *
 * Every launcher outside the overlay itself (Info's button, the docs browser's button, the
 * command palette row) needs exactly this one bit to decide between "Take the tour" and
 * "Replay the tour" - see `tutorial.launch.start`/`tutorial.launch.replay` in
 * `copy/surfaces/tutorial.ts`. None of them need the rest of the controller's state.
 */
export function tutorialCompleted(storage: SetupStorage = setupStorage()): boolean {
    return storage.read(COMPLETED_KEY) === "1";
}

/**
 * Whether the one-time invitation toast has ever been shown, without constructing a whole
 * controller. `App.vue`'s own `onMounted` is the only caller: it checks this once, at most
 * raises the notice once, and calls {@link markTutorialOffered} in the same breath so the
 * notice can never appear a second time - the tour itself stays reachable afterwards through
 * Info, Docs and the command palette, exactly as if it had never offered itself at all.
 */
export function tutorialOffered(storage: SetupStorage = setupStorage()): boolean {
    return storage.read(OFFERED_KEY) === "1";
}

/** Records that the one-time invitation has now been shown. */
export function markTutorialOffered(storage: SetupStorage = setupStorage()): void {
    storage.write(OFFERED_KEY, "1");
}

function readStoredIndex(storage: SetupStorage): number {
    const raw = storage.read(PROGRESS_KEY);
    if (raw === null) return 0;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= TUTORIAL_STEPS.length) return 0;
    return parsed;
}

export function createTutorialController(
    storage: SetupStorage = setupStorage(),
): TutorialController {
    const open = ref(false);
    const completed = ref(storage.read(COMPLETED_KEY) === "1");
    const stepIndex = ref(0);

    const currentStep = computed<TutorialStep>(
        () => TUTORIAL_STEPS[stepIndex.value] ?? (TUTORIAL_STEPS[0] as TutorialStep),
    );
    const stepNumber = computed(() => stepIndex.value + 1);
    const stepCount = TUTORIAL_STEPS.length;
    const canGoBack = computed(() => stepIndex.value > 0);
    const isLastStep = computed(() => stepIndex.value >= TUTORIAL_STEPS.length - 1);

    function persistProgress(): void {
        storage.write(PROGRESS_KEY, String(stepIndex.value));
    }

    function start(): void {
        stepIndex.value = completed.value ? 0 : readStoredIndex(storage);
        if (!completed.value) persistProgress();
        open.value = true;
    }

    function finish(): void {
        completed.value = true;
        storage.write(COMPLETED_KEY, "1");
        storage.remove(PROGRESS_KEY);
        open.value = false;
    }

    function next(): void {
        if (isLastStep.value) {
            finish();
            return;
        }
        stepIndex.value += 1;
        persistProgress();
    }

    function back(): void {
        if (stepIndex.value === 0) return;
        stepIndex.value -= 1;
        persistProgress();
    }

    function exit(): void {
        open.value = false;
    }

    function hasBeenOffered(): boolean {
        return storage.read(OFFERED_KEY) === "1";
    }

    function markOffered(): void {
        storage.write(OFFERED_KEY, "1");
    }

    return {
        open,
        stepIndex,
        currentStep,
        stepNumber,
        stepCount,
        canGoBack,
        isLastStep,
        completed,
        start,
        next,
        back,
        skip: next,
        exit,
        finish,
        hasBeenOffered,
        markOffered,
    };
}
