/**
 * Divergence reporting.
 *
 * "They differ" costs a day. Everything here exists so the first line of a failure names
 * the file, the offset, and what each side actually has there.
 */

import { decodePng, PngFormatError } from "./png.mjs";

/** How many bytes of context to show either side of a byte divergence. */
const BYTE_CONTEXT = 16;

/**
 * @param {Buffer} buffer
 * @param {number} centre
 * @param {number} context
 */
function hexWindow(buffer, centre, context) {
    const start = Math.max(0, centre - context);
    const end = Math.min(buffer.length, centre + context + 1);
    const parts = [];
    for (let i = start; i < end; i++) {
        const hex = buffer[i].toString(16).padStart(2, "0");
        parts.push(i === centre ? `[${hex}]` : hex);
    }
    return { start, end, text: parts.join(" ") };
}

/**
 * Compares two byte buffers and describes the first difference.
 *
 * @param {Buffer} expected the reference (java) bytes
 * @param {Buffer} actual the ported (typescript) bytes
 * @returns {null | {kind: string, offset: number, message: string, detail: string[]}}
 */
export function diffBytes(expected, actual) {
    const common = Math.min(expected.length, actual.length);
    let offset = -1;
    for (let i = 0; i < common; i++) {
        if (expected[i] !== actual[i]) {
            offset = i;
            break;
        }
    }

    if (offset === -1) {
        if (expected.length === actual.length) return null;
        const at = common;
        const longer = expected.length > actual.length ? "java" : "typescript";
        return {
            kind: "length",
            offset: at,
            message:
                `identical for the first ${common} bytes, then the ${longer} side continues: ` +
                `java is ${expected.length} bytes, typescript is ${actual.length}`,
            detail: [
                `  java       @${at}: ${hexWindow(expected, Math.min(at, expected.length - 1), BYTE_CONTEXT).text}`,
                `  typescript @${at}: ${hexWindow(actual, Math.min(at, actual.length - 1), BYTE_CONTEXT).text}`,
            ],
        };
    }

    const expectedWindow = hexWindow(expected, offset, BYTE_CONTEXT);
    const actualWindow = hexWindow(actual, offset, BYTE_CONTEXT);
    return {
        kind: "byte",
        offset,
        message:
            `first differing byte at offset ${offset}: java has 0x${expected[offset]
                .toString(16)
                .padStart(2, "0")}, typescript has 0x${actual[offset]
                .toString(16)
                .padStart(2, "0")} ` +
            `(java is ${expected.length} bytes, typescript is ${actual.length})`,
        detail: [
            `  bytes ${expectedWindow.start}..${expectedWindow.end - 1}, the differing byte in [brackets]`,
            `  java      : ${expectedWindow.text}`,
            `  typescript: ${actualWindow.text}`,
        ],
    };
}

/**
 * Compares two PNG files pixel for pixel.
 *
 * The bytes are compared first: identical bytes are identical pixels, and that is the
 * result an encoder-for-encoder port should produce. Only when the bytes differ are the
 * images decoded, so a mere re-encode is reported as such rather than as a render bug.
 *
 * @param {Buffer} expected
 * @param {Buffer} actual
 * @returns {null | {kind: string, message: string, detail: string[]}}
 */
