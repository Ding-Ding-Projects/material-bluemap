import { Key } from "@material-bluemap/shared";
import { DimensionType } from "../../../world/DimensionType.js";
import type { Biome } from "../../../world/biome/Biome.js";
import { LegacyBiomes } from "../../../world/mca/chunk/LegacyBiomes.js";
import { parse } from "../../adapter/JsonMapper.js";
import { ResourcePath } from "../../ResourcePath.js";
import { Pack } from "../Pack.js";
import type { PackVersion } from "../PackVersion.js";
import { ResourcePool } from "../ResourcePool.js";
import type { PackPath } from "../vfs/PackFileSystem.js";
import { DatapackBiome, Data as DatapackBiomeData } from "./biome/DatapackBiome.js";
import { DimensionTypeData } from "./dimension/DimensionTypeData.js";

/**
 * upstream: resources/pack/datapack/DataPack.java
 *
 * Everything upstream does is here; only the *shape* of the export differs. Upstream
 * {@code DataPack} is one class, while this module exports the lookup-surface as an
 * {@code interface} (the type every consumer in {@code world/mca} was already written
 * against, including object-literal stand-ins in their tests) plus the concrete
 * {@code Pack}-subclass as the value of the same name — so {@code new DataPack(version)},
 * {@code DataPack.DIMENSION_OVERWORLD} and {@code dataPack: DataPack} all keep meaning
 * exactly what they meant. See docs/deviations.md.
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

/** the lookup-surface of a loaded datapack (upstream: DataPack's public getters) */
export interface DataPack {
    /** upstream: {@code @Nullable DimensionType getDimensionType(Key)} */
    getDimensionType(key: Key): DimensionType | null;

    /** upstream: {@code @Nullable Biome getBiome(Key)} */
    getBiome(key: Key): Biome | null;
    /** upstream: {@code @Nullable Biome getBiome(int legacyId)} (via LegacyBiomes) */
    getBiome(legacyId: number): Biome | null;
}

class DataPackImpl extends Pack implements DataPack {
    static readonly DIMENSION_OVERWORLD: Key = new Key("minecraft", "overworld");
    static readonly DIMENSION_THE_NETHER: Key = new Key("minecraft", "the_nether");
    static readonly DIMENSION_THE_END: Key = new Key("minecraft", "the_end");

    static readonly DIMENSION_TYPE_OVERWORLD: Key = new Key("minecraft", "overworld");
    static readonly DIMENSION_TYPE_OVERWORLD_CAVES: Key = new Key("minecraft", "overworld_caves");
    static readonly DIMENSION_TYPE_THE_NETHER: Key = new Key("minecraft", "the_nether");
    static readonly DIMENSION_TYPE_THE_END: Key = new Key("minecraft", "the_end");

    private readonly dimensionTypes = new ResourcePool<DimensionType>();
    private readonly biomes = new ResourcePool<Biome>();

    private legacyBiomes: LegacyBiomes | null = null;

    constructor(packVersion: PackVersion) {
        super(packVersion);
    }

    override async loadResources(roots: Iterable<PackPath>): Promise<void> {
        logDebug("Loading datapack...");

        for (const root of roots) {
            logDebug("Loading datapack from: " + root + " ...");
            await this.loadResourcesFromRoot(root);
        }

        logDebug("Baking datapack...");
        this.bake();

        logDebug("Datapack loaded.");
    }

    /** upstream: the private {@code loadResources(Path)} overload (renamed — TS has no
     * method overloading by parameter type between a public and a private member) */
    private async loadResourcesFromRoot(root: PackPath): Promise<void> {
        await this.loadResourcePath(root, { load: (packRoot) => this.loadPath(packRoot) });
    }

    private async loadPath(root: PackPath): Promise<void> {
        for (const namespaceRoot of await Pack.list(root.resolve("data"))) {
            const dimensionTypeRoot = namespaceRoot.resolve("dimension_type");
            if (!(await dimensionTypeRoot.isDirectory())) continue;

            for (const file of await Pack.walk(dimensionTypeRoot)) {
                if (!file.getFileName().endsWith(".json")) continue;
                if (!(await file.isRegularFile())) continue;

                await this.dimensionTypes.load(new ResourcePath(root.relativize(file), 1, 3), {
                    load: async () => DimensionTypeData.fromJson(parse(await file.readText())),
                });
            }
        }

        for (const namespaceRoot of await Pack.list(root.resolve("data"))) {
            const biomeRoot = namespaceRoot.resolve("worldgen").resolve("biome");
            if (!(await biomeRoot.isDirectory())) continue;

            for (const file of await Pack.walk(biomeRoot)) {
                if (!file.getFileName().endsWith(".json")) continue;
                if (!(await file.isRegularFile())) continue;

                await this.biomes.load(new ResourcePath(root.relativize(file), 1, 4), {
                    load: async (key) =>
                        new DatapackBiome(
                            key,
                            DatapackBiomeData.fromJson(parse(await file.readText())),
                        ),
                });
            }
        }
    }

    bake(): void {
        this.dimensionTypes.putIfAbsent(
            DataPackImpl.DIMENSION_TYPE_OVERWORLD,
            DimensionType.OVERWORLD,
        );
        this.dimensionTypes.putIfAbsent(
            DataPackImpl.DIMENSION_TYPE_OVERWORLD_CAVES,
            DimensionType.OVERWORLD_CAVES,
        );
        this.dimensionTypes.putIfAbsent(
            DataPackImpl.DIMENSION_TYPE_THE_NETHER,
            DimensionType.NETHER,
        );
        this.dimensionTypes.putIfAbsent(DataPackImpl.DIMENSION_TYPE_THE_END, DimensionType.END);

        this.legacyBiomes = new LegacyBiomes(this);
    }

    getDimensionType(key: Key): DimensionType | null {
        return this.dimensionTypes.get(key);
    }

    getBiome(key: Key): Biome | null;
    getBiome(legacyId: number): Biome | null;
    getBiome(keyOrLegacyId: Key | number): Biome | null {
        if (typeof keyOrLegacyId === "number")
            // upstream reads the field directly — a NullPointerException before bake()
            return this.legacyBiomes!.forId(keyOrLegacyId);
        return this.biomes.get(keyOrLegacyId);
    }
}

export const DataPack = DataPackImpl;
