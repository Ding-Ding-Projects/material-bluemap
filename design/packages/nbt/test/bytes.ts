import { encodeModifiedUtf8 } from "../src/ModifiedUtf8.js";

/** length-prefixed modified-utf8 string (nbt name/string encoding) */
export function utf(value: string): number[] {
    const encoded = encodeModifiedUtf8(value);
    return [encoded.length >>> 8, encoded.length & 0xff, ...encoded];
}

export function i16(value: number): number[] {
    const view = new DataView(new ArrayBuffer(2));
    view.setInt16(0, value, false);
    return [view.getUint8(0), view.getUint8(1)];
}

export function i32(value: number): number[] {
    const view = new DataView(new ArrayBuffer(4));
    view.setInt32(0, value, false);
    return [...new Uint8Array(view.buffer)];
}

export function i64(value: bigint): number[] {
    const view = new DataView(new ArrayBuffer(8));
    view.setBigInt64(0, value, false);
    return [...new Uint8Array(view.buffer)];
}

export function f32(value: number): number[] {
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, value, false);
    return [...new Uint8Array(view.buffer)];
}

export function f64(value: number): number[] {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, false);
    return [...new Uint8Array(view.buffer)];
}

export function bytes(...parts: (number | readonly number[] | Uint8Array)[]): Uint8Array {
    const out: number[] = [];
    for (const part of parts) {
        if (typeof part === "number") out.push(part & 0xff);
        else for (const byte of part) out.push(byte & 0xff);
    }
    return Uint8Array.from(out);
}
