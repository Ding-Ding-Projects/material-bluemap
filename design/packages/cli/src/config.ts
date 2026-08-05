/**
 * Loads a config folder the way `BlueMapConfigManager` does: read core.conf, webapp.conf
 * and webserver.conf, writing upstream's own default for any one of the three that is
 * missing; read every `*.conf` in `maps/` and `storages/`, writing the three default maps
 * (pointing at a `world` folder next to the working directory, exactly as upstream's
 * `autoConfigWorlds`-less CLI path does) and the two default storages the first time
 * either folder does not exist.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/config/BlueMapConfigManager.java`
 *
 * ## What this deliberately does not do
 *
 * - **`plugin.conf` is never written or read.** `BlueMapCLI.main()` builds its config
 *   manager with `usePluginConfig(false)`, so upstream's CLI never touches it either.
 * - **No addon loading.** Upstream's CLI resolves `<config>/packs` and calls
 *   `AddonLoader.tryLoadAddons(packsFolder)` before building the config manager — a
 *   JS/Java addon system that has no port anywhere in this monorepo yet (`ROADMAP.md`
 *   Phase H, "JS addon system", is still Pending). The packs folder is still created, so
 *   a user who drops files there is not met with a missing directory, but nothing in it
 *   is loaded.
 * - **`-n`/`--mods`.** Accepted and validated (must exist), but the folder's contents are
 *   never scanned for bundled resource packs — upstream's mod-resource extraction has no
 *   port either. Recorded as a warning, never silently ignored.
 * - **SQL storages are recognised, never usable.** `storages/sql.conf` is generated and
 *   read like any other file, but `packages/engine`'s storage layer only ports
 *   `FileStorage` (`ROADMAP.md` issue #32: "the whole storage/sql package is unported").
 *   A map that resolves to a SQL-typed storage fails with a message naming exactly that,
 *   the moment something tries to actually use it — never silently treated as file storage.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { join } from "node:path";
import { Key } from "@material-bluemap/shared";
import {
    fileStorageDescriptor,
    generateConfigSet,
    parseConfigText,
    renderCoreTemplate,
    renderFileStorageTemplate,
    renderMapTemplate,
    renderSqlStorageTemplate,
    renderWebappTemplate,
    renderWebserverTemplate,
    coreConfigDescriptor,
    mapConfigDescriptor,
    sqlStorageDescriptor,
    webappConfigDescriptor,
    webserverConfigDescriptor,
    suggestRenderThreadCount,
    type ConfigFileDescriptor,
    type CoreConfig,
    type FileStorageConfig,
    type MapConfig,
    type SqlStorageConfig,
    type WebappConfig,
    type WebserverConfig,
} from "@material-bluemap/config";
import type { Logger } from "./logger.js";

/** upstream: `BlueMapCLI.configFolder`'s field default, `Path.of("config")`. */
export const DEFAULT_CONFIG_FOLDER = "config";
/** upstream: `BlueMapCLI.main()`'s `.defaultDataFolder(Path.of("data"))`. */
const DEFAULT_DATA_FOLDER = "data";
/** upstream: `BlueMapCLI.main()`'s `.defaultWebroot(Path.of("web"))`. */
const DEFAULT_WEBROOT = "web";
/** upstream: `BlueMapConfigManager.MAPS_CONFIG_FOLDER_NAME` / `STORAGES_CONFIG_FOLDER_NAME`. */
const MAPS_FOLDER = "maps";
const STORAGES_FOLDER = "storages";

export type StorageEntry =
    | { readonly kind: "file"; readonly id: string; readonly config: FileStorageConfig }
    | { readonly kind: "sql"; readonly id: string; readonly config: SqlStorageConfig };

export interface LoadedConfig {
    readonly configFolder: string;
    readonly packsFolder: string;
    readonly core: CoreConfig;
    readonly webapp: WebappConfig;
    readonly webserver: WebserverConfig;
    readonly storages: ReadonlyMap<string, StorageEntry>;
    readonly maps: ReadonlyMap<string, MapConfig>;
    /** Every dropped/unknown key, legacy key and structural problem, across every file. */
    readonly warnings: readonly string[];
}

