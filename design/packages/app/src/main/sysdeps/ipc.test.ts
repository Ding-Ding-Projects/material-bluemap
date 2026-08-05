import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { RunProcess, ProcessRunResult } from "./process.js";
import { registerSysdepHandlers, SYSDEP_CHANNELS, SYSDEP_INSTALL_EVENT_CHANNEL } from "./ipc.js";
import { findSysdepDescriptor } from "./registry.js";
import type { SysdepInstallEvent } from "./types.js";

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

/** `rsync` is the lightest real entry in the catalogue: one manager, no fallback. */
const RSYNC = findSysdepDescriptor("rsync");
if (RSYNC === null) throw new Error("the real catalogue no longer has an 'rsync' entry - update this fixture");

function ok(stdout: string, exitCode = 0): ProcessRunResult {
    return { exitCode, stdout, stderr: "", aborted: false, timedOut: false, launchError: null };
}

describe("registerSysdepHandlers", () => {
    it("registers exactly the channels it names, and takes them off again", () => {
        const ipcMain = fakeIpcMain();
        const run: RunProcess = () => Promise.resolve(ok(""));

        const handlers = registerSysdepHandlers(ipcMain, { run });
        expect([...ipcMain.handlers.keys()]).toEqual([...SYSDEP_CHANNELS]);

        handlers.dispose();
        expect(ipcMain.handlers.size).toBe(0);
        expect(() => registerSysdepHandlers(ipcMain, { run })).not.toThrow();
    });

    it("answers sysdeps:preview for the whole real catalogue without installing anything", async () => {
        const calls: string[] = [];
        const run: RunProcess = (options) => {
            calls.push(`${options.command} ${options.args.join(" ")}`);
            if (options.args[0] === "--version") return Promise.resolve(ok(options.command === "choco" ? "2.7.3" : "v1.29.280"));
            return Promise.resolve(ok(""));
        };
        const ipcMain = fakeIpcMain();
        registerSysdepHandlers(ipcMain, { run });

        const preview = (await ipcMain.handlers.get("sysdeps:preview")?.(noEvent)) as readonly { readonly id: string }[];

        expect(preview.map((row) => row.id)).toEqual(["git", "githubCli", "dockerDesktop", "rsync"]);
        expect(calls.some((call) => call.includes("install"))).toBe(false);
    });

    it("broadcasts install progress on the dedicated event channel", async () => {
        const run: RunProcess = (options) => {
            if (options.command === RSYNC.verify.command) return Promise.resolve(ok("rsync  version 3.2.7"));
            if (options.args[0] === "--version") {
                return Promise.resolve(ok(options.command === "choco" ? "2.7.3" : "", options.command === "choco" ? 0 : -1));
            }
            if (options.command === "choco" && options.args[0] === "list") return Promise.resolve(ok(""));
            if (options.command === "choco" && options.args[0] === "install") {
                options.onLine?.("Progress: Downloading rsync 6.4.8... 50%", "stdout");
                return Promise.resolve(ok("rsync has been installed", 0));
            }
            return Promise.resolve(ok(""));
        };

        const events: SysdepInstallEvent[] = [];
        const ipcMain = fakeIpcMain();
        registerSysdepHandlers(ipcMain, {
            run,
            broadcast: (event) => events.push(event),
        });

        const result = await ipcMain.handlers.get("sysdeps:install")?.(noEvent, ["rsync"]);

        expect(result).toEqual({
            outcomes: [
                { kind: "installed", dependency: "rsync", manager: "chocolatey", verified: true, verifiedOutput: "rsync  version 3.2.7" },
            ],
            cancelled: false,
        });
        expect(events.length).toBeGreaterThan(0);
        expect(events.some((event) => event.progress.kind === "determinate")).toBe(true);
    });

    it("folds a second concurrent install call into the first rather than starting a race", async () => {
        let installCalls = 0;
        const run: RunProcess = (options) => {
            if (options.command === RSYNC.verify.command) return Promise.resolve(ok("rsync  version 3.2.7"));
            if (options.args[0] === "--version") return Promise.resolve(ok(options.command === "choco" ? "2.7.3" : "", options.command === "choco" ? 0 : -1));
            if (options.command === "choco" && options.args[0] === "list") return Promise.resolve(ok(""));
            if (options.command === "choco" && options.args[0] === "install") {
                installCalls += 1;
                return Promise.resolve(ok("installed", 0));
            }
            return Promise.resolve(ok(""));
        };
        const ipcMain = fakeIpcMain();
        registerSysdepHandlers(ipcMain, { run });

        const handler = ipcMain.handlers.get("sysdeps:install");
        if (handler === undefined) throw new Error("sysdeps:install missing");
        const [first, second] = await Promise.all([handler(noEvent, ["rsync"]), handler(noEvent, ["rsync"])]);

        expect(first).toEqual(second);
        expect(installCalls).toBe(1);
    });

    it("cancels the in-flight batch, and reports nothing to cancel once it is idle", async () => {
        const run: RunProcess = (options) => {
            if (options.command === RSYNC.verify.command) return Promise.resolve(ok("rsync  version 3.2.7"));
            if (options.args[0] === "--version") return Promise.resolve(ok(options.command === "choco" ? "2.7.3" : "", options.command === "choco" ? 0 : -1));
            if (options.command === "choco" && options.args[0] === "list") return Promise.resolve(ok(""));
            if (options.command === "choco" && options.args[0] === "install") {
                return Promise.resolve({
                    exitCode: null,
                    stdout: "",
                    stderr: "",
                    aborted: options.signal?.aborted ?? false,
                    timedOut: false,
                    launchError: null,
                });
            }
            return Promise.resolve(ok(""));
        };
        const ipcMain = fakeIpcMain();
        registerSysdepHandlers(ipcMain, { run });

        const installPromise = ipcMain.handlers.get("sysdeps:install")?.(noEvent, ["rsync"]);
        const cancelResult = await ipcMain.handlers.get("sysdeps:cancel")?.(noEvent);
        const installResult = await installPromise;

        expect(cancelResult).toEqual({ cancelled: true });
        expect(installResult).toEqual({ outcomes: [{ kind: "cancelled", dependency: "rsync" }], cancelled: true });

        const idleCancel = await ipcMain.handlers.get("sysdeps:cancel")?.(noEvent);
        expect(idleCancel).toEqual({ cancelled: false });
    });

    it("exports the event-channel name so the preload and this module cannot drift apart", () => {
        expect(SYSDEP_INSTALL_EVENT_CHANNEL).toBe("sysdeps:installEvent");
    });
});
