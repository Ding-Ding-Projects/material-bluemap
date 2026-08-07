import { TypeToken, type BlueNBT, type ObjectSchema } from "@worldlens/nbt";
import { DimensionType } from "../../DimensionType.js";
import { DIMENSION_TYPE_TOKEN } from "./DimensionTypeDeserializer.js";

export const DIMENSION_SETTINGS_TOKEN: TypeToken<DimensionSettings> =
    TypeToken.of("DimensionSettings");

export class DimensionSettings {
    type: DimensionType = DimensionType.OVERWORLD;

    getType(): DimensionType {
        return this.type;
    }
}

const DIMENSION_SETTINGS_SCHEMA: ObjectSchema<DimensionSettings> = {
    create: () => new DimensionSettings(),
    fields: {
        type: { type: DIMENSION_TYPE_TOKEN },
    },
};

export function registerDimensionSettingsSchema(nbt: BlueNBT): void {
    nbt.register(DIMENSION_SETTINGS_TOKEN, DIMENSION_SETTINGS_SCHEMA);
}
