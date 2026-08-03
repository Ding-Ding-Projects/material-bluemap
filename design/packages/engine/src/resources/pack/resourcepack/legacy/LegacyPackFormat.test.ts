import { describe, expect, it } from "vitest";
import { parse } from "../../../adapter/JsonMapper.js";
import { PackMeta } from "../../PackMeta.js";
import type { PackPath } from "../../vfs/PackFileSystem.js";
import { ZipFileSystem } from "../../vfs/ZipFileSystem.js";
import { buildZip } from "../../vfs/zipTestUtil.js";
import {
    LEGACY_MAX_PACK_FORMAT,
    isLegacyPackMeta,
    isLegacyPackRoot,
    readPackMeta,
} from "./LegacyPackFormat.js";

function packMeta(json: string): PackMeta {
    return PackMeta.fromJson(parse(json));
}

/** a pack-root holding nothing but the given pack.mcmeta (omitted entirely when null) */
async function rootWithPackMeta(json: string | null): Promise<PackPath> {
    const fileSystem = await ZipFileSystem.fromBuffer(
        buildZip([
            ...(json === null ? [] : [{ name: "pack.mcmeta", data: json }]),
            { name: "assets/minecraft/blockstates/stone.json", data: "{}" },
        ]),
        "pack.zip",
    );
    return fileSystem.getRootDirectories()[0]!;
}

describe("LEGACY_MAX_PACK_FORMAT", () => {
    it("is the last pre-flattening pack-format", () => {
        // 3 = 1.11 - 1.12.2, 4 = 1.13 (the flattening)
        expect(LEGACY_MAX_PACK_FORMAT).toBe(3);
    });
});

describe("isLegacyPackMeta", () => {
    it("reports a 1.12.2-era pack_format as legacy", () => {
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":3}}'))).toBe(true);
    });

    it("reports every earlier pack_format as legacy too", () => {
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":1}}'))).toBe(true);
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":2}}'))).toBe(true);
    });

    it("reports the flattening and everything after it as modern", () => {
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":4}}'))).toBe(false);
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":34}}'))).toBe(false);
    });

    it("reads a missing pack_format as modern rather than legacy", () => {
        // PackMeta's absent-pack_format default is the *unbounded* range, so a
        // less careful test would classify every meta-less pack as 1.12
        expect(isLegacyPackMeta(packMeta("{}"))).toBe(false);
        expect(isLegacyPackMeta(packMeta('{"pack":{}}'))).toBe(false);
        expect(isLegacyPackMeta(new PackMeta())).toBe(false);
    });

    it("takes the largest declared format, so a range spanning the flattening is modern", () => {
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":[3,4]}}'))).toBe(false);
        expect(isLegacyPackMeta(packMeta('{"pack":{"pack_format":[1,3]}}'))).toBe(true);
    });

    it("consults supported_formats as well as pack_format", () => {
        expect(
            isLegacyPackMeta(packMeta('{"pack":{"pack_format":3,"supported_formats":[3,9]}}')),
        ).toBe(false);
        expect(
            isLegacyPackMeta(packMeta('{"pack":{"pack_format":3,"supported_formats":[2,3]}}')),
        ).toBe(true);
    });

    it("reads the 1.21.9+ min_format/max_format form as modern", () => {
        expect(isLegacyPackMeta(packMeta('{"pack":{"min_format":"64","max_format":"64"}}'))).toBe(
            false,
        );
    });
});

describe("readPackMeta", () => {
    it("reads the pack.mcmeta of a pack-root", async () => {
        const meta = await readPackMeta(await rootWithPackMeta('{"pack":{"pack_format":3}}'));

        expect(meta).not.toBeNull();
        expect(meta!.getPack().getPackFormat().getMaxInclusive()).toBe(3);
    });

    it("returns null when there is no pack.mcmeta", async () => {
        expect(await readPackMeta(await rootWithPackMeta(null))).toBeNull();
    });

    it("returns null for an unparsable pack.mcmeta instead of throwing", async () => {
        expect(await readPackMeta(await rootWithPackMeta("{ not json"))).toBeNull();
    });
});

describe("isLegacyPackRoot", () => {
    it("is true for a pre-flattening pack-root", async () => {
        expect(await isLegacyPackRoot(await rootWithPackMeta('{"pack":{"pack_format":3}}'))).toBe(
            true,
        );
    });

    it("is false for a modern pack-root", async () => {
        expect(await isLegacyPackRoot(await rootWithPackMeta('{"pack":{"pack_format":34}}'))).toBe(
            false,
        );
    });

    it("is false for a pack-root without a pack.mcmeta", async () => {
        expect(await isLegacyPackRoot(await rootWithPackMeta(null))).toBe(false);
    });
});
