import { Biome } from "../../biome/Biome.js";
import type { MCAWorld } from "../MCAWorld.js";
import { Chunk_1_13, type Chunk_1_13_Data } from "./Chunk_1_13.js";

export class Chunk_1_15 extends Chunk_1_13 {
    constructor(world: MCAWorld, data: Chunk_1_13_Data) {
        super(world, data);
    }

    override getBiome(x: number, y: number, z: number): Biome {
        if (this.biomes.length < 16) return Biome.DEFAULT;

        let biomeIntIndex = ((y & 0b1100) << 2) | (z & 0b1100) | ((x & 0b1100) >> 2);

        // shift y up/down if not in range
        if (biomeIntIndex >= this.biomes.length)
            biomeIntIndex -= (((biomeIntIndex - this.biomes.length) >> 4) + 1) * 16;
        if (biomeIntIndex < 0) biomeIntIndex -= (biomeIntIndex >> 4) * 16;

        const biome = this.getWorld().getDataPack().getBiome(this.biomes[biomeIntIndex]!);
        return biome != null ? biome : Biome.DEFAULT;
    }
}
