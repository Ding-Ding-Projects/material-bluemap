import { Vector3f, Vector4f } from "@material-bluemap/shared";
import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { Direction } from "../../../../util/Direction.js";
import { Element } from "./Element.js";
import { Face } from "./Face.js";
import { Rotation } from "./Rotation.js";
import { TextureVariable } from "./TextureVariable.js";

function read(json: string): Element {
    return Element.Adapter.read(parse(json));
}

function uvOf(element: Element, direction: Direction): Vector4f {
    const face = element.getFaces().get(direction);
    expect(face).toBeDefined();
    return (face as Face).getUv() as Vector4f;
}

/** an asymmetric box, so every one of the six default-uv formulas produces a distinct result */
const ASYMMETRIC = '"from": [1, 2, 3], "to": [11, 13, 15]';
const ALL_FACES =
    '"faces": {"up": {}, "down": {}, "north": {}, "south": {}, "west": {}, "east": {}}';

describe("Element", () => {
    describe("defaults", () => {
        it("spans the full block when from/to are absent", () => {
            const element = read("{}");
            expect(element.getFrom()).toEqual(Vector3f.ZERO);
            expect(element.getTo()).toEqual(new Vector3f(16, 16, 16));
            expect(element.getRotation()).toBe(Rotation.ZERO);
            expect(element.isShade()).toBe(true);
            expect(element.getLightEmission()).toBe(0);
            expect(element.getFaces().size).toBe(0);
        });

        it("reads shade and light_emission (LOWER_CASE_WITH_UNDERSCORES)", () => {
            const element = read('{"shade": false, "light_emission": 15}');
            expect(element.isShade()).toBe(false);
            expect(element.getLightEmission()).toBe(15);
        });

        it("reads its own rotation", () => {
            const element = read('{"rotation": {"origin": [0, 0, 0], "axis": "x", "angle": 45}}');
            expect(element.getRotation()).not.toBe(Rotation.ZERO);
            expect(element.getRotation().getX()).toBe(45);
            expect(element.getRotation().getOrigin()).toEqual(Vector3f.ZERO);
        });
    });

    describe("default uv calculation", () => {
        const element = read(`{${ASYMMETRIC}, ${ALL_FACES}}`);

        it("UP uses (from.x, from.z) -> (to.x, to.z)", () => {
            expect(uvOf(element, Direction.UP)).toEqual(new Vector4f(1, 3, 11, 15));
        });

        it("DOWN flips z", () => {
            expect(uvOf(element, Direction.DOWN)).toEqual(new Vector4f(1, 1, 11, 13));
        });

        it("NORTH flips x and y", () => {
            expect(uvOf(element, Direction.NORTH)).toEqual(new Vector4f(5, 3, 15, 14));
        });

        it("SOUTH flips y only", () => {
            expect(uvOf(element, Direction.SOUTH)).toEqual(new Vector4f(1, 3, 11, 14));
        });

        it("EAST flips z and y", () => {
            expect(uvOf(element, Direction.EAST)).toEqual(new Vector4f(1, 3, 13, 14));
        });

        it("WEST flips y only, over z", () => {
            expect(uvOf(element, Direction.WEST)).toEqual(new Vector4f(3, 3, 15, 14));
        });

        it("produces six distinct uvs for an asymmetric element", () => {
            const uvs = Direction.values().map((dir) => uvOf(element, dir).toString());
            expect(new Set(uvs).size).toBe(6);
        });

        it("collapses to the same uv for the full block", () => {
            const fullBlock = read(`{${ALL_FACES}}`);
            for (const dir of Direction.values()) {
                expect(uvOf(fullBlock, dir)).toEqual(new Vector4f(0, 0, 16, 16));
            }
        });

        it("keeps an explicitly given uv", () => {
            const element = read(`{${ASYMMETRIC}, "faces": {"up": {"uv": [4, 5, 6, 7]}}}`);
            expect(uvOf(element, Direction.UP)).toEqual(new Vector4f(4, 5, 6, 7));
        });
    });

    describe("faces", () => {
        it("maps top/bottom onto UP/DOWN", () => {
            const element = read('{"faces": {"top": {}, "bottom": {}}}');
            expect(element.getFaces().has(Direction.UP)).toBe(true);
            expect(element.getFaces().has(Direction.DOWN)).toBe(true);
        });

        it("iterates in Direction-declaration order like the upstream EnumMap", () => {
            const element = read('{"faces": {"east": {}, "west": {}, "up": {}, "north": {}}}');
            expect([...element.getFaces().keys()]).toEqual([
                Direction.UP,
                Direction.NORTH,
                Direction.WEST,
                Direction.EAST,
            ]);
        });

        it("reads the face members", () => {
            const element = read(
                '{"faces": {"north": {"texture": "#side", "cullface": "bottom", "rotation": 90, "tintindex": 2}}}',
            );
            const face = element.getFaces().get(Direction.NORTH) as Face;
            expect(face.getTexture().getReferenceName()).toBe("side");
            expect(face.getCullface()).toBe(Direction.DOWN);
            expect(face.getRotation()).toBe(90);
            expect(face.getTintindex()).toBe(2);
        });
    });

    describe("isFullCube", () => {
        it("is true for a 0..16 box with all six faces", () => {
            expect(read(`{${ALL_FACES}}`).isFullCube()).toBe(true);
        });

        it("is false when a face is missing", () => {
            expect(
                read(
                    '{"faces": {"up": {}, "down": {}, "north": {}, "south": {}, "west": {}}}',
                ).isFullCube(),
            ).toBe(false);
        });

        it("is false when the box is smaller than the block", () => {
            expect(read(`{"from": [0, 0, 0], "to": [16, 15, 16], ${ALL_FACES}}`).isFullCube()).toBe(
                false,
            );
        });
    });

    describe("copy", () => {
        it("deep-copies the faces and their texture-variables", () => {
            const element = read(`{${ASYMMETRIC}, "faces": {"up": {"texture": "#all"}}}`);
            const copy = element.copy();

            expect(copy).not.toBe(element);
            expect(copy.getFrom()).toBe(element.getFrom());
            expect(copy.getRotation()).toBe(element.getRotation());

            const original = element.getFaces().get(Direction.UP) as Face;
            const copied = copy.getFaces().get(Direction.UP) as Face;
            expect(copied).not.toBe(original);
            expect(copied.getTexture()).not.toBe(original.getTexture());
            expect(copied.getUv()).toEqual(original.getUv());

            // resolving the copy's variable leaves the original unresolved
            copied.getTexture().getTexturePath(() => null);
            expect(copied.getTexture().isReference()).toBe(false);
            expect(original.getTexture().isReference()).toBe(true);
        });

        it("carries shade and lightEmission over", () => {
            const copy = read('{"shade": false, "light_emission": 7}').copy();
            expect(copy.isShade()).toBe(false);
            expect(copy.getLightEmission()).toBe(7);
        });
    });

    describe("constructors", () => {
        const faces = new Map<Direction, Face>([
            [Direction.UP, new Face(new TextureVariable("all"))],
        ]);

        it("(from, to, faces) runs init", () => {
            const element = new Element(new Vector3f(1, 2, 3), new Vector3f(11, 13, 15), faces);
            expect(uvOf(element, Direction.UP)).toEqual(new Vector4f(1, 3, 11, 15));
            expect(element.getRotation()).toBe(Rotation.ZERO);
        });

        it("(from, to, rotation, faces) keeps the rotation", () => {
            const rotation = new Rotation(Vector3f.ZERO, 0, 90, 0, false);
            const element = new Element(Vector3f.ZERO, new Vector3f(16, 16, 16), rotation, faces);
            expect(element.getRotation()).toBe(rotation);
            expect(element.isShade()).toBe(true);
        });

        it("(from, to, rotation, shade, lightEmission, faces) sets everything", () => {
            const element = new Element(
                Vector3f.ZERO,
                new Vector3f(16, 16, 16),
                Rotation.ZERO,
                false,
                4,
                faces,
            );
            expect(element.isShade()).toBe(false);
            expect(element.getLightEmission()).toBe(4);
            expect(element.getFaces().size).toBe(1);
        });
    });

    it("optimize resolves every face-texture out of the pool", () => {
        const element = read('{"faces": {"up": {"texture": "block/stone"}}}');
        const lookups: string[] = [];
        element.optimize({
            get: (key) => {
                lookups.push(key.getFormatted());
                return null;
            },
        });
        expect(lookups).toEqual(["minecraft:block/stone"]);
    });
});
