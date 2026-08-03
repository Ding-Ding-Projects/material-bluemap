import { Key } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { BlockState } from "../../../../world/BlockState.js";
import { parse } from "../../../adapter/JsonMapper.js";
import { BlockStateCondition } from "./BlockStateCondition.js";
import { Multipart } from "./Multipart.js";
import { MISSING_BLOCK_MODEL, Variant } from "./Variant.js";
import { hashToFloat, VariantSet } from "./VariantSet.js";

function state(properties: Record<string, string> = {}): BlockState {
    return new BlockState(Key.minecraft("test"), new Map(Object.entries(properties)));
}

function multipart(json: string): Multipart {
    return Multipart.Adapter.read(parse(json));
}

function selectAt(
    parts: Multipart,
    blockState: BlockState,
    x = 0,
    y = 0,
    z = 0,
): string[] {
    const seen: string[] = [];
    parts.forEach(blockState, x, y, z, (v) => seen.push(v.getModel().getFormatted()));
    return seen;
}

describe("Multipart", () => {
    it("defaults to no parts", () => {
        expect(new Multipart().getParts()).toEqual([]);
    });

    describe("Adapter", () => {
        it("reads when/apply pairs", () => {
            const parts = multipart(
                '[{"when": {"north": "true"}, "apply": {"model": "block/side"}}]',
            );
            expect(parts.getParts()).toHaveLength(1);
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition.matches(state({ north: "true" }))).toBe(true);
            expect(condition.matches(state({ north: "false" }))).toBe(false);
        });

        it("keeps the VariantSet's own all() condition when there is no 'when'", () => {
            const parts = multipart('[{"apply": {"model": "block/base"}}]');
            expect(parts.getParts()[0]!.getCondition()).toBe(BlockStateCondition.all());
        });

        it("drops a part without an 'apply'", () => {
            const parts = multipart('[{"when": {"north": "true"}}, {"apply": {"model": "a"}}]');
            expect(parts.getParts()).toHaveLength(1);
        });

        it("skips unknown members of a part", () => {
            const parts = multipart('[{"bogus": 1, "apply": {"model": "a"}, "__comment": "x"}]');
            expect(parts.getParts()).toHaveLength(1);
        });

        it("reads a boolean condition value as its string form", () => {
            const parts = multipart('[{"when": {"up": true}, "apply": {"model": "a"}}]');
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition.matches(state({ up: "true" }))).toBe(true);
            expect(condition.matches(state({ up: "false" }))).toBe(false);
        });

        it("splits a pipe-separated condition value into a PropertySet", () => {
            const parts = multipart('[{"when": {"facing": "north|south"}, "apply": {"model": "a"}}]');
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition).toBeInstanceOf(BlockStateCondition.PropertySet);
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            expect(condition.matches(state({ facing: "south" }))).toBe(true);
            expect(condition.matches(state({ facing: "east" }))).toBe(false);
        });

        it("ands the members of a 'when' object", () => {
            const parts = multipart(
                '[{"when": {"north": "true", "up": "true"}, "apply": {"model": "a"}}]',
            );
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition).toBeInstanceOf(BlockStateCondition.And);
            expect(condition.matches(state({ north: "true", up: "true" }))).toBe(true);
            expect(condition.matches(state({ north: "true", up: "false" }))).toBe(false);
        });

        it("reads an OR block", () => {
            const parts = multipart(
                `[{"when": {"OR": [{"north": "true"}, {"south": "true"}]},
                   "apply": {"model": "a"}}]`,
            );
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition.matches(state({ north: "true" }))).toBe(true);
            expect(condition.matches(state({ south: "true" }))).toBe(true);
            expect(condition.matches(state({ north: "false", south: "false" }))).toBe(false);
        });

        it("reads an AND block", () => {
            const parts = multipart(
                `[{"when": {"AND": [{"north": "true"}, {"south": "true"}]},
                   "apply": {"model": "a"}}]`,
            );
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition.matches(state({ north: "true", south: "true" }))).toBe(true);
            expect(condition.matches(state({ north: "true", south: "false" }))).toBe(false);
        });

        it("nests OR inside AND", () => {
            const parts = multipart(
                `[{"when": {"AND": [
                        {"OR": [{"north": "true"}, {"south": "true"}]},
                        {"up": "true"}
                   ]}, "apply": {"model": "a"}}]`,
            );
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition.matches(state({ north: "true", up: "true" }))).toBe(true);
            expect(condition.matches(state({ south: "true", up: "true" }))).toBe(true);
            expect(condition.matches(state({ south: "true", up: "false" }))).toBe(false);
        });

        it("skips a __comment inside a 'when'", () => {
            const parts = multipart(
                '[{"when": {"__comment": "note", "north": "true"}, "apply": {"model": "a"}}]',
            );
            const condition = parts.getParts()[0]!.getCondition();
            expect(condition).toBeInstanceOf(BlockStateCondition.Property);
            expect(condition.matches(state({ north: "true" }))).toBe(true);
        });

        it("throws on an empty 'when' object (and() with no conditions)", () => {
            expect(() => multipart('[{"when": {}, "apply": {"model": "a"}}]')).toThrow(
                "Must be at least one condition!",
            );
        });

        it("reads an empty multipart array", () => {
            expect(multipart("[]").getParts()).toEqual([]);
        });
    });

    describe("selection", () => {
        it("emits every matching part — there is no early return", () => {
            const parts = multipart(`[
                {"apply": {"model": "block/base"}},
                {"when": {"north": "true"}, "apply": {"model": "block/north"}},
                {"when": {"south": "true"}, "apply": {"model": "block/south"}},
                {"when": {"up": "true"}, "apply": {"model": "block/up"}}
            ]`);
            expect(selectAt(parts, state({ north: "true", south: "true" }))).toEqual([
                "minecraft:block/base",
                "minecraft:block/north",
                "minecraft:block/south",
            ]);
        });

        it("emits nothing when no part matches", () => {
            const parts = multipart('[{"when": {"north": "true"}, "apply": {"model": "a"}}]');
            expect(selectAt(parts, state({ north: "false" }))).toEqual([]);
        });

        it("gives every part the same coordinate hash against its own totalWeight", () => {
            // part A: two variants of weight 1 (totalWeight 2)
            // part B: three variants of weight 1 (totalWeight 3)
            // at one coordinate both see the same hashToFloat value, so the picked index
            // is floor(f * totalWeight) for each of them independently
            const parts = multipart(`[
                {"apply": [{"model": "a0"}, {"model": "a1"}]},
                {"apply": [{"model": "b0"}, {"model": "b1"}, {"model": "b2"}]}
            ]`);

            for (const [x, y, z] of [
                [0, 0, 0],
                [1, 0, 0],
                [7, 8, 9],
                [-3, 4, -5],
                [100, 70, -100],
            ] as [number, number, number][]) {
                const f = hashToFloat(x, y, z);
                // `selection -= 1` accepts at the first index where f*n - (i+1) <= 0
                const index = (n: number): number => (f === 0 ? 0 : Math.ceil(f * n) - 1);
                expect(selectAt(parts, state(), x, y, z)).toEqual([
                    "minecraft:a" + index(2),
                    "minecraft:b" + index(3),
                ]);
            }
        });

        it("forEach(consumer) visits every variant of every part", () => {
            const parts = multipart(`[
                {"when": {"north": "true"}, "apply": [{"model": "a"}, {"model": "b"}]},
                {"apply": {"model": "c"}}
            ]`);
            const seen: string[] = [];
            parts.forEach((v) => seen.push(v.getModel().getFormatted()));
            expect(seen).toEqual(["minecraft:a", "minecraft:b", "minecraft:c"]);
        });
    });

    it("the all-args constructor assigns the parts", () => {
        const part = new VariantSet(new Variant(MISSING_BLOCK_MODEL));
        expect(new Multipart([part]).getParts()).toEqual([part]);
    });
});
