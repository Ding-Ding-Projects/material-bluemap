/**
 * Which typefaces the font picker can offer, and what CSS has to be written to actually get
 * one of them on screen.
 *
 * Two separate problems live here. The first is *what exists*: the app ships two families
 * with it and can reasonably assume a handful more are on any Windows install, and Chromium
 * can be asked for the rest — with the user's permission, which they may not give. The second
 * is *what to write*: a bare family name is almost never the right CSS, because the moment
 * text contains a Chinese, Japanese or Korean character a Latin-only face has nothing to draw
 * with and the browser falls back to whatever it likes, which is how an interface ends up
 * with three different Chinese faces on one screen.
 *
 * ### Purity
 *
 * Nothing here touches a browser API at import time. {@link queryInstalledFonts} is the only
 * function that reaches for a global, it does so defensively, and it never throws.
 */

/**
 * The CSS generic a family belongs to, used as the last resort in a stack.
 *
 * Not part of what a font enumeration API reports — Chromium's `queryLocalFonts()` gives a
 * name, a PostScript name and a style, and no notion of "this one is a serif" — so it is
 * optional. A family the app knows about carries it; a family discovered on the machine does
 * not, and falls back to `sans-serif`, which is the right guess for interface text.
 */
export type FontGeneric = "sans-serif" | "serif" | "monospace";

export interface FontFamily {
    family: string;
    /**
     * `"bundled"` means the app can count on this family being available. For the two
     * `@fontsource` packages that is literally true — the files ship inside the application.
     * For the system faces below it means "assumed present on Windows", which is an
     * assumption rather than a guarantee: a stripped install or a non-Windows host may not
     * have them, which is exactly why every stack this module builds still ends in a generic.
     */
    source: "bundled" | "installed";
    /** A short preview string suited to the family — CJK faces get CJK text to render. */
    sample: string;
    /** True when the family can draw CJK text. */
    cjk: boolean;
    generic?: FontGeneric;
}

const LATIN_SAMPLE = "The quick brown fox";
const MONO_SAMPLE = "const size = 14;";
const SIMPLIFIED_SAMPLE = "简体中文示例 Sample";
const TRADITIONAL_SAMPLE = "繁體中文範例 Sample";
const JAPANESE_SAMPLE = "日本語のサンプル Sample";
const KOREAN_SAMPLE = "한국어 샘플 Sample";

/**
 * The families the picker offers before anything is enumerated from the machine.
 *
 * The first two are genuinely bundled: `@fontsource/roboto` and `@fontsource/roboto-mono` are
 * dependencies of this package and their `.woff2` files are built into the application, so
 * they work offline, on a fresh install, and on a locked-down machine with no fonts of its
 * own. Everything after them is a Windows system face, listed because the desktop app targets
 * Windows and these are the faces a Windows install has had for a decade or more. Calling
 * them "bundled" is a simplification the doc comment on {@link FontFamily.source} owns up to.
 *
 * The CJK block matters more than it looks. Without it the picker cannot offer a Chinese,
 * Japanese or Korean face by name at all, and a user whose interface language needs one is
 * left with whatever the browser's default happens to be.
 */
export const BUNDLED_FONTS: readonly FontFamily[] = [
    { family: "Roboto", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "sans-serif" },
    { family: "Roboto Mono", source: "bundled", sample: MONO_SAMPLE, cjk: false, generic: "monospace" },
    { family: "Segoe UI", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "sans-serif" },
    { family: "Arial", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "sans-serif" },
    { family: "Calibri", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "sans-serif" },
    { family: "Tahoma", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "sans-serif" },
    { family: "Verdana", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "sans-serif" },
    { family: "Georgia", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "serif" },
    { family: "Cambria", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "serif" },
    { family: "Times New Roman", source: "bundled", sample: LATIN_SAMPLE, cjk: false, generic: "serif" },
    { family: "Consolas", source: "bundled", sample: MONO_SAMPLE, cjk: false, generic: "monospace" },
    { family: "Courier New", source: "bundled", sample: MONO_SAMPLE, cjk: false, generic: "monospace" },
    { family: "Cascadia Code", source: "bundled", sample: MONO_SAMPLE, cjk: false, generic: "monospace" },
    { family: "Microsoft YaHei", source: "bundled", sample: SIMPLIFIED_SAMPLE, cjk: true, generic: "sans-serif" },
    { family: "Microsoft JhengHei", source: "bundled", sample: TRADITIONAL_SAMPLE, cjk: true, generic: "sans-serif" },
    { family: "Yu Gothic", source: "bundled", sample: JAPANESE_SAMPLE, cjk: true, generic: "sans-serif" },
    { family: "Malgun Gothic", source: "bundled", sample: KOREAN_SAMPLE, cjk: true, generic: "sans-serif" },
    { family: "Noto Sans CJK SC", source: "bundled", sample: SIMPLIFIED_SAMPLE, cjk: true, generic: "sans-serif" },
    { family: "Noto Sans CJK TC", source: "bundled", sample: TRADITIONAL_SAMPLE, cjk: true, generic: "sans-serif" },
    { family: "SimSun", source: "bundled", sample: SIMPLIFIED_SAMPLE, cjk: true, generic: "serif" },
    { family: "MingLiU", source: "bundled", sample: TRADITIONAL_SAMPLE, cjk: true, generic: "serif" },
];

