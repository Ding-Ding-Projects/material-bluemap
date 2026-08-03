import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    RENDER_SESSION_VERSION,
    RenderSessionStore,
    listRenderSessions,
    newRenderSession,
    readRenderSession,
    renderConfigFingerprint,
    sessionFile,
    writeRenderSession,
} from "./session.js";
import type { RenderSession } from "./session.js";

let root = "";
let storageDir = "";

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-session-"));
    storageDir = join(root, "maps");
    await mkdir(storageDir, { recursive: true });
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

function session(overrides: Partial<RenderSession> = {}): RenderSession {
    return {
        ...newRenderSession({
            renderId: "world-abc123",
            maps: [{ id: "overworld", world: join(root, "world"), name: "Overworld" }],
            configDir: join(storageDir, "world-abc123", "config"),
            outputRoot: join(storageDir, "world-abc123", "web"),
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            startedAt: "2026-08-03T10:00:00.000Z",
            ownerInstance: "instance-a",
            ownerPid: 4242,
        }),
        ...overrides,
    };
}

/* -------------------------------------------------------------------------- */
/* The config fingerprint                                                     */
/* -------------------------------------------------------------------------- */

describe("renderConfigFingerprint", () => {
    it("is stable across calls with the same settings", () => {
        const maps = [{ id: "overworld", world: "/worlds/one", name: "Overworld" }];
        expect(renderConfigFingerprint(maps)).toBe(renderConfigFingerprint(maps));
    });

    it("does not change when the same maps are listed in a different order", () => {
        const a = renderConfigFingerprint([
            { id: "overworld", world: "/worlds/one", sorting: 0 },
            { id: "nether", world: "/worlds/one", dimension: "minecraft:the_nether", sorting: 1 },
        ]);
        const b = renderConfigFingerprint([
            { id: "nether", world: "/worlds/one", dimension: "minecraft:the_nether", sorting: 1 },
            { id: "overworld", world: "/worlds/one", sorting: 0 },
        ]);
        expect(a).toBe(b);
    });

    it("changes when the world folder changes", () => {
        expect(renderConfigFingerprint([{ id: "overworld", world: "/worlds/one" }])).not.toBe(
            renderConfigFingerprint([{ id: "overworld", world: "/worlds/two" }]),
        );
    });

    it("changes when the dimension changes", () => {
        expect(renderConfigFingerprint([{ id: "m", world: "/w" }])).not.toBe(
            renderConfigFingerprint([{ id: "m", world: "/w", dimension: "minecraft:the_end" }]),
        );
    });

    it("changes when the sort order changes, because that is written into the config", () => {
        const declared = renderConfigFingerprint([
            { id: "a", world: "/w" },
            { id: "b", world: "/w" },
        ]);
        const reversed = renderConfigFingerprint([
            { id: "b", world: "/w" },
            { id: "a", world: "/w" },
        ]);
        expect(declared).not.toBe(reversed);
    });

    it("ignores settings that cannot change what a tile contains", () => {
        // Neither thread count nor metrics reach this function at all, which is the
        // point: they are not part of the description of the map. The test states it so
        // that a later change adding them has to argue with something.
        const maps = [{ id: "overworld", world: "/worlds/one" }];
        const fingerprint = renderConfigFingerprint(maps);
        expect(renderConfigFingerprint([...maps])).toBe(fingerprint);
    });
});

/* -------------------------------------------------------------------------- */
/* Reading a record that was not finished being written                       */
/* -------------------------------------------------------------------------- */

describe("readRenderSession", () => {
    it("reads back what was written", async () => {
        const path = sessionFile(storageDir, "world-abc123");
        const original = session();
        await writeRenderSession(path, original);
        expect(await readRenderSession(path)).toEqual(original);
    });

    it("treats a missing file as no session", async () => {
        expect(await readRenderSession(join(storageDir, "nothing", "session.json"))).toBeNull();
    });

    it("treats a truncated record as absent rather than parsing it into nonsense", async () => {
        const path = sessionFile(storageDir, "world-abc123");
        const complete = `${JSON.stringify(session(), null, 4)}\n`;
        await mkdir(join(storageDir, "world-abc123"), { recursive: true });
        // Exactly what a power cut mid-write leaves behind: a prefix of valid JSON.
        await writeFile(path, complete.slice(0, Math.floor(complete.length / 2)), "utf8");

        expect(await readRenderSession(path)).toBeNull();
    });

    it("treats a record that parses but says nothing useful as absent", async () => {
        const path = sessionFile(storageDir, "world-abc123");
        await mkdir(join(storageDir, "world-abc123"), { recursive: true });
        // Valid JSON, right version, and no map list. Offering a resume of this would
        // offer to render nothing, so it is not a session.
        await writeFile(
            path,
            JSON.stringify({
                sessionVersion: RENDER_SESSION_VERSION,
                renderId: "world-abc123",
                configDir: "/c",
                outputRoot: "/o",
                configHash: "deadbeef",
                startedAt: "2026-08-03T10:00:00.000Z",
                ownerInstance: "instance-a",
                status: "running",
                engine: "upstream-java",
                maps: [],
            }),
            "utf8",
        );

        expect(await readRenderSession(path)).toBeNull();
    });

    it("treats a record from a future version as absent", async () => {
        const path = sessionFile(storageDir, "world-abc123");
        await writeRenderSession(path, { ...session(), sessionVersion: 99 });
        expect(await readRenderSession(path)).toBeNull();
    });

    it("never leaves the staging file where a reader would find it", async () => {
        const path = sessionFile(storageDir, "world-abc123");
        await writeRenderSession(path, session());
        await expect(readFile(`${path}.writing`, "utf8")).rejects.toThrow();
    });
});

