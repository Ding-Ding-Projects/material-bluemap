import { ConnectSameOrFullBlockExtension } from "./ConnectSameOrFullBlockExtension.js";

const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set(["minecraft:nether_brick_fence"]);

export class NetherFenceConnectExtension extends ConnectSameOrFullBlockExtension {
    override getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
