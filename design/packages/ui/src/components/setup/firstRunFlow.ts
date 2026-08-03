/**
 * The first-run flow itself: three steps, one consent answer, one completion.
 *
 * Kept out of the components on purpose. Everything that decides anything lives here as
 * plain functions over refs, so the rules that matter can be proved by a unit test
 * rather than by somebody clicking through a wizard and hoping:
 *
 *  - consent is answered on the consent step or not at all. There is no `next()` that
 *    walks past it;
 *  - **completion happens whichever way consent was answered.** Declining is an answer,
 *    it is remembered, and the person who gave it is not shown this dialog again on the
 *    next launch, and the launch after that, until they give in. That failure mode is
 *    the entire reason `completeFirstRun()` is separate from `acceptDownload()` in the
 *    main process, and `finish()` calls it on both paths;
 *  - going back after accepting and then declining actually withdraws the acceptance,
 *    rather than leaving a record that says yes while the screen said no;
 *  - a bridge failure never silently swallows the answer. The flag stays unset, the
 *    dialog says so, and setup opens again next launch, which is the safe direction.
 *
 * `start()` asks the main process whether this is a first launch. In a plain browser
 * there is no bridge, there is no local rendering to consent to, and nothing is shown.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    currentPlatform,
    defaultMapStorageDir,
    normalizeMapStorageDir,
    readMapStorageDir,
    validateMapStorageDir,
    writeMapStorageDir,
    type MapStorageProblem,
    type SetupPlatform,
} from "./mapStorage.js";

export const SETUP_STEPS = ["welcome", "consent", "storage"] as const;
export type SetupStep = (typeof SETUP_STEPS)[number];

/** What the person answered during this run of the flow. */
export type ConsentAnswer = "accepted" | "declined" | null;

/** Mirrors `ConsentRecord` in the main process, structurally. */
export interface ConsentRecordLike {
    accepted: boolean;
    acceptedAt: string | null;
    documentUrl: string;
    termsVersion: number;
    appVersion: string | null;
}

export interface FirstRunStateLike {
    completed: boolean;
    completedAt: string | null;
}

/**
 * The bridge surface this flow uses. A structural interface rather than a reference to
 * the ambient `Window["materialBluemap"]` type, so a test can hand in a fake and so
 * this module compiles in a build that has no Electron preload at all.
 */
export interface SetupBridge {
    readConsent(): Promise<ConsentRecordLike>;
    acceptDownload(): Promise<ConsentRecordLike>;
    revokeDownloadConsent(): Promise<ConsentRecordLike>;
    needsFirstRun(): Promise<boolean>;
    completeFirstRun(): Promise<FirstRunStateLike>;
}

/**
 * Bridge methods that do not exist yet.
 *
 * The storage step works today without them: it shows the platform's own default with
 * its environment token, which the main process expands when a render starts. When the
 * preload grows a real folder picker and a resolved default, the step picks both up by
 * feature detection and stops showing the token form. Nothing here fails when they are
 * absent, and nothing pretends to be a folder picker that is not one.
 */
export interface OptionalStorageBridge {
    /** The absolute path the main process would use, already expanded. */
    defaultMapStorageDirectory?: () => Promise<string>;
    /** Opens the platform folder picker. Resolves null when it is cancelled. */
    chooseMapStorageDirectory?: (current: string) => Promise<string | null>;
}

export function resolveBridge(): SetupBridge | null {
    const host = globalThis as { materialBluemap?: SetupBridge };
    return host.materialBluemap ?? null;
}

export function resolveStorageBridge(): OptionalStorageBridge | null {
    const host = globalThis as { materialBluemap?: OptionalStorageBridge };
    return host.materialBluemap ?? null;
}

export interface FirstRunController {
    /** Whether the setup surface should be on screen. False until `start()` says so. */
    readonly visible: Ref<boolean>;
    readonly step: Ref<SetupStep>;
    /** One-based, for "Step 2 of 3". */
    readonly stepNumber: ComputedRef<number>;
    readonly stepCount: number;
    readonly answer: Ref<ConsentAnswer>;
    readonly storageDir: Ref<string>;
    readonly storageProblem: ComputedRef<MapStorageProblem>;
    /** True while an await is in flight. Every submitting control disables on it. */
    readonly busy: Ref<boolean>;
    /** A completion that did not land, stated rather than swallowed. */
    readonly failure: Ref<string | null>;
    readonly platform: SetupPlatform;
    /** True when the default still carries an environment token to be expanded. */
    readonly storageIsToken: ComputedRef<boolean>;
    /** True when the folder picker exists on this build. */
    readonly canBrowse: boolean;

