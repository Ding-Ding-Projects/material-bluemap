/**
 * upstream: `common/src/main/java/de/bluecolored/bluemap/common/plugin/MapUpdateService.java`
 *
 * The missing middle between "a region-file changed" and "a region got re-rendered"
 * (issue #40): a per-map bridge that reads batches of changed region-positions off a
 * {@link WatchService} and, once each region has been quiet for a short window, schedules a
 * real {@link WorldRegionUpdateTask} on a real `RenderManager` — reusing the exact same
 * task/scheduling layer `packages/server/src/render/RenderDriver.ts` (issue #29) already
 * drives from an HTTP trigger. Nothing here re-implements region discovery, debounce math or
 * dedup: the debounce window and its floor are upstream's own `updateRegion(Vector2i)`
 * arithmetic, and the dedup is `RenderManager.scheduleRenderTask`'s own queue-containment
 * check (`WorldRegionUpdateTask#equals`, by map id + region + the `TileUpdateStrategy
 * .FORCE_NONE` singleton — see that class's own doc comment on why the singleton is
 * load-bearing).
 *
 * ## What upstream's class actually does, read from the Java line by line
 *
 * - **Debounce, not throttle.** `updateRegion` is called once per *item* out of
 *   `watchService.take()`'s batch, and every call for a given region **cancels and
 *   replaces** whatever `TimerTask` is already pending for that region
 *   (`scheduledUpdates.remove` + `TimerTask#cancel`). A burst of file events for one region
 *   therefore collapses onto the delay computed by the *last* event in the burst, not the
 *   first — a trailing-edge debounce, matching the issue's "bursts of events for one region
 *   become one task, not many".
 * - **The delay has a floor, and a cooldown-driven stretch, from one formula.**
 *   `delay = max(regionUpdateCooldown.toMillis() - timeSinceLastUpdate, 5000)`. The `5000`
 *   is upstream's bare literal (never named) and is always the minimum wait after the *last*
 *   event in a burst; on top of that, if the region was actually scheduled more recently than
 *   `regionUpdateCooldown` ago, the wait is stretched so two real schedules of the same
 *   region are always at least `regionUpdateCooldown` apart.
 * - **`lastUpdateTimes` is a Caffeine cache with `expireAfterWrite(regionUpdateCooldown)`**,
 *   read once per `updateRegion` call via `getIfPresent`. This port has no Caffeine
 *   dependency (the codebase's own cache usage is `lru-cache`, which is size- not
 *   time-evicting), so the *external contract* this call site actually depends on — a write
 *   reads as absent once `regionUpdateCooldown` has elapsed — is reproduced with a plain
 *   `Map` that checks and opportunistically deletes on read (see
 *   {@link MapUpdateService.readLastUpdateTime}). Caffeine's own internal eviction scheduling
 *   is not in this vendor tree to verify against, so nothing here claims to reproduce it.
 * - **The stop path cancels the whole `Timer`, not each `TimerTask` individually**
 *   (`delayTimer.cancel()`), which is why {@link MapUpdateService.close} clears every pending
 *   `setTimeout` in one pass over `#scheduledUpdates` rather than tracking a single
 *   upstream-style timer handle — `setTimeout`/`clearTimeout` has no batch-cancel the way
 *   `java.util.Timer` does.
 * - **`run()`'s loop only stops on `ClosedException`** (`WatchService.ClosedException` in
 *   this port) or an unexpected failure — both log and exit the loop; `close()` triggers the
 *   former by closing the watch-service, which is what a blocked `take()` is waiting on.
 *   This port's `MCAWorldRegionWatchService` already swallows and logs fs-layer errors
 *   internally and keeps watching (see that class's own doc comment) rather than rejecting
 *   `take()` with them the way Java's `IOException` path does — so the only rejection this
 *   loop actually has to plan for is `ClosedException`; anything else is treated the same
 *   defensive way upstream treats its `IOException` catch, to satisfy "never an unhandled
 *   rejection" rather than because the Java source shows a second live path.
 *
 * ## Deliberate departures from a line-for-line port
 *
 * - **No `Thread`.** {@link MapUpdateService.start} fires an internal async loop without
 *   awaiting it — the same "not awaited, matches `Thread.start()`" pattern
 *   `RenderManager.start()` already uses for its workers — instead of extending a Thread.
 * - **`close()` is `async`.** Upstream's `close()` is synchronous because `Thread.interrupt()`
 *   and `WatchService.close()` (the java.nio one) are; this port's `WatchService.close()`
 *   returns a `Promise<void>`, so this one does too, and additionally awaits the run-loop's
 *   own exit so "stopped" is a fact by the time `close()` resolves rather than something that
 *   happens shortly after — the concrete lifecycle guarantee issue #40 asks for ("turning it
 *   off actually stops the watcher"), made checkable instead of eventual.
 * - **The hard-coded `5000` and the `regionUpdateCooldown` default are constructor options**
 *   (`minUpdateDelayMs`, `regionUpdateCooldownMs`), the same way `RenderManagerOptions`
 *   exposes upstream's other hard-coded intervals — so a test proving a burst collapses to
 *   one task does not have to sit through 5+ real seconds to say so. Production callers get
 *   upstream's literals as defaults: `5000`, and `60_000` for the cooldown (`core.conf`'s
 *   `update-cooldown: 60` / `CoreConfig.java`'s `private int updateCooldown = 60`, both read
 *   directly rather than adding a `packages/config` dependency for one literal).
 * - **`verbose` becomes two log callbacks** (`onInfo`/`onDebug`), matching the
 *   callback-injection shape `RenderManagerOptions` already uses for `onError`/`onInfo`, so a
 *   test can assert on what was logged instead of only on side effects.
 */

