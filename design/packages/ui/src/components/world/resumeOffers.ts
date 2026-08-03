/**
 * Renders that stopped without finishing, and the offer to carry them on.
 *
 * A render of a large world runs for hours. The app closing, the machine
 * sleeping, the power going out or somebody pressing Cancel must not cost the
 * work already done, and it does not: BlueMap's storage is incremental, so
 * resuming re-runs the same render against the tiles already on disk and skips
 * everything it has already drawn. Nothing is deleted and nothing is restarted
 * behind anybody's back.
 *
 * A refused resume is shown as the refusal it is, with the reason. `config-changed`
 * is the one that actually happens: the settings moved since the render died, and
 * carrying on would leave half the map drawn with the old ones and half with the
 * new. That is a real answer, not an error, and it says which choice is left.
 */

import { ref, type Ref } from "vue";
import type {
    InterruptedRenderSummary,
    RenderMapRequest,
    ResumeRefused,
    ResumeResult,
    WorldBridge,
} from "./worldBridge.js";
import type { Translate } from "./worldFolder.js";

export interface ResumeOffers {
    readonly offers: Ref<readonly InterruptedRenderSummary[]>;
    readonly loading: Ref<boolean>;
    /** A load that did not happen, stated rather than swallowed. */
    readonly failure: Ref<string | null>;
    /** Refusals by render id, so each is shown beside the offer it belongs to. */
    readonly refusals: Ref<Readonly<Record<string, ResumeRefused>>>;
    /** The render id being resumed right now, or null. */
    readonly busy: Ref<string | null>;
    readonly available: boolean;

    load(): Promise<void>;
    resume(renderId: string, maps?: readonly RenderMapRequest[]): Promise<ResumeResult | null>;
    /** Declines an offer, so it is made once rather than at every launch. */
    dismiss(renderId: string): Promise<boolean>;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function createResumeOffers(bridge: WorldBridge | null): ResumeOffers {
    const offers = ref<readonly InterruptedRenderSummary[]>([]);
    const loading = ref(false);
    const failure = ref<string | null>(null);
    const refusals = ref<Readonly<Record<string, ResumeRefused>>>({});
    const busy = ref<string | null>(null);

    async function load(): Promise<void> {
        if (bridge === null || loading.value) return;
        loading.value = true;
        try {
            offers.value = await bridge.interruptedRenders();
            failure.value = null;
        } catch (error) {
            failure.value = describe(error);
        } finally {
            loading.value = false;
        }
    }

    async function resume(renderId: string, maps?: readonly RenderMapRequest[]): Promise<ResumeResult | null> {
        if (bridge === null || busy.value !== null) return null;
        busy.value = renderId;
        try {
            const result = maps === undefined ? await bridge.resumeRender(renderId) : await bridge.resumeRender(renderId, maps);
            if (result.started) {
                // It is running now, so it is no longer an interrupted render. Taking
                // it off the list here rather than waiting for a reload keeps the
                // offer from sitting under a progress bar for the same render.
                offers.value = offers.value.filter((offer) => offer.renderId !== renderId);
                const rest: Record<string, ResumeRefused> = { ...refusals.value };
                delete rest[renderId];
                refusals.value = rest;
            } else {
                refusals.value = { ...refusals.value, [renderId]: result.refusal };
            }
            return result;
        } catch (error) {
            failure.value = describe(error);
            return null;
        } finally {
            busy.value = null;
        }
    }

    async function dismiss(renderId: string): Promise<boolean> {
        if (bridge === null) return false;
        try {
            const done = await bridge.dismissResume(renderId);
            if (done) offers.value = offers.value.filter((offer) => offer.renderId !== renderId);
            return done;
        } catch (error) {
            failure.value = describe(error);
            return false;
        }
    }

    return { offers, loading, failure, refusals, busy, available: bridge !== null, load, resume, dismiss };
}

/**
 * Why a render stopped, in one sentence.
 *
 * Cancelled is kept apart from crashed because somebody who pressed Cancel got
 * exactly what they asked for, and telling them something went wrong would be
 * untrue.
 */
export function describeInterruption(summary: InterruptedRenderSummary, t: Translate): string {
    switch (summary.reason) {
        case "cancelled":
            return t("world.resume.cancelled", "You stopped this render. The tiles it had already drawn are still there.");
        case "failed":
            return t("world.resume.failed", "This render stopped with an error before it finished.");
        case "process-gone":
            return t(
                "world.resume.processGone",
                "This render was still running when the app or the machine stopped, so it never got to write an ending.",
            );
    }
}

/** How far it got, when it got far enough to say. */
export function describeProgress(summary: InterruptedRenderSummary, t: Translate): string {
    if (summary.percent === null) {
        return t("world.resume.noProgress", "It stopped before reporting any progress, so nothing is known about how far it got.");
    }
    const rounded = summary.percent.toFixed(1).replace(/\.0$/, "");
    // `t(key, named, fallback)`, never `t(key, fallback).replace(...)`: vue-i18n
    // compiles the fallback as a message too and consumes `{percent}` and `{what}`
    // as its own named parameters, so a later `replace` finds nothing to substitute
    // and the sentence about how far a render got says "It reached %."
    return summary.description === null
        ? t("world.resume.progress", { percent: rounded }, "It reached {percent}%.")
        : t("world.resume.progressAt", { percent: rounded, what: summary.description }, "It reached {percent}%, at {what}.");
}

/** What a refusal means and what is left to do about it. */
export function describeRefusal(refusal: ResumeRefused, t: Translate): { title: string; explanation: string } {
    switch (refusal.code) {
        case "config-changed":
            return {
                title: refusal.message,
                explanation: t(
                    "world.resume.refused.configChanged",
                    "The settings moved since this render stopped. Carrying on would leave half the map drawn with the old settings and half with the new, so it is refused. Start a fresh render with the settings you have now, or put them back and resume.",
                ),
            };
        case "already-running":
            return {
                title: refusal.message,
                explanation: t("world.resume.refused.alreadyRunning", "This render is already going. Its progress is on screen."),
            };
        case "not-interrupted":
            return {
                title: refusal.message,
                explanation: t(
                    "world.resume.refused.notInterrupted",
                    "This render is not in a state that can be carried on. It either finished or was never started.",
                ),
            };
        case "no-session":
            return {
                title: refusal.message,
                explanation: t(
                    "world.resume.refused.noSession",
                    "Nothing on disk describes this render any more, so there is no record of what it was doing. A fresh render will still reuse every tile it already wrote.",
                ),
            };
    }
}
