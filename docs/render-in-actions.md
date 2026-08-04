# Rendering a world in GitHub Actions

**This is for computers that cannot render a big world themselves.** Rendering is hours of
CPU and gigabytes of disk; on a thin laptop that is an afternoon of the fan at full speed
and, on some machines, a render that never finishes. A GitHub standard runner has 4 vCPU,
around 14 GB of free disk and nothing else to do, and this workflow will use as many of
them in parallel as the world needs. Your machine uploads the world and then waits.

No Java, no BlueMap and no local rendering: start the **Render world** workflow, wait, and
download the map as an artifact. The desktop app can drive the whole loop for you — see
[Doing it from the app](#doing-it-from-the-app) — and the map it brings back opens exactly
like one rendered locally.

### The price of that, stated up front

Advertising the upside alone is how somebody wastes an afternoon, so:

- **Uploading is the slow part now.** The world has to reach GitHub before anything can
  render it. A multi-gigabyte world on a domestic connection is measured in hours, not
  minutes, and it is bandwidth you pay for either in time or in a cap.
- **A private repository's Actions minutes are finite.** Public repositories get unlimited
  standard-runner minutes; private ones spend from a monthly allowance, and a sharded
  render spends one runner-minute per runner per minute — a 30-way split burns thirty
  times the wall-clock time.
- **A very large world can still exceed a job's budget.** Six hours is the hard limit per
  job; the plan splits to stay under it, and a world that needs more shards than the six
  declared waves can hold fails in the plan step rather than rendering part of itself.
- **There is an upload ceiling.** A world whose archive would pass a release asset's 2 GiB
  limit cannot be sent as one asset, which is what the `release-asset` source reads.

None of that makes it a bad trade for the machine this exists for. It makes it a trade.

When the world is too big for one job, the workflow splits it across parallel jobs and
merges the results. Getting that merge right is most of what this document is about,
because two of the three ways it can go wrong produce a map that looks fine and is
quietly incorrect.

<details>
<summary><b>Contents</b></summary>

- [Running it](#running-it)
- [Doing it from the app](#doing-it-from-the-app)
- [Mojang's EULA](#mojangs-eula)
- [How the split is decided](#how-the-split-is-decided)
- [Why shard edges land on block 32k+2](#why-shard-edges-land-on-block-32k2)
- [Texture ordinals: the trap, and the evidence](#texture-ordinals-the-trap-and-the-evidence)
- [The lowres layers, which are not a union](#the-lowres-layers-which-are-not-a-union)
- [What the merge does, layer by layer](#what-the-merge-does-layer-by-layer)
- [Verification](#verification)
- [End-to-end evidence](#end-to-end-evidence)
- [Limits and things this does not do](#limits-and-things-this-does-not-do)
- [Running the pieces locally](#running-the-pieces-locally)

</details>

## Running it

Actions → **Render world** → Run workflow.

| Input | What it does |
| --- | --- |
| `world-source` | `repository`, `url` or `release-asset` |
| `world` | where the world is, read according to `world-source` — see below |
| `dimension` | overworld, nether or end |
| `map-id` / `map-name` | the storage id used in paths, and the display name in the webapp |
| `output` | `artifact`, or `artifact-and-pages` to also publish it |
| `budget-minutes` | how long one job may spend rendering before the world is split (default 240) |
| `max-jobs` | cap on parallel jobs (default 64; GitHub itself refuses more than 256) |
| `force-shards` | skip the estimate and use exactly this many shards |

### `world`, one field with three meanings

| `world-source` | what `world` holds | example |
| --- | --- | --- |
| `repository` | a path inside this repository | `worlds/world` |
| `url` | a link to a `.zip` holding the world | `https://example.com/world.zip` |
| `release-asset` | an asset name or glob, optionally `tag/glob` | `world*.zip`, or `v1.4.0/world*.zip` |

For `release-asset` the tag defaults to `latest`. The split is on the **last** slash, and a
release asset's file name cannot contain one, so a tag that does — `release/1.4` — still
works.

> This used to be three separate inputs, consolidated because GitHub documents a cap of
> **ten** `workflow_dispatch` inputs and this file had twelve.

Whatever the source, the world is checked before anything is rendered: there has to be a
`level.dat` and a region directory holding `.mca` files for the dimension you asked for.
An archive with a wrapper folder inside it is handled — the check looks up to three
directories down — and a directory that is not a world fails with a message naming what
it found instead of rendering an empty map.

The result is the **rendered-map** artifact: the complete BlueMap webapp with the map
inside it. Serve the unzipped folder over http; opening `index.html` off the file system
will not work, because the webapp fetches its tiles.

### Publishing to Pages replaces the documentation site

`artifact-and-pages` publishes the map to this repository's GitHub Pages site. That is
the same Pages site the documentation workflow publishes to, and a Pages site holds one
deployment, so **the map replaces the documentation site until `pages.yml` next runs**.
The two workflows share the `pages` concurrency group so they queue instead of racing,
and the run summary says this out loud. If you want both permanently, publish the map
somewhere else.

## Doing it from the app

`design/packages/app/src/main/cirender/` drives the five manual steps above as one action:

```
upload the world  ->  start the workflow  ->  follow the run  ->  fetch the map  ->  register it
   (main/backup/)      (cirender/actions)     (cirender/sync)    (main/download/)   (main/render/)
```

It reuses what already exists rather than reimplementing any of it. The upload is the
backup subsystem — the same deterministic packer, the same append-only release rules, the
same public-repository warning, word for word ([backup.md](backup.md)). The transfer and
the unpack are the download subsystem's own. The credential comes from the app's GitHub
session. The map is mounted by the render subsystem, so it appears in the map list beside
every local render and the viewer cannot tell the two apart.

### What it refuses, and why each refusal exists

| Refusal | Why |
| --- | --- |
| `eula-not-accepted` | Mojang's licence has not been accepted on this computer. The app will not accept it for somebody; it points at the setting that already asks. |
| `public-not-acknowledged` | The repository is PUBLIC and the warning has not been accepted. A world carries builds, coordinates and whatever a friend left in a chest. |
| `upload-not-acknowledged` | Uploading a world sends it to GitHub, and that is said in as many words before it happens rather than after. |
| `world-too-large` | The archive would pass a release asset's 2 GiB limit. Refused **before** anything is packed, from the folder's own byte total. |
| `unsupported-dimension` | The project's map renders a dimension the workflow's `dimension` choice does not offer. Caught here rather than as GitHub's generic 422. |
| `map-shipped-in-parts` | The run published `map-lowres` plus hires parts. Unpacking the lowres alone gives a map that loads and has no detail at any zoom, which reads as a broken render. |
| `run-failure`, `run-timed_out`, ... | The run ended badly. The failing job is named and the tail of its log is carried back, and **no map is downloaded or registered**. |

### An unchanged world is not uploaded twice

Before packing anything, the world is fingerprinted: one `stat` pass hashing each file's
relative path, size and modification time. If that matches what was uploaded last time
**and** GitHub still holds that asset on that release, the upload is skipped entirely and
the workflow is dispatched against the release that is already there.

Both halves matter. The local record says what *was* uploaded; only GitHub can say what is
still there, and a release somebody deleted by hand would otherwise have a re-sync dispatch
a run whose first step cannot find the world. The fingerprint is a change detector rather
than a content digest — a file edited and restored to exactly its old size *and* mtime
reads as unchanged — so there is a **Upload again even if the world looks unchanged**
control for the case where it is wrong. Computing the real digest means packing the whole
world, which is most of the cost of the upload it would be avoiding.

### It resumes, because closing the app is the likeliest interruption

Every durable fact is written down as it happens: the fingerprint that was uploaded, the
tag and asset it went to, the run that dispatch produced, and how it ended. There is no
separate resume command — starting a sync reads that record first, so closing the
application during a four-hour render and reopening it afterwards finds the run by its id,
reads its outcome, and collects the map.

### Two GitHub credentials, one chosen per sync

A typical machine holds two: the app's own sign-in and `gh`'s. They are not
interchangeable — `gh` routinely carries an enterprise host, an SSO session an organisation
has already authorised, or scopes the in-app flow never asked for. So:

- the **in-app sign-in is preferred** when it exists and can actually see the workflow;
- **`gh` is a real fallback**, not an error message: `gh` on `PATH` plus `gh auth status`
  succeeding is enough to dispatch, follow and download without signing in to the app;
- "gh is not installed" and "gh is installed but nobody is signed in" are reported as
  different sentences, because they have different remedies;
- whichever is chosen **drives every call of that sync**. Dispatching on one credential and
  downloading on another works on a machine where both are authorised and fails halfway
  through on one where only one is;
- the route is shown on the screen before the button and named on every failure, because
  "permission denied" is unactionable when a person cannot tell which of their two sign-ins
  was refused.

`gh auth login` is **never** driven from inside the app. It suppresses its device-code
prompt when stdin is not a terminal, so a spawned one prints nothing and hangs for ever;
the app says which command to run in a real terminal and detects the result on the next
check. Uploading is the one thing `gh` cannot do here: an upload is a backup, and rerouting
it would mean a second uploader with its own release rules. With only `gh` available a
world that is already published renders, and one that needs uploading is refused with that
exact reason.

### What the workflow cannot be told

The map's own `maps/<id>.conf` is ninety-odd settings of HOCON and there are nine
`workflow_dispatch` inputs, of a documented maximum of ten. **None of the map config travels
through them.** A CI render uses BlueMap's defaults for everything the inputs do not name.
The app reads the project's map config, lists the top-level keys it holds, and says which
settings will not be applied — before the dispatch, not after the picture comes back
looking ordinary.

## Mojang's EULA

This workflow accepts [Mojang's EULA](https://www.minecraft.net/eula) on behalf of the
repository owner, who has already accepted it in the desktop application. There is no
tick box and no second confirmation: dispatch the workflow and it renders.

The desktop app checks that acceptance before it dispatches anything, and refuses when it
is missing. It has no tick box of its own for it either: the acceptance lives in one place,
asked once at first run, and a second door onto a legal acceptance is how one becomes a
button people click to get on with what they were doing.

The acceptance is real and worth stating plainly. BlueMap downloads a Minecraft client
jar from Mojang's servers to get the block models and textures, and it cannot render a
map without one — `accept-download: true` in `core.conf` is what permits that download.
The generated config file says so in a comment, and the run summary repeats it.

A fork that does not want to accept on its owner's behalf sets the repository variable
`BLUEMAP_ACCEPT_DOWNLOAD` to `false`. The render then refuses the download and fails
rather than proceeding.

## How the split is decided

The planner measures the world instead of trusting anything it was told:

1. Every `r.<x>.<z>.mca` file is found, and its **anvil location table** is read to count
   how many of its 1024 chunk slots are actually occupied. A region holding forty chunks
   is planned as forty chunks.
2. The bounding box is derived from the region files that exist.
3. The render time is estimated, and the estimate is printed with its assumptions.

The estimate starts from a real measurement: **3969 chunks rendered to 961 hires tiles in
80 seconds**, using the vendored BlueMap 5.22-27 CLI on a developer workstation. That is
49.6 chunks per second. Two adjustments follow, both stated in the run summary:

- **Runner slowdown, ×0.5.** A GitHub standard runner has 4 vCPU and is slower per core
  than the machine the reference came from.
- **Complexity, ×0.1 to ×1.0.** Terrain complexity dominates render time, and the cheapest
  proxy available before rendering is how many bytes a chunk takes on disk — the same
  block and entity variety that makes a chunk large makes it slow. The factor is
  `sqrt(4104 / bytesPerChunk)`, clamped, where 4104 is the reference world's bytes per
  chunk. It is capped at 1.0, so a world simpler than the reference is never assumed to
  be faster than it.

A ×1.5 safety margin is applied, and the shard count is
`ceil(estimatedSeconds / budgetSeconds)`.

This is an estimate and it says so. If you have measured your own world, pass the real
rate and every assumption above is skipped:

```
plan --rate 31.5 ...
```

The shard grid is laid over the **region** grid, kept as close to square as the world's
shape allows. Shards whose rectangle contains no region files at all are dropped rather
than started, so a sparse or corridor-shaped world does not spend jobs rendering nothing.

### More than 256 jobs

GitHub refuses a matrix that expands past 256 entries. A plan needing more shards than
that is therefore rendered in **sequential waves** of at most 256, each wave a matrix that
waits for the one before it. Nothing is truncated and no shard is silently enlarged to fit:
600 shards become three waves of 256, 256 and 88.

The workflow declares six wave jobs, so 1,536 shards. A plan needing more fails in the plan
step with the number it needs rather than rendering part of the world. Every wave is
independently resumable, so a run that dies in wave 7 costs that wave and not the six
before it. [resumable-renders.md](resumable-renders.md) has the arithmetic, the caching and
the completion markers that make it work.

`--max-jobs` still caps the plan, and when the cap is what binds, **each shard covers a
larger area** — the world is never truncated. The run summary says so in as many words,
gives the number of jobs the estimate wanted, and gives the per-shard time to expect
instead of the budget:

> The estimate asked for 1350 jobs but only 256 fit inside the 256-job limit, so each
> shard covers a larger area and is expected to take about 2h 11m rather than the 1h
> budget. Nothing is being skipped; the jobs are simply longer.

If those shards would exceed the six-hour job limit, raise `max-jobs` so more shards are
planned across more waves, or raise `budget-minutes` so the arithmetic is honest and split
the render by dimension.

## Why shard edges land on block 32k+2

This is the detail that makes everything else work.

BlueMap's hires tile grid is **32 blocks with an offset of 2**. `BmMap` builds it as
`new Grid(settings.getHiresTileSize(), 2)`, and the `settings.json` of any rendered map
confirms it:

```json
"hires": { "tileSize": [32, 32], "scale": [1, 1], "translate": [2, 2] }
```

So hires tile column `cx` covers blocks `32*cx + 2` through `32*cx + 33`. Tile 15 is
blocks 482 to 513, and tile 16 starts at 514.

An anvil region is 512 blocks, and 512 is a multiple of 32 — but **not** of 32 with the
offset. A shard cut on a region boundary therefore lands *inside* a hires tile, and both
neighbouring shards render that tile, each with the other half masked away. They write
the same file path with different contents, one silently wins, and a 32-block stripe of
terrain is missing from the map.

Measured, with a cut at block 512 on a 1000×1000 world:

```
lod0  a=496  b=496  overlap=31  identical=0  DIFFERING=31
```

Thirty-one hires tiles produced twice, in two different versions, with no error anywhere.

The planner therefore rounds every interior cut up to the next hires tile boundary:
a region edge at `512*r` becomes `512*r + 2`. Two block columns move to the preceding
shard, which costs nothing. The outermost shard on each side is left **unbounded**, so
the shards' masks partition the whole plane and nothing can fall between two of them.
`validatePlanAlignment` checks both properties before any rendering starts, because the
failure it prevents is invisible afterwards.

### `render-edges: false`

The generated shard configs turn `render-edges` off. With it on, BlueMap treats every
block outside the render-mask as air — correct for someone deliberately cutting a slice
out of a world, wrong for a shard, whose neighbouring blocks are real and are being
rendered by somebody else. Leaving it on changes the lighting of the tiles along each
shard's edge and produces visible seams.

With it off, the mask only decides which columns get rendered, and a shard's tiles come
out **byte for byte identical** to the same tiles from an unsharded render. That is the
property the whole hires merge rests on, and it is measured below.

## Texture ordinals: the trap, and the evidence

Rendered tiles do not name their textures. They store an **ordinal** into the map's
`textures.json`, which is a bare array indexed by that ordinal. If two shards number
their textures differently, merging their tiles produces a map where blocks render with
each other's textures — stone looking like leaves — and nothing anywhere reports an
error. It is the single most dangerous thing about sharding a BlueMap render.

**The ordinals are deterministic for a fixed resource pack.** Two independent lines of
evidence:

### From the source

`core/src/main/java/de/bluecolored/bluemap/core/map/TextureGallery.java`:

```java
public synchronized void put(ResourcePool<Texture> texturePool) {
    this.put(ResourcePack.MISSING_TEXTURE, ResourcePack.MISSING_TEXTURE.getResource()); // put this first
    texturePool.entrySet()
            .stream()
            .sorted(Comparator
                    .comparing((Map.Entry<Key, Texture> entry) ->  {
                        Texture texture = entry.getValue();
                        return texture != null && texture.getColorPremultiplied().a < 1f;
                    })
                    .thenComparing(entry -> entry.getKey().getFormatted())
            )
            .forEach(entry -> put(entry.getKey(), entry.getValue()));
}
```

Ordinals are assigned by `nextId++` in iteration order, so the question is whether that
order is total. It is:

- The missing-texture goes in first and unconditionally, so it is always ordinal 0.
- The pool is then sorted by half-transparency, then by `Key#getFormatted()`.
- `Key` is a map key, so its formatted value is unique within the pool — `Key#equals` is
  `formatted == that.formatted` on an interned string, so two distinct keys cannot share
  a formatted value.

A unique final sort key makes the comparator a **total order**, so the sequence is a pure
function of the pool's contents and does not depend on `HashMap` iteration order. The
audit in this repository's port said the same; this confirms it against the Java.

`BmMap` reinforces it: the constructor loads any gallery already in storage before
calling `put`, and `put(Key, Texture)` preserves an existing key's ordinal. So a shard
pre-seeded with a gallery keeps those ordinals, and a shard starting empty derives them
from the pool alone.

### From an actual render

Two disjoint shards of the same generated world, rendered separately:

```
=== textures.json.gz sha256
dfb92b13e6cf46bbc1a7fa0d0c565daab21ddb40a47b1d26595a451f0baaca91  shard a
dfb92b13e6cf46bbc1a7fa0d0c565daab21ddb40a47b1d26595a451f0baaca91  shard b
=== decompressed sha256
dacf8e325dbf3085999b4149e03e1be2bf4c9efedb7b3c14cc71f36c41b19b18  shard a  (2424728 bytes)
dacf8e325dbf3085999b4149e03e1be2bf4c9efedb7b3c14cc71f36c41b19b18  shard b  (2424728 bytes)
VERDICT: textures.json IDENTICAL
```

Byte-identical, compressed and decompressed, and identical again to the unsharded
reference render. `settings.json` matched across all three too.

### So the merge asserts it anyway

Determinism holds *for a fixed resource pack*. What is not guaranteed is that every shard
resolved the same one: a client jar downloaded at a moment when Mojang published a new
version, a mod jar present on one runner and not another, a partial download. Any of
those changes the pool, changes the ordinals, and corrupts the merge silently.

So `mergeShardMaps` decompresses every shard's `textures.json`, compares the bytes, and
**refuses to merge** if any differ, naming the shards and their hashes. The comparison is
on the decompressed bytes so a difference in gzip settings can never be mistaken for a
difference in ordinals. There is a test that feeds it two galleries holding the same two
textures in opposite order and asserts the merge refuses.

## The lowres layers, which are not a union

Hires tiles can be unioned once the cuts are aligned. The lowres layers cannot, for two
independent reasons, and both were found by measurement rather than by reading.

### Shards actively erase each other's terrain

A shard does not simply skip the tiles outside its render-mask. `HiresModelManager`:

```java
public void unrender(Vector2i tile, TileMetaConsumer tileMetaConsumer) {
    storage.delete(tile.getX(), tile.getY());
    Color color = new Color();
    tileGrid.forEachIntersecting(tile, Grid.UNIT, (x, z) ->
            tileMetaConsumer.set(x, z, color, 0, 0)
    );
}
```

It **deletes** the tile and writes transparent black at height 0 and block-light 0 across
every column that tile covered. Those writes land in the shared lod-1 lowres tiles, and
`LowresTile#set` stamps alpha `0xFF` on the meta pixel for an erasure exactly as it does
for real terrain. A shard's lowres tile therefore contains active denials of terrain its
neighbours rendered, and "take the first shard that wrote this pixel" would let the
denials win.

Measured on the same two-shard render: **509409 lod-1 pixels** where one shard held real
terrain and the other held an erasure.

The merge resolves it by ranking three states rather than two:

| State | Meta alpha | Colour and height | Wins against |
| --- | --- | --- | --- |
| rendered terrain | 0xFF | any non-zero | everything |
| erased, or a genuinely void column | 0xFF | all zero | untouched |
| never touched | 0 | all zero | nothing |

An erasure and a truly void column are indistinguishable, and that is harmless: both
shards then write the identical empty pixel, so the merged result is the same either way.
Two shards holding *different* terrain for one pixel is impossible when every column is
rendered by exactly one shard, so that case is reported as an error rather than guessed
at.

### Lod 2 and above are wrong at the source

BlueMap builds each coarse lod while rendering, in `LowresLayer#saveTile`: every time it
saves a lod-1 tile it averages 5×5 pixel blocks out of it and writes them into lod 2.

A shard's lod-1 tile is half empty — lowres tiles are 500 blocks square on an unoffset
grid, so they straddle every shard cut no matter where it is put. Averaging over it folds
the pixels the shard never rendered in as transparent black. The resulting lod-2 pixel is
**wrong**, and it carries the same alpha `0xFF` as a correct one, so no amount of
compositing can tell the two apart.

Measured: of shard `p`'s lod tiles, only 2 of 4 at lod 2 and 2 of 4 at lod 3 matched the
reference render, versus 14 of 16 at lod 1.

So the shards' lod 2 and above are **discarded**, and the pyramid is rebuilt from the
merged lod 1 — which is the only complete source of truth, because lod 1 is written
directly from block data. The rebuild reimplements `LowresLayer#saveTile`'s arithmetic,
including the shared-edge writes that keep tile seams invisible.

It reimplements the float arithmetic too. Upstream's `Color` holds `float` fields and
`Color#getInt` **truncates** rather than rounds, so averaging twenty-five samples in
double precision and truncating lands on a different byte from doing it in single
precision. Every operation in the rebuild is wrapped in `Math.fround`. A uniform group of
colour 40 comes back as 39, in Java and here alike; reproducing that is the point, since
a tidier 40 would put every rebuilt tile permanently out of step with a directly rendered
one.

## What the merge does, layer by layer

| Layer | Treatment |
| --- | --- |
| `textures.json.gz` | asserted byte-identical across shards, then copied from shard 0 |
| `settings.json` | asserted byte-identical, then copied from shard 0 |
| `tiles/0` (hires) | disjoint union, with zero path collisions asserted |
| `tiles/1` (lod 1) | composited pixel by pixel, terrain over erasure |
| `tiles/2`+ | shards' versions discarded, rebuilt from the merged lod 1 |
| `live/` | placeholders, copied from shard 0 |
| `assets/` | union; differing duplicates are an error |
| `rstate/` | **not merged** — see below |

`rstate` is BlueMap's own record of which tiles it considers up to date. Its files group
tiles into regions that straddle shard cuts, so no shard's copy describes the merged map.
Carrying one anyway would make a later incremental render skip tiles that still need
doing. Leaving it out makes the next render start from scratch: slow and correct, rather
than fast and wrong. The published map does not read it. The merge counts what it left
out and says so.

A shard's `rstate` **is** cached between runs, which does not contradict this: it is cached
per shard, under a key nothing else can restore, and it goes back to the same shard
rendering the same rectangle rather than into a merged map.
[resumable-renders.md](resumable-renders.md#how-rstate-is-cached-without-reintroducing-the-merge-bug)
sets the two side by side.

## Verification

The merge is checked rather than assumed, because everything it can get wrong is silent:

- **Hires tiles are a disjoint union.** No path was produced by more than one shard.
- **Hires tile count.** The shards' totals equal the merged total, with the missing and
  unexpected counts reported separately.
- **Hires tiles copied without alteration.** Every tile is compared byte for byte against
  the shard it came from.
- **Shard-boundary tiles decompress and parse.** Tiles either side of every cut are
  gunzipped and checked for a PRBM header — version byte `1` then the format-info byte
  `0b00000111` that `PRBMWriter` emits. These are exactly the tiles a misaligned split
  would have damaged.
- **Map metadata present.** `settings.json` and a texture gallery are both there.
- **Lowres pyramid built at every lod.** No lod promised by the map settings is empty.

Each check reports its numbers rather than a pass mark, and the run summary tabulates
them.

## End-to-end evidence

A 1000×1000 generated world (3969 chunks, 4 region files) was rendered three times: once
whole, and once as two shards cut at block 514 with `render-edges: false`.

Shard output against the unsharded reference:

```
ref=961  p=496  q=465  p+q=961
PATH COLLISIONS between p and q: 0
missing from union: 0        extra in union: 0
byte-identical to reference: 961/961
```

Merged output against the unsharded reference:

```
hires: ref=961 merged=961 missing=0 extra=0 byteDiff=0
lod1:  refTiles=16 mergedTiles=16 pixels=4016016 colorDiff=0 metaDiff=0
lod2:  refTiles=4  mergedTiles=4  pixels=1004004 colorDiff=0 metaDiff=0
lod3:  refTiles=4  mergedTiles=4  pixels=1004004 colorDiff=0 metaDiff=0
```

Every hires tile byte-identical, and every one of 6024024 lowres pixels identical in both
colour and metadata, at every level of detail.

### And again as a 2×2 split, through the real CLI

A one-dimensional cut never reaches the case where four shards meet on one corner, so the
whole pipeline was then run again as a 2×2 grid — `plan`, four `config` calls, four
renders, `merge`, `verify` — using the same commands the workflow runs:

```
render-mask per shard:  {max-x 513, max-z 513}  {min-x 514, max-z 513}
                        {max-x 513, min-z 514}  {min-x 514, min-z 514}

Merged 961 hires tiles (256 + 240 + 240 + 225), composited 15 of 16 lod-1 tiles
overruledErasures: 1281987      conflictingPixels: 0      collisions: []

ok  hires tiles are a disjoint union
ok  hires tile count: 256 + 240 + 240 + 225 = 961; 0 missing, 0 unexpected
ok  hires tiles copied without alteration: 961 compared byte for byte, 0 differ
ok  shard-boundary tiles decompress and parse: 16 checked, 0 problems
ok  map metadata present
ok  lowres pyramid built at every lod

hires: ref=961 merged=961 missing=0 extra=0 byteDiff=0
lod1:  pixels=4016016 colorDiff=0 metaDiff=0
lod2:  pixels=1004004 colorDiff=0 metaDiff=0
lod3:  pixels=1004004 colorDiff=0 metaDiff=0
```

Identical again. The merged map is not merely close to the map an unsharded render would
have produced; on this world it is the same map.

That is one world on one machine. It is a strong result and it is not a proof for every
world: it exercised no mods, no custom resource pack, and one flat generated terrain.

## Limits and things this does not do

- **The world travels as an artifact.** It is fetched once and uploaded, so a thirty-way
  split does not download the same archive thirty times. Artifact storage and the
  runner's ~14 GB of free disk are the practical ceiling on world size.
- **Six hours per job.** The workflow sets a 350-minute timeout and the render step a
  300-minute one. A shard that exceeds it does not lose its work: its render state is
  cached and a re-dispatched run carries it on. Lower `budget-minutes` so more shards are
  planned if you would rather it did not happen at all. See
  [resumable-renders.md](resumable-renders.md).
- **Nether and end are rendered as separate runs**, one dimension per run, each with its
  own `map-id`.
- **Markers, players and other live data are not rendered.** Placeholder `live/` files are
  carried through so the webapp has something to load.
- **The merge is single-threaded Node.** On a very large map the lod rebuild is the slow
  part; it is proportional to the lod-1 tile count, not to the hires tile count.
- **`rstate` is not merged**, so a later incremental render of the merged map re-renders
  everything.
- **The app's CI sync sends the world as one release asset**, so its ceiling is GitHub's
  2 GiB per asset — refused before packing rather than discovered after an hour of it. A
  larger world can still be rendered by this workflow through the `repository` or `url`
  sources, or dimension by dimension.
- **The app collects only the single `rendered-map` artifact.** A map that shipped in parts
  is refused with the artifacts named, and assembled by hand from the run summary.
- **Cancelling a sync in the app stops watching the run, not the run.** A render already
  going on GitHub carries on there, and a later sync can still collect it.

## Running the pieces locally

The logic is a workspace package, not shell in the workflow, so all of it runs locally:

```bash
cd design
pnpm --filter "@material-bluemap/render-actions..." run build

node packages/render-actions/dist/cli.js plan   --world path/to/world --out plan.json
node packages/render-actions/dist/cli.js config --plan plan.json --shard 0 --world path/to/world
node packages/render-actions/dist/cli.js merge  --shards shards --plan plan.json --out map/world
node packages/render-actions/dist/cli.js verify --plan plan.json --shards shards --merged map/world
```

Each command takes `--help`. The tests cover world measurement against a world this
repository generates itself, shard planning for one shard, many shards and a world that
would exceed 256 jobs, the lowres composite and lod rebuild, and merge failures including
a deliberate `textures.json` mismatch:

```bash
cd design
npx vitest run packages/render-actions
```
