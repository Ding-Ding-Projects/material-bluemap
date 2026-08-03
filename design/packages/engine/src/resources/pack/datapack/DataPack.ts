import { Key } from "@material-bluemap/shared";
import type { DimensionType } from "../../../world/DimensionType.js";
import type { Biome } from "../../../world/biome/Biome.js";

/**
 * Phase C placeholder — replaced by the full port of
 * resources/pack/datapack/DataPack.java (the Pack-loading of dimension_type /
 * worldgen/biome json resources, ResourcePools and bake()).
 *
 * Only the lookup-surface the world/mca layer consumes is declared here; the
 * dimension / dimension-type key constants are the real upstream statics.
 */
export interface DataPack {
    /** upstream: {@code @Nullable DimensionType getDimensionType(Key)} */
    getDimensionType(key: Key): DimensionType | null;

    /** upstream: {@code @Nullable Biome getBiome(Key)} */
    getBiome(key: Key): Biome | null;
    /** upstream: {@code @Nullable Biome getBiome(int legacyId)} (via LegacyBiomes) */
    getBiome(legacyId: number): Biome | null;
}

export const DataPack = {
    DIMENSION_OVERWORLD: new Key("minecraft", "overworld"),
    DIMENSION_THE_NETHER: new Key("minecraft", "the_nether"),
    DIMENSION_THE_END: new Key("minecraft", "the_end"),

    DIMENSION_TYPE_OVERWORLD: new Key("minecraft", "overworld"),
    DIMENSION_TYPE_OVERWORLD_CAVES: new Key("minecraft", "overworld_caves"),
    DIMENSION_TYPE_THE_NETHER: new Key("minecraft", "the_nether"),
    DIMENSION_TYPE_THE_END: new Key("minecraft", "the_end"),
};
