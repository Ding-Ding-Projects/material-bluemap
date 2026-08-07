import { Key } from "@worldlens/shared";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { type JsonObject, type JsonValue } from "../resources/adapter/JsonMapper.js";
import { ResourcePool } from "../resources/pack/ResourcePool.js";
import { Texture } from "../resources/pack/resourcepack/texture/Texture.js";
import { javaDoubleToString, TextureGallery } from "./TextureGallery.js";

const MISSING_TEXTURE_KEY = "bluemap:block/missing";

/** a 1x1 png of the given rgba */
function makePng(r: number, g: number, b: number, a: number): PNG {
    const image = new PNG({ width: 1, height: 1 });
    image.data[0] = r;
    image.data[1] = g;
    image.data[2] = b;
    image.data[3] = a;
    return image;
}

function opaqueTexture(formatted: string): Texture {
    return Texture.from(new Key(formatted), makePng(10, 20, 30, 255));
}

function transparentTexture(formatted: string): Texture {
    return Texture.from(new Key(formatted), makePng(10, 20, 30, 128));
}

function poolOf(...textures: Texture[]): ResourcePool<Texture> {
    const pool = new ResourcePool<Texture>();
    for (const texture of textures) pool.put(texture.getKey(), texture);
    return pool;
}

/** the ordinals of the gallery in written-file order */
function writtenKeys(gallery: TextureGallery): string[] {
    const written = JSON.parse(gallery.writeTexturesFile()) as JsonValue;
    if (!Array.isArray(written)) throw new Error("expected an array");
    return written.map((element) => String((element as JsonObject)["resourcePath"]));
}

