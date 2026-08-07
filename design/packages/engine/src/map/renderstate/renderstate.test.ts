import { describe, expect, it } from "vitest";
import { Key, Vector2i } from "@worldlens/shared";
import { GridStorageCell, type Cell, type GridStorage } from "../../storage/GridStorage.js";
import type { ItemStorage } from "../../storage/ItemStorage.js";
import { CompressedInputStream } from "../../storage/compression/CompressedInputStream.js";
import { ChunkInfoRegion } from "./ChunkInfoRegion.js";
import { MapChunkState } from "./MapChunkState.js";
import { MapRegionState } from "./MapRegionState.js";
import { MapTileState } from "./MapTileState.js";
import { RegionInfoRegion } from "./RegionInfoRegion.js";
import { Action, ActionAndNextState, BoundsSituation } from "./TileActionResolver.js";
import { TileInfo, TileInfoRegion } from "./TileInfoRegion.js";
import { TileState } from "./TileState.js";

class MemoryGridStorage implements GridStorage {
    readonly items = new Map<string, Uint8Array>();
    writes = 0;

    private static key(x: number, z: number): string {
        return x + "," + z;
    }

    write(x: number, z: number, data: Uint8Array): Promise<void> {
        this.writes++;
        this.items.set(MemoryGridStorage.key(x, z), Uint8Array.from(data));
        return Promise.resolve();
    }

    read(x: number, z: number): Promise<CompressedInputStream | null> {
        const data = this.items.get(MemoryGridStorage.key(x, z));
        return Promise.resolve(data === undefined ? null : new CompressedInputStream(data));
    }

    delete(x: number, z: number): Promise<void> {
        this.items.delete(MemoryGridStorage.key(x, z));
        return Promise.resolve();
    }

    exists(x: number, z: number): Promise<boolean> {
        return Promise.resolve(this.items.has(MemoryGridStorage.key(x, z)));
    }

    cell(x: number, z: number): ItemStorage {
        return new GridStorageCell(this, x, z);
    }

    stream(): Promise<Cell[]> {
        return Promise.resolve(
            [...this.items.keys()].map((key) => {
                const [x, z] = key.split(",");
                return new GridStorageCell(this, Number(x), Number(z));
            }),
        );
    }

    isClosed(): boolean {
        return false;
    }
}

