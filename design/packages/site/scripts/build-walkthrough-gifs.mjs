#!/usr/bin/env node

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import gifenc from "gifenc";
import { PNG } from "pngjs";

const { GIFEncoder, applyPalette, quantize } = gifenc;

const IDS = [
    "navigation-drawer",
    "command-palette",
    "documentation-search",
    "regex-builder",
    "theme-switch",
    "language-tone",
    "tab-groups",
    "tab-discovery",
    "notification-history",
    "changelog-filter",
    "appearance-editor",
    "verified-download",
];
const WIDTH = 640;
const HEIGHT = 400;
const MAX_COLOURS = 96;
const FRAME_DELAY_MS = 780;

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(here, "..");
const args = process.argv.slice(2);
const framesIndex = args.indexOf("--frames");
if (framesIndex === -1 || args[framesIndex + 1] === undefined) {
    throw new Error("Usage: node scripts/build-walkthrough-gifs.mjs --frames <capture-directory>");
}
const frameRoot = resolve(process.cwd(), args[framesIndex + 1]);
const outputRoot = resolve(packageRoot, "src/assets/walkthroughs");
await mkdir(outputRoot, { recursive: true });

function cropAndScale(source) {
    const sourceRatio = source.width / source.height;
    const targetRatio = WIDTH / HEIGHT;
    const cropWidth =
        sourceRatio > targetRatio ? Math.round(source.height * targetRatio) : source.width;
    const cropHeight =
        sourceRatio > targetRatio ? source.height : Math.round(source.width / targetRatio);
    const offsetX = Math.floor((source.width - cropWidth) / 2);
    const offsetY = Math.floor((source.height - cropHeight) / 2);
    const output = new PNG({ width: WIDTH, height: HEIGHT });
    for (let y = 0; y < HEIGHT; y += 1) {
        const sourceY = Math.min(
            source.height - 1,
            offsetY + Math.floor((y / HEIGHT) * cropHeight),
        );
        for (let x = 0; x < WIDTH; x += 1) {
            const sourceX = Math.min(
                source.width - 1,
                offsetX + Math.floor((x / WIDTH) * cropWidth),
            );
            const from = (sourceY * source.width + sourceX) * 4;
            const to = (y * WIDTH + x) * 4;
            output.data[to] = source.data[from];
            output.data[to + 1] = source.data[from + 1];
            output.data[to + 2] = source.data[from + 2];
            output.data[to + 3] = 255;
        }
    }
    return output;
}

async function loadFrames(id) {
    const folder = join(frameRoot, id);
    const names = (await readdir(folder))
        .filter((name) => /^\d+.*\.png$/i.test(name))
        .sort((left, right) => left.localeCompare(right, "en"));
    if (names.length < 2) {
        throw new Error(`${id}: expected at least two ordered PNG frames in ${folder}`);
    }
    return Promise.all(
        names.map(async (name) => cropAndScale(PNG.sync.read(await readFile(join(folder, name))))),
    );
}

for (const id of IDS) {
    const frames = await loadFrames(id);
    const gif = GIFEncoder();
    frames.forEach((frame, index) => {
        const palette = quantize(frame.data, MAX_COLOURS, { format: "rgb444" });
        const indexed = applyPalette(frame.data, palette, "rgb444");
        gif.writeFrame(indexed, WIDTH, HEIGHT, {
            palette,
            delay: index === frames.length - 1 ? FRAME_DELAY_MS * 2 : FRAME_DELAY_MS,
            repeat: -1,
        });
    });
    gif.finish();
    const gifPath = join(outputRoot, `${id}.gif`);
    const pngPath = join(outputRoot, `${id}.png`);
    await writeFile(gifPath, gif.bytes());
    await writeFile(pngPath, PNG.sync.write(frames.at(-1), { colorType: 2 }));
    process.stdout.write(
        `${basename(gifPath)} ${gif.bytes().byteLength} bytes; ${frames.length} real capture frames\n`,
    );
}
