import type { BlockState } from "../../../../world/BlockState.js";
import { logDebug } from "../../../../world/mca/MCAUtil.js";
import { AbstractTypeAdapterFactory } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, type JsonValue } from "../../../adapter/JsonMapper.js";
import { BlockStateCondition } from "./BlockStateCondition.js";
import type { Variant } from "./Variant.js";
import { VariantSet } from "./VariantSet.js";

/**
 * Java {@code String#split(regex)}: trailing empty strings are removed from the result,
 * except that splitting the empty string yields {@code [""]}.
 */
function javaSplit(s: string, separator: string): string[] {
    if (s === "") return [""];
    const parts = s.split(separator);
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return parts;
}

/**
 * Java {@code String#split("=", 2)}: at most one split, and a non-zero limit keeps
 * trailing empty strings (so {@code "facing="} yields two elements, not one).
 */
function javaSplitKeyValue(s: string): string[] {
    const separator = s.indexOf("=");
    if (separator < 0) return [s];
    return [s.substring(0, separator), s.substring(separator + 1)];
}

/** upstream: resources/pack/resourcepack/blockstate/Variants.java */
export class Variants {
    private variants: VariantSet[];
    private defaultVariant: VariantSet | null;

    /** upstream: {@code @AllArgsConstructor} / the private {@code @NoArgsConstructor} */
    constructor(variants: VariantSet[] = [], defaultVariant: VariantSet | null = null) {
        this.variants = variants;
        this.defaultVariant = defaultVariant;
    }

    getVariants(): VariantSet[] {
        return this.variants;
    }

    getDefaultVariant(): VariantSet | null {
        return this.defaultVariant;
    }

    forEach(consumer: (variant: Variant) => void): void;
    forEach(
        blockState: BlockState,
        x: number,
        y: number,
        z: number,
        consumer: (variant: Variant) => void,
    ): void;
    forEach(
        a: ((variant: Variant) => void) | BlockState,
        b?: number,
        c?: number,
        d?: number,
        e?: (variant: Variant) => void,
    ): void {
        if (typeof a === "function") {
            for (const variant of this.variants) {
                variant.forEach(a);
            }

            if (this.defaultVariant !== null) this.defaultVariant.forEach(a);
            return;
        }

        const blockState = a,
            x = b as number,
            y = c as number,
            z = d as number,
            consumer = e as (variant: Variant) => void;

        for (const variant of this.variants) {
            if (variant.getCondition().matches(blockState)) {
                variant.forEach(x, y, z, consumer);
                return;
            }
        }

        // still here? do default
        if (this.defaultVariant !== null) {
            this.defaultVariant.forEach(x, y, z, consumer);
        }
    }

    /** upstream: Variants.Adapter */
    static readonly Adapter: AbstractTypeAdapterFactory<Variants> =
        new (class Adapter extends AbstractTypeAdapterFactory<Variants> {
            read(json: JsonValue): Variants {
                let defaultVariant: VariantSet | null = null;
                const variants: VariantSet[] = [];

                for (const [name, member] of Object.entries(asObject(json))) {
                    if (name === Adapter.JSON_COMMENT) {
                        continue;
                    }

                    const condition = this.parseConditionString(name);
                    const variantSet = VariantSet.Adapter.read(member);
                    variantSet.setCondition(condition);

                    // reference identity, exactly like upstream's `==` against the
                    // interned all()/none() singletons
                    if (variantSet.getCondition() === BlockStateCondition.all()) {
                        defaultVariant = variantSet;
                    } else if (variantSet.getCondition() !== BlockStateCondition.none()) {
                        variants.push(variantSet);
                    }
                }

                // upstream assigns the two private fields on a no-args instance; the
                // all-args constructor is the same assignment
                return new Variants(variants, defaultVariant);
            }

            private parseConditionString(conditionString: string): BlockStateCondition {
                const conditions: BlockStateCondition[] = [];
                let invalid = false;
                if (
                    conditionString !== "" &&
                    conditionString !== "default" &&
                    conditionString !== "normal"
                ) {
                    const conditionSplit = javaSplit(conditionString, ",");
                    for (const element of conditionSplit) {
                        const keyval = javaSplitKeyValue(element);
                        if (keyval.length < 2) {
                            logDebug(
                                "Failed to parse condition: Condition-String '" +
                                    conditionString +
                                    "' is invalid!",
                            );
                            invalid = true;
                            continue;
                        }
                        conditions.push(BlockStateCondition.property(keyval[0]!, keyval[1]!));
                    }
                }

                let condition: BlockStateCondition;
                if (conditions.length === 0) {
                    condition = invalid ? BlockStateCondition.none() : BlockStateCondition.all();
                } else if (conditions.length === 1) {
                    condition = conditions[0]!;
                } else {
                    condition = BlockStateCondition.and(...conditions);
                }

                return condition;
            }
        })();
}
