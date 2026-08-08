import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { registerGhCliHandlers, GH_CLI_CHANNELS, GH_CLI_LOGIN_STATE_CHANNEL } from "./ipc.js";
import type { GhCliLoginState } from "./login.js";
import type { ProcessResult, ProcessRunner, ProcessToFileResult } from "../cirender/gh.js";

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

function fakeEvent(id = 7): IpcMainInvokeEvent & {
    readonly sent: { channel: string; payload: unknown }[];
    destroy(): void;
} {
    const sent: { channel: string; payload: unknown }[] = [];
    const destroyedListeners = new Set<() => void>();
    let destroyed = false;
    return {
        sent,
        destroy(): void {
            destroyed = true;
            for (const listener of destroyedListeners) listener();
            destroyedListeners.clear();
        },
        sender: {
            id,
            isDestroyed: () => destroyed,
            send: (channel: string, payload: unknown) => sent.push({ channel, payload }),
            once: (event: string, listener: () => void) => {
                if (event === "destroyed") destroyedListeners.add(listener);
            },
            removeListener: (event: string, listener: () => void) => {
                if (event === "destroyed") destroyedListeners.delete(listener);
            },
        },
    } as unknown as IpcMainInvokeEvent & {
        readonly sent: { channel: string; payload: unknown }[];
        destroy(): void;
    };
}

function loginState(overrides: Partial<GhCliLoginState> = {}): GhCliLoginState {
    return {
        stage: "waiting-for-approval",
        host: "github.com",
        expectedLogin: null,
        userCode: "ABCD-EFGH",
        verificationUri: "https://github.com/login/device",
        verificationUriComplete: null,
        expiresAt: 1_000_000,
        secondsRemaining: 900,
        attempt: 0,
        browserOpened: false,
        account: null,
        failureCode: null,
        message: "Waiting for approval on GitHub.",
        ...overrides,
    };
}

function fakeRunner(answers: Readonly<Record<string, Partial<ProcessResult>>>): ProcessRunner {
    return {
        run(_command, args): Promise<ProcessResult> {
            const found = answers[args.join(" ")];
            return Promise.resolve({ started: true, code: 0, stdout: "", stderr: "", ...found });
        },
        runToFile(): Promise<ProcessToFileResult> {
            return Promise.resolve({ started: true, code: 0, bytes: 0, stderr: "" });
        },
    };
}

