/**
 * The interop claim, made only as far as it is actually checkable here.
 *
 * What can be proved in this repository is that the text this writer produces satisfies
 * the grammar the canonical parser applies. So the regular expressions and the head-field
 * rules below are **copied verbatim** out of `desktop-material`'s
 * `app/src/lib/cheap-lfs/pointer.ts`, and a pointer written here is run through them line
 * by line. A change to this writer that drifted off the contract fails here rather than
 * on somebody else's machine a release later.
 *
 * What is deliberately **not** claimed: that a backup made by this application restores
 * through Desktop Material's own restore path end to end. That needs that application
 * running against a real release, which cannot happen in this test suite, and asserting it
 * from a passing regex would be a claim about software this repository does not build.
 */

import { describe, expect, it } from "vitest";
import {
    CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES,
    CHEAP_LFS_PART_SIZE_BYTES,
    CHEAP_LFS_POINTER_VERSION,
    isCheapLfsPointerText,
    parseCheapLfsPointer,
    readPointer,
    serializeCheapLfsPointer,
} from "./pointer.js";
import type { CheapLfsPointer } from "./pointer.js";

/* -------------------------------------------------------------------------- */
/* Copied verbatim from the canonical file. Do not tidy these.                */
/* -------------------------------------------------------------------------- */

const sha256Hex = /^[a-f0-9]{64}$/;
const nonNegativeInteger = /^(?:0|[1-9][0-9]*)$/;
// `part <64-hex sha256> <size> <name>` - sha256 and size sit in fixed leading
// positions so the trailing name may itself contain spaces.
const partLine = /^([a-f0-9]{64}) (0|[1-9][0-9]*) (.+)$/;
const CanonicalPointerVersion = "desktop-material/cheap-lfs/v1";
const CheapLfsLegacyMaximumPartSizeBytes = 2 * 1024 * 1024 * 1024;

/**
 * The canonical parser's own acceptance, restated as an assertion.
 *
 * Not a copy of its whole body - that would be a second implementation to keep in step -
 * but every rule it applies to a plain-part pointer, in the order it applies them.
 */
function canonicalAccepts(text: string): { ok: boolean; why: string } {
    const allLines = text
        // The canonical parser strips a leading BOM here. Spelled through
        // `fromCharCode` so this file stays plain ASCII and no editor can eat it.
        .replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), "")
        .trim()
        .split(/\r?\n/);

    const headLines: string[] = [];
    const partTexts: string[] = [];
    for (const line of allLines) {
        if (line.startsWith("part ")) partTexts.push(line.slice("part ".length));
        else headLines.push(line);
    }
    if (headLines.length !== 5) return { ok: false, why: "not five head lines" };

    const fields = new Map<string, string>();
    for (const line of headLines) {
        const separator = line.indexOf(" ");
        if (separator <= 0) return { ok: false, why: `no separator in "${line}"` };
        const key = line.slice(0, separator);
        if (fields.has(key)) return { ok: false, why: `${key} twice` };
        fields.set(key, line.slice(separator + 1));
    }

    if (fields.get("version") !== CanonicalPointerVersion) return { ok: false, why: "wrong version" };

    const releaseTag = fields.get("release-tag");
    if (releaseTag === undefined || releaseTag.length === 0 || /\s/.test(releaseTag)) {
        return { ok: false, why: "bad release tag" };
    }
    const assetName = fields.get("asset-name");
    if (assetName === undefined || assetName.length === 0) return { ok: false, why: "bad asset name" };

    const sha = fields.get("sha256");
    if (sha === undefined || !sha256Hex.test(sha)) return { ok: false, why: "bad sha256" };

    const size = fields.get("size");
    if (size === undefined || !nonNegativeInteger.test(size)) return { ok: false, why: "bad size" };

    if (partTexts.length === 0) return { ok: true, why: "single-asset five-line form" };

    let total = 0;
    for (const entry of partTexts) {
        const match = partLine.exec(entry);
        if (match === null) return { ok: false, why: `part line does not match: "${entry}"` };
        if ((match[3] as string).length > 255) return { ok: false, why: "part name over 255" };
        const partSize = Number(match[2]);
        if (
            !Number.isSafeInteger(partSize) ||
            partSize < 0 ||
            partSize > CheapLfsLegacyMaximumPartSizeBytes
        ) {
            return { ok: false, why: "part size out of bounds" };
        }
        total += partSize;
    }
    if (total !== Number(size)) return { ok: false, why: "parts do not sum to size" };
    return { ok: true, why: "split form" };
}

