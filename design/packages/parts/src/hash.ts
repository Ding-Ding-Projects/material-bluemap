/**
 * SHA-256 over a file, without reading the file into memory.
 *
 * Everything here is streamed for one reason: the files this package exists for are
 * measured in gigabytes. `readFile` on a 20 GB archive is not slow, it is a crash, and
 * on a machine with enough memory to survive it, it is a machine that has stopped
 * responding to anything else while it happens.
 */

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

/** How much is read at a time. One mebibyte, the same everywhere in this package. */
export const READ_CHUNK_BYTES = 1024 * 1024;

export async function sha256File(path: string, signal?: AbortSignal): Promise<string> {
    const hash = createHash("sha256");
    const stream = createReadStream(path, { highWaterMark: READ_CHUNK_BYTES });
    for await (const chunk of stream) {
        signal?.throwIfAborted();
        hash.update(chunk as Buffer);
    }
    return hash.digest("hex");
}