/* -------------------------------------------------------------------------- */
/* The store                                                                  */
/* -------------------------------------------------------------------------- */

describe("RenderSessionStore", () => {
    it("writes a running session the moment a render starts", async () => {
        const store = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await store.start({
            renderId: "world-abc123",
            maps: [{ id: "overworld", world: join(root, "world") }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: "25.0.3",
            startedAt: "2026-08-03T10:00:00.000Z",
        });

        const stored = await readRenderSession(sessionFile(storageDir, "world-abc123"));
        expect(stored?.status).toBe("running");
        expect(stored?.ownerInstance).toBe("instance-a");
        expect(stored?.maps).toEqual([
            {
                id: "overworld",
                world: join(root, "world"),
                name: "overworld",
                dimension: "minecraft:overworld",
            },
        ]);
    });

    it("records progress and, at the end, the last of it", async () => {
        const store = new RenderSessionStore({
            storageDir,
            instanceId: "instance-a",
            progressIntervalMs: 0,
        });
        await store.start({
            renderId: "r",
            maps: [{ id: "overworld", world: join(root, "world") }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });

        await store.progress("r", {
            kind: "updating-map",
            mapId: "overworld",
            description: "updating map 'overworld'",
            percent: 62.4,
            etaSeconds: 114,
            etaText: "1.9 minutes",
        });
        await store.interrupt("r", "cancelled");

        const stored = await readRenderSession(sessionFile(storageDir, "r"));
        expect(stored?.status).toBe("interrupted");
        expect(stored?.reason).toBe("cancelled");
        expect(stored?.progress?.percent).toBeCloseTo(62.4);
        expect(stored?.progress?.description).toBe("updating map 'overworld'");
    });

    it("throttles progress writes but keeps the newest value in memory", async () => {
        const store = new RenderSessionStore({
            storageDir,
            instanceId: "instance-a",
            progressIntervalMs: 60_000,
            now: () => new Date("2026-08-03T10:00:00.000Z"),
        });
        await store.start({
            renderId: "r",
            maps: [{ id: "overworld", world: join(root, "world") }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });

        for (const percent of [10, 20, 30]) {
            await store.progress("r", {
                kind: "updating-map",
                mapId: "overworld",
                description: "updating map 'overworld'",
                percent,
                etaSeconds: null,
                etaText: null,
            });
        }

        // The first progress line is written straight away, because a render that has
        // started moving is worth knowing about immediately. The two inside the window
        // after it are not, and yet the store still knows the newest number.
        expect((await readRenderSession(sessionFile(storageDir, "r")))?.progress?.percent).toBe(10);
        expect((await store.read("r"))?.progress?.percent).toBe(30);

        // Ending always writes, so what is on disk after a stop is the newest number.
        await store.complete("r");
        expect((await readRenderSession(sessionFile(storageDir, "r")))?.progress?.percent).toBe(30);
    });

    it("marks a completed render completed", async () => {
        const store = new RenderSessionStore({ storageDir, instanceId: "instance-a" });
        await store.start({
            renderId: "r",
            maps: [{ id: "overworld", world: join(root, "world") }],
            configDir: "/c",
            outputRoot: "/o",
            engine: "upstream-java",
            engineVersion: "5.22-27",
            javaVersion: null,
            startedAt: "2026-08-03T10:00:00.000Z",
        });
        await store.complete("r");

        const stored = await readRenderSession(sessionFile(storageDir, "r"));
        expect(stored?.status).toBe("completed");
        expect(stored?.reason).toBeNull();
        expect(stored?.endedAt).not.toBeNull();
    });

    it("lists sessions newest first and ignores directories without one", async () => {
        await writeRenderSession(sessionFile(storageDir, "old"), {
            ...session({ renderId: "old", startedAt: "2026-08-01T10:00:00.000Z" }),
        });
        await writeRenderSession(sessionFile(storageDir, "new"), {
            ...session({ renderId: "new", startedAt: "2026-08-02T10:00:00.000Z" }),
        });
        await mkdir(join(storageDir, "no-session"), { recursive: true });

        expect((await listRenderSessions(storageDir)).map((entry) => entry.renderId)).toEqual([
            "new",
            "old",
        ]);
    });

    it("reports no sessions for a storage directory that does not exist yet", async () => {
        expect(await listRenderSessions(join(root, "never-created"))).toEqual([]);
    });
});