/**
 * The CJK families appended to every stack this module builds, in the order they are tried.
 *
 * A Latin face has no glyphs for 中文, and CSS resolves that per character: the first family
 * in the stack that *has* the glyph draws it. Without an explicit tail the browser picks a
 * fallback of its own and different runs of text can end up in different faces. Simplified
 * first, then Traditional, then Japanese and Korean, then the Noto faces, then a serif face
 * that predates all of them and is present on essentially every Windows install.
 */
export const CJK_FALLBACK_STACK: readonly string[] = [
    "Microsoft YaHei",
    "Microsoft JhengHei",
    "Yu Gothic",
    "Malgun Gothic",
    "Noto Sans CJK SC",
    "SimSun",
];

/** The Latin faces tried before falling through to the CJK tail, per generic. */
const LATIN_FALLBACKS: Record<FontGeneric, readonly string[]> = {
    "sans-serif": ["Roboto", "Segoe UI", "Arial"],
    serif: ["Georgia", "Times New Roman"],
    monospace: ["Roboto Mono", "Consolas", "Courier New"],
};

/** Anything outside printable ASCII, which is the same test as "needs quoting". */
const NON_ASCII = /[^ -~]/;

/**
 * Quotes a family name for CSS when it needs it.
 *
 * An unquoted family name in CSS is a sequence of identifiers, which means a name containing
 * a space is legal but fragile and a name containing non-ASCII characters — every CJK family
 * name written in its own script — is not reliably parseable at all. Quoting both cases is
 * cheaper than reasoning about which engine tolerates what.
 */
