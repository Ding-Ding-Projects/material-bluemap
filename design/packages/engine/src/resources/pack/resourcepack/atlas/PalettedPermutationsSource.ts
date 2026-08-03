import { Color, Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    asObject,
    isJsonArray,
    JsonParseError,
    nextString,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import { BufferedImageUtil } from "../../../../util/BufferedImageUtil.js";
import type { ResourcePool } from "../../ResourcePool.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import { Texture } from "../texture/Texture.js";
import { Source } from "./Source.js";

/**
 * upstream: resources/pack/resourcepack/atlas/PalettedPermutationsSource.java — recolors
 * every listed texture once per permutation, by looking each of its pixels up in a
 * key-palette/value-palette pair.
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: java.lang.ArrayIndexOutOfBoundsException */
export class ArrayIndexOutOfBoundsError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ArrayIndexOutOfBoundsError";
    }
}

/**
 * upstream: {@code BufferedImageUtil.readPixel(image, x, y, target).getInt()} — reading an
 * out-of-bounds coordinate throws an {@code ArrayIndexOutOfBoundsException} out of the
 * raster ("Coordinate out of bounds!"), which is exactly what upstream catches to skip a
 * permutation-palette that is smaller than the key-palette. pngjs would silently read
 * {@code undefined} instead, so the bounds are checked here.
 */
function readPixelInt(image: PNG, x: number, y: number, target: Color): number {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height)
        throw new ArrayIndexOutOfBoundsError("Coordinate out of bounds!");
    return BufferedImageUtil.readPixel(image, x, y, target).getInt();
}

/** upstream: {@code BufferedImage#setRGB} on a TYPE_INT_ARGB image (straight alpha) */
function setRgb(image: PNG, x: number, y: number, argb: number): void {
    const i = (image.width * y + x) << 2;
    image.data[i] = (argb >>> 16) & 0xff;
    image.data[i + 1] = (argb >>> 8) & 0xff;
    image.data[i + 2] = argb & 0xff;
    image.data[i + 3] = (argb >>> 24) & 0xff;
}

/**
 * upstream: PalettedPermutationsSource.PaletteMap — a private static nested class
 * implementing {@code IntUnaryOperator}, ported as a module-local class.
 */
class PaletteMap {
    private readonly map = new Map<number, number>();

    constructor(keys: PNG, values: PNG) {
        const tempColor = new Color();
        for (let x = 0; x < keys.width; x++) {
            for (let y = 0; y < keys.height; y++) {
                const keyColor = readPixelInt(keys, x, y, tempColor);
                const valueColor = readPixelInt(values, x, y, tempColor);
                this.map.set(keyColor | 0xff000000, valueColor);
            }
        }
    }

    /** upstream: {@code IntUnaryOperator#applyAsInt} */
    applyAsInt(operand: number): number {
        operand |= 0xff000000;
        const result = this.map.get(operand);
        return result === undefined ? operand : result;
    }
}

export class PalettedPermutationsSource extends Source {
    /** upstream: a {@code Set<Key>} — order-preserving with dedup */
    private textures: Key[] | null = null;

    private separator: string = "_";

    /** upstream: {@code @SerializedName("palette_key")} */
    private paletteKey: Key | null = null;

    /** upstream: a {@code Map<String, Key>} — insertion-ordered */
    private permutations: Map<string, Key> | null = null;

    /** upstream: the private {@code @NoArgsConstructor} (gson instantiates with it) */
    constructor();
    /** upstream: the {@code @AllArgsConstructor} */
    constructor(
        textures: Key[] | null,
        separator: string,
        paletteKey: Key | null,
        permutations: Map<string, Key> | null,
    );
    constructor(
        textures: Key[] | null = null,
        separator: string = "_",
        paletteKey: Key | null = null,
        permutations: Map<string, Key> | null = null,
    ) {
        super();
        this.textures = textures;
        this.separator = separator;
        this.paletteKey = paletteKey;
        this.permutations = permutations;
    }

    getTextures(): Key[] | null {
        return this.textures;
    }

    getSeparator(): string {
        return this.separator;
    }

    getPaletteKey(): Key | null {
        return this.paletteKey;
    }

    getPermutations(): Map<string, Key> | null {
        return this.permutations;
    }

