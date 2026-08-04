import { NBTWriter } from "@material-bluemap/nbt";
import type { LevelDatOptions } from "./levelDat.js";
import { LEGACY_DATA_VERSION, LEGACY_VERSION_NAME } from "./legacyVersion.js";

/** the `version` field of an anvil `level.dat`, unchanged since 1.9 */
const LEVEL_FORMAT_VERSION = 19133;

/**
 * Writes the uncompressed NBT of a 1.12.2 `level.dat`.
 *
 * The interesting thing here is what is *absent*. A modern `level.dat` carries a
 * `WorldGenSettings` compound whose per-dimension inline `type` is where this project's
 * reader gets the overworld's `min_y` and `height`; 1.12.2 predates the whole concept and
 * carries none. That is not an omission to be papered over — it is the actual shape of
 * every real 1.12.2 world, and inventing a `WorldGenSettings` here would make the
 * generated world easier for the reader than any world it will ever meet in the wild.
 *
 * The consequence is worth stating plainly, because it is visible in a render:
 * `MCAWorld#loadDimensionType` finds no dimension settings, falls back to
 * `DimensionType.OVERWORLD`, and therefore believes the world runs from y=-64 to y=319
 * rather than 0 to 255. Nothing breaks — `Chunk_1_12` has no sections below 0 and answers
 * air for every block down there — but the renderer does scan a world box taller than the
 * world. That is upstream's behaviour for a legacy world too, so it is measured rather
 * than avoided.
 *
 * `generatorName`/`generatorVersion`/`generatorOptions`, `RandomSeed` and `MapFeatures`
 * are the 1.12.2 spellings of settings the modern format moved into `WorldGenSettings`.
 * They are written so the folder also opens as a normal world in a 1.12.2 client and in
 * era-appropriate third-party tools, none of which would recognise the modern compound.
 *
 * Nothing here reads a clock: `LastPlayed` is a fixed 0, because a timestamp would make
 * two runs of the same seed differ byte for byte.
 */
export function buildLegacyLevelDatNbt(options: LevelDatOptions): Uint8Array {
    const writer = new NBTWriter();
    writer.beginCompound();

    writer.name("Data");
    writer.beginCompound();

    writer.name("version").valueInt(LEVEL_FORMAT_VERSION);
    writer.name("DataVersion").valueInt(LEGACY_DATA_VERSION);
    writer.name("LevelName").valueString(options.name);
    writer.name("LastPlayed").valueLong(0n);
    writer.name("SizeOnDisk").valueLong(0n);
    writer.name("Time").valueLong(0n);
    writer.name("DayTime").valueLong(6000n);

    // 1.12.2's world-generation settings, which have no modern counterpart in this file
    writer.name("RandomSeed").valueLong(BigInt(Math.trunc(options.seed)));
    writer.name("generatorName").valueString("default");
    writer.name("generatorVersion").valueInt(1);
    writer.name("generatorOptions").valueString("");
    // this world is written whole by this generator, so vanilla structure generation is
    // off; leaving it on would tell a client to add villages to terrain it did not make
    writer.name("MapFeatures").valueByte(0);

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

    writer.name("Version");
    writer.beginCompound();
    writer.name("Id").valueInt(LEGACY_DATA_VERSION);
    writer.name("Name").valueString(LEGACY_VERSION_NAME);
    writer.name("Snapshot").valueByte(0);
    writer.endCompound();

    writer.endCompound();
    writer.endCompound();
    writer.close();

    return writer.toUint8Array();
}
