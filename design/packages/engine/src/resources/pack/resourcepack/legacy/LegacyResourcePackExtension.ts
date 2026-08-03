import { Key } from "@material-bluemap/shared";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import type { Extension } from "../ResourcePack.js";
import { ResourcePack } from "../ResourcePack.js";
import type { ResourcePackExtension } from "../ResourcePackExtension.js";
import { MISSING_BLOCK_MODEL } from "../blockstate/Variant.js";
import { LEGACY_BLOCKS_ATLAS, createLegacyBlocksAtlas } from "./LegacyBlocksAtlas.js";
import { isLegacyPackRoot } from "./LegacyPackFormat.js";
import { legacyBlockModelKey } from "./LegacyResourceNames.js";

/**
 * upstream: resourcepack/ResourcePack.java, resourcepack/BlockStateResource.java and
 * resourcepack/TextureGallery.java @ v0.10.3-mc1.12
 *
 * Compatibility for pre-flattening (<= 1.12.2) resource-packs, as a
 * {@link ResourcePackExtension} rather than a second ResourcePack.
 *
 * <p>Upstream shipped 1.12 support as an entire parallel branch — its own
 * {@code ResourcePack}, {@code BlockStateResource}, {@code BlockModelResource} and
 * {@code TextureGallery}. Forking those here would duplicate the whole Phase-C pipeline to
 * change three things, so this is expressed as an extension instead: the extension hook
 * runs at exactly the phase both changes need, and nothing in {@code ResourcePack},
 * {@code Pack} or the atlas-layer has to move.</p>
 *
 * <p>The phase is what makes it work. {@code ResourcePack#loadResources} runs, in order:
 * (1) load every non-texture resource of every root, (2) <b>extensions</b>, (3) collect the
 * used texture-keys, (4) load textures through the {@code minecraft:blocks} atlas, (5) bake.
 * An extension therefore sees the blockstates and models already loaded, and still runs
 * before a single texture has been discovered — so it can both repair model references and
 * install the atlas the pack never had.</p>
 *
 * <p>Three era-differences are handled. Two of them need code:</p>
 *
 * <ul>
 *   <li><b>Pre-atlas texture discovery.</b> A 1.12 pack has no
 *       {@code assets/minecraft/atlases/blocks.json}, and the modern pipeline loads
 *       textures exclusively <em>through</em> that atlas, so such a pack currently yields
 *       zero textures. {@link createLegacyBlocksAtlas} supplies the atlas that era would
 *       have had; see LegacyBlocksAtlas.ts for why a directory-source is the faithful
 *       stand-in for upstream's resolve-on-demand loading.</li>
 *   <li><b>Pre-flattening model references.</b> A 1.12 blockstate names its model bare
 *       ({@code "stone"}), because the legacy loader prepended {@code models/block}; the
 *       modern loader prepends only {@code models/} and registers the same file as
 *       {@code minecraft:block/stone}. See {@link legacyBlockModelKey} and
 *       {@link LegacyResourcePackExtension#remapBlockModelReferences}.</li>
 * </ul>
 *
 * <p>The third needs none. The {@code "normal"} variant-key — 1.12's spelling of the
 * unconditional variant — is already handled by {@code Variants.Adapter}, whose
 * {@code parseConditionString} maps {@code ""}, {@code "default"} and {@code "normal"} onto
 * {@code BlockStateCondition.all()} exactly as legacy
 * {@code BlockStateResource.Builder#parseConditionString} did, making that variant-set the
 * blockstate's default. LegacyResourcePackExtension.test.ts pins it rather than assuming
 * it.</p>
 */

/*
 * upstream: Logger.global.logDebug — the logger-package is not part of this port (yet), so
 * the log-calls of the pack-package are backed by the console directly.
 */
function logDebug(message: string): void {
    console.debug(message);
}

export class LegacyResourcePackExtension implements ResourcePackExtension {
    private readonly pack: ResourcePack;

    /** whether any root of the last {@link loadResources} declared a pre-flattening format */
    private legacy = false;

    constructor(pack: ResourcePack) {
        this.pack = pack;
    }

    getPack(): ResourcePack {
        return this.pack;
    }

    isLegacy(): boolean {
        return this.legacy;
    }

