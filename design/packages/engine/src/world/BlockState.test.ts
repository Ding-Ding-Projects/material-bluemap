import { Key } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { BlockState, Property } from "./BlockState.js";

describe("BlockState.fromString", () => {
    it("parses an id without properties", () => {
        const state = BlockState.fromString("minecraft:stone");
        expect(state.getId().getFormatted()).toBe("minecraft:stone");
        expect(state.getProperties().size).toBe(0);
    });

    it("defaults to the minecraft namespace", () => {
        const state = BlockState.fromString("stone");
        expect(state.getId().getFormatted()).toBe("minecraft:stone");
    });

    it("parses properties", () => {
        const state = BlockState.fromString("minecraft:oak_stairs[facing=east,half=bottom]");
        expect(state.getId().getFormatted()).toBe("minecraft:oak_stairs");
        expect(state.getProperties().get("facing")).toBe("east");
        expect(state.getProperties().get("half")).toBe("bottom");
        expect(state.getProperties().size).toBe(2);
    });

    it("parses an empty property list", () => {
        const state = BlockState.fromString("minecraft:stone[]");
        expect(state.getId().getFormatted()).toBe("minecraft:stone");
        expect(state.getProperties().size).toBe(0);
    });

    it("keeps only the first '=' as separator (String#split(_, 2))", () => {
        const state = BlockState.fromString("test[key=a=b]");
        expect(state.getProperties().get("key")).toBe("a=b");
    });

    it("ignores a trailing comma like Java's String#split", () => {
        const state = BlockState.fromString("test[a=1,]");
        expect(state.getProperties().get("a")).toBe("1");
        expect(state.getProperties().size).toBe(1);
    });

    it("throws on an inner empty property entry", () => {
        expect(() => BlockState.fromString("test[a=1,,b=2]")).toThrowError(
            "'test[a=1,,b=2]' could not be parsed to a BlockState!",
        );
    });

    it("throws on a property without '='", () => {
        expect(() => BlockState.fromString("test[foo]")).toThrowError(
            "'test[foo]' could not be parsed to a BlockState!",
        );
    });

    it("throws on the empty string", () => {
        expect(() => BlockState.fromString("")).toThrowError(
            "'' could not be parsed to a BlockState!",
        );
    });

    it("round-trips through toString", () => {
        const serialized = "minecraft:oak_stairs[facing=east,half=bottom]";
        expect(BlockState.fromString(serialized).toString()).toBe(serialized);
    });

    it("round-trips ids without properties (toString always appends brackets)", () => {
        expect(BlockState.fromString("minecraft:air").toString()).toBe("minecraft:air[]");
    });
});

describe("BlockState flags", () => {
    it("recognizes all air variants", () => {
        expect(BlockState.fromString("minecraft:air").isAir()).toBe(true);
        expect(BlockState.fromString("minecraft:cave_air").isAir()).toBe(true);
        expect(BlockState.fromString("minecraft:void_air").isAir()).toBe(true);
        expect(BlockState.fromString("minecraft:stone").isAir()).toBe(false);
        expect(BlockState.fromString("other:air").isAir()).toBe(false);
    });

    it("recognizes water", () => {
        expect(BlockState.fromString("minecraft:water").isWater()).toBe(true);
        expect(BlockState.fromString("minecraft:water[level=2]").isWater()).toBe(true);
        expect(BlockState.fromString("minecraft:lava").isWater()).toBe(false);
    });

    it("recognizes waterlogged blocks", () => {
        expect(BlockState.fromString("minecraft:oak_fence[waterlogged=true]").isWaterlogged()).toBe(true);
        expect(BlockState.fromString("minecraft:oak_fence[waterlogged=false]").isWaterlogged()).toBe(false);
        expect(BlockState.fromString("minecraft:oak_fence").isWaterlogged()).toBe(false);
    });

    it("provides the builtin constants", () => {
        expect(BlockState.AIR.getId().getFormatted()).toBe("minecraft:air");
        expect(BlockState.AIR.isAir()).toBe(true);
        expect(BlockState.WATER.getId().getFormatted()).toBe("minecraft:water");
        expect(BlockState.WATER.isWater()).toBe(true);
        expect(BlockState.MISSING.getId().getFormatted()).toBe("bluemap:missing");
    });
});

