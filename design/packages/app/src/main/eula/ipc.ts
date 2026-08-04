/**
 * The one channel that carries Mojang's EULA to the window.
 *
 * Built the way `main/update/ipc.ts` is built, for the same reasons: Electron arrives as a
 * *type* so this module is importable from a test without an Electron runtime, every
 * channel is named once so `dispose` cannot drift from the registration, and **the handler
 * never rejects**. A rejected `invoke` becomes an unhandled promise inside a component and
 * the user sees nothing at all - which, for a surface whose entire job is to show a legal
 * document, would be the worst possible failure: a blank panel with no explanation.
 *
 * So every failure crosses as a value: `ok: false`, a sentence the interface shows, and
 * the cached copy when one exists. The renderer decides what to display and how to label
 * it; this side's only obligation is never to describe a cached or missing document as a
 * live one.
 *
 * The document address is not a literal here. It is `MOJANG_EULA_URL` from `consent.ts` -
 * the same constant the consent record stores and refuses a mismatch against - so the
 * document somebody reads and the document their acceptance names cannot drift apart.
 */

import { app } from "electron";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { MOJANG_EULA_URL } from "../consent.js";
import { loadEulaDocument, type EulaLoadResult, type FetchLike } from "./document.js";

/** Every channel this module registers. */
export const EULA_CHANNELS = ["eula:document"] as const;

export interface EulaIpcOptions {
    /** Injected so a test drives the whole path without a network. Defaults to global fetch. */
    readonly fetch?: FetchLike;
    /** Defaults to `app.getPath("userData")`, resolved lazily so tests need no Electron. */
    readonly dataDirectory?: () => string;
}

export interface EulaIpc {
    dispose(): void;
}

export interface EulaRequest {
    /** True when the user pressed the viewer's refresh control. */
    readonly refresh?: boolean;
}

/**
 * Registers the handler and returns a `dispose`.
 *
 * A malformed argument from the renderer is coerced rather than trusted: `refresh` is
 * read as a boolean and everything else about the payload is ignored, because the only
 * thing this channel can be asked to vary is whether it goes to the network.
 */
export function registerEulaHandlers(ipcMain: IpcMain, options: EulaIpcOptions = {}): EulaIpc {
    const resolveDirectory = options.dataDirectory ?? ((): string => app.getPath("userData"));

    ipcMain.handle(
        "eula:document",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<EulaLoadResult> => {
            const refresh =
                typeof request === "object" && request !== null && "refresh" in request
                    ? (request as EulaRequest).refresh === true
                    : false;

            try {
                return await loadEulaDocument({
                    fetch: options.fetch ?? ((url, init) => fetch(url, init)),
                    dataDirectory: resolveDirectory(),
                    documentUrl: MOJANG_EULA_URL,
                    refresh,
                });
            } catch (error) {
                // `loadEulaDocument` already turns every expected failure into a value, so
                // reaching here means something unforeseen - a data directory that cannot be
                // resolved, most likely. It still crosses as a value: a viewer that says why
                // it is empty is usable, and one that throws into the void is not.
                return {
                    ok: false,
                    reason: error instanceof Error ? error.message : String(error),
                    cached: null,
                };
            }
        },
    );

    return {
        dispose(): void {
            for (const channel of EULA_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
