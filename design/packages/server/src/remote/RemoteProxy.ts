import type * as http from "node:http";
import { Readable } from "node:stream";
import type { HttpHandler } from "../http/HttpServer.js";

export interface RemoteProfile {
    id: string;
    name: string;
    /** Base URL of the remote BlueMap instance, e.g. "https://bluecolored.de/bluemap". */
    baseUrl: string;
    /** Extra headers to attach (e.g. basic auth) — stored per profile. */
    headers?: Record<string, string>;
}

/** Request headers forwarded to the remote (conditional requests + encoding negotiation). */
const FORWARD_REQUEST_HEADERS = ["if-none-match", "if-modified-since", "accept", "accept-encoding"];

/** Response headers passed back to the viewer. */
const FORWARD_RESPONSE_HEADERS = [
    "content-type",
    "content-encoding",
    "content-length",
    "etag",
    "last-modified",
    "cache-control",
];

/**
 * Reverse proxy for remote BlueMap servers, mounted at /remote/{profileId}/…
 *
 * Remote BlueMap instances do not send CORS headers (the upstream webapp is same-origin),
 * so the sandboxed renderer cannot fetch them directly. Routing through this proxy keeps
 * everything same-origin, forwards conditional-request headers (the viewer's
 * RevalidatingFileLoader relies on ETag revalidation), preserves 204-for-missing-tile
 * semantics, and streams SSE (`live/sse`) without buffering.
 */
export class RemoteProxyHandler implements HttpHandler {
    private readonly profiles = new Map<string, RemoteProfile>();

    setProfile(profile: RemoteProfile): void {
        this.profiles.set(profile.id, profile);
    }

    removeProfile(id: string): void {
        this.profiles.delete(id);
    }

    getProfiles(): RemoteProfile[] {
        return [...this.profiles.values()];
    }

    async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean> {
        const url = new URL(req.url ?? "/", "http://localhost");
        const match = /^\/remote\/([^/]+)\/(.*)$/.exec(url.pathname);
        if (!match) return false;

        const [, profileId, rest] = match;
        const profile = this.profiles.get(profileId!);
        if (!profile) {
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Unknown remote profile");
            return true;
        }
        if (req.method !== "GET" && req.method !== "HEAD") {
            res.writeHead(405, { "content-type": "text/plain" });
            res.end("Method Not Allowed");
            return true;
        }

        const target = new URL(rest ?? "", profile.baseUrl.endsWith("/") ? profile.baseUrl : profile.baseUrl + "/");
        // Never allow the path to escape the configured base URL.
        if (!target.href.startsWith(profile.baseUrl.replace(/\/$/, ""))) {
            res.writeHead(400, { "content-type": "text/plain" });
            res.end("Invalid path");
            return true;
        }

        const headers: Record<string, string> = { ...profile.headers };
        for (const name of FORWARD_REQUEST_HEADERS) {
            const value = req.headers[name];
            if (typeof value === "string") headers[name] = value;
        }

        let upstream: Response;
        try {
            upstream = await fetch(target, {
                method: req.method,
                headers,
                redirect: "follow",
                signal: AbortSignal.timeout(rest?.endsWith("live/sse") ? 24 * 60 * 60_000 : 60_000),
            });
        } catch {
            res.writeHead(502, { "content-type": "text/plain" });
            res.end("Bad Gateway");
            return true;
        }

        const responseHeaders: Record<string, string> = {};
        for (const name of FORWARD_RESPONSE_HEADERS) {
            const value = upstream.headers.get(name);
            if (value !== null) responseHeaders[name] = value;
        }

        const contentType = upstream.headers.get("content-type") ?? "";
        const isSse = contentType.startsWith("text/event-stream");
        if (isSse) {
            responseHeaders["cache-control"] = "no-cache";
            responseHeaders["x-accel-buffering"] = "no";
        }

        res.writeHead(upstream.status, responseHeaders);
        if (upstream.body && req.method !== "HEAD" && upstream.status !== 204 && upstream.status !== 304) {
            const body = Readable.fromWeb(upstream.body as import("node:stream/web").ReadableStream);
            body.pipe(res);
            req.on("close", () => body.destroy());
            await new Promise<void>((resolve) => res.on("close", () => resolve()));
        } else {
            res.end();
        }
        return true;
    }
}
