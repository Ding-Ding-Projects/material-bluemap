import type { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    asObject,
    isJsonArray,
    JsonParseError,
    nextDouble,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import type { ResourcePool } from "../../ResourcePool.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import { Texture } from "../texture/Texture.js";
import { Source } from "./Source.js";

/**
 * upstream: resources/pack/resourcepack/atlas/UnstitchSource.java — cuts a set of regions
 * out of one (atlas-)texture.
 *
 * java.awt's {@code BufferedImage#getSubimage} returns a <em>view</em> onto the parent
 * raster; pngjs has no such thing, so each region is copied out pixel-for-pixel (the
 * region is written to a base64 png by {@code Texture.from} right after, so the copy is
 * what upstream materializes anyway).
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

/** upstream: java.awt.image.RasterFormatException */
export class RasterFormatError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RasterFormatError";
    }
}

/** java's narrowing {@code (int)} cast of a double: truncate toward zero, saturating */
function javaIntCast(value: number): number {
    if (Number.isNaN(value)) return 0;
    if (value >= 2147483647) return 2147483647;
    if (value <= -2147483648) return -2147483648;
    return Math.trunc(value);
}

/**
 * upstream: {@code BufferedImage#getSubimage} — the bounds-checks are the ones
 * {@code WritableRaster#createWritableChild} and the {@code Raster} constructor make, and
 * they are what upstream catches as a {@code RasterFormatException}.
 */
function getSubimage(image: PNG, x: number, y: number, width: number, height: number): PNG {
    if (x < 0) throw new RasterFormatError("parentX lies outside raster");
    if (y < 0) throw new RasterFormatError("parentY lies outside raster");
    if (x + width > image.width) throw new RasterFormatError("(parentX + width) is outside raster");
    if (y + height > image.height)
        throw new RasterFormatError("(parentY + height) is outside raster");
    if (width <= 0 || height <= 0)
        throw new RasterFormatError("negative or zero " + (width <= 0 ? "width" : "height"));

    const subimage = new PNG({ width, height });
    for (let row = 0; row < height; row++) {
        const start = ((y + row) * image.width + x) << 2;
        image.data.copy(subimage.data, (row * width) << 2, start, start + (width << 2));
    }
    return subimage;
}

/**
 * upstream: UnstitchSource.Region — a static nested class, ported as a sibling class of
 * the same module.
 */
export class Region {
    private sprite: Key | null = null;
    private x: number = 0;
    private y: number = 0;
    private width: number = 0;
    private height: number = 0;

    /** upstream: the private {@code @NoArgsConstructor} (gson instantiates with it) */
    constructor();
    /** upstream: the {@code @AllArgsConstructor} */
    constructor(sprite: Key, x: number, y: number, width: number, height: number);
    constructor(sprite?: Key, x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this.sprite = sprite ?? null;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
    }

    getSprite(): Key | null {
        return this.sprite;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getWidth(): number {
        return this.width;
    }

    getHeight(): number {
        return this.height;
    }

    /**
     * upstream: {@code equals}/{@code hashCode} — unlike the sources, Region compares
     * structurally (it does not inherit Source's class-check), so this is the key the
     * {@code LinkedHashSet<Region>} de-duplicates by.
     */
    equalityKey(): string {
        return [
            this.sprite === null ? "null" : this.sprite.getFormatted(),
            this.x,
            this.y,
            this.width,
            this.height,
        ].join("/");
    }

    /** upstream: gson's reflective adapter for this class */
    static readonly Adapter: JsonAdapter<Region> = {
        read(json: JsonValue): Region {
            const object = asObject(json);
            const region = new Region();

            const sprite = object["sprite"];
            if (sprite != null) region.sprite = ResourcesGson.key.read(sprite);

            const x = object["x"];
            if (x != null) region.x = nextDouble(x);

            const y = object["y"];
            if (y != null) region.y = nextDouble(y);

            const width = object["width"];
            if (width != null) region.width = nextDouble(width);

            const height = object["height"];
            if (height != null) region.height = nextDouble(height);

            return region;
        },
    };
}

export class UnstitchSource extends Source {
    private resource: Key | null = null;

    /** upstream: {@code @SerializedName("divisor_x")} */
    private divisorX: number = 0;

    /** upstream: {@code @SerializedName("divisor_y")} */
    private divisorY: number = 0;

    /** upstream: a {@code LinkedHashSet<Region>} — order-preserving with structural dedup */
    private regions: Region[] | null = null;

