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
        let actual;
        try {
            actual = await readFile(path);
        } catch {
            throw new Error(`Brand asset is missing or unreadable: ${path}`);
        }
        if (!actual.equals(expected)) throw new Error(`Brand asset is stale: ${path}`);
        return;
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, expected);
}

await ensureSource();

for (const [path, size] of outputs) {
    await writeOrCheck(path, await resizedPng(size));
}

const icoImages = [];
for (const size of icoSizes) icoImages.push({ size, bytes: await resizedPng(size) });
await writeOrCheck(icoPath, makeIco(icoImages));

console.log(
    check
        ? `Worldlens brand assets are current (${outputs.size} PNG destinations and ${icoSizes.length} ICO sizes).`
        : `Built Worldlens brand assets (${outputs.size} PNG destinations and ${icoSizes.length} ICO sizes).`,
);
