import { Color, type Vector3i } from "@worldlens/shared";
import type { ResourcePack } from "../../../resources/pack/resourcepack/ResourcePack.js";
import type { World } from "../../../world/World.js";
import { Block } from "../../../world/block/Block.js";
import { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TextureGallery } from "../../TextureGallery.js";
import type { TileMetaConsumer } from "../../TileMetaConsumer.js";
import { NOOP_TILE_META_CONSUMER, type RenderPass } from "../RenderPass.js";
import { RenderSettings } from "../RenderSettings.js";
import type { TileModelView } from "../TileModelView.js";
import { BlockStateModelRenderer } from "./BlockStateModelRenderer.js";

/**
 * upstream: map/hires/block/BlockRenderPass.java
 *
 * The block half of a hires tile: for every (x, z) column in the tile it walks the chunk's
 * y-range top-down, meshes each block into the tile-model, translates the freshly-added
 * geometry into place, and accumulates the column's colour, height and top block-light for
 * the lowres tiles.
 */
export class BlockRenderPass implements RenderPass {
    private readonly resourcePack: ResourcePack;
    private readonly renderSettings: RenderSettings;
    private readonly blockRenderer: BlockStateModelRenderer;

    constructor(
        resourcePack: ResourcePack,
        textureGallery: TextureGallery,
        renderSettings: RenderSettings,
    ) {
        this.resourcePack = resourcePack;
        this.renderSettings = renderSettings;
        this.blockRenderer = new BlockStateModelRenderer(
            resourcePack,
            textureGallery,
            renderSettings,
        );
    }

    render(
        world: World,
        modelMin: Vector3i,
        modelMax: Vector3i,
        modelAnchor: Vector3i,
        model: TileModelView,
        tileMetaConsumer: TileMetaConsumer = NOOP_TILE_META_CONSUMER,
    ): void {
        let maxHeight: number, minY: number, maxY: number;
        let topBlockLight: number;
        const columnColor = new Color(),
            blockColor = new Color();
        const block = new BlockNeighborhood(
            new Block(world, 0, 0, 0),
            this.resourcePack,
            this.renderSettings,
            world.getDimensionType(),
        );

        let x: number, y: number, z: number;
        for (x = modelMin.getX(); x <= modelMax.getX(); x++) {
            for (z = modelMin.getZ(); z <= modelMax.getZ(); z++) {
                // upstream: Integer.MIN_VALUE
                maxHeight = -2147483648;
                topBlockLight = 0;

                columnColor.set(0, 0, 0, 0, true);

                if (RenderSettings.isInsideRenderBoundaries(this.renderSettings, x, z)) {
                    const chunk = world.getChunkAtBlock(x, z);
                    minY = Math.max(modelMin.getY(), chunk.getMinY(x, z));
                    maxY = Math.min(modelMax.getY(), chunk.getMaxY(x, z));

                    for (y = maxY; y >= minY; y--) {
                        block.set(x, y, z);
                        if (!block.isInsideRenderBounds()) continue;

                        model.initialize();

                        this.blockRenderer.render(block, model, blockColor);

                        //update topBlockLight
                        // upstream: `int * float` is a float expression, which then widens
                        // into the double `topBlockLight` at the Math.max
                        topBlockLight = Math.max(
                            topBlockLight,
                            Math.fround(block.getBlockLightLevel() * Math.fround(1 - columnColor.a)),
                        );

                        // move block-model to correct position
                        model.translate(
                            x - modelAnchor.getX(),
                            y - modelAnchor.getY(),
                            z - modelAnchor.getZ(),
                        );

                        //update color and height (only if not 100% translucent)
                        if (blockColor.a > 0) {
                            if (maxHeight < y) maxHeight = y;
                            columnColor.underlay(blockColor.premultiplied());
                        }

                        if (
                            this.renderSettings.isRenderTopOnly() &&
                            blockColor.a > 0.999 &&
                            block.getProperties().isCulling()
                        )
                            break;
                    }
                }

                if (maxHeight === -2147483648) maxHeight = 0;

                // upstream: `(int) topBlockLight` — a double-to-int narrowing, which
                // truncates towards zero
                tileMetaConsumer(x, z, columnColor, maxHeight, Math.trunc(topBlockLight));
            }
        }
    }
}
