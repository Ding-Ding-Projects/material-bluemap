/**
 * The one-button installer's channel between the main process and the settings screen.
 *
 * Built to the same shape `java/ipc.ts` uses: Electron arrives as a *type*, `IpcMain` is
 * a parameter, and the import is erased at build time, so this module and the rest of
 * `main/sysdeps/` keep running and keep being tested with no Electron runtime at all.
 *
 * Three channels, three different rhythms:
 *
 * - **`sysdeps:preview`** ({@link previewSysdeps}, `preview.ts`) answers in about as
 *   long as it takes to launch a handful of processes - what winget and Chocolatey are
 *   on this machine, what route each chosen dependency would take, whether it needs
 *   administrator permission, and whether it is already installed. Nothing is
 *   downloaded or installed by asking this question.
 * - **`sysdeps:install`** ({@link installSysdeps}, `install.ts`) is the one button. It
 *   runs for as long as the whole batch takes - seconds for an already-installed
 *   dependency, much longer for a first Docker Desktop download - and never rejects:
 *   every branch `installSysdeps` can produce (installed, already installed, declined
 *   elevation, not found, a network failure, a verification failure, cancelled,
 *   unsupported, or a genuine failure with its real exit code) comes back as data.
 *   Progress is pushed on `sysdeps:installEvent` while it runs, the same push-not-poll
 *   shape `java:provision` uses for the same reason: a Docker Desktop install can take
 *   minutes, and a spinner for minutes is indistinguishable from a hang.
 * - **`sysdeps:cancel`** aborts whichever batch is in flight. Cancelling is itself
 *   truthful: the `AbortSignal` reaches the real child process (`winget.ts`/
 *   `chocolatey.ts` both check `result.aborted` before classifying anything else), so
 *   whatever dependency was mid-install comes back `"cancelled"`, not folded into a
 *   generic failure.
 *
 * Only one batch runs at a time, folded the same way `java:provision` folds concurrent
 * requests - a second `sysdeps:install` call while one is already running is answered
 * from the same in-flight promise rather than starting a second batch that would race
 * the first for the same package manager.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { installSysdeps } from "./install.js";
import type { RunProcess } from "./process.js";
import { previewSysdeps, type SysdepPreviewRow } from "./preview.js";
import type { SysdepBatchResult, SysdepInstallEvent } from "./types.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const SYSDEP_CHANNELS = ["sysdeps:preview", "sysdeps:install", "sysdeps:cancel"] as const;

/** The channel every `sysdeps:install` progress event arrives on. */
export const SYSDEP_INSTALL_EVENT_CHANNEL = "sysdeps:installEvent";

export interface SysdepIpcOptions {
    /** The real process runner in production; a fake in every test. */
    readonly run: RunProcess;
    /** Where `sysdeps:install` progress goes. Supplied by the caller; defaults to nowhere. */
    readonly broadcast?: (event: SysdepInstallEvent) => void;
}

export interface SysdepIpc {
    dispose(): void;
}

/**
 * Registers the package-manager installer's handlers.
 *
 * Returns a `dispose` so a test, or a restart, can take the handlers off again without
 * leaving a duplicate registration behind - `ipcMain.handle` throws on a channel that
 * already has one.
 */
export function registerSysdepHandlers(ipcMain: IpcMain, options: SysdepIpcOptions): SysdepIpc {
    const broadcast = options.broadcast ?? ((): void => undefined);

    let previewing: Promise<readonly SysdepPreviewRow[]> | null = null;
    let installing: Promise<SysdepBatchResult> | null = null;
    let controller: AbortController | null = null;

    ipcMain.handle(
        "sysdeps:preview",
        async (_event: IpcMainInvokeEvent): Promise<readonly SysdepPreviewRow[]> => {
            previewing ??= previewSysdeps(options.run).finally(() => {
                previewing = null;
            });
            return await previewing;
        },
    );

    ipcMain.handle(
        "sysdeps:install",
        async (_event: IpcMainInvokeEvent, rawIds: unknown): Promise<SysdepBatchResult> => {
            const ids = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : [];
            if (installing !== null) return await installing;

            controller = new AbortController();
            const signal = controller.signal;
            installing = installSysdeps({
                ids,
                runProcess: options.run,
                signal,
                onEvent: broadcast,
            }).finally(() => {
                installing = null;
                controller = null;
            });
            return await installing;
        },
    );

    ipcMain.handle("sysdeps:cancel", async (_event: IpcMainInvokeEvent): Promise<{ readonly cancelled: boolean }> => {
        if (controller === null) return { cancelled: false };
        controller.abort();
        return { cancelled: true };
    });

    return {
        dispose(): void {
            for (const channel of SYSDEP_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
