/**
 * Tests for the identifiers that appear in public.
 *
 * The property being defended is narrow and easy to lose: a name in a public repository,
 * a public workflow run or a public log must say nothing about the private side. It is
 * easy to lose because the obvious implementation - hash the world's name - is reversible
 * with a wordlist for exactly the short, guessable names that worlds have.
 *
 * So the assertions are: the label never appears in the output, the same label and key
 * always give the same identifier (a later job has to be able to recompute it), and a
 * different key gives a different one (the digest is keyed, not public).
 */

import { describe, expect, it } from "vitest";
import { generateKey } from "./crypto.js";
import {
    assetPattern,
    deriveProjectId,
    manifestAssetName,
    partAssetName,
    stagingTag,
} from "./ids.js";

const KEY = generateKey();
const OTHER_KEY = generateKey();
const LABEL = "survival-world";

describe("deriveProjectId", () => {
    it("says nothing about what it was derived from", () => {
        const id = deriveProjectId(KEY, LABEL);

        expect(id).not.toContain(LABEL);
        expect(id).not.toContain("survival");
        expect(id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("is stable, so a later job can recompute the name of what it needs", () => {
        expect(deriveProjectId(KEY, LABEL)).toBe(deriveProjectId(KEY, LABEL));
    });

    it("is keyed, so the same label under a different key is a different id", () => {
        // Without the key this would be a plain digest of a short guessable string, which
        // a wordlist reverses in seconds.
        expect(deriveProjectId(KEY, LABEL)).not.toBe(deriveProjectId(OTHER_KEY, LABEL));
    });

    it("separates labels that differ at all", () => {
        expect(deriveProjectId(KEY, "shard-1")).not.toBe(deriveProjectId(KEY, "shard-2"));
        expect(deriveProjectId(KEY, "world")).not.toBe(deriveProjectId(KEY, "world "));
    });
});

describe("asset names", () => {
    it("puts the opaque id first and pads the index so parts sort in order", () => {
        const id = deriveProjectId(KEY, LABEL);

        expect(partAssetName(id, 0)).toBe(`${id}.0000.bin`);
        expect(partAssetName(id, 12)).toBe(`${id}.0012.bin`);
        expect(manifestAssetName(id)).toBe(`${id}.manifest.bin`);
        expect(assetPattern(id)).toBe(`${id}.*`);

        // Ten parts in the order a shell would list them.
        const sorted = [...Array(11).keys()].map((index) => partAssetName(id, index)).sort();
        expect(sorted[1]).toBe(partAssetName(id, 1));
        expect(sorted[10]).toBe(partAssetName(id, 10));
    });
});

describe("stagingTag", () => {
    it("gives two runs of the same world different staging releases", () => {
        // Otherwise one run deletes the other's assets halfway through, and the failure
        // looks like corruption rather than like a collision.
        expect(stagingTag(KEY, LABEL, "111")).not.toBe(stagingTag(KEY, LABEL, "112"));
    });

    it("still says nothing about the world", () => {
        const tag = stagingTag(KEY, LABEL, "111");

        expect(tag).not.toContain(LABEL);
        expect(tag).toMatch(/^t-[0-9a-f]{32}$/);
    });
});
