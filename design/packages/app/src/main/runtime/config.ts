/**
 * Writing the config the engine reads, when the engine may not be on this computer.
 *
 * `render/config.ts` writes a config for a JVM running here, and every path in it is a
 * path on this machine. A container cannot use that file at all: `C:\Users\me\saves\world`
 * does not exist inside a Linux container, and neither does the folder the tiles are meant
 * to land in. So a containerised run needs the *same* config with the *container's* paths
 * in it - `/worlds/overworld`, `/bluemap/web` - written into a folder on this machine that
 * is then mounted at `/bluemap/config`.
 *
 * That is the whole reason this module exists beside the other one, and it is why the two
 * kinds of path are named apart everywhere below:
 *
 * - `hostConfigDir` is where the files are **written**, always a real directory here.
 * - `engineDataDir`, `engineWebRoot` and each map's `world` are what goes **inside** the
 *   files, and they are only real paths when the mode is local.
 *
 * Mixing them up has one specific failure: creating directories for the engine's paths.
 * A `mkdir` of `/bluemap/web/maps` on Windows quietly produces `C:\bluemap\web\maps`, and
 * a render then reports an empty output folder that nobody can find. So directories are
 * created only when {@link WriteEngineConfigOptions.createEngineDirectories} says the
 * engine paths are this machine's paths too.
 *
 * Map-id validation, HOCON quoting and the rule that a supplied map body may not override
 * `world`, `dimension` or `storage` all come from `render/config.ts`, which stays the
 * authority on them.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { HoconParseError, parseHocon } from "@worldlens/shared";
import {
    MAX_MAP_CONFIG_LENGTH,
    defaultRenderThreads,
    hoconString,
    validateMaps,
    type RenderMapRequest,
} from "../render/config.js";

/** A map as the *engine* will see it: `world` is an engine path, not necessarily a host one. */
export type EngineMapRequest = RenderMapRequest;

export interface EngineWebServerSettings {
    /** The port the engine binds, which inside a container is the container's port. */
    readonly port: number;
    /**
     * The address the engine binds.
     *
     * Loopback for a local run, so a rendered world is not published to the network by
     * pressing a button. `0.0.0.0` inside a container, and only inside one: a container
     * that binds its own loopback is unreachable from the host even when the port is
     * published, because the container's loopback is its own network namespace. That is
     * the single most common way a containerised server "starts fine" and answers nothing.
     */
    readonly ip: string;
}

export interface WriteEngineConfigOptions {
    /** Where the files are written, on this computer. */
    readonly hostConfigDir: string;
    /** `data`, as the engine will read it. */
    readonly engineDataDir: string;
    /** The webapp root, as the engine will read it. `<webRoot>/maps` holds the tiles. */
    readonly engineWebRoot: string;
    readonly maps: readonly EngineMapRequest[];
    readonly acceptDownload: boolean;
    readonly renderThreads?: number;
    readonly metrics?: boolean;
    /** Present for the web-server role; omitted leaves upstream's server disabled. */
    readonly webServer?: EngineWebServerSettings;
    /**
     * Whether the engine's paths are also this machine's paths.
     *
     * True for a local run, where the data and output folders have to exist before the
     * engine starts. False for a container, where creating them here would create
     * nonsense directories at the root of this machine's drive.
     */
    readonly createEngineDirectories: boolean;
}

export interface WrittenEngineConfig {
    readonly hostConfigDir: string;
    /** Every file written, absolute on this machine, in the order it was written. */
    readonly files: readonly string[];
    readonly mapIds: readonly string[];
    /** `<engineWebRoot>/maps` as written into the storage file, for a caller's report. */
    readonly engineStorageRoot: string;
}

function coreConf(options: WriteEngineConfigOptions): string {
    const threads = options.renderThreads ?? defaultRenderThreads();
    return [
        "# Written by Worldlens for a single run. Edits here are overwritten.",
        `accept-download: ${options.acceptDownload ? "true" : "false"}`,
        `data: ${hoconString(options.engineDataDir)}`,
        `render-thread-count: ${String(threads)}`,
        "scan-for-mod-resources: true",
        `metrics: ${options.metrics === true ? "true" : "false"}`,
        "log: {",
        `  file: ${hoconString(posixJoin(options.engineDataDir, "logs/cli.log"))}`,
        "  append: false",
        "}",
        "",
    ].join("\n");
}

function webappConf(options: WriteEngineConfigOptions): string {
    return [
        "# Written by Worldlens for a single run. Edits here are overwritten.",
        "enabled: true",
        `webroot: ${hoconString(options.engineWebRoot)}`,
        "update-settings-file: true",
        "",
    ].join("\n");
}

/**
 * `webserver.conf`, disabled unless this run *is* the web server.
 *
 * Disabled is the right default for a render: the app serves rendered maps through its
 * own embedded server, behind the token the renderer already carries, and letting the
 * engine open a second unauthenticated listener on 8100 for the length of every render
 * would put somebody's map on the network as a side effect of pressing Render.
 */