export interface BootstrapOptions {
    /** Resolved config-folder path (apply {@link DEFAULT_CONFIG_FOLDER} before calling). */
    readonly configFolder: string;
    readonly minecraftVersion?: string | null;
    /** This package's own version, written into the generated core.conf's comment. */
    readonly appVersion: string;
    readonly logger: Logger;
}

/** upstream: `ConfigManager.isConfigFile` — a regular file ending `.conf`. */
function isConfigFileName(name: string): boolean {
    return name.toLowerCase().endsWith(".conf");
}

/** upstream: `ConfigManager.getConfigName` */
function configName(fileName: string): string {
    return fileName.slice(0, -".conf".length);
}

/** upstream: `BlueMapConfigManager.sanitiseMapId` */
function sanitiseMapId(id: string): string {
    return id.replace(/\W/g, "_");
}

async function ensureFile(path: string, text: string, logger: Logger, what: string): Promise<void> {
    if (existsSync(path)) return;
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, text);
    logger.info(`Wrote default ${what}: ${path}`);
}

/** Reads and validates one config file, throwing a message naming the exact file and problem. */
async function readConfigFile<T>(
    path: string,
    descriptor: ConfigFileDescriptor<T>,
    logger: Logger,
    warnings: string[],
): Promise<T> {
    const text = await readFile(path, "utf-8");
    const result = parseConfigText(descriptor, text);
    for (const issue of result.issues) {
        const line = `${path}: ${issue.severity} (${issue.kind}) at "${issue.path || "<root>"}": ${issue.message}`;
        warnings.push(line);
        if (issue.severity === "warning") logger.warn(line);
    }
    if (!result.ok || result.value === null) {
        throw new Error(`Failed to load config file:\n${path}\n${result.issues.map((i) => i.message).join("\n")}`);
    }
    return result.value;
}

/**
 * Ensures a config folder exists and is fully populated, exactly the way
 * `BlueMapConfigManager`'s constructor loads each file: writing a default if that
 * specific file (or, for maps/storages, that specific folder) is missing, then reading
 * everything back.
 */
