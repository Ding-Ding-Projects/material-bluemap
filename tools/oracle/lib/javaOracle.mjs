/**
 * The reference half of the harness: generate a world, then render it with **upstream's
 * own Java engine**, built unmodified from the vendored source.
 *
 * The reference render is cached, because it costs about eighty seconds for a 1000x1000
 * world. The cache key covers everything that can change the output — seed, size,
 * dimension, the jar, and the exact bytes of the configuration — so a changed config or
 * a rebuilt jar invalidates it rather than silently comparing against a stale reference.
 */

import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exists, isDirectory, listFiles, log, run, sha256 } from "./util.mjs";

/** Where `build-jars.mjs` points GRADLE_USER_HOME, so a build never touches ~/.gradle. */
export const GRADLE_USER_HOME_SUBPATH = join("tools", "oracle", ".gradle");

/**
 * Finds the CLI shadow jar in the vendored build tree.
 * @param {string} repoRoot
 * @returns {Promise<string|null>}
 */
export async function findCliJar(repoRoot) {
    const libs = join(repoRoot, "vendor", "BlueMap", "implementations", "cli", "build", "libs");
    if (!(await isDirectory(libs))) return null;
    const names = (await readdir(libs)).filter((name) => name.endsWith("-shadow.jar")).sort();
    const last = names[names.length - 1];
    return last === undefined ? null : join(libs, last);
}

/**
 * Builds the CLI shadow jar with the vendored Gradle wrapper.
 * @param {string} repoRoot
 */
export async function buildCliJar(repoRoot) {
    const vendor = join(repoRoot, "vendor", "BlueMap");
    const wrapper = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
    log(`[oracle] building the reference jar: ${wrapper} :cli:shadowJar`);
    const result = await run(wrapper, [":cli:shadowJar"], {
        cwd: vendor,
        env: { GRADLE_USER_HOME: join(repoRoot, GRADLE_USER_HOME_SUBPATH) },
    });
    if (result.code !== 0)
        throw new Error(`the reference jar failed to build (gradle exited ${result.code})`);
}

/**
 * Generates the fixture world.
 *
 * @param {{repoRoot: string, seed: number, size: number, out: string}} options
 * @returns {Promise<string>} the world directory
 */
export async function generateWorld({ repoRoot, seed, size, out }) {
    const cli = join(repoRoot, "design", "packages", "worldgen", "dist", "cli.js");
    if (!(await exists(cli)))
        throw new Error(
            `the world generator is not built: ${cli} does not exist ` +
                `(run \`pnpm --filter @material-bluemap/worldgen build\` in design/)`,
        );

    const name = `world-seed-${seed}-size-${size}`;
    const worldDirectory = join(out, name);
    if (await exists(join(worldDirectory, "level.dat"))) return worldDirectory;

    await rm(worldDirectory, { recursive: true, force: true });
    await mkdir(out, { recursive: true });

    log(`[oracle] generating the fixture world (seed ${seed}, ${size}x${size} blocks)`);
    const result = await run(
        process.execPath,
        [cli, "--seed", String(seed), "--size", String(size), "--out", out, "--name", name, "--no-zip"],
        { capture: true },
    );
    if (result.code !== 0) throw new Error(`the world generator exited ${result.code}`);
    return worldDirectory;
}

/** HOCON string escaping. Windows paths are full of backslashes. */
function quote(value) {
    return '"' + value.split("\\").join("\\\\").split('"').join('\\"') + '"';
}

/**
 * Writes the BlueMap CLI configuration directory.
 *
 * Every path written here is **absolute**. The CLI resolves its data directory and its
 * storage root against the process working directory rather than against the config
 * folder, so a relative path puts the tiles somewhere other than where the harness then
 * looks for them — which reads as "the render produced nothing".
 *
 * @returns {Promise<{configDirectory: string, mapDirectory: string, configText: string}>}
 */
export async function writeReferenceConfig({
    configDirectory,
    dataDirectory,
    storageRoot,
    webRoot,
    worldDirectory,
    mapId,
    mapName,
    dimension,
    acceptDownload,
    renderThreadCount,
}) {
    configDirectory = resolve(configDirectory);
    dataDirectory = resolve(dataDirectory);
    storageRoot = resolve(storageRoot);
    webRoot = resolve(webRoot);
    worldDirectory = resolve(worldDirectory);

    await mkdir(join(configDirectory, "maps"), { recursive: true });
    await mkdir(join(configDirectory, "storages"), { recursive: true });
    await mkdir(dataDirectory, { recursive: true });
    await mkdir(storageRoot, { recursive: true });
    await mkdir(webRoot, { recursive: true });

    const core = [
        "# Written by tools/oracle. accept-download permits BlueMap to fetch the Minecraft",
        "# client jar from Mojang, which it needs for block models and textures.",
        "accept-download: " + (acceptDownload ? "true" : "false"),
        "data: " + quote(dataDirectory),
        "render-thread-count: " + renderThreadCount,
        "update-cooldown: 60",
        "full-update-interval: 0",
        "scan-for-mod-resources: true",
        "metrics: false",
        "log: { append: false }",
        "",
    ].join("\n");

    const storage = ["storage-type: file", "root: " + quote(storageRoot), "compression: gzip", ""].join(
        "\n",
    );

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
        'storage: "file"',
        "ignore-missing-light-data: false",
        "marker-sets: {}",
        "",
    ].join("\n");

    const files = [
        [join(configDirectory, "core.conf"), core],
        [join(configDirectory, "webapp.conf"), webapp],
        [join(configDirectory, "webserver.conf"), webserver],
        [join(configDirectory, "storages", "file.conf"), storage],
        [join(configDirectory, "maps", mapId + ".conf"), map],
    ];
    for (const [path, contents] of files) await writeFile(path, contents, "utf8");

    return {
        configDirectory,
        mapDirectory: join(storageRoot, mapId),
        configText: files.map(([path, contents]) => path + "\n" + contents).join("\n"),
    };
}

