import assert from "node:assert/strict";
import { test } from "node:test";

import {
    parseArgs,
    readBoundedResponse,
    validateAsset,
    validateDish,
    verifyPng,
    workflowOutputText,
} from "./pick-dim-sum.mjs";

const CRC32_TABLE = new Uint32Array(256);
for (let index = 0; index < CRC32_TABLE.length; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    CRC32_TABLE[index] = value >>> 0;
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data = Buffer.alloc(0)) {
    const typeBytes = Buffer.from(type, "ascii");
    const chunk = Buffer.alloc(12 + data.length);
    chunk.writeUInt32BE(data.length, 0);
    typeBytes.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length);
    return chunk;
}

function structuralPng() {
    const header = Buffer.alloc(13);
    header.writeUInt32BE(1, 0);
    header.writeUInt32BE(1, 4);
    header[8] = 8;
    header[9] = 6;
    return Buffer.concat([
        Buffer.from("89504e470d0a1a0a", "hex"),
        pngChunk("IHDR", header),
        pngChunk("IDAT", Buffer.from([1, 2, 3])),
        pngChunk("IEND"),
    ]);
}

function validDish(altEn = "Warm tea-house photograph of Classic Har Gow") {
    return {
        id: "hk-dish-0001",
        slug: "classic-har-gow",
        name: { en: "Classic Har Gow", zhHant: "蝦餃。「茶樓」" },
        jyutping: "haa1 gaau2",
        category: "steamed-dim-sum",
        image: { alt: { en: altEn } },
    };
}

test("legitimate Traditional Chinese punctuation and a real 235-character alt are accepted", () => {
    const prefix = "Warm tea-house photograph of Classic Har Gow, showing ";
    const alt = prefix + "a".repeat(235 - prefix.length);
    assert.equal([...alt].length, 235);
    const result = validateDish(validDish(alt), "hk-dish-0001");
    assert.equal(result.nameZh, "蝦餃。「茶樓」");
    assert.equal(result.altEn, alt);
});

test("an alt beyond the supported catalog boundary is rejected", () => {
    assert.throws(() => validateDish(validDish("a".repeat(236)), "hk-dish-0001"), /235/);
});

test("missing and wrong-type catalog fields are rejected without echoing their values", () => {
    const missing = validDish();
    delete missing.name;
    assert.throws(() => validateDish(missing, "hk-dish-0001"), /dish\.name/);

    const wrongType = validDish();
    wrongType.image.alt.en = 42;
    assert.throws(() => validateDish(wrongType, "hk-dish-0001"), /expected text/);
});

test("control, line-separator, shell and Markdown syntax is rejected without disclosure", () => {
    for (const unsafe of ["\n", "\r", "\0", "\u2028", "`", "$", '"', ";", "&", "|", "<", ">", "[", "]"]) {
        const dish = validDish();
        dish.name.en = `Unsafe${unsafe}metadata`;
        assert.throws(
            () => validateDish(dish, "hk-dish-0001"),
            (error) => {
                assert.match(error.message, /dish\.name\.en/);
                assert.equal(error.message.includes(dish.name.en), false);
                return true;
            },
        );
    }
});

test("asset metadata is bounded to the selected public catalog release", () => {
    const fileName = "hk-dish-0001-classic-har-gow.png";
    const asset = validateAsset(
        {
            name: fileName,
            size: 4096,
            browser_download_url:
                "https://github.com/Ding-Ding-Projects/dim-sum-photos/releases/download/catalog-v1.1/" +
                fileName,
        },
        "catalog-v1.1",
        fileName,
    );
    assert.equal(asset.fileName, fileName);
    assert.throws(
        () =>
            validateAsset(
                {
                    name: fileName,
                    size: 4096,
                    browser_download_url: `https://example.invalid/${fileName}`,
                },
                "catalog-v1.1",
                fileName,
            ),
        /selected catalog release asset URL/,
    );
});

test("PNG verification parses every chunk and validates CRC integrity", () => {
    const png = structuralPng();
    assert.deepEqual(verifyPng(png, png.length), { width: 1, height: 1 });

    const corrupt = Buffer.from(png);
    corrupt[corrupt.length - 17] ^= 0xff;
    assert.throws(() => verifyPng(corrupt, corrupt.length), /CRC mismatch/);
});

test("truncated and false-IEND envelopes are rejected", () => {
    const png = structuralPng();
    assert.throws(() => verifyPng(png.subarray(0, -2), png.length - 2), /truncated/);

    const falseEnd = Buffer.concat([
        Buffer.from("89504e470d0a1a0a", "hex"),
        Buffer.alloc(20),
        Buffer.from("IEND0000", "ascii"),
    ]);
    assert.throws(() => verifyPng(falseEnd, falseEnd.length), /verification/);
});

test("Content-Length and streamed bytes are capped before a full buffer is accepted", async () => {
    const declaredTooLarge = new Response(new Uint8Array([1]), {
        headers: { "content-length": "11" },
    });
    await assert.rejects(() => readBoundedResponse(declaredTooLarge, 10), /Content-Length/);

    const streamedTooLarge = new Response(
        new ReadableStream({
            start(controller) {
                controller.enqueue(new Uint8Array(6));
                controller.enqueue(new Uint8Array(6));
                controller.close();
            },
        }),
    );
    await assert.rejects(() => readBoundedResponse(streamedTooLarge, 10), /streamed body/);
});

test("workflow output contains only the five consumed, validated single-line fields", () => {
    const dish = validateDish(validDish(), "hk-dish-0001");
    const output = workflowOutputText({
        ...dish,
        fileName: "hk-dish-0001-classic-har-gow.png",
        volume: "catalog-v1.1",
    });
    assert.deepEqual(
        output.split("\n").map((line) => line.slice(0, line.indexOf("="))),
        ["dish_name_en", "dish_name_zh", "dish_file_name", "dish_alt_en", "dish_volume"],
    );
});

test("argument bounds reject missing values and extreme ordinals", () => {
    assert.throws(() => parseArgs(["node", "script", "--ordinal", "0"]), /1 through 1000000/);
    assert.throws(() => parseArgs(["node", "script", "--ordinal", "1000001"]), /1 through 1000000/);
    assert.throws(() => parseArgs(["node", "script", "--out"]), /arguments\.out/);
});
