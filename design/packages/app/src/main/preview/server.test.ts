import { createServer, type Server } from "node:net";
import * as http from "node:http";
import { gzipSync } from "node:zlib";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    DEFAULT_PREVIEW_PORT,
    LOOPBACK_HOST,
    NETWORK_HOST,
    PREVIEW_STATUS_PATH,
    RenderPreviewHandler,
    injectLiveBanner,
    startPreviewServer,
    type PreviewServerHandle,
} from "./server.js";

/**
 * A real render's `web/` directory, laid out the same way `LocalMapHandler.test.ts` builds
 * its fixture - this module serves a superset of the same tree (it also serves the webapp
 * files that one deliberately excludes), so the fixture grows the two extra files this
 * handler is the one to answer for.
 */
async function makeWebRoot(): Promise<{ root: string; webRoot: string }> {
    const root = await mkdtemp(join(tmpdir(), "mbm-preview-"));
    const webRoot = join(root, "web");
    const map = join(webRoot, "maps", "overworld");
    await mkdir(join(map, "tiles", "0", "x0", "z1"), { recursive: true });
    await mkdir(join(webRoot, "assets"), { recursive: true });

    await writeFile(
        join(webRoot, "settings.json"),
        '{"version":"5.22-27","maps":["overworld"]}',
        "utf8",
    );
    await writeFile(
        join(webRoot, "index.html"),
        "<html><head><title>Map</title></head><body><div id=\"app\"></div></body></html>",
        "utf8",
    );
    await writeFile(join(webRoot, "assets", "app.js"), "console.log('bluemap webapp');", "utf8");
    await writeFile(join(map, "settings.json"), '{"name":"Overworld"}', "utf8");
    await writeFile(join(map, "tiles", "0", "x0", "z1", "0.prbm.gz"), gzipSync(Buffer.from("mesh-bytes")));

    await writeFile(join(root, "secret.txt"), "not for the browser", "utf8");
    return { root, webRoot };
}

let handles: PreviewServerHandle[] = [];
let dirs: string[] = [];

afterEach(async () => {
    for (const handle of handles) await handle.stop();
    handles = [];
    for (const dir of dirs) await rm(dir, { recursive: true, force: true });
    dirs = [];
});

async function fixture(): Promise<{ root: string; webRoot: string }> {
    const made = await makeWebRoot();
    dirs.push(made.root);
    return made;
}

async function start(webRoot: string, extra: Partial<Parameters<typeof startPreviewServer>[0]> = {}) {
    const handle = await startPreviewServer({
        renderId: "world-abc",
        webRoot,
        isActive: () => false,
        port: 0,
        ...extra,
    });
    handles.push(handle);
    return handle;
}

describe("starting the server and reporting its real URL", () => {
    it("starts, serves the real output directory, and reports a URL that actually answers", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);

        expect(handle.url).toBe(`http://127.0.0.1:${String(handle.port)}/`);
        expect(handle.port).toBeGreaterThan(0);

        const response = await fetch(`${handle.url}maps/overworld/settings.json`);
        expect(response.status).toBe(200);
        const body = (await response.json()) as { name: string };
        expect(body.name).toBe("Overworld");
    });

    it("serves the render's own generated webapp at the root, index.html included", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);

        const response = await fetch(handle.url);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toContain("text/html");
        const text = await response.text();
        // The real bytes on disk, not a stand-in - proves the file was actually read.
        expect(text).toContain('<div id="app"></div>');
    });

    it("serves a real static asset with the right content type", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        const response = await fetch(`${handle.url}assets/app.js`);
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("text/javascript");
        expect(await response.text()).toBe("console.log('bluemap webapp');");
    });

    it("serves a gzip-on-disk hires tile, decompressed for a client with no accept-encoding claim", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        const response = await fetch(`${handle.url}maps/overworld/tiles/0/x0/z1/0.prbm`, {
            headers: { "accept-encoding": "identity" },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("mesh-bytes");
    });

    it("answers a tile that was never rendered with 204, not 404", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        const response = await fetch(`${handle.url}maps/overworld/tiles/0/x9/z9.prbm`);
        expect(response.status).toBe(204);
    });

    it("refuses a method that is not a read", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        const response = await fetch(`${handle.url}settings.json`, { method: "POST" });
        expect(response.status).toBe(405);
    });
});

