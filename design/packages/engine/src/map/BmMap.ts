import { Grid, type Color, type Vector2i } from "@material-bluemap/shared";
import type { ResourcePack } from "../resources/pack/resourcepack/ResourcePack.js";
import type { MapStorage } from "../storage/MapStorage.js";
import type { World } from "../world/World.js";
import { HiresModelManager } from "./hires/HiresModelManager.js";
import { MapChunkState } from "./renderstate/MapChunkState.js";
import { MapRegionState } from "./renderstate/MapRegionState.js";
import { MapTileState } from "./renderstate/MapTileState.js";
import { MapSettingsSerializer } from "./MapSettingsSerializer.js";
import type { MapSettings } from "./MapSettings.js";
import { TextureGallery } from "./TextureGallery.js";

/*
 * upstream: Logger.global — the logger-package is not part of this port (yet), see the
 * equivalent note in world/mca/MCAUtil.ts
 */
function logDebug(message: string): void {
    console.debug(message);
}

function logError(message: string, ex: unknown): void {
    console.error(message, ex);
}

/**
 * The part of {@code map/lowres/LowresTileManager} that {@link BmMap} drives.
 *
 * Declared structurally because `map/lowres/LowresTileManager.ts` is being written in
 * the same wave as this file; the concrete class satisfies it without naming it, and
 * this block is replaced by a plain `import type` the moment it lands. Every member is
 * upstream's, with upstream's signature, so nothing can quietly diverge in the meantime
 * (see docs/deviations.md).
 */
export interface LowresTileManagerLike {
    getTileGrid(): Grid;
    getLodCount(): number;
    getLodFactor(): number;
    /** upstream: {@code TileMetaConsumer#set} — LowresTileManager implements it */
    set(x: number, z: number, color: Color, height: number, blockLight: number): void;
    save(): void | Promise<void>;
}

/** Constructs a {@link LowresTileManagerLike}; upstream: {@code new LowresTileManager(...)} */
export type LowresTileManagerFactory = (
    storage: MapStorage,
    tileGrid: Grid,
    lodCount: number,
    lodFactor: number,
) => LowresTileManagerLike;

/**
 * A marker-set (upstream: {@code de.bluecolored.bluemap.api.markers.MarkerSet}).
 *
 * The markers API is Phase H, so nothing can put one in the map yet and the only
 * document {@link BmMap#saveMarkerState} can currently produce is the empty `{}` that
 * upstream's {@code MarkerGson} writes for an empty map — which is exactly what a render
 * with no configured marker-sets writes. See docs/deviations.md.
 */
export type MarkerSet = never;

/**
 * upstream: map/BmMap.java
 *
 * Ties a world, a resource pack, a storage and the renderers together; this is what a
 * render actually drives.
 *
 * Port notes:
 * - Upstream's constructor does storage IO (it loads the render-state and the texture
 *   gallery and writes `settings.json`), which cannot be done from a javascript
 *   constructor. It becomes the static async {@link BmMap.create}; the constructor is
 *   private and takes the already-loaded pieces.
 * - Every `save`/`render` is async for the same reason — the ported storage layer is.
 * - Upstream's `synchronized` on the save-methods has no counterpart: javascript has no
 *   preemption. What it *does* have is interleaving at every `await`, so
 *   {@link BmMap.save} serialises itself through a promise-chain rather than pretending
 *   the question does not arise (see docs/deviations.md).
 */
export class BmMap {
    private readonly id: string;
    private readonly name: string;
    private readonly world: World;
    private readonly storage: MapStorage;
    private readonly mapSettings: MapSettings;

    private readonly resourcePack: ResourcePack;
    private readonly textureGallery: TextureGallery;

    private readonly mapTileState: MapTileState;
    private readonly mapChunkState: MapChunkState;
    private readonly mapRegionState: MapRegionState;

    private readonly hiresModelManager: HiresModelManager;
    private readonly lowresTileManager: LowresTileManagerLike;

    private readonly markerSets = new Map<string, MarkerSet>();

    private tileFilter: (tile: Vector2i) => boolean;

    private renderTimeSumNanos = 0n;
    private tilesRendered = 0;
    private lastSaveTime = -1;

    /** upstream: `synchronized` — see the class note */
    private saveChain: Promise<void> = Promise.resolve();

