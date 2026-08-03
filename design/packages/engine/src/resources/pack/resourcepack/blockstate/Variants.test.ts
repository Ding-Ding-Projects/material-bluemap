import { Key } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { BlockState } from "../../../../world/BlockState.js";
import { parse } from "../../../adapter/JsonMapper.js";
import { BlockStateCondition } from "./BlockStateCondition.js";
import { MISSING_BLOCK_MODEL, Variant } from "./Variant.js";
import { VariantSet } from "./VariantSet.js";
import { Variants } from "./Variants.js";

function state(properties: Record<string, string> = {}): BlockState {
    return new BlockState(Key.minecraft("test"), new Map(Object.entries(properties)));
}

function variant(): Variant {
    return new Variant(MISSING_BLOCK_MODEL, 0, 0, 0, false, 1);
}

function models(json: string): string[] {
    const variants = Variants.Adapter.read(parse(json));
    const seen: string[] = [];
    variants.forEach((v) => seen.push(v.getModel().getFormatted()));
    return seen;
}

function selectAt(
    variants: Variants,
    blockState: BlockState,
    x = 0,
    y = 0,
    z = 0,
): string[] {
    const seen: string[] = [];
    variants.forEach(blockState, x, y, z, (v) => seen.push(v.getModel().getFormatted()));
    return seen;
}

