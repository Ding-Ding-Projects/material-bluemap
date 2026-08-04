/**
 * Generating a config folder, the way `BlueMapConfigManager` does.
 *
 * The CLI writes any missing config file from its template the first time it
 * loads a config folder. The app has to be able to produce the same folder
 * itself, so that it can render without shelling out to the CLI first, and so
 * that a folder the app made and a folder the CLI made are the same folder.
 *
 * Java source: `common/src/main/java/de/bluecolored/bluemap/common/config/BlueMapConfigManager.java`
 */

import { ConfigTemplate, formatConfigPath } from "./templates/template.js";
import { CORE_TEMPLATE, FILE_STORAGE_TEMPLATE, MAP_TEMPLATE, PLUGIN_TEMPLATE, SQL_STORAGE_TEMPLATE, WEBAPP_TEMPLATE, WEBSERVER_TEMPLATE } from "./templates/sources.js";

/** A file to write, with its path relative to the config folder. */
export interface GeneratedConfigFile {
    /** Path relative to the config folder, always with forward slashes. */
    readonly path: string;
    readonly text: string;
}

/** Match the line endings Java writes on the host where the config is created. */
function nativeLineEndings(text: string): string {
    const newline = process.platform === "win32" ? "\r\n" : "\n";
    return text.replace(/\r?\n/g, newline);
}

/** Java's `Thread.NORM_PRIORITY`, which the core template quotes as the default. */
const DEFAULT_THREAD_PRIORITY = 5;

export interface CoreTemplateOptions {
    /** The value written into `data`. Pass an absolute path. */
    readonly dataFolder: string;
    /** Written into the commented example log paths. Pass an absolute path. */
    readonly logFolder: string;
    /** BlueMap's own version, for the metrics example line. */
    readonly version: string;
    /** The Minecraft version, or `null` to leave upstream's `?` placeholder. */
    readonly minecraftVersion?: string | null;
    /** `implementation` in the metrics example line. The CLI writes `bukkit`. */
    readonly implementation?: string;
    /** Whether the metrics section is written at all. Servers include it. */
    readonly includeMetrics?: boolean;
    /**
     * Whether the update-timing comments mention the `-u` flag. True for the
     * CLI, false for a server plugin where updates are not flag-driven.
     */
    readonly isCli?: boolean;
    /** Suggested render-thread count. Upstream computes 1, 2 or 3 from the machine. */
    readonly renderThreadCount?: number;
    /** The timestamp comment. Defaults to now, seconds precision, like upstream. */
    readonly timestamp?: string;
    /** The platform path separator, for tests that pin one platform. */
    readonly separator?: string;
}

/**
 * Upstream's own render-thread suggestion, which it calls "very pessimistic,
 * rather let people increase it themselves".
 *
 * @param availableCores  processor cores the runtime reports
 * @param maxHeapMiB      the JVM's maximum heap in MiB
 */
export function suggestRenderThreadCount(availableCores: number, maxHeapMiB: number): number {
    let count = 1;
    if (availableCores >= 6 && maxHeapMiB >= 4096) count = 2;
    if (availableCores >= 10 && maxHeapMiB >= 8192) count = 3;
    return count;
}

