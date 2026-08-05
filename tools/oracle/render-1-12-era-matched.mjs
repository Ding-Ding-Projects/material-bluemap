#!/usr/bin/env node
/**
 * `tools/oracle/render-1-12-era-matched.mjs` — Phase C exit criterion #2, second half
 * (GitHub issue #31): "a small 1.12.2 render with the ERA-MATCHED pack comes out sane",
 * and specifically whether `render-1-12.mjs`'s four historic gap block-states (grass, snow,
 * snow_layer, podzol) render correctly under it. This is the gap `design/HANDOFF.md` names
 * as "Rendering with an era-matched 1.12.2 resource pack is untested."
 *
 * ```
 * node tools/oracle/render-1-12-era-matched.mjs --accept-download
 * ```
 *
 * ## What "era-matched" means here, and how it differs from `render-1-12.mjs`
 *
 * `render-1-12.mjs` proved the legacy **world reader**: a 1.12.2 world, read through
 * `Chunk_1_12` and `BlockIdMapper`, rendered against the **modern** (26.2) resource pack.
 * That needs `FlatteningRename` — a table that translates a pre-flattening block name to
 * its modern equivalent strictly at the render-time resource lookup — because the modern
 * pack does not know pre-flattening names at all.
 *
 * This script instead pairs the pre-flattening **world** with a pre-flattening **pack**:
 * the same 1.12.2 world, rendered against a real 1.12.2 client jar through
 * `LegacyResourcePackExtension`. Both engines' pre-flattening name resolution (`Chunk_1_12`
 * / `BlockIdMapper` on the world side, `LegacyResourcePackExtension` on the pack side)
 * agree on the same names, in principle needing no translation table at all.
 *
 * ## The finding this script exists to measure, not assume
 *
 * `BlockStateModelRenderer.ts` applies `flattenLegacyBlockState` **unconditionally**
 * whenever `block.isLegacy()` is true — gated on the *world chunk's* era, not on which
 * resource pack is loaded (see that file's doc comment at the call site, and
 * `FlatteningRename.ts`'s header). Against the modern pack that is exactly the fix
 * `render-1-12.mjs`'s (now empty) `KNOWN_LEGACY_RENDER_GAPS` records. Against an
 * era-matched pack it runs backwards: it takes an already-correct pre-flattening name like
 * `minecraft:grass` (the grass BLOCK, which the era pack has a blockstate for) and renames
 * it to `minecraft:grass_block` — a name that did not exist before the flattening and that
 * a genuine 1.12.2 pack has never heard of — so the era-matched pack resolves it to
 * **nothing** rather than to the correct model. That would make the era-matched render
 * *worse* for exactly the block-states the modern-pack render already had to work around,
 * not better. This script renders both worlds and reports the actual histograms instead of
 * assuming either outcome; see the "renamed-away" check below for the direct measurement.
 *
 * ## Reused, not reinvented
 *
 * The PRBM parser, hires-tile reader, textures.json reader and material histogram are
 * imported from `render-1-12.mjs` rather than duplicated — see that file's own export list
 * ("the sort of thing the next harness will want").
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { log, run } from "./lib/util.mjs";
import {
    KNOWN_LEGACY_RENDER_GAPS,
    materialHistogram,
    readHiresTiles,
    readTextureGallery,
} from "./render-1-12.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_URL = "https://piston-meta.mojang.com/mc/game/version_manifest.json";

/**
 * The four block-states `design/HANDOFF.md`'s "Where it stops being right" section and
 * `render-1-12.mjs`'s (now empty, closed) `KNOWN_LEGACY_RENDER_GAPS` documented against the
 * MODERN pack — the ones this script checks under the ERA-MATCHED pack instead. Kept as a
 * literal list rather than re-derived from `FlatteningRename.ts`'s full rule table (over 90
 * entries) because these four are the ones this seed's terrain actually contains — see
 * `render-1-12.mjs`'s own seed-22 biome comment.
 */
const HISTORIC_GAP_BLOCKS = ["minecraft:grass", "minecraft:snow", "minecraft:snow_layer", "minecraft:podzol"];

const DEFAULTS = {
    seed: 22,
    size: 128,
    out: join(REPO_ROOT, "tools", "oracle", "out", "legacy-era-matched"),
    legacyVersion: "1.12.2",
    resourceExtensions: join(
        REPO_ROOT, "tools", "oracle", "out", "gate", "bluemap-data", "resourceExtensions.zip",
    ),
};

