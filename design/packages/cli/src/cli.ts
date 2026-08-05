/**
 * The CLI's own `main()` — mirrors `BlueMapCLI.main(String[])` branch for branch, including
 * its exit codes. Every step below names the upstream method it stands in for.
 *
 * Java source: `implementations/cli/src/main/java/de/bluecolored/bluemap/cli/BlueMapCLI.java`
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { RenderManager, type BmMap } from "@material-bluemap/engine";
import { resolveCliActions, parseCliArgs, type ResolvedCliActions } from "@material-bluemap/config";
import { formatHelp, formatVersion } from "./args.js";
import { bootstrapConfig, DEFAULT_CONFIG_FOLDER, type LoadedConfig } from "./config.js";
import { createLogger, type Logger } from "./logger.js";
import { buildMaps, resolveConfigPath } from "./maps.js";
import { runRender, runUpdateMarkers, EXIT_NOT_IMPLEMENTED } from "./render.js";
import { resolveResources, MissingResourcesError } from "./resources.js";
import { startWebserver, type RunningServer } from "./serve.js";
import { buildWebappSettings, ensureWebappFiles, readWebappSettings, writeWebappSettings, WebappSourceNotFoundError } from "./webapp.js";

/** upstream: exit-code contract of `BlueMapCLI.main` (0 success, 1 general, 2 missing resources). */
export const EXIT = { OK: 0, GENERAL: 1, MISSING_RESOURCES: 2, NOT_IMPLEMENTED: EXIT_NOT_IMPLEMENTED } as const;

export interface CliResult {
    readonly exitCode: number;
    /** Non-null only when `-w` (or a combination that starts the webserver) left it running. */
    readonly server: RunningServer | null;
    readonly renderManager: RenderManager | null;
}

/**
 * Runs one CLI invocation to completion, exactly the way `main()` would — except it
 * returns rather than calling `System.exit`, so a test (or an embedder) can inspect the
 * result and shut down what was started, and `index.ts` is the only place that actually
 * exits the process.
 */
