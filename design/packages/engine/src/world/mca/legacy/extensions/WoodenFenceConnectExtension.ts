import { ConnectSameOrFullBlockExtension } from "./ConnectSameOrFullBlockExtension.js";

const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set([
    "minecraft:fence",
    "minecraft:spruce_fence",
    "minecraft:birch_fence",
    "minecraft:jungle_fence",
    "minecraft:dark_oak_fence",
    "minecraft:acacia_fence",
]);

export class WoodenFenceConnectExtension extends ConnectSameOrFullBlockExtension {
    override getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