describe("BlockState.getLiquidLevel", () => {
    it("defaults to 0 without a level property", () => {
        expect(BlockState.fromString("minecraft:water").getLiquidLevel()).toBe(0);
    });

    it("parses the level property", () => {
        expect(BlockState.fromString("minecraft:water[level=3]").getLiquidLevel()).toBe(3);
    });

    it("clamps to 0..15", () => {
        expect(BlockState.fromString("minecraft:water[level=20]").getLiquidLevel()).toBe(15);
        expect(BlockState.fromString("minecraft:water[level=-2]").getLiquidLevel()).toBe(0);
    });

    it("falls back to 0 on an unparsable level", () => {
        expect(BlockState.fromString("minecraft:water[level=abc]").getLiquidLevel()).toBe(0);
        expect(BlockState.fromString("minecraft:water[level=1.5]").getLiquidLevel()).toBe(0);
    });

    it("caches the parsed value", () => {
        const state = BlockState.fromString("minecraft:water[level=7]");
        expect(state.getLiquidLevel()).toBe(7);
        expect(state.getLiquidLevel()).toBe(7);
    });
});

describe("BlockState.getRedstonePower", () => {
    it("defaults to 0 without a power property", () => {
        expect(BlockState.fromString("minecraft:redstone_wire").getRedstonePower()).toBe(0);
    });

    it("parses the power property", () => {
        expect(BlockState.fromString("minecraft:redstone_wire[power=7]").getRedstonePower()).toBe(7);
    });

    it("clamps to 0..15", () => {
        expect(BlockState.fromString("minecraft:redstone_wire[power=200]").getRedstonePower()).toBe(15);
        expect(BlockState.fromString("minecraft:redstone_wire[power=-3]").getRedstonePower()).toBe(0);
    });

    it("falls back to 15 on an unparsable power (upstream quirk)", () => {
        expect(BlockState.fromString("minecraft:redstone_wire[power=abc]").getRedstonePower()).toBe(15);
        // out of int-range also throws NumberFormatException in Java
        expect(
            BlockState.fromString("minecraft:redstone_wire[power=99999999999]").getRedstonePower(),
        ).toBe(15);
    });
});

describe("BlockState equality / hashing", () => {
    it("is equal for same id and properties regardless of property order", () => {
        const a = BlockState.fromString("test[x=1,y=2]");
        const b = BlockState.fromString("test[y=2,x=1]");
        expect(a.equals(b)).toBe(true);
        expect(b.equals(a)).toBe(true);
        expect(a.hashCode()).toBe(b.hashCode());
    });

    it("is not equal for different ids or properties", () => {
        const a = BlockState.fromString("test[x=1]");
        expect(a.equals(BlockState.fromString("test2[x=1]"))).toBe(false);
        expect(a.equals(BlockState.fromString("test[x=2]"))).toBe(false);
        expect(a.equals(BlockState.fromString("test[x=1,y=2]"))).toBe(false);
        expect(a.equals(BlockState.fromString("test"))).toBe(false);
        expect(a.equals(null)).toBe(false);
        expect(a.equals("test[x=1]")).toBe(false);
    });

    it("hashCode is a stable, cached 32-bit int", () => {
        const state = BlockState.fromString("minecraft:oak_stairs[facing=east,half=bottom]");
        const hash = state.hashCode();
        expect(hash).toBe(hash | 0);
        expect(state.hashCode()).toBe(hash);
    });

    it("constructed and parsed states are equal", () => {
        const constructed = new BlockState(
            Key.minecraft("water"),
            new Map([["level", "3"]]),
        );
        const parsed = BlockState.fromString("minecraft:water[level=3]");
        expect(constructed.equals(parsed)).toBe(true);
        expect(constructed.hashCode()).toBe(parsed.hashCode());
    });
});

describe("BlockState.Property", () => {
    it("compares interned key/value by identity (=== in JS)", () => {
        const a = new Property("facing", "east");
        const b = new Property("facing", "east");
        expect(a.equals(b)).toBe(true);
        expect(a.equals(new Property("facing", "west"))).toBe(false);
        expect(a.equals(new Property("half", "east"))).toBe(false);
        expect(a.hashCode()).toBe(b.hashCode());
    });

    it("orders by key, then value", () => {
        expect(new Property("a", "x").compareTo(new Property("b", "a"))).toBeLessThan(0);
        expect(new Property("a", "x").compareTo(new Property("a", "y"))).toBeLessThan(0);
        expect(new Property("a", "x").compareTo(new Property("a", "x"))).toBe(0);
    });
});