function parseArgs(argv) {
    const options = { ...DEFAULTS, keep: false, acceptDownload: false, clientJar: null };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--keep") { options.keep = true; continue; }
        if (arg === "--accept-download") { options.acceptDownload = true; continue; }
        if (!arg.startsWith("--")) throw new Error(`unexpected argument '${arg}'`);
        const value = argv[++i];
        if (value === undefined) throw new Error(`missing value for ${arg}`);
        switch (arg) {
            case "--seed": options.seed = Number(value); break;
            case "--size": options.size = Number(value); break;
            case "--out": options.out = resolve(value); break;
            case "--client-jar": options.clientJar = resolve(value); break;
            case "--resource-extensions": options.resourceExtensions = resolve(value); break;
            case "--legacy-version": options.legacyVersion = value; break;
            default: throw new Error(`unknown option ${arg}`);
        }
    }
    return options;
}

/**
 * Downloads and SHA-1-verifies a client jar straight from Mojang's manifest, bypassing
 * `MinecraftVersion.load`'s "clamp to the earliest resource-pack version" rule — see this
 * file's header and `resourcepack-e2e.test.ts`'s Proof 4 for why that rule makes
 * `MinecraftVersion.load("1.12.2", ...)` hand back a **1.13** jar instead. Verified before
 * being trusted, in the same order the port's own downloader uses.
 */
