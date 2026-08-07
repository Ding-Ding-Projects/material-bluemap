import {
    BOOLEAN,
    FLOAT,
    INT,
    LONG_AS_NUMBER,
    DOUBLE,
    TagType,
    TypeToken,
    type BlueNBT,
    type NBTReader,
    type ObjectSchema,
    type TypeDeserializer,
} from "@worldlens/nbt";
import { Key } from "@worldlens/shared";
import { DimensionType } from "../../DimensionType.js";
import type { DataPack } from "../../../resources/pack/datapack/DataPack.js";
import { logWarning } from "../MCAUtil.js";

export const DIMENSION_TYPE_TOKEN: TypeToken<DimensionType> = TypeToken.of("DimensionType");
export const DIMENSION_TYPE_DATA_TOKEN: TypeToken<DimensionTypeData> =
    TypeToken.of("DimensionTypeData");

/**
 * upstream: de.bluecolored.bluemap.core.resources.pack.datapack.dimension.DimensionTypeData —
 * defined here (instead of in the resources-package) until the resources-pack port lands;
 * the schema-registration below yields to an already-registered one, so the resources
 * port can take over the "DimensionTypeData" token.
 */
export class DimensionTypeData implements DimensionType {
    natural = false; // @NBTName("natural")
    skylight = false; // @NBTName("has_skylight") — upstream field: hasSkylight
    ceiling = false; // @NBTName("has_ceiling") — upstream field: hasCeiling
    ambientLight = 0; // @NBTName("ambient_light")
    minY = 0; // @NBTName("min_y")
    height = 0; // @NBTName("height")
    fixedTime: number | null = null; // @NBTName("fixed_time")
    coordinateScale = 0; // @NBTName("coordinate_scale")

    isNatural(): boolean {
        return this.natural;
    }

    hasSkylight(): boolean {
        return this.skylight;
    }

    hasCeiling(): boolean {
        return this.ceiling;
    }

    getAmbientLight(): number {
        return this.ambientLight;
    }

    getMinY(): number {
        return this.minY;
    }

    getHeight(): number {
        return this.height;
    }

    getFixedTime(): number | null {
        return this.fixedTime;
    }

    getCoordinateScale(): number {
        return this.coordinateScale;
    }
}

const DIMENSION_TYPE_DATA_SCHEMA: ObjectSchema<DimensionTypeData> = {
    create: () => new DimensionTypeData(),
    fields: {
        natural: { names: ["natural"], type: BOOLEAN },
        skylight: { names: ["has_skylight"], type: BOOLEAN },
        ceiling: { names: ["has_ceiling"], type: BOOLEAN },
        ambientLight: { names: ["ambient_light"], type: FLOAT },
        minY: { names: ["min_y"], type: INT },
        height: { names: ["height"], type: INT },
        fixedTime: { names: ["fixed_time"], type: LONG_AS_NUMBER },
        coordinateScale: { names: ["coordinate_scale"], type: DOUBLE },
    },
};

export class DimensionTypeDeserializer implements TypeDeserializer<DimensionType> {
    private readonly defaultTypeDeserializer: TypeDeserializer<DimensionTypeData>;
    private readonly dataPack: DataPack;

    constructor(blueNBT: BlueNBT, dataPack: DataPack) {
        // upstream's reflection builds the DimensionTypeData adapter on demand; the port
        // registers the schema (if not provided already) before resolving it
        if (blueNBT.getObjectSchema(DIMENSION_TYPE_DATA_TOKEN) == null)
            blueNBT.register(DIMENSION_TYPE_DATA_TOKEN, DIMENSION_TYPE_DATA_SCHEMA);
        this.defaultTypeDeserializer = blueNBT.getTypeDeserializer(DIMENSION_TYPE_DATA_TOKEN);
        this.dataPack = dataPack;
    }

    read(reader: NBTReader): DimensionType {
        // try load directly
        if (reader.peek() === TagType.COMPOUND) return this.defaultTypeDeserializer.read(reader);

        // load from datapack
        const key = Key.parse(reader.nextString(), Key.MINECRAFT_NAMESPACE);

        let dimensionType = this.dataPack.getDimensionType(key);
        if (dimensionType == null) {
            logWarning(
                "No dimension-type found with the id '" + key.getFormatted() + "', using fallback.",
            );
            dimensionType = DimensionType.OVERWORLD;
        }

        return dimensionType;
    }
}
