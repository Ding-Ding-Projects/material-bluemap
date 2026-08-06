/**
 * The state machine behind the one-button system-dependency installer.
 *
 * `dependencyBridge.ts` is the seam to the main process; this is what turns its three
 * calls and one pushed-event channel into something a panel can render truthfully:
 * a preview read before the button is pressed, a per-row live state while the batch
 * runs, an overall picture, and an honest report of what a cancellation actually left
 * installed and what it did not.
 *
 * ## Why per-row state is derived from events rather than only from the final result
 *
 * `installSysdeps()` resolves once, with the whole batch's outcomes. If this
 * composable waited for that alone, every row would sit in "queued" for however long
 * the batch takes and then jump straight to its final state - which is exactly the
 * fabricated-smoothness failure the brief warns against, just moved from the
 * percentage to the row itself. So every `onSysdepInstallEvent` is folded into the
 * matching row's live state immediately, and the final `outcomes` array is only used
 * to fill in whatever a row's last event did not already say (a row that got no
 * events at all - `installSysdeps` cancelling it before its turn - still needs its
 * outcome recorded).
 */

import { computed, onScopeDispose, reactive, ref, shallowRef, type ComputedRef, type Ref } from "vue";
import { raiseNotice } from "../../stores/notices.js";
import {
    canInstallSysdeps,
    resolveDependencyBridge,
    type DependencyInstallerBridge,
    type SysdepBatchResult,
    type SysdepInstallEvent,
    type SysdepInstallStage,
    type SysdepManagerId,
    type SysdepOutcome,
    type SysdepPreviewRow,
    type SysdepProgress,
} from "./dependencyBridge.js";

export type PreviewLoadState = "unsupported" | "loading" | "ready" | "failed";

export type RunState = "idle" | "running" | "cancelling";

const NO_PROGRESS: SysdepProgress = { kind: "none" };

/** One dependency row, the preview facts and whatever the live run has said about it. */
export interface DependencyRow {
    readonly id: string;
    readonly displayName: string;
    readonly preview: SysdepPreviewRow;
    /** `null` before its turn in a batch has produced any event at all. */
    readonly manager: SysdepManagerId | null;
    readonly stage: SysdepInstallStage | "idle";
    readonly message: string;
    readonly progress: SysdepProgress;
    readonly outcome: SysdepOutcome | null;
}

export interface DependencyInstallerOptions {
    /** Injected in tests. `undefined` means probe the preload, `null` means no bridge. */
    bridge?: DependencyInstallerBridge | null;
}

export interface DependencyInstaller {
    readonly supported: boolean;
    readonly previewState: Ref<PreviewLoadState>;
    readonly previewFailure: Ref<string | null>;
    readonly rows: ComputedRef<readonly DependencyRow[]>;
    /** Rows the button would actually change: not yet installed, and their route resolves. */
    readonly installableRows: ComputedRef<readonly DependencyRow[]>;
    readonly selected: Ref<ReadonlySet<string>>;
    readonly runState: Ref<RunState>;
    readonly log: Ref<readonly SysdepInstallEvent[]>;
    readonly lastResult: Ref<SysdepBatchResult | null>;

    loadPreview(): Promise<void>;
    toggle(id: string): void;
    selectAll(): void;
    selectNone(): void;
    selectInverse(): void;
    run(): Promise<void>;
    cancel(): Promise<void>;
}

function emptyRowFrom(preview: SysdepPreviewRow): DependencyRow {
    return {
        id: preview.id,
        displayName: preview.displayName,
        preview,
        manager: null,
        stage: "idle",
        message: "",
        progress: NO_PROGRESS,
        outcome: null,
    };
}

/** Whether the button pressing this row would actually do anything. */
function isInstallable(preview: SysdepPreviewRow): boolean {
    return preview.route.kind === "package-manager" && !preview.alreadyInstalled;
}

