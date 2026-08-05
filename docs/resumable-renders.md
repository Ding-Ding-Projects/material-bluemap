# Rendering that survives being interrupted

A render of a large world takes hours. In that time the application will be closed, the
machine will sleep, the power will go out, and a CI job will hit its six hour ceiling.
None of that may cost the work already done.

Almost none of it has to, because **BlueMap already renders incrementally**. Everything
below is built on that one fact, and most of the work is not checkpointing at all: it is
knowing that a render was left unfinished, and being careful not to destroy what it had
finished.

<details>
<summary><b>Contents</b></summary>

- [What BlueMap already does](#what-bluemap-already-does)
- [On the desktop](#on-the-desktop)
  - [The session record](#the-session-record)
  - [Detecting a render whose application never came back](#detecting-a-render-whose-application-never-came-back)
  - [Cancelled is not crashed](#cancelled-is-not-crashed)
  - [Refusing a resume whose settings changed](#refusing-a-resume-whose-settings-changed)
  - [Crash-safe writes](#crash-safe-writes)
  - [The IPC surface](#the-ipc-surface)
- [In GitHub Actions](#in-github-actions)
  - [Cache for the working state, an artifact for the output](#cache-for-the-working-state-an-artifact-for-the-output)
  - [The cache key, and the trap in it](#the-cache-key-and-the-trap-in-it)
  - [Completion markers](#completion-markers)
  - [More shards than one matrix can hold](#more-shards-than-one-matrix-can-hold)
  - [Merging a map too large for one runner](#merging-a-map-too-large-for-one-runner)
  - [How `rstate` is cached without reintroducing the merge bug](#how-rstate-is-cached-without-reintroducing-the-merge-bug)
- [Verification](#verification)
- [Limits and things this does not do](#limits-and-things-this-does-not-do)

</details>

## What BlueMap already does

BlueMap keeps its own record of what it has rendered, in a `rstate` directory beside the
tiles. `FileMapStorage` names the path:

```java
private static final String RENDER_STATE_PATH = "rstate";
```

Inside it are three `CellStorage` layers, each a grid of small per-region cells:
`MapTileState` (which hires tiles exist and when they were rendered), `MapChunkState`
(which chunks have changed) and `MapRegionState`. A plain `-r` re-run asks
`TileActionResolver` what each tile needs given that state and renders only what has
actually changed.

So a render that got sixty percent of the way through a world and died has sixty percent
of the world on disk **and** the bookkeeping that says so. Resuming is a re-run of the
same render, with two rules:

1. **Destroy nothing.** No deleting the output, no clearing `rstate`, and no `-f`. Every
   one of those turns a resume back into a full render, which is the outcome the whole
   feature exists to avoid.
2. **Same settings, or no resume.** Rendering the same map with different settings on top
   of tiles produced by the old ones gives a map that is half one thing and half the
   other, with nothing anywhere to say so.

## On the desktop

`design/packages/app/src/main/render/session.ts` and `resume.ts`.

### The session record

Every render writes `session.json` into its own workspace, beside the provenance record:

```
<storageDir>/<renderId>/
  render.json     which engine rendered this, and how it ended       (provenance.ts)
  session.json    what is running right now, and how far it got      (session.ts)
  config/         the config the CLI was pointed at
  web/            settings.json, maps/<id>/tiles/... and maps/<id>/rstate/
```

Two files rather than one, deliberately. `render.json` is the attribution record and is
written twice, at the start and at the end; widening it into a live progress file would
mean rewriting the record of which engine produced these tiles every ten seconds for the
whole of a six hour render.

The session carries the render id, every map with its own world folder and dimension, the
config directory, the output root, a hash of the settings, the engine and its version, the
start time, the last observed progress, and a status of `running`, `completed` or
`interrupted`. An interruption also carries its reason.

Progress writes are throttled: the first one lands immediately, because a render that has
started moving is worth knowing about, and the rest are written at most every five seconds.
Whatever ends a render always writes, so the number on disk after a stop is the newest one
seen.

A record that cannot be written never fails the render it describes. Losing the note about
where a render got to is a far smaller harm than losing the render, and the map is on disk
either way.

### Detecting a render whose application never came back

Not by process id. Process ids are reused, and a stale one that happened to match some
unrelated process would make a dead render look alive forever.

Instead each session records the id of the **application instance** that owns it, fresh on
every launch. A render only lives as long as the application that spawned it, so a session
still marked `running` whose owner is not this instance is, by construction, a render whose
application is gone. That is detected on launch, written back so the file stops claiming
something untrue, and offered.

It is *offered*, and never acted on. Silently restarting hours of rendering because
somebody opened the application is not a favour, and silently discarding the record throws
away the only evidence that the work exists. The interface asks, and the answer is
remembered: a declined offer is not made again at the next launch.

The reconciliation is idempotent, so calling it on every launch, and again whenever the
interface asks, changes nothing after the first time.

### Cancelled is not crashed

Cancellation is a first-class outcome. Somebody who pressed Cancel got exactly what they
asked for, and telling them their render "was interrupted" would have them looking for a
problem that does not exist. So the reason is kept, and the three read differently:

| Reason | What the offer says |
| --- | --- |
| `cancelled` | "You stopped rendering 'Overworld' at 62.4% of updating map 'overworld'." |
| `failed` | "Rendering 'Overworld' stopped at 62.4% ... (cli-failed)." |
| `process-gone` | "Rendering 'Overworld' was cut off at 62.4% ..., without the application getting a chance to stop it." |

All three are still offered, because the tiles that finished are finished either way.

### Refusing a resume whose settings changed

The session records a SHA-256 of the settings the render was started with. A resume
supplied with different ones is refused, naming both digests and what to do:

> The map settings have changed since this render was started, so it cannot be carried on.
> The tiles already on disk were rendered from the old settings, and rendering the new ones
> on top of them would produce a map that is half one and half the other with nothing to
> show which is which. Either put the settings back to what they were, or start a fresh
> render, which will redo the work.

What is in the hash is everything that changes what a tile contains: map ids, world folders
(resolved, and case-folded on the platforms whose file systems are), dimensions, display
names, the resolved sort order and start positions.

What is deliberately out:

- **Render threads and metrics.** They change how fast the render goes and whether upstream
  is pinged. Neither changes a byte of a tile.
- **`-f` and `-e`.** Arguments to a run rather than settings of a map. `-f` is the opposite
  of a resume.
- **The engine version.** Recorded in the session and reported with the offer, but not a
  refusal. An application update between two halves of a long render is ordinary, and
  refusing every resume after every update would make the feature useless.

### Crash-safe writes

Every session write goes to `session.json.writing` and is renamed over the target, exactly
as `consent.ts` and `provenance.ts` do it. A rename is atomic on every file system this
application runs on, so a reader sees either the previous complete file or the new complete
file and never the bytes in between.

That matters more here than almost anywhere else, because this is the file read by an
application that has just come back from a crash: the half-written file is not a
hypothetical, it is the exact thing this is likely to meet. So the read is strict as well.
A missing, unreadable, truncated, wrong-version or incomplete record is **absent**, never a
partial answer. Parsing one leniently would produce a session with a real render id, no
config hash and an empty map list, which is worse than nothing because it would be offered
to somebody.

### The IPC surface

Three new channels, and three bridge methods mirroring them.

| Channel | Arguments | Returns |
| --- | --- | --- |
| `render:interrupted` | none | `InterruptedRenderSummary[]`, newest first |
| `render:resume` | `renderId`, optional `maps` | `{ started: true, result }` or `{ started: false, refusal }` |
| `render:dismissResume` | `renderId` | `boolean` |

```ts
window.materialBluemap.interruptedRenders(): Promise<InterruptedRenderSummary[]>
window.materialBluemap.resumeRender(renderId: string, maps?: RenderMapRequest[]): Promise<ResumeResult>
window.materialBluemap.dismissResume(renderId: string): Promise<boolean>
```

A summary carries `renderId`, `reason`, `maps`, `startedAt`, `interruptedAt`, `percent`,
`description`, `engine` and a `message` of plain facts for the interface to style.

A refusal is not folded into `RenderResult`. A render that was refused never started, has
no id in flight and no engine to name, so inventing a failure code for it would be
describing something that is not a failure of rendering at all. `started` says which of the
two shapes came back.

Passing `maps` is what turns the settings check into a real check: omit it and the
session's own settings are used, which is always consistent.

## In GitHub Actions

`design/packages/render-actions/src/resume/`, and the workflows
`.github/workflows/render-world.yml` and `render-shard-wave.yml`.

### Cache for the working state, an artifact for the output

A shard that hits the job ceiling has spent hours producing tiles that are sitting on a
runner about to be thrown away. There are two ways off it, and they are not
interchangeable.

| | Holds | Why that one |
| --- | --- | --- |
| `actions/cache` | the shard's map directory **including `rstate`**, and BlueMap's data directory | Keyed and restored at the start of a job, which is the shape of "carry on where you left off". Allowed to disappear: an evicted cache costs one shard a full re-render and nothing else. |
| artifact | the finished shard map and its completion marker | What the merge consumes and what a person downloads. Immutable, and not competing with the cache's eviction policy. |

The important difference is *when* each is written. The artifact is written once, at the
end. The cache is written by every shard whether it finished or not, which is the entire
point.

The render step carries its own `timeout-minutes`, shorter than the job's, and
`continue-on-error`. A shard that runs out of time therefore fails one step rather than
having the job cancelled underneath it, and the steps after it - saving the cache,
uploading what exists, reporting honestly - still run. Those steps are what get hours of
real tiles off the runner before it disappears.

### The cache key, and the trap in it

`actions/cache` will not overwrite an existing key. A key identical between two runs
therefore saves nothing on the second: run two restores run one's state, renders for
another six hours, and throws all of it away. Three runs of that make no more progress than
two.

So the key carries the run id and attempt, and the restore falls back to the longest
matching prefix:

```
key:          bluemap-shard-state-v1-<planFingerprint16>-shard-7-<runId>-<attempt>
restore-keys: bluemap-shard-state-v1-<planFingerprint16>-shard-7-
```

The prefix ends in a separator so `shard-1-` cannot match a key for shard 10.

**The plan fingerprint in the prefix is not decoration.** Restoring a cache saved under a
different plan would drop tiles and `rstate` from a shard that covered a *different
rectangle of the world* on top of this one. `rstate` would then claim work this shard never
did, BlueMap would skip it, and the result is a hole in the map with nothing reporting a
problem. The fingerprint is a digest of the map id, the dimension, the world as measured,
the grid, the layout constants and every shard's own bounds. The estimate is not in it:
passing `--rate` changes the numbers in the run summary without moving a single cut.

### Completion markers

A shard's output directory looks the same whether the job finished or was killed at the
five hour fifty-eighth minute with a tile half flushed. Nothing in it says which.

So a shard that renders to completion declares it, in a file written only after the render
process has exited cleanly:

```
bluemap-out/maps/shard-7.complete.json     <- the marker
bluemap-out/maps/<mapId>/tiles/0/...       <- the map
```

Beside the map directory rather than inside it. The merge is pointed at `<shard>/<mapId>`,
so a marker inside would be a file the merge has to know to ignore; one directory up it
travels in the same artifact and the same cache and the merge never sees it. It has no
leading dot, because `actions/upload-artifact@v4` does not include hidden files by default.

**Only output whose marker is present is trusted.** A shard without one is not a failure
and is not discarded: it is unfinished, and its cached state is exactly what makes
finishing it cheap.

The marker also records how many hires tiles the shard had written, and every check counts
them again. A marker proves the render finished; it does not on its own prove the output
arrived, and a cache restore can be partial, a download can be interrupted, a runner can
run out of disk. A marker saying 240 beside a directory holding 197 is refused with both
numbers rather than trusted because the file exists. A marker written for a different plan
is refused too.

The marker is written staged-and-renamed for the obvious reason: the one file whose job is
to prove a write completed must not itself be readable half written.

Each merge group gates on this before merging anything. A group holding an unfinished shard
stops with an error naming the shards and what to do:

> These shards did not finish and were not merged: 41 47. Their render state is cached;
> re-dispatch this workflow with the same inputs to carry them on.

### More shards than one matrix can hold

A GitHub Actions matrix expands to at most 256 entries. A world needing more shards than
that has two honest options: give each shard a larger area, or run more than one matrix in
sequence.

The first has a hard ceiling. Enlarging shards raises the per-shard time, and a shard that
exceeds the six hour job limit does not finish at all. From figures measured on this
project's reference machine rather than guessed at: a 20 GB world is roughly 4,000 region
files and 4.1 million chunks, and at the measured 49.6 chunks per second (3,969 chunks in
80 seconds) that is about 23 hours of rendering. Against a six hour ceiling it must be
split, and at roughly sixteen regions per shard it wants about 256 shards. A world twice
that size wants about 512, and no amount of enlarging makes 512 shards' worth of work fit
into 256 jobs that each finish in time.

So shards are batched into **waves** of at most 256, and wave N+1 `needs:` wave N. A plan
with 600 shards becomes three waves of 256, 256 and 88. Nothing is dropped and no shard is
silently enlarged to fit.

Waves do not make a render slower than the account's own concurrency already makes it.
Actions concurrency is metered per account - a free account runs 20 jobs at once - so a
256-job matrix is already thirteen sequential batches of twenty as far as the runner fleet
is concerned. Splitting 512 shards into two waves changes when those batches happen rather
than how many there are. What waves do cost is a synchronisation point: a wave does not
start until every shard before it has ended.

That synchronisation is also what makes a failure cheap. Each shard caches its own state
and marks its own completion, so a re-dispatched run skips every shard that is already done.
A run that dies in wave 7 costs wave 7, not the six waves before it.

The workflow declares **twelve** wave jobs, because Actions cannot generate a variable
number of jobs. That is 3,072 shards. A plan needing more fails in the plan step, saying how
many waves it needs and what to change, rather than rendering part of the world and calling
it finished. Raising the ceiling means adding wave jobs to `render-world.yml` and raising
`RENDER_WAVE_SLOTS` to match.

### Merging a map too large for one runner

At the density measured on the reference world - 961 hires tiles covering a million square
blocks in about 47 MB - a 20 GB world renders to something on the order of 40 to 50 GB of
tiles. A runner's free disk is measured, not assumed from the published spec — see
[Disk: measured, not assumed](render-in-actions.md#disk-measured-not-assumed) — and even a
generously measured runner cannot hold that much: one job cannot download every shard and
write a merged copy beside them; it cannot download every shard at all.

So the merge is a tree, and its last level is small:

```
 shards 0..31   ->  merge group 0  ->  partial-hires-0 + partial-lowres-0
 shards 32..63  ->  merge group 1  ->  partial-hires-1 + partial-lowres-1
 ...                                          |
                                              v
                                   merge-lowres (lod 1 composited, lod 2+ rebuilt)
```

A group merge is the ordinary `mergeShardMaps` over a handful of neighbouring shards, so a
group runner only ever holds its own group. Everything that merge knows about the layers is
reused unchanged. It uploads two artifacts rather than one, and that separation is the
point:

- **Hires is finished when its group merge is.** Tiles are disjoint across the whole plan,
  not merely within a group, so a group's hires union is already its final share of the map.
  Nothing downstream opens it again.
- **Lod 1 is not.** A lowres tile is 500 blocks square on an unoffset grid and straddles
  group boundaries exactly as it straddles shard boundaries. So the last level downloads
  only the lowres artifacts, composites what genuinely overlaps, and rebuilds lod 2 upwards
  from the result. That is a few megabytes of PNGs rather than tens of gigabytes of tiles,
  which is why the final step fits on one runner however large the world is.

Group merges compose. Merging (A, B) and then (AB, C) gives the same lod-1 pixels as
merging (A, B, C) in one go, because each pixel is decided by a ranking - rendered terrain
beats an erasure beats an untouched pixel - and taking the best of a set is the same in one
pass or in stages. Two groups holding *different* terrain for one pixel remains impossible
when every column belongs to exactly one shard, and remains an error rather than a guess.

A group merge passes `--lod-count 1`, so it does not build coarse lods that the final step
would discard: a group's lod 2 is averaged over pixels no shard in that group rendered, and
is wrong in a way that leaves no trace in the file.

**For a world small enough to have one merge group, none of this changes anything.** The
single group is the whole merge, it verifies against every shard exactly as before, and it
publishes one `rendered-map` artifact and, optionally, Pages.

For a larger world the map ships as parts: one `map-lowres` artifact carrying the webapp,
the metadata and the whole lowres pyramid, plus one `partial-hires-N` per group. Unzip
`map-lowres`, then unzip each hires part into `maps/<mapId>/tiles/0/` inside it; they never
overlap, so the order does not matter. Publishing to Pages is not attempted for a map of
that size, because it would need one runner to hold every part at once, which is the
constraint the split exists to avoid. The run summary says all of this rather than leaving
somebody to work it out from a job that failed at 96% with a disk error.

### How `rstate` is cached without reintroducing the merge bug

The shard merge deliberately does **not** merge `rstate`. Its files group tiles into
regions that straddle the shard cuts, so no shard's copy describes the merged map, and a
merged copy would make a later incremental render skip tiles it never actually did.
`merge/mergeMap.ts` counts what it leaves out and says so, and
[docs/render-in-actions.md](render-in-actions.md) explains why at length.

**Nothing here changes that.** The two facts are consistent because they are about
different journeys:

| | Where it goes | Is it valid there |
| --- | --- | --- |
| Cached `rstate` | back to the same shard, rendering the same rectangle, with the same config, in a later run | Yes. It is precisely the record of what that shard has already done. |
| Merged `rstate` | into a map assembled from several shards | No. It describes one shard's rectangle and would make an incremental render of the merged map skip tiles no shard did. |

Concretely: `rstate` is cached per shard, under a key nothing else can restore, because the
key's prefix carries the plan fingerprint. It travels in the cache and never in the shard
artifact, so the merge never sees it, and `mergeShardMaps` continues to count and skip it if
one somehow appeared. `mergeLowresLayers` reads and writes no render state at all, and says
so in its report. The published map still carries none, so a later incremental render of a
published map still starts from scratch: slow and correct, rather than fast and wrong.

## Verification

Desktop, in `session.test.ts` and `resume.test.ts` (38 tests):

- A session left `running` by a previous launch is read as interrupted, the correction is
  written back, and a second launch finds the same thing and changes nothing.
- A render this launch is actually running is left alone.
- A completed render is not offered; a declined one is not offered again.
- A settings change refuses the resume and the message says what would happen otherwise.
- A truncated `session.json`, one that parses but carries no maps, and one from a future
  version are all treated as absent rather than parsed into nonsense.
- A cancelled render is distinguished from a crashed one, through the real orchestrator
  with a real child process, and both are still offered.
- A resume re-runs the recorded maps and does not pass `-f`, checked against the arguments
  actually spawned.

CI, in `resume/resume.test.ts` and `resume/lowresMerge.test.ts` (30 tests):

- A shard with no completion marker is unfinished, and its tiles are reported as kept
  rather than condemned.
- A marker whose count disagrees with the output on disk is refused, with both numbers.
- A marker from a different plan is refused.
- A half-written marker is no marker. An empty shard with no marker is unfinished, not done.
- Every run gets its own cache key; every key for a shard sits behind one restore prefix;
  shard 1's prefix does not match shard 10's key; a different plan gets a different prefix;
  changing only the estimate does not change the fingerprint.
- 600 shards become three waves of 256, 256 and 88 with nothing dropped or duplicated, and
  a plan needing more waves than the workflow has says so rather than truncating.
- The lowres merge composites across group boundaries, never opens the hires tiles,
  discards the partials' wrong lod 2, writes no render state, and refuses groups whose
  texture ordinals disagree.

Both workflows parse as YAML.

## Limits and things this does not do

- **A resume is only as good as the tiles on disk.** BlueMap decides what to skip from its
  own `rstate`; nothing here second-guesses it, and nothing here repairs a tile that was
  half written. On the desktop the process is killed by the application, and on a runner
  the shard is re-rendered from its cache when its marker is missing, so in both cases the
  engine's own bookkeeping is what decides.
- **The desktop resume is offered, never automatic.** There is deliberately no setting to
  make it silent.
- **A dismissed offer is dismissed permanently** for that render, until it is rendered
  again.
- **Twelve waves, so 3,072 shards.** More needs wave jobs added to the workflow.
- **A multi-group render does not publish to Pages** and does not produce one artifact.
- **Cache eviction costs a shard.** GitHub evicts caches by age and by a repository-wide
  size limit, so a run re-dispatched long after the one before it may find nothing to
  restore and render that shard from the beginning.
- **A world that changes between two halves of a render is not detected.** The settings
  hash covers the settings, not the contents of the world folder; editing the world between
  a crash and a resume gives BlueMap a changed world, which it handles the way it handles
  any changed world, by re-rendering what changed.
