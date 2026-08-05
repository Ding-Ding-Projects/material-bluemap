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
    // the per-region task that decides which tiles to render, delete or leave alone
    "WorldRegionUpdateTask",
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
    for (const required of ["engine", "world", "map-id"]) {
        if (options[required] === undefined) throw new Error(`--${required} is required`);
    }
    const storageDriver = options["storage-driver"] ?? "file";
    if (storageDriver === "file" && options["storage-root"] === undefined) {
        throw new Error("--storage-root is required when --storage-driver is 'file' (its default)");
    }
    if (storageDriver === "sql" && options["sql-connection-url"] === undefined) {
        throw new Error("--sql-connection-url is required when --storage-driver is 'sql'");
    }
    return options;
}

/**
 * The pack versions, read from the client jar's own `version.json`.
 *
 * This is where upstream gets them: `MinecraftVersion#load` parses `version.json` out of
 * the vanilla jar, and `BlueMapService` then builds
 * `new ResourcePack(minecraftVersion.getResourcePackVersion())` and
 * `new DataPack(minecraftVersion.getDataPackVersion())` — two *different* versions, each
 * with a minor component.
 *
 * The `pack.mcmeta` route this used to take cannot work, and failed silently rather than
 * loudly, which is why it survived: the vanilla client jar carries no `pack.mcmeta` at
 * all, and `resourceExtensions.zip`'s holds only an `overlays` block with no `pack`
 * object. Both roots therefore answered nothing and the whole render ran on the hard-coded
 * fallback of 34.
 *
 * That number is not merely stale, it selects a different pack. `resourceExtensions.zip`
 * declares overlays with format ranges — `mc1_21_9` (min 67), `mc26_1` (min 77),
 * `beds` (max 85), `signs` (max 86) — so at 88 the applied set is
 * {mc1_15, mc1_17, mc1_20_3, mc1_21_9, mc26_1} and at 34 it is
 * {mc1_15, mc1_17, mc1_20_3, beds, signs}: different chest, banner, bed and sign models,
 * a different set of used textures, and therefore a different gallery.
 *
 * `resource_major`/`data_major` is not the only spelling a real `version.json` uses.
 * Upstream's own `PackVersions` class declares `resource_major` with the alternate name
 * `resource` (`@SerializedName(value = "resource_major", alternate = "resource")`, mirrored
 * faithfully in the port at `packages/engine/src/resources/MinecraftVersion.ts`'s
 * `PackVersions.Adapter`) — older client jars write the short form. Minecraft 1.21's own
 * `version.json`, for instance, has `"pack_version": {"resource": 34, "data": 48}` with no
 * `_major` key at all, which this function used to skip as "no pack_version here" and then
 * fail the whole render with "no version.json in any resource root" even though the file
 * was right there and perfectly readable — found running `tools/oracle/textures-parity.mjs`
 * against a real 1.21 jar (issue #31), where the modern-jar-only gate had never exercised
 * this path. `data_minor`/`resource_minor` default to 0 either way, matching upstream.
 *
 * @returns {Promise<{resource: [number, number], data: [number, number]} | null>}
 */
