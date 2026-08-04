#!/usr/bin/env node
/**
 * Renders a **Minecraft 1.12.2** world with this project's TypeScript engine and checks
 * that what came out is a real map rather than a plausible-looking pile of nothing.
 *
 * ## Why this is a script and not a unit test
 *
 * It needs a Minecraft client jar, BlueMap's `resourceExtensions.zip`, a full resource-pack
 * load (about 2,100 textures) and two complete map renders. That is a minute of work and a
 * few hundred megabytes of resident memory — an order of magnitude more than the rest of
 * `packages/engine`'s suite put together, and it depends on files that are downloaded
 * rather than committed. The *decoding* half of the same proof is a unit test and runs in
 * about a second: `design/packages/worldgen/test/legacy-worldgen.test.ts` reads every one
 * of a million block positions back through `Chunk_1_12` and compares them against what
 * the generator wrote. What lives here is only what genuinely needs a renderer.
 *
 * Nothing is softened by being a script: every check below is an assertion, a failure exits
 * non-zero, and the exact divergence is printed rather than summarised.
 *
 * ## Why there is no Java oracle, and what stands in for one
 *
 * Upstream BlueMap 5.22 has no pre-flattening chunk loader at all —
 * `core/src/main/java/de/bluecolored/bluemap/core/world/mca/chunk/` holds Chunk_1_13,
 * _1_15, _1_16 and _1_18 and nothing older — so there is no Java render of a 1.12.2 world
 * to compare bytes against, and there cannot be one without reviving a decade-old branch
 * whose output format predates everything this engine writes. The byte-exact gate that
 * `compare.mjs` runs for modern worlds is therefore impossible here, and claiming otherwise
 * would be the easiest way to make this look stronger than it is.
 *
 * What stands in for it is a **control render of the same terrain**. `worldgen` writes both
 * formats from the same `TerrainGenerator`, so seed N produces literally the same blocks in
 * a 1.12.2 world and a 1.20.4 world. Rendering both and diffing the two maps' material
 * tables isolates the format: anything present in one and missing from the other is a
 * difference in how the world was *read and resolved*, not in what was generated. That is a
 * weaker claim than byte equality and it is stated as such — but it is a real one, and it
 * is what found the four block-states this harness now pins.
 *
 * ## Usage
 *
 *     node tools/oracle/render-1-12.mjs
 *     node tools/oracle/render-1-12.mjs --seed 22 --size 128 --keep
 *
 * Resources default to the ones `compare.mjs` already downloaded into
 * `tools/oracle/out/gate/bluemap-data/`; nothing here fetches anything.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { log, run } from "./lib/util.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DEFAULTS = {
    seed: 22,
    /*
     * 128 blocks is 8x8 chunks, which at this seed spans five of the generator's nine
     * biomes — plains, forest, taiga, snowy plains and jagged peaks — and therefore covers
     * grass, podzol, snow, three wood species, the stone variants and the ground plants.
     * A larger world adds render minutes and no new block-states; a smaller one lands
     * entirely inside one biome and would pass every check below on four block ids.
     */
    size: 128,
    out: join(REPO_ROOT, "tools", "oracle", "out", "legacy"),
    clientJar: join(REPO_ROOT, "tools", "oracle", "out", "gate", "bluemap-data", "minecraft-client-26.2.jar"),
    resourceExtensions: join(REPO_ROOT, "tools", "oracle", "out", "gate", "bluemap-data", "resourceExtensions.zip"),
};