/** Upstream's timestamp format: a local ISO-8601 date-time with no fraction. */
export function localTimestamp(date: Date = new Date()): string {
    const pad = (value: number): string => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function renderCoreTemplate(options: CoreTemplateOptions): string {
    const separator = options.separator;
    const path = (value: string): string => (separator === undefined ? formatConfigPath(value) : formatConfigPath(value, separator));
    const logPath = (name: string): string => path(`${options.logFolder}/${name}`);

    return new ConfigTemplate(CORE_TEMPLATE)
        .setConditional("metrics", options.includeMetrics ?? true)
        .setConditional("update-interval-u-flag", options.isCli ?? true)
        .setVariable("timestamp", options.timestamp ?? localTimestamp())
        .setVariable("version", options.version)
        .setVariable("mcVersion", options.minecraftVersion ?? null)
        .setVariable("implementation", options.implementation ?? "bukkit")
        .setVariable("data", path(options.dataFolder))
        .setVariable("render-thread-count", String(options.renderThreadCount ?? 1))
        .setVariable("default-thread-priority", String(DEFAULT_THREAD_PRIORITY))
        .setVariable("logfile", logPath("debug.log"))
        .setVariable("logfile-with-time", logPath("debug_%1$tF_%1$tT.log"))
        .build();
}

export function renderWebappTemplate(options: { webroot: string; separator?: string }): string {
    const path = (value: string): string => (options.separator === undefined ? formatConfigPath(value) : formatConfigPath(value, options.separator));
    return new ConfigTemplate(WEBAPP_TEMPLATE).setVariable("webroot", path(options.webroot)).build();
}

export function renderWebserverTemplate(options: { webroot: string; logFolder: string; separator?: string }): string {
    const path = (value: string): string => (options.separator === undefined ? formatConfigPath(value) : formatConfigPath(value, options.separator));
    return new ConfigTemplate(WEBSERVER_TEMPLATE)
        .setVariable("webroot", path(options.webroot))
        .setVariable("logfile", path(`${options.logFolder}/webserver.log`))
        .setVariable("logfile-with-time", path(`${options.logFolder}/webserver_%1$tF_%1$tT.log`))
        .build();
}

export function renderPluginTemplate(): string {
    return new ConfigTemplate(PLUGIN_TEMPLATE).build();
}

export function renderFileStorageTemplate(options: { root: string; separator?: string }): string {
    const path = (value: string): string => (options.separator === undefined ? formatConfigPath(value) : formatConfigPath(value, options.separator));
    return new ConfigTemplate(FILE_STORAGE_TEMPLATE).setVariable("root", path(options.root)).build();
}

export function renderSqlStorageTemplate(): string {
    return new ConfigTemplate(SQL_STORAGE_TEMPLATE).build();
}

/** The three presets upstream ships for a freshly generated map config. */
export type MapPreset = "overworld" | "nether" | "end";

export interface MapTemplateOptions {
    /** The map's display name. */
    readonly name: string;
    /** The world save folder. Pass an absolute path. */
    readonly world: string;
    readonly dimension: string;
    readonly dimensionType: string;
    readonly sorting: number;
    readonly preset: MapPreset;
    readonly separator?: string;
}

/** The colours and cave settings upstream bakes into each preset. */
const PRESETS: Record<MapPreset, { skyColor: string; voidColor: string; ambientLight: string; removeCavesBelowY: string; removeNetherCeiling: boolean }> = {
    overworld: { skyColor: "#7dabff", voidColor: "#000000", ambientLight: "0.1", removeCavesBelowY: "55", removeNetherCeiling: false },
    nether: { skyColor: "#290000", voidColor: "#150000", ambientLight: "0.6", removeCavesBelowY: "-10000", removeNetherCeiling: true },
    end: { skyColor: "#080010", voidColor: "#080010", ambientLight: "0.6", removeCavesBelowY: "-10000", removeNetherCeiling: false },
};

export function renderMapTemplate(options: MapTemplateOptions): string {
    const preset = PRESETS[options.preset];
    const path = (value: string): string => (options.separator === undefined ? formatConfigPath(value) : formatConfigPath(value, options.separator));

    return new ConfigTemplate(MAP_TEMPLATE)
        .setVariable("name", options.name)
        .setVariable("sorting", String(options.sorting))
        .setVariable("world", path(options.world))
        .setVariable("dimension", options.dimension)
        .setConditional("display-dimension-type", options.dimension !== options.dimensionType)
        .setVariable("dimension-type", options.dimensionType)
        .setVariable("sky-color", preset.skyColor)
        .setVariable("void-color", preset.voidColor)
        .setVariable("ambient-light", preset.ambientLight)
        .setVariable("remove-caves-below-y", preset.removeCavesBelowY)
        .setConditional("remove-nether-ceiling", preset.removeNetherCeiling)
        .build();
}

export interface ConfigSetOptions {
    /** Where rendered tiles and the web app go. Pass an absolute path. */
    readonly webroot: string;
    /** BlueMap's runtime data folder. Pass an absolute path. */
    readonly dataFolder: string;
    /** The world save folder the three generated maps point at. Absolute. */
    readonly world: string;
    readonly version: string;
    readonly minecraftVersion?: string | null;
    /** Where the log files go. Defaults to a `logs` folder inside the data folder. */
    readonly logFolder?: string;
    /** Whether to write `plugin.conf`. The CLI does not; a server plugin does. */
    readonly includePluginConfig?: boolean;
    readonly includeMetrics?: boolean;
    readonly isCli?: boolean;
    readonly renderThreadCount?: number;
    readonly timestamp?: string;
    readonly separator?: string;
}

/**
 * Produces the whole set of files a fresh config folder contains.
 *
 * This mirrors what the CLI writes: `core.conf`, `webapp.conf`,
 * `webserver.conf`, three map configs, and the two storage configs. `plugin.conf`
 * is omitted unless asked for, because the CLI builds its config manager with
 * `usePluginConfig(false)` and so never writes it.
 *
 * Nothing here touches the file system. The caller writes the files, which keeps
 * this testable and keeps the decision about where they go with the code that
 * knows about consent and about the working directory.
 */
export function generateConfigSet(options: ConfigSetOptions): GeneratedConfigFile[] {
    const logFolder = options.logFolder ?? `${options.dataFolder}/logs`;
    // Built conditionally rather than as `{ separator: options.separator }`
    // because `exactOptionalPropertyTypes` draws a line between "absent" and
    // "present and undefined", and these options are absent by default.
    const shared = options.separator === undefined ? {} : { separator: options.separator };

    const files: GeneratedConfigFile[] = [
        {
            path: "core.conf",
            text: renderCoreTemplate({
                dataFolder: options.dataFolder,
                logFolder,
                version: options.version,
                minecraftVersion: options.minecraftVersion ?? null,
                includeMetrics: options.includeMetrics ?? true,
                isCli: options.isCli ?? true,
                renderThreadCount: options.renderThreadCount ?? 1,
                ...(options.timestamp === undefined ? {} : { timestamp: options.timestamp }),
                ...shared,
            }),
        },
        { path: "webapp.conf", text: renderWebappTemplate({ webroot: options.webroot, ...shared }) },
        { path: "webserver.conf", text: renderWebserverTemplate({ webroot: options.webroot, logFolder, ...shared }) },
    ];

    if (options.includePluginConfig === true) files.push({ path: "plugin.conf", text: renderPluginTemplate() });

    files.push(
        {
            path: "maps/overworld.conf",
            text: renderMapTemplate({
                name: "Overworld",
                world: options.world,
                dimension: "minecraft:overworld",
                dimensionType: "minecraft:overworld",
                sorting: 0,
                preset: "overworld",
                ...shared,
            }),
        },
        {
            path: "maps/nether.conf",
            text: renderMapTemplate({
                name: "Nether",
                world: options.world,
                dimension: "minecraft:the_nether",
                dimensionType: "minecraft:the_nether",
                sorting: 100,
                preset: "nether",
                ...shared,
            }),
        },
        {
            path: "maps/end.conf",
            text: renderMapTemplate({
                name: "End",
                world: options.world,
                dimension: "minecraft:the_end",
                dimensionType: "minecraft:the_end",
                sorting: 200,
                preset: "end",
                ...shared,
            }),
        },
        { path: "storages/file.conf", text: renderFileStorageTemplate({ root: `${options.webroot}/maps`, ...shared }) },
        { path: "storages/sql.conf", text: renderSqlStorageTemplate() },
    );

    return files.map((file) => ({ ...file, text: nativeLineEndings(file.text) }));
}
