import type { Vector3f } from "@material-bluemap/shared";
import type { Entity } from "../../../world/Entity.js";
import type { BlockNeighborhood } from "../../../world/block/BlockNeighborhood.js";
import type { TileModelView } from "../TileModelView.js";

/**
 * Phase D placeholder — replaced by the full port of
 * resources/pack/resourcepack/entitystate/Part.java (renderer-type, model
 * resource-path, position, rotation and the cached transform-matrix).
 *
 * Declared here because {@link EntityRenderer} is the only ported surface that mentions
 * it; the mesher wave replaces this with the real Part port.
 */
export interface Part {
    /** upstream: {@code Vector3f getPosition()} (lombok @Getter) */
    getPosition(): Vector3f;
}

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
