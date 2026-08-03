import { MatrixM4f, Vector3f } from "@material-bluemap/shared";
import { EntityRendererType } from "../../../../map/hires/entity/EntityRendererType.js";
import { ResourcePath } from "../../../ResourcePath.js";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, type JsonValue } from "../../../adapter/JsonMapper.js";
import type { PostDeserialize } from "../../../adapter/PostDeserialize.js";
import { postDeserialize } from "../../../adapter/PostDeserializeAdapterFactory.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import type { Model } from "../model/Model.js";

/**
 * upstream: ResourcePack.MISSING_ENTITY_MODEL — declared here (and in model/Face.ts for
 * MISSING_TEXTURE) until the full ResourcePack port lands; the ported ResourcePack is
 * still a Phase C placeholder interface without the key-constants.
 */
const MISSING_ENTITY_MODEL: ResourcePath<Model> = new ResourcePath<Model>(
    "bluemap",
    "entity/missing",
);

/** upstream: entitystate/Part.java */
export class Part implements PostDeserialize {
    private renderer: EntityRendererType = EntityRendererType.DEFAULT;

    private model: ResourcePath<Model> = MISSING_ENTITY_MODEL;
    private position: Vector3f = Vector3f.ZERO;
    private rotation: Vector3f = Vector3f.ZERO;

    private transformed: boolean = false;
    /** upstream: {@code private transient MatrixM4f transformMatrix} — null until {@link init} runs */
    private transformMatrix: MatrixM4f | null = null;

    /** upstream: the private no-args constructor gson instantiates with */
    constructor();
    constructor(model: ResourcePath<Model>);
    constructor(model: ResourcePath<Model>, position: Vector3f, rotation: Vector3f);
    constructor(model?: ResourcePath<Model>, position?: Vector3f, rotation?: Vector3f) {
        if (model === undefined) return;

        this.model = model;
        if (position !== undefined) this.position = position;
        if (rotation !== undefined) this.rotation = rotation;
        this.init();
    }

    /** upstream: the {@code @PostDeserialize}-annotated {@code init()} */
    postDeserialize(): void {
        this.init();
    }

    private init(): void {
        this.transformed =
            !this.position.equals(Vector3f.ZERO) || !this.rotation.equals(Vector3f.ZERO);
        this.transformMatrix = new MatrixM4f()
            .rotateYXZ(-this.rotation.getX(), -this.rotation.getY(), -this.rotation.getZ())
            .translate(this.position.getX(), this.position.getY(), this.position.getZ());
    }

    getRenderer(): EntityRendererType {
        return this.renderer;
    }

    /** upstream: the lombok {@code @Setter} on the renderer field */
    setRenderer(renderer: EntityRendererType): void {
        this.renderer = renderer;
    }

    getModel(): ResourcePath<Model> {
        return this.model;
    }

    getPosition(): Vector3f {
        return this.position;
    }

    getRotation(): Vector3f {
        return this.rotation;
    }

    isTransformed(): boolean {
        return this.transformed;
    }

    getTransformMatrix(): MatrixM4f | null {
        return this.transformMatrix;
    }

    /**
     * Port addition: upstream leaves Part to gson's reflective adapter (wrapped by the
     * PostDeserializeAdapterFactory); this reads the same members explicitly and applies
     * the same post-deserialize hook.
     */
    static readonly Adapter: JsonAdapter<Part> = {
        read(json: JsonValue): Part {
            const object = asObject(json);
            const part = new Part();

            const renderer = object["renderer"];
            if (renderer != null) part.renderer = ResourcesGson.entityRendererType.read(renderer);

            const model = object["model"];
            if (model != null) part.model = ResourcePath.Adapter.read(model) as ResourcePath<Model>;

            const position = object["position"];
            if (position != null) part.position = ResourcesGson.vector3f.read(position);

            const rotation = object["rotation"];
            if (rotation != null) part.rotation = ResourcesGson.vector3f.read(rotation);

            return postDeserialize(part);
        },
    };
}
