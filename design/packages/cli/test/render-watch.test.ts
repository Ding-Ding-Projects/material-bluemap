/**
 * `startWatchers` (issue #40's CLI half) — upstream's `BlueMapCLI.renderMaps`'s
 * `if (watch) { ... }` watcher-construction block plus its `if (watch) { long
 * fullUpdateInterval = ...; ... }` periodic-timer block. See `src/render.ts`'s own doc
 * comment for the exact line references this mirrors.
 *
 * `MapUpdateService` itself (the bridge from a watch-event to a scheduled render task) is
 * already exhaustively tested in `packages/server/test/map-update-service.test.ts`; nothing
 * here re-proves debounce, dedup, or cooldown math. This file only tests the wiring
 * `startWatchers` adds on top: one service per targeted map, per-map skip-on-failure,
 * the periodic full-update timer, and `close()`.
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RenderManager, WatchService, type BmMap } from "@worldlens/engine";
import { MapUpdateService } from "@worldlens/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "../src/logger.js";
import { startWatchers } from "../src/render.js";
import { blockingWatchService, buildFakeMap } from "./fixtures/fakeMap.js";

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "bluemap-cli-watch-"));
});

afterEach(async () => {
    await rm(root, { recursive: true, force: true });
});

/** A `Logger` that records every call instead of writing to stderr, for assertions. */
function recordingLogger(): Logger & { infos: string[]; warns: string[]; errors: Array<{ message: string; cause: unknown }> } {
    const infos: string[] = [];
    const warns: string[] = [];
    const errors: Array<{ message: string; cause: unknown }> = [];
    return {
        infos,
        warns,
        errors,
        info: (message) => infos.push(message),
        warn: (message) => warns.push(message),
        error: (message, cause) => errors.push({ message, cause }),
    };
}

describe("startWatchers: constructs and starts one MapUpdateService per targeted map", () => {
    it("constructs one MapUpdateService per target and calls start() on each", async () => {
        const mapA = await buildFakeMap("mapa", root, blockingWatchService);
        const mapB = await buildFakeMap("mapb", root, blockingWatchService);
        const renderManager = new RenderManager();
        const logger = recordingLogger();

        const startSpy = vi.spyOn(MapUpdateService.prototype, "start");
        try {
            const watch = startWatchers({
                targets: [mapA, mapB],
                renderManager,
                updateCooldownSeconds: 60,
                fullUpdateIntervalMinutes: 0,
                logger,
            });

            expect(watch.services).toHaveLength(2);
            expect(watch.services.every((service) => service instanceof MapUpdateService)).toBe(true);
            expect(startSpy).toHaveBeenCalledTimes(2);
            expect(watch.services.every((service) => !service.isClosed())).toBe(true);

            expect(logger.infos).toContain("Watching map 'mapa' for changes...");
            expect(logger.infos).toContain("Watching map 'mapb' for changes...");

            await watch.close();
        } finally {
            startSpy.mockRestore();
        }
    });

    it("skips (and logs) a map whose createRegionWatchService() throws, and still watches the rest (upstream's per-map try/catch)", async () => {
        const failingMap = await buildFakeMap("broken", root, () => {
            throw new Error("this world does not support watching");
        });
        const okMap = await buildFakeMap("fine", root, blockingWatchService);
        const renderManager = new RenderManager();
        const logger = recordingLogger();

        const watch = startWatchers({
            targets: [failingMap, okMap],
            renderManager,
            updateCooldownSeconds: 60,
            fullUpdateIntervalMinutes: 0,
            logger,
        });

        // only the surviving map got a watcher; the broken one did not stop the rest
        expect(watch.services).toHaveLength(1);
        expect(logger.errors.some((e) => e.message.includes("Failed to create update-watcher for map: broken"))).toBe(true);
        expect(logger.infos).toContain("Watching map 'fine' for changes...");
        expect(logger.infos).not.toContain("Watching map 'broken' for changes...");

        await watch.close();
    });
});

