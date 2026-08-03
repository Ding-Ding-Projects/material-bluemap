import type { Color } from "@material-bluemap/shared";
import type { BlockAccess } from "../block/BlockAccess.js";

export interface ColorModifier {
    apply(block: BlockAccess, color: Color): void;
}
