import { TypeToken } from "@worldlens/nbt";
import type { Vector2i } from "@worldlens/shared";
import type { BmMap } from "../../BmMap.js";
import type { RenderTask } from "../RenderTask.js";
import type { TileUpdateStrategy } from "../TileUpdateStrategy.js";

/**
 * The {@link TypeToken}s the render-task queue's serialization wiring registers on its own
 * dedicated {@link BlueNBT} instance (built fresh per save/load by
 * {@link createRenderTaskBlueNBT}, exactly as upstream's `Plugin#createRenderTaskBlueNBT`
 * builds its own rather than reusing some shared instance).
 *
 * Centralised here — rather than declared beside each type the way {@link TileState}
 * exports `TILE_STATE_TOKEN` next to itself — because none of `BmMap`, `Vector2i` or
 * `TileUpdateStrategy` belong to this feature: this module is the one place that needed a
 * token for them, so it is the one place that defines them, instead of teaching three
 * unrelated files about a render-task queue file-format they otherwise have no reason to
 * know exists. The identifiers are namespaced (`rendermanager....`) so they cannot collide
 * with an unrelated token some other subsystem's own `BlueNBT` instance happens to intern
 * under the same short name (which would be harmless anyway, since token identity only
 * matters *within* one `BlueNBT` instance's registration maps, but the prefix costs
 * nothing and avoids ever having to reason about it).
 */
export const BM_MAP_TOKEN: TypeToken<BmMap> = TypeToken.of("rendermanager.BmMap");

export const VECTOR2I_TOKEN: TypeToken<Vector2i> = TypeToken.of("rendermanager.Vector2i");

export const TILE_UPDATE_STRATEGY_TOKEN: TypeToken<TileUpdateStrategy> = TypeToken.of(
    "rendermanager.TileUpdateStrategy",
);

/** upstream: `TypeToken.of(RenderTask.class)` */
export const RENDER_TASK_TOKEN: TypeToken<RenderTask> = TypeToken.of("rendermanager.RenderTask");

/** upstream: the anonymous `new TypeToken<>() {}` capturing `List<RenderTask>` */
export const RENDER_TASK_LIST_TOKEN: TypeToken<RenderTask[]> = TypeToken.of(
    "rendermanager.RenderTask[]",
);
