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
    BoxMask,
    Compression,
    FileStorage,
    Mask,
    MapSettings,
    MCAWorld,
    type BmMap as BmMapType,
    type DataPack,
    type ResourcePack,
} from "@material-bluemap/engine";
import { Key, Vector2i, Vector3i } from "@material-bluemap/shared";
import type { MapConfig } from "@material-bluemap/config";
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
    if (compression === null) throw new Error(`Storage '${storage.id}' names an unknown compression '${storage.config.compression}'`);
    return compression;
}

/**
 * Upstream builds `Mask.ALL` when `render-mask` is empty and a real `CombinedMask`
 * otherwise. The schema's own default entry for a freshly generated map.conf is not an
 * empty array, though: `generateConfigSet`/`renderMapTemplate` write one commented-out
 * example box (see `mask.ts`'s `normaliseMaskType`, which fills in `type: "bluemap:box"`
 * for a bare `{}`) whose min/max default to Java's `int` range on every axis — a box that
 * restricts nothing, which is exactly what the template's own comment says ("Default is no
 * mask"). That single, unrestricting box is translated for real below.
 *
 * A **hand-edited** `render-mask` — more than one entry, a `subtract: true` box, or any of
 * the other four shapes (`circle`/`ellipse`/`polygon`/`blur`) — is a real, supported config
 * editor feature with no translation on this side yet, so it is reported (never silently
 * ignored) and the map renders unmasked rather than guessing at a shape.
 */
function maskFor(mapConfig: MapConfig, mapId: string, logger: Logger): Mask {
    const entries = mapConfig["render-mask"];
    if (entries.length === 0) return Mask.ALL;

    if (entries.length === 1 && entries[0]!.type === "bluemap:box" && !entries[0]!.subtract) {
        const box = entries[0]!;
        return new BoxMask(
            new Vector3i(box["min-x"], box["min-y"], box["min-z"]),
            new Vector3i(box["max-x"], box["max-y"], box["max-z"]),
        );
    }

    logger.warn(
        `Map '${mapId}' configures a render-mask this CLI does not yet translate (only a single, ` +
            "non-subtracting box mask is) — rendering the whole map. See packages/cli/src/maps.ts.",
    );
    return Mask.ALL;
}

function settingsFor(mapConfig: MapConfig, mapId: string, logger: Logger): MapSettings {
    const mask = maskFor(mapConfig, mapId, logger);
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
    const { loaded, resourcePack, dataPack, logger, mapFilter } = options;
    const maps = new Map<string, BmMapType>();
    const skipped = new Map<string, string>();

    const storageCache = new Map<string, FileStorage>();

    for (const [mapId, mapConfig] of loaded.maps) {
        if (mapFilter != null && mapFilter.length > 0 && !mapFilter.includes(mapId)) continue;

        try {
            if (mapConfig.loader !== "bluemap:anvil") {
                skipped.set(mapId, `unsupported world-loader '${mapConfig.loader}' (only bluemap:anvil is ported)`);
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
                skipped.set(mapId, `storage '${mapConfig.storage}' is a SQL storage, which packages/engine does not port (issue #32)`);
                continue;
            }

            let storage = storageCache.get(storageEntry.id);
            if (storage === undefined) {
                storage = new FileStorage(resolveConfigPath(storageEntry.config.root), compressionFor(storageEntry), storageEntry.config.atomic);
                await storage.initialize();
                storageCache.set(storageEntry.id, storage);
            }

            const dimension = Key.parse(mapConfig.dimension, "minecraft");
            // upstream keeps this a possible-null unchecked (see MCAWorld.ts's own note on
            // `MapConfig#getDimensionType`) — bug-for-bug, not invented here
            const dimensionTypeKey = mapConfig["dimension-type"] === null ? null : Key.parse(mapConfig["dimension-type"], "minecraft");

            const world = await MCAWorld.load(resolveConfigPath(mapConfig.world), dimension, dimensionTypeKey, dataPack);

            const settings = settingsFor(mapConfig, mapId, logger);
            const map = await BmMap.create(mapId, mapConfig.name ?? mapId, world, storage.map(mapId), resourcePack, settings);
            maps.set(mapId, map);
        } catch (error) {
            skipped.set(mapId, error instanceof Error ? error.message : String(error));
        }
    }

    return { maps, skipped };
}
