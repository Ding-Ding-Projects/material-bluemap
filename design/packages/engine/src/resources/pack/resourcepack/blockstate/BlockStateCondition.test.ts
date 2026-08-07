import { Key } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { BlockState } from "../../../../world/BlockState.js";
import { BlockStateCondition } from "./BlockStateCondition.js";

function state(properties: Record<string, string> = {}): BlockState {
    return new BlockState(Key.minecraft("test"), new Map(Object.entries(properties)));
}

describe("BlockStateCondition", () => {
    describe("all / none", () => {
        it("are interned singletons compared by reference identity", () => {
            expect(BlockStateCondition.all()).toBe(BlockStateCondition.all());
            expect(BlockStateCondition.none()).toBe(BlockStateCondition.none());
            expect(BlockStateCondition.all()).toBe(BlockStateCondition.MATCH_ALL);
            expect(BlockStateCondition.none()).toBe(BlockStateCondition.MATCH_NONE);
            expect(BlockStateCondition.all()).not.toBe(BlockStateCondition.none());
        });

        it("match everything / nothing", () => {
            expect(BlockStateCondition.all().matches(state())).toBe(true);
            expect(BlockStateCondition.all().matches(state({ a: "b" }))).toBe(true);
            expect(BlockStateCondition.none().matches(state())).toBe(false);
            expect(BlockStateCondition.none().matches(state({ a: "b" }))).toBe(false);
        });
    });

    describe("property", () => {
        it("matches an exact key/value pair", () => {
            const condition = BlockStateCondition.property("facing", "north");
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            expect(condition.matches(state({ facing: "south" }))).toBe(false);
        });

        it("returns false when the property is absent", () => {
            const condition = BlockStateCondition.property("facing", "north");
            expect(condition.matches(state())).toBe(false);
            expect(condition.matches(state({ half: "top" }))).toBe(false);
        });

        it("lower-cases the key and the value it was built with", () => {
            const condition = BlockStateCondition.property("FACING", "North");
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            // the *state's* values are not lower-cased by the condition
            expect(condition.matches(state({ FACING: "North" }))).toBe(false);
        });

        it("builds a Property for one value and a PropertySet for several", () => {
            expect(BlockStateCondition.property("facing", "north")).toBeInstanceOf(
                BlockStateCondition.Property,
            );
            expect(BlockStateCondition.property("facing", "north", "south")).toBeInstanceOf(
                BlockStateCondition.PropertySet,
            );
        });

        it("matches any of the possible values of a PropertySet", () => {
            const condition = BlockStateCondition.property("facing", "north", "SOUTH", "east");
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            expect(condition.matches(state({ facing: "south" }))).toBe(true);
            expect(condition.matches(state({ facing: "east" }))).toBe(true);
            expect(condition.matches(state({ facing: "west" }))).toBe(false);
            expect(condition.matches(state())).toBe(false);
        });

        it("throws without a value", () => {
            expect(() => BlockStateCondition.property("facing")).toThrow(
                "Must be at least one value!",
            );
        });
    });

    describe("and", () => {
        it("returns the single condition unwrapped", () => {
            const single = BlockStateCondition.property("facing", "north");
            expect(BlockStateCondition.and(single)).toBe(single);
        });

        it("requires every condition to match", () => {
            const condition = BlockStateCondition.and(
                BlockStateCondition.property("facing", "north"),
                BlockStateCondition.property("half", "top"),
            );
            expect(condition.matches(state({ facing: "north", half: "top" }))).toBe(true);
            expect(condition.matches(state({ facing: "north", half: "bottom" }))).toBe(false);
            expect(condition.matches(state({ facing: "south", half: "top" }))).toBe(false);
        });

        it("fast-exits when the state has fewer properties than distinct Property keys", () => {
            const condition = BlockStateCondition.and(
                BlockStateCondition.property("facing", "north"),
                BlockStateCondition.property("half", "top"),
            ) as InstanceType<typeof BlockStateCondition.And>;
            expect(condition.distinctProperties).toBe(2);
            expect(condition.matches(state({ facing: "north" }))).toBe(false);
        });

        it("counts distinct keys, not conditions", () => {
            const condition = BlockStateCondition.and(
                BlockStateCondition.property("facing", "north"),
                BlockStateCondition.property("FACING", "north"),
                BlockStateCondition.property("facing", "north", "south"),
                BlockStateCondition.all(),
            ) as InstanceType<typeof BlockStateCondition.And>;
            // only the two Property instances count, and both lower-case to "facing";
            // the PropertySet and All are not Property instances
            expect(condition.distinctProperties).toBe(1);
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
        });

        it("throws without a condition", () => {
            expect(() => BlockStateCondition.and()).toThrow("Must be at least one condition!");
        });
    });

    describe("or", () => {
        it("returns the single condition unwrapped", () => {
            const single = BlockStateCondition.property("facing", "north");
            expect(BlockStateCondition.or(single)).toBe(single);
        });

        it("matches when any condition matches", () => {
            const condition = BlockStateCondition.or(
                BlockStateCondition.property("facing", "north"),
                BlockStateCondition.property("half", "top"),
            );
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            expect(condition.matches(state({ half: "top" }))).toBe(true);
            expect(condition.matches(state({ facing: "south", half: "bottom" }))).toBe(false);
            expect(condition.matches(state())).toBe(false);
        });

        it("throws without a condition", () => {
            expect(() => BlockStateCondition.or()).toThrow("Must be at least one condition!");
        });
    });

    it("nests and/or arbitrarily", () => {
        const condition = BlockStateCondition.and(
            BlockStateCondition.property("facing", "north", "south"),
            BlockStateCondition.or(
                BlockStateCondition.property("half", "top"),
                BlockStateCondition.and(
                    BlockStateCondition.property("half", "bottom"),
                    BlockStateCondition.property("open", "true"),
                ),
            ),
        );
        expect(condition.matches(state({ facing: "north", half: "top" }))).toBe(true);
        expect(condition.matches(state({ facing: "south", half: "bottom", open: "true" }))).toBe(
            true,
        );
        expect(condition.matches(state({ facing: "south", half: "bottom", open: "false" }))).toBe(
            false,
        );
        expect(condition.matches(state({ facing: "east", half: "top" }))).toBe(false);
    });
});
