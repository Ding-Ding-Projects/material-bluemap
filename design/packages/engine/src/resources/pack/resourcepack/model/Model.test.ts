import { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { Direction } from "../../../../util/Direction.js";
import { Texture } from "../texture/Texture.js";
import type { Element } from "./Element.js";
import { Model, type ResourcePool } from "./Model.js";

function read(json: string): Model {
    return Model.Adapter.read(parse(json));
}

function pool<T>(entries: Record<string, T>): ResourcePool<T> {
    return { get: (key) => entries[key.getFormatted()] ?? null };
}

function solidTexture(formatted: string, alpha: number): Texture {
    const image = new PNG({ width: 2, height: 2 });
    for (let i = 0; i < image.data.length; i += 4) {
        image.data[i] = 128;
        image.data[i + 1] = 64;
        image.data[i + 2] = 32;
        image.data[i + 3] = alpha;
    }
    return Texture.from(new Key(formatted), image);
}

const ALL_FACES =
    '"faces": {"up": {"texture": "#all"}, "down": {"texture": "#all"}, ' +
    '"north": {"texture": "#all"}, "south": {"texture": "#all"}, ' +
    '"west": {"texture": "#all"}, "east": {"texture": "#all"}}';

const FULL_CUBE = `{"textures": {"all": "block/stone"}, "elements": [{${ALL_FACES}}]}`;

describe("Model", () => {
    describe("defaults", () => {
        it("has no parent, no elements and empty textures", () => {
            const model = read("{}");
            expect(model.getParent()).toBeNull();
            expect(model.getElements()).toBeNull();
            expect(model.getTextures().size).toBe(0);
            expect(model.isCulling()).toBe(false);
            expect(model.isOccluding()).toBe(false);
        });

        it("reads parent, textures, elements and ambientocclusion", () => {
            const model = read(
                '{"parent": "block/cube", "textures": {"all": "block/stone"}, ' +
                    '"elements": [{}], "ambientocclusion": false}',
            );
            expect(model.getParent()?.getFormatted()).toBe("minecraft:block/cube");
            expect(model.getTextures().get("all")?.getTexturePath()?.getFormatted()).toBe(
                "minecraft:block/stone",
            );
            expect(model.getElements()?.length).toBe(1);
            expect(model.isAmbientocclusion()).toBe(false);
        });
    });

    describe("tri-state ambientocclusion", () => {
        it("defaults to true when unset", () => {
            expect(read("{}").isAmbientocclusion()).toBe(true);
        });

        it("keeps an explicit value", () => {
            expect(read('{"ambientocclusion": false}').isAmbientocclusion()).toBe(false);
            expect(read('{"ambientocclusion": true}').isAmbientocclusion()).toBe(true);
        });

        it("inherits the parent's value only while unset", () => {
            const parent = read('{"ambientocclusion": false}');
            const unset = read('{"parent": "bluemap:parent"}');
            const explicit = read('{"parent": "bluemap:parent", "ambientocclusion": true}');

            const models = pool({ "bluemap:parent": parent });
            unset.applyParent(models);
            explicit.applyParent(models);

            expect(unset.isAmbientocclusion()).toBe(false);
            expect(explicit.isAmbientocclusion()).toBe(true);
        });
    });

    describe("applyParent", () => {
        it("resolves a whole parent-chain, baking the parent first", () => {
            const grandparent = read(
                '{"textures": {"c": "block/c"}, "elements": [{"from": [1, 1, 1], "to": [2, 2, 2]}]}',
            );
            const parent = read(
                '{"parent": "bluemap:grandparent", "textures": {"a": "block/pa", "b": "block/b"}}',
            );
            const child = read('{"parent": "bluemap:parent", "textures": {"a": "block/a"}}');

            const models = pool({
                "bluemap:grandparent": grandparent,
                "bluemap:parent": parent,
            });
            child.applyParent(models);

            // the child's own texture wins, the parent's and grandparent's are added
            expect(child.getTextures().get("a")?.getTexturePath()?.getFormatted()).toBe(
                "minecraft:block/a",
            );
            expect(child.getTextures().get("b")?.getTexturePath()?.getFormatted()).toBe(
                "minecraft:block/b",
            );
            expect(child.getTextures().get("c")?.getTexturePath()?.getFormatted()).toBe(
                "minecraft:block/c",
            );

            // the elements travelled down two levels
            expect(child.getElements()?.length).toBe(1);
        });

        it("copies the parent's texture-variables instead of sharing them", () => {
            const parent = read('{"textures": {"all": "#other"}}');
            const child = read('{"parent": "bluemap:parent"}');

            child.applyParent(pool({ "bluemap:parent": parent }));

            expect(child.getTextures().get("all")).not.toBe(parent.getTextures().get("all"));
            expect(child.getTextures().get("all")?.getReferenceName()).toBe("other");
        });

        it("deep-copies the parent's elements", () => {
            const parent = read('{"elements": [{"faces": {"up": {"texture": "#all"}}}]}');
            const child = read('{"parent": "bluemap:parent"}');

            child.applyParent(pool({ "bluemap:parent": parent }));

            const childElement = child.getElements()?.[0] as Element;
            const parentElement = parent.getElements()?.[0] as Element;
            expect(childElement).not.toBe(parentElement);
            expect(childElement.getFaces().get(Direction.UP)).not.toBe(
                parentElement.getFaces().get(Direction.UP),
            );
        });

        it("keeps its own elements instead of taking the parent's", () => {
            const parent = read('{"elements": [{}, {}]}');
            const child = read('{"parent": "bluemap:parent", "elements": [{}]}');

            child.applyParent(pool({ "bluemap:parent": parent }));

            expect(child.getElements()?.length).toBe(1);
        });

        it("preserves null entries of the parent's element-array", () => {
            const parent = read('{"elements": [null, {}]}');
            const child = read('{"parent": "bluemap:parent"}');

            child.applyParent(pool({ "bluemap:parent": parent }));

            expect(child.getElements()?.length).toBe(2);
            expect(child.getElements()?.[0]).toBeNull();
            expect(child.getElements()?.[1]).not.toBeNull();
        });

        it("nulls the parent before resolving, so a reference-loop terminates", () => {
            const a = read('{"parent": "bluemap:b", "textures": {"a": "block/a"}}');
            const b = read('{"parent": "bluemap:a", "textures": {"b": "block/b"}}');

            const models = pool({ "bluemap:a": a, "bluemap:b": b });
            a.applyParent(models);

            expect(a.getParent()).toBeNull();
            expect(b.getParent()).toBeNull();
            expect(a.getTextures().get("b")?.getTexturePath()?.getFormatted()).toBe(
                "minecraft:block/b",
            );
        });

        it("is a no-op without a parent", () => {
            const model = read('{"textures": {"a": "block/a"}}');
            model.applyParent({
                get: () => {
                    throw new Error("should not be called");
                },
            });
            expect(model.getTextures().size).toBe(1);
        });

        it("survives an unresolvable parent", () => {
            const child = read('{"parent": "bluemap:nope"}');
            child.applyParent(pool({}));
            expect(child.getParent()).toBeNull();
            expect(child.getElements()).toBeNull();
        });
    });

    describe("calculateProperties", () => {
        it("sets occluding and culling for a full cube of opaque textures", () => {
            const model = read(FULL_CUBE);
            model.calculateProperties(
                pool({ "minecraft:block/stone": solidTexture("minecraft:block/stone", 255) }),
            );

            expect(model.isOccluding()).toBe(true);
            expect(model.isCulling()).toBe(true);
        });

        it("occludes but does not cull when a texture is not fully opaque", () => {
            const model = read(FULL_CUBE);
            model.calculateProperties(
                pool({ "minecraft:block/stone": solidTexture("minecraft:block/stone", 128) }),
            );

            expect(model.isOccluding()).toBe(true);
            expect(model.isCulling()).toBe(false);
        });

        it("occludes but does not cull when the texture is missing from the pool", () => {
            const model = read(FULL_CUBE);
            model.calculateProperties(pool<Texture>({}));

            expect(model.isOccluding()).toBe(true);
            expect(model.isCulling()).toBe(false);
        });

        it("occludes but does not cull when a texture-reference cannot be resolved", () => {
            const model = read(`{"elements": [{${ALL_FACES}}]}`);
            model.calculateProperties(pool<Texture>({}));

            expect(model.isOccluding()).toBe(true);
            expect(model.isCulling()).toBe(false);
        });

        it("does neither when no element is a full cube", () => {
            const model = read(
                `{"textures": {"all": "block/stone"}, "elements": [{"to": [16, 8, 16], ${ALL_FACES}}]}`,
            );
            model.calculateProperties(
                pool({ "minecraft:block/stone": solidTexture("minecraft:block/stone", 255) }),
            );

            expect(model.isOccluding()).toBe(false);
            expect(model.isCulling()).toBe(false);
        });

        it("does nothing without elements", () => {
            const model = read("{}");
            model.calculateProperties(pool<Texture>({}));
            expect(model.isOccluding()).toBe(false);
            expect(model.isCulling()).toBe(false);
        });
    });

    it("optimize resolves the model's textures and every element's face-textures", () => {
        const model = read(
            '{"textures": {"all": "block/stone"}, "elements": [{"faces": {"up": {"texture": "block/dirt"}}}]}',
        );
        const lookups: string[] = [];
        model.optimize({
            get: (key) => {
                lookups.push(key.getFormatted());
                return null;
            },
        });
        expect(lookups.sort()).toEqual(["minecraft:block/dirt", "minecraft:block/stone"]);
    });
});
