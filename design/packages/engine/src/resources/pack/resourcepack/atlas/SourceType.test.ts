import { Key } from "@worldlens/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonParseError, parse } from "../../../adapter/JsonMapper.js";
import { DirectorySource } from "./DirectorySource.js";
import { PalettedPermutationsSource } from "./PalettedPermutationsSource.js";
import { SingleSource } from "./SingleSource.js";
import { Source } from "./Source.js";
import { SourceType } from "./SourceType.js";
import { UnstitchSource } from "./UnstitchSource.js";

let debugSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
});

afterEach(() => {
    debugSpy.mockRestore();
});

function debugMessages(): string[] {
    return debugSpy.mock.calls.map((call) => String(call[0]));
}

describe("SourceType.REGISTRY", () => {
    it("registers the five upstream keys", () => {
        expect([...SourceType.REGISTRY.keys()].map((key) => key.getFormatted()).sort()).toEqual([
            "minecraft:directory",
            "minecraft:filter",
            "minecraft:paletted_permutations",
            "minecraft:single",
            "minecraft:unstitch",
        ]);
    });

    it("maps minecraft:filter onto the plain (no-op) Source", () => {
        expect(SourceType.REGISTRY.get(Key.minecraft("filter"))?.getAdapter()).toBe(
            Source.DelegateAdapter,
        );
    });

    it("has no entry for an unregistered key", () => {
        expect(SourceType.REGISTRY.get(Key.minecraft("nope"))).toBeNull();
    });
});

describe("SourceType.Adapter", () => {
    it("reads a minecraft:single source", () => {
        const source = SourceType.Adapter.read(
            parse('{"type": "minecraft:single", "resource": "minecraft:block/stone"}'),
        );

        expect(source).toBeInstanceOf(SingleSource);
        expect(source.getType()?.getFormatted()).toBe("minecraft:single");
        expect((source as SingleSource).getResource()?.getFormatted()).toBe("minecraft:block/stone");
    });

    it("reads a minecraft:directory source", () => {
        const source = SourceType.Adapter.read(
            parse('{"type": "minecraft:directory", "source": "block", "prefix": "block/"}'),
        );

        expect(source).toBeInstanceOf(DirectorySource);
        expect((source as DirectorySource).getSource()).toBe("block");
        expect((source as DirectorySource).getPrefix()).toBe("block/");
    });

    it("reads a minecraft:unstitch source", () => {
        const source = SourceType.Adapter.read(
            parse(
                '{"type": "minecraft:unstitch", "resource": "minecraft:sheet", "divisor_x": 4, "regions": []}',
            ),
        );

        expect(source).toBeInstanceOf(UnstitchSource);
        expect((source as UnstitchSource).getDivisorX()).toBe(4);
    });

    it("reads a minecraft:paletted_permutations source", () => {
        const source = SourceType.Adapter.read(
            parse(
                '{"type": "minecraft:paletted_permutations", "palette_key": "minecraft:colormap/key", "textures": [], "permutations": {}}',
            ),
        );

        expect(source).toBeInstanceOf(PalettedPermutationsSource);
        expect((source as PalettedPermutationsSource).getPaletteKey()?.getFormatted()).toBe(
            "minecraft:colormap/key",
        );
    });

    it("degrades minecraft:filter to a bare, no-op Source", () => {
        const source = SourceType.Adapter.read(
            parse('{"type": "minecraft:filter", "pattern": {"namespace": "minecraft"}}'),
        );

        expect(source.constructor).toBe(Source);
        expect(source.getType()?.getFormatted()).toBe("minecraft:filter");
        expect(debugMessages()).toEqual([]);
    });

    it("degrades an unknown type to a bare Source and logs it", () => {
        const source = SourceType.Adapter.read(parse('{"type": "mymod:magic"}'));

        expect(source.constructor).toBe(Source);
        expect(source.getType()?.getFormatted()).toBe("mymod:magic");
        expect(debugMessages()).toEqual(["Unknown atlas-source type: mymod:magic"]);
    });

    it("throws for a source without a type", () => {
        expect(() => SourceType.Adapter.read(parse('{"resource": "minecraft:block/stone"}'))).toThrow(
            JsonParseError,
        );
    });

    it("re-parses the whole element as the concrete type (the second gson pass)", () => {
        // "sprite" is only known to SingleSource — reading it proves the element was read
        // a second time, by the concrete adapter, and not merely up-cast
        const source = SourceType.Adapter.read(
            parse(
                '{"type": "minecraft:single", "resource": "minecraft:block/stone", "sprite": "minecraft:block/rock"}',
            ),
        );

        expect((source as SingleSource).getSprite()?.getFormatted()).toBe("minecraft:block/rock");
    });
});
