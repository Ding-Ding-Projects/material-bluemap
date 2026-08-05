import { mkdtemp, rm } from "node:fs/promises";
import * as http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Compression, FileMapStorage } from "@material-bluemap/engine";
import { HttpServer } from "../src/http/HttpServer.js";
import { MapStorageHandler } from "../src/http/MapStorageHandler.js";

/**
 * `fetch()` (undici) negotiates compression on its own — it adds its own
 * `Accept-Encoding` when none is given, transparently decodes a gzip body either way, and
 * does not reliably strip the now-inaccurate `Content-Encoding` response header
 * afterwards. That is fine for the rest of this codebase (see `RemoteProxy.ts`'s note on
 * exactly this), but it makes `fetch` useless for asserting the actual wire-level
 * negotiation this handler performs. A raw `http.request` sends only the headers it is
 * given and never touches the body, so it is what the gzip-negotiation tests use.
 */
function rawRequest(
    url: string,
    headers: Record<string, string> = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on("data", (chunk: Buffer) => chunks.push(chunk));
            res.on("end", () => {
                resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) });
            });
            res.on("error", reject);
        });
        req.on("error", reject);
        req.end();
    });
}

/*
 * Route-by-route against upstream's contracts: `MapStorageRequestHandler.java`'s tile
 * pattern, its meta-data switch, and `writeToResponse`'s content-negotiation. Everything
 * here goes through a real `FileMapStorage` — the same storage `packages/app`'s renderer
 * writes to — so what is under test is the HTTP layer, not a stand-in for it.
 */

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
});

let root: string;
let storage: FileMapStorage;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-map-storage-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

async function startServer(mapId = "world"): Promise<string> {
    const handler = new MapStorageHandler();
    handler.setMount({ mapId, storage });
    const server = new HttpServer();
    server.addHandler(handler);
    const addr = await server.listen();
    cleanups.push(() => server.close());
    return `http://127.0.0.1:${String(addr.port)}`;
}

describe("MapStorageHandler: hires tiles", () => {
    beforeEach(() => {
        storage = new FileMapStorage(root, Compression.GZIP, false);
    });

    it("serves a stored tile raw (gzip passthrough) when the client accepts the stored compression", async () => {
        const raw = Buffer.from("hello prbm bytes");
        await storage.hiresTiles().write(1, 2, raw);
        const base = await startServer();

        const res = await rawRequest(`${base}/maps/world/tiles/0/x1/z2.prbm`, {
            "accept-encoding": "gzip",
        });

        expect(res.status).toBe(200);
        expect(res.headers["content-type"]).toBe("application/octet-stream");
        expect(res.headers["content-encoding"]).toBe("gzip");
        expect(res.headers["cache-control"]).toBe("public, max-age=86400");
        expect(gunzipSync(res.body).toString()).toBe(raw.toString());
    });

    it("decompresses and serves raw bytes, with no Content-Encoding, when the client sends no Accept-Encoding", async () => {
        const raw = Buffer.from("hello prbm bytes");
        await storage.hiresTiles().write(1, 2, raw);
        const base = await startServer();

        const res = await rawRequest(`${base}/maps/world/tiles/0/x1/z2.prbm`);

        expect(res.status).toBe(200);
        expect(res.headers["content-encoding"]).toBeUndefined();
        expect(res.body.toString()).toBe(raw.toString());
    });

    it("answers 204 for a tile that was never rendered, not 404", async () => {
        const base = await startServer();
        const res = await fetch(`${base}/maps/world/tiles/0/x5/z5.prbm`);
        expect(res.status).toBe(204);
    });

    it("answers identically for a request naming the .prbm.gz suffix — the suffix is not inspected", async () => {
        const raw = Buffer.from("same tile, different requested name");
        await storage.hiresTiles().write(3, 4, raw);
        const base = await startServer();

        const asPrbm = await fetch(`${base}/maps/world/tiles/0/x3/z4.prbm`, {
            headers: { "accept-encoding": "gzip" },
        });
        const asPrbmGz = await fetch(`${base}/maps/world/tiles/0/x3/z4.prbm.gz`, {
            headers: { "accept-encoding": "gzip" },
        });

        expect(asPrbm.status).toBe(200);
        expect(asPrbmGz.status).toBe(200);
        expect(asPrbmGz.headers.get("content-encoding")).toBe(asPrbm.headers.get("content-encoding"));
        expect(Buffer.from(await asPrbmGz.arrayBuffer())).toEqual(Buffer.from(await asPrbm.arrayBuffer()));
    });

    it("treats a non-numeric lod as not-a-tile-path and falls through to 404", async () => {
        const base = await startServer();
        const res = await fetch(`${base}/maps/world/tiles/abc/x1z2.prbm`);
        expect(res.status).toBe(404);
    });
});

