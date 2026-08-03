import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HttpServer } from "@material-bluemap/server";
import { LocalMapHandler } from "./LocalMapHandler.js";

/**
 * The directory laid out here is the one a real render produces, checked against the
 * output of `cli-5.22-27-shadow.jar` on this machine:
 *
 * ```
 * web/settings.json
 * web/maps/overworld/settings.json
 * web/maps/overworld/textures.json.gz
 * web/maps/overworld/tiles/0/x0/z1/0.prbm.gz     <- hires, gzip on disk
 * web/maps/overworld/tiles/1/x-1/z0.png          <- lowres, not compressed
 * web/maps/overworld/live/{markers,players}.json
 * ```
 *
 * The tile path is not arbitrary: the viewer's `pathFromCoords` splits each coordinate
 * digit into its own folder, so tile (0, 10) is `x0/z1/0`, which is exactly the name
 * the engine wrote.
 */

let root = "";
let webRoot = "";
let server: HttpServer | null = null;
let baseUrl = "";
let handler: LocalMapHandler;

const HIRES_BODY = Buffer.from("PRBM-hires-tile-bytes");
const TEXTURES_BODY = Buffer.from('{"textures":[]}');
const LOWRES_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/**
 * One server and one tree for the whole file, rather than one per test.
 *
 * Not premature tidiness. `HttpServer.close()` awaits `close()` before calling
 * `closeAllConnections()`, and after a **streamed** response Node does not treat the
 * keep-alive socket as idle, so the close waits out the client's three-second keep-alive
 * instead of dropping the socket. Standing a server up per test paid that three seconds
 * six times over and bought no coverage. Every test below only reads, so they can share.
 */
beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "mbm-serve-"));
    webRoot = join(root, "web");
    const map = join(webRoot, "maps", "overworld");

    await mkdir(join(map, "tiles", "0", "x0", "z1"), { recursive: true });
    await mkdir(join(map, "tiles", "1", "x-1"), { recursive: true });
    await mkdir(join(map, "live"), { recursive: true });

    await writeFile(
        join(webRoot, "settings.json"),
        '{"version":"5.22-27","mapDataRoot":"maps","liveDataRoot":"maps","maps":["overworld"]}',
        "utf8",
    );
    // The webapp files a `-g` render would also leave here. None of them is servable.
    await writeFile(join(webRoot, "index.html"), "<html>upstream webapp</html>", "utf8");
    await writeFile(join(webRoot, "sql.php"), "<?php ?>", "utf8");

    await writeFile(join(map, "settings.json"), '{"name":"Overworld","sorting":0}', "utf8");
    await writeFile(join(map, "textures.json.gz"), gzipSync(TEXTURES_BODY));
    await writeFile(join(map, "tiles", "0", "x0", "z1", "0.prbm.gz"), gzipSync(HIRES_BODY));
    await writeFile(join(map, "tiles", "1", "x-1", "z0.png"), LOWRES_PNG);
    await writeFile(join(map, "live", "markers.json"), "{}", "utf8");

    // Targets for the traversal tests, deliberately outside the web root.
    await writeFile(join(root, "secret.txt"), "not for the viewer", "utf8");
    await mkdir(join(root, "web-elsewhere"), { recursive: true });
    await writeFile(join(root, "web-elsewhere", "settings.json"), '{"leak":true}', "utf8");

    handler = new LocalMapHandler();
    server = new HttpServer({ host: "127.0.0.1", port: 0 });
    server.addHandler(handler);
    const address = await server.listen();
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

/** Puts the mount back, so a test that unmounts cannot leak into the next one. */
beforeEach(() => {
    handler.setMount({
        renderId: "world-abc",
        webRoot,
        engineLabel: "BlueMap engine (Java) 5.22-27",
    });
});

afterAll(async () => {
    await server?.close();
    server = null;
    await rm(root, { recursive: true, force: true });
});

