/**
 * The font catalog, tested on the two things that actually break.
 *
 * The stack builder is asserted as whole strings rather than by substring, because the whole
 * point of it is the *order*: a CJK fallback that arrives before the family somebody chose is
 * a bug you cannot see in a test that only checks the fallback is present somewhere. And the
 * enumeration wrapper is tested for the two failures it is designed to swallow — the API not
 * existing, and the user declining the permission prompt — since a picker that throws in
 * either case is a picker that breaks the settings screen for anyone who values their privacy.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
    BUNDLED_FONTS,
    CJK_FALLBACK_STACK,
    fontFamilyStack,
    mergeFontCatalog,
    queryInstalledFonts,
    searchFonts,
    type FontFamily,
    type LocalFontLike,
} from "./fontCatalog.js";

/** The global the Local Font Access API lives on, typed so a test can put one there. */
type FontQueryGlobal = typeof globalThis & { queryLocalFonts?: () => Promise<LocalFontLike[]> };

const withFontQuery = globalThis as FontQueryGlobal;

afterEach(() => {
    delete withFontQuery.queryLocalFonts;
});

describe("what the app ships with", () => {
    it("lists the two families that are genuinely bundled", () => {
        const bundled = BUNDLED_FONTS.filter((entry) => entry.source === "bundled").map((entry) => entry.family);
        expect(bundled).toContain("Roboto");
        expect(bundled).toContain("Roboto Mono");
    });

    it("offers the common Windows CJK faces and marks them as CJK", () => {
        for (const family of ["Microsoft YaHei", "Microsoft JhengHei", "Yu Gothic", "Malgun Gothic", "SimSun", "MingLiU"]) {
            const entry = BUNDLED_FONTS.find((candidate) => candidate.family === family);
            expect(entry?.cjk).toBe(true);
        }
    });

    it("gives a CJK family a sample it can actually draw", () => {
        const yahei = BUNDLED_FONTS.find((entry) => entry.family === "Microsoft YaHei");
        const roboto = BUNDLED_FONTS.find((entry) => entry.family === "Roboto");
        expect(yahei?.sample).not.toBe(roboto?.sample);
        expect(/[一-鿿]/.test(yahei?.sample ?? "")).toBe(true);
    });

    it("has no duplicate families", () => {
        const keys = BUNDLED_FONTS.map((entry) => entry.family.toLowerCase());
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("building a font-family stack", () => {
    it("quotes a family whose name has a space, and ends in a generic", () => {
        expect(fontFamilyStack("Segoe UI")).toBe(
            '"Segoe UI", Roboto, Arial, "Microsoft YaHei", "Microsoft JhengHei", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", SimSun, sans-serif',
        );
    });

    it("leaves a single-word ASCII family unquoted", () => {
        expect(fontFamilyStack("Roboto").startsWith("Roboto, ")).toBe(true);
    });

    it("ends a monospace family in monospace, with the monospace fallbacks", () => {
        expect(fontFamilyStack("Consolas")).toBe(
            'Consolas, "Roboto Mono", "Courier New", "Microsoft YaHei", "Microsoft JhengHei", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", SimSun, monospace',
        );
    });

    it("ends a serif family in serif", () => {
        const stack = fontFamilyStack("Georgia");
        expect(stack.startsWith("Georgia, ")).toBe(true);
        expect(stack.endsWith(", serif")).toBe(true);
        expect(stack).toContain('"Times New Roman"');
    });

    it("quotes a family named in its own script, because unquoted non-ASCII is not safe CSS", () => {
        expect(fontFamilyStack("微软雅黑").startsWith('"微软雅黑", ')).toBe(true);
    });

    it("keeps a chosen CJK family at the head instead of losing it to the fallback tail", () => {
        expect(fontFamilyStack("Microsoft YaHei")).toBe(
            '"Microsoft YaHei", Roboto, "Segoe UI", Arial, "Microsoft JhengHei", "Yu Gothic", "Malgun Gothic", "Noto Sans CJK SC", SimSun, sans-serif',
        );
    });

    it("appends every CJK fallback to every stack", () => {
        for (const family of ["Roboto", "Georgia", "Consolas", "Something Unknown"]) {
            const stack = fontFamilyStack(family);
            for (const fallback of CJK_FALLBACK_STACK) {
                expect(stack.includes(fallback)).toBe(true);
            }
        }
    });

    it("treats a family it has never heard of as sans-serif rather than refusing it", () => {
        const stack = fontFamilyStack("Comic Neue");
        expect(stack.startsWith('"Comic Neue", ')).toBe(true);
        expect(stack.endsWith(", sans-serif")).toBe(true);
    });

    it("never repeats a family, however it was capitalized", () => {
        const parts = fontFamilyStack("segoe ui").split(", ");
        const keys = parts.map((part) => part.replaceAll('"', "").toLowerCase());
        expect(new Set(keys).size).toBe(keys.length);
    });

    it("uses the catalog it is handed rather than only the bundled one", () => {
        const catalog: FontFamily[] = [
            { family: "Fira Code", source: "installed", sample: "x", cjk: false, generic: "monospace" },
        ];
        expect(fontFamilyStack("Fira Code", catalog).endsWith(", monospace")).toBe(true);
    });
});

describe("merging enumerated families into the catalog", () => {
    const fixture: readonly FontFamily[] = [
        { family: "Roboto", source: "bundled", sample: "bundled sample", cjk: false, generic: "sans-serif" },
        { family: "SimSun", source: "bundled", sample: "宋體", cjk: true, generic: "serif" },
    ];

    it("de-duplicates case-insensitively and keeps the curated spelling", () => {
        const merged = mergeFontCatalog([{ family: "roboto" }, { family: "ROBOTO" }], fixture);
        expect(merged.map((entry) => entry.family)).toEqual(["Roboto", "SimSun"]);
    });

    it("lets installed win for the source label, because it is the stronger fact", () => {
        const merged = mergeFontCatalog([{ family: "roboto" }], fixture);
        expect(merged.find((entry) => entry.family === "Roboto")?.source).toBe("installed");
        expect(merged.find((entry) => entry.family === "SimSun")?.source).toBe("bundled");
    });

    it("preserves the metadata the enumeration API cannot report", () => {
        const merged = mergeFontCatalog([{ family: "simsun" }], fixture);
        const entry = merged.find((candidate) => candidate.family === "SimSun");
        expect(entry?.sample).toBe("宋體");
        expect(entry?.cjk).toBe(true);
        expect(entry?.generic).toBe("serif");
        expect(entry?.source).toBe("installed");
    });

    it("sorts by family name, deterministically", () => {
        const scrambled = mergeFontCatalog([{ family: "Zapfino" }, { family: "Andale Mono" }, { family: "Menlo" }], fixture);
        expect(scrambled.map((entry) => entry.family)).toEqual([
            "Andale Mono",
            "Menlo",
            "Roboto",
            "SimSun",
            "Zapfino",
        ]);
        expect(mergeFontCatalog([{ family: "Menlo" }, { family: "Andale Mono" }], fixture)).toEqual(
            mergeFontCatalog([{ family: "Andale Mono" }, { family: "Menlo" }], fixture),
        );
    });

    it("guesses CJK coverage from a family named in a CJK script", () => {
        const merged = mergeFontCatalog([{ family: "思源黑體" }, { family: "Zapfino" }], fixture);
        const source = merged.find((entry) => entry.family === "思源黑體");
        const zapfino = merged.find((entry) => entry.family === "Zapfino");
        expect(source?.cjk).toBe(true);
        expect(zapfino?.cjk).toBe(false);
        expect(source?.sample).not.toBe(zapfino?.sample);
    });

    it("ignores a nameless record rather than adding a blank row", () => {
        expect(mergeFontCatalog([{ family: "" }], fixture).map((entry) => entry.family)).toEqual([
            "Roboto",
            "SimSun",
        ]);
    });

    it("returns the catalog untouched when nothing was enumerated", () => {
        expect(mergeFontCatalog([], fixture).map((entry) => entry.source)).toEqual(["bundled", "bundled"]);
    });

    it("copies rather than aliasing the entries it was given", () => {
        const merged = mergeFontCatalog([{ family: "roboto" }], fixture);
        expect(fixture[0]?.source).toBe("bundled");
        expect(merged[0]).not.toBe(fixture[0]);
    });
});

describe("searching the catalog", () => {
    const catalog: readonly FontFamily[] = [
        { family: "Roboto", source: "bundled", sample: "a", cjk: false },
        { family: "Roboto Mono", source: "bundled", sample: "b", cjk: false },
        { family: "Georgia", source: "installed", sample: "c", cjk: false },
    ];

    it("takes a predicate, so the caller's own plain-or-regex matcher is the one that runs", () => {
        const matches = (text: string): boolean => text.toLowerCase().includes("roboto");
        expect(searchFonts(catalog, matches).map((entry) => entry.family)).toEqual(["Roboto", "Roboto Mono"]);
    });

    it("matches the family name and nothing else, so a sample cannot pull in a false hit", () => {
        expect(searchFonts(catalog, (text) => text === "c")).toEqual([]);
    });

    it("returns everything for a predicate that accepts everything", () => {
        expect(searchFonts(catalog, () => true)).toHaveLength(3);
    });
});

describe("asking the machine what it has", () => {
    it("falls back to the bundled families when the API does not exist", async () => {
        expect(withFontQuery.queryLocalFonts).toBeUndefined();
        await expect(queryInstalledFonts()).resolves.toEqual([...BUNDLED_FONTS]);
    });

    it("falls back silently when the permission prompt is denied, because that is a valid answer", async () => {
        withFontQuery.queryLocalFonts = () => Promise.reject(new Error("The user denied permission."));
        await expect(queryInstalledFonts()).resolves.toEqual([...BUNDLED_FONTS]);
    });

    it("falls back when the API throws synchronously rather than rejecting", async () => {
        withFontQuery.queryLocalFonts = () => {
            throw new Error("not a secure context");
        };
        await expect(queryInstalledFonts()).resolves.toEqual([...BUNDLED_FONTS]);
    });

    it("merges what it got, collapsing the per-style records into one row per family", async () => {
        withFontQuery.queryLocalFonts = () =>
            Promise.resolve([{ family: "Segoe UI" }, { family: "Segoe UI" }, { family: "Zapfino" }]);

        const catalog = await queryInstalledFonts();
        const segoe = catalog.filter((entry) => entry.family === "Segoe UI");
        expect(segoe).toHaveLength(1);
        expect(segoe[0]?.source).toBe("installed");
        expect(segoe[0]?.generic).toBe("sans-serif");
        expect(catalog.find((entry) => entry.family === "Zapfino")?.source).toBe("installed");
        expect(catalog.find((entry) => entry.family === "Roboto")?.source).toBe("bundled");
    });
});
