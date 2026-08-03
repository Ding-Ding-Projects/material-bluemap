import { MatrixM3f, MatrixM4f } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { ArrayTileModel } from "./ArrayTileModel.js";
import { MaxCapacityReachedException } from "./MaxCapacityReachedException.js";
import { ORACLE_CASES } from "./prbmOracleData.js";
import { ORACLE_MODEL_BUILDERS, materialIndicesOf, positionBitsOf } from "./prbmOracleFixture.js";

/** upstream: map/hires/ArrayTileModel.java */
describe("ArrayTileModel — against the upstream oracle", () => {
    for (const [name, expected] of Object.entries(ORACLE_CASES)) {
        it(`reproduces the post-sort model for "${name}", bit for bit`, () => {
            const model = ORACLE_MODEL_BUILDERS[name]!();
            expect(model.size()).toBe(expected.size);
            expect(materialIndicesOf(model)).toEqual([...expected.materialIndex]);
            expect(positionBitsOf(model)).toEqual([...expected.positionBits]);
        });
    }
});

describe("ArrayTileModel — capacity", () => {
    it("starts at the requested capacity and grows by 1.5x + count", () => {
        const model = new ArrayTileModel(4);
        expect(model.getCapacity()).toBe(4);
        expect(model.size()).toBe(0);

        model.add(4);
        expect(model.getCapacity()).toBe(4); // still fits

        // (int) (4 * 1.5f) + 3 = 9
        model.add(3);
        expect(model.getCapacity()).toBe(9);
        expect(model.size()).toBe(7);
    });

    it("grows from a zero capacity to exactly the requested count", () => {
        const model = new ArrayTileModel(0);
        model.add(5);
        expect(model.getCapacity()).toBe(5);
    });

    it("preserves the already-written faces across a grow", () => {
        const model = new ArrayTileModel(1);
        const a = model.add(1);
        model.setPositions(a, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        model.setUvs(a, 0.5, 0.25, 0.125, 0.0625, 1, 2);
        model.setAOs(a, 0.1, 0.2, 0.3);
        model.setColor(a, 0.4, 0.5, 0.6);
        model.setSunlight(a, 11);
        model.setBlocklight(a, 12);
        model.setMaterialIndex(a, 13);

        model.add(40); // forces a reallocation

        expect([...model.position.subarray(0, 9)]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        expect([...model.uv.subarray(0, 6)]).toEqual([0.5, 0.25, 0.125, 0.0625, 1, 2]);
        expect([...model.ao.subarray(0, 3)].map(Math.fround)).toEqual(
            [0.1, 0.2, 0.3].map(Math.fround),
        );
        expect([...model.color.subarray(0, 3)].map(Math.fround)).toEqual(
            [0.4, 0.5, 0.6].map(Math.fround),
        );
        expect(model.sunlight[0]).toBe(11);
        expect(model.blocklight[0]).toBe(12);
        expect(model.materialIndex[0]).toBe(13);
    });

    it("rejects a negative initial capacity", () => {
        expect(() => new ArrayTileModel(-1)).toThrow(/initialCapacity is negative/);
    });

    it("throws MaxCapacityReachedException past MAX_CAPACITY", () => {
        expect(() => new ArrayTileModel(ArrayTileModel.MAX_CAPACITY + 1)).toThrow(
            MaxCapacityReachedException,
        );

        const model = new ArrayTileModel(0);
        expect(() => model.add(ArrayTileModel.MAX_CAPACITY + 1)).toThrow(
            MaxCapacityReachedException,
        );
        // ...but exactly MAX_CAPACITY is fine
        expect(() => new ArrayTileModel(ArrayTileModel.MAX_CAPACITY)).not.toThrow();
    });

    it("clear() and reset() only move the size cursor", () => {
        const model = new ArrayTileModel(4);
        model.add(3);
        model.setMaterialIndex(0, 7);

        expect(model.clear().size()).toBe(0);
        expect(model.materialIndex[0]).toBe(7); // data is not wiped, upstream does not either
        expect(model.reset(2).size()).toBe(2);
    });
});

describe("ArrayTileModel — attribute narrowing", () => {
    it("narrows positions/uvs/aos/colors to single precision on store", () => {
        const model = new ArrayTileModel(1);
        model.add(1);
        model.setPositions(0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9);
        expect(model.position[0]).toBe(Math.fround(0.1));
        expect(model.position[0]).not.toBe(0.1);
    });

    it("narrows sunlight/blocklight to a signed byte, exactly like (byte) sl", () => {
        const model = new ArrayTileModel(1);
        model.add(1);

        model.setSunlight(0, 15);
        expect(model.sunlight[0]).toBe(15);

        model.setSunlight(0, 255); // (byte) 255 == -1
        expect(model.sunlight[0]).toBe(-1);

        model.setBlocklight(0, 128); // (byte) 128 == -128
        expect(model.blocklight[0]).toBe(-128);
    });
});

describe("ArrayTileModel — geometry", () => {
    const positionsOf = (model: ArrayTileModel, face: number): number[] =>
        [...model.position.subarray(face * 9, face * 9 + 9)];

    it("invertOrientation swaps the first and last vertex of position, uv and ao", () => {
        const model = new ArrayTileModel(1);
        model.add(1);
        model.setPositions(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        model.setUvs(0, 1, 2, 3, 4, 5, 6);
        model.setAOs(0, 0.25, 0.5, 0.75);

        model.invertOrientation(0);

        expect(positionsOf(model, 0)).toEqual([7, 8, 9, 4, 5, 6, 1, 2, 3]);
        expect([...model.uv.subarray(0, 6)]).toEqual([5, 6, 3, 4, 1, 2]);
        expect([...model.ao.subarray(0, 3)]).toEqual([0.75, 0.5, 0.25]);
    });

    it("invertOrientation(start, count) applies to the whole range", () => {
        const model = new ArrayTileModel(3);
        model.add(3);
        for (let f = 0; f < 3; f++) model.setPositions(f, f, 0, 0, 0, 0, 0, f + 10, 0, 0);

        model.invertOrientation(1, 2);

        expect(positionsOf(model, 0)[0]).toBe(0);
        expect(positionsOf(model, 1)[0]).toBe(11);
        expect(positionsOf(model, 2)[0]).toBe(12);
    });

    it("scale and translate only touch the given face range", () => {
        const model = new ArrayTileModel(2);
        model.add(2);
        model.setPositions(0, 1, 1, 1, 1, 1, 1, 1, 1, 1);
        model.setPositions(1, 1, 1, 1, 1, 1, 1, 1, 1, 1);

        model.scale(1, 1, 2, 3, 4);
        model.translate(1, 1, 10, 20, 30);

        expect(positionsOf(model, 0)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
        expect(positionsOf(model, 1)).toEqual([12, 23, 34, 12, 23, 34, 12, 23, 34]);
    });

    it("transform(MatrixM4f) and transform(16 floats) agree", () => {
        const build = (): ArrayTileModel => {
            const m = new ArrayTileModel(1);
            m.add(1);
            m.setPositions(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
            return m;
        };

        const matrix = new MatrixM4f().set(
            0.5, 0.25, -0.75, 1,
            0, 2, 0.5, -2,
            -1, 0.125, 3, 0.5,
            0, 0, 0, 1,
        );

        const viaMatrix = build().transform(0, 1, matrix);
        const viaFloats = build().transform(0, 1,
            0.5, 0.25, -0.75, 1,
            0, 2, 0.5, -2,
            -1, 0.125, 3, 0.5,
            0, 0, 0, 1,
        );

        expect(positionsOf(viaMatrix, 0)).toEqual(positionsOf(viaFloats, 0));
    });

    it("transform(MatrixM3f) is the 4x4 transform with a zero translation", () => {
        const build = (): ArrayTileModel => {
            const m = new ArrayTileModel(1);
            m.add(1);
            m.setPositions(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
            return m;
        };

        const matrix = new MatrixM3f().set(
            0.5, 0.25, -0.75,
            0, 2, 0.5,
            -1, 0.125, 3,
        );

        const viaMatrix = build().transform(0, 1, matrix);
        const viaFloats = build().transform(0, 1,
            0.5, 0.25, -0.75,
            0, 2, 0.5,
            -1, 0.125, 3,
        );

        expect(positionsOf(viaMatrix, 0)).toEqual(positionsOf(viaFloats, 0));
    });

    /**
     * The reason `transform` rounds after every operator instead of only on store.
     * The values come from the `floatIntermediates` oracle case, so the expectation
     * below is what the real Java writer produced — a port that accumulates the
     * multiply-add chain in double precision and narrows once lands one ulp away,
     * which is a different byte in the file.
     */
    it("rounds transform intermediates to single precision, not just the result", () => {
        const f = Math.fround;
        const model = ORACLE_MODEL_BUILDERS["floatIntermediates"]!();

        const x = 0.7499656677246094,
            y = -3.517979621887207,
            z = -217.63333129882812;
        const m00 = 0.3499417304992676,
            m01 = 0.09921848773956299,
            m02 = -0.3815346956253052;

        const perOperator = f(f(f(f(m00 * x) + f(m01 * y)) + f(m02 * z)) + 0);
        const accumulated = f(m00 * x + m01 * y + m02 * z);

        expect(perOperator).not.toBe(accumulated);
        expect(model.position[0]).toBe(perOperator);
        expect(positionBitsOf(model)[0]).toBe(ORACLE_CASES["floatIntermediates"]!.positionBits[0]);
    });

    it("rotateByQuaternion by the identity quaternion is a no-op", () => {
        const model = new ArrayTileModel(1);
        model.add(1);
        model.setPositions(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
        model.rotateByQuaternion(0, 1, 0, 0, 0, 1);
        expect(positionsOf(model, 0)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    });
});

describe("ArrayTileModel — sort", () => {
    const materialsAfterSort = (materials: number[]): number[] => {
        const model = new ArrayTileModel(materials.length);
        model.add(materials.length);
        materials.forEach((m, i) => model.setMaterialIndex(i, m));
        model.sort();
        return materialsAfterModel(model);
    };
    const materialsAfterModel = (model: ArrayTileModel): number[] =>
        Array.from(model.materialIndex.subarray(0, model.size()));

    it("does nothing for an empty or single-face model", () => {
        const empty = new ArrayTileModel(0);
        expect(() => {
            empty.sort();
        }).not.toThrow();

        const single = new ArrayTileModel(1);
        single.add(1);
        single.setMaterialIndex(0, 9);
        single.sort();
        expect(materialsAfterModel(single)).toEqual([9]);
    });

    it("sorts by material index through the insertion-sort path (< 16 faces)", () => {
        expect(materialsAfterSort([5, 1, 3, 1, 9, 0])).toEqual([0, 1, 1, 3, 5, 9]);
    });

    it("sorts by material index through the merge path (>= 16 faces)", () => {
        const materials = Array.from({ length: 64 }, (_, i) => (i * 37) % 11);
        const sorted = [...materials].sort((a, b) => a - b);
        expect(materialsAfterSort(materials)).toEqual(sorted);
    });

    it("is stable: faces sharing a material keep their emission order", () => {
        // tag each face by its sunlight so the original order stays observable
        const materials = [2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1];
        const model = new ArrayTileModel(materials.length);
        model.add(materials.length);
        materials.forEach((m, i) => {
            model.setMaterialIndex(i, m);
            model.setSunlight(i, i);
        });

        model.sort();

        const ones = [...model.sunlight.subarray(0, 10)];
        const twos = [...model.sunlight.subarray(10, 20)];
        expect(ones).toEqual([1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
        expect(twos).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
    });

    it("moves every attribute of a face together", () => {
        const model = new ArrayTileModel(2);
        model.add(2);

        model.setPositions(0, 1, 1, 1, 1, 1, 1, 1, 1, 1);
        model.setUvs(0, 1, 1, 1, 1, 1, 1);
        model.setAOs(0, 1, 1, 1);
        model.setColor(0, 1, 1, 1);
        model.setSunlight(0, 1);
        model.setBlocklight(0, 1);
        model.setMaterialIndex(0, 9);

        model.setPositions(1, 2, 2, 2, 2, 2, 2, 2, 2, 2);
        model.setUvs(1, 2, 2, 2, 2, 2, 2);
        model.setAOs(1, 0.5, 0.5, 0.5);
        model.setColor(1, 0.5, 0.5, 0.5);
        model.setSunlight(1, 2);
        model.setBlocklight(1, 2);
        model.setMaterialIndex(1, 3);

        model.sort();

        expect([...model.materialIndex.subarray(0, 2)]).toEqual([3, 9]);
        expect([...model.position.subarray(0, 9)]).toEqual(Array<number>(9).fill(2));
        expect([...model.uv.subarray(0, 6)]).toEqual(Array<number>(6).fill(2));
        expect([...model.ao.subarray(0, 3)]).toEqual([0.5, 0.5, 0.5]);
        expect([...model.color.subarray(0, 3)]).toEqual([0.5, 0.5, 0.5]);
        expect([...model.sunlight.subarray(0, 2)]).toEqual([2, 1]);
        expect([...model.blocklight.subarray(0, 2)]).toEqual([2, 1]);
    });

    it("only sorts the live prefix, leaving the rest of the capacity alone", () => {
        const model = new ArrayTileModel(8);
        model.add(3);
        [4, 1, 2].forEach((m, i) => model.setMaterialIndex(i, m));
        model.materialIndex[7] = 99; // past `size`

        model.sort();

        expect([...model.materialIndex.subarray(0, 3)]).toEqual([1, 2, 4]);
        expect(model.materialIndex[7]).toBe(99);
    });
});

describe("ArrayTileModel — instance pool", () => {
    it("hands out a cleared model and takes it back", () => {
        const pool = ArrayTileModel.instancePool();
        const model = pool.claimInstance();
        expect(model.size()).toBe(0);
        expect(model.getCapacity()).toBeGreaterThanOrEqual(100);

        model.add(50);
        pool.recycleInstance(model);

        const again = pool.claimInstance();
        expect(again).toBe(model);
        expect(again.size()).toBe(0);
        pool.recycleInstance(again);
    });

    it("returns the same pool instance every time", () => {
        expect(ArrayTileModel.instancePool()).toBe(ArrayTileModel.instancePool());
    });
});
