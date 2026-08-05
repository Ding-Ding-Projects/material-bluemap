/**
 * The SSH world-source channels, registered against a fake `ipcMain` with no Electron
 * runtime, no SSH client and no network - the same shape `remote/ipc.test.ts` and
 * `worldsource/ipc.test.ts` already use.
 */

import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { cancelled, hostKeyUnknown } from "../remote/failure.js";
import type { ConnectResult, RemoteWorldSurvey } from "../remote/worldsource.js";
import type { RemoteWorldFetchResult } from "../remote/worldsource.js";
import { WORLD_SOURCE_SSH_CHANNELS, registerSshWorldSourceHandlers } from "./sshIpc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function fakeIpcMain(): IpcMain & { readonly handlers: Map<string, Handler> } {
    const handlers = new Map<string, Handler>();
    return {
        handlers,
        handle(channel: string, handler: Handler): void {
            if (handlers.has(channel)) throw new Error(`second handler for '${channel}'`);
            handlers.set(channel, handler);
        },
        removeHandler(channel: string): void {
            handlers.delete(channel);
        },
    } as unknown as IpcMain & { readonly handlers: Map<string, Handler> };
}

const noEvent = {} as IpcMainInvokeEvent;

const TARGET = { id: "box", host: "render.example", user: "renderer", port: 2222 };

function register(overrides: Partial<Parameters<typeof registerSshWorldSourceHandlers>[1]> = {}) {
    const ipcMain = fakeIpcMain();
    const ipc = registerSshWorldSourceHandlers(ipcMain, {
        knownHostsFile: "/app/known_hosts",
        onEvent: () => {
            /* not under test unless a case asserts it */
        },
        ...overrides,
    });
    return { ipcMain, ipc };
}

