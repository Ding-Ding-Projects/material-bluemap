import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { BlueNBT } from "./BlueNBT.js";
import { NBTWriter } from "./NBTWriter.js";
import { NBTReader } from "./NBTReader.js";
import { TypeToken } from "./TypeToken.js";
import { NamingStrategy } from "./NamingStrategy.js";
import { IOException } from "./Exceptions.js";
import type { TypeDeserializer } from "./TypeDeserializer.js";
import type { TypeResolver } from "./TypeResolver.js";
import type { ObjectSchema } from "./adapter/ObjectAdapter.js";
import { BOOLEAN, DOUBLE, FLOAT, INT, LONG, STRING } from "./adapter/PrimitiveAdapters.js";
import { listOf } from "./adapter/CollectionAdapter.js";
import { mapOf } from "./adapter/MapAdapter.js";

let uniqueTokenId = 0;
function token<T>(name: string): TypeToken<T> {
    return TypeToken.of<T>("test:" + name + ":" + uniqueTokenId++);
}

describe("BlueNBT", () => {
    it("maps schema fields with fixed nbt-names and applies defaults for missing fields", () => {
        interface Data {
            levelName: string;
            thunderTime: number;
            hardcore: boolean;
            missing: number;
        }

        const nbt = new BlueNBT();
        const dataToken = token<Data>("Data");
        nbt.register(dataToken, {
            create: () => ({ levelName: "world", thunderTime: 0, hardcore: false, missing: 42 }),
            fields: {
                levelName: { names: ["LevelName"], type: STRING },
                thunderTime: { type: INT },
                hardcore: { type: BOOLEAN },
                missing: { type: INT },
            },
        } satisfies ObjectSchema<Data>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("LevelName").valueString("myWorld");
        writer.name("thunderTime").valueInt(51264);
        writer.name("hardcore").valueByte(1);
        writer.name("unknownField").valueString("skipped");
        writer.name("unknownCompound").beginCompound();
        writer.name("nested").valueInt(1);
        writer.endCompound();
        writer.endCompound();

        const result = nbt.read(writer.toUint8Array(), dataToken);
        expect(result.levelName).toBe("myWorld");
        expect(result.thunderTime).toBe(51264);
        expect(result.hardcore).toBe(true);
        expect(result.missing).toBe(42); // missing -> default
    });

    it("applies the configured naming-strategy", () => {
        interface Data {
            someFieldName: string;
        }

        const nbt = new BlueNBT();
        nbt.setNamingStrategy(NamingStrategy.lowerCaseWithDelimiter("_"));
        const dataToken = token<Data>("Data");
        nbt.register(dataToken, {
            create: () => ({ someFieldName: "" }),
            fields: { someFieldName: { type: STRING } },
        } satisfies ObjectSchema<Data>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("some_field_name").valueString("hit");
        writer.endCompound();

        expect(nbt.read(writer.toUint8Array(), dataToken).someFieldName).toBe("hit");

        // naming strategy helpers
        expect(NamingStrategy.UPPER_CAMEL_CASE("levelName")).toBe("LevelName");
        expect(NamingStrategy.UPPER_CAMEL_CASE("_fooBar")).toBe("_FooBar");
        expect(NamingStrategy.lowerCaseWithDelimiter("-")("FooBAR")).toBe("foo-b-a-r");
        expect(NamingStrategy.upperCaseWithDelimiter("_")("fooBar")).toBe("FOO_BAR");
    });

    it("considers all names of a multi-name field", () => {
        interface Data {
            id: string;
        }

        const nbt = new BlueNBT();
        const dataToken = token<Data>("Data");
        nbt.register(dataToken, {
            create: () => ({ id: "" }),
            fields: { id: { names: ["id", "Id"], type: STRING } },
        } satisfies ObjectSchema<Data>);

        for (const name of ["id", "Id"]) {
            const writer = new NBTWriter();
            writer.beginCompound();
            writer.name(name).valueString("value");
            writer.endCompound();
            expect(nbt.read(writer.toUint8Array(), dataToken).id).toBe("value");
        }
    });

    it("feeds one nbt-element into multiple fields mapped to the same name", () => {
        interface Inner {
            value: number;
        }
        interface Outer {
            data: Inner;
            dataRaw: unknown;
        }

        const nbt = new BlueNBT();
        const innerToken = token<Inner>("Inner");
        const outerToken = token<Outer>("Outer");
        nbt.register(innerToken, {
            create: () => ({ value: 0 }),
            fields: { value: { type: INT } },
        } satisfies ObjectSchema<Inner>);
        nbt.register(outerToken, {
            create: () => ({ data: { value: -1 }, dataRaw: null }),
            fields: {
                data: { names: ["Data"], type: innerToken },
                dataRaw: { names: ["Data"], type: TypeToken.OBJECT },
            },
        } satisfies ObjectSchema<Outer>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("Data").beginCompound();
        writer.name("value").valueInt(7);
        writer.endCompound();
        writer.endCompound();

        const result = nbt.read(writer.toUint8Array(), outerToken);
        expect(result.data.value).toBe(7);
        expect(result.dataRaw).toEqual(new Map([["value", 7]]));
    });

    it("runs post-deserialize hooks (NBTPostDeserialize equivalent)", () => {
        interface Data {
            spawnX: number;
            spawnY: number;
            spawnZ: number;
            spawn: [number, number, number] | null;
        }

        const nbt = new BlueNBT();
        const dataToken = token<Data>("Data");
        nbt.register(dataToken, {
            create: () => ({ spawnX: 0, spawnY: 0, spawnZ: 0, spawn: null }),
            fields: {
                spawnX: { names: ["SpawnX"], type: INT },
                spawnY: { names: ["SpawnY"], type: INT },
                spawnZ: { names: ["SpawnZ"], type: INT },
            },
            postDeserialize: (data) => {
                data.spawn = [data.spawnX, data.spawnY, data.spawnZ];
            },
        } satisfies ObjectSchema<Data>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("SpawnX").valueInt(1);
        writer.name("SpawnY").valueInt(2);
        writer.name("SpawnZ").valueInt(3);
        writer.endCompound();

        expect(nbt.read(writer.toUint8Array(), dataToken).spawn).toEqual([1, 2, 3]);
    });

    it("reads primitive fields leniently from other number tags", () => {
        interface Data {
            anInt: number;
            aBool: boolean;
            aFloat: number;
            aDouble: number;
            aLong: bigint;
            aString: string;
            fromString: number;
        }

        const nbt = new BlueNBT();
        const dataToken = token<Data>("Data");
        nbt.register(dataToken, {
            create: () => ({
                anInt: 0,
                aBool: false,
                aFloat: 0,
                aDouble: 0,
                aLong: 0n,
                aString: "",
                fromString: 0,
            }),
            fields: {
                anInt: { type: INT },
                aBool: { type: BOOLEAN },
                aFloat: { type: FLOAT },
                aDouble: { type: DOUBLE },
                aLong: { type: LONG },
                aString: { type: STRING },
                fromString: { type: INT },
            },
        } satisfies ObjectSchema<Data>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("anInt").valueByte(12); // BYTE -> int
        writer.name("aBool").valueShort(3); // SHORT != 0 -> true
        writer.name("aFloat").valueDouble(2.5); // DOUBLE -> float
        writer.name("aDouble").valueFloat(1.5); // FLOAT -> double
        writer.name("aLong").valueInt(-77); // INT -> long
        writer.name("aString").valueInt(123); // INT -> string
        writer.name("fromString").valueString("456"); // STRING -> int
        writer.endCompound();

        const result = nbt.read(writer.toUint8Array(), dataToken);
        expect(result.anInt).toBe(12);
        expect(result.aBool).toBe(true);
        expect(result.aFloat).toBe(2.5);
        expect(result.aDouble).toBe(1.5);
        expect(result.aLong).toBe(-77n);
        expect(result.aString).toBe("123");
        expect(result.fromString).toBe(456);
    });

    it("supports custom TypeDeserializers registered per token (KeyDeserializer-style)", () => {
        class Key {
            constructor(readonly formatted: string) {}
        }
        const keyDeserializer: TypeDeserializer<Key> = {
            read: (reader) => {
                const value = reader.nextString();
                return new Key(value.includes(":") ? value : "minecraft:" + value);
            },
        };

        interface Data {
            dimension: Key | null;
        }

        const nbt = new BlueNBT();
        const keyToken = token<Key>("Key");
        const dataToken = token<Data>("Data");
        nbt.register(keyToken, keyDeserializer);
        nbt.register(dataToken, {
            create: () => ({ dimension: null }),
            fields: { dimension: { type: keyToken } },
        } satisfies ObjectSchema<Data>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("dimension").valueString("overworld");
        writer.endCompound();

        expect(nbt.read(writer.toUint8Array(), dataToken).dimension?.formatted).toBe(
            "minecraft:overworld",
        );
    });

    it("reads lists and string-keyed maps (listOf / mapOf)", () => {
        interface DimensionSettings {
            type: string;
        }
        interface Data {
            serverBrands: string[];
            dimensions: Map<string, DimensionSettings>;
        }

        const nbt = new BlueNBT();
        const dimToken = token<DimensionSettings>("DimensionSettings");
        const dataToken = token<Data>("Data");
        nbt.register(dimToken, {
            create: () => ({ type: "minecraft:overworld" }),
            fields: { type: { type: STRING } },
        } satisfies ObjectSchema<DimensionSettings>);
        nbt.register(dataToken, {
            create: () => ({ serverBrands: [], dimensions: new Map() }),
            fields: {
                serverBrands: { names: ["ServerBrands"], type: listOf(STRING) },
                dimensions: { type: mapOf(dimToken) },
            },
        } satisfies ObjectSchema<Data>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("ServerBrands").beginList(2);
        writer.valueString("Paper");
        writer.valueString("Spigot");
        writer.endList();
        writer.name("dimensions").beginCompound();
        writer.name("minecraft:overworld").beginCompound();
        writer.name("type").valueString("minecraft:overworld");
        writer.endCompound();
        writer.name("minecraft:the_nether").beginCompound();
        writer.name("type").valueString("minecraft:the_nether");
        writer.endCompound();
        writer.endCompound();
        writer.endCompound();

        const result = nbt.read(writer.toUint8Array(), dataToken);
        expect(result.serverBrands).toEqual(["Paper", "Spigot"]);
        expect(result.dimensions.size).toBe(2);
        expect(result.dimensions.get("minecraft:the_nether")?.type).toBe("minecraft:the_nether");
    });

    it("resolves polymorphic types through a TypeResolver", () => {
        interface BaseEntity {
            id: string;
        }
        interface SignEntity extends BaseEntity {
            text: string;
        }

        const nbt = new BlueNBT();
        const entityToken = token<BaseEntity>("Entity");
        const mcaEntityToken = token<BaseEntity>("MCAEntity");
        const signToken = token<SignEntity>("SignEntity");

        nbt.register(mcaEntityToken, {
            create: () => ({ id: "" }),
            fields: { id: { type: STRING } },
        } satisfies ObjectSchema<BaseEntity>);
        nbt.register(signToken, {
            create: () => ({ id: "", text: "" }),
            fields: { id: { type: STRING }, text: { type: STRING } },
        } satisfies ObjectSchema<SignEntity>);
        nbt.register(entityToken, {
            getBaseType: () => mcaEntityToken,
            resolve: (base) => (base.id === "minecraft:sign" ? signToken : mcaEntityToken),
            getPossibleTypes: () => [mcaEntityToken, signToken],
        } satisfies TypeResolver<BaseEntity, BaseEntity>);

        const write = (id: string, text?: string) => {
            const writer = new NBTWriter();
            writer.beginCompound();
            writer.name("id").valueString(id);
            if (text !== undefined) writer.name("text").valueString(text);
            writer.endCompound();
            return writer.toUint8Array();
        };

        // resolved to the special type
        const sign = nbt.read(write("minecraft:sign", "hello"), entityToken) as SignEntity;
        expect(sign.text).toBe("hello");
        expect(sign.id).toBe("minecraft:sign");

        // base-type shortcut (data only parsed once)
        const plain = nbt.read(write("minecraft:chest"), entityToken);
        expect(plain).toEqual({ id: "minecraft:chest" });
    });

    it("recovers from parse-errors through TypeResolver#onException", () => {
        interface BaseEntity {
            id: string;
        }
        interface BrokenEntity extends BaseEntity {
            broken: string;
        }

        const nbt = new BlueNBT();
        const entityToken = token<BaseEntity>("Entity");
        const mcaEntityToken = token<BaseEntity>("MCAEntity");
        const brokenToken = token<BrokenEntity>("BrokenEntity");

        const throwingDeserializer: TypeDeserializer<string> = {
            read: () => {
                throw new IOException("boom");
            },
        };

        nbt.register(mcaEntityToken, {
            create: () => ({ id: "" }),
            fields: { id: { type: STRING } },
        } satisfies ObjectSchema<BaseEntity>);
        nbt.register(brokenToken, {
            create: () => ({ id: "", broken: "" }),
            fields: { id: { type: STRING }, broken: { type: throwingDeserializer } },
        } satisfies ObjectSchema<BrokenEntity>);
        nbt.register(entityToken, {
            getBaseType: () => mcaEntityToken,
            resolve: () => brokenToken,
            getPossibleTypes: () => [mcaEntityToken, brokenToken],
            onException: (_parseException, base) => base as BaseEntity,
        } satisfies TypeResolver<BaseEntity, BaseEntity>);

        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("id").valueString("minecraft:banner");
        writer.name("broken").valueString("x");
        writer.endCompound();

        // parsing the resolved type fails -> falls back to the base object
        expect(nbt.read(writer.toUint8Array(), entityToken)).toEqual({ id: "minecraft:banner" });
    });

    it("reads raw structures through the Object token (ObjectDeserializer)", () => {
        const writer = new NBTWriter();
        writer.beginCompound();
        writer.name("num").valueInt(1);
        writer.name("big").valueLong(1n << 40n);
        writer.name("list").beginList(2);
        writer.valueString("a");
        writer.valueString("b");
        writer.endList();
        writer.name("bytes").valueByteArray(Int8Array.from([1, -1]));
        writer.name("nested").beginCompound();
        writer.name("x").valueDouble(0.5);
        writer.endCompound();
        writer.endCompound();

        const nbt = new BlueNBT();
        const result = nbt.read(writer.toUint8Array(), TypeToken.OBJECT) as Map<string, unknown>;
        expect(result.get("num")).toBe(1);
        expect(result.get("big")).toBe(1n << 40n);
        expect(result.get("list")).toEqual(["a", "b"]);
        expect([...(result.get("bytes") as Int8Array)]).toEqual([1, -1]);
        expect(result.get("nested")).toEqual(new Map([["x", 0.5]]));
    });

    it("serializes objects through schemas and round-trips", () => {
        interface Inner {
            value: number;
        }
        interface Data {
            name: string;
            inner: Inner;
            tags: string[];
        }

        const nbt = new BlueNBT();
        const innerToken = token<Inner>("Inner");
        const dataToken = token<Data>("Data");
        nbt.register(innerToken, {
            create: () => ({ value: 0 }),
            fields: { value: { type: INT } },
        } satisfies ObjectSchema<Inner>);
        nbt.register(dataToken, {
            create: () => ({ name: "", inner: { value: 0 }, tags: [] }),
            fields: {
                name: { names: ["Name"], type: STRING },
                inner: { type: innerToken },
                tags: { type: listOf(STRING) },
            },
        } satisfies ObjectSchema<Data>);

        const original: Data = { name: "test", inner: { value: 3 }, tags: ["a", "b"] };
        const data = nbt.writeToBytes(original, dataToken);
        expect(nbt.read(data, dataToken)).toEqual(original);

        // empty lists are written with the serializer's root-type
        const emptyData = nbt.writeToBytes({ name: "x", inner: { value: 0 }, tags: [] }, dataToken);
        expect(nbt.read(emptyData, dataToken).tags).toEqual([]);
    });

    // port of upstream BlueNBTTest#testBlueNBT against the real level.dat
    it("reads the level.dat reference file through schemas (upstream BlueNBTTest)", () => {
        interface DataTag {
            difficulty: number;
            difficultyLocked: boolean;
            rainTime: number;
            lastPlayed: bigint;
            borderDamagePerBlock: number;
            levelName: string;
        }
        interface LevelFile {
            data: DataTag | null;
            dataRaw: unknown;
        }

        const nbt = new BlueNBT();
        nbt.setNamingStrategy(NamingStrategy.UPPER_CAMEL_CASE);

        const dataTagToken = token<DataTag>("DataTag");
        const levelFileToken = token<LevelFile>("LevelFile");
        nbt.register(dataTagToken, {
            create: () => ({
                difficulty: 0,
                difficultyLocked: true,
                rainTime: 0,
                lastPlayed: 0n,
                borderDamagePerBlock: 0,
                levelName: "",
            }),
            fields: {
                difficulty: { type: INT },
                difficultyLocked: { type: BOOLEAN },
                // the file stores this one in lowerCamelCase (upstream: @NBTName("rainTime"))
                rainTime: { names: ["rainTime"], type: INT },
                lastPlayed: { type: LONG },
                borderDamagePerBlock: { type: DOUBLE },
                levelName: { type: STRING },
            },
        } satisfies ObjectSchema<DataTag>);
        nbt.register(levelFileToken, {
            create: () => ({ data: null, dataRaw: null }),
            fields: {
                data: { names: ["Data"], type: dataTagToken },
                dataRaw: { names: ["Data"], type: TypeToken.OBJECT },
            },
        } satisfies ObjectSchema<LevelFile>);

        const raw = gunzipSync(
            readFileSync(new URL("../test/fixtures/level.dat", import.meta.url)),
        );
        const testData = nbt.read(new NBTReader(raw), levelFileToken);

        expect(testData.data).not.toBeNull();
        const data = testData.data!;

        expect(data.difficulty).toBe(1);
        expect(data.difficultyLocked).toBe(false);
        expect(data.rainTime).toBe(14590);
        expect(data.lastPlayed).toBe(1687182273928n);
        expect(data.borderDamagePerBlock).toBe(0.2);
        expect(data.levelName).toBe("world");

        expect(testData.dataRaw).not.toBeNull();
        expect(testData.dataRaw).toBeInstanceOf(Map);
    });
});