    private constructor(
        id: string,
        name: string,
        world: World,
        storage: MapStorage,
        resourcePack: ResourcePack,
        settings: MapSettings,
        textureGallery: TextureGallery,
        mapTileState: MapTileState,
        mapChunkState: MapChunkState,
        mapRegionState: MapRegionState,
        hiresModelManager: HiresModelManager,
        lowresTileManager: LowresTileManagerLike,
    ) {
        this.id = id;
        this.name = name;
        this.world = world;
        this.storage = storage;
        this.resourcePack = resourcePack;
        this.mapSettings = settings;
        this.textureGallery = textureGallery;
        this.mapTileState = mapTileState;
        this.mapChunkState = mapChunkState;
        this.mapRegionState = mapRegionState;
        this.hiresModelManager = hiresModelManager;
        this.lowresTileManager = lowresTileManager;

        this.tileFilter = () => true;
    }

    /**
     * upstream: the {@code BmMap(String, String, World, MapStorage, ResourcePack, MapSettings)}
     * constructor.
     *
     * @param createLowresTileManager builds the lowres manager. It is a parameter only
     *        while `map/lowres/LowresTileManager.ts` is being written in this same wave;
     *        it defaults to the real class once that lands.
     */
    static async create(
        id: string,
        name: string,
        world: World,
        storage: MapStorage,
        resourcePack: ResourcePack,
        settings: MapSettings,
        createLowresTileManager?: LowresTileManagerFactory,
    ): Promise<BmMap> {
        logDebug("Loading render-state for map '" + id + "'");
        const mapTileState = new MapTileState(storage.tileState());
        const mapChunkState = new MapChunkState(storage.chunkState());
        const mapRegionState = new MapRegionState(storage.regionState());

        logDebug("Loading textures for map '" + id + "'");
        const textureGallery = await BmMap.loadTextureGallery(id, storage);
        textureGallery.put(resourcePack.getTextures());

        const hiresModelManager = new HiresModelManager(
            world,
            storage.hiresTiles(),
            resourcePack,
            textureGallery,
            settings,
            new Grid(settings.getHiresTileSize(), 2),
        );

        const lowresFactory = createLowresTileManager ?? BmMap.defaultLowresTileManagerFactory;
        const lowresTileManager = lowresFactory(
            storage,
            new Grid(settings.getLowresTileSize()),
            settings.getLodCount(),
            settings.getLodFactor(),
        );

        const map = new BmMap(
            id,
            name,
            world,
            storage,
            resourcePack,
            settings,
            textureGallery,
            mapTileState,
            mapChunkState,
            mapRegionState,
            hiresModelManager,
            lowresTileManager,
        );

        await map.saveTextureGallery();
        await map.saveMapSettings();

        return map;
    }

    /**
     * Set by `map/lowres/LowresTileManager.ts` when it lands, so callers stop having to
     * pass a factory. Until then, constructing a map without one says exactly that.
     */
    static defaultLowresTileManagerFactory: LowresTileManagerFactory = () => {
        throw new Error(
            "map/lowres/LowresTileManager is not ported yet — pass a factory to BmMap.create",
        );
    };

    getId(): string {
        return this.id;
    }

    getName(): string {
        return this.name;
    }

    getWorld(): World {
        return this.world;
    }

    getStorage(): MapStorage {
        return this.storage;
    }

    getMapSettings(): MapSettings {
        return this.mapSettings;
    }

    getResourcePack(): ResourcePack {
        return this.resourcePack;
    }

    getTextureGallery(): TextureGallery {
        return this.textureGallery;
    }

    getMapTileState(): MapTileState {
        return this.mapTileState;
    }

    getMapChunkState(): MapChunkState {
        return this.mapChunkState;
    }

    getMapRegionState(): MapRegionState {
        return this.mapRegionState;
    }

    getHiresModelManager(): HiresModelManager {
        return this.hiresModelManager;
    }

    getLowresTileManager(): LowresTileManagerLike {
        return this.lowresTileManager;
    }

    getMarkerSets(): Map<string, MarkerSet> {
        return this.markerSets;
    }

    getTileFilter(): (tile: Vector2i) => boolean {
        return this.tileFilter;
    }

    setTileFilter(tileFilter: (tile: Vector2i) => boolean): void {
        this.tileFilter = tileFilter;
    }

    async renderTile(tile: Vector2i): Promise<void> {
        if (!this.tileFilter(tile)) return;

        const start = process.hrtime.bigint();

        await this.hiresModelManager.render(
            tile,
            // upstream passes the LowresTileManager itself, which implements
            // TileMetaConsumer; the ported TileMetaConsumer is a function-type
            (x, z, color, height, blockLight) =>
                this.lowresTileManager.set(x, z, color, height, blockLight),
            this.mapSettings.isSaveHiresLayer(),
        );

        const end = process.hrtime.bigint();
        const delta = end - start;

        this.renderTimeSumNanos += delta;
        this.tilesRendered++;
    }