describe("MapStorageHandler: lowres tiles never get gzipped", () => {
    beforeEach(() => {
        storage = new FileMapStorage(root, Compression.GZIP, false);
    });

    it("serves a lowres PNG raw even when the client accepts gzip", async () => {
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
        await storage.lowresTiles(1).write(0, 0, png);
        const base = await startServer();

        const res = await fetch(`${base}/maps/world/tiles/1/x0/z0.png`, {
            headers: { "accept-encoding": "gzip" },
        });

        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        expect(res.headers.has("content-encoding")).toBe(false);
        expect(Buffer.from(await res.arrayBuffer())).toEqual(png);
    });
});

describe("MapStorageHandler: meta-data endpoints", () => {
    beforeEach(() => {
        storage = new FileMapStorage(root, Compression.GZIP, false);
    });

    it("serves settings.json with the right content-type", async () => {
        const settings = JSON.stringify({ name: "world" });
        await storage.settings().write(Buffer.from(settings));
        const base = await startServer();

        const res = await fetch(`${base}/maps/world/settings.json`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("application/json");
        expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
        expect(await res.text()).toBe(settings);
    });

    it("gzip-negotiates textures.json the same way a tile is negotiated", async () => {
        const textures = JSON.stringify({ textures: [] });
        await storage.textures().write(Buffer.from(textures));
        const base = await startServer();

        const gz = await rawRequest(`${base}/maps/world/textures.json`, { "accept-encoding": "gzip" });
        expect(gz.headers["content-encoding"]).toBe("gzip");
        expect(gunzipSync(gz.body).toString()).toBe(textures);

        const plain = await rawRequest(`${base}/maps/world/textures.json`);
        expect(plain.headers["content-encoding"]).toBeUndefined();
        expect(plain.body.toString()).toBe(textures);
    });

    it("serves a named asset under assets/, with content-type from its extension", async () => {
        const png = Buffer.from([1, 2, 3]);
        await storage.asset("markers/flag.png").write(png);
        const base = await startServer();

        const res = await fetch(`${base}/maps/world/assets/markers/flag.png`);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await res.arrayBuffer())).toEqual(png);
    });

    it("answers live/players.json and live/markers.json with the honest empty stub, never 404", async () => {
        // A mounted map always has a live-data supplier (the default "nothing live yet"
        // stub when the caller does not provide a real one — see live-endpoints.test.ts),
        // which upstream registers ahead of the raw-storage fallback tested above.
        const base = await startServer();
        const players = await fetch(`${base}/maps/world/live/players.json`);
        expect(players.status).toBe(200);
        expect(await players.json()).toEqual({ players: [] });

        const markers = await fetch(`${base}/maps/world/live/markers.json`);
        expect(markers.status).toBe(200);
        expect(await markers.json()).toEqual({});
    });

    it("404s an unrecognized path under the map", async () => {
        const base = await startServer();
        const res = await fetch(`${base}/maps/world/no-such-thing.json`);
        expect(res.status).toBe(404);
    });
});

describe("MapStorageHandler: map mounting", () => {
    beforeEach(() => {
        storage = new FileMapStorage(root, Compression.GZIP, false);
    });

    it("404s a request for a map id that was never mounted", async () => {
        const base = await startServer("world");
        const res = await fetch(`${base}/maps/nether/settings.json`);
        expect(res.status).toBe(404);
    });

    it("stops answering for a map once it is unmounted", async () => {
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer();
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        await storage.settings().write(Buffer.from("{}"));
        expect((await fetch(`${base}/maps/world/settings.json`)).status).toBe(200);

        handler.removeMount("world");
        expect((await fetch(`${base}/maps/world/settings.json`)).status).toBe(404);
    });

    it("honors the server's auth token gate", async () => {
        await storage.settings().write(Buffer.from("{}"));
        const handler = new MapStorageHandler();
        handler.setMount({ mapId: "world", storage });
        const server = new HttpServer({ authToken: "secret" });
        server.addHandler(handler);
        const addr = await server.listen();
        cleanups.push(() => server.close());
        const base = `http://127.0.0.1:${String(addr.port)}`;

        expect((await fetch(`${base}/maps/world/settings.json`)).status).toBe(403);
        expect((await fetch(`${base}/maps/world/settings.json?token=secret`)).status).toBe(200);
    });
});
