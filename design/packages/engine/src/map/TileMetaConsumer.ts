import type { Color } from "@material-bluemap/shared";

/**
 * upstream: map/TileMetaConsumer.java
 *
 * A {@code @FunctionalInterface}; ported as a function-type, which is what a
 * single-abstract-method interface is in TypeScript.
 */
export type TileMetaConsumer = (
    x: number,
    z: number,
    color: Color,
    height: number,
    blockLight: number,
) => void;
