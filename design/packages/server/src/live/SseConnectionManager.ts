/**
 * Server-Sent Events, the transport half of "live".
 *
 * upstream: `common/.../web/SseConnection.java` and `.../web/SseConnectionManager.java`.
 * Upstream queues events onto a small bounded queue (capacity 16) drained by a dedicated
 * virtual thread per connection, and drops — closing the connection — a client whose queue
 * fills up rather than letting a slow reader block a broadcast to everyone else. Node's
 * `http.ServerResponse.write` already hands back a per-write completion callback, so this
 * port keeps the same bounded queue and the same "drop and close" rule, draining it through
 * that callback instead of a second thread: a broadcast is still one-queue-push per
 * connection, never blocking, and a stuck connection still only ever affects itself.
 */

import type * as http from "node:http";

/** upstream: `SseConnection.QUEUE_CAPACITY` */
const QUEUE_CAPACITY = 16;

class SseConnection {
    private readonly queue: Array<[eventType: string, data: string]> = [];
    private draining = false;
    private closed = false;
    private onCloseCallback: (() => void) | null = null;

    constructor(private readonly res: http.ServerResponse) {}

    /** upstream: `setOnClose(Runnable)` — false if the connection was already closed. */
    setOnClose(callback: () => void): boolean {
        if (this.closed) return false;
        this.onCloseCallback = callback;
        return true;
    }

    isClosed(): boolean {
        return this.closed;
    }

    /**
     * upstream: `enqueue(String, String)` — silently dropped once closed; the connection is
     * closed outright if a slow reader has let the queue fill up.
     */
    enqueue(eventType: string, data: string): void {
        if (this.closed) return;
        if (this.queue.length >= QUEUE_CAPACITY) {
            this.close();
            return;
        }
        this.queue.push([eventType, data]);
        void this.drain();
    }

    /** upstream: the `sendLoop`'s `while` body, one send at a time, in order. */
    private async drain(): Promise<void> {
        if (this.draining) return;
        this.draining = true;
        try {
            while (!this.closed) {
                const next = this.queue.shift();
                if (next === undefined) break;
                await this.send(next[0], next[1]);
            }
        } finally {
            this.draining = false;
        }
    }

    /** upstream: `send(String, String)` — one SSE event, one `data:` line per input line. */
    private send(eventType: string, data: string): Promise<void> {
        return new Promise((resolve) => {
            if (this.closed) {
                resolve();
                return;
            }
            let payload = `event: ${eventType}\n`;
            for (const line of data.split("\n")) payload += `data: ${line}\n`;
            payload += "\n";
            this.res.write(payload, (error) => {
                if (error) this.close();
                resolve();
            });
        });
    }

    /** upstream: `close()` — idempotent. */
    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.queue.length = 0;
        this.onCloseCallback?.();
        try {
            this.res.end();
        } catch {
            // already tearing down
        }
    }
}

/**
 * upstream: `SseConnectionManager` — tracks active connections and provides broadcast
 * delivery, plus the has-connections transition `MapRequestHandler` uses to only poll a
 * live-data supplier while somebody is actually listening.
 */
export class SseConnectionManager {
    private readonly connections = new Set<SseConnection>();
    private readonly hasConnectionsListeners = new Set<(hasConnections: boolean) => void>();
    private closed = false;

    addHasConnectionsListener(listener: (hasConnections: boolean) => void): void {
        this.hasConnectionsListeners.add(listener);
    }

    removeHasConnectionsListener(listener: (hasConnections: boolean) => void): void {
        this.hasConnectionsListeners.delete(listener);
    }

    /**
     * upstream: `openConnection()` plus the `live/sse` route handler in `MapRequestHandler`
     * — writes the SSE response headers (including upstream's `X-Accel-Buffering: no`, an
     * attempt to turn off buffering in an upstream reverse proxy) and registers the
     * connection.
     */
    open(req: http.IncomingMessage, res: http.ServerResponse): void {
        res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            "x-accel-buffering": "no",
        });
        // Node buffers headers until the first `write`/`end`; nothing here guarantees a
        // broadcast arrives promptly (a second, third, ... connection joins a manager that
        // is already past its empty->non-empty transition, so no "someone connected" hook
        // fires for it). Upstream has no equivalent step because its transport sends the
        // response headers the moment `MapRequestHandler` hands back an `HttpResponse`,
        // independent of whether the attached body stream has produced a byte yet. This is
        // that same guarantee, made explicit for a runtime that does not give it for free.
        res.flushHeaders();

        const connection = new SseConnection(res);
        this.add(connection);
        req.on("close", () => connection.close());
    }

    /** upstream: `add(SseConnection)` */
    private add(connection: SseConnection): void {
        const wasEmpty = this.connections.size === 0;
        this.connections.add(connection);

        if (!connection.setOnClose(() => this.remove(connection))) {
            // already closed by the time we got here
            this.connections.delete(connection);
            return;
        }

        if (wasEmpty) this.notifyHasConnections(true);
    }

    /** upstream: `remove(SseConnection)` */
    private remove(connection: SseConnection): void {
        const removed = this.connections.delete(connection);
        if (removed && this.connections.size === 0) this.notifyHasConnections(false);
    }

    /** upstream: `broadcast(String, String)` — never blocks. */
    broadcast(eventType: string, data: string): void {
        if (this.closed) return;
        for (const connection of this.connections) connection.enqueue(eventType, data);
    }

    hasConnections(): boolean {
        return this.connections.size > 0;
    }

    connectionCount(): number {
        return this.connections.size;
    }

    /** upstream: `close()` — each connection removes itself from the registry as it closes. */
    close(): void {
        this.closed = true;
        for (const connection of [...this.connections]) connection.close();
    }

    private notifyHasConnections(hasConnections: boolean): void {
        for (const listener of this.hasConnectionsListeners) listener(hasConnections);
    }
}
