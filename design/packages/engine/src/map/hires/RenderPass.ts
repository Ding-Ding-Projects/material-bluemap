import type { Vector3i } from "@material-bluemap/shared";
import type { World } from "../../world/World.js";
import type { TileMetaConsumer } from "../TileMetaConsumer.js";
import type { TileModelView } from "./TileModelView.js";

/**
 * upstream: the `(x, z, c, h, l) -> {}` lambda in `RenderPass`'s default
 * `render(...)` overload — a consumer that discards the heightmap/light data.
 */
export const NOOP_TILE_META_CONSUMER: TileMetaConsumer = () => {
    /* discards everything */
};

/** upstream: map/hires/RenderPass.java */
export interface RenderPass {
    /**
     * Does a pass to render a specified of the world onto the given tileModel.
     *
     * **Implementation Note:** This method is guaranteed to be called only on **one
     * thread per RenderPass instance**, so you can use this for optimizations.
     *
     * @param world The world that should be rendered
     * @param modelMin The min-position of the world that should be included in the tileModel
     * @param modelMax The max-position of the world that should be included in the tileModel
     * @param modelAnchor The position in the world that should be at (0,0,0) in the tileModel
     * @param tileModel The model(-view) where the world should be rendered to.
     * @param tileMetaConsumer A consumer that the RenderPass can call to emit heightmap and
     *   light-data that is produced during rendering. This data is then e.g. used to generate
     *   the lowres-tiles. Upstream's parameter-less overload is the optional argument here,
     *   defaulting to {@link NOOP_TILE_META_CONSUMER}.
     *
     * Upstream returns `void`. A pass that has to read from disk can not, because the
     * port's world layer is asynchronous — `EntityRenderPass` awaits
     * {@link World#iterateEntities} — so the return type admits a promise and every
     * caller (`HiresModelManager`) awaits it. A synchronous pass still just returns.
     */
    render(
        world: World,
        modelMin: Vector3i,
        modelMax: Vector3i,
        modelAnchor: Vector3i,
        tileModel: TileModelView,
        tileMetaConsumer?: TileMetaConsumer,
    ): void | Promise<void>;
}
