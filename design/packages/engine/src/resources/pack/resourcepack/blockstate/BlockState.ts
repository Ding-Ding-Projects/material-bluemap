import type { BlockState as WorldBlockState } from "../../../../world/BlockState.js";
import { AbstractTypeAdapterFactory } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, type JsonValue } from "../../../adapter/JsonMapper.js";
import { Multipart } from "./Multipart.js";
import type { Variant } from "./Variant.js";
import { Variants } from "./Variants.js";

/**
 * upstream: resources/pack/resourcepack/blockstate/BlockState.java
 *
 * The resource-pack's blockstate-file model — a thin either-or wrapper around
 * {@link Variants} and {@link Multipart}. It is a *different type* from
 * {@code de.bluecolored.bluemap.core.world.BlockState} (ported at world/BlockState.ts),
 * which is the world's block-id + properties value and is referenced here as
 * {@code WorldBlockState}.
 */
export class BlockState {
    private variants: Variants | null;
    private multipart: Multipart | null;

    constructor();
    constructor(variants: Variants);
    constructor(multipart: Multipart);
    /**
     * The gson field-assignment path: upstream's reflective adapter writes both private
     * fields independently, so a blockstate-json carrying both members produces an object
     * neither public constructor can build.
     */
    constructor(variants: Variants | null, multipart: Multipart | null);
    constructor(a?: Variants | Multipart | null, b?: Multipart | null) {
        if (b !== undefined) {
            this.variants = (a as Variants | null) ?? null;
            this.multipart = b;
            return;
        }

        this.variants = a instanceof Variants ? a : null;
        this.multipart = a instanceof Multipart ? a : null;
    }

    getVariants(): Variants | null {
        return this.variants;
    }

    getMultipart(): Multipart | null {
        return this.multipart;
    }

    forEach(consumer: (variant: Variant) => void): void;
    forEach(
        blockState: WorldBlockState,
        x: number,
        y: number,
        z: number,
        consumer: (variant: Variant) => void,
    ): void;
    forEach(
        a: ((variant: Variant) => void) | WorldBlockState,
        b?: number,
        c?: number,
        d?: number,
        e?: (variant: Variant) => void,
    ): void {
        if (typeof a === "function") {
            if (this.variants !== null) this.variants.forEach(a);
            if (this.multipart !== null) this.multipart.forEach(a);
            return;
        }

        const blockState = a,
            x = b as number,
            y = c as number,
            z = d as number,
            consumer = e as (variant: Variant) => void;

        if (this.variants !== null) this.variants.forEach(blockState, x, y, z, consumer);
        if (this.multipart !== null) this.multipart.forEach(blockState, x, y, z, consumer);
    }

    /**
     * Port addition — upstream {@link BlockState} carries no {@code @JsonAdapter} and is
     * read by gson's reflective adapter, which resolves the {@code variants} member
     * through {@code Variants.Adapter} and the {@code multipart} member through
     * {@code Multipart.Adapter}. This adapter reads the same two member-names, leaves an
     * absent member {@code null} and ignores unknown members.
     */
    static readonly Adapter: AbstractTypeAdapterFactory<BlockState> =
        new (class Adapter extends AbstractTypeAdapterFactory<BlockState> {
            read(json: JsonValue): BlockState {
                let variants: Variants | null = null;
                let multipart: Multipart | null = null;

                for (const [name, member] of Object.entries(asObject(json))) {
                    switch (name) {
                        case "variants":
                            variants = Variants.Adapter.read(member);
                            break;
                        case "multipart":
                            multipart = Multipart.Adapter.read(member);
                            break;
                        default:
                            // unknown member (including "__comment")
                            break;
                    }
                }

                return new BlockState(variants, multipart);
            }
        })();
}