describe("TileState", () => {
    it("is registered under its bluemap key", () => {
        expect(TileState.REGISTRY.get(Key.bluemap("unknown"))).toBe(TileState.UNKNOWN);
        expect(TileState.REGISTRY.get(Key.bluemap("rendered-edge"))).toBe(TileState.RENDERED_EDGE);
        expect(TileState.REGISTRY.get(Key.bluemap("low-inhabited-time"))).toBe(
            TileState.LOW_INHABITED_TIME,
        );
        expect(TileState.REGISTRY.values()).toHaveLength(9);
        expect(String(TileState.RENDERED)).toBe("bluemap:rendered");
    });

    it("renders an unknown tile whatever the chunks did", () => {
        for (const changed of [true, false]) {
            expect(TileState.UNKNOWN.findActionAndNextState(changed, BoundsSituation.INSIDE)).toBe(
                ActionAndNextState.RENDER_RENDERED,
            );
            expect(TileState.UNKNOWN.findActionAndNextState(changed, BoundsSituation.EDGE)).toBe(
                ActionAndNextState.RENDER_RENDERED_EDGE,
            );
            expect(TileState.UNKNOWN.findActionAndNextState(changed, BoundsSituation.OUTSIDE)).toBe(
                ActionAndNextState.DELETE_OUT_OF_BOUNDS,
            );
        }
    });

    it("leaves an unchanged rendered tile alone", () => {
        expect(TileState.RENDERED.findActionAndNextState(false, BoundsSituation.INSIDE)).toBe(
            ActionAndNextState.NONE_RENDERED,
        );
        expect(TileState.RENDERED.findActionAndNextState(true, BoundsSituation.INSIDE)).toBe(
            ActionAndNextState.RENDER_RENDERED,
        );
        // an edge tile always re-renders, because the mask may have moved under it
        expect(TileState.RENDERED.findActionAndNextState(false, BoundsSituation.EDGE)).toBe(
            ActionAndNextState.RENDER_RENDERED_EDGE,
        );
    });

    it("re-renders an unchanged rendered-edge tile only while it stays an edge", () => {
        expect(TileState.RENDERED_EDGE.findActionAndNextState(false, BoundsSituation.EDGE)).toBe(
            ActionAndNextState.NONE_RENDERED_EDGE,
        );
        expect(TileState.RENDERED_EDGE.findActionAndNextState(true, BoundsSituation.EDGE)).toBe(
            ActionAndNextState.RENDER_RENDERED_EDGE,
        );
        expect(TileState.RENDERED_EDGE.findActionAndNextState(false, BoundsSituation.INSIDE)).toBe(
            ActionAndNextState.RENDER_RENDERED,
        );
    });

    it("does not delete an already out-of-bounds tile again", () => {
        expect(TileState.OUT_OF_BOUNDS.findActionAndNextState(true, BoundsSituation.OUTSIDE)).toBe(
            ActionAndNextState.NONE_OUT_OF_BOUNDS,
        );
        expect(TileState.OUT_OF_BOUNDS.findActionAndNextState(true, BoundsSituation.INSIDE)).toBe(
            ActionAndNextState.RENDER_RENDERED,
        );
    });

    it("keeps an errored/ungenerated tile in its own state until something changes", () => {
        for (const state of [
            TileState.NOT_GENERATED,
            TileState.MISSING_LIGHT,
            TileState.LOW_INHABITED_TIME,
            TileState.CHUNK_ERROR,
        ]) {
            for (const bounds of BoundsSituation.values()) {
                const unchanged = state.findActionAndNextState(false, bounds);
                expect(unchanged.action()).toBe(Action.NONE);
                expect(unchanged.state()).toBe(state);
                // upstream caches that one instance per state
                expect(state.findActionAndNextState(false, bounds)).toBe(unchanged);
            }

            expect(state.findActionAndNextState(true, BoundsSituation.INSIDE)).toBe(
                ActionAndNextState.RENDER_RENDERED,
            );
            expect(state.findActionAndNextState(true, BoundsSituation.OUTSIDE)).toBe(
                ActionAndNextState.DELETE_OUT_OF_BOUNDS,
            );
        }
    });

    it("always retries a render-error tile", () => {
        expect(TileState.RENDER_ERROR.findActionAndNextState(false, BoundsSituation.INSIDE)).toBe(
            ActionAndNextState.RENDER_RENDERED,
        );
    });
});

describe("TileInfoRegion", () => {
    it("starts out entirely unknown with no render times", () => {
        const region = TileInfoRegion.create();
        expect(region.isModified()).toBe(false);
        expect(region.get(0, 0).getState()).toBe(TileState.UNKNOWN);
        expect(region.get(31, 31).getRenderTime()).toBe(0);
        expect(region.findLatestRenderTime()).toBe(0);
    });

    it("returns the previous info and only flags a real change as modified", () => {
        const region = TileInfoRegion.create();

        const previous = region.set(3, 4, new TileInfo(1234, TileState.RENDERED));
        expect(previous.getRenderTime()).toBe(0);
        expect(previous.getState()).toBe(TileState.UNKNOWN);
        expect(region.isModified()).toBe(true);
        expect(region.get(3, 4).getRenderTime()).toBe(1234);
        expect(region.findLatestRenderTime()).toBe(1234);

        const untouched = TileInfoRegion.create();
        untouched.set(3, 4, new TileInfo(0, TileState.UNKNOWN));
        expect(untouched.isModified()).toBe(false);
    });

    it("wraps its coordinates into the 32x32 region", () => {
        const region = TileInfoRegion.create();
        region.set(1, 2, new TileInfo(7, TileState.RENDERED));
        expect(region.get(1 + 32, 2 + 64).getRenderTime()).toBe(7);
        expect(region.get(1 - 32, 2 - 32).getRenderTime()).toBe(7);
    });

    it("refuses a null state", () => {
        const region = TileInfoRegion.create();
        expect(() =>
            region.set(0, 0, new TileInfo(1, null as unknown as TileState)),
        ).toThrow("state must not be null");
    });
});

