import { LOD_FACTOR, LOWRES_TILE_SIZE } from "../bluemap.js";
import { blankImage, decodePng, encodePng, type RgbaImage } from "./png.js";
import { cellKey, parseCellKey, type GridCell } from "./gridPath.js";

/**
 * upstream: `map/lowres/LowresTile.java` and `map/lowres/LowresLayer.java`.
 *
 * A lowres tile is one PNG holding two stacked half-images, each `tileSize + 1` square
 * (the extra row and column exist so neighbouring tiles share an edge and the webapp
 * can interpolate across a tile seam):
 *
 *   top half     straight ARGB colour of the column
 *   bottom half  0xFF000000 | (blockLight << 16) | (height & 0xFFFF)
 *
 * The bottom half is what makes a shard-aware merge possible. A pixel BlueMap has never
 * written is left at the `BufferedImage` default of all zeros, so its alpha is 0, while
 * every pixel BlueMap does write gets alpha 0xFF unconditionally. "Alpha of the meta
 * pixel" is therefore an exact written/not-written flag, with no in-band value that
 * could be mistaken for either.
 */

/** The width and height of each half-image, for a given lowres tile size. */
export function halfImageSize(tileSize: number): number {
    return tileSize + 1;
}

/** A colour or meta sample, as the four bytes the PNG stores. */
export interface Rgba {
    r: number;
    g: number;
    b: number;
    a: number;
}

/** One decoded lowres tile. */
export class LowresTile {
    readonly tileSize: number;
    /** the width and height of one half, i.e. `tileSize + 1` */
    readonly size: number;
    readonly image: RgbaImage;

    private constructor(tileSize: number, image: RgbaImage) {
        this.tileSize = tileSize;
        this.size = halfImageSize(tileSize);
        this.image = image;
    }

    /** An all-transparent tile, matching a freshly constructed upstream `LowresTile`. */
    static blank(tileSize = LOWRES_TILE_SIZE): LowresTile {
        const size = halfImageSize(tileSize);
        return new LowresTile(tileSize, blankImage(size, size * 2));
    }

    /** Decodes a stored lowres tile, rejecting anything that is not the expected shape. */
    static decode(buffer: Buffer, tileSize = LOWRES_TILE_SIZE): LowresTile {
        const image = decodePng(buffer);
        const size = halfImageSize(tileSize);
        if (image.width !== size || image.height !== size * 2)
            throw new Error(
                "Lowres tile has the wrong size: expected " +
                    size +
                    "x" +
                    size * 2 +
                    " but got " +
                    image.width +
                    "x" +
                    image.height,
            );
        return new LowresTile(tileSize, image);
    }

    encode(): Buffer {
        return encodePng(this.image);
    }

    private offsetOf(x: number, z: number): number {
        return (z * this.size + x) * 4;
    }

    getColor(x: number, z: number): Rgba {
        const at = this.offsetOf(x, z);
        const data = this.image.data;
        return { r: data[at]!, g: data[at + 1]!, b: data[at + 2]!, a: data[at + 3]! };
    }

    getMeta(x: number, z: number): Rgba {
        const at = this.offsetOf(x, this.size + z);
        const data = this.image.data;
        return { r: data[at]!, g: data[at + 1]!, b: data[at + 2]!, a: data[at + 3]! };
    }

    /**
     * Reads a colour into a caller-owned object rather than allocating one.
     *
     * The lod rebuild reads twenty-five pixels for every pixel it writes, which is
     * 250000 reads per lod-1 tile at BlueMap's real tile size, so the allocation is
     * worth avoiding on a map with hundreds of tiles.
     */
    readColorInto(x: number, z: number, out: Rgba): Rgba {
        const at = this.offsetOf(x, z);
        const data = this.image.data;
        out.r = data[at]!;
        out.g = data[at + 1]!;
        out.b = data[at + 2]!;
        out.a = data[at + 3]!;
        return out;
    }

    /**
     * Whether BlueMap ever wrote this pixel. See the class comment: the meta pixel's
     * alpha is set to 0xFF by every write and is 0 in a tile that was never touched.
     */
    isWritten(x: number, z: number): boolean {
        return this.image.data[this.offsetOf(x, this.size + z) + 3] !== 0;
    }

