#!/usr/bin/env node
/**
 * `tools/oracle/textures-parity.mjs` — Phase C exit criterion #1 (GitHub issue #31):
 * is this project's `textures.json` **semantically equal** to upstream's Java engine's,
 * for the same real Minecraft client jar?
 *
 * ```
 * node tools/oracle/textures-parity.mjs --accept-download
 * ```
 *
 * ## Why a whole world is not needed
 *
 * `textures.json` looks like a render artefact, but it is not one. Upstream writes it in
 * `BmMap`'s **constructor**, before a single tile is rendered:
 *
 *     this.textureGallery = loadTextureGallery();
 *     this.textureGallery.put(resourcePack.getTextures());
 *     saveTextureGallery();
 *
 * (`vendor/BlueMap/core/.../map/BmMap.java:106-108`) — `resourcePack.getTextures()` is the
 * pool `ResourcePack#loadResources` already filled by walking every loaded model and
 * collecting the texture-keys they reference (upstream's "texture filter" phase), which
 * happens once per resource-pack load and does not depend on which blocks a particular
 * world contains. The TypeScript port's `BmMap.create` mirrors this — see
 * `packages/engine/src/map/BmMap.ts`. So the *contents* of the world this script generates
 * are irrelevant to the check; only the resource pack matters, and a tiny world is enough
 * to get a `BmMap` constructed with both engines.
 *
 * ## What "semantically equal" means here
 *
 * This calls the exact same comparator `tools/oracle/compare.mjs` uses for the full
 * render gate — `tools/oracle/lib/textures.mjs`'s `diffTextures` — rather than a new one,
 * so there is only one definition of "the same textures.json" in this repository:
 *
 *   - **every field except the embedded image, and the entry order, are compared
 *     EXACTLY.** The gallery's index is what every hires tile's material-group refers to
 *     (an ordinal, not a name), so a reordering would silently repaint the world even
 *     though every entry is individually correct — that is the load-bearing equality, and
 *     it is never softened.
 *   - **the embedded PNG is compared on DECODED PIXELS**, not bytes. Java's `ImageIO` and
 *     this project's `pngjs` write correct-but-different bytes for the same image (see
 *     `design/docs/deviations.md` and `design/HANDOFF.md` — a small-palette texture comes
 *     out as an indexed PNG at 1/2/4 bits per pixel from ImageIO and 8-bit RGBA truecolour
 *     from pngjs; both decode to the same pixels and nothing downstream can tell them
 *     apart). A byte-only check would fail a render that is exactly right.
 *
 * A missing or extra entry, a reordering, a wrong id, or one differing pixel is a real
 * divergence and is reported as one — see `lib/textures.mjs`'s doc comment for the full
 * account of what is and is not softened.
 *
 * ## Only vanilla, honestly
 *
 * Issue #31 also asks for a modded pack. This script accepts `--modded <path>` for that
 * (a directory or `.zip` resource pack, mounted as an extra, higher-priority root on both
 * sides), but nothing here *fetches* one: this task's network use is limited to Mojang's
 * own version-manifest and jar CDN, and there is no modded pack committed to this
 * repository to point `--modded` at either (a search of the tree turned up none — see the
 * issue-#31 comment thread for the search). Run without `--modded` and the report says so
 * plainly rather than silently only covering half of what was asked.
 *
 * ## What is reused, and what is new
 *
 * The Java half is `lib/javaOracle.mjs`'s `renderReference` (same function `compare.mjs`
 * uses), given a `minecraftVersion` to pin — that function gained the parameter for this
 * script rather than duplicating the config-writing and caching logic here. The TypeScript
 * half is `lib/tsEngine.mjs`'s `renderWithTypeScriptEngine`, unchanged. Both are pointed at
 * a **dedicated work directory** (`out/textures-parity/` by default), never `out/gate/`,
 * so this never invalidates or is invalidated by the Phase D render gate's own cache, which
 * is deliberately pinned to "the latest compatible version" rather than a named one.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { diffTextures } from "./lib/textures.mjs";
import { describeError } from "./lib/diff.mjs";
import {
    buildCliJar,
    findClientJar,
    findResourceExtensions,
    findCliJar,
    generateWorld,
    renderReference,
} from "./lib/javaOracle.mjs";
import { renderWithTypeScriptEngine } from "./lib/tsEngine.mjs";
import { exists, formatDuration, log } from "./lib/util.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");

const USAGE = `tools/oracle/textures-parity.mjs — Phase C exit criterion #1

Renders the same real Minecraft client jar with upstream's Java engine and with this
project's TypeScript engine, on a minimal world, and compares their textures.json
semantically (fields and order exactly, embedded PNGs on decoded pixels).

Usage:
  node tools/oracle/textures-parity.mjs --accept-download [options]

Options:
  --version <id>        Minecraft version to pin (default "1.21")
  --seed <n>             world seed (default 1)
  --size <blocks>        edge length of the generated square (default 32 — the world's
                          content does not affect textures.json, see this file's header)
  --work <dir>           working directory (default "tools/oracle/out/textures-parity")
  --threads <n>           java render threads (default 2)
  --json <path>          also write the full report as json
  --refresh               re-render the java reference even if it is cached
  --build-jar             build the reference jar if it is missing
  --modded <path>         an extra resource-pack root (dir or .zip) mounted on both sides;
                          nothing here downloads one, see this file's header
  --accept-download       required: permits BlueMap to download the pinned Minecraft
                          client jar from Mojang (accepts Mojang's EULA on the repository
                          owner's behalf, exactly like the app's own consent flag)
  --help                  this text

Exit codes:
  0  textures.json agrees semantically (allowing PNG re-encodes)
  1  a real divergence was found
  2  the harness could not run (no jar, no world generator, a failed render)
`;

function parseArgs(argv) {
    const options = {
        version: "1.21",
        seed: 1,
        size: 32,
        work: join(REPO_ROOT, "tools", "oracle", "out", "textures-parity"),
        threads: 2,
        json: null,
        refresh: false,
        buildJar: false,
        modded: null,
        acceptDownload: false,
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
            case "--version":
                options.version = next();
                break;
            case "--seed":
                options.seed = Number(next());
                break;
            case "--size":
                options.size = Number(next());
                break;
            case "--work":
                options.work = resolve(next());
                break;
            case "--threads":
                options.threads = Number(next());
                break;
            case "--json":
                options.json = resolve(next());
                break;
            case "--refresh":
                options.refresh = true;
                break;
            case "--build-jar":
                options.buildJar = true;
                break;
            case "--modded":
                options.modded = resolve(next());
                break;
            case "--accept-download":
                options.acceptDownload = true;
                break;
            default:
                throw new Error(`unknown argument '${arg}'`);
        }
    }
    return options;
}

/** reads textures.json or textures.json.gz from a rendered map directory, as text */
async function readTexturesJson(mapDirectory) {
    const gz = join(mapDirectory, "textures.json.gz");
    const plain = join(mapDirectory, "textures.json");
    if (await exists(gz)) return gunzipSync(await readFile(gz)).toString("utf8");
    if (await exists(plain)) return (await readFile(plain, "utf8")).toString();
    throw new Error(`neither textures.json nor textures.json.gz exists under ${mapDirectory}`);
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
    if (!options.acceptDownload) {
        process.stderr.write(
            "refusing to run: this check downloads the real Minecraft " +
                `${options.version} client jar from Mojang, which needs explicit consent.\n` +
                "Pass --accept-download to indicate you accept Mojang's EULA " +
                "(https://www.minecraft.net/eula), own a Minecraft (Java Edition) licence, " +
                "and agree to this downloading and using a Minecraft client file from " +
                "Mojang's servers — the same consent the app's own accept-download flag " +
                "records.\n\n" + USAGE,
        );
        return 2;
    }

    const startedAt = Date.now();
    const report = {
        startedAt: new Date(startedAt).toISOString(),
        options: { ...options },
        version: options.version,
        modded: options.modded !== null
            ? { requested: options.modded, exercised: false }
            : { requested: null, exercised: false, reason:
                "no --modded pack was given: this task's network use is limited to " +
                "Mojang's own manifest/jar CDN, and no modded resource pack is committed " +
                "to this repository to point at instead" },
    };

    await mkdir(options.work, { recursive: true });

    // 1. the reference jar
    let jar = await findCliJar(REPO_ROOT);
    if (jar === null && options.buildJar) {
        await buildCliJar(REPO_ROOT);
        jar = await findCliJar(REPO_ROOT);
    }
    if (jar === null) {
        log(
            "[textures-parity] no reference jar found under " +
                "vendor/BlueMap/implementations/cli/build/libs.\n" +
                "                  build it with `node tools/build-jars.mjs --only cli`, " +
                "or re-run with --build-jar.",
        );
        return 2;
    }
    report.javaJar = jar;

    // 2. a minimal world — see this file's header for why size does not matter here
    let worldDirectory;
    try {
        worldDirectory = await generateWorld({
            repoRoot: REPO_ROOT,
            seed: options.seed,
            size: options.size,
            out: join(options.work, "worlds"),
        });
    } catch (error) {
        log(`[textures-parity] ${describeError(error)}`);
        return 2;
    }
    report.world = worldDirectory;

    // 3. the java reference, pinned to the requested version
    let reference;
    try {
        reference = await renderReference({
            repoRoot: REPO_ROOT,
            jar,
            worldDirectory,
            workDirectory: options.work,
            mapId: "overworld",
            mapName: "Overworld",
            dimension: "minecraft:overworld",
            acceptDownload: true,
            renderThreadCount: options.threads,
            refresh: options.refresh,
            minecraftVersion: options.version,
        });
    } catch (error) {
        log(`[textures-parity] the java reference render failed: ${describeError(error)}`);
        return 2;
    }
    report.reference = { mapDirectory: reference.mapDirectory, cached: reference.cached };

    const clientJar = await findClientJar(reference.dataDirectory);
    report.clientJar = clientJar;
    if (clientJar === null) {
        log(
            "[textures-parity] no minecraft client jar found in the reference data " +
                "directory; the typescript render will have no resources to work from",
        );
        return 2;
    }

    const resourceExtensions = await findResourceExtensions(reference.dataDirectory);
    report.resourceExtensions = resourceExtensions;
    if (resourceExtensions === null)
        log(
            "[textures-parity] no resourceExtensions.zip in the reference data directory; " +
                "the typescript gallery will be missing the textures only it contributes",
        );

    if (options.modded !== null) {
        // Not exercised (see the doc comment and report.modded above), but if a legitimate
        // pack ever is available, both engines need to see it. Upstream mounts extra packs
        // ahead of the vanilla jar (BlueMapService#getPackRoots); the java side takes that
        // from --config packs/ (not implemented by this script yet — an extra pack needs a
        // packs-folder entry, not a CLI flag), so this stays a named gap rather than a
        // silent one.
        log(
            "[textures-parity] --modded was given but this script does not yet wire an " +
                "extra pack into the java side's packs/ folder; only vanilla is compared " +
                "this run.",
        );
    }

    // 4. the ported render, against the SAME jar and resourceExtensions
    const ported = await renderWithTypeScriptEngine({
        repoRoot: REPO_ROOT,
        worldDirectory,
        workDirectory: options.work,
        mapId: "overworld",
        mapName: "Overworld",
        dimension: "minecraft:overworld",
        clientJar,
        resourceExtensions,
    });
    report.ported = ported;

    if (ported.status !== "rendered") {
        log("");
        log("  RESULT: the TypeScript engine produced no output.");
        log(`  ${ported.reason ?? "no reason reported"}`);
        report.ok = false;
        await writeReport(report, options, 2, startedAt);
        return 2;
    }

    // 5. the comparison
    let referenceText;
    let portedText;
    try {
        referenceText = await readTexturesJson(reference.mapDirectory);
        portedText = await readTexturesJson(ported.mapDirectory);
    } catch (error) {
        log(`[textures-parity] ${describeError(error)}`);
        report.ok = false;
        await writeReport(report, options, 2, startedAt);
        return 2;
    }

    const referenceCount = safeCount(referenceText);
    const portedCount = safeCount(portedText);
    report.referenceEntryCount = referenceCount;
    report.portedEntryCount = portedCount;

    const divergence = diffTextures(referenceText, portedText);
    report.divergence = divergence;
    report.ok = divergence === null || divergence.kind === "textures-reencode";

    log("");
    log(`  minecraft version:  ${options.version}`);
    log(`  client jar:          ${clientJar}`);
    log(`  java textures.json:  ${referenceCount} entr(ies)`);
    log(`  ts   textures.json:  ${portedCount} entr(ies)`);
    log("");

    if (divergence === null) {
        log("  RESULT: textures.json is semantically identical — every field, every entry, " +
            "the entry order, and every decoded pixel agree.");
    } else if (divergence.kind === "textures-reencode") {
        log(`  RESULT: semantically identical. ${divergence.message}`);
        for (const line of divergence.detail) log(`    ${line}`);
    } else {
        log(`  RESULT: DIVERGED — ${divergence.kind}`);
        log(`    ${divergence.message}`);
        for (const line of divergence.detail) log(`    ${line}`);
    }
    log(`  (${formatDuration(Date.now() - startedAt)})`);
    log("");

    await writeReport(report, options, report.ok ? 0 : 1, startedAt);
    return report.ok ? 0 : 1;
}

function safeCount(text) {
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.length : null;
    } catch {
        return null;
    }
}

async function writeReport(report, options, exitCode, startedAt) {
    report.durationMs = Date.now() - startedAt;
    report.exitCode = exitCode;
    if (options.json === null) return;
    await mkdir(dirname(options.json), { recursive: true });
    await writeFile(options.json, JSON.stringify(report, null, 2) + "\n", "utf8");
    log(`[textures-parity] report written to ${options.json}`);
}

process.exitCode = await main();
