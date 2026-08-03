#!/usr/bin/env node
/**
 * Renders a world with **this project's TypeScript engine**, so `compare.mjs` can put its
 * output beside upstream's.
 *
 * It runs as its own process on purpose: the engine is an ESM package with wasm-backed
 * codecs and a lot of module-level state, and a render that dies takes the process with
 * it rather than the harness. Everything it learns is reported as one JSON object on
 * stdout; human-readable progress goes to stderr.
 *
 * ## The contract with the harness
 *
 * Exactly one JSON object on stdout, always, whatever happens:
 *
 * ```
 * { "status": "rendered",    "mapDirectory": "...", "tiles": 961 }
 * { "status": "unavailable", "reason": "...", "missing": ["BmMap", ...] }
 * { "status": "error",       "reason": "...", "stack": "..." }
 * ```
 *
 * `unavailable` is a first-class answer, not a failure of this script. Phase D is being
 * written by several agents at once, and until the mesher lands the engine genuinely
 * cannot render — the harness has to say that clearly instead of crashing, and it has to
 * be able to tell "not written yet" apart from "written and wrong".
 */

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/** The exports the render below needs. Each one is named upstream's name. */
const REQUIRED_EXPORTS = [
    // resources
    "ResourcePack",
    "DataPack",
    "PackVersion",
    "ZipFileSystem",
    "DirFileSystem",
    // world
    "MCAWorld",
    // storage (wave D-4)
    "FileStorage",
    "Compression",
    // the map assembler and the two managers it drives (waves D-1/D-3)
    "BmMap",
    "HiresModelManager",
    "LowresTileManager",
];

function emit(result) {
    process.stdout.write(JSON.stringify(result) + "\n");
}

function fail(reason, extra = {}) {
    emit({ status: "error", reason, ...extra });
    return 1;
}

function parseArgs(argv) {
    const options = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (!arg.startsWith("--")) throw new Error(`unexpected argument '${arg}'`);
        const name = arg.slice(2);
        const value = argv[++i];
        if (value === undefined) throw new Error(`missing value for --${name}`);
        options[name] = value;
    }
    for (const required of ["engine", "world", "storage-root", "map-id"]) {
        if (options[required] === undefined) throw new Error(`--${required} is required`);
    }
    return options;
}

/**
 * Reads `pack.mcmeta` out of the resource roots so the pack-version is the one the
 * resources actually declare, rather than a number hard-coded here that goes stale the
 * next time Mojang bumps the format.
 */
async function readPackFormat(roots) {
    for (const root of roots) {
        try {
            const meta = root.resolve("pack.mcmeta");
            if (!(await meta.isRegularFile())) continue;
            const parsed = JSON.parse(await meta.readText());
            const format = parsed?.pack?.pack_format;
            if (typeof format === "number") return format;
        } catch {
            // a pack without a readable mcmeta simply does not answer
        }
    }
    return null;
}

async function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        return fail(String(error instanceof Error ? error.message : error));
    }

    const engineEntry = resolve(options.engine);
    const built = existsSync(engineEntry);
    let engine;
    try {
        engine = await import(pathToFileURL(engineEntry).href);
    } catch (error) {
        // "not built" and "built but throws on import" are different problems and the
        // second one is a real bug in the engine, so they get different messages
        emit({
            status: "unavailable",
            reason: built
                ? `the TypeScript engine threw while loading ${engineEntry}: ${describe(error)}`
                : `the TypeScript engine is not built — ${engineEntry} does not exist ` +
                  "(run `pnpm -r build` in design/)",
            stack: error instanceof Error ? (error.stack ?? "") : "",
        });
        return 0;
    }

    const missing = REQUIRED_EXPORTS.filter((name) => engine[name] === undefined);
    if (missing.length > 0) {
        emit({
            status: "unavailable",
            reason:
                "the TypeScript engine cannot render yet: it exports no " +
                missing.join(", ") +
                ". Phase D is still being written.",
            missing,
        });
        return 0;
    }

    try {
        const result = await render(engine, options);
        emit({ status: "rendered", ...result });
        return 0;
    } catch (error) {
        return fail(describe(error), {
            stack: error instanceof Error ? (error.stack ?? "") : "",
        });
    }
}

/**
 * The render itself.
 *
 * Deliberately written against upstream's own names and call-shapes — `ResourcePack`,
 * `MCAWorld.load`, `new BmMap(...)`, `renderTile`, `save` — so it is the same sequence
 * `BlueMapCLI` performs, and so it starts working the moment the remaining pieces land
 * rather than needing a rewrite.
 */
