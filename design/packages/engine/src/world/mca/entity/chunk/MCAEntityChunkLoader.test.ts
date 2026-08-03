import { describe, expect, it } from "vitest";
import { NBTWriter } from "@material-bluemap/nbt";
import { gzipSync } from "node:zlib";
import { Compression } from "../../../../storage/compression/Compression.js";
import { MCAEntity } from "../MCAEntity.js";
import { MCAEntityChunk } from "./MCAEntityChunk.js";
import { MCAEntityChunkLoader } from "./MCAEntityChunkLoader.js";

function buildEntityChunkNbt(): Uint8Array {
    const writer = new NBTWriter();
    writer.beginCompound();
    writer.name("DataVersion");
    writer.valueInt(2860);
    writer.name("Position");
    writer.valueIntArray([5, -3]);
    writer.name("Entities");
    writer.beginList(1);
    writer.beginCompound();
    writer.name("id");
    writer.valueString("minecraft:cow");
    writer.name("UUID");
    writer.valueIntArray([1, 2, 3, 4]);
    writer.name("CustomName");
    writer.valueString('"Bessie"');
    writer.name("CustomNameVisible");
    writer.valueByte(1);
    writer.name("Pos");
    writer.beginList(3);
    writer.valueDouble(1.5);
    writer.valueDouble(64.0);
    writer.valueDouble(-7.25);
    writer.endList();
    writer.name("Motion");
    writer.beginList(3);
    writer.valueDouble(0);
    writer.valueDouble(-0.0784);
    writer.valueDouble(0);
    writer.endList();
    writer.name("Rotation");
    writer.beginList(2);
    writer.valueFloat(90.5);
    writer.valueFloat(-12.25);
    writer.endList();
    writer.endCompound();
    writer.endList();
    writer.endCompound();
    writer.close();
    return writer.toUint8Array();
}

describe("MCAEntityChunkLoader", () => {
    it("decodes an entity-chunk (through the given compression)", async () => {
        const loader = new MCAEntityChunkLoader();
        const compressed = gzipSync(buildEntityChunkNbt());

        const chunk = await loader.load(compressed, 0, compressed.length, Compression.GZIP);
        expect(chunk.getDataVersion()).toBe(2860);
        expect(chunk.getPosition().getX()).toBe(5);
        expect(chunk.getPosition().getY()).toBe(-3);

        expect(chunk.getEntities()).toHaveLength(1);
        const entity = chunk.getEntities()[0]!;
        expect(entity).toBeInstanceOf(MCAEntity);
        expect(entity.getId().getFormatted()).toBe("minecraft:cow");
        expect(entity.getUuid()).toBe("00000001-0000-0002-0000-000300000004");
        expect(entity.getCustomName()).toBe('"Bessie"');
        expect(entity.isCustomNameVisible()).toBe(true);
        expect(entity.getPos().x).toBe(1.5);
        expect(entity.getPos().y).toBe(64);
        expect(entity.getPos().z).toBe(-7.25);
        expect(entity.getMotion().y).toBe(-0.0784);
        expect(entity.getRotation().x).toBe(90.5);
        expect(entity.getRotation().y).toBe(-12.25);
    });

    it("fails with an IOException-wrapped parse-error", async () => {
        const loader = new MCAEntityChunkLoader();
        const bogus = new Uint8Array([9, 9, 9]);
        await expect(loader.load(bogus, 0, bogus.length, Compression.NONE)).rejects.toThrow(
            /Failed to parse chunk-data \(MCAEntityChunk\)/,
        );
    });

    it("provides the empty- and errored-chunk singletons", () => {
        const loader = new MCAEntityChunkLoader();
        expect(loader.emptyChunk()).toBe(MCAEntityChunk.EMPTY_CHUNK);
        expect(loader.erroredChunk()).toBe(MCAEntityChunk.ERRORED_CHUNK);
    });
});