async function readPackVersions(roots) {
    for (const root of roots) {
        try {
            const file = root.resolve("version.json");
            if (!(await file.isRegularFile())) continue;
            const packVersion = JSON.parse(await file.readText())?.pack_version;
            const resourceMajor = packVersion?.resource_major ?? packVersion?.resource;
            const dataMajor = packVersion?.data_major ?? packVersion?.data;
            if (typeof resourceMajor !== "number" || typeof dataMajor !== "number") continue;
            return {
                resource: [resourceMajor, packVersion.resource_minor ?? 0],
                data: [dataMajor, packVersion.data_minor ?? 0],
            };
        } catch {
            // a root without a readable version.json simply does not answer
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
 * Builds the `Storage` the render below writes into — `FileStorage` by default (what
 * `compare.mjs`/`tsEngine.mjs` have always used), or a real `SQLStorage` against a live
 * server when `--storage-driver sql` is passed. This is issue #32's cross-compatibility
 * proof's "TS writes" half: `tools/oracle/sql-crosscompat.mjs` drives this same script
 * with `--storage-driver sql` so upstream's own Java CLI can then read the result back.
 *
 * @returns {Promise<{storage: object, mapDirectory: string|null}>}
 */
async function buildStorage(engine, options) {
    const { Compression } = engine;
    const driver = options["storage-driver"] ?? "file";

    if (driver === "file") {
        const { FileStorage } = engine;
        const storageRoot = resolve(options["storage-root"]);
        const storage = new FileStorage(storageRoot, Compression.GZIP, false);
        await storage.initialize();
        return { storage, mapDirectory: join(storageRoot, options["map-id"]) };
    }

    if (driver === "sql") {
        const { SQLStorage, Database, resolveDialect } = engine;
        const dialect = resolveDialect(options["sql-dialect"] ?? null, options["sql-connection-url"]);
        const connectionProperties =
            options["sql-connection-properties"] !== undefined
                ? JSON.parse(options["sql-connection-properties"])
                : {};
        const maxConnections =
            options["sql-max-connections"] !== undefined ? Number(options["sql-max-connections"]) : -1;
        const driverAdapter = await dialect.createDriverAdapter({
            connectionUrl: options["sql-connection-url"],
            connectionProperties,
            maxConnections,
        });
        const database = new Database(driverAdapter);
        const commandSet = dialect.createCommandSet(database);
        const compressionKey = (options["sql-compression"] ?? "gzip").toUpperCase();
        const compression = Compression[compressionKey];
        if (compression === undefined)
            throw new Error(`unknown --sql-compression '${options["sql-compression"]}'`);
        const storage = new SQLStorage(commandSet, compression);
        await storage.initialize();
        // no filesystem path exists for a real database - the caller reads the map back
        // through its own connection instead of walking a directory
        return { storage, mapDirectory: null };
    }

    throw new Error(`unknown --storage-driver '${driver}' (expected 'file' or 'sql')`);
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
        BmMap,
        WorldRegionUpdateTask,
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
    const mapId = options["map-id"];
    const mapName = options["map-name"] ?? mapId;
    const dimension = Key.parse(options.dimension ?? "minecraft:overworld");

    /*
     * --- resources ---------------------------------------------------------------------
     *
     * The order here IS the resource-pack precedence, and it reproduces upstream's
     * `BlueMapService#getPackRoots` (common/.../BlueMapService.java:336-397) followed by
     * `getOrLoadResourcePack` (:297-302):
     *
     *     packs folder (none here) -> extra packs -> mods (none) -> resourceExtensions.zip
     *     -> the vanilla client jar, appended last by `packRoots.addLast(vanillaResourcePack)`
     *
     * `resourceExtensions.zip` is BlueMap's own bundled pack, and leaving it out is not a
     * cosmetic difference. It ships `assets/minecraft/atlases/blocks.json` holding a single
     * root-level directory source:
     *
     *     {"sources":[{"type":"minecraft:directory","prefix":"","source":""}]}
     *
     * `Atlas#add` unions that with the client jar's own blocks-atlas, which covers only
     * `block/`, `entity/conduit` and two singles — so upstream's texture gallery gains every
     * remaining texture namespace, and this harness's did not. That is 839 missing textures
     * (796 `item/*`, 39 `entity/*`, 4 `block/*` that only the extensions' own models
     * reference), java 2092 entries against 1253 here, and about 1.01 MB of the 1.04 MB
     * `textures.json` byte gap. It also moves every ordinal after the first missing one,
     * which is why the hires tiles referenced the wrong textures too.
     */
    const resourceRoots = [];
    for (const extra of (options["resource-pack"] ?? "").split(";").filter(Boolean)) {
        const path = resolve(extra);
        if (path.endsWith(".zip")) {
            const fileSystem = await ZipFileSystem.openFile(path);
            resourceRoots.push(...fileSystem.getRootDirectories());
        } else {
            // `DirFileSystem` exposes a single `getRoot()`, not the plural
            // `getRootDirectories()` `ZipFileSystem` has — checking for the plural method
            // and skipping otherwise silently dropped every directory-shaped --resource-pack
            // entry (found running tools/oracle/render-1-12-era-matched.mjs against issue
            // #31's synthetic legacy-manifest directory: the pack.mcmeta it wrote never
            // reached the engine, and the error was the unrelated-looking "no version.json
            // in any resource root" a few lines down, not a clue pointing back here).
            resourceRoots.push(new DirFileSystem(path).getRoot());
        }
    }
    if (options["resource-extensions"] !== undefined) {
        const fileSystem = await ZipFileSystem.openFile(resolve(options["resource-extensions"]));
        resourceRoots.push(...fileSystem.getRootDirectories());
    }
    // last, exactly as upstream appends it: a lower-priority fallback under every pack above
    if (options["client-jar"] !== undefined) {
        const fileSystem = await ZipFileSystem.openFile(resolve(options["client-jar"]));
        resourceRoots.push(...fileSystem.getRootDirectories());
    }
    if (resourceRoots.length === 0)
        throw new Error(
            "no resources to render with: pass --client-jar (the harness takes it out of " +
                "the java reference render's data directory)",
        );

    const packVersions = await readPackVersions(resourceRoots);
    if (packVersions === null)
        throw new Error(
            "no version.json in any resource root: the pack versions decide which overlays " +
                "apply, and guessing one silently renders against a different set of models",
        );
    const [resourceMajor, resourceMinor] = packVersions.resource;
    const [dataMajor, dataMinor] = packVersions.data;
    process.stderr.write(
        `[ts] loading resources (resource pack ${resourceMajor}.${resourceMinor}, ` +
            `data pack ${dataMajor}.${dataMinor})\n`,
    );

    const dataPack = new DataPack(new PackVersion(dataMajor, dataMinor));
    await dataPack.loadResources(resourceRoots);

    const resourcePack = new ResourcePack(new PackVersion(resourceMajor, resourceMinor));
    await resourcePack.loadResources(resourceRoots);

    // --- world -----------------------------------------------------------------------
    process.stderr.write(`[ts] loading world ${worldDirectory}\n`);
    const world = await MCAWorld.load(worldDirectory, dimension, null, dataPack);

    // --- storage ---------------------------------------------------------------------
    const { storage, mapDirectory } = await buildStorage(engine, options);

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

    /*
     * --- render ------------------------------------------------------------------------
     *
     * One `WorldRegionUpdateTask` per region, which is what BlueMapCLI's `MapUpdateTask`
     * does. It matters that this is not a tile loop: the task is where upstream decides a
     * tile should NOT be rendered, and driving `renderTile` directly skips every one of
     * those decisions.
     *
     * That is not a subtlety the gate can forgive. Rendering the whole region-to-tile box
     * unconditionally produced 253 tiles the reference does not have (ungenerated terrain
     * past the world's edge, which upstream renders as nothing and *deletes*), left the
     * lowres meta of those tiles holding real terrain where the reference holds the
     * transparent black `unrenderTile` stamps, and wrote no render state at all, because
     * the state is marked by the task rather than by the render.
     */
    let rendered = 0;
    let deleted = 0;
    for (const region of world.listRegions()) {
        const task = new WorldRegionUpdateTask(map, region);
        const result = await task.run();
        rendered += result.rendered;
        deleted += result.deleted;
    }

    await map.save();

    // release the storage's connections (a no-op for FileStorage, a real pool shutdown
    // for SQLStorage) before this process exits, rather than leaving a database
    // connection pool to be reaped by process teardown
    if (typeof storage.close === "function") await storage.close();

    // "chosen for rendering", not "rendered": a tile whose action is RENDER can still fail
    // its preconditions inside the task and be unrendered instead. Saying "rendered" here
    // would overstate by exactly the tiles the gate cares most about.
    process.stderr.write(`[ts] ${rendered} tile(s) chosen for rendering, ${deleted} deleted\n`);
    return { mapDirectory, tiles: rendered };
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
