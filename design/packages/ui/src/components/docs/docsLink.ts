/**
 * Asking the docs browser to open a specific article, from anywhere in the tree.
 *
 * `revealRequests.ts` next door already solves "open this surface" for three panels that
 * stay mounted regardless of which shell tab is showing. The docs browser is not one of
 * them: `TabbedNavigation.vue` renders only the active page's slot, so `DocsPage.vue` does
 * not exist in the DOM at all until somebody switches to the Docs tab. A plain counter that
 * nobody is listening to yet would be dropped exactly the way `revealRequests.ts` documents
 * - "raised while nobody is listening" - and the article would never open.
 *
 * So this carries a **payload that survives until it is read**, rather than a counter that
 * only means "something changed". `App.vue` (always mounted) reacts to a request by
 * switching to the Docs tab; `DocsPage.vue` (mounted only once that switch lands) reads the
 * pending target in its own `onMounted` and opens it. A second request while the Docs tab is
 * already open and `DocsPage.vue` is already mounted is caught by the watcher instead, since
 * `onMounted` will not fire again for a component that never unmounted.
 *
 * Kept generic to one target - `{ id, hash }`, exactly what `DocsPage.openArticle` already
 * takes - rather than glossary-specific, so a future caller that wants to deep-link anywhere
 * else in the bundled documentation reaches for this instead of inventing a second doorbell.
 */

import { ref, watch } from "vue";

export interface DocsTarget {
    /** A bundled article id, e.g. `"glossary"`. */
    readonly id: string;
    /** Includes the leading `#` when present, exactly as `DocsPage.openArticle` expects. */
    readonly hash: string;
}

const pending = ref<DocsTarget | null>(null);

/** Asks the docs browser to open `id`, optionally scrolled to `hash` (with its leading `#`). */
export function requestDocsArticle(id: string, hash = ""): void {
    pending.value = { id, hash };
}

/**
 * Reads the pending target and clears it, for a component's own `onMounted`: a request raised
 * before this component existed is still sitting here waiting to be read exactly once.
 */
export function takePendingDocsArticle(): DocsTarget | null {
    const value = pending.value;
    pending.value = null;
    return value;
}

/**
 * Runs `handler` for every request raised *while the caller is already mounted*. Call from
 * `setup`, where the watcher stops with the component. Does not fire for a target that was
 * already pending before the watcher was created - `takePendingDocsArticle` in `onMounted`
 * is what catches that case.
 */
export function onDocsArticleRequested(handler: (target: DocsTarget) => void): void {
    watch(pending, (value) => {
        if (value !== null) handler(value);
    });
}

/** Resets the pending target. For tests, so one case cannot leave a request visible to the next. */
export function resetDocsLink(): void {
    pending.value = null;
}