function webserverConf(options: WriteEngineConfigOptions): string {
    const server = options.webServer;
    if (server === undefined) {
        return [
            "# Written by Worldlens. The app serves rendered maps itself.",
            "enabled: false",
            "",
        ].join("\n");
    }
    return [
        "# Written by Worldlens for a single run. Edits here are overwritten.",
        "enabled: true",
        `webroot: ${hoconString(options.engineWebRoot)}`,
        `ip: ${hoconString(server.ip)}`,
        `port: ${String(server.port)}`,
        "sse-enabled: true",
        "",
    ].join("\n");
}

function storageConf(storageRoot: string): string {
    return [
        "# Written by Worldlens for a single run. Edits here are overwritten.",
        "storage-type: file",
        `root: ${hoconString(storageRoot)}`,
        // gzip is upstream's default and is what the file layout on disk assumes.
        "compression: gzip",
        "",
    ].join("\n");
}

/** The keys this module owns whatever a supplied body says. See `render/config.ts`. */
const ENFORCED_MAP_KEYS = ["world", "dimension", "storage"] as const;

function mapConf(map: EngineMapRequest, index: number): string {
    const dimension = map.dimension ?? "minecraft:overworld";
    if (map.config === undefined) {
        const lines = [
            "# Written by Worldlens for a single run. Edits here are overwritten.",
            `world: ${hoconString(map.world)}`,
            `dimension: ${hoconString(dimension)}`,
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

    // The body travels verbatim and the three structural keys are appended after it.
    // HOCON's later key wins for a string value, so appending is an override - and it is
    // verified below rather than assumed, exactly as `render/config.ts` verifies it.
    const text = [
        map.config.trimEnd(),
        "",
        "# Written by Worldlens. HOCON's later key wins, so these three replace",
        "# whatever the body above says: the run has to read the world this app was",
        "# pointed at and write where this app serves from.",
        `world: ${hoconString(map.world)}`,
        `dimension: ${hoconString(dimension)}`,
        'storage: "file"',
        "",
    ].join("\n");

    let parsed: Record<string, unknown>;
    try {
        parsed = parseHocon(text, { maxInputLength: MAX_MAP_CONFIG_LENGTH + 1024 });
    } catch (error) {
        throw new Error(
            `The map config for '${map.id}' is not valid HOCON: ${
                error instanceof HoconParseError ? error.message : String(error)
            }`,
        );
    }
    const expected: Readonly<Record<string, string>> = {
        world: map.world,
        dimension,
        storage: "file",
    };
    for (const key of ENFORCED_MAP_KEYS) {
        const actual = Object.prototype.hasOwnProperty.call(parsed, key) ? parsed[key] : undefined;
        if (actual === expected[key]) continue;
        throw new Error(
            `The map config for '${map.id}' still sets ${key} to ${JSON.stringify(actual)} after ` +
                `this app set it to ${JSON.stringify(expected[key])}. A run cannot be written from it.`,
        );
    }
    return text;
}

/**
 * Joins an engine path without reaching for the host's path grammar.
 *
 * `node:path.join` on Windows turns `/bluemap/data` into `\bluemap\data`, which is a
 * perfectly good Windows path and a completely wrong container path. The engine reads
 * these as text, so they are joined as text.
 */
function posixJoin(base: string, tail: string): string {
    const separator = base.includes("\\") && !base.includes("/") ? "\\" : "/";
    const trimmed = base.replace(/[\\/]+$/, "");
    return `${trimmed}${separator}${tail.replace(/\//g, separator)}`;
}

/** `<webRoot>/maps`, in the engine's own path grammar. */
export function engineStorageRoot(engineWebRoot: string): string {
    return posixJoin(engineWebRoot, "maps");
}

/**
 * Writes the whole config set and reports exactly what it wrote.
 *
 * Rewritten in full on every run rather than merged into whatever is already there. A
 * config directory that accumulates edits is one where a map somebody removed six runs
 * ago is still being rendered, and where the reason is invisible.
 */
export async function writeEngineConfig(
    options: WriteEngineConfigOptions,
): Promise<WrittenEngineConfig> {
    // The same validation the local path uses, so a bad map id or an unparseable body is
    // refused identically in both modes rather than only in the one that has a test.
    validateMaps(options.maps);

    const storageRoot = engineStorageRoot(options.engineWebRoot);
    const mapsDir = join(options.hostConfigDir, "maps");
    const storagesDir = join(options.hostConfigDir, "storages");

    await mkdir(mapsDir, { recursive: true });
    await mkdir(storagesDir, { recursive: true });
    if (options.createEngineDirectories) {
        await mkdir(options.engineDataDir, { recursive: true });
        await mkdir(storageRoot, { recursive: true });
    }

    const files: string[] = [];
    const write = async (path: string, contents: string): Promise<void> => {
        await writeFile(path, contents, "utf8");
        files.push(path);
    };

    await write(join(options.hostConfigDir, "core.conf"), coreConf(options));
    await write(join(options.hostConfigDir, "webapp.conf"), webappConf(options));
    await write(join(options.hostConfigDir, "webserver.conf"), webserverConf(options));
    await write(join(storagesDir, "file.conf"), storageConf(storageRoot));

    for (const [index, map] of options.maps.entries()) {
        await write(join(mapsDir, `${map.id}.conf`), mapConf(map, index));
    }

    return {
        hostConfigDir: options.hostConfigDir,
        files,
        mapIds: options.maps.map((map) => map.id),
        engineStorageRoot: storageRoot,
    };
}
