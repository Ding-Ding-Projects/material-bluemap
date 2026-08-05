import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Compression, FileMapStorage, type MapStorage } from "@material-bluemap/engine";
import { HttpServer } from "../src/http/HttpServer.js";
import { MapStorageHandler } from "../src/http/MapStorageHandler.js";

/*
 * Live-data lifecycle: a client connecting, several clients receiving the same payload, a
 * client disappearing without saying goodbye, and the server shutting down while clients
 * are attached — the four cases issue #41 calls out by name — plus the honest empty-stub
 * contract for live/players.json and live/markers.json, and the override path a real
 * supplier will eventually use.
 */

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
});

let root: string;
let storage: MapStorage;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-live-"));
    storage = new FileMapStorage(root, Compression.GZIP, false);
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function waitUntil(predicate: () => boolean, timeoutMs = 2000, stepMs = 10): Promise<void> {
    const start = Date.now();
    while (!predicate()) {
        if (Date.now() - start > timeoutMs) throw new Error("timed out waiting for condition");
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }
}

/**
 * Reads whole `event:`/`data:` blocks (split on a blank line) off an SSE response body.
 *
 * A default mount always has *some* live-data supplier wired (the honest stubs, if no real
 * one is given), and connecting starts both broadcasters polling immediately — so a fresh
 * connection's first two events on the wire are always the initial "player" and "marker"
 * samples, ahead of anything a test triggers itself. `nextOfType` skips past whatever it
 * is not looking for rather than assuming a position, exactly as a real `EventSource`
 * consumer (which subscribes by event name, not by arrival order) would.
 */
function sseReader(response: Response): { next: () => Promise<string>; nextOfType: (type: string) => Promise<string> } {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    async function next(): Promise<string> {
        for (;;) {
            const boundary = buffer.indexOf("\n\n");
            if (boundary >= 0) {
                const block = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                return block;
            }
            const { value, done } = await reader.read();
            if (done) throw new Error("SSE stream ended before an event arrived");
            buffer += decoder.decode(value, { stream: true });
        }
    }
    async function nextOfType(type: string): Promise<string> {
        for (;;) {
            const block = await next();
            if (block.startsWith(`event: ${type}\n`)) return block;
        }
    }
    return { next, nextOfType };
}

describe("MapStorageHandler live/sse: connecting and receiving", () => {
    it("connects with the right headers and receives a broadcast tile event", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const controller = new AbortController();
        const res = await fetch(`${base}/maps/world/live/sse`, { signal: controller.signal });
        cleanups.push(() => controller.abort());

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        expect(res.headers.get("cache-control")).toBe("no-cache");
        expect(res.headers.get("x-accel-buffering")).toBe("no");

        await waitUntil(() => handler.getSseConnectionCount("world") === 1);
        handler.notifyTileUpdate("world", 1, 2, 0);

        const block = await sseReader(res).nextOfType("tile");
        expect(block).toBe('event: tile\ndata: {"x":1,"y":2,"lod":0}');
    });

    it("fans one broadcast out to every connected client with identical payloads", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const controllerA = new AbortController();
        const controllerB = new AbortController();
        cleanups.push(() => controllerA.abort(), () => controllerB.abort());

        const resA = await fetch(`${base}/maps/world/live/sse`, { signal: controllerA.signal });
        const resB = await fetch(`${base}/maps/world/live/sse`, { signal: controllerB.signal });
        await waitUntil(() => handler.getSseConnectionCount("world") === 2);

        handler.notifyTileUpdate("world", 5, 6, 1);

        const [blockA, blockB] = await Promise.all([
            sseReader(resA).nextOfType("tile"),
            sseReader(resB).nextOfType("tile"),
        ]);
        const expected = 'event: tile\ndata: {"x":5,"y":6,"lod":1}';
        expect(blockA).toBe(expected);
        expect(blockB).toBe(expected);
    });

    it("404s live/sse when the mount has SSE disabled, while the JSON endpoints stay live", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage, useSSE: false });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        expect((await fetch(`${base}/maps/world/live/sse`)).status).toBe(404);
        const players = await fetch(`${base}/maps/world/live/players.json`);
        expect(players.status).toBe(200);
        expect(await players.json()).toEqual({ players: [] });
    });
});

describe("MapStorageHandler live/sse: disconnection", () => {
    it("notices a client that disappears without a goodbye, and cleans it up", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const controller = new AbortController();
        await fetch(`${base}/maps/world/live/sse`, { signal: controller.signal });
        await waitUntil(() => handler.getSseConnectionCount("world") === 1);

        // No SSE-level goodbye — just the connection vanishing, the way a closed browser
        // tab actually behaves.
        controller.abort();

        await waitUntil(() => handler.getSseConnectionCount("world") === 0);
    });

    it("closes every attached connection when the map is unmounted (the server shutting down on it)", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const controller = new AbortController();
        const res = await fetch(`${base}/maps/world/live/sse`, { signal: controller.signal });
        cleanups.push(() => controller.abort());
        await waitUntil(() => handler.getSseConnectionCount("world") === 1);

        handler.removeMount("world");

        // Drain whatever was already in flight (the default mount's initial "player"/
        // "marker" samples race the unmount) before asserting the stream actually ends.
        const reader = res.body!.getReader();
        let done = false;
        for (let reads = 0; reads < 50 && !done; reads++) {
            done = (await reader.read()).done;
        }
        expect(done).toBe(true);
    });
});

describe("MapStorageHandler live data: honest stubs and the override path", () => {
    it("live/players.json and live/markers.json default to upstream's own empty shape", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const players = await fetch(`${base}/maps/world/live/players.json`);
        expect(players.headers.get("cache-control")).toBe("no-cache");
        expect(players.headers.get("content-type")).toBe("application/json");
        expect(await players.json()).toEqual({ players: [] });

        expect(await (await fetch(`${base}/maps/world/live/markers.json`)).json()).toEqual({});
    });

    it("a supplied live-data source overrides the stub over plain GET", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({
            mapId: "world",
            storage,
            livePlayers: () => JSON.stringify({ players: [{ uuid: "abc", name: "Steve" }] }),
        });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const res = await fetch(`${base}/maps/world/live/players.json`);
        expect(await res.json()).toEqual({ players: [{ uuid: "abc", name: "Steve" }] });
    });

    it("broadcasts a supplier's change over SSE once a client is connected", async () => {
        let value = "before";
        const handler = new MapStorageHandler();
        handler.setMount({
            mapId: "world",
            storage,
            livePlayers: () => value,
            playersPollIntervalMs: 20,
        });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        const controller = new AbortController();
        cleanups.push(() => controller.abort());
        const res = await fetch(`${base}/maps/world/live/sse`, { signal: controller.signal });
        const reader = sseReader(res);

        // Connecting starts the poll (upstream: `registerSseCallback`'s
        // `addUpdateListener`), which samples immediately — so the first "player" event on
        // the wire is that initial sample, not yet the change made below. The default
        // "marker" stub is polling too (it is always wired — see the honest-stubs test
        // above) and interleaves its own event; `nextOfType` skips past it.
        const initial = await reader.nextOfType("player");
        expect(initial).toBe("event: player\ndata: before");

        value = "after";
        const changed = await reader.nextOfType("player");
        expect(changed).toBe("event: player\ndata: after");
    });
});
