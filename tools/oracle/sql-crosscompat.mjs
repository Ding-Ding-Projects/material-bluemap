#!/usr/bin/env node
/**
 * Issue #32's last open half: cross-compatibility of the ported SQL storage with
 * upstream's own Java engine, over a **real, shared MariaDB server** — not a mock, not
 * SQLite (upstream ships no bundled JDBC driver at all, SQLite included; there is
 * nothing "built in" to be cross-compatible with off the shelf — see the driver-jar
 * discussion below), a real `mariadb:11.4.7` container reachable from both engines.
 *
 *   node tools/oracle/sql-crosscompat.mjs
 *
 * Two directions, both against the same running server:
 *
 *   1. JAVA WRITES, TS READS — upstream's CLI renders the oracle fixture world straight
 *      into SQL storage (`storage-type: sql`, dialect `mariadb`, explicit driver-jar).
 *      This project's `SQLStorage` then reads every hires tile, lowres tile, and
 *      render-state grid back out over a real `mysql2` connection and compares each one,
 *      byte for byte after decompression, against a Java-rendered **file storage**
 *      control of the identical world (the same reference render `compare.mjs` already
 *      knows how to produce).
 *
 *   2. TS WRITES, JAVA READS — this project's engine renders the same world into a
 *      second SQL database on the same server. Upstream's own CLI is then started in
 *      **webserver-only** mode (`-w`, no `-r`), configured to serve straight out of that
 *      SQL storage with no map ever loaded — exactly `MapStorageRequestHandler`'s "raw
 *      storage" code path, real production Java, not a test harness. Every tile and
 *      metadata document this project wrote is fetched back over real HTTP and compared
 *      byte for byte against what the TS engine itself wrote.
 *
 * Exit codes:
 *   0  both directions are byte-identical
 *   1  a divergence was found (a real port finding — see the printed report)
 *   2  the harness could not run (no jar, no driver, a failed render, docker missing)
 *
 * The container is always torn down in a `finally`, whatever happens.
 */

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { diffBytes, diffJson, describeError } from "./lib/diff.mjs";
import {
    findCliJar,
    findClientJar,
    findResourceExtensions,
    generateWorld,
    GRADLE_USER_HOME_SUBPATH,
    renderReference,
} from "./lib/javaOracle.mjs";
import { diffRenderState } from "./lib/renderstate.mjs";
import { exists, formatDuration, log, run } from "./lib/util.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const USAGE = `tools/oracle/sql-crosscompat.mjs — issue #32's SQL storage cross-compatibility proof

Usage:
  node tools/oracle/sql-crosscompat.mjs [options]

Options:
  --seed <n>              world seed (default 1, matches compare.mjs)
  --size <blocks>         edge length of the generated square (default 1000, matches compare.mjs)
  --map-id <id>           storage id of the map (default "overworld")
  --dimension <key>       dimension to render (default "minecraft:overworld")
  --threads <n>           java render threads (default 4)
  --work <dir>            working directory (default tools/oracle/out/sql-crosscompat)
  --mariadb-host <host>   default 127.0.0.1
  --mariadb-port <port>   default 33063
  --mariadb-user <user>   default root
  --mariadb-password <p>  required (or set MBM_CROSSCOMPAT_MARIADB_PASSWORD)
  --java-write-db <name>  database direction 1 (java writes) uses (default bluemap_java_write)
  --ts-write-db <name>    database direction 2 (ts writes) uses (default bluemap_ts_write)
  --driver-jar <path>     path to the MariaDB Connector/J jar (default: resolved from
                          tools/oracle/driver-fetch/build/drivers/)
  --webserver-port <port> port upstream's webserver binds for direction 2 (default 18234)
  --json <path>           also write the full report as json
  --help                  this text
