import type { Key } from "@material-bluemap/shared";
import { ResourcePath } from "../resources/ResourcePath.js";
import { isJsonArray, type JsonValue } from "../resources/adapter/JsonMapper.js";
import { ResourcePool } from "../resources/pack/ResourcePool.js";
import { Texture } from "../resources/pack/resourcepack/texture/Texture.js";

/**
 * upstream: map/TextureGallery.java
 *
 * The map's texture-index: every {@link Texture} the map uses gets an ordinal, and the
 * rendered tile-models refer to their textures by that ordinal alone. The ordinals are
 * written out as {@code textures.json} — a bare json array indexed by ordinal — which the
 * webapp loads alongside the tiles.
 *
 * Three port-notes:
 * - The upstream {@code Map<Key, TextureMapping>} relies on {@code Key}'s value-equality;
 *   a javascript {@code Map} keys objects by identity, so the map is keyed by
 *   {@code Key#getFormatted()} with the {@link Key} kept alongside the mapping (the same
 *   shape {@code resources/pack/ResourcePool} uses).
 * - Upstream's gson instance here is {@code ResourcesGson.addAdapter(...)} with
 *   {@code FieldNamingPolicy.IDENTITY} and — unlike {@code ResourcesGson.INSTANCE} — NO
 *   {@code setLenient()}, so reading goes through the strict {@code JSON.parse} rather
 *   than the lenient {@code adapter/JsonMapper} parser. The per-element (de)serialization
 *   is {@link Texture.Adapter}, which reproduces that reflective-with-IDENTITY shape.
 * - Upstream's {@code synchronized} on the two {@code put} methods has no counterpart:
 *   javascript has no preemption, so the compute-and-increment below is already atomic
 *   (see docs/deviations.md).
 */
export class TextureGallery {
    /**
     * The map-storage item-name of the textures-file
     * (upstream: {@code FileMapStorage} — {@code "textures.json" + compression.getFileSuffix()}).
     */
    static readonly TEXTURES_FILE_NAME: string = "textures.json";

    /**
     * The on-disk name of the textures-file: map-storages write it gzip-compressed, so
     * the bytes {@link writeTexturesFile} produces are gzipped before they land under
     * this name (and gunzipped before {@link readTexturesFile} sees them).
     */
    static readonly TEXTURES_FILE_NAME_GZIP: string = "textures.json.gz";

    /** upstream: {@code Map<Key, TextureMapping> textureMappings} */
    private readonly textureMappings = new Map<string, MappingEntry>();
    private nextId = 0;

    clear(): void {
        this.textureMappings.clear();
        this.nextId = 0;
    }

    /**
     * upstream: {@code int get(@Nullable Key textureResourcePath)} — the ordinal of the
     * given texture, falling back to 0 (which {@link put} guarantees is the
     * missing-texture) for a null or unknown key.
     */
    get(textureResourcePath: Key | null): number {
        const key = textureResourcePath ?? MISSING_TEXTURE;
        const entry = this.textureMappings.get(key.getFormatted());
        return entry !== undefined ? entry.mapping.getId() : 0;
    }

    /**
     * upstream: {@code synchronized void put(Key key, Texture texture)} — assigns the
     * next free ordinal to a new key, or replaces the texture of an already-known one.
     *
     * The ordinal of an existing key is deliberately PRESERVED across a re-put: tiles
     * that were rendered in an earlier run store texture-ordinals, not texture-keys, so
     * re-loading the same resource-pack has to hand the same key the same ordinal or
     * every already-rendered tile would silently start pointing at a different texture.
     */
    put(key: Key, texture: Texture | null): void;
    /**
     * upstream: {@code synchronized void put(ResourcePool<Texture> texturePool)} —
     * inserts a whole texture-pool in a deterministic order.
     */
    put(texturePool: ResourcePool<Texture>): void;
    put(keyOrPool: Key | ResourcePool<Texture>, texture?: Texture | null): void {
        if (keyOrPool instanceof ResourcePool) {
            // ordinal 0 is guaranteed to be the missing-texture because this goes in
            // before anything else (upstream: "put this first")
            this.put(MISSING_TEXTURE, MISSING_TEXTURE.getResource());

            const entries = keyOrPool.entrySet();
            // upstream: Comparator.comparing(<half-transparent>).thenComparing(<formatted key>)
            // — opaque textures first, each group ordered by its formatted key. Both
            // Stream#sorted and Array#sort are stable, so equal entries keep pool-order.
            entries.sort((a, b) => {
                const halfTransparentA = isHalfTransparent(a[1]) ? 1 : 0;
                const halfTransparentB = isHalfTransparent(b[1]) ? 1 : 0;
                if (halfTransparentA !== halfTransparentB)
                    return halfTransparentA - halfTransparentB;

                // java's String#compareTo: utf-16 code-unit order, never locale-aware
                const formattedA = a[0].getFormatted();
                const formattedB = b[0].getFormatted();
                return formattedA < formattedB ? -1 : formattedA > formattedB ? 1 : 0;
            });

            for (const entry of entries) this.put(entry[0], entry[1]);
            return;
        }

        // upstream: textureMappings.compute(key, ...)
        const formatted = keyOrPool.getFormatted();
        const existing = this.textureMappings.get(formatted);
        if (existing === undefined) {
            this.textureMappings.set(formatted, {
                key: keyOrPool,
                mapping: new TextureMapping(this.nextId++, texture ?? null),
            });
        } else if (texture != null) {
            existing.mapping.setTexture(texture);
        }
    }

