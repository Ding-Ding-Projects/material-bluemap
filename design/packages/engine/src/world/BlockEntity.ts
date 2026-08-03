import type { Key } from "@material-bluemap/shared";

export interface BlockEntity {
    getId(): Key;

    getX(): number;
    getY(): number;
    getZ(): number;

    isKeepPacked(): boolean;
}
