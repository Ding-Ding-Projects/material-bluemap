import { describe, expect, it } from "vitest";
import { GrassColorModifier } from "../../biome/GrassColorModifier.js";
import { LegacyBiomes, readColorInt } from "./LegacyBiomes.js";

describe("readColorInt", () => {
    it("ports the legacy ConfigUtils.readColorInt", () => {
        expect(readColorInt(4159204)).toBe(4159204);
        expect(readColorInt("4159204")).toBe(4159204);
        expect(readColorInt("#6A7039")).toBe(0xff6a7039 | 0); // "#rrggbb" -> alpha ff
        expect(readColorInt("#f16")).toBe(0xffff1166 | 0); // css-style short form
        expect(readColorInt("#8ABC")).toBe(0x88aabbcc | 0); // "#argb"
        expect(readColorInt("#80102030")).toBe(0x80102030 | 0); // "#aarrggbb"
        expect(() => readColorInt(undefined)).toThrow();
        expect(() => readColorInt("nope")).toThrow();
    });
});

describe("LegacyBiomes", () => {
    it("loads the bundled legacy biomes.json by numeral-id", () => {
        const biomes = LegacyBiomes.loadDefault();
        expect(LegacyBiomes.loadDefault()).toBe(biomes); // cached

        expect(biomes.forId(0)!.getKey().getFormatted()).toBe("minecraft:ocean");
        expect(biomes.forId(1)!.getKey().getFormatted()).toBe("minecraft:plains");
        expect(biomes.forId(6)!.getKey().getFormatted()).toBe("minecraft:swamp");
        expect(biomes.forId(999)).toBeNull();
        expect(biomes.forId(-1)).toBeNull();
    });

    it("maps humidity/temp to downfall/temperature", () => {
        const biomes = LegacyBiomes.loadDefault();
        const swamp = biomes.forId(6)!;
        expect(swamp.getDownfall()).toBeCloseTo(0.9, 5);
        expect(swamp.getTemperature()).toBeCloseTo(0.8, 5);
        expect(swamp.getGrassColorModifier()).toBe(GrassColorModifier.NONE);
    });

    it("parses water- and overlay-colors", () => {
        const biomes = LegacyBiomes.loadDefault();

        // ocean watercolor 4159204 = 0x3F76E4, forced opaque
        const ocean = biomes.forId(0)!;
        expect(ocean.getWaterColor().r).toBeCloseTo(0x3f / 255, 5);
        expect(ocean.getWaterColor().g).toBeCloseTo(0x76 / 255, 5);
        expect(ocean.getWaterColor().b).toBeCloseTo(0xe4 / 255, 5);
        expect(ocean.getWaterColor().a).toBeCloseTo(1, 5);
        // no overlays configured -> fully transparent (legacy Vector4f.ZERO)
        expect(ocean.getOverlayGrassColor().a).toBe(0);
        expect(ocean.getOverlayFoliageColor().a).toBe(0);

        // swamp: watercolor 6388580 = 0x617B64, grass/foliage overlay "#6A7039"
        const swamp = biomes.forId(6)!;
        expect(swamp.getWaterColor().r).toBeCloseTo(0x61 / 255, 5);
        expect(swamp.getOverlayGrassColor().a).toBeCloseTo(1, 5);
        expect(swamp.getOverlayGrassColor().r).toBeCloseTo(0x6a / 255, 5);
        expect(swamp.getOverlayGrassColor().g).toBeCloseTo(0x70 / 255, 5);
        expect(swamp.getOverlayGrassColor().b).toBeCloseTo(0x39 / 255, 5);
        expect(swamp.getOverlayFoliageColor().r).toBeCloseTo(0x6a / 255, 5);

        // modern-only dry-foliage overlay stays neutral
        expect(swamp.getOverlayDryFoliageColor().a).toBe(0);
    });

    it("applies the legacy defaults for missing fields", () => {
        const biomes = new LegacyBiomes({ "test:custom": { id: 42 } });
        const custom = biomes.forId(42)!;
        expect(custom.getKey().getFormatted()).toBe("test:custom");
        expect(custom.getDownfall()).toBeCloseTo(0.5, 5);
        expect(custom.getTemperature()).toBeCloseTo(0.5, 5);
        // default watercolor 4159204 = 0x3F76E4
        expect(custom.getWaterColor().r).toBeCloseTo(0x3f / 255, 5);
        // unparsable colors are ignored (legacy catch NumberFormatException)
        const bad = new LegacyBiomes({ "test:bad": { id: 7, watercolor: "nope" } });
        expect(bad.forId(7)!.getWaterColor().r).toBeCloseTo(0x3f / 255, 5);
    });
});
