# Large worlds and rendered maps

A GitHub release asset is capped at **2 GB per file**. A rendered 20 GB world is tens of gigabytes
of tiles, and even a modest world archive goes past that cap, so nothing large can be published as
a single download. Anything over the cap is therefore split into **1.7 GB parts** with a manifest
beside them, and put back together by whatever consumes it: the desktop application does it
automatically, and one command does it by hand.

**Contents**

- [What a split asset looks like](#what-a-split-asset-looks-like)
- [Getting one with the desktop application](#getting-one-with-the-desktop-application)
  - [Where it is](#where-it-is)
  - [What it does](#what-it-does)
- [Getting one from a command line](#getting-one-from-a-command-line)
- [Publishing one](#publishing-one)
- [The manifest format](#the-manifest-format)
- [What is verified, and what happens when a check fails](#what-is-verified-and-what-happens-when-a-check-fails)
- [Resuming](#resuming)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## What a split asset looks like

A release that carries a 4 GB world shows this instead of one file:

```
test-world-seed-1739.zip.001          1.70 GB
test-world-seed-1739.zip.002          1.70 GB
test-world-seed-1739.zip.003          0.63 GB
test-world-seed-1739.zip.parts.json     684 B
```

The numbered files are the archive cut into pieces at fixed offsets. Nothing clever happens at the
boundaries: concatenating them in order gives back the original file, byte for byte. The
`.parts.json` is what makes that safe rather than merely likely, because it carries a SHA-256 for
every part and one for the whole file.

Why 1.7 GB and not 2 GB: the cap is enforced on the uploaded object, and a part sized right at the
limit leaves no room for a boundary counted in binary rather than decimal gigabytes, or for
whatever the upload path adds. The margin costs one extra part every six, once, at publish time.

## Getting one with the desktop application

### Where it is

There is a surface for this now, and it is where the question is actually asked. The map wizard's
first step, the one that wants to know which world folder to render, carries a disclosure reading
**No world on this machine? Download one from a release**. Opening it puts the downloads panel in
place, inside the step. A download that finishes is offered back to the wizard as the world to
render, so "I have no world" and "render this world" are one flow rather than two.

Two behaviours there are deliberate and read as omissions if they are not stated:

- **Opening the panel fetches nothing.** It reconciles with what is already on disk and already in
  flight, which touches no network. Reading a release is a network request and waits for the
  button, because a panel that called GitHub every time a wizard step was opened would spend
  somebody's rate limit on a question they never asked.
- **Every download in the application appears here, whoever started it.** Progress is broadcast to
  every window, so a download started elsewhere, or before this panel was opened, is shown too.
  Nothing is filtered to "mine": an invisible download is a download somebody starts twice.

A build with no Electron bridge, which is what a plain browser tab is, says so and offers no
button. There is no fallback that could work: a browser tab has nowhere to write a twenty gigabyte
world, no way to resume a ranged request into a file, and no zip reader that streams.

### What it does

Nothing has to be done about the split. The application reads the release, sees the manifest,
presents it as the one download it really is (`test-world-seed-1739.zip`) with a chip saying how
many parts it arrives in, and then:

1. fetches the manifest first, because it is a few kilobytes and it is the only thing that says how
   large the real download is;
2. fetches every part, several at a time, each with an HTTP `Range` request that continues from
   whatever is already on disk;
3. checks each part against its own SHA-256 as it arrives, and re-fetches one that came back wrong;
4. rejoins them, re-checking each part as it is appended and then the whole file;
5. unpacks the archive into the application's storage directory.

Progress is pushed to the interface as it happens: bytes transferred, parts done, the part being
worked on right now, an overall percentage and an estimate. The byte counts are exact; the overall
percentage is a weighted estimate across the transfer, the rejoin and the unpack, and says that it
is one. A download can be cancelled at any point, and cancelling keeps everything already
transferred, so starting it again continues rather than begins.

Each row also carries a **Show what it reported** log disclosure. Opened, it shows a **Follow new
lines** checkbox, on by default: a multi-part download can run for a long time, and opening the log
while it is still going is opening it to watch it happen. Scrolling up to read an earlier line
pauses following automatically, without unticking the checkbox; scrolling back down, or the
**Newest lines** control that appears only while paused, resumes it. The `<pre>` carries
`role="log"` with `aria-live="off"` rather than letting every line be announced as it arrives, and
an active text selection inside it is never scrolled away from. The preference is remembered
across restarts and is the same shared mechanism (`components/scroll/`) the render console and the
backup log use — see [Render console](./render-console.md) for the full reasoning.

Each row is in one of five states, and they are kept apart because they mean different things:

| State       | What it means                                                                                                              |
| ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| Running     | In flight now                                                                                                              |
| Interrupted | The record says running, and nothing is. The application or the machine stopped before an ending could be written          |
| Finished    | Verified and unpacked                                                                                                      |
| Failed      | Sorted into one of ten kinds, each with its own explanation, and a button to the setting that would fix it where one would |
| Cancelled   | Somebody pressed stop. **Not** a failure, and resumable                                                                    |

A **public** release needs no token and is never asked for one. `GH_TOKEN` is used when the
environment has it, which is what makes a private release and a rate-limited runner work. Note that
signing in to GitHub inside the application does **not** feed this path: the sign-in session and
the downloader's token are not wired together, so a private asset still needs the environment
variable. That is a gap rather than a design, and it is stated here rather than left for somebody
to discover by signing in and finding nothing changed.

Everything lives under the storage directory, one folder per download:

```
<storage>/downloads/<downloadId>/
  parts/          the .001, .002, ... and the .parts.json exactly as published
  <name>.zip      the rejoined archive, written only after every part verified
  content/        what the archive unpacked into
  download.json   what was fetched, from where, and how it ended
```

The parts are kept after a successful download, so re-extracting never means re-downloading.

## Getting one from a command line

Download every numbered part and the `.parts.json` into one directory, then:

```sh
node scripts/join-parts.mjs test-world-seed-1739.zip.parts.json
```

Options:

| Option        | Meaning                                                       |
| ------------- | ------------------------------------------------------------- |
| `--out <dir>` | Write the rejoined file somewhere other than beside the parts |
| `--json`      | Machine-readable result instead of the human report           |

It prints the verified SHA-256 on success. On failure it names the exact part that is wrong, with
its index, so one file can be fetched again instead of all of them, and exits 1.

The script is a thin command line over the `@worldlens/parts` package, which must be built
first:

```sh
cd design && pnpm install && pnpm --filter @worldlens/parts run build
```

## Measured: a real two-wave hosted dispatch

Everything above was arithmetic until [issue #39](https://github.com/Ding-Ding-Projects/material-bluemap/issues/39)
was closed out against a real run rather than an estimate. A 9728×9728 block world was generated
with `@worldlens/worldgen` (seed `20260805`; regenerate with
`node packages/worldgen/dist/cli.js --seed 20260805 --size 9728 --out ./out`), published as a
single 717 MB release asset (`test-world-issue39-20260805`, under the 2 GB cap so it needed no
splitting), and dispatched through `Render world` with `budget-minutes: 1` and `max-jobs: 400` so
the planner's own, non-forced arithmetic — not `--force-shards` — would need more shards than one
matrix can hold.

**The world:** 361 region files (19×19), 369,664 chunks.

**What the plan step measured and decided**, from
[run 30998777252](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30998777252)'s
own log:

```
Measured 361 region files holding 369664 chunks, spanning blocks x 0..9727 and z 0..9727.
Estimated 4h 8m of rendering, 6h 12m with the safety margin, against a per-job budget of 1m 0s.
Needs roughly 5.4 GiB of free disk on a job's runner...
Shard plan written (361 jobs) — shardCount: 361, waveCount: 2, groupCount: 12
```

**The disk check, real `df` against the estimate, before any wave was dispatched:**

```
REQUIRED_BYTES: 5825668056
Required (estimate, with safety margin): ~6 GiB free
Free on this runner right now:            ~84 GiB free
```

6 GiB required against 84 GiB actually free on a standard `ubuntu-latest` runner — the same gap
this project had already documented on the 6.6 GB Andyville world, now reproduced on a second,
independently generated world that pushed the _shard count_, not just the world's own size, past a
boundary the plan had never hit before.

**Wave dispatch, watched directly rather than assumed:** Wave 1 fanned out to all 256 shards and
every one completed successfully. Only then did Wave 2 appear — `render-world.yml` declares
`wave2: needs: [cli, plan, wave1]`, so it structurally cannot exist earlier — carrying exactly the
remaining 105 shards (`Wave 2 shard 256` through `Wave 2 shard 360`). Wave 2 began executing (7 of
its shards finished successfully) before the run was cancelled once this evidence was captured, to
avoid an hours-long full render this proof did not need; 98 of Wave 2's shards were cancelled
in-flight rather than run to completion.

**What this settles:** the plan-driven wave count (raised from a hardcoded 6 to `RENDER_WAVE_SLOTS`
= 12 shortly before this measurement), the disk-estimate-vs-real-`df` check, and — the part no
amount of code reading could confirm — that a second wave genuinely dispatches, in order, once the
first finishes, against a plan the estimate produced rather than one forced with `--force-shards`.

**What this does not settle:** the full run was not carried to completion, so the merge across two
waves' worth of shards (12 merge groups, per `groupCount` above) and the final map this world would
have produced are unverified by this pass. Where the disk ceiling actually sits also remains open —
84 GiB free comfortably covered a 5.4 GiB estimate, so this run says nothing about a world close to
that boundary.

## Publishing one

CI does this on every release, and only when it is actually needed. Before the release is
composed, every asset is measured; anything over 2 GB is split, its parts and manifest are attached
**instead of** the oversized file, and a section is added to the release notes explaining how to
rejoin it. Assets under the cap are attached unchanged and the notes say nothing about splitting,
because a release that did not split anything should not carry instructions for a case that did not
occur.

By hand:

```sh
node scripts/split-parts.mjs big-world.zip                  # 1.7 GB parts, beside the source
node scripts/split-parts.mjs big-world.zip --out release/   # parts somewhere else
node scripts/split-parts.mjs big-world.zip --part-size 500000000
node scripts/split-parts.mjs --check big-world.zip          # would this be split? exits 0 either way
```

A file no larger than the part size is **left alone**: nothing is written and the report says so.
Producing a one-part manifest for a 40 MB installer would make every consumer of every release learn
the join format to open an asset that was never split.

## The manifest format

```json
{
  "version": 1,
  "file": "test-world-seed-1739.zip",
  "bytes": 4030000000,
  "sha256": "6640a521a88283195b790c8bdf6ca176e480c2f9399a8163153d02a2c5b72083",
  "partSize": 1700000000,
  "parts": [
    {
      "index": 1,
      "name": "test-world-seed-1739.zip.001",
      "bytes": 1700000000,
      "sha256": "967c..."
    },
    {
      "index": 2,
      "name": "test-world-seed-1739.zip.002",
      "bytes": 1700000000,
      "sha256": "52e6..."
    },
    {
      "index": 3,
      "name": "test-world-seed-1739.zip.003",
      "bytes": 630000000,
      "sha256": "c77c..."
    }
  ]
}
```

`file` and every `name` must be plain file names. A manifest is downloaded from the internet and
every part name in it is resolved against the directory the manifest sits in, so a name carrying a
path separator, a `..`, a drive letter or a NUL is refused outright rather than resolved.

The reader also proves that the parts are listed in order from 1, that no part is larger than the
stated part size, that every digest is 64 hex characters, and that the parts' lengths add up to the
stated total. A manifest whose two numbers disagree is rejected rather than half-believed, because
neither of them can be trusted once they contradict each other.

## What is verified, and what happens when a check fails

Two checks, both load-bearing:

- **every part** is hashed as it is appended. A bad file is named: "Part 3 of 19
  (`world.zip.003`) does not match the manifest" is a sentence somebody can act on by
  re-downloading one file. "The archive is corrupt" is not;
- **the whole file** is hashed at the end, because nineteen correct parts assembled in the wrong
  order, or with one written twice, produce nineteen passing digests and a broken archive.

A rejoin that skipped these would produce a corrupt world that unzips cleanly and then surfaces as
a _rendering_ bug three layers away, in a file nobody would think to look in. The checks are the
reason the format exists, not a safety net bolted onto it.

When a check fails:

| Failure                                                   | What is left on disk                                                                                                       |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| A part's digest is wrong during a rejoin                  | The output is rolled back to the end of the last good part, so a retry redoes only that part                               |
| A part is missing or the wrong length                     | Nothing is written; the part is named                                                                                      |
| The whole-file digest is wrong although every part passed | The rejoined file is **deleted**, and the message says so                                                                  |
| A download's part arrives corrupt                         | That part file is deleted and re-fetched once; if it fails again the rejoined archive and the unpacked content are deleted |
| A download is cancelled                                   | Everything is kept, including the half-written part                                                                        |

The deletions are deliberate. This project has already been bitten by a file that existed, held
nothing usable, and was treated as complete by everything downstream: a packaged `dist/` with no
binary in it, whose installer kept exiting 0. A failed download must not leave anything that looks
finished. A **cancellation** is not a failure, and keeping what it transferred is the whole point of
a resumable download.

## Resuming

Both halves resume.

**Downloading** continues with an HTTP `Range` request from the byte the last attempt reached. All
three possible answers are handled, because the one that is not handled is the one that silently
corrupts a file:

- `206 Partial Content` is what was asked for, and the bytes are appended;
- `200 OK` means the server ignored the range and is sending the whole file again, so the local file
  is truncated first. Appending a second copy of the first megabyte onto a file that already has it
  produces a file of exactly the wrong length with no error anywhere;
- `416 Range Not Satisfiable` means the local file is at least as long as the remote one, which is
  either a finished download or a corrupt one. It is thrown away and fetched again rather than
  guessed at.

**Rejoining** reads the output file's own length to find out how far the last attempt got, re-reads
that prefix once, and verifies every part it already contains as it goes. That read costs a fraction
of a re-copy and doubles as proof that the bytes already on disk are the right ones, which a naive
"seek to the end and carry on" can never establish. Anything past the last complete part is
discarded rather than trusted, because the bytes at the end of an interrupted write are exactly the
bytes most likely to be short. A prefix whose bytes do not match the parts that claim them is
re-copied from the first part that disagreed.

## Security notes

- **Nothing is loaded into memory.** Every operation streams at one mebibyte at a time. The files
  this exists for do not fit in memory, and `readFile` on a 20 GB archive is not slow, it is a
  crash.
- **Part names cannot escape their directory.** See [the manifest format](#the-manifest-format).
- **Zip entries cannot escape the destination.** Every entry name is resolved against the
  destination and compared after normalisation; absolute names, drive letters, backslash climbs,
  embedded NULs and symbolic links are all refused, and an archive containing one hostile entry is
  refused **before** any of its innocent entries are written.
- **Every entry's CRC-32 is checked as it is read**, and an entry that unpacks to a different
  length than the archive claims is refused. This is the second of two independent checks: the
  archive as a whole has already been proved against its published SHA-256 by the time anything is
  unpacked, so the CRC catches a decompressor that went wrong rather than a transfer that did.
- **The zip reader is written against `node:zlib` alone, with no native dependency.** The
  packaging configuration states the contract in three places: esbuild inlines every runtime
  dependency, no `node_modules` tree reaches the asar, and no native module reaches the packaged
  application. The obvious zip libraries break it - `yauzl-promise` pulls in `@node-rs/crc32`,
  which is a `.node` addon esbuild refuses to bundle, and the Electron build fails outright.
  Store and deflate are supported; an entry compressed any other way is refused **by name**
  rather than written out as garbage, and an encrypted entry is refused too.
- **Zip64 is supported, and is not optional here.** Past 4 GB, or past 65,535 entries, a zip
  keeps its real sizes and offsets in Zip64 records and leaves `0xFFFFFFFF` sentinels in the
  classic fields. A reader that takes those at face value seeks to offset 4294967295 and reports
  a perfectly good 20 GB world as corrupt.
- **A token is never required for a public release.** Without one, the CDN download URL is used,
  which needs no authentication and is not subject to the unauthenticated API's sixty-requests-an-hour
  limit; a twenty-part world would otherwise spend a third of that limit on one download. With one,
  the API asset URL is used, and the `Authorization` header is dropped by the HTTP layer on the
  cross-origin redirect to storage, so the token never reaches the CDN.

## Verification

| What                                                                                                                                                                                                                                                                                                                                                                        | Where                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Split, rejoin, corruption, resume, boundaries, manifest validation                                                                                                                                                                                                                                                                                                          | `design/packages/parts/src/parts.test.ts`                              |
| Release reading and part discovery                                                                                                                                                                                                                                                                                                                                          | `design/packages/app/src/main/download/release.test.ts`                |
| `Range` resume, and the three answers a ranged request can get                                                                                                                                                                                                                                                                                                              | `design/packages/app/src/main/download/http.test.ts`                   |
| Zip extraction and every path-escape case                                                                                                                                                                                                                                                                                                                                   | `design/packages/app/src/main/download/extract.test.ts`                |
| The zip reader itself: store, deflate, Zip64, CRC failure, truncation                                                                                                                                                                                                                                                                                                       | `design/packages/app/src/main/download/zip.test.ts`                    |
| The whole download path, end to end, against a real split archive                                                                                                                                                                                                                                                                                                           | `design/packages/app/src/main/download/downloader.test.ts`             |
| The rows, the failure classification, and events winning over the on-disk record                                                                                                                                                                                                                                                                                            | `design/packages/ui/src/components/downloads/downloads.test.ts`        |
| The panel: reconciling a download already in flight, and reading back a finished one                                                                                                                                                                                                                                                                                        | `design/packages/ui/src/components/downloads/ReleaseDownloads.test.ts` |
| The row's own log disclosure and its auto-scroll checkbox: on by default, `role="log"` with `aria-live="off"`, follows while checked and does not once unchecked, pauses on a manual scroll without unticking the checkbox, resumes on scrolling back down, never scrolls away from a text selection, never moves keyboard focus, and the preference survives a fresh mount | `design/packages/ui/src/components/downloads/DownloadRowCard.test.ts`  |

Run them with:

```sh
cd design && npx vitest run packages/parts packages/app packages/ui/src/components/downloads
```

**What none of them prove.** Every test above drives a stand-in for GitHub's endpoints. No asset
has been fetched from github.com through the application's own panel, so the parts that depend on
GitHub's behaviour rather than on this code, the redirect to storage and the rate limits in
particular, are unproven against the service. There is no capture of the panel either.

The package was also exercised at a size that is genuinely inconvenient: a 400 MB file split into
three 150 MB parts and rejoined, with the SHA-256 compared on both sides, and a rejoin deliberately
interrupted mid-part and resumed. Both matched the source digest.

## Related reading

- [`docs/render-in-actions.md`](render-in-actions.md) - rendering a world in CI, which is what
  produces the large maps this page exists to ship.
- [`scripts/README.md`](../scripts/README.md) - the release-time scripts, including
  `split-parts.mjs` and `join-parts.mjs`.
- `design/packages/parts/src/manifest.ts` - the format, with the reasoning for each field beside it.
- `design/packages/app/src/main/download/downloader.ts` - the order the download steps run in, and
  why that order is the design.
- `design/packages/app/src/main/download/zip.ts` - the zip reader, including why it is written by
  hand and what Zip64 changes.
- `design/packages/ui/src/components/downloads/` - the panel itself, the rows it keeps, and how a
  failure is turned into an explanation and a route to the setting that would fix it.