export function diffPng(expected, actual) {
    if (expected.equals(actual)) return null;

    let expectedImage;
    let actualImage;
    try {
        expectedImage = decodePng(expected);
    } catch (error) {
        return {
            kind: "png-decode",
            message: `the java PNG could not be decoded: ${describeError(error)}`,
            detail: [],
        };
    }
    try {
        actualImage = decodePng(actual);
    } catch (error) {
        return {
            kind: "png-decode",
            message: `the typescript PNG could not be decoded: ${describeError(error)}`,
            detail: [],
        };
    }

    if (
        expectedImage.width !== actualImage.width ||
        expectedImage.height !== actualImage.height
    ) {
        return {
            kind: "png-size",
            message:
                `image sizes differ: java is ${expectedImage.width}x${expectedImage.height}, ` +
                `typescript is ${actualImage.width}x${actualImage.height}`,
            detail: [],
        };
    }

    const { width, height } = expectedImage;
    let differing = 0;
    let first = null;
    for (let i = 0; i < width * height; i++) {
        const p = i * 4;
        if (
            expectedImage.pixels[p] !== actualImage.pixels[p] ||
            expectedImage.pixels[p + 1] !== actualImage.pixels[p + 1] ||
            expectedImage.pixels[p + 2] !== actualImage.pixels[p + 2] ||
            expectedImage.pixels[p + 3] !== actualImage.pixels[p + 3]
        ) {
            differing++;
            if (first === null) first = i;
        }
    }

    if (differing === 0) {
        return {
            kind: "png-reencode",
            message:
                "the PNG bytes differ but every pixel is identical — the images were encoded " +
                "differently (filter choice, zlib level or an ancillary chunk), not rendered " +
                "differently",
            detail: [
                `  java       : ${expected.length} bytes`,
                `  typescript : ${actual.length} bytes`,
            ],
        };
    }

    const x = first % width;
    const y = Math.floor(first / width);
    const p = first * 4;
    const rgba = (image) =>
        `rgba(${image.pixels[p]}, ${image.pixels[p + 1]}, ${image.pixels[p + 2]}, ${image.pixels[p + 3]})`;

    // the lowres tile image is two stacked halves: colour on top, height/blocklight below
    const half = height / 2;
    const region =
        Number.isInteger(half) && y >= half
            ? `the height/blocklight half (row ${y - half} of it)`
            : "the colour half";

    return {
        kind: "pixel",
        message:
            `${differing} of ${width * height} pixels differ; the first is at (x=${x}, y=${y}) ` +
            `in ${region}: java ${rgba(expectedImage)}, typescript ${rgba(actualImage)}`,
        detail: [
            `  image is ${width}x${height}`,
            `  java       (x=${x}, y=${y}): ${rgba(expectedImage)}`,
            `  typescript (x=${x}, y=${y}): ${rgba(actualImage)}`,
        ],
    };
}

/**
 * Compares two json documents by value, reporting the path of the first difference.
 *
 * Used where a byte comparison would be wrong rather than strict: gson html-escapes
 * `=`, `<`, `>`, `&` and `'` inside strings and `JSON.stringify` does not, so two
 * byte-different documents can carry exactly the same value.
 *
 * @param {unknown} expected
 * @param {unknown} actual
 * @param {string} path
 * @returns {null | {kind: string, message: string, detail: string[]}}
 */
export function diffJson(expected, actual, path = "$") {
    if (expected === actual) return null;

    const typeOf = (value) =>
        value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
    const expectedType = typeOf(expected);
    const actualType = typeOf(actual);

    if (expectedType !== actualType)
        return {
            kind: "json",
            message: `${path}: java has a ${expectedType}, typescript has a ${actualType}`,
            detail: [`  java      : ${preview(expected)}`, `  typescript: ${preview(actual)}`],
        };

    if (expectedType === "array") {
        if (expected.length !== actual.length)
            return {
                kind: "json",
                message: `${path}: java has ${expected.length} elements, typescript has ${actual.length}`,
                detail: [],
            };
        for (let i = 0; i < expected.length; i++) {
            const result = diffJson(expected[i], actual[i], `${path}[${i}]`);
            if (result !== null) return result;
        }
        return null;
    }

    if (expectedType === "object") {
        const expectedKeys = Object.keys(expected).sort();
        const actualKeys = Object.keys(actual).sort();
        for (const key of expectedKeys) {
            if (!actualKeys.includes(key))
                return {
                    kind: "json",
                    message: `${path}.${key}: present in java, missing in typescript`,
                    detail: [`  java: ${preview(expected[key])}`],
                };
        }
        for (const key of actualKeys) {
            if (!expectedKeys.includes(key))
                return {
                    kind: "json",
                    message: `${path}.${key}: present in typescript, missing in java`,
                    detail: [`  typescript: ${preview(actual[key])}`],
                };
        }
        for (const key of expectedKeys) {
            const result = diffJson(expected[key], actual[key], `${path}.${key}`);
            if (result !== null) return result;
        }
        return null;
    }

    return {
        kind: "json",
        message: `${path}: java has ${preview(expected)}, typescript has ${preview(actual)}`,
        detail: [],
    };
}

function preview(value) {
    let text;
    try {
        text = JSON.stringify(value);
    } catch {
        text = String(value);
    }
    if (text === undefined) return "undefined";
    return text.length > 200 ? text.slice(0, 200) + "…" : text;
}

export function describeError(error) {
    if (error instanceof PngFormatError) return error.message;
    if (error instanceof Error) return error.message;
    return String(error);
}
