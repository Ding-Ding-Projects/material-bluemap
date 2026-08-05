/**
 * upstream: `common/.../web/LiveDataSupplierBroadcaster.java`
 *
 * Polls a supplier and notifies listeners whenever the returned value changes. Upstream
 * schedules the polling on `BlueMap.SCHEDULER`/`THREAD_POOL`, started the first time
 * something adds an update-listener and stopped the moment the last one is removed — so an
 * endpoint with nobody subscribed to its Server-Sent Events never pays for a poll loop.
 * This port keeps exactly that lifecycle with a single `setInterval` in place of the
 * scheduled task.
 *
 * `get()` — used by the plain (non-SSE) `live/players.json` / `live/markers.json` GET —
 * still refreshes synchronously, rate-limited by the same poll interval, so a request never
 * has to wait on the interval to see a value at least as fresh as upstream would serve.
 */
export class LiveDataBroadcaster {
    private readonly listeners = new Set<(data: string) => void>();
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private closed = false;
    private lastUpdate = -1;
    private data: string | null = null;

    constructor(
        private readonly supplier: () => string,
        private readonly pollIntervalMs: number,
    ) {}

    /** upstream: `addUpdateListener(Consumer<T>)` — (re)starts polling on the first listener. */
    addUpdateListener(listener: (data: string) => void): void {
        this.listeners.add(listener);

        if (!this.closed && this.pollTimer === null) {
            this.update();
            const timer = setInterval(() => {
                this.update();
            }, this.pollIntervalMs);
            if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
            this.pollTimer = timer;
        }
    }

    /** upstream: `removeUpdateListener(Consumer<T>)` — stops polling once nobody is listening. */
    removeUpdateListener(listener: (data: string) => void): void {
        this.listeners.delete(listener);
        if (this.listeners.size === 0 && this.pollTimer !== null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /** upstream: `get()` — ensures the data is up to date (rate-limited) and returns it. */
    get(): string {
        this.update();
        return this.data ?? "";
    }

    /** upstream: `update()` */
    private update(): void {
        const now = Date.now();
        if (this.data !== null && now < this.lastUpdate + this.pollIntervalMs) return;
        this.lastUpdate = now;

        const newData = this.supplier();
        if (newData === this.data) return;

        this.data = newData;
        for (const listener of this.listeners) listener(newData);
    }

    /** upstream: `close()` — stops the background polling. */
    close(): void {
        this.closed = true;
        if (this.pollTimer !== null) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
}
