import type { Color } from "@material-bluemap/shared";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TileModelView } from "../TileModelView.js";

/**
 * Phase D placeholder — replaced by the full port of
 * resources/pack/resourcepack/blockstate/Variant.java (renderer-type, model
 * resource-path, x/y/z rotation, uvlock, weight and the cached transform-matrix).
 *
 * Declared here because {@link BlockRenderer} is the only ported surface that mentions
 * it; the mesher wave replaces this with the real Variant port.
 */
export interface Variant {
    /** upstream: {@code double getWeight()} (lombok @Getter) */
    getWeight(): number;
}

/** upstream: map/hires/block/BlockRenderer.java */
export interface BlockRenderer {
    /**
     * Renders the given blocks (block-state-)variant into the given tileModel, and sets the given blockColor to the
     * color that represents the rendered block.
     * <p>
     *  <b>Implementation Note:</b><br>
     *  This method is guaranteed to be called only on <b>one thread per BlockRenderer instance</b>, so you can use this
     *  for optimizations.<br>
     *  Keep in mind this method will be called once for every block that is being rendered, so be very careful
     *  about performance and instance-creations.
     * </p>
     * @param block The block information that should be rendered.
     * @param variant The block-state variant that should be rendered.
     * @param tileModel The model(-view) where the block should be rendered to.
     * @param blockColor The color that should be set to the color that represents the rendered block.
     */
    render(
        block: BlockNeighborhood,
        variant: Variant,
        tileModel: TileModelView,
        blockColor: Color,
    ): void;
}
