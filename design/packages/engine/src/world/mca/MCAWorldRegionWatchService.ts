import { existsSync } from "node:fs";
import { basename } from "node:path";
import { watch, type FSWatcher } from "chokidar";
import type { Vector2i } from "@material-bluemap/shared";
import { WatchService } from "../../util/WatchService.js";
import { logDebug } from "./MCAUtil.js";
import { RegionType } from "./region/RegionType.js";

interface Waiter {
    resolve: (events: Vector2i[] | null) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout | null;
}

interface ReadyWaiter {
    resolve: () => void;
    reject: (error: Error) => void;
}

/** upstream: FileHelper.awaitExistence's re-check granularity (it watches the parent-folder; the port polls) */
const EXISTENCE_CHECK_INTERVAL_MS = 1000;

/**
 * Watches a region-folder for changed region-files and provides the changed
 * region-positions in batches.
 *
 * upstream: implemented on java.nio's WatchService; this port uses chokidar. Differences
 * that follow from that:
 * <ul>
 * <li>Like upstream ({@code ensureInitialization} / {@code FileHelper.awaitExistence}),
 * the directory-watch is only registered once the region-folder exists — until then its
 * existence is re-checked every second (upstream watches the parent-folder instead of
 * polling; chokidar's own handling of not-yet-existing paths is unreliable). Upstream
 * runs that check inside the blocking poll/take calls; the port re-checks on a timer so
 * the promise-based poll/take can resolve as soon as events arrive.</li>
 * <li>Upstream consumes events in batches per WatchKey, where repeated events on the
 * same file are coalesced (the event's count is incremented instead). The port queues
 * incoming events and coalesces repeats per region-position while they are pending; a
 * poll/take drains the whole queue as one batch.</li>
 * </ul>
 */
export class MCAWorldRegionWatchService implements WatchService<Vector2i> {
    private readonly regionFolder: string;
    private watcher: FSWatcher | null = null;
    private existenceTimer: NodeJS.Timeout | null = null;

    /** pending region-positions, coalesced by position while not yet consumed */
    private readonly pending = new Map<string, Vector2i>();
    private readonly waiters: Waiter[] = [];
    private readonly readyWaiters: ReadyWaiter[] = [];
    private initialized = false;
    private closed = false;

    constructor(regionFolder: string) {
        this.regionFolder = regionFolder;
        this.ensureInitialization();
    }

    poll(): Vector2i[] | null;
    poll(timeoutMs: number): Promise<Vector2i[] | null>;
    poll(timeoutMs?: number): Vector2i[] | null | Promise<Vector2i[] | null> {
        if (timeoutMs === undefined) {
            if (this.closed) throw new WatchService.ClosedException();
            return this.drain();
        }

        if (this.closed) return Promise.reject(new WatchService.ClosedException());

        const immediate = this.drain();
        if (immediate !== null) return Promise.resolve(immediate);

        return new Promise((resolve, reject) => {
            const waiter: Waiter = {
                resolve,
                reject,
                timer: setTimeout(() => {
                    const index = this.waiters.indexOf(waiter);
                    if (index >= 0) this.waiters.splice(index, 1);
                    resolve(null);
                }, timeoutMs),
            };
            this.waiters.push(waiter);
        });
    }

    take(): Promise<Vector2i[]> {
        if (this.closed) return Promise.reject(new WatchService.ClosedException());

        const immediate = this.drain();
        if (immediate !== null) return Promise.resolve(immediate);

        return new Promise((resolve, reject) => {
            this.waiters.push({
                resolve: (events) => resolve(events ?? []),
                reject,
                timer: null,
            });
        });
    }

    /**
     * Resolves once chokidar has completed its initial scan and subsequent changes can no
     * longer be swallowed by `ignoreInitial`. Upstream registers its java.nio watcher
     * synchronously; the port needs this explicit seam because chokidar becomes ready
     * asynchronously.
     */
    whenReady(): Promise<void> {
        if (this.closed) return Promise.reject(new WatchService.ClosedException());
        if (this.initialized) return Promise.resolve();

        return new Promise((resolve, reject) => {
            this.readyWaiters.push({ resolve, reject });
        });
    }

    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;

        if (this.existenceTimer !== null) {
            clearInterval(this.existenceTimer);
            this.existenceTimer = null;
        }

        // upstream: waiting poll/take calls get a ClosedWatchServiceException,
        // re-thrown as WatchService.ClosedException
        for (const waiter of this.waiters.splice(0)) {
            if (waiter.timer !== null) clearTimeout(waiter.timer);
            waiter.reject(new WatchService.ClosedException());
        }
        for (const waiter of this.readyWaiters.splice(0)) waiter.reject(new WatchService.ClosedException());
        this.pending.clear();

        await this.watcher?.close();
    }

    /** upstream: ensureInitialization — registers the watch once the region-folder exists */
    private ensureInitialization(): void {
        if (this.closed || this.watcher !== null) return;

        if (!existsSync(this.regionFolder)) {
            this.existenceTimer ??= setInterval(() => {
                if (this.closed || !existsSync(this.regionFolder)) return;
                if (this.existenceTimer !== null) {
                    clearInterval(this.existenceTimer);
                    this.existenceTimer = null;
                }
                this.ensureInitialization();
            }, EXISTENCE_CHECK_INTERVAL_MS);
            return;
        }

        this.watcher = watch(this.regionFolder, {
            // like upstream's watch-registration, only changes *after* the watch started
            // are reported — chokidar's initial scan is suppressed
            ignoreInitial: true,
            depth: 0,
        });

        this.watcher.on("all", (event, path) => this.handleEvent(event, path));
        this.watcher.once("ready", () => {
            if (this.closed) return;
            this.initialized = true;
            for (const waiter of this.readyWaiters.splice(0)) waiter.resolve();
        });

        // upstream surfaces watcher-failures as IOExceptions from poll/take; chokidar
        // reports them asynchronously — they are logged and the service keeps watching
        this.watcher.on("error", (error) => {
            logDebug(
                `Unexpected exception in region-watchservice ('${this.regionFolder}'): ${String(error)}`,
            );
        });
    }

    private handleEvent(event: string, path: string): void {
        if (this.closed) return;

        // ENTRY_CREATE / ENTRY_MODIFY / ENTRY_DELETE
        if (event !== "add" && event !== "change" && event !== "unlink") return;

        const pos = RegionType.regionForFileName(basename(path));
        if (pos === null) return;

        this.pending.set(pos.getX() + "," + pos.getY(), pos);
        this.deliver();
    }

    /** hands the pending batch to the longest-waiting poll/take call, if any */
    private deliver(): void {
        if (this.pending.size === 0) return;

        const waiter = this.waiters.shift();
        if (waiter === undefined) return;

        if (waiter.timer !== null) clearTimeout(waiter.timer);
        waiter.resolve(this.drain());
    }

    private drain(): Vector2i[] | null {
        if (this.pending.size === 0) return null;

        const events = [...this.pending.values()];
        this.pending.clear();
        return events;
    }
}
