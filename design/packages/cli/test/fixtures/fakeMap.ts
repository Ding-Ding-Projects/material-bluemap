/**
 * Test-support only — not part of the upstream port.
 *
 * A minimal `BmMap` builder for `render-watch.test.ts`, structurally identical to
 * `packages/server/test/map-update-service.test.ts`'s own `fakeWorldOverRegionFolder` /
 * `settings()` helpers (issue #40's own fixture shape) — duplicated here rather than
 * imported across a package boundary because `packages/server/test` is not part of that
 * package's published surface. `startWatchers` never runs `WorldRegionUpdateTask.doWork()`
 * (nothing here calls `RenderManager.start()`), so `getRegion`/`getChunk` are never
 * exercised for real; they exist only to satisfy `World`'s type.
 */

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
    BmMap,
    Compression,
    DimensionType,
    FileMapStorage,
    MapSettings,
    type Mask,
    PackVersion,
    ResourcePack,
    Tristate,
    WatchService,
} from "@material-bluemap/engine";
import { Grid, Vector2i } from "@material-bluemap/shared";
import type { World } from "@material-bluemap/engine";

const ALWAYS: Mask = {
    test: (...args: number[]) => (args.length === 3 ? true : Tristate.TRUE),
    isEdge: () => false,
    submask: () => ALWAYS,
    inverted: () => ALWAYS,
} as unknown as Mask;

/** Mirrors `map-update-service.test.ts`'s own `settings()` — only the shape matters here. */
export function fakeMapSettings(): MapSettings {
    const base: MapSettings = {
        getSorting: () => 0,
        getStartPos: () => new Vector2i(0, 0),
        getSkyColor: () => "#7dabff",
        getVoidColor: () => "#000000",
        getMinInhabitedTime: () => 0,
        getMinInhabitedTimeRadius: () => 0,
        getHiresTileSize: () => 32,
        getLowresTileSize: () => 500,
        getLodCount: () => 3,
        getLodFactor: () => 5,
        getAmbientLight: () => 0,
        getSkyLight: () => 1,
        isEnablePerspectiveView: () => true,
        isEnableFlatView: () => true,
        isEnableFreeFlightView: () => true,
        isEnableHires: () => true,
        isCheckForRemovedRegions: () => false,
        getRemoveCavesBelowY: () => 55,
        getCaveDetectionOceanFloor: () => -5,
        isCaveDetectionUsesBlockLight: () => false,
        isRenderEdges: () => true,
        getEdgeLightStrength: () => 8,
        isIgnoreMissingLightData: () => true,
        getRenderMask: () => ALWAYS,
        isSaveHiresLayer: () => MapSettings.isSaveHiresLayer(base),
        isRenderTopOnly: () => MapSettings.isRenderTopOnly(base),
    };
    return base;
}

class FakeChunk {
    isGenerated(): boolean {
        return true;
    }
    hasLightData(): boolean {
        return true;
    }
}

/** A `World` whose `createRegionWatchService()` returns whatever the caller wants. */
export function fakeWorld(id: string, createRegionWatchService: () => WatchService<Vector2i>): World {
    const regionGrid = new Grid(64);
    const chunkGrid = new Grid(16);

    return {
        getId: () => id,
        getDimensionType: () => DimensionType.OVERWORLD,
        getRegionGrid: () => regionGrid,
        getChunkGrid: () => chunkGrid,
        listRegions: () => [],
        getRegion: () => {
            throw new Error("not needed: this fixture never runs WorldRegionUpdateTask.doWork()/run()");
        },
        getChunk: () => new FakeChunk(),
        getChunkAtBlock: () => new FakeChunk(),
        iterateEntities: async () => {},
        preloadChunks: async () => {},
        preloadRegionChunks: async () => {},
        invalidateChunkCache: () => {},
        createRegionWatchService,
    } as unknown as World;
}

/** Builds a real `BmMap` (real storage, real settings) over a fake `World`. */
export async function buildFakeMap(
    id: string,
    storageRoot: string,
    createRegionWatchService: () => WatchService<Vector2i>,
): Promise<BmMap> {
    mkdirSync(storageRoot, { recursive: true });
    const storage = new FileMapStorage(join(storageRoot, `map-storage-${id}`), Compression.GZIP, false);
    return BmMap.create(id, id, fakeWorld(id, createRegionWatchService), storage, new ResourcePack(new PackVersion(34, 0)), fakeMapSettings());
}

/**
 * A `WatchService` whose `take()` never resolves on its own — a realistic "watching,
 * nothing has happened yet" state — until `close()` rejects the pending call with
 * `WatchService.ClosedException`, exactly the signal `MapUpdateService`'s own run-loop
 * treats as "stop, this was a deliberate close" (see that class's own doc comment).
 *
 * Idempotent, like every real `WatchService` in this repo: once closed, it STAYS closed —
 * a `take()` called after `close()` (rather than one already pending when it was called)
 * rejects immediately too, instead of returning a promise nothing will ever settle.
 */
export function blockingWatchService(): WatchService<Vector2i> {
    let rejectPending: ((reason: unknown) => void) | null = null;
    let closed = false;
    return {
        poll: (() => null) as unknown as WatchService<Vector2i>["poll"],
        take: () =>
            new Promise<Vector2i[]>((_resolve, reject) => {
                if (closed) {
                    reject(new WatchService.ClosedException());
                    return;
                }
                rejectPending = reject;
            }),
        close: async () => {
            closed = true;
            rejectPending?.(new WatchService.ClosedException());
        },
    };
}
