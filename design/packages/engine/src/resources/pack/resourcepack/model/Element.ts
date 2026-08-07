import { Vector3f, Vector4f } from "@worldlens/shared";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, nextBoolean, nextInt, type JsonValue } from "../../../adapter/JsonMapper.js";
import { postDeserialize } from "../../../adapter/PostDeserializeAdapterFactory.js";
import type { PostDeserialize } from "../../../adapter/PostDeserialize.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import { Direction } from "../../../../util/Direction.js";
import type { Texture } from "../texture/Texture.js";
import { Face } from "./Face.js";
import type { ResourcePool } from "./Model.js";
import { Rotation } from "./Rotation.js";

/**
 * upstream: model/Element.java
 *
 * The {@code EnumMap<Direction, Face>} becomes a plain Map that is always filled in
 * {@code Direction.values()} order, so it iterates like the upstream EnumMap
 * (see adapter/EnumMapInstanceCreator).
 */
export class Element implements PostDeserialize {
    private static readonly FULL_BLOCK_MIN: Vector3f = Vector3f.ZERO;
    private static readonly FULL_BLOCK_MAX: Vector3f = new Vector3f(16, 16, 16);

    private from: Vector3f = Element.FULL_BLOCK_MIN;
    private to: Vector3f = Element.FULL_BLOCK_MAX;
    private rotation: Rotation = Rotation.ZERO;
    private shade: boolean = true;
    private lightEmission: number = 0;
    private faces: Map<Direction, Face> = new Map<Direction, Face>();

    /** upstream: the private no-args constructor gson instantiates with */
    constructor();
    constructor(from: Vector3f, to: Vector3f, faces: Map<Direction, Face>);
    constructor(from: Vector3f, to: Vector3f, rotation: Rotation, faces: Map<Direction, Face>);
    constructor(
        from: Vector3f,
        to: Vector3f,
        rotation: Rotation,
        shade: boolean,
        lightEmission: number,
        faces: Map<Direction, Face>,
    );
    constructor(
        from?: Vector3f,
        to?: Vector3f,
        c?: Rotation | Map<Direction, Face>,
        d?: Map<Direction, Face> | boolean,
        lightEmission?: number,
        f?: Map<Direction, Face>,
    ) {
        if (from === undefined) return;

        this.from = from;
        this.to = to as Vector3f;

        if (c instanceof Rotation) {
            this.rotation = c;
            if (typeof d === "boolean") {
                this.shade = d;
                this.lightEmission = lightEmission as number;
                this.putAllFaces(f as Map<Direction, Face>);
            } else {
                this.putAllFaces(d as Map<Direction, Face>);
            }
        } else {
            this.putAllFaces(c as Map<Direction, Face>);
        }

        this.init();
    }

    /** upstream: {@code this.faces.putAll(faces)} into an EnumMap */
    private putAllFaces(faces: Map<Direction, Face>): void {
        for (const direction of Direction.values()) {
            const face = faces.get(direction);
            if (face !== undefined) this.faces.set(direction, face);
        }
    }

    /** upstream: the {@code @PostDeserialize}-annotated {@code init()} */
    postDeserialize(): void {
        this.init();
    }

    private init(): void {
        this.faces.forEach((face, direction) =>
            face.init(direction, (dir) => this.calculateDefaultUV(dir)),
        );
    }

    private calculateDefaultUV(face: Direction): Vector4f {
        switch (face) {
            case Direction.UP:
                return new Vector4f(
                    this.from.getX(),
                    this.from.getZ(),
                    this.to.getX(),
                    this.to.getZ(),
                );
            case Direction.DOWN:
                return new Vector4f(
                    this.from.getX(),
                    16 - this.to.getZ(),
                    this.to.getX(),
                    16 - this.from.getZ(),
                );
            case Direction.NORTH:
                return new Vector4f(
                    16 - this.to.getX(),
                    16 - this.to.getY(),
                    16 - this.from.getX(),
                    16 - this.from.getY(),
                );
            case Direction.SOUTH:
                return new Vector4f(
                    this.from.getX(),
                    16 - this.to.getY(),
                    this.to.getX(),
                    16 - this.from.getY(),
                );
            case Direction.EAST:
                return new Vector4f(
                    16 - this.to.getZ(),
                    16 - this.to.getY(),
                    16 - this.from.getZ(),
                    16 - this.from.getY(),
                );
            case Direction.WEST:
                return new Vector4f(
                    this.from.getZ(),
                    16 - this.to.getY(),
                    this.to.getZ(),
                    16 - this.from.getY(),
                );
            default:
                // upstream's switch-expression is exhaustive over the Direction enum
                throw new Error("No enum constant Direction." + String(face));
        }
    }

    getFrom(): Vector3f {
        return this.from;
    }

    getTo(): Vector3f {
        return this.to;
    }

    getRotation(): Rotation {
        return this.rotation;
    }

    isShade(): boolean {
        return this.shade;
    }

    getLightEmission(): number {
        return this.lightEmission;
    }

    getFaces(): Map<Direction, Face> {
        return this.faces;
    }

    copy(): Element {
        // upstream: the private copy-constructor Element(Element) — it does not re-run
        // init(), the copied faces carry the already-calculated uv over
        const copy = new Element();
        copy.from = this.from;
        copy.to = this.to;
        copy.rotation = this.rotation;
        copy.shade = this.shade;
        copy.lightEmission = this.lightEmission;

        this.faces.forEach((face, direction) => copy.faces.set(direction, face.copy()));
        return copy;
    }

    /** upstream: package-private {@code boolean isFullCube()} */
    isFullCube(): boolean {
        if (!(Element.FULL_BLOCK_MIN.equals(this.from) && Element.FULL_BLOCK_MAX.equals(this.to)))
            return false;
        for (const dir of Direction.values()) {
            if (!this.faces.has(dir)) return false;
        }
        return true;
    }

    optimize(texturePool: ResourcePool<Texture>): void {
        for (const face of this.faces.values()) {
            face.optimize(texturePool);
        }
    }

    /**
     * Port addition: upstream leaves Element to gson's reflective adapter (member-names
     * follow {@code FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES}, so
     * {@code lightEmission} reads {@code light_emission}); this reads the same members
     * explicitly and applies the same post-deserialize hook.
     */
    static readonly Adapter: JsonAdapter<Element> = {
        read(json: JsonValue): Element {
            const object = asObject(json);
            const element = new Element();

            const from = object["from"];
            if (from != null) element.from = ResourcesGson.vector3f.read(from);

            const to = object["to"];
            if (to != null) element.to = ResourcesGson.vector3f.read(to);

            const rotation = object["rotation"];
            if (rotation != null) element.rotation = Rotation.Adapter.read(rotation);

            const shade = object["shade"];
            if (shade != null) element.shade = nextBoolean(shade);

            const lightEmission = object["light_emission"];
            if (lightEmission != null) element.lightEmission = nextInt(lightEmission);

            const faces = object["faces"];
            if (faces != null) {
                const facesObject = asObject(faces);
                const parsed = new Map<Direction, Face>();
                for (const [name, faceJson] of Object.entries(facesObject)) {
                    parsed.set(ResourcesGson.direction.read(name), Face.Adapter.read(faceJson));
                }
                element.putAllFaces(parsed);
            }

            return postDeserialize(element);
        },
    };
}
