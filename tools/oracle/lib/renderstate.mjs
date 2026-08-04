/**
 * Comparing render state without comparing the clock.
 *
 * The `rstate/*.dat` files are gzipped NBT holding, per region cell, what the render
 * decided about each tile and **when it decided it**:
 *
 * | file | fields |
 * | --- | --- |
 * | `*.tiles.dat` | `last-render-times` (int array), `tile-states` (byte array) |
 * | `*.chunks.dat` | `chunk-hashes` (int array) |
 * | `*.regions.dat` | `last-update-times` (int array) |
 *
 * The times are wall-clock seconds taken when the tile was written, so two renders of the
 * same world performed minutes apart cannot agree on them and never will. Comparing the
 * files byte for byte therefore reports a divergence that says nothing about the port -
 * and worse, it buries the fields that *do* say something, because a real disagreement
 * about a tile's state looks exactly like the timestamps that always differ.
 *
 * So this reads the structure and compares it field by field:
 *
 * - **every field except the times is compared exactly**, element by element, and any
 *   difference is a real divergence naming the field and the first index;
 * - **a difference confined to the time fields** is reported as its own kind, counted in
 *   its own column and printed, rather than folded away silently.
 *
 * This is the same shape as decision D3's treatment of PNG re-encodes: the comparison is
 * stated on the thing that carries meaning, and the part that cannot match is made
 * visible instead of ignored. It is deliberately NOT a general "ignore fields that look
 * noisy" rule - the field names are listed here, and a file that grows a field this does
 * not know about is a parse error rather than a pass.
 */

/** The fields whose values are wall-clock times, and therefore cannot match. */
const TIME_FIELDS = new Set(["last-render-times", "last-update-times"]);

/** Every field the render-state files are known to carry. */
const KNOWN_FIELDS = new Set([...TIME_FIELDS, "tile-states", "chunk-hashes"]);

const TAG_END = 0;
const TAG_BYTE = 1;
const TAG_SHORT = 2;
const TAG_INT = 3;
const TAG_LONG = 4;
const TAG_FLOAT = 5;
const TAG_DOUBLE = 6;
const TAG_BYTE_ARRAY = 7;
const TAG_STRING = 8;
const TAG_LIST = 9;
const TAG_COMPOUND = 10;
const TAG_INT_ARRAY = 11;
const TAG_LONG_ARRAY = 12;

/**
 * Reads exactly the NBT these files use.
 *
 * Not a general NBT library: it is here so the harness can keep its no-install promise,
 * and it throws on anything it was not written for rather than guessing, because a
 * silently mis-parsed render state would make the comparison meaningless in the direction
 * that looks like success.
 */
class NbtReader {
    /** @param {Buffer} buffer */
    constructor(buffer) {
        this.buffer = buffer;
        this.offset = 0;
    }

    #need(bytes) {
        if (this.offset + bytes > this.buffer.length)
            throw new Error(
                `truncated nbt: wanted ${bytes} byte(s) at ${this.offset}, ` +
                    `${this.buffer.length - this.offset} left`,
            );
    }

    readByte() {
        this.#need(1);
        return this.buffer.readInt8(this.offset++);
    }

    readUnsignedShort() {
        this.#need(2);
        const value = this.buffer.readUInt16BE(this.offset);
        this.offset += 2;
        return value;
    }

    readInt() {
        this.#need(4);
        const value = this.buffer.readInt32BE(this.offset);
        this.offset += 4;
        return value;
    }

    readString() {
        const length = this.readUnsignedShort();
        this.#need(length);
        // NBT strings are modified UTF-8; every name in these files is ASCII, and a name
        // that is not would land here as mojibake rather than as a wrong comparison.
        const value = this.buffer.toString("utf8", this.offset, this.offset + length);
        this.offset += length;
        return value;
    }

    readPayload(type) {
        switch (type) {
            case TAG_BYTE:
                return this.readByte();
            case TAG_SHORT: {
                this.#need(2);
                const value = this.buffer.readInt16BE(this.offset);
                this.offset += 2;
                return value;
            }
            case TAG_INT:
                return this.readInt();
            case TAG_LONG: {
                this.#need(8);
                const value = this.buffer.readBigInt64BE(this.offset);
                this.offset += 8;
                return value;
            }
            case TAG_FLOAT: {
                this.#need(4);
                const value = this.buffer.readFloatBE(this.offset);
                this.offset += 4;
                return value;
            }
            case TAG_DOUBLE: {
                this.#need(8);
                const value = this.buffer.readDoubleBE(this.offset);
                this.offset += 8;
                return value;
            }
            case TAG_BYTE_ARRAY: {
                const length = this.readInt();
                this.#need(length);
                const value = this.buffer.subarray(this.offset, this.offset + length);
                this.offset += length;
                return value;
            }
            case TAG_STRING:
                return this.readString();
            case TAG_LIST: {
                const elementType = this.readByte();
                const length = this.readInt();
                const values = [];
                for (let i = 0; i < length; i++) values.push(this.readPayload(elementType));
                return values;
            }
            case TAG_COMPOUND: {
                const value = {};
                for (;;) {
                    const childType = this.readByte();
                    if (childType === TAG_END) return value;
                    value[this.readString()] = this.readPayload(childType);
                }
            }
            case TAG_INT_ARRAY: {
                const length = this.readInt();
                this.#need(length * 4);
                const values = new Int32Array(length);
                for (let i = 0; i < length; i++) values[i] = this.readInt();
                return values;
            }
            case TAG_LONG_ARRAY: {
                const length = this.readInt();
                const values = new BigInt64Array(length);
                for (let i = 0; i < length; i++) values[i] = this.readPayload(TAG_LONG);
                return values;
            }
            default:
                throw new Error(`unsupported nbt tag ${type} at ${this.offset - 1}`);
        }
    }
}

