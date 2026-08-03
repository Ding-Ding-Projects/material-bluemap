import { UTFDataFormatException } from "./Exceptions.js";

/**
 * Java "modified UTF-8" codec as used by DataInputStream#readUTF /
 * DataOutputStream#writeUTF (and therefore by the NBT string format):
 * NUL is encoded as the two-byte sequence C0 80, and supplementary characters
 * are encoded as surrogate pairs of two 3-byte sequences (CESU-8).
 * The 2-byte length prefix is handled by NBTReader/NBTWriter, not here.
 */

export function encodeModifiedUtf8(value: string): Uint8Array {
    let utflen = 0;
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c >= 0x0001 && c <= 0x007f) utflen += 1;
        else if (c > 0x07ff) utflen += 3;
        else utflen += 2;
    }

    const bytes = new Uint8Array(utflen);
    let count = 0;
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c >= 0x0001 && c <= 0x007f) {
            bytes[count++] = c;
        } else if (c > 0x07ff) {
            bytes[count++] = 0xe0 | ((c >> 12) & 0x0f);
            bytes[count++] = 0x80 | ((c >> 6) & 0x3f);
            bytes[count++] = 0x80 | (c & 0x3f);
        } else {
            bytes[count++] = 0xc0 | ((c >> 6) & 0x1f);
            bytes[count++] = 0x80 | (c & 0x3f);
        }
    }
    return bytes;
}

export function decodeModifiedUtf8(bytes: Uint8Array): string {
    const utflen = bytes.length;
    const chars: number[] = [];
    let count = 0;

    // fast path for ascii-only prefixes (mirrors DataInputStream#readUTF)
    while (count < utflen) {
        const c = bytes[count]!;
        if (c > 127) break;
        count++;
        chars.push(c);
    }

    while (count < utflen) {
        const c = bytes[count]!;
        switch (c >> 4) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
            case 7: {
                /* 0xxxxxxx */
                count++;
                chars.push(c);
                break;
            }
            case 12:
            case 13: {
                /* 110x xxxx   10xx xxxx */
                count += 2;
                if (count > utflen)
                    throw new UTFDataFormatException("malformed input: partial character at end");
                const char2 = bytes[count - 1]!;
                if ((char2 & 0xc0) !== 0x80)
                    throw new UTFDataFormatException("malformed input around byte " + count);
                chars.push(((c & 0x1f) << 6) | (char2 & 0x3f));
                break;
            }
            case 14: {
                /* 1110 xxxx  10xx xxxx  10xx xxxx */
                count += 3;
                if (count > utflen)
                    throw new UTFDataFormatException("malformed input: partial character at end");
                const char2 = bytes[count - 2]!;
                const char3 = bytes[count - 1]!;
                if ((char2 & 0xc0) !== 0x80 || (char3 & 0xc0) !== 0x80)
                    throw new UTFDataFormatException("malformed input around byte " + (count - 1));
                chars.push(((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | (char3 & 0x3f));
                break;
            }
            default:
                /* 10xx xxxx,  1111 xxxx */
                throw new UTFDataFormatException("malformed input around byte " + count);
        }
    }

    if (chars.length <= 8192) return String.fromCharCode(...chars);
    let result = "";
    for (let i = 0; i < chars.length; i += 8192)
        result += String.fromCharCode(...chars.slice(i, i + 8192));
    return result;
}
