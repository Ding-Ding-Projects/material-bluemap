import type { RenderSettings } from "../../map/hires/RenderSettings.js";
import type { ResourcePack } from "../../resources/pack/resourcepack/ResourcePack.js";
import type { DimensionType } from "../DimensionType.js";
import type { BlockAccess } from "./BlockAccess.js";
import { ExtendedBlock } from "./ExtendedBlock.js";

const DIAMETER = 8; // must be a power of 2
const DIAMETER_MASK = DIAMETER - 1;
const DIAMETER_SQUARED = DIAMETER * DIAMETER;

export class BlockNeighborhood extends ExtendedBlock {
    private readonly neighborhood: (ExtendedBlock | null)[];

    // note: upstream has both a field and a method named thisIndex; the field is
    // renamed since JS can not have both on one class
    private thisIndexCache = -1;

    constructor(
        blockAccess: BlockAccess,
        resourcePack: ResourcePack,
        renderSettings: RenderSettings,
        dimensionType: DimensionType,
    ) {
        super(blockAccess, resourcePack, renderSettings, dimensionType);

        this.neighborhood = new Array<ExtendedBlock | null>(DIAMETER * DIAMETER * DIAMETER).fill(null);
    }

    override set(x: number, y: number, z: number): void {
        const i = this.index(x, y, z);
        if (i === this.thisIndex()) return;

        let block = this.neighborhood[i] ?? null;
        if (block === null) {
            block = this.copy();
            this.neighborhood[i] = block;
        }
        block.set(x, y, z);
        this.copyFrom(block);
        this.thisIndexCache = i;
    }

    getNeighborBlock(dx: number, dy: number, dz: number): ExtendedBlock {
        return this.getBlock(this.getX() + dx, this.getY() + dy, this.getZ() + dz);
    }

    private getBlock(x: number, y: number, z: number): ExtendedBlock {
        const i = this.index(x, y, z);
        if (i === this.thisIndex()) return this;

        let block = this.neighborhood[i] ?? null;
        if (block === null) {
            block = this.copy();
            this.neighborhood[i] = block;
        }
        block.set(x, y, z);
        return block;
    }

    private thisIndex(): number {
        if (this.thisIndexCache === -1)
            this.thisIndexCache = this.index(this.getX(), this.getY(), this.getZ());
        return this.thisIndexCache;
    }

    private index(x: number, y: number, z: number): number {
        return (
            (x & DIAMETER_MASK) * DIAMETER_SQUARED +
            (y & DIAMETER_MASK) * DIAMETER +
            (z & DIAMETER_MASK)
        );
    }
}
