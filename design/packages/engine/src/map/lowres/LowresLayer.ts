import { LRUCache } from "lru-cache";
import { Color, Vector2i, type Grid } from "@material-bluemap/shared";
import type { GridStorage } from "../../storage/GridStorage.js";
import { LowresTile } from "./LowresTile.js";

const MAX_PENDING = 200;
const DISCARD_THRESHOLD = MAX_PENDING / 2;

/** upstream: Logger.global.logDebug / logError — the logger-package is not part of this port */
function logDebug(message: string): void {
    console.debug(message);
}

function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

function cacheKey(x: number, z: number): string {
    return x + "," + z;
}

/** upstream: {@code BiConsumer<Vector2i, Integer>} */
export type TileUpdateListener = (tilePos: Vector2i, lod: number) => void;

interface PendingChange {
    readonly pos: Vector2i;
    readonly tile: LowresTile;
}

/**
 * upstream: map/lowres/LowresLayer.java
 *
 * One LOD level of the lowres cascade: it owns the tiles of its own level and, when a tile
 * is saved, averages every {@code lodFactor x lodFactor} block of its pixels into one pixel
 * of the next (coarser) layer.
 *
 * Port notes:
 * - Storage access is asynchronous here, so {@code save}, {@code set} and the internal
 *   tile-access return promises.
 * - Upstream keeps two caffeine caches: a weak-valued one guaranteeing that only one
 *   instance of a given tile exists while anything still references it, and a soft-valued
 *   size- and time-bounded one in front of it. Javascript has no soft references and a
 *   weak-valued cache can not be consulted deterministically, so the port uses one
 *   size-bounded {@code lru-cache} plus a lookup in {@code pendingChanges} — which is the
 *   only thing that holds a tile alive between a write and its save, and therefore exactly
 *   the case the weak cache exists to make single-instance.
 */
export class LowresLayer {
    private readonly storage: GridStorage;

    private readonly tileGrid: Grid;
    private readonly lodFactor: number;

    private readonly lod: number;
    private readonly tileCache: LRUCache<string, LowresTile>;
    private readonly nextLayer: LowresLayer | null;

    private readonly pendingChanges = new Map<string, PendingChange>();
    private readonly tileUpdateListeners: TileUpdateListener[] = [];

    constructor(
        storage: GridStorage,
        tileGrid: Grid,
        lodFactor: number,
        lod: number,
        nextLayer: LowresLayer | null,
    ) {
        this.storage = storage;

        this.tileGrid = tileGrid;
        this.lodFactor = lodFactor;

        this.lod = lod;
        this.nextLayer = nextLayer;

        this.tileCache = new LRUCache<string, LowresTile>({
            max: 1000,
            ttl: 60 * 1000, // upstream: expireAfterAccess(1, TimeUnit.MINUTES)
            updateAgeOnGet: true,
        });
    }

    addTileUpdateListener(listener: TileUpdateListener): void {
        this.tileUpdateListeners.push(listener);
    }

    removeTileUpdateListener(listener: TileUpdateListener): void {
        const index = this.tileUpdateListeners.indexOf(listener);
        if (index >= 0) this.tileUpdateListeners.splice(index, 1);
    }

    /** upstream: synchronized */
    async save(): Promise<void> {
        for (const [key, change] of [...this.pendingChanges]) {
            if (await this.saveTile(change.pos, change.tile)) this.pendingChanges.delete(key);
        }
        if (this.pendingChanges.size >= DISCARD_THRESHOLD) {
            logDebug(
                "Discarding changes of " +
                    this.pendingChanges.size +
                    " lowres-tiles that failed to save!",
            );
            this.pendingChanges.clear();
        }
    }

    /** upstream: synchronized */
    discard(): void {
        this.pendingChanges.clear();
        this.tileCache.clear();
    }

    private async createTile(tilePos: Vector2i): Promise<LowresTile> {
        try {
            const input = await this.storage.read(tilePos.getX(), tilePos.getY());
            if (input != null)
                return new LowresTile(this.tileGrid.getGridSize(), await input.decompress());
        } catch (e) {
            logError("Failed to load tile " + tilePos + " (lod: " + this.lod + ")", e);
        }

        // if the tile can not be loaded, we create a new one
        return new LowresTile(this.tileGrid.getGridSize());
    }

