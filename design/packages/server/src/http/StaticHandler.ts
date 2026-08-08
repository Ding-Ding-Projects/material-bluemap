import type * as http from "node:http";
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { createHash } from "node:crypto";
import type { HttpHandler } from "./HttpServer.js";

const CONTENT_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript",
    ".mjs": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".conf": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json",
    ".map": "application/json",
};

/**
 * Serves the built UI bundle. Directory requests fall back to index.html (the UI is a
 * hash-routed SPA). ETags follow upstream FileRequestHandler's shape (size|path|mtime).
 */
export class StaticHandler implements HttpHandler {
    private readonly root: string;

    constructor(root: string) {
        this.root = path.resolve(root);
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        if (req.method !== "GET" && req.method !== "HEAD") return false;
        const url = new URL(req.url ?? "/", "http://localhost");
        let filePath = path.normalize(path.join(this.root, decodeURIComponent(url.pathname)));
        if (!filePath.startsWith(this.root)) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Bad Request");
            return true;
        }

        let stat = await fsp.stat(filePath).catch(() => null);
        if (stat?.isDirectory()) {
            filePath = path.join(filePath, "index.html");
            stat = await fsp.stat(filePath).catch(() => null);
        }
        if (!stat?.isFile()) return false;

        const etag = createHash("sha1")
            .update(`${stat.size}|${filePath}|${stat.mtimeMs}`)
            .digest("hex")
            .slice(0, 16);
        if (req.headers["if-none-match"] === etag) {
            res.writeHead(304, {
                "x-content-type-options": "nosniff",
                "referrer-policy": "no-referrer",
                "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
            });
            res.end();
            return true;
        }

        res.writeHead(200, {
            "content-type": CONTENT_TYPES[path.extname(filePath)] ?? "application/octet-stream",
            "content-length": stat.size,
            etag,
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        });
        if (req.method === "HEAD") {
            res.end();
            return true;
        }
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
        await new Promise<void>((resolve) => res.on("close", () => resolve()));
        return true;
    }
}
