/**
 * Comparing `textures.json` without comparing PNG encoders.
 *
 * Every entry in the gallery carries its image inline as a `data:image/png;base64,...`
 * URL. Java's ImageIO and this project's encoder both write correct PNGs and they write
 * different bytes for the same image: ImageIO packs a small-palette texture into an
 * indexed PNG at 1, 2 or 4 bits per pixel, while the port writes 8-bit RGBA. On the
 * 200x200 fixture that is **every one of the 2092 entries**, and 532 of them are the
 * sub-8-bit kind.
 *
 * This is the same situation decision D3 already settled for lowres tiles - "PNG parity
 * checked on decoded pixels, never bytes" - arriving through a different door, so it gets
 * the same answer:
 *
 * - **every field except the image is compared by value**, exactly, and any difference is
 *   a real divergence naming the entry and the field;
 * - **the image is compared on decoded pixels**; identical pixels from different bytes is
 *   a re-encode, reported as its own kind and counted separately rather than folded away.
 *
 * What is deliberately *not* softened: the entry count, the order (the gallery's index is
 * what every hires tile's material group refers to, so a reordering would silently
 * repaint the world), the ids, and the colour and half-transparency values the renderer
 * reads. A missing or extra entry is a divergence, not a re-encode.
 */

import { decodePng } from "./png.mjs";

const DATA_URL = /^data:image\/png;base64,/;

/** The field holding the inline image. Everything else is compared by value. */
const IMAGE_FIELD = "texture";

function decodeImage(value, where) {
    if (typeof value !== "string")
        throw new Error(`${where} is ${value === undefined ? "missing" : typeof value}, not a data url`);
    if (!DATA_URL.test(value)) throw new Error(`${where} is not a png data url`);
    return decodePng(Buffer.from(value.replace(DATA_URL, ""), "base64"));
}

/**
 * @returns {null | {kind: string, message: string, detail: string[]}}
 *   `null` when the two galleries agree image-for-image and field-for-field;
 *   `kind: "textures-reencode"` when only the PNG encodings differ;
 *   any other kind is a real divergence.
 */
export function diffTextures(referenceText, portedText) {
    let reference;
    let ported;
    try {
        reference = JSON.parse(referenceText);
        ported = JSON.parse(portedText);
    } catch (error) {
        return {
            kind: "textures-parse",
            message: `textures.json could not be read: ${error instanceof Error ? error.message : String(error)}`,
            detail: [],
        };
    }

    if (!Array.isArray(reference) || !Array.isArray(ported))
        return {
            kind: "textures-shape",
            message: "textures.json should be an array of gallery entries",
            detail: [],
        };

    if (reference.length !== ported.length)
        return {
            kind: "textures-count",
            message:
                `the gallery has ${reference.length} entr(ies) in the java render and ` +
                `${ported.length} in the typescript one`,
            detail: [],
        };

    let reencoded = 0;
    let firstReencode = null;

    for (let i = 0; i < reference.length; i++) {
        const a = reference[i];
        const b = ported[i];
        const id = a?.id ?? a?.resourcePath ?? `#${i}`;

        for (const field of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
            if (field === IMAGE_FIELD) continue;
            const left = JSON.stringify(a?.[field]);
            const right = JSON.stringify(b?.[field]);
            if (left !== right)
                return {
                    kind: "textures-field",
                    message:
                        `entry ${i} (${id}) differs on '${field}': java has ${left}, ` +
                        `typescript has ${right}`,
                    detail: [],
                };
        }

        // Identical bytes need no decoding, which is also the cheapest and strongest
        // signal: an entry that matches byte for byte is not counted as a re-encode.
        if (a?.[IMAGE_FIELD] === b?.[IMAGE_FIELD]) continue;

        let left;
        let right;
        try {
            left = decodeImage(a?.[IMAGE_FIELD], `entry ${i} (${id})'s image in the java render`);
            right = decodeImage(
                b?.[IMAGE_FIELD],
                `entry ${i} (${id})'s image in the typescript render`,
            );
        } catch (error) {
            // An image that cannot be decoded is NOT quietly accepted: "could not check"
            // reads as agreement, which is the failure mode this whole harness exists to
            // avoid.
            return {
                kind: "textures-image",
                message: error instanceof Error ? error.message : String(error),
                detail: [],
            };
        }

        if (left.width !== right.width || left.height !== right.height)
            return {
                kind: "textures-image",
                message:
                    `entry ${i} (${id}) is ${left.width}x${left.height} in the java render ` +
                    `and ${right.width}x${right.height} in the typescript one`,
                detail: [],
            };

        let differing = 0;
        let firstDifference = -1;
        for (let p = 0; p < left.pixels.length; p++) {
            if (left.pixels[p] !== right.pixels[p]) {
                if (firstDifference < 0) firstDifference = p;
                differing++;
            }
        }

        if (differing > 0) {
            const pixel = Math.floor(firstDifference / 4);
            const channel = ["red", "green", "blue", "alpha"][firstDifference % 4];
            return {
                kind: "textures-image",
                message:
                    `entry ${i} (${id}) differs in ${differing} of ${left.pixels.length} ` +
                    `sample(s); the first is at (x=${pixel % left.width}, ` +
                    `y=${Math.floor(pixel / left.width)}) in the ${channel} channel: ` +
                    `java ${left.pixels[firstDifference]}, typescript ${right.pixels[firstDifference]}`,
                detail: [],
            };
        }

        reencoded++;
        firstReencode ??= `entry ${i} (${id})`;
    }

    if (reencoded === 0) return null;

    return {
        kind: "textures-reencode",
        message:
            `${reencoded} of ${reference.length} gallery image(s) are pixel-identical but ` +
            "byte-different, which is two PNG encoders writing the same picture (decision D3)",
        detail: [
            `first at ${firstReencode}`,
            "every other field, the entry count and the entry order were compared exactly",
        ],
    };
}
