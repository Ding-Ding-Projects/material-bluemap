import { describe, expect, it } from "vitest";
import type { BrowserWindow, IpcMain, IpcMainInvokeEvent, OpenDialogOptions, OpenDialogReturnValue } from "electron";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DIALOG_CHANNELS, registerDialogHandlers, type DialogIpc, type OpenDialogHost } from "./ipc.js";

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

/**
 * Just enough of `ipcMain` to register against.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel can be exercised exactly as the renderer would reach it with no Electron runtime
 * anywhere near the test - native picker included.
 */
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

interface Seen {
    readonly window: unknown;
    readonly options: OpenDialogOptions;
}

/** A fake `dialog` that records both overload shapes, so a test can tell which one was used. */
function fakeDialog(answer: OpenDialogReturnValue): OpenDialogHost & { readonly seen: Seen[] } {
    const seen: Seen[] = [];
    const host = {
        seen,
        showOpenDialog(a: unknown, b?: OpenDialogOptions): Promise<OpenDialogReturnValue> {
            if (b === undefined) seen.push({ window: null, options: a as OpenDialogOptions });
            else seen.push({ window: a, options: b });
            return Promise.resolve(answer);
        },
    };
    return host as unknown as OpenDialogHost & { readonly seen: Seen[] };
}

const cancelled: OpenDialogReturnValue = { canceled: true, filePaths: [] };
const SOME_WINDOW = { id: "fake-window" } as unknown as BrowserWindow;

interface Registered {
    readonly ipcMain: IpcMain & { readonly handlers: Map<string, Handler> };
    readonly dialog: OpenDialogHost & { readonly seen: Seen[] };
    call(channel: (typeof DIALOG_CHANNELS)[number], ...args: unknown[]): Promise<unknown>;
}

function register(options?: {
    readonly answer?: OpenDialogReturnValue;
    readonly resolveWindow?: (event: IpcMainInvokeEvent) => BrowserWindow | null;
}): Registered {
    const ipcMain = fakeIpcMain();
    const dialog = fakeDialog(options?.answer ?? cancelled);
    registerDialogHandlers(ipcMain, {
        dialog,
        resolveWindow: options?.resolveWindow ?? (() => null),
    });
    return {
        ipcMain,
        dialog,
        async call(channel, ...args): Promise<unknown> {
            const handler = ipcMain.handlers.get(channel);
            if (handler === undefined) throw new Error(`${channel} was not registered`);
            return await Promise.resolve(handler(noEvent, ...args));
        },
    };
}