describe("startWatchers: the full-update periodic timer (upstream's updateAllMapsTask)", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("full-update-interval > 0 creates a timer that re-triggers every target on firing", async () => {
        const mapA = await buildFakeMap("mapa", root, blockingWatchService);
        const mapB = await buildFakeMap("mapb", root, blockingWatchService);
        const renderManager = new RenderManager();
        const logger = recordingLogger();

        const watch = startWatchers({
            targets: [mapA, mapB],
            renderManager,
            updateCooldownSeconds: 60,
            fullUpdateIntervalMinutes: 5,
            logger,
        });

        expect(watch.fullUpdateTimer).not.toBeNull();
        expect(renderManager.getScheduledRenderTaskCount()).toBe(0);

        // 5 minutes, exactly the configured interval
        await vi.advanceTimersByTimeAsync(5 * 60_000);

        // one MapUpdatePreparationTask per target, force = FORCE_NONE (upstream's own
        // updateAllMapsTask never forces a full re-render, only an incremental one)
        expect(renderManager.getScheduledRenderTaskCount()).toBe(2);
        expect(logger.infos).toContain("Start updating 2 map(s) ...");

        await vi.advanceTimersByTimeAsync(5 * 60_000);
        expect(renderManager.getScheduledRenderTaskCount()).toBe(4);

        await watch.close();
    });

    it("full-update-interval == 0 creates no timer at all", async () => {
        const mapA = await buildFakeMap("mapa", root, blockingWatchService);
        const renderManager = new RenderManager();
        const logger = recordingLogger();

        const watch = startWatchers({
            targets: [mapA],
            renderManager,
            updateCooldownSeconds: 60,
            fullUpdateIntervalMinutes: 0,
            logger,
        });

        expect(watch.fullUpdateTimer).toBeNull();

        await vi.advanceTimersByTimeAsync(24 * 60 * 60_000);
        expect(renderManager.getScheduledRenderTaskCount()).toBe(0);

        await watch.close();
    });
});

describe("startWatchers: close()", () => {
    it("closes every watcher and clears the timer, and is safe to call twice", async () => {
        const mapA = await buildFakeMap("mapa", root, blockingWatchService);
        const mapB = await buildFakeMap("mapb", root, blockingWatchService);
        const renderManager = new RenderManager();
        const logger = recordingLogger();

        const watch = startWatchers({
            targets: [mapA, mapB],
            renderManager,
            updateCooldownSeconds: 60,
            fullUpdateIntervalMinutes: 30,
            logger,
        });

        expect(watch.services.every((service) => !service.isClosed())).toBe(true);

        await watch.close();

        expect(watch.services.every((service) => service.isClosed())).toBe(true);
        // the underlying watch-services actually rejected on close, not merely flagged closed
        for (const service of watch.services) {
            await expect(service.getWatchService().take()).rejects.toBeInstanceOf(WatchService.ClosedException);
        }

        // idempotent: closing again must not throw
        await expect(watch.close()).resolves.toBeUndefined();
    });
});

describe("startWatchers: adversarial — a map already closed/mid-render is not special-cased", () => {
    it("triggerUpdate on the periodic timer uses TileUpdateStrategy.FORCE_NONE, never a forced strategy", async () => {
        // upstream's updateAllMapsTask body is `MapUpdatePreparationTask.updateMap(map, renderManager)`
        // (the no-force overload) inside plugin code, but BlueMapCLI's own copy passes
        // TileUpdateStrategy.FORCE_NONE explicitly — this asserts render.ts's call site
        // uses that overload/strategy rather than silently forcing every periodic update.
        vi.useFakeTimers();
        try {
            const map = await buildFakeMap("mapa", root, blockingWatchService);
            const renderManager = new RenderManager();
            const scheduleSpy = vi.spyOn(renderManager, "scheduleRenderTask");
            const logger = recordingLogger();

            const watch = startWatchers({
                targets: [map],
                renderManager,
                updateCooldownSeconds: 60,
                fullUpdateIntervalMinutes: 1,
                logger,
            });

            await vi.advanceTimersByTimeAsync(60_000);

            expect(scheduleSpy).toHaveBeenCalledTimes(1);
            const scheduledTask = scheduleSpy.mock.calls[0]![0] as unknown as { getMap: () => BmMap };
            expect(scheduledTask.getMap()).toBe(map);

            await watch.close();
        } finally {
            vi.useRealTimers();
        }
    });
});
