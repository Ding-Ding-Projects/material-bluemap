# 1.12.2 worlds: written by the generator, and proved to read back as a map

DataVersion 1343 is Minecraft 1.12.2, the last release before the flattening replaced numeric
block ids with namespaced block-states. This project's world reader has always dispatched on that
threshold. What is new is that the world generator can now *write* that format, so a pre-flattening
world can be produced from a seed and read back through the same reader that opens a real one, and
a render harness checks that what comes out is a map rather than a plausible-looking pile of
nothing.

The code is `design/packages/worldgen/src/legacy*.ts`, with the render harness at
`tools/oracle/render-1-12.mjs`.

## Behaviour

### The threshold, and why 1343 exactly

`MCAChunkLoader` selects `Chunk_1_12` for every chunk whose DataVersion is at or below 1343, so
1343 is both the newest legacy world and the only value that proves the legacy branch was taken
rather than the modern one. Writing 1342 would be a world nobody has; writing 1344 would silently
exercise the modern path.

### What a legacy chunk is made of

The modern writer emits the 1.18-and-later shape: a top-level `sections` list, a per-section
palette of namespaced block-states, and bit-packed indices into it. None of that existed in
1.12.2, where a chunk is a `Level` compound holding a `Sections` list whose entries carry three
parallel arrays over the same 4096 block slots.

| Tag | Type | What it holds |
|---|---|---|
| `Blocks` | `byte[4096]` | The low 8 bits of each block's numeric id |
| `Add` | `byte[2048]` | Optional nibble array holding bits 8 to 11 of the id, so ids above 255 can be expressed |
| `Data` | `byte[2048]` | Nibble array of 4-bit metadata |

Nibble arrays pack two values per byte, low nibble first: value `i` lives in byte `i >> 1`, in the
low half when `i` is even and the high half when it is odd. That is the layout `Chunk_1_12` reads
back, and getting the halves the wrong way round produces a world that decodes to a checkerboard
of two different blocks, plausible enough at a glance to be missed.

Biomes are a flat `byte[256]` on the `Level` compound, one id per column indexed `z * 16 + x`,
rather than a per-section 4 by 4 by 4 palette. The heightmap is a plain `int[256]` under
`HeightMap` rather than a bit-packed long array under `Heightmaps`.

### Ids and metadata are both load-bearing

1.12.2 had 256 usable block ids and four bits of metadata to distinguish everything within one:
every stone variant, every wood species, every leaf type. `1:0` and `1:5` are not two spellings of
one entry, they are stone and andesite, and getting the meta wrong is the easiest possible way to
write a world that decodes into confident nonsense.

Where 1.12.2 has no block corresponding to a modern one, an era-appropriate stand-in is written
and **the substitution is counted, never silent**. The count appears in the generator's JSON
summary and again on stderr, because a legacy world quietly losing a block is exactly the failure
this format exists to rule out and nobody reads the JSON summary of a run that looked like it
worked.

### The world-box projection

A 1.12.2 world is 256 blocks tall starting at y=0; the generator's world box is 384 blocks
starting at y=-64. The terrain already lives entirely inside 0 to 255, so **no block moves**: the
same generated chunk is written at the same coordinates in either format. Two things change at the
bottom of the world:

- the four all-rock sections below y=0 are dropped, because that space does not exist in this era;
- y=0 becomes a solid bedrock floor, because in 1.12.2 that is the world floor and a world without
  one is not a world any 1.12.2 client would accept.

That is what makes the modern world a usable control for the legacy one: seed N produces literally
the same blocks in both, so any difference between two renders of them is a difference in how the
world was read and resolved rather than in what was generated.

### The `level.dat`, and what is deliberately absent

A modern `level.dat` carries a `WorldGenSettings` compound whose per-dimension inline type is
where this project's reader gets the overworld's `min_y` and `height`. 1.12.2 predates the whole
concept and carries none, and that is not an omission to paper over: it is the actual shape of
every real 1.12.2 world, and inventing a `WorldGenSettings` would make the generated world easier
for the reader than any world it will ever meet.

The consequence is visible in a render and is measured rather than avoided.
`MCAWorld#loadDimensionType` finds no dimension settings, falls back to the default overworld, and
therefore believes the world runs from y=-64 to y=319 rather than 0 to 255. Nothing breaks:
`Chunk_1_12` has no sections below 0 and answers air for every block down there, so the renderer
simply scans a world box taller than the world. That is upstream's behaviour for a legacy world
too.

`generatorName`, `generatorVersion`, `generatorOptions`, `RandomSeed` and `MapFeatures` are the
1.12.2 spellings of settings the modern format moved into `WorldGenSettings`, and they are written
so the folder also opens as a normal world in a 1.12.2 client and in era-appropriate third-party
tools. Nothing reads a clock: `LastPlayed` is a fixed 0, because a timestamp would make two runs
of the same seed differ byte for byte.

## Configuration

```
node design/packages/worldgen/dist/cli.js --seed 22 --size 128 --format 1.12.2 --out ./out
```

| Option | Meaning |
|---|---|
| `--format 1.20.4` (default) or `--format 1.12.2` | Which chunk format to write |
| `--data-version 3700` or `--data-version 1343` | The same choice spelled as a DataVersion |
| `--seed`, `--size`, `--out`, `--name`, `--zip`, `--no-zip`, `--quiet` | As for the modern format |

Both spellings exist because both are how people refer to a world's era: a human says "1.12.2" and
a tool reading a chunk says "DataVersion 1343". They resolve to the same thing, and giving both at
once is an error only when they disagree. The two formats also default to different folder names,
so neither run overwrites the other.

