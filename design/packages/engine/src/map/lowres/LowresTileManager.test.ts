import { describe, expect, it } from "vitest";
import { Color, Grid, Vector2i } from "@material-bluemap/shared";
import { GridStorageCell, type Cell, type GridStorage } from "../../storage/GridStorage.js";
import type { ItemStorage } from "../../storage/ItemStorage.js";
import type { MapStorage } from "../../storage/MapStorage.js";
import { CompressedInputStream } from "../../storage/compression/CompressedInputStream.js";
import { BmMap } from "../BmMap.js";
import { LowresTile } from "./LowresTile.js";
import { LowresTileManager } from "./LowresTileManager.js";

class MemoryGridStorage implements GridStorage {
    readonly items = new Map<string, Uint8Array>();

    private static key(x: number, z: number): string {
        return x + "," + z;
    }

    write(x: number, z: number, data: Uint8Array): Promise<void> {
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

class MemoryMapStorage implements MapStorage {
    readonly lowres = new Map<number, MemoryGridStorage>();

    lowresTiles(lod: number): GridStorage {
        let storage = this.lowres.get(lod);
        if (storage === undefined) {
            storage = new MemoryGridStorage();
            this.lowres.set(lod, storage);
        }
        return storage;
    }

    hiresTiles(): GridStorage {
        throw new Error("unused");
    }
    tileState(): GridStorage {
        throw new Error("unused");
    }
    chunkState(): GridStorage {
        throw new Error("unused");
    }
    regionState(): GridStorage {
        throw new Error("unused");
    }
    asset(): ItemStorage {
        throw new Error("unused");
    }
    settings(): ItemStorage {
        throw new Error("unused");
    }
    textures(): ItemStorage {
        throw new Error("unused");
    }
    markers(): ItemStorage {
        throw new Error("unused");
    }
    players(): ItemStorage {
        throw new Error("unused");
    }
    delete(): Promise<void> {
        throw new Error("unused");
    }
    exists(): Promise<boolean> {
        throw new Error("unused");
    }
    isClosed(): boolean {
        return false;
    }
}

interface CellValue {
    readonly x: number;
    readonly z: number;
    readonly argb: number;
    readonly height: number;
    readonly blockLight: number;
}

async function renderCascade(
    gridSize: number,
    lodFactor: number,
    cells: CellValue[],
): Promise<{ storage: MemoryMapStorage; tileGrid: Grid }> {
    const storage = new MemoryMapStorage();
    const tileGrid = new Grid(gridSize);
    const manager = new LowresTileManager(storage, tileGrid, 2, lodFactor);

    const color = new Color();
    for (const cell of cells) {
        await manager.set(cell.x, cell.z, color.set(cell.argb), cell.height, cell.blockLight);
    }
    await manager.save();

    return { storage, tileGrid };
}

function loadTile(
    storage: MemoryMapStorage,
    tileGrid: Grid,
    lod: number,
    x: number,
    z: number,
): LowresTile {
    const data = (storage.lowresTiles(lod) as MemoryGridStorage).items.get(x + "," + z);
    expect(data, `lod ${lod} tile ${x},${z} was never written`).toBeDefined();
    return new LowresTile(tileGrid.getGridSize(), data!);
}

describe("LowresTileManager cascade", () => {
    /**
     * The expected coarse pixels come from running upstream's own averaging — `Color#add`
     * / `div` / `straight` / `getInt` verbatim, driven exactly as `LowresLayer#saveTile`
     * drives them — on a JDK (Temurin 25).
     *
     * They are the reason `Color` has to be 32-bit: the first case below averages one
     * half-transparent blue over nine pixels and lands on **0x3F** for blue. The identical
     * arithmetic in double precision produces 0x40 — one step brighter, on every coarse
     * pixel of every zoomed-out tile.
     */
    it("averages a lodFactor-3 group exactly as the java engine does", async () => {
        const { storage, tileGrid } = await renderCascade(3, 3, [
            { x: 0, z: 0, argb: 0x8000_0040 | 0, height: 100, blockLight: 15 },
        ]);

        // the fine tile keeps the straight color it was given
        const lod1 = loadTile(storage, tileGrid, 1, 0, 0);
        expect(lod1.getColor(0, 0, new Color()).getInt()).toBe(0x8000_0040 | 0);
        expect(lod1.getHeight(0, 0)).toBe(100);
        expect(lod1.getBlockLight(0, 0)).toBe(15);

        // the coarse tile holds the 9-pixel average of it and eight transparent neighbours
        const lod2 = loadTile(storage, tileGrid, 2, 0, 0);
        expect(lod2.getColor(0, 0, new Color()).getInt()).toBe(0x0e00_003f | 0);
        // java integer division truncates: 100/9 and 15/9
        expect(lod2.getHeight(0, 0)).toBe(11);
        expect(lod2.getBlockLight(0, 0)).toBe(1);
    });

    it("averages nine opaque colours", async () => {
        const argbs = [
            0xff0a141e, 0xff28323c, 0xff46505a, 0xff646e78, 0xff828c96, 0xffa0aab4, 0xffbec8d2,
            0xffdce6f0, 0xfffaff05,
        ];
        const cells: CellValue[] = [];
        for (let z = 0; z < 3; z++) {
            for (let x = 0; x < 3; x++) {
                // LowresLayer reads the group in x-major order (gX -> x, gY -> z)
                cells.push({
                    x,
                    z,
                    argb: argbs[x * 3 + z]! | 0,
                    height: 0,
                    blockLight: 0,
                });
            }
        }

        const { storage, tileGrid } = await renderCascade(3, 3, cells);
        const lod2 = loadTile(storage, tileGrid, 2, 0, 0);
        expect(lod2.getColor(0, 0, new Color()).getInt()).toBe(0xff82_8b78 | 0);
    });

    it("averages nine colours of mixed alpha", async () => {
        const argbs = [
            0xff0a141e, 0x8028323c, 0x4046505a, 0xff646e78, 0xc8828c96, 0x64a0aab4, 0xffbec8d2,
            0x21dce6f0, 0x4dfa050f,
        ];
        const cells: CellValue[] = [];
        for (let z = 0; z < 3; z++) {
            for (let x = 0; x < 3; x++) {
                cells.push({ x, z, argb: argbs[x * 3 + z]! | 0, height: 0, blockLight: 0 });
            }
        }

        const { storage, tileGrid } = await renderCascade(3, 3, cells);
        const lod2 = loadTile(storage, tileGrid, 2, 0, 0);
        expect(lod2.getColor(0, 0, new Color()).getInt()).toBe(0x9771_6c76 | 0);
    });

    it("averages a lodFactor-2 group", async () => {
        const { storage, tileGrid } = await renderCascade(2, 2, [
            { x: 0, z: 0, argb: 0x8000_0040 | 0, height: 40, blockLight: 9 },
        ]);

        const lod2 = loadTile(storage, tileGrid, 2, 0, 0);
        expect(lod2.getColor(0, 0, new Color()).getInt()).toBe(0x2000_0040 | 0);
        expect(lod2.getHeight(0, 0)).toBe(10);
        expect(lod2.getBlockLight(0, 0)).toBe(2);
    });

    it("writes the seam pixels of the three neighbouring tiles for cell (0,0)", async () => {
        const { storage, tileGrid } = await renderCascade(3, 3, [
            { x: 0, z: 0, argb: 0xff11_2233 | 0, height: 7, blockLight: 3 },
        ]);

        // upstream duplicates a cell on a tile's 0-edge into the previous tile's extra
        // row/column, so neighbouring lowres tiles meet without a visible seam
        for (const [tileX, tileZ, pixelX, pixelZ] of [
            [-1, 0, 3, 0],
            [0, -1, 0, 3],
            [-1, -1, 3, 3],
        ] as const) {
            const tile = loadTile(storage, tileGrid, 1, tileX, tileZ);
            expect(tile.getColor(pixelX, pixelZ, new Color()).getInt()).toBe(0xff11_2233 | 0);
            expect(tile.getHeight(pixelX, pixelZ)).toBe(7);
        }
    });

    it("fills in BmMap's default lowres-manager factory", () => {
        const manager = BmMap.defaultLowresTileManagerFactory(
            new MemoryMapStorage(),
            new Grid(4),
            3,
            5,
        );
        expect(manager).toBeInstanceOf(LowresTileManager);
        expect(manager.getLodCount()).toBe(3);
        expect(manager.getLodFactor()).toBe(5);
    });

    it("exposes the grid, lod-count and lod-factor it was built with", () => {
        const manager = new LowresTileManager(new MemoryMapStorage(), new Grid(4), 3, 5);
        expect(manager.getTileGrid().getGridSize()).toEqual(new Vector2i(4, 4));
        expect(manager.getLodCount()).toBe(3);
        expect(manager.getLodFactor()).toBe(5);
    });

    it("lands unawaited writes in call order, with the caller's scratch colour snapshotted", async () => {
        const storage = new MemoryMapStorage();
        const tileGrid = new Grid(3);
        const manager = new LowresTileManager(storage, tileGrid, 2, 3);

        // exactly how BmMap wires it: one reused Color, and the promise is never awaited
        const scratch = new Color();
        manager.set(0, 0, scratch.set(0xff11_2233 | 0), 7, 3);
        manager.set(1, 0, scratch.set(0xff44_5566 | 0), 8, 4);
        manager.set(0, 0, scratch.set(0xff77_8899 | 0), 9, 5);

        await manager.save();

        const lod1 = loadTile(storage, tileGrid, 1, 0, 0);
        // the last write to (0,0) wins, and (1,0) kept its own colour rather than the
        // scratch instance's final value
        expect(lod1.getColor(0, 0, new Color()).getInt()).toBe(0xff77_8899 | 0);
        expect(lod1.getHeight(0, 0)).toBe(9);
        expect(lod1.getColor(1, 0, new Color()).getInt()).toBe(0xff44_5566 | 0);
        expect(lod1.getHeight(1, 0)).toBe(8);
    });

    it("drains queued tile-meta writes before saving", async () => {
        const storage = new MemoryMapStorage();
        const tileGrid = new Grid(3);
        const manager = new LowresTileManager(storage, tileGrid, 2, 3);

        const consumer = manager.tileMetaConsumer();
        const scratch = new Color();
        // one reused scratch color, exactly as a render-pass hands it over
        consumer(0, 0, scratch.set(0xff11_2233 | 0), 7, 3);
        consumer(1, 0, scratch.set(0xff44_5566 | 0), 8, 4);

        await manager.save();

        const lod1 = loadTile(storage, tileGrid, 1, 0, 0);
        expect(lod1.getColor(0, 0, new Color()).getInt()).toBe(0xff11_2233 | 0);
        expect(lod1.getColor(1, 0, new Color()).getInt()).toBe(0xff44_5566 | 0);
    });
});