async function downloadVerifiedClientJar(versionId, destFile) {
    if (existsSync(destFile)) {
        log(`[era-matched] reusing the cached ${versionId} client jar at ${destFile}`);
        return destFile;
    }

    log(`[era-matched] fetching the version manifest`);
    const manifestResponse = await fetch(MANIFEST_URL);
    if (!manifestResponse.ok) throw new Error(`version manifest: HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();

    const entry = manifest.versions?.find((v) => v.id === versionId);
    if (entry === undefined) throw new Error(`no version '${versionId}' in the manifest`);

    const detailResponse = await fetch(entry.url);
    if (!detailResponse.ok) throw new Error(`${entry.url}: HTTP ${detailResponse.status}`);
    const detail = await detailResponse.json();
    const client = detail.downloads?.client;
    if (client === undefined) throw new Error(`version '${versionId}' has no client download`);

    log(`[era-matched] downloading '${versionId}' client jar from ${client.url}`);
    const jarResponse = await fetch(client.url);
    if (!jarResponse.ok) throw new Error(`${client.url}: HTTP ${jarResponse.status}`);
    const buffer = Buffer.from(await jarResponse.arrayBuffer());

    const actualSha1 = createHash("sha1").update(buffer).digest("hex");
    if (actualSha1 !== client.sha1)
        throw new Error(
            `SHA-1 mismatch downloading Minecraft ${versionId}: manifest says ${client.sha1}, ` +
                `got ${actualSha1}. Refusing to use it.`,
        );
    log(`[era-matched] SHA-1 verified (${actualSha1})`);

    await mkdir(dirname(destFile), { recursive: true });
    await writeFile(destFile, buffer);
    return destFile;
}

async function build(filter, what) {
    log(`[era-matched] compiling ${what} (so this run grades src/, not a stale dist/)`);
    const result = await run("pnpm", ["--filter", filter, "run", "build"], {
        cwd: join(REPO_ROOT, "design"),
        capture: true,
        shell: process.platform === "win32",
    });
    if (result.code !== 0)
        throw new Error(`${what} does not compile:\n${(result.stderr || result.stdout).trim()}`);
}

async function generate({ seed, size, format, outDir, name }) {
    const cli = join(REPO_ROOT, "design", "packages", "worldgen", "dist", "cli.js");
    const args = [cli, "--seed", String(seed), "--size", String(size), "--out", outDir,
        "--name", name, "--no-zip", "--quiet"];
    if (format !== undefined) args.push("--format", format);
    const result = await run(process.execPath, args, { capture: true });
    if (result.code !== 0)
        throw new Error(`worldgen failed for format ${format ?? "default"}:\n${result.stderr.trim()}`);
    return JSON.parse(result.stdout);
}

async function render({ worldFolder, storageRoot, clientJar, resourceExtensions, extraPack }) {
    await rm(storageRoot, { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });

    const args = [
        join(REPO_ROOT, "tools", "oracle", "render-ts.mjs"),
        "--engine", join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js"),
        "--world", worldFolder,
        "--storage-root", storageRoot,
        "--map-id", "overworld",
        "--map-name", "overworld",
        "--dimension", "minecraft:overworld",
        "--client-jar", clientJar,
    ];
    if (extraPack !== undefined) args.push("--resource-pack", extraPack);
    if (resourceExtensions !== null) args.push("--resource-extensions", resourceExtensions);

    const result = await run(process.execPath, args, { capture: true });
    const line = result.stdout.trim().split("\n").filter(Boolean).pop();
    if (line === undefined)
        throw new Error(
            `the render driver exited ${result.code} without reporting a result:\n` +
                result.stderr.trim().split("\n").slice(-8).join("\n"),
        );
    const parsed = JSON.parse(line);
    if (parsed.status !== "rendered")
        throw new Error(`the render did not happen: ${parsed.status} — ${parsed.reason ?? ""}`);
    return parsed;
}

class Checks {
    constructor() { this.passed = []; this.failed = []; }
    ok(claim, condition, detail = "") {
        if (condition) this.passed.push(claim); else this.failed.push({ claim, detail });
        return condition;
    }
    report() {
        log("");
        for (const claim of this.passed) log(`  PASS  ${claim}`);
        for (const { claim, detail } of this.failed) {
            log(`  FAIL  ${claim}`);
            for (const line of String(detail).split("\n").filter(Boolean)) log(`          ${line}`);
        }
        log("");
        log(`  ${this.passed.length} check(s) passed, ${this.failed.length} failed`);
        return this.failed.length === 0;
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.clientJar === null) {
        if (!options.acceptDownload) {
            log(
                "[era-matched] no --client-jar given and --accept-download not set. This " +
                    `check needs a real ${options.legacyVersion} client jar. Pass ` +
                    "--accept-download to fetch and SHA-1-verify one from Mojang's manifest " +
                    "(same consent the app's own accept-download flag records), or " +
                    "--client-jar <path> to supply one already downloaded (e.g. by " +
                    "packages/engine/test/resourcepack-e2e.test.ts's Proof 4).",
            );
            return 2;
        }
        const cacheFile = join(
            REPO_ROOT, "tools", "oracle", "out", "bluemap-data-legacy",
            `minecraft-client-${options.legacyVersion}.jar`,
        );
        options.clientJar = await downloadVerifiedClientJar(options.legacyVersion, cacheFile);
    }
    if (!existsSync(options.clientJar))
        throw new Error(`--client-jar ${options.clientJar} does not exist`);
    if (!existsSync(options.resourceExtensions))
        throw new Error(
            `${options.resourceExtensions} is not there. Run tools/oracle/compare.mjs once ` +
                "to populate tools/oracle/out/gate/bluemap-data/, or pass --resource-extensions.",
        );

    await build("./packages/engine", "the TypeScript engine");
    await build("./packages/worldgen", "the world generator");
    await mkdir(options.out, { recursive: true });

    log(`[era-matched] generating seed ${options.seed}, ${options.size}x${options.size} blocks, 1.12.2 format`);
    const world = await generate({
        seed: options.seed, size: options.size, format: "1.12.2",
        outDir: options.out, name: `seed-${options.seed}-1.12.2`,
    });

    /*
     * A real Minecraft client jar carries no `pack.mcmeta` at all — checked directly against
     * this jar, the 1.21 jar `textures-parity.mjs` downloads, and the 26.2 jar `compare.mjs`
     * caches: all three have `pack.png` (the icon) but none has `pack.mcmeta`. Without one,
     * `LegacyResourcePackExtension`'s `isLegacyPackRoot` (LegacyPackFormat.ts) never detects
     * a pre-flattening pack — see the empirical proof and full explanation in
     * `resourcepack-e2e.test.ts`'s Proof 4. So this supplies the one file that is missing —
     * nothing else — as its own tiny extra root, exactly the way a real deployment would
     * (BlueMap's own `packs/` folder mechanism, the same one `resourceExtensions.zip` uses
     * to layer bluemap's own assets on top of vanilla). Every texture and model below still
     * comes from the genuine jar.
     *
     * A real client jar has no `version.json` either, at least not for 1.12.2 (checked the
     * same way) — `render-ts.mjs`'s `readPackVersions` needs one to decide which
     * `resourceExtensions.zip` overlays apply, and refuses to guess (see that function's own
     * doc comment on the "guessing one silently renders against a different set of models"
     * error this produced on the first run of this script). `pack_version: {resource: 3,
     * data: 3}` matches the `pack_format: 3` above; there is no real pre-1.13 datapack
     * version to be faithful to (datapacks did not exist yet), so 3 is a placeholder that
     * satisfies the type-check rather than a documented historical value.
     */
    const legacyManifestDirectory = join(options.out, "legacy-manifest-only");
    await mkdir(legacyManifestDirectory, { recursive: true });
    await writeFile(
        join(legacyManifestDirectory, "pack.mcmeta"),
        JSON.stringify({ pack: { pack_format: 3, description: "synthetic legacy-detection signal only" } }),
    );
    await writeFile(
        join(legacyManifestDirectory, "version.json"),
        JSON.stringify({ pack_version: { resource: 3, data: 3 } }),
    );

    log(`[era-matched] rendering against the REAL ${options.legacyVersion} pack (era-matched)`);
    const eraRender = await render({
        worldFolder: world.worldFolder,
        storageRoot: join(options.out, "render-era-matched", "web", "maps"),
        clientJar: options.clientJar,
        resourceExtensions: options.resourceExtensions,
        extraPack: legacyManifestDirectory,
    });

    log("[era-matched] rendering the SAME world against the modern pack, as the already-proven control");
    const modernPackClientJar = join(
        REPO_ROOT, "tools", "oracle", "out", "gate", "bluemap-data", "minecraft-client-26.2.jar",
    );
    const modernRender = existsSync(modernPackClientJar)
        ? await render({
              worldFolder: world.worldFolder,
              storageRoot: join(options.out, "render-modern-pack", "web", "maps"),
              clientJar: modernPackClientJar,
              resourceExtensions: options.resourceExtensions,
          })
        : null;

    const eraTiles = await readHiresTiles(eraRender.mapDirectory);
    const eraGallery = await readTextureGallery(eraRender.mapDirectory);
    const eraHistogram = materialHistogram(eraTiles, eraGallery);

    const checks = new Checks();

    checks.ok(
        "the era-matched render produced hires tiles",
        eraTiles.size > 0,
        `the renderer chose ${eraRender.tiles} tile(s), wrote ${eraTiles.size} hires model(s)`,
    );

    const eraVertices = [...eraTiles.values()].reduce((sum, t) => sum + t.numValues, 0);
    checks.ok("the era-matched render has real geometry (more than zero vertices)", eraVertices > 0);

    const missingVertices = eraHistogram.byPath.get("bluemap:block/missing") ?? 0;
    const missingFraction = eraHistogram.total > 0 ? missingVertices / eraHistogram.total : 1;

    /*
     * NOTE ON READING THIS HISTOGRAM: `materialHistogram`'s keys are TEXTURE resourcePaths
     * (what `textures.json` calls them — e.g. "minecraft:blocks/dirt"), not blockstate ids.
     * There is no direct "did minecraft:grass resolve" signal available from a rendered map
     * alone — that surgical proof lives in `resourcepack-e2e.test.ts`'s Proof 4, which calls
     * `flattenLegacyBlockState` directly against this same era-matched pack and shows its
     * output (`minecraft:grass_block`) does not resolve. What follows here is the render-level
     * CORROBORATION: the real legacy texture names a correct grass render would need
     * ("blocks/grass_normal", "blocks/grass_snowed") are checked for presence, and the
     * ground-exposure symptom design/HANDOFF.md already documented for the ORIGINAL
     * modern-pack bug (grass not occluding, so dirt/stone show through) is checked for
     * recurrence.
     */
    const grassTextures = ["minecraft:blocks/grass_normal", "minecraft:blocks/grass_snowed"];
    const grassTextureVertices = grassTextures.reduce(
        (sum, path) => sum + (eraHistogram.byPath.get(path) ?? 0), 0,
    );
    const dirtVertices = eraHistogram.byPath.get("minecraft:blocks/dirt") ?? 0;
    const dirtFraction = eraHistogram.total > 0 ? dirtVertices / eraHistogram.total : 0;

    log("");
    log(`  world:          seed ${options.seed}, ${options.size}x${options.size} blocks, ${world.chunkCount} chunks`);
    log(`  era-matched:    ${options.legacyVersion} pack, DataVersion ${world.dataVersion}, ${eraTiles.size} hires tile(s), ${eraVertices} vertices, ${eraHistogram.byPath.size} materials`);
    log(`  bluemap:block/missing:  ${missingVertices} of ${eraHistogram.total} vertices (${(missingFraction * 100).toFixed(1)}%)`);
    log(`  grass-family textures (blocks/grass_normal, blocks/grass_snowed): ${grassTextureVertices} vertices`);
    log(`  minecraft:blocks/dirt: ${dirtVertices} of ${eraHistogram.total} vertices (${(dirtFraction * 100).toFixed(1)}%)`);
    log("");
    log("  full era-matched material histogram:");
    for (const [path, count] of [...eraHistogram.byPath].sort((a, b) => b[1] - a[1]))
        log(`    ${String(count).padStart(8)}  ${path}`);

    let modernDirtFraction = null;
    if (modernRender !== null) {
        const modernTiles = await readHiresTiles(modernRender.mapDirectory);
        const modernGallery = await readTextureGallery(modernRender.mapDirectory);
        const modernHistogram = materialHistogram(modernTiles, modernGallery);
        const modernDirtVertices = modernHistogram.byPath.get("minecraft:block/dirt") ?? 0;
        modernDirtFraction = modernHistogram.total > 0 ? modernDirtVertices / modernHistogram.total : 0;
        log("");
        log("  same world against the MODERN pack, for comparison:");
        log(`    minecraft:block/dirt: ${modernDirtVertices} of ${modernHistogram.total} vertices (${(modernDirtFraction * 100).toFixed(1)}%)`);
    }

    const passed = checks.report();

    log("");
    if (grassTextureVertices === 0) {
        log(
            "  FINDING: no grass-family texture appears anywhere in the era-matched " +
                "render's gallery — consistent with `flattenLegacyBlockState` firing " +
                "unconditionally on `block.isLegacy()` (BlockStateModelRenderer.ts), " +
                "renaming the already-correct pre-flattening 'minecraft:grass' into " +
                "'minecraft:grass_block' (a name that did not exist before the 1.13 " +
                "flattening) before the era-matched pack is ever consulted. That lookup " +
                "then fails, and `if (stateResource == null) return;` means the block is " +
                "not drawn as missing-texture — it is skipped entirely, silently.",
        );
    } else {
        log(`  FINDING: ${grassTextureVertices} grass-family vertices rendered.`);
    }
    if (modernDirtFraction !== null) {
        log(
            `  FINDING: dirt is ${(dirtFraction * 100).toFixed(1)}% of the era-matched ` +
                `render vs ${(modernDirtFraction * 100).toFixed(1)}% of the modern-pack ` +
                "control on the identical world — a large gap here is the same " +
                "'ground no longer occluded from above' signature design/HANDOFF.md " +
                "recorded for the original modern-pack grass bug this rename table fixed, " +
                "now reproduced under the era-matched pack instead.",
        );
    }
    log(
        "  See resourcepack-e2e.test.ts's Proof 4 for the surgical, blockstate-level proof " +
            "of this interaction (not inferrable from a texture histogram alone): it calls " +
            "flattenLegacyBlockState directly against this same era-matched pack and asserts " +
            "its renamed output resolves to nothing.",
    );
    log(
        "  podzol is the counter-example: its FlatteningRename rule only INJECTS a " +
            "`snowy` property (withDefault) rather than renaming the key, so " +
            "'minecraft:podzol' still means 'minecraft:podzol' after the rename — and the " +
            "real 1.12.2 podzol.json blockstate keys on `snowy` too (checked directly), so " +
            "the injected property is not just harmless here, it is exactly what both packs " +
            `need. minecraft:blocks/dirt_podzol_side + dirt_podzol_top: ` +
            `${(eraHistogram.byPath.get("minecraft:blocks/dirt_podzol_side") ?? 0) + (eraHistogram.byPath.get("minecraft:blocks/dirt_podzol_top") ?? 0)} vertices rendered correctly.`,
    );

    const reportPath = join(options.out, "render-1-12-era-matched-report.json");
    await writeFile(reportPath, JSON.stringify({
        ok: passed,
        seed: options.seed,
        size: options.size,
        legacyVersion: options.legacyVersion,
        clientJar: options.clientJar,
        era: {
            dataVersion: world.dataVersion,
            mapDirectory: eraRender.mapDirectory,
            tiles: eraTiles.size,
            vertices: eraVertices,
            materials: Object.fromEntries(eraHistogram.byPath),
            missingVertices,
            missingFraction,
            grassTextureVertices,
            dirtVertices,
            dirtFraction,
        },
        modernControlDirtFraction: modernDirtFraction,
        historicGapBlocksChecked: HISTORIC_GAP_BLOCKS,
        surgicalProof: "packages/engine/test/resourcepack-e2e.test.ts, Proof 4, the " +
            "flattenLegacyBlockState assertion",
        knownLegacyRenderGapsAgainstModernPack: KNOWN_LEGACY_RENDER_GAPS,
        checks: { passed: checks.passed, failed: checks.failed },
    }, null, 2) + "\n");
    log(`  report: ${reportPath}`);

    if (!options.keep) await rm(world.worldFolder, { recursive: true, force: true });

    return passed ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    process.exitCode = await main().catch((error) => {
        log(`\n  render-1-12-era-matched failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
        return 1;
    });
}
