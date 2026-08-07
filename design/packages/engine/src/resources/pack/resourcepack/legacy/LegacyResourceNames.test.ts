import { Key } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { MISSING_BLOCK_MODEL } from "../blockstate/Variant.js";
import {
    LEGACY_BLOCK_MODEL_PREFIX,
    LEGACY_TEXTURE_DIRECTORIES,
    legacyBlockModelKey,
} from "./LegacyResourceNames.js";

describe("LEGACY_TEXTURE_DIRECTORIES", () => {
    it("maps the two pre-flattening texture directories onto their flattened names", () => {
        expect([...LEGACY_TEXTURE_DIRECTORIES]).toEqual([
            ["blocks", "block"],
            ["items", "item"],
        ]);
    });
});

describe("legacyBlockModelKey", () => {
    it("prepends the models/block a 1.12 blockstate reference leaves implicit", () => {
        // upstream: namespacedToAbsoluteResourcePath(model, "models/block")
        expect(legacyBlockModelKey(new Key("minecraft:stone"))!.getFormatted()).toBe(
            "minecraft:block/stone",
        );
        // BlueMap's own legacy resourceExtensions: blockstates/barrier.json names "barrier"
        expect(legacyBlockModelKey(new Key("minecraft:barrier"))!.getFormatted()).toBe(
            "minecraft:block/barrier",
        );
    });

    it("keeps the namespace of the reference", () => {
        expect(legacyBlockModelKey(new Key("modid", "machine"))!.getFormatted()).toBe(
            "modid:block/machine",
        );
    });

    it("prepends to a nested reference as upstream does, without splitting it", () => {
        expect(legacyBlockModelKey(new Key("minecraft:bed/black_head"))!.getFormatted()).toBe(
            "minecraft:block/bed/black_head",
        );
    });

    it("returns null for a reference that already carries the prefix", () => {
        expect(legacyBlockModelKey(new Key("minecraft:block/stone"))).toBeNull();
    });

    it("returns null for the shared MISSING_BLOCK_MODEL path", () => {
        // every model-less variant in the process shares that one path-object, so it must
        // never be mapped onto something a pack happens to contain
        expect(MISSING_BLOCK_MODEL.getValue().startsWith(LEGACY_BLOCK_MODEL_PREFIX)).toBe(true);
        expect(legacyBlockModelKey(MISSING_BLOCK_MODEL)).toBeNull();
    });
});