    start(): Promise<boolean>;
    next(): void;
    back(): void;
    answerConsent(accepted: boolean): Promise<void>;
    browse(): Promise<void>;
    useDefaultStorage(): void;
    finish(): Promise<boolean>;
    /** Closes without completing, offered only after a completion failure. */
    dismissAfterFailure(): void;
}

export interface FirstRunOptions {
    bridge?: SetupBridge | null;
    storageBridge?: OptionalStorageBridge | null;
    platform?: SetupPlatform;
}

function describe(error: unknown): string {
    if (error instanceof Error) return error.message;
    return String(error);
}

export function createFirstRunController(options: FirstRunOptions = {}): FirstRunController {
    const bridge = options.bridge !== undefined ? options.bridge : resolveBridge();
    const storageBridge =
        options.storageBridge !== undefined ? options.storageBridge : resolveStorageBridge();
    const platform = options.platform ?? currentPlatform();

    const visible = ref(false);
    const step = ref<SetupStep>("welcome");
    const answer = ref<ConsentAnswer>(null);
    const storageDir = ref(readMapStorageDir() ?? defaultMapStorageDir(platform));
    const busy = ref(false);
    const failure = ref<string | null>(null);
    let completed = false;

    const stepNumber = computed(() => SETUP_STEPS.indexOf(step.value) + 1);
    const storageProblem = computed(() => validateMapStorageDir(storageDir.value, platform));
    const storageIsToken = computed(
        () => storageDir.value.trim() === defaultMapStorageDir(platform),
    );

    async function start(): Promise<boolean> {
        if (!bridge) return false;
        let needed: boolean;
        try {
            needed = await bridge.needsFirstRun();
        } catch (error) {
            // The main process could not be asked. Showing setup one extra time is a far
            // smaller harm than skipping the consent question entirely, but a bridge that
            // is not answering is also not going to record an answer, so nothing is shown
            // and the failure is reported instead of being turned into a fake first run.
            failure.value = describe(error);
            return false;
        }
        if (!needed) return false;

        // Someone may already have accepted through the environment variable or a previous
        // partial run. Reflect that rather than presenting an unanswered question.
        try {
            const record = await bridge.readConsent();
            if (record.accepted) answer.value = "accepted";
        } catch {
            // Not knowing the prior answer only means the question is asked as new.
        }

        if (storageBridge?.defaultMapStorageDirectory && readMapStorageDir() === null) {
            try {
                const resolved = await storageBridge.defaultMapStorageDirectory();
                if (resolved.trim().length > 0) storageDir.value = resolved;
            } catch {
                // The token form is a working default; a failed lookup is not worth a stop.
            }
        }

        visible.value = true;
        return true;
    }

    function next(): void {
        if (step.value === "welcome") {
            step.value = "consent";
            return;
        }
        // The consent step has no Next. Accept and Decline are the only ways forward, and
        // they are the same size, in the same row, in that order.
        if (step.value === "consent" && answer.value !== null) step.value = "storage";
    }

    function back(): void {
        if (step.value === "storage") step.value = "consent";
        else if (step.value === "consent") step.value = "welcome";
    }

    async function answerConsent(accepted: boolean): Promise<void> {
        if (busy.value || !bridge) return;
        busy.value = true;
        failure.value = null;
        try {
            if (accepted) {
                await bridge.acceptDownload();
                answer.value = "accepted";
            } else {
                // Only write when there is something to undo. A decline on a machine that
                // never accepted has nothing to revoke, and rewriting the file to say the
                // same thing would give it a misleading fresh timestamp.
                if (answer.value === "accepted") await bridge.revokeDownloadConsent();
                answer.value = "declined";
            }
            step.value = "storage";
        } catch (error) {
            failure.value = describe(error);
        } finally {
            busy.value = false;
        }
    }

    async function browse(): Promise<void> {
        const choose = storageBridge?.chooseMapStorageDirectory;
        if (!choose || busy.value) return;
        busy.value = true;
        try {
            const chosen = await choose(storageDir.value);
            if (chosen !== null && chosen.trim().length > 0) {
                storageDir.value = normalizeMapStorageDir(chosen, platform);
            }
        } catch (error) {
            failure.value = describe(error);
        } finally {
            busy.value = false;
        }
    }

    function useDefaultStorage(): void {
        storageDir.value = defaultMapStorageDir(platform);
    }

    async function finish(): Promise<boolean> {
        if (busy.value || !bridge) return false;
        if (storageProblem.value !== null) return false;
        busy.value = true;
        failure.value = null;
        try {
            writeMapStorageDir(storageDir.value, platform);
            // Whichever way consent was answered. A person who declined has finished
            // setup exactly as much as a person who accepted.
            if (!completed) {
                await bridge.completeFirstRun();
                completed = true;
            }
            visible.value = false;
            return true;
        } catch (error) {
            failure.value = describe(error);
            return false;
        } finally {
            busy.value = false;
        }
    }

    function dismissAfterFailure(): void {
        visible.value = false;
    }

    return {
        visible,
        step,
        stepNumber,
        stepCount: SETUP_STEPS.length,
        answer,
        storageDir,
        storageProblem,
        busy,
        failure,
        platform,
        storageIsToken,
        canBrowse: typeof storageBridge?.chooseMapStorageDirectory === "function",
        start,
        next,
        back,
        answerConsent,
        browse,
        useDefaultStorage,
        finish,
        dismissAfterFailure,
    };
}

