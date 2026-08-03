import { describe, expect, it } from "vitest";
import { ArrayTileModel } from "../src/map/hires/ArrayTileModel.js";
import { writeTileModelToPRBM } from "../src/map/hires/PRBMWriter.js";
import { ORACLE_MODEL_BUILDERS } from "../src/map/hires/prbmOracleFixture.js";
// The real loader the webapp uses. It lives in `packages/viewer`, which neither depends
// on nor is depended on by `packages/engine` — so this test sits outside `src/`, where
// the engine's tsconfig `rootDir` does not reach, and is picked up by vitest's
// `packages/*/test/**/*.test.ts` include instead.
import { PRBMLoader } from "../../viewer/src/map/hires/PRBMLoader.js";

/**
 * The cheap end of the fidelity check: everything `PRBMWriter` emits has to survive a
 * trip through `PRBMLoader.parse`, with the attributes, cardinalities, normalisation
 * flags and draw-groups coming back out the way they went in. (The expensive end —
 * byte-identity with the Java writer — is `src/map/hires/PRBMWriter.test.ts`.)
 */
describe("PRBMWriter -> PRBMLoader round trip", () => {
    const loader = new PRBMLoader();

    const parse = (bytes: Uint8Array): ReturnType<PRBMLoader["parse"]> => {
        // parse() requires a 4-byte-aligned offset into the buffer; slice() gives a fresh one
        const copy = bytes.slice();
        return loader.parse(copy.buffer as ArrayBuffer, 0);
    };

    it("reads back the seven attributes with the right cardinality and normalisation", () => {
        const geometry = parse(writeTileModelToPRBM(ORACLE_MODEL_BUILDERS["mergeSort40"]!()));

        const expected: [string, number, boolean, string][] = [
            ["position", 3, false, "Float32Array"],
            ["normal", 3, true, "Int8Array"],
            ["color", 3, true, "Uint8Array"],
            ["uv", 2, false, "Float32Array"],
            ["ao", 1, true, "Uint8Array"],
            ["blocklight", 1, false, "Int8Array"],
            ["sunlight", 1, false, "Int8Array"],
        ];

        expect(Object.keys(geometry.attributes)).toEqual(expected.map(([name]) => name));

        for (const [name, itemSize, normalized, arrayType] of expected) {
            const attribute = geometry.getAttribute(name);
            expect(attribute, name).toBeDefined();
            expect(attribute.itemSize, `${name}.itemSize`).toBe(itemSize);
            expect(attribute.normalized, `${name}.normalized`).toBe(normalized);
            expect(attribute.array.constructor.name, `${name} array type`).toBe(arrayType);
            expect(attribute.count, `${name}.count`).toBe(40 * 3);
        }
    });

    it("round-trips the positions exactly (they are written as raw float32)", () => {
        const model = ORACLE_MODEL_BUILDERS["transformed"]!();
        const geometry = parse(writeTileModelToPRBM(model));

        const position = geometry.getAttribute("position").array;
        expect(position.length).toBe(model.size() * 9);
        expect([...position]).toEqual([...model.position.subarray(0, model.size() * 9)]);

        const uv = geometry.getAttribute("uv").array;
        expect([...uv]).toEqual([...model.uv.subarray(0, model.size() * 6)]);
    });

    it("round-trips per-face byte attributes into per-vertex triples", () => {
        const model = ORACLE_MODEL_BUILDERS["mergeSort40"]!();
        const geometry = parse(writeTileModelToPRBM(model));

        const sunlight = geometry.getAttribute("sunlight").array;
        const blocklight = geometry.getAttribute("blocklight").array;
        for (let face = 0; face < model.size(); face++) {
            for (let vertex = 0; vertex < 3; vertex++) {
                expect(sunlight[face * 3 + vertex]).toBe(model.sunlight[face]);
                expect(blocklight[face * 3 + vertex]).toBe(model.blocklight[face]);
            }
        }
    });

    it("reads the material groups back as contiguous, ordered draw ranges", () => {
        const model = ORACLE_MODEL_BUILDERS["mergeSort40"]!();
        const geometry = parse(writeTileModelToPRBM(model));

        const materials = [...model.materialIndex.subarray(0, model.size())];
        const distinct = [...new Set(materials)];
        expect(geometry.groups.map((g) => g.materialIndex)).toEqual(distinct);

        let cursor = 0;
        for (const group of geometry.groups) {
            expect(group.start).toBe(cursor);
            const faces = materials.filter((m) => m === group.materialIndex).length;
            expect(group.count).toBe(faces * 3);
            cursor += group.count;
        }
        expect(cursor).toBe(model.size() * 3);
    });

    it("round-trips an empty model into an empty geometry", () => {
        const geometry = parse(writeTileModelToPRBM(ORACLE_MODEL_BUILDERS["empty"]!()));
        expect(geometry.getAttribute("position").count).toBe(0);
        expect(geometry.groups).toEqual([]);
    });

    it("round-trips a hand-built model whose bytes are asserted elsewhere", () => {
        const model = new ArrayTileModel(2);
        const face = model.add(1);
        model.setPositions(face, 0, 0, 0, 1, 0, 0, 0, 1, 0);
        model.setUvs(face, 0, 0, 1, 0, 0, 1);
        model.setAOs(face, 1, 0.5, 0.25);
        model.setColor(face, 1, 0.5, 0);
        model.setSunlight(face, 15);
        model.setBlocklight(face, 7);
        model.setMaterialIndex(face, 3);
        model.sort();

        const geometry = parse(writeTileModelToPRBM(model));

        expect([...geometry.getAttribute("position").array]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        // the face lies in the xy plane wound counter-clockwise, so its normal is +z;
        // (byte) (1.0f * 0x80 - 0.5) == 127
        expect([...geometry.getAttribute("normal").array]).toEqual([
            0, 0, 127, 0, 0, 127, 0, 0, 127,
        ]);
        // (int) (1.0f * 0xFF) == 255, (int) (0.5f * 0xFF) == 127, (int) (0.25f * 0xFF) == 63
        expect([...geometry.getAttribute("ao").array]).toEqual([255, 127, 63]);
        expect([...geometry.getAttribute("color").array]).toEqual([
            255, 127, 0, 255, 127, 0, 255, 127, 0,
        ]);
        expect(geometry.groups).toEqual([{ materialIndex: 3, start: 0, count: 3 }]);
    });
});
