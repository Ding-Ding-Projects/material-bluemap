import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { Color, Vector2i } from "@material-bluemap/shared";
import { LowresTile } from "./LowresTile.js";

const SIZE = new Vector2i(4, 4);

function color(argb: number): Color {
    return new Color().set(argb);
}

describe("LowresTile", () => {
    it("is one pixel wider and twice as tall as the tile-grid, for seamless edges", () => {
        const png = PNG.sync.read(new LowresTile(SIZE).save());
        expect(png.width).toBe(5);
        expect(png.height).toBe(10);
    });

    it("round-trips a straight color through the upper half", () => {
        const tile = new LowresTile(SIZE);
        tile.set(2, 3, color(0x8012_3456 | 0), 0, 0);

        const read = tile.getColor(2, 3, new Color());
        expect(read.getInt()).toBe(0x8012_3456 | 0);
        expect(read.isPremultiplied).toBe(false);
    });

    it("converts a premultiplied color to straight on the way in", () => {
        const tile = new LowresTile(SIZE);
        // 50% alpha, premultiplied half-intensity red -> straight full red
        const premultiplied = new Color().set(0.5, 0, 0, 0.5, true);
        tile.set(0, 0, premultiplied, 0, 0);

        expect(tile.getColor(0, 0, new Color()).getInt()).toBe(0x7fff_0000 | 0);
    });

    it("packs height and block-light into the lower half", () => {
        const tile = new LowresTile(SIZE);
        tile.set(1, 1, color(0), 1234, 13);

        expect(tile.getHeight(1, 1)).toBe(1234);
        expect(tile.getBlockLight(1, 1)).toBe(13);
    });

    it("sign-extends a negative height out of its 16 bits", () => {
        const tile = new LowresTile(SIZE);
        tile.set(1, 1, color(0), -64, 4);

        expect(tile.getHeight(1, 1)).toBe(-64);
        expect(tile.getBlockLight(1, 1)).toBe(4);

        // upstream's sign-extension is `if (height > 0x8000)`, not `>=`, so the one value
        // whose 16-bit form is exactly 0x8000 reads back positive. Kept bug-for-bug: a
        // world floor at y = -32768 does not exist, and "fixing" it would change tiles.
        tile.set(2, 2, color(0), -32768, 0);
        expect(tile.getHeight(2, 2)).toBe(32768);
        tile.set(2, 2, color(0), -32767, 0);
        expect(tile.getHeight(2, 2)).toBe(-32767);

        tile.set(3, 3, color(0), 32767, 0);
        expect(tile.getHeight(3, 3)).toBe(32767);
    });

    it("reads an unwritten cell as fully transparent with height and light 0", () => {
        const tile = new LowresTile(SIZE);
        expect(tile.getColor(0, 0, new Color()).getInt()).toBe(0);
        expect(tile.getHeight(0, 0)).toBe(0);
        expect(tile.getBlockLight(0, 0)).toBe(0);
    });

    it("survives a save/load round-trip", () => {
        const tile = new LowresTile(SIZE);
        tile.set(0, 0, color(0xff11_2233 | 0), -5, 15);
        tile.set(4, 4, color(0x40aa_bbcc | 0), 300, 7);

        const reloaded = new LowresTile(SIZE, tile.save());
        expect(reloaded.getColor(0, 0, new Color()).getInt()).toBe(0xff11_2233 | 0);
        expect(reloaded.getHeight(0, 0)).toBe(-5);
        expect(reloaded.getBlockLight(0, 0)).toBe(15);
        expect(reloaded.getColor(4, 4, new Color()).getInt()).toBe(0x40aa_bbcc | 0);
        expect(reloaded.getHeight(4, 4)).toBe(300);
        expect(reloaded.getBlockLight(4, 4)).toBe(7);
    });

    it("rejects a stored image of the wrong size", () => {
        const wrong = new LowresTile(new Vector2i(8, 8)).save();
        expect(() => new LowresTile(SIZE, wrong)).toThrow("Size of tile does not match");
    });
});
