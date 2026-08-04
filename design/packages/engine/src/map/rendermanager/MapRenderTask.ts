import type { BmMap } from "../BmMap.js";
import type { RenderTask } from "./RenderTask.js";

/**
 * upstream: `common/.../rendermanager/MapRenderTask.java`
 *
 * A {@link RenderTask} that belongs to one map. The render manager uses this to answer
 * "is anything currently rendering this map?" without having to know which concrete task
 * it is looking at.
 */
export interface MapRenderTask extends RenderTask {
    getMap(): BmMap;
}
