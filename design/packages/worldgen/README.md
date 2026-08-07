# `@worldlens/worldgen`

Generates a **synthetic Minecraft world, written directly in Anvil format by this
repository**, for use as a deterministic render fixture.

> [!IMPORTANT]
> Nothing here is produced by Minecraft. There is no server jar, no client jar, no
> EULA to accept, and nothing is downloaded at generation time. Every byte of
> `level.dat` and of every `region/r.X.Z.mca` is written by the code in `src/`, on top
> of this project's own `@worldlens/nbt` writer. The terrain is made up: it is
> plausible-looking, not vanilla-accurate, and a seed here has nothing to do with the
> same number typed into Minecraft.

## Why it exists

The screenshot job used to point at a third party's public BlueMap demo server, which
meant every push spent someone else's bandwidth and produced captures that changed with
their uptime ([issue #17](https://github.com/Ding-Ding-Projects/worldlens/issues/17)).
A world this repository generates itself is free, offline, reproducible from a recorded
seed, and — because it goes out through our NBT writer and comes back in through our
Anvil reader — it exercises the format code on the way.

## What it produces

| | |
| --- | --- |
| Format | Anvil, the 1.18+ `sections` / `block_states` chunk layout (or the pre-flattening 1.12.2 layout, see below) |
| Target version | Minecraft **1.20.4**, `DataVersion` **3700** |
| World geometry | `min_y = -64`, `height = 384`, sea level `y = 63` |
| Chunk compression | zlib (region compression id `2`) |
| Layout | `<world>/level.dat` (gzipped NBT) and `<world>/region/r.X.Z.mca` |
| Archive | `test-world-seed-<seed>.zip`, one top-level folder, the world inside it |

A 1000x1000 block world is 63x63 = **3969 chunks**, spanning the four region files
`r.0.0.mca`, `r.1.0.mca`, `r.0.1.mca` and `r.1.1.mca`.

### What the terrain looks like

- **Rolling continents with real coastlines.** A slow continent field decides land from
  sea, a faster hill field adds local relief, and a ridged mountain field masked to the
  raised interior of continents produces peaks up to about y=230. Typically 20-30% of a
  world is below sea level, so there is water and shoreline in every render.
- **Nine biomes**, chosen from height plus a temperature and a humidity field, with
  altitude cooling the climate: ocean, beach, desert, plains, forest, taiga, snowy
  plains, stony peaks and jagged peaks. Each has its own surface block, filler and
  filler depth (grass over dirt, sand over sandstone, podzol, snow, bare stone).
- **A solid interior.** Flat bedrock at y=-64, deepslate below y=0, stone (with granite
  and andesite patches) above it, and eight kinds of ore vein placed as small random
  walks in their own depth bands.
- **Vertical detail.** Oak, birch and spruce trees with real canopies, ground cover
  (short grass, poppies, dandelions), cacti and dead bushes in the desert, and a rare
  ruined stone-brick pillar so a rendered tile has something with a hard straight edge
  in it.

Every block is a real vanilla block-state string, written into the section palette as a
`Name` plus a `Properties` compound: `minecraft:grass_block[snowy=false]`,
`minecraft:water[level=0]`, `minecraft:oak_leaves[distance=1,persistent=false,waterlogged=false]`,
and so on.

## The 1.12.2 (pre-flattening) format

`--format 1.12.2` writes the same terrain in the chunk layout Minecraft used before the
flattening, so the engine's legacy reader has something real to read.

| | |
| --- | --- |
| Format | Anvil, the `Level.Sections[].Blocks` / `Data` / `Add` layout |
| Target version | Minecraft **1.12.2**, `DataVersion` **1343** |
| World geometry | `min_y = 0`, `height = 256`, sea level `y = 63` |
| Blocks | numeric ids in a `byte[4096]`, 4-bit metadata in a `byte[2048]` nibble array, ids above 255 in the optional `Add` nibbles |
| Biomes | a flat `byte[256]` on the `Level` compound, one legacy biome id per column |
| Heightmap | `HeightMap`, an `int[256]` of absolute y values (no world-floor offset) |
| `level.dat` | the 1.12.2 spelling: `RandomSeed`, `generatorName`, `MapFeatures`, and **no** `WorldGenSettings` |

**The terrain is identical to the 1.20.4 world of the same seed.** `TerrainGenerator`
knows nothing about either format and both writers are pure projections of one generated
chunk, which is what makes a render of the modern world a usable control for a render of
the legacy one. Only the bottom of the world moves: the four all-rock sections below y=0
are dropped, because 1.12.2 has no space for them, and y=0 becomes the bedrock floor.

Three approximations are unavoidable, and the generator **reports every one** rather than
swallowing it — on stderr and in the JSON summary's `substitutions`:

- **Deepslate and its ores** (1.17) become stone and the era's plain ores. Unreachable in
  practice: every deepslate block the generator places is below y=0 and is therefore never
  written.
- **Copper ore** (1.17) becomes gold ore. Its vein range does overlap the legacy world, so
  this one really happens; it is underground either way.
- **`grass_block[snowy=true]`** becomes plain id `2:0`. 1.12.2 had no `snowy` property at
  all — the reader's `SnowyExtension` derives it from the block above, exactly as that era
  did — so this is a round trip rather than a loss, and the test asserts it comes back.

> [!WARNING]
> Reading a 1.12.2 world is not the same as **rendering** one. This project's chunk reader
> returns pre-flattening block names (`minecraft:grass` for the grass block,
> `minecraft:snow_layer`, `minecraft:stonebrick`), and nothing translates those into modern
> names before the resource pack is asked for a model. Rendered against a modern client
> jar, four of them come out wrong. `tools/oracle/render-1-12.mjs` measures exactly which,
> and `design/HANDOFF.md` records the finding.

## Running it

```sh
# from design/, after `pnpm build`
node packages/worldgen/dist/cli.js --seed 4242424242 --size 1000 --out ./out

# the same terrain in the pre-flattening layout
node packages/worldgen/dist/cli.js --seed 4242424242 --size 1000 --out ./out --format 1.12.2
```

```
--seed <n>        world seed; the world is a function of this alone (required)
--size <blocks>   edge length of the generated square, in blocks (default 1000)
--format <ver>    chunk format: 1.20.4 (default) or 1.12.2
--data-version <n>  the same choice as a DataVersion (3700 or 1343)
--out <dir>       directory the world folder is created in (default ".")
--name <str>      world folder name (default "test-world-seed-<seed>")
--zip <path>      archive path (default "<out>/test-world-seed-<seed>.zip")
--no-zip          write the world folder only, no archive
--quiet           no progress output
--help            usage
```

Progress goes to stderr; a JSON summary of the generated world (seed, chunk count,
region files, spawn, sizes, elapsed time) goes to stdout, so a CI step can capture it
with a plain redirect.

### Regenerating a specific world

The seed is the whole input. To reproduce the world attached to a release, take the seed
from its release notes and run the same command:

```sh
node packages/worldgen/dist/cli.js --seed <seed from the release notes> --size 1000 --out ./out
```

The result is byte-identical to the archive that release carries, given the same
generator version. Two things are worth being precise about:

- **Determinism is over the generator's own output.** Timestamps are fixed constants
  (region chunk timestamps, `LastPlayed`, the zip's DOS date), and nothing consults a
  clock or a global random source, so two runs on one machine produce identical bytes.
  The test suite asserts exactly that.
- **The compressor is part of the output.** Chunk payloads and the archive go through
  Node's zlib. A different zlib build could in principle emit a different (still valid)
  compressed stream for the same input. The world it decompresses to is the same either
  way; only the compressed bytes could move.

### As a library

```ts
import { generateWorld, zipWorld, TerrainGenerator } from "@worldlens/worldgen";

const world = await generateWorld({ seed: 1234, size: 512, outDir: "./out" });
await zipWorld(world, "./out/world.zip");

// the terrain is queryable on its own, without writing anything
const terrain = new TerrainGenerator(1234);
terrain.terrainHeight(100, 200); // y of the topmost solid block
terrain.biomeAt(100, 200, terrain.terrainHeight(100, 200));
```

## The proof

`test/worldgen.test.ts` generates a small (64x64 block, 4x4 chunk) world and then
**reads it back through this project's own `MCAWorld`**, asserting that:

- every chunk loads as a fully generated, lit `Chunk_1_18`
- the reader's world geometry comes out of the generated `level.dat` (`min_y = -64`,
  `height = 384`, skylight on)
- thousands of sampled blocks come back as the exact block-states the generator placed,
  spanning the bedrock floor, the deep rock, the surface band and the air above it
- every column below sea level is flooded with `minecraft:water[level=0]` and every
  column above it is not, with both kinds present
- every 4x4 biome cell resolves through the data pack to the biome the generator chose,
  and never falls back to `bluemap:default`
- `WORLD_SURFACE` and `OCEAN_FLOOR` resolve to the actual surface and floor of each
  column
- sky-light is 15 above the terrain and 0 at the surface block
- the same seed twice produces byte-identical files, and a different seed does not
- the archive opens through `ZipFileSystem` and its region bytes match the ones on disk

`test/legacy-worldgen.test.ts` does the same for `--format 1.12.2`, and does it
exhaustively rather than by sampling. It generates a 64x64 block world at a seed chosen
because its first 4x4 chunks span five biomes, then walks **all 1,048,576 block
positions** and asserts that the reader hands back exactly the block-state each numeric
id and metadata nibble means — resolved the long way round, through the same
`blockIds.json` the reader uses, so a wrong id shared by both sides cannot pass. It also
asserts that:

- `DataVersion` 1343 dispatches to `Chunk_1_12`
- the metadata nibbles survive: granite and andesite are not stone, spruce and birch logs
  are not oak
- the bedrock floor is at y=0 and every y below it reads back as air rather than throwing
- every biome byte resolves through the bundled legacy table
- `HeightMap` comes back as an absolute y, with no world-floor offset applied
- sky-light is 15 above the terrain and 0 at the surface block
- `SnowyExtension` puts the `snowy` property back on grass blocks — false where the
  generator wrote plain grass, true where it wrote the snowy variant and a snow layer sits
  above — while the raw chunk carries no properties at all
- the same seed twice produces byte-identical files

`test/packing.test.ts` checks the padded long-array packing directly against the
reader's own `PackedIntArrayAccess`, at every bit-width the generator can choose.

A generator whose output this project's reader cannot parse would be worthless, and
these are the tests that say it can.

```sh
# from design/
npx vitest run packages/worldgen
```

## Deliberate simplifications

These are places where the generator is knowingly not vanilla. None of them affect
whether the world parses; they are listed so nobody mistakes them for bugs.

- **Sky-light is a vertical cast, not a propagation.** Light is 15 above a column's
  topmost block and 0 at and below it. It does not bleed sideways under an overhang and
  water is not attenuated with depth. Block-light is not written at all, so it reads
  back as 0 everywhere.
- **Decoration never crosses a chunk border.** Trees are placed far enough inside a
  chunk that their canopy stays in it, so canopies are cut off at no border and every
  chunk is generatable on its own.
- **Biomes are picked per 4x4 cell from that cell's centre column**, which is vanilla's
  storage resolution, but the surface block of a column follows that column's own
  biome. Near a biome edge, a column can therefore carry a neighbouring biome's surface
  block. That is the same thing vanilla's own 4x4 biome storage does to a smooth
  surface rule.
- **The bedrock floor is flat**, one layer at y=-64, rather than vanilla's ragged few
  layers. It makes the four sections below y=0 identical in every chunk, which is worth
  65 million block-writes on a 1000x1000 world.
- **No caves, no ravines, no structures beyond the pillar**, no entities, no block
  entities, no `Entities`/`POI` folders, no `data/` folder.
- **`generate_features` is 0 in `level.dat`.** The world is finished as written; a
  Minecraft server opening it would not try to fill anything in.
- **Block-state indices are widened past 11, 13, 14 and 15 bits.** A section's
  `block_states.data` carries no bit-width of its own; readers derive it from the array
  length, and that derivation is ambiguous at those widths. The generator's palettes are
  far too small to reach them, but the widening is implemented and tested rather than
  assumed away.

## Layout

| File | What it is |
| --- | --- |
| `random.ts` | 32-bit integer hashing and a small deterministic PRNG |
| `noise.ts` | seeded value noise, fBm and ridged fBm |
| `blocks.ts` | the block-state palette and its string parser |
| `biomes.ts` | biome definitions: surface, filler, decoration rates |
| `version.ts` | the target version and the world geometry constants |
| `TerrainGenerator.ts` | height field, biome choice, column fill, decoration |
| `chunk.ts` | the in-memory block model of one chunk |
| `packing.ts` | the padded long-array packing, and the bit-width rules |
| `chunkNbt.ts` | a chunk's NBT: palettes, packed data, heightmaps, sky-light |
| `levelDat.ts` | `level.dat`, including the inline dimension type |
| `legacyVersion.ts` | the 1.12.2 target version and its 0..255 world geometry |
| `legacyMappings.ts` | block-state to numeric id/meta, and biome key to legacy biome id |
| `legacyChunkNbt.ts` | a 1.12.2 chunk's NBT: `Blocks`/`Data`/`Add`, nibble packing, `Biomes`, `HeightMap` |
| `legacyLevelDat.ts` | the 1.12.2 `level.dat`, and what it deliberately does not carry |
| `region.ts` | the `.mca` container: sector allocation and the 8 KiB header |
| `zip.ts` | a small deterministic zip writer |
| `generateWorld.ts` | assembles a whole world and archives it |
| `cli.ts` | the command-line entry point |
