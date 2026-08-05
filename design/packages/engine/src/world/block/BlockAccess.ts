import type { Biome } from "../biome/Biome.js";
import type { BlockEntity } from "../BlockEntity.js";
import type { BlockState } from "../BlockState.js";
import type { LightData } from "../LightData.js";

export interface BlockAccess {
    set(x: number, y: number, z: number): void;

    copy(): BlockAccess;

    getX(): number;
    getY(): number;
    getZ(): number;

    getBlockState(): BlockState;
    getLightData(): LightData;
    getBiome(): Biome;
    getBlockEntity(): BlockEntity | null;

    /**
     * Port-only, no upstream analog: `true` when this position's chunk is pre-flattening
     * (see {@link Chunk#isLegacy}). Consulted by `BlockStateModelRenderer` to gate
     * `flattenLegacyBlockState`.
     */
    isLegacy(): boolean;

    hasOceanFloorY(): boolean;
    getOceanFloorY(): number;

    /** (upstream interface-default: {@code getLightData().getSkyLight()}) */
    getSunLightLevel(): number;

    /** (upstream interface-default: {@code getLightData().getBlockLight()}) */
    getBlockLightLevel(): number;
}