describe("path traversal is refused", () => {
    it("cannot be walked out of the web root with dot-dot segments", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);

        for (const path of ["../secret.txt", "maps/../../secret.txt", "%2e%2e/secret.txt", "maps/..%2f..%2fsecret.txt"]) {
            const response = await fetch(`${handle.url}${path}`);
            expect(response.status, `expected ${path} to be refused`).not.toBe(200);
            const text = await response.text();
            expect(text).not.toContain("not for the browser");
        }
    });

    it("refuses a null byte in the path rather than resolving it", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        const response = await fetch(`${handle.url}settings.json%00.txt`);
        expect(response.status).not.toBe(200);
    });

    /**
     * `fetch()`/`new URL()` never let a raw backslash reach `req.url` - the WHATWG URL
     * parser treats it as an ordinary path character, not a separator, and either encodes
     * or leaves it alone before the request line is written. Every test above only proves
     * the handler refuses what a *browser* can send. Node's own `path.normalize` on
     * Windows treats `\` as a real separator, so this sends a raw, unencoded backslash
     * directly over the wire with `node:http`, bypassing `fetch` entirely, to prove the
     * refusal holds against a client that does not go through a browser's URL rules at all.
     */
    it("refuses a raw, unencoded backslash sent directly over the wire, not just what fetch() would send", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);

        const status = await new Promise<number>((resolve, reject) => {
            const req = http.get(
                {
                    host: "127.0.0.1",
                    port: handle.port,
                    // Node's http client does not re-validate or re-encode a path handed to
                    // it this way; it is written to the request line close to verbatim.
                    path: "/maps/..\\..\\secret.txt",
                },
                (res) => {
                    res.resume();
                    resolve(res.statusCode ?? 0);
                },
            );
            req.on("error", reject);
        });
        expect(status).not.toBe(200);
    });

    it("the handler itself refuses a request that resolves outside its root, in isolation", async () => {
        const { root, webRoot } = await fixture();
        const handler = new RenderPreviewHandler({ renderId: "x", webRoot, isActive: () => false });
        void root;
        const calls: Array<{ status: number; body: string }> = [];
        const fakeRes = {
            writeHead(status: number) {
                calls.push({ status, body: "" });
                return this;
            },
            end(chunk?: unknown) {
                if (calls.length > 0 && typeof chunk === "string") {
                    calls[calls.length - 1]!.body = chunk;
                }
            },
        };
        const fakeReq = { method: "GET", url: "/maps/../../secret.txt", headers: {} };
        await handler.handle(fakeReq as never, fakeRes as never);
        expect(calls[0]?.status).not.toBe(200);
    });
});

describe("binding", () => {
    it("binds to loopback by default", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        expect(handle.host).toBe(LOOPBACK_HOST);
        expect(handle.host).toBe("127.0.0.1");
    });

    it("only binds to every interface on an explicit request", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot, { host: NETWORK_HOST });
        expect(handle.host).toBe("0.0.0.0");
        // The reported URL still opens: 0.0.0.0 is a bind address, not a browsable one.
        expect(handle.url.startsWith("http://localhost:")).toBe(true);
        const response = await fetch(`http://127.0.0.1:${String(handle.port)}/settings.json`);
        expect(response.status).toBe(200);
    });
});

describe("a busy port is handled gracefully", () => {
    it("falls back to a different port when the requested one is taken, and says so", async () => {
        const { webRoot } = await fixture();

        // Occupy a real port first, exactly the scenario this has to survive.
        const squatter: Server = createServer();
        await new Promise<void>((resolve, reject) => {
            squatter.once("error", reject);
            squatter.listen(0, "127.0.0.1", resolve);
        });
        const address = squatter.address();
        const takenPort = typeof address === "object" && address !== null ? address.port : 0;
        expect(takenPort).toBeGreaterThan(0);

        try {
            const handle = await start(webRoot, { port: takenPort });
            expect(handle.usedRequestedPort).toBe(false);
            expect(handle.requestedPort).toBe(takenPort);
            expect(handle.port).not.toBe(takenPort);
            expect(handle.port).toBeGreaterThan(0);

            // Never a raw EADDRINUSE bubbling up - the server actually answers on the port
            // it fell back to.
            const response = await fetch(`http://127.0.0.1:${String(handle.port)}/settings.json`);
            expect(response.status).toBe(200);
        } finally {
            await new Promise<void>((resolve) => squatter.close(() => resolve()));
        }
    });

    it("uses the default port when nothing else is holding it", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot, { port: DEFAULT_PREVIEW_PORT });
        // Not guaranteed on a shared CI box (something else could hold it), but when it is
        // free this proves the "no fallback taken" path is real and not just assumed.
        if (handle.usedRequestedPort) {
            expect(handle.port).toBe(DEFAULT_PREVIEW_PORT);
        }
    });
});