describe("TextureGallery", () => {
    describe("get", () => {
        it("returns 0 for an unknown key", () => {
            const gallery = new TextureGallery();
            expect(gallery.get(new Key("minecraft:block/stone"))).toBe(0);
        });

        it("returns 0 for a null key", () => {
            const gallery = new TextureGallery();
            expect(gallery.get(null)).toBe(0);
        });

        it("returns the ordinal a key was assigned", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft:block/a"), null);
            gallery.put(new Key("minecraft:block/b"), null);
            gallery.put(new Key("minecraft:block/c"), null);

            expect(gallery.get(new Key("minecraft:block/a"))).toBe(0);
            expect(gallery.get(new Key("minecraft:block/b"))).toBe(1);
            expect(gallery.get(new Key("minecraft:block/c"))).toBe(2);
        });

        it("matches keys by value, not by identity", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft", "block/stone"), null);
            expect(gallery.get(new Key("minecraft:block/stone"))).toBe(0);
        });

        it("resolves a null key to the missing-texture mapping", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft:block/a"), null);
            gallery.put(new Key(MISSING_TEXTURE_KEY), null);

            // the missing-texture is at ordinal 1 here (put() was not fed a pool), and a
            // null key resolves to it rather than to the constant 0
            expect(gallery.get(new Key(MISSING_TEXTURE_KEY))).toBe(1);
            expect(gallery.get(null)).toBe(1);
        });
    });

    describe("put(key, texture)", () => {
        it("preserves an existing ordinal when the same key is re-put", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft:block/a"), opaqueTexture("minecraft:block/a"));
            gallery.put(new Key("minecraft:block/b"), opaqueTexture("minecraft:block/b"));

            const reloaded = Texture.from(new Key("minecraft:block/a"), makePng(1, 2, 3, 255));
            gallery.put(new Key("minecraft:block/a"), reloaded);

            // the ordinal is stable — already-rendered tiles keep pointing at the right texture
            expect(gallery.get(new Key("minecraft:block/a"))).toBe(0);
            expect(gallery.get(new Key("minecraft:block/b"))).toBe(1);
            expect(writtenKeys(gallery)).toEqual(["minecraft:block/a", "minecraft:block/b"]);
        });

        it("replaces the texture of an existing mapping", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft:block/a"), null);
            gallery.put(new Key("minecraft:block/a"), opaqueTexture("minecraft:block/a"));

            const written = JSON.parse(gallery.writeTexturesFile()) as JsonObject[];
            expect(written[0]?.["texture"]).toBe(opaqueTexture("minecraft:block/a").getTexture());
        });

        it("keeps the existing texture when re-put with null", () => {
            const gallery = new TextureGallery();
            const texture = opaqueTexture("minecraft:block/a");
            gallery.put(new Key("minecraft:block/a"), texture);
            gallery.put(new Key("minecraft:block/a"), null);

            const written = JSON.parse(gallery.writeTexturesFile()) as JsonObject[];
            expect(written[0]?.["texture"]).toBe(texture.getTexture());
        });
    });

    describe("put(resourcePool)", () => {
        it("always puts the missing-texture at ordinal 0", () => {
            const gallery = new TextureGallery();
            // "aaa:..." sorts before "bluemap:block/missing", so key-order alone would
            // hand ordinal 0 to it — the missing-texture goes in first regardless
            gallery.put(poolOf(opaqueTexture("aaa:block/aaa"), opaqueTexture("minecraft:x")));

            expect(gallery.get(new Key(MISSING_TEXTURE_KEY))).toBe(0);
            expect(writtenKeys(gallery)[0]).toBe(MISSING_TEXTURE_KEY);
        });

        it("puts opaque textures before half-transparent ones, each key-sorted", () => {
            const gallery = new TextureGallery();
            gallery.put(
                poolOf(
                    transparentTexture("minecraft:block/glass"),
                    opaqueTexture("minecraft:block/stone"),
                    transparentTexture("minecraft:block/water"),
                    opaqueTexture("minecraft:block/dirt"),
                    opaqueTexture("aaa:block/first"),
                ),
            );

            expect(writtenKeys(gallery)).toEqual([
                MISSING_TEXTURE_KEY,
                "aaa:block/first",
                "minecraft:block/dirt",
                "minecraft:block/stone",
                "minecraft:block/glass",
                "minecraft:block/water",
            ]);
        });

        it("is insertion-order independent", () => {
            const textures = [
                transparentTexture("minecraft:block/water"),
                opaqueTexture("minecraft:block/stone"),
                opaqueTexture("minecraft:block/dirt"),
                transparentTexture("minecraft:block/glass"),
            ];

            const forwards = new TextureGallery();
            forwards.put(poolOf(...textures));
            const backwards = new TextureGallery();
            backwards.put(poolOf(...[...textures].reverse()));

            expect(writtenKeys(backwards)).toEqual(writtenKeys(forwards));
        });

        it("preserves the ordinals of an already-populated gallery", () => {
            const textures = [
                opaqueTexture("minecraft:block/stone"),
                transparentTexture("minecraft:block/water"),
            ];

            const gallery = new TextureGallery();
            gallery.put(poolOf(...textures));
            const before = writtenKeys(gallery);

            // a second resource-pack load of the same textures must not renumber anything
            gallery.put(poolOf(...textures));
            expect(writtenKeys(gallery)).toEqual(before);
        });

        it("appends a newly-appearing texture after the existing ordinals", () => {
            const gallery = new TextureGallery();
            gallery.put(poolOf(opaqueTexture("minecraft:block/stone")));
            gallery.put(
                poolOf(
                    opaqueTexture("minecraft:block/stone"),
                    // sorts before "stone", but "stone" already owns ordinal 1
                    opaqueTexture("minecraft:block/dirt"),
                ),
            );

            expect(writtenKeys(gallery)).toEqual([
                MISSING_TEXTURE_KEY,
                "minecraft:block/stone",
                "minecraft:block/dirt",
            ]);
        });
    });

    describe("clear", () => {
        it("drops every mapping and restarts the ordinals", () => {
            const gallery = new TextureGallery();
            gallery.put(poolOf(opaqueTexture("minecraft:block/stone")));
            gallery.clear();

            expect(gallery.writeTexturesFile()).toBe("[]");
            expect(gallery.get(new Key("minecraft:block/stone"))).toBe(0);

            gallery.put(new Key("minecraft:block/dirt"), null);
            expect(gallery.get(new Key("minecraft:block/dirt"))).toBe(0);
        });
    });

    describe("writeTexturesFile", () => {
        it("writes a bare array indexed by ordinal", () => {
            const gallery = new TextureGallery();
            const stone = opaqueTexture("minecraft:block/stone");
            gallery.put(new Key("minecraft:block/stone"), stone);

            const written = JSON.parse(gallery.writeTexturesFile()) as JsonValue;
            expect(Array.isArray(written)).toBe(true);
            expect(written).toEqual([
                {
                    resourcePath: "minecraft:block/stone",
                    color: expect.any(Array) as unknown,
                    halfTransparent: false,
                    texture: stone.getTexture(),
                },
            ]);
        });

        it("omits the animation member when there is none", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft:block/stone"), opaqueTexture("minecraft:block/stone"));

            const written = JSON.parse(gallery.writeTexturesFile()) as JsonObject[];
            expect(written[0]).not.toHaveProperty("animation");
        });

        it("fills a mapping with no texture with Texture.missing(key)", () => {
            const gallery = new TextureGallery();
            gallery.put(new Key("minecraft:block/nothing"), null);

            const written = JSON.parse(gallery.writeTexturesFile()) as JsonObject[];
            expect(written[0]?.["resourcePath"]).toBe("minecraft:block/nothing");
            expect(written[0]?.["texture"]).toBe(Texture.MISSING.getTexture());
        });

        it("fills ordinal-holes with Texture.MISSING", () => {
            // a duplicated key leaves ordinal 1 unmapped while nextId stays 3
            const gallery = TextureGallery.readTexturesFile(
                JSON.stringify([
                    Texture.Adapter.write(opaqueTexture("minecraft:block/a")),
                    Texture.Adapter.write(opaqueTexture("minecraft:block/a")),
                    Texture.Adapter.write(opaqueTexture("minecraft:block/b")),
                ]),
            );

            expect(writtenKeys(gallery)).toEqual([
                "minecraft:block/a",
                "bluemap:missing",
                "minecraft:block/b",
            ]);
        });

        it("writes an empty array for an empty gallery", () => {
            expect(new TextureGallery().writeTexturesFile()).toBe("[]");
        });
    });

    describe("readTexturesFile", () => {
        it("throws on empty input", () => {
            expect(() => TextureGallery.readTexturesFile("")).toThrow("Texture data is empty!");
            expect(() => TextureGallery.readTexturesFile("   ")).toThrow("Texture data is empty!");
            expect(() => TextureGallery.readTexturesFile("null")).toThrow("Texture data is empty!");
        });

        it("throws on unparseable input", () => {
            expect(() => TextureGallery.readTexturesFile("{")).toThrow("Failed to parse");
            expect(() => TextureGallery.readTexturesFile("not json at all")).toThrow(
                "Failed to parse",
            );
        });

        it("throws when the document is not an array", () => {
            expect(() => TextureGallery.readTexturesFile('{"a":1}')).toThrow("Failed to parse");
        });

        it("takes the ordinal from the array index", () => {
            const gallery = TextureGallery.readTexturesFile(
                JSON.stringify([
                    Texture.Adapter.write(opaqueTexture("minecraft:block/a")),
                    Texture.Adapter.write(opaqueTexture("minecraft:block/b")),
                ]),
            );

            expect(gallery.get(new Key("minecraft:block/a"))).toBe(0);
            expect(gallery.get(new Key("minecraft:block/b"))).toBe(1);
        });

        it("keeps the first occurrence of a duplicated key", () => {
            const gallery = TextureGallery.readTexturesFile(
                JSON.stringify([
                    Texture.Adapter.write(opaqueTexture("minecraft:block/a")),
                    Texture.Adapter.write(opaqueTexture("minecraft:block/b")),
                    Texture.Adapter.write(opaqueTexture("minecraft:block/a")),
                ]),
            );

            expect(gallery.get(new Key("minecraft:block/a"))).toBe(0);
            expect(gallery.get(new Key("minecraft:block/b"))).toBe(1);
        });

        it("reserves the ordinals of null elements", () => {
            const gallery = TextureGallery.readTexturesFile(
                JSON.stringify([null, Texture.Adapter.write(opaqueTexture("minecraft:block/b"))]),
            );

            expect(gallery.get(new Key("minecraft:block/b"))).toBe(1);

            // nextId is the array length, so a new key continues after the hole
            gallery.put(new Key("minecraft:block/c"), null);
            expect(gallery.get(new Key("minecraft:block/c"))).toBe(2);
        });

        it("continues the ordinals after the read array", () => {
            const gallery = TextureGallery.readTexturesFile(
                JSON.stringify([
                    Texture.Adapter.write(opaqueTexture("minecraft:block/a")),
                    Texture.Adapter.write(opaqueTexture("minecraft:block/b")),
                ]),
            );

            gallery.put(new Key("minecraft:block/c"), null);
            expect(gallery.get(new Key("minecraft:block/c"))).toBe(2);
        });
    });

    describe("round trip", () => {
        it("write -> read produces identical ordinals and an identical document", () => {
            const original = new TextureGallery();
            original.put(
                poolOf(
                    transparentTexture("minecraft:block/glass"),
                    opaqueTexture("minecraft:block/stone"),
                    transparentTexture("minecraft:block/water"),
                    opaqueTexture("minecraft:block/dirt"),
                    opaqueTexture(MISSING_TEXTURE_KEY),
                ),
            );

            const document = original.writeTexturesFile();
            const restored = TextureGallery.readTexturesFile(document);

            expect(restored.writeTexturesFile()).toBe(document);
            for (const key of writtenKeys(original)) {
                expect(restored.get(new Key(key))).toBe(original.get(new Key(key)));
            }
            expect(restored.get(null)).toBe(0);
        });

        it("survives a re-put of the same pool after a read", () => {
            const textures = [
                opaqueTexture("minecraft:block/stone"),
                transparentTexture("minecraft:block/water"),
            ];

            const original = new TextureGallery();
            original.put(poolOf(...textures));

            const restored = TextureGallery.readTexturesFile(original.writeTexturesFile());
            restored.put(poolOf(...textures));

            expect(writtenKeys(restored)).toEqual(writtenKeys(original));
        });
    });

    describe("file names", () => {
        it("exposes the raw and the gzipped path", () => {
            expect(TextureGallery.TEXTURES_FILE_NAME).toBe("textures.json");
            expect(TextureGallery.TEXTURES_FILE_NAME_GZIP).toBe("textures.json.gz");
        });
    });

    /*
     * These pin the two ways the written document is spelled differently from what
     * `JSON.stringify` would produce. Both were measured against a java-rendered reference
     * `textures.json`, and both are gate-visible: the file is compared byte for byte, so a
     * document that parses to the same value is still a failure if it is spelled otherwise.
     */
    describe("the gson-compatible spelling", () => {
        describe("javaDoubleToString", () => {
            it("keeps the fraction java prints and javascript drops", () => {
                // the whole-number case, which is most of the colour components in a real
                // document: java writes 1.0/0.0, `String(1)` writes 1
                expect(javaDoubleToString(1)).toBe("1.0");
                expect(javaDoubleToString(0)).toBe("0.0");
                expect(javaDoubleToString(-0)).toBe("-0.0");
                expect(javaDoubleToString(100)).toBe("100.0");
                expect(javaDoubleToString(-2)).toBe("-2.0");
            });

            it("spells a plain decimal over java's whole plain range", () => {
                expect(javaDoubleToString(0.5)).toBe("0.5");
                expect(javaDoubleToString(0.001)).toBe("0.001");
                expect(javaDoubleToString(0.8335329294204712)).toBe("0.8335329294204712");
                // 10^7 is the top of the plain range; 9999999.5 is inside it
                expect(javaDoubleToString(9999999.5)).toBe("9999999.5");
            });

            it("switches to java's exponent form outside that range, and writes no plus", () => {
                // the second form the reference document actually contains
                expect(javaDoubleToString(4.985044943168759e-4)).toBe("4.985044943168759E-4");
                // below 10^-3: javascript would write 0.0001
                expect(javaDoubleToString(0.0001)).toBe("1.0E-4");
                // at and above 10^7: javascript would write 10000000
                expect(javaDoubleToString(1e7)).toBe("1.0E7");
                expect(javaDoubleToString(1.5e21)).toBe("1.5E21");
            });

            it("keeps java's spelling of the non-finite values", () => {
                // gson switches to lenient inside `toJson`, so upstream really does emit
                // these bare literals rather than refusing
                expect(javaDoubleToString(Number.NaN)).toBe("NaN");
                expect(javaDoubleToString(Number.POSITIVE_INFINITY)).toBe("Infinity");
                expect(javaDoubleToString(Number.NEGATIVE_INFINITY)).toBe("-Infinity");
            });
        });

        describe("html-safe string escaping", () => {
            /** the written document for one texture whose key is the given string */
            function writtenDocument(formatted: string): string {
                const gallery = new TextureGallery();
                gallery.put(poolOf(opaqueTexture(formatted)));
                return gallery.writeTexturesFile();
            }

            it("escapes the base64 padding that made the reference document differ", () => {
                // the actual first divergence once the numbers agreed: a texture is
                // written as a base64 data-url, and base64 padding is '='
                const document = writtenDocument("minecraft:block/stone");
                expect(document).toContain("\\u003d");
                expect(document).not.toMatch(/[^\\]=/);
            });

            it("escapes each of gson's five html-safe characters", () => {
                // in a resource key, where the divergence would otherwise be invisible
                const document = writtenDocument("minecraft:block/a<b>c&d=e'f");
                for (const [character, escape] of [
                    ["<", "\\u003c"],
                    [">", "\\u003e"],
                    ["&", "\\u0026"],
                    ["=", "\\u003d"],
                    ["'", "\\u0027"],
                ] as const) {
                    expect(document).toContain(escape);
                    expect(document).not.toContain(character);
                }
            });

            it("still parses to the value it spelled", () => {
                // the escaping is a spelling difference and must not be a value one.
                // Ordinal 0 is always the missing-texture, so the put key is ordinal 1.
                const parsed = JSON.parse(writtenDocument("minecraft:block/a=b")) as JsonObject[];
                expect(parsed[1]?.["resourcePath"]).toBe("minecraft:block/a=b");
            });
        });
    });
});
