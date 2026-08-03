/**
 * Writing the config directory upstream's CLI reads.
 *
 * The CLI takes one argument that matters, `-c <folder>`, and reads everything else out
 * of the files in it: `core.conf`, `webapp.conf`, `webserver.conf`,
 * `storages/<id>.conf` and one `maps/<id>.conf` per map. This module writes that set
 * from a render request, with every path absolute.
 *
 * **Every path is absolute on purpose.** The CLI resolves relative paths against its
 * *working directory*, not against the config folder, which is a sharp edge that has
 * already cost this project once: running it from the repository root wrote 47 MB of
 * tiles into `/web` and a 38 MB Mojang client jar into `/data` at the top of the tree.
 * The runner also sets a deliberate working directory inside the render workspace, so
 * even a path this module somehow left relative lands somewhere harmless.
 *
 * ## Quoting
 *
 * HOCON's quoted strings are JSON strings, so `JSON.stringify` produces exactly the
 * right escaping and is what every path here goes through. This is not a stylistic
 * choice: an unescaped Windows path is a parse error waiting to happen, because
 * `"C:\Users\..."` contains `\U`, which is not a valid escape. Both halves of this were
 * checked against the real parser rather than assumed - a config written with
 * `JSON.stringify`-escaped Windows paths rendered 144 hires tiles and put its data
 * directory exactly where the escaped path said.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { availableParallelism } from "node:os";
import { join } from "node:path";

/**
 * A map to render.
 *
 * Mirrors the subset of upstream's map config this port sets. Everything omitted keeps
 * upstream's default, which is deliberate: a config file that restates a default is a
 * config file that silently pins it when upstream changes.
 */
export interface RenderMapRequest {
    /**
     * The map's id. Becomes the config file name, the storage folder name and a URL
     * path segment, which is why it is validated rather than trusted.
     */
    readonly id: string;
    /** Absolute path to the world folder, the one containing `level.dat`. */
    readonly world: string;
    /** Display name shown in the viewer. Defaults to the id. */
    readonly name?: string;
    /** Defaults to `minecraft:overworld`. */
    readonly dimension?: string;
    /** Ordering in the viewer's map list. Defaults to declaration order. */
    readonly sorting?: number;
    readonly startPos?: { readonly x: number; readonly z: number };
}

export interface RenderConfigOptions {
    /** `<workspace>/config` - where the CLI is pointed with `-c`. */
    readonly configDir: string;
    /** `<workspace>/data` - the Mojang client jar, extracted resources and CLI logs. */
    readonly dataDir: string;
    /**
     * The webapp root. Its `settings.json` is what the viewer loads first, and
     * `<webRoot>/maps` is the storage root the tiles are written into.
     */
    readonly webRoot: string;
    readonly maps: readonly RenderMapRequest[];
    /**
     * Render threads. Defaults to upstream's own default of `cores - 2`, floored at 1,
     * which leaves the machine usable while a render runs.
     */
    readonly renderThreads?: number;
    /**
     * Whether the engine may report anonymous usage to upstream's metrics endpoint.
     *
     * Off unless a caller turns it on. Upstream defaults it on, which is a reasonable
     * default for a server operator who installed BlueMap deliberately, and the wrong
     * one for somebody who pressed Render in a desktop app: the only thing they agreed
     * to is the Mojang download, and quietly widening that into a second, different
     * outbound report is not something a config writer gets to decide for them.
     */
    readonly metrics?: boolean;
    /** Written into `core.conf` as `accept-download`. */
    readonly acceptDownload: boolean;
}

export interface WrittenRenderConfig {
    readonly configDir: string;
    readonly dataDir: string;
    readonly webRoot: string;
    readonly storageRoot: string;
    /** Every file written, absolute, in the order it was written. */
    readonly files: readonly string[];
    readonly mapIds: readonly string[];
}

/**
 * What a map id may contain.
 *
 * It becomes a directory name and a URL path segment, so the set is deliberately
 * narrower than what either would technically accept. Rejecting `..`, a slash or a
 * backslash here is what stops a map id from addressing anything outside its own
 * storage folder later.
 */
const MAP_ID = /^[a-z0-9][a-z0-9_-]*$/;

export function isValidMapId(id: string): boolean {
    return MAP_ID.test(id) && id.length <= 64;
}

/** A HOCON quoted string. HOCON's grammar for these is JSON's, so this is exact. */
export function hoconString(value: string): string {
    return JSON.stringify(value);
}

function coreConf(options: RenderConfigOptions): string {
    const threads = options.renderThreads ?? defaultRenderThreads();
    return [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        `accept-download: ${options.acceptDownload ? "true" : "false"}`,
        `data: ${hoconString(options.dataDir)}`,
        `render-thread-count: ${String(threads)}`,
        "scan-for-mod-resources: true",
        `metrics: ${options.metrics === true ? "true" : "false"}`,
        "log: {",
        `  file: ${hoconString(join(options.dataDir, "logs", "cli.log"))}`,
        "  append: false",
        "}",
        "",
    ].join("\n");
}