    /**
     * Whether this pixel holds a rendered column rather than an erasure.
     *
     * "Written" is not the same as "rendered", and the difference is what makes a
     * sharded lowres merge tricky. When a shard meets a hires tile outside its
     * render-mask it does not skip it: `HiresModelManager#unrender` deletes the tile and
     * then writes transparent black at height 0 and block-light 0 across every column
     * the tile covered — an erasure, stamped with the same alpha 0xFF as a real write.
     * A shard's lowres tile therefore contains active denials of the terrain its
     * neighbours rendered, and taking "the first shard that wrote this pixel" would let
     * those denials win.
     *
     * Verified: rendering a 1000x1000 world as two shards cut at block 514 left 509409
     * lod-1 pixels where one shard held real terrain and the other held an erasure.
     *
     * An all-air column renders to exactly this same empty value, so an erasure and a
     * genuinely void column are indistinguishable. That is harmless: both shards then
     * write the identical empty pixel and the merged result is the same either way.
     */
    hasContent(x: number, z: number): boolean {
        if (!this.isWritten(x, z)) return false;
        const color = this.getColor(x, z);
        if (color.a !== 0) return true;
        const meta = this.getMeta(x, z);
        return meta.r !== 0 || meta.g !== 0 || meta.b !== 0;
    }

    /**
     * upstream: `LowresTile#getHeight` — the low 16 bits of the meta pixel, sign-extended.
     * The comparison really is `>` and not `>=`, so 0x8000 stays positive; reproduced as-is
     * so a merged tile and a directly rendered one agree on every value.
     */
    getHeight(x: number, z: number): number {
        const at = this.offsetOf(x, this.size + z);
        const data = this.image.data;
        const height = (data[at + 1]! << 8) | data[at + 2]!;
        if (height > 0x8000) return height | ~0xffff;
        return height;
    }

    /** upstream: `LowresTile#getBlockLight` — the meta pixel's red channel. */
    getBlockLight(x: number, z: number): number {
        return this.image.data[this.offsetOf(x, this.size + z)]!;
    }

    /** upstream: `LowresTile#set`. `color` is straight (not premultiplied) RGBA. */
    set(x: number, z: number, color: Rgba, height: number, blockLight: number): void {
        const data = this.image.data;

        const colorAt = this.offsetOf(x, z);
        data[colorAt] = color.r;
        data[colorAt + 1] = color.g;
        data[colorAt + 2] = color.b;
        data[colorAt + 3] = color.a;

        const metaAt = this.offsetOf(x, this.size + z);
        data[metaAt] = blockLight & 0xff;
        data[metaAt + 1] = (height >> 8) & 0xff;
        data[metaAt + 2] = height & 0xff;
        data[metaAt + 3] = 0xff;
    }

    /** Copies one pixel (both halves) out of another tile of the same size. */
    copyPixelFrom(source: LowresTile, x: number, z: number): void {
        this.set(x, z, source.getColor(x, z), source.getHeight(x, z), source.getBlockLight(x, z));
    }
}

/**
 * upstream: `util/math/Color.java`, in float32 so the arithmetic matches Java's.
 *
 * Every operation is wrapped in `Math.fround` because upstream's `Color` fields are
 * `float`, and averaging twenty-five samples in double precision and then truncating
 * to a byte does not always land on the same byte as averaging them in single
 * precision. `getInt` truncates rather than rounds, which is where a one-bit
 * difference in the average becomes a one-step difference in the stored colour.
 */
export class PremultipliedAccumulator {
    private r = 0;
    private g = 0;
    private b = 0;
    private a = 0;

    reset(): void {
        this.r = 0;
        this.g = 0;
        this.b = 0;
        this.a = 0;
    }

    /** upstream: `add(color.premultiplied())` where `color` came from `set(int)`. */
    addStraight(color: Rgba): void {
        const alpha = Math.fround(color.a / 255);
        this.r = Math.fround(this.r + Math.fround(Math.fround(color.r / 255) * alpha));
        this.g = Math.fround(this.g + Math.fround(Math.fround(color.g / 255) * alpha));
        this.b = Math.fround(this.b + Math.fround(Math.fround(color.b / 255) * alpha));
        this.a = Math.fround(this.a + alpha);
    }

