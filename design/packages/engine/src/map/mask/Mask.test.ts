import { describe, expect, it } from "vitest";
import { Vector2d, Vector3i } from "@worldlens/shared";
import { Tristate } from "../../util/Tristate.js";
import { BlurMask } from "./BlurMask.js";
import { BoxMask } from "./BoxMask.js";
import { CombinedMask } from "./CombinedMask.js";
import { EllipseMask } from "./EllipseMask.js";
import { Mask } from "./Mask.js";
import { PolygonMask, type Shape } from "./PolygonMask.js";

function shape(...points: [number, number][]): Shape {
    const vectors = points.map(([x, z]) => new Vector2d(x, z));
    return { getPoints: () => vectors };
}

describe("Mask.NONE / Mask.ALL", () => {
    it("NONE never applies and ALL always does", () => {
        expect(Mask.NONE.test(1, 2, 3)).toBe(false);
        expect(Mask.NONE.test(0, 0, 0, 10, 10, 10)).toBe(Tristate.FALSE);
        expect(Mask.NONE.isEdge(0, 0, 10, 10)).toBe(false);

        expect(Mask.ALL.test(1, 2, 3)).toBe(true);
        expect(Mask.ALL.test(0, 0, 0, 10, 10, 10)).toBe(Tristate.TRUE);
        expect(Mask.ALL.isEdge(0, 0, 10, 10)).toBe(false);
    });

    it("ALL is NONE inverted, and inverting it again returns NONE itself", () => {
        expect(Mask.ALL.inverted()).toBe(Mask.NONE);
    });

    it("collapses submasks to the constants", () => {
        expect(Mask.NONE.submask(0, 0, 0, 1, 1, 1)).toBe(Mask.NONE);
        expect(Mask.ALL.submask(0, 0, 0, 1, 1, 1)).toBe(Mask.ALL);
    });
});

describe("BoxMask", () => {
    const box = new BoxMask(new Vector3i(0, 0, 0), new Vector3i(10, 10, 10));

    it("tests points inclusively on both bounds", () => {
        expect(box.test(5, 5, 5)).toBe(true);
        expect(box.test(0, 0, 0)).toBe(true);
        expect(box.test(10, 10, 10)).toBe(true);
        expect(box.test(11, 5, 5)).toBe(false);
        expect(box.test(5, -1, 5)).toBe(false);
    });

    it("tests regions as fully in, fully out or mixed", () => {
        expect(box.test(0, 0, 0, 10, 10, 10)).toBe(Tristate.TRUE);
        expect(box.test(2, 2, 2, 8, 8, 8)).toBe(Tristate.TRUE);
        expect(box.test(-5, -5, -5, 5, 5, 5)).toBe(Tristate.UNDEFINED);
        expect(box.test(20, 20, 20, 30, 30, 30)).toBe(Tristate.FALSE);
    });

    it("reports an xz-region as an edge exactly when it straddles the box", () => {
        expect(box.isEdge(-5, -5, 5, 5)).toBe(true);
        expect(box.isEdge(2, 2, 8, 8)).toBe(false);
        expect(box.isEdge(20, 20, 30, 30)).toBe(false);
    });

    it("resolves a submask to the constants where the answer is already known", () => {
        expect(box.submask(0, 0, 0, 10, 10, 10)).toBe(Mask.ALL);
        expect(box.submask(20, 20, 20, 30, 30, 30)).toBe(Mask.NONE);
        expect(box.submask(-5, -5, -5, 5, 5, 5)).toBe(box);
    });

    it("inverts", () => {
        const inverted = box.inverted();
        expect(inverted.test(5, 5, 5)).toBe(false);
        expect(inverted.test(11, 5, 5)).toBe(true);
        expect(inverted.test(0, 0, 0, 10, 10, 10)).toBe(Tristate.FALSE);
        expect(inverted.test(20, 20, 20, 30, 30, 30)).toBe(Tristate.TRUE);
        // upstream: the inverted view's isEdge delegates *without* negating
        expect(inverted.isEdge(-5, -5, 5, 5)).toBe(true);
        expect(inverted.inverted()).toBe(box);
    });
});

