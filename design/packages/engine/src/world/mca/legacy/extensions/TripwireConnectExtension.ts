import { ConnectExtension } from "./ConnectExtension.js";

const AFFECTED_BLOCK_IDS: ReadonlySet<string> = new Set(["minecraft:tripwire"]);

export class TripwireConnectExtension extends ConnectExtension {
    override getAffectedBlockIds(): ReadonlySet<string> {
        return AFFECTED_BLOCK_IDS;
    }
}