    override async load(
        root: PackPath,
        texturePool: ResourcePool<Texture>,
        _textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        const textures = this.textures;
        const paletteKey = this.paletteKey;
        const permutations = this.permutations;
        if (textures === null) return;
        if (paletteKey === null) return;
        if (permutations === null || permutations.size === 0) return;

        // textures
        for (const resource of textures) {
            await texturePool.load(resource, {
                load: () => this.loadTexture(resource, this.getFile(root, resource)),
            });
        }

        // key
        await texturePool.load(paletteKey, {
            load: () => this.loadTexture(paletteKey, this.getFile(root, paletteKey)),
        });

        // permutations
        for (const resource of permutations.values()) {
            await texturePool.load(resource, {
                load: () => this.loadTexture(resource, this.getFile(root, resource)),
            });
        }
    }

    override async bake(
        texturePool: ResourcePool<Texture>,
        textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        const textures = this.textures;
        const paletteKey = this.paletteKey;
        const permutations = this.permutations;
        if (textures === null) return;
        if (paletteKey === null) return;
        if (permutations === null || permutations.size === 0) return;

        // get key palette
        const paletteKeyTexture = texturePool.get(paletteKey);
        if (paletteKeyTexture === null) return;
        const keyPalette = paletteKeyTexture.getTextureImage();

        // get target palettes and create PaletteMap's
        const palettes = new Map<string, PaletteMap>();
        for (const [suffix, permutation] of permutations) {
            try {
                const texture = texturePool.get(permutation);
                if (texture === null) continue;
                const image = texture.getTextureImage();
                const palette = new PaletteMap(keyPalette, image);
                palettes.set(suffix, palette);
            } catch (ex) {
                if (!(ex instanceof ArrayIndexOutOfBoundsError)) throw ex;
                logDebug(
                    "Failed to load paletted_permutation: Permutation palette " +
                        permutation +
                        " does not match key palette " +
                        paletteKey +
                        ".",
                );
            }
        }

        // generate textures
        const tempColor = new Color();
        for (const resource of textures) {
            const texture = texturePool.get(resource);
            if (texture === null) continue;
            const image = texture.getTextureImage();

            for (const [suffix, palette] of palettes) {
                const sprite = new Key(
                    resource.getNamespace(),
                    resource.getValue() + this.separator + suffix,
                );
                if (texturePool.containsKey(sprite)) continue;
                if (!textureFilter(sprite)) continue;

                const resultImage = new PNG({ width: image.width, height: image.height });

                // map texture
                for (let x = 0; x < image.width; x++) {
                    for (let y = 0; y < image.height; y++) {
                        let color = BufferedImageUtil.readPixel(image, x, y, tempColor).getInt();
                        let alpha = ((color >> 24) & 0xff) / 255;

                        color = palette.applyAsInt(color);
                        alpha *= ((color >> 24) & 0xff) / 255;

                        setRgb(
                            resultImage,
                            x,
                            y,
                            ((Math.trunc(alpha * 255) & 0xff) << 24) | (color & 0xffffff),
                        );
                    }
                }

                texturePool.put(sprite, Texture.from(sprite, resultImage, texture.getAnimation()));
            }
        }
    }

    /** upstream: {@code equals}/{@code hashCode} — identity only, see {@link Source#equalityKey} */
    override equalityKey(): string {
        return this.identityKey();
    }

    /** upstream: gson's reflective adapter for this class */
    static readonly Adapter: JsonAdapter<PalettedPermutationsSource> = {
        read(json: JsonValue): PalettedPermutationsSource {
            const object = asObject(json);
            const source = new PalettedPermutationsSource();
            Source.readInheritedMembers(source, object);

            const textures = object["textures"];
            if (textures != null) {
                if (!isJsonArray(textures)) throw new JsonParseError("Expected BEGIN_ARRAY");

                // upstream: a LinkedHashSet<Key> — insertion-ordered, de-duplicated
                const byFormatted = new Map<string, Key>();
                for (const element of textures) {
                    const key = ResourcesGson.key.read(element);
                    if (!byFormatted.has(key.getFormatted())) byFormatted.set(key.getFormatted(), key);
                }
                source.textures = [...byFormatted.values()];
            }

            const separator = object["separator"];
            if (separator != null) source.separator = nextString(separator);

            const paletteKey = object["palette_key"];
            if (paletteKey != null) source.paletteKey = ResourcesGson.key.read(paletteKey);

            const permutations = object["permutations"];
            if (permutations != null) {
                const map = new Map<string, Key>();
                for (const [suffix, member] of Object.entries(asObject(permutations)))
                    map.set(suffix, ResourcesGson.key.read(member));
                source.permutations = map;
            }

            return source;
        },
    };
}
