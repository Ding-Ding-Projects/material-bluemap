import { Key } from "@worldlens/shared";

/**
 * upstream: resourcepack/ResourcePack.java @ v0.10.3-mc1.12
 * ({@code namespacedToAbsoluteResourcePath}) and its three call-sites.
 *
 * The pre-flattening resource-names, derived from where the legacy loader actually looked.
 * Each call-site passes the {@code resourceTypeFolder} the reference is relative to, so the
 * three prefixes upstream prepends *are* the shape of a 1.12 reference:
 *
 * <ul>
 *   <li>{@code BlockStateResource.Builder#loadModel} —
 *       {@code namespacedToAbsoluteResourcePath(model, "models/block")}, so a 1.12
 *       blockstate names its model <em>bare</em> ({@code "stone"}, {@code "barrier"}) with
 *       no {@code block/} of its own. A modern blockstate writes
 *       {@code "minecraft:block/stone"}, and the modern loader prepends only
 *       {@code models/} — which is the one place the two eras genuinely disagree about a
 *       model name. (BlueMap's own legacy {@code resourceExtensions} confirm it:
 *       {@code blockstates/barrier.json} is {@code {"variants":{"":{"model":"barrier"}}}}.)</li>
 *   <li>{@code BlockModelResource.Builder#buildNoReset} —
 *       {@code namespacedToAbsoluteResourcePath(parent, "models")}, so a 1.12 model's
 *       {@code parent} <em>does</em> carry {@code block/} already and needs no mapping.</li>
 *   <li>{@code BlockModelResource.Builder#getTexture} —
 *       {@code namespacedToAbsoluteResourcePath(key, "textures")}, so a 1.12 texture
 *       reference carries its own directory — the pre-flattening {@code blocks/} and
 *       {@code items/} rather than {@code block/} and {@code item/}.</li>
 * </ul>
 */

/**
 * The pre-flattening texture directories, mapped to the post-flattening name of each.
 *
 * <p>These are directory names under {@code assets/<namespace>/textures/} and, because a
 * texture reference is relative to that same directory, they are equally the leading
 * segment of a texture <em>key</em> — {@code minecraft:blocks/stone} in 1.12 against
 * {@code minecraft:block/stone} in 1.13+.</p>
 */
export const LEGACY_TEXTURE_DIRECTORIES: ReadonlyMap<string, string> = new Map([
    ["blocks", "block"],
    ["items", "item"],
]);

/** the directory a 1.12 blockstate's model reference is implicitly relative to */
export const LEGACY_BLOCK_MODEL_PREFIX = "block/";

/**
 * The key a 1.12 blockstate's bare model reference means, or null when the reference
 * already carries the {@code block/} the legacy loader would have prepended.
 *
 * <p>{@code minecraft:stone} becomes {@code minecraft:block/stone}, which is what the
 * modern loader registers {@code assets/minecraft/models/block/stone.json} under.</p>
 *
 * <p>Upstream prepends unconditionally, so a reference that already begins with
 * {@code block/} would become {@code block/block/…} there. Returning null instead is not a
 * fidelity break: such a reference cannot occur in a 1.12 pack, and the caller only
 * consults this after the reference has failed to resolve on its own — so mapping it would
 * be guaranteed to fail too, while returning null keeps the compat layer from ever writing
 * a resolved resource onto the shared {@code MISSING_BLOCK_MODEL} path.</p>
 */
export function legacyBlockModelKey(key: Key): Key | null {
    const value = key.getValue();
    if (value.startsWith(LEGACY_BLOCK_MODEL_PREFIX)) return null;
    return new Key(key.getNamespace(), LEGACY_BLOCK_MODEL_PREFIX + value);
}