/**
 * The block-states a 1.12.2 world renders *wrongly* against a modern resource pack, and
 * why each one does.
 *
 * This list is the finding, not a list of excuses. Every entry was established by diffing
 * the legacy render against the modern control render of the same terrain, and the check
 * below requires the divergence to be **exactly** this set: a new entry appearing is a new
 * regression, and an entry disappearing means something was fixed and this list is stale.
 * Either way the harness fails and says which.
 *
 * The cause is the same in all four cases and it is not in the chunk reader — the reader
 * hands back precisely the block-state the numeric id means, which the unit test proves
 * block by block. It is that nothing translates a *pre-flattening block name* into a modern
 * one before the resource pack is asked for a model. Three ways that goes wrong are
 * visible here, and they are qualitatively different:
 *
 *  - a name the flattening **removed** resolves to no blockstate at all, and the block
 *    renders as nothing (`snow_layer`, and `stonebrick` where the terrain has a pillar);
 *  - a name the flattening **reused for a different block** resolves to that different
 *    block, which is worse than nothing because it renders confidently and wrongly
 *    (`grass`, `snow`);
 *  - a name that **survived but gained a property** matches no variant, because the legacy
 *    state cannot carry the property the modern blockstate keys its variants on
 *    (`podzol`, whose 1.13+ blockstate is keyed on `snowy`).
 *
 * The fix is not in this harness. Either the render is given an era-matched (1.12.2)
 * resource pack — which is what `LegacyResourcePackExtension` exists for, and what upstream
 * v0.10.3 shipped — or the reader grows a flattening rename table between the legacy
 * `BlockIdMapper` and the resource lookup. Neither is in scope here; what is in scope is
 * saying exactly which blocks are affected instead of leaving it to be discovered.
 */
const KNOWN_LEGACY_RENDER_GAPS = [
    {
        blockState: "minecraft:grass",
        wrote: "the 1.12.2 grass block (numeric id 2)",
        kind: "renders as a different block",
        detail:
            "`resourceExtensions.zip`'s mc1_20_3 overlay defines minecraft:grass as the modern " +
            "grass TUFT (1.20.3 renamed the tuft to short_grass and BlueMap keeps the old name " +
            "working for older packs). A 1.12.2 grass block therefore renders as a cross-shaped " +
            "plant instead of a cube, and the dirt underneath becomes visible through it.",
        modernTextures: ["block/grass_block_top", "block/grass_block_side", "block/grass_block_side_overlay", "block/grass_block_snow"],
    },
    {
        blockState: "minecraft:podzol",
        wrote: "podzol (numeric id 3, meta 2)",
        kind: "matches no variant",
        detail:
            "26.2's podzol blockstate keys its variants on `snowy`, a property that did not " +
            "exist in 1.12.2 and that the legacy id table therefore cannot produce. No variant " +
            "condition matches and the block renders as nothing.",
        modernTextures: ["block/podzol_top", "block/podzol_side"],
    },
    {
        blockState: "minecraft:snow_layer",
        wrote: "a snow layer (numeric id 78)",
        kind: "no blockstate at all",
        detail:
            "The flattening renamed snow_layer to minecraft:snow. Nothing in a modern pack " +
            "answers to the old name, so the layer renders as nothing.",
        modernTextures: ["block/snow"],
    },
    {
        blockState: "minecraft:snow",
        wrote: "a snow block (numeric id 80)",
        kind: "renders as a different block",
        detail:
            "The mirror image of the entry above: in 1.12.2 minecraft:snow is the full snow " +
            "BLOCK, and in a modern pack it is the snow LAYER, whose variants are keyed on " +
            "`layers`. The legacy state carries no `layers`, so nothing matches — the two names " +
            "swapped meaning across the flattening and both ends of the swap are broken.",
        modernTextures: ["block/snow"],
    },
];

/**
 * Materials that both renders draw, but in wildly different quantities, and why.
 *
 * A set difference alone would miss the worst symptom of the `minecraft:grass` gap. The
 * grass block does not vanish from the legacy render — it renders as a *tuft*, whose
 * texture the modern render also uses for its real tufts, so `short_grass` is present in
 * both and the set difference says nothing. What gives it away is the quantity: 139,728
 * vertices against 1,944, because eleven thousand cubes became eleven thousand cross-shaped
 * plants. The two knock-on effects are counted here too: with the grass cubes gone the
 * ground stops occluding, so the dirt and stone underneath become visible faces.
 *
 * Anything else that diverges by more than {@link DIVERGENCE_FACTOR} is undocumented and
 * fails the run.
 */
