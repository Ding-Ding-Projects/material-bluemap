import { TypeToken, mapOf, type BlueNBT, type ObjectSchema } from "@worldlens/nbt";
import { DimensionSettings, DIMENSION_SETTINGS_TOKEN } from "./DimensionSettings.js";

export const WORLD_GEN_SETTINGS_TOKEN: TypeToken<WorldGenSettings> =
    TypeToken.of("WorldGenSettings");
const DATA_TOKEN: TypeToken<Data> = TypeToken.of("WorldGenSettings.Data");

/** upstream: WorldGenSettings.Data */
class Data {
    dimensions: Map<string, DimensionSettings> = new Map();

    getDimensions(): Map<string, DimensionSettings> {
        return this.dimensions;
    }
}

export class WorldGenSettings {
    static readonly Data = Data;

    data: Data = new Data();

    getData(): Data {
        return this.data;
    }
}

const DATA_SCHEMA: ObjectSchema<Data> = {
    create: () => new Data(),
    fields: {
        dimensions: { type: mapOf(DIMENSION_SETTINGS_TOKEN) },
    },
};

const WORLD_GEN_SETTINGS_SCHEMA: ObjectSchema<WorldGenSettings> = {
    create: () => new WorldGenSettings(),
    fields: {
        data: { type: DATA_TOKEN },
    },
};

export function registerWorldGenSettingsSchemas(nbt: BlueNBT): void {
    nbt.register(DATA_TOKEN, DATA_SCHEMA);
    nbt.register(WORLD_GEN_SETTINGS_TOKEN, WORLD_GEN_SETTINGS_SCHEMA);
}
