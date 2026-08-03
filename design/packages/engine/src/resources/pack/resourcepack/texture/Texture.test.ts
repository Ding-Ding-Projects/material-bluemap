import { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parse, type JsonObject } from "../../../adapter/JsonMapper.js";
import { AnimationMeta } from "./AnimationMeta.js";
import { Texture } from "./Texture.js";

const TEXTURE_STRING_PREFIX = "data:image/png;base64,";

function makePng(
    width: number,
    height: number,
    pixel: (x: number, y: number) => [number, number, number, number],
): PNG {
    const image = new PNG({ width, height });
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (width * y + x) << 2;
            const [r, g, b, a] = pixel(x, y);
            image.data[i] = r;
            image.data[i + 1] = g;
            image.data[i + 2] = b;
            image.data[i + 3] = a;
        }
    }
    return image;
}

function pixelsOf(image: PNG): number[] {
    return [...image.data];
}

describe("Texture", () => {
    describe("MISSING", () => {
        it("is the bluemap:missing magenta placeholder", () => {
            expect(Texture.MISSING.getKey().getFormatted()).toBe("bluemap:missing");
            expect(Texture.MISSING.isHalfTransparent()).toBe(false);
            expect(Texture.MISSING.getAnimation()).toBeNull();
            expect(Texture.MISSING.getTexture().startsWith(TEXTURE_STRING_PREFIX)).toBe(true);

            const color = Texture.MISSING.getColorStraight();
            expect(color.r).toBeCloseTo(0.5, 6);
            expect(color.g).toBe(0);
            expect(color.b).toBeCloseTo(0.5, 6);
            expect(color.a).toBe(1);
            expect(color.isPremultiplied).toBe(false);
        });

        it("decodes into a 16x16 image", () => {
            const image = Texture.MISSING.getTextureImage();
            expect(image.width).toBe(16);
            expect(image.height).toBe(16);
        });
    });

    describe("from", () => {
        it("round-trips the pixels through the base64 png", () => {
            const image = makePng(4, 3, (x, y) => [x * 20, y * 30, 200, 255]);
            const texture = Texture.from(new Key("minecraft:block/test"), image);

            expect(texture.getKey().getFormatted()).toBe("minecraft:block/test");
            expect(texture.getTexture().startsWith(TEXTURE_STRING_PREFIX)).toBe(true);

            const decoded = PNG.sync.read(
                Buffer.from(texture.getTexture().substring(TEXTURE_STRING_PREFIX.length), "base64"),
            );
            expect(decoded.width).toBe(4);
            expect(decoded.height).toBe(3);
            expect(pixelsOf(decoded)).toEqual(pixelsOf(image));
        });

        it("caches the source image and re-decodes it after the cache is cleared", () => {
            const image = makePng(2, 2, () => [10, 20, 30, 255]);
            const texture = Texture.from(new Key("minecraft:block/test"), image);

            // the image handed to from() is cached
            expect(texture.getTextureImage()).toBe(image);

            // a re-decode from the base64 yields the same pixels (the WeakRef standing
            // in for upstream's SoftReference may be cleared at any time)
            const roundTripped = Texture.Adapter.read(Texture.Adapter.write(texture));
            expect(pixelsOf(roundTripped.getTextureImage())).toEqual(pixelsOf(image));
        });

        it("detects half-transparency", () => {
            const opaque = Texture.from(
                new Key("a"),
                makePng(2, 2, () => [0, 0, 0, 255]),
            );
            const cutout = Texture.from(
                new Key("b"),
                makePng(2, 2, (x) => [0, 0, 0, x === 0 ? 0 : 255]),
            );
            const blended = Texture.from(
                new Key("c"),
                makePng(2, 2, () => [0, 0, 0, 128]),
            );

            expect(opaque.isHalfTransparent()).toBe(false);
            expect(cutout.isHalfTransparent()).toBe(false);
            expect(blended.isHalfTransparent()).toBe(true);
        });

        it("averages the colour, straight", () => {
            const texture = Texture.from(
                new Key("a"),
                makePng(2, 1, (x) => (x === 0 ? [255, 0, 0, 255] : [0, 0, 255, 255])),
            );

            const color = texture.getColorStraight();
            expect(color.isPremultiplied).toBe(false);
            expect(color.r).toBeCloseTo(0.5, 6);
            expect(color.g).toBe(0);
            expect(color.b).toBeCloseTo(0.5, 6);
            expect(color.a).toBeCloseTo(1, 6);
        });

        it("keeps the animation it is handed", () => {
            const animation = new AnimationMeta(false, 1, 1, 4, null);
            const texture = Texture.from(
                new Key("a"),
                makePng(1, 1, () => [0, 0, 0, 255]),
                animation,
            );
            expect(texture.getAnimation()).toBe(animation);
        });

        it("defaults the animation to null", () => {
            expect(
                Texture.from(
                    new Key("a"),
                    makePng(1, 1, () => [0, 0, 0, 255]),
                ).getAnimation(),
            ).toBeNull();
        });
    });

    it("getColorPremultiplied premultiplies lazily without touching the straight colour", () => {
        const texture = Texture.from(
            new Key("a"),
            makePng(2, 1, (x) => [255, 255, 255, x === 0 ? 0 : 255]),
        );

        const straight = texture.getColorStraight();
        const premultiplied = texture.getColorPremultiplied();

        expect(premultiplied).toBe(texture.getColorPremultiplied()); // cached
        expect(premultiplied).not.toBe(straight);
        expect(premultiplied.isPremultiplied).toBe(true);
        expect(straight.isPremultiplied).toBe(false);
        expect(premultiplied.a).toBeCloseTo(straight.a, 6);
        expect(premultiplied.r).toBeCloseTo(straight.r * straight.a, 6);
    });

    describe("missing", () => {
        it("keeps the requested key but the MISSING pixels", () => {
            const texture = Texture.missing(new Key("minecraft:block/nope"));
            expect(texture.getKey().getFormatted()).toBe("minecraft:block/nope");
            expect(texture.getTexture()).toBe(Texture.MISSING.getTexture());
            expect(texture.isHalfTransparent()).toBe(false);
            expect(texture.getAnimation()).toBeNull();
            expect(texture.getTextureImage().width).toBe(16);
        });
    });

    describe("Adapter", () => {
        it("serializes the key as resourcePath (IDENTITY field-naming)", () => {
            const texture = Texture.from(
                new Key("minecraft:block/test"),
                makePng(1, 1, () => [255, 0, 0, 255]),
            );
            const json = Texture.Adapter.write(texture) as JsonObject;

            expect(Object.keys(json)).toEqual([
                "resourcePath",
                "color",
                "halfTransparent",
                "texture",
            ]);
            expect(json["resourcePath"]).toBe("minecraft:block/test");
            expect(json["halfTransparent"]).toBe(false);
            expect(json["color"]).toEqual([1, 0, 0, 1]);
        });

        it("round-trips key, colour, half-transparency and pixels", () => {
            const texture = Texture.from(
                new Key("minecraft:block/test"),
                makePng(2, 2, () => [10, 20, 30, 128]),
            );
            const restored = Texture.Adapter.read(Texture.Adapter.write(texture));

            expect(restored.getKey().getFormatted()).toBe("minecraft:block/test");
            expect(restored.isHalfTransparent()).toBe(true);
            expect(restored.getTexture()).toBe(texture.getTexture());
            expect(restored.getColorStraight().r).toBeCloseTo(texture.getColorStraight().r, 6);
        });

        it("falls back to MISSING for an empty object", () => {
            const texture = Texture.Adapter.read(parse("{}"));
            expect(texture.getKey().getFormatted()).toBe("bluemap:missing");
            expect(texture.getTexture()).toBe(Texture.MISSING.getTexture());
        });

        it("reads an animation from its mcmeta-shaped wrapper", () => {
            const texture = Texture.Adapter.read(
                parse(
                    '{"resourcePath": "minecraft:block/fire", "animation": {"animation": {"frametime": 4}}}',
                ),
            );
            expect(texture.getAnimation()?.getFrametime()).toBe(4);
        });

        it("does not round-trip an animation (upstream: reader and writer disagree)", () => {
            const texture = Texture.from(
                new Key("a"),
                makePng(1, 1, () => [0, 0, 0, 255]),
                new AnimationMeta(true, 1, 1, 4, null),
            );
            const restored = Texture.Adapter.read(Texture.Adapter.write(texture));

            // the writer emits the fields bare, the reader only looks for an
            // "animation" member — so every field falls back to its default
            expect(restored.getAnimation()?.getFrametime()).toBe(1);
            expect(restored.getAnimation()?.isInterpolate()).toBe(false);
        });
    });
});