    async loadResources(roots: Iterable<PackPath>): Promise<void> {
        for (const root of roots) {
            // the same traversal ResourcePack performs — so a zip, a nested datapack and an
            // applicable overlay are all reached, and each one gets its pack.mcmeta read
            await this.pack.loadResourcePath(root, {
                load: async (packRoot) => {
                    if (await isLegacyPackRoot(packRoot)) this.legacy = true;
                },
            });
        }

        if (!this.legacy) return;

        logDebug("Pre-flattening resource-pack detected, enabling 1.12 compatibility ...");

        await this.installBlocksAtlas();
        this.remapBlockModelReferences();
    }

    /**
     * Registers the synthetic {@code minecraft:blocks} atlas.
     *
     * <p>It is merged in with the very same call {@code ResourcePack} loads a real
     * atlas-file with — {@code ResourcePool#load} with {@code Atlas#add} as the
     * merge-function — so a stack that also contains a modern pack keeps that pack's own
     * sources instead of having them replaced.</p>
     */
    private async installBlocksAtlas(): Promise<void> {
        await this.pack.getAtlases().load(
            LEGACY_BLOCKS_ATLAS,
            { load: () => createLegacyBlocksAtlas() },
            (previous, resource) => previous.add(resource),
        );
    }

    /**
     * Resolves the bare model references of a pre-flattening blockstate against the
     * {@code block/}-prefixed keys the model-pool actually holds.
     *
     * <p>The reference is not rewritten — {@link ResourcePath} is a {@link Key} and is
     * immutable, and {@code Variant#model} is private. Instead the resolved model is cached
     * <em>onto</em> the path with {@code setResource}, which is the same slot
     * {@code getResource(supplier)} would have filled and which every consumer of a
     * variant's model goes through (upstream: {@code variant.getModel().getResource(
     * modelProvider)} in every hires block-renderer, and
     * {@code ResourcePack#loadBlockProperties} here). A pre-filled slot short-circuits the
     * supplier, so the lookup never sees the un-prefixed key.</p>
     *
     * <p>Nothing is touched that already resolves: a reference the pool knows, a path whose
     * resource is already cached, and the shared {@code MISSING_BLOCK_MODEL} singleton are
     * each left exactly as they are. That last one matters — every defaulted variant in the
     * process shares that one path-object, so caching a resource onto it would give every
     * model-less variant everywhere the same wrong model.</p>
     */
    private remapBlockModelReferences(): void {
        const models = this.pack.getModels();
        let remapped = 0;

        for (const blockState of this.pack.getBlockStates().values()) {
            // the no-condition overload — every variant of both the variants- and the
            // multipart-form, not just the ones a given world-blockstate selects
            blockState.forEach((variant) => {
                const modelPath = variant.getModel();

                if (modelPath === MISSING_BLOCK_MODEL) return;
                if (modelPath.getResource() !== null) return;
                if (models.containsKey(modelPath)) return;

                const flattenedKey = legacyBlockModelKey(modelPath);
                if (flattenedKey === null) return;

                const model = models.get(flattenedKey);
                if (model === null) return;

                modelPath.setResource(model);
                remapped++;
            });
        }

        logDebug("Mapped " + remapped + " pre-flattening block-model references.");
    }
}

/**
 * upstream: an entry of {@code ResourcePack.Extension.REGISTRY}. Upstream's core ships no
 * extensions of its own (its platform-modules register theirs), so this is the first.
 */
export const LEGACY_RESOURCES_EXTENSION: Extension<LegacyResourcePackExtension> = {
    getKey: () => Key.bluemap("legacy-resources"),
    create: (pack) => new LegacyResourcePackExtension(pack),
};

/**
 * Registers {@link LEGACY_RESOURCES_EXTENSION} on the global extension-registry.
 *
 * <p>Idempotent — {@code Registry#register} is putIfAbsent — and called once on import of
 * this module, so importing it is the whole wiring. It is exported as well so a
 * composition-root can register it explicitly rather than relying on an import's
 * side-effect.</p>
 *
 * @return true if an entry with this key was already registered (upstream:
 *         {@code Registry#register}'s inverted return, kept bug-for-bug)
 */
export function registerLegacyResourcePackExtension(): boolean {
    return ResourcePack.Extension.REGISTRY.register(LEGACY_RESOURCES_EXTENSION);
}

registerLegacyResourcePackExtension();
