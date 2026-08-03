/**
 * Font families offered by the typography controls.
 *
 * The site bundles no webfont and fetches nothing, so the list starts from system
 * stacks that are present on the platforms this site is read on. Where the browser
 * exposes the Local Font Access API and the visitor grants it, the installed
 * families are added on top. Nothing is enumerated without that grant, and the
 * controls say which list they are showing rather than implying the short one is
 * everything installed.
 */

/**
 * Appended to every stack so Cantonese copy renders even when the chosen Latin
 * family has no CJK coverage. Without this, bilingual mode falls through to a
 * default that differs per platform and often per element.
 */
export const CJK_FALLBACK =
    '"Noto Sans CJK HK", "Noto Sans HK", "PingFang HK", "PingFang TC", "Microsoft JhengHei", "Microsoft YaHei", "Heiti TC", "Hiragino Sans", sans-serif';

export const CJK_SERIF_FALLBACK =
    '"Noto Serif CJK HK", "Noto Serif HK", "Songti TC", "SimSun", "MingLiU", "Hiragino Mincho ProN", serif';

export const CJK_MONO_FALLBACK =
    '"Noto Sans Mono CJK HK", "Sarasa Mono HC", "PingFang HK", "Microsoft JhengHei", monospace';

export type FontSource = "system" | "generic" | "local";

export interface FontFamilyEntry {
    /** Stable id stored in settings and themes. */
    readonly id: string;
    /** Shown in the list, drawn in its own face. */
    readonly name: string;
    /** The full CSS `font-family` value, CJK fallback already appended. */
    readonly stack: string;
    readonly source: FontSource;
    readonly monospace: boolean;
}

function sans(id: string, name: string, families: string): FontFamilyEntry {
    return { id, name, stack: `${families}, ${CJK_FALLBACK}`, source: "system", monospace: false };
}

function serif(id: string, name: string, families: string): FontFamilyEntry {
    return {
        id,
        name,
        stack: `${families}, ${CJK_SERIF_FALLBACK}`,
        source: "system",
        monospace: false,
    };
}

function mono(id: string, name: string, families: string): FontFamilyEntry {
    return { id, name, stack: `${families}, ${CJK_MONO_FALLBACK}`, source: "system", monospace: true };
}

/**
 * The always-available list.
 *
 * These are stacks, not single families: each names the closest match on every
 * platform so the site looks intentional everywhere rather than correct on one
 * machine and arbitrary elsewhere.
 */
export const SYSTEM_FONT_FAMILIES: readonly FontFamilyEntry[] = [
    {
        id: "system-ui",
        name: "System interface",
        stack: `system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, ${CJK_FALLBACK}`,
        source: "generic",
        monospace: false,
    },
    sans("roboto", "Roboto", 'Roboto, "Roboto Flex", system-ui'),
    sans("inter", "Inter", 'Inter, "Inter Variable", system-ui'),
    sans("segoe", "Segoe UI", '"Segoe UI", "Segoe UI Variable", system-ui'),
    sans("helvetica", "Helvetica Neue", '"Helvetica Neue", Helvetica, Arial'),
    sans("arial", "Arial", "Arial, Helvetica"),
    sans("verdana", "Verdana", "Verdana, Geneva"),
    sans("tahoma", "Tahoma", "Tahoma, Geneva"),
    sans("trebuchet", "Trebuchet MS", '"Trebuchet MS", Tahoma'),
    sans("optima", "Optima", "Optima, Candara"),
    serif("georgia", "Georgia", 'Georgia, "Times New Roman"'),
    serif("times", "Times New Roman", '"Times New Roman", Times'),
    serif("palatino", "Palatino", 'Palatino, "Palatino Linotype", "Book Antiqua"'),
    serif("garamond", "Garamond", 'Garamond, "EB Garamond", Georgia'),
    mono("mono-ui", "System monospace", 'ui-monospace, SFMono-Regular, "SF Mono"'),
    mono("consolas", "Consolas", 'Consolas, "Cascadia Mono", Menlo'),
    mono("menlo", "Menlo", "Menlo, Monaco, Consolas"),
    mono("jetbrains", "JetBrains Mono", '"JetBrains Mono", "Fira Code", Consolas'),
    mono("courier", "Courier New", '"Courier New", Courier'),
    {
        id: "cursive",
        name: "Cursive",
        stack: `cursive, ${CJK_FALLBACK}`,
        source: "generic",
        monospace: false,
    },
];

