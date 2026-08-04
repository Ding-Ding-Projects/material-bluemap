/**
 * Asking a surface somewhere else in the tree to open itself.
 *
 * The command palette's rule is that it opens nothing itself: every destination emits to the
 * shell, and the shell calls the code it already had for that button. That works perfectly for
 * the surfaces the shell owns - the settings sheet, the options editor, a page of the tab
 * strip - because the shell holds the state that shows them.
 *
 * It does not work for three surfaces, and they are exactly the three a person is most likely
 * to look for by name because they cannot remember which corner they were in:
 *
 *  - the **notification centre**, which is a menu anchored to a bell inside the notification
 *    corner, which is itself a component mounted beside the shell rather than inside it;
 *  - the **tab finder**, which is a panel anchored to a button at the end of the tab strip,
 *    two components below the shell;
 *  - the **changelog**, which is a disclosure inside the viewer's own Info page, which only
 *    exists while a map is open and the menu is showing.
 *
 * In each case the state that decides whether the surface is open is local to the component
 * that draws it, and correctly so: it is anchored to a control that component owns, it closes
 * on Escape back to that control, and hoisting that into the shell would mean the shell
 * holding open-state for a panel it cannot see. The alternative that keeps being reached for -
 * a template ref threaded down through every intervening component so the shell can call a
 * method - is worse: it makes each layer's public surface grow a method it does not use, and
 * it breaks the moment an intervening component is conditionally rendered, which two of these
 * three are.
 *
 * So this is a doorbell rather than a switch. The shell rings it; whoever owns the surface is
 * listening and opens itself, with its own focus handling and its own idea of what opening
 * means. Nothing here holds "is it open" - that stays exactly where it was.
 *
 * **A counter rather than a boolean, deliberately.** A boolean set to true is stuck true: the
 * user closes the panel, asks for it again from the palette, and nothing happens because the
 * value never changed. Each request increments, so every ask is a distinct change and every
 * ask reopens. The number itself means nothing and is never read for its value.
 *
 * Requests raised while nobody is listening are dropped, and that is the honest behaviour: a
 * changelog asked for with no viewer running has nowhere to appear, and a request queued for
 * a component that may never mount would open the panel at a surprising moment much later.
 * Callers that can tell in advance - the palette, which knows whether a viewer is running -
 * do not build the row at all rather than ringing a bell nobody will answer.
 */

import { ref, watch, type Ref } from "vue";

/** The surfaces that can be asked to open from somewhere other than their own control. */
export type RevealRequest = "noticeCentre" | "tabFinder" | "changelog";

const counters: Record<RevealRequest, Ref<number>> = {
    noticeCentre: ref(0),
    tabFinder: ref(0),
    changelog: ref(0),
};

/** Rings the bell for one surface. Does nothing observable when nobody is listening. */
export function requestReveal(id: RevealRequest): void {
    counters[id].value += 1;
}

/**
 * The raw counter, for a test that wants to assert a request was raised without mounting the
 * component that answers it. Never read for its value; only that it changed.
 */
export function revealCount(id: RevealRequest): Ref<number> {
    return counters[id];
}

/**
 * Runs `handler` every time this surface is asked to open.
 *
 * Call it from `setup`, where the watcher it creates is bound to the calling component and
 * stops with it. Called anywhere else the watcher would outlive its component and reopen a
 * panel that is no longer on screen.
 */
export function onRevealRequested(id: RevealRequest, handler: () => void): void {
    watch(counters[id], () => {
        handler();
    });
}

/** Resets every counter. For tests, so one case cannot leave a request visible to the next. */
export function resetRevealRequests(): void {
    for (const counter of Object.values(counters)) counter.value = 0;
}
