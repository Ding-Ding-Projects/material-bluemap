import { NBTWriter } from "@material-bluemap/nbt";
import {
    DATA_VERSION,
    LEVEL_FORMAT_VERSION,
    MIN_Y,
    VERSION_NAME,
    WORLD_HEIGHT,
} from "./version.js";

export interface LevelDatOptions {
    /** the world seed, as given on the command line */
    seed: number;
    /** the world's display name */
    name: string;
    spawnX: number;
    spawnY: number;
    spawnZ: number;
}

/**
 * Writes the uncompressed NBT of a `level.dat`.
 *
 * Two things in here are load-bearing for this project's own reader: the
 * `WorldGenSettings.dimensions` entry, whose inline `type` compound is where MCAWorld
 * gets the overworld's `min_y` and `height` from, and the `DataVersion`, which decides
 * the chunk format. Everything else is written so that the folder also opens as a
 * normal world in other tools.
 *
 * Nothing here reads a clock: `LastPlayed` is a fixed 0, because a timestamp would make
 * two runs of the same seed differ byte for byte.
 */
export function buildLevelDatNbt(options: LevelDatOptions): Uint8Array {
    const writer = new NBTWriter();
    writer.beginCompound();

    writer.name("Data");
    writer.beginCompound();

    writer.name("version").valueInt(LEVEL_FORMAT_VERSION);
    writer.name("DataVersion").valueInt(DATA_VERSION);
    writer.name("LevelName").valueString(options.name);
    writer.name("LastPlayed").valueLong(0n);
    writer.name("Time").valueLong(0n);
    writer.name("DayTime").valueLong(6000n);
    writer.name("GameType").valueInt(1);
    writer.name("Difficulty").valueByte(2);
    writer.name("DifficultyLocked").valueByte(0);
    writer.name("hardcore").valueByte(0);
    writer.name("allowCommands").valueByte(1);
    writer.name("initialized").valueByte(1);
    writer.name("raining").valueByte(0);
    writer.name("thundering").valueByte(0);
    writer.name("clearWeatherTime").valueInt(0);
    writer.name("rainTime").valueInt(0);
    writer.name("thunderTime").valueInt(0);
    writer.name("SpawnX").valueInt(options.spawnX);
    writer.name("SpawnY").valueInt(options.spawnY);
    writer.name("SpawnZ").valueInt(options.spawnZ);
    writer.name("SpawnAngle").valueFloat(0);
    writer.name("WanderingTraderSpawnChance").valueInt(0);
    writer.name("WanderingTraderSpawnDelay").valueInt(0);

    writer.name("Version");
    writer.beginCompound();
    writer.name("Id").valueInt(DATA_VERSION);
    writer.name("Name").valueString(VERSION_NAME);
    writer.name("Series").valueString("main");
    writer.name("Snapshot").valueByte(0);
    writer.endCompound();

    writer.name("WorldGenSettings");
    writer.beginCompound();
    writer.name("seed").valueLong(BigInt(Math.trunc(options.seed)));
    writer.name("generate_features").valueByte(0);
    writer.name("bonus_chest").valueByte(0);
    writer.name("dimensions");
    writer.beginCompound();
    writer.name("minecraft:overworld");
    writer.beginCompound();
    // the dimension-type is written inline rather than as a registry id, so a reader
    // needs no data-pack to learn the world's vertical extent
    writer.name("type");
    writer.beginCompound();
    writer.name("ultrawarm").valueByte(0);
    writer.name("natural").valueByte(1);
    writer.name("has_skylight").valueByte(1);
    writer.name("has_ceiling").valueByte(0);
    writer.name("piglin_safe").valueByte(0);
    writer.name("bed_works").valueByte(1);
    writer.name("respawn_anchor_works").valueByte(0);
    writer.name("has_raids").valueByte(1);
    writer.name("ambient_light").valueFloat(0);
    writer.name("min_y").valueInt(MIN_Y);
    writer.name("height").valueInt(WORLD_HEIGHT);
    writer.name("logical_height").valueInt(WORLD_HEIGHT);
    writer.name("coordinate_scale").valueDouble(1);
    writer.name("infiniburn").valueString("#minecraft:infiniburn_overworld");
    writer.name("effects").valueString("minecraft:overworld");
    writer.name("monster_spawn_block_light_limit").valueInt(0);
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();

    writer.endCompound();
    writer.endCompound();
    writer.close();

    return writer.toUint8Array();
}
