/**
 * The remote channels, registered against a fake `ipcMain` with no Electron runtime.
 *
 * What is under test at this boundary is the contract rather than the behaviour: that
 * nothing rejects, that garbage from the renderer becomes a sentence, that `dispose` takes
 * off exactly what `register` put on, and that the trust channel cannot be used to write a
 * key the person was never shown.
 */

import { describe, expect, it, vi } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { REMOTE_CHANNELS, disclosureFor, registerRemoteHandlers } from "./ipc.js";
import type { preflight, PreflightReport } from "./preflight.js";
import type { trustHostKey } from "./hostkey.js";
import { testTarget } from "./fakes.js";

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

const HEALTHY: PreflightReport = {
    ok: true,
    target: "renderer@render.example:2222",
    checks: [],
    failure: null,
    hostKeys: [],
    docker: null,
    freeBytes: 1_000_000_000_000,
    workDir: "/srv/material-bluemap",
};

function register(
    overrides: Partial<Parameters<typeof registerRemoteHandlers>[1]> = {},
): ReturnType<typeof fakeIpcMain> {
    const ipcMain = fakeIpcMain();
    registerRemoteHandlers(ipcMain, {
        knownHostsFile: "/app/known_hosts",
        preflight: vi.fn<typeof preflight>(() => Promise.resolve(HEALTHY)),
        trust: vi.fn<typeof trustHostKey>(() => Promise.resolve({ ok: true, message: "recorded" })),
        ...overrides,
    });
    return ipcMain;
}

const TARGET = { id: "box", host: "render.example", user: "renderer", port: 2222 };

describe("the remote channels", () => {
    it("registers exactly the channels it names, and takes all of them off again", () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerRemoteHandlers(ipcMain, { knownHostsFile: "/app/known_hosts" });
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...REMOTE_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("validates a target without touching a network", async () => {
        const ipcMain = register();
        const good = (await ipcMain.handlers.get("remote:validate")?.(noEvent, TARGET)) as {
            ok: boolean;
            summary: string;
        };
        expect(good.ok).toBe(true);
        expect(good.summary).toBe("renderer@render.example:2222");

        const bad = (await ipcMain.handlers.get("remote:validate")?.(noEvent, {
            ...TARGET,
            host: "-oProxyCommand=calc.exe",
        })) as { ok: boolean; message: string };
        expect(bad.ok).toBe(false);
        expect(bad.message).toContain("read by ssh as an option");
    });

    it("turns anything that is not a target into a sentence, not a rejection", async () => {
        const ipcMain = register();
        for (const value of [null, 42, "hello", []]) {
            const answer = (await ipcMain.handlers.get("remote:validate")?.(noEvent, value)) as {
                ok: boolean;
            };
            expect(answer.ok).toBe(false);
        }
    });

    it("says plainly what a render will send and what it will leave behind", async () => {
        const ipcMain = register();
        const answer = (await ipcMain.handlers.get("remote:describe")?.(
            noEvent,
            TARGET,
        )) as ReturnType<typeof disclosureFor>;

        expect(answer.sends.join(" ")).toContain("world folders");
        expect(answer.neverSends.join(" ")).toContain("password");
        expect(answer.neverSends.join(" ")).toContain("private key");
        expect(answer.leavesBehind).toContain("Nothing.");
        expect(answer.authentication).toBe("Your SSH agent.");
    });

    it("says the world stays there when the target is set to keep it", () => {
        const disclosure = disclosureFor(testTarget({ keepRemoteFiles: true }));
        expect(disclosure.leavesBehind).toContain("including a copy of the world");
    });

    it("names the key file as a path and never as a secret", () => {
        const disclosure = disclosureFor(testTarget({ identityFile: "/home/me/.ssh/id_ed25519" }));
        expect(disclosure.authentication).toContain("/home/me/.ssh/id_ed25519");
        expect(disclosure.authentication).toContain("never by this app");
    });

    it("answers a preflight for a target that is not one, in the shape a report has", async () => {
        const ipcMain = register();
        const answer = (await ipcMain.handlers.get("remote:preflight")?.(noEvent, {
            host: "",
        })) as PreflightReport;
        // Refusals and real reports arrive in one shape, so the settings row has one path.
        expect(answer.ok).toBe(false);
        expect(answer.failure?.remoteCode).toBe("invalid-target");
        expect(answer.checks).toHaveLength(1);
    });

    it("does not reject when the preflight itself blows up", async () => {
        const ipcMain = register({
            preflight: vi.fn<typeof preflight>(() => Promise.reject(new Error("the probe fell over"))),
        });
        const answer = (await ipcMain.handlers.get("remote:preflight")?.(
            noEvent,
            TARGET,
        )) as PreflightReport;
        expect(answer.ok).toBe(false);
        expect(answer.failure?.detail).toContain("the probe fell over");
    });

    it("passes a required size through only when it is a real number", async () => {
        const probe = vi.fn<typeof preflight>(() => Promise.resolve(HEALTHY));
        const ipcMain = register({ preflight: probe });
        await ipcMain.handlers.get("remote:preflight")?.(noEvent, TARGET, 8_000_000_000);
        expect(probe.mock.calls[0]?.[1]).toMatchObject({ requiredBytes: 8_000_000_000 });

        await ipcMain.handlers.get("remote:preflight")?.(noEvent, TARGET, "lots");
        expect(probe.mock.calls[1]?.[1]).not.toHaveProperty("requiredBytes");
    });

    it("only ever forwards a fingerprint to the trust step, never a key", async () => {
        const trust = vi.fn<typeof trustHostKey>(() =>
            Promise.resolve({ ok: true, message: "recorded" }),
        );
        const ipcMain = register({ trust });
        await ipcMain.handlers.get("remote:trustHostKey")?.(
            noEvent,
            TARGET,
            "SHA256:0000000000000000000000000000000000000000000",
        );
        expect(trust.mock.calls[0]?.[1]).toBe("SHA256:0000000000000000000000000000000000000000000");

        const refused = (await ipcMain.handlers.get("remote:trustHostKey")?.(
            noEvent,
            TARGET,
            { type: "ssh-ed25519", base64: "AAAA" },
        )) as { ok: boolean; message: string };
        expect(refused.ok).toBe(false);
        expect(trust).toHaveBeenCalledTimes(1);
    });

    it("refuses a render when this build has no orchestrator, rather than throwing", async () => {
        const ipcMain = register();
        const answer = (await ipcMain.handlers.get("remote:render")?.(noEvent, {
            target: TARGET,
            maps: [{ id: "overworld", world: "C:\\world" }],
        })) as { ok: boolean; failure: { message: string } };
        expect(answer.ok).toBe(false);
        expect(answer.failure.message).toContain("not configured in this build");
    });

    it("cancels through the orchestrator and answers false when there is none", async () => {
        const ipcMain = register();
        expect(await ipcMain.handlers.get("remote:cancel")?.(noEvent, "x")).toBe(false);
        expect(await ipcMain.handlers.get("remote:active")?.(noEvent)).toEqual([]);
    });
});
