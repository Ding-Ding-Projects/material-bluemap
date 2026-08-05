# Bedrock Edition worlds

BlueMap renders Java Edition. A Bedrock Edition world is a different thing on disk, so it
cannot be rendered directly — but it can be converted, and this document covers both
halves: recognising a Bedrock world and saying so, and converting one with Chunker so it
can be rendered.

The two halves are deliberately independent. Detection works with nothing installed — no
Chunker, no JVM, no network — and is worth having on its own, because "this is a Bedrock
world, which has to be converted first" is a far more useful sentence than "not a world".

---

## Behaviour

### What makes a world Bedrock

The two editions look alike at a glance and share exactly one filename.

| | Java Edition | Bedrock Edition |
|---|---|---|
| Chunk storage | `region/*.mca` (Anvil) | `db/` (a LevelDB database) |
| `level.dat` | big-endian NBT, gzip | little-endian NBT behind an 8-byte header |
| World name | `LevelName` inside `level.dat` | `levelname.txt`, plain UTF-8 |
| Extra dimensions | `DIM-1/`, `DIM1/`, `dimensions/` | inside the same database |

Both have a `level.dat`, which is why a Bedrock world used to reach the world list at all.
It listed, the Java NBT reader failed on the header, and the row appeared with a
`detailsError` and no name — which reads as *your world is corrupt*. It is not corrupt. It
is the other edition, and that is a different sentence with a different next step.

`main/bedrock/detect.ts` now answers that properly. It takes the folder listing
`main/world/inspect.ts` already produces and returns a verdict with the markers that
justify it:

- `certain` — a `db` directory holding real LevelDB files, or a `db` directory beside a
  `levelname.txt`.
- `likely` — a bare `db` directory beside a `level.dat`, and nothing corroborating it.

**Java evidence always wins outright.** Any Anvil region file in any dimension, or a
`region/` or `dimensions/` directory, settles the folder as Java no matter what else is
beside it. `db` is not a reserved name — a mod, a datapack or a backup tool can leave one
in a perfectly healthy Java world, and routing that world to a converter it does not need
would be a wrong answer its owner could not diagnose. A freshly created Java world with an
empty `region/` directory is Java too.

In the world list, a detected Bedrock world now carries `edition: "bedrock"`, its real name
read from `levelname.txt`, and the one-sentence explanation — instead of the parse error.

### Converting

Conversion is an explicit step somebody starts. Nothing converts as a side effect of
looking at a folder: it produces a second, multi-gigabyte copy of a world, and that is a
decision, not something that should happen because a screen was opened.

Before the button, the interface has the facts to show:

- **Where the copy goes.** Beside the original — `MyWorld` produces `MyWorld (Java)` in the
  same parent — never inside it. Writing into the Bedrock world would break the promise
  that the original is untouched and would leave Minecraft managing a save with a stray
  directory in it.
- **Roughly how big it will be.** An estimate, labelled as one: between one and two times
  the source world's size. Anvil packs chunks into 32×32 regions with its own compression
  while LevelDB stores them per chunk and compacts, so the ratio genuinely varies. A world
  whose size could not be measured gets no invented estimate.
- **That the original is never modified.** Chunker only reads its input, and this app only
  ever passes the Bedrock world as `-i`.
