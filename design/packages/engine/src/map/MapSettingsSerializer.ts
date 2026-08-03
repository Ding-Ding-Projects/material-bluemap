import { Color, Vector2i } from "@material-bluemap/shared";
import { ColorAdapter } from "../resources/adapter/ColorAdapter.js";
import type { JsonValue } from "../resources/adapter/JsonMapper.js";
import { Vector2iAdapter } from "../resources/adapter/Vector2iAdapter.js";
import type { BmMap } from "./BmMap.js";

const COLOR_ADAPTER = new ColorAdapter();
const VECTOR2I_ADAPTER = new Vector2iAdapter();

/**
 * upstream: map/MapSettingsSerializer.java
 *
 * Writes the map's `settings.json` — the document the webapp reads to learn the tile
 * grids, the start position and the view settings.
 *
 * Upstream is a gson {@code JsonSerializer<BmMap>} registered on {@code BmMap.GSON};
 * this port builds the same {@code JsonObject} directly and hands it to
 * {@code JSON.stringify}. The two nested values gson would delegate to a registered
 * adapter — {@code Vector2i} and {@code Color} — go through this port's
 * {@link Vector2iAdapter} and {@link ColorAdapter} for the same reason, so a change to
 * either shows up here as well.
 *
 * Note that `settings.json` is compared **by value** rather than byte for byte by
 * `tools/oracle`: gson prints a java `float` as `0.0` where {@code JSON.stringify} prints
 * `0`, and gson html-escapes characters inside strings that {@code JSON.stringify} emits
 * literally. Same document either way.
 */
export class MapSettingsSerializer {
    /** upstream: {@code JsonElement serialize(BmMap, Type, JsonSerializationContext)} */
    serialize(map: BmMap): JsonValue {
        return MapSettingsSerializer.serialize(map);
    }

    static serialize(map: BmMap): JsonValue {
        const settings = map.getMapSettings();
        const root: Record<string, JsonValue> = {};

        // name
        root["name"] = map.getName();

        // sorting
        root["sorting"] = settings.getSorting();

        // hires
        const hiresTileSize = map.getHiresModelManager().getTileGrid().getGridSize();
        const gridOrigin = map.getHiresModelManager().getTileGrid().getOffset();

        root["hires"] = {
            tileSize: VECTOR2I_ADAPTER.write(hiresTileSize),
            scale: VECTOR2I_ADAPTER.write(Vector2i.ONE),
            translate: VECTOR2I_ADAPTER.write(gridOrigin),
        };

        // lowres
        const lowresTileManager = map.getLowresTileManager();

        root["lowres"] = {
            tileSize: VECTOR2I_ADAPTER.write(lowresTileManager.getTileGrid().getGridSize()),
            lodFactor: lowresTileManager.getLodFactor(),
            lodCount: lowresTileManager.getLodCount(),
        };

        // startPos
        root["startPos"] = VECTOR2I_ADAPTER.write(settings.getStartPos());

        // skyColor
        root["skyColor"] = COLOR_ADAPTER.write(new Color().parse(settings.getSkyColor()));

        // voidColor
        root["voidColor"] = COLOR_ADAPTER.write(new Color().parse(settings.getVoidColor()));

        // light
        root["ambientLight"] = settings.getAmbientLight();
        root["skyLight"] = settings.getSkyLight();

        // view settings
        root["perspectiveView"] = settings.isEnablePerspectiveView();
        root["flatView"] = settings.isEnableFlatView();
        root["freeFlightView"] = settings.isEnableFreeFlightView();

        return root;
    }
}
