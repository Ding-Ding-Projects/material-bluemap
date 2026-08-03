import * as http from "node:http";
import type { AddressInfo } from "node:net";

export interface HttpHandler {
    /**
     * Handle a request. Return true if the request was handled (a response was written),
     * false to let the next handler try.
     */
    handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<boolean>;
}

export interface HttpServerOptions {
    host?: string;
    port?: number;
    /**
     * When set, every request must carry this token either as a Bearer Authorization
     * header or a `token` query parameter (EventSource cannot set headers). Used by the
     * Electron app to keep the localhost server private to the renderer it spawned.
     */
    authToken?: string;
}

/**
 * Minimal HTTP server used in Phase A (static UI + remote proxy). The full port of
 * upstream's routing/ETag/content-negotiation semantics lands with the Phase E server.
 */
export class HttpServer {
    private readonly handlers: HttpHandler[] = [];
    private readonly server: http.Server;
    private readonly options: HttpServerOptions;

    constructor(options: HttpServerOptions = {}) {
        this.options = options;
        this.server = http.createServer((req, res) => {
            void this.dispatch(req, res);
        });
    }

    addHandler(handler: HttpHandler): void {
        this.handlers.push(handler);
    }

    private authorized(req: http.IncomingMessage): boolean {
        const token = this.options.authToken;
        if (!token) return true;
        const auth = req.headers.authorization;
        if (auth === `Bearer ${token}`) return true;
        const url = new URL(req.url ?? "/", "http://localhost");
        return url.searchParams.get("token") === token;
    }

    private async dispatch(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
        try {
            if (!this.authorized(req)) {
                res.writeHead(403, { "content-type": "text/plain" });
                res.end("Forbidden");
                return;
            }
            for (const handler of this.handlers) {
                if (await handler.handle(req, res)) return;
            }
            res.writeHead(404, { "content-type": "text/plain" });
            res.end("Not Found");
        } catch (error) {
            if (!res.headersSent) {
                res.writeHead(500, { "content-type": "text/plain" });
            }
            res.end("Internal Server Error");
            console.error("[HttpServer]", error);
        }
    }

    async listen(): Promise<AddressInfo> {
        const { host = "127.0.0.1", port = 0 } = this.options;
        await new Promise<void>((resolve, reject) => {
            this.server.once("error", reject);
            this.server.listen(port, host, () => {
                this.server.off("error", reject);
                resolve();
            });
        });
        return this.server.address() as AddressInfo;
    }

    async close(): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this.server.close((err) => (err ? reject(err) : resolve()));
        });
        this.server.closeAllConnections();
    }
}