- **What will be lost.** See [Fidelity](#fidelity-what-conversion-loses) below.
- **Whether the world is large enough that it will probably fail.** Sized against the world
  in front of the person, not stated in general — see
  [Memory](#memory-the-converter-grows-without-bound) below. A world comfortably under the
  threshold says nothing at all, because a warning shown on every world is a warning nobody
  reads.

Progress is reported as it arrives, cancellation is available throughout, and neither a
cancelled nor a failed conversion leaves anything behind — see
[Nothing that looks like a world](#nothing-that-looks-like-a-world).

---

## Chunker

[Chunker](https://github.com/HiveGamesOSS/Chunker) is Hive Games' open-source converter
between Minecraft's Java and Bedrock editions. It is the established tool for this: it is
the converter behind `chunker.app`, it is documented by Microsoft in the Bedrock creator
docs, and the project receives funding from Mojang Studios.

> **Note.** The repository is `HiveGamesOSS/Chunker`, not `HiveGamingNetwork/Chunker`.

It ships as an Electron desktop app *and* as a standalone CLI jar. The CLI is what this app
uses: one file, about 30 MB, no installer and no native components.

### Licence, and why nothing is bundled

Chunker is **MIT licensed**, Copyright (c) 2024 Hive Games
([LICENSE](https://github.com/HiveGamesOSS/Chunker/blob/main/LICENSE)).

- **Redistribution is permitted.** MIT allows use, modification and distribution.
- **Bundling would therefore be permitted**, provided the copyright notice and the licence
  text ship alongside it.
- **Required attribution:** the copyright notice and the permission notice must be included
  in all copies or substantial portions of the software.

**This app nevertheless does not bundle it.** That is a product decision, not a licence
restriction, and the distinction matters enough to state plainly rather than letting the
interface imply a prohibition that does not exist. The reasons are that 30 MB in every
installer is a poor trade for a feature most people never use, and that a bundled copy pins
a converter version to an app release — the converter tracks new Minecraft versions on its
own schedule and should be updatable without shipping a new app.

So the app detects an installed Chunker first, and offers to fetch one only if asked.

### The CLI contract

Read from Chunker's README and from `cli/src/main/java/com/hivemc/chunker/cli/CLI.java`
rather than guessed at.

```
java -jar chunker-cli-<version>.jar -i "<world>" -f JAVA_1_21_4 -o "<output>"
```

**Requirement: Java 17 or higher.** This app does not add a second Java story for it — it
reuses the provisioned, probed Temurin JDK from `main/java/`, whose own requirement is
already well above 17.

Required flags:

| Flag | Long form | Meaning |
|---|---|---|
| `-i` | `--inputDirectory` | the world to read |
| `-o` | `--outputDirectory` | where to write |
| `-f` | `--outputFormat` | target format, `EDITION_X_Y_Z`, or `INPUT` |

Optional flags (`-m` block mappings, `-s` world settings, `-p` pruning, `-c` converter
settings, `-r` dimension registry, `-d` dimension mappings, `-b` biome mappings) all take a
JSON file or object. Chunker also picks these up automatically from `*.chunker.json` files
inside the input world.

<details>
<summary><b>Why <code>--keepOriginalNBT</code> is never passed</b></summary>

`-k` / `--keepOriginalNBT` only works when the output format matches the input. For a
Bedrock-to-Java conversion it never does, and Chunker's guard for that case calls
`System.exit(0)` after printing to stderr. Passing it would turn every conversion into a
silent no-op that reports success.
</details>

The target format defaults to `JAVA_1_21_4`. That is a real identifier in Chunker's writer
registry rather than a guess — the registry enumerates its supported Java versions, and an
identifier is that version with dots replaced by underscores and a trailing `.0` dropped
(`JAVA_1_20`, `JAVA_1_20_5`, `JAVA_1_21_4`, `JAVA_26_1`, …). A modern format BlueMap has
long read, rather than the newest Chunker offers: the target only has to be something the
renderer definitely understands. An unknown identifier is rejected by Chunker with a message
listing every valid value, which this app captures and reports rather than swallowing.

### Obtaining it, and what "verified" honestly means

The app looks, in order, at a jar configured in settings, then `CHUNKER_CLI_JAR`, then a
copy it downloaded into its own data directory. A configured path that does not exist is
**reported**, never silently skipped in favour of another copy — running a different
converter than the one that was named is how somebody spends an afternoon wondering why a
setting does nothing.

If asked to fetch one, the download is checked against a SHA-256. What that check is worth
was researched rather than assumed, and the answer is narrower than one would like. As of
Chunker 1.19.1:

| | Published? |
|---|---|
| `SHA256SUMS` or equivalent checksum file | **No** |
| Detached signature (`.asc`, `.sig`, `.intoto.jsonl`) | **No** |
| GitHub artifact attestation for the CLI jar | **No** |
| Authenticode signature on the CLI jar | **No** — Hive Games sign their Windows `.exe` artifacts with Azure Trusted Signing, but the CLI jar is not an `.exe` |
| GitHub's own per-asset `sha256` digest on the releases API | **Yes** |

So the strongest available check is a SHA-256, and it is **GitHub's statement about the
bytes it stores, not Hive Games' signature over the bytes they built**. Fetching both the
digest and the file from the same API in the same session proves the transfer was intact —
it does not independently prove provenance.

Two things follow:

1. **The digest is pinned in this app's source** (`main/bedrock/chunker.ts`), reviewed and
   committed like any other code, so the check is against a constant that a compromised API
   cannot move.
2. **Resolving a newer release from the API is a weaker guarantee and is labelled as one.**
   The result carries `digestTrust: "pinned" | "api"`, and the interface says which rather
   than showing an identical green tick for a materially different assurance.

Nothing unverified ever appears at the final path: the download lands in a `.part` file and
is renamed into place only after the hash matches, reusing the same verified-download code
that fetches the JDK.

### Fetching it from the wizard

`bedrock:fetchChunker` — the handler above — existed for a while with nothing in the
interface ever calling it: a missing Chunker jar dead-ended on **Convert** failing with the
main process's own "Chunker is not installed" message and no route out of it. The wizard's
Bedrock note now asks `bedrock:chunker` for the status the moment it detects a Bedrock
world, and while Chunker is missing it shows a **Download Chunker (~30 MB)** button in place
of **Convert** — never both, because a Convert button that is certain to fail is worse than
one that is not offered.

The button states the size before anything moves, and a progress bar (fed by the same
`bedrock:event` channel a conversion's own progress uses, tagged with the fixed conversion
id `"chunker"`) tracks the download while it runs. A failed fetch — a bad digest, a network
error — shows the reason as an alert and leaves the button in place to retry; nothing here
ever leaves a half-written jar at the final path, per the verification section above.
Success re-asks `bedrock:chunker` and reveals **Convert** in the same spot the download
button occupied, so the world can be converted without a second manual refresh.

See [Automatic dependency provisioning](./dependency-provisioning.md) for how this fits
alongside the Java runtime's own download button and every other tool the app can or
cannot fetch for itself.

---

## Fidelity: what conversion loses

Edition conversion is a translation between two games that genuinely differ, and it is
lossy in known ways. This is surfaced **before** the conversion runs, not after — somebody
who learns after twenty minutes that their villages are gone has been told a fact they can
no longer act on.

Chunker's own README states, under *Currently unsupported features*, that the following do
not convert (or convert only partly):

- **Entities**, excluding paintings and item frames. Mobs, dropped items, minecarts, boats,
  armour stands and villagers will not be in the Java copy. This does not change what
  BlueMap draws, since BlueMap renders blocks rather than entities — but the copy is not a
  faithful world to play.
- **Structure data**, such as villages and strongholds. The blocks already generated are
  still there and still render; what is lost is the game's record that a structure exists,
  so village mechanics and `/locate` will not work.

Two further notes are this app's own observation, and are labelled as such rather than
attributed to upstream:

- **Some blocks have no exact Java equivalent.** The editions do not have identical block
  sets. Chunker maps each block to the closest Java block it can; where there is no
  counterpart the result is an approximation, so Bedrock-only blocks and some block states
  render as something near to, rather than exactly, what was there.
- **This is a one-way copy, not a link.** The converted world is a snapshot. Playing the
  Bedrock world afterwards does not update it, and a map rendered from the copy will not
  show anything built since. Convert again to bring it up to date.

The list records which Chunker version it was read from (1.19.1). When the Chunker actually
running is a different version, the briefing says the list may be out of date rather than
presenting notes read from one version as verified against another.

### Provenance

A converted world is indistinguishable from a native Java world by inspection — that is the
point of the conversion, and also the problem. Six months later, looking at a map with an
odd gap where a village should be, there would be nothing on disk to say the world was ever
Bedrock.

So every conversion writes `bedrock-conversion.json` **into the world it produced**:

```json
{
    "recordVersion": 1,
    "converter": "chunker",
    "converterVersion": "1.19.1",
    "converterPath": "…/chunker-cli-1.19.1.jar",
    "javaVersion": "25.0.3",
    "sourceWorld": "…/MyWorld",
    "sourceName": "Survival Island",
    "sourceEdition": "Bedrock 1.21.30",
    "targetEdition": "Java 1.21.4",
    "targetFormat": "JAVA_1_21_4",
    "convertedAt": "2026-08-04T09:12:44.108Z",
    "durationMs": 192_000,
    "regionFiles": 214,
    "knownLosses": [ "…the fidelity notes in force at the time…" ],
    "appVersion": "0.1.0"
}
```

Inside the world rather than beside it, because a world folder gets moved, copied and
renamed, and a sidecar that stays behind is a record of nothing. Minecraft and BlueMap both
ignore files they do not recognise, so the extra file is inert.

The fidelity notes are **copied in** rather than referenced, so the record keeps meaning the
same thing when the app's own list is later edited — a record pointing at whatever the
current build says would silently restate a later version's limitations as though they had
been shown to the person who ran this conversion.

Every field is something that was observed. Where a fact was not established the field is
null and readers render "not recorded" rather than a guess: a provenance record that invents
its contents is worse than none, since its whole value is being trustworthy without checking.

`conversionProvenance()` returns the subset a render record carries, so a map's details
surface can say where its world came from alongside the engine and JVM that
`render.json` already records.

---

## Failure modes

### Exit code zero does not mean it worked

This is the single most important fact about driving this CLI, it is not obvious, and it was
established by reading `CLI.java` rather than by testing the happy path. Three of Chunker's
failure paths print to stderr and then return normally, so picocli returns 0 and the process
exits 0:

- `Failed to find suitable reader for the world.` — the input was not a world Chunker
  recognises. **The most likely failure in this app**, because it is what a corrupt or
  half-copied Bedrock world produces.
- `Failed to find suitable writer for the world.` — the target format was rejected.
- the `--keepOriginalNBT` guard, which calls `System.exit(0)` explicitly.

A caller that trusts the exit code therefore reports a triumphant success over an empty
directory. So **success here requires all three of**: exit code 0, the `Conversion complete!`
line on stdout, and an output directory verified to hold an actual Java world. Any one
missing is a failure and is reported as one.

The codes that *are* meaningful:

| Code | Meaning | What the app says |
|---|---|---|
| `0` | see above — only trustworthy with the other two checks | |
| `1` | conversion threw — **including most out-of-memory deaths** | `out-of-memory` if the output carries an OOM signature, otherwise `chunker-failed` |
| `2` | picocli usage error | `bad-invocation` — this app built the command line wrong |
| `12` | `OutOfMemoryError` on Chunker's main thread only | `out-of-memory` |

### Memory: the converter grows without bound

> [!IMPORTANT]
> **Chunker's memory use grows without bound on larger worlds — past roughly **200 MB** of
> source world it climbs until the JVM dies.**
>
> **This 200 MB figure is this project's own observation from running Chunker. It is not
> something upstream documents**, and the two accounts disagree about the cause — see below.

On a world past that size, out-of-memory is not an exotic case: it is the *likely* ending.
The conversion slows down, then stops part-way. Nothing is left behind (the `.converting`
rename guard sees to that) and the Bedrock world is not modified.

#### Upstream's account, and why this app does not repeat its advice

Chunker's issue tracker carries a steady stream of out-of-memory reports, and the
maintainer's standing reply describes them as a **resource** problem — the world is big, the
machine's RAM is finite — with the remedy being to close other applications, pass a larger
`-Xmx`, or trim the world with a tool like MCASelector first. No issue is labelled or
described as a leak, and no upstream document states a size threshold.

That advice only holds if the memory use has a ceiling. If it grows without bound, a larger
heap is not a fix:

- it does not decide **whether** the conversion fails, only **when**; and
- a larger one makes the landing worse, because a JVM permitted to reach most of physical
  memory drives the machine into paging or gets killed outright by the operating system —
  which arrives as a process that simply vanished, rather than as an `OutOfMemoryError`
  anybody can read.

So this app does not present a heap size as the remedy anywhere: not in the pre-conversion
warning, not in the failure message, and not in its own JVM arguments.

Out-of-memory reports continue against the pinned **1.19.1** — for example
[issue #2482](https://github.com/HiveGamesOSS/Chunker/issues/2482), open, reported against
`1.19.1-main-f642f8f`. There is therefore **no later Chunker release to point at as a fix**,
and nothing here claims one. If upstream later documents the behaviour or ships a fix, this
section is where the citation belongs.

#### What the app actually does about it

Three things, none of which is a workaround. Splitting the world, retrying with a bigger
heap, or otherwise routing around the behaviour would be guesses about somebody else's bug.

**1. Warn beforehand, sized against this world.** `main/bedrock/memory.ts` assesses the
source world's measured size — the number the world list already computes:

| Source size | Level | What is shown |
|---|---|---|
| under 150 MB (75% of the threshold) | `low` | **nothing at all** |
| 150–200 MB | `approaching` | near the mark; may well convert, and what happens if it does not |
| 200 MB and over | `high` | will probably fail, whose limitation it is, and the options that do work |
| not measured | `unknown` | nothing — a risk invented from a size nobody measured is the same failure as an invented size |

The `high` copy states plainly that giving it more memory is not a fix, that this is a
limitation of the converter rather than of the person's world or of this app, and that the
options that do work are a smaller world, trimming this one first, or a machine with
considerably more RAM. The person can still start it and find out.

**2. Recognise the death when it happens.** Given that Chunker exits 0 on several failure
paths, this one gets its own classified failure and its own sentence — *"The converter ran
out of memory, which it is known to do on worlds this size"* — rather than a generic
"conversion failed".

Exit code 12 is **not** a reliable way to spot it. Chunker's `catch (OutOfMemoryError)`
wraps the body of `run()`, which is the **main** thread; the conversion itself runs as a
task, and a failure on one of its worker threads is captured by
`conversionTask.future().exceptionally(...)`, printed as `Failed with exception` plus a
stack trace, and exited with **code 1**. The most likely out-of-memory death therefore looks
exactly like any other exception. Three signals are treated as out-of-memory:

1. an OOM-shaped line anywhere in either stream — `OutOfMemoryError`, `Java heap space`,
   `GC overhead limit exceeded` (what a leak looks like just before the end: the heap is not
   technically full, the collector is simply making no progress), `Terminating due to
   java.lang.OutOfMemoryError`, `Requested array size exceeds VM limit`;
2. exit code 12;
3. a process that ended with **no** exit code and **no** signal, having made real progress
   and never completed — what the operating system's own OOM killer leaves behind. The
   progress requirement is what stops this swallowing a genuine spawn failure.

**3. Convert large worlds in batches**, one JVM at a time — see
[Batched conversion](#batched-conversion) below. This is the one genuine mitigation, and it
works whichever account of the memory behaviour is correct: if it is a leak, a fresh JVM per
batch reclaims everything on exit; if the world is simply too large for available RAM, a
smaller slice needs less. Either way the peak is bounded by the batch rather than the world.

**4. Choose JVM arguments that make the ending honest rather than pretend to fix it.**
`RECOMMENDED_JVM_ARGS` is `["-XX:+ExitOnOutOfMemoryError"]`, and the notable thing about it
is the absence of `-Xmx`. Leaving the heap ceiling off means the JVM's own default applies —
a documented, predictable fraction of physical RAM, and not a claim by this app that the
problem is handled. `-XX:+ExitOnOutOfMemoryError` is not a mitigation either: it changes
nothing about whether the conversion succeeds. It makes the JVM halt at the first
`OutOfMemoryError` on any thread and print a line the classifier above recognises, instead
of letting the process thrash for minutes and then exit 1 like any other crash.

### Large worlds: resumable, margin-protected batches

When the measured world is in the high-risk range, the desktop app can convert it in bounded
batches rather than pretending one JVM has an unlimited appetite. It first asks Chunker's
`SETTINGS` pass which region files actually exist, then groups each dimension into batches of at
most 64 regions, sized toward a 100 MiB source-data budget. Every batch is passed to Chunker with
`-p` pruning boxes expanded by one chunk on every side. That margin is deliberate: Chunker's
pre-transform handlers inspect immediate neighbour columns when deciding fences, panes, stairs,
doors and other connected blocks. Only the batch's owned `r.<x>.<z>.mca` files are kept; the
partial margin files are discarded rather than allowed to overwrite the complete file produced
by its owning batch.

The output remains under a sibling `.converting` directory until every batch has merged and the
assembled world passes the same `level.dat` plus region-file verification as a single-pass
conversion. `batches.json` is written atomically after each merge. If a JVM fails, the completed
batches remain in the staging directory and the next attempt resumes from the first unfinished
batch; if the plan changes, the old merged state is removed instead of mixing two carve-ups.
Cancel stops the live JVM and prevents the next batch from starting. A failure, cancellation or
unreadable `SETTINGS` report never creates a directory that looks renderable, and the original
Bedrock world is never modified.

The planner and runner are unit-tested with injected Chunker processes and real temporary
directories. The current suite covers malformed settings reports, dimension separation, margin
geometry, ownership filtering, sequential execution, progress scaling, retry/resume, plan
changes, cancellation, parallel region directories and the final staging rename. It does not
claim an end-to-end conversion of a real Bedrock world; that still needs a real world, Chunker
and a Java runtime.

### Batched conversion

A world past the memory threshold is converted in pieces: one JVM per batch, sequentially,
each fully exited before the next starts. Worlds under the threshold take the single-pass
path, unchanged — batching is machinery, and machinery that runs when it is not needed is a
new way to be wrong.

Four things had to be true for this to be possible, and all four were established by reading
Chunker's source rather than assumed.

#### 1. The CLI really can convert a subset

`-p` / `--pruning` takes a chunk bounding box per dimension:

```json
{ "configs": { "minecraft:overworld": {
    "include": true,
    "regions": [{ "minChunkX": -1, "minChunkZ": -1, "maxChunkX": 32, "maxChunkZ": 32 }] } } }
```

`include: true` keeps what is inside the boxes and discards the rest; several boxes union.
This is `com.hivemc.chunker.pruning.PruningRegion`, the same mechanism the web app's pruning
tab drives.

#### 2. Pruning skips reading, so it genuinely bounds memory

The idea would have been pointless if pruning were a filter applied after conversion. It is
not. In `BedrockWorldReader`, whole regions are gated before any task is scheduled, and
columns before the reader is even constructed:

```java
for (ChunkCoordPair chunkCoordPair : region.getValue()) {
    if (!converter.shouldProcessColumn(dimension, chunkCoordPair)) continue;
    Task.async("Creating Column Reader", ..., () -> createColumnReader(chunkCoordPair))
```

An excluded chunk is never read, never decoded, never held.

#### 3. The trap: a naive batcher produces subtly broken worlds

> [!WARNING]
> This is the part that would have made a straightforward implementation actively harmful.

Chunker infers block states from **neighbouring columns** after reading
(`ColumnPreTransformConversionHandler`): fences, walls, panes, bars, tripwire, redstone,
stems, double chests, doors and stair shapes all have their connection state decided by what
is in the adjacent chunk. When a required neighbour never arrives — because pruning excluded
it — the final `flushColumns()` transforms the column anyway, and `handlePreTransform` simply
drops the unresolved edges:

```java
// Remove null values and map them back to column, null values are just unresolved edges
requiredColumns.forEach(((edge, columnData) -> { if (columnData == null) return; ... }));
```

So a column at the edge of a pruned area is converted **as though the neighbouring chunk were
empty**. Nothing hangs, nothing is dropped, and the world converts cleanly — and is quietly
wrong along every batch boundary. A fence that renders unconnected looks like a fence somebody
built that way. That is exactly the failure that is worse than refusing.

#### 4. The fix: convert with a margin, keep only what the margin protected

Each batch is a set of whole 32×32 **regions**, and its pruning boxes are those regions grown
by **one chunk** on every side. Every chunk of every region the batch *owns* therefore has all
its neighbours loaded, and its connection states are decided with complete information. The
margin spills into neighbouring regions, whose files are consequently partial — so after the
batch runs, only the region files it owns are kept and the partial ones are discarded.

One chunk is enough, and that is a property of the handlers rather than a hope: a pre-transform
reads its *immediate* neighbour columns' blocks. The transitive clustering in `trySolve` decides
when columns are processed together, not how far a connection query reaches.

Because every region file is produced by exactly one batch, complete, **merging is a file
copy**. Nothing ever splices chunks inside an Anvil file — the one operation that would put the
format's sector allocation at risk.

#### What is not sliced: the input

A Bedrock world is a single LevelDB database whose keys interleave every dimension and chunk.
Cutting it up outside Chunker would mean writing a LevelDB editor and would risk corrupting the
original — the one thing this feature promises never to touch. **All slicing is expressed to
Chunker as pruning**, and the original is only ever opened for reading.

#### Planning, and why it is never guessed

The batch plan needs to know which regions exist. Chunker answers that itself: `-f SETTINGS`
runs its settings-only writer, which reports the world without converting it and writes
`data.json`:

```json
{ "maps": [...], "settings": {...},
  "dimensions": { "minecraft:overworld": [[regionX, regionZ], ...] } }
```

The region set is `chunkerWorld.getRegions()` — the world's own index — so this is an
enumeration rather than a second full read.

If that report is missing or malformed, the conversion is **refused**. A plan built from a
half-read world would convert some unknown subset and report success, which is silent data
loss. There is deliberately no fallback to a guessed grid.

#### On disk, during and after

```
<output>.converting/          the staging root - the name says "unfinished"
  world/                      the merged Java world, built up batch by batch
  batches.json                which batches are already merged in
  batch-<n>/                  one batch's raw output, deleted once merged
<output>                      appears only at the very end, by rename
```

**Resuming.** A merged batch is recorded in `batches.json` before the next starts, so a
conversion stopped by a failure, a cancellation or a closed app carries on from the first
unmerged batch. The ledger records a plan key; if the world or batch size has changed since,
the completed set is discarded rather than merging two incompatible carve-ups into one world.
The ledger is written *after* the merge and *before* the batch directory is deleted, so a crash
between the two costs one repeated batch rather than a missing region.

**Failure and cancellation** keep the staging root — it holds the completed batches a retry
will skip — and it keeps its `.converting` name, so nothing mistakes it for a world.

**Progress** is reported across the whole job rather than per batch, alongside which batch is
running. A bar that ran 0–100 once per batch and snapped back would read as the conversion
restarting.

#### What batching does not fix

- **Fidelity is unchanged.** Entities and structure data still do not convert.
- **A single batch can still exhaust memory** if one batch's share is itself too large. The
  batch size is chosen from the world's measured bytes per region, which is an estimate.
- **The world-level files** (`level.dat`, `data/`, `datapacks/`) come from the first successful
  batch. They are derived from the source world's level data rather than from the chunks a
  batch happened to read, so each batch's copy says the same thing — but this is reasoning
  about Chunker's behaviour, not something measured here.
- **Paintings and item frames** are the one entity class Chunker converts, and they are
  relocated to the chunk they belong to. One near a batch edge could in principle be relocated
  into a discarded margin region and lost.

### Nothing that looks like a world

The conversion writes into a sibling staging directory ending in `.converting`, and that
directory is renamed to the real name **only after** the output has been verified to contain
both a `level.dat` and at least one region file.

A `level.dat` alone is not enough. Chunker writes level data before it writes chunks, so a
conversion killed early leaves a directory that has one and no terrain at all — which
BlueMap would happily render as a completely blank map rather than fail, so nothing
downstream would ever notice.

This means a cancelled conversion, a crashed JVM, a full disk and a machine that lost power
all leave a directory whose name says plainly that it is unfinished, and which the next run
removes before starting. Converting in place and cleaning up afterwards would rely on the
cleanup code getting to run, which is exactly what does not happen in the cases that matter.

A staging directory left by an earlier attempt is deleted rather than converted into —
otherwise Chunker would write into a directory already holding half of an unrelated
conversion, and the result would pass verification while being a mixture of two worlds.

### Cancellation

Chunker's CLI polls a progress value in a loop and has no interrupt path of its own, so
cancelling means ending the process. As `render/runner.ts` documents from measurement,
Windows has no POSIX signals and libuv implements every `kill` as `TerminateProcess`, so the
JVM dies immediately without running a shutdown hook. There is nothing to flush and nothing
to lose: a half-written Java world is worthless, which is exactly why it is written under a
staging name and deleted rather than saved.

The running conversion is handed out through an `onStart` callback so the cancel channel
reaches the live process. Without it a Cancel button could only set a flag nothing reads —
and a Cancel that reports success while a JVM keeps converting is worse than one that plainly
does not work.

### Other failures

| Situation | What happens |
|---|---|
| Chunker not installed | Reported as a value with what it is, its licence, that the app does not bundle it, and where the app looked |
| Configured jar missing | Reported by path — never silently replaced with another copy |
| No Java 17+ | Reported, with the JVM layer's own reason |
| Folder is actually a Java world | Refused before anything runs; a Java world needs no conversion |
| Process cannot be spawned | An outcome, not an exception |

---

## Security considerations

- **The original is read-only.** The Bedrock world is only ever passed as `-i`. Nothing in
  this feature writes to it, and the converted copy goes to a sibling directory.
- **No shell.** The CLI is spawned directly. A shell between this process and the JVM would
  mean the cancel path kills the shell and leaves a detached JVM writing gigabytes into
  somebody's disk with nothing holding a handle to it.
- **Downloads are verified before use**, against a digest pinned in source, with the limits
  of that assurance stated above rather than glossed.
- **`levelname.txt` is bounded at 4 KB and cut at the first line break.** It is only
  *conventionally* a world name; nothing stops a corrupt or hostile save shipping a hundred
  megabytes under that name, and reading it whole to draw one row of a list would let a
  chosen folder exhaust the process.
- **The `db` count stops at the first match.** It answers a yes/no question, so reading
  forty thousand directory entries for a number nothing displays would make opening a world
  list needlessly slower.
- **No handler rejects.** Every IPC handler returns a value, including every refusal. A
  rejected `invoke` arrives in the renderer as an `Error` whose message Electron's
  serialisation has mangled, turning a sentence somebody could act on into a stack trace they
  cannot.
- **Electron appears as a type only.** `IpcMain` is a parameter and broadcasting is a
  callback, so the whole directory runs and is tested without an Electron runtime.

---

## Verification

From `design/`:

```
npx vitest run packages/app
npx tsc -p packages/app --noEmit
npx eslint packages/app
```

All three are clean. The Bedrock suites are 121 tests across seven files, and **none of them
needs Chunker, a JVM, or a Bedrock world on disk** — the process runner is injected and
detection runs against fixtures built from empty files, because a Bedrock world's *shape* is
the whole of what detection reads.

| File | Covers |
|---|---|
| `detect.test.ts` | A Bedrock world detected and named; a Java world unaffected; a Java world with a stray `db` folder still Java; a fresh Java world with no terrain still Java; a `saves` folder not mistaken for a world; `levelname.txt` trimming and its absence |
| `chunker.test.ts` | Chunker absent reported honestly with licence and search paths; never rejecting; configured over downloaded; a missing configured jar reported rather than replaced; version read from a jar name, and `null` rather than a guess |
| `convert.test.ts` | The documented command line; `--keepOriginalNBT` never passed; **no `-Xmx` in the recommended JVM arguments**; progress parsing including a comma decimal separator; the failure that exits zero; **out-of-memory recognised from exit 12, from a worker-thread stack trace that exits 1, and from an OS kill — but not from a spawn failure or a cancellation**; **the OOM message never suggesting a bigger heap**; verification rejecting a `level.dat` with no terrain; **a cancelled conversion cleaning up after itself**; **a failed conversion leaving nothing that looks like a world**; a stale staging directory cleared |
| `memory.test.ts` | Silence below the threshold and on an unmeasured world; the warning above it sized against the world; that it names whose limitation it is, promises the cleanup that actually happens, attributes the figure to observation rather than upstream, and **never offers more memory as the fix** |
| `batch.test.ts` | Malformed settings reports refused; dimension-separated, row-major plans; one-chunk margin geometry; ownership filtering and custom-dimension paths |
| `batchConvert.test.ts` | One JVM at a time; settings planning; margin spill discarded; atomic ledger; progress scaling; failure and cancellation staging; retry/resume; plan changes; parallel region directories; final rename |
| `ipc.test.ts` | Channels registered and disposed from one list; every refusal a value; the memory warning present on the pre-conversion call and absent for a small world; the recommended JVM arguments reaching the conversion; high-risk worlds routed through the injected batcher; a Java world refused before anything runs; cancel reaching the live conversion, and answering false when there is nothing to cancel |

The detection fixtures go through the real `inspectWorldFolder`, so the two halves are proven
to agree — a hand-written listing could satisfy the detector perfectly while the reader never
produces it.

**Not verified:** no end-to-end conversion of a real Bedrock world has been run in this
repository, because that needs a Bedrock world, a 30 MB third-party download and a JVM, none
of which belong in the test suite. The CLI contract driven here — flags, progress format,
exit codes and the three zero-exit failure paths — was read from Chunker's own source at tag
`1.19.1` rather than observed. The size estimate is an estimate and is labelled as one
everywhere it is shown.

On memory specifically, three things are worth separating:

- **Not measured here.** The 200 MB threshold is carried over as an operational observation.
  This repository has not profiled Chunker's heap, established the threshold experimentally,
  or confirmed that the growth is genuinely unbounded rather than merely large. The code and
  the copy both treat it as a soft warning line, never as a hard limit.
- **Not confirmed upstream.** Chunker documents no such limit, and its maintainers describe
  out-of-memory as a world-size-versus-RAM problem. The attribution in the warning copy says
  so explicitly so nobody reads the figure as upstream's.
- **Not observed in this repository.** The OOM classification is exercised against
  synthesised process output — a real Chunker OOM has not been captured here. The
  `OutOfMemoryError` and `Terminating due to …` line shapes are the JVM's documented output;
  the claim that a worker-thread OOM exits 1 rather than 12 is read from `CLI.java`'s control
  flow rather than observed.

On batching, the mechanism is proven from source but **no batched world has been produced and
inspected here**. These are the specific claims a reviewer should want evidence for before
trusting a batched world:

- **That a one-chunk margin is sufficient.** Argued from the pre-transform handlers reading
  only immediate neighbour columns. If any handler reaches two chunks, batch boundaries would
  still carry wrong connection states — the exact failure the margin exists to prevent, and
  invisible without a side-by-side comparison against a single-pass conversion.
- **That region files from separate passes are independent.** Anvil files are per-32×32-area
  and this is how every world-editing tool treats them, but this repository has not diffed a
  batched world against a single-pass one to confirm the merge is lossless.
- **That the world-level files are batch-invariant.** Taking `level.dat` and `data/` from the
  first successful batch assumes each batch would have written the same thing. Reasoned, not
  measured.
- **That `-f SETTINGS` is cheap.** It reports `chunkerWorld.getRegions()`, which is an index
  rather than a chunk read, so it should not itself exhaust memory on a world too large to
  convert in one pass. Not profiled.
- **The `data.json` shape** is read from `SettingsLevelWriter.flushLevel` at `1.19.1`. A
  Chunker whose output format moves would be refused rather than misread — the parser rejects
  anything unexpected — but the refusal would need a code change to fix.

The single highest-value verification, if a Bedrock world and a JVM are available, is to
convert one world both ways and diff the results. That is what would turn the margin argument
from sound reasoning into a demonstrated fact.
