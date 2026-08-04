#!/usr/bin/env node
/**
 * Proves the comparison actually catches things.
 *
 *   node tools/oracle/selftest.mjs
 *
 * A gate nobody has ever seen fail is not evidence of anything: a harness with an
 * inverted condition, a swallowed exception or a classifier that quietly routes every
 * hires tile into a "compare loosely" branch reports "identical" forever and everyone
 * believes it. So this builds two synthetic map directories with **known** differences
 * planted in them and asserts that each one is found, named and located.
 *
 * It needs no jar, no world and no render, so it runs in a second and belongs in CI.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, gzipSync } from "node:zlib";

import { compareMaps, classify } from "./lib/compareMaps.mjs";
import { diffRenderState } from "./lib/renderstate.mjs";
import { decodePng } from "./lib/png.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = join(HERE, "out", "selftest");

// #region a tiny PNG encoder, so the test can plant a known pixel difference

function crc32(buffer) {
    let table = crc32.table;
    if (table === undefined) {
        table = crc32.table = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            table[n] = c;
        }
    }
    let crc = -1;
    for (let i = 0; i < buffer.length; i++) crc = table[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(typeAndData), 0);
    return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Encodes 8-bit RGBA as a non-interlaced PNG.
 * @param {number} filterType 0 (none) or 1 (sub) — two encodings of the same image, which
 *        is how the test produces a byte-different but pixel-identical pair.
 */
function encodePng(width, height, pixels, filterType = 0) {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8); // bit depth
    ihdr.writeUInt8(6, 9); // colour type: rgba
    ihdr.writeUInt8(0, 10); // compression
    ihdr.writeUInt8(0, 11); // filter
    ihdr.writeUInt8(0, 12); // interlace

    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (stride + 1)] = filterType;
        for (let x = 0; x < stride; x++) {
            const value = pixels[y * stride + x];
            const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
            raw[y * (stride + 1) + 1 + x] = filterType === 1 ? (value - left) & 0xff : value;
        }
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw)),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}

// #endregion

function gradient(width, height, tweak = null) {
    const pixels = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const p = (y * width + x) * 4;
            pixels[p] = (x * 7) & 0xff;
            pixels[p + 1] = (y * 11) & 0xff;
            pixels[p + 2] = (x * y) & 0xff;
            pixels[p + 3] = 0xff;
        }
    }
    if (tweak !== null) {
        const p = (tweak.y * width + tweak.x) * 4;
        pixels[p + 1] = (pixels[p + 1] + 1) & 0xff;
    }
    return pixels;
}

async function write(root, relativePath, data) {
    const path = join(root, ...relativePath.split("/"));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
}

const failures = [];
function check(name, condition, detail = "") {
    if (condition) {
        process.stdout.write(`  ok   ${name}\n`);
    } else {
        process.stdout.write(`  FAIL ${name}${detail === "" ? "" : " — " + detail}\n`);
        failures.push(name);
    }
}

