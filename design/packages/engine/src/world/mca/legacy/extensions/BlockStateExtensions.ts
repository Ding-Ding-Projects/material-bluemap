import { BlockState } from "../../../BlockState.js";
import { type BlockStateAccess, type BlockStateExtension, fullId } from "./BlockStateExtension.js";
import { DoorExtension } from "./DoorExtension.js";
import { DoubleChestExtension } from "./DoubleChestExtension.js";
import { DoublePlantExtension } from "./DoublePlantExtension.js";
import { FireExtension } from "./FireExtension.js";
import { GlassPaneConnectExtension } from "./GlassPaneConnectExtension.js";
import { NetherFenceConnectExtension } from "./NetherFenceConnectExtension.js";
import { RedstoneExtension } from "./RedstoneExtension.js";
import { SnowyExtension } from "./SnowyExtension.js";
import { StairShapeExtension } from "./StairShapeExtension.js";
import { TripwireConnectExtension } from "./TripwireConnectExtension.js";
import { WallConnectExtension } from "./WallConnectExtension.js";
import { WoodenFenceConnectExtension } from "./WoodenFenceConnectExtension.js";

/**
 * Registry of the legacy block-state extensions, keyed by affected full block-id
 * (upstream: the legacy MCAWorld's static BLOCK_STATE_EXTENSIONS multimap
 * from v0.10.3-mc1.12).
 */
const BLOCK_STATE_EXTENSIONS = new Map<string, BlockStateExtension[]>();

export function registerBlockStateExtension(extension: BlockStateExtension): void {
    for (const id of extension.getAffectedBlockIds()) {
        let extensions = BLOCK_STATE_EXTENSIONS.get(id);
        if (extensions === undefined) {
            extensions = [];
            BLOCK_STATE_EXTENSIONS.set(id, extensions);
        }
        extensions.push(extension);
    }
}

// upstream: legacy MCAWorld's static initializer (same registration order)
registerBlockStateExtension(new SnowyExtension());
registerBlockStateExtension(new StairShapeExtension());
registerBlockStateExtension(new FireExtension());
registerBlockStateExtension(new RedstoneExtension());
registerBlockStateExtension(new DoorExtension());
registerBlockStateExtension(new NetherFenceConnectExtension());
registerBlockStateExtension(new TripwireConnectExtension());
registerBlockStateExtension(new WallConnectExtension());
registerBlockStateExtension(new WoodenFenceConnectExtension());
registerBlockStateExtension(new GlassPaneConnectExtension());
registerBlockStateExtension(new DoublePlantExtension());
registerBlockStateExtension(new DoubleChestExtension());

const NO_EXTENSIONS: readonly BlockStateExtension[] = [];

/**
 * Port of the legacy MCAWorld#getExtendedBlockState (v0.10.3-mc1.12): runs every
 * registered extension affecting the given block-state's id, in registration order.
 *
 * Wiring: the modern MCAWorld must call this for block-states coming from pre-1.13
 * chunks only (Chunk_1_12, dataVersion <= 1343) — "only use extensions if old format
 * chunk (1.12), in the new format block-states are saved with extensions" — passing a
 * callback that resolves neighbor block-states through the world (across chunk
 * borders), e.g. (nx, ny, nz) => world.getChunkAtBlock(nx, nz).getBlockState(nx, ny, nz).
 */
export function applyLegacyExtensions(
    blockState: BlockState,
    x: number,
    y: number,
    z: number,
    getNeighbor: BlockStateAccess,
): BlockState {
    for (const ext of BLOCK_STATE_EXTENSIONS.get(fullId(blockState)) ?? NO_EXTENSIONS) {
        blockState = ext.extend(getNeighbor, x, y, z, blockState);
    }

    return blockState;
}