describe("MapTileState", () => {
    it("persists tile-infos and reads them back through a fresh instance", async () => {
        const storage = new MemoryGridStorage();
        const state = new MapTileState(storage);

        await state.set(5, 7, new TileInfo(1000, TileState.RENDERED));
        await state.set(-1, -1, new TileInfo(2000, TileState.RENDERED_EDGE));
        await state.set(64, 64, new TileInfo(3000, TileState.CHUNK_ERROR));
        expect(state.getLastRenderTime()).toBe(3000);

        await state.save();
        // (5,7) and (64,64) live in cell (0,0) and (2,2); (-1,-1) in cell (-1,-1)
        expect(storage.items.size).toBe(3);

        const reloaded = new MapTileState(storage);
        expect((await reloaded.get(5, 7)).getRenderTime()).toBe(1000);
        expect((await reloaded.get(5, 7)).getState()).toBe(TileState.RENDERED);
        expect((await reloaded.get(-1, -1)).getState()).toBe(TileState.RENDERED_EDGE);
        expect((await reloaded.get(64, 64)).getState()).toBe(TileState.CHUNK_ERROR);
        // untouched tiles come back unknown
        expect((await reloaded.get(6, 7)).getState()).toBe(TileState.UNKNOWN);
    });

    it("only writes cells that were actually modified", async () => {
        const storage = new MemoryGridStorage();
        const state = new MapTileState(storage);

        await state.get(0, 0);
        await state.save();
        expect(storage.writes).toBe(0);
    });

    it("saves a cell when the 4-entry cache evicts it", async () => {
        const storage = new MemoryGridStorage();
        const state = new MapTileState(storage);

        // five different 32x32 cells: touching the fifth evicts the eldest
        for (let i = 0; i < 5; i++) {
            await state.set(i * 32, 0, new TileInfo(i + 1, TileState.RENDERED));
        }
        expect(storage.writes).toBe(1);
        expect(storage.items.has("0,0")).toBe(true);

        await state.save();
        expect(storage.items.size).toBe(5);
    });

    it("exposes the 32-block tile-state grid and its shift", () => {
        expect(MapTileState.SHIFT).toBe(5);
        expect(MapTileState.GRID.getGridSize()).toEqual(new Vector2i(32, 32));
    });

    it("writes a tile-state palette that loadPalette can read on its own", async () => {
        const storage = new MemoryGridStorage();
        const state = new MapTileState(storage);
        await state.set(0, 0, new TileInfo(1, TileState.RENDERED));
        await state.set(1, 0, new TileInfo(2, TileState.CHUNK_ERROR));
        await state.save();

        const palette = TileInfoRegion.loadPalette(storage.items.get("0,0")!);
        expect(palette).toContain(TileState.UNKNOWN);
        expect(palette).toContain(TileState.RENDERED);
        expect(palette).toContain(TileState.CHUNK_ERROR);
    });
});

describe("MapChunkState", () => {
    it("stores chunk hashes in 128x128 cells and persists them", async () => {
        const storage = new MemoryGridStorage();
        const state = new MapChunkState(storage);

        expect(await state.set(10, 20, 0x1234_5678 | 0)).toBe(0);
        expect(await state.get(10, 20)).toBe(0x1234_5678 | 0);
        expect(await state.set(10, 20, -1)).toBe(0x1234_5678 | 0);

        await state.save();
        expect(storage.items.size).toBe(1);

        const reloaded = new MapChunkState(storage);
        expect(await reloaded.get(10, 20)).toBe(-1);
        expect(MapChunkState.SHIFT).toBe(7);
        expect(ChunkInfoRegion.create().get(0, 0)).toBe(0);
    });
});

describe("MapRegionState", () => {
    it("stores update-times in 64x64 cells and iterates the non-zero ones", async () => {
        const storage = new MemoryGridStorage();
        const state = new MapRegionState(storage);

        await state.set(1, 2, 500);
        await state.set(-1, -2, 600);
        await state.set(70, 70, 700);
        await state.set(3, 3, 800);
        await state.delete(3, 3);

        await state.save();

        const reloaded = new MapRegionState(storage);
        const seen: [number, number, number][] = [];
        await reloaded.forEach((x, z, lastUpdateTime) => seen.push([x, z, lastUpdateTime]));

        expect(seen).toEqual(
            expect.arrayContaining([
                [1, 2, 500],
                [-1, -2, 600],
                [70, 70, 700],
            ]),
        );
        // the deleted one is a 0 and therefore skipped
        expect(seen).toHaveLength(3);
        expect(MapRegionState.SHIFT).toBe(6);
        expect(RegionInfoRegion.create().get(0, 0)).toBe(0);
    });
});
