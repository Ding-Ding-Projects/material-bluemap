import { describe, expect, it } from "vitest";
import { LightData } from "./LightData.js";

describe("LightData", () => {
    it("stores sky- and block-light", () => {
        const light = new LightData(15, 7);
        expect(light.getSkyLight()).toBe(15);
        expect(light.getBlockLight()).toBe(7);
    });

    it("set overwrites both values and returns itself (mutable target pattern)", () => {
        const light = new LightData(-1, -1);
        const result = light.set(12, 3);
        expect(result).toBe(light);
        expect(light.getSkyLight()).toBe(12);
        expect(light.getBlockLight()).toBe(3);

        light.set(0, 0);
        expect(light.getSkyLight()).toBe(0);
        expect(light.getBlockLight()).toBe(0);
    });

    it("supports the sentinel used by the Block cursor", () => {
        const light = new LightData(-1, -1);
        expect(light.getSkyLight()).toBeLessThan(0);
        light.set(15, 0);
        expect(light.getSkyLight()).toBe(15);
    });

    it("formats like upstream", () => {
        expect(new LightData(5, 9).toString()).toBe("LightData[B:9|S:5]");
    });
});