function get(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${baseUrl}${path}`, init);
}

describe("mounting", () => {
    it("gives the viewer the same shape of data root a remote profile has", () => {
        expect(LocalMapHandler.dataRoot("world-abc")).toBe("/local/world-abc");
        expect(handler.getMount("world-abc")?.engineLabel).toBe("BlueMap engine (Java) 5.22-27");
        expect(handler.getMounts()).toHaveLength(1);
    });

    it("passes a path it does not own to the next handler", async () => {
        const response = await get("/assets/index.js");
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("Not Found");
    });

    it("says plainly when a render id is not mounted", async () => {
        const response = await get("/local/never-rendered/settings.json");
        expect(response.status).toBe(404);
        expect(await response.text()).toBe("Unknown local render");
    });

    it("stops serving a render that has been unmounted", async () => {
        handler.removeMount("world-abc");
        expect((await get("/local/world-abc/settings.json")).status).toBe(404);
    });
});

describe("metadata", () => {
    it("serves the webapp settings the viewer loads first", async () => {
        const response = await get("/local/world-abc/settings.json");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(((await response.json()) as { maps: string[] }).maps).toEqual(["overworld"]);
    });

    it("serves a map's own settings", async () => {
        const response = await get("/local/world-abc/maps/overworld/settings.json");
        expect(response.status).toBe(200);
        expect(((await response.json()) as { name: string }).name).toBe("Overworld");
    });

    it("serves live marker and player data", async () => {
        expect((await get("/local/world-abc/maps/overworld/live/markers.json")).status).toBe(200);
    });
});

describe("compression", () => {
    it("serves textures.json from the gzip on disk, decompressed by the client", async () => {
        // `clientDecompression: false`: the viewer asks for the uncompressed name and
        // undici transparently inflates the gzip response.
        const response = await get("/local/world-abc/maps/overworld/textures.json");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("application/json");
        expect(await response.text()).toBe(TEXTURES_BODY.toString());
    });

    it("serves the raw gzip when the viewer asks for the .gz name", async () => {
        // `clientDecompression: true`: the viewer appends `.gz` and inflates it itself,
        // so these bytes must arrive still compressed.
        const response = await get("/local/world-abc/maps/overworld/textures.json.gz");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-encoding")).toBeNull();
        const body = Buffer.from(await response.arrayBuffer());
        expect(body[0]).toBe(0x1f);
        expect(body[1]).toBe(0x8b);
    });

    it("decompresses for a client that will not take gzip", async () => {
        const response = await get("/local/world-abc/maps/overworld/tiles/0/x0/z1/0.prbm", {
            headers: { "accept-encoding": "identity" },
        });
        expect(response.status).toBe(200);
        expect(response.headers.get("content-encoding")).toBeNull();
        expect(Buffer.from(await response.arrayBuffer())).toEqual(HIRES_BODY);
    });
});

describe("tiles", () => {
    it("serves a hires tile as the content type upstream uses", async () => {
        const response = await get("/local/world-abc/maps/overworld/tiles/0/x0/z1/0.prbm");
        expect(response.status).toBe(200);
        // Not application/gzip: the transfer is compressed, the content is a mesh.
        expect(response.headers.get("content-type")).toBe("application/octet-stream");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(HIRES_BODY);
    });

    it("serves an uncompressed lowres tile as a PNG", async () => {
        const response = await get("/local/world-abc/maps/overworld/tiles/1/x-1/z0.png");
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("content-encoding")).toBeNull();
    });

    it("answers a tile that was never rendered with 204, not 404", async () => {
        // A world is a sparse grid and most tile requests are for empty space. Upstream
        // answers those with 204 and the viewer draws nothing; a 404 would make
        // ordinary empty terrain look like a broken server.
        const response = await get("/local/world-abc/maps/overworld/tiles/0/x9/z9.prbm");
        expect(response.status).toBe(204);
        expect((await response.text()).length).toBe(0);

        const lowres = await get("/local/world-abc/maps/overworld/tiles/3/x9/z9.png");
        expect(lowres.status).toBe(204);
    });

    it("still 404s something that is not a tile at all", async () => {
        expect((await get("/local/world-abc/maps/overworld/nonsense.json")).status).toBe(404);
    });
});

describe("revalidation", () => {
    it("answers a matching If-None-Match with 304", async () => {
        const first = await get("/local/world-abc/maps/overworld/settings.json");
        const etag = first.headers.get("etag");
        expect(etag).not.toBeNull();

        const second = await get("/local/world-abc/maps/overworld/settings.json", {
            headers: { "if-none-match": etag ?? "" },
        });
        expect(second.status).toBe(304);
    });

    it("asks the client to revalidate rather than cache a map that is re-rendered in place", async () => {
        const response = await get("/local/world-abc/maps/overworld/settings.json");
        expect(response.headers.get("cache-control")).toBe("no-cache");
    });

    it("answers HEAD without a body", async () => {
        const response = await get("/local/world-abc/maps/overworld/settings.json", {
            method: "HEAD",
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("");
    });

    it("refuses a method that is not a read", async () => {
        expect((await get("/local/world-abc/settings.json", { method: "POST" })).status).toBe(405);
    });
});

describe("what is deliberately not served", () => {
    it("does not serve upstream's own webapp, including its sql.php", async () => {
        // Both files exist in the same directory. Scoping the handler to the paths the
        // viewer actually asks for means the question of whether to serve a PHP file
        // never arises.
        expect((await get("/local/world-abc/index.html")).status).toBe(404);
        expect((await get("/local/world-abc/sql.php")).status).toBe(404);
    });

    it("cannot be walked out of the web root", async () => {
        for (const path of [
            "/local/world-abc/maps/../../secret.txt",
            "/local/world-abc/maps/..%2f..%2fsecret.txt",
            "/local/world-abc/maps/%2e%2e/%2e%2e/secret.txt",
        ]) {
            const response = await get(path);
            expect(response.status).not.toBe(200);
            expect(await response.text()).not.toContain("not for the viewer");
        }
    });

    it("cannot be walked out of a sibling directory sharing the root's prefix", async () => {
        const response = await get("/local/world-abc/maps/../../web-elsewhere/settings.json");
        expect(response.status).not.toBe(200);
    });
});