`;

function parseArgs(argv) {
    const options = {
        seed: 1,
        size: 1000,
        mapId: "overworld",
        dimension: "minecraft:overworld",
        threads: 4,
        work: join(REPO_ROOT, "tools", "oracle", "out", "sql-crosscompat"),
        mariadbHost: "127.0.0.1",
        mariadbPort: 33063,
        mariadbUser: "root",
        mariadbPassword: process.env.MBM_CROSSCOMPAT_MARIADB_PASSWORD ?? null,
        javaWriteDb: "bluemap_java_write",
        tsWriteDb: "bluemap_ts_write",
        driverJar: join(
            REPO_ROOT,
            "tools",
            "oracle",
            "driver-fetch",
            "build",
            "drivers",
            "mariadb-java-client-3.5.3.jar",
        ),
        webserverPort: 18234,
        json: null,
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = () => {
            const value = argv[++i];
            if (value === undefined) throw new Error(`missing value for ${arg}`);
            return value;
        };
        switch (arg) {
            case "--help":
            case "-h":
                options.help = true;
                break;
            case "--seed":
                options.seed = Number(next());
                break;
            case "--size":
                options.size = Number(next());
                break;
            case "--map-id":
                options.mapId = next();
                break;
            case "--dimension":
                options.dimension = next();
                break;
            case "--threads":
                options.threads = Number(next());
                break;
            case "--work":
                options.work = resolve(next());
                break;
            case "--mariadb-host":
                options.mariadbHost = next();
                break;
            case "--mariadb-port":
                options.mariadbPort = Number(next());
                break;
            case "--mariadb-user":
                options.mariadbUser = next();
                break;
            case "--mariadb-password":
                options.mariadbPassword = next();
                break;
            case "--java-write-db":
                options.javaWriteDb = next();
                break;
            case "--ts-write-db":
                options.tsWriteDb = next();
                break;
            case "--driver-jar":
                options.driverJar = resolve(next());
                break;
            case "--webserver-port":
                options.webserverPort = Number(next());
                break;
            case "--json":
                options.json = resolve(next());
                break;
            default:
                throw new Error(`unknown argument '${arg}'`);
        }
    }
    return options;
}

/** HOCON string escaping — mirrors `javaOracle.mjs`'s `quote`. */
function quote(value) {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

/**
 * The connection url this port's own reader/writer uses — `mysql2` happily parses
 * embedded `user:password@host` userinfo (proven against the real container below).
 */
function mariadbUrl(options, database) {
    return (
        `jdbc:mariadb://${options.mariadbUser}:${options.mariadbPassword}` +
        `@${options.mariadbHost}:${options.mariadbPort}/${database}`
    );
}

/**
 * The connection url **upstream's own config** uses — deliberately bare, with
 * credentials carried in `connection-properties` instead.
 *
 * FINDING, recorded here rather than silently worked around: MariaDB Connector/J's
 * `HostAddress` parser does not strip `user:password@` userinfo before parsing the
 * host/port segment, so `jdbc:mariadb://user:password@host:port/db` — which upstream's
 * own `SQLConfig` default value and this port's `mysql2` adapter both parse fine — fails
 * MariaDB Connector/J with `SQLException: Incorrect port value` (it reads the whole
 * `password@host` chunk as the port). This is a genuine MariaDB Connector/J behavior
 * (confirmed against a real driver, real server, real error), not a port bug: upstream's
 * own `SQLConfig` documents exactly this escape hatch —
 * `connection-properties`, a `Map<String,String>` merged into the JDBC `Properties`
 * object — for precisely this situation. No port code changes; the config just uses the
 * field upstream provides for it.
 */
function upstreamMariadbUrl(options, database) {
    return `jdbc:mariadb://${options.mariadbHost}:${options.mariadbPort}/${database}`;
}

/**
 * Direction 1's upstream config: renders straight into SQL storage instead of file
 * storage. Every non-storage setting is copied verbatim from `javaOracle.mjs`'s
 * `writeReferenceConfig` so the two renders (file control, sql subject) differ in
 * nothing except where the bytes end up.
 */
