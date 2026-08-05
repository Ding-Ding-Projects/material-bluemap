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
 * ## The modded half, closed offline
 *
 * Issue #31 also asks for a modded pack, and for a long time this script only accepted
 * `--modded <path>` without actually wiring it anywhere — see git history for that
 * honestly-reported gap. Nothing here *fetches* a real modded pack even now: this task's
 * network use is still limited to Mojang's own version-manifest and jar CDN, and no
 * legitimate modded resource pack is committed to this repository (a search of the tree
 * turned up none — see the issue-#31 comment thread). What changed is that the modded half
 * no longer needs a real pack to be genuinely exercised: `--synthetic-modded` builds
 * `fixtures/syntheticModPack.mjs`'s offline, fully-synthetic pack — a new `testmod:`
 * namespace plus a vanilla texture override — and mounts it as an extra, higher-priority
 * resource-pack root on **both** engines, the same way a real modded pack's `--modded <path>`
 * would be. `--modded <path>` still exists for the day a legitimate pack becomes available;
 * the two are mutually exclusive so a run is never ambiguous about which pack it graded.
 *
 * ## What is reused, and what is new
 *
 * The Java half is `lib/javaOracle.mjs`'s `renderReference` (same function `compare.mjs`
 * uses), given a `minecraftVersion` to pin and, now, an `extraPackDirectory` to mount into
 * the CLI's own `packs/` folder (`writeReferenceConfig`'s doc comment names the exact
 * upstream mechanism). The TypeScript half is `lib/tsEngine.mjs`'s
 * `renderWithTypeScriptEngine`, which now threads a `resourcePack` option through to
 * `render-ts.mjs --resource-pack` — that flag already existed and was already correctly
 * prioritized above `resourceExtensions.zip` and the client jar; only the caller was missing.
 * Both are pointed at a **dedicated work directory** (`out/textures-parity/` by default),
 * never `out/gate/`, so this never invalidates or is invalidated by the Phase D render
 * gate's own cache, which is deliberately pinned to "the latest compatible version" rather
 * than a named one.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { diffTextures } from "./lib/textures.mjs";