/**
 * Whether a family is actually installed.
 *
 * `document.fonts.check` answers for the first family in the string, so this asks
 * about one family at a time. It is a hint used to mark a list entry, never a
 * reason to hide one: hiding an entry that a visitor's machine reports oddly would
 * remove a font they can genuinely see.
 */
export function isFamilyAvailable(family: string): boolean {
    try {
        if (typeof document === "undefined" || document.fonts === undefined) return true;
        return document.fonts.check(`16px "${family.replace(/"/g, "")}"`);
    } catch {
        return true;
    }
}

/** The state of the installed-font list, so the control can explain itself honestly. */
export type LocalFontAccess = "unsupported" | "available" | "granted" | "denied" | "failed";

interface LocalFontData {
    readonly family: string;
    readonly fullName?: string;
    readonly style?: string;
}

interface WindowWithLocalFonts {
    queryLocalFonts?: () => Promise<LocalFontData[]>;
}

export function localFontAccessState(): LocalFontAccess {
    if (typeof window === "undefined") return "unsupported";
    const candidate = window as unknown as WindowWithLocalFonts;
    return typeof candidate.queryLocalFonts === "function" ? "available" : "unsupported";
}

export interface LocalFontResult {
    readonly state: LocalFontAccess;
    readonly families: readonly FontFamilyEntry[];
}

/**
 * Ask the browser for the installed families.
 *
 * This prompts for permission, so it only runs when the visitor presses the button
 * that says it will. A denial is reported as a denial; it does not silently return
 * the system list and let the control imply it enumerated the machine.
 */
export async function queryInstalledFonts(): Promise<LocalFontResult> {
    const candidate = (typeof window === "undefined" ? {} : window) as unknown as WindowWithLocalFonts;
    if (typeof candidate.queryLocalFonts !== "function") {
        return { state: "unsupported", families: [] };
    }
    try {
        const raw = await candidate.queryLocalFonts();
        const seen = new Set<string>();
        const families: FontFamilyEntry[] = [];
        for (const font of raw) {
            const family = font.family;
            if (family === undefined || family === "" || seen.has(family)) continue;
            seen.add(family);
            families.push({
                id: `local:${family}`,
                name: family,
                stack: `"${family.replace(/"/g, "")}", ${CJK_FALLBACK}`,
                source: "local",
                monospace: false,
            });
        }
        families.sort((a, b) => a.name.localeCompare(b.name));
        return { state: "granted", families };
    } catch (error) {
        const name = error instanceof DOMException ? error.name : "";
        return { state: name === "NotAllowedError" || name === "SecurityError" ? "denied" : "failed", families: [] };
    }
}

/** Merge the installed list into the system list without losing either. */
export function mergeFamilies(
    base: readonly FontFamilyEntry[],
    installed: readonly FontFamilyEntry[]
): readonly FontFamilyEntry[] {
    const byName = new Map<string, FontFamilyEntry>();
    for (const entry of base) byName.set(entry.name.toLowerCase(), entry);
    const extra = installed.filter((entry) => !byName.has(entry.name.toLowerCase()));
    return [...base, ...extra];
}

export function findFamily(
    families: readonly FontFamilyEntry[],
    id: string
): FontFamilyEntry | undefined {
    return families.find((entry) => entry.id === id);
}

/** The stack for an id, falling back to the system interface stack for an unknown id. */
export function stackFor(families: readonly FontFamilyEntry[], id: string): string {
    const entry = findFamily(families, id);
    if (entry !== undefined) return entry.stack;
    const fallback = families[0];
    return fallback?.stack ?? `system-ui, ${CJK_FALLBACK}`;
}
