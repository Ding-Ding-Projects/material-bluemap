import { Color } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { GrassColorModifier } from "./GrassColorModifier.js";

// the modifiers never read from the block, they only write to the color
const block = null as never;

describe("GrassColorModifier", () => {
    it("NONE leaves the color untouched", () => {
        const color = new Color().set(0xff88aa44 | 0, true);
        GrassColorModifier.NONE.apply(block, color);
        expect(color.getInt()).toBe(0xff88aa44 | 0);
    });

    it("DARK_FOREST averages the color with 0x28340a", () => {
        const color = new Color().set(0xff88aa44 | 0, true);
        GrassColorModifier.DARK_FOREST.apply(block, color);
        // ((0x88aa44 & 0xfefefe) + 0x28340a) >> 1 | 0xff000000
        const expected = ((((0x88aa44 & 0xfefefe) + 0x28340a) >> 1) | 0xff000000) | 0;
        expect(color.getInt()).toBe(expected);
        expect(color.getInt()).toBe(0xff586f27 | 0);
    });

    it("SWAMP sets the fixed swamp color", () => {
        const color = new Color().set(0xff88aa44 | 0, true);
        GrassColorModifier.SWAMP.apply(block, color);
        expect(color.getInt()).toBe(0xff6a7039 | 0);
    });

    it("registers the builtin modifiers", () => {
        expect(GrassColorModifier.NONE.getKey().getFormatted()).toBe("minecraft:none");
        expect(GrassColorModifier.DARK_FOREST.getKey().getFormatted()).toBe("minecraft:dark_forest");
        expect(GrassColorModifier.SWAMP.getKey().getFormatted()).toBe("minecraft:swamp");

        expect(GrassColorModifier.REGISTRY.get(GrassColorModifier.SWAMP.getKey())).toBe(
            GrassColorModifier.SWAMP,
        );
        expect(GrassColorModifier.REGISTRY.values()).toHaveLength(3);
    });
});