/**
 * Renders the world with the Java CLI, or reuses a cached reference render.
 *
 * @param {object} options
 * @param {string} [options.minecraftVersion] — pins the Minecraft version the CLI's `-v`
 *   / `--mc-version` flag resolves resources against (upstream:
 *   `BlueMapCLI.java` `-v`, which flows into `BlueMapConfigManager` and from there into
 *   `MinecraftVersion.load` exactly like the TypeScript port's own `MinecraftVersion.load`
 *   id parameter). Omitted, upstream defaults to "the latest compatible version" — which is
 *   fine for the Phase D render gate (both engines just need to agree on *a* jar) but wrong
 *   for a parity check that has to name the version it tested, so callers that care pass
 *   this explicitly. Folded into the cache stamp so a run with a pinned version never
 *   silently reuses a reference rendered against a different one, and vice versa.
 * @returns {Promise<{mapDirectory: string, dataDirectory: string, cached: boolean, jar: string,
 *                    tileCount: number}>}
 */
export async function renderReference({
    repoRoot,
    jar,
    worldDirectory,
    workDirectory,
    mapId,
    mapName,
    dimension,
    acceptDownload,
    renderThreadCount,
    refresh,
    minecraftVersion,
}) {
    const dataDirectory = join(workDirectory, "bluemap-data");
    const referenceRoot = join(workDirectory, "reference");
    const configDirectory = join(referenceRoot, "config");
    const storageRoot = join(referenceRoot, "web", "maps");
    const webRoot = join(referenceRoot, "web");

    const written = await writeReferenceConfig({
        configDirectory,
        dataDirectory,
        storageRoot,
        webRoot,
        worldDirectory,
        mapId,
        mapName,
        dimension,
        acceptDownload,
        renderThreadCount,
    });

    const stampFile = join(referenceRoot, "reference.json");
    const stamp = {
        jar: jar.split(/[\\/]/).pop(),
        world: worldDirectory,
        configHash: sha256(written.configText),
        minecraftVersion: minecraftVersion ?? null,
    };

    if (!refresh && (await exists(stampFile))) {
        try {
            const previous = JSON.parse(await readFile(stampFile, "utf8"));
            if (
                previous.jar === stamp.jar &&
                previous.world === stamp.world &&
                previous.configHash === stamp.configHash &&
                (previous.minecraftVersion ?? null) === stamp.minecraftVersion &&
                (await isDirectory(written.mapDirectory))
            ) {
                const tiles = (await listFiles(written.mapDirectory)).length;
                log(`[oracle] reusing the cached reference render (${tiles} files)`);
                return {
                    mapDirectory: written.mapDirectory,
                    dataDirectory,
                    cached: true,
                    jar,
                    tileCount: tiles,
                };
            }
        } catch {
            // a corrupt stamp means re-render, which is the safe direction
        }
    }

    await rm(join(referenceRoot, "web"), { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });

    log(
        `[oracle] rendering the reference with upstream's java engine` +
            (minecraftVersion ? ` (pinned to Minecraft ${minecraftVersion})` : "") +
            ` — this takes a while`,
    );
    // The CLI resolves storage roots against the WORKING DIRECTORY. Every path in the
    // config is absolute, and the cwd is pinned here as well, so it cannot matter.
    const versionArgs = minecraftVersion ? ["-v", minecraftVersion] : [];
    const result = await run(
        "java",
        ["-jar", jar, "-c", written.configDirectory, "-r", "-g", ...versionArgs],
        { cwd: referenceRoot },
    );
    if (result.code !== 0) throw new Error(`the java reference render exited ${result.code}`);

    if (!(await isDirectory(written.mapDirectory)))
        throw new Error(
            `the java render produced no map directory at ${written.mapDirectory} — ` +
                `check that the CLI's working directory and storage root agree`,
        );

    await writeFile(stampFile, JSON.stringify(stamp, null, 2) + "\n", "utf8");

    const tiles = (await listFiles(written.mapDirectory)).length;
    log(`[oracle] reference render finished: ${tiles} files under ${written.mapDirectory}`);
    return {
        mapDirectory: written.mapDirectory,
        dataDirectory,
        cached: false,
        jar,
        tileCount: tiles,
    };
}

/**
 * Finds the Minecraft client jar the reference render downloaded, so the TypeScript
 * engine can load exactly the same resources rather than downloading a second copy.
 *
 * @param {string} dataDirectory
 * @returns {Promise<string|null>}
 */
export async function findClientJar(dataDirectory) {
    const found = await listFiles(dataDirectory);
    const candidates = found
        .filter((name) => /(^|\/)minecraft-client-[^/]*\.jar$/.test(name))
        .sort();
    const last = candidates[candidates.length - 1];
    return last === undefined ? null : join(dataDirectory, last.split("/").join("/"));
}

/**
 * Finds `resourceExtensions.zip` — BlueMap's own bundled resource-pack, which the java
 * render unpacks into its data directory on the way past
 * (`BlueMapService#getPackRoots`, common/.../BlueMapService.java:350-366).
 *
 * Taken from the reference render's data directory for the same reason the client jar is:
 * the point of the gate is that both engines load *the same* resources, and a second copy
 * extracted separately is a second thing that can drift.
 *
 * @param {string} dataDirectory
 * @returns {Promise<string|null>}
 */
export async function findResourceExtensions(dataDirectory) {
    const found = await listFiles(dataDirectory);
    const match = found.find((name) => /(^|\/)resourceExtensions\.zip$/.test(name));
    return match === undefined ? null : join(dataDirectory, match.split("/").join("/"));
}
