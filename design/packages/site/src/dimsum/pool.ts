/**
 * The bundled dim sum pool.
 *
 * `scripts/fetch-dim-sum-pool.mjs` writes `./generated/pool.json` and the images beside it at
 * build time. Both are read here through `import.meta.glob`, which resolves to an empty object
 * when the directory does not exist. That matters: the generated files are gitignored, so a
 * fresh checkout has none, and a static import would fail the build rather than simply having
 * nothing to show.
 *
 * Nothing is fetched at runtime. The images are ordinary bundled assets with hashed URLs, so
 * the browser downloads exactly the one dish that was drawn, and only on the loads where a
 * dish is drawn at all.
 */

const poolModules = import.meta.glob("./generated/pool.json", { eager: true, import: "default" }) as Record<
    string,
    unknown
>;

const imageModules = import.meta.glob("./generated/*.png", {
    eager: true,
    query: "?url",
    import: "default",
}) as Record<string, string>;

export interface DimSumDish {
    readonly id: string;
    readonly slug: string;
    readonly file: string;
    readonly nameEn: string;
    readonly nameZh: string;
    readonly jyutping: string;
    readonly altEn: string;
    readonly altYue: string;
    readonly width: number;
    readonly height: number;
    /** Bundled asset URL for this dish's photograph. */
    readonly url: string;
}

function imageUrl(file: string): string | null {
    for (const [path, url] of Object.entries(imageModules)) {
        if (path.endsWith(`/${file}`)) return url;
    }
    return null;
}

function toDish(value: unknown): DimSumDish | null {
    if (typeof value !== "object" || value === null) return null;
    const raw = value as Record<string, unknown>;
    const file = typeof raw.file === "string" ? raw.file : null;
    if (file === null) return null;
    const url = imageUrl(file);
    if (url === null) return null;
    return {
        id: typeof raw.id === "string" ? raw.id : file,
        slug: typeof raw.slug === "string" ? raw.slug : file,
        file,
        nameEn: typeof raw.nameEn === "string" ? raw.nameEn : file,
        nameZh: typeof raw.nameZh === "string" ? raw.nameZh : "",
        jyutping: typeof raw.jyutping === "string" ? raw.jyutping : "",
        altEn: typeof raw.altEn === "string" ? raw.altEn : `Photograph of ${String(raw.nameEn ?? file)}`,
        altYue: typeof raw.altYue === "string" ? raw.altYue : "",
        width: typeof raw.width === "number" ? raw.width : 320,
        height: typeof raw.height === "number" ? raw.height : 320,
        url,
    };
}

/**
 * Every dish that has both a catalogue record and a bundled image. A record whose image is
 * missing is dropped rather than shown as a broken picture, which is the same rule the
 * release code names follow.
 */
export function loadDimSumPool(): DimSumDish[] {
    const pool = Object.values(poolModules)[0];
    if (typeof pool !== "object" || pool === null) return [];
    const dishes = (pool as { dishes?: unknown }).dishes;
    if (!Array.isArray(dishes)) return [];
    return dishes.map(toDish).filter((dish): dish is DimSumDish => dish !== null);
}