    private async saveTile(tilePos: Vector2i, tile: LowresTile): Promise<boolean> {
        // check if storage is closed
        if (this.storage.isClosed()) {
            logDebug(
                "Tried to save tile " +
                    tilePos +
                    " (lod: " +
                    this.lod +
                    ") but storage is already closed.",
            );
            return false;
        }

        // save the tile
        try {
            await this.storage.write(tilePos.getX(), tilePos.getY(), tile.save());
        } catch (e) {
            logError("Failed to save tile " + tilePos + " (lod: " + this.lod + ")", e);
            return false;
        }

        // notify listeners that the tile changed
        for (const listener of [...this.tileUpdateListeners]) {
            listener(tilePos, this.lod);
        }

        if (this.nextLayer === null) return true;

        // write to next LOD (prepare for the most confusing grid-math you will ever see)
        const averageColor = new Color();
        let averageHeight: number;
        let averageBlockLight: number;
        let count: number;

        const color = new Color();

        const nextLodTileX = floorDiv(tilePos.getX(), this.lodFactor);
        const nextLodTileY = floorDiv(tilePos.getY(), this.lodFactor);
        const groupCount = new Vector2i(
            floorDiv(this.tileGrid.getGridSize().getX(), this.lodFactor),
            floorDiv(this.tileGrid.getGridSize().getY(), this.lodFactor),
        );

        for (let gX = 0; gX < groupCount.getX(); gX++) {
            for (let gY = 0; gY < groupCount.getY(); gY++) {
                averageColor.set(0, 0, 0, 0, true);
                averageHeight = 0;
                averageBlockLight = 0;
                count = 0;
                for (let x = 0; x < this.lodFactor; x++) {
                    for (let y = 0; y < this.lodFactor; y++) {
                        count++;
                        averageColor.add(
                            tile
                                .getColor(gX * this.lodFactor + x, gY * this.lodFactor + y, color)
                                .premultiplied(),
                        );
                        averageHeight += tile.getHeight(
                            gX * this.lodFactor + x,
                            gY * this.lodFactor + y,
                        );
                        averageBlockLight += tile.getBlockLight(
                            gX * this.lodFactor + x,
                            gY * this.lodFactor + y,
                        );
                    }
                }
                averageColor.div(count);
                // java integer division truncates toward zero
                averageHeight = Math.trunc(averageHeight / count);
                averageBlockLight = Math.trunc(averageBlockLight / count);

                await this.nextLayer.set(
                    nextLodTileX,
                    nextLodTileY,
                    floorMod(tilePos.getX(), this.lodFactor) * groupCount.getX() + gX,
                    floorMod(tilePos.getY(), this.lodFactor) * groupCount.getY() + gY,
                    averageColor,
                    averageHeight,
                    averageBlockLight,
                );
            }
        }

        return true;
    }

    private async accessTile(x: number, z: number): Promise<LowresTile> {
        const key = cacheKey(x, z);

        // a tile with unsaved changes is the one instance every writer has to share
        const pending = this.pendingChanges.get(key);
        let tile = pending !== undefined ? pending.tile : this.tileCache.get(key);
        const tilePos = pending !== undefined ? pending.pos : new Vector2i(x, z);

        if (tile === undefined) {
            tile = await this.createTile(tilePos);
            this.tileCache.set(key, tile);
        }

        if (this.pendingChanges.size >= MAX_PENDING) await this.save();
        this.pendingChanges.set(key, { pos: tilePos, tile });

        return tile;
    }

    async set(
        cellX: number,
        cellZ: number,
        pixelX: number,
        pixelZ: number,
        color: Color,
        height: number,
        blockLight: number,
    ): Promise<void> {
        (await this.accessTile(cellX, cellZ)).set(pixelX, pixelZ, color, height, blockLight);

        // for seamless edges
        if (pixelX === 0) {
            (await this.accessTile(cellX - 1, cellZ)).set(
                this.tileGrid.getGridSize().getX(),
                pixelZ,
                color,
                height,
                blockLight,
            );
        }

        if (pixelZ === 0) {
            (await this.accessTile(cellX, cellZ - 1)).set(
                pixelX,
                this.tileGrid.getGridSize().getY(),
                color,
                height,
                blockLight,
            );
        }

        if (pixelX === 0 && pixelZ === 0) {
            (await this.accessTile(cellX - 1, cellZ - 1)).set(
                this.tileGrid.getGridSize().getX(),
                this.tileGrid.getGridSize().getY(),
                color,
                height,
                blockLight,
            );
        }
    }
}

/** java.lang.Math#floorDiv for 32-bit ints */
function floorDiv(x: number, y: number): number {
    return Math.floor(x / y) | 0;
}

/** java.lang.Math#floorMod for 32-bit ints */
function floorMod(x: number, y: number): number {
    return (((x % y) + y) % y) | 0;
}
