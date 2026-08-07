import type { Key } from "@worldlens/shared";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, type JsonValue } from "../../../adapter/JsonMapper.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import type { ResourcePool } from "../../ResourcePool.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import type { Texture } from "../texture/Texture.js";
import { Source } from "./Source.js";

/** upstream: resources/pack/resourcepack/atlas/SingleSource.java */
export class SingleSource extends Source {
    private resource: Key | null = null;
    private sprite: Key | null = null;

    /** upstream: the private {@code @NoArgsConstructor} (gson instantiates with it) */
    constructor();
    constructor(resource: Key);
    /** upstream: the {@code @AllArgsConstructor} */
    constructor(resource: Key, sprite: Key | null);
    constructor(resource?: Key, sprite: Key | null = null) {
        super();
        this.resource = resource ?? null;
        this.sprite = sprite;
    }

    getResource(): Key | null {
        return this.resource;
    }

    override async load(
        root: PackPath,
        textures: ResourcePool<Texture>,
        textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        const resource = this.resource;
        if (resource === null) return;

        // upstream: getSprite() — the resource is known non-null here
        const sprite = this.sprite ?? resource;
        if (textures.containsKey(sprite)) return;
        if (!textureFilter(sprite)) return;

        const file = this.getFile(root, resource);
        if (!(await file.exists())) return;

        const texture = await this.loadTexture(sprite, file);
        if (texture !== null) textures.put(sprite, texture);
    }

    /** upstream: the explicit {@code getSprite()} lombok does not generate a getter for */
    getSprite(): Key | null {
        return this.sprite ?? this.resource;
    }

    /** upstream: {@code equals}/{@code hashCode} — identity only, see {@link Source#equalityKey} */
    override equalityKey(): string {
        return this.identityKey();
    }

    /** upstream: gson's reflective adapter for this class */
    static readonly Adapter: JsonAdapter<SingleSource> = {
        read(json: JsonValue): SingleSource {
            const object = asObject(json);
            const source = new SingleSource();
            Source.readInheritedMembers(source, object);

            const resource = object["resource"];
            if (resource != null) source.resource = ResourcesGson.key.read(resource);

            const sprite = object["sprite"];
            if (sprite != null) source.sprite = ResourcesGson.key.read(sprite);

            return source;
        },
    };
}
