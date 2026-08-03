import { describe, expect, it } from "vitest";
import { cellKey, gridCellPath, parseGridCellPath } from "./gridPath.js";
import {
    compositeLowresTile,
    deriveNextLod,
    halfImageSize,
    LowresTile,
} from "./lowresTile.js";
import { blankImage, decodePng, encodePng } from "./png.js";

const TILE_SIZE = 10;
const SIZE = halfImageSize(TILE_SIZE);

describe("the png codec", () => {
    it("round-trips pixels exactly", () => {
        const image = blankImage(7, 5);
        for (let index = 0; index < image.data.length; index++) image.data[index] = (index * 37) & 0xff;

        const decoded = decodePng(encodePng(image));
        expect(decoded.width).toBe(7);
        expect(decoded.height).toBe(5);
        expect(decoded.data.equals(image.data)).toBe(true);
    });

    it("rejects something that is not a png at all", () => {
        expect(() => decodePng(Buffer.from("this is not a png"))).toThrow(/signature/);
    });
});

describe("the grid path scheme", () => {
    it("matches the paths BlueMap actually wrote", () => {
        // taken from a real render: hires tile (15, 0) landed at x1/5/z0.prbm.gz
        expect(gridCellPath({ x: 15, z: 0 }, ".prbm.gz")).toBe("x1/5/z0.prbm.gz");
        expect(gridCellPath({ x: 0, z: -1 }, ".png")).toBe("x0/z-1.png");
        expect(gridCellPath({ x: 12, z: -34 }, ".png")).toBe("x1/2/z-3/4.png");
    });

    it("round-trips every cell it encodes", () => {
        for (const x of [-137, -10, -1, 0, 1, 9, 15, 204])
            for (const z of [-99, -1, 0, 7, 350]) {
                const path = gridCellPath({ x, z }, ".png");
                expect(parseGridCellPath(path, ".png")).toEqual({ x, z });
            }
    });

    it("ignores files in the tile tree that are not tiles", () => {
        expect(parseGridCellPath("x1/5/notatile.png", ".png")).toBeNull();
        expect(parseGridCellPath("x1/5/z0.png", ".prbm.gz")).toBeNull();
    });
});

describe("a lowres tile", () => {
    it("treats an untouched pixel as unwritten and a written one as written", () => {
        const tile = LowresTile.blank(TILE_SIZE);
        expect(tile.isWritten(3, 4)).toBe(false);
        tile.set(3, 4, { r: 1, g: 2, b: 3, a: 255 }, 70, 6);
        expect(tile.isWritten(3, 4)).toBe(true);
        expect(tile.getColor(3, 4)).toEqual({ r: 1, g: 2, b: 3, a: 255 });
        expect(tile.getHeight(3, 4)).toBe(70);
        expect(tile.getBlockLight(3, 4)).toBe(6);
    });

    it("sign-extends a negative height the way upstream does", () => {
        const tile = LowresTile.blank(TILE_SIZE);
        tile.set(0, 0, { r: 0, g: 0, b: 0, a: 255 }, -60, 0);
        expect(tile.getHeight(0, 0)).toBe(-60);
        // upstream's comparison is `> 0x8000`, so exactly 0x8000 stays positive
        tile.set(1, 0, { r: 0, g: 0, b: 0, a: 255 }, 0x8000, 0);
        expect(tile.getHeight(1, 0)).toBe(0x8000);
    });

    it("separates an erasure from real terrain and from an untouched pixel", () => {
        const tile = LowresTile.blank(TILE_SIZE);
        // an erasure: written, but transparent at height 0 with no block light
        tile.set(1, 1, { r: 0, g: 0, b: 0, a: 0 }, 0, 0);
        expect(tile.isWritten(1, 1)).toBe(true);
        expect(tile.hasContent(1, 1)).toBe(false);

        tile.set(2, 2, { r: 0, g: 0, b: 0, a: 0 }, 64, 0);
        expect(tile.hasContent(2, 2)).toBe(true); // transparent, but a real height

        expect(tile.isWritten(9, 9)).toBe(false);
        expect(tile.hasContent(9, 9)).toBe(false);
    });

    it("survives an encode and decode round trip", () => {
        const tile = LowresTile.blank(TILE_SIZE);
        tile.set(5, 6, { r: 200, g: 100, b: 50, a: 255 }, 128, 9);
        const decoded = LowresTile.decode(tile.encode(), TILE_SIZE);
        expect(decoded.getColor(5, 6)).toEqual({ r: 200, g: 100, b: 50, a: 255 });
        expect(decoded.getHeight(5, 6)).toBe(128);
        expect(decoded.getBlockLight(5, 6)).toBe(9);
    });

    it("rejects a tile of the wrong size instead of reading past its edge", () => {
        const wrong = encodePng(blankImage(4, 8));
        expect(() => LowresTile.decode(wrong, TILE_SIZE)).toThrow(/wrong size/);
    });
});