const KNOWN_DIVERGENT_MATERIALS = [
    {
        texture: "minecraft:block/short_grass",
        detail:
            "every 1.12.2 grass block renders as a grass tuft (see the minecraft:grass gap), " +
            "so this texture carries the whole ground surface instead of the scattered plants",
    },
    {
        texture: "minecraft:block/dirt",
        detail: "exposed by the grass blocks that became see-through tufts",
    },
    {
        texture: "minecraft:block/stone",
        detail: "exposed by the grass blocks that became see-through tufts",
    },
];

/** how far a shared material's vertex count may differ from the control before it counts */
const DIVERGENCE_FACTOR = 5;

/** below this many vertices a ratio is noise rather than a signal, and is not judged */
const DIVERGENCE_FLOOR = 1000;

// ---------------------------------------------------------------------------------------
// PRBM
// ---------------------------------------------------------------------------------------

/** attribute encodings, as bytes per element — PRBMWriter writes only these three */
const ENCODING_BYTES = { 1: 4, 3: 1, 7: 1 };
/** attribute cardinalities, as elements per value */
const CARDINALITY = { 0: 1, 1: 2, 2: 3 };

/** the seven attributes `PRBMWriter#write` emits, in the order it emits them */
const EXPECTED_ATTRIBUTES = [
    "position",
    "normal",
    "color",
    "uv",
    "ao",
    "blocklight",
    "sunlight",
];

/**
 * Parses a hires tile as PRBM — BlueMap's variant of PRWM.
 *
 * Written as a *generic* reader (name, type byte, padding, `numValues * cardinality *
 * encoding-size` bytes of data) rather than one that jumps to hard-coded offsets, for one
 * reason: a generic reader that arrives exactly at the end of the file has proved the file
 * is internally consistent. Every attribute header it read was where the previous
 * attribute's declared length said it would be, so a truncated tile, a wrong padding
 * decision or a vertex count that disagrees with the data cannot survive the walk. That
 * `consumed === bytes.length` check at the end is the whole point, and it is asserted.
 */
function parsePrbm(bytes, file) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const fail = (message) => {
        throw new Error(`${file}: ${message}`);
    };

    if (bytes.length < 8) fail(`too short to be a PRBM file (${bytes.length} bytes)`);

    let offset = 0;
    const version = bytes[offset++];
    const header = bytes[offset++];
    if (version !== 1) fail(`unexpected PRBM version ${version}`);

    const indexed = (header & 0x80) !== 0;
    const bigEndian = (header & 0x20) !== 0;
    const attributeCount = header & 0x1f;
    if (indexed) fail("the tile claims to be indexed; BlueMap writes non-indexed meshes");
    if (bigEndian) fail("the tile claims big-endian; BlueMap writes little-endian");
    if (attributeCount !== EXPECTED_ATTRIBUTES.length)
        fail(`${attributeCount} attributes, expected ${EXPECTED_ATTRIBUTES.length}`);

    const numValues = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    offset += 3;
    const numIndices = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    offset += 3;
    if (numIndices !== 0) fail(`${numIndices} indices in a non-indexed mesh`);
    if (numValues % 3 !== 0) fail(`${numValues} vertices is not a whole number of triangles`);

    const attributes = [];
    for (let i = 0; i < attributeCount; i++) {
        let end = offset;
        while (end < bytes.length && bytes[end] !== 0) end++;
        if (end >= bytes.length) fail("an attribute name runs off the end of the file");
        const name = Buffer.from(bytes.subarray(offset, end)).toString("ascii");
        offset = end + 1;

        const type = bytes[offset++];
        offset += (4 - (offset % 4)) % 4; // PRBMWriter#writePadding

        const cardinality = CARDINALITY[(type >> 4) & 0x3];
        const elementBytes = ENCODING_BYTES[type & 0x0f];
        if (cardinality === undefined || elementBytes === undefined)
            fail(`attribute '${name}' has an encoding this writer never emits (0x${type.toString(16)})`);

        const length = numValues * cardinality * elementBytes;
        if (offset + length > bytes.length)
            fail(`attribute '${name}' declares ${length} bytes but only ${bytes.length - offset} remain`);

        attributes.push({ name, offset, length });
        offset += length;
    }

    offset += (4 - (offset % 4)) % 4;

    const groups = [];
    for (;;) {
        if (offset + 4 > bytes.length) fail("the material-group table is not terminated");
        const material = view.getInt32(offset, true);
        offset += 4;
        if (material === -1) break;
        if (offset + 8 > bytes.length) fail(`material group ${material} is truncated`);
        groups.push({
            material,
            start: view.getInt32(offset, true),
            count: view.getInt32(offset + 4, true),
        });
        offset += 8;
    }

    if (offset !== bytes.length)
        fail(`${bytes.length - offset} trailing byte(s) after the material-group table`);

    return { numValues, attributes, groups };
}