/**
 * `webapp.conf` exists so `-s` has somewhere to write `settings.json`.
 *
 * That file is the one the viewer loads first: it lists the maps and carries
 * `mapDataRoot`/`liveDataRoot`. Everything else is left at upstream's defaults, which
 * the CLI fills in - a minimal file like this one produced the full settings document,
 * sliders and all.
 */
function webappConf(options: RenderConfigOptions): string {
    return [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        "enabled: true",
        `webroot: ${hoconString(options.webRoot)}`,
        "update-settings-file: true",
        "",
    ].join("\n");
}

/**
 * The CLI's own web server, off.
 *
 * The app serves rendered maps through its existing embedded `HttpServer`, on a port it
 * already owns and behind the auth token the renderer already carries. Letting the CLI
 * open a second listener on 8100 would put an unauthenticated copy of somebody's map on
 * the network for as long as the render ran.
 */
function webserverConf(): string {
    return [
        "# Written by Material BlueMap. The app serves rendered maps itself.",
        "enabled: false",
        "",
    ].join("\n");
}

function storageConf(storageRoot: string): string {
    return [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        "storage-type: file",
        `root: ${hoconString(storageRoot)}`,
        // gzip is upstream's default and is what the file layout on disk assumes:
        // hires tiles land as `<tile>.prbm.gz`, which is exactly the URL the viewer
        // asks for when it decompresses client-side, and one `.gz` away from the URL
        // it asks for when it does not.
        "compression: gzip",
        "",
    ].join("\n");
}

function mapConf(map: RenderMapRequest, index: number): string {
    const lines = [
        "# Written by Material BlueMap for a single render. Edits here are overwritten.",
        `world: ${hoconString(map.world)}`,
        `dimension: ${hoconString(map.dimension ?? "minecraft:overworld")}`,
        `name: ${hoconString(map.name ?? map.id)}`,
        `sorting: ${String(map.sorting ?? index)}`,
        'storage: "file"',
    ];
    if (map.startPos !== undefined) {
        lines.push(`start-pos: { x: ${String(map.startPos.x)}, z: ${String(map.startPos.z)} }`);
    }
    lines.push("");
    return lines.join("\n");
}

/**
 * Upstream's own default: every core but two, never fewer than one.
 *
 * Matching it rather than inventing a number means a render behaves the way its
 * documentation and its community's advice say it does.
 */
export function defaultRenderThreads(cores?: number): number {
    const available = cores ?? cpuCount();
    return Math.max(1, available - 2);
}

function cpuCount(): number {
    // `availableParallelism` rather than `cpus().length`: it is the honest number under
    // a container CPU limit, where the second one reports the host's cores and would
    // have the engine start threads the machine will never run in parallel.
    try {
        return availableParallelism();
    } catch {
        return 4;
    }
}

/** Raised for a request that could never render, before anything is written. */
export class InvalidRenderRequestError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InvalidRenderRequestError";
    }
}

/** Checks a map list without touching the disk. Throws naming the first problem. */
export function validateMaps(maps: readonly RenderMapRequest[]): void {
    if (maps.length === 0) {
        throw new InvalidRenderRequestError("A render needs at least one map.");
    }
    const seen = new Set<string>();
    for (const map of maps) {
        if (!isValidMapId(map.id)) {
            throw new InvalidRenderRequestError(
                `'${map.id}' is not a usable map id. Use lowercase letters, digits, '-' and '_'.`,
            );
        }
        if (seen.has(map.id)) {
            throw new InvalidRenderRequestError(`Two maps share the id '${map.id}'.`);
        }
        seen.add(map.id);
        if (map.world.trim().length === 0) {
            throw new InvalidRenderRequestError(`Map '${map.id}' has no world folder.`);
        }
    }
}

/**
 * Writes the whole config set and reports exactly what it wrote.
 *
 * Rewritten in full on every render rather than merged into whatever is already there.
 * A config directory that accumulates edits is a config directory where a map somebody
 * removed six renders ago is still being rendered, and where the reason is invisible.
 */
export async function writeRenderConfig(
    options: RenderConfigOptions,
): Promise<WrittenRenderConfig> {
    validateMaps(options.maps);

    const storageRoot = join(options.webRoot, "maps");
    const mapsDir = join(options.configDir, "maps");
    const storagesDir = join(options.configDir, "storages");

    await mkdir(mapsDir, { recursive: true });
    await mkdir(storagesDir, { recursive: true });
    await mkdir(options.dataDir, { recursive: true });
    await mkdir(storageRoot, { recursive: true });

    const files: string[] = [];
    const write = async (path: string, contents: string): Promise<void> => {
        await writeFile(path, contents, "utf8");
        files.push(path);
    };

    await write(join(options.configDir, "core.conf"), coreConf(options));
    await write(join(options.configDir, "webapp.conf"), webappConf(options));
    await write(join(options.configDir, "webserver.conf"), webserverConf());
    await write(join(storagesDir, "file.conf"), storageConf(storageRoot));

    for (const [index, map] of options.maps.entries()) {
        await write(join(mapsDir, `${map.id}.conf`), mapConf(map, index));
    }

    return {
        configDir: options.configDir,
        dataDir: options.dataDir,
        webRoot: options.webRoot,
        storageRoot,
        files,
        mapIds: options.maps.map((map) => map.id),
    };
}
