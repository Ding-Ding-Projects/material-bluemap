import { describe, expect, it } from "vitest";
import { Compression } from "./Compression.js";

// Runs in its own isolated test file so these are genuinely the FIRST uses of the zstd
// wasm module in the worker: all callers race the lazy one-time init concurrently.
describe("Compression.ZSTD lazy wasm init", () => {
    it("is safe under many concurrent first uses", async () => {
        const payloads = Array.from({ length: 16 }, (_, i) =>
            Buffer.from(`zstd concurrent init payload ${i} `.repeat(100 + i)),
        );
        const compressed = await Promise.all(
            payloads.map((payload) => Compression.ZSTD.compress(payload)),
        );
        const restored = await Promise.all(
            compressed.map((data) => Compression.ZSTD.decompress(data)),
        );
        restored.forEach((data, i) => {
            expect(data.equals(payloads[i] as Buffer)).toBe(true);
        });
    });
});
