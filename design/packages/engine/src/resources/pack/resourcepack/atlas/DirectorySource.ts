import type { Key } from "@material-bluemap/shared";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import { asObject, nextString, type JsonValue } from "../../../adapter/JsonMapper.js";
import { ResourcePath } from "../../../ResourcePath.js";
import { Pack } from "../../Pack.js";
import type { ResourcePool } from "../../ResourcePool.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import type { Texture } from "../texture/Texture.js";
import { Source } from "./Source.js";

/**
 * upstream: resources/pack/resourcepack/atlas/DirectorySource.java
 *
 * Upstream translates the "/"-separated source-directory into
 * {@code root.getFileSystem().getSeparator()} on the way in and back again on the way out
 * (a zip-filesystem separates with "/", the OS one may separate with "\");
 * {@link PackPath} is always posix-style, so both replacements are no-ops here — see
 * docs/deviations.md.
 */
export class DirectorySource extends Source {
    private source: string | null = null;
    private prefix: string = "";

    /** upstream: the private {@code @NoArgsConstructor} (gson instantiates with it) */
    constructor();
    constructor(source: string);
    /** upstream: the {@code @AllArgsConstructor} */
    constructor(source: string, prefix: string);
    constructor(source?: string, prefix: string = "") {
        super();
        this.source = source ?? null;
        this.prefix = prefix;
    }

    getSource(): string | null {
        return this.source;
    }

    getPrefix(): string {
        return this.prefix;
    }

    override async load(
        root: PackPath,
        textures: ResourcePool<Texture>,
        textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        const source = this.source;
        if (source === null) return;

        for (const namespacePath of await Pack.list(root.resolve("assets"))) {
            const namespace = namespacePath.getFileName();
            const sourcePath = namespacePath.resolve("textures").resolve(source);

            for (const file of await Pack.walk(sourcePath)) {
                if (!file.getFileName().endsWith(".png")) continue;
                if (!(await file.isRegularFile())) continue;

                const namePath = sourcePath.relativize(file);
                let name = this.prefix + namePath;
                // remove .png
                name = name.substring(0, name.length - 4);

                const resourcePath = new ResourcePath<Texture>(namespace, name);
                if (textureFilter(resourcePath))
                    await textures.load(resourcePath, {
                        load: () => this.loadTexture(resourcePath, file),
                    });
            }
        }
    }

    /** upstream: {@code equals}/{@code hashCode} — identity only, see {@link Source#equalityKey} */
    override equalityKey(): string {
        return this.identityKey();
    }

    /** upstream: gson's reflective adapter for this class */
    static readonly Adapter: JsonAdapter<DirectorySource> = {
        read(json: JsonValue): DirectorySource {
            const object = asObject(json);
            const directorySource = new DirectorySource();
            Source.readInheritedMembers(directorySource, object);

            const source = object["source"];
            if (source != null) directorySource.source = nextString(source);

            const prefix = object["prefix"];
            if (prefix != null) directorySource.prefix = nextString(prefix);

            return directorySource;
        },
    };
}
