/**
 * Turning a rendered map into something a **dumb static host** can serve.
 *
 * This exists because of one detail that is invisible until the map is already published
 * and every tile comes back 404.
 *
 * The engine stores hires tiles gzip-compressed, so the file on disk is `0.prbm.gz` and
 * the map's texture data is `textures.json.gz`. The viewer, however, asks for `0.prbm`
 * and `textures.json` — *unless* the web app's own `settings.json` says
 * `clientDecompression: true`, in which case it appends `.gz` to both and inflates the
 * bytes itself with `DecompressionStream("gzip")`.
 *
 * Upstream's default is `false`, and that default is correct for upstream, because
 * BlueMap's own web server answers a request for `0.prbm` out of `0.prbm.gz`. So does
 * this app's embedded server, which is why a map looks perfect in the app and then fails
 * completely the moment it is copied somewhere else.
 *
 * GitHub Pages will not do that for us. It serves the files that exist, under their real
 * names, and 404s the rest. There is no configuration, no rewrite rule, and no
 * `.htaccess` — that is the whole point of it.
 *
 * So a map that is going to be hosted statically has to have the flag flipped, and the
 * flip has to be **verified against the files that are actually on disk** rather than
 * assumed: flipping it changes which URLs the viewer requests, and a flag that points the
 * viewer at files nobody wrote is exactly as broken as the problem it fixes.
 *
 * Nothing here uploads anything or knows what GitHub is. It prepares a directory and
 * reports what it found, so the app and the CI workflow can share one answer to
 * "is this map servable as plain files?" instead of each having an opinion.
 */

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** What GitHub Pages will publish before it starts refusing. Both are GitHub's, not ours. */
export const PAGES_SOFT_SITE_LIMIT_BYTES = 1_000_000_000;

/**
 * The hard one. A file larger than this cannot be pushed to GitHub at all, so a map
 * carrying one cannot be hosted this way whatever else is true of it.
 */
export const PAGES_MAX_FILE_BYTES = 100_000_000;

/** The marker that stops Pages running the published files through Jekyll. */
export const NOJEKYLL_FILE = ".nojekyll";

export interface StaticHostMap {
    readonly id: string;
    /** Every file the viewer will ask for that is not present on disk. */
    readonly missing: readonly string[];
}

export interface StaticHostReport {
    /** True when nothing is missing and no single file is over GitHub's hard limit. */
    readonly servable: boolean;
    /** True when this run changed `clientDecompression`; false when it was already right. */
    readonly changedSettings: boolean;
    /** True when this run wrote `.nojekyll`; false when it was already there. */
    readonly addedNoJekyll: boolean;
    readonly maps: readonly StaticHostMap[];
    readonly totalBytes: number;
    readonly fileCount: number;
    /** Files over GitHub's hard per-file limit, largest first. Empty is the normal case. */
    readonly oversizedFiles: readonly { readonly path: string; readonly bytes: number }[];
    /** True when the whole site is over the size GitHub asks sites to stay under. */
    readonly overSoftLimit: boolean;
    /** Everything worth telling a person, in the order it is worth telling them. */
    readonly notes: readonly string[];
}

/** The web app's root `settings.json`. Only the parts this module has an opinion about. */
interface WebAppSettings {
    clientDecompression?: unknown;
    maps?: unknown;
    mapDataRoot?: unknown;
}

export class StaticHostError extends Error {
    readonly detail: readonly string[];

    constructor(message: string, detail: readonly string[] = []) {
        super(message);
        this.name = "StaticHostError";
        this.detail = detail;
    }
}

async function readJson(file: string): Promise<unknown> {
    let text: string;
    try {
        text = await readFile(file, "utf8");
    } catch {
        throw new StaticHostError("This does not look like a rendered map.", [
            `${file} is missing`,
            "A map's web root holds settings.json beside index.html, with the tiles under maps/.",
        ]);
    }
    try {
        return JSON.parse(text) as unknown;
    } catch (error) {
        throw new StaticHostError("The map's settings.json could not be read.", [
            file,
            error instanceof Error ? error.message : String(error),
        ]);
    }
}

