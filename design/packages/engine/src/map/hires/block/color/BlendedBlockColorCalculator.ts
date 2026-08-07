import { Color } from "@worldlens/shared";
import type { BlockState } from "../../../../world/BlockState.js";
import type { BlockAccess } from "../../../../world/block/BlockAccess.js";
import { BlockNeighborhood } from "../../../../world/block/BlockNeighborhood.js";
import type { BlockColorCalculator } from "./BlockColorCalculator.js";

/** upstream: map/hires/block/color/BlendedBlockColorCalculator.java */
export class BlendedBlockColorCalculator implements BlockColorCalculator {
    private readonly delegate: BlockColorCalculator;
    private readonly blendMinX: number;
    private readonly blendMaxX: number;
    private readonly blendMinY: number;
    private readonly blendMaxY: number;
    private readonly blendMinZ: number;
    private readonly blendMaxZ: number;

    private readonly delegateColor = new Color();

    constructor(delegate: BlockColorCalculator);
    constructor(delegate: BlockColorCalculator, horizontalBlend: number, verticalBlend: number);
    constructor(delegate: BlockColorCalculator, horizontalBlend = 2, verticalBlend = 1) {
        this.delegate = delegate;

        this.blendMinX = -horizontalBlend;
        this.blendMaxX = horizontalBlend;
        this.blendMinY = -verticalBlend;
        this.blendMaxY = verticalBlend;
        this.blendMinZ = -horizontalBlend;
        this.blendMaxZ = horizontalBlend;
    }

    getBlockColor(block: BlockAccess, blockState: BlockState, target: Color): Color {
        target.set(0, 0, 0, 0, true);

        let dx: number, dy: number, dz: number;

        if (block instanceof BlockNeighborhood) {
            const neighborhood = block;
            for (dy = this.blendMinY; dy <= this.blendMaxY; dy++) {
                for (dx = this.blendMinX; dx <= this.blendMaxX; dx++) {
                    for (dz = this.blendMinZ; dz <= this.blendMaxZ; dz++) {
                        this.delegate.getBlockColor(
                            neighborhood.getNeighborBlock(dx, dy, dz),
                            blockState,
                            this.delegateColor,
                        );
                        target.add(this.delegateColor);
                    }
                }
            }
        } else {
            const x = block.getX();
            const y = block.getY();
            const z = block.getZ();
            for (dy = this.blendMinY; dy <= this.blendMaxY; dy++) {
                for (dx = this.blendMinX; dx <= this.blendMaxX; dx++) {
                    for (dz = this.blendMinZ; dz <= this.blendMaxZ; dz++) {
                        block.set(x + dx, y + dy, z + dz);
                        this.delegate.getBlockColor(block, blockState, this.delegateColor);
                        target.add(this.delegateColor);
                    }
                }
            }
            block.set(x, y, z);
        }

        return target.flatten();
    }
}