describe("compositing shards' lowres tiles", () => {
    it("takes each pixel from the shard that rendered it", () => {
        const left = LowresTile.blank(TILE_SIZE);
        const right = LowresTile.blank(TILE_SIZE);
        left.set(1, 1, { r: 10, g: 20, b: 30, a: 255 }, 64, 1);
        right.set(8, 8, { r: 40, g: 50, b: 60, a: 255 }, 72, 2);

        const result = compositeLowresTile([left, right], TILE_SIZE);
        expect(result.conflictingPixels).toBe(0);
        expect(result.claimedPixels).toBe(2);
        expect(result.tile.getColor(1, 1)).toEqual({ r: 10, g: 20, b: 30, a: 255 });
        expect(result.tile.getColor(8, 8)).toEqual({ r: 40, g: 50, b: 60, a: 255 });
        expect(result.tile.isWritten(5, 5)).toBe(false);
    });

    it("lets rendered terrain beat another shard's erasure, whichever comes first", () => {
        const rendered = LowresTile.blank(TILE_SIZE);
        rendered.set(4, 4, { r: 90, g: 90, b: 90, a: 255 }, 88, 3);
        const eraser = LowresTile.blank(TILE_SIZE);
        eraser.set(4, 4, { r: 0, g: 0, b: 0, a: 0 }, 0, 0);

        for (const sources of [
            [eraser, rendered],
            [rendered, eraser],
        ]) {
            const result = compositeLowresTile(sources, TILE_SIZE);
            expect(result.conflictingPixels).toBe(0);
            expect(result.overruledErasures).toBe(1);
            expect(result.tile.getColor(4, 4)).toEqual({ r: 90, g: 90, b: 90, a: 255 });
            expect(result.tile.getHeight(4, 4)).toBe(88);
        }
    });

    it("keeps an all-empty pixel written, because a void column really is empty", () => {
        const first = LowresTile.blank(TILE_SIZE);
        first.set(2, 3, { r: 0, g: 0, b: 0, a: 0 }, 0, 0);
        const second = LowresTile.blank(TILE_SIZE);
        second.set(2, 3, { r: 0, g: 0, b: 0, a: 0 }, 0, 0);

        const result = compositeLowresTile([first, second], TILE_SIZE);
        expect(result.emptyPixels).toBe(1);
        expect(result.conflictingPixels).toBe(0);
        expect(result.tile.isWritten(2, 3)).toBe(true);
        expect(result.tile.hasContent(2, 3)).toBe(false);
    });

    it("reports a real disagreement rather than picking a winner", () => {
        const first = LowresTile.blank(TILE_SIZE);
        first.set(6, 6, { r: 1, g: 1, b: 1, a: 255 }, 10, 0);
        const second = LowresTile.blank(TILE_SIZE);
        second.set(6, 6, { r: 2, g: 2, b: 2, a: 255 }, 20, 0);

        const result = compositeLowresTile([first, second], TILE_SIZE);
        expect(result.conflictingPixels).toBe(1);
        expect(result.firstConflict).toEqual({ x: 6, z: 6 });
    });
});