async function render(engine, options) {
    const {
        ResourcePack,
        DataPack,
        PackVersion,
        ZipFileSystem,
        DirFileSystem,
        MCAWorld,
        FileStorage,
        Compression,
        BmMap,
    } = engine;

    const shared = await import(
        pathToFileURL(
            join(
                resolve(options.engine, "..", "..", "..", "shared"),
                "dist",
                "index.js",
            ),
        ).href
    );
    const { Key, Vector2i } = shared;

    const worldDirectory = resolve(options.world);
    const storageRoot = resolve(options["storage-root"]);
    const mapId = options["map-id"];
    const mapName = options["map-name"] ?? mapId;
    const dimension = Key.parse(options.dimension ?? "minecraft:overworld");

    // --- resources -------------------------------------------------------------------
    const resourceRoots = [];
    if (options["client-jar"] !== undefined) {
        const fileSystem = await ZipFileSystem.openFile(resolve(options["client-jar"]));
        resourceRoots.push(...fileSystem.getRootDirectories());
    }
    for (const extra of (options["resource-pack"] ?? "").split(";").filter(Boolean)) {
        const path = resolve(extra);
        const fileSystem = path.endsWith(".zip")
            ? await ZipFileSystem.openFile(path)
            : new DirFileSystem(path);
        if (typeof fileSystem.getRootDirectories === "function")
            resourceRoots.push(...fileSystem.getRootDirectories());
    }
    if (resourceRoots.length === 0)
        throw new Error(
            "no resources to render with: pass --client-jar (the harness takes it out of " +
                "the java reference render's data directory)",
        );

    const packFormat = (await readPackFormat(resourceRoots)) ?? 34;
    process.stderr.write(`[ts] loading resources (pack_format ${packFormat})\n`);

    const dataPack = new DataPack(new PackVersion(packFormat, 0));
    await dataPack.loadResources(resourceRoots);

    const resourcePack = new ResourcePack(new PackVersion(packFormat, 0));
    await resourcePack.loadResources(resourceRoots);

    // --- world -----------------------------------------------------------------------
    process.stderr.write(`[ts] loading world ${worldDirectory}\n`);
    const world = await MCAWorld.load(worldDirectory, dimension, null, dataPack);

    // --- storage ---------------------------------------------------------------------
    const storage = new FileStorage(storageRoot, Compression.GZIP, false);
    await storage.initialize();

    // --- map -------------------------------------------------------------------------
    const settings = mapSettings(engine, shared, options);
    // upstream: `new BmMap(id, name, world, storage, resourcePack, settings)` — the port
    // needs an async factory because the constructor does storage IO
    const map = await BmMap.create(
        mapId,
        mapName,
        world,
        storage.map(mapId),
        resourcePack,
        settings,
    );

    // --- render ----------------------------------------------------------------------
    const tileGrid = map.getHiresModelManager().getTileGrid();
    const tiles = [];
    for (const region of world.listRegions()) {
        const min = world.getRegionGrid().getCellMin(region, tileGrid);
        const max = world.getRegionGrid().getCellMax(region, tileGrid);
        for (let x = min.getX(); x <= max.getX(); x++)
            for (let z = min.getY(); z <= max.getY(); z++) tiles.push(new Vector2i(x, z));
    }

    // de-duplicate: a hires tile can straddle two regions
    const seen = new Set();
    let rendered = 0;
    for (const tile of tiles) {
        const key = tile.getX() + ":" + tile.getY();
        if (seen.has(key)) continue;
        seen.add(key);
        await map.renderTile(tile);
        rendered++;
    }

    await map.save();

    return { mapDirectory: join(storageRoot, mapId), tiles: rendered };
}

/**
 * The map settings the reference config describes, as a `MapSettings` implementation.
 * The values mirror `tools/oracle/lib/javaOracle.mjs`'s generated `maps/<id>.conf`; a
 * value that drifts between the two renders different tiles and the harness would blame
 * the mesher for it.
 */
function mapSettings(engine, shared, options) {
    const { Mask } = engine;
    const { Vector2i } = shared;
    const settings = {
        getSorting: () => 0,
        getStartPos: () => new Vector2i(0, 0),
        getSkyColor: () => "#7dabff",
        getVoidColor: () => "#000000",
        getMinInhabitedTime: () => 0,
        getMinInhabitedTimeRadius: () => 3,
        getHiresTileSize: () => 32,
        getLowresTileSize: () => 500,
        getLodCount: () => 3,
        getLodFactor: () => 5,
        getAmbientLight: () => 0,
        getSkyLight: () => 1,
        isEnablePerspectiveView: () => true,
        isEnableFlatView: () => true,
        isEnableFreeFlightView: () => true,
        isEnableHires: () => true,
        isCheckForRemovedRegions: () => true,
        // RenderSettings
        getRemoveCavesBelowY: () => 55,
        getCaveDetectionOceanFloor: () => -5,
        isCaveDetectionUsesBlockLight: () => false,
        isRenderEdges: () => true,
        getEdgeLightStrength: () => 8,
        isIgnoreMissingLightData: () => false,
        getRenderMask: () => Mask.ALL,
    };
    settings.isSaveHiresLayer = () => settings.isEnableHires();
    settings.isRenderTopOnly = () =>
        !settings.isEnableHires() ||
        (!settings.isEnablePerspectiveView() && !settings.isEnableFreeFlightView());
    void options;
    return settings;
}

function describe(error) {
    if (error instanceof Error) return error.message;
    return String(error);
}

process.exitCode = await main();
