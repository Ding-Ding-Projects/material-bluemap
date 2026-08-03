import { MatrixM4f } from "@material-bluemap/shared";
import { BlockRendererType } from "../../../../map/hires/block/BlockRendererType.js";
import { ResourcePath } from "../../../ResourcePath.js";
import { AbstractTypeAdapterFactory } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, nextBoolean, nextDouble, type JsonValue } from "../../../adapter/JsonMapper.js";
import type { PostDeserialize } from "../../../adapter/PostDeserialize.js";
import { postDeserialize } from "../../../adapter/PostDeserializeAdapterFactory.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import type { Model } from "../model/Model.js";

/**
 * upstream: {@code ResourcePack.MISSING_BLOCK_MODEL} —
 * {@code new ResourcePath<>("bluemap", "block/missing")}.
 *
 * It lives here until the full {@code ResourcePack} port lands (the Phase C
 * {@code ResourcePack} is a placeholder interface and can not carry statics), and it is a
 * module-level singleton exactly like upstream's {@code static final}: {@link ResourcePath}
 * caches its resolved resource on the instance, so every defaulted {@link Variant} has to
 * share the one path-object.
 */
export const MISSING_BLOCK_MODEL: ResourcePath<Model> = new ResourcePath<Model>(
    "bluemap",
    "block/missing",
);

/** upstream: resources/pack/resourcepack/blockstate/Variant.java */
export class Variant implements PostDeserialize {
    /** upstream field-default: {@code BlockRendererType.DEFAULT} */
    private renderer: BlockRendererType = BlockRendererType.DEFAULT;

    private model: ResourcePath<Model>;
    private x: number;
    private y: number;
    private z: number;
    private uvlock: boolean;
    private weight: number;

    // upstream: transient — java leaves them at false/null until @PostDeserialize runs;
    // here every construction path ends in init(), so they are always assigned
    private transformed!: boolean;
    private transformMatrix!: MatrixM4f;

    constructor();
    constructor(model: ResourcePath<Model>);
    constructor(model: ResourcePath<Model>, x: number, y: number, z: number);
    constructor(
        model: ResourcePath<Model>,
        x: number,
        y: number,
        z: number,
        uvlock: boolean,
        weight: number,
    );
    /**
     * The three public upstream constructors collapse into one defaulted signature: the
     * parameter-defaults below are exactly the upstream field-initializers, so
     * {@code new Variant(model)} and {@code new Variant(model, x, y, z)} leave the same
     * fields untouched they leave untouched upstream. The no-argument form stands in for
     * upstream's private {@code @NoArgsConstructor} (gson's instance-creation).
     */
    constructor(
        model: ResourcePath<Model> = MISSING_BLOCK_MODEL,
        x = 0,
        y = 0,
        z = 0,
        uvlock = false,
        weight = 1,
    ) {
        this.model = model;
        this.x = x;
        this.y = y;
        this.z = z;
        this.uvlock = uvlock;
        this.weight = weight;
        this.init();
    }

    getRenderer(): BlockRendererType {
        return this.renderer;
    }

    setRenderer(renderer: BlockRendererType): void {
        this.renderer = renderer;
    }

    getModel(): ResourcePath<Model> {
        return this.model;
    }

    getX(): number {
        return this.x;
    }

    getY(): number {
        return this.y;
    }

    getZ(): number {
        return this.z;
    }

    isUvlock(): boolean {
        return this.uvlock;
    }

    getWeight(): number {
        return this.weight;
    }

    isTransformed(): boolean {
        return this.transformed;
    }

    getTransformMatrix(): MatrixM4f {
        return this.transformMatrix;
    }

    /** upstream: {@code @PostDeserialize private void init()} */
    private init(): void {
        this.transformed = this.x !== 0 || this.y !== 0 || this.z !== 0;
        this.transformMatrix = new MatrixM4f()
            .translate(-0.5, -0.5, -0.5)
            .rotateYXZ(-this.x, -this.y, -this.z)
            .translate(0.5, 0.5, 0.5);
    }

    /** the {@code @PostDeserialize} hook (upstream: PostDeserializeAdapterFactory) */
    postDeserialize(): void {
        this.init();
    }

    /**
     * Port addition — upstream {@link Variant} carries no {@code @JsonAdapter} and is
     * read by gson's reflective adapter, driven by
     * {@code FieldNamingPolicy.LOWER_CASE_WITH_UNDERSCORES} plus the type-adapters
     * registered on {@code ResourcesGson}. This adapter reads the very same member-names
     * with the very same per-type adapters, keeps the field-defaults for absent members
     * and ignores unknown ones (as the reflective adapter does).
     */
    static readonly Adapter: AbstractTypeAdapterFactory<Variant> =
        new (class Adapter extends AbstractTypeAdapterFactory<Variant> {
            read(json: JsonValue): Variant {
                let renderer = BlockRendererType.DEFAULT;
                let model = MISSING_BLOCK_MODEL;
                let x = 0,
                    y = 0,
                    z = 0;
                let uvlock = false;
                let weight = 1;

                for (const [name, member] of Object.entries(asObject(json))) {
                    switch (name) {
                        case "renderer":
                            renderer = ResourcesGson.blockRendererType.read(member);
                            break;
                        case "model":
                            model = ResourcePath.Adapter.read(member) as ResourcePath<Model>;
                            break;
                        case "x":
                            x = nextDouble(member);
                            break;
                        case "y":
                            y = nextDouble(member);
                            break;
                        case "z":
                            z = nextDouble(member);
                            break;
                        case "uvlock":
                            uvlock = nextBoolean(member);
                            break;
                        case "weight":
                            weight = nextDouble(member);
                            break;
                        default:
                            // unknown member (including "__comment") — gson's reflective
                            // adapter skips it
                            break;
                    }
                }

                const variant = new Variant(model, x, y, z, uvlock, weight);
                variant.setRenderer(renderer);

                // upstream's PostDeserializeAdapterFactory wraps the reflective adapter
                // and invokes init() here; the constructor above already ran it with the
                // same x/y/z, so this recomputes the identical transform
                return postDeserialize(variant);
            }
        })();
}
