import type { Key } from "@material-bluemap/shared";
import { PNG } from "pngjs";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, parse, type JsonObject, type JsonValue } from "../../../adapter/JsonMapper.js";
import { ResourcesGson } from "../../../adapter/ResourcesGson.js";
import type { ResourcePool } from "../../ResourcePool.js";
import { PackPath } from "../../vfs/PackFileSystem.js";
import { AnimationMeta } from "../texture/AnimationMeta.js";
import { Texture } from "../texture/Texture.js";

/**
 * upstream: resources/pack/resourcepack/atlas/Source.java — the polymorphic base of the
 * atlas-sources. A bare {@link Source} is a no-op: it is what an unknown source-type (and
 * {@code minecraft:filter}, which upstream deliberately maps onto this class) degrades to.
 *
 * Two port-notes:
 * - {@code Path} becomes {@link PackPath} and every file-operation is asynchronous, so
 *   {@link load} and {@link bake} return promises (upstream: {@code throws IOException}).
 * - upstream's {@code @JsonAdapter(Source.Adapter.class)} — the two-pass polymorphic
 *   reader — lives in {@code SourceType.Adapter} here, because it has to reference the
 *   concrete subclasses, which extend this class (see docs/deviations.md). What remains
 *   here is upstream's *delegate* adapter, gson's reflective adapter for
 *   {@code Source.class} itself, which reads nothing but the {@code type}; it is named
 *   {@link Source.DelegateAdapter} so it is not mistaken for the polymorphic one (and so
 *   that a subclass' own {@code Adapter} does not shadow it as an inherited static).
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */

/** upstream: Path#resolveSibling */
function resolveSibling(path: PackPath, name: string): PackPath {
    const separatorIndex = path.path.lastIndexOf("/");
    const parent = separatorIndex === -1 ? "" : path.path.substring(0, separatorIndex);
    return new PackPath(path.fileSystem, parent === "" ? name : parent + "/" + name);
}

export class Source {
    /** hands every instance the identity upstream's {@code equals} compares by — see {@link equalityKey} */
    private static identityCounter = 0;
    private readonly identity: string = "@" + ++Source.identityCounter;

    private type: Key | null = null;

    getType(): Key | null {
        return this.type;
    }

    async load(
        _root: PackPath,
        _textures: ResourcePool<Texture>,
        _textureFilter: (key: Key) => boolean,
    ): Promise<void> {}

    async bake(
        _textures: ResourcePool<Texture>,
        _textureFilter: (key: Key) => boolean,
    ): Promise<void> {}

    protected async loadTexture(key: Key, file: PackPath): Promise<Texture | null> {
        const image = await this.loadImage(file);
        if (image == null) return null;
        const animation = await this.loadAnimation(file);
        return Texture.from(key, image, animation);
    }

    protected async loadImage(imageFile: PackPath): Promise<PNG | null> {
        if (!(await imageFile.exists())) return null;
        return PNG.sync.read(await imageFile.readBytes());
    }

    protected async loadAnimation(imageFile: PackPath): Promise<AnimationMeta | null> {
        const animationPathFile = resolveSibling(imageFile, imageFile.getFileName() + ".mcmeta");
        if (!(await animationPathFile.exists())) return null;
        return AnimationMeta.Adapter.read(parse(await animationPathFile.readText()));
    }

    /**
     * upstream also replaces every "/" of the key's value with
     * {@code root.getFileSystem().getSeparator()}, because a zip-filesystem separates with
     * "/" while the OS one may separate with "\"; {@link PackPath} is always posix-style,
     * so the replacement is a no-op here (see docs/deviations.md).
     */
    protected getFile(root: PackPath, key: Key): PackPath {
        return root
            .resolve("assets")
            .resolve(key.getNamespace())
            .resolve("textures")
            .resolve(key.getValue() + ".png");
    }

    /**
     * upstream: {@code equals}/{@code hashCode} — {@code Atlas} holds its sources in a
     * {@code LinkedHashSet}, and a js Set/Map de-duplicates by identity, so the equality
     * of a source is expressed as this key-string instead.
     *
     * <p>Note what upstream's base implementation actually does: after the
     * {@code this == object} check it returns false as soon as
     * {@code getClass() != Source.class}, and every subclass guards its own comparison
     * with {@code if (!super.equals(object)) return false}. So only a <em>bare</em> Source
     * (an unknown or {@code minecraft:filter} source) ever de-duplicates — by its type —
     * while two structurally identical {@code SingleSource}s are never equal. Each
     * subclass therefore overrides this with {@link identityKey} (see
     * docs/deviations.md).</p>
     */
    equalityKey(): string {
        return "Source/" + (this.type === null ? "null" : this.type.getFormatted());
    }

    /** the per-instance identity upstream's subclass-{@code equals} degenerates to */
    protected identityKey(): string {
        return this.identity;
    }

    /**
     * upstream: gson's reflective adapter fills the inherited {@code type} field of every
     * concrete source too — the concrete adapters delegate to this for it.
     */
    static readInheritedMembers(source: Source, json: JsonObject): void {
        const type = json["type"];
        if (type != null) source.type = ResourcesGson.key.read(type);
    }

    /**
     * upstream: {@code gson.getDelegateAdapter(this, TypeToken.get(Source.class))} — the
     * reflective adapter for the bare Source. This is <em>not</em> the polymorphic reader
     * (that is {@code SourceType.Adapter}); it is what the first pass of that reader uses
     * to find the {@code type}, what an unknown type degrades to, and what the
     * {@code minecraft:filter} registry-entry re-parses with.
     */
    static readonly DelegateAdapter: JsonAdapter<Source> = {
        read(json: JsonValue): Source {
            const source = new Source();
            Source.readInheritedMembers(source, asObject(json));
            return source;
        },
    };
}