import type { BmMap, RenderManager } from "@material-bluemap/engine";
import { WatchService, WorldRegionUpdateTask } from "@material-bluemap/engine";
import type { Vector2i } from "@material-bluemap/shared";

/** upstream: the bare `5000` literal in `updateRegion(Vector2i)`. */
const DEFAULT_MIN_UPDATE_DELAY_MS = 5_000;

/** upstream: `CoreConfig.updateCooldown = 60` / `core.conf`'s `update-cooldown: 60`, in ms. */
const DEFAULT_REGION_UPDATE_COOLDOWN_MS = 60_000;

function logInfo(message: string): void {
    console.info(message);
}

function logDebug(message: string): void {
    console.debug(message);
}

function logWarn(message: string): void {
    console.warn(message);
}

function logError(message: string, error: unknown): void {
    console.error(message, error);
}

/** upstream: `pos.getX() + "," + pos.getY()`-shaped keys, matching MCAWorldRegionWatchService's own. */
function regionKey(pos: Vector2i): string {
    return pos.getX() + "," + pos.getY();
}

export interface MapUpdateServiceOptions {
    /** upstream: the `Duration regionUpdateCooldown` constructor parameter, in milliseconds. */
    regionUpdateCooldownMs?: number;
    /** upstream: the bare `5000` floor in `updateRegion` — exposed so tests need not wait for it. */
    minUpdateDelayMs?: number;
    /** upstream: `verbose ? Logger.global::logInfo : ...` when `verbose` is true. */
    onInfo?: (message: string) => void;
    /** upstream: `verbose ? ... : Logger.global::logDebug` when `verbose` is false (the default). */
    onDebug?: (message: string) => void;
    /** upstream: `Logger.global.logWarning` — the "stopped unexpectedly" notice. */
    onWarn?: (message: string) => void;
    /** upstream: `Logger.global.logError` */
    onError?: (message: string, error: unknown) => void;
    /** upstream: the `verbose` constructor flag, gating which of onInfo/onDebug is used. */
    verbose?: boolean;
}

/**
 * upstream: `MapUpdateService extends Thread`. See the module doc comment above for the
 * detailed line-by-line mapping and every deliberate departure.
 */
export class MapUpdateService {
    private readonly renderManager: RenderManager;
    private readonly map: BmMap;
    private readonly watchService: WatchService<Vector2i>;

    private readonly regionUpdateCooldownMs: number;
    private readonly minUpdateDelayMs: number;
    private readonly verboseLog: (message: string) => void;
    private readonly onWarn: (message: string) => void;
    private readonly onError: (message: string, error: unknown) => void;

    /** upstream: `Map<Vector2i, TimerTask> scheduledUpdates` */
    private readonly scheduledUpdates = new Map<string, ReturnType<typeof setTimeout>>();
    /** upstream: the Caffeine `Cache<Vector2i, Long> lastUpdateTimes` — see the class doc comment */
    private readonly lastUpdateTimes = new Map<string, number>();

    private started = false;
    private closed = false;
    private runLoopPromise: Promise<void> | null = null;

    constructor(renderManager: RenderManager, map: BmMap, options: MapUpdateServiceOptions = {}) {
        this.renderManager = renderManager;
        this.map = map;
        this.regionUpdateCooldownMs = options.regionUpdateCooldownMs ?? DEFAULT_REGION_UPDATE_COOLDOWN_MS;
        this.minUpdateDelayMs = options.minUpdateDelayMs ?? DEFAULT_MIN_UPDATE_DELAY_MS;
        this.onWarn = options.onWarn ?? logWarn;
        this.onError = options.onError ?? logError;
        this.verboseLog = options.verbose === true ? (options.onInfo ?? logInfo) : (options.onDebug ?? logDebug);

        // upstream: `this.watchService = map.getWorld().createRegionWatchService();`
        this.watchService = map.getWorld().createRegionWatchService();
    }

    /** Exposed for tests/introspection only — mirrors `RenderDriver.getRenderManager()`. */
    getWatchService(): WatchService<Vector2i> {
        return this.watchService;
    }

    isClosed(): boolean {
        return this.closed;
    }

