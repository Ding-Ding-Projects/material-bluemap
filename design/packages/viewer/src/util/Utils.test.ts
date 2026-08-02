import { describe, expect, it } from "vitest";

// Utils.ts creates a 1x1 canvas 2d-context at module load (for getPixel); provide the
// minimal DOM surface it needs so the module can be imported in the node test environment.
(globalThis as Record<string, unknown>)["document"] ??= {
    createElement: () => ({ getContext: () => null }),
    createElementNS: () => ({}),
};

const {
    pathFromCoords,
    hashTile,
    dispatchEvent,
    animate,
    EasingFunctions,
    deepEquals,
    softMin,
    softMax,
    softClamp,
    softSet,
    vecArrToObj,
} = await import("./Utils");

describe("pathFromCoords", () => {
    it("splits digits into folders and joins x/z", () => {
        expect(pathFromCoords(0, 0)).toBe("x0/z0");
        expect(pathFromCoords(123, 45)).toBe("x1/2/3/z4/5");
    });

    it("prefixes negative numbers with a '-' segment", () => {
        expect(pathFromCoords(-1, -23)).toBe("x-1/z-2/3");
    });
});

describe("hashTile", () => {
    it("hashes tile coordinates", () => {
        expect(hashTile(3, -4)).toBe("x3z-4");
        expect(hashTile(0, 0)).toBe("x0z0");
    });
});

describe("dispatchEvent", () => {
    it("dispatches a CustomEvent with the given detail", () => {
        const target = new EventTarget();
        let received: unknown = null;
        target.addEventListener("bluemapTest", (event) => {
            received = (event as CustomEvent).detail;
        });

        const result = dispatchEvent(target, "bluemapTest", { some: "data" });

        expect(result).toBe(true);
        expect(received).toEqual({ some: "data" });
    });

    it("returns undefined for missing elements", () => {
        expect(dispatchEvent(null, "bluemapTest")).toBeUndefined();
        expect(dispatchEvent(undefined, "bluemapTest")).toBeUndefined();
    });
});

describe("animate", () => {
    it("runs synchronously with duration 0 and reports finished", () => {
        const frames: Array<[number, number]> = [];
        let finished: boolean | null = null;

        animate(
            (progress, deltaTime) => frames.push([progress, deltaTime]),
            0,
            (f) => {
                finished = f;
            },
        );

        expect(frames).toEqual([[1, 0]]);
        expect(finished).toBe(true);
    });

    it("reports cancelled via the post-animation callback", () => {
        const results: boolean[] = [];
        const animation = animate(
            () => {},
            0,
            (f) => results.push(f),
        );

        animation.cancel();

        expect(animation.cancelled).toBe(true);
        expect(results).toEqual([true, false]);
    });
});

describe("EasingFunctions", () => {
    it("evaluates the easing curves", () => {
        expect(EasingFunctions.linear!(0.25)).toBe(0.25);
        expect(EasingFunctions.easeInQuad!(0.5)).toBe(0.25);
        expect(EasingFunctions.easeOutQuad!(0.5)).toBe(0.75);
        expect(EasingFunctions.easeInOutQuad!(0.5)).toBe(0.5);
        expect(EasingFunctions.easeOutCubic!(1)).toBe(1);
        expect(EasingFunctions.easeInOutQuint!(0)).toBe(0);
        expect(EasingFunctions.easeInOutQuint!(1)).toBe(1);
    });
});

describe("deepEquals", () => {
    it("compares primitives with Object.is semantics", () => {
        expect(deepEquals(1, 1)).toBe(true);
        expect(deepEquals(1, 2)).toBe(false);
        expect(deepEquals("a", "a")).toBe(true);
        expect(deepEquals("a", "b")).toBe(false);
        expect(deepEquals(NaN, NaN)).toBe(true);
        expect(deepEquals(1, "1")).toBe(false);
    });

    it("compares parsed-json-like objects and arrays recursively", () => {
        expect(deepEquals({ a: 1, b: [1, 2] }, { a: 1, b: [1, 2] })).toBe(true);
        expect(deepEquals({ a: 1, b: [1, 2] }, { a: 1, b: [1, 3] })).toBe(false);
        expect(deepEquals([1, [2, 3]], [1, [2, 3]])).toBe(true);
        expect(deepEquals([1, 2], [1, 2, 3])).toBe(false);
    });

    it("only checks properties of the first object (upstream behavior)", () => {
        expect(deepEquals({ a: 1 }, { a: 1, b: 2 })).toBe(true);
        expect(deepEquals({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    });
});

describe("soft clamping", () => {
    it("softMin moves values towards the minimum by stiffness", () => {
        expect(softMin(10, 10, 0.5)).toBe(10);
        expect(softMin(12, 10, 0.5)).toBe(12);
        expect(softMin(5, 10, 0.5)).toBe(7.5);
        expect(softMin(9.99995, 10, 0.5)).toBe(10); // snaps below the 0.0001 threshold
    });

    it("softMax moves values towards the maximum by stiffness", () => {
        expect(softMax(10, 10, 0.5)).toBe(10);
        expect(softMax(8, 10, 0.5)).toBe(8);
        expect(softMax(15, 10, 0.5)).toBe(12.5);
        expect(softMax(10.00005, 10, 0.5)).toBe(10); // snaps below the 0.0001 threshold
    });

    it("softClamp combines both directions", () => {
        expect(softClamp(5, 0, 10, 0.5)).toBe(5);
        expect(softClamp(-10, 0, 10, 0.5)).toBe(-5);
        expect(softClamp(20, 0, 10, 0.5)).toBe(15);
    });

    it("softSet clamps towards a single target", () => {
        expect(softSet(0, 10, 0.5)).toBe(5);
        expect(softSet(20, 10, 0.5)).toBe(15);
        expect(softSet(10, 10, 0.5)).toBe(10);
    });
});

describe("vecArrToObj", () => {
    it("maps the first two entries to x/y or x/z", () => {
        expect(vecArrToObj([1, 2])).toEqual({ x: 1, y: 2 });
        expect(vecArrToObj([1, 2], true)).toEqual({ x: 1, z: 2 });
        expect(vecArrToObj([1, 2, 3])).toEqual({ x: 1, y: 2 });
    });

    it("returns an empty object for missing or too-short values", () => {
        expect(vecArrToObj(undefined)).toEqual({});
        expect(vecArrToObj(null)).toEqual({});
        expect(vecArrToObj([1])).toEqual({});
    });
});