export function createDependencyInstaller(options: DependencyInstallerOptions = {}): DependencyInstaller {
    const bridge = options.bridge !== undefined ? options.bridge : resolveDependencyBridge();
    const supported = canInstallSysdeps(bridge);

    const previewState = ref<PreviewLoadState>(supported ? "loading" : "unsupported");
    const previewFailure = ref<string | null>(null);
    const previewRows = shallowRef<readonly SysdepPreviewRow[]>([]);

    /** Keyed by dependency id, mutated in place as events arrive - never replaced wholesale. */
    const live = reactive(new Map<string, DependencyRow>());

    const selected = ref<ReadonlySet<string>>(new Set());
    const runState = ref<RunState>("idle");
    const log = ref<SysdepInstallEvent[]>([]);
    const lastResult = ref<SysdepBatchResult | null>(null);

    const rows = computed<readonly DependencyRow[]>(() =>
        previewRows.value.map((preview) => live.get(preview.id) ?? emptyRowFrom(preview)),
    );

    const installableRows = computed<readonly DependencyRow[]>(() =>
        rows.value.filter((row) => isInstallable(row.preview)),
    );

    async function loadPreview(): Promise<void> {
        if (!supported || bridge?.sysdepsPreview === undefined) {
            previewState.value = "unsupported";
            return;
        }
        previewState.value = "loading";
        previewFailure.value = null;
        try {
            const answer = await bridge.sysdepsPreview();
            previewRows.value = answer;
            live.clear();
            selected.value = new Set(
                answer.filter((row) => isInstallable(row)).map((row) => row.id),
            );
            previewState.value = "ready";
        } catch (error) {
            previewFailure.value = error instanceof Error ? error.message : String(error);
            previewState.value = "failed";
        }
    }

    function toggle(id: string): void {
        const next = new Set(selected.value);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selected.value = next;
    }

    function selectAll(): void {
        selected.value = new Set(installableRows.value.map((row) => row.id));
    }

    function selectNone(): void {
        selected.value = new Set();
    }

    function selectInverse(): void {
        const installableIds = installableRows.value.map((row) => row.id);
        const next = new Set(installableIds.filter((id) => !selected.value.has(id)));
        selected.value = next;
    }

    function applyEvent(event: SysdepInstallEvent): void {
        log.value = [...log.value, event];
        const preview = previewRows.value.find((row) => row.id === event.dependency);
        if (preview === undefined) return;
        const current = live.get(event.dependency) ?? emptyRowFrom(preview);
        live.set(event.dependency, {
            ...current,
            manager: event.manager ?? current.manager,
            stage: event.stage,
            message: event.message,
            progress: event.progress,
        });
    }

    function applyOutcome(outcome: SysdepOutcome): void {
        const preview = previewRows.value.find((row) => row.id === outcome.dependency);
        if (preview === undefined) return;
        const current = live.get(outcome.dependency) ?? emptyRowFrom(preview);
        // An outcome never overwrites a live stage that already says something more
        // specific than the outcome's own generic name would - it only fills in the
        // outcome object itself so the row can render exit codes and real error text.
        live.set(outcome.dependency, { ...current, outcome });
    }

    let unsubscribe: (() => void) | null = null;
    if (supported && bridge?.onSysdepInstallEvent !== undefined) {
        unsubscribe = bridge.onSysdepInstallEvent((event) => applyEvent(event));
    }
    onScopeDispose(() => unsubscribe?.());

    async function run(): Promise<void> {
        if (!supported || bridge?.installSysdeps === undefined) return;
        const ids = [...selected.value];
        if (ids.length === 0) return;

        runState.value = "running";
        log.value = [];
        lastResult.value = null;
        raiseNotice(
            "info",
            ids.length === 1
                ? `Installing 1 dependency…`
                : `Installing ${String(ids.length)} dependencies…`,
        );

        try {
            const result = await bridge.installSysdeps(ids);
            lastResult.value = result;
            for (const outcome of result.outcomes) applyOutcome(outcome);

            const installed = result.outcomes.filter(
                (outcome) => outcome.kind === "installed" || outcome.kind === "already-installed",
            ).length;
            const failed = result.outcomes.filter(
                (outcome) =>
                    outcome.kind === "failed" ||
                    outcome.kind === "not-found" ||
                    outcome.kind === "network-failure" ||
                    outcome.kind === "verification-failed" ||
                    outcome.kind === "declined-elevation",
            ).length;
            const cancelled = result.outcomes.filter((outcome) => outcome.kind === "cancelled").length;

            if (result.cancelled) {
                raiseNotice(
                    "warning",
                    `Cancelled. ${String(installed)} finished installing before the cancellation, ${String(cancelled)} did not start or were cut off.`,
                );
            } else if (failed > 0) {
                raiseNotice(
                    "error",
                    `${String(installed)} installed, ${String(failed)} failed. Check each row's own error and exit code.`,
                );
            } else {
                raiseNotice("success", `${String(installed)} of ${String(ids.length)} dependencies are ready.`);
            }
        } finally {
            runState.value = "idle";
        }
    }

    async function cancel(): Promise<void> {
        if (!supported || bridge?.cancelSysdepInstall === undefined) return;
        runState.value = "cancelling";
        await bridge.cancelSysdepInstall();
    }

    return {
        supported,
        previewState,
        previewFailure,
        rows,
        installableRows,
        selected,
        runState,
        log,
        lastResult,
        loadPreview,
        toggle,
        selectAll,
        selectNone,
        selectInverse,
        run,
        cancel,
    };
}
