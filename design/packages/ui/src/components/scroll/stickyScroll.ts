/**
 * Sticky-scroll following for any surface that shows appended output while it happens: the
 * render console, a backup's own log, a download's own log, and whatever streams output
 * next. One implementation rather than three, because the tricky part - not fighting a
 * reader who scrolled up, not fighting a reader who is mid-selection, jumping instead of
 * animating under reduced motion - is exactly the part three independent copies would go on
 * to disagree about.
 *
 * ## Telling a reader's scroll from this module's own
 *
 * There is no flag that says "ignore the next scroll event." The mechanism is simpler than
 * that and does not need one: {@link scrollToBottom} is the only scroll this module ever
 * performs, and it always targets exactly the bottom. So after it runs, the container's own
 * position genuinely *is* the bottom, and `atBottom` is set straight from that fact rather
 * than inferred. A container that is away from the bottom therefore always got there through
 * something this module did not do - a wheel, a trackpad, a keyboard press, a dragged
 * scrollbar - which is a real reader's own scroll, not a false positive to filter out.
 *
 * ## Preference against pause: two different pieces of state, on purpose
 *
 * `enabled` is the checkbox: a stored choice that only the reader's own click, or a restored
 * preference, ever changes. `paused` is `enabled && not at the bottom`, recomputed on every
 * scroll and never written to directly. Scrolling up pauses `paused` without touching
 * `enabled`, which is the whole point: the reader did not say "stop following forever," they
 * scrolled up to read something. Scrolling back to the bottom - by hand, or via
 * {@link scrollToBottom} - clears `paused` again without the reader having to find the
 * checkbox and tick it back on.
 *
 * ## Not fighting a selection
 *
 * A reader with text selected inside the container is reading it or about to copy it, and an
 * auto-follow that yanks the view out from under that selection is the single most annoying
 * thing this feature could do - worse than not auto-scrolling at all. So an append that would
 * otherwise scroll checks {@link hasSelectionWithin} first and, when a selection is found,
 * recomputes `paused` honestly (content may have grown past what is on screen, and the "back
 * to the newest" control should say so) without moving the container by one pixel. An
 * explicit click on that control is a different thing entirely - the reader's own request to
 * jump - and always executes, selection or not.
 */

import { computed, nextTick, ref, watch, type ComputedRef, type Ref } from "vue";
import { isAtBottom, type ScrollMetrics } from "../console/consoleModel.js";
import { useAutoScrollPreference, type AutoScrollStorage } from "./autoScrollPrefs.js";

function metricsOf(el: HTMLElement): ScrollMetrics {
    return { scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
}

/**
 * Instant when the reader has asked for less motion.
 *
 * Feature-detected rather than assumed: jsdom has no `matchMedia`, and a scroller that
 * throws on mount in the test environment is a scroller nobody can test.
 */
export function smoothScrollAllowed(): boolean {
    const query = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
    return query === undefined ? true : !query.matches;
}

/**
 * Whether the reader has an active, non-collapsed text selection inside `el`.
 *
 * A collapsed selection is just the text caret sitting somewhere, not something being read
 * or about to be copied, so it does not hold the view back - only a real, extended selection
 * does.
 */
export function hasSelectionWithin(el: HTMLElement): boolean {
    const doc = el.ownerDocument;
    const selection = doc?.getSelection?.();
    if (selection === null || selection === undefined || selection.isCollapsed) return false;
    const anchor = selection.anchorNode;
    return anchor !== null && el.contains(anchor);
}

export interface StickyScrollOptions {
    /** Which persisted "follow new output" preference this scroller reads and writes. */
    surface: string;
    /** What a reader who has never touched the checkbox gets. */
    defaultEnabled: boolean;
    /** The scrolling element. Read fresh on every call, so a `v-if`-guarded element is fine. */
    container: Ref<HTMLElement | null>;
    /**
     * How many appended items there are right now. Watched by length rather than by the
     * array itself, so a ten-thousand-line console is not deep-diffed on every appended
     * line - the same reasoning `RenderConsole.vue` already applied to its own watch.
     */
    length: () => number;
    /** Injectable for a test; omit to use `localStorage`. */
    storage?: AutoScrollStorage | null;
}

export interface StickyScroll {
    /** The checkbox's own `v-model` target: the persisted preference. */
    enabled: Ref<boolean>;
    /** True only once the reader has scrolled away while `enabled` is on. */
    paused: ComputedRef<boolean>;
    /** Bind to the container's native `scroll` event. */
    onScroll: () => void;
    /**
     * An explicit jump to the newest content - the "Newest lines" control, and what an
     * initial mount or a just-opened disclosure calls to start at the bottom. Always moves
     * the view: a click or an open is the reader's own action, never this module fighting
     * a selection.
     */
    scrollToBottom: () => void;
}

/**
 * Wires sticky-scroll following to one scroll container.
 *
 * The caller owns the container ref and the length signal; this function owns the decision
 * of when to move it. Nothing here reads or writes DOM on its own before `length` first
 * changes - the caller still calls {@link StickyScroll.scrollToBottom} once, itself, for the
 * initial position (on mount, or when a disclosure holding the log first opens), because
 * "where does this start" and "should the next append follow" are different questions and
 * conflating them would auto-scroll a reader who opened a long-collapsed log straight past
 * the point they just clicked to reach.
 */
export function useStickyScroll(options: StickyScrollOptions): StickyScroll {
    const enabled = useAutoScrollPreference(options.surface, options.defaultEnabled, options.storage ?? undefined);
    const atBottom = ref(true);
    const paused = computed(() => enabled.value && !atBottom.value);

    function recomputeAtBottom(): boolean {
        const el = options.container.value;
        if (el === null) return atBottom.value;
        const now = isAtBottom(metricsOf(el));
        atBottom.value = now;
        return now;
    }

    function scrollToBottom(): void {
        const el = options.container.value;
        if (el === null) return;
        const top = el.scrollHeight;
        // `scrollTo` with options is missing in jsdom, so the assignment is the fallback
        // rather than the exception: without it the whole follow behaviour throws in tests.
        if (typeof el.scrollTo === "function") {
            el.scrollTo({ top, behavior: smoothScrollAllowed() ? "smooth" : "auto" });
        } else {
            el.scrollTop = top;
        }
        atBottom.value = true;
    }

    function onScroll(): void {
        recomputeAtBottom();
    }

    function notifyAppended(): void {
        if (!enabled.value) return;
        void nextTick(() => {
            const el = options.container.value;
            if (el === null) return;
            // Already detached: new content must not silently re-attach the view. The
            // reader gets back by scrolling down themselves, or by the jump control.
            if (!atBottom.value) return;
            if (hasSelectionWithin(el)) {
                // Never move the view out from under a selection. Recomputing here still
                // tells the truth about whether content has grown past the fold - it just
                // does so by reading the position, not by changing it.
                recomputeAtBottom();
                return;
            }
            scrollToBottom();
        });
    }

    watch(options.length, () => notifyAppended());

    return { enabled, paused, onScroll, scrollToBottom };
}
