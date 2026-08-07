import type { Key } from "@worldlens/shared";

export interface BlockEntity {
    getId(): Key;

    getX(): number;
    getY(): number;
    getZ(): number;

    isKeepPacked(): boolean;
}