    /** upstream: `div(count)` then `straight()` then `getInt()`. */
    averageStraight(count: number): Rgba {
        const scale = Math.fround(1 / count);
        let r = Math.fround(this.r * scale);
        let g = Math.fround(this.g * scale);
        let b = Math.fround(this.b * scale);
        const a = Math.fround(this.a * scale);

        if (a > 0) {
            const inverse = Math.fround(1 / a);
            r = Math.fround(r * inverse);
            g = Math.fround(g * inverse);
            b = Math.fround(b * inverse);
        }

        return {
            r: toByte(r),
            g: toByte(g),
            b: toByte(b),
            a: toByte(a),
        };
    }
}

/** upstream: `Color#getInt` — `(int) (component * 255) & 0xFF`, a truncation. */
function toByte(component: number): number {
    return Math.trunc(Math.fround(component * 255)) & 0xff;
}

/**
 * upstream: `LowresLayer#set` — writes the pixel and then repeats it into the
 * neighbouring tiles' shared edge row and column, which is what keeps tile seams
 * from showing in the webapp.
 */
export function setOnLayer(
    layer: Map<string, LowresTile>,
    tileSize: number,
    cell: GridCell,
    pixelX: number,
    pixelZ: number,
    color: Rgba,
    height: number,
    blockLight: number,
): void {
    const write = (target: GridCell, x: number, z: number): void => {
        const key = cellKey(target);
        let tile = layer.get(key);
        if (tile === undefined) {
            tile = LowresTile.blank(tileSize);
            layer.set(key, tile);
        }
        tile.set(x, z, color, height, blockLight);
    };

    write(cell, pixelX, pixelZ);
    if (pixelX === 0) write({ x: cell.x - 1, z: cell.z }, tileSize, pixelZ);
    if (pixelZ === 0) write({ x: cell.x, z: cell.z - 1 }, pixelX, tileSize);
    if (pixelX === 0 && pixelZ === 0)
        write({ x: cell.x - 1, z: cell.z - 1 }, tileSize, tileSize);
}

/**
 * upstream: the second half of `LowresLayer#saveTile` — "prepare for the most confusing
 * grid-math you will ever see".
 *
 * Each tile of one lod is reduced by averaging `lodFactor * lodFactor` pixel blocks, and
 * the resulting `groupCount` square of averages is written into the quadrant of the next
 * lod's tile that this tile occupies.
 *
 * BlueMap runs this while rendering, which is exactly why a sharded render cannot keep
 * the shards' own lod 2 and above: a shard averages over its half-filled lod-1 tile and
 * folds the untouched pixels in as transparent black. The resulting pixel is wrong, and
 * because every written pixel carries alpha 0xFF it is indistinguishable from a right
 * one. Re-deriving from the merged lod 1 is the only way to get the real value back.
 */
export function deriveNextLod(
    source: Map<string, LowresTile>,
    tileSize = LOWRES_TILE_SIZE,
    lodFactor = LOD_FACTOR,
): Map<string, LowresTile> {
    const next = new Map<string, LowresTile>();
    const groupCount = Math.floor(tileSize / lodFactor);
    const accumulator = new PremultipliedAccumulator();
    const sample: Rgba = { r: 0, g: 0, b: 0, a: 0 };

    // sorted so the result does not depend on map insertion order
    const keys = [...source.keys()].sort();

    for (const key of keys) {
        const tile = source.get(key)!;
        const cell = parseCellKey(key);

        const nextCell = {
            x: Math.floor(cell.x / lodFactor),
            z: Math.floor(cell.z / lodFactor),
        };
        const quadrantX = modFloor(cell.x, lodFactor) * groupCount;
        const quadrantZ = modFloor(cell.z, lodFactor) * groupCount;

        for (let groupX = 0; groupX < groupCount; groupX++) {
            for (let groupZ = 0; groupZ < groupCount; groupZ++) {
                accumulator.reset();
                let heightSum = 0;
                let blockLightSum = 0;
                let count = 0;

                for (let x = 0; x < lodFactor; x++) {
                    for (let z = 0; z < lodFactor; z++) {
                        const sampleX = groupX * lodFactor + x;
                        const sampleZ = groupZ * lodFactor + z;
                        count++;
                        accumulator.addStraight(tile.readColorInto(sampleX, sampleZ, sample));
                        heightSum += tile.getHeight(sampleX, sampleZ);
                        blockLightSum += tile.getBlockLight(sampleX, sampleZ);
                    }
                }

                setOnLayer(
                    next,
                    tileSize,
                    nextCell,
                    quadrantX + groupX,
                    quadrantZ + groupZ,
                    accumulator.averageStraight(count),
                    // java integer division truncates toward zero
                    Math.trunc(heightSum / count),
                    Math.trunc(blockLightSum / count),
                );
            }
        }
    }

    return next;
}