const digest = (seed: string): string => seed.repeat(64).slice(0, 64);

const split: CheapLfsPointer = {
    version: CHEAP_LFS_POINTER_VERSION,
    releaseTag: "mbm-backup-world-overworld-20260804T101500Z",
    assetName: "world-overworld-20260804T101500Z.zip",
    sizeInBytes: 1_100_000_000,
    sha256: digest("a"),
    parts: [
        {
            name: "world-overworld-20260804T101500Z.zip.001-1111111111111111",
            sizeInBytes: 524_288_000,
            sha256: digest("1"),
        },
        {
            name: "world-overworld-20260804T101500Z.zip.002-2222222222222222",
            sizeInBytes: 524_288_000,
            sha256: digest("2"),
        },
        {
            name: "world-overworld-20260804T101500Z.zip.003-3333333333333333",
            sizeInBytes: 51_424_000,
            sha256: digest("3"),
        },
    ],
};

const whole: CheapLfsPointer = {
    version: CHEAP_LFS_POINTER_VERSION,
    releaseTag: "mbm-backup-render-overworld-20260804T101500Z",
    assetName: "render-overworld-20260804T101500Z.zip",
    sizeInBytes: 40_000,
    sha256: digest("b"),
};

describe("the version marker is the sibling application's, not one of our own", () => {
    it("is exactly the canonical string", () => {
        expect(CHEAP_LFS_POINTER_VERSION).toBe("desktop-material/cheap-lfs/v1");
    });

    it("writes new parts at 500 MiB, well under the 2 GiB asset cap", () => {
        expect(CHEAP_LFS_PART_SIZE_BYTES).toBe(500 * 1024 * 1024);
        expect(CHEAP_LFS_PART_SIZE_BYTES).toBeLessThan(CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES);
    });
});

describe("what this writer produces parses under the canonical v1 grammar", () => {
    it("accepts a split pointer, line by line, under the copied regexes", () => {
        const verdict = canonicalAccepts(serializeCheapLfsPointer(split));
        expect(verdict.ok, verdict.why).toBe(true);
    });

    it("accepts a single-asset pointer as the original five-line form", () => {
        const text = serializeCheapLfsPointer(whole);
        expect(text.trimEnd().split("\n")).toHaveLength(5);
        expect(text).not.toContain("part ");
        const verdict = canonicalAccepts(text);
        expect(verdict.ok, verdict.why).toBe(true);
    });

    it("writes the five head lines in the canonical order and spelling", () => {
        expect(serializeCheapLfsPointer(whole)).toBe(
            `version desktop-material/cheap-lfs/v1\n` +
                `release-tag mbm-backup-render-overworld-20260804T101500Z\n` +
                `asset-name render-overworld-20260804T101500Z.zip\n` +
                `size 40000\n` +
                `sha256 ${digest("b")}\n`,
        );
    });

    it("ends with a newline and uses no carriage returns", () => {
        const text = serializeCheapLfsPointer(split);
        expect(text.endsWith("\n")).toBe(true);
        expect(text).not.toContain("\r");
    });

    it("puts the digest and the size in the fixed leading positions of a part line", () => {
        const line = serializeCheapLfsPointer(split)
            .split("\n")
            .find((candidate) => candidate.startsWith("part "));
        const match = partLine.exec((line as string).slice("part ".length));
        expect(match).not.toBeNull();
        expect(match?.[1]).toBe(digest("1"));
        expect(match?.[2]).toBe("524288000");
        expect(match?.[3]).toBe("world-overworld-20260804T101500Z.zip.001-1111111111111111");
    });
});

