/**
 * The one live object the update surfaces share.
 *
 * Holds the state the main process pushes, subscribes once, and exposes the two pure models
 * from `updateModel.ts` as computed values. Two surfaces read it - the banner and the
 * settings row - and they must never hold two copies: a banner still offering to install
 * 0.2.0 beside a row that has already installed it is the failure a second copy produces.
 *
 * Everything is injectable. The bridge is a parameter, so a test drives the whole thing
 * with a stand-in and no preload; the dismissal is read through
 * `components/setup/setupPrefs.ts`, which every test in this package already swaps for an
 * in-memory store.
 */

import { computed, ref, type ComputedRef, type Ref } from "vue";
import {
    bannerFor,
    clearDismissedUpdate,
    dismissUpdate,
    readDismissedUpdate,
    statusFor,
    unknownUpdateState,
    type UpdateBannerModel,
    type UpdateStatusModel,
} from "./updateModel.js";
import { resolveUpdateBridge, type UpdateBridge, type UpdateRestartResult, type UpdateState } from "./updateBridge.js";

export interface UpdatesController {
    /** The last state the main process reported. Replaced whole, never patched. */
    readonly state: Ref<UpdateState>;
    readonly banner: ComputedRef<UpdateBannerModel>;
    readonly status: ComputedRef<UpdateStatusModel>;
    /** False when this build has no updater to talk to; every surface then renders nothing. */
    readonly available: boolean;
    /** The last refusal, so a surface can show why Restart did not restart. */
    readonly refusal: Ref<string | null>;
    check(): Promise<void>;
    restart(): Promise<UpdateRestartResult>;
    /** Puts this version's banner away. The settings row brings it back. */
    dismiss(): void;
    showAgain(): void;
    /** Unsubscribes. The shell runs for as long as the window does and never calls it. */
    stop(): void;
}

export interface UpdatesOptions {
    /** Defaults to {@link resolveUpdateBridge}. Passed in by every test. */
    readonly bridge?: UpdateBridge | null;
    /** The version to show before the main process has answered. */
    readonly currentVersion?: string;
    /**
     * Called with a refusal's sentence, so the shell can raise it on the notification
     * corner rather than this module reaching for a store it does not own.
     */
    readonly onRefusal?: (message: string) => void;
}

export function createUpdates(options: UpdatesOptions = {}): UpdatesController {
    const bridge = options.bridge === undefined ? resolveUpdateBridge() : options.bridge;
    const state = ref<UpdateState>(unknownUpdateState(options.currentVersion ?? ""));
    const dismissed = ref<string | null>(readDismissedUpdate());
    const refusal = ref<string | null>(null);

    let unsubscribe: (() => void) | null = null;
    /**
     * True once the main process has pushed anything.
     *
     * Subscribing before the first read is only half the fix. `state()` is a promise, so
     * its answer can land *after* a push that overtook it - and that answer is older. Left
     * unguarded it overwrites a freshly staged update with the state as it was when the
     * window opened, and the banner the download just earned disappears again.
     */
    let pushed = false;

    if (bridge !== null) {
        unsubscribe = bridge.onUpdateEvent((next) => {
            pushed = true;
            state.value = next;
        });
        void bridge.state().then(
            (first) => {
                if (!pushed) state.value = first;
            },
            () => {
                // A build whose bridge is present but refuses the first read still gets
                // every later push. Nothing is invented here to fill the gap.
            },
        );
    }

    const banner = computed(() =>
        bannerFor(state.value, {
            dismissedVersion: dismissed.value,
            canRestart: bridge?.canRestart ?? false,
        }),
    );

    const status = computed(() =>
        statusFor(state.value, {
            canCheck: bridge?.canCheck ?? false,
            canRestart: bridge?.canRestart ?? false,
        }),
    );

    return {
        state,
        banner,
        status,
        available: bridge !== null,
        refusal,
        async check(): Promise<void> {
            if (bridge === null) return;
            refusal.value = null;
            try {
                state.value = await bridge.check();
            } catch (error) {
                // The bridge is not supposed to reject, and a build whose preload is older
                // than this renderer might. Reported as a refusal rather than escaping into
                // a component as an unhandled rejection nobody sees.
                refusal.value = error instanceof Error ? error.message : String(error);
                options.onRefusal?.(refusal.value);
            }
        },
        async restart(): Promise<UpdateRestartResult> {
            if (bridge === null) {
                const answer: UpdateRestartResult = {
                    ok: false,
                    code: "unsupported",
                    message: "This build has no updater to restart into.",
                };
                refusal.value = answer.message;
                options.onRefusal?.(answer.message);
                return answer;
            }
            const answer = await bridge.restart();
            if (!answer.ok) {
                refusal.value = answer.message;
                options.onRefusal?.(answer.message);
            }
            return answer;
        },
        dismiss(): void {
            const version = state.value.readyVersion;
            if (version === null) return;
            dismissUpdate(version);
            dismissed.value = version;
        },
        showAgain(): void {
            clearDismissedUpdate();
            dismissed.value = null;
        },
        stop(): void {
            unsubscribe?.();
            unsubscribe = null;
        },
    };
}
