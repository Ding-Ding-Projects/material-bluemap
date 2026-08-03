import { afterEach, describe, expect, it } from "vitest";
import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { HttpServer } from "../src/http/HttpServer.js";
import { RemoteProxyHandler } from "../src/remote/RemoteProxy.js";

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
    while (cleanups.length) await cleanups.pop()!();
});

/** Minimal fake remote BlueMap instance. */
function startFakeRemote(): Promise<AddressInfo> {
    const server = http.createServer((req, res) => {
        if (req.url === "/bluemap/settings.json") {
            res.writeHead(200, { "content-type": "application/json", etag: '"abc"' });
            res.end(JSON.stringify({ maps: ["world"], version: "test" }));
        } else if (req.url?.endsWith(".prbm")) {
            // missing tile semantics
            res.writeHead(204);
            res.end();
        } else if (req.url === "/bluemap/maps/world/live/sse") {
            res.writeHead(200, { "content-type": "text/event-stream" });
            res.write("event: tile\ndata: {\"x\":1,\"y\":2,\"lod\":0}\n\n");
            // keep open; closed by client
        } else {
            res.writeHead(404);
            res.end();
        }
    });
    cleanups.push(() => new Promise((r) => server.close(() => r())));
    return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve(server.address() as AddressInfo));
    });
}

async function startProxy(remoteBase: string, token?: string) {
    const proxy = new RemoteProxyHandler();
    proxy.setProfile({ id: "p1", name: "Test", baseUrl: remoteBase });
    const server = new HttpServer(token !== undefined ? { authToken: token } : {});
    server.addHandler(proxy);
    const addr = await server.listen();
    cleanups.push(() => server.close());
    return `http://127.0.0.1:${addr.port}`;
}

describe("RemoteProxyHandler", () => {
    it("proxies JSON and forwards ETag", async () => {
        const remote = await startFakeRemote();
        const base = await startProxy(`http://127.0.0.1:${remote.port}/bluemap`);
        const res = await fetch(`${base}/remote/p1/settings.json`);
        expect(res.status).toBe(200);
        expect(res.headers.get("etag")).toBe('"abc"');
        expect(await res.json()).toEqual({ maps: ["world"], version: "test" });
    });

    it("passes through 204 for missing tiles", async () => {
        const remote = await startFakeRemote();
        const base = await startProxy(`http://127.0.0.1:${remote.port}/bluemap`);
        const res = await fetch(`${base}/remote/p1/maps/world/tiles/0/x0/z0.prbm`);
        expect(res.status).toBe(204);
    });

    it("streams SSE events", async () => {
        const remote = await startFakeRemote();
        const base = await startProxy(`http://127.0.0.1:${remote.port}/bluemap`);
        const controller = new AbortController();
        const res = await fetch(`${base}/remote/p1/maps/world/live/sse`, {
            signal: controller.signal,
        });
        expect(res.headers.get("content-type")).toContain("text/event-stream");
        const reader = res.body!.getReader();
        const { value } = await reader.read();
        expect(new TextDecoder().decode(value)).toContain("event: tile");
        controller.abort();
    });

    it("rejects unknown profiles and non-GET methods", async () => {
        const remote = await startFakeRemote();
        const base = await startProxy(`http://127.0.0.1:${remote.port}/bluemap`);
        expect((await fetch(`${base}/remote/nope/settings.json`)).status).toBe(404);
        expect((await fetch(`${base}/remote/p1/x`, { method: "POST" })).status).toBe(405);
    });

    it("enforces the auth token when configured", async () => {
        const remote = await startFakeRemote();
        const base = await startProxy(`http://127.0.0.1:${remote.port}/bluemap`, "secret");
        expect((await fetch(`${base}/remote/p1/settings.json`)).status).toBe(403);
        expect(
            (await fetch(`${base}/remote/p1/settings.json?token=secret`)).status,
        ).toBe(200);
        expect(
            (
                await fetch(`${base}/remote/p1/settings.json`, {
                    headers: { authorization: "Bearer secret" },
                })
            ).status,
        ).toBe(200);
    });
});
