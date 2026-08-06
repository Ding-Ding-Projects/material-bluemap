/**
 * Sticky-scroll following, shared by every surface that streams appended output a reader
 * watches: the render console, a backup's own log, a download's own log.
 *
 * `stickyScroll.ts` is the mechanism - see its own doc comment for how a reader's scroll is
 * told apart from this module's, how the preference and the pause stay separate pieces of
 * state, and how a selection is never fought. `autoScrollPrefs.ts` is what makes the
 * preference survive a restart, one flag per surface under one storage key.
 */

export {
    hasSelectionWithin,
    smoothScrollAllowed,
    useStickyScroll,
    type StickyScroll,
    type StickyScrollOptions,
} from "./stickyScroll.js";

export {
    readAutoScrollPreference,
    useAutoScrollPreference,
    writeAutoScrollPreference,
    type AutoScrollStorage,
} from "./autoScrollPrefs.js";