async function main() {
    await rm(WORK, { recursive: true, force: true });
    const reference = join(WORK, "reference");
    const ported = join(WORK, "ported");

    // --- files that must compare EQUAL ------------------------------------------------

    const sameTile = Buffer.from("PRBM-ish payload, identical on both sides", "utf8");
    await write(reference, "tiles/0/x0/z0.prbm.gz", gzipSync(sameTile));
    await write(ported, "tiles/0/x0/z0.prbm.gz", gzipSync(sameTile, { level: 1 }));

    const image = gradient(9, 6);
    await write(reference, "tiles/1/x0/z0.png", encodePng(9, 6, image, 0));
    await write(ported, "tiles/1/x0/z0.png", encodePng(9, 6, image, 1));

    // gson html-escapes `<`, `>`, `&`, `=` and `'`; JSON.stringify does not. Same value.
    await write(reference, "settings.json", Buffer.from('{"name":"a \\u003c b"}', "utf8"));
    await write(ported, "settings.json", Buffer.from('{"name":"a < b"}', "utf8"));

    await write(reference, "live/players.json", Buffer.from("{}", "utf8"));
    await write(ported, "live/players.json", Buffer.from("{}", "utf8"));

    // --- files with a PLANTED difference ----------------------------------------------

    const tileA = Buffer.alloc(64);
    for (let i = 0; i < tileA.length; i++) tileA[i] = i;
    const tileB = Buffer.from(tileA);
    tileB[37] = 0xaa; // a single byte, deep inside a gzip stream
    await write(reference, "tiles/0/x0/z1.prbm.gz", gzipSync(tileA));
    await write(ported, "tiles/0/x0/z1.prbm.gz", gzipSync(tileB));

    await write(reference, "tiles/1/x0/z1.png", encodePng(9, 6, gradient(9, 6), 0));
    await write(ported, "tiles/1/x0/z1.png", encodePng(9, 6, gradient(9, 6, { x: 4, y: 2 }), 0));

    const texturesA = JSON.stringify([{ id: "minecraft:block/stone" }, { id: "minecraft:block/dirt" }]);
    const texturesB = JSON.stringify([{ id: "minecraft:block/stone" }, { id: "minecraft:block/sand" }]);
    await write(reference, "textures.json.gz", gzipSync(Buffer.from(texturesA, "utf8")));
    await write(ported, "textures.json.gz", gzipSync(Buffer.from(texturesB, "utf8")));

    await write(reference, "live/markers.json", Buffer.from('{"sets":{"a":1}}', "utf8"));
    await write(ported, "live/markers.json", Buffer.from('{"sets":{"a":2}}', "utf8"));

    // --- files present on one side only -----------------------------------------------

    await write(reference, "tiles/0/x9/z9.prbm.gz", gzipSync(Buffer.from("only java", "utf8")));
    await write(ported, "tiles/0/x8/z8.prbm.gz", gzipSync(Buffer.from("only typescript", "utf8")));

    // ----------------------------------------------------------------------------------

    process.stdout.write("tools/oracle selftest\n\n");

    check(
        "classify routes a hires tile to a gunzip-then-bytes comparison",
        classify("tiles/0/x0/z0.prbm.gz").category === "hires" &&
            classify("tiles/0/x0/z0.prbm.gz").mode === "gunzip-bytes",
    );
    check(
        "classify routes a lowres tile to the pixel comparison",
        classify("tiles/2/x-1/z0.png").category === "lowres" &&
            classify("tiles/2/x-1/z0.png").mode === "png",
    );
    check(
        "classify does not route a hires tile through the json path",
        classify("tiles/0/x0/z0.prbm.gz").mode !== "json",
    );

    const roundTripped = decodePng(encodePng(9, 6, image, 1));
    check(
        "the png reader round-trips a sub-filtered image",
        roundTripped.width === 9 &&
            roundTripped.height === 6 &&
            Buffer.compare(roundTripped.pixels, image) === 0,
    );

    const comparison = await compareMaps(reference, ported);

    const byFile = new Map(comparison.divergences.map((d) => [d.file, d]));
    const byFileReencoded = new Map(comparison.reencoded.map((d) => [d.file, d]));

    check("the comparison did not pass", comparison.ok === false);
    check(
        "identical gzip payloads compressed at different levels compare equal",
        !byFile.has("tiles/0/x0/z0.prbm.gz"),
        JSON.stringify(byFile.get("tiles/0/x0/z0.prbm.gz")),
    );
    check(
        "a pixel-identical, byte-different png is reported as a re-encode, not silently equal",
        byFileReencoded.get("tiles/1/x0/z0.png")?.kind === "png-reencode" &&
            !byFile.has("tiles/1/x0/z0.png"),
        JSON.stringify(byFileReencoded.get("tiles/1/x0/z0.png")),
    );
    check(
        "gson's html-escaping in settings.json does not count as a difference",
        !byFile.has("settings.json"),
        JSON.stringify(byFile.get("settings.json")),
    );

    const hires = byFile.get("tiles/0/x0/z1.prbm.gz");
    check(
        "a one-byte hires difference is found at the right offset",
        hires?.kind === "byte" && hires.offset === 37,
        JSON.stringify(hires),
    );
    check(
        "the hires report names both sides' bytes",
        typeof hires?.message === "string" &&
            hires.message.includes("0x25") &&
            hires.message.includes("0xaa"),
        hires?.message,
    );

    const lowres = byFile.get("tiles/1/x0/z1.png");
    check(
        "a one-pixel lowres difference is found at the right pixel",
        lowres?.kind === "pixel" && lowres.message.includes("x=4") && lowres.message.includes("y=2"),
        JSON.stringify(lowres),
    );

    const textures = byFile.get("textures.json.gz");
    check(
        "a textures.json difference is reported as bytes AND as json",
        textures?.kind === "byte" &&
            (textures.detail ?? []).some((line) => line.includes("as json:")),
        JSON.stringify(textures),
    );

    const markers = byFile.get("live/markers.json");
    check(
        "a markers.json difference names the json path",
        markers?.kind === "json" && markers.message.includes("$.sets.a"),
        JSON.stringify(markers),
    );

    check(
        "a file only the java render wrote is reported",
        comparison.onlyInReference.includes("tiles/0/x9/z9.prbm.gz"),
    );
    check(
        "a file only the typescript render wrote is reported",
        comparison.onlyInPorted.includes("tiles/0/x8/z8.prbm.gz"),
    );
    check(
        "the category table counts the hires tiles",
        comparison.categories.hires?.compared === 2 &&
            comparison.categories.hires?.matching === 1 &&
            comparison.categories.hires?.differing === 1,
        JSON.stringify(comparison.categories.hires),
    );
    check(
        "the category table counts the re-encoded lowres tile separately",
        comparison.categories.lowres?.compared === 2 &&
            comparison.categories.lowres?.matching === 1 &&
            comparison.categories.lowres?.reencoded === 1 &&
            comparison.categories.lowres?.differing === 1,
        JSON.stringify(comparison.categories.lowres),
    );

    /*
     * The render-state comparison excuses one thing - the wall-clock render times - so it
     * has to be shown biting on everything else. A comparison that was loosened once and
     * never re-tested is how a real divergence starts reading as "just the clock again".
     */
    const renderStateFile = (states, timeOffset = 0) => {
        const palette = ["bluemap:rendered", "bluemap:not-generated"];
        const parts = [Buffer.from([10, 0, 0])]; // compound, empty name
        // last-render-times: TAG_Int_Array
        const timesName = Buffer.from("last-render-times", "utf8");
        const times = Buffer.alloc(4 + states.length * 4);
        times.writeInt32BE(states.length, 0);
        for (let i = 0; i < states.length; i++)
            times.writeInt32BE(1700000000 + timeOffset + i, 4 + i * 4);
        parts.push(
            Buffer.from([11, 0, timesName.length]),
            timesName,
            times,
        );
        // tile-states: TAG_Compound { palette: TAG_List<TAG_String>, data: TAG_Byte_Array }
        const statesName = Buffer.from("tile-states", "utf8");
        parts.push(Buffer.from([10, 0, statesName.length]), statesName);
        const paletteName = Buffer.from("palette", "utf8");
        const paletteHeader = Buffer.alloc(5);
        paletteHeader.writeInt8(8, 0); // element type: TAG_String
        paletteHeader.writeInt32BE(palette.length, 1);
        parts.push(Buffer.from([9, 0, paletteName.length]), paletteName, paletteHeader);
        for (const entry of palette) {
            const bytes = Buffer.from(entry, "utf8");
            const header = Buffer.alloc(2);
            header.writeUInt16BE(bytes.length, 0);
            parts.push(header, bytes);
        }
        const dataName = Buffer.from("data", "utf8");
        const dataLength = Buffer.alloc(4);
        dataLength.writeInt32BE(states.length, 0);
        parts.push(
            Buffer.from([7, 0, dataName.length]),
            dataName,
            dataLength,
            Buffer.from(states),
        );
        parts.push(Buffer.from([0, 0])); // end tile-states, end root
        return Buffer.concat(parts);
    };
    const baseState = renderStateFile([0, 0, 1, 0]);
    check(
        "a render state compares equal to itself",
        diffRenderState(baseState, baseState) === null,
    );
    const changedState = diffRenderState(baseState, renderStateFile([0, 1, 1, 0]));
    check(
        "a changed tile-state is reported, and not excused as a clock difference",
        changedState?.kind === "renderstate-field" &&
            changedState.message.includes("tile-states"),
        JSON.stringify(changedState),
    );
    const changedTime = diffRenderState(baseState, renderStateFile([0, 0, 1, 0], 60));
    check(
        "a render time that moved is reported as time-only rather than as a divergence",
        changedTime?.kind === "renderstate-time",
        JSON.stringify(changedTime),
    );

    // and the control: two identical trees must pass
    const identical = await compareMaps(reference, reference);
    check("two identical map directories compare equal", identical.ok === true);

    process.stdout.write("\n");
    if (failures.length > 0) {
        process.stdout.write(`${failures.length} check(s) failed\n`);
        return 1;
    }
    process.stdout.write("all checks passed\n");
    return 0;
}

process.exitCode = await main();