function quoteFamily(family: string): string {
    if (!family.includes(" ") && !NON_ASCII.test(family)) return family;
    return `"${family.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function findEntry(catalog: readonly FontFamily[], family: string): FontFamily | undefined {
    const wanted = family.toLowerCase();
    return catalog.find((entry) => entry.family.toLowerCase() === wanted);
}

/**
 * Builds the full CSS `font-family` value for a chosen family.
 *
 * The chosen family is first and is never dropped, including when it is itself one of the
 * fallbacks — a CJK family chosen on purpose must stay at the head of the stack, or the text
 * it was chosen for gets drawn by whichever CJK face happens to come earlier. After it come
 * the Latin faces for its generic, then {@link CJK_FALLBACK_STACK}, then the generic itself,
 * which is the only entry guaranteed to resolve to something on every machine.
 *
 * Duplicates are removed case-insensitively, keeping the earliest occurrence, so the result
 * is stable and short enough to assert on in a test.
 */
export function fontFamilyStack(family: string, catalog: readonly FontFamily[] = BUNDLED_FONTS): string {
    const entry = findEntry(catalog, family);
    const generic: FontGeneric = entry?.generic ?? "sans-serif";

    const seen = new Set<string>();
    const parts: string[] = [];
    for (const candidate of [family, ...LATIN_FALLBACKS[generic], ...CJK_FALLBACK_STACK]) {
        const key = candidate.toLowerCase();
        if (candidate === "" || seen.has(key)) continue;
        seen.add(key);
        parts.push(quoteFamily(candidate));
    }
    parts.push(generic);
    return parts.join(", ");
}

/** The shape this module needs from an enumerated font; Chromium's `FontData` has more. */
export interface LocalFontLike {
    family: string;
}

/** CJK ideographs, kana and Hangul — enough to recognise a family named in its own script. */
const CJK_NAME_SCRIPTS = /[぀-ヿ㐀-䶿一-鿿가-힯豈-﫿]/;

/**
 * Folds families enumerated from the machine into the known catalog.
 *
 * De-duplication is case-insensitive because `queryLocalFonts()` reports one record per
 * *style* — Regular, Italic, Bold, Semibold — all sharing a family name, and because the same
 * family can be spelled with different casing by different foundries. The curated spelling
 * wins for display so the list does not flicker between `Segoe UI` and `SEGOE UI`.
 *
 * `installed` wins for {@link FontFamily.source}, since a family that is genuinely on the
 * machine is a stronger fact than an assumption that it would be. Everything else about a
 * known family — its sample text, whether it draws CJK, its generic — is kept, because the
 * enumeration API reports none of that and discarding it would downgrade a curated entry to a
 * bare name.
 *
 * A family this module has never heard of gets a guessed sample: a name written in CJK script
 * is a CJK family often enough for the preview to be right, and the guess costs nothing when
 * it is wrong. The result is sorted by family name, so it is the same list every time.
 */
export function mergeFontCatalog(
    local: readonly LocalFontLike[],
    bundled: readonly FontFamily[] = BUNDLED_FONTS,
): FontFamily[] {
    const byKey = new Map<string, FontFamily>();

    for (const entry of bundled) {
        const key = entry.family.toLowerCase();
        if (!byKey.has(key)) byKey.set(key, { ...entry });
    }

    for (const found of local) {
        const family = found.family;
        if (family === "") continue;
        const key = family.toLowerCase();
        const known = byKey.get(key);
        if (known !== undefined) {
            byKey.set(key, { ...known, source: "installed" });
            continue;
        }
        const cjk = CJK_NAME_SCRIPTS.test(family);
        byKey.set(key, {
            family,
            source: "installed",
            sample: cjk ? SIMPLIFIED_SAMPLE : LATIN_SAMPLE,
            cjk,
        });
    }

    return [...byKey.values()].sort((left, right) => left.family.localeCompare(right.family));
}

/**
 * Filters a catalog with a caller-supplied predicate.
 *
 * A predicate rather than a query string, so the font picker's search bar uses the same
 * plain-text-or-regex matcher every other search bar in the app uses instead of this module
 * growing a second, subtly different one. Matching is against the family name only: the
 * sample text is a rendering of the face, not a searchable property of it.
 */
export function searchFonts(catalog: readonly FontFamily[], matches: (text: string) => boolean): FontFamily[] {
    return catalog.filter((entry) => matches(entry.family));
}

/** Chromium's Local Font Access API, reached for without assuming a DOM lib is in scope. */
type FontQueryGlobal = { queryLocalFonts?: () => Promise<LocalFontLike[]> };

/**
 * Every family the picker can offer: the known catalog, plus whatever the machine has.
 *
 * `queryLocalFonts()` exists only in Chromium, only in a secure context, and only answers
 * after the user grants a permission prompt. Every one of those can fail, and none of them is
 * an error worth interrupting anybody over:
 *
 * - **The API is absent** on any non-Chromium engine and in a Node test. Nothing has gone
 *   wrong; the picker simply offers the bundled families.
 * - **The promise rejects** when the user dismisses or denies the permission prompt. Refusing
 *   to let an app read the list of fonts you have installed is a perfectly reasonable privacy
 *   decision — it is a fingerprinting surface, which is why the prompt exists — and answering
 *   it with an error toast would be scolding somebody for using a feature as designed.
 *
 * Either way the picker still works, still shows a real list, and every stack it builds still
 * ends in a generic, so nothing is unusable. The fallback is silent on purpose.
 */
export async function queryInstalledFonts(): Promise<FontFamily[]> {
    const query = (globalThis as FontQueryGlobal).queryLocalFonts;
    if (typeof query !== "function") return [...BUNDLED_FONTS];
    try {
        const local = await query.call(globalThis);
        return mergeFontCatalog(local);
    } catch {
        return [...BUNDLED_FONTS];
    }
}
