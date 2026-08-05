import { describe, expect, it } from "vitest";
import {
    alignBoundaryUp,
    HIRES_TILE_OFFSET,
    HIRES_TILE_SIZE,
    hiresTileMaxBlock,
    hiresTileMinBlock,
    hiresTileOfBlock,
    isHiresTileBoundary,
    regionBlockRange,
    REGION_BLOCKS,
    sanitizeMapId,
} from "./bluemap.js";

describe("the hires tile grid", () => {
    it("is offset by two blocks, which is the whole reason alignment matters", () => {
        // confirmed against a real render: settings.json says hires.translate = [2, 2]
        expect(hiresTileMinBlock(0)).toBe(2);
        expect(hiresTileMaxBlock(0)).toBe(33);
        expect(hiresTileMinBlock(15)).toBe(482);
        expect(hiresTileMaxBlock(15)).toBe(513);
        expect(hiresTileMinBlock(16)).toBe(514);
    });

    it("puts a region edge inside a tile rather than between two", () => {
        // block 512 is a region boundary, and it lands mid-tile
        expect(isHiresTileBoundary(512)).toBe(false);
        expect(hiresTileOfBlock(512)).toBe(hiresTileOfBlock(513));
    });

    it("rounds a region edge up to the next tile edge", () => {
        expect(alignBoundaryUp(512)).toBe(514);
        expect(alignBoundaryUp(0)).toBe(2);
        expect(alignBoundaryUp(2)).toBe(2);
        expect(alignBoundaryUp(-512)).toBe(-510);
    });

    it("aligns every region boundary onto a tile boundary", () => {
        for (let region = -8; region <= 8; region++) {
            const aligned = alignBoundaryUp(region * REGION_BLOCKS);
            expect(isHiresTileBoundary(aligned)).toBe(true);
            expect(aligned - region * REGION_BLOCKS).toBe(2);
        }
    });

    it("agrees with itself about which tile a block is in", () => {
        for (let block = -200; block <= 200; block++) {
            const tile = hiresTileOfBlock(block);
            expect(hiresTileMinBlock(tile)).toBeLessThanOrEqual(block);
            expect(hiresTileMaxBlock(tile)).toBeGreaterThanOrEqual(block);
        }
    });

    it("keeps the constants that the shard configs and the merge both depend on", () => {
        expect(HIRES_TILE_SIZE).toBe(32);
        expect(HIRES_TILE_OFFSET).toBe(2);
        expect(regionBlockRange(-1)).toEqual({ min: -512, max: -1 });
        expect(regionBlockRange(2)).toEqual({ min: 1024, max: 1535 });
    });
});

describe("sanitizeMapId, upstream's BlueMapConfigManager.sanitiseMapId", () => {
    it("reproduces the exact case issue #47 was filed over", () => {
        // Confirmed against a real render: the shard artifact's map directory and the
        // webapp's settings.json ("maps":["test_issue44_staging"]) both agree on this.
        expect(sanitizeMapId("test-issue44-staging")).toBe("test_issue44_staging");
        expect(sanitizeMapId("test-issue39")).toBe("test_issue39");
    });

    it("turns every hyphen into an underscore", () => {
        expect(sanitizeMapId("a-b-c")).toBe("a_b_c");
        expect(sanitizeMapId("-leading")).toBe("_leading");
        expect(sanitizeMapId("trailing-")).toBe("trailing_");
    });

    it("leaves ASCII letters, digits and underscores alone", () => {
        expect(sanitizeMapId("abcXYZ019_")).toBe("abcXYZ019_");
        // no lowercasing on this path - only the auto-discovered-world path lowercases,
        // and this project always writes an explicit maps/<id>.conf file, never that path
        expect(sanitizeMapId("MixedCase")).toBe("MixedCase");
    });

    it("sanitizes every other \\W character the same way, not only the hyphen", () => {
        // Java's \W (default, ASCII word class) is "anything that is not [A-Za-z0-9_]".
        // Every one of these is a character a map id could plausibly carry.
        const cases: [string, string][] = [
            ["my map", "my_map"], // space
            ["v1.2.3", "v1_2_3"], // dot
            ["a+b", "a_b"], // plus
            ["(overworld)", "_overworld_"], // parentheses
            ["it's mine", "it_s_mine"], // apostrophe
            ["a,b", "a_b"], // comma
            ["a:b", "a_b"], // colon
            ["a;b", "a_b"], // semicolon
            ["a@b", "a_b"], // at sign
            ["a#b", "a_b"], // hash
            ["a$b", "a_b"], // dollar
            ["a%b", "a_b"], // percent
            ["a&b", "a_b"], // ampersand
            ["a*b", "a_b"], // asterisk
            ["a=b", "a_b"], // equals
            ["a?b", "a_b"], // question mark
            ["a!b", "a_b"], // exclamation
            ["a~b", "a_b"], // tilde
            ["a|b", "a_b"], // pipe
            ["a/b", "a_b"], // forward slash
            ["a\\b", "a_b"], // backslash
            ["a<b>c", "a_b_c"], // angle brackets
            ["a[b]c", "a_b_c"], // square brackets
            ["a{b}c", "a_b_c"], // curly braces
        ];
        for (const [input, expected] of cases) expect(sanitizeMapId(input)).toBe(expected);
    });

    it("sanitizes non-ASCII letters too, because Java's \\w is ASCII-only by default", () => {
        // No UNICODE_CHARACTER_CLASS flag anywhere on BlueMap's sanitiseMapId call path, so
        // \w is strictly [A-Za-z0-9_] and an accented or non-Latin letter is \W, same as a
        // hyphen. A sanitizer that only special-cased the hyphen would still be wrong here.
        expect(sanitizeMapId("café")).toBe("caf_");
        expect(sanitizeMapId("北京")).toBe("__");
        expect(sanitizeMapId("naïve-map")).toBe("na_ve_map");
    });

    it("is idempotent, so re-sanitizing an already-sanitized id is a no-op", () => {
        for (const id of ["test-issue44-staging", "my map (v1.2)", "already_clean", "北京-2"]) {
            const once = sanitizeMapId(id);
            expect(sanitizeMapId(once)).toBe(once);
        }
    });
});
