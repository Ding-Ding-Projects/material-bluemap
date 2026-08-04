/**
 * Mojang download consent, as one live value rather than a flag each surface sampled once.
 *
 * ## The defect this exists to fix
 *
 * `WorldScreen.vue` used to read consent once in `onMounted` and never again. The result
 * was a remedy that led nowhere: the review step warned that the download had not been
 * accepted and offered **Open the setting**; the setting opened, accepting it worked and
 * persisted; and the warning stayed for the life of the window. The user did exactly what
 * they were told and the application went on telling them they had not. Navigating to
 * another step and back did not help either, because nothing anywhere re-read the record.
 *
 * A value that can change while a surface is on screen is not a value you sample at mount.
 *
 * ## Why this is a fallback, and what the real fix looks like
 *
 * The honest shape is one shared store that both the settings row and every reader write
 * to and read from, so accepting consent *is* the update and nothing has to notice it.
 * That store belongs beside `stores/notices.ts` and `stores/profiles.ts`, and the settings
 * row that performs the accept lives in `components/setup/`. Both are outside the ownership
 * of the change this was written in, so neither can be made to publish here.
 *
 * So this is the documented fallback: one shared reactive value that every world surface
 * reads, plus explicit re-reads at the moments the record can have changed. It is
 * deliberately **not** a poll. {@link refreshConsent} is called:
 *
 *   - when a surface that shows consent mounts;
 *   - when the settings surface closes, which is the exact moment the reproduction
 *     describes (the shell watches its own settings dialog and bumps an epoch, so this is
 *     an event rather than a guess);
 *   - when the wizard moves between steps, so navigating away and back also corrects it;
 *   - when the window regains focus or the document becomes visible, which covers the
 *     record being changed by another window or another process.
 *
 * Every one of those is an event. When the shared store arrives, {@link consentAccepted}
 * becomes a re-export of it and every call site here stays as it is.
 *
 * ## Three states, not two
 *
 * `null` means nobody has managed to read the record yet, which is a different thing from
 * having read it and found no consent. The surfaces render the safe direction for both -
 * they point at the setting rather than promising a render that would stop - but the
 * distinction matters for {@link consentKnown}, which is what stops a re-read being
 * skipped because an unknown was mistaken for a definite no.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";

/** What a bridge has to offer for consent to be readable at all. */
export interface ConsentReader {
    readConsent(): Promise<{ accepted: boolean }>;
}

/**
 * The record as this application currently understands it.
 *
 * Module scope on purpose: two surfaces showing two different answers to "has this been
 * accepted" is the same class of defect as one surface showing a stale answer.
 */
export const consentAccepted: Ref<boolean | null> = ref(null);

/** True once a read has actually succeeded. See the note about three states. */
export const consentKnown: ComputedRef<boolean> = computed(() => consentAccepted.value !== null);

/** What a surface should act on: an unread record is treated as "not accepted". */
export const consentIsAccepted: ComputedRef<boolean> = computed(() => consentAccepted.value === true);

/**
 * The read in flight, so a burst of triggers costs one call rather than five.
 *
 * Focus, visibility and a step change can all fire within a frame of each other when
 * somebody closes a dialog, and three concurrent reads of the same record would race to
 * write the same ref with the same answer.
 */
let inFlight: Promise<boolean | null> | null = null;

/**
 * Reads the record again, and reports what it now says.
 *
 * Never rejects. A bridge that throws leaves the last known value alone rather than
 * flipping it to false: a failed read is not evidence that consent was withdrawn, and
 * treating it as such would make a transient error look like the user's own answer
 * changing under them. A build with no bridge answers null, which is the truth - this page
 * cannot see the record at all.
 */
export function refreshConsent(bridge: ConsentReader | null): Promise<boolean | null> {
    if (bridge === null) return Promise.resolve(consentAccepted.value);
    if (inFlight !== null) return inFlight;

    inFlight = (async () => {
        try {
            const record = await bridge.readConsent();
            consentAccepted.value = record.accepted;
        } catch {
            // Left exactly as it was. See the note above.
        } finally {
            inFlight = null;
        }
        return consentAccepted.value;
    })();

    return inFlight;
}

/**
 * Forgets what was read, for a test that needs to start from nothing.
 *
 * Module state outlives a mount, which is the whole point of it here and a trap in a test
 * file where one case's answer would otherwise be the next case's starting position.
 */
export function forgetConsent(): void {
    consentAccepted.value = null;
    inFlight = null;
}
