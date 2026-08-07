/**
 * Turns a config folder's `maps/*.conf` (already validated by `config.ts`) into real
 * `BmMap`s: a real `MCAWorld` loaded off disk, a real `FileMapStorage`, the real
 * `ResourcePack`/`DataPack` `resources.ts` resolved, assembled through `BmMap.create`
 * exactly as `BlueMapService#getOrLoadMaps`/`getOrLoadWorld`/`getOrLoadStorage` do.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/BlueMapService.java`
 *
 * A map that cannot be built (unknown storage id, a SQL-typed storage, a loader other than
 * `bluemap:anvil`, a missing `world`/`dimension`) is skipped with an exact, named reason
 * rather than silently dropped or allowed to crash the whole run — every other map still
 * builds. `render.ts` decides whether a skip is fatal for the run as a whole.
 */

import { resolve as resolvePath } from "node:path";
import {
    BmMap,
    BlurMask,
    BoxMask,
    CombinedMask,
    Compression,
    EllipseMask,
    FileStorage,
    Mask,
    MapSettings,
    MCAWorld,
    PolygonMask,
    type BmMap as BmMapType,
    type DataPack,
    type ResourcePack,
    type Shape,
} from "@material-bluemap/engine";
import { Key, Vector2d, Vector2i, Vector3i } from "@material-bluemap/shared";
import type { MapConfig, MaskConfig } from "@material-bluemap/config";
import type { LoadedConfig, StorageEntry } from "./config.js";
import type { Logger } from "./logger.js";

export interface BuiltMaps {
    readonly maps: ReadonlyMap<string, BmMapType>;
    /** map id -> exactly why it was not built. */
    readonly skipped: ReadonlyMap<string, string>;
}

function compressionFor(storage: StorageEntry & { kind: "file" }): Compression {
    const key = Key.parse(storage.config.compression, "bluemap");
    const compression = Compression.REGISTRY.get(key);
    if (compression === null)
        throw new Error(
            `Storage '${storage.id}' names an unknown compression '${storage.config.compression}'`,
        );
    return compression;
}

function degenerateMask(message: string): never {
    throw new Error(message);
}

/**
 * Creates one mask exactly as upstream's concrete `MaskConfig#createMask` implementations
 * do. Validation deliberately lives here as well as in the guided editor: the config folder
 * is public input, so a hand-edited invalid mask must fail on the cloud path at the same point
 * the Java `CombinedMaskSerializer` rejects it locally.
 *
 * Upstream:
 * `common/src/main/java/de/bluecolored/bluemap/common/config/mask/*MaskConfig.java`.
 */
