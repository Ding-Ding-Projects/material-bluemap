import { describe, expect, it } from "vitest";
import { ITEM_PATH_PATTERN, decodeTilePath, encodeTilePath } from "./TilePathCodec.js";

/**
 * Direct transliteration of the webapp's pathFromCoords + splitNumberToPath
 * (vendor/BlueMap/common/webapp/src/js/util/Utils.js) used as a reference
 * implementation to verify equivalence.
 */
const pathFromCoords = (x: number, z: number): string => {
    const splitNumberToPath = (num: number): string => {
        let path = "";

        if (num < 0) {
            num = -num;
            path += "-";
        }

        const s = num.toString();

        for (let i = 0; i < s.length; i++) {
            path += s.charAt(i) + "/";
        }

        return path;
    };

    let path = "x";
    path += splitNumberToPath(x);

    path += "z";
    path += splitNumberToPath(z);

    path = path.substring(0, path.length - 1);

    return path;
};

describe("encodeTilePath", () => {
    it("encodes the origin", () => {
        expect(encodeTilePath(0, 0)).toBe("x0/z0");
    });

    it("encodes single-digit coordinates", () => {
        expect(encodeTilePath(1, 2)).toBe("x1/z2");
        expect(encodeTilePath(-1, 2)).toBe("x-1/z2");
        expect(encodeTilePath(1, -2)).toBe("x1/z-2");
    });

    it("splits multi-digit coordinates into one segment per digit", () => {
        expect(encodeTilePath(123, -45)).toBe("x1/2/3/z-4/5");
        expect(encodeTilePath(-10, -100)).toBe("x-1/0/z-1/0/0");
        expect(encodeTilePath(1234567, 0)).toBe("x1/2/3/4/5/6/7/z0");
    });

    it("appends the suffix to the last segment only", () => {
        expect(encodeTilePath(0, 0, ".prbm")).toBe("x0/z0.prbm");
        expect(encodeTilePath(123, -45, ".prbm")).toBe("x1/2/3/z-4/5.prbm");
        expect(encodeTilePath(-1, -1, ".png")).toBe("x-1/z-1.png");
    });

    it("matches the webapp's pathFromCoords for a sweep of coordinates", () => {
        const values = [0, 1, -1, 9, 10, -10, 99, 100, 123, -45, 30000000, -30000000];
        for (const x of values) {
            for (const z of values) {
                expect(encodeTilePath(x, z)).toBe(pathFromCoords(x, z));
            }
        }
    });

    it("truncates non-integer input like Java ints", () => {
        expect(encodeTilePath(1.9, -2.9)).toBe("x1/z-2");
    });
});

describe("decodeTilePath", () => {
    it("decodes the origin", () => {
        expect(decodeTilePath("x0/z0")).toEqual({ x: 0, z: 0 });
    });

    it("decodes multi-digit and negative coordinates", () => {
        expect(decodeTilePath("x1/2/3/z-4/5")).toEqual({ x: 123, z: -45 });
        expect(decodeTilePath("x-1/0/z-1/0/0")).toEqual({ x: -10, z: -100 });
    });

    it("strips the suffix before decoding", () => {
        expect(decodeTilePath("x1/2/3/z-4/5.prbm", ".prbm")).toEqual({ x: 123, z: -45 });
        expect(decodeTilePath("x0/z0.png", ".png")).toEqual({ x: 0, z: 0 });
    });

    it("accepts backslash separators (windows paths)", () => {
        expect(decodeTilePath("x1\\2\\3\\z-4\\5.prbm", ".prbm")).toEqual({ x: 123, z: -45 });
    });

    it("returns null when the suffix does not match", () => {
        expect(decodeTilePath("x0/z0.png", ".prbm")).toBeNull();
        expect(decodeTilePath("x1/2/3/z-4/5.prbm")).toBeNull();
    });

    it("returns null for malformed paths", () => {
        expect(decodeTilePath("foo")).toBeNull();
        expect(decodeTilePath("x/z")).toBeNull();
        expect(decodeTilePath("x1z")).toBeNull();
        expect(decodeTilePath("z1/x2")).toBeNull();
        expect(decodeTilePath("x1/z2/extra")).toBeNull();
        expect(decodeTilePath("")).toBeNull();
    });

    it("round-trips encode -> decode", () => {
        const values = [0, 1, -1, 7, -12, 345, -6789, 2147483647, -2147483648];
        for (const x of values) {
            for (const z of values) {
                expect(decodeTilePath(encodeTilePath(x, z, ".prbm"), ".prbm")).toEqual({ x, z });
                expect(decodeTilePath(encodeTilePath(x, z))).toEqual({ x, z });
            }
        }
    });
});

describe("ITEM_PATH_PATTERN", () => {
    it("matches whole flattened names only (Matcher#matches semantics)", () => {
        expect(ITEM_PATH_PATTERN.test("x123z-45")).toBe(true);
        expect(ITEM_PATH_PATTERN.test("ax123z-45")).toBe(false);
        expect(ITEM_PATH_PATTERN.test("x123z-45b")).toBe(false);
    });
});