    async unrenderTile(tile: Vector2i): Promise<void> {
        await this.hiresModelManager.unrender(tile, (x, z, color, height, blockLight) =>
            this.lowresTileManager.set(x, z, color, height, blockLight),
        );
    }

    /**
     * upstream: {@code synchronized boolean save(long minTimeSinceLastSave)} — saves only
     * if enough time has passed since the last save, and reports whether it did.
     */
    async saveIfDue(minTimeSinceLastSave: number): Promise<boolean> {
        const now = Date.now();
        if (now - this.lastSaveTime < minTimeSinceLastSave) return false;

        await this.save();
        return true;
    }

    /** upstream: {@code synchronized void save()} */
    save(): Promise<void> {
        // upstream's `synchronized` keeps two saves from interleaving; the ported saves
        // await, so the same guarantee needs the chain
        this.saveChain = this.saveChain.then(
            () => this.saveNow(),
            () => this.saveNow(),
        );
        return this.saveChain;
    }

    private async saveNow(): Promise<void> {
        await this.lowresTileManager.save();
        await this.mapTileState.save();
        await this.mapChunkState.save();
        await this.mapRegionState.save();
        await this.saveMarkerState();
        await this.savePlayerState();
        await this.saveMapSettings();

        // only save texture gallery if not present in storage
        try {
            if (!(await this.storage.textures().exists())) await this.saveTextureGallery();
        } catch (ex) {
            logError("Failed to read texture gallery for map '" + this.getId() + "'!", ex);
        }

        this.lastSaveTime = Date.now();
    }

    private static async loadTextureGallery(
        id: string,
        storage: MapStorage,
    ): Promise<TextureGallery> {
        try {
            const input = await storage.textures().read();
            if (input !== null)
                return TextureGallery.readTexturesFile((await input.decompress()).toString("utf8"));
        } catch (ex) {
            logError("Failed to load textures for map '" + id + "'!", ex);
        }

        return new TextureGallery();
    }

    private async saveTextureGallery(): Promise<void> {
        try {
            await this.storage
                .textures()
                .write(Buffer.from(this.textureGallery.writeTexturesFile(), "utf8"));
        } catch (ex) {
            logError("Failed to save textures for map '" + this.getId() + "'!", ex);
        }
    }

    /** upstream: {@code synchronized void resetTextureGallery()} */
    resetTextureGallery(): void {
        this.textureGallery.clear();
        this.textureGallery.put(this.resourcePack.getTextures());
    }

    private async saveMapSettings(): Promise<void> {
        try {
            const json = JSON.stringify(MapSettingsSerializer.serialize(this));
            await this.storage.settings().write(Buffer.from(json, "utf8"));
        } catch (ex) {
            logError("Failed to save settings for map '" + this.getId() + "'!", ex);
        }
    }

    /** upstream: {@code synchronized void saveMarkerState()} */
    async saveMarkerState(): Promise<void> {
        try {
            // upstream: MarkerGson.INSTANCE.toJson(this.markerSets, writer). The markers
            // API is Phase H, so the map is always empty and this is always "{}" — the
            // same document a render with no configured marker-sets writes.
            const json = JSON.stringify(Object.fromEntries(this.markerSets));
            await this.storage.markers().write(Buffer.from(json, "utf8"));
        } catch (ex) {
            logError("Failed to save markers for map '" + this.getId() + "'!", ex);
        }
    }

    /** upstream: {@code synchronized void savePlayerState()} */
    async savePlayerState(): Promise<void> {
        try {
            await this.storage.players().write(Buffer.from("{}", "utf8"));
        } catch (ex) {
            // upstream's message says "markers" here too — kept, so a log line found in
            // the wild still points at the same source
            logError("Failed to save markers for map '" + this.getId() + "'!", ex);
        }
    }

    /**
     * upstream: {@code long getAverageNanosPerTile()} — integer division of two longs,
     * so the result is truncated toward zero and dividing by zero tiles throws exactly as
     * upstream's {@code ArithmeticException} does.
     */
    getAverageNanosPerTile(): bigint {
        return this.renderTimeSumNanos / BigInt(this.tilesRendered);
    }

    hashCode(): number {
        // java String#hashCode of the id
        let h = 0;
        for (let i = 0; i < this.id.length; i++) h = (Math.imul(31, h) + this.id.charCodeAt(i)) | 0;
        return h;
    }

    equals(obj: unknown): boolean {
        if (obj instanceof BmMap) return this.id === obj.id;
        return false;
    }

    toString(): string {
        return (
            "BmMap{" +
            "id='" +
            this.id +
            "'" +
            ", name='" +
            this.name +
            "'" +
            ", world=" +
            String(this.world) +
            ", storage=" +
            String(this.storage) +
            "}"
        );
    }
}