/** The rejection a call produced, so its message can be read rather than merely counted. */
async function refusal(run: Promise<unknown>): Promise<Error> {
    const thrown = await run.then(
        () => new Error("the handler resolved instead of rejecting"),
        (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Error);
    return thrown as Error;
}

describe("registerDialogHandlers", () => {
    it("registers exactly the channels it names, and takes them off again", () => {
        const ipcMain = fakeIpcMain();
        const dialog = fakeDialog(cancelled);

        const dialogs: DialogIpc = registerDialogHandlers(ipcMain, { dialog, resolveWindow: () => null });
        expect([...ipcMain.handlers.keys()]).toEqual([...DIALOG_CHANNELS]);

        // `ipcMain.handle` throws on a channel that already has a handler, so a `dispose`
        // that missed one would turn a reopened window into a crash.
        dialogs.dispose();
        expect(ipcMain.handlers.size).toBe(0);
        expect(() => registerDialogHandlers(ipcMain, { dialog, resolveWindow: () => null })).not.toThrow();
    });
});

describe("the folder picker", () => {
    it("asks for a directory and answers with the one that was chosen", async () => {
        const chosen = join(tmpdir(), "chosen-world");
        const { call, dialog } = register({ answer: { canceled: false, filePaths: [chosen] } });

        const answer = await call("dialog:pickFolder", { title: "Choose the world folder" });

        expect(answer).toBe(chosen);
        expect(dialog.seen[0]?.options.title).toBe("Choose the world folder");
        expect(dialog.seen[0]?.options.properties).toEqual(["openDirectory", "createDirectory"]);
    });

    it("answers null when the picker was cancelled, and never throws for it", async () => {
        const { call } = register({ answer: cancelled });
        await expect(call("dialog:pickFolder", { title: "Choose" })).resolves.toBeNull();
    });

    it("opens modal to the resolved window", async () => {
        const { call, dialog } = register({ resolveWindow: () => SOME_WINDOW });

        await call("dialog:pickFolder", { title: "Choose" });

        expect(dialog.seen[0]?.window).toBe(SOME_WINDOW);
    });

    it("opens unowned when no window could be resolved", async () => {
        const { call, dialog } = register({ resolveWindow: () => null });

        await call("dialog:pickFolder", { title: "Choose" });

        expect(dialog.seen[0]?.window).toBeNull();
    });

    it("defaults to the current value, when it names a folder that really exists", async () => {
        const real = await mkdtemp(join(tmpdir(), "mb-dialogs-"));
        try {
            const { call, dialog } = register();
            await call("dialog:pickFolder", { title: "Choose", startIn: real });
            expect(dialog.seen[0]?.options.defaultPath).toBe(real);
        } finally {
            await rm(real, { recursive: true, force: true });
        }
    });

    it("ignores a starting folder that does not exist, rather than opening on a dead end", async () => {
        const { call, dialog } = register();

        await call("dialog:pickFolder", { title: "Choose", startIn: join(tmpdir(), "mb-dialogs-does-not-exist") });

        expect(dialog.seen[0]?.options.defaultPath).toBeUndefined();
    });

    it("ignores a starting folder that is not a full path", async () => {
        const { call, dialog } = register();

        await call("dialog:pickFolder", { title: "Choose", startIn: "somewhere/relative" });

        expect(dialog.seen[0]?.options.defaultPath).toBeUndefined();
    });

    it("refuses a picker with no title rather than opening an unnamed window", async () => {
        const thrown = await refusal(register().call("dialog:pickFolder", {}));
        expect(thrown.message).toBe("The picker's title has to be given as text.");
    });

    it("refuses options given as something other than an object", async () => {
        const thrown = await refusal(register().call("dialog:pickFolder", "nope"));
        expect(thrown.message).toBe("The folder picker has to be given as a set of options.");
    });
});

describe("the file picker", () => {
    it("asks for a file and answers with the one that was chosen", async () => {
        const chosen = join(tmpdir(), "id_ed25519");
        const { call, dialog } = register({ answer: { canceled: false, filePaths: [chosen] } });

        const answer = await call("dialog:pickFile", { title: "Choose the private key file" });

        expect(answer).toBe(chosen);
        expect(dialog.seen[0]?.options.properties).toEqual(["openFile"]);
    });

    it("answers null when the picker was cancelled", async () => {
        const { call } = register({ answer: cancelled });
        await expect(call("dialog:pickFile", { title: "Choose" })).resolves.toBeNull();
    });

    it("turns extensions into a filter, with a way past it", async () => {
        const { call, dialog } = register();

        await call("dialog:pickFile", { title: "Choose a driver", extensions: [".jar", "zip", "  "] });

        expect(dialog.seen[0]?.options.filters).toEqual([
            { name: "JAR, ZIP files", extensions: ["jar", "zip"] },
            { name: "All files", extensions: ["*"] },
        ]);
    });

    it("sets no filter when no extension was asked for, e.g. an SSH identity file", async () => {
        const { call, dialog } = register();

        await call("dialog:pickFile", { title: "Choose an identity file" });

        expect(dialog.seen[0]?.options.filters).toBeUndefined();
    });

    it("refuses a picker with no title", async () => {
        const thrown = await refusal(register().call("dialog:pickFile", {}));
        expect(thrown.message).toBe("The picker's title has to be given as text.");
    });
});
