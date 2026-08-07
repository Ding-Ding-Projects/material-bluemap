import { existsSync } from "node:fs";
import { join } from "node:path";
import { Key, Registry, Vector2i, type Keyed } from "@worldlens/shared";
import type { Region } from "../../Region.js";
import type { ChunkLoader } from "../ChunkLoader.js";
import { javaParseInt, NumberFormatError } from "../MCAUtil.js";
import { MCARegion } from "./MCARegion.js";
import { LinearRegion } from "./LinearRegion.js";

export type RegionFactory = <T>(chunkLoader: ChunkLoader<T>, regionFile: string) => Region<T>;

export type RegionFileNameFunction = (regionX: number, regionZ: number) => string;

export interface RegionType extends Keyed {
    /**
     * Creates a new {@link Region} from the given world and region-file
     */
    createRegion<T>(chunkLoader: ChunkLoader<T>, regionFile: string): Region<T>;

    /**
     * Converts region coordinates into the region-file name.
     */
    getRegionFileName(regionX: number, regionZ: number): string;

    /**
     * Converts the region-file name into region coordinates.
     * Returns null if the name does not match the expected format.
     */
    getRegionFromFileName(fileName: string): Vector2i | null;
}

/** upstream: RegionType.Impl */
class Impl implements RegionType {
    constructor(
        private readonly key: Key,
        private readonly regionFactory: RegionFactory,
        private readonly regionFileNameFunction: RegionFileNameFunction,
        private readonly regionFileNamePattern: RegExp,
    ) {}

    getKey(): Key {
        return this.key;
    }

    createRegion<T>(chunkLoader: ChunkLoader<T>, regionFile: string): Region<T> {
        return this.regionFactory(chunkLoader, regionFile);
    }

    getRegionFileName(regionX: number, regionZ: number): string {
        return this.regionFileNameFunction(regionX, regionZ);
    }

    getRegionFromFileName(fileName: string): Vector2i | null {
        const matcher = this.regionFileNamePattern.exec(fileName);
        if (matcher == null) return null;

        try {
            const regionX = javaParseInt(matcher[1]!);
            const regionZ = javaParseInt(matcher[2]!);

            // sanity-check for roughly minecraft max boundaries (-30 000 000 to 30 000 000)
            if (regionX < -100000 || regionX > 100000 || regionZ < -100000 || regionZ > 100000) {
                return null;
            }

            return new Vector2i(regionX, regionZ);
        } catch (ex) {
            if (ex instanceof NumberFormatError) return null;
            throw ex;
        }
    }
}

const MCA: RegionType = new Impl(
    Key.bluemap("mca"),
    (chunkLoader, regionFile) => new MCARegion(chunkLoader, regionFile),
    MCARegion.getRegionFileName,
    MCARegion.FILE_PATTERN,
);
const LINEAR: RegionType = new Impl(
    Key.bluemap("linear"),
    (chunkLoader, regionFile) => new LinearRegion(chunkLoader, regionFile),
    LinearRegion.getRegionFileName,
    LinearRegion.FILE_PATTERN,
);

const DEFAULT: RegionType = MCA;
const REGISTRY: Registry<RegionType> = new Registry<RegionType>(MCA, LINEAR);

export const RegionType = {
    MCA,
    LINEAR,
    DEFAULT,
    REGISTRY,

    Impl,

    forFileName(fileName: string): RegionType | null {
        for (const regionType of REGISTRY.values()) {
            if (regionType.getRegionFromFileName(fileName) != null) return regionType;
        }

        return null;
    },

    regionForFileName(fileName: string): Vector2i | null {
        for (const regionType of REGISTRY.values()) {
            const pos = regionType.getRegionFromFileName(fileName);
            if (pos != null) return pos;
        }

        return null;
    },

    loadRegion<T>(
        chunkLoader: ChunkLoader<T>,
        regionFolder: string,
        regionX: number,
        regionZ: number,
    ): Region<T> {
        for (const regionType of REGISTRY.values()) {
            const regionFile = join(regionFolder, regionType.getRegionFileName(regionX, regionZ));
            if (existsSync(regionFile)) return regionType.createRegion(chunkLoader, regionFile);
        }
        return DEFAULT.createRegion(
            chunkLoader,
            join(regionFolder, DEFAULT.getRegionFileName(regionX, regionZ)),
        );
    },
};
