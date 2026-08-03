import { describe, expect, it } from "vitest";
import { parse } from "../adapter/JsonMapper.js";
import {
    Features,
    Overlay,
    Overlays,
    PackMeta,
    PackMetaPack,
    VersionRange,
    VersionRangeAdapter,
} from "./PackMeta.js";
import { PackVersion } from "./PackVersion.js";

const INTEGER_MIN_VALUE = -2147483648;
const INTEGER_MAX_VALUE = 2147483647;

function packMeta(json: string): PackMeta {
    return PackMeta.fromJson(parse(json));
}

describe("VersionRange", () => {
    const adapter = new VersionRangeAdapter();

    it("reads a bare number as the single-version range [n, n]", () => {
        const range = adapter.read(parse("10"));
        expect(range.getMinInclusive()).toBe(10);
        expect(range.getMaxInclusive()).toBe(10);
        expect(range.includes(10)).toBe(true);
        expect(range.includes(9)).toBe(false);
        expect(range.includes(11)).toBe(false);
    });

    it("reads an array as [min, max] and skips any further elements", () => {
        const range = adapter.read(parse("[4, 7, 99, 123]"));
        expect(range.getMinInclusive()).toBe(4);
        expect(range.getMaxInclusive()).toBe(7);
        expect(range.includes(4)).toBe(true);
        expect(range.includes(7)).toBe(true);
        expect(range.includes(8)).toBe(false);
    });

    it("reads the object-form with min_inclusive / max_inclusive", () => {
        const range = adapter.read(parse('{"min_inclusive": 4, "max_inclusive": 7}'));
        expect(range.getMinInclusive()).toBe(4);
        expect(range.getMaxInclusive()).toBe(7);
        expect(range.includes(5)).toBe(true);
        expect(range.includes(3)).toBe(false);
    });

    it("keeps the Integer.MIN_VALUE / MAX_VALUE defaults for absent object-members", () => {
        const empty = adapter.read(parse("{}"));
        expect(empty.getMinInclusive()).toBe(INTEGER_MIN_VALUE);
        expect(empty.getMaxInclusive()).toBe(INTEGER_MAX_VALUE);
        expect(empty.includes(0)).toBe(true);

        const onlyMin = adapter.read(parse('{"min_inclusive": 4}'));
        expect(onlyMin.getMinInclusive()).toBe(4);
        expect(onlyMin.getMaxInclusive()).toBe(INTEGER_MAX_VALUE);
        expect(onlyMin.includes(9999)).toBe(true);
        expect(onlyMin.includes(3)).toBe(false);
    });

    it("defaults to the all-inclusive range", () => {
        const range = new VersionRange();
        expect(range.includes(INTEGER_MIN_VALUE)).toBe(true);
        expect(range.includes(0)).toBe(true);
        expect(range.includes(INTEGER_MAX_VALUE)).toBe(true);
    });

    it("does not support writing (upstream: UnsupportedOperationException)", () => {
        expect(() => adapter.write(new VersionRange())).toThrow("UnsupportedOperationException");
    });
});