describe("the SSH world-source channels", () => {
    it("registers exactly the channels it names, and takes all of them off again", () => {
        const { ipcMain, ipc } = register();
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...WORLD_SOURCE_SSH_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("validates a target without touching a network", async () => {
        const { ipcMain } = register();
        const good = (await ipcMain.handlers.get("worldsource:ssh:validate")?.(noEvent, TARGET)) as {
            ok: boolean;
            summary: string;
        };
        expect(good.ok).toBe(true);
        expect(good.summary).toBe("renderer@render.example:2222");

        const bad = (await ipcMain.handlers.get("worldsource:ssh:validate")?.(noEvent, {
            ...TARGET,
            host: "-oProxyCommand=calc.exe",
        })) as { ok: boolean; message: string };
        expect(bad.ok).toBe(false);
    });

    it("turns garbage from the renderer into a sentence, never a rejection", async () => {
        const { ipcMain } = register();
        for (const value of [null, 42, "hello", []]) {
            const answer = (await ipcMain.handlers.get("worldsource:ssh:validate")?.(noEvent, value)) as {
                ok: boolean;
            };
            expect(answer.ok).toBe(false);
        }
    });

    it("reports detection, including the host kind it found", async () => {
        const detect = vi.fn<() => Promise<ConnectResult>>(() =>
            Promise.resolve({ ok: true, detection: { kind: "windows", detail: "Windows Server 2022" } }),
        );
        const { ipcMain } = register({ detect });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:detect")?.(noEvent, TARGET)) as {
            ok: boolean;
            kind: string;
        };
        expect(answer).toEqual({ ok: true, kind: "windows", detail: "Windows Server 2022" });
        expect(detect).toHaveBeenCalledTimes(1);
    });

    it("refuses to detect an invalid target without calling detect at all", async () => {
        const detect = vi.fn<() => Promise<ConnectResult>>();
        const { ipcMain } = register({ detect });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:detect")?.(noEvent, {
            ...TARGET,
            host: "",
        })) as { ok: boolean };
        expect(answer.ok).toBe(false);
        expect(detect).not.toHaveBeenCalled();
    });

    it("carries host-key fingerprints through a failed detection", async () => {
        const detect = vi.fn<() => Promise<ConnectResult>>(() =>
            Promise.resolve({
                ok: false,
                failure: hostKeyUnknown("renderer@render.example:2222", "ssh-ed25519 SHA256:abc"),
                hostKeys: [{ type: "ssh-ed25519", base64: "AAAA", fingerprint: "SHA256:abc", line: "..." }],
            }),
        );
        const { ipcMain } = register({ detect });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:detect")?.(noEvent, TARGET)) as {
            ok: boolean;
            hostKeys: readonly unknown[];
        };
        expect(answer.ok).toBe(false);
        expect(answer.hostKeys).toHaveLength(1);
    });

    it("trusts a host key only through the injected trust function, by fingerprint", async () => {
        const trust = vi.fn(() => Promise.resolve({ ok: true, message: "recorded" }));
        const { ipcMain } = register({ trust });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:trustHostKey")?.(
            noEvent,
            TARGET,
            "SHA256:abc",
        )) as { ok: boolean };
        expect(answer.ok).toBe(true);
        expect(trust).toHaveBeenCalledWith(expect.objectContaining({ host: "render.example" }), "SHA256:abc", expect.anything());
    });

    it("refuses to trust a key without a fingerprint string", async () => {
        const trust = vi.fn();
        const { ipcMain } = register({ trust });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:trustHostKey")?.(noEvent, TARGET, 42)) as {
            ok: boolean;
        };
        expect(answer.ok).toBe(false);
        expect(trust).not.toHaveBeenCalled();
    });

    it("checks a remote path against the grammar named by the given host kind", async () => {
        const { ipcMain } = register();
        const posix = (await ipcMain.handlers.get("worldsource:ssh:checkPath")?.(
            noEvent,
            "/srv/world",
            "posix",
        )) as { ok: boolean };
        expect(posix.ok).toBe(true);

        const windows = (await ipcMain.handlers.get("worldsource:ssh:checkPath")?.(
            noEvent,
            "/srv/world",
            "windows",
        )) as { ok: boolean };
        expect(windows.ok).toBe(false);
    });

    it("surveys a world and reports its entries", async () => {
        const survey = vi.fn<() => Promise<RemoteWorldSurvey>>(() =>
            Promise.resolve({
                ok: true,
                kind: "posix",
                entries: [{ path: "level.dat", size: 10, mtimeMs: 1000 }],
            }),
        );
        const { ipcMain } = register({ survey });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:survey")?.(
            noEvent,
            TARGET,
            "/srv/world",
            "posix",
        )) as { ok: boolean; entries: readonly unknown[] };
        expect(answer.ok).toBe(true);
        expect(answer.entries).toHaveLength(1);
    });

    it("refuses to survey without a remote path", async () => {
        const survey = vi.fn();
        const { ipcMain } = register({ survey });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:survey")?.(noEvent, TARGET, "", "posix")) as {
            ok: boolean;
        };
        expect(answer.ok).toBe(false);
        expect(survey).not.toHaveBeenCalled();
    });

    it("diffs two surveys and says whether anything changed", async () => {
        const { ipcMain } = register();
        const previous = [{ path: "a", size: 1, mtimeMs: 1 }];
        const current = [{ path: "a", size: 2, mtimeMs: 2 }];
        const answer = (await ipcMain.handlers.get("worldsource:ssh:diff")?.(noEvent, previous, current)) as {
            changed: readonly string[];
            anyChange: boolean;
        };
        expect(answer.changed).toEqual(["a"]);
        expect(answer.anyChange).toBe(true);
    });

    it("treats non-array diff input as an empty survey rather than throwing", async () => {
        const { ipcMain } = register();
        const answer = (await ipcMain.handlers.get("worldsource:ssh:diff")?.(noEvent, null, "not an array")) as {
            anyChange: boolean;
        };
        expect(answer.anyChange).toBe(false);
    });

    it("fetches through the tracked fetcher and returns its result", async () => {
        const { ipcMain } = register({
            fetch: async () => ({
                ok: true,
                kind: "posix",
                transfer: "rsync",
                message: "Sending with rsync.",
            }),
        });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:fetch")?.(noEvent, {
            target: TARGET,
            remotePath: "/srv/world",
            localPath: "C:/local/world",
        })) as { id: string; result: { ok: boolean } };
        expect(answer.result.ok).toBe(true);
        expect(answer.id).not.toBe("");
    });

    it("refuses a fetch request missing a required field, without starting anything", async () => {
        const fetch = vi.fn();
        const { ipcMain } = register({ fetch });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:fetch")?.(noEvent, {
            target: TARGET,
            remotePath: "/srv/world",
            // localPath missing
        })) as { result: { ok: boolean } };
        expect(answer.result.ok).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("refuses a fetch for an invalid target before ever touching the fetcher", async () => {
        const fetch = vi.fn();
        const { ipcMain } = register({ fetch });
        const answer = (await ipcMain.handlers.get("worldsource:ssh:fetch")?.(noEvent, {
            target: { ...TARGET, host: "" },
            remotePath: "/srv/world",
            localPath: "C:/local/world",
        })) as { result: { ok: boolean } };
        expect(answer.result.ok).toBe(false);
        expect(fetch).not.toHaveBeenCalled();
    });

    it("cancels by id and reports active ids honestly", async () => {
        const { ipcMain } = register({
            fetch: async (_target, _remotePath, _localPath, options): Promise<RemoteWorldFetchResult> => {
                await new Promise<void>((resolve) => {
                    options.signal?.addEventListener("abort", () => resolve());
                });
                return { ok: false, failure: cancelled(), hostKeys: [] };
            },
        });

        const fetchPromise = ipcMain.handlers.get("worldsource:ssh:fetch")?.(noEvent, {
            target: TARGET,
            remotePath: "/srv/world",
            localPath: "C:/local/world",
        });
        await Promise.resolve();
        const active = (await ipcMain.handlers.get("worldsource:ssh:active")?.(noEvent)) as readonly string[];
        expect(active).toHaveLength(1);

        const cancelResult = await ipcMain.handlers.get("worldsource:ssh:cancel")?.(noEvent, active[0]);
        expect(cancelResult).toBe(true);
        await fetchPromise;

        const cancelledUnknown = await ipcMain.handlers.get("worldsource:ssh:cancel")?.(noEvent, "not-real");
        expect(cancelledUnknown).toBe(false);
    });
});
