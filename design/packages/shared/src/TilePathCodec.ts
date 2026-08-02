/**
 * Codec for the "digit-split" tile/grid item paths used by BlueMap's file storages
 * and the webapp.
 *
 * Encoding matches {@code FileGridStorage#getItemPath} (core) and
 * {@code pathFromCoords} (webapp {@code Utils.js}): the position is encoded as
 * {@code "x<x>z<z>"} and a new path segment is started after every digit, with the
 * suffix appended to the last segment,
 * e.g. x=123, z=-45 with suffix ".prbm" becomes {@code "x1/2/3/z-4/5.prbm"}.
 *
 * Decoding matches the parsing in {@code FileGridStorage#stream}: the suffix is
 * stripped, all path separators are removed and the result is matched against
 * {@link ITEM_PATH_PATTERN}.
 */

export const ITEM_PATH_PATTERN: RegExp = /^x(-?\d+)z(-?\d+)$/;

export interface TileCoords {
    x: number;
    z: number;
}

/**
 * Encodes tile-coordinates into their (relative) storage path,
 * with "/" as the path separator.
 */
export function encodeTilePath(x: number, z: number, suffix: string = ""): string {
    const encodedPosition = "x" + (x | 0) + "z" + (z | 0);

    const folders: string[] = [];
    let folder = "";
    for (let i = 0; i < encodedPosition.length; i++) {
        const c = encodedPosition.charAt(i);
        folder += c;
        if (c >= "0" && c <= "9") {
            folders.push(folder);
            folder = "";
        }
    }

    const fileName = folders.pop() as string;
    folders.push(fileName + suffix);

    return folders.join("/");
}

/**
 * Decodes a (relative) storage path back into tile-coordinates.
 * Accepts "/" and "\" as path separators.
 * @return the decoded coordinates, or null if the path does not end with the
 * given suffix or is not a valid tile-path
 */
export function decodeTilePath(path: string, suffix: string = ""): TileCoords | null {
    let name = path;
    if (!name.endsWith(suffix)) return null;
    name = name.substring(0, name.length - suffix.length);
    name = name.split("/").join("").split("\\").join("");

    const match = ITEM_PATH_PATTERN.exec(name);
    if (match === null) return null;

    const x = Number.parseInt(match[1] as string, 10) | 0;
    const z = Number.parseInt(match[2] as string, 10) | 0;

    return { x, z };
}
