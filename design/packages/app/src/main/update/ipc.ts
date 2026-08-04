/**
 * The update channel between the main process and the banner.
 *
 * Built like `main/config/ipc.ts`, method for method: Electron arrives as a *type*,
 * `IpcMain` is a parameter, every channel is named once in {@link UPDATE_CHANNELS} so
 * `dispose` cannot drift from the registration, and **no handler rejects**. A refusal is a
 * value with a code and a sentence, because a rejected `invoke` in the renderer becomes an
 * unhandled promise somewhere in a component, and the user sees nothing at all.
 *
 * ## What crosses, and what deliberately does not
 *
 * The state object, field by field: the versions, the status, the failure, the feed
 * *address*. What never crosses is the credential - `UpdateState.feedUrl` comes from
 * `describeFeed`, which exists for exactly this reason, and there is no channel here that
 * could return a header. A test asserts it, because a token that leaks into a state object
 * is invisible until somebody pastes a screenshot into an issue.
 *
 * ## Why a push channel as well as a pull one
 *
 * A check takes as long as the network does, and a download takes as long as the release
 * is big. A renderer that could only ask "what is the state" would have to poll, and
 * polling an updater means either a stale banner or a timer nobody needs. The main process
 * pushes every change on {@link UPDATE_EVENT_CHANNEL}; `update:state` exists so a window
 * that has just opened knows where things stand without waiting for the next change.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { UpdateController, type UpdateControllerOptions, type UpdateRestartResult } from "./controller.js";
import type { UpdateState } from "./state.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const UPDATE_CHANNELS = ["update:state", "update:check", "update:restart"] as const;

/** Where a state change is pushed. One channel, carrying the whole state each time. */
export const UPDATE_EVENT_CHANNEL = "update:event";

export interface UpdateIpcOptions {
    readonly controller: UpdateController;
}

export interface UpdateIpc {
    dispose(): void;
}

/**
 * Registers the update handlers and returns a `dispose`.
 *
 * `dispose` takes the handlers off but does **not** stop the controller. The two have
 * different lifetimes on purpose: a window closing should not cancel a download that is
 * half way through, and the controller is owned by the process rather than by a window.
 */
export function registerUpdateHandlers(ipcMain: IpcMain, options: UpdateIpcOptions): UpdateIpc {
    const { controller } = options;

    ipcMain.handle("update:state", (_event: IpcMainInvokeEvent): UpdateState => controller.current());

    ipcMain.handle("update:check", (_event: IpcMainInvokeEvent): UpdateState => controller.check({ manual: true }));

    ipcMain.handle(
        "update:restart",
        (_event: IpcMainInvokeEvent): UpdateRestartResult => controller.restart(),
    );

    return {
        dispose(): void {
            for (const channel of UPDATE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}

/**
 * The whole subsystem in one call: a controller, its handlers, and the push channel.
 *
 * Mirrors `installRenderIpc`. The broadcast is wired to the controller's `onChange` here
 * rather than being left to the caller, because an updater whose state changes and whose
 * banner never hears about it is the "built and unreachable" failure this feature exists
 * to close in the first place.
 */
export interface InstalledUpdates {
    readonly controller: UpdateController;
    dispose(): void;
}

export function installUpdateIpc(
    ipcMain: IpcMain,
    options: Omit<UpdateControllerOptions, "onChange"> & {
        /** Sends a state to every window. Overridable so a test can watch what went out. */
        readonly broadcast: (state: UpdateState) => void;
    },
): InstalledUpdates {
    const { broadcast, ...controllerOptions } = options;
    const controller = new UpdateController({ ...controllerOptions, onChange: broadcast });
    const ipc = registerUpdateHandlers(ipcMain, { controller });
    controller.start();
    return {
        controller,
        dispose(): void {
            ipc.dispose();
            controller.dispose();
        },
    };
}
