/**
 * Asking the shell-mounted tour to open itself, from somewhere else in the tree.
 *
 * `TutorialOverlay.vue` is mounted once, at the shell, exactly like `CommandPalette.vue` and
 * `ConfigNotifications.vue`. Three surfaces need to open it - the Info page's own button, the
 * docs browser's own button, and a command palette row - and none of the three is a parent of
 * the overlay or of each other. The doorbell pattern from `shell/revealRequests.ts` is the
 * established answer to exactly this shape in this package, so this is that pattern, kept in
 * its own module rather than folded into `revealRequests.ts`'s closed `RevealRequest` union:
 * the tour is not one of the shell's existing reveal targets, and a second feature reaching
 * into that union is how it stops being a short, reviewable list.
 */

import { ref, watch, type Ref } from "vue";

const counter: Ref<number> = ref(0);

/** Asks the tour to open (or reopen) itself. Does nothing observable when nobody is listening. */
export function requestTutorialLaunch(): void {
    counter.value += 1;
}

/** The raw counter, for a test that wants to assert a launch was requested without mounting the tour. */
export function tutorialLaunchCount(): Ref<number> {
    return counter;
}

/**
 * Runs `handler` every time the tour is asked to open.
 *
 * Call it from `setup`, where the watcher it creates is bound to the calling component and
 * stops with it.
 */
export function onTutorialLaunchRequested(handler: () => void): void {
    watch(counter, () => {
        handler();
    });
}

/** Resets the counter. For tests, so one case cannot leave a request visible to the next. */
export function resetTutorialLaunchRequests(): void {
    counter.value = 0;
}
