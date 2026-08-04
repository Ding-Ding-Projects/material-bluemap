/**
 * The world-source channel between the main process and the wizard.
 *
 * Built like `runtime/ipc.ts` and `java/ipc.ts`: Electron arrives as a *type*, `IpcMain`
 * is a parameter, and the import is erased at build time, so every channel below is
 * exercised in tests with no Electron runtime and no network anywhere near them. Every
 * channel is named once in {@link WORLD_SOURCE_CHANNELS}, so `dispose` cannot drift from
 * the registration.
 *
 * **No handler here rejects.** The question these channels answer is "can I get a world
 * from that release?", and every possible answer - including "that is not a repository" -
 * is a sentence the wizard has to show. A rejection would arrive at the renderer as a bare
 * `Error` with a stack in it, and the step would have to guess what to say.
 *
 * Progress is broadcast on the **download channel**, not on one of this module's own. A
 * world fetched from somebody else's repository is a download like any other, appears in
 * the same list, is cancelled by the same button and is reported by the same row. A second
 * event channel would mean a second list, and a download in one of them is a download the
 * other cannot see or stop.
 */

import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { DownloadResult } from "../download/downloader.js";
import * as failures from "../download/failure.js";
import { WorldSourceFetcher } from "./fetcher.js";
import type {
    WorldSourceFetcherOptions,
    WorldSourceReleaseSummary,
    WorldSourceRequest,
} from "./fetcher.js";
import { parseWorldSourceReference } from "./repository.js";
import type { WorldSourceReference } from "./repository.js";

/** Every channel this module registers, so `dispose` cannot drift from `register`. */
export const WORLD_SOURCE_CHANNELS = [
    "worldsource:parse",
    "worldsource:discover",
    "worldsource:fetch",
    "worldsource:cancel",
    "worldsource:active",
] as const;

export type DiscoverAnswer =
    | { readonly ok: true; readonly release: WorldSourceReleaseSummary }
    | { readonly ok: false; readonly message: string; readonly code: string };

export interface WorldSourceIpc {
    readonly fetcher: WorldSourceFetcher;
    dispose(): void;
}

export interface WorldSourceIpcOptions extends WorldSourceFetcherOptions {
    /** Injected so a test can register against a fetcher it fully controls. */
    readonly fetcher?: WorldSourceFetcher;
}

/**
 * A request object that came across IPC, checked field by field.
 *
 * Nothing that arrives here is trusted: the renderer is the least trusted process in the
 * application, and `owner` ends up in a GitHub API path. `null` means "not a request",
 * and the caller turns that into a sentence rather than sending it on to be encoded.
 */
function readRequest(value: unknown): WorldSourceRequest | null {
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const owner = record["owner"];
    const repo = record["repo"];
    if (typeof owner !== "string" || typeof repo !== "string") return null;
    const tag = record["tag"];
    const asset = record["asset"];
    const extract = record["extract"];
    return {
        owner,
        repo,
        ...(typeof tag === "string" && tag !== "" ? { tag } : {}),
        ...(typeof asset === "string" && asset !== "" ? { asset } : {}),
        ...(typeof extract === "boolean" ? { extract } : {}),
    };
}

/** Whatever was thrown, as one sentence. Never a stack, which is not for a user. */
function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function registerWorldSourceHandlers(
    ipcMain: IpcMain,
    options: WorldSourceIpcOptions,
): WorldSourceIpc {
    const fetcher = options.fetcher ?? new WorldSourceFetcher(options);

    /**
     * Turns whatever somebody pasted into an owner, a repo and maybe a tag.
     *
     * Touches no network at all, so the wizard can call it on every keystroke to decide
     * whether the button is enabled. A field that only lights up after a round trip to
     * GitHub is a field that feels broken on a slow connection.
     */
    ipcMain.handle(
        "worldsource:parse",
        (_event: IpcMainInvokeEvent, text: unknown): WorldSourceReference | null =>
            typeof text === "string" ? parseWorldSourceReference(text) : null,
    );

    ipcMain.handle(
        "worldsource:discover",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<DiscoverAnswer> => {
            const parsed = readRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    code: "invalid-request",
                    message: "A repository owner and name are required.",
                };
            }
            try {
                const found = await fetcher.discover(parsed.owner, parsed.repo, parsed.tag);
                return found.ok
                    ? { ok: true, release: found.release }
                    : { ok: false, code: found.failure.code, message: found.failure.message };
            } catch (error) {
                // The fetcher promises not to reject and its own tests hold it to that.
                // This is the belt: a rejection here would cross the bridge as a bare
                // `Error` with a stack in it, and the wizard would have to guess what to
                // put on screen.
                return {
                    ok: false,
                    code: "network-failed",
                    message: describe(error),
                };
            }
        },
    );

    ipcMain.handle(
        "worldsource:fetch",
        async (_event: IpcMainInvokeEvent, request: unknown): Promise<DownloadResult> => {
            const parsed = readRequest(request);
            if (parsed === null) {
                return {
                    ok: false,
                    downloadId: "",
                    failure: failures.invalidRequest(
                        "A repository owner and name are required to fetch a world.",
                    ),
                };
            }
            try {
                return await fetcher.fetch(parsed);
            } catch (error) {
                return {
                    ok: false,
                    downloadId: "",
                    failure: failures.networkFailed(
                        `${parsed.owner}/${parsed.repo}`,
                        describe(error),
                    ),
                };
            }
        },
    );

    ipcMain.handle("worldsource:cancel", (_event: IpcMainInvokeEvent, downloadId: unknown) =>
        typeof downloadId === "string" && fetcher.cancel(downloadId),
    );

    ipcMain.handle("worldsource:active", () => fetcher.activeDownloadIds());

    return {
        fetcher,
        dispose(): void {
            for (const channel of WORLD_SOURCE_CHANNELS) ipcMain.removeHandler(channel);
        },
    };
}