    /**
     * upstream: {@code void writeTexturesFile(OutputStream out)} — the textures-file is a
     * bare json array of length {@code nextId} indexed by ordinal; ordinals with no
     * mapping (holes) hold {@link Texture.MISSING} and a mapping with no loaded texture
     * holds {@code Texture.missing(<its key>)}.
     *
     * Upstream writes utf-8 bytes into an {@code OutputStream}; this returns the document
     * as a string, which the (not-yet-ported) map-storage layer encodes and compresses.
     */
    writeTexturesFile(): string {
        const textures: Texture[] = Array.from({ length: this.nextId }, () => Texture.MISSING);

        for (const entry of this.textureMappings.values()) {
            const ordinal = entry.mapping.getId();
            const texture = entry.mapping.getTexture();
            textures[ordinal] = texture ?? Texture.missing(entry.key);
        }

        // gson writes compactly and html-escapes '=', '<', '>', '&' and '\'' inside
        // strings; JSON.stringify emits them literally. Same json value either way — see
        // docs/deviations.md.
        return JSON.stringify(textures.map((texture) => Texture.Adapter.write(texture)));
    }

    /**
     * upstream: {@code static TextureGallery readTexturesFile(InputStream in)} — the
     * array-index is the ordinal, and a duplicated key keeps its FIRST occurrence
     * (upstream: {@code Map#putIfAbsent}). {@code nextId} becomes the array length, so a
     * hole (a null element, or the later occurrence of a duplicate) keeps its ordinal
     * reserved instead of handing it to the next {@link put}.
     */
    static readTexturesFile(json: string): TextureGallery {
        const gallery = new TextureGallery();

        let parsed: JsonValue;
        try {
            // gson returns null for an empty document, which upstream turns into the
            // "Texture data is empty!" IOException below
            parsed = json.trim() === "" ? null : (JSON.parse(json) as JsonValue);
        } catch (ex) {
            // upstream: JsonParseException -> IOException
            throw new Error("Failed to parse texture data: " + String(ex));
        }

        if (parsed === null) throw new Error("Texture data is empty!");

        try {
            if (!isJsonArray(parsed))
                throw new Error("Expected BEGIN_ARRAY but was an object or primitive");

            gallery.nextId = parsed.length;
            for (let ordinal = 0; ordinal < parsed.length; ordinal++) {
                const element = parsed[ordinal] ?? null;
                if (element === null) continue; // upstream: `texture != null`

                // upstream also guards `texture.getKey() != null`; gson instantiates a
                // Texture through its private no-args constructor, which always assigns
                // a key (Texture.MISSING's), so the guard can never fail — here as there
                const texture = Texture.Adapter.read(element);
                const formatted = texture.getKey().getFormatted();
                if (gallery.textureMappings.has(formatted)) continue; // putIfAbsent
                gallery.textureMappings.set(formatted, {
                    key: texture.getKey(),
                    mapping: new TextureMapping(ordinal, texture),
                });
            }
        } catch (ex) {
            throw new Error("Failed to parse texture data: " + String(ex));
        }

        return gallery;
    }
}

/**
 * upstream: {@code ResourcePack.MISSING_TEXTURE}
 * ({@code new ResourcePath<>("bluemap", "block/missing")}).
 *
 * Declared locally, exactly as `model/Face.ts` and `entitystate/Part.ts` already declare
 * it, rather than imported from `ResourcePack` — that would pull the whole pack-loader
 * (and its six pools) into the gallery for one constant. Nothing in upstream ever calls
 * {@code setResource} on this path, so its {@code getResource()} is always null and a
 * separate instance is indistinguishable from the pack's: the gallery keys by
 * {@code Key#getFormatted()}, which is value-equal either way. See docs/deviations.md.
 */
const MISSING_TEXTURE: ResourcePath<Texture> = new ResourcePath<Texture>(
    "bluemap",
    "block/missing",
);

/** upstream: the {@code Key} of the {@code Map<Key, TextureMapping>} entry */
interface MappingEntry {
    key: Key;
    mapping: TextureMapping;
}

/** upstream: TextureGallery.TextureMapping (a package-private static nested class) */
class TextureMapping {
    private readonly id: number;
    private texture: Texture | null;

    constructor(id: number, texture: Texture | null) {
        this.id = id;
        this.texture = texture;
    }

    getId(): number {
        return this.id;
    }

    getTexture(): Texture | null {
        return this.texture;
    }

    setTexture(texture: Texture | null): void {
        this.texture = texture;
    }
}

/** upstream: the sort-key of {@code put(ResourcePool)}'s first comparator */
function isHalfTransparent(texture: Texture | null): boolean {
    // upstream guards against a null pool-value, which the ResourcePool type excludes here
    return texture != null && texture.getColorPremultiplied().a < 1;
}
