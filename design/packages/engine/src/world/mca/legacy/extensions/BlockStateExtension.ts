import { BlockState } from "../../../BlockState.js";

/**
 * Resolves the block-state at the given world-position (across chunk-borders).
 * Replaces the legacy extensions' MCAWorld#getBlockState(Vector3i) receiver:
 * the modern MCAWorld supplies this callback when applying the legacy extensions.
 */
export type BlockStateAccess = (x: number, y: number, z: number) => BlockState;

/**
 * Extends a pre-flattening (1.12) block-state with properties that 1.13+ chunk-data
 * stores explicitly but 1.12 chunk-data derives from the neighborhood
 * (upstream: legacy mca/extensions/BlockStateExtension.java from v0.10.3-mc1.12)
 */
export interface BlockStateExtension {
    extend(world: BlockStateAccess, x: number, y: number, z: number, state: BlockState): BlockState;

    /**
     * The full block-ids this extension applies to. (Upstream returns a Collection —
     * some implementations used Lists — but only containment/iteration is needed,
     * so all ports use sets.)
     */
    getAffectedBlockIds(): ReadonlySet<string>;
}

/**
 * Port of the legacy BlockState#with(property, value): returns a new BlockState with
 * the given property added/replaced (the modern BlockState has no such method).
 */
export function withProperty(state: BlockState, property: string, value: string): BlockState {
    const properties = new Map(state.getProperties());
    properties.set(property, value);
    return new BlockState(state.getId(), properties);
}

/** Port of the legacy BlockState#getFullId() ("namespace:value") */
export function fullId(state: BlockState): string {
    return state.getId().getFormatted();
}
