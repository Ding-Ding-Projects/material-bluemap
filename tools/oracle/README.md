# `tools/oracle` — the Phase D gate

```
node tools/oracle/compare.mjs
```

Renders one generated world **twice** — once with upstream BlueMap's own Java engine,
once with this project's TypeScript engine — and compares the two map directories. The
TypeScript mesher is finished when this exits `0`, and not before.

> [!IMPORTANT]
> This harness never weakens a comparison to make it pass. When the port is not
> byte-identical yet, saying so precisely **is** the deliverable. A test named after a
> comparison it never ran is worse than no test, because it retires the question.

<details>
<summary><b>Contents</b></summary>

- [Why there is an oracle at all](#why-there-is-an-oracle-at-all)
- [Running it](#running-it)
- [What is compared, and how strictly](#what-is-compared-and-how-strictly)
- [What a divergence report looks like](#what-a-divergence-report-looks-like)
- [While the engine cannot render yet](#while-the-engine-cannot-render-yet)
- [The reference render, and its cache](#the-reference-render-and-its-cache)
- [`selftest.mjs` — proving the gate can fail](#selftestmjs--proving-the-gate-can-fail)
- [`render-1-12.mjs` — the 1.12.2 half, which the gate cannot reach](#render-1-12mjs--the-1122-half-which-the-gate-cannot-reach)
- [Files](#files)
- [Troubleshooting](#troubleshooting)

</details>

## Why there is an oracle at all

Decision D17 put upstream's Java engine into the product, so the reference implementation
is built and runnable on this machine. That turns "is the port correct?" from a judgement
call into a byte comparison: the same world, the same config, two engines, and a
`diff`. Everything here exists to make that diff cheap to run and useful to read.

The world comes from `@material-bluemap/worldgen`, which writes Anvil format directly
from this repository. No Minecraft server, no client, nothing downloaded at generation
time, and byte-identical for a given seed — so the two renders are genuinely reading the
same bytes.

## Running it

```bash
# the whole gate: generate, render twice, compare
node tools/oracle/compare.mjs

# a smaller world while iterating (a 200x200 world renders in ~3s, 1000x1000 in ~80s)
node tools/oracle/compare.mjs --seed 7 --size 200

# render and cache the java reference, then stop
node tools/oracle/compare.mjs --reference-only

# machine-readable report as well as the printed one
node tools/oracle/compare.mjs --json tools/oracle/out/gate/report.json
```

| Option | |
| --- | --- |
| `--seed <n>` | world seed (default `1`) |
| `--size <blocks>` | edge length of the generated square (default `1000`) |
| `--map-id <id>` / `--map-name <name>` | storage id and display name (default `overworld` / `Overworld`) |
| `--dimension <key>` | dimension to render (default `minecraft:overworld`) |
| `--work <dir>` | working directory (default `tools/oracle/out/gate`) |
| `--threads <n>` | java render threads (default `4`) |
| `--max-report <n>` | how many divergences to print in full (default `5`) |
| `--json <path>` | also write the full report as json |
| `--refresh` | re-render the java reference even if it is cached |
| `--reference-only` | render and cache the reference, then stop |
| `--build-jar` | build the reference jar with Gradle if it is missing |
| `--no-accept-download` | refuse the Minecraft client-jar download |

| Exit code | Means |
| --- | --- |
| `0` | the two renders are identical |
| `1` | they differ, **or** the TypeScript engine produced no output |
| `2` | the harness could not run — no jar, no world generator, a failed render |

### Prerequisites

- **A Java runtime** and the CLI shadow jar at
  `vendor/BlueMap/implementations/cli/build/libs/cli-*-shadow.jar`. Build it with
  `node tools/build-jars.mjs --only cli`, or pass `--build-jar`.
- **The built world generator** at `design/packages/worldgen/dist/cli.js`
  (`pnpm --filter @material-bluemap/worldgen build` inside `design/`).
- **The built engine** at `design/packages/engine/dist/index.js` for the TypeScript half
  (`pnpm -r build` inside `design/`). Without it the harness still runs and reports that
  the engine produced no output.
- **Network access on the first run only.** BlueMap downloads a Minecraft client jar for
  block models and textures; `accept-download: true` in the generated `core.conf` is what
  permits that, and it accepts [Mojang's EULA](https://www.minecraft.net/eula) on the
  repository owner's behalf. `--no-accept-download` refuses it (and the render then
  fails, which is the honest outcome rather than a silently untextured map). The jar is
  cached in the work directory and reused by both engines, so the two renders are reading
  the same resources as well as the same world.

## What is compared, and how strictly

| What | Where | How |
| --- | --- | --- |
| **hires tiles** | `tiles/0/**.prbm.gz` | gunzipped, then **byte for byte** |
| **lowres tiles** | `tiles/<lod>/**.png` | bytes first; on any difference, decoded and compared **pixel for pixel** |
| **textures.json** | `textures.json.gz` | gunzipped, then **byte for byte** (plus a json-path summary when it differs) |
| **render state** | `rstate/**.dat` | gunzipped, then **byte for byte** |
| **settings / markers / players** | `settings.json`, `live/*.json` | **by value** |
| anything else the render wrote | | byte for byte |

Two of those are not byte comparisons, and both are deliberate rather than convenient:

- **PNGs are compared on pixels.** Two encoders write different bytes for the same image
  — different per-row filter choices, a different zlib level, a different set of ancillary
  chunks — so a byte-only check would fail a render that is exactly right. This is
  decision **D3** ("PNG parity checked on decoded pixels, never bytes"). The harness
  compares the bytes *first*, and reports a pixel-identical-but-byte-different pair as a
  **re-encode** in its own column rather than folding it away, so a sudden crop of them
  is still visible.
- **`settings.json`, `markers.json` and `players.json` are compared by value.** Gson
  html-escapes `=`, `<`, `>`, `&` and `'` inside strings; `JSON.stringify` emits them
  literally. Same document, different bytes.

Nothing else is softened. In particular the hires tiles — the actual mesh — are
decompressed and compared byte for byte, which is the gate.

A file present on one side and not the other is reported by name, never counted as
agreement, and fails the run.

## What a divergence report looks like

```
  category     compared  matching  differing  re-encoded  java-only   ts-only
  hires               2         1          1           0          1         1
  live                2         1          1           0          0         0
  lowres              2         1          1           1          0         0
  settings            1         1          0           0          0         0
  textures            1         0          1           0          0         0

  1 file(s) the java render wrote and the typescript render did not:
    tiles/0/x9/z9.prbm.gz

  first 5 divergence(s):

  tiles/0/x0/z1.prbm.gz  [hires/byte]
    first differing byte at offset 37: java has 0x25, typescript has 0xaa (java is 64 bytes, typescript is 64)
      bytes 21..53, the differing byte in [brackets]
      java      : 15 16 17 18 19 1a 1b 1c 1d 1e 1f 20 21 22 23 24 [25] 26 27 28 ...
      typescript: 15 16 17 18 19 1a 1b 1c 1d 1e 1f 20 21 22 23 24 [aa] 26 27 28 ...

  tiles/1/x0/z1.png  [lowres/pixel]
    1 of 54 pixels differ; the first is at (x=4, y=2) in the colour half: java rgba(28, 22, 8, 255), typescript rgba(28, 23, 8, 255)

  textures.json.gz  [textures/byte]
    first differing byte at offset 55: java has 0x64, typescript has 0x73 (java is 62 bytes, typescript is 62)
      as json: $[1].id: java has "minecraft:block/dirt", typescript has "minecraft:block/sand"
```

Three details in that output are load-bearing:

- The **byte offset is into the decompressed tile**, not into the gzip stream, so it maps
  onto the PRBM layout directly.
- A lowres pixel is located in **the colour half or the height/blocklight half**. A
  `LowresTile` is one image of `(size+1) × (size+1)*2`: colour on top, packed height and
  block-light underneath. "Row 431 differs" means nothing without knowing which half it
  is in.
- A differing `textures.json` is reported **as bytes and as a json path**, because
  "element 412's key changed" is actionable and "byte 9134 differs" is not.

## While the engine cannot render yet

Phase D is written by several agents at once, and until the mesher lands the TypeScript
engine genuinely cannot render. That is reported as a result, not as a crash:

```
  RESULT: the TypeScript engine produced no output.
  the TypeScript engine cannot render yet: it exports no FileStorage, BmMap,
  HiresModelManager, LowresTileManager. Phase D is still being written.

  the java reference is rendered and cached at:
    .../tools/oracle/out/gate/reference/web/maps/overworld
```

The exit code is `1` — this is not a pass — but the reference is rendered and cached, so
the first agent to finish a renderer gets the comparison in seconds rather than in eighty.
`render-ts.mjs` names the exports it is still waiting for, which is also how "not written
yet" stays distinguishable from "written and wrong".

## The reference render, and its cache

`compare.mjs` writes a complete BlueMap CLI config into the work directory and runs
`java -jar <cli-shadow.jar> -c <configDir> -r -g`.

> [!WARNING]
> **The CLI resolves its storage root against the working directory, not against the
> config folder.** A relative `root:` in `storages/file.conf` puts the tiles wherever the
> process happened to start, and the harness then reports "the render produced nothing".
> Every path the harness writes is absolute, and the child process' cwd is pinned as well,
> so neither can drift.

The reference is cached in `tools/oracle/out/gate/reference/`, keyed by the jar filename,
the world path and a hash of the exact config bytes. Change any of those — or pass
`--refresh` — and it re-renders. A stale reference silently compared against is the one
failure mode that would make every result meaningless, so the key covers everything that
can move.

## `selftest.mjs` — proving the gate can fail

```
node tools/oracle/selftest.mjs
```

A gate nobody has ever seen fail is not evidence of anything: an inverted condition, a
swallowed exception or a classifier that quietly routes hires tiles into a loose
comparison reports "identical" forever and everyone believes it.

So the self-test builds two synthetic map directories with **known** differences planted
in them and asserts that each one is found, named and located: a single byte flipped deep
inside a gzipped hires tile (offset asserted), a single pixel changed in a lowres tile
(coordinates asserted), a changed `textures.json` entry (json path asserted), a file on
one side only, and — as controls — a gzip payload compressed at two different levels, a
PNG written with two different row filters, and gson's html-escaping in `settings.json`,
all three of which must **not** count as differences.

It needs no jar, no world and no render, runs in about a second, and belongs in CI.

## `render-1-12.mjs` — the 1.12.2 half, which the gate cannot reach

```
node tools/oracle/render-1-12.mjs
```

The gate above compares against upstream, and **upstream 5.22 cannot read a 1.12.2 world at
all** — `core/.../world/mca/chunk/` holds `Chunk_1_13`, `_1_15`, `_1_16` and `_1_18` and
nothing older. So the byte comparison that answers "is the port correct?" for a modern world
has nothing to compare against for a pre-flattening one, and no amount of harness work
changes that.

This script is what is possible instead, and it is careful to claim only that. It generates
the same seed twice — once as 1.12.2 (`worldgen --format 1.12.2`) and once as 1.20.4 — and
renders both with the same `render-ts.mjs` driver. Because both worlds come from one
`TerrainGenerator`, the modern render is a **control for the same terrain**: any block
present in one map and absent from the other is a difference in how the world was read and
resolved, not in what was generated. On top of that it parses every hires tile as PRBM with
a generic reader that must arrive exactly at the end of the file, and checks every material
index against the emitted `textures.json`.

It reuses the client jar and `resourceExtensions.zip` that `compare.mjs` downloaded into
`out/gate/bluemap-data/` and fetches nothing itself. Fourteen assertions, roughly a minute,
non-zero exit on any failure, and a full material table in `out/legacy/render-1-12-report.json`.

`KNOWN_LEGACY_RENDER_GAPS` and `KNOWN_DIVERGENT_MATERIALS` at the top of the script are a
finding written as a regression gate: four block-states that a modern resource pack resolves
wrongly for a legacy world. The divergence must be *exactly* those sets, so a new one
appearing and an old one being fixed both fail the run. See the 2026-08-04 section of
`design/HANDOFF.md` for what they are and why.

## Files

| | |
| --- | --- |
| `compare.mjs` | the entry point: orchestrate, compare, report, choose the exit code |
| `render-ts.mjs` | drives this project's TypeScript engine in its own process; prints one json result whatever happens |
| `selftest.mjs` | plants known divergences and asserts the comparison finds them |
| `render-1-12.mjs` | renders a 1.12.2 world, checks the tiles, and diffs it against a modern control render of the same terrain |
| `lib/javaOracle.mjs` | world generation, config writing, the Java render and its cache |
| `lib/tsEngine.mjs` | invokes `render-ts.mjs` and normalises its answer |
| `lib/compareMaps.mjs` | file classification and the comparison itself |
| `lib/diff.mjs` | the divergence reports — byte windows, pixel locations, json paths |
| `lib/png.mjs` | a dependency-free PNG reader (`tools/` installs nothing) |
| `lib/util.mjs` | subprocesses, directory walking, hashing, logging |
| `out/` | gitignored working state: worlds, both renders, the cached reference |
| `.gradle/` | gitignored Gradle user home for the vendored build |

Everything here runs on a plain Node with no install step, exactly like the rest of
`tools/`. The one thing it cannot do without the workspace is render the TypeScript side,
and that runs as a child process against the built `design/packages/engine/dist`.

## Troubleshooting

**"no reference jar found"** — build it: `node tools/build-jars.mjs --only cli`, or pass
`--build-jar`. Note that Gradle needs the vendored submodules and full tags; see
`tools/README.md`.

**"the world generator is not built"** — `pnpm --filter @material-bluemap/worldgen build`
inside `design/`.

**"the java render produced no map directory"** — almost always the working-directory
trap above. Check that `storages/file.conf` in the work directory holds an absolute
`root:`.

**"no minecraft client jar found in the reference data directory"** — the reference render
was run with `--no-accept-download`, or the download failed. The TypeScript render has no
resources to work from in that state, and the harness says so rather than comparing an
untextured map against a textured one.

**The comparison says every hires tile differs at offset 0** — check the compressions
match before suspecting the mesher: the harness gunzips both sides, so a TypeScript
render configured with `Compression.NONE` writes `.prbm` where the reference writes
`.prbm.gz`, and the two file sets then do not intersect at all.
