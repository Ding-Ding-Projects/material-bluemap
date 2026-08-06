import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { registerGhCliHandlers, GH_CLI_CHANNELS } from "./ipc.js";
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
    it("registers exactly its two channels, and takes them off again", () => {
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
                stdout:
                    '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat","tokenSource":"keyring","scopes":"repo, workflow","gitProtocol":"https"}]}}',
            },
        });
        const ipcMain = fakeIpcMain();
        registerGhCliHandlers(ipcMain, { runner });

        const status = await ipcMain.handlers.get("ghCli:listAccounts")!(noEvent);
        expect(status).toMatchObject({ availability: "ready", accounts: [{ login: "octocat", active: true }] });
    });

    it("answers ghCli:switchAccount, re-reading to confirm the switch took", async () => {
        const runner = fakeRunner({
            "auth switch --hostname github.com --user octocat": { code: 0 },
            "--version": { stdout: "gh version 2.96.0\n" },
            "auth status --json hosts": {
                stdout:
                    '{"hosts":{"github.com":[{"state":"success","active":true,"host":"github.com","login":"octocat","tokenSource":"keyring","scopes":"repo","gitProtocol":"https"}]}}',
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

        const result = (await ipcMain.handlers.get("ghCli:switchAccount")!(noEvent, {})) as { ok: boolean };
        expect(result.ok).toBe(false);
    });
});
