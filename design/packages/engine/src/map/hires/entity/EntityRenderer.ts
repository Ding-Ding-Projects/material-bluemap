import type { Part } from "../../../resources/pack/resourcepack/entitystate/Part.js";
import type { Entity } from "../../../world/Entity.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TileModelView } from "../TileModelView.js";

/** upstream: map/hires/entity/EntityRenderer.java */
export interface EntityRenderer {
    /**
     * Renders the given entities part into the given tileModel.
     * <p>
     *  <b>Implementation Note:</b><br>
     *  This method is guaranteed to be called only on <b>one thread per EntityRenderer instance</b>, so you can use this
     *  for optimizations.<br>
     *  Keep in mind this method will be called once for every block that is being rendered, so be very careful
     *  about performance and instance-creations.
     * </p>
     * @param entity The entity information that should be rendered.
     * @param block the block-position the entity lives at.
     * @param part The entity part that should be rendered.
     * @param tileModel The model(-view) where the block should be rendered to.
     */
    render(entity: Entity, block: BlockNeighborhood, part: Part, tileModel: TileModelView): void;
}
