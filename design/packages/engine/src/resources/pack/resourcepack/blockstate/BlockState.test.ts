import { Key } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { BlockState as WorldBlockState } from "../../../../world/BlockState.js";
import { parse } from "../../../adapter/JsonMapper.js";
import { BlockState } from "./BlockState.js";
import { Multipart } from "./Multipart.js";
import { MISSING_BLOCK_MODEL, Variant } from "./Variant.js";
import { VariantSet } from "./VariantSet.js";
import { Variants } from "./Variants.js";

function worldState(properties: Record<string, string> = {}): WorldBlockState {
    return new WorldBlockState(Key.minecraft("test"), new Map(Object.entries(properties)));
}

function selectAt(blockState: BlockState, state: WorldBlockState): string[] {
    const seen: string[] = [];
    blockState.forEach(state, 0, 0, 0, (v) => seen.push(v.getModel().getFormatted()));
    return seen;
}

describe("blockstate/BlockState", () => {
    it("is empty by default", () => {
        const blockState = new BlockState();
        expect(blockState.getVariants()).toBeNull();
        expect(blockState.getMultipart()).toBeNull();
    });

    it("wraps a Variants", () => {
        const variants = new Variants([], new VariantSet(new Variant(MISSING_BLOCK_MODEL)));
        const blockState = new BlockState(variants);
        expect(blockState.getVariants()).toBe(variants);
        expect(blockState.getMultipart()).toBeNull();
    });

    it("wraps a Multipart", () => {
        const multipart = new Multipart([new VariantSet(new Variant(MISSING_BLOCK_MODEL))]);
        const blockState = new BlockState(multipart);
        expect(blockState.getMultipart()).toBe(multipart);
        expect(blockState.getVariants()).toBeNull();
    });

    describe("Adapter", () => {
        it("reads a variants blockstate", () => {
            const blockState = BlockState.Adapter.read(
                parse('{"variants": {"": {"model": "block/stone"}}}'),
            );
            expect(blockState.getVariants()).not.toBeNull();
            expect(blockState.getMultipart()).toBeNull();
            expect(selectAt(blockState, worldState())).toEqual(["minecraft:block/stone"]);
        });

        it("reads a multipart blockstate", () => {
            const blockState = BlockState.Adapter.read(
                parse(`{"multipart": [
                    {"apply": {"model": "block/base"}},
                    {"when": {"north": "true"}, "apply": {"model": "block/north"}}
                ]}`),
            );
            expect(blockState.getMultipart()).not.toBeNull();
            expect(blockState.getVariants()).toBeNull();
            expect(selectAt(blockState, worldState({ north: "true" }))).toEqual([
                "minecraft:block/base",
                "minecraft:block/north",
            ]);
            expect(selectAt(blockState, worldState({ north: "false" }))).toEqual([
                "minecraft:block/base",
            ]);
        });

        it("ignores unknown members", () => {
            const blockState = BlockState.Adapter.read(
                parse('{"__comment": "x", "bogus": 1, "variants": {"": {"model": "a"}}}'),
            );
            expect(blockState.getVariants()).not.toBeNull();
        });

        it("leaves both null for an empty object", () => {
            const blockState = BlockState.Adapter.read(parse("{}"));
            expect(blockState.getVariants()).toBeNull();
            expect(blockState.getMultipart()).toBeNull();
            expect(selectAt(blockState, worldState())).toEqual([]);
        });

        it("keeps both when the json carries both members", () => {
            const blockState = BlockState.Adapter.read(
                parse(`{
                    "variants": {"": {"model": "block/from-variants"}},
                    "multipart": [{"apply": {"model": "block/from-multipart"}}]
                }`),
            );
            expect(selectAt(blockState, worldState())).toEqual([
                "minecraft:block/from-variants",
                "minecraft:block/from-multipart",
            ]);
        });
    });

    describe("forEach(consumer)", () => {
        it("visits the variants and the multipart", () => {
            const blockState = BlockState.Adapter.read(
                parse(`{
                    "variants": {"facing=north": {"model": "a"}, "": {"model": "b"}},
                    "multipart": [{"apply": {"model": "c"}}]
                }`),
            );
            const seen: string[] = [];
            blockState.forEach((v) => seen.push(v.getModel().getFormatted()));
            expect(seen).toEqual(["minecraft:a", "minecraft:b", "minecraft:c"]);
        });

        it("visits nothing when both are absent", () => {
            const seen: string[] = [];
            new BlockState().forEach((v) => seen.push(v.getModel().getFormatted()));
            expect(seen).toEqual([]);
        });
    });
});