// ---------------------------------------------------------------------------------------
// reading a rendered map directory
// ---------------------------------------------------------------------------------------

/** every hires tile of a rendered map, as `"x/z" -> parsed PRBM` */
async function readHiresTiles(mapDirectory) {
    const root = join(mapDirectory, "tiles", "0");
    const tiles = new Map();
    if (!existsSync(root)) return tiles;

    for (const xEntry of await readdir(root, { withFileTypes: true })) {
        if (!xEntry.isDirectory()) continue;
        const x = xEntry.name.replace(/^x/, "");
        for (const zEntry of await readdir(join(root, xEntry.name), { withFileTypes: true })) {
            if (!zEntry.isFile() || !zEntry.name.endsWith(".prbm.gz")) continue;
            const z = zEntry.name.replace(/^z/, "").replace(/\.prbm\.gz$/, "");
            const file = join(root, xEntry.name, zEntry.name);
            const bytes = new Uint8Array(gunzipSync(await readFile(file)));
            tiles.set(`${x}/${z}`, parsePrbm(bytes, `tiles/0/${xEntry.name}/${zEntry.name}`));
        }
    }
    return tiles;
}

/** the map's texture gallery: material index -> resource path */
async function readTextureGallery(mapDirectory) {
    const gz = join(mapDirectory, "textures.json.gz");
    const plain = join(mapDirectory, "textures.json");
    const bytes = existsSync(gz) ? gunzipSync(await readFile(gz)) : await readFile(plain);
    const gallery = JSON.parse(bytes.toString("utf8"));
    if (!Array.isArray(gallery)) throw new Error("textures.json is not an array");
    return gallery;
}

/**
 * A rendered map reduced to what can be compared: how many vertices each material carries.
 *
 * Vertices rather than groups, because a group count says how the mesher happened to
 * segment a tile and a vertex count says how much of the block is actually on screen.
 */
function materialHistogram(tiles, gallery) {
    const byPath = new Map();
    let total = 0;
    for (const tile of tiles.values()) {
        for (const group of tile.groups) {
            const entry = gallery[group.material];
            const path = entry?.resourcePath ?? `<no gallery entry for material ${group.material}>`;
            byPath.set(path, (byPath.get(path) ?? 0) + group.count);
            total += group.count;
        }
    }
    return { byPath, total };
}

// ---------------------------------------------------------------------------------------
// driving the build, the generator and the renderer
// ---------------------------------------------------------------------------------------

async function build(filter, what) {
    log(`[1.12] compiling ${what} (so this run grades src/, not a stale dist/)`);
    const result = await run("pnpm", ["--filter", filter, "run", "build"], {
        cwd: join(REPO_ROOT, "design"),
        capture: true,
        // `pnpm` is a `.cmd` shim on Windows, which CreateProcess will not run directly
        shell: process.platform === "win32",
    });
    if (result.code !== 0)
        throw new Error(`${what} does not compile:\n${(result.stderr || result.stdout).trim()}`);
}

/** generates one world and returns the generator's own json summary */
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

