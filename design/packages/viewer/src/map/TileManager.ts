import { Vector2, Scene, Group } from "three";
import { Tile } from "./Tile";
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- unused `alert` import kept from upstream
import { alert, dispatchEvent, hashTile } from "../util/Utils";
import { TileMap } from "./TileMap";
import type { TileLoader } from "./TileLoader";
import type { LowresTileLoader } from "./LowresTileLoader";

export class TileManager {
    static tileMapSize = 100;
    static tileMapHalfSize = TileManager.tileMapSize / 2;

    declare readonly isTileManager: boolean;

    sceneParent: Scene;
    scene: Group;

    events: EventTarget | null;
    tileLoader: TileLoader | LowresTileLoader;

    onTileLoad: (tile: Tile) => void;
    onTileUnload: (tile: Tile) => void;

    viewDistanceX: number;
    viewDistanceZ: number;
    centerTile: Vector2;

    currentlyLoading: number;
    loadTimeout: ReturnType<typeof setTimeout> | null;

    //map of loaded tiles
    tiles: Map<string, Tile>;

    // a canvas that keeps track of the loaded tiles, used for shaders
    tileMap: TileMap;

    unloaded: boolean;

    constructor(
        tileLoader: TileLoader | LowresTileLoader,
        onTileLoad: ((tile: Tile) => void) | null = null,
        onTileUnload: ((tile: Tile) => void) | null = null,
        events: EventTarget | null = null,
    ) {
        Object.defineProperty(this, "isTileManager", { value: true });

        this.sceneParent = new Scene();
        this.scene = new Group();
        this.sceneParent.add(this.scene);

        this.events = events;
        this.tileLoader = tileLoader;

        this.onTileLoad = onTileLoad || function () {};
        this.onTileUnload = onTileUnload || function () {};

        this.viewDistanceX = 1;
        this.viewDistanceZ = 1;
        this.centerTile = new Vector2(0, 0);

        this.currentlyLoading = 0;
        this.loadTimeout = null;

        //map of loaded tiles
        this.tiles = new Map();

        // a canvas that keeps track of the loaded tiles, used for shaders
        this.tileMap = new TileMap(TileManager.tileMapSize, TileManager.tileMapSize);

        this.unloaded = true;
    }

    loadAroundTile(x: number, z: number, viewDistanceX: number, viewDistanceZ: number): void {
        this.unloaded = false;

        let unloadTiles = false;
        if (this.viewDistanceX > viewDistanceX || this.viewDistanceZ > viewDistanceZ) {
            unloadTiles = true;
        }

        this.viewDistanceX = viewDistanceX;
        this.viewDistanceZ = viewDistanceZ;

        if (viewDistanceX <= 0 || viewDistanceZ <= 0) {
            this.removeAllTiles();
            return;
        }

        if (unloadTiles || this.centerTile.x !== x || this.centerTile.y !== z) {
            this.centerTile.set(x, z);
            this.removeFarTiles();

            this.tileMap.setAll(TileMap.EMPTY);
            this.tiles.forEach((tile) => {
                if (!tile.loading && !tile.unloaded) {
                    this.tileMap.setTile(
                        tile.x - this.centerTile.x + TileManager.tileMapHalfSize,
                        tile.z - this.centerTile.y + TileManager.tileMapHalfSize,
                        TileMap.LOADED,
                    );
                }
            });
        }

        this.loadCloseTiles();
    }

    unload(): void {
        this.unloaded = true;
        this.removeAllTiles();
    }

    removeFarTiles(): void {
        this.tiles.forEach((tile, hash, map) => {
            if (
                tile.x + this.viewDistanceX < this.centerTile.x ||
                tile.x - this.viewDistanceX > this.centerTile.x ||
                tile.z + this.viewDistanceZ < this.centerTile.y ||
                tile.z - this.viewDistanceZ > this.centerTile.y
            ) {
                tile.unload();
                map.delete(hash);
            }
        });
    }

    removeAllTiles(): void {
        this.tileMap.setAll(TileMap.EMPTY);

        this.tiles.forEach((tile) => {
            tile.unload();
        });
        this.tiles.clear();
    }

    loadCloseTiles = (): void => {
        if (this.unloaded) return;
        if (!this.loadNextTile()) return;

        if (this.loadTimeout) clearTimeout(this.loadTimeout);

        if (this.currentlyLoading < 8) {
            this.loadTimeout = setTimeout(this.loadCloseTiles, 0);
        } else {
            this.loadTimeout = setTimeout(this.loadCloseTiles, 1000);
        }
    };

    loadNextTile(): boolean {
        if (this.unloaded) return false;

        let x = 0;
        let z = 0;
        let d = 1;
        let m = 1;

        while (m < Math.max(this.viewDistanceX, this.viewDistanceZ) * 2 + 1) {
            while (2 * x * d < m) {
                if (this.tryLoadTile(this.centerTile.x + x, this.centerTile.y + z)) return true;
                x = x + d;
            }
            while (2 * z * d < m) {
                if (this.tryLoadTile(this.centerTile.x + x, this.centerTile.y + z)) return true;
                z = z + d;
            }
            d = -1 * d;
            m = m + 1;
        }

        return false;
    }

    tryLoadTile(x: number, z: number): boolean {
        if (this.unloaded) return false;

        if (Math.abs(x - this.centerTile.x) > this.viewDistanceX) return false;
        if (Math.abs(z - this.centerTile.y) > this.viewDistanceZ) return false;

        const tileHash = hashTile(x, z);

        let tile = this.tiles.get(tileHash);
        if (tile !== undefined) return false;

        this.currentlyLoading++;

        tile = new Tile(x, z, this.handleLoadedTile, this.handleUnloadedTile);
        this.tiles.set(tileHash, tile);
        tile.load(this.tileLoader)
            .then(() => {
                dispatchEvent(this.events, "bluemapTileLoaded", {
                    tileManager: this,
                    tile: tile,
                });

                if (this.loadTimeout) clearTimeout(this.loadTimeout);
                this.loadTimeout = setTimeout(this.loadCloseTiles, 0);
            })
            .catch(() => {})
            .finally(() => {
                this.currentlyLoading--;
            });

        return true;
    }

    handleLoadedTile = (tile: Tile): void => {
        this.tileMap.setTile(
            tile.x - this.centerTile.x + TileManager.tileMapHalfSize,
            tile.z - this.centerTile.y + TileManager.tileMapHalfSize,
            TileMap.LOADED,
        );

        this.scene.add(tile.model!);
        this.onTileLoad(tile);
    };

    handleUnloadedTile = (tile: Tile): void => {
        this.tileMap.setTile(
            tile.x - this.centerTile.x + TileManager.tileMapHalfSize,
            tile.z - this.centerTile.y + TileManager.tileMapHalfSize,
            TileMap.EMPTY,
        );

        this.scene.remove(tile.model!);
        this.onTileUnload(tile);
    };
}
