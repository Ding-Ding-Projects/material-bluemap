import { Color, type Grid } from "@material-bluemap/shared";
import type { MapStorage } from "../../storage/MapStorage.js";
import { BmMap } from "../BmMap.js";
import type { TileMetaConsumer } from "../TileMetaConsumer.js";
import { LowresLayer, type TileUpdateListener } from "./LowresLayer.js";

/**
 * upstream: map/lowres/LowresTileManager.java
 *
 * Owns the whole lowres cascade: layer 1 receives every rendered cell, and each layer
 * averages into the next when one of its tiles is saved.
 *
 * Port note: upstream declares {@code implements TileMetaConsumer}, whose single method is
 * this class' {@code set}. The port's {@link TileMetaConsumer} is a function-type (that is
 * what a java {@code @FunctionalInterface} is here), and storage is asynchronous — which
 * makes {@code set} asynchronous too, while a render-pass calls it from the middle of a
 * synchronous loop and can not await it.
 *
 * So {@code set} queues: it snapshots the colour (a render-pass hands over one reused
 * scratch instance per column, and the write below happens later), chains the write behind
 * the previous one so cells land in call order, and returns the tail of that chain. Calling
 * it and ignoring the promise — which is how {@code BmMap} wires it, the same way upstream
 * does — is therefore safe, and {@link save} / {@link discard} drain the queue first so
 * nothing is written after the tiles have been flushed.
 */
export class LowresTileManager {
    private readonly tileGrid: Grid;
    private readonly lodFactor: number;
    private readonly lodCount: number;

    private readonly layers: LowresLayer[];

    /** the tail of the queued {@link tileMetaConsumer} writes (see the class note) */
    private queue: Promise<void> = Promise.resolve();

    constructor(storage: MapStorage, tileGrid: Grid, lodCount: number, lodFactor: number) {
        this.tileGrid = tileGrid;
        this.lodFactor = lodFactor;
        this.lodCount = lodCount;

        this.layers = new Array<LowresLayer>(lodCount);
        for (let i = lodCount - 1; i >= 0; i--) {
            this.layers[i] = new LowresLayer(
                storage.lowresTiles(i + 1),
                tileGrid,
                lodFactor,
                i + 1,
                i === lodCount - 1 ? null : this.layers[i + 1]!,
            );
        }
    }

    addTileUpdateListener(listener: TileUpdateListener): void {
        for (const layer of this.layers) {
            layer.addTileUpdateListener(listener);
        }
    }

    removeTileUpdateListener(listener: TileUpdateListener): void {
        for (const layer of this.layers) {
            layer.removeTileUpdateListener(listener);
        }
    }

    /** upstream: synchronized */
    async save(): Promise<void> {
        await this.flush();
        for (const layer of this.layers) {
            await layer.save();
        }
    }

    /** upstream: synchronized */
    async discard(): Promise<void> {
        await this.flush();
        for (const layer of this.layers) {
            layer.discard();
        }
    }

    getTileGrid(): Grid {
        return this.tileGrid;
    }

    getLodCount(): number {
        return this.lodCount;
    }

    getLodFactor(): number {
        return this.lodFactor;
    }

    /**
     * upstream: {@code public void set(int x, int z, Color color, int height, int blockLight)}
     * — queued rather than immediate; see the class note.
     */
    set(x: number, z: number, color: Color, height: number, blockLight: number): Promise<void> {
        const snapshot = new Color().set(color);
        this.queue = this.queue.then(() =>
            this.write(x, z, snapshot, height, blockLight),
        );
        return this.queue;
    }

    private write(
        x: number,
        z: number,
        color: Color,
        height: number,
        blockLight: number,
    ): Promise<void> {
        const cellX = this.tileGrid.getCellX(x);
        const cellZ = this.tileGrid.getCellY(z);
        const localX = this.tileGrid.getLocalX(x);
        const localZ = this.tileGrid.getLocalY(z);
        return this.layers[0]!.set(cellX, cellZ, localX, localZ, color, height, blockLight);
    }

    /**
     * {@link set} as a {@link TileMetaConsumer}, for a render-pass that wants the
     * function-shape upstream's {@code implements TileMetaConsumer} gave it.
     */
    tileMetaConsumer(): TileMetaConsumer {
        return (x, z, color, height, blockLight) => {
            void this.set(x, z, color, height, blockLight);
        };
    }

    /** Awaits every cell queued through {@link set} */
    async flush(): Promise<void> {
        let previous: Promise<void>;
        do {
            previous = this.queue;
            await previous;
        } while (previous !== this.queue);
    }
}

// `BmMap` keeps the construction of its lowres manager behind a factory seam (upstream
// simply calls `new LowresTileManager(...)` in its constructor) and asks this module to
// fill the default in when it lands. Importing this module — which the package barrel
// does — is therefore the whole wiring; `BmMap.create` still accepts an explicit factory.
BmMap.defaultLowresTileManagerFactory = (storage, tileGrid, lodCount, lodFactor) =>
    new LowresTileManager(storage, tileGrid, lodCount, lodFactor);