describe("PackMeta.Pack", () => {
    it("exposes the upstream nested-class names", () => {
        expect(PackMeta.Pack).toBe(PackMetaPack);
        expect(PackMeta.Overlays).toBe(Overlays);
        expect(PackMeta.Overlay).toBe(Overlay);
        expect(PackMeta.Features).toBe(Features);
        expect(PackMeta.VersionRange).toBe(VersionRange);
    });

    it("defaults to an empty meta that matches every version", () => {
        const meta = new PackMeta();
        expect(meta.getPack().getMinFormat()).toBeNull();
        expect(meta.getPack().getMaxFormat()).toBeNull();
        expect(meta.getPack().getSupportedFormats()).toBeNull();
        expect(meta.getOverlays().getEntries()).toEqual([]);
        expect(meta.getFeatures().getEnabled()).toEqual([]);
        // the pack_format default is the all-inclusive VersionRange
        expect(meta.getPack().includes(new PackVersion(1, 0))).toBe(true);
        expect(meta.getPack().includes(new PackVersion(999, 0))).toBe(true);
    });

    describe("<= 1.21.8 era (pack_format / supported_formats)", () => {
        it("matches on pack_format when min_format/max_format are absent", () => {
            const meta = packMeta('{"pack": {"pack_format": 10}}');
            expect(meta.getPack().getMinFormat()).toBeNull();
            expect(meta.getPack().includes(new PackVersion(10, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(10, 5))).toBe(true); // only the major is compared
            expect(meta.getPack().includes(new PackVersion(11, 0))).toBe(false);
        });

        it("matches on supported_formats before falling back to pack_format", () => {
            const meta = packMeta('{"pack": {"pack_format": 10, "supported_formats": [8, 12]}}');
            expect(meta.getPack().includes(new PackVersion(8, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(10, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(12, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(13, 0))).toBe(false);
        });

        it("still falls through to the all-inclusive pack_format default (bug-for-bug)", () => {
            // no pack_format member -> the [MIN, MAX] default matches anything, so a
            // supported_formats miss is irrelevant
            const meta = packMeta('{"pack": {"supported_formats": [8, 12]}}');
            expect(meta.getPack().includes(new PackVersion(20, 0))).toBe(true);
        });

        it("falls back to the old era when only one of min_format/max_format is given", () => {
            const meta = packMeta('{"pack": {"min_format": [63, 0], "pack_format": 10}}');
            expect(meta.getPack().getMinFormat()?.getMajor()).toBe(63);
            expect(meta.getPack().getMaxFormat()).toBeNull();
            expect(meta.getPack().includes(new PackVersion(10, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(63, 0))).toBe(false);
        });
    });

    describe("new era (min_format / max_format)", () => {
        it("reads min_format with a default minor of 0 and max_format with Integer.MAX_VALUE", () => {
            const meta = packMeta('{"pack": {"min_format": 63, "max_format": 64}}');
            expect(meta.getPack().getMinFormat()?.getMajor()).toBe(63);
            expect(meta.getPack().getMinFormat()?.getMinor()).toBe(0);
            expect(meta.getPack().getMaxFormat()?.getMajor()).toBe(64);
            expect(meta.getPack().getMaxFormat()?.getMinor()).toBe(INTEGER_MAX_VALUE);
        });

        it("matches the exact version when min_format equals max_format", () => {
            const meta = packMeta('{"pack": {"min_format": [63, 0], "max_format": [63, 0]}}');
            expect(meta.getPack().includes(new PackVersion(63, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(63, 1))).toBe(false);
            expect(meta.getPack().includes(new PackVersion(62, 0))).toBe(false);
            expect(meta.getPack().includes(new PackVersion(64, 0))).toBe(false);
        });

        it("compares the range in the reversed direction (upstream PackVersion, bug-for-bug)", () => {
            // `version.isGreaterOrEqual(minFormat)` is true when *minFormat* >= version, so
            // the range that actually matches is max_format <= version <= min_format
            const meta = packMeta('{"pack": {"min_format": [20, 0], "max_format": [10, 0]}}');
            expect(meta.getPack().includes(new PackVersion(15, 0))).toBe(true);
            expect(meta.getPack().includes(new PackVersion(5, 0))).toBe(false);
            expect(meta.getPack().includes(new PackVersion(25, 0))).toBe(false);
        });
    });
});

describe("PackMeta.Overlay", () => {
    it("reads the entries array", () => {
        const meta = packMeta(
            '{"overlays": {"entries": [' +
                '{"formats": 10, "directory": "a"},' +
                '{"formats": [11, 13], "directory": "b"}' +
                "]}}",
        );
        const entries = meta.getOverlays().getEntries();
        expect(entries.length).toBe(2);
        expect(entries[0]!.getDirectory()).toBe("a");
        expect(entries[1]!.getDirectory()).toBe("b");
    });

    it("matches on `formats` (the <= 1.21.8 era) when min_format/max_format are absent", () => {
        const overlay = Overlay.fromJson(parse('{"formats": [11, 13], "directory": "b"}'));
        expect(overlay.includes(new PackVersion(10, 0))).toBe(false);
        expect(overlay.includes(new PackVersion(11, 0))).toBe(true);
        expect(overlay.includes(new PackVersion(13, 99))).toBe(true);
        expect(overlay.includes(new PackVersion(14, 0))).toBe(false);
    });

    it("matches on min_format/max_format when both are present", () => {
        const overlay = Overlay.fromJson(
            parse('{"min_format": [63, 0], "max_format": [63, 0], "directory": "b"}'),
        );
        expect(overlay.includes(new PackVersion(63, 0))).toBe(true);
        expect(overlay.includes(new PackVersion(62, 0))).toBe(false);
    });

    it("defaults directory to null and formats to the all-inclusive range", () => {
        const overlay = Overlay.fromJson(parse("{}"));
        expect(overlay.getDirectory()).toBeNull();
        expect(overlay.getMinFormat()).toBeNull();
        expect(overlay.getMaxFormat()).toBeNull();
        expect(overlay.includes(new PackVersion(1, 0))).toBe(true);
    });

    it("defaults to no entries when the overlays member is absent", () => {
        expect(packMeta('{"pack": {}}').getOverlays().getEntries()).toEqual([]);
        expect(packMeta('{"overlays": {}}').getOverlays().getEntries()).toEqual([]);
    });
});

describe("PackMeta.Features", () => {
    it("reads the enabled feature keys", () => {
        const meta = packMeta('{"features": {"enabled": ["minecraft:foo", "bar", "other:baz"]}}');
        expect(
            meta
                .getFeatures()
                .getEnabled()
                .map((key) => key.getFormatted()),
        ).toEqual(["minecraft:foo", "minecraft:bar", "other:baz"]);
    });

    it("defaults to no enabled features", () => {
        expect(packMeta("{}").getFeatures().getEnabled()).toEqual([]);
        expect(packMeta('{"features": {}}').getFeatures().getEnabled()).toEqual([]);
    });
});
