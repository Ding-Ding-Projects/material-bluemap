/**
 * The channel, against a fake `ipcMain`.
 *
 * The module takes `IpcMain` as a parameter and imports Electron only as a type, so every
 * channel can be reached exactly as the renderer would reach it with no Electron runtime
 * anywhere near the test.
 *
 * Two assertions matter more than the rest, and both are negative. **The token never
 * crosses**: a renderer that could ask for the credential would make every other
 * precaution in this feature decorative. And **an acknowledgement is only ever `true`**: a
 * renderer sending the string `"yes"` must not have that read as consent to publish
 * somebody's world.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RepositoryReport } from "../backup/index.js";
import { RecordingGitHub, repositoryJson } from "./recordingGitHub.js";
import { ciSyncWorkspace, newCiSyncState, syncIdFor, writeCiSyncState } from "./state.js";
import type { BackupSurface } from "./sync.js";
import type { ProcessRunner } from "./gh.js";

/** A `gh` that is not installed, so no test here spawns a real process. */
function noGh(): ProcessRunner {
    return {
        run: () => Promise.resolve({ started: false, code: null, stdout: "", stderr: "spawn gh ENOENT" }),
        runToFile: () =>
            Promise.resolve({ started: false, code: null, bytes: 0, stderr: "spawn gh ENOENT" }),
    };
}
import { CIRENDER_CHANNELS, CIRENDER_EVENT_CHANNEL, installCiRenderIpc } from "./ipc.js";

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
const OWNER = "o";
const REPO = "r";

let workDir = "";
let world = "";

beforeEach(async () => {
    workDir = await mkdtemp(join(tmpdir(), "mbm-cirender-ipc-"));
    world = join(workDir, "world");
    await mkdir(join(world, "region"), { recursive: true });
    await writeFile(join(world, "level.dat"), "level");
    await writeFile(join(world, "region", "r.0.0.mca"), "region");
    await writeFile(
        join(world, "material-bluemap.project.json"),
        JSON.stringify({
            version: 1,
            id: "p",
            name: "Overworld",
            createdAt: "2026-08-01T00:00:00Z",
            updatedAt: "2026-08-01T00:00:00Z",
            maps: [
                {
                    id: "world",
                    name: "World",
                    dimension: "minecraft:overworld",
                    config: "",
                    storage: "file",
                    sorting: 0,
                    enabled: true,
                },
            ],
        }),
        "utf8",
    );
});

afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
});

function report(isPrivate: boolean): RepositoryReport {
    return {
        owner: OWNER,
        repo: REPO,
        fullName: `${OWNER}/${REPO}`,
        private: isPrivate,
        canWrite: true,
        htmlUrl: `https://github.test/${OWNER}/${REPO}`,
        warning: isPrivate
            ? { level: "note", message: "This repository is private." }
            : { level: "warning", message: "This repository is PUBLIC." },
    };
}

function backupSurface(isPrivate: boolean): BackupSurface & { requests: unknown[] } {
    const requests: unknown[] = [];
    return {
        requests,
        inspectRepository: () => Promise.resolve(report(isPrivate)),
        backup: (request) => {
            requests.push(request);
            return Promise.resolve({
                ok: false as const,
                backupId: "b",
                failure: {
                    code: "test",
                    message: "the test never lets an upload happen",
                    detail: null,
                    status: null,
                    needsSignIn: false,
                },
            });
        },
        cancel: () => false,
    };
}

function install(options: { token?: string | null; isPrivate?: boolean; github?: RecordingGitHub } = {}) {
    const ipcMain = fakeIpcMain();
    const broadcast: unknown[] = [];
    const github =
        options.github ??
        new RecordingGitHub()
            .on("POST", "/dispatches", { status: 204 })
            .on("GET", /\/actions\/workflows\/render-world\.yml$/, {
                status: 200,
                json: { id: 1, name: "Render world", state: "active", path: "x" },
            })
            .on("GET", /\/repos\/o\/r$/, {
                status: 200,
                json: repositoryJson({ owner: OWNER, repo: REPO, isPrivate: options.isPrivate ?? true }),
            });
    const backup = backupSurface(options.isPrivate ?? true);
    const ipc = installCiRenderIpc({
        ipcMain,
        storageDir: () => join(workDir, "maps"),
        token: () => (options.token === undefined ? TOKEN : options.token),
        runner: noGh(),
        eulaAccepted: () => true,
        backup,
        broadcast: (event) => broadcast.push(event),
        fetch: github.fetch,
        apiBase: "https://api.test",
        sleep: () => Promise.resolve(),
        runLookupAttempts: 1,
    });
    return { ipcMain, ipc, broadcast, github, backup };
}

describe("registration", () => {
    it("registers exactly the channels it names, and removes exactly those", () => {
        const { ipcMain, ipc } = install();
        expect([...ipcMain.handlers.keys()].sort()).toEqual([...CIRENDER_CHANNELS].sort());
        ipc.dispose();
        expect(ipcMain.handlers.size).toBe(0);
    });

    it("names the event channel once, so a listener and a sender cannot drift", () => {
        expect(CIRENDER_EVENT_CHANNEL).toBe("cirender:event");
    });

    it("has no channel that could accept Mojang's licence", () => {
        expect([...CIRENDER_CHANNELS].some((channel) => /eula|consent|accept/i.test(channel))).toBe(false);
    });
});

