/**
 * The structural boundary between executable UI source and generated static data.
 *
 * Generated modules carry both a filename suffix and a banner. Requiring both keeps a real
 * source file in the policy scans if somebody merely renames it, and keeps an ordinary source
 * file in the scans if a comment happens to use the word "generated". The generator owns the
 * banner; hand-authored modules do not get an escape hatch.
 */
export const GENERATED_STATIC_DATA_BANNER = "@generated static data; executable policy scans must ignore quoted values only";

export function isGeneratedStaticDataSource(path: string, source: string): boolean {
    if (!path.endsWith(".generated.ts")) return false;
    const firstContent = source.search(/\S/);
    if (firstContent < 0 || !source.startsWith("/**", firstContent)) return false;
    return source.slice(firstContent, firstContent + 256).includes(GENERATED_STATIC_DATA_BANNER);
}