describe("EllipseMask", () => {
    const circle = new EllipseMask(new Vector2d(0, 0), 10, 0, 20);

    it("uses the single-radius constructor as a circle", () => {
        expect(circle.test(0, 10, 0)).toBe(true);
        expect(circle.test(10, 10, 0)).toBe(true);
        expect(circle.test(11, 10, 0)).toBe(false);
        expect(circle.test(0, 25, 0)).toBe(false);
        expect(circle.test(0, -1, 0)).toBe(false);
    });

    it("uses independent radii in the five-argument constructor", () => {
        const ellipse = new EllipseMask(new Vector2d(0, 0), 10, 2, 0, 20);
        expect(ellipse.testXZ(10, 0)).toBe(true);
        expect(ellipse.testXZ(0, 2)).toBe(true);
        expect(ellipse.testXZ(0, 3)).toBe(false);
        expect(ellipse.testXZ(5, 2)).toBe(false);
    });

    it("tests xz-rectangles by corners then by the closest point", () => {
        expect(circle.testXZ(0, 0, 5, 5)).toBe(Tristate.TRUE);
        expect(circle.testXZ(0, 0, 20, 20)).toBe(Tristate.UNDEFINED);
        expect(circle.testXZ(20, 20, 30, 30)).toBe(Tristate.FALSE);
    });

    it("combines the y-range with the xz-test", () => {
        expect(circle.test(0, 0, 0, 5, 20, 5)).toBe(Tristate.TRUE);
        expect(circle.test(0, -5, 0, 5, 5, 5)).toBe(Tristate.UNDEFINED);
        expect(circle.test(0, 30, 0, 5, 40, 5)).toBe(Tristate.FALSE);
        expect(circle.testY(0, 20)).toBe(Tristate.TRUE);
        expect(circle.testY(-5, 5)).toBe(Tristate.UNDEFINED);
        expect(circle.testY(21, 30)).toBe(Tristate.FALSE);
    });

    it("is an edge only where the border crosses", () => {
        expect(circle.isEdge(0, 0, 20, 20)).toBe(true);
        expect(circle.isEdge(0, 0, 5, 5)).toBe(false);
        expect(circle.isEdge(20, 20, 30, 30)).toBe(false);
    });
});

describe("PolygonMask", () => {
    const square = new PolygonMask(shape([0, 0], [10, 0], [10, 10], [0, 10]), 0, 20);

    it("applies the even-odd rule on the xz-plane inside the y-range", () => {
        expect(square.test(5, 10, 5)).toBe(true);
        expect(square.test(11, 10, 5)).toBe(false);
        expect(square.test(5, 25, 5)).toBe(false);
    });

    it("handles a concave polygon's notch", () => {
        // an L shape: the notch at (8, 8) is outside even though it is inside the bbox
        const l = new PolygonMask(
            shape([0, 0], [10, 0], [10, 5], [5, 5], [5, 10], [0, 10]),
            0,
            20,
        );
        expect(l.testXZ(2, 2)).toBe(true);
        expect(l.testXZ(8, 2)).toBe(true);
        expect(l.testXZ(2, 8)).toBe(true);
        expect(l.testXZ(8, 8)).toBe(false);
    });

    it("returns UNDEFINED only where an edge crosses the rectangle", () => {
        expect(square.testXZ(2, 2, 8, 8)).toBe(Tristate.TRUE);
        expect(square.testXZ(-5, -5, 5, 5)).toBe(Tristate.UNDEFINED);
        expect(square.testXZ(20, 20, 30, 30)).toBe(Tristate.FALSE);
        expect(square.isEdge(-5, -5, 5, 5)).toBe(true);
        expect(square.isEdge(2, 2, 8, 8)).toBe(false);
    });
});

