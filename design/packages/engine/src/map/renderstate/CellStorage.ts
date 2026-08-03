import {
    BlueNBT,
    PalettedArrayAdapter,
    RegistryAdapter,
    type TypeToken,
} from "@material-bluemap/nbt";
import { Key, Vector2i } from "@material-bluemap/shared";
import type { GridStorage } from "../../storage/GridStorage.js";
import { CHUNK_INFO_REGION_TOKEN, ChunkInfoRegion } from "./ChunkInfoRegion.js";
import { REGION_INFO_REGION_TOKEN, RegionInfoRegion } from "./RegionInfoRegion.js";
import { TILE_INFO_REGION_TOKEN, TileInfoRegion } from "./TileInfoRegion.js";
import { TILE_STATE_ARRAY_TOKEN, TILE_STATE_TOKEN, TileState } from "./TileState.js";

/**
 * upstream: Logger.global.logError — the logger-package is not part of this port (yet),
 * see the equivalent note in MCAUtil.ts
 */
function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/**
 * upstream: {@code CellStorage}'s static initializer.
 *
 * The three region-types are registered here too: upstream reads them through
 * BlueNBT's field-reflection, which the port replaces with the explicit
 * {@code ObjectSchema} each region-type carries.
 */
const BLUE_NBT = new BlueNBT();
BLUE_NBT.register(
    TILE_STATE_TOKEN,
    new RegistryAdapter<Key, TileState>(
        TileState.REGISTRY,
        (formatted, defaultNamespace) => Key.parse(formatted, defaultNamespace),
        Key.BLUEMAP_NAMESPACE,
        TileState.UNKNOWN,
    ),
);
BLUE_NBT.register(TILE_STATE_ARRAY_TOKEN, new PalettedArrayAdapter(BLUE_NBT, TILE_STATE_TOKEN));
BLUE_NBT.register(TILE_INFO_REGION_TOKEN, TileInfoRegion.SCHEMA);
BLUE_NBT.register(CHUNK_INFO_REGION_TOKEN, ChunkInfoRegion.SCHEMA);
BLUE_NBT.register(REGION_INFO_REGION_TOKEN, RegionInfoRegion.SCHEMA);

const CACHE_SIZE = 4;

/** upstream: CellStorage.Cell (a nested interface) */
export interface Cell {
    isModified(): boolean;
}

/** upstream: CellStorage.CellConsumer (a nested {@code @FunctionalInterface}) */
export type CellConsumer<T extends Cell> = (cellPos: Vector2i, cell: T) => void;

interface CacheEntry<T extends Cell> {
    readonly pos: Vector2i;
    readonly cell: T;
}

/**
 * upstream: map/renderstate/CellStorage.java
 *
 * Two port-shapes to note:
 * - Every storage access is asynchronous here (the compression layer decompresses
 *   asynchronously), so {@code cell}, {@code save}, {@code forEach} and the abstract
 *   subclass accessors all return promises where upstream returns directly.
 * - Upstream's access-ordered {@code LinkedHashMap} with a {@code removeEldestEntry}
 *   override becomes a javascript {@code Map} (which keeps insertion order) plus an
 *   explicit re-insert on access and an explicit eviction after insert. The map is keyed
 *   by the cell-position's string form, because a javascript Map keys objects by
 *   identity while upstream relies on {@code Vector2i}'s value-equality.
 */
export abstract class CellStorage<T extends Cell> {
    private readonly storage: GridStorage;
    private readonly type: TypeToken<T>;
    private readonly cells = new Map<string, CacheEntry<T>>();

    constructor(storage: GridStorage, type: TypeToken<T>) {
        this.storage = storage;
        this.type = type;
    }

    getStorage(): GridStorage {
        return this.storage;
    }

    /** upstream: synchronized */
    async save(): Promise<void> {
        for (const entry of [...this.cells.values()]) {
            await this.saveCell(entry.pos, entry.cell);
        }
    }

    /** upstream: synchronized */
    reset(): void {
        this.cells.clear();
    }

    /** upstream: {@code T cell(int x, int z)} / {@code synchronized T cell(Vector2i pos)} */
    cell(x: number, z: number): Promise<T>;
    cell(pos: Vector2i): Promise<T>;
    async cell(a: number | Vector2i, z?: number): Promise<T> {
        const pos = typeof a === "number" ? new Vector2i(a, z as number) : a;
        const key = pos.getX() + "," + pos.getY();

        const existing = this.cells.get(key);
        if (existing !== undefined) {
            // access-order: re-inserting moves the entry to the youngest position
            this.cells.delete(key);
            this.cells.set(key, existing);
            return existing.cell;
        }

        const cell = await this.loadCell(pos);
        this.cells.set(key, { pos, cell });

        // upstream: LinkedHashMap#removeEldestEntry — one check per insertion
        if (this.cells.size > CACHE_SIZE) {
            const eldest = this.cells.entries().next().value;
            if (eldest !== undefined) {
                this.cells.delete(eldest[0]);
                await this.saveCell(eldest[1].pos, eldest[1].cell);
            }
        }

        return cell;
    }

    /**
     * upstream: the package-private {@code void forEach(CellConsumer<T> consumer)}.
     * Renamed because {@code MapRegionState} *overloads* it with a differently-shaped
     * public {@code forEach(RegionStateConsumer)}, and TypeScript can not tell two
     * function-typed parameters apart at runtime.
     */
    async forEachCell(consumer: CellConsumer<T>): Promise<void> {
        for (const sc of await this.storage.stream()) {
            const cellPos = new Vector2i(sc.getX(), sc.getZ());
            consumer(cellPos, await this.cell(cellPos));
        }
    }

    /** upstream: synchronized */
    private async loadCell(pos: Vector2i): Promise<T> {
        let data: Uint8Array | null = null;

        try {
            const input = await this.storage.read(pos.getX(), pos.getY());
            if (input != null) data = await input.decompress();
        } catch (ex) {
            // upstream: the IOException branch — a read failure is logged and a fresh cell used
            logError("Failed to load render-state cell " + pos, ex);
            return this.createNewCell();
        }

        if (data == null) return this.createNewCell();

        try {
            return BLUE_NBT.read(data, this.type);
        } catch (ex) {
            // upstream: the RuntimeException branch (e.g. the NoSuchElementException BlueNBT
            // throws on a format error). The port splits the two catch-blocks by *where* the
            // failure happened rather than by exception-type, since a javascript port has no
            // IOException/RuntimeException distinction — a decode failure is what upstream
            // self-heals from by deleting the file.
            logError("Failed to load render-state cell " + pos, ex);

            // try to delete the possibly corrupted file for self-healing
            try {
                await this.storage.delete(pos.getX(), pos.getY());
            } catch (e) {
                logError("Failed to delete render-state cell " + pos, e);
            }
        }

        return this.createNewCell();
    }

    protected abstract createNewCell(): T;

    /** upstream: synchronized */
    private async saveCell(pos: Vector2i, cell: T): Promise<void> {
        if (!cell.isModified()) return;
        try {
            await this.storage.write(pos.getX(), pos.getY(), BLUE_NBT.writeToBytes(cell, this.type));
        } catch (ex) {
            logError("Failed to save render-state cell " + pos, ex);
        }
    }
}
