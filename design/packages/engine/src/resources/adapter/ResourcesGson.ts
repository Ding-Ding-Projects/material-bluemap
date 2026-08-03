import { Key } from "@material-bluemap/shared";
import { BlockRendererType } from "../../map/hires/block/BlockRendererType.js";
import { EntityRendererType } from "../../map/hires/entity/EntityRendererType.js";
import { GrassColorModifier } from "../../world/biome/GrassColorModifier.js";
import { AxisAdapter } from "./AxisAdapter.js";
import { ColorAdapter } from "./ColorAdapter.js";
import { DirectionAdapter } from "./DirectionAdapter.js";
import { KeyAdapter } from "./KeyAdapter.js";
import { parse, type JsonValue } from "./JsonMapper.js";
import { RegistryAdapter } from "./RegistryAdapter.js";
import { Vector2iAdapter } from "./Vector2iAdapter.js";
import { Vector3dAdapter } from "./Vector3dAdapter.js";
import { Vector3fAdapter } from "./Vector3fAdapter.js";
import { Vector4dAdapter } from "./Vector4dAdapter.js";
import { Vector4fAdapter } from "./Vector4fAdapter.js";

/**
 * upstream: adapter/ResourcesGson.java — assembles the lenient gson instance
 * (FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES + setLenient + the type-adapters).
 * Without gson's reflective registry the "instance" is the set of per-type adapters
 * itself plus the lenient {@link parse} entry-point; deserializers pick the adapter
 * for the type they read (the field-naming policy becomes each adapter reading the
 * lower_case_with_underscores member-names directly). The PostDeserialize hook
 * (upstream: PostDeserializeAdapterFactory) is applied by the deserializers via
 * {@code postDeserialize()}. The EnumMap instance-creation
 * (upstream: EnumMapInstanceCreator for EnumMap<Direction, Face>) is a plain Map in
 * the ported model-adapters.
 */
export const ResourcesGson = {
    key: new KeyAdapter(),
    axis: new AxisAdapter(),
    color: new ColorAdapter(),
    direction: new DirectionAdapter(),
    vector2i: new Vector2iAdapter(),
    vector3d: new Vector3dAdapter(),
    vector3f: new Vector3fAdapter(),
    vector4d: new Vector4dAdapter(),
    vector4f: new Vector4fAdapter(),
    grassColorModifier: new RegistryAdapter(
        GrassColorModifier.REGISTRY,
        Key.MINECRAFT_NAMESPACE,
        GrassColorModifier.NONE
    ),
    blockRendererType: new RegistryAdapter(
        BlockRendererType.REGISTRY,
        Key.BLUEMAP_NAMESPACE,
        BlockRendererType.DEFAULT
    ),
    entityRendererType: new RegistryAdapter(
        EntityRendererType.REGISTRY,
        Key.BLUEMAP_NAMESPACE,
        EntityRendererType.DEFAULT
    ),

    /** upstream: {@code ResourcesGson.INSTANCE.fromJson(...)}'s lenient parse-step */
    parse(json: string): JsonValue {
        return parse(json);
    },
};