/** @returns {Record<string, unknown>} the root compound */
export function readRenderState(buffer) {
    const reader = new NbtReader(buffer);
    const rootType = reader.readByte();
    if (rootType !== TAG_COMPOUND)
        throw new Error(`render state should start with a compound, found tag ${rootType}`);
    reader.readString(); // the root name, always empty here
    return reader.readPayload(TAG_COMPOUND);
}

function describeValue(value, index) {
    if (value instanceof Int32Array || Array.isArray(value)) return String(value[index]);
    if (Buffer.isBuffer(value)) return String(value[index]);
    return String(value);
}

function lengthOf(value) {
    if (value instanceof Int32Array || Array.isArray(value) || Buffer.isBuffer(value))
        return value.length;
    return -1;
}

/**
 * A palette-encoded field is a `{ palette: string[], data: byte[] }` pair, and it must be
 * compared through the palette rather than on the raw indices.
 *
 * Two files can hold identical states and different bytes: the palette is built in the
 * order the states were first encountered, so a render that meets `not-generated` before
 * `rendered` writes the same information with the indices swapped. Comparing `data`
 * directly would call that a divergence, and - the direction that actually matters -
 * would call two genuinely different states equal whenever the palettes happen to be
 * permuted such that the indices coincide.
 */
function isPaletted(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        Array.isArray(value.palette) &&
        Buffer.isBuffer(value.data)
    );
}

/** The palette-resolved names, so two encodings of the same states compare equal. */
function resolvePalette(value, field) {
    const resolved = new Array(value.data.length);
    for (let i = 0; i < value.data.length; i++) {
        const index = value.data[i];
        const name = value.palette[index];
        if (name === undefined)
            throw new Error(
                `'${field}' element ${i} refers to palette entry ${index}, but the palette ` +
                    `has ${value.palette.length} entr(ies)`,
            );
        resolved[i] = name;
    }
    return resolved;
}

/**
 * Compares two decompressed render-state files.
 *
 * @returns {null | {kind: string, message: string, detail: string[]}}
 *   `null` when everything that carries meaning agrees and the times agree too;
 *   `kind: "renderstate-time"` when only the time fields differ;
 *   any other kind is a real divergence.
 */
export function diffRenderState(referenceBytes, portedBytes) {
    let reference;
    let ported;
    try {
        reference = readRenderState(referenceBytes);
        ported = readRenderState(portedBytes);
    } catch (error) {
        return {
            kind: "renderstate-parse",
            message: `render state could not be read: ${error instanceof Error ? error.message : String(error)}`,
            detail: [],
        };
    }

    const fields = [...new Set([...Object.keys(reference), ...Object.keys(ported)])].sort();

    const unknown = fields.filter((field) => !KNOWN_FIELDS.has(field));
    if (unknown.length > 0)
        return {
            kind: "renderstate-unknown-field",
            message:
                `render state carries field(s) this comparison was not written for: ` +
                `${unknown.join(", ")}. Add them to lib/renderstate.mjs - passing a file ` +
                `with an unexamined field would be a comparison that does not compare it`,
            detail: [],
        };

    const timeDifferences = [];

    for (const field of fields) {
        let a = reference[field];
        let b = ported[field];

        if (isPaletted(a) && isPaletted(b)) {
            try {
                a = resolvePalette(a, field);
                b = resolvePalette(b, field);
            } catch (error) {
                return {
                    kind: "renderstate-palette",
                    message: error instanceof Error ? error.message : String(error),
                    detail: [],
                };
            }
        }

        if (a === undefined || b === undefined)
            return {
                kind: "renderstate-field",
                message: `only the ${a === undefined ? "typescript" : "java"} render state has '${field}'`,
                detail: [],
            };

        const lengthA = lengthOf(a);
        const lengthB = lengthOf(b);
        if (lengthA !== lengthB)
            return {
                kind: "renderstate-field",
                message: `'${field}' has ${lengthA} element(s) in the java render state and ${lengthB} in the typescript one`,
                detail: [],
            };

        if (lengthA < 0) {
            if (a !== b)
                return {
                    kind: "renderstate-field",
                    message: `'${field}' is ${String(a)} in the java render state and ${String(b)} in the typescript one`,
                    detail: [],
                };
            continue;
        }

        let firstDifference = -1;
        let differing = 0;
        for (let i = 0; i < lengthA; i++) {
            if (a[i] !== b[i]) {
                if (firstDifference < 0) firstDifference = i;
                differing++;
            }
        }
        if (differing === 0) continue;

        if (!TIME_FIELDS.has(field))
            return {
                kind: "renderstate-field",
                message:
                    `'${field}' differs in ${differing} of ${lengthA} element(s); the first ` +
                    `is at index ${firstDifference}: java has ${describeValue(a, firstDifference)}, ` +
                    `typescript has ${describeValue(b, firstDifference)}`,
                detail: [],
            };

        timeDifferences.push(
            `'${field}': ${differing} of ${lengthA} time(s) differ, first at index ` +
                `${firstDifference} (java ${describeValue(a, firstDifference)}, ` +
                `typescript ${describeValue(b, firstDifference)})`,
        );
    }

    if (timeDifferences.length === 0) return null;

    return {
        kind: "renderstate-time",
        message:
            "every render-state field agrees except the render times, which are wall-clock " +
            "seconds and cannot match between two renders performed at different moments",
        detail: timeDifferences,
    };
}