/* -------------------------------------------------------------------------- */
/* Consent, as seen from Settings                                             */
/* -------------------------------------------------------------------------- */

export interface ConsentSettingsController {
    readonly record: Ref<ConsentRecordLike | null>;
    readonly busy: Ref<boolean>;
    readonly failure: Ref<string | null>;
    readonly available: boolean;
    readonly accepted: ComputedRef<boolean>;
    /**
     * True once the question has actually been put to somebody, which is what separates
     * "declined" from "never asked". The stored record has no third state, so this is
     * derived from first-run setup having been completed.
     */
    readonly asked: Ref<boolean>;
    load(): Promise<void>;
    accept(): Promise<void>;
    withdraw(): Promise<void>;
}

/**
 * The same consent record, from the other end: the settings row that shows what was
 * answered, when, and lets it be changed. This is where a render that lacks consent
 * points somebody, so it never asks the question itself.
 */
export function createConsentSettings(bridge?: SetupBridge | null): ConsentSettingsController {
    const resolved = bridge !== undefined ? bridge : resolveBridge();
    const record = ref<ConsentRecordLike | null>(null);
    const busy = ref(false);
    const failure = ref<string | null>(null);
    const asked = ref(false);

    const accepted = computed(() => record.value?.accepted ?? false);

    async function load(): Promise<void> {
        if (!resolved) return;
        busy.value = true;
        try {
            record.value = await resolved.readConsent();
            // A stored record that says "not accepted" means two different things: the
            // question was declined, or it has not been put yet. Setup having completed is
            // what tells them apart, and calling somebody's deliberate "no" an unanswered
            // question is how an app talks itself into asking again.
            asked.value = !(await resolved.needsFirstRun());
            failure.value = null;
        } catch (error) {
            failure.value = describe(error);
        } finally {
            busy.value = false;
        }
    }

    async function accept(): Promise<void> {
        if (!resolved || busy.value) return;
        busy.value = true;
        try {
            record.value = await resolved.acceptDownload();
            failure.value = null;
        } catch (error) {
            failure.value = describe(error);
        } finally {
            busy.value = false;
        }
    }

    async function withdraw(): Promise<void> {
        if (!resolved || busy.value) return;
        busy.value = true;
        try {
            record.value = await resolved.revokeDownloadConsent();
            failure.value = null;
        } catch (error) {
            failure.value = describe(error);
        } finally {
            busy.value = false;
        }
    }

    return {
        record,
        busy,
        failure,
        available: resolved !== null,
        accepted,
        asked,
        load,
        accept,
        withdraw,
    };
}

/**
 * "3 August 2026 at 09:14" from the stored ISO-8601 timestamp, or null when there is
 * none. Formatted in the viewer's locale rather than reprinted as an ISO string,
 * because "when did I agree to this" is a question a person asks, not a machine.
 */
export function formatConsentTimestamp(iso: string | null, locale: string): string | null {
    if (iso === null) return null;
    const when = new Date(iso);
    if (Number.isNaN(when.getTime())) return null;
    try {
        // Upstream BlueMap's locale files are named `zh_cn`, `pt_br` and so on, which is
        // not a BCP 47 tag: `Intl` throws a RangeError on the underscore. One replacement
        // turns every one of them into the tag it was always meant to be.
        return new Intl.DateTimeFormat(locale.replace(/_/g, "-"), {
            dateStyle: "long",
            timeStyle: "short",
        }).format(when);
    } catch {
        return when.toISOString();
    }
}
