/**
 * Reading a GitHub release, and working out what is actually downloadable from it.
 *
 * A release asset is capped at 2 GB, so a large world ships as `world.zip.001`,
 * `world.zip.002`, ... beside a `world.zip.parts.json`. To a person looking at the
 * release page that is twenty files; to this module it is one download called
 * `world.zip` that happens to arrive in twenty pieces. Everything downstream works with
 * that single name, which is why the split is invisible in the interface.
 *
 * ## Tokens
 *
 * A public release needs no token and must never demand one: the whole point of
 * publishing a world is that anybody can fetch it. `GH_TOKEN` is used when it is there,
 * because a private repository and a rate-limited runner both need it, and because the
 * asset API URL it enables is the only route that works for a private release.
 *
 * When there is no token the `browser_download_url` is used instead, which redirects to
 * a CDN and is not subject to the unauthenticated API's sixty-requests-an-hour limit. A
 * twenty-part world would spend a third of that limit on one download.
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface ReleaseAsset {
    readonly name: string;
    readonly size: number;
    /** Redirects to a CDN. Works unauthenticated for a public release. */
    readonly downloadUrl: string;
    /** The API URL. Needs `Accept: application/octet-stream`, and a token to be useful. */
    readonly apiUrl: string;
}

export interface ReleaseInfo {
    readonly owner: string;
    readonly repo: string;
    readonly tag: string;
    readonly name: string;
    readonly htmlUrl: string;
    readonly assets: readonly ReleaseAsset[];
}

/** One file that can be downloaded, whether or not it was published in pieces. */
export interface SplitDownload {
    readonly kind: "split";
    /** The name the file gets back once rejoined, e.g. `world.zip`. */
    readonly name: string;
    readonly manifest: ReleaseAsset;
    readonly parts: readonly ReleaseAsset[];
    /**
     * The sum of the published part sizes.
     *
     * Close enough for a progress bar before the manifest has been read, and never used
     * for verification: the manifest's own total is the number that gets checked.
     */
    readonly bytes: number;
}

export interface WholeDownload {
    readonly kind: "whole";
    readonly name: string;
    readonly asset: ReleaseAsset;
    readonly bytes: number;
}

export type AvailableDownload = SplitDownload | WholeDownload;

export class ReleaseRequestError extends Error {
    readonly status: number;
    readonly url: string;

    constructor(message: string, status: number, url: string) {
        super(message);
        this.name = "ReleaseRequestError";
        this.status = status;
        this.url = url;
    }
}

export interface ReleaseLookupOptions {
    readonly fetch: FetchLike;
    /** `GH_TOKEN` when it is set. Never required for a public release. */
    readonly token?: string | null;
    readonly signal?: AbortSignal;
    /** Overridable so a test does not have to intercept a real hostname. */
    readonly apiBase?: string;
}

export const GITHUB_API_BASE = "https://api.github.com";

/** The headers every GitHub API call carries, plus the token when there is one. */
export function apiHeaders(token: string | null | undefined): Record<string, string> {
    const headers: Record<string, string> = {
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "worldlens",
    };
    if (typeof token === "string" && token.length > 0) headers["authorization"] = `Bearer ${token}`;
    return headers;
}

/**
 * Looks up one release. `tag` defaults to `latest`.
 *
 * `latest` is GitHub's own definition of it - the most recent non-draft, non-prerelease
 * release - rather than "the newest tag", which would pick up a prerelease nobody meant
 * to hand a first-time user.
 */