export async function bootstrapConfig(options: BootstrapOptions): Promise<LoadedConfig> {
    const { configFolder, logger } = options;
    const warnings: string[] = [];

    await mkdir(configFolder, { recursive: true });
    const packsFolder = join(configFolder, "packs");
    await mkdir(packsFolder, { recursive: true });

    // -- core.conf --------------------------------------------------------------------
    const coreConfPath = join(configFolder, "core.conf");
    await ensureFile(
        coreConfPath,
        renderCoreTemplate({
            dataFolder: DEFAULT_DATA_FOLDER,
            logFolder: `${DEFAULT_DATA_FOLDER}/logs`,
            version: options.appVersion,
            minecraftVersion: options.minecraftVersion ?? null,
            isCli: true,
            // upstream reads `Runtime.availableProcessors()` / `Runtime.maxMemory()`; Node has
            // no direct JVM-heap equivalent, so total system memory is the closest honest proxy.
            renderThreadCount: suggestRenderThreadCount(cpus().length, Math.round(totalmem() / (1024 * 1024))),
        }),
        logger,
        "core-configuration-file",
    );
    const core = await readConfigFile(coreConfPath, coreConfigDescriptor, logger, warnings);

    // -- webapp.conf --------------------------------------------------------------------
    const webappConfPath = join(configFolder, "webapp.conf");
    await ensureFile(webappConfPath, renderWebappTemplate({ webroot: DEFAULT_WEBROOT }), logger, "webapp-configuration-file");
    const webapp = await readConfigFile(webappConfPath, webappConfigDescriptor, logger, warnings);

    // -- webserver.conf -------------------------------------------------------------------
    const webserverConfPath = join(configFolder, "webserver.conf");
    await ensureFile(
        webserverConfPath,
        renderWebserverTemplate({ webroot: DEFAULT_WEBROOT, logFolder: `${core.data}/logs` }),
        logger,
        "webserver-configuration-file",
    );
    const webserver = await readConfigFile(webserverConfPath, webserverConfigDescriptor, logger, warnings);

    // -- storages/ ------------------------------------------------------------------------
    const storagesFolder = join(configFolder, STORAGES_FOLDER);
    if (!existsSync(storagesFolder)) {
        await mkdir(storagesFolder, { recursive: true });
        await writeFile(join(storagesFolder, "file.conf"), renderFileStorageTemplate({ root: `${DEFAULT_WEBROOT}/maps` }));
        await writeFile(join(storagesFolder, "sql.conf"), renderSqlStorageTemplate());
        logger.info(`Wrote default storage-configuration-files in: ${storagesFolder}`);
    }
    const storages = new Map<string, StorageEntry>();
    for (const entry of await readdir(storagesFolder, { withFileTypes: true })) {
        if (!entry.isFile() || !isConfigFileName(entry.name)) continue;
        const id = configName(entry.name);
        const path = join(storagesFolder, entry.name);
        // upstream loads the abstract base first, purely to read `storage-type`. The
        // template (and a hand-written file) may write the short form `sql` rather than
        // the fully-namespaced `bluemap:sql`, exactly as the generated file does — see
        // storage.ts's own note that SQLConfig inherits the base's `bluemap:file` default —
        // so this compares by parsed Key, not by raw string.
        const base = await readConfigFile<FileStorageConfig>(path, fileStorageDescriptor, logger, []);
        const storageType = Key.parse(base["storage-type"], "bluemap");
        if (storageType.getFormatted() === "bluemap:sql") {
            const sql = await readConfigFile<SqlStorageConfig>(path, sqlStorageDescriptor, logger, warnings);
            storages.set(id, { kind: "sql", id, config: sql });
        } else {
            const file = await readConfigFile<FileStorageConfig>(path, fileStorageDescriptor, logger, warnings);
            storages.set(id, { kind: "file", id, config: file });
        }
    }

    // -- maps/ ----------------------------------------------------------------------------
    const mapsFolder = join(configFolder, MAPS_FOLDER);
    if (!existsSync(mapsFolder)) {
        await mkdir(mapsFolder, { recursive: true });
        const worldFolder = "world";
        const displayName: Record<"overworld" | "nether" | "end", string> = {
            overworld: "Overworld",
            nether: "Nether",
            end: "End",
        };
        const buildDefaultMap = (mapPreset: "overworld" | "nether" | "end", dimension: string, sorting: number): { fileStem: string; text: string } => ({
            fileStem: mapPreset,
            text: renderMapTemplate({
                name: displayName[mapPreset],
                world: worldFolder,
                dimension,
                dimensionType: dimension,
                sorting,
                preset: mapPreset,
            }),
        });
        for (const { fileStem, text } of [
            buildDefaultMap("overworld", "minecraft:overworld", 0),
            buildDefaultMap("nether", "minecraft:the_nether", 100),
            buildDefaultMap("end", "minecraft:the_end", 200),
        ]) {
            await writeFile(join(mapsFolder, `${fileStem}.conf`), text);
        }
        logger.info(`Wrote default map-configuration-files in: ${mapsFolder}`);
    }
    const maps = new Map<string, MapConfig>();
    for (const entry of await readdir(mapsFolder, { withFileTypes: true })) {
        if (!entry.isFile() || !isConfigFileName(entry.name)) continue;
        const id = sanitiseMapId(configName(entry.name));
        if (maps.has(id)) {
            throw new Error(
                `At least two of your map-config file-names result in ambiguous map-id's!\n` +
                    `${join(mapsFolder, entry.name)}\n` +
                    "To resolve this issue, rename this file to something else.",
            );
        }
        const config = await readConfigFile<MapConfig>(join(mapsFolder, entry.name), mapConfigDescriptor, logger, warnings);
        maps.set(id, config);
    }

    return { configFolder, packsFolder, core, webapp, webserver, storages, maps, warnings };
}

/**
 * `generateConfigSet` is `packages/config`'s single-shot writer (every file, one call) —
 * used by the desktop app, which always starts from an empty folder. `bootstrapConfig`
 * above exists instead of calling it directly because upstream's CLI checks each file (or,
 * for maps/storages, each *folder*) independently, so a config folder with a hand-edited
 * `core.conf` but no `maps/` still gets its three default maps rather than having
 * `core.conf` silently overwritten. This re-export stays available for a caller (or a
 * test) that genuinely wants the single-shot form.
 */
export { generateConfigSet };