The render harness takes its own options and fetches nothing:

```
node tools/oracle/render-1-12.mjs
node tools/oracle/render-1-12.mjs --seed 22 --size 128 --keep
```

It defaults to the resources `compare.mjs` already downloaded into
`tools/oracle/out/gate/bluemap-data/`. The default 128-block world is 8 by 8 chunks, which at the
default seed spans five of the generator's nine biomes and therefore covers grass, podzol, snow,
three wood species, the stone variants and the ground plants. A larger world adds render minutes
and no new block-states; a smaller one lands inside one biome and would pass every check on four
block ids.

## Failure modes

- **A modern block with no 1.12.2 equivalent** is substituted and counted, in the summary and on
  stderr. It is never dropped.
- **`--format` and `--data-version` given together and disagreeing** is an error. Given together
  and agreeing, it is not, because both are ordinary ways of naming the same era.
- **The reader falling back to the modern world box** is expected for this era, is explained
  above, and is asserted by a test rather than treated as a surprise.
- **Four block-states render differently or not at all in a modern resource pack.** These are
  flattening consequences rather than decoding bugs, and each is pinned by name in the harness:
  `minecraft:grass` (the modern overlay defines that name as the grass tuft, so a 1.12.2 grass
  block renders as a cross-shaped plant), `minecraft:podzol` (26.x keys its variants on a `snowy`
  property that did not exist in 1.12.2, so no variant matches), `minecraft:snow_layer` (renamed
  to `minecraft:snow` by the flattening, so nothing answers the old name), and `minecraft:snow`
  (the mirror image: the same name means the full block in 1.12.2 and the layer in a modern pack).
  The harness fails if an undocumented fifth appears **and** fails if one of the four quietly
  starts working, so the list cannot go stale in either direction.
- **The harness cannot find its resources.** It says so and stops; it downloads nothing itself.

## Security considerations

Nothing in the generator reads a clock, a network or an environment variable, so a world is a pure
function of its seed, its size and its format. That is what makes the byte-identical determinism
test possible, and it is also why a generated world can be published as a fixture without carrying
anything about the machine that produced it.

The render harness reads a Minecraft client jar and BlueMap's resource extensions from disk and
fetches nothing. Those files are the ones the modern parity gate already downloaded; this script
never reaches the network, so running it cannot pull a resource pack from anywhere.

Reading a legacy world is the same trust boundary as reading any other world: the region files are
untrusted input, parsed by the same decoders, and a malformed chunk is a decode failure rather
than something that reaches further in.

## Verification

### The decoding half is a unit test

`design/packages/worldgen/test/legacy-worldgen.test.ts` reads a generated world back through this
project's own `MCAWorld` and checks, among other things:

- the folder declares itself 1.12.2, which is what selects the legacy chunk reader at all, and
  DataVersion 1343 really does dispatch to `Chunk_1_12`;
- every block 1.12.2 cannot express is reported rather than lost quietly;
- the same seed produces byte-identical output, and the two formats write different folder names
  so neither overwrites the other;
- every written block decodes back to the block-state its id and meta mean, across the world;
- the 4-bit metadata survives, which is the half a byte array alone cannot hold;
- bedrock sits on the world floor with nothing at all below it;
- every biome byte resolves through the bundled legacy biome table;
- the `HeightMap` is served as an absolute y with no world-floor offset;
- sky light is present above the terrain and absent under it;
- the `snowy` property is put back by the legacy neighbour extensions;
- and the absent dimension settings do make the reader fall back to the modern world box.

Run it with `npx vitest run packages/worldgen` from `design/`.

### The rendering half is a script, and says why

Rendering needs a Minecraft client jar, BlueMap's resource extensions, a full resource-pack load
of roughly 2,100 textures and two complete map renders: a minute of work and a few hundred
megabytes of resident memory, on files that are downloaded rather than committed. So it is a
script rather than a unit test. Nothing is softened by that: every check is an assertion, a
failure exits non-zero, and the exact divergence is printed rather than summarised.

**There is no Java oracle for this era, and the script says so.** Upstream BlueMap 5.22 carries no
pre-flattening chunk loader at all, so there is no Java render of a 1.12.2 world to compare bytes
against, and there cannot be one without reviving a decade-old branch whose output format predates
everything this engine writes. The byte-exact gate the modern comparison runs is therefore
impossible here, and claiming otherwise would be the easiest way to make this look stronger than
it is.

What stands in for it is a **control render of the same terrain**. Both formats come from the same
generator, so rendering both and diffing the two maps isolates the format. The script asserts that
every material a tile references resolves to a gallery entry with an embedded texture, that no
part of the map is the missing-texture placeholder, that the map is made of at least fifteen
distinct materials rather than one repeated block, that no single material is more than 60 per
cent of it, that everything the modern render draws and the legacy one does not is one of the four
documented flattening gaps, that the legacy render draws nothing the modern one does not, and that
any material both draw in wildly different amounts is documented. Two further checks fail when a
documented gap or divergence stops being real, so the pinned lists cannot rot into fiction.

That is a weaker claim than byte equality and it is stated as such. It is also a real one, and it
is what found the four block-states the harness now pins.

## Suggested reading

- The `world-reading` article on the documentation site, for the decoder matrix this format is one
  branch of.
- The `test-world-generator` article, for the modern format and why a synthetic world exists at
  all.
- [Rendering a world in GitHub Actions](./render-in-actions.md), which renders generated worlds on
  runners.
