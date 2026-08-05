import { Biome } from "./biome/Biome.js";
import type { BlockEntity } from "./BlockEntity.js";
import { BlockState } from "./BlockState.js";
import type { LightData } from "./LightData.js";

/**
 * upstream: an interface where every method has a default implementation;
 * ported as an abstract class so implementations inherit those defaults
 */
export abstract class Chunk {
    static readonly EMPTY_CHUNK: Chunk = new (class extends Chunk {})();
    static readonly ERRORED_CHUNK: Chunk = new (class extends Chunk {})();

    isGenerated(): boolean {
        return false;
    }

    /**
     * Port-only, no upstream analog: `true` for a pre-flattening (1.12.2 and older,
     * `DataVersion` < 1451) chunk. Consulted by {@link BlockStateModelRenderer} to decide
     * whether {@link flattenLegacyBlockState} may run — see FlatteningRename.ts's doc
     * comment for why that gate matters.
     */
    isLegacy(): boolean {
        return false;
    }

    hasLightData(): boolean {
        return false;
    }

    getInhabitedTime(): number {
        return 0;
    }

    getBlockState(_x: number, _y: number, _z: number): BlockState {
        return BlockState.AIR;
    }

    getLightData(_x: number, _y: number, _z: number, target: LightData): LightData {
        return target.set(0, 0);
    }

    getBiome(_x: number, _y: number, _z: number): Biome {
        return Biome.DEFAULT;
    }

    getMaxY(_x: number, _z: number): number {
        return 255;
    }

    getMinY(_x: number, _z: number): number {
        return 0;
    }

    hasWorldSurfaceHeights(): boolean {
        return false;
    }

    getWorldSurfaceY(_x: number, _z: number): number {
        return 0;
    }

    hasOceanFloorHeights(): boolean {
        return false;
    }

    getOceanFloorY(_x: number, _z: number): number {
        return 0;
    }

    getBlockEntity(_x: number, _y: number, _z: number): BlockEntity | null {
        return null;
    }

    iterateBlockEntities(_consumer: (blockEntity: BlockEntity) => void): void {}
}