describe("reading a pointer back", () => {
    it("round-trips a split pointer through its own text", () => {
        expect(parseCheapLfsPointer(serializeCheapLfsPointer(split))).toEqual(split);
    });

    it("round-trips a single-asset pointer with no parts field at all", () => {
        const read = parseCheapLfsPointer(serializeCheapLfsPointer(whole));
        expect(read).toEqual(whole);
        expect(read).not.toHaveProperty("parts");
    });

    it("tolerates CRLF, a byte-order mark and surrounding whitespace", () => {
        const mangled = `${String.fromCharCode(0xfeff)}\n${serializeCheapLfsPointer(split)
            .split("\n")
            .join("\r\n")}\n  `;
        expect(parseCheapLfsPointer(mangled)).toEqual(split);
    });

    it("refuses a pointer whose parts do not add up to the whole file", () => {
        const text = serializeCheapLfsPointer(split).replace("524288000", "524288001");
        const read = readPointer(text);
        expect(read.ok).toBe(false);
        expect(read.ok ? "" : read.failure.code).toBe("malformed");
        expect(read.ok ? "" : read.failure.message).toContain("add up to");
    });

    it("names an encrypted pointer as unsupported rather than calling it broken", () => {
        const text =
            `version ${CHEAP_LFS_POINTER_VERSION}\n` +
            "release-tag t\nasset-name a.bin\nsize 10\n" +
            `sha256 ${digest("c")}\n` +
            "encryption 1\n" +
            `part-encrypted ${digest("d")} 10 26 ${digest("e")} a.bin.001\n`;
        const read = readPointer(text);
        expect(read.ok).toBe(false);
        expect(read.ok ? "" : read.failure.code).toBe("unsupported-encoding");
        expect(read.ok ? "" : read.failure.message).toContain("Desktop Material");
    });

    it("names a deflated pointer as unsupported for the same reason", () => {
        const text =
            `version ${CHEAP_LFS_POINTER_VERSION}\n` +
            "release-tag t\nasset-name a.bin\nsize 10\n" +
            `sha256 ${digest("c")}\n` +
            `part-deflate ${digest("d")} 10 4 a.bin.001\n`;
        const read = readPointer(text);
        expect(read.ok ? "" : read.failure.code).toBe("unsupported-encoding");
    });

    it("refuses binary, over-long and version-less text as not a pointer at all", () => {
        expect(readPointer(`abc${String.fromCharCode(0)}def`).ok).toBe(false);
        expect(readPointer("x".repeat(600_000)).ok).toBe(false);
        expect(readPointer("version something/else/v1\na\nb\nc\nd\n").ok).toBe(false);
    });

    it("refuses a release tag with whitespace, which a tag may never carry", () => {
        const text = serializeCheapLfsPointer({ ...whole, releaseTag: "two words" });
        expect(parseCheapLfsPointer(text)).toBeNull();
    });

    it("accepts a legacy 2 GiB part, because a parser may only ever widen", () => {
        const legacy: CheapLfsPointer = {
            ...whole,
            sizeInBytes: CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES,
            parts: [
                {
                    name: "old.bin.001",
                    sizeInBytes: CHEAP_LFS_LEGACY_MAXIMUM_PART_SIZE_BYTES,
                    sha256: digest("f"),
                },
            ],
        };
        expect(parseCheapLfsPointer(serializeCheapLfsPointer(legacy))).toEqual(legacy);
    });
});

describe("the first-line probe", () => {
    it("recognises pointer text without parsing it", () => {
        expect(isCheapLfsPointerText(serializeCheapLfsPointer(split))).toBe(true);
    });

    it("refuses anything with a NUL in its prefix, however it starts", () => {
        expect(isCheapLfsPointerText(`version ${CHEAP_LFS_POINTER_VERSION}${String.fromCharCode(0)}`)).toBe(
            false,
        );
    });

    it("refuses a file that merely mentions the version further down", () => {
        expect(isCheapLfsPointerText(`# notes\nversion ${CHEAP_LFS_POINTER_VERSION}\n`)).toBe(false);
    });
});