import { describeError } from "./lib/diff.mjs";
import { decodePng } from "./lib/png.mjs";
import {
    buildCliJar,
    findClientJar,
    findResourceExtensions,
    findCliJar,
    generateWorld,
    renderReference,
} from "./lib/javaOracle.mjs";
import { renderWithTypeScriptEngine } from "./lib/tsEngine.mjs";
import { buildSyntheticModPack } from "./fixtures/syntheticModPack.mjs";
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
  --synthetic-modded      builds and mounts the offline synthetic mod pack
                          (fixtures/syntheticModPack.mjs) instead of a real one — the
                          same wiring as --modded, closing issue #31's modded half without
                          any network access beyond the vanilla jar; mutually exclusive
                          with --modded
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
        syntheticModded: false,
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
            case "--synthetic-modded":
                options.syntheticModded = true;
                break;
            case "--accept-download":
                options.acceptDownload = true;
                break;
            default:
                throw new Error(`unknown argument '${arg}'`);
        }
    }
    if (options.modded !== null && options.syntheticModded)
        throw new Error("--modded and --synthetic-modded are mutually exclusive");
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
    };

    await mkdir(options.work, { recursive: true });

    // 0. the modded pack, real or synthetic — resolved before either engine renders, since
    // both need the same directory mounted at the same priority.
    let moddedPackDirectory = null;
    if (options.modded !== null) {
        moddedPackDirectory = options.modded;
        report.modded = { kind: "real", requested: options.modded, exercised: true };
    } else if (options.syntheticModded) {
        const built = await buildSyntheticModPack(join(options.work, "synthetic-mod-pack"));
        moddedPackDirectory = built.directory;
        report.modded = {
            kind: "synthetic",
            directory: built.directory,
            textureKeys: built.textureKeys,
            blockKeys: built.blockKeys,
            textures: built.textures,
            exercised: true,
        };
        log(
            `[textures-parity] built the offline synthetic mod pack at ${built.directory} ` +
                `(${built.blockKeys.length} new block(s), ${built.textureKeys.length} texture key(s))`,
        );
    } else {
        report.modded = {
            kind: "none",
            requested: null,
            exercised: false,
            reason:
                "no --modded pack and no --synthetic-modded: this task's network use is " +
                "limited to Mojang's own manifest/jar CDN, no real modded resource pack is " +
                "committed to this repository, and this run was not asked to build the " +
                "offline synthetic one",
        };
    }

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
            extraPackDirectory: moddedPackDirectory,
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

    if (moddedPackDirectory !== null)
        log(`[textures-parity] mounting the modded pack on both sides: ${moddedPackDirectory}`);

    // 4. the ported render, against the SAME jar, resourceExtensions and modded pack
    const ported = await renderWithTypeScriptEngine({
        repoRoot: REPO_ROOT,
        worldDirectory,
        workDirectory: options.work,
        mapId: "overworld",
        mapName: "Overworld",
        dimension: "minecraft:overworld",
        clientJar,
        resourceExtensions,
        resourcePack: moddedPackDirectory,
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

    // If a modded pack was mounted, prove it was genuinely loaded rather than merely
    // present on disk. Two checks, from weaker to stronger:
    //
    //   - every texture key it contributes must show up on BOTH sides at all (a mount that
    //     silently failed would otherwise still pass the divergence check above - two
    //     textures.json files that agree on containing nothing new agree "semantically" too).
    //   - for the synthetic pack specifically, where the *expected* pixel is known, the
    //     entry's own embedded image is decoded and its top-left pixel checked against that
    //     value. This is what actually distinguishes "the override mounted" from "the key
    //     happens to exist" for `minecraft:block/stone`: that key is real and already present
    //     in a plain vanilla render, so presence alone proves nothing about whether this
    //     pack's higher-priority copy actually won.
    if (report.modded?.exercised === true && Array.isArray(report.modded.textureKeys)) {
        const missing = { java: [], ts: [] };
        const pixelMismatch = [];
        const hasExpectedPixels = Array.isArray(report.modded.textures);

        for (const key of report.modded.textureKeys) {
            const inJava = referenceText.includes(`"${key}"`);
            const inTs = portedText.includes(`"${key}"`);
            if (!inJava) missing.java.push(key);
            if (!inTs) missing.ts.push(key);
            if (!inJava || !inTs) continue;
            if (!hasExpectedPixels) continue;

            const expected = report.modded.textures.find((t) => t.key === key)?.pixel;
            if (expected === undefined) continue;
            const javaPixel = decodeGalleryEntryPixel(referenceText, key);
            const tsPixel = decodeGalleryEntryPixel(portedText, key);
            const javaOk = javaPixel !== null && pixelEquals(javaPixel, expected);
            const tsOk = tsPixel !== null && pixelEquals(tsPixel, expected);
            if (!javaOk || !tsOk) {
                pixelMismatch.push({ key, expected, java: javaPixel, ts: tsPixel });
            }
        }
        report.modded.missingFromJava = missing.java;
        report.modded.missingFromTs = missing.ts;
        report.modded.pixelMismatch = pixelMismatch;
        if (missing.java.length > 0 || missing.ts.length > 0 || pixelMismatch.length > 0) {
            report.ok = false;
            report.modded.mounted = false;
        } else {
            report.modded.mounted = true;
        }
    }

    log("");
    log(`  minecraft version:  ${options.version}`);
    log(`  client jar:          ${clientJar}`);
    log(`  java textures.json:  ${referenceCount} entr(ies)`);
    log(`  ts   textures.json:  ${portedCount} entr(ies)`);
    if (report.modded?.exercised === true) {
        log(
            `  modded pack:         ${report.modded.kind} (${report.modded.directory ?? report.modded.requested})`,
        );
        if (report.modded.mounted === true) {
            log(
                `                       all ${report.modded.textureKeys.length} of its texture ` +
                    "key(s) present on both sides, and every one whose expected pixel is " +
                    "known decoded to exactly that colour on both engines (new namespace + " +
                    "vanilla override alike)",
            );
        } else if (report.modded.mounted === false) {
            log("  RESULT: DIVERGED — the modded pack did not actually mount");
            if (report.modded.missingFromJava.length > 0)
                log(`    missing from java textures.json: ${report.modded.missingFromJava.join(", ")}`);
            if (report.modded.missingFromTs.length > 0)
                log(`    missing from ts   textures.json: ${report.modded.missingFromTs.join(", ")}`);
            for (const mismatch of report.modded.pixelMismatch) {
                log(
                    `    ${mismatch.key}: expected rgba(${mismatch.expected.join(",")}) - ` +
                        `java decoded rgba(${(mismatch.java ?? []).join(",")}), ` +
                        `ts decoded rgba(${(mismatch.ts ?? []).join(",")})`,
                );
            }
        }
    } else {
        log(`  modded pack:         not exercised (${report.modded.reason})`);
    }
    log("");

    // The modded-mount check above already printed its own "RESULT: DIVERGED" line when it
    // failed; the textures.json divergence itself is still worth reporting underneath it
    // either way, since the two checks answer different questions (did the pack mount, and
    // do the two textures.json files otherwise agree).
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

/**
 * Decodes one gallery entry's embedded texture and returns its top-left pixel as
 * `[r, g, b, a]`, or `null` when the entry is missing or its image will not decode. Every
 * texture this harness's fixtures ever paint is a flat solid colour, so one pixel is a
 * complete answer, not a sample.
 */
function decodeGalleryEntryPixel(text, key) {
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;
    const entry = parsed.find((candidate) => candidate?.resourcePath === key);
    if (entry === undefined || typeof entry.texture !== "string") return null;
    const base64 = entry.texture.includes(",") ? entry.texture.split(",").pop() : entry.texture;
    try {
        const decoded = decodePng(Buffer.from(base64, "base64"));
        return [decoded.pixels[0], decoded.pixels[1], decoded.pixels[2], decoded.pixels[3]];
    } catch {
        return null;
    }
}

function pixelEquals(a, b) {
    return a.length === b.length && a.every((value, index) => value === b[index]);
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