describe("Variants", () => {
    it("defaults to no variants and no default-variant", () => {
        const variants = new Variants();
        expect(variants.getVariants()).toEqual([]);
        expect(variants.getDefaultVariant()).toBeNull();
    });

    describe("Adapter — condition-string parsing", () => {
        it('maps "", "default" and "normal" to the default variant', () => {
            for (const key of ["", "default", "normal"]) {
                const variants = Variants.Adapter.read(
                    parse(`{"${key}": {"model": "block/stone"}}`),
                );
                expect(variants.getVariants()).toHaveLength(0);
                expect(variants.getDefaultVariant()).not.toBeNull();
                expect(variants.getDefaultVariant()!.getCondition()).toBe(
                    BlockStateCondition.all(),
                );
            }
        });

        it("parses a single key=value condition", () => {
            const variants = Variants.Adapter.read(
                parse('{"facing=north": {"model": "block/a"}}'),
            );
            expect(variants.getVariants()).toHaveLength(1);
            expect(variants.getDefaultVariant()).toBeNull();

            const condition = variants.getVariants()[0]!.getCondition();
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            expect(condition.matches(state({ facing: "south" }))).toBe(false);
        });

        it("parses a comma-separated condition into an And", () => {
            const variants = Variants.Adapter.read(
                parse('{"facing=north,half=top": {"model": "block/a"}}'),
            );
            const condition = variants.getVariants()[0]!.getCondition();
            expect(condition).toBeInstanceOf(BlockStateCondition.And);
            expect(condition.matches(state({ facing: "north", half: "top" }))).toBe(true);
            expect(condition.matches(state({ facing: "north", half: "bottom" }))).toBe(false);
        });

        it("drops an unparseable condition (it becomes none())", () => {
            const variants = Variants.Adapter.read(
                parse('{"facing": {"model": "block/a"}, "half=top": {"model": "block/b"}}'),
            );
            expect(variants.getVariants()).toHaveLength(1);
            expect(variants.getDefaultVariant()).toBeNull();
            expect(models('{"facing": {"model": "block/a"}}')).toEqual([]);
        });

        it("keeps a partially-invalid condition when at least one element parsed", () => {
            const variants = Variants.Adapter.read(
                parse('{"facing=north,bogus": {"model": "block/a"}}'),
            );
            expect(variants.getVariants()).toHaveLength(1);
            const condition = variants.getVariants()[0]!.getCondition();
            expect(condition.matches(state({ facing: "north" }))).toBe(true);
            expect(condition.matches(state({ facing: "south" }))).toBe(false);
        });

        it("splits key/value at the first '=' only", () => {
            const variants = Variants.Adapter.read(parse('{"a=b=c": {"model": "block/a"}}'));
            const condition = variants.getVariants()[0]!.getCondition();
            expect(condition.matches(state({ a: "b=c" }))).toBe(true);
            expect(condition.matches(state({ a: "b" }))).toBe(false);
        });

        it("accepts an empty value", () => {
            const variants = Variants.Adapter.read(parse('{"a=": {"model": "block/a"}}'));
            const condition = variants.getVariants()[0]!.getCondition();
            expect(condition.matches(state({ a: "" }))).toBe(true);
            expect(condition.matches(state({ a: "b" }))).toBe(false);
        });

        it("ignores a trailing comma (java's split drops trailing empties)", () => {
            const variants = Variants.Adapter.read(
                parse('{"facing=north,": {"model": "block/a"}}'),
            );
            expect(variants.getVariants()).toHaveLength(1);
            const condition = variants.getVariants()[0]!.getCondition();
            expect(condition).toBeInstanceOf(BlockStateCondition.Property);
        });

        it("skips the __comment member", () => {
            const variants = Variants.Adapter.read(
                parse('{"__comment": "a note", "facing=north": {"model": "block/a"}}'),
            );
            expect(variants.getVariants()).toHaveLength(1);
            expect(variants.getDefaultVariant()).toBeNull();
        });

        it("keeps the last default when several map to all()", () => {
            const variants = Variants.Adapter.read(
                parse('{"": {"model": "block/a"}, "normal": {"model": "block/b"}}'),
            );
            expect(variants.getVariants()).toHaveLength(0);
            expect(
                variants.getDefaultVariant()!.getVariants()[0]!.getModel().getFormatted(),
            ).toBe("minecraft:block/b");
        });

        it("reads a variant-array as one weighted set", () => {
            const variants = Variants.Adapter.read(
                parse('{"": [{"model": "block/a", "weight": 2}, {"model": "block/b"}]}'),
            );
            expect(variants.getDefaultVariant()!.getVariants().map((v) => v.getWeight())).toEqual([
                2, 1,
            ]);
        });
    });

    describe("selection", () => {
        it("returns on the first matching condition — no fall-through", () => {
            const variants = Variants.Adapter.read(
                parse(`{
                    "facing=north": {"model": "block/first"},
                    "half=top": {"model": "block/second"},
                    "": {"model": "block/default"}
                }`),
            );
            expect(selectAt(variants, state({ facing: "north", half: "top" }))).toEqual([
                "minecraft:block/first",
            ]);
        });

        it("falls back to the default variant when nothing matches", () => {
            const variants = Variants.Adapter.read(
                parse('{"facing=north": {"model": "block/a"}, "": {"model": "block/default"}}'),
            );
            expect(selectAt(variants, state({ facing: "south" }))).toEqual([
                "minecraft:block/default",
            ]);
        });

        it("emits nothing when nothing matches and there is no default", () => {
            const variants = Variants.Adapter.read(parse('{"facing=north": {"model": "block/a"}}'));
            expect(selectAt(variants, state({ facing: "south" }))).toEqual([]);
        });

        it("rolls the coordinate hash inside the selected set", () => {
            const variants = Variants.Adapter.read(
                parse('{"": [{"model": "block/a"}, {"model": "block/b"}]}'),
            );
            const picked = new Set<string>();
            for (let x = 0; x < 16; x++) {
                for (let z = 0; z < 16; z++) {
                    const selected = selectAt(variants, state(), x, 0, z);
                    expect(selected).toHaveLength(1);
                    picked.add(selected[0]!);
                }
            }
            expect(picked).toEqual(new Set(["minecraft:block/a", "minecraft:block/b"]));
        });
    });

    describe("forEach(consumer)", () => {
        it("visits every variant of every set and then the default", () => {
            expect(
                models(`{
                    "facing=north": [{"model": "block/a"}, {"model": "block/b"}],
                    "facing=south": {"model": "block/c"},
                    "": {"model": "block/default"}
                }`),
            ).toEqual([
                "minecraft:block/a",
                "minecraft:block/b",
                "minecraft:block/c",
                "minecraft:block/default",
            ]);
        });

        it("visits the default variant alone when there is nothing else", () => {
            expect(models('{"": {"model": "block/default"}}')).toEqual([
                "minecraft:block/default",
            ]);
        });
    });

    it("the all-args constructor assigns both fields", () => {
        const set = new VariantSet(variant());
        const def = new VariantSet(variant());
        const variants = new Variants([set], def);
        expect(variants.getVariants()).toEqual([set]);
        expect(variants.getDefaultVariant()).toBe(def);
    });
});
