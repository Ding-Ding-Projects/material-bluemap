import { Vector4f } from "@worldlens/shared";
import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { Direction } from "../../../../util/Direction.js";
import { ResourcePath } from "../../../ResourcePath.js";
import type { Texture } from "../texture/Texture.js";
import { Face } from "./Face.js";
import { TextureVariable } from "./TextureVariable.js";

function read(json: string): Face {
    return Face.Adapter.read(parse(json));
}

describe("Face", () => {
    it("defaults to no uv, no cullface, rotation 0, tintindex -1 and the missing texture", () => {
        const face = read("{}");
        expect(face.getUv()).toBeNull();
        expect(face.getCullface()).toBeNull();
        expect(face.getRotation()).toBe(0);
        expect(face.getTintindex()).toBe(-1);
        expect(face.getTexture().getTexturePath()?.getFormatted()).toBe("bluemap:block/missing");
    });

    it("reads every member", () => {
        const face = read(
            '{"uv": [1, 2, 3, 4], "texture": "#side", "cullface": "north", "rotation": 180, "tintindex": 0}',
        );
        expect(face.getUv()).toEqual(new Vector4f(1, 2, 3, 4));
        expect(face.getTexture().getReferenceName()).toBe("side");
        expect(face.getCullface()).toBe(Direction.NORTH);
        expect(face.getRotation()).toBe(180);
        expect(face.getTintindex()).toBe(0);
    });

    describe("init", () => {
        it("fills a missing uv from the calculator", () => {
            const face = read("{}");
            face.init(Direction.UP, () => new Vector4f(0, 0, 16, 16));
            expect(face.getUv()).toEqual(new Vector4f(0, 0, 16, 16));
        });

        it("keeps an explicit uv and never calls the calculator", () => {
            const face = read('{"uv": [1, 2, 3, 4]}');
            face.init(Direction.UP, () => {
                throw new Error("should not be called");
            });
            expect(face.getUv()).toEqual(new Vector4f(1, 2, 3, 4));
        });

        it("passes the face's own direction to the calculator", () => {
            const seen: Direction[] = [];
            read("{}").init(Direction.WEST, (direction) => {
                seen.push(direction);
                return new Vector4f(0, 0, 0, 0);
            });
            expect(seen).toEqual([Direction.WEST]);
        });
    });

    it("copy copies the texture-variable but shares the immutable uv", () => {
        const face = read(
            '{"uv": [1, 2, 3, 4], "texture": "#side", "cullface": "east", "rotation": 90, "tintindex": 3}',
        );
        const copy = face.copy();

        expect(copy).not.toBe(face);
        expect(copy.getUv()).toBe(face.getUv());
        expect(copy.getCullface()).toBe(Direction.EAST);
        expect(copy.getRotation()).toBe(90);
        expect(copy.getTintindex()).toBe(3);
        expect(copy.getTexture()).not.toBe(face.getTexture());
        expect(copy.getTexture().getReferenceName()).toBe("side");
    });

    describe("constructors", () => {
        it("(texture)", () => {
            const texture = new TextureVariable("all");
            const face = new Face(texture);
            expect(face.getTexture()).toBe(texture);
            expect(face.getUv()).toBeNull();
            expect(face.getTintindex()).toBe(-1);
        });

        it("(uv, texture)", () => {
            const uv = new Vector4f(0, 0, 8, 8);
            const face = new Face(uv, new TextureVariable("all"));
            expect(face.getUv()).toBe(uv);
            expect(face.getCullface()).toBeNull();
        });

        it("(uv, texture, cullface)", () => {
            const face = new Face(
                new Vector4f(0, 0, 8, 8),
                new TextureVariable("all"),
                Direction.UP,
            );
            expect(face.getCullface()).toBe(Direction.UP);
        });

        it("(uv, texture, cullface, rotation, tintindex)", () => {
            const face = new Face(null, new TextureVariable("all"), null, 270, 1);
            expect(face.getUv()).toBeNull();
            expect(face.getRotation()).toBe(270);
            expect(face.getTintindex()).toBe(1);
        });
    });

    it("optimize delegates to the texture-variable", () => {
        const texture = {} as Texture;
        const face = new Face(new TextureVariable(new ResourcePath<Texture>("block/stone")));

        face.optimize({ get: () => texture });

        expect(face.getTexture().getTexturePath()?.getResource()).toBe(texture);
    });
});
