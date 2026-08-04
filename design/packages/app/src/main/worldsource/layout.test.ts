/**
 * Deciding what a release is offering, from the asset list alone.
 *
 * The shape under test is the real one: four `.zip.part.NNNN` assets and a `SHA256SUMS`,
 * exactly as the Andyville world is published. The gap check is the case that matters
 * most - a split with a hole in it joins into a shorter archive that still unzips.
 */

import { describe, expect, it } from "vitest";
import type { ReleaseInfo } from "../download/release.js";
import {
    WorldSourceLayoutError,
    findWorldSource,
    partCount,
    readPartName,
    worldSourcesIn,
} from "./layout.js";

function release(assets: readonly { name: string; size: number }[]): ReleaseInfo {
    return {
        owner: "cafepromenade",
        repo: "Andyville-World",
        tag: "andyville-backup-20260804-160001",
        name: "Andyville world",
        htmlUrl: "https://github.com/cafepromenade/Andyville-World/releases/tag/x",
        assets: assets.map((asset) => ({
            name: asset.name,
            size: asset.size,
            downloadUrl: `https://cdn.example/${asset.name}`,
            apiUrl: `https://api.example/assets/${asset.name}`,
        })),
    };
}

const ANDYVILLE = release([
    { name: "andyville-world-20260804-160001.zip.part.0000", size: 1_700_000_000 },
    { name: "andyville-world-20260804-160001.zip.part.0001", size: 1_700_000_000 },
    { name: "andyville-world-20260804-160001.zip.part.0002", size: 1_700_000_000 },
    { name: "andyville-world-20260804-160001.zip.part.0003", size: 1_518_058_456 },
    { name: "SHA256SUMS", size: 448 },
]);

describe("readPartName", () => {
    it("reads every spelling of a part suffix", () => {
        expect(readPartName("world.zip.part.0003")).toEqual({ base: "world.zip", index: 3 });
        expect(readPartName("world.zip.part0003")).toEqual({ base: "world.zip", index: 3 });
        expect(readPartName("world.zip.003")).toEqual({ base: "world.zip", index: 3 });
        expect(readPartName("world.zip")).toBeNull();
        expect(readPartName("SHA256SUMS")).toBeNull();
    });

    it("takes the last numeric group, so a file genuinely called world.001 survives", () => {
        expect(readPartName("world.001.002")).toEqual({ base: "world.001", index: 2 });
    });
});

describe("worldSourcesIn", () => {
    it("reads the Andyville release as one 6.6 GB world in four parts", () => {
        const sources = worldSourcesIn(ANDYVILLE);
        expect(sources).toHaveLength(1);
        const source = sources[0];
        if (source === undefined) throw new Error("expected one world source");
        expect(source.kind).toBe("checksums");
        expect(source.name).toBe("andyville-world-20260804-160001.zip");
        expect(partCount(source)).toBe(4);
        expect(source.bytes).toBe(6_618_058_456);
    });

    it("puts the parts in join order even when the publisher numbered from zero", () => {
        const source = worldSourcesIn(ANDYVILLE)[0];
        if (source?.kind !== "checksums") throw new Error("expected a checksum-list source");
        expect(source.parts.map((part) => part.index)).toEqual([0, 1, 2, 3]);
        expect(source.parts[0]?.name).toBe("andyville-world-20260804-160001.zip.part.0000");
        expect(source.checksums.name).toBe("SHA256SUMS");
    });

    it("refuses a split with a hole in it, by name, before anything is downloaded", () => {
        const holed = release([
            { name: "world.zip.part.0000", size: 10 },
            { name: "world.zip.part.0002", size: 10 },
            { name: "SHA256SUMS", size: 100 },
        ]);
        // Joining what is there would produce a shorter archive that still unzips, and a
        // world that opens and corrupts later.
        expect(() => worldSourcesIn(holed)).toThrow(WorldSourceLayoutError);
        expect(() => worldSourcesIn(holed)).toThrow(/jumps from part 0 to 2/);
    });

    it("refuses a split whose first part was never published", () => {
        const truncated = release([
            { name: "world.zip.part.0002", size: 10 },
            { name: "world.zip.part.0003", size: 10 },
            { name: "SHA256SUMS", size: 100 },
        ]);
        expect(() => worldSourcesIn(truncated)).toThrow(/starts at part 2/);
    });

    it("prefers a manifest when a release carries both, because it has a whole-file digest", () => {
        const both = release([
            { name: "world.zip.001", size: 10 },
            { name: "world.zip.002", size: 10 },
            { name: "world.zip.parts.json", size: 400 },
            { name: "SHA256SUMS", size: 100 },
        ]);
        const sources = worldSourcesIn(both);
        expect(sources).toHaveLength(1);
        expect(sources[0]?.kind).toBe("manifest");
    });

    it("offers an unsplit archive as itself", () => {
        const small = release([{ name: "world.zip", size: 4_000 }]);
        expect(worldSourcesIn(small)).toEqual([
            expect.objectContaining({ kind: "whole", name: "world.zip", bytes: 4_000 }),
        ]);
    });

    it("ignores assets that are not archives, so an installer is never offered as a world", () => {
        const mixed = release([
            { name: "Setup.exe", size: 90_000 },
            { name: "RELEASES", size: 120 },
            { name: "world.zip", size: 4_000 },
        ]);
        expect(worldSourcesIn(mixed).map((source) => source.name)).toEqual(["world.zip"]);
    });

    it("finds nothing in a release that carries nothing", () => {
        expect(worldSourcesIn(release([]))).toEqual([]);
    });
});

describe("findWorldSource", () => {
    it("finds a source by the name it presents rather than by an asset name", () => {
        const sources = worldSourcesIn(ANDYVILLE);
        expect(findWorldSource(sources, "andyville-world-20260804-160001.zip")?.kind).toBe(
            "checksums",
        );
        // The published part name is not the name of the download.
        expect(findWorldSource(sources, "andyville-world-20260804-160001.zip.part.0000")).toBeNull();
    });
});