export async function fetchRelease(
    owner: string,
    repo: string,
    tag: string | undefined,
    options: ReleaseLookupOptions,
): Promise<ReleaseInfo> {
    const base = options.apiBase ?? GITHUB_API_BASE;
    const wanted = tag === undefined || tag.length === 0 ? "latest" : tag;
    const url =
        wanted === "latest"
            ? `${base}/repos/${owner}/${repo}/releases/latest`
            : `${base}/repos/${owner}/${repo}/releases/tags/${encodeURIComponent(wanted)}`;

    const response = await options.fetch(url, {
        headers: apiHeaders(options.token),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (!response.ok) {
        throw new ReleaseRequestError(
            `GitHub answered ${String(response.status)} for ${owner}/${repo} ${wanted}.`,
            response.status,
            url,
        );
    }

    const body = (await response.json()) as {
        tag_name?: unknown;
        name?: unknown;
        html_url?: unknown;
        assets?: unknown;
    };

    const assets: ReleaseAsset[] = [];
    if (Array.isArray(body.assets)) {
        for (const entry of body.assets as unknown[]) {
            if (typeof entry !== "object" || entry === null) continue;
            const asset = entry as Record<string, unknown>;
            const name = asset["name"];
            const size = asset["size"];
            const downloadUrl = asset["browser_download_url"];
            const apiUrl = asset["url"];
            if (typeof name !== "string" || name.length === 0) continue;
            if (typeof size !== "number" || !Number.isFinite(size)) continue;
            if (typeof downloadUrl !== "string" || typeof apiUrl !== "string") continue;
            assets.push({ name, size, downloadUrl, apiUrl });
        }
    }

    return {
        owner,
        repo,
        tag: typeof body.tag_name === "string" ? body.tag_name : wanted,
        name: typeof body.name === "string" ? body.name : (body.tag_name as string) || wanted,
        htmlUrl: typeof body.html_url === "string" ? body.html_url : "",
        assets,
    };
}

const MANIFEST_SUFFIX = ".parts.json";

/**
 * Turns a flat list of release assets into the list of files a person can ask for.
 *
 * Every `X.parts.json` claims the assets named `X.001`, `X.002`, ... and presents them
 * as one download called `X`. Whatever is left over is offered as itself. An asset that
 * looks like a part but has no manifest is deliberately still offered on its own name
 * rather than hidden: a release that lost its manifest should show twenty files a person
 * can still fetch by hand, not nothing at all.
 */
export function availableDownloads(release: ReleaseInfo): AvailableDownload[] {
    const byName = new Map<string, ReleaseAsset>();
    for (const asset of release.assets) byName.set(asset.name, asset);

    const claimed = new Set<string>();
    const split: SplitDownload[] = [];

    for (const asset of release.assets) {
        if (!asset.name.endsWith(MANIFEST_SUFFIX)) continue;
        const name = asset.name.slice(0, -MANIFEST_SUFFIX.length);
        if (name.length === 0) continue;

        const parts: ReleaseAsset[] = [];
        for (const candidate of release.assets) {
            const match = partIndexOf(candidate.name, name);
            if (match !== null) parts.push(candidate);
        }
        if (parts.length === 0) continue;

        parts.sort((a, b) => (partIndexOf(a.name, name) ?? 0) - (partIndexOf(b.name, name) ?? 0));
        claimed.add(asset.name);
        for (const part of parts) claimed.add(part.name);
        split.push({
            kind: "split",
            name,
            manifest: asset,
            parts,
            bytes: parts.reduce((total, part) => total + part.size, 0),
        });
    }

    const whole: WholeDownload[] = [];
    for (const asset of release.assets) {
        if (claimed.has(asset.name)) continue;
        whole.push({ kind: "whole", name: asset.name, asset, bytes: asset.size });
    }

    // Split downloads first: they are the large ones, and the reason this exists.
    return [...split, ...whole];
}

/** `world.zip.003` against `world.zip` gives 3. Null when the name is not its part. */
function partIndexOf(candidate: string, fileName: string): number | null {
    if (!candidate.startsWith(`${fileName}.`)) return null;
    const suffix = candidate.slice(fileName.length + 1);
    if (!/^\d+$/.test(suffix)) return null;
    const index = Number.parseInt(suffix, 10);
    return Number.isSafeInteger(index) && index > 0 ? index : null;
}

/** Finds one download by the name it presents, split or not. */
export function findDownload(
    downloads: readonly AvailableDownload[],
    name: string,
): AvailableDownload | null {
    return downloads.find((download) => download.name === name) ?? null;
}
