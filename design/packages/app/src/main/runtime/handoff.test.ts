/**
 * The note that survives the app dying, and the ways it must refuse to be read.
 *
 * The interesting cases here are all failures. A record is read at exactly the moment a
 * half-written file is most likely to be sitting on disk - the launch after a crash - and
 * a record read leniently would send `docker stop` after a container with no name, or a
 * remote container's name to the daemon on this computer.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EngineDescription } from "../render/orchestrator.js";
import {
    ContainerHandoffStore,
    handoffFile,
    isHandedOff,
    listContainerHandoffs,
    newContainerHandoff,
    readContainerHandoff,
    writeContainerHandoff,
    type ContainerHandoff,
    type RemoteHandoffTarget,
} from "./handoff.js";

let storageDir = "";

const ENGINE: EngineDescription = {
    id: "upstream-java",
    label: "BlueMap engine (Java) 5.22-27 in a container",
    version: "5.22-27",
    javaVersion: null,
};

const REMOTE: RemoteHandoffTarget = {
    id: "render-box",
    host: "render.example",
    port: 2222,
    user: "renderer",
    identityFile: null,
    docker: "docker",
    keepRemoteFiles: false,
    root: "/srv/material-bluemap/world-abc123",
    storageRoot: "/srv/material-bluemap/world-abc123/web/maps",
};

beforeEach(async () => {
    storageDir = await mkdtemp(join(tmpdir(), "mbm-handoff-"));
});

afterEach(async () => {
    await rm(storageDir, { recursive: true, force: true });
});

function record(overrides: Partial<ContainerHandoff> = {}): ContainerHandoff {
    return {
        ...newContainerHandoff({
            renderId: "world-abc123",
            containerName: "material-bluemap-world-abc123",
            mode: "docker",
            mapIds: ["overworld"],
            docker: "docker",
            storageRoot: join(storageDir, "world-abc123", "web", "maps"),
            webRoot: join(storageDir, "world-abc123", "web"),
            cwd: join(storageDir, "world-abc123"),
            engine: ENGINE,
            startedAt: "2026-08-04T10:00:00.000Z",
            ownerInstance: "instance-one",
        }),
        ...overrides,
    };
}

describe("writing and reading a record", () => {
    it("round-trips everything the reattach actually needs", async () => {
        const path = handoffFile(storageDir, "world-abc123");
        const original = record({ mode: "remote", remote: REMOTE });
        await writeContainerHandoff(path, original);
        expect(await readContainerHandoff(path)).toEqual(original);
    });

    it("reads a missing, truncated or unparseable file as absent rather than as a guess", async () => {
        const path = handoffFile(storageDir, "world-abc123");
        expect(await readContainerHandoff(path)).toBeNull();

        await mkdir(join(storageDir, "world-abc123"), { recursive: true });
        await writeFile(path, '{"handoffVersion": 1, "renderId": "wor', "utf8");
        expect(await readContainerHandoff(path)).toBeNull();
    });

    it("refuses a record with no container name, because the name is the whole point", async () => {
        const path = handoffFile(storageDir, "world-abc123");
        await writeContainerHandoff(path, record());
        const raw = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
        delete raw["containerName"];
        await writeFile(path, JSON.stringify(raw), "utf8");
        expect(await readContainerHandoff(path)).toBeNull();
    });

    it("refuses a remote record whose host will not parse, rather than reading it as local", async () => {
        // A remote record read as local would send `docker stop` to the daemon on THIS
        // computer with a name only the other machine has - which does nothing, or stops
        // something else that happens to share the name.
        const path = handoffFile(storageDir, "world-abc123");
        await mkdir(join(storageDir, "world-abc123"), { recursive: true });
        const broken = { ...record({ mode: "remote", remote: REMOTE }), remote: { host: "x" } };
        await writeFile(path, JSON.stringify(broken), "utf8");
        expect(await readContainerHandoff(path)).toBeNull();
    });

    it("refuses a record written by a future version of the app", async () => {
        const path = handoffFile(storageDir, "world-abc123");
        await mkdir(join(storageDir, "world-abc123"), { recursive: true });
        await writeFile(path, JSON.stringify({ ...record(), handoffVersion: 99 }), "utf8");
        expect(await readContainerHandoff(path)).toBeNull();
    });
});

describe("finding records", () => {
    it("lists what is on disk, newest first, and ignores directories with no record", async () => {
        await writeContainerHandoff(
            handoffFile(storageDir, "old"),
            record({ renderId: "old", startedAt: "2026-08-01T00:00:00.000Z" }),
        );
        await writeContainerHandoff(
            handoffFile(storageDir, "new"),
            record({ renderId: "new", startedAt: "2026-08-03T00:00:00.000Z" }),
        );
        await mkdir(join(storageDir, "no-record"), { recursive: true });

        expect((await listContainerHandoffs(storageDir)).map((entry) => entry.renderId)).toEqual([
            "new",
            "old",
        ]);
    });

    it("calls a record handed off when its owner is not this app instance", () => {
        expect(isHandedOff(record({ ownerInstance: "instance-two" }), "instance-one")).toBe(true);
        expect(isHandedOff(record({ ownerInstance: "instance-one" }), "instance-one")).toBe(false);
        // A record whose run already ended describes nothing to find, whoever owned it.
        expect(
            isHandedOff(record({ ownerInstance: "instance-two", status: "finished" }), "instance-one"),
        ).toBe(false);
    });
});

describe("the store", () => {
    it("writes a record with this instance as its owner and removes it when the run ends", async () => {
        const store = new ContainerHandoffStore({ storageDir, instanceId: "instance-one" });
        await store.start({
            renderId: "world-abc123",
            containerName: "material-bluemap-world-abc123",
            mode: "docker",
            mapIds: ["overworld"],
            docker: "docker",
            storageRoot: join(storageDir, "world-abc123", "web", "maps"),
            webRoot: join(storageDir, "world-abc123", "web"),
            cwd: join(storageDir, "world-abc123"),
            engine: ENGINE,
        });

        const written = await store.read("world-abc123");
        expect(written?.ownerInstance).toBe("instance-one");
        expect(written?.status).toBe("running");

        await store.finish("world-abc123");
        expect(await store.read("world-abc123")).toBeNull();
    });

    it("takes ownership when this app picks a record up, so a second reattach cannot", async () => {
        await writeContainerHandoff(
            handoffFile(storageDir, "world-abc123"),
            record({ ownerInstance: "a-dead-app" }),
        );
        const store = new ContainerHandoffStore({ storageDir, instanceId: "instance-two" });
        const stored = await store.read("world-abc123");
        expect(stored).not.toBeNull();
        if (stored === null) return;

        await store.adopt(stored);
        expect((await store.read("world-abc123"))?.ownerInstance).toBe("instance-two");
        expect(isHandedOff((await store.read("world-abc123")) as ContainerHandoff, "instance-two")).toBe(
            false,
        );
    });

    it("records a declined offer once, so it is not made again on every launch", async () => {
        await writeContainerHandoff(handoffFile(storageDir, "world-abc123"), record());
        const store = new ContainerHandoffStore({ storageDir, instanceId: "instance-two" });
        expect(await store.dismiss("world-abc123")).toBe(true);
        expect(await store.dismiss("world-abc123")).toBe(false);
        expect((await store.read("world-abc123"))?.dismissed).toBe(true);
    });

    it("never fails a render because the note about it could not be written", async () => {
        // A storage directory that is a file rather than a directory: every write below
        // fails, and not one of them may reject.
        const blocked = join(storageDir, "not-a-directory");
        await writeFile(blocked, "", "utf8");
        const store = new ContainerHandoffStore({ storageDir: blocked, instanceId: "instance-one" });
        await expect(
            store.start({
                renderId: "world-abc123",
                containerName: "c",
                mode: "docker",
                mapIds: [],
                docker: "docker",
                storageRoot: "x",
                webRoot: "y",
                cwd: "z",
                engine: ENGINE,
            }),
        ).resolves.toBeTruthy();
        await expect(store.finish("world-abc123")).resolves.toBeUndefined();
    });
});