describe("what crosses", () => {
    it("never puts the token in any answer", async () => {
        const { ipcMain } = install();
        const answers: unknown[] = [
            await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
                worldFolder: world,
                owner: OWNER,
                repo: REPO,
            }),
            await (ipcMain.handlers.get("cirender:list") as Handler)(noEvent),
            await (ipcMain.handlers.get("cirender:active") as Handler)(noEvent),
            await (ipcMain.handlers.get("cirender:state") as Handler)(noEvent, "nope"),
        ];
        for (const answer of answers) {
            expect(JSON.stringify(answer)).not.toContain(TOKEN);
        }
    });

    it("reports the public-repository warning through preflight", async () => {
        const { ipcMain } = install({ isPrivate: false });
        const answer = (await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
        })) as { ok: true; value: { repository: { private: boolean; warning: { message: string } } } };

        expect(answer.ok).toBe(true);
        expect(answer.value.repository.private).toBe(false);
        expect(answer.value.repository.warning.message).toContain("PUBLIC");
    });

    it("reads an acknowledgement as consent only when it is exactly true", async () => {
        const { ipcMain, backup, github } = install({ isPrivate: false });
        const result = (await (ipcMain.handlers.get("cirender:start") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
            // A renderer sending a truthy string must not publish somebody's world.
            acknowledgePublic: "yes",
            acknowledgeUpload: 1,
        })) as { ok: false; failure: { code: string } };

        expect(result.ok).toBe(false);
        expect(result.failure.code).toBe("public-not-acknowledged");
        expect(backup.requests).toHaveLength(0);
        expect(github.never("/dispatches")).toBe(true);
    });
});

describe("being signed out is an answer, not a crash", () => {
    it("reports that neither credential can drive a render, without calling GitHub", async () => {
        // Preflight answers rather than refusing: its whole job is to say what would
        // happen, and "neither of your two GitHub sign-ins can do this, here is why for
        // each" is exactly that. With no in-app token there is nothing to probe with, and
        // `gh` is stubbed as absent, so not a single request goes out.
        const { ipcMain, github } = install({ token: null });
        const answer = (await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, {
            worldFolder: world,
            owner: OWNER,
            repo: REPO,
        })) as { ok: true; value: { routeReport: { ready: boolean; route: string | null; describe: string } } };

        expect(answer.ok).toBe(true);
        expect(answer.value.routeReport.ready).toBe(false);
        expect(answer.value.routeReport.route).toBeNull();
        expect(answer.value.routeReport.describe).toContain("Settings");
        expect(answer.value.routeReport.describe).toContain("gh");
        expect(github.calls).toHaveLength(0);
    });

    it("still answers cirender:active and cirender:cancel, which need nothing", async () => {
        const { ipcMain } = install({ token: null });
        expect(await (ipcMain.handlers.get("cirender:active") as Handler)(noEvent)).toEqual([]);
        expect(await (ipcMain.handlers.get("cirender:cancel") as Handler)(noEvent, "nope")).toBe(false);
    });
});

describe("a malformed request is refused, never guessed at", () => {
    it("refuses a start with no world folder", async () => {
        const { ipcMain } = install();
        const result = (await (ipcMain.handlers.get("cirender:start") as Handler)(noEvent, {
            owner: OWNER,
            repo: REPO,
        })) as { ok: false; failure: { code: string } };
        expect(result.ok).toBe(false);
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses a check with no id", async () => {
        const { ipcMain } = install();
        const result = (await (ipcMain.handlers.get("cirender:check") as Handler)(noEvent, "  ")) as {
            ok: false;
            failure: { code: string };
        };
        expect(result.ok).toBe(false);
        expect(result.failure.code).toBe("invalid-request");
    });

    it("refuses preflight for a request that is not an object at all", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:preflight") as Handler)(noEvent, 7)) as {
            ok: boolean;
        };
        expect(answer.ok).toBe(false);
    });
});

describe("listing what this computer remembers", () => {
    it("answers with every readable record and leaves out the ones it cannot read", async () => {
        const storage = join(workDir, "maps");
        const syncId = syncIdFor(OWNER, REPO, world, "world");
        await writeCiSyncState(
            ciSyncWorkspace(storage, syncId).stateFile,
            newCiSyncState({
                syncId,
                owner: OWNER,
                repo: REPO,
                worldFolder: world,
                mapId: "world",
                mapName: "World",
                dimension: "minecraft:overworld",
                at: "2026-08-04T10:00:00Z",
            }),
        );
        // A record from a format this build does not know is skipped rather than shown
        // as a half-filled row.
        const stranger = ciSyncWorkspace(storage, "from-the-future");
        await mkdir(stranger.root, { recursive: true });
        await writeFile(stranger.stateFile, JSON.stringify({ version: 99 }), "utf8");

        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:list") as Handler)(noEvent)) as {
            ok: true;
            value: { syncId: string }[];
        };

        expect(answer.ok).toBe(true);
        expect(answer.value.map((state) => state.syncId)).toEqual([syncId]);
    });

    it("answers an empty list on a computer that has never synced anything", async () => {
        const { ipcMain } = install();
        const answer = (await (ipcMain.handlers.get("cirender:list") as Handler)(noEvent)) as {
            ok: true;
            value: unknown[];
        };
        expect(answer.value).toEqual([]);
    });
});
