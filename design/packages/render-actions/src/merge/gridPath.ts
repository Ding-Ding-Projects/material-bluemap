/**
 * upstream: `FileGridStorage#getItemPath` and `FileGridStorage#stream`.
 *
 * BlueMap spreads a tile grid across directories so no single directory holds a
 * hundred thousand files. The cell `(x, z)` is written as `x<X>z<Z>` and then split
 * into path segments after every digit, with the final segment carrying the suffix:
 *
 *     (15, 0)   -> "x15z0"   -> x1/5/z0.prbm.gz
 *     (12, -34) -> "x12z-34" -> x1/2/z-3/4.png
 *
 * The merge needs both directions: the encoder to write a rebuilt lowres tile back to
 * the place the webapp will look for it, and the decoder to turn a shard's file listing
 * into tile coordinates so overlapping tiles can be found.
 */

const CELL_PATTERN = /^x(-?\d+)z(-?\d+)$/;

/** A tile-grid cell coordinate. */
export interface GridCell {
    x: number;
    z: number;
}

/** The storage-relative path (always forward-slashed) of a grid cell. */
export function gridCellPath(cell: GridCell, suffix: string): string {
    const encoded = "x" + cell.x + "z" + cell.z;

    const segments: string[] = [];
    let segment = "";
    for (const character of encoded) {
        segment += character;
        if (character >= "0" && character <= "9") {
            segments.push(segment);
            segment = "";
        }
    }

    const last = segments.pop();
    if (last === undefined)
        throw new Error("Cell (" + cell.x + ", " + cell.z + ") produced no path segments");
    segments.push(last + suffix);

    return segments.join("/");
}

/**
 * The grid cell a storage-relative path refers to, or null when the path is not a
 * tile at all. Matches upstream by concatenating the segments and re-parsing, so a
 * stray file in the tile tree is ignored rather than mistaken for a tile.
 */
export function parseGridCellPath(path: string, suffix: string): GridCell | null {
    const normalized = path.split("\\").join("/");
    if (!normalized.endsWith(suffix)) return null;

    const withoutSuffix = normalized.slice(0, normalized.length - suffix.length);
    const match = CELL_PATTERN.exec(withoutSuffix.split("/").join(""));
    if (match === null) return null;

    const [, rawX = "0", rawZ = "0"] = match;
    return { x: Number.parseInt(rawX, 10), z: Number.parseInt(rawZ, 10) };
}

/** A stable string key for a cell, for use in maps and sorting. */
export function cellKey(cell: GridCell): string {
    return cell.x + "," + cell.z;
}

/** The inverse of {@link cellKey}. */
export function parseCellKey(key: string): GridCell {
    const [rawX = "0", rawZ = "0"] = key.split(",");
    return { x: Number.parseInt(rawX, 10), z: Number.parseInt(rawZ, 10) };
}
