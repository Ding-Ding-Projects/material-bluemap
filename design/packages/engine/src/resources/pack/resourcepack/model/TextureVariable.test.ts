import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { ResourcePath } from "../../../ResourcePath.js";
import type { Texture } from "../texture/Texture.js";
import { TextureVariable } from "./TextureVariable.js";

function read(json: string): TextureVariable {
    return TextureVariable.Adapter.read(parse(json));
}

describe("TextureVariable", () => {
    describe("parse forms", () => {
        it("treats a leading # as a reference", () => {
            const variable = read('"#side"');
            expect(variable.isReference()).toBe(true);
            expect(variable.getReferenceName()).toBe("side");
            expect(variable.getTexturePath()).toBeNull();
        });

        it("treats a bare name without : or / as a reference (documented heuristic)", () => {
            const variable = read('"particle"');
            expect(variable.isReference()).toBe(true);
            expect(variable.getReferenceName()).toBe("particle");
        });

        it("treats a value containing / as a resource-path", () => {
            const variable = read('"block/stone"');
            expect(variable.isReference()).toBe(false);
            expect(variable.getReferenceName()).toBeNull();
            expect(variable.getTexturePath()?.getFormatted()).toBe("minecraft:block/stone");
        });

        it("treats a value containing : as a resource-path", () => {
            const variable = read('"mymod:custom"');
            expect(variable.isReference()).toBe(false);
            expect(variable.getTexturePath()?.getFormatted()).toBe("mymod:custom");
        });

        it("reads only the sprite key of the object form", () => {
            const variable = read('{"type": "minecraft:default", "sprite": "block/dirt"}');
            expect(variable.getTexturePath()?.getFormatted()).toBe("minecraft:block/dirt");
        });

        it("supports a reference inside the object form", () => {
            const variable = read('{"sprite": "#all"}');
            expect(variable.isReference()).toBe(true);
            expect(variable.getReferenceName()).toBe("all");
        });

        it("rejects an object without a sprite", () => {
            expect(() => read('{"type": "minecraft:default"}')).toThrow(/No sprite provided/);
        });

        it("rejects an empty string", () => {
            expect(() => read('""')).toThrow(/empty String/);
        });

        it("rejects a non string/object token", () => {
            expect(() => read("[1, 2]")).toThrow(/Expected STRING or OBJECT but got BEGIN_ARRAY/);
            expect(() => read("5")).toThrow(/Expected STRING or OBJECT but got NUMBER/);
        });

        it("does not support writing", () => {
            expect(() => TextureVariable.Adapter.write?.(read('"block/stone"'))).toThrow(
                /UnsupportedOperationException/,
            );
        });
    });

    describe("reference resolution", () => {
        it("resolves through a chain of references and caches the result", () => {
            const target = new TextureVariable(new ResourcePath<Texture>("block/oak_planks"));
            const middle = new TextureVariable("target");
            const start = new TextureVariable("middle");

            const textures = new Map([
                ["target", target],
                ["middle", middle],
            ]);
            let lookups = 0;
            const supplier = (name: string): TextureVariable | null => {
                lookups++;
                return textures.get(name) ?? null;
            };

            expect(start.getTexturePath(supplier)?.getFormatted()).toBe(
                "minecraft:block/oak_planks",
            );
            expect(start.isReference()).toBe(false);
            expect(lookups).toBe(2);

            // resolved once: the second call returns the cached path without a lookup
            expect(start.getTexturePath(supplier)?.getFormatted()).toBe(
                "minecraft:block/oak_planks",
            );
            expect(lookups).toBe(2);

            // the plain getter now returns the resolved path
            expect(start.getTexturePath()?.getFormatted()).toBe("minecraft:block/oak_planks");
        });

        it("returns null for an unresolvable reference", () => {
            const variable = new TextureVariable("nope");
            expect(variable.getTexturePath(() => null)).toBeNull();
            expect(variable.isReference()).toBe(false);
        });

        it("terminates on a reference-loop instead of recursing forever", () => {
            const a = new TextureVariable("b");
            const b = new TextureVariable("a");
            const textures = new Map([
                ["a", a],
                ["b", b],
            ]);

            expect(a.getTexturePath((name) => textures.get(name) ?? null)).toBeNull();
            expect(a.isReference()).toBe(false);
            expect(b.isReference()).toBe(false);
        });

        it("a non-reference variable ignores the supplier", () => {
            const variable = new TextureVariable(new ResourcePath<Texture>("block/stone"));
            expect(
                variable
                    .getTexturePath(() => {
                        throw new Error("should not be called");
                    })
                    ?.getFormatted(),
            ).toBe("minecraft:block/stone");
        });
    });

    describe("copy", () => {
        it("copies an unresolved reference", () => {
            const variable = new TextureVariable("side");
            const copy = variable.copy();

            expect(copy).not.toBe(variable);
            expect(copy.isReference()).toBe(true);
            expect(copy.getReferenceName()).toBe("side");

            // resolving the copy leaves the original untouched
            const target = new TextureVariable(new ResourcePath<Texture>("block/stone"));
            copy.getTexturePath(() => target);
            expect(copy.isReference()).toBe(false);
            expect(variable.isReference()).toBe(true);
        });

        it("copies a resolved path", () => {
            const path = new ResourcePath<Texture>("block/stone");
            const copy = new TextureVariable(path).copy();
            expect(copy.getTexturePath()).toBe(path);
            expect(copy.isReference()).toBe(false);
        });
    });

    it("optimize resolves the texture out of the pool", () => {
        const texture = { name: "stone" } as unknown as Texture;
        const variable = new TextureVariable(new ResourcePath<Texture>("block/stone"));

        variable.optimize({
            get: (key) => (key.getFormatted() === "minecraft:block/stone" ? texture : null),
        });

        expect(variable.getTexturePath()?.getResource()).toBe(texture);
    });
});
