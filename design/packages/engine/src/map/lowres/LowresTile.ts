import { PNG } from "pngjs";
import type { Color, Vector2i } from "@material-bluemap/shared";

/**
 * upstream: {@code BufferedImage#getRGB} on a TYPE_INT_ARGB image (straight alpha),
 * returning java's signed int
 */
function getRgb(image: PNG, x: number, y: number): number {
    const i = (image.width * y + x) << 2;
    return (
        ((image.data[i + 3]! << 24) |
            (image.data[i]! << 16) |
            (image.data[i + 1]! << 8) |
            image.data[i + 2]!) |
        0
    );
}

/** upstream: {@code BufferedImage#setRGB} on a TYPE_INT_ARGB image (straight alpha) */
function setRgb(image: PNG, x: number, y: number, argb: number): void {
    const i = (image.width * y + x) << 2;
    image.data[i] = (argb >>> 16) & 0xff;
    image.data[i + 1] = (argb >>> 8) & 0xff;
    image.data[i + 2] = argb & 0xff;
    image.data[i + 3] = (argb >>> 24) & 0xff;
}

/**
 * upstream: map/lowres/LowresTile.java
 *
 * The tile is one image of {@code (size.x) x (size.y * 2)} pixels: the upper half holds
 * the straight-alpha color of every cell, the lower half packs the cell's height into the
 * low 16 bits and its block-light into the next 8, with a fully opaque alpha so the png
 * round-trips those bytes untouched.
 *
 * Port notes:
 * - {@code java.awt.image.BufferedImage} + {@code ImageIO} become pngjs' {@link PNG}, the
 *   same substitution the resource-pack texture layer already makes. Both are 8-bit
 *   straight-alpha RGBA, so {@code getRGB}/{@code setRGB} map across directly.
 * - upstream's {@code ReentrantReadWriteLock} has no counterpart: javascript has no
 *   preemption, so a set can not interleave with a save.
 * - {@code save(OutputStream)} returns the encoded bytes instead of writing to a stream,
 *   matching the buffer-shaped storage layer.
 */
export class LowresTile {
    /** upstream: {@code Integer.MIN_VALUE} */
    static readonly HEIGHT_UNDEFINED = -2147483648;

    private readonly texture: PNG;
    private readonly size: Vector2i;

    /** upstream: {@code LowresTile(Vector2i tileSize)} */
    constructor(tileSize: Vector2i);
    /** upstream: {@code LowresTile(Vector2i tileSize, InputStream in)} */
    constructor(tileSize: Vector2i, data: Uint8Array);
    constructor(tileSize: Vector2i, data?: Uint8Array) {
        this.size = tileSize.add(1, 1); // add 1 for seamless edges

        if (data === undefined) {
            this.texture = new PNG({ width: this.size.getX(), height: this.size.getY() * 2 });
            return;
        }

        // upstream throws "No registered ImageReader is able to read the image-stream" when
        // ImageIO.read returns null; pngjs throws its own decode-error instead
        this.texture = PNG.sync.read(Buffer.from(data.buffer, data.byteOffset, data.byteLength));

        if (
            this.texture.width !== this.size.getX() ||
            this.texture.height !== this.size.getY() * 2
        ) {
            throw new Error("Size of tile does not match");
        }
    }

    set(x: number, z: number, color: Color, height: number, blockLight: number): void {
        setRgb(this.texture, x, z, color.straight().getInt());
        setRgb(
            this.texture,
            x,
            this.size.getY() + z,
            ((height & 0x0000ffff) | ((blockLight << 16) & 0x00ff0000) | 0xff000000) | 0,
        );
    }

    getColor(x: number, z: number, target: Color): Color {
        return target.set(getRgb(this.texture, x, z));
    }

    getHeight(x: number, z: number): number {
        const height = getRgb(this.texture, x, this.size.getY() + z) & 0x0000ffff;
        if (height > 0x00008000) return height | 0xffff0000;
        return height;
    }

    getBlockLight(x: number, z: number): number {
        return (getRgb(this.texture, x, this.size.getY() + z) & 0x00ff0000) >> 16;
    }

    /** upstream: {@code void save(OutputStream out)} */
    save(): Buffer {
        return PNG.sync.write(this.texture);
    }
}
