import { describe, expect, it } from "vitest";
import { Biome } from "../biome/Biome.js";
import type { BlockEntity } from "../BlockEntity.js";
import { BlockState } from "../BlockState.js";
import { DimensionType } from "../DimensionType.js";
import { LightData } from "../LightData.js";
import type { BlockAccess } from "./BlockAccess.js";
import { BlockNeighborhood } from "./BlockNeighborhood.js";

/** Minimal in-memory BlockAccess used to drive the ExtendedBlock/BlockNeighborhood cursors */
class TestBlockAccess implements BlockAccess {
    private x = 0;
    private y = 0;
    private z = 0;
    private readonly lightData = new LightData(15, 0);

    set(x: number, y: number, z: number): void {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    copy(): BlockAccess {
        const copy = new TestBlockAccess();
        copy.set(this.x, this.y, this.z);
        return copy;
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

    getBlockState(): BlockState {
        return BlockState.AIR;
    }
    getLightData(): LightData {
        return this.lightData;
    }
    getBiome(): Biome {
        return Biome.DEFAULT;
    }
    getBlockEntity(): BlockEntity | null {
        return null;
    }

    hasOceanFloorY(): boolean {
        return false;
    }
    getOceanFloorY(): number {
        return 0;
    }

    getSunLightLevel(): number {
        return this.getLightData().getSkyLight();
    }
    getBlockLightLevel(): number {
        return this.getLightData().getBlockLight();
    }
}

// the sibling ResourcePack / RenderSettings modules are ported separately; the
// neighborhood coordinate logic under test never touches them (isRenderEdges: false
// keeps every code path off the render mask and the resource pack)
const renderSettings = {
    isRenderEdges: () => false,
} as never;
const resourcePack = {} as never;

function createNeighborhood(): BlockNeighborhood {
    return new BlockNeighborhood(
        new TestBlockAccess(),
        resourcePack,
        renderSettings,
        DimensionType.OVERWORLD,
    );
}

describe("BlockNeighborhood", () => {
    it("takes the position it is set to", () => {
        const block = createNeighborhood();
        block.set(12, -3, 7);
        expect(block.getX()).toBe(12);
        expect(block.getY()).toBe(-3);
        expect(block.getZ()).toBe(7);
    });

    it("returns itself for the 0,0,0 neighbor", () => {
        const block = createNeighborhood();
        block.set(5, 64, -9);
        expect(block.getNeighborBlock(0, 0, 0)).toBe(block);
    });

    it("returns neighbors at the correct offset position", () => {
        const block = createNeighborhood();
        block.set(16, 70, -32);

        const neighbor = block.getNeighborBlock(1, -2, 3);
        expect(neighbor.getX()).toBe(17);
        expect(neighbor.getY()).toBe(68);
        expect(neighbor.getZ()).toBe(-29);
    });

    it("caches neighbor instances per neighborhood-slot", () => {
        const block = createNeighborhood();
        block.set(0, 0, 0);

        const first = block.getNeighborBlock(1, 0, 0);
        const second = block.getNeighborBlock(1, 0, 0);
        expect(second).toBe(first);

        // a different offset uses a different slot/instance
        const other = block.getNeighborBlock(0, 1, 0);
        expect(other).not.toBe(first);
    });

    it("maps offsets to slots modulo the neighborhood diameter (8)", () => {
        const block = createNeighborhood();
        block.set(0, 0, 0);

        // -1 & 7 === 7: negative offsets wrap into the same array
        const negative = block.getNeighborBlock(-1, 0, 0);
        expect(negative.getX()).toBe(-1);

        // +7 lands on the same slot as -1 (7 & 7 === 7) and re-positions that instance
        const wrapped = block.getNeighborBlock(7, 0, 0);
        expect(wrapped).toBe(negative);
        expect(wrapped.getX()).toBe(7);

        // a full diameter away lands on this block's own slot, so it returns itself
        // (upstream behavior: the neighborhood only supports offsets within the diameter)
        expect(block.getNeighborBlock(8, 0, 0)).toBe(block);
    });

    it("moving the cursor onto a cached neighbor position reuses its slot", () => {
        const block = createNeighborhood();
        block.set(3, 10, 3);

        const neighbor = block.getNeighborBlock(1, 0, 0);
        expect(neighbor.getX()).toBe(4);

        block.set(4, 10, 3); // same slot as the cached neighbor
        expect(block.getX()).toBe(4);
        expect(block.getY()).toBe(10);
        expect(block.getZ()).toBe(3);

        // and setting to the position it is already on is a no-op fast-path
        block.set(4, 10, 3);
        expect(block.getX()).toBe(4);
    });

    it("delegates block data to the underlying access", () => {
        const block = createNeighborhood();
        block.set(1, 2, 3);
        expect(block.getBlockState()).toBe(BlockState.AIR);
        expect(block.getBiome()).toBe(Biome.DEFAULT);
        expect(block.getSunLightLevel()).toBe(15);
        expect(block.getBlockLightLevel()).toBe(0);
        expect(block.getBlockEntity()).toBeNull();
        expect(block.hasOceanFloorY()).toBe(false);
        expect(block.getNeighborBlock(0, 1, 0).getBlockState().isAir()).toBe(true);
    });
});