describe("registerGhCliHandlers", () => {
    it("registers exactly its invoke channels, and takes them off again", () => {
        const ipcMain = fakeIpcMain();
        const handlers = registerGhCliHandlers(ipcMain, { runner: fakeRunner({}) });
        expect([...ipcMain.handlers.keys()]).toEqual([...GH_CLI_CHANNELS]);

        handlers.dispose();
        expect(ipcMain.handlers.size).toBe(0);
        expect(() => registerGhCliHandlers(ipcMain, { runner: fakeRunner({}) })).not.toThrow();
    });

    it("answers ghCli:listAccounts from the real accounts module", async () => {
        const runner = fakeRunner({
            "--version": { stdout: "gh version 2.96.0 (2026-07-02)\n" },
            "auth status --json hosts": {
                stdout: '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat","tokenSource":"keyring","scopes":"repo, workflow","gitProtocol":"https"}]}}',
            },
        });
        const ipcMain = fakeIpcMain();
        registerGhCliHandlers(ipcMain, { runner });

        const status = await ipcMain.handlers.get("ghCli:listAccounts")!(noEvent);
        expect(status).toMatchObject({
            availability: "ready",
            accounts: [{ login: "octocat", active: true }],
        });
    });

    it("answers ghCli:switchAccount, re-reading to confirm the switch took", async () => {
        const runner = fakeRunner({
            "auth switch --hostname github.com --user octocat": { code: 0 },
            "--version": { stdout: "gh version 2.96.0\n" },
            "auth status --json hosts": {
                stdout: '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat","tokenSource":"keyring","scopes":"repo","gitProtocol":"https"}]}}',
            },
        });
        const ipcMain = fakeIpcMain();
        registerGhCliHandlers(ipcMain, { runner });

        const result = await ipcMain.handlers.get("ghCli:switchAccount")!(noEvent, {
            host: "github.com",
            login: "octocat",
        });
        expect(result).toMatchObject({ ok: true });
    });

    it("refuses ghCli:switchAccount with no host or login without spawning gh", async () => {
        const runner = fakeRunner({});
        const ipcMain = fakeIpcMain();
        registerGhCliHandlers(ipcMain, { runner });

        const result = (await ipcMain.handlers.get("ghCli:switchAccount")!(noEvent, {})) as {
            ok: boolean;
        };
        expect(result.ok).toBe(false);
    });

    it("streams only the public login state and returns the verified result", async () => {
        const ipcMain = fakeIpcMain();
        const event = fakeEvent();
        registerGhCliHandlers(ipcMain, {
            runner: fakeRunner({}),
            login: async (options) => {
                const waiting = loginState({ expectedLogin: options.expectedLogin ?? null });
                options.onState?.(waiting);
                return {
                    ok: true,
                    state: loginState({
                        stage: "succeeded",
                        userCode: null,
                        expectedLogin: options.expectedLogin ?? null,
                    }),
                };
            },
        });

        const result = await ipcMain.handlers.get("ghCli:startLogin")!(event, {
            expectedLogin: "octocat",
        });
        expect(result).toMatchObject({ ok: true, state: { stage: "succeeded" } });
        expect(event.sent).toEqual([
            {
                channel: GH_CLI_LOGIN_STATE_CHANNEL,
                payload: expect.objectContaining({
                    stage: "waiting-for-approval",
                    userCode: "ABCD-EFGH",
                }),
            },
        ]);
        expect(JSON.stringify(event.sent)).not.toMatch(/gh[pousr]_|github_pat_/i);
    });

    it("cancels the process-wide login from the window that started it", async () => {
        const ipcMain = fakeIpcMain();
        const event = fakeEvent();
        registerGhCliHandlers(ipcMain, {
            runner: fakeRunner({}),
            login: async (options) => {
                await new Promise<void>((resolve) =>
                    options.signal?.addEventListener("abort", () => resolve(), { once: true }),
                );
                return {
                    ok: false,
                    state: loginState({
                        stage: "cancelled",
                        userCode: null,
                        failureCode: "cancelled",
                        message: "Sign-in was cancelled.",
                    }),
                };
            },
        });

        const pending = ipcMain.handlers.get("ghCli:startLogin")!(event, {});
        const cancelled = await ipcMain.handlers.get("ghCli:cancelLogin")!(event);
        expect(cancelled).toEqual({ cancelled: true, message: "Cancelling gh sign-in." });
        await expect(pending).resolves.toMatchObject({ ok: false, state: { stage: "cancelled" } });
    });

    it("cancels an orphaned login when its renderer window closes", async () => {
        const ipcMain = fakeIpcMain();
        const event = fakeEvent();
        registerGhCliHandlers(ipcMain, {
            runner: fakeRunner({}),
            login: async (options) => {
                await new Promise<void>((resolve) =>
                    options.signal?.addEventListener("abort", () => resolve(), { once: true }),
                );
                return {
                    ok: false,
                    state: loginState({ stage: "cancelled", failureCode: "cancelled" }),
                };
            },
        });

        const pending = ipcMain.handlers.get("ghCli:startLogin")!(event, {});
        event.destroy();
        await expect(pending).resolves.toMatchObject({ ok: false, state: { stage: "cancelled" } });
    });

    it("refuses a second concurrent login without starting it", async () => {
        const ipcMain = fakeIpcMain();
        const first = fakeEvent(1);
        const second = fakeEvent(2);
        let starts = 0;
        registerGhCliHandlers(ipcMain, {
            runner: fakeRunner({}),
            login: async (options) => {
                starts += 1;
                await new Promise<void>((resolve) =>
                    options.signal?.addEventListener("abort", () => resolve(), { once: true }),
                );
                return { ok: false, state: loginState({ stage: "cancelled" }) };
            },
        });

        const pending = ipcMain.handlers.get("ghCli:startLogin")!(first, {});
        const blocked = await ipcMain.handlers.get("ghCli:startLogin")!(second, {});
        expect(blocked).toMatchObject({
            ok: false,
            state: { failureCode: "login-already-running" },
        });
        expect(starts).toBe(1);
        await ipcMain.handlers.get("ghCli:cancelLogin")!(first);
        await pending;
    });
});
