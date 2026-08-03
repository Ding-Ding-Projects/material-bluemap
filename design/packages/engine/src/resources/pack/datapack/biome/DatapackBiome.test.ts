import { Key } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { Biome } from "../../../../world/biome/Biome.js";
import { GrassColorModifier } from "../../../../world/biome/GrassColorModifier.js";
import { DatapackBiome, Data, Effects } from "./DatapackBiome.js";

function dataFromJson(json: string): Data {
    return Data.fromJson(parse(json));
}

describe("DatapackBiome.Data", () => {
    it("defaults temperature/downfall/effects to Biome.DEFAULT", () => {
        const data = dataFromJson("{}");

        expect(data.getTemperature()).toBe(Biome.DEFAULT.getTemperature());
        expect(data.getDownfall()).toBe(Biome.DEFAULT.getDownfall());
        expect(data.getEffects().getGrassColorModifier()).toBe(
            Biome.DEFAULT.getGrassColorModifier(),
        );
    });

    it("reads temperature and downfall", () => {
        const data = dataFromJson(`{ "temperature": 0.8, "downfall": 0.4 }`);
        // the upstream fields are floats
        expect(data.getTemperature()).toBe(Math.fround(0.8));
        expect(data.getDownfall()).toBe(Math.fround(0.4));
    });

    it("ignores unknown members", () => {
        const data = dataFromJson(`{ "temperature": 0.25, "has_precipitation": true }`);
        expect(data.getTemperature()).toBe(0.25);
    });
});

describe("DatapackBiome.Effects", () => {
    it("reads all effect colors and the grass-color-modifier", () => {
        const effects = Effects.fromJson(
            parse(`{
                "water_color": 4020182,
                "foliage_color": 6975545,
                "dry_foliage_color": 8082228,
                "grass_color": 7842607,
                "grass_color_modifier": "swamp"
            }`),
        );

        expect(effects.getWaterColor().getInt()).toBe((0xff000000 | 4020182) | 0);
        expect(effects.getFoliageColor().getInt()).toBe((0xff000000 | 6975545) | 0);
        expect(effects.getDryFoliageColor().getInt()).toBe((0xff000000 | 8082228) | 0);
        expect(effects.getGrassColor().getInt()).toBe((0xff000000 | 7842607) | 0);
        expect(effects.getGrassColorModifier()).toBe(GrassColorModifier.SWAMP);
    });

    it("forces the water-color alpha to 1 (upstream @PostDeserialize init)", () => {
        // an explicit alpha-carrying color: the post-deserialize hook overwrites it
        const effects = Effects.fromJson(parse(`{ "water_color": [0.1, 0.2, 0.3, 0.25] }`));
        expect(effects.getWaterColor().a).toBe(1);
        expect(effects.getWaterColor().r).toBeCloseTo(0.1, 6);
    });

    it("falls back to an unknown grass-color-modifier's default", () => {
        const effects = Effects.fromJson(parse(`{ "grass_color_modifier": "not_a_modifier" }`));
        expect(effects.getGrassColorModifier()).toBe(GrassColorModifier.NONE);
    });
});

describe("DatapackBiome", () => {
    it("exposes its key and delegates every Biome member to its data", () => {
        const key = Key.minecraft("swamp");
        const data = dataFromJson(`{
            "temperature": 0.8,
            "downfall": 0.9,
            "effects": {
                "water_color": 6388580,
                "foliage_color": 6975545,
                "dry_foliage_color": 8082228,
                "grass_color": 7842607,
                "grass_color_modifier": "swamp"
            }
        }`);
        const biome = new DatapackBiome(key, data);

        expect(biome.getKey()).toBe(key);
        expect(biome.getData()).toBe(data);
        expect(biome.getTemperature()).toBe(Math.fround(0.8));
        expect(biome.getDownfall()).toBe(Math.fround(0.9));
        expect(biome.getWaterColor().getInt()).toBe((0xff000000 | 6388580) | 0);
        expect(biome.getOverlayFoliageColor().getInt()).toBe((0xff000000 | 6975545) | 0);
        expect(biome.getOverlayDryFoliageColor().getInt()).toBe((0xff000000 | 8082228) | 0);
        expect(biome.getOverlayGrassColor().getInt()).toBe((0xff000000 | 7842607) | 0);
        expect(biome.getGrassColorModifier()).toBe(GrassColorModifier.SWAMP);
    });

    it("hands out Biome.DEFAULT's colors when the datapack declares none", () => {
        const biome = new DatapackBiome(Key.minecraft("plains"), dataFromJson("{}"));

        // upstream shares the very same Color instances as Biome.DEFAULT (no copy)
        expect(biome.getWaterColor()).toBe(Biome.DEFAULT.getWaterColor());
        expect(biome.getOverlayGrassColor()).toBe(Biome.DEFAULT.getOverlayGrassColor());
        // …and the water-color alpha the post-deserialize hook forces is already 1 there
        expect(biome.getWaterColor().a).toBe(1);
    });
});
