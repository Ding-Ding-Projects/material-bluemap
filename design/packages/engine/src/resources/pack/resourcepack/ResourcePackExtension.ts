import type { Key } from "@material-bluemap/shared";
import type { BlockPropertiesBuilder } from "../../../world/BlockProperties.js";
import type { BlockState } from "../../../world/BlockState.js";
import type { PackExtension } from "../PackExtension.js";

/**
 * upstream: resources/pack/resourcepack/ResourcePackExtension.java
 *
 * Like {@link PackExtension} (which it extends), every upstream member is an
 * interface-default, so an implementation may override none, some, or all of them. A
 * TypeScript interface carries no implementation, so the members are declared optional
 * (an implementation that omits one gets upstream's default) and the defaults are applied
 * by the {@link ResourcePackExtension} const-object's invoker-statics, which is what
 * upstream's call-sites become.
 */
export interface ResourcePackExtension extends PackExtension {
    collectUsedTextureKeys?(): ReadonlySet<Key>;

    getBlockStateKey?(key: Key): Key;

    getBlockProperties?(blockState: BlockState, propertiesBuilder: BlockPropertiesBuilder): void;
}

/**
 * upstream's {@code Set.of()} default — an immutable empty set, so the one shared
 * instance is equivalent to a fresh one per call
 */
const NO_TEXTURE_KEYS: ReadonlySet<Key> = new Set<Key>();

export const ResourcePackExtension = {
    /** upstream: {@code extension.collectUsedTextureKeys()} (default: {@code Set.of()}) */
    collectUsedTextureKeys(extension: ResourcePackExtension): ReadonlySet<Key> {
        return extension.collectUsedTextureKeys?.() ?? NO_TEXTURE_KEYS;
    },

    /** upstream: {@code extension.getBlockStateKey(key)} (default: {@code key}) */
    getBlockStateKey(extension: ResourcePackExtension, key: Key): Key {
        return extension.getBlockStateKey?.(key) ?? key;
    },

    /**
     * upstream: {@code extension.getBlockProperties(blockState, propertiesBuilder)}
     * (default: {@code {}})
     */
    getBlockProperties(
        extension: ResourcePackExtension,
        blockState: BlockState,
        propertiesBuilder: BlockPropertiesBuilder,
    ): void {
        extension.getBlockProperties?.(blockState, propertiesBuilder);
    },
};
