import { Color, Key, type Keyed } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    asObject,
    nextBoolean,
    nextString,
    type JsonObject,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import { BufferedImageUtil } from "../../../../util/BufferedImageUtil.js";
import { AnimationMeta } from "./AnimationMeta.js";

const TEXTURE_STRING_PREFIX = "data:image/png;base64,";

/**
 * upstream: texture/Texture.java — both the in-memory texture and the serialization
 * model of the map's {@code textures.json}.
 *
 * Two port-notes:
 * - java.awt's BufferedImage becomes pngjs' PNG (see util/BufferedImageUtil).
 * - upstream caches the decoded image in a {@code SoftReference}; JS has no
 *   soft-reference, so a {@link WeakRef} is used: the base64 string is always retained,
 *   so a collected image is simply decoded again on the next {@link getTextureImage}
 *   call — exactly the upstream behaviour, only with a more eager collector.
 */
export class Texture implements Keyed {
    static readonly MISSING: Texture = new Texture(
        new Key("bluemap", "missing"),
        new Color().set(0.5, 0, 0.5, 1.0, false),
        false,
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPklEQVR4Xu3MsQkAMAwDQe2/tFPnBB4gpLhG8MpkZpNkZ6AKZKAKZKAKZKAKZKAKZKAKZKAKWg0XD/UPnjg4MbX+EDdeTUwAAAAASUVORK5CYII=",
        null,
        null,
    );

    /** upstream: {@code @SerializedName("resourcePath") private Key key} */
    private key: Key;

    private color: Color;
    private halfTransparent: boolean;
    private texture: string;
    private animation: AnimationMeta | null;

    private colorPremultiplied: Color | null = null;
    private textureImage: WeakRef<PNG> | null = null;

    private constructor();
    private constructor(key: Key);
    private constructor(
        key: Key,
        color: Color,
        halfTransparent: boolean,
        texture: string,
        animation: AnimationMeta | null,
        textureImage: PNG | null,
    );
    private constructor(
        key?: Key,
        color?: Color,
        halfTransparent?: boolean,
        texture?: string,
        animation?: AnimationMeta | null,
        textureImage?: PNG | null,
    ) {
        if (key === undefined) {
            // upstream: the private no-args constructor gson instantiates with
            this.key = Texture.MISSING.key;
            this.color = Texture.MISSING.color;
            this.halfTransparent = false;
            this.texture = Texture.MISSING.texture;
            this.animation = null;
            return;
        }

        if (color === undefined) {
            // upstream: Texture(Key) — the "missing" placeholder for a known path
            this.key = key;
            this.color = Texture.MISSING.color;
            this.halfTransparent = Texture.MISSING.halfTransparent;
            this.texture = Texture.MISSING.texture;
            this.animation = null;
            return;
        }

        this.key = key;
        this.color = color.straight();
        this.halfTransparent = halfTransparent as boolean;
        this.texture = texture as string;
        this.animation = animation as AnimationMeta | null;
        this.textureImage = textureImage == null ? null : new WeakRef(textureImage);
    }

    getKey(): Key {
        return this.key;
    }

    getColorStraight(): Color {
        return this.color;
    }

    isHalfTransparent(): boolean {
        return this.halfTransparent;
    }

    getColorPremultiplied(): Color {
        // upstream also guards `color != null` (gson can leave the field unset); every
        // construction-path in this port assigns it
        if (this.colorPremultiplied == null) {
            this.colorPremultiplied = new Color().set(this.color).premultiplied();
        }

        return this.colorPremultiplied;
    }

    getTexture(): string {
        return this.texture;
    }

    getTextureImage(): PNG {
        const cached = this.textureImage?.deref();
        if (cached != null) return cached;

        if (!this.texture.startsWith(TEXTURE_STRING_PREFIX))
            throw new Error("Texture-string is not in the expected format.");
        const imageData = Buffer.from(
            this.texture.substring(TEXTURE_STRING_PREFIX.length),
            "base64",
        );
        const image = PNG.sync.read(imageData);

        this.textureImage = new WeakRef(image);
        return image;
    }

    getAnimation(): AnimationMeta | null {
        return this.animation;
    }

    static from(resourcePath: Key, image: PNG): Texture;
    static from(resourcePath: Key, image: PNG, animation: AnimationMeta | null): Texture;
    static from(resourcePath: Key, image: PNG, animation: AnimationMeta | null = null): Texture {
        //check halfTransparency
        const halfTransparent = BufferedImageUtil.halfTransparent(image);

        //calculate color
        const color = BufferedImageUtil.averageColor(image);

        //write to Base64
        const base64 = TEXTURE_STRING_PREFIX + PNG.sync.write(image).toString("base64");

        return new Texture(resourcePath, color, halfTransparent, base64, animation, image);
    }

    static missing(resourcePath: Key): Texture {
        return new Texture(resourcePath);
    }

    /**
     * Port addition: upstream leaves Texture to gson's reflective adapter. The only
     * gson instance that (de)serializes a Texture is map/TextureGallery's, which uses
     * {@code FieldNamingPolicy.IDENTITY} — so the member-names are the field-names, with
     * {@code key} serialized as "resourcePath" per its {@code @SerializedName}.
     *
     * Note the animation round-trip: {@code write} emits what gson's reflective adapter
     * emits (the AnimationMeta fields, no "animation" wrapper) while {@code read} goes
     * through {@code AnimationMeta.Adapter}, which only looks for an "animation" member
     * — so a written animation reads back as the AnimationMeta defaults. Kept
     * bug-for-bug.
     */
    static readonly Adapter: Required<JsonAdapter<Texture>> = {
        read(json: JsonValue): Texture {
            const object = asObject(json);
            const texture = new Texture();

            const key = object["resourcePath"];
            if (key != null) texture.key = ResourcesGson.key.read(key);

            const color = object["color"];
            if (color != null) texture.color = ResourcesGson.color.read(color);

            const halfTransparent = object["halfTransparent"];
            if (halfTransparent != null) texture.halfTransparent = nextBoolean(halfTransparent);

            const textureString = object["texture"];
            if (textureString != null) texture.texture = nextString(textureString);

            const animation = object["animation"];
            if (animation != null) texture.animation = AnimationMeta.Adapter.read(animation);

            return texture;
        },

        write(value: Texture): JsonValue {
            const json: JsonObject = {
                resourcePath: ResourcesGson.key.write(value.key),
                color: ResourcesGson.color.write(value.color),
                halfTransparent: value.halfTransparent,
                texture: value.texture,
            };
            // gson's reflective adapter omits null fields
            if (value.animation != null)
                json["animation"] = AnimationMeta.Adapter.write(value.animation);
            return json;
        },
    };
}