/** renders one world with render-ts.mjs and returns its single json result */
async function render({ worldFolder, storageRoot, clientJar, resourceExtensions }) {
    await rm(storageRoot, { recursive: true, force: true });
    await mkdir(storageRoot, { recursive: true });

    // the same driver `compare.mjs` uses, with the same flags, so this is measuring the
    // engine's real entry point rather than a second render path written for a test
    const result = await run(process.execPath, [
        join(REPO_ROOT, "tools", "oracle", "render-ts.mjs"),
        "--engine", join(REPO_ROOT, "design", "packages", "engine", "dist", "index.js"),
        "--world", worldFolder,
        "--storage-root", storageRoot,
        "--map-id", "overworld",
        "--map-name", "overworld",
        "--dimension", "minecraft:overworld",
        "--client-jar", clientJar,
        "--resource-extensions", resourceExtensions,
    ], { capture: true });

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

// ---------------------------------------------------------------------------------------
// the checks
// ---------------------------------------------------------------------------------------

class Checks {
    constructor() {
        this.passed = [];
        this.failed = [];
    }

    ok(claim, condition, detail = "") {
        if (condition) this.passed.push(claim);
        else this.failed.push({ claim, detail });
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

function parseArgs(argv) {
    const options = { ...DEFAULTS, keep: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === "--keep") {
            options.keep = true;
            continue;
        }
        if (!arg.startsWith("--")) throw new Error(`unexpected argument '${arg}'`);
        const value = argv[++i];
        if (value === undefined) throw new Error(`missing value for ${arg}`);
        switch (arg) {
            case "--seed": options.seed = Number(value); break;
            case "--size": options.size = Number(value); break;
            case "--out": options.out = resolve(value); break;
            case "--client-jar": options.clientJar = resolve(value); break;
            case "--resource-extensions": options.resourceExtensions = resolve(value); break;
            default: throw new Error(`unknown option ${arg}`);
        }
    }
    return options;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    for (const [what, path] of [
        ["the Minecraft client jar", options.clientJar],
        ["BlueMap's resourceExtensions.zip", options.resourceExtensions],
    ]) {
        if (!existsSync(path))
            throw new Error(
                `${what} is not at ${path}. This harness never downloads anything; run ` +
                    "tools/oracle/compare.mjs once to populate tools/oracle/out/gate/bluemap-data/, " +
                    "or point --client-jar / --resource-extensions at your own copies.",
            );
    }

    await build("./packages/engine", "the TypeScript engine");
    await build("./packages/worldgen", "the world generator");

    await mkdir(options.out, { recursive: true });

    log(`[1.12] generating seed ${options.seed}, ${options.size}x${options.size} blocks, in both formats`);
    const legacyWorld = await generate({
        seed: options.seed, size: options.size, format: "1.12.2",
        outDir: options.out, name: `seed-${options.seed}-1.12.2`,
    });
    const modernWorld = await generate({
        seed: options.seed, size: options.size,
        outDir: options.out, name: `seed-${options.seed}-1.20.4`,
    });

    log(`[1.12] rendering the 1.12.2 world (DataVersion ${legacyWorld.dataVersion})`);
    const legacyRender = await render({
        worldFolder: legacyWorld.worldFolder,
        storageRoot: join(options.out, "render-1.12.2", "web", "maps"),
        clientJar: options.clientJar,
        resourceExtensions: options.resourceExtensions,
    });

    log(`[1.12] rendering the same terrain as 1.20.4, as a control`);
    const modernRender = await render({
        worldFolder: modernWorld.worldFolder,
        storageRoot: join(options.out, "render-1.20.4", "web", "maps"),
        clientJar: options.clientJar,
        resourceExtensions: options.resourceExtensions,
    });

    const legacyTiles = await readHiresTiles(legacyRender.mapDirectory);
    const legacyGallery = await readTextureGallery(legacyRender.mapDirectory);
    const legacyHistogram = materialHistogram(legacyTiles, legacyGallery);

    const modernTiles = await readHiresTiles(modernRender.mapDirectory);
    const modernGallery = await readTextureGallery(modernRender.mapDirectory);
    const modernHistogram = materialHistogram(modernTiles, modernGallery);

    const checks = new Checks();

    // --- the render happened at all ---------------------------------------------------

    checks.ok(
        "the 1.12.2 world produced hires tiles",
        legacyTiles.size > 0,
        `the renderer chose ${legacyRender.tiles} tile(s) for rendering and wrote ${legacyTiles.size} hires model(s)`,
    );

    // --- the tiles are real meshes ----------------------------------------------------
    //
    // parsePrbm already threw on any structural problem; what is asserted here is that the
    // meshes have content. A tile that parses perfectly and holds zero triangles is exactly
    // what "the world read as empty" looks like from the outside.

    const emptyTiles = [...legacyTiles].filter(([, tile]) => tile.numValues === 0).map(([id]) => id);
    checks.ok(
        "every hires tile parses as PRBM and holds at least one triangle",
        emptyTiles.length === 0,
        `empty tiles: ${emptyTiles.join(", ")}`,
    );

    const attributeProblems = [];
    for (const [id, tile] of legacyTiles) {
        const names = tile.attributes.map((a) => a.name);
        if (names.join(",") !== EXPECTED_ATTRIBUTES.join(","))
            attributeProblems.push(`${id}: ${names.join(",")}`);
    }
    checks.ok(
        "every hires tile carries the seven vertex attributes the viewer reads, in order",
        attributeProblems.length === 0,
        attributeProblems.join("\n"),
    );

    const legacyVertices = [...legacyTiles.values()].reduce((sum, t) => sum + t.numValues, 0);
    const modernVertices = [...modernTiles.values()].reduce((sum, t) => sum + t.numValues, 0);
    checks.ok(
        "the vertex count is in the same order of magnitude as the modern control render",
        legacyVertices > modernVertices / 4 && legacyVertices < modernVertices * 4,
        `1.12.2: ${legacyVertices} vertices, 1.20.4: ${modernVertices}`,
    );

    // --- the tiles cover the same ground as the control --------------------------------

    const legacyTileIds = [...legacyTiles.keys()].sort();
    const modernTileIds = [...modernTiles.keys()].sort();
    checks.ok(
        "the legacy render wrote a hires tile everywhere the modern render of the same terrain did",
        legacyTileIds.join(" ") === modernTileIds.join(" "),
        `1.12.2: ${legacyTileIds.join(", ")}\n1.20.4: ${modernTileIds.join(", ")}`,
    );

    // --- the materials resolve to real textures ----------------------------------------

    const unresolved = new Set();
    for (const tile of legacyTiles.values()) {
        for (const group of tile.groups) {
            const entry = legacyGallery[group.material];
            if (entry === undefined || typeof entry.resourcePath !== "string" ||
                typeof entry.texture !== "string" || !entry.texture.startsWith("data:image/png;base64,"))
                unresolved.add(group.material);
        }
    }
    checks.ok(
        "every material a tile references resolves to a gallery entry with an embedded texture",
        unresolved.size === 0,
        `unresolved material indices: ${[...unresolved].join(", ")} (gallery holds ${legacyGallery.length} entries)`,
    );

    const missingVertices = legacyHistogram.byPath.get("bluemap:block/missing") ?? 0;
    checks.ok(
        "no part of the map is the missing-texture placeholder",
        missingVertices === 0,
        `${missingVertices} of ${legacyHistogram.total} vertices use bluemap:block/missing`,
    );

    // --- the map has variety, i.e. the block ids really were distinguished ---------------

    const [dominantPath, dominantCount] = [...legacyHistogram.byPath].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
    checks.ok(
        "the map is made of many distinct materials rather than one repeated block",
        legacyHistogram.byPath.size >= 15,
        `${legacyHistogram.byPath.size} distinct material(s)`,
    );
    checks.ok(
        "no single material dominates the map",
        dominantCount <= legacyHistogram.total * 0.6,
        `${dominantPath} is ${((dominantCount / legacyHistogram.total) * 100).toFixed(1)}% of ${legacyHistogram.total} vertices`,
    );

    // --- what the generator wrote against what the render produced -----------------------
    //
    // The real proof that the numeric ids mapped correctly. Both renders come from the same
    // generated terrain, so a material in one and not the other is a block the two formats
    // disagree about — and every such disagreement has to be one of the four documented
    // above, or it is new and unexplained.

    const legacyOnly = [...legacyHistogram.byPath.keys()].filter((p) => !modernHistogram.byPath.has(p)).sort();
    const modernOnly = [...modernHistogram.byPath.keys()].filter((p) => !legacyHistogram.byPath.has(p)).sort();

    const explained = new Set();
    for (const gap of KNOWN_LEGACY_RENDER_GAPS)
        for (const texture of gap.modernTextures) explained.add(`minecraft:${texture}`);

    const unexplainedModernOnly = modernOnly.filter((p) => !explained.has(p));
    checks.ok(
        "every block the modern render draws and the legacy render does not is a documented flattening gap",
        unexplainedModernOnly.length === 0,
        `unexplained: ${unexplainedModernOnly.join(", ")}`,
    );
    checks.ok(
        "the legacy render draws nothing the modern render of the same terrain does not",
        legacyOnly.length === 0,
        `only in the 1.12.2 render: ${legacyOnly.join(", ")}`,
    );

    // the same comparison on quantity rather than presence — see KNOWN_DIVERGENT_MATERIALS
    const divergent = [];
    for (const [path, count] of legacyHistogram.byPath) {
        const control = modernHistogram.byPath.get(path);
        if (control === undefined) continue;
        if (count < DIVERGENCE_FLOOR && control < DIVERGENCE_FLOOR) continue;
        const ratio = count / Math.max(control, 1);
        if (ratio > DIVERGENCE_FACTOR || ratio < 1 / DIVERGENCE_FACTOR)
            divergent.push({ texture: path, legacy: count, modern: control, ratio });
    }
    const documentedDivergent = new Set(KNOWN_DIVERGENT_MATERIALS.map((entry) => entry.texture));
    const undocumentedDivergent = divergent.filter((entry) => !documentedDivergent.has(entry.texture));
    checks.ok(
        `every material both renders draw in wildly different amounts (>${DIVERGENCE_FACTOR}x) is documented`,
        undocumentedDivergent.length === 0,
        undocumentedDivergent
            .map((e) => `${e.texture}: ${e.legacy} vs ${e.modern} (${e.ratio.toFixed(1)}x)`)
            .join("\n"),
    );
    const staleDivergent = [...documentedDivergent].filter(
        (texture) => !divergent.some((entry) => entry.texture === texture),
    );
    checks.ok(
        "every documented quantity divergence is still real (the list is not stale)",
        staleDivergent.length === 0,
        `these materials now agree with the control, so KNOWN_DIVERGENT_MATERIALS is out of date: ${staleDivergent.join(", ")}`,
    );

    const staleGaps = [...explained].filter((p) => !modernOnly.includes(p));
    checks.ok(
        "every documented flattening gap is still a real gap (the list is not stale)",
        staleGaps.length === 0,
        `these textures now render in the legacy map too, so KNOWN_LEGACY_RENDER_GAPS is out of date: ${staleGaps.join(", ")}`,
    );

    // --- the report ---------------------------------------------------------------------

    log("");
    log(`  world:   seed ${options.seed}, ${options.size}x${options.size} blocks, ${legacyWorld.chunkCount} chunks`);
    log(`  1.12.2:  DataVersion ${legacyWorld.dataVersion}, ${legacyTiles.size} hires tile(s), ${legacyVertices} vertices, ${legacyHistogram.byPath.size} materials`);
    log(`  1.20.4:  DataVersion ${modernWorld.dataVersion}, ${modernTiles.size} hires tile(s), ${modernVertices} vertices, ${modernHistogram.byPath.size} materials`);
    log("");
    log("  materials in the 1.12.2 render (vertices, and the same material in the control):");
    for (const [path, count] of [...legacyHistogram.byPath].sort((a, b) => b[1] - a[1])) {
        const control = modernHistogram.byPath.get(path);
        log(`    ${String(count).padStart(8)}  ${path}${control === undefined ? "   [only here]" : `   (control: ${control})`}`);
    }
    if (modernOnly.length > 0) {
        log("");
        log("  drawn by the 1.20.4 control and NOT by the 1.12.2 render:");
        for (const path of modernOnly)
            log(`    ${String(modernHistogram.byPath.get(path)).padStart(8)}  ${path}`);
        log("");
        for (const gap of KNOWN_LEGACY_RENDER_GAPS) {
            log(`    ${gap.blockState}  —  ${gap.kind}`);
            log(`      the generator wrote ${gap.wrote}`);
            for (const line of wrap(gap.detail, 92)) log(`      ${line}`);
        }
    }
    if (divergent.length > 0) {
        log("");
        log(`  drawn by both renders in very different amounts (>${DIVERGENCE_FACTOR}x):`);
        for (const entry of divergent.sort((a, b) => b.ratio - a.ratio)) {
            const documented = KNOWN_DIVERGENT_MATERIALS.find((k) => k.texture === entry.texture);
            log(`    ${entry.texture}: ${entry.legacy} vs ${entry.modern} in the control (${entry.ratio.toFixed(1)}x)`);
            for (const line of wrap(documented?.detail ?? "UNDOCUMENTED", 88)) log(`      ${line}`);
        }
    }
    if (Object.keys(legacyWorld.substitutions ?? {}).length > 0) {
        log("");
        log("  blocks 1.12.2 cannot express, substituted by the generator before any of this:");
        for (const [blockState, count] of Object.entries(legacyWorld.substitutions))
            log(`    ${String(count).padStart(8)}  ${blockState}`);
    }

    const passed = checks.report();

    const reportPath = join(options.out, "render-1-12-report.json");
    await writeFile(reportPath, JSON.stringify({
        ok: passed,
        seed: options.seed,
        size: options.size,
        legacy: {
            dataVersion: legacyWorld.dataVersion,
            worldFolder: legacyWorld.worldFolder,
            substitutions: legacyWorld.substitutions,
            mapDirectory: legacyRender.mapDirectory,
            tiles: legacyTiles.size,
            vertices: legacyVertices,
            materials: Object.fromEntries(legacyHistogram.byPath),
        },
        modern: {
            dataVersion: modernWorld.dataVersion,
            mapDirectory: modernRender.mapDirectory,
            tiles: modernTiles.size,
            vertices: modernVertices,
            materials: Object.fromEntries(modernHistogram.byPath),
        },
        legacyOnlyMaterials: legacyOnly,
        modernOnlyMaterials: modernOnly,
        divergentMaterials: divergent,
        knownGaps: KNOWN_LEGACY_RENDER_GAPS,
        knownDivergentMaterials: KNOWN_DIVERGENT_MATERIALS,
        checks: { passed: checks.passed, failed: checks.failed },
    }, null, 2) + "\n");
    log(`  report: ${reportPath}`);

    if (!options.keep) {
        await rm(legacyWorld.worldFolder, { recursive: true, force: true });
        await rm(modernWorld.worldFolder, { recursive: true, force: true });
    }

    return passed ? 0 : 1;
}

/** wraps a long explanation so the report stays readable in a terminal */
function wrap(text, width) {
    const lines = [];
    let line = "";
    for (const word of text.split(/\s+/)) {
        if (line.length + word.length + 1 > width) {
            lines.push(line);
            line = word;
        } else {
            line = line === "" ? word : line + " " + word;
        }
    }
    if (line !== "") lines.push(line);
    return lines;
}

// keeps the module importable (the assertions above are reused by nothing yet, but the
// PRBM reader is the sort of thing the next harness will want)
export {
    parsePrbm,
    readHiresTiles,
    readTextureGallery,
    materialHistogram,
    KNOWN_LEGACY_RENDER_GAPS,
    KNOWN_DIVERGENT_MATERIALS,
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
    process.exitCode = await main().catch((error) => {
        log(`\n  render-1-12 failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
        return 1;
    });
}