describe("stopping", () => {
    it("stops cleanly and releases the port", async () => {
        const { webRoot } = await fixture();
        const handle = await startPreviewServer({
            renderId: "world-abc",
            webRoot,
            isActive: () => false,
            port: 0,
        });
        const port = handle.port;
        await handle.stop();

        // The port is free again: a brand new server can bind exactly that port.
        const reclaim: Server = createServer();
        await new Promise<void>((resolve, reject) => {
            reclaim.once("error", reject);
            reclaim.listen(port, "127.0.0.1", resolve);
        });
        await new Promise<void>((resolve) => reclaim.close(() => resolve()));

        // And the stopped server genuinely stopped answering.
        await expect(fetch(`http://127.0.0.1:${String(port)}/settings.json`)).rejects.toThrow();
    });
});

describe("serving never locks or blocks the render's own writes", () => {
    it("a file can be rewritten while this server is serving other files from the same directory", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);

        const tilePath = join(webRoot, "maps", "overworld", "tiles", "0", "x0", "z1", "0.prbm.gz");

        // Interleave real HTTP reads with real writes into the same tree, the way a render
        // and a browser tab would overlap in practice. Neither side may fail.
        for (let i = 0; i < 5; i++) {
            const [response] = await Promise.all([
                fetch(`${handle.url}settings.json`),
                writeFile(tilePath, gzipSync(Buffer.from(`mesh-bytes-${String(i)}`))),
            ]);
            expect(response.status).toBe(200);
        }

        // A brand new tile appearing mid-session (exactly what a live render does) is
        // visible immediately, with no restart of anything.
        const newTile = join(webRoot, "maps", "overworld", "tiles", "0", "x0", "z2", "0.prbm.gz");
        await mkdir(join(webRoot, "maps", "overworld", "tiles", "0", "x0", "z2"), { recursive: true });
        await writeFile(newTile, gzipSync(Buffer.from("brand-new-tile")));
        const response = await fetch(`${handle.url}maps/overworld/tiles/0/x0/z2/0.prbm`, {
            headers: { "accept-encoding": "identity" },
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("brand-new-tile");
    });
});

describe("live status and the injected banner", () => {
    it("reports whether the render is active over its own status endpoint", async () => {
        const { webRoot } = await fixture();
        let active = true;
        const handle = await startPreviewServer({
            renderId: "world-abc",
            webRoot,
            isActive: () => active,
            port: 0,
        });
        handles.push(handle);

        const first = await fetch(`http://127.0.0.1:${String(handle.port)}${PREVIEW_STATUS_PATH}`);
        expect(first.status).toBe(200);
        expect((await first.json()) as { active: boolean; renderId: string }).toMatchObject({
            active: true,
            renderId: "world-abc",
        });

        active = false;
        const second = await fetch(`http://127.0.0.1:${String(handle.port)}${PREVIEW_STATUS_PATH}`);
        expect((await second.json()) as { active: boolean }).toMatchObject({ active: false });
    });

    it("weaves the live banner into the real index.html served over HTTP", async () => {
        const { webRoot } = await fixture();
        const handle = await start(webRoot);
        const html = await (await fetch(handle.url)).text();
        expect(html).toContain("worldlens-preview-banner");
        expect(html).toContain(PREVIEW_STATUS_PATH);
        // Still valid: the injected markup lands before the real closing tag, not after it.
        expect(html.indexOf("worldlens-preview-banner")).toBeLessThan(html.lastIndexOf("</body>"));
    });

    it("appends the banner even to a page with no closing body tag", () => {
        const result = injectLiveBanner("<html><body><p>no closing tag here");
        expect(result).toContain("worldlens-preview-banner");
    });
});
