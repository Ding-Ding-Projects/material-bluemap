import type { WorldInspection } from "../world/worldFolder.js";
import { UNKNOWN_WORLD, type WorldOrientation } from "./maskCanvas.js";
import { probeWorldFolder, resolveOptionalWorldBridge } from "../world/worldBridge.js";

/** The measured canvas context for one inspected dimension, without guessed coordinates. */
export function maskWorldFor(
    inspection: WorldInspection,
    dimensionKey: string,
): WorldOrientation {
    const dimension = inspection.dimensions.find((candidate) => candidate.key === dimensionKey);
    const extent = dimension?.regionExtent ?? null;
    const overworld = dimensionKey === "minecraft:overworld";
    const spawn = overworld ? (inspection.spawn ?? null) : null;
    return {
        extent,
        extentUnavailableReason:
            extent === null
                ? inspection.unchecked
                    ? UNKNOWN_WORLD.extentUnavailableReason
                    : `No readable region-file extent was reported for ${dimensionKey}.`
                : null,
        spawn,
        spawnUnavailableReason:
            spawn === null
                ? overworld
                    ? (inspection.spawnError ?? "This build did not report the world's spawn point.")
                    : `Minecraft's world spawn belongs to the overworld, not ${dimensionKey}.`
                : null,
        regionCount: dimension?.regionFiles ?? null,
    };
}

/** Reads the real folder through the optional desktop bridge; browser builds stay honest. */
export async function inspectMaskWorld(
    folder: string,
    dimensionKey: string,
): Promise<WorldOrientation> {
    if (folder.trim() === "") return UNKNOWN_WORLD;
    const inspection = await probeWorldFolder(resolveOptionalWorldBridge(), folder);
    return maskWorldFor(inspection, dimensionKey);
}
