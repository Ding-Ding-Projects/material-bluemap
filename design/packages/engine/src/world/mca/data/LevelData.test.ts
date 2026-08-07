import { describe, expect, it, vi } from "vitest";
import { BlueNBT, NBTWriter } from "@worldlens/nbt";
import { Key } from "@worldlens/shared";
import { DimensionType } from "../../DimensionType.js";
import type { DataPack } from "../../../resources/pack/datapack/DataPack.js";
import { addCommonNbtSettings } from "../MCAUtil.js";
import {
    DimensionTypeDeserializer,
    DimensionTypeData,
    DIMENSION_TYPE_TOKEN,
} from "./DimensionTypeDeserializer.js";
import { LEVEL_DATA_TOKEN } from "./LevelData.js";

const DATA_PACK = {
    getDimensionType: (key: Key) =>
        key.getFormatted() === "minecraft:overworld" ? DimensionType.OVERWORLD : null,
} as unknown as DataPack;

function makeBlueNbt(): BlueNBT {
    // mirrors MCAWorld's per-world BlueNBT setup
    const nbt = addCommonNbtSettings(new BlueNBT());
    nbt.register(DIMENSION_TYPE_TOKEN, new DimensionTypeDeserializer(nbt, DATA_PACK));
    return nbt;
}

function buildLevelDataNbt(): Uint8Array {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("Data");
    writer.beginCompound();
    writer.name("LevelName");
    writer.valueString("test-world");
    // legacy-spawn notation
    writer.name("SpawnX");
    writer.valueInt(1);
    writer.name("SpawnY");
    writer.valueInt(2);
    writer.name("SpawnZ");
    writer.valueInt(3);
    writer.name("WorldGenSettings");
    writer.beginCompound();
    writer.name("dimensions");
    writer.beginCompound();
    writer.name("minecraft:overworld");
    writer.beginCompound();
    writer.name("type");
    writer.valueString("minecraft:overworld");
    writer.endCompound();
    writer.name("minecraft:custom");
    writer.beginCompound();
    writer.name("type");
    writer.beginCompound(); // inline dimension-type data
    writer.name("min_y");
    writer.valueInt(-32);
    writer.name("height");
    writer.valueInt(128);
    writer.name("has_skylight");
    writer.valueByte(1);
    writer.name("has_ceiling");
    writer.valueByte(0);
    writer.name("ambient_light");
    writer.valueFloat(0.5);
    writer.name("coordinate_scale");
    writer.valueDouble(8);
    writer.name("fixed_time");
    writer.valueLong(6000n);
    writer.endCompound();
    writer.endCompound();
    writer.name("minecraft:unknown");
    writer.beginCompound();
    writer.name("type");
    writer.valueString("minecraft:not-registered");
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

describe("LevelData", () => {
    it("reads level.dat data with dimension-settings", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            const nbt = makeBlueNbt();
            const levelData = nbt.read(buildLevelDataNbt(), LEVEL_DATA_TOKEN);

            const data = levelData.getData();
            expect(data.getLevelName()).toBe("test-world");

            // legacy-spawn falls back to the SpawnX/Y/Z fields
            const spawn = data.getSpawn();
            expect(spawn.getPos().getX()).toBe(1);
            expect(spawn.getPos().getY()).toBe(2);
            expect(spawn.getPos().getZ()).toBe(3);
            expect(spawn.getDimension().getFormatted()).toBe("minecraft:overworld");

            const dimensions = data.getWorldGenSettings().getDimensions();
            expect([...dimensions.keys()].sort()).toEqual([
                "minecraft:custom",
                "minecraft:overworld",
                "minecraft:unknown",
            ]);

            // dimension-type referenced by key: resolved through the data-pack
            expect(dimensions.get("minecraft:overworld")?.getType()).toBe(DimensionType.OVERWORLD);

            // dimension-type given inline: parsed as DimensionTypeData
            const custom = dimensions.get("minecraft:custom")?.getType();
            expect(custom).toBeInstanceOf(DimensionTypeData);
            expect(custom?.getMinY()).toBe(-32);
            expect(custom?.getHeight()).toBe(128);
            expect(custom?.hasSkylight()).toBe(true);
            expect(custom?.hasCeiling()).toBe(false);
            expect(custom?.getAmbientLight()).toBe(0.5);
            expect(custom?.getCoordinateScale()).toBe(8);
            expect(custom?.getFixedTime()).toBe(6000);

            // unknown dimension-type key: falls back to OVERWORLD (with a warning)
            expect(dimensions.get("minecraft:unknown")?.getType()).toBe(DimensionType.OVERWORLD);
            expect(warn).toHaveBeenCalledWith(
                "No dimension-type found with the id 'minecraft:not-registered', using fallback.",
            );
        } finally {
            warn.mockRestore();
        }
    });

    it("uses the defaults for an empty level.dat", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.endCompound();
        writer.close();

        const nbt = makeBlueNbt();
        const levelData = nbt.read(writer.toUint8Array(), LEVEL_DATA_TOKEN);
        expect(levelData.getData().getLevelName()).toBe("world");
        expect(levelData.getData().getSpawn().getPos().getX()).toBe(0);
        expect(levelData.getData().getWorldGenSettings().getDimensions().size).toBe(0);
    });
});
