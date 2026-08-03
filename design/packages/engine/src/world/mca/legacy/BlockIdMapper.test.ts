import { describe, expect, it } from "vitest";
import { BlockState } from "../../BlockState.js";
import { BlockIdConfig } from "./BlockIdMapper.js";

describe("BlockIdConfig", () => {
    const config = () =>
        new BlockIdConfig({
            "0:0": "minecraft:air[]",
            "1:0": "minecraft:stone[]",
            "1:1": "minecraft:granite[]",
            "6:8": "minecraft:oak_sapling[stage=1]",
            "300:0": "minecraft:numfall[]",
            "modid:block:0": "modid:block_zero[]",
            "modid:block:2": "modid:block_two[]",
            // malformed entries, all skipped with a warning upstream:
            badkey: "minecraft:stone[]", // no id:meta separator
            ":5": "minecraft:stone[]", // empty id
            "5:": "minecraft:stone[]", // empty meta
            "7:x": "minecraft:stone[]", // unparsable meta
            "9:0": "minecraft:stone[foo]", // unparsable block-state value
        });

    it("returns the static AIR for numeral-id 0 (any meta)", () => {
        const c = config();
        expect(c.get(0, 0)).toBe(BlockState.AIR);
        expect(c.get(0, 5)).toBe(BlockState.AIR);
        expect(c.get("whatever:id", 0, 5)).toBe(BlockState.AIR);
        // configured 0:0 entries are replaced by the static field as well
        expect(BlockIdConfig.loadDefault().get(0, 0)).toBe(BlockState.AIR);
    });

    it("resolves exact numeral id:meta mappings", () => {
        const c = config();
        expect(c.get(1, 0).getId().getFormatted()).toBe("minecraft:stone");
        expect(c.get(1, 1).getId().getFormatted()).toBe("minecraft:granite");
        expect(c.get(6, 8).getProperties().get("stage")).toBe("1");
    });

    it("falls back to meta 0, then to MISSING, and caches the result", () => {
        const c = config();
        const stone = c.get(1, 0);
        // meta-fallback
        expect(c.get(1, 4)).toBe(stone);
        // unknown id
        expect(c.get(2, 0)).toBe(BlockState.MISSING);
        expect(c.get(2, 3)).toBe(BlockState.MISSING);
    });

    it("skips malformed config-entries", () => {
        const c = config();
        expect(c.get(5, 0)).toBe(BlockState.MISSING);
        expect(c.get(7, 0)).toBe(BlockState.MISSING);
        expect(c.get(9, 0)).toBe(BlockState.MISSING);
    });

    it("resolves string-ids exactly, then via meta 0, then via the numeral id", () => {
        const c = config();
        expect(c.get("modid:block", 4096, 2).getId().getFormatted()).toBe("modid:block_two");
        // string-id meta-fallback
        expect(c.get("modid:block", 4096, 1).getId().getFormatted()).toBe("modid:block_zero");
        // numeral-id meta-fallback
        expect(c.get("mod:thing", 300, 9)).toBe(c.get(300, 0));
    });

    it("creates (and caches) a plain block-state for fully unknown string-ids", () => {
        const c = config();
        const state = c.get("unknown:thing", 5000, 3);
        expect(state.getId().getFormatted()).toBe("unknown:thing");
        expect(state.getProperties().size).toBe(0);
        // identity-cached (numeral-mapping added by the first lookup)
        expect(c.get("unknown:thing", 5000, 3)).toBe(state);
        expect(c.get(5000, 3)).toBe(state);
    });

    it("lets a cached numeral-mapping win over the string-id (upstream lookup-order)", () => {
        const c = config();
        // exact string-id hits do NOT populate the numeral-cache...
        const blockTwo = c.get("modid:block", 4096, 2);
        const otherThing = c.get("other:thing", 4096, 2);
        expect(otherThing).not.toBe(blockTwo);
        expect(otherThing.getId().getFormatted()).toBe("other:thing");
        // ...but fallback-resolutions do, and that cache then answers for any string-id
        expect(c.get("yet:another", 4096, 2)).toBe(otherThing);
    });

    it("loads the bundled legacy blockIds.json", () => {
        const c = BlockIdConfig.loadDefault();
        expect(BlockIdConfig.loadDefault()).toBe(c); // cached
        expect(c.get(1, 0).getId().getFormatted()).toBe("minecraft:stone");
        expect(c.get(2, 0).getId().getFormatted()).toBe("minecraft:grass");
        const water = c.get(8, 3);
        expect(water.getId().getFormatted()).toBe("minecraft:water");
        expect(water.getProperties().get("level")).toBe("3");
    });
});