/** upstream: `Math.floorMod` */
function modFloor(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

/** What happened when several shards' versions of one lowres tile were combined. */
export interface CompositeResult {
    tile: LowresTile;
    /** pixels where exactly one shard held rendered terrain */
    claimedPixels: number;
    /** pixels every shard had either erased or never touched */
    emptyPixels: number;
    /**
     * Pixels where a shard's erasure lost to another shard's rendered terrain.
     *
     * This is the normal, expected case rather than a problem, and it is counted so the
     * run summary can show that the erasures really were overruled.
     */
    overruledErasures: number;
    /**
     * Pixels where two shards each held rendered terrain, and disagreed.
     *
     * With shard cuts on the hires tile grid this must be zero: a lowres pixel's terrain
     * comes from the shard that rendered the column beneath it, and only one shard
     * renders any column. A non-zero count means the cut was misaligned and the merge is
     * being asked to guess, so it is reported rather than resolved.
     */
    conflictingPixels: number;
    /** an example conflict, for the failure message */
    firstConflict: { x: number; z: number } | null;
}

/**
 * Combines several shards' versions of one lowres tile into the tile a single
 * unsharded render would have produced.
 *
 * Three states per pixel, in priority order: rendered terrain, an erasure or genuinely
 * void column, and never touched. Terrain always wins, because a shard only ever erases
 * a column that belongs to somebody else (see {@link LowresTile.hasContent}).
 */
export function compositeLowresTile(sources: LowresTile[], tileSize: number): CompositeResult {
    const merged = LowresTile.blank(tileSize);
    const size = halfImageSize(tileSize);

    let claimedPixels = 0;
    let emptyPixels = 0;
    let overruledErasures = 0;
    let conflictingPixels = 0;
    let firstConflict: { x: number; z: number } | null = null;

    for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
            let terrain: LowresTile | null = null;
            let empty: LowresTile | null = null;
            let erasures = 0;

            for (const source of sources) {
                if (!source.isWritten(x, z)) continue;

                if (!source.hasContent(x, z)) {
                    erasures++;
                    empty ??= source;
                    continue;
                }

                if (terrain === null) {
                    terrain = source;
                    continue;
                }
                if (!samePixel(terrain, source, x, z)) {
                    conflictingPixels++;
                    if (firstConflict === null) firstConflict = { x, z };
                }
            }

            const winner = terrain ?? empty;
            if (winner === null) continue;

            merged.copyPixelFrom(winner, x, z);
            if (terrain === null) emptyPixels++;
            else {
                claimedPixels++;
                overruledErasures += erasures;
            }
        }
    }

    return { tile: merged, claimedPixels, emptyPixels, overruledErasures, conflictingPixels, firstConflict };
}

function samePixel(a: LowresTile, b: LowresTile, x: number, z: number): boolean {
    const colorA = a.getColor(x, z);
    const colorB = b.getColor(x, z);
    if (colorA.r !== colorB.r || colorA.g !== colorB.g) return false;
    if (colorA.b !== colorB.b || colorA.a !== colorB.a) return false;

    const metaA = a.getMeta(x, z);
    const metaB = b.getMeta(x, z);
    return metaA.r === metaB.r && metaA.g === metaB.g && metaA.b === metaB.b;
}