async function exists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Every map id the web app will try to load.
 *
 * Upstream has written this list as both an array of ids and an array of objects over the
 * years, so both are read. An entry that is neither is skipped rather than guessed at: a
 * map this cannot name is a map it cannot check, and silently checking nothing would
 * report a broken site as servable.
 */
function mapIds(settings: WebAppSettings): { readonly ids: string[]; readonly skipped: number } {
    const raw = settings.maps;
    if (!Array.isArray(raw)) return { ids: [], skipped: 0 };

    const ids: string[] = [];
    let skipped = 0;
    for (const entry of raw) {
        if (typeof entry === "string") {
            ids.push(entry);
            continue;
        }
        if (typeof entry === "object" && entry !== null) {
            const id: unknown = (entry as { id?: unknown }).id;
            if (typeof id === "string") {
                ids.push(id);
                continue;
            }
        }
        skipped += 1;
    }
    return { ids, skipped };
}

interface Walked {
    bytes: number;
    files: number;
    readonly oversized: { path: string; bytes: number }[];
}

async function walk(root: string, relative: string, into: Walked): Promise<void> {
    const entries = await readdir(join(root, relative), { withFileTypes: true });
    for (const entry of entries) {
        const next = relative === "" ? entry.name : `${relative}/${entry.name}`;
        if (entry.isDirectory()) {
            await walk(root, next, into);
            continue;
        }
        if (!entry.isFile()) continue;

        const info = await stat(join(root, next));
        into.bytes += info.size;
        into.files += 1;
        if (info.size > PAGES_MAX_FILE_BYTES) into.oversized.push({ path: next, bytes: info.size });
    }
}

function describeBytes(bytes: number): string {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    return `${String(Math.round(bytes / 1000))} kB`;
}

export interface PrepareStaticHostOptions {
    /** The directory holding index.html, settings.json and maps/. Prepared in place. */
    readonly webRoot: string;
    /**
     * When false, report what would change without writing anything. Used by the app to
     * show a person what publishing will do before they agree to it.
     */
    readonly write?: boolean;
}

/**
 * Prepare a rendered map's web root to be served as plain files, and say whether it can be.
 *
 * Writes at most two things, both of them additive: `clientDecompression: true` into the
 * web app's `settings.json`, and an empty `.nojekyll`. It never touches a tile, never
 * deletes anything, and never rewrites a map's own settings.
 */
