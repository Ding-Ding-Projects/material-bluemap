import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Key } from "@material-bluemap/shared";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DimensionType } from "../../../world/DimensionType.js";
import { PackVersion } from "../PackVersion.js";
import { DirFileSystem } from "../vfs/DirFileSystem.js";
import type { PackPath } from "../vfs/PackFileSystem.js";
import { ZipFileSystem } from "../vfs/ZipFileSystem.js";
import { buildZip } from "../vfs/zipTestUtil.js";
import { DataPack } from "./DataPack.js";

const tempDirs: string[] = [];
afterAll(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
    vi.spyOn(console, "debug").mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

const THE_END_JSON = JSON.stringify({
    natural: false,
    has_skylight: false,
    has_ceiling: false,
    ambient_light: 0.0,
    min_y: 0,
    height: 256,
    fixed_time: 6000,
    coordinate_scale: 1.0,
});

const OVERWORLD_JSON = JSON.stringify({
    natural: true,
    has_skylight: true,
    has_ceiling: false,
    min_y: 5,
    height: 123,
    coordinate_scale: 1.0,
});

const PLAINS_JSON = JSON.stringify({
    temperature: 0.8,
    downfall: 0.4,
    effects: { water_color: 4159204, grass_color_modifier: "none" },
});

const DEEP_DARK_JSON = JSON.stringify({ temperature: 0.5, downfall: 0.5 });

/** the datapack fixture, as a zip built with the vfs test-zip-writer */
function datapackZip(): Buffer {
    return buildZip([
        { name: "pack.mcmeta", data: JSON.stringify({ pack: { pack_format: 26 } }) },
        { name: "data/minecraft/dimension_type/the_end.json", data: THE_END_JSON },
        { name: "data/minecraft/dimension_type/overworld.json", data: OVERWORLD_JSON },
        { name: "data/minecraft/dimension_type/readme.txt", data: "not a resource" },
        { name: "data/minecraft/worldgen/biome/plains.json", data: PLAINS_JSON, deflate: true },
        { name: "data/custom/worldgen/biome/deep/dark.json", data: DEEP_DARK_JSON },
        { name: "data/minecraft/worldgen/biome/broken.json", data: "{" },
    ]);
}

async function loadedFromZipRoot(): Promise<InstanceType<typeof DataPack>> {
    const fileSystem = await ZipFileSystem.fromBuffer(datapackZip(), "datapack.zip");
    const dataPack = new DataPack(new PackVersion(26, 0));
    await dataPack.loadResources(fileSystem.getRootDirectories());
    return dataPack;
}

describe("DataPack key constants", () => {
    it("are the upstream dimension / dimension-type keys", () => {
        expect(DataPack.DIMENSION_OVERWORLD.getFormatted()).toBe("minecraft:overworld");
        expect(DataPack.DIMENSION_THE_NETHER.getFormatted()).toBe("minecraft:the_nether");
        expect(DataPack.DIMENSION_THE_END.getFormatted()).toBe("minecraft:the_end");
        expect(DataPack.DIMENSION_TYPE_OVERWORLD.getFormatted()).toBe("minecraft:overworld");
        expect(DataPack.DIMENSION_TYPE_OVERWORLD_CAVES.getFormatted()).toBe(
            "minecraft:overworld_caves",
        );
        expect(DataPack.DIMENSION_TYPE_THE_NETHER.getFormatted()).toBe("minecraft:the_nether");
        expect(DataPack.DIMENSION_TYPE_THE_END.getFormatted()).toBe("minecraft:the_end");
    });
});

describe("DataPack.loadResources", () => {
    it("resolves a dimension_type out of a zipped datapack", async () => {
        const dataPack = await loadedFromZipRoot();

        const theEnd = dataPack.getDimensionType(Key.minecraft("the_end"));
        expect(theEnd).not.toBeNull();
        expect(theEnd!.hasSkylight()).toBe(false);
        expect(theEnd!.hasCeiling()).toBe(false);
        expect(theEnd!.getMinY()).toBe(0);
        expect(theEnd!.getHeight()).toBe(256);
        expect(theEnd!.getFixedTime()).toBe(6000);
        expect(theEnd!.getCoordinateScale()).toBe(1);
        // the datapack's own the_end replaced the builtin one
        expect(theEnd).not.toBe(DimensionType.END);
    });

    it("resolves a worldgen biome out of a zipped datapack", async () => {
        const dataPack = await loadedFromZipRoot();

        const plains = dataPack.getBiome(Key.minecraft("plains"));
        expect(plains).not.toBeNull();
        expect(plains!.getKey().getFormatted()).toBe("minecraft:plains");
        expect(plains!.getTemperature()).toBe(Math.fround(0.8));
        expect(plains!.getDownfall()).toBe(Math.fround(0.4));
        expect(plains!.getWaterColor().getInt()).toBe((0xff000000 | 4159204) | 0);
    });

    it("keys nested biome files by their whole sub-path and namespace", async () => {
        const dataPack = await loadedFromZipRoot();

        const deepDark = dataPack.getBiome(new Key("custom", "deep/dark"));
        expect(deepDark).not.toBeNull();
        expect(deepDark!.getKey().getFormatted()).toBe("custom:deep/dark");
    });

    it("skips non-json files and unparseable resources", async () => {
        const dataPack = await loadedFromZipRoot();

        expect(dataPack.getDimensionType(Key.minecraft("readme"))).toBeNull();
        expect(dataPack.getBiome(Key.minecraft("broken"))).toBeNull();
        expect(dataPack.getBiome(Key.minecraft("nothing_here"))).toBeNull();
    });

    it("bakes the four builtin dimension-types in without overwriting loaded ones", async () => {
        const dataPack = await loadedFromZipRoot();

        // putIfAbsent: the datapack's overworld wins over the builtin
        const overworld = dataPack.getDimensionType(DataPack.DIMENSION_TYPE_OVERWORLD);
        expect(overworld).not.toBe(DimensionType.OVERWORLD);
        expect(overworld!.getMinY()).toBe(5);
        expect(overworld!.getHeight()).toBe(123);

        // …and the three the datapack does not define are the builtins
        expect(dataPack.getDimensionType(DataPack.DIMENSION_TYPE_OVERWORLD_CAVES)).toBe(
            DimensionType.OVERWORLD_CAVES,
        );
        expect(dataPack.getDimensionType(DataPack.DIMENSION_TYPE_THE_NETHER)).toBe(
            DimensionType.NETHER,
        );
    });

    it("resolves legacy biome-ids through the baked LegacyBiomes table", async () => {
        const dataPack = await loadedFromZipRoot();

        // legacy id 1 is minecraft:plains
        expect(dataPack.getBiome(1)).toBe(dataPack.getBiome(Key.minecraft("plains")));
        // legacy id 0 is minecraft:ocean, which this datapack does not define
        expect(dataPack.getBiome(0)).toBeNull();
        expect(dataPack.getBiome(9999)).toBeNull();
    });

    it("loads a datapack from a .jar file on disk", async () => {
        const dir = mkdtempSync(join(tmpdir(), "bluemap-datapack-"));
        tempDirs.push(dir);
        writeFileSync(join(dir, "pack.jar"), datapackZip());

        const root: PackPath = new DirFileSystem(dir).getRoot().resolve("pack.jar");
        const dataPack = new DataPack(new PackVersion(26, 0));
        await dataPack.loadResources([root]);

        expect(dataPack.getDimensionType(Key.minecraft("the_end"))).not.toBeNull();
        expect(dataPack.getBiome(Key.minecraft("plains"))).not.toBeNull();
    });

    it("bakes the builtins even for an empty set of roots", async () => {
        const dataPack = new DataPack(new PackVersion(26, 0));
        await dataPack.loadResources([]);

        expect(dataPack.getDimensionType(DataPack.DIMENSION_TYPE_OVERWORLD)).toBe(
            DimensionType.OVERWORLD,
        );
        expect(dataPack.getDimensionType(DataPack.DIMENSION_TYPE_THE_END)).toBe(DimensionType.END);
        expect(dataPack.getBiome(1)).toBeNull();
    });

    it("keeps the first-loaded resource when two roots define the same key", async () => {
        const first = await ZipFileSystem.fromBuffer(
            buildZip([
                {
                    name: "data/minecraft/worldgen/biome/plains.json",
                    data: JSON.stringify({ temperature: 0.25 }),
                },
            ]),
            "first.zip",
        );
        const second = await ZipFileSystem.fromBuffer(
            buildZip([
                {
                    name: "data/minecraft/worldgen/biome/plains.json",
                    data: JSON.stringify({ temperature: 0.75 }),
                },
            ]),
            "second.zip",
        );

        const dataPack = new DataPack(new PackVersion(26, 0));
        await dataPack.loadResources([
            ...first.getRootDirectories(),
            ...second.getRootDirectories(),
        ]);

        // "don't load already present resources" — higher priority resources are loaded first
        expect(dataPack.getBiome(Key.minecraft("plains"))!.getTemperature()).toBe(0.25);
    });
});
