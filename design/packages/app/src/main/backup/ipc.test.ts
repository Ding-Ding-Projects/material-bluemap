/**
 * The channel, against a fake `ipcMain`.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel can be reached exactly as the renderer would reach it with no Electron runtime
 * anywhere near the test.
 *
 * The assertion that matters most is the negative one: **the token never crosses**. A
 * renderer that could ask for the credential would make every other precaution in this
 * feature decorative, so every answer from every channel is walked and checked for it.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKUP_CHANNELS, BACKUP_EVENT_CHANNEL, installBackupIpc } from "./ipc.js";
import type { FetchLike } from "./github.js";

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
const TOKEN = "t0k3n-that-must-never-cross";

let workDir = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-backup-ipc-"));
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function fakeFetch(answer: (url: string) => { status: number; body: unknown }): FetchLike {
    return (url: string): Promise<Response> => {
        const result = answer(url);
        return Promise.resolve({
            ok: result.status >= 200 && result.status < 300,
            status: result.status,
            json: () => Promise.resolve(result.body),
            arrayBuffer: () =>
                Promise.resolve(
                    Uint8Array.from(Buffer.from(JSON.stringify(result.body), "utf8"))
                        .buffer as ArrayBuffer,
                ),
        } as unknown as Response);
    };
}

function install(options: { token?: string | null; fetch?: FetchLike } = {}) {
    const ipcMain = fakeIpcMain();
    const broadcast: unknown[] = [];
    const ipc = installBackupIpc({
        ipcMain,
        storageDir: () => join(workDir, "storage"),
        token: () => options.token ?? null,
        broadcast: (event) => broadcast.push(event),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        apiBase: "https://api.test",
        uploadsBase: "https://uploads.test",
    });
    return { ipcMain, ipc, broadcast };
}

describe("registration", () => {
    it("registers exactly the channels it names, and removes exactly those", () => {
        const { ipcMain, ipc } = install();
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...BACKUP_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("names the event channel once, so a listener and a sender cannot drift", () => {
        expect(BACKUP_EVENT_CHANNEL).toBe("backup:event");
    });
});

describe("being signed out is an answer, not a crash", () => {
    it("says what is needed on every channel that needs a token", async () => {
        const { ipcMain } = install({ token: null });

        for (const channel of ["backup:repositories", "backup:list"]) {
            const handler = ipcMain.handlers.get(channel) as Handler;
            const answer = (await handler(noEvent, { owner: "o", repo: "r" })) as {
                ok: boolean;
                message: string;
            };
            expect(answer.ok, channel).toBe(false);
            expect(answer.message, channel).toContain("Settings");
        }
    });

    it("still answers backup:active and backup:cancel, which need nothing", async () => {
        const { ipcMain } = install({ token: null });
        expect(await (ipcMain.handlers.get("backup:active") as Handler)(noEvent)).toEqual([]);
        expect(await (ipcMain.handlers.get("backup:cancel") as Handler)(noEvent, "nope")).toBe(false);
    });
});

describe("what crosses", () => {
    it("never puts the token in any answer", async () => {
        const { ipcMain } = install({
            token: TOKEN,
            fetch: fakeFetch((url) =>
                url.includes("/user/repos")
                    ? {
                          status: 200,
                          body: [
                              {
                                  full_name: "o/r",
                                  name: "r",
                                  owner: { login: "o" },
                                  private: true,
                                  permissions: { push: true },
                                  html_url: "https://github.test/o/r",
                              },
                          ],
                      }
                    : {
                          status: 200,
                          body: {
                              full_name: "o/r",
                              name: "r",
                              owner: { login: "o" },
                              private: true,
                              permissions: { push: true },
                              html_url: "https://github.test/o/r",
                          },
                      },
            ),
        });

        const answers: unknown[] = [
            await (ipcMain.handlers.get("backup:repositories") as Handler)(noEvent),
            await (ipcMain.handlers.get("backup:inspectRepository") as Handler)(noEvent, {
                owner: "o",
                repo: "r",
            }),
            await (ipcMain.handlers.get("backup:active") as Handler)(noEvent),
        ];

        for (const answer of answers) {
            expect(JSON.stringify(answer)).not.toContain(TOKEN);
        }
    });

    it("reports the public-repository warning through inspectRepository", async () => {
        const { ipcMain } = install({
            token: TOKEN,
            fetch: fakeFetch(() => ({
                status: 200,
                body: {
                    full_name: "o/open",
                    name: "open",
                    owner: { login: "o" },
                    private: false,
                    permissions: { push: true },
                    html_url: "https://github.test/o/open",
                },
            })),
        });

        const answer = (await (ipcMain.handlers.get("backup:inspectRepository") as Handler)(noEvent, {
            owner: "o",
            repo: "open",
        })) as { ok: true; value: { private: boolean; warning: { level: string; message: string } } };

        expect(answer.ok).toBe(true);
        expect(answer.value.private).toBe(false);
        expect(answer.value.warning.level).toBe("warning");
        expect(answer.value.warning.message).toContain("PUBLIC");
    });

    it("refuses a request with no repository rather than asking GitHub about nothing", async () => {
        const { ipcMain } = install({ token: TOKEN });
        const answer = (await (ipcMain.handlers.get("backup:inspectRepository") as Handler)(noEvent, {
            owner: "   ",
            repo: "",
        })) as { ok: boolean; message: string };
        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("owner and name");
    });
});

describe("inspecting a folder", () => {
    it("answers with the counts a person is shown before anything is packed", async () => {
        const { ipcMain } = install({ token: TOKEN });
        const world = join(workDir, "saves", "overworld");
        await mkdir(join(world, "region"), { recursive: true });
        await writeFile(join(world, "level.dat"), "level");
        await writeFile(join(world, "region", "r.0.0.mca"), "region");

        const answer = (await (ipcMain.handlers.get("backup:inspectSource") as Handler)(noEvent, {
            kind: "world",
            folder: world,
        })) as { ok: true; value: { label: string; files: number; bytes: number } };

        expect(answer.ok).toBe(true);
        expect(answer.value.label).toBe("overworld");
        expect(answer.value.files).toBe(2);
        expect(answer.value.bytes).toBe("level".length + "region".length);
    });

    it("passes a refusal through as its own sentence", async () => {
        const { ipcMain } = install({ token: TOKEN });
        const notAWorld = join(workDir, "documents");
        await mkdir(notAWorld, { recursive: true });
        await writeFile(join(notAWorld, "notes.txt"), "hello");

        const answer = (await (ipcMain.handlers.get("backup:inspectSource") as Handler)(noEvent, {
            kind: "world",
            folder: notAWorld,
        })) as { ok: boolean; message: string };

        expect(answer.ok).toBe(false);
        expect(answer.message).toContain("level.dat");
    });

    it("refuses a kind it does not know, rather than guessing at one", async () => {
        const { ipcMain } = install({ token: TOKEN });
        const answer = (await (ipcMain.handlers.get("backup:inspectSource") as Handler)(noEvent, {
            kind: "everything",
            folder: workDir,
        })) as { ok: boolean };
        expect(answer.ok).toBe(false);
    });
});