describe("CombinedMask", () => {
    it("is all-true while empty", () => {
        const combined = new CombinedMask();
        expect(combined.size()).toBe(0);
        expect(combined.test(1, 2, 3)).toBe(true);
        expect(combined.test(0, 0, 0, 1, 1, 1)).toBe(Tristate.TRUE);
    });

    it("lets the last matching layer decide", () => {
        const combined = new CombinedMask();
        combined.add(new BoxMask(new Vector3i(0, 0, 0), new Vector3i(10, 10, 10)), true);
        combined.add(new BoxMask(new Vector3i(4, 4, 4), new Vector3i(6, 6, 6)), false);

        expect(combined.test(5, 5, 5)).toBe(false); // cut out by the later layer
        expect(combined.test(2, 2, 2)).toBe(true);
        expect(combined.test(20, 20, 20)).toBe(false); // matched by no layer at all
        expect(combined.size()).toBe(2);
    });

    it("prepends an all-true layer when the first added layer subtracts", () => {
        const combined = new CombinedMask();
        combined.add(new BoxMask(new Vector3i(0, 0, 0), new Vector3i(10, 10, 10)), false);

        expect(combined.size()).toBe(2);
        expect(combined.test(5, 5, 5)).toBe(false);
        expect(combined.test(20, 20, 20)).toBe(true);
    });

    it("optimizes a submask down to the layers that still matter", () => {
        const combined = new CombinedMask();
        combined.add(new BoxMask(new Vector3i(0, 0, 0), new Vector3i(10, 10, 10)), true);
        combined.add(new BoxMask(new Vector3i(100, 0, 100), new Vector3i(110, 10, 110)), true);

        expect(combined.submask(0, 0, 0, 10, 10, 10)).toBe(Mask.ALL);
        expect(combined.submask(50, 0, 50, 60, 10, 60)).toBe(Mask.NONE);

        const optimized = combined.submask(-5, -5, -5, 5, 5, 5);
        expect(optimized).toBeInstanceOf(CombinedMask);
        // the far-away layer is dropped; the straddling one survives as its own submask
        expect((optimized as CombinedMask).size()).toBe(1);
        expect(optimized.test(2, 2, 2)).toBe(true);
    });

    it("is an edge if any layer is", () => {
        const combined = new CombinedMask();
        combined.add(new BoxMask(new Vector3i(0, 0, 0), new Vector3i(10, 10, 10)), true);
        expect(combined.isEdge(-5, -5, 5, 5)).toBe(true);
        expect(combined.isEdge(2, 2, 8, 8)).toBe(false);
    });
});

describe("BlurMask", () => {
    /**
     * The expected coordinates are the offsets produced by upstream's
     * {@code BlurMask#randomOffset}, taken from a run of that exact java expression on a
     * JDK (Temurin 25). They are the whole point of the mask: a `number` implementation of
     * its 64-bit hash produces different offsets, and therefore a differently-frayed edge.
     */
    const oracle: [x: number, y: number, z: number, size: number, offsets: [number, number, number]][] = [
        [0, 0, 0, 4, [-1, -2, 1]],
        [0, 0, 0, 16, [-4, -9, 4]],
        [1, 2, 3, 16, [7, -3, 4]],
        [-1, -2, -3, 16, [0, -3, -15]],
        [100, 64, -250, 16, [11, 0, 1]],
        [123456, -7, 890, 16, [-13, 7, 13]],
        [-2147483648, 2147483647, 5, 16, [1, -13, 6]],
        // every offset scales to 0 at size 1
        [1, 2, 3, 1, [0, 0, 0]],
    ];

    function recordingCombinedMask(seen: [number, number, number][]): CombinedMask {
        const combined = new CombinedMask();
        combined.add(
            {
                test(...args: number[]): never {
                    seen.push([args[0]!, args[1]!, args[2]!]);
                    return true as never;
                },
                isEdge: () => false,
                submask: (): never => {
                    throw new Error("unused");
                },
                inverted: (): never => {
                    throw new Error("unused");
                },
            },
            true,
        );
        return combined;
    }

    it.each(oracle)(
        "offsets (%i, %i, %i) at size %i by the java-computed hash",
        (x, y, z, size, offsets) => {
            const seen: [number, number, number][] = [];
            const blur = new BlurMask(recordingCombinedMask(seen), size);

            expect(blur.test(x, y, z)).toBe(true);
            expect(seen).toEqual([[x + offsets[0], y + offsets[1], z + offsets[2]]]);
        },
    );

    it("grows the region- and edge-tests by its size instead of blurring them", () => {
        const inner = new CombinedMask();
        inner.add(new BoxMask(new Vector3i(0, 0, 0), new Vector3i(10, 10, 10)), true);
        const blur = new BlurMask(inner, 4);

        // the region is grown by the blur-size before being tested, so a region the box
        // fully contains can become a straddling one ...
        expect(inner.test(12, 12, 12, 14, 14, 14)).toBe(Tristate.FALSE);
        expect(blur.test(12, 12, 12, 14, 14, 14)).toBe(Tristate.UNDEFINED);
        // ... while one well inside stays fully inside, and one well outside stays out
        expect(blur.test(5, 5, 5, 6, 6, 6)).toBe(Tristate.TRUE);
        expect(blur.test(20, 20, 20, 30, 30, 30)).toBe(Tristate.FALSE);
        // the grown edge reaches further out than the box's own
        expect(blur.isEdge(12, 12, 20, 20)).toBe(true);
        expect(inner.isEdge(12, 12, 20, 20)).toBe(false);
    });
});
