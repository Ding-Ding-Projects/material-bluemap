import type { Key } from "@worldlens/shared";
import { ResourcePath } from "../../../ResourcePath.js";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asArray, asObject, nextBoolean, type JsonValue } from "../../../adapter/JsonMapper.js";
import { Direction } from "../../../../util/Direction.js";
import type { Texture } from "../texture/Texture.js";
import { Element } from "./Element.js";
import { TextureVariable } from "./TextureVariable.js";

/**
 * Port placeholder for {@code resources/pack/ResourcePool<T>} (upstream:
 * resources/pack/ResourcePool.java): only the {@code T get(Key)} lookup the
 * model-package performs is declared. The full pool — with put/load/entrySet — arrives
 * with the ResourcePack port.
 */
export interface ResourcePool<T> {
    get(key: Key): T | null;
}

/**
 * upstream: model/Model.java
 *
 * Every mutator upstream is {@code synchronized}; that is a no-op in single-threaded TS
 * and kept only as a comment. The tri-state {@code Boolean ambientocclusion} (null =
 * unset) becomes {@code boolean | undefined}.
 */
export class Model {
    private parent: ResourcePath<Model> | null = null;
    private textures: Map<string, TextureVariable> = new Map<string, TextureVariable>();
    private elements: (Element | null)[] | null = null;
    private ambientocclusion: boolean | undefined = undefined;

    private culling: boolean = false;
    private occluding: boolean = false;

    /** upstream: the private no-args constructor gson instantiates with */
    constructor();
    constructor(textures: Map<string, TextureVariable>);
    constructor(elements: (Element | null)[]);
    constructor(textures: Map<string, TextureVariable>, elements: (Element | null)[] | null);
    constructor(
        textures: Map<string, TextureVariable>,
        elements: (Element | null)[] | null,
        ambientocclusion: boolean,
    );
    constructor(parent: ResourcePath<Model> | null, textures: Map<string, TextureVariable>);
    constructor(
        parent: ResourcePath<Model> | null,
        textures: Map<string, TextureVariable>,
        elements: (Element | null)[] | null,
        ambientocclusion: boolean,
    );
    constructor(
        a?: Map<string, TextureVariable> | (Element | null)[] | ResourcePath<Model> | null,
        b?: Map<string, TextureVariable> | (Element | null)[] | null,
        c?: boolean | (Element | null)[] | null,
        _ambientocclusion?: boolean,
    ) {
        if (a === undefined) return;

        if (a instanceof Map) {
            this.putAllTextures(a);
            // note: upstream's (textures, elements, ambientocclusion) constructor never
            // assigns ambientocclusion — kept bug-for-bug
            if (b !== undefined) this.elements = b as (Element | null)[] | null;
            return;
        }

        if (Array.isArray(a)) {
            // upstream: Model(Element @Nullable ... elements) — a varargs parameter,
            // ported as an array parameter
            this.elements = a;
            return;
        }

        this.parent = a;
        this.putAllTextures(b as Map<string, TextureVariable>);
        // upstream drops the ambientocclusion argument here too
        if (c !== undefined) this.elements = c as (Element | null)[] | null;
    }

    /** upstream: {@code this.textures.putAll(textures)} */
    private putAllTextures(textures: Map<string, TextureVariable>): void {
        textures.forEach((value, key) => this.textures.set(key, value));
    }

    getParent(): ResourcePath<Model> | null {
        return this.parent;
    }

    getTextures(): Map<string, TextureVariable> {
        return this.textures;
    }

    getElements(): (Element | null)[] | null {
        return this.elements;
    }

    isCulling(): boolean {
        return this.culling;
    }

    isOccluding(): boolean {
        return this.occluding;
    }

    /** upstream: synchronized */
    optimize(texturePool: ResourcePool<Texture>): void {
        for (const variable of this.textures.values()) {
            variable.optimize(texturePool);
        }

        if (this.elements != null) {
            for (const element of this.elements) {
                if (element != null) element.optimize(texturePool);
            }
        }
    }

    /** upstream: synchronized */
    applyParent(modelPool: ResourcePool<Model>): void {
        if (this.parent == null) return;

        // set parent to null early to avoid trying to resolve reference-loops
        const parentPath = this.parent;
        this.parent = null;

        const parent = parentPath.getResource((key) => modelPool.get(key));
        if (parent != null) {
            parent.applyParent(modelPool);

            if (this.ambientocclusion === undefined && parent.ambientocclusion !== undefined) {
                this.ambientocclusion = parent.ambientocclusion;
            }

            parent.textures.forEach((value, key) => this.applyTextureVariable(key, value));
            if (this.elements == null && parent.elements != null) {
                const parentElements = parent.elements;
                const elements: (Element | null)[] = new Array<Element | null>(
                    parentElements.length,
                ).fill(null);
                this.elements = elements;
                for (let i = 0; i < elements.length; i++) {
                    const parentElement = parentElements[i];
                    if (parentElement == null) continue;
                    elements[i] = parentElement.copy();
                }
            }
        }
    }

    /** upstream: synchronized */
    private applyTextureVariable(key: string, value: TextureVariable): void {
        if (!this.textures.has(key)) {
            this.textures.set(key, value.copy());
        }
    }

    /** upstream: synchronized */
    calculateProperties(texturePool: ResourcePool<Texture>): void {
        if (this.elements == null) return;
        for (const element of this.elements) {
            if (element != null && element.isFullCube()) {
                this.occluding = true;

                this.culling = true;
                for (const dir of Direction.values()) {
                    const face = element.getFaces().get(dir);
                    if (face === undefined) {
                        this.culling = false;
                        break;
                    }

                    const textureResourcePath = face
                        .getTexture()
                        .getTexturePath((name) => this.textures.get(name) ?? null);
                    if (textureResourcePath == null) {
                        this.culling = false;
                        break;
                    }

                    const texture = textureResourcePath.getResource((key) => texturePool.get(key));
                    if (texture == null || texture.getColorStraight().a < 1) {
                        this.culling = false;
                        break;
                    }
                }

                break;
            }
        }
    }

    isAmbientocclusion(): boolean {
        if (this.ambientocclusion === undefined) return true;
        return this.ambientocclusion;
    }

    /**
     * Port addition: upstream leaves Model to gson's reflective adapter; this reads the
     * same members explicitly. A json {@code null} member keeps the field-default, like
     * gson's reflective adapter does for primitives.
     */
    static readonly Adapter: JsonAdapter<Model> = {
        read(json: JsonValue): Model {
            const object = asObject(json);
            const model = new Model();

            const parent = object["parent"];
            if (parent != null)
                model.parent = ResourcePath.Adapter.read(parent) as ResourcePath<Model>;

            const textures = object["textures"];
            if (textures != null) {
                for (const [key, value] of Object.entries(asObject(textures))) {
                    model.textures.set(key, TextureVariable.Adapter.read(value));
                }
            }

            const elements = object["elements"];
            if (elements != null) {
                model.elements = asArray(elements).map((element) =>
                    element == null ? null : Element.Adapter.read(element),
                );
            }

            const ambientocclusion = object["ambientocclusion"];
            if (ambientocclusion != null) model.ambientocclusion = nextBoolean(ambientocclusion);

            return model;
        },
    };
}
