import { describe, expect, it } from "vitest";
import { DirectorySource } from "../atlas/DirectorySource.js";
import {
    LEGACY_BLOCKS_ATLAS,
    createLegacyBlocksAtlas,
    legacyBlocksAtlasJson,
} from "./LegacyBlocksAtlas.js";

/** every source of the synthetic atlas, as a readable "<source> -> <prefix>" pair */
function sourcePairs(): string[] {
    return createLegacyBlocksAtlas()
        .getSources()
        .map((source) => {
            expect(source).toBeInstanceOf(DirectorySource);
            const directorySource = source as DirectorySource;
            return directorySource.getSource() + " -> " + directorySource.getPrefix();
        });
}

describe("LEGACY_BLOCKS_ATLAS", () => {
    it("is the key ResourcePack's texture-loading phase resolves", () => {
        expect(LEGACY_BLOCKS_ATLAS.getFormatted()).toBe("minecraft:blocks");
    });
});

describe("legacyBlocksAtlasJson", () => {
    it("declares only minecraft:directory sources", () => {
        const sources = legacyBlocksAtlasJson()["sources"];
        expect(Array.isArray(sources)).toBe(true);
        for (const source of sources as Record<string, unknown>[]) {
            expect(source["type"]).toBe("minecraft:directory");
        }
    });
});

describe("createLegacyBlocksAtlas", () => {
    it("crosses each pre-flattening directory with its flattened name, in both roles", () => {
        expect(sourcePairs()).toEqual([
            // 1.12 texture, 1.12 reference — the ordinary case
            "blocks -> blocks/",
            // 1.12 texture, flattened reference — e.g. BlueMap's own
            // assets/bluemap/textures/blocks/missing.png against bluemap:block/missing
            "blocks -> block/",
            // flattened texture, 1.12 reference — a legacy pack under a modern one
            "block -> blocks/",
            // the modern pairing, so a mixed stack keeps the modern packs' textures
            "block -> block/",
            "items -> items/",
            "items -> item/",
            "item -> items/",
            "item -> item/",
        ]);
    });

    it("builds a fresh atlas per call, so two packs never share source instances", () => {
        const first = createLegacyBlocksAtlas();
        const second = createLegacyBlocksAtlas();

        expect(first).not.toBe(second);
        expect(first.getSources()[0]).not.toBe(second.getSources()[0]);
    });

    it("keeps every source distinct — Atlas de-duplicates sources by identity", () => {
        // DirectorySource#equalityKey is its identity, so the eight structurally-distinct
        // sources must all survive Atlas#addSource's LinkedHashSet semantics
        expect(createLegacyBlocksAtlas().getSources().length).toBe(8);
    });
});
