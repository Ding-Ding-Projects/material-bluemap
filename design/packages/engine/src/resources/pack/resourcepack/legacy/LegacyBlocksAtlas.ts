import { Key } from "@worldlens/shared";
import type { JsonObject, JsonValue } from "../../../adapter/JsonMapper.js";
import { Atlas } from "../atlas/Atlas.js";
import { LEGACY_TEXTURE_DIRECTORIES } from "./LegacyResourceNames.js";

/**
 * upstream: resourcepack/TextureGallery.java @ v0.10.3-mc1.12
 * ({@code loadTexture(FileAccess, String)}), reached from
 * {@code BlockModelResource.Builder#getTexture}.
 *
 * <p>There is no atlas in the 1.12 era — the legacy loader has no texture-discovery step
 * at all. It resolves a texture <em>lazily, by path</em>, the first time a model names one:
 * {@code getTexture} turns the reference into
 * {@code assets/<ns>/textures/<reference>.png} and hands that straight to
 * {@code TextureGallery#loadTexture}. Every texture the render ever needs is therefore
 * loaded, and nothing else is.</p>
 *
 * <p>The modern pipeline inverts that. {@code ResourcePack#loadResources} discovers
 * textures by walking the sources of the {@code minecraft:blocks} atlas
 * ({@code assets/<ns>/atlases/blocks.json}) and decodes the subset that survives the
 * texture-key filter. A 1.12 pack ships no atlas file, so the atlas is empty and the pack
 * yields <em>zero</em> textures.</p>
 *
 * <p>This module supplies the atlas that era would have had. It is not an invention: a
 * {@code minecraft:directory} source is precisely "every png under this texture-directory,
 * named after its path", which is the same set of files
 * {@code namespacedToAbsoluteResourcePath} could ever have addressed. The key-filter still
 * decides what is actually decoded, so the result is the same lazy subset upstream loaded —
 * arrived at by discovery-then-filter instead of by resolve-on-demand.</p>
 */

/** upstream: the {@code ResourcePack.BLOCKS_ATLAS} key the texture-loading phase resolves */
export const LEGACY_BLOCKS_ATLAS: Key = Key.minecraft("blocks");

/** upstream: SourceType.REGISTRY's {@code minecraft:directory} entry */
const DIRECTORY_SOURCE_TYPE = "minecraft:directory";

/**
 * The synthetic {@code minecraft:blocks} atlas of a pre-flattening pack, in the json a
 * {@code blocks.json} would have carried.
 *
 * <p>Each pre-flattening directory is crossed with its post-flattening counterpart, in both
 * roles — the directory that is <em>scanned</em> and the prefix the found file is
 * <em>named</em> with — giving four sources per directory pair:</p>
 *
 * <ul>
 *   <li>{@code blocks} named {@code blocks/} — a 1.12 texture read by a 1.12 reference,
 *       the ordinary case;</li>
 *   <li>{@code blocks} named {@code block/} — a 1.12 texture read by a flattened
 *       reference. This is not hypothetical: BlueMap's own legacy {@code resourceExtensions}
 *       ship {@code assets/bluemap/textures/blocks/missing.png}, while this port's
 *       {@code ResourcePack.MISSING_TEXTURE} is {@code bluemap:block/missing};</li>
 *   <li>{@code block} named {@code blocks/} — a flattened texture read by a 1.12
 *       reference, which is what happens when a legacy pack is stacked under a modern one;</li>
 *   <li>{@code block} named {@code block/} — the modern pairing, so that a pack-stack
 *       containing one legacy pack does not lose the modern packs' own textures.</li>
 * </ul>
 *
 * <p>The extra sources cost close to nothing. A {@code DirectorySource} over a directory
 * that does not exist walks nothing ({@code Pack.walk} returns empty for a missing path),
 * and a name that no model references never passes the texture-key filter, so it is
 * discovered and then dropped without ever being decoded.</p>
 */
export function legacyBlocksAtlasJson(): JsonObject {
    const sources: JsonValue[] = [];

    for (const [legacyDirectory, flattenedDirectory] of LEGACY_TEXTURE_DIRECTORIES) {
        const names = [legacyDirectory, flattenedDirectory];
        for (const source of names) {
            for (const prefix of names) {
                sources.push({
                    type: DIRECTORY_SOURCE_TYPE,
                    source,
                    prefix: prefix + "/",
                });
            }
        }
    }

    return { sources };
}

/** Builds the synthetic atlas of {@link legacyBlocksAtlasJson}. */
export function createLegacyBlocksAtlas(): Atlas {
    return Atlas.Adapter.read(legacyBlocksAtlasJson());
}
