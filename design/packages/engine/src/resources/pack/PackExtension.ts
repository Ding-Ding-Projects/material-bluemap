import type { PackPath } from "./vfs/PackFileSystem.js";

/**
 * upstream: resources/pack/PackExtension.java
 *
 * Both upstream members are interface-defaults with an empty body, so an implementation
 * may override none, some, or all of them. A TypeScript interface carries no
 * implementation, so the members are declared optional (an implementation that omits one
 * gets upstream's no-op) and the defaults are applied by the {@link PackExtension}
 * const-object's invoker-statics, which is what upstream's call-sites become.
 */
export interface PackExtension {
    loadResources?(roots: Iterable<PackPath>): Promise<void>;

    bake?(): Promise<void>;
}

export const PackExtension = {
    /** upstream: {@code extension.loadResources(roots)} (default: {@code {}}) */
    async loadResources(extension: PackExtension, roots: Iterable<PackPath>): Promise<void> {
        await extension.loadResources?.(roots);
    },

    /** upstream: {@code extension.bake()} (default: {@code {}}) */
    async bake(extension: PackExtension): Promise<void> {
        await extension.bake?.();
    },
};
