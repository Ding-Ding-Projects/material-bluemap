import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { DimensionTypeData } from "./DimensionTypeData.js";

function fromJson(json: string): DimensionTypeData {
    return DimensionTypeData.fromJson(parse(json));
}

describe("DimensionTypeData.fromJson", () => {
    it("reads a full vanilla dimension_type document", () => {
        const data = fromJson(`{
            "natural": false,
            "has_skylight": false,
            "has_ceiling": true,
            "ambient_light": 0.1,
            "min_y": 0,
            "height": 256,
            "fixed_time": 18000,
            "coordinate_scale": 8.0,
            "bed_works": false,
            "infiniburn": "#minecraft:infiniburn_nether"
        }`);

        expect(data.isNatural()).toBe(false);
        expect(data.hasSkylight()).toBe(false);
        expect(data.hasCeiling()).toBe(true);
        // the upstream field is a float
        expect(data.getAmbientLight()).toBe(Math.fround(0.1));
        expect(data.getMinY()).toBe(0);
        expect(data.getHeight()).toBe(256);
        expect(data.getFixedTime()).toBe(18000);
        expect(data.getCoordinateScale()).toBe(8);
    });

    it("leaves absent members at their defaults", () => {
        const data = fromJson(`{ "min_y": -64, "height": 384 }`);

        expect(data.isNatural()).toBe(false);
        expect(data.hasSkylight()).toBe(false);
        expect(data.hasCeiling()).toBe(false);
        expect(data.getAmbientLight()).toBe(0);
        expect(data.getMinY()).toBe(-64);
        expect(data.getHeight()).toBe(384);
        expect(data.getFixedTime()).toBeNull();
        expect(data.getCoordinateScale()).toBe(0);
    });

    it("reads a null fixed_time as null", () => {
        expect(fromJson(`{ "fixed_time": null }`).getFixedTime()).toBeNull();
    });

    it("rejects a non-integer min_y", () => {
        expect(() => fromJson(`{ "min_y": 1.5 }`)).toThrow(/Expected an int/);
    });
});
