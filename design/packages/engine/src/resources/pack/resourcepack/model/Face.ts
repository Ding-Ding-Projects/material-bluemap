import { Vector4f } from "@worldlens/shared";
import { ResourcePath } from "../../../ResourcePath.js";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, nextInt, type JsonValue } from "../../../adapter/JsonMapper.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import type { Direction } from "../../../../util/Direction.js";
import type { Texture } from "../texture/Texture.js";
import type { ResourcePool } from "./Model.js";
import { TextureVariable } from "./TextureVariable.js";

/**
 * upstream: ResourcePack.MISSING_TEXTURE — declared here (and in Part.ts for
 * MISSING_ENTITY_MODEL) until the full ResourcePack port lands; the ported
 * ResourcePack is still a Phase C placeholder interface without the key-constants.
 */
const MISSING_TEXTURE: ResourcePath<Texture> = new ResourcePath<Texture>(
    "bluemap",
    "block/missing",
);

const DEFAULT_TEXTURE: TextureVariable = new TextureVariable(MISSING_TEXTURE);

/** upstream: model/Face.java */
export class Face {
    private uv: Vector4f | null = null;
    private texture: TextureVariable = DEFAULT_TEXTURE;
    private cullface: Direction | null = null;
    private rotation: number = 0;
    private tintindex: number = -1;

    /** upstream: the private no-args constructor gson instantiates with */
    constructor();
    constructor(texture: TextureVariable);
    constructor(uv: Vector4f, texture: TextureVariable);
    constructor(uv: Vector4f, texture: TextureVariable, cullface: Direction | null);
    /** upstream: the lombok {@code @AllArgsConstructor} */
    constructor(
        uv: Vector4f | null,
        texture: TextureVariable,
        cullface: Direction | null,
        rotation: number,
        tintindex: number,
    );
    constructor(
        a?: TextureVariable | Vector4f | null,
        b?: TextureVariable,
        c?: Direction | null,
        d?: number,
        e?: number,
    ) {
        if (a === undefined) return;

        if (a instanceof TextureVariable) {
            this.texture = a;
            return;
        }

        this.uv = a;
        this.texture = b as TextureVariable;
        if (c !== undefined) this.cullface = c;
        if (d !== undefined) this.rotation = d;
        if (e !== undefined) this.tintindex = e;
    }

    /** upstream: package-private {@code void init(Direction, Function<Direction, Vector4f>)} */
    init(direction: Direction, defaultUvCalculator: (direction: Direction) => Vector4f): void {
        if (this.uv == null) this.uv = defaultUvCalculator(direction);
    }

    getUv(): Vector4f | null {
        return this.uv;
    }

    getTexture(): TextureVariable {
        return this.texture;
    }

    getCullface(): Direction | null {
        return this.cullface;
    }

    getRotation(): number {
        return this.rotation;
    }

    getTintindex(): number {
        return this.tintindex;
    }

    copy(): Face {
        // upstream: the private copy-constructor Face(Face)
        return new Face(this.uv, this.texture.copy(), this.cullface, this.rotation, this.tintindex);
    }

    optimize(texturePool: ResourcePool<Texture>): void {
        this.texture.optimize(texturePool);
    }

    /**
     * Port addition: upstream leaves Face to gson's reflective adapter (member-names
     * follow {@code FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES}); this reads the
     * same members explicitly.
     */
    static readonly Adapter: JsonAdapter<Face> = {
        read(json: JsonValue): Face {
            const object = asObject(json);

            const uv = object["uv"];
            const texture = object["texture"];
            const cullface = object["cullface"];
            const rotation = object["rotation"];
            const tintindex = object["tintindex"];

            return new Face(
                uv == null ? null : ResourcesGson.vector4f.read(uv),
                texture == null ? DEFAULT_TEXTURE : TextureVariable.Adapter.read(texture),
                cullface == null ? null : ResourcesGson.direction.read(cullface),
                rotation == null ? 0 : nextInt(rotation),
                tintindex == null ? -1 : nextInt(tintindex),
            );
        },
    };
}