export function createMaskFromConfig(entry: MaskConfig): Mask {
    switch (entry.type) {
        case "bluemap:box":
            if (
                entry["min-x"] > entry["max-x"] ||
                entry["min-y"] > entry["max-y"] ||
                entry["min-z"] > entry["max-z"]
            )
                return degenerateMask(
                    'The box-mask configuration results in a degenerate mask. Make sure that all "min-" values are actually SMALLER than their "max-" counterparts.',
                );
            return new BoxMask(
                new Vector3i(entry["min-x"], entry["min-y"], entry["min-z"]),
                new Vector3i(entry["max-x"], entry["max-y"], entry["max-z"]),
            );

        case "bluemap:circle":
            if (entry["min-y"] > entry["max-y"])
                return degenerateMask(
                    'The circle-mask configuration results in a degenerate mask. Make sure that the "min-y" value is actually SMALLER than the "max-y" counterpart.',
                );
            if (entry.radius <= 0)
                return degenerateMask(
                    'The circle-mask configuration results in a degenerate mask. Make sure that the "radius" value is greater than 0.',
                );
            return new EllipseMask(
                new Vector2d(entry["center-x"], entry["center-z"]),
                entry.radius,
                entry["min-y"],
                entry["max-y"],
            );

        case "bluemap:ellipse":
            if (entry["min-y"] > entry["max-y"])
                // Upstream's EllipseMaskConfig calls this a circle mask in this branch.
                // Preserve that wording: fidelity includes the awkward error, not just pixels.
                return degenerateMask(
                    'The circle-mask configuration results in a degenerate mask. Make sure that the "min-y" value is actually SMALLER than the "max-y" counterpart.',
                );
            if (entry["radius-x"] <= 0 || entry["radius-z"] <= 0)
                return degenerateMask(
                    "The ellipse-mask configuration results in a degenerate mask. Make sure that the radius values are greater than 0.",
                );
            return new EllipseMask(
                new Vector2d(entry["center-x"], entry["center-z"]),
                entry["radius-x"],
                entry["radius-z"],
                entry["min-y"],
                entry["max-y"],
            );

        case "bluemap:polygon": {
            if (entry["min-y"] > entry["max-y"])
                return degenerateMask(
                    'The polygon-mask configuration results in a degenerate mask. Make sure that the "min-y" value is actually SMALLER than the "max-y" counterpart.',
                );
            if (entry.shape.length < 3)
                return degenerateMask(
                    "The polygon-mask configuration needs at least 3 points for a valid shape.",
                );
            const points = entry.shape.map((point) => new Vector2d(point.x, point.z));
            const shape: Shape = { getPoints: () => points };
            return new PolygonMask(shape, entry["min-y"], entry["max-y"]);
        }

        case "bluemap:blur": {
            const nested = combinedMaskFromConfig(entry.masks);
            return entry.size > 0 ? new BlurMask(nested, entry.size) : nested;
        }
    }
}

/**
 * Port of `CombinedMaskSerializer#deserialize`: preserve list order, create each concrete
 * shape, and pass `!subtract` to `CombinedMask#add`. An empty `CombinedMask` intentionally
 * tests true everywhere, matching upstream's default render-mask exactly.
 */
export function combinedMaskFromConfig(entries: readonly MaskConfig[]): CombinedMask {
    const combined = new CombinedMask();
    for (const entry of entries) combined.add(createMaskFromConfig(entry), !entry.subtract);
    return combined;
}

export function maskFor(mapConfig: Pick<MapConfig, "render-mask">): Mask {
    return combinedMaskFromConfig(mapConfig["render-mask"]);
}

function settingsFor(mapConfig: MapConfig): MapSettings {
    const mask = maskFor(mapConfig);
    const base: MapSettings = {
        getSorting: () => mapConfig.sorting,
        getStartPos: () => new Vector2i(mapConfig["start-pos"].x, mapConfig["start-pos"].z),
        getSkyColor: () => mapConfig["sky-color"],
        getVoidColor: () => mapConfig["void-color"],
        getMinInhabitedTime: () => mapConfig["min-inhabited-time"],
        getMinInhabitedTimeRadius: () => mapConfig["min-inhabited-time-radius"],
        getHiresTileSize: () => mapConfig["hires-tile-size"],
        getLowresTileSize: () => mapConfig["lowres-tile-size"],
        getLodCount: () => mapConfig["lod-count"],
        getLodFactor: () => mapConfig["lod-factor"],
        getAmbientLight: () => mapConfig["ambient-light"],
        getSkyLight: () => mapConfig["sky-light"],
        isEnablePerspectiveView: () => mapConfig["enable-perspective-view"],
        isEnableFlatView: () => mapConfig["enable-flat-view"],
        isEnableFreeFlightView: () => mapConfig["enable-free-flight-view"],
        isEnableHires: () => mapConfig["enable-hires"],
        isCheckForRemovedRegions: () => mapConfig["check-for-removed-regions"],
        getRemoveCavesBelowY: () => mapConfig["remove-caves-below-y"],
        getCaveDetectionOceanFloor: () => mapConfig["cave-detection-ocean-floor"],
        isCaveDetectionUsesBlockLight: () => mapConfig["cave-detection-uses-block-light"],
        isRenderEdges: () => mapConfig["render-edges"],
        getEdgeLightStrength: () => mapConfig["edge-light-strength"],
        isIgnoreMissingLightData: () => mapConfig["ignore-missing-light-data"],
        getRenderMask: () => mask,
        // upstream `MapSettings` interface-default bodies; the port keeps them on the
        // `MapSettings` companion object (see docs/deviations.md, map/hires wave note).
        isSaveHiresLayer: () => MapSettings.isSaveHiresLayer(base),
        isRenderTopOnly: () => MapSettings.isRenderTopOnly(base),
    };
    return base;
}

