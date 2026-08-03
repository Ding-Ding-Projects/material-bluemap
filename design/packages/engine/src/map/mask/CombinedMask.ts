import { Tristate } from "../../util/Tristate.js";
import { Mask } from "./Mask.js";

/** upstream: CombinedMask.MaskLayer (a private record) */
interface MaskLayer {
    readonly mask: Mask;
    readonly value: boolean;
}

/** upstream: map/mask/CombinedMask.java */
export class CombinedMask implements Mask {
    private readonly layers: MaskLayer[] = [];

    add(mask: Mask, value: boolean): void {
        if (!value && this.layers.length === 0) this.layers.push({ mask: Mask.ALL, value: true });
        this.layers.push({ mask, value });
    }

    test(x: number, y: number, z: number): boolean;
    test(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Tristate;
    test(
        a: number,
        b: number,
        c: number,
        maxX?: number,
        maxY?: number,
        maxZ?: number,
    ): boolean | Tristate {
        if (maxX === undefined || maxY === undefined || maxZ === undefined) {
            for (let i = this.layers.length - 1; i >= 0; i--) {
                const layer = this.layers[i]!;
                if (!layer.mask.test(a, b, c)) continue;
                return layer.value;
            }
            return this.layers.length === 0;
        }

        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i]!;
            const result = layer.mask.test(a, b, c, maxX, maxY, maxZ);
            if (result === Tristate.FALSE) continue;
            if (result === Tristate.UNDEFINED) return Tristate.UNDEFINED;
            return Tristate.valueOf(layer.value);
        }
        return Tristate.valueOf(this.layers.length === 0);
    }

    submask(
        minX: number,
        minY: number,
        minZ: number,
        maxX: number,
        maxY: number,
        maxZ: number,
    ): Mask {
        const test = this.test(minX, minY, minZ, maxX, maxY, maxZ);
        if (test === Tristate.TRUE) return Mask.ALL;
        if (test === Tristate.FALSE) return Mask.NONE;

        const optimized = new CombinedMask();
        for (const layer of this.layers) {
            if (
                optimized.layers.length !== 0 &&
                layer.mask.test(minX, minY, minZ, maxX, maxY, maxZ) === Tristate.FALSE
            )
                continue;
            optimized.add(layer.mask.submask(minX, minY, minZ, maxX, maxY, maxZ), layer.value);
        }
        return optimized;
    }

    isEdge(minX: number, minZ: number, maxX: number, maxZ: number): boolean {
        for (let i = this.layers.length - 1; i >= 0; i--) {
            const layer = this.layers[i]!;
            if (layer.mask.isEdge(minX, minZ, maxX, maxZ)) return true;
        }
        return false;
    }

    size(): number {
        return this.layers.length;
    }

    inverted(): Mask {
        return Mask.inverted(this);
    }
}
