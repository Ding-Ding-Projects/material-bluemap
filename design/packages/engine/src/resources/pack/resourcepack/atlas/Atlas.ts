import type { Key } from "@worldlens/shared";
import type { JsonAdapter } from "../../../adapter/AbstractTypeAdapterFactory.js";
import {
    asObject,
    isJsonArray,
    JsonParseError,
    type JsonValue,
} from "../../../adapter/JsonMapper.js";
import type { ResourcePool } from "../../ResourcePool.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import type { Texture } from "../texture/Texture.js";
import type { Source } from "./Source.js";
import { SourceType } from "./SourceType.js";

/**
 * upstream: resources/pack/resourcepack/atlas/Atlas.java
 *
 * Upstream holds the sources in a {@code LinkedHashSet<Source>} — insertion-ordered with
 * de-duplication by {@code equals}/{@code hashCode}. A js Set de-duplicates by identity,
 * so the set is a Map keyed by {@code Source#equalityKey()} here; see that method for
 * what upstream's equality actually amounts to.
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet),
 * so the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

export class Atlas {
    private readonly sources = new Map<string, Source>();

    /** upstream: {@code LinkedHashSet<Source> getSources()} (a live view upstream, a snapshot here) */
    getSources(): Source[] {
        return [...this.sources.values()];
    }

    /** upstream: {@code LinkedHashSet#add} — an already-present source is kept, not replaced */
    private addSource(source: Source): void {
        const equalityKey = source.equalityKey();
        if (!this.sources.has(equalityKey)) this.sources.set(equalityKey, source);
    }

    add(atlas: Atlas): this {
        for (const source of atlas.getSources()) this.addSource(source);
        return this;
    }

    async load(
        root: PackPath,
        textures: ResourcePool<Texture>,
        textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        for (const source of this.getSources()) {
            try {
                await source.load(root, textures, textureFilter);
            } catch (ex) {
                logDebug("Failed to load atlas-source: " + ex);
            }
        }
    }

    async bake(
        textures: ResourcePool<Texture>,
        textureFilter: (key: Key) => boolean,
    ): Promise<void> {
        for (const source of this.getSources()) {
            try {
                await source.bake(textures, textureFilter);
            } catch (ex) {
                logDebug("Failed to bake atlas-source: " + ex);
            }
        }
    }

    /**
     * Port addition: upstream leaves Atlas to gson's reflective adapter, which reads the
     * {@code sources} member as a {@code LinkedHashSet<Source>} — every element through
     * {@code Source}'s {@code @JsonAdapter}, which is {@link SourceType.Adapter} here.
     */
    static readonly Adapter: JsonAdapter<Atlas> = {
        read(json: JsonValue): Atlas {
            const atlas = new Atlas();

            const sources = asObject(json)["sources"];
            if (sources != null) {
                if (!isJsonArray(sources)) throw new JsonParseError("Expected BEGIN_ARRAY");
                for (const element of sources) atlas.addSource(SourceType.Adapter.read(element));
            }

            return atlas;
        },
    };
}