    /** upstream: the private {@code @NoArgsConstructor} (gson instantiates with it) */
    constructor();
    /** upstream: the {@code @AllArgsConstructor} */
    constructor(
        resource: Key,
        divisorX: number,
        divisorY: number,
        regions: Region[] | null,
    );
    constructor(
        resource?: Key,
        divisorX: number = 0,
        divisorY: number = 0,
        regions: Region[] | null = null,
    ) {
        super();
        this.resource = resource ?? null;
        this.divisorX = divisorX;
        this.divisorY = divisorY;
        this.regions = regions;
    }

    getResource(): Key | null {
        return this.resource;
    }

    getDivisorX(): number {
        return this.divisorX;
    }

    getDivisorY(): number {
        return this.divisorY;
    }

    getRegions(): Region[] | null {
        return this.regions;
    }

    override async load(
        root: PackPath,
        textures: ResourcePool<Texture>,
        _textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        const resource = this.resource;
        if (resource === null) return;
        if (this.regions === null || this.regions.length === 0) return;

        await textures.load(resource, {
            load: (key: Key) => this.loadTexture(key, this.getFile(root, key)),
        });
    }

    override async bake(
        textures: ResourcePool<Texture>,
        textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        const resource = this.resource;
        if (resource === null) return;
        if (this.regions === null || this.regions.length === 0) return;

        const texture = textures.get(resource);
        if (texture === null) return;

        const image = texture.getTextureImage();
        if (this.divisorX <= 0) this.divisorX = image.width;
        if (this.divisorY <= 0) this.divisorY = image.height;
        const fX = image.width / this.divisorX;
        const fY = image.height / this.divisorY;

        // upstream: `if (region == null) continue;` — a json-null element becomes a null
        // entry of the LinkedHashSet there, which the Adapter drops on the way in here
        for (const region of this.regions) {
            // upstream never guards `region.sprite`: a region without a "sprite" member
            // walks through the (null-tolerant) HashMap lookups and throws at
            // `ResourcePool#put`'s requireNonNull. The port's pool keys by
            // `Key#getFormatted()`, so it throws a few lines earlier instead
            const sprite = region.getSprite() as Key;
            if (textures.containsKey(sprite)) continue;
            if (!textureFilter(sprite)) continue;

            try {
                const regionImage = getSubimage(
                    image,
                    javaIntCast(region.getX() * fX),
                    javaIntCast(region.getY() * fY),
                    javaIntCast(region.getWidth() * fX),
                    javaIntCast(region.getHeight() * fY),
                );
                textures.put(sprite, Texture.from(sprite, regionImage, texture.getAnimation()));
            } catch (ex) {
                if (!(ex instanceof RasterFormatError)) throw ex;
                logDebug(
                    "Failed to unstitch " +
                        resource +
                        " into " +
                        sprite +
                        " because defined region is out of image-bounds: " +
                        ex,
                );
            }
        }
    }

    /** upstream: {@code equals}/{@code hashCode} — identity only, see {@link Source#equalityKey} */
    override equalityKey(): string {
        return this.identityKey();
    }

    /** upstream: gson's reflective adapter for this class */
    static readonly Adapter: JsonAdapter<UnstitchSource> = {
        read(json: JsonValue): UnstitchSource {
            const object = asObject(json);
            const source = new UnstitchSource();
            Source.readInheritedMembers(source, object);

            const resource = object["resource"];
            if (resource != null) source.resource = ResourcesGson.key.read(resource);

            const divisorX = object["divisor_x"];
            if (divisorX != null) source.divisorX = nextDouble(divisorX);

            const divisorY = object["divisor_y"];
            if (divisorY != null) source.divisorY = nextDouble(divisorY);

            const regions = object["regions"];
            if (regions != null) {
                if (!isJsonArray(regions)) throw new JsonParseError("Expected BEGIN_ARRAY");

                // upstream: a LinkedHashSet — insertion-ordered, structurally de-duplicated
                const byEqualityKey = new Map<string, Region>();
                for (const element of regions) {
                    // upstream keeps a json-null element as a null set-entry and skips it
                    // again in bake(); it is dropped here instead
                    if (element === null) continue;

                    const region = Region.Adapter.read(element);
                    const equalityKey = region.equalityKey();
                    if (!byEqualityKey.has(equalityKey)) byEqualityKey.set(equalityKey, region);
                }
                source.regions = [...byEqualityKey.values()];
            }

            return source;
        },
    };
}