export async function runCli(argv: readonly string[], appVersion: string): Promise<CliResult> {
    const { invocation, issues } = parseCliArgs(argv);

    // `-b` swaps the logger before anything else runs, exactly as upstream's own
    // `if (cmd.hasOption("b"))` block at the very top of `main()` does.
    const logger = createLogger({ logFile: invocation.logFile, append: invocation.append });

    if (issues.length > 0) {
        for (const issue of issues) logger.error(`Failed to parse provided arguments! ${issue.argument}: ${issue.message}`);
        console.log(formatHelp());
        return { exitCode: EXIT.GENERAL, server: null, renderManager: null };
    }

    if (invocation.help) {
        console.log(formatHelp());
        return { exitCode: EXIT.OK, server: null, renderManager: null };
    }
    if (invocation.version) {
        console.log(formatVersion(appVersion, process.env["BLUEMAP_GIT_HASH"] ?? "unknown"));
        return { exitCode: EXIT.OK, server: null, renderManager: null };
    }

    const configFolder = invocation.configFolder ?? DEFAULT_CONFIG_FOLDER;
    if (invocation.modsFolder !== null) {
        if (!existsSync(invocation.modsFolder)) {
            logger.error(`Mods folder does not exist: ${invocation.modsFolder}`);
            return { exitCode: EXIT.GENERAL, server: null, renderManager: null };
        }
        logger.warn("-n/--mods was given, but this port does not scan mod jars for bundled resource packs. See config.ts.");
    }

    const actions = resolveCliActions(invocation);
    for (const note of actions.notes) logger.info(note);

    let loaded: LoadedConfig;
    try {
        loaded = await bootstrapConfig({ configFolder, minecraftVersion: invocation.minecraftVersion, appVersion, logger });
    } catch (error) {
        logger.error("Failed to load configuration", error);
        return { exitCode: EXIT.GENERAL, server: null, renderManager: null };
    }

    if (actions.noActions) {
        logger.info(`Generated default config files for you, here: ${resolveConfigPath(configFolder)}`);
        console.log(formatHelp());
        return { exitCode: EXIT.GENERAL, server: null, renderManager: null };
    }

    const webroot = resolveConfigPath(loaded.webapp.webroot);

    try {
        // upstream: `createOrUpdateWebApp`, called with `force=true` for `-g` and
        // `force=false` for `-s` — both from the non-render branch here (the render
        // branch's own call sits inside runRenderAction below, matching upstream's
        // renderMaps() calling it once, up front, unconditionally when webapp.enabled).
        if (loaded.webapp.enabled) {
            if (actions.regenerateWebapp) await runCreateOrUpdateWebApp(loaded, webroot, true, appVersion, logger);
            if (actions.updateWebSettings) await runCreateOrUpdateWebApp(loaded, webroot, false, appVersion, logger);
        } else if (actions.regenerateWebapp || actions.updateWebSettings) {
            logger.warn("webapp.conf has enabled=false; -g/-s do nothing while the webapp is disabled.");
        }

        const needsMaps = actions.render !== null || actions.updateMarkers !== null || actions.startWebserver !== null;
        let maps: ReadonlyMap<string, BmMap> = new Map();
        let renderManager: RenderManager | null = null;

        if (needsMaps) {
            const mapFilter = actions.render?.maps ?? actions.updateMarkers?.maps ?? null;
            const resources = await resolveResources({
                core: loaded.core,
                packsFolder: loaded.packsFolder,
                dataFolder: resolveConfigPath(loaded.core.data),
                minecraftVersion: invocation.minecraftVersion,
                logger,
            });
            logger.info(`Resolved Minecraft resources for version '${resources.minecraftVersion}'.`);

            const built = await buildMaps({ loaded, resourcePack: resources.resourcePack, dataPack: resources.dataPack, logger, mapFilter });
            for (const [mapId, reason] of built.skipped) logger.warn(`Map '${mapId}' was not loaded: ${reason}`);
            maps = built.maps;

            if (maps.size === 0) {
                logger.warn("No maps were successfully loaded; render/markers/webserver actions will have nothing to do.");
            }
        }

        let exitCode: number = EXIT.OK;

        if (actions.render !== null) {
            if (loaded.webapp.enabled) await runCreateOrUpdateWebApp(loaded, webroot, actions.render.forceGenerateWebapp, appVersion, logger);

            renderManager = new RenderManager();
            await runRender(actions.render, {
                maps,
                renderManager,
                renderThreadCount: loaded.core["render-thread-count"],
                renderThreadPriority: loaded.core["render-thread-priority"],
                logger,
            });

            if (actions.render.watch) {
                logger.error(
                    "-u/--watch was requested, but nothing in this build joins a file-system event to a " +
                        "render task yet (ROADMAP.md issue #40). The render above ran for real; watching " +
                        "for further changes does not. Re-run without -u to only render, or pass -w to keep " +
                        "serving the result you already have.",
                );
                exitCode = EXIT.NOT_IMPLEMENTED;
            }
        } else if (actions.updateMarkers !== null) {
            await runUpdateMarkers(actions.updateMarkers, maps, logger);
        }

        let server: RunningServer | null = null;
        if (actions.startWebserver !== null) {
            // `runRender` above already started `renderManager`'s worker pool when a render
            // ran first (e.g. `-rw`). A `-w`-only run never takes that branch, so without
            // this the manager RenderUpdateHandler hands out here is constructed but never
            // started: POST /maps/{id}/update would schedule a task onto a queue nothing is
            // draining, and a caller awaiting it — this CLI's own end-to-end test caught
            // exactly that hang — would wait forever for a render that can never run.
            if (renderManager === null) {
                renderManager = new RenderManager();
                renderManager.start(loaded.core["render-thread-count"], loaded.core["render-thread-priority"]);
            }
            server = await startWebserver({ webserver: loaded.webserver, webroot, maps, renderManager, logger });
        }

        return { exitCode, server, renderManager };
    } catch (error) {
        if (error instanceof MissingResourcesError) {
            logger.warn("BlueMap is missing important resources!");
            logger.warn("You must accept the required file download in order for BlueMap to work!");
            logger.warn(error.message);
            return { exitCode: EXIT.MISSING_RESOURCES, server: null, renderManager: null };
        }
        if (error instanceof WebappSourceNotFoundError) {
            logger.error(error.message);
            return { exitCode: EXIT.GENERAL, server: null, renderManager: null };
        }
        logger.error("An unexpected error occurred!", error);
        return { exitCode: EXIT.GENERAL, server: null, renderManager: null };
    }
}

async function runCreateOrUpdateWebApp(loaded: LoadedConfig, webroot: string, force: boolean, appVersion: string, logger: Logger): Promise<void> {
    await ensureWebappFiles(webroot, force, logger);
    // upstream: `!update-settings-file` merges onto a previously saved settings.json
    // (`loadSettings()` + `addFrom`) instead of overwriting it (`setFrom`) — see
    // `WebFilesManager`'s own two call shapes. A missing/corrupt existing file (first run)
    // falls back to building fresh, exactly as upstream's own `GSON.fromJson` on a file
    // that is not there would leave nothing to merge onto.
    const base = loaded.webapp["update-settings-file"] ? null : await readWebappSettings(webroot);
    const settings = buildWebappSettings(loaded.webapp, loaded.maps, appVersion, base);
    await writeWebappSettings(webroot, settings);
    logger.info(`Wrote ${join(webroot, "settings.json")}`);
}

export type { ResolvedCliActions };
