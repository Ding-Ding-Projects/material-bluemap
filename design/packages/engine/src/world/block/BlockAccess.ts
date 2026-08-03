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

    hasOceanFloorY(): boolean;
    getOceanFloorY(): number;

    /** (upstream interface-default: {@code getLightData().getSkyLight()}) */
    getSunLightLevel(): number;

    /** (upstream interface-default: {@code getLightData().getBlockLight()}) */
    getBlockLightLevel(): number;
}
