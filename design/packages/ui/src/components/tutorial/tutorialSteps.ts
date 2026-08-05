/**
 * The tour's own itinerary: pure data, no copy in it.
 *
 * This is deliberately not where the words live. `tutorialCopy.ts` next door is what calls
 * `t()`, because a catalogue key needs a literal call site somewhere in the package for
 * `appCopy.test.ts` and `catalogueCoverage.test.ts` to find it, and a step built from
 * `t(step.bodyKey, step.bodyFallback)` with both arguments read out of this object would
 * never produce one - the scanner reads source text, not runtime values. `renderRun.ts`'s
 * `phaseLabel`/`adviseOnFailure` already draw this line the same way: a plain switch with a
 * literal `t("key", "fallback")` per case, fed by an id that lives here.
 *
 * ## What an anchor is, and the promise it makes
 *
 * `anchor` is a CSS selector for the one real control this step is about. It is never
 * invented: every selector below targets an attribute added to an existing, already-shipped
 * element (`data-tutorial-anchor` on a shell tab button, or a class the owning component
 * already had). `tutorialAnchors.test.ts` mounts the real owning surface for each step and
 * asserts the selector resolves to a real node, so a control renamed or removed under this
 * tour fails a test instead of quietly pointing the highlight at nothing. A step whose anchor
 * cannot be found is worse than no step at all - see the tour's own requirements - which is
 * why every anchor chosen here is unconditionally present once its page is showing, rather
 * than nested inside a wizard sub-step or a bridge-gated disclosure that might not have
 * rendered yet.
 *
 * `pageId` is the shell's own page id (`App.vue`'s `PAGE_*` constants, as strings): the value
 * `TutorialOverlay.vue` hands to the shell's `revealPage` so the step's real page is on
 * screen before the anchor is measured.
 *
 * `signal` names an optional {@link TutorialSignal}: when the app fires it while this step is
 * the active one, the tour advances on its own, in addition to the ever-present Next button.
 * Most steps have none, because "click Next to move on without doing it" has to work for
 * every step regardless - a live signal is a bonus for the one step where the action is a
 * single unambiguous click ("choose a world"), not a requirement the rest are missing.
 */

export type TutorialStepId =
    | "welcome"
    | "makeAMap"
    | "findWorld"
    | "rendering"
    | "openMap"
    | "publish"
    | "wrapUp";

export const TUTORIAL_STEP_IDS: readonly TutorialStepId[] = [
    "welcome",
    "makeAMap",
    "findWorld",
    "rendering",
    "openMap",
    "publish",
    "wrapUp",
];

/** Real, observable "the user did the thing" events a step can advance itself on. */
export type TutorialSignal = "world-chosen";

export interface TutorialStep {
    readonly id: TutorialStepId;
    /** The shell page id this step's anchor lives on, e.g. `"world"` or `"pages"`. */
    readonly pageId: string;
    /** A CSS selector resolving to the one real element this step highlights. */
    readonly anchor: string;
    /** Fires the step forward on its own when this event happens, on top of Next. */
    readonly signal?: TutorialSignal;
}

/**
 * The genuine first-run path, in order: what BlueMap is, finding a world the computer
 * already has, what rendering means and roughly how long it takes, where the finished map
 * goes and how to open it, that it can be published, and where to find this tour again.
 */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
    {
        id: "welcome",
        pageId: "map",
        anchor: '[data-tutorial-anchor="tab-map"]',
    },
    {
        id: "makeAMap",
        pageId: "world",
        anchor: '[data-tutorial-anchor="tab-world"]',
    },
    {
        id: "findWorld",
        pageId: "world",
        anchor: '[data-tutorial-anchor="world-find"]',
        signal: "world-chosen",
    },
    {
        id: "rendering",
        pageId: "world",
        anchor: '[data-tutorial-anchor="world-render-explainer"]',
    },
    {
        id: "openMap",
        pageId: "map",
        anchor: '[data-tutorial-anchor="tab-map"]',
    },
    {
        id: "publish",
        pageId: "pages",
        anchor: '[data-tutorial-anchor="pages-publish"]',
    },
    {
        id: "wrapUp",
        pageId: "docs",
        anchor: '[data-tutorial-anchor="tab-docs"]',
    },
];

export function tutorialStepIndex(id: TutorialStepId): number {
    return TUTORIAL_STEPS.findIndex((step) => step.id === id);
}