    /**
     * upstream: `Thread#start()` (this class extends `Thread`; `run()` is its body). Fires
     * the watch loop without awaiting it — see the class doc comment on why there is no
     * `Thread` here.
     */
    start(): void {
        if (this.closed) throw new Error("MapUpdateService has already been closed!");
        if (this.started) throw new Error("MapUpdateService is already running!");
        this.started = true;
        this.runLoopPromise = this.runLoop();
    }

    /** upstream: `run()` */
    private async runLoop(): Promise<void> {
        this.verboseLog(`Started watching map '${this.map.getId()}' for updates...`);

        try {
            while (!this.closed) {
                let events: Vector2i[];
                try {
                    events = await this.watchService.take();
                } catch (error) {
                    if (error instanceof WatchService.ClosedException) break;
                    // upstream's `catch (IOException e)` path — see the class doc comment on
                    // why this port's watch-service is not expected to reject with anything
                    // else, and why the loop still treats it defensively rather than trusting
                    // that.
                    this.onError(`Exception trying to watch map '${this.map.getId()}' for updates.`, error);
                    break;
                }

                for (const regionPos of events) this.updateRegion(regionPos);
            }
        } finally {
            this.verboseLog(`Stopped watching map '${this.map.getId()}' for updates.`);
            if (!this.closed) {
                this.onWarn(
                    `Region-file watch-service for map '${this.map.getId()}' stopped unexpectedly! ` +
                        `(This map might not update automatically from now on)`,
                );
            }
        }
    }

    /**
     * upstream: `synchronized void updateRegion(Vector2i)`. No `synchronized` counterpart is
     * needed here: this method never awaits, so nothing can interleave inside it.
     */
    private updateRegion(regionPos: Vector2i): void {
        if (this.closed) return;

        try {
            const key = regionKey(regionPos);

            // upstream: cancel and remove any TimerTask already pending for this region
            const existing = this.scheduledUpdates.get(key);
            if (existing !== undefined) {
                clearTimeout(existing);
                this.scheduledUpdates.delete(key);
            }

            const now = Date.now();
            const lastUpdateTime = this.readLastUpdateTime(key, now);
            const timeSinceLastUpdate = now - lastUpdateTime;
            const delay = Math.max(this.regionUpdateCooldownMs - timeSinceLastUpdate, this.minUpdateDelayMs);

            const timer = setTimeout(() => this.fireScheduledUpdate(key, regionPos), delay);
            if (typeof timer === "object" && typeof timer.unref === "function") timer.unref();
            this.scheduledUpdates.set(key, timer);
        } catch (error) {
            // Never let one bad event take the whole watch loop down with it.
            this.onError(
                `Exception scheduling update for region ${regionPos.toString()} (map '${this.map.getId()}')`,
                error,
            );
        }
    }

    /** upstream: the `TimerTask#run()` body built inside `updateRegion`. */
    private fireScheduledUpdate(key: string, regionPos: Vector2i): void {
        this.scheduledUpdates.delete(key);
        if (this.closed) return;

        try {
            // upstream: `new WorldRegionUpdateTask(map, regionPos)` — force defaults to
            // TileUpdateStrategy.FORCE_NONE, the shared singleton `WorldRegionUpdateTask
            // #equals` and `RenderManager.scheduleRenderTask`'s containment check rely on for
            // dedup: repeated fires for the same map+region construct equal-by-value tasks,
            // so a region already queued (anywhere but the head) is refused rather than
            // double-queued.
            const task = new WorldRegionUpdateTask(this.map, regionPos);
            this.renderManager.scheduleRenderTask(task);
            this.lastUpdateTimes.set(key, Date.now());

            this.verboseLog(`Scheduled update for region-file: ${regionPos.toString()} (Map: ${this.map.getId()})`);
        } catch (error) {
            this.onError(
                `Exception scheduling render task for region ${regionPos.toString()} (map '${this.map.getId()}')`,
                error,
            );
        }
    }

    /**
     * upstream: `lastUpdateTimes.getIfPresent(regionPos)`, defaulted to `0L`. See the class
     * doc comment for why this is a plain map with expiry-on-read rather than a Caffeine
     * cache.
     */
    private readLastUpdateTime(key: string, now: number): number {
        const stored = this.lastUpdateTimes.get(key);
        if (stored === undefined) return 0;
        if (now - stored >= this.regionUpdateCooldownMs) {
            this.lastUpdateTimes.delete(key);
            return 0;
        }
        return stored;
    }

    /**
     * upstream: `synchronized void close()`. Async because this port's `WatchService.close()`
     * is — see the class doc comment for why this additionally awaits the run-loop's own
     * exit.
     */
    async close(): Promise<void> {
        if (this.closed) return;
        this.closed = true;

        for (const timer of this.scheduledUpdates.values()) clearTimeout(timer);
        this.scheduledUpdates.clear();

        try {
            await this.watchService.close();
        } catch (error) {
            this.onError("Exception while trying to close WatchService!", error);
        }

        if (this.runLoopPromise !== null) await this.runLoopPromise;
    }
}
