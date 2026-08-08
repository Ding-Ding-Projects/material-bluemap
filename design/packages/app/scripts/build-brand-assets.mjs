import { readFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const designRoot = resolve(here, "../../..");
const sourcePath = resolve(designRoot, "brand/worldlens-logo-source.png");
const check = process.argv.includes("--check");

const outputs = new Map([
    [resolve(designRoot, "brand/worldlens-logo-256.png"), 256],
    [resolve(designRoot, "packages/ui/public/assets/logo.png"), 256],
    [resolve(designRoot, "packages/ui/public/assets/logoCircle64.png"), 64],
    [resolve(designRoot, "packages/ui/public/assets/logoCircle512.png"), 512],
    [resolve(designRoot, "packages/site/src/assets/worldlens-logo.png"), 512],
]);

const icoSizes = [16, 20, 24, 32, 40, 48, 64, 128, 256];
const icoPath = resolve(designRoot, "packages/app/build/icon.ico");

async function resizedPng(size) {
    return sharp(sourcePath)
        .resize(size, size, { fit: "cover", kernel: sharp.kernel.lanczos3 })
        .png({ compressionLevel: 9, palette: true, quality: 100, effort: 10 })
        .toBuffer();
}

function makeIco(images) {
    const headerBytes = 6 + images.length * 16;
    const header = Buffer.alloc(headerBytes);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(images.length, 4);

    let offset = headerBytes;
    images.forEach(({ size, bytes }, index) => {
        const entry = 6 + index * 16;
        header.writeUInt8(size === 256 ? 0 : size, entry);
        header.writeUInt8(size === 256 ? 0 : size, entry + 1);
        header.writeUInt8(0, entry + 2);
        header.writeUInt8(0, entry + 3);
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(bytes.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += bytes.length;
    });

    return Buffer.concat([header, ...images.map(({ bytes }) => bytes)]);
}

async function ensureSource() {
    const metadata = await sharp(sourcePath).metadata();
    if (
        metadata.format !== "png" ||
        metadata.width === undefined ||
        metadata.height === undefined ||
        metadata.width !== metadata.height ||
        metadata.width < 512
    ) {
        throw new Error(
            `Worldlens logo source must be a square PNG at least 512px wide; got ${metadata.format ?? "unknown"} ${metadata.width ?? "?"}x${metadata.height ?? "?"}.`,
        );
    }
}

async function writeOrCheck(path, expected) {
    if (check) {
        try {
            if (!(await hasSameRaster(path, expected))) {
                throw new Error(`Brand asset is stale: ${path}`);
            }
        } catch (error) {
            if (error instanceof Error && error.message.startsWith("Brand asset is stale:")) throw error;
            throw new Error(`Brand asset is missing or unreadable: ${path}`);
        }
        return;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
}

async function raster(input) {
    return sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
}

async function hasSameRaster(actualPath, expected) {
    const [actual, expectedRaster] = await Promise.all([raster(actualPath), raster(expected)]);
    return (
        actual.info.width === expectedRaster.info.width &&
        actual.info.height === expectedRaster.info.height &&
        actual.info.channels === expectedRaster.info.channels &&
        actual.data.equals(expectedRaster.data)
    );
}

function readIcoImages(bytes) {
    if (bytes.length < 6 || bytes.readUInt16LE(0) !== 0 || bytes.readUInt16LE(2) !== 1) return [];
    const count = bytes.readUInt16LE(4);
    if (bytes.length < 6 + count * 16) return [];
    const images = [];
    for (let index = 0; index < count; index += 1) {
        const entry = 6 + index * 16;
        const length = bytes.readUInt32LE(entry + 8);
        const offset = bytes.readUInt32LE(entry + 12);
        if (offset + length > bytes.length) return [];
        images.push(bytes.subarray(offset, offset + length));
    }
    return images;
}

async function hasCurrentIco(expectedImages) {
    let current;
    try {
        current = await readFile(icoPath);
    } catch {
        return false;
    }
    const actualImages = readIcoImages(current);
    if (actualImages.length !== expectedImages.length) return false;
    for (let index = 0; index < actualImages.length; index += 1) {
        if (!(await hasSameRaster(actualImages[index], expectedImages[index].bytes))) return false;
    }
    return true;
}

await ensureSource();

for (const [path, size] of outputs) {
    await writeOrCheck(path, await resizedPng(size));
}

const icoImages = [];
for (const size of icoSizes) icoImages.push({ size, bytes: await resizedPng(size) });
if (check) {
    if (!(await hasCurrentIco(icoImages))) throw new Error(`Brand asset is stale: ${icoPath}`);
} else {
    await mkdir(dirname(icoPath), { recursive: true });
    await writeFile(icoPath, makeIco(icoImages));
}

console.log(
    check
        ? `Worldlens brand assets are current (${outputs.size} PNG destinations and ${icoSizes.length} ICO sizes).`
        : `Built Worldlens brand assets (${outputs.size} PNG destinations and ${icoSizes.length} ICO sizes).`,
);