export async function prepareStaticHost(options: PrepareStaticHostOptions): Promise<StaticHostReport> {
    const { webRoot } = options;
    const write = options.write !== false;
    const notes: string[] = [];

    const settingsFile = join(webRoot, "settings.json");
    const parsed = await readJson(settingsFile);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new StaticHostError("The map's settings.json is not an object.", [settingsFile]);
    }
    const settings = parsed as WebAppSettings & Record<string, unknown>;

    // The flag itself. Everything else in this function exists to check that flipping it
    // points the viewer at files that are really there.
    const alreadySet = settings.clientDecompression === true;
    if (!alreadySet && write) {
        settings.clientDecompression = true;
        await writeFile(settingsFile, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    }
    notes.push(
        alreadySet
            ? "The viewer was already set to decompress tiles itself, which is what a static host needs."
            : write
              ? "Set the viewer to decompress tiles itself, because a static host cannot do it for us."
              : "The viewer would be set to decompress tiles itself, because a static host cannot do it for us.",
    );

    // `mapDataRoot` may point somewhere else entirely - at a live BlueMap server, or at an
    // absolute URL. Publishing the files here would then produce a site that loads and
    // shows nothing, with no error worth reading, so it is called out rather than fixed:
    // whoever set it meant something by it.
    const dataRoot = settings.mapDataRoot;
    if (typeof dataRoot === "string" && (dataRoot.startsWith("http://") || dataRoot.startsWith("https://"))) {
        notes.push(
            `This map reads its tiles from ${dataRoot} rather than from its own files, so publishing ` +
                "these files will not publish the map. Point mapDataRoot back at maps/ first.",
        );
    }

    const { ids, skipped } = mapIds(settings);
    if (skipped > 0) {
        notes.push(
            `${String(skipped)} entry in the map list could not be named, so it was not checked. ` +
                "A map this cannot name is a map it cannot verify.",
        );
    }
    if (ids.length === 0) {
        notes.push("The web app lists no maps at all, so there is nothing here for a visitor to look at.");
    }

    const maps: StaticHostMap[] = [];
    for (const id of ids) {
        const mapRoot = join(webRoot, "maps", id);
        const missing: string[] = [];

        // Exactly the files the viewer asks for once the flag is on. Checking the
        // uncompressed names instead would prove nothing about the site we are publishing.
        if (!(await exists(join(mapRoot, "settings.json")))) missing.push(`maps/${id}/settings.json`);
        if (!(await exists(join(mapRoot, "textures.json.gz")))) {
            // A map rendered with compression off has textures.json and .prbm on disk, and
            // client decompression would send the viewer looking for files that do not
            // exist. That map is servable statically as it stands - it just must not have
            // the flag flipped, which is a different report, not a worse one.
            missing.push(`maps/${id}/textures.json.gz`);
        }
        if (!(await exists(join(mapRoot, "tiles")))) missing.push(`maps/${id}/tiles/`);

        maps.push({ id, missing });
    }

    const brokenMaps = maps.filter((map) => map.missing.length > 0);
    if (brokenMaps.length > 0) {
        notes.push(
            `${String(brokenMaps.length)} of ${String(maps.length)} maps are missing files the viewer will ask for. ` +
                "Publishing now would produce a site that loads and then shows nothing: " +
                brokenMaps.map((map) => `${map.id} (${map.missing.join(", ")})`).join("; "),
        );
    }

    const noJekyll = join(webRoot, NOJEKYLL_FILE);
    const hadNoJekyll = await exists(noJekyll);
    if (!hadNoJekyll && write) await writeFile(noJekyll, "", "utf8");
    if (!hadNoJekyll) {
        notes.push(
            "Added .nojekyll so Pages publishes the files as they are. Without it Pages runs the " +
                "site through Jekyll, which drops anything whose name starts with an underscore.",
        );
    }

    const walked: Walked = { bytes: 0, files: 0, oversized: [] };
    await walk(webRoot, "", walked);
    walked.oversized.sort((a, b) => b.bytes - a.bytes);

    const overSoftLimit = walked.bytes > PAGES_SOFT_SITE_LIMIT_BYTES;
    notes.push(
        `${describeBytes(walked.bytes)} across ${String(walked.files)} files.` +
            (walked.files > 20_000
                ? " That is a lot of small files, so the upload will take a while whatever the total size says."
                : ""),
    );
    if (overSoftLimit) {
        notes.push(
            `GitHub asks Pages sites to stay under ${describeBytes(PAGES_SOFT_SITE_LIMIT_BYTES)}, and this map is ` +
                `${describeBytes(walked.bytes)}. Publishing may be refused or throttled. Rendering fewer ` +
                "dimensions, or a smaller area, is the usual way down.",
        );
    }
    if (walked.oversized.length > 0) {
        notes.push(
            `${String(walked.oversized.length)} file is over GitHub's ${describeBytes(PAGES_MAX_FILE_BYTES)} ` +
                `per-file limit and cannot be pushed at all: ` +
                walked.oversized
                    .slice(0, 3)
                    .map((file) => `${file.path} (${describeBytes(file.bytes)})`)
                    .join(", "),
        );
    }

    return {
        servable: brokenMaps.length === 0 && walked.oversized.length === 0 && ids.length > 0,
        changedSettings: !alreadySet && write,
        addedNoJekyll: !hadNoJekyll && write,
        maps,
        totalBytes: walked.bytes,
        fileCount: walked.files,
        oversizedFiles: walked.oversized,
        overSoftLimit,
        notes,
    };
}
