import {
    FLOAT,
    INT,
    STRING,
    TypeToken,
    mapOf,
    type BlueNBT,
    type ObjectSchema,
} from "@material-bluemap/nbt";
import { Key, Vector3i } from "@material-bluemap/shared";
import { DimensionSettings, DIMENSION_SETTINGS_TOKEN } from "./DimensionSettings.js";
import { KEY_TOKEN } from "./KeyDeserializer.js";
import { VECTOR3I_TOKEN } from "./Vector3iDeserializer.js";

export const LEVEL_DATA_TOKEN: TypeToken<LevelData> = TypeToken.of("LevelData");
const DATA_TOKEN: TypeToken<Data> = TypeToken.of("LevelData.Data");
const WG_SETTINGS_TOKEN: TypeToken<WGSettings> = TypeToken.of("LevelData.WGSettings");
const SPAWN_TOKEN: TypeToken<Spawn> = TypeToken.of("LevelData.Spawn");

/** upstream: DataPack.DIMENSION_OVERWORLD (the resources DataPack is not needed for the constant) */
const DIMENSION_OVERWORLD: Key = new Key("minecraft", "overworld");

/** upstream: LevelData.Spawn */
class Spawn {
    dimension: Key = DIMENSION_OVERWORLD;
    pos: Vector3i = Vector3i.ZERO;
    yaw = 0;
    pitch = 0;

    constructor(pos?: Vector3i) {
        if (pos !== undefined) this.pos = pos;
    }

    getDimension(): Key {
        return this.dimension;
    }

    getPos(): Vector3i {
        return this.pos;
    }

    getYaw(): number {
        return this.yaw;
    }

    getPitch(): number {
        return this.pitch;
    }
}

/** upstream: LevelData.WGSettings */
class WGSettings {
    dimensions: Map<string, DimensionSettings> = new Map();

    getDimensions(): Map<string, DimensionSettings> {
        return this.dimensions;
    }
}

/** upstream: LevelData.Data */
class Data {
    levelName = "world"; // @NBTName("LevelName")

    spawn: Spawn | null = null;

    worldGenSettings: WGSettings = new WGSettings(); // @NBTName("WorldGenSettings")

    // legacy-spawn notation
    spawnX = 0; // @NBTName("SpawnX")
    spawnY = 0; // @NBTName("SpawnY")
    spawnZ = 0; // @NBTName("SpawnZ")

    getLevelName(): string {
        return this.levelName;
    }

    getWorldGenSettings(): WGSettings {
        return this.worldGenSettings;
    }

    getSpawn(): Spawn {
        if (this.spawn == null) {
            this.spawn = new Spawn(new Vector3i(this.spawnX, this.spawnY, this.spawnZ));
        }
        return this.spawn;
    }
}

export class LevelData {
    static readonly Data = Data;
    static readonly WGSettings = WGSettings;
    static readonly Spawn = Spawn;

    data: Data = new Data(); // @NBTName("Data")

    getData(): Data {
        return this.data;
    }
}

const SPAWN_SCHEMA: ObjectSchema<Spawn> = {
    create: () => new Spawn(),
    fields: {
        dimension: { type: KEY_TOKEN },
        pos: { type: VECTOR3I_TOKEN },
        yaw: { type: FLOAT },
        pitch: { type: FLOAT },
    },
};

const WG_SETTINGS_SCHEMA: ObjectSchema<WGSettings> = {
    create: () => new WGSettings(),
    fields: {
        dimensions: { type: mapOf(DIMENSION_SETTINGS_TOKEN) },
    },
};

const DATA_SCHEMA: ObjectSchema<Data> = {
    create: () => new Data(),
    fields: {
        levelName: { names: ["LevelName"], type: STRING },
        spawn: { type: SPAWN_TOKEN },
        worldGenSettings: { names: ["WorldGenSettings"], type: WG_SETTINGS_TOKEN },
        spawnX: { names: ["SpawnX"], type: INT },
        spawnY: { names: ["SpawnY"], type: INT },
        spawnZ: { names: ["SpawnZ"], type: INT },
    },
};

const LEVEL_DATA_SCHEMA: ObjectSchema<LevelData> = {
    create: () => new LevelData(),
    fields: {
        data: { names: ["Data"], type: DATA_TOKEN },
    },
};

export function registerLevelDataSchemas(nbt: BlueNBT): void {
    nbt.register(SPAWN_TOKEN, SPAWN_SCHEMA);
    nbt.register(WG_SETTINGS_TOKEN, WG_SETTINGS_SCHEMA);
    nbt.register(DATA_TOKEN, DATA_SCHEMA);
    nbt.register(LEVEL_DATA_TOKEN, LEVEL_DATA_SCHEMA);
}
