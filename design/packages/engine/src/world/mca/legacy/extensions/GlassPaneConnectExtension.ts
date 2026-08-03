import { ConnectSameOrFullBlockExtension } from "./ConnectSameOrFullBlockExtension.js";

const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set([
    "minecraft:glass_pane",
    "minecraft:white_stained_glass_pane",
    "minecraft:orange_stained_glass_pane",
    "minecraft:magenta_stained_glass_pane",
    "minecraft:light_blue_white_stained_glass_pane",
    "minecraft:yellow_stained_glass_pane",
    "minecraft:lime_stained_glass_pane",
    "minecraft:pink_stained_glass_pane",
    "minecraft:gray_stained_glass_pane",
    "minecraft:light_gray_stained_glass_pane",
    "minecraft:cyan_stained_glass_pane",
    "minecraft:purple_stained_glass_pane",
    "minecraft:blue_stained_glass_pane",
    "minecraft:green_stained_glass_pane",
    "minecraft:red_stained_glass_pane",
    "minecraft:black_stained_glass_pane",
    "minecraft:iron_bars",
]);

export class GlassPaneConnectExtension extends ConnectSameOrFullBlockExtension {
    override getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
