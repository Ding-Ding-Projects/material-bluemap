/**
 * "The user did the thing," rung from wherever the thing actually happens.
 *
 * The same doorbell shape as `shell/revealRequests.ts`, and for the same reason: the
 * component that knows a real action happened (`WorldScreen.vue`, watching a world folder
 * get chosen) is nowhere near the tour overlay in the component tree, and threading a prop
 * or an emit down through every intervening layer for one optional feature would give each
 * of them a concern they do not otherwise have. A counter rather than a boolean, because a
 * boolean set once and never reset cannot fire the same signal twice; every call here is a
 * distinct change a watcher can react to, and the number itself is never read for its value.
 *
 * A signal raised while the tour is not listening - closed, or open on a different step - is
 * simply dropped. That is correct: `WorldScreen.vue` does not know or care whether a tour is
 * open, and it would be wrong for choosing a world to silently start one.
 */

import { ref, watch, type Ref } from "vue";

/** Real, observable actions the tour can advance itself on. See `tutorialSteps.ts`. */
export type TutorialSignal = "world-chosen";

const counters: Record<TutorialSignal, Ref<number>> = {
    "world-chosen": ref(0),
};

/** Rings the bell for one signal. Does nothing observable when nobody is listening. */
export function emitTutorialSignal(id: TutorialSignal): void {
    counters[id].value += 1;
}

/** The raw counter, for a test that wants to assert a signal fired without mounting the tour. */
export function tutorialSignalCount(id: TutorialSignal): Ref<number> {
    return counters[id];
}

/**
 * Runs `handler` every time this signal fires.
 *
 * Call it from `setup`, where the watcher it creates is bound to the calling component and
 * stops with it.
 */
export function onTutorialSignal(id: TutorialSignal, handler: () => void): void {
    watch(counters[id], () => {
        handler();
    });
}

/** Resets every counter. For tests, so one case cannot leave a signal visible to the next. */
export function resetTutorialSignals(): void {
    for (const counter of Object.values(counters)) counter.value = 0;
}
