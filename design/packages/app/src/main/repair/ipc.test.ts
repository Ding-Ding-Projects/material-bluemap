import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import type { RepairEvidence } from "./evidence.js";
import {
    MAX_REMEMBERED_FAILURES,
    REPAIR_CHANNELS,
    registerRepairHandlers,
    scopeFromEvidence,
    type DiagnoseAnswer,
    type RepairAnswer,
} from "./ipc.js";

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

function evidence(overrides: Partial<RepairEvidence> = {}): RepairEvidence {
    return {
        subject: "render",
        mode: "local",
        command: "java",
        args: ["-jar", "cli.jar"],
        exitCode: 1,
        signal: null,
        spawnError: null,
        cancelled: false,
        stderr: [],
        diagnostics: ["[WARNING] You must accept the required file download in order for BlueMap to work!"],
        setupProblems: [],
        consentMissing: true,
        mapsScheduled: null,
        config: [],
        hostConfigDir: resolve("/srv/render/config"),
        outputRoot: "/srv/render/web",
        worlds: [{ mapId: "overworld", path: resolve("/srv/saves/world") }],
        javaExecutable: "/opt/jdk/bin/java",
        javaVersion: "25.0.3",
        requiredJavaFeature: 25,
        docker: null,
        port: null,
        host: null,
        at: "2026-08-04T10:00:00.000Z",
        ...overrides,
    };
}

const absent = () =>
    Promise.resolve({
        available: false,
        command: "opencode",
        version: null,
        message: "There is no 'opencode' command on this account's PATH.",
    });

describe("the repair channels", () => {
    it("registers exactly the channels it names, and takes all of them off again", () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerRepairHandlers(ipcMain, { detectAgent: absent });
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...REPAIR_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("diagnoses a remembered failure by the id the main process was given", async () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerRepairHandlers(ipcMain, { detectAgent: absent });
        const id = ipc.remember(evidence());

        const answer = (await ipcMain.handlers.get("repair:diagnose")?.(noEvent, id)) as DiagnoseAnswer;
        expect(answer.ok).toBe(true);
        expect(answer.ok === true && answer.diagnoses[0]?.code).toBe("download-not-accepted");
    });

    it("answers rather than rejecting for an id it does not know", async () => {
        const ipcMain = fakeIpcMain();
        registerRepairHandlers(ipcMain, { detectAgent: absent });

        const diagnosed = (await ipcMain.handlers.get("repair:diagnose")?.(noEvent, "nope")) as DiagnoseAnswer;
        const repaired = (await ipcMain.handlers.get("repair:run")?.(noEvent, "nope")) as RepairAnswer;
        expect(diagnosed.ok).toBe(false);
        expect(repaired.ok).toBe(false);
        expect(repaired.ok === false && repaired.message).toContain("no longer on record");
    });

    it("answers rather than rejecting for an id that is not even text", async () => {
        const ipcMain = fakeIpcMain();
        registerRepairHandlers(ipcMain, { detectAgent: absent });
        const answer = (await ipcMain.handlers.get("repair:diagnose")?.(noEvent, { id: 7 })) as DiagnoseAnswer;
        expect(answer.ok).toBe(false);
    });

    it("takes the scope from the evidence, never from the renderer", async () => {
        const scope = scopeFromEvidence(evidence());
        expect(scope.configDir).toBe(resolve("/srv/render/config"));
        expect(scope.worldPaths).toEqual([resolve("/srv/saves/world")]);
    });

    it("never consults an agent when the setting says not to", async () => {
        let asked = 0;
        const ipcMain = fakeIpcMain();
        const ipc = registerRepairHandlers(ipcMain, {
            allowAgent: () => false,
            detectAgent: () => {
                asked += 1;
                return absent();
            },
        });
        const id = ipc.remember(evidence({ consentMissing: false, diagnostics: ["something new"] }));
        const answer = (await ipcMain.handlers.get("repair:run")?.(noEvent, id)) as RepairAnswer;

        expect(asked).toBe(0);
        expect(answer.ok === true && answer.result.agent.consulted).toBe(false);
        expect(answer.ok === true && answer.result.applied).toEqual([]);
    });

    it("reports the agent's availability without an agent installed", async () => {
        const ipcMain = fakeIpcMain();
        registerRepairHandlers(ipcMain, { detectAgent: absent });
        const answer = (await ipcMain.handlers.get("repair:agent")?.(noEvent)) as { available: boolean };
        expect(answer.available).toBe(false);
    });

    it("does not reject when looking for the agent blows up", async () => {
        const ipcMain = fakeIpcMain();
        registerRepairHandlers(ipcMain, {
            detectAgent: () => Promise.reject(new Error("PATH is on fire")),
        });
        const answer = (await ipcMain.handlers.get("repair:agent")?.(noEvent)) as { message: string };
        expect(answer.message).toContain("PATH is on fire");
    });

    it("lists the failures it is holding, and forgets one when asked", async () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerRepairHandlers(ipcMain, { detectAgent: absent });
        const first = ipc.remember(evidence());
        ipc.remember(evidence({ subject: "web-server" }));

        let listed = (await ipcMain.handlers.get("repair:failures")?.(noEvent)) as { id: string }[];
        expect(listed).toHaveLength(2);

        ipc.forget(first);
        listed = (await ipcMain.handlers.get("repair:failures")?.(noEvent)) as { id: string }[];
        expect(listed.map((entry) => entry.id)).not.toContain(first);
    });

    it("keeps a bounded number of failures, dropping the oldest", async () => {
        const ipcMain = fakeIpcMain();
        const ipc = registerRepairHandlers(ipcMain, { detectAgent: absent });
        const first = ipc.remember(evidence());
        for (let index = 0; index < MAX_REMEMBERED_FAILURES; index++) ipc.remember(evidence());

        const listed = (await ipcMain.handlers.get("repair:failures")?.(noEvent)) as { id: string }[];
        expect(listed).toHaveLength(MAX_REMEMBERED_FAILURES);
        expect(listed.map((entry) => entry.id)).not.toContain(first);
    });
});