export interface BuildMapsOptions {
    readonly loaded: LoadedConfig;
    readonly resourcePack: ResourcePack;
    readonly dataPack: DataPack;
    readonly logger: Logger;
    /** `-m`/`--maps`, or `null` for every map. */
    readonly mapFilter?: readonly string[] | null;
}

/** Resolves `mapConfig.world`/`storage.root` against the CWD, exactly as upstream's own `Path.of(x)` would. */
export function resolveConfigPath(value: string): string {
    return resolvePath(process.cwd(), value);
}

export async function buildMaps(options: BuildMapsOptions): Promise<BuiltMaps> {
    const { loaded, resourcePack, dataPack, mapFilter } = options;
    const maps = new Map<string, BmMapType>();
    const skipped = new Map<string, string>();

    const storageCache = new Map<string, FileStorage>();

    for (const [mapId, mapConfig] of loaded.maps) {
        if (mapFilter != null && mapFilter.length > 0 && !mapFilter.includes(mapId)) continue;

        try {
            if (mapConfig.loader !== "bluemap:anvil") {
                skipped.set(
                    mapId,
                    `unsupported world-loader '${mapConfig.loader}' (only bluemap:anvil is ported)`,
                );
                continue;
            }
            if (mapConfig.world === null) {
                skipped.set(mapId, "no 'world' configured");
                continue;
            }
            if (mapConfig.dimension === null) {
                skipped.set(mapId, "no 'dimension' configured");
                continue;
            }

            const storageEntry = loaded.storages.get(mapConfig.storage);
            if (storageEntry === undefined) {
                skipped.set(mapId, `references unknown storage '${mapConfig.storage}'`);
                continue;
            }
            if (storageEntry.kind === "sql") {
                skipped.set(
                    mapId,
                    `storage '${mapConfig.storage}' is a SQL storage, which packages/engine does not port (issue #32)`,
                );
                continue;
            }

            let storage = storageCache.get(storageEntry.id);
            if (storage === undefined) {
                storage = new FileStorage(
                    resolveConfigPath(storageEntry.config.root),
                    compressionFor(storageEntry),
                    storageEntry.config.atomic,
                );
                await storage.initialize();
                storageCache.set(storageEntry.id, storage);
            }

            const dimension = Key.parse(mapConfig.dimension, "minecraft");
            // upstream keeps this a possible-null unchecked (see MCAWorld.ts's own note on
            // `MapConfig#getDimensionType`) — bug-for-bug, not invented here
            const dimensionTypeKey =
                mapConfig["dimension-type"] === null
                    ? null
                    : Key.parse(mapConfig["dimension-type"], "minecraft");

            const world = await MCAWorld.load(
                resolveConfigPath(mapConfig.world),
                dimension,
                dimensionTypeKey,
                dataPack,
            );

            const settings = settingsFor(mapConfig);
            const map = await BmMap.create(
                mapId,
                mapConfig.name ?? mapId,
                world,
                storage.map(mapId),
                resourcePack,
                settings,
            );
            maps.set(mapId, map);
        } catch (error) {
            skipped.set(mapId, error instanceof Error ? error.message : String(error));
        }
    }

    return { maps, skipped };
}