describe("deriving the next lod", () => {
    const factor = 5;
    const size = 10; // two groups per axis

    it("averages each block of pixels into one, in float32 like upstream", () => {
        const source = new Map<string, LowresTile>();
        const tile = LowresTile.blank(size);
        // fill the first 5x5 group with a colour, the rest stays transparent
        for (let x = 0; x < factor; x++)
            for (let z = 0; z < factor; z++) tile.set(x, z, { r: 100, g: 200, b: 40, a: 255 }, 80, 5);
        source.set(cellKey({ x: 0, z: 0 }), tile);

        const derived = deriveNextLod(source, size, factor);
        const next = derived.get(cellKey({ x: 0, z: 0 }));
        expect(next).toBeDefined();

        // A uniform group averages to very nearly itself, and the blue channel comes back
        // one step low. That is not a bug to be rounded away: 40/255 summed twenty-five
        // times and multiplied by float32 1/25 lands a hair under 40/255, and upstream's
        // `Color#getInt` truncates rather than rounds, so java produces 39 here too.
        // Reproducing it is the point; a "nicer" 40 would put every merged coarse tile
        // permanently out of step with a directly rendered one.
        expect(next!.getColor(0, 0)).toEqual({ r: 100, g: 200, b: 39, a: 255 });
        expect(next!.getHeight(0, 0)).toBe(80);
        expect(next!.getBlockLight(0, 0)).toBe(5);

        // the untouched group averages to nothing, but is still marked written
        expect(next!.getColor(1, 1).a).toBe(0);
        expect(next!.getHeight(1, 1)).toBe(0);
        expect(next!.isWritten(1, 1)).toBe(true);
    });

    it("averages heights with java's truncating integer division", () => {
        const source = new Map<string, LowresTile>();
        const tile = LowresTile.blank(size);
        let value = 0;
        for (let x = 0; x < factor; x++)
            for (let z = 0; z < factor; z++) tile.set(x, z, { r: 0, g: 0, b: 0, a: 255 }, value++, 0);
        source.set(cellKey({ x: 0, z: 0 }), tile);

        const next = deriveNextLod(source, size, factor).get(cellKey({ x: 0, z: 0 }));
        // 0..24 sums to 300, and 300 / 25 is exactly 12
        expect(next!.getHeight(0, 0)).toBe(12);
    });

    it("folds five tiles of one lod into one tile of the next", () => {
        const source = new Map<string, LowresTile>();
        for (let x = 0; x < factor; x++) {
            const tile = LowresTile.blank(size);
            tile.set(0, 0, { r: 255, g: 0, b: 0, a: 255 }, 64, 0);
            source.set(cellKey({ x, z: 0 }), tile);
        }

        const derived = deriveNextLod(source, size, factor);
        // cells 0..4 all map into next-lod cell 0
        expect(derived.has(cellKey({ x: 0, z: 0 }))).toBe(true);
        expect([...derived.keys()].filter((key) => key.endsWith(",0")).length).toBeGreaterThan(0);
        for (const key of derived.keys()) expect(Number(key.split(",")[0])).toBeLessThanOrEqual(0);
    });

    it("writes the shared edge pixel into the neighbouring tile, for seamless seams", () => {
        const source = new Map<string, LowresTile>();
        const tile = LowresTile.blank(size);
        for (let x = 0; x < factor; x++)
            for (let z = 0; z < factor; z++) tile.set(x, z, { r: 7, g: 7, b: 7, a: 255 }, 33, 0);
        source.set(cellKey({ x: 0, z: 0 }), tile);

        const derived = deriveNextLod(source, size, factor);
        const west = derived.get(cellKey({ x: -1, z: 0 }));
        expect(west).toBeDefined();
        // the neighbour receives it at the far edge column
        expect(west!.getColor(size, 0)).toEqual({ r: 7, g: 7, b: 7, a: 255 });
    });

    it("does not depend on the order the tiles arrive in", () => {
        const build = (order: number[]): Map<string, LowresTile> => {
            const source = new Map<string, LowresTile>();
            for (const x of order) {
                const tile = LowresTile.blank(size);
                tile.set(0, 0, { r: 10 * (x + 1), g: 0, b: 0, a: 255 }, 20 + x, 0);
                source.set(cellKey({ x, z: 0 }), tile);
            }
            return source;
        };

        const forward = deriveNextLod(build([0, 1, 2]), size, factor);
        const backward = deriveNextLod(build([2, 1, 0]), size, factor);
        expect([...forward.keys()].sort()).toEqual([...backward.keys()].sort());
        for (const [key, tile] of forward)
            expect(tile.encode().equals(backward.get(key)!.encode())).toBe(true);
    });
});

describe("the half-image geometry", () => {
    it("adds one pixel for the shared edge, exactly as upstream does", () => {
        expect(halfImageSize(500)).toBe(501);
        expect(LowresTile.blank(TILE_SIZE).image.height).toBe(SIZE * 2);
        expect(LowresTile.blank(TILE_SIZE).image.width).toBe(SIZE);
    });
});