async function writeJavaWriteConfig({
    configDirectory,
    dataDirectory,
    webRoot,
    worldDirectory,
    mapId,
    mapName,
    dimension,
    renderThreadCount,
    connectionUrl,
    connectionUser,
    connectionPassword,
    driverJar,
}) {
    configDirectory = resolve(configDirectory);
    dataDirectory = resolve(dataDirectory);
    webRoot = resolve(webRoot);
    worldDirectory = resolve(worldDirectory);

    await mkdir(join(configDirectory, "maps"), { recursive: true });
    await mkdir(join(configDirectory, "storages"), { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await mkdir(webRoot, { recursive: true });

    const core = [
        "accept-download: true",
        "data: " + quote(dataDirectory),
        "render-thread-count: " + renderThreadCount,
        "update-cooldown: 60",
        "full-update-interval: 0",
        "scan-for-mod-resources: true",
        "metrics: false",
        "log: { append: false }",
        "",
    ].join("\n");

    const storage = [
        "storage-type: sql",
        "connection-url: " + quote(connectionUrl),
        "connection-properties: { user: " +
            quote(connectionUser) +
            ", password: " +
            quote(connectionPassword) +
            " }",
        'dialect: "mariadb"',
        "driver-jar: " + quote(driverJar),
        'driver-class: "org.mariadb.jdbc.Driver"',
        "compression: gzip",
        "",
    ].join("\n");

    const webapp = ["enabled: true", "webroot: " + quote(webRoot), "update-settings-file: true", ""].join(
        "\n",
    );
    const webserver = ["enabled: false", "webroot: " + quote(webRoot), "port: 8100", ""].join("\n");

    const map = [
        "world: " + quote(worldDirectory),
        "dimension: " + quote(dimension),
        "name: " + quote(mapName),
        "sorting: 0",
        "start-pos: { x: 0, z: 0 }",
        'sky-color: "#7dabff"',
        'void-color: "#000000"',
        "sky-light: 1",
        "ambient-light: 0",
        "remove-caves-below-y: 55",
        "cave-detection-ocean-floor: -5",
        "cave-detection-uses-block-light: false",
        "min-inhabited-time: 0",
        "render-edges: true",
        "edge-light-strength: 8",
        "enable-perspective-view: true",
        "enable-flat-view: true",
        "enable-free-flight-view: true",
        "enable-hires: true",
        'storage: "mariadb"',
        "ignore-missing-light-data: false",
        "marker-sets: {}",
        "",
    ].join("\n");

    const files = [
        [join(configDirectory, "core.conf"), core],
        [join(configDirectory, "webapp.conf"), webapp],
        [join(configDirectory, "webserver.conf"), webserver],
        [join(configDirectory, "storages", "mariadb.conf"), storage],
        [join(configDirectory, "maps", mapId + ".conf"), map],
    ];
    for (const [path, contents] of files) await writeFile(path, contents, "utf8");
    return { configDirectory };
}

/**
 * Direction 2's upstream config: **serving only**. No `world:` in the map config (it is
 * `@Nullable` — `common/config/MapConfig.java`), so `BlueMapService` never tries to load
 * a world and `BlueMapCLI.startWebserver` falls through to
 * `new MapRequestHandler(storage)` — upstream's genuine raw-storage HTTP path,
 * `MapStorageRequestHandler`, reading straight out of the TS-written SQL database.
 */
async function writeTsWriteServeConfig({
    configDirectory,
    dataDirectory,
    webRoot,
    mapId,
    mapName,
    webserverPort,
    connectionUrl,
    connectionUser,
    connectionPassword,
    driverJar,
}) {
    configDirectory = resolve(configDirectory);
    dataDirectory = resolve(dataDirectory);
    webRoot = resolve(webRoot);

    await mkdir(join(configDirectory, "maps"), { recursive: true });
    await mkdir(join(configDirectory, "storages"), { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await mkdir(webRoot, { recursive: true });

    const core = [
        "accept-download: false",
        "data: " + quote(dataDirectory),
        "render-thread-count: 1",
        "update-cooldown: 60",
        "full-update-interval: 0",
        "scan-for-mod-resources: false",
        "metrics: false",
        "log: { append: false }",
        "",
    ].join("\n");

    const storage = [
        "storage-type: sql",
        "connection-url: " + quote(connectionUrl),
        "connection-properties: { user: " +
            quote(connectionUser) +
            ", password: " +
            quote(connectionPassword) +
            " }",
        'dialect: "mariadb"',
        "driver-jar: " + quote(driverJar),
        'driver-class: "org.mariadb.jdbc.Driver"',
        "compression: gzip",
        "",
    ].join("\n");

    const webapp = ["enabled: false", "webroot: " + quote(webRoot), "update-settings-file: false", ""].join(
        "\n",
    );
    const webserver = [
        "enabled: true",
        "webroot: " + quote(webRoot),
        "ip: 127.0.0.1",
        "port: " + webserverPort,
        "",
    ].join("\n");

    // No "world:" key at all — this map is served straight from storage, never rendered.
    const map = ["name: " + quote(mapName), "sorting: 0", 'storage: "mariadb-ts"', "marker-sets: {}", ""].join(
        "\n",
    );

    const files = [
        [join(configDirectory, "core.conf"), core],
        [join(configDirectory, "webapp.conf"), webapp],
        [join(configDirectory, "webserver.conf"), webserver],
        [join(configDirectory, "storages", "mariadb-ts.conf"), storage],
        [join(configDirectory, "maps", mapId + ".conf"), map],
    ];
    for (const [path, contents] of files) await writeFile(path, contents, "utf8");
    return { configDirectory };
}

async function waitForPort(host, port, timeoutMs) {
    const { connect } = await import("node:net");
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const ok = await new Promise((resolvePromise) => {
            const socket = connect({ host, port }, () => {
                socket.destroy();
                resolvePromise(true);
            });
            socket.on("error", () => resolvePromise(false));
            socket.setTimeout(1000, () => {
                socket.destroy();
                resolvePromise(false);
            });
        });
        if (ok) return true;
        await new Promise((r) => setTimeout(r, 300));
    }
    return false;
}

class Counter {
    constructor(label) {
        this.label = label;
        this.compared = 0;
        this.matching = 0;
        this.timeOnly = 0;
        this.divergences = [];
    }
    record(name, diff) {
        this.compared++;
        if (diff === null) {
            this.matching++;
        } else if (diff.kind === "renderstate-time") {
            // every field agrees except the wall-clock render/update times, which two
            // renders performed at different moments cannot share — see diffRenderState
            this.matching++;
            this.timeOnly++;
        } else {
            this.divergences.push({ name, ...diff });
        }
    }
    line() {
        const timeOnlyNote = this.timeOnly > 0 ? `, ${this.timeOnly} time-only` : "";
        return `  ${this.label.padEnd(28)} compared ${this.compared}, matching ${this.matching}${timeOnlyNote}, differing ${
            this.divergences.length
        }`;
    }
}

/** Compares every existing cell of a Java-file-control grid against a TS-sql grid. */
async function compareGrid(label, controlGrid, sqlGrid, counter, maxReport) {
    const controlCells = await controlGrid.stream();
    for (const cell of controlCells) {
        const x = cell.getX();
        const z = cell.getZ();
        const controlStream = await cell.read();
        const sqlStream = await sqlGrid.read(x, z);
        if (controlStream === null) continue; // should not happen: this cell came from stream()
        if (sqlStream === null) {
            counter.record(`${label} (${x},${z})`, {
                kind: "missing",
                message: `present in the java file-storage control, missing in the ts sql read`,
                detail: [],
            });
            continue;
        }
        const controlBytes = Buffer.from(await controlStream.decompress());
        const sqlBytes = Buffer.from(await sqlStream.decompress());
        counter.record(`${label} (${x},${z})`, diffBytes(controlBytes, sqlBytes));
    }
    const sqlCells = await sqlGrid.stream();
    if (sqlCells.length !== controlCells.length) {
        counter.record(`${label} (cell count)`, {
            kind: "count",
            message: `java file-storage control has ${controlCells.length} cells, ts sql read has ${sqlCells.length}`,
            detail: [],
        });
    }
    return counter;
}

/**
 * `tileState`, `chunkState` and `regionState` are NOT safe to raw-byte-diff against a
 * separately-run control render — a first pass of this script that tried it found
 * exactly why: `TileInfoRegion.lastRenderTimes` (upstream: `MapTileState`/
 * `TileInfoRegion`, `@NBTName("last-render-times")`) and `RegionInfoRegion.
 * lastUpdateTimes` (upstream: `MapRegionState`/`RegionInfoRegion`,
 * `@NBTName("last-update-times")`) are real wall-clock seconds, stamped fresh every time
 * a tile/region is actually rendered. The file-storage control and the sql-storage
 * subject are two SEPARATE java render runs of the identical world a few seconds apart,
 * so those timestamps legitimately differ between them — that is not a divergence, it is
 * two clocks correctly disagreeing about "just now". A raw byte-diff reported this as a
 * false positive on every region touched by rendering (five files, this script's first
 * real run against a live MariaDB server).
 *
 * `compare.mjs` — the Phase D gate this harness already runs on every file-storage-only
 * render — solved exactly this problem for its own `rstate/*.dat` comparison:
 * `lib/renderstate.mjs`'s `diffRenderState` reads the render-state NBT structurally and
 * compares every field exactly EXCEPT the named wall-clock time fields
 * (`last-render-times`, `last-update-times`), which it reports as their own
 * `renderstate-time` kind instead of folding away or raw-diffing. That module already has
 * its own coverage in `selftest.mjs` ("a render time that moved is reported as time-only
 * rather than as a divergence"), so this reuses it verbatim rather than re-deriving the
 * same NBT-field split against `MapTileState`/`MapRegionState` a second, less-tested way.
 * The only adaptation: `compare.mjs` reads gzip bytes straight off disk and gunzips them
 * itself, where this script already has fully decompressed bytes from
 * `CompressedInputStream.decompress()` — so no extra gunzip step here.
 *
 * `chunkState`'s `ChunkInfoRegion.chunkHashes` is a content hash, not a clock reading, so
 * `diffRenderState` compares it exactly like any other field — and it does compare
 * byte-identical, unchanged from the original raw-byte-diff result.
 */
async function compareRenderStateGrid(label, controlGrid, sqlGrid, counter) {
    const controlCells = await controlGrid.stream();
    for (const cell of controlCells) {
        const x = cell.getX();
        const z = cell.getZ();
        const controlStream = await cell.read();
        const sqlStream = await sqlGrid.read(x, z);
        if (controlStream === null) continue; // should not happen: this cell came from stream()
        if (sqlStream === null) {
            counter.record(`${label} (${x},${z})`, {
                kind: "missing",
                message: `present in the java file-storage control, missing in the ts sql read`,
                detail: [],
            });
            continue;
        }
        const controlBytes = Buffer.from(await controlStream.decompress());
        const sqlBytes = Buffer.from(await sqlStream.decompress());
        counter.record(`${label} (${x},${z})`, diffRenderState(controlBytes, sqlBytes));
    }
    const sqlCells = await sqlGrid.stream();
    if (sqlCells.length !== controlCells.length) {
        counter.record(`${label} (cell count)`, {
            kind: "count",
            message: `java file-storage control has ${controlCells.length} cells, ts sql read has ${sqlCells.length}`,
            detail: [],
        });
    }
    return counter;
}

async function compareItem(label, controlItem, sqlItem, counter, { asJson = false } = {}) {
    const controlStream = await controlItem.read();
    const sqlStream = await sqlItem.read();
    if (controlStream === null && sqlStream === null) {
        counter.record(label, null);
        return;
    }
    if (controlStream === null || sqlStream === null) {
        counter.record(label, {
            kind: "missing",
            message: `java file-storage control ${controlStream === null ? "has none" : "has one"}, ts sql read ${
                sqlStream === null ? "has none" : "has one"
            }`,
            detail: [],
        });
        return;
    }
    const controlBytes = Buffer.from(await controlStream.decompress());
    const sqlBytes = Buffer.from(await sqlStream.decompress());
    if (asJson) {
        try {
            const diff = diffJson(
                JSON.parse(controlBytes.toString("utf8")),
                JSON.parse(sqlBytes.toString("utf8")),
            );
            counter.record(label, diff);
            return;
        } catch {
            // fall through to a byte comparison if either side is not valid json
        }
    }
    counter.record(label, diffBytes(controlBytes, sqlBytes));
}

function printCounters(counters, maxReport) {
    log("");
    for (const counter of counters) log(counter.line());
    log("");
    let shown = 0;
    for (const counter of counters) {
        for (const div of counter.divergences) {
            if (shown >= maxReport) break;
            shown++;
            log(`  ${counter.label} / ${div.name}  [${div.kind}]`);
            log(`    ${div.message}`);
            for (const line of div.detail ?? []) log("   " + line);
            log("");
        }
    }
    const total = counters.reduce((sum, c) => sum + c.divergences.length, 0);
    if (total > maxReport) log(`  ... and ${total - maxReport} more divergence(s)`);
    return total;
}

async function main() {
    let options;
    try {
        options = parseArgs(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(describeError(error) + "\n\n" + USAGE);
        return 2;
    }
    if (options.help) {
        process.stdout.write(USAGE);
        return 0;
    }
    if (options.mariadbPassword === null) {
        log(
            "[sql-crosscompat] no mariadb password: pass --mariadb-password or set " +
                "MBM_CROSSCOMPAT_MARIADB_PASSWORD",
        );
        return 2;
    }
    if (!(await exists(options.driverJar))) {
        log(
            `[sql-crosscompat] no MariaDB JDBC driver jar at ${options.driverJar}.\n` +
                "  fetch it with: vendor/BlueMap/gradlew.bat --project-dir tools/oracle/driver-fetch -q fetchDrivers\n" +
                `  (GRADLE_USER_HOME=${join(REPO_ROOT, GRADLE_USER_HOME_SUBPATH)})`,
        );
        return 2;
    }

    const startedAt = Date.now();
    const report = { startedAt: new Date(startedAt).toISOString(), options: { ...options, mariadbPassword: "<redacted>" }, direction1: null, direction2: null };
    await mkdir(options.work, { recursive: true });

    const jar = await findCliJar(REPO_ROOT);
    if (jar === null) {
        log(
            "[sql-crosscompat] no reference jar found. build it with " +
                "`node tools/build-jars.mjs --only cli`.",
        );
        return 2;
    }
    log(`[sql-crosscompat] using cli jar: ${jar}`);

    let worldDirectory;
    try {
        worldDirectory = await generateWorld({
            repoRoot: REPO_ROOT,
            seed: options.seed,
            size: options.size,
            out: join(options.work, "worlds"),
        });
    } catch (error) {
        log(`[sql-crosscompat] ${describeError(error)}`);
        return 2;
    }
    log(`[sql-crosscompat] world ready: ${worldDirectory}`);

    let exitCode = 0;
    let webserverProcess = null;

    try {
        // ---------------------------------------------------------------------------
        // DIRECTION 1: java writes into sql storage, this port reads it back
        // ---------------------------------------------------------------------------
        log("");
        log("=== DIRECTION 1: java writes -> ts reads ===");

        const fileControl = await renderReference({
            repoRoot: REPO_ROOT,
            jar,
            worldDirectory,
            workDirectory: join(options.work, "d1-file-control"),
            mapId: options.mapId,
            mapName: "Overworld",
            dimension: options.dimension,
            acceptDownload: true,
            renderThreadCount: options.threads,
            refresh: false,
        });
        log(`[sql-crosscompat] java file-storage control ready: ${fileControl.mapDirectory} (${fileControl.tileCount} files)`);

        const d1ConfigDir = join(options.work, "d1-sql", "config");
        const d1DataDir = join(options.work, "d1-sql", "data");
        const d1WebRoot = join(options.work, "d1-sql", "web");
        await rm(join(options.work, "d1-sql"), { recursive: true, force: true });
        const javaWriteUrl = mariadbUrl(options, options.javaWriteDb);
        await writeJavaWriteConfig({
            configDirectory: d1ConfigDir,
            dataDirectory: d1DataDir,
            webRoot: d1WebRoot,
            worldDirectory,
            mapId: options.mapId,
            mapName: "Overworld",
            dimension: options.dimension,
            renderThreadCount: options.threads,
            connectionUrl: upstreamMariadbUrl(options, options.javaWriteDb),
            connectionUser: options.mariadbUser,
            connectionPassword: options.mariadbPassword,
            driverJar: options.driverJar,
        });

        log("[sql-crosscompat] rendering with upstream's java engine into sql storage (mariadb) ...");
        const d1RenderStart = Date.now();
        const d1Result = await run("java", ["-jar", jar, "-c", d1ConfigDir, "-r", "-g"], {
            cwd: dirname(d1ConfigDir),
        });
        if (d1Result.code !== 0) {
            log(`[sql-crosscompat] the java sql-storage render exited ${d1Result.code}`);
            return 2;
        }
        log(`[sql-crosscompat] java sql-storage render finished in ${formatDuration(Date.now() - d1RenderStart)}`);

        // read it back through the ported SQLStorage
        const engineEntryPath = join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js");
        const engine = await import(pathToFileURL(engineEntryPath).href);
        const { SQLStorage, Database, MARIADB, FileMapStorage, Compression } = engine;

        const d1DriverAdapter = await MARIADB.createDriverAdapter({
            connectionUrl: javaWriteUrl,
            connectionProperties: {},
            maxConnections: -1,
        });
        const d1Database = new Database(d1DriverAdapter);
        const d1CommandSet = MARIADB.createCommandSet(d1Database);
        const d1Storage = new SQLStorage(d1CommandSet, Compression.GZIP);
        // no initializeTables() call needed for a *read* — the java writer already
        // created the schema; calling it anyway would just be a no-op CREATE TABLE IF
        // NOT EXISTS, so it stays out to keep this an honest "read what java wrote" path
        const sqlMap = d1Storage.map(options.mapId);

        const controlMap = new FileMapStorage(fileControl.mapDirectory, Compression.GZIP, false);

        const counters1 = [];
        const hiresCounter = new Counter("hires tiles");
        await compareGrid("hires", controlMap.hiresTiles(), sqlMap.hiresTiles(), hiresCounter);
        counters1.push(hiresCounter);

        for (let lod = 1; lod <= 3; lod++) {
            const lodCounter = new Counter(`lowres lod ${lod}`);
            await compareGrid(`lowres/${lod}`, controlMap.lowresTiles(lod), sqlMap.lowresTiles(lod), lodCounter);
            counters1.push(lodCounter);
        }

        // tileState/chunkState/regionState: see compareRenderStateGrid's doc comment —
        // this reuses compare.mjs's own diffRenderState, which already knows which fields
        // are wall-clock times (and therefore cannot match two separate render runs) and
        // which are deterministic content (and must match exactly)
        const tileStateCounter = new Counter("tileState");
        await compareRenderStateGrid("tileState", controlMap.tileState(), sqlMap.tileState(), tileStateCounter);
        counters1.push(tileStateCounter);

        const chunkStateCounter = new Counter("chunkState");
        await compareRenderStateGrid(
            "chunkState",
            controlMap.chunkState(),
            sqlMap.chunkState(),
            chunkStateCounter,
        );
        counters1.push(chunkStateCounter);

        const regionStateCounter = new Counter("regionState");
        await compareRenderStateGrid(
            "regionState",
            controlMap.regionState(),
            sqlMap.regionState(),
            regionStateCounter,
        );
        counters1.push(regionStateCounter);

        const metaCounter = new Counter("metadata (settings/textures)");
        await compareItem("settings.json", controlMap.settings(), sqlMap.settings(), metaCounter, { asJson: true });
        await compareItem("textures.json", controlMap.textures(), sqlMap.textures(), metaCounter, { asJson: true });
        counters1.push(metaCounter);

        const d1Divergences = printCounters(counters1, 8);
        await d1Storage.close();

        report.direction1 = {
            fileControlTiles: fileControl.tileCount,
            counters: counters1.map((c) => ({
                label: c.label,
                compared: c.compared,
                matching: c.matching,
                divergences: c.divergences.length,
            })),
            ok: d1Divergences === 0,
        };

        if (d1Divergences === 0) {
            log(`  DIRECTION 1 RESULT: identical. every grid cell and metadata document java wrote matched what ts read back over a real mariadb connection.`);
        } else {
            log(`  DIRECTION 1 RESULT: ${d1Divergences} divergence(s) — see above.`);
            exitCode = 1;
        }

        // ---------------------------------------------------------------------------
        // DIRECTION 2: ts writes into sql storage, java reads it back over http
        // ---------------------------------------------------------------------------
        log("");
        log("=== DIRECTION 2: ts writes -> java reads ===");

        const tsWriteUrl = mariadbUrl(options, options.tsWriteDb);
        const engineEntry = join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js");
        const clientJar = await findClientJar(fileControl.dataDirectory);
        const resourceExtensions = await findResourceExtensions(fileControl.dataDirectory);

        const driverScript = join(REPO_ROOT, "tools", "oracle", "render-ts.mjs");
        const args = [
            driverScript,
            "--engine",
            engineEntry,
            "--world",
            worldDirectory,
            "--map-id",
            options.mapId,
            "--map-name",
            "Overworld",
            "--dimension",
            options.dimension,
            "--storage-driver",
            "sql",
            "--sql-dialect",
            "bluemap:mariadb",
            "--sql-connection-url",
            tsWriteUrl,
            "--sql-compression",
            "gzip",
        ];
        if (clientJar !== null) args.push("--client-jar", clientJar);
        if (resourceExtensions !== null) args.push("--resource-extensions", resourceExtensions);

        log("[sql-crosscompat] rendering with the ts engine into sql storage (mariadb) ...");
        const d2RenderStart = Date.now();
        const tsRenderResult = await run(process.execPath, args, { capture: true });
        const tsLine = tsRenderResult.stdout.trim().split("\n").filter(Boolean).pop();
        let tsParsed = null;
        try {
            tsParsed = tsLine ? JSON.parse(tsLine) : null;
        } catch {
            tsParsed = null;
        }
        if (tsParsed === null || tsParsed.status !== "rendered") {
            log(
                `[sql-crosscompat] the ts sql-storage render did not report success: ${
                    tsParsed ? JSON.stringify(tsParsed) : tsRenderResult.stderr.slice(-2000)
                }`,
            );
            return 2;
        }
        log(
            `[sql-crosscompat] ts sql-storage render finished in ${formatDuration(Date.now() - d2RenderStart)} (${tsParsed.tiles} tile(s) chosen)`,
        );

        // enumerate what ts actually wrote, straight from the same database, so the
        // http fetch list below is driven by ground truth rather than a guess
        const d2DriverAdapter = await MARIADB.createDriverAdapter({
            connectionUrl: tsWriteUrl,
            connectionProperties: {},
            maxConnections: -1,
        });
        const d2Database = new Database(d2DriverAdapter);
        const d2CommandSet = MARIADB.createCommandSet(d2Database);
        const d2ReaderStorage = new SQLStorage(d2CommandSet, Compression.GZIP);
        const d2ReaderMap = d2ReaderStorage.map(options.mapId);
        const tsHiresCells = await d2ReaderMap.hiresTiles().stream();
        const tsLowresCells = {};
        for (let lod = 1; lod <= 3; lod++) tsLowresCells[lod] = await d2ReaderMap.lowresTiles(lod).stream();
        const tsSettings = await d2ReaderMap.settings().read();
        const tsTextures = await d2ReaderMap.textures().read();
        log(
            `[sql-crosscompat] ts wrote ${tsHiresCells.length} hires tile(s), ` +
                `${Object.values(tsLowresCells).reduce((s, c) => s + c.length, 0)} lowres tile(s) across 3 lods`,
        );

        // upstream's own webserver, serving straight from the same database ts just wrote
        const d2ConfigDir = join(options.work, "d2-serve", "config");
        const d2DataDir = join(options.work, "d2-serve", "data");
        const d2WebRoot = join(options.work, "d2-serve", "web");
        await rm(join(options.work, "d2-serve"), { recursive: true, force: true });
        await writeTsWriteServeConfig({
            configDirectory: d2ConfigDir,
            dataDirectory: d2DataDir,
            webRoot: d2WebRoot,
            mapId: options.mapId,
            mapName: "Overworld",
            webserverPort: options.webserverPort,
            connectionUrl: upstreamMariadbUrl(options, options.tsWriteDb),
            connectionUser: options.mariadbUser,
            connectionPassword: options.mariadbPassword,
            driverJar: options.driverJar,
        });

        log(`[sql-crosscompat] starting upstream's webserver on 127.0.0.1:${options.webserverPort} ...`);
        webserverProcess = spawn("java", ["-jar", jar, "-c", d2ConfigDir, "-w", "-b"], {
            cwd: dirname(d2ConfigDir),
            stdio: ["ignore", "pipe", "pipe"],
        });
        let webserverLog = "";
        webserverProcess.stdout.on("data", (chunk) => (webserverLog += chunk));
        webserverProcess.stderr.on("data", (chunk) => (webserverLog += chunk));

        const up = await waitForPort("127.0.0.1", options.webserverPort, 30000);
        if (!up) {
            log(`[sql-crosscompat] upstream's webserver never came up. log tail:\n${webserverLog.slice(-2000)}`);
            return 2;
        }
        log("[sql-crosscompat] upstream's webserver is up; fetching tiles it is serving from ts-written sql storage");

        const httpCounter = new Counter("hires tiles (via upstream's webserver)");
        for (const cell of tsHiresCells) {
            const x = cell.getX();
            const z = cell.getZ();
            const tsStream = await cell.read();
            const tsBytes = Buffer.from(await tsStream.decompress());
            const url = `http://127.0.0.1:${options.webserverPort}/maps/${options.mapId}/tiles/0/x${x}z${z}.prbm`;
            const response = await fetch(url, { headers: { "Accept-Encoding": "identity" } });
            if (!response.ok) {
                httpCounter.record(`(${x},${z})`, {
                    kind: "http",
                    message: `upstream's webserver returned ${response.status} for a tile ts wrote`,
                    detail: [],
                });
                continue;
            }
            const javaBytes = Buffer.from(await response.arrayBuffer());
            httpCounter.record(`(${x},${z})`, diffBytes(tsBytes, javaBytes));
        }

        const lowresCounters = [];
        for (let lod = 1; lod <= 3; lod++) {
            const lodCounter = new Counter(`lowres lod ${lod} (via webserver)`);
            for (const cell of tsLowresCells[lod]) {
                const x = cell.getX();
                const z = cell.getZ();
                const tsStream = await cell.read();
                const tsBytes = Buffer.from(await tsStream.decompress());
                const url = `http://127.0.0.1:${options.webserverPort}/maps/${options.mapId}/tiles/${lod}/x${x}z${z}.png`;
                const response = await fetch(url, { headers: { "Accept-Encoding": "identity" } });
                if (!response.ok) {
                    lodCounter.record(`(${x},${z})`, {
                        kind: "http",
                        message: `upstream's webserver returned ${response.status} for a lowres tile ts wrote`,
                        detail: [],
                    });
                    continue;
                }
                const javaBytes = Buffer.from(await response.arrayBuffer());
                lodCounter.record(`(${x},${z})`, diffBytes(tsBytes, javaBytes));
            }
            lowresCounters.push(lodCounter);
        }

        const metaHttpCounter = new Counter("metadata (via webserver)");
        for (const [name, path, stream] of [
            ["settings.json", "settings.json", tsSettings],
            ["textures.json", "textures.json", tsTextures],
        ]) {
            if (stream === null) {
                metaHttpCounter.record(name, { kind: "missing", message: "ts wrote nothing for this document", detail: [] });
                continue;
            }
            const tsBytes = Buffer.from(await stream.decompress());
            const url = `http://127.0.0.1:${options.webserverPort}/maps/${options.mapId}/${path}`;
            const response = await fetch(url, { headers: { "Accept-Encoding": "identity" } });
            if (!response.ok) {
                metaHttpCounter.record(name, {
                    kind: "http",
                    message: `upstream's webserver returned ${response.status}`,
                    detail: [],
                });
                continue;
            }
            const javaBytes = Buffer.from(await response.arrayBuffer());
            try {
                metaHttpCounter.record(name, diffJson(JSON.parse(tsBytes.toString("utf8")), JSON.parse(javaBytes.toString("utf8"))));
            } catch {
                metaHttpCounter.record(name, diffBytes(tsBytes, javaBytes));
            }
        }

        const counters2 = [httpCounter, ...lowresCounters, metaHttpCounter];
        const d2Divergences = printCounters(counters2, 8);
        await d2ReaderStorage.close();

        report.direction2 = {
            tsHiresTiles: tsHiresCells.length,
            counters: counters2.map((c) => ({
                label: c.label,
                compared: c.compared,
                matching: c.matching,
                divergences: c.divergences.length,
            })),
            ok: d2Divergences === 0,
        };

        if (d2Divergences === 0) {
            log(
                `  DIRECTION 2 RESULT: identical. every tile and metadata document ts wrote was read back byte-for-byte through upstream's own real webserver code path.`,
            );
        } else {
            log(`  DIRECTION 2 RESULT: ${d2Divergences} divergence(s) — see above.`);
            exitCode = 1;
        }
    } catch (error) {
        log(`[sql-crosscompat] FATAL: ${describeError(error)}`);
        if (error instanceof Error && error.stack) log(error.stack);
        exitCode = 2;
    } finally {
        if (webserverProcess !== null && webserverProcess.exitCode === null) {
            webserverProcess.kill();
            log("[sql-crosscompat] stopped upstream's webserver process");
        }
    }

    report.durationMs = Date.now() - startedAt;
    report.exitCode = exitCode;
    if (options.json !== null) {
        await mkdir(dirname(options.json), { recursive: true });
        await writeFile(options.json, JSON.stringify(report, null, 2) + "\n", "utf8");
        log(`[sql-crosscompat] report written to ${options.json}`);
    }
    log("");
    log(`(${formatDuration(Date.now() - startedAt)})`);
    return exitCode;
}

process.exitCode = await main();
