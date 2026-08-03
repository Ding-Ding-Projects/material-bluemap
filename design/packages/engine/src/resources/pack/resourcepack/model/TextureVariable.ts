import { ResourcePath } from "../../../ResourcePath.js";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    JsonParseError,
    isJsonObject,
    nextString,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";
import type { Texture } from "../texture/Texture.js";
import type { ResourcePool } from "./Model.js";

/**
 * upstream: model/TextureVariable.java
 *
 * Two port-notes:
 * - upstream carries the fields {@code isReference} / {@code isResolving} next to the
 *   method {@code isReference()}; a TS class cannot hold a field and a method of the
 *   same name, so the fields are named {@code reference} / {@code resolving}.
 * - every {@code synchronized (TextureVariable.class)} block (a global lock shared by
 *   all instances) is a no-op in single-threaded TS and is kept only as a comment.
 */
export class TextureVariable {
    private referenceName: string | null;
    private texturePath: ResourcePath<Texture> | null;

    private reference: boolean;
    private resolving: boolean;

    constructor(referenceName: string);
    constructor(texturePath: ResourcePath<Texture>);
    constructor(value: string | ResourcePath<Texture>) {
        if (typeof value === "string") {
            this.referenceName = value;
            this.texturePath = null;
            this.reference = true;
            this.resolving = false;
        } else {
            this.referenceName = null;
            this.texturePath = value;
            this.reference = false;
            this.resolving = false;
        }
    }

    getReferenceName(): string | null {
        return this.referenceName;
    }

    /** upstream: the lombok {@code @Getter} for the {@code texturePath} field */
    getTexturePath(): ResourcePath<Texture> | null;
    getTexturePath(
        supplier: (referenceName: string) => TextureVariable | null,
    ): ResourcePath<Texture> | null;
    getTexturePath(
        supplier?: (referenceName: string) => TextureVariable | null,
    ): ResourcePath<Texture> | null {
        if (supplier === undefined) return this.texturePath;

        if (this.reference) return this.resolveTexturePath(supplier);
        return this.texturePath;
    }

    private resolveTexturePath(
        supplier: (referenceName: string) => TextureVariable | null,
    ): ResourcePath<Texture> | null {
        // upstream: synchronized (TextureVariable.class)
        if (this.reference && !this.resolving) {
            this.resolving = true; // set to avoid trying to resolve reference-loops

            // resolve
            const referenced = supplier(this.referenceName as string);
            if (referenced != null) {
                this.texturePath = referenced.getTexturePath(supplier);
            }

            this.reference = false;
            this.resolving = false;
        }
        return this.texturePath;
    }

    isReference(): boolean {
        return this.reference;
    }

    copy(): TextureVariable {
        // upstream: synchronized (TextureVariable.class), calling the private
        // copy-constructor. TS has no private constructor-overload, so a fresh instance
        // is field-copied instead.
        const copy = new TextureVariable("");
        copy.referenceName = this.referenceName;
        copy.texturePath = this.texturePath;
        copy.reference = this.reference;
        copy.resolving = this.resolving;
        return copy;
    }

    optimize(texturePool: ResourcePool<Texture>): void {
        // upstream: synchronized (TextureVariable.class)
        if (this.texturePath != null) {
            this.texturePath.getResource((key) => texturePool.get(key));
        }
    }

    /** upstream: TextureVariable.Adapter */
    static readonly Adapter: JsonAdapter<TextureVariable> = {
        write(): JsonValue {
            throw new Error("UnsupportedOperationException");
        },

        read(json: JsonValue): TextureVariable {
            let result: TextureVariable | null = null;

            if (typeof json === "string") {
                result = fromString(nextString(json));
            } else if (isJsonObject(json)) {
                for (const [key, value] of Object.entries(json)) {
                    if (key === "sprite") result = fromString(nextString(value));
                    // upstream: default -> in.skipValue()
                }
            } else {
                throw new JsonParseError(
                    "Failed ot parse TextureVariable: Expected STRING or OBJECT but got " +
                        tokenName(json),
                );
            }

            if (result == null)
                throw new JsonParseError("Failed ot parse TextureVariable: No sprite provided");
            return result;
        },
    };
}

/** upstream: TextureVariable.Adapter#fromString */
function fromString(value: string): TextureVariable {
    if (value.length === 0)
        throw new JsonParseError("Can't parse an empty String into a TextureVariable");

    if (value.charAt(0) === "#") {
        return new TextureVariable(value.substring(1));
    } else {
        // if the value contains neither a : nor a / it is safe to assume it was meant to be a reference
        // as there is no texture at root-level in the implicit "minecraft" namespace
        if (!(value.includes(":") || value.includes("/"))) {
            return new TextureVariable(value);
        }

        return new TextureVariable(new ResourcePath<Texture>(value));
    }
}

/** the {@code JsonToken} name gson would report for the given value */
function tokenName(json: JsonValue): string {
    if (json === null) return "NULL";
    if (Array.isArray(json)) return "BEGIN_ARRAY";
    switch (typeof json) {
        case "boolean":
            return "BOOLEAN";
        case "number":
            return "NUMBER";
        default:
            return "BEGIN_OBJECT";
    }
}
