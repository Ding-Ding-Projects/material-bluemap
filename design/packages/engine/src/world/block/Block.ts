import type { Biome } from "../biome/Biome.js";
import type { BlockEntity } from "../BlockEntity.js";
import type { BlockState } from "../BlockState.js";
import type { Chunk } from "../Chunk.js";
import { LightData } from "../LightData.js";
import type { World } from "../World.js";
import type { BlockAccess } from "./BlockAccess.js";

export class Block implements BlockAccess {
    private readonly world: World;
    private x = 0;
    private y = 0;
    private z = 0;

    private chunk: Chunk | null = null;

    private blockState: BlockState | null = null;
    private readonly lightData = new LightData(-1, -1);
    private biome: Biome | null = null;

    private isBlockEntitySet = false;
    private blockEntity: BlockEntity | null = null;

    constructor(world: World, x: number, y: number, z: number) {
        this.world = world;
        this.set(x, y, z);
    }

    set(x: number, y: number, z: number): void {
        if (this.x === x && this.z === z) {
            if (this.y === y) return;
        } else {
            this.chunk = null; //only reset the chunk if x or z have changed
        }

        this.x = x;
        this.y = y;
        this.z = z;

        this.blockState = null;
        this.lightData.set(-1, -1);
        this.biome = null;
        this.isBlockEntitySet = false;
        this.blockEntity = null;
    }

    copy(): BlockAccess {
        return new Block(this.world, this.x, this.y, this.z);
    }

    getWorld(): World {
        return this.world;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getZ(): number {
        return this.z;
    }

    getChunk(): Chunk {
        if (this.chunk === null) this.chunk = this.world.getChunkAtBlock(this.x, this.z);
        return this.chunk;
    }

    getBlockState(): BlockState {
        if (this.blockState === null) this.blockState = this.getChunk().getBlockState(this.x, this.y, this.z);
        return this.blockState;
    }

    getLightData(): LightData {
        if (this.lightData.getSkyLight() < 0) this.getChunk().getLightData(this.x, this.y, this.z, this.lightData);
        return this.lightData;
    }

    getBiome(): Biome {
        if (this.biome === null) this.biome = this.getChunk().getBiome(this.x, this.y, this.z);
        return this.biome;
    }

    getBlockEntity(): BlockEntity | null {
        if (!this.isBlockEntitySet) {
            this.blockEntity = this.getChunk().getBlockEntity(this.x, this.y, this.z);
            this.isBlockEntitySet = true;
        }
        return this.blockEntity;
    }

    hasOceanFloorY(): boolean {
        return this.getChunk().hasOceanFloorHeights();
    }

    getOceanFloorY(): number {
        return this.getChunk().getOceanFloorY(this.x, this.z);
    }

    /** (upstream: BlockAccess interface-default) */
    getSunLightLevel(): number {
        return this.getLightData().getSkyLight();
    }

    /** (upstream: BlockAccess interface-default) */
    getBlockLightLevel(): number {
        return this.getLightData().getBlockLight();
    }
}
