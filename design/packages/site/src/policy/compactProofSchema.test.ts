import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COMPACT_PROOF_FILES, validateCompactProof } from "./compactProofSchema.js";

const PROOF_ROOT = resolve(process.cwd(), "..", "docs", "runtime-proof");

describe("committed compact-proof corpus", () => {
    it.each(COMPACT_PROOF_FILES)("%s uses the complete current schema", (filename) => {
        const proof = JSON.parse(readFileSync(resolve(PROOF_ROOT, filename), "utf8")) as unknown;
        expect(validateCompactProof(proof)).toEqual([]);
    });

    it("rejects a legacy or incomplete record instead of silently accepting it", () => {
        const source = JSON.parse(
            readFileSync(resolve(PROOF_ROOT, COMPACT_PROOF_FILES[0]), "utf8"),
        ) as Record<string, unknown>;
        const incomplete = structuredClone(source);
        delete incomplete["schemaVersion"];
        const verification = incomplete["verification"] as Record<string, unknown>;
        delete verification["ariaControlsValid"];
        expect(validateCompactProof(incomplete)).toEqual(
            expect.arrayContaining(["schemaVersion", "verification.ariaControlsValid"]),
        );
    });
});
