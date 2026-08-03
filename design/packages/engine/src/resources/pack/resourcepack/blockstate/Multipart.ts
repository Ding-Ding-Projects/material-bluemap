import type { BlockState } from "../../../../world/BlockState.js";
import { AbstractTypeAdapterFactory } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    asObject,
    isJsonArray,
    JsonParseError,
    nextString,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";
import { BlockStateCondition } from "./BlockStateCondition.js";
import type { Variant } from "./Variant.js";
import { VariantSet } from "./VariantSet.js";

/**
 * Java {@code String#split("\\|")}: a literal-pipe split whose trailing empty strings are
 * removed, except that splitting the empty string yields {@code [""]}.
 */
function javaSplitPipe(s: string): string[] {
    if (s === "") return [""];
    const parts = s.split("|");
    while (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
    return parts;
}

/** upstream: resources/pack/resourcepack/blockstate/Multipart.java */
export class Multipart {
    private parts: VariantSet[];

    /** upstream: {@code @AllArgsConstructor} / the private {@code @NoArgsConstructor} */
    constructor(parts: VariantSet[] = []) {
        this.parts = parts;
    }

    getParts(): VariantSet[] {
        return this.parts;
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
            for (const part of this.parts) {
                part.forEach(a);
            }
            return;
        }

        const blockState = a,
            x = b as number,
            y = c as number,
            z = d as number,
            consumer = e as (variant: Variant) => void;

        // note: every matching part is emitted — there is no early return here, so all of
        // them roll the same coordinate-hash against their own totalWeight
        for (const part of this.parts) {
            if (part.getCondition().matches(blockState)) {
                part.forEach(x, y, z, consumer);
            }
        }
    }

    /** upstream: Multipart.Adapter */
    static readonly Adapter: AbstractTypeAdapterFactory<Multipart> =
        new (class Adapter extends AbstractTypeAdapterFactory<Multipart> {
            read(json: JsonValue): Multipart {
                const parts: VariantSet[] = [];

                if (!isJsonArray(json)) throw new JsonParseError("Expected BEGIN_ARRAY");
                for (const element of json) {
                    let variantSet: VariantSet | null = null;
                    let condition: BlockStateCondition | null = null;

                    for (const [key, member] of Object.entries(asObject(element))) {
                        switch (key) {
                            case "when":
                                condition = this.readCondition(member);
                                break;
                            case "apply":
                                variantSet = VariantSet.Adapter.read(member);
                                break;
                            default:
                                // in.skipValue()
                                break;
                        }
                    }

                    if (variantSet === null) continue;
                    if (condition !== null) variantSet.setCondition(condition);
                    parts.push(variantSet);
                }

                return new Multipart(parts);
            }

            readCondition(json: JsonValue): BlockStateCondition {
                const andConditions: BlockStateCondition[] = [];
                for (const [name, member] of Object.entries(asObject(json))) {
                    switch (name) {
                        case Adapter.JSON_COMMENT:
                            // in.skipValue()
                            break;
                        case "OR": {
                            const orConditions: BlockStateCondition[] = [];
                            if (!isJsonArray(member))
                                throw new JsonParseError("Expected BEGIN_ARRAY");
                            for (const orElement of member) {
                                orConditions.push(this.readCondition(orElement));
                            }
                            andConditions.push(BlockStateCondition.or(...orConditions));
                            break;
                        }
                        case "AND": {
                            const andArray: BlockStateCondition[] = [];
                            if (!isJsonArray(member))
                                throw new JsonParseError("Expected BEGIN_ARRAY");
                            for (const andElement of member) {
                                andArray.push(this.readCondition(andElement));
                            }
                            andConditions.push(BlockStateCondition.and(...andArray));
                            break;
                        }
                        default: {
                            const values = javaSplitPipe(this.nextStringOrBoolean(member));
                            andConditions.push(BlockStateCondition.property(name, ...values));
                            break;
                        }
                    }
                }

                return BlockStateCondition.and(...andConditions);
            }

            private nextStringOrBoolean(json: JsonValue): string {
                if (typeof json === "boolean") return String(json);
                return nextString(json);
            }
        })();
}
