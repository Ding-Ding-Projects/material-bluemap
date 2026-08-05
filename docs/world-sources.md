# Worlds from somebody else's release

A world does not have to live on this computer or in this repository. It can be a release
asset in **any public GitHub repository**, and it can be published in pieces because it is far too
large to be one file.

Both of those were true before and neither worked. `gh release download` without `--repo` can only
read a release in the repository the run is happening in, and the only split layout anything here
understood was this project's own `<name>.parts.json`. A 6.6 GB world published as four
`.zip.part.NNNN` files beside a `SHA256SUMS` — the ordinary output of a backup script — read as five
unrelated files, none of which is a world.

**Contents**

- [What a world source looks like](#what-a-world-source-looks-like)
- [The two split layouts](#the-two-split-layouts)
- [Using one in the desktop application](#using-one-in-the-desktop-application)
- [Using one in GitHub Actions](#using-one-in-github-actions)
- [What is verified, and what happens when a check fails](#what-is-verified-and-what-happens-when-a-check-fails)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## What a world source looks like

Any of these names the same repository, and the last one names a particular release in it:

```
cafepromenade/Andyville-World
github.com/cafepromenade/Andyville-World
https://github.com/cafepromenade/Andyville-World
https://github.com/cafepromenade/Andyville-World.git
https://github.com/cafepromenade/Andyville-World/releases/tag/andyville-backup-20260804-160001
```

The last one carries a tag, and carrying it through is the point: somebody who pasted a link to
*that* release means that release, and quietly fetching `latest` instead would hand them a
different world with nothing on screen to say so.

Everything else is refused rather than encoded and hoped about. `owner` and `repo` end up in a
GitHub API path, so both are checked against GitHub's own name grammar — no `..`, no leading
hyphen, no forty-character login — and a link to another forge is refused rather than treated as
though it were GitHub, because its API is not this one.

## The two split layouts

A release asset is capped at 2 GB, so any large world arrives in pieces. There are two ways the
world publishes those pieces and this project reads both.

**A parts manifest**, which is what [large worlds](./large-worlds.md) describes and what this
project itself publishes:

```
test-world.zip.001          1.70 GB
test-world.zip.002          1.70 GB
test-world.zip.parts.json     684 B
```

**A checksum list**, which is what `sha256sum > SHA256SUMS` produces and what most of the world
actually does:

```
andyville-world-20260804-160001.zip.part.0000   1.70 GB
andyville-world-20260804-160001.zip.part.0001   1.70 GB
andyville-world-20260804-160001.zip.part.0002   1.70 GB
andyville-world-20260804-160001.zip.part.0003   1.52 GB
SHA256SUMS                                        448 B
```

`<name>.part.0000`, `<name>.part0000` and `<name>.001` are all read as the same thing, and the
numbering may start at 0 or at 1 — both are published and neither is wrong.

**The manifest wins wherever a release carries both**, because it publishes a digest for the whole
archive as well as one per part, and the checksum list only publishes the per-part ones. A release
that has both is read the stronger way.

A gap in the numbering is refused, by name, before anything is downloaded. That is not tidiness:
parts are concatenated in index order, so a missing middle part does not produce an error, it
produces a **shorter archive that still unzips** and a world that opens and corrupts later, three
layers away from anything that would point at the download.

## Using one in the desktop application

The map wizard's world step's release downloader (`ReleaseDownloads.vue`) reaches this
through the downloads bridge's `discoverRelease` and `startDownload`, which the preload
answers from `worldsource:discover` and `worldsource:fetch` rather than from
`download:discover`/`download:start`. That is the whole of the wiring: the panel's own
contract to the interface - `owner`, `repo`, an optional `tag`, and a `split`/`parts`/`bytes`
summary of what a release offers - never changed, so a manifest-shaped download from this
project's own releases keeps behaving exactly as it always did. What changed is what answers
it, and a checksum-list release from any public repository is understood the same way a
manifest-shaped one always was. `main/preload/worldSourceBridge.ts` is the seam that turns a
source's `kind` into the panel's `split` flag; see its own test for the mapping.

An optional field above the owner/repository/tag fields calls `worldsource:parse` on every
keystroke and writes what it resolves to into those three - the "paste a link" behaviour
described above. `worldsource:cancel` and `worldsource:active` are used for the same reason
`discoverRelease`/`startDownload` are: they are the union of what the checksum-list fetcher's
own in-flight map and the shared release downloader each have running, and asking only
`download:cancel`/`download:active` would silently fail to stop or list a checksum-list
download. `download:list` is untouched, because both paths write the same `DownloadRecord`
shape into the same on-disk workspace layout, so it already reads a checksum-list download
back with no change of its own.

Under the hood, `main/worldsource/` is deliberately thin. Everything already solved is reused:

| What | Where it comes from |
|---|---|
| the release lookup, the token decision, the CDN-versus-API URL choice | `main/download/release.ts` |
| the resumable ranged transfer | `main/download/http.ts` |
| the safe unpack | `main/download/extract.ts` |
| the join, with its per-part re-check and its resume | `@material-bluemap/parts` |
| the progress events, the failure codes, the on-disk workspace | `main/download/` |

A manifest-shaped or unsplit download is handed straight to the existing `ReleaseDownloader`, which
already does it and already does it better. The genuinely new path is the checksum-list one, and it
runs in this order:

1. read the release, from whichever repository was named;
2. fetch the checksum list first — a few hundred bytes, and the only thing that says what the parts
   are supposed to be;
3. fetch every part, several at a time, each with an HTTP `Range` request continuing from whatever
   is already on disk;
4. hash every part in join order, checking each against its published digest and deriving the
   whole-archive digest in the same pass;
5. join, which re-checks each part as it is appended and then checks the whole;
6. unpack.

Progress, cancellation and the download list are the **same ones a download from this repository
uses**. Events are broadcast on the download channel rather than on a channel of this feature's own,
so a world fetched from a stranger's repository appears in the same list, moves the same bar and is
stopped by the same button. A second event channel would mean a second list, and a download in one
of them would be a download the other could not see or cancel.

## Using one in GitHub Actions

`Render world` takes a `world-repository` input beside `world`. Leave it blank for this repository;
set it to `owner/name` for anybody else's:

| Input | Value |
|---|---|
| `world-source` | `release-asset` |
| `world-repository` | `cafepromenade/Andyville-World` |
| `world` | `andyville-backup-20260804-160001/andyville-world-20260804-160001.zip` |

The `world` field is still `asset` or `tag/asset`; a release asset's name cannot contain a slash, so
splitting on the **last** one is unambiguous and keeps a tag with slashes in it (`release/1.4`)
working. For a split archive, name the **base** archive (`…zip`), not one of its parts — the run
downloads everything whose name begins with it, which is the whole file when it was published whole
and every part when it was not.

The run then does what the application does: prefers a `.parts.json`, otherwise verifies every part
against `SHA256SUMS` with coreutils' own `sha256sum --check --strict`, derives a manifest from the
verified parts, and joins with `scripts/join-parts.mjs` — the same joiner the application runs and
the same one a person runs by hand. There is exactly one joining implementation in this repository
and this feature did not add a second.

> [!NOTE]
> Disk, measured rather than assumed. An earlier version of this note said a hosted runner "does not
> have room for all three at once", meaning the parts, the joined archive and the unpacked tree. That
> was wrong, and it was wrong in the direction that discourages people from trying.
>
> A standard runner reports **145 GB total with 87 GB free before anything is cleaned up**. Rendering
> the 6.6 GB Andyville world peaked around 21 GB above baseline while holding all three copies, and
> finished with 104 GB still free. The parts and the archive are still deleted as soon as the world is
> unpacked, because there is no reason to carry them — but that is tidiness, not necessity.
>
> Where the ceiling actually is has **not** been established: no run has been pushed until it ran out.
> 6.6 GB is not close to it.

The workflow input cap is also a real limit: GitHub documents **ten** `workflow_dispatch` inputs and
`world-repository` is the tenth. An eleventh means folding two existing ones together first.

## What is verified, and what happens when a check fails

| Layout | Per-part digest | Whole-archive digest |
|---|---|---|
| `<name>.parts.json` | published, checked | published, checked |
| `SHA256SUMS` | published, checked | **derived locally**, checked against the join |
| a single asset | none published | recorded, not checked |

The derived digest is worth stating precisely, because calling it "verification" would be a claim
the code cannot support. It is computed from the parts *after* they have been checked against the
release's own list, and the join is then made to reproduce it. So it proves the join wrote what it
read — a truncated write, a full disk, a copy that stopped halfway — and proves nothing at all about
whether the publisher's file was right. **The per-part digests are the only external authority**, and
they are checked before anything is joined.

A part that fails its digest is named, with both digests, so one file can be fetched again instead
of all of them. It is deleted first and never resumed into: bytes that failed a check are the one
thing on disk that must not be appended to. It is then re-fetched once; if the second copy is wrong
too, the download fails.

A part the checksum list never mentions is a **failure**, not a pass. An absent expectation is not a
satisfied one, and a reader that treats it as one joins unverified bytes into somebody's world.

A **failure** deletes the joined archive and the unpacked tree — the two things that look finished to
whatever comes next — and keeps the parts, which are individually checksummed and safe to resume
from. A **cancellation** keeps everything, including the half-written part; that is the point of a
resumable download, and a cancellation is not a failure and is never shown as one.

## Failure modes

| What happened | What is reported |
|---|---|
| the text is not a repository | the field simply stays invalid; nothing is requested |
| the repository or release does not exist | `release-not-found`, with the URL that was asked for |
| the release has nothing by that name | `asset-not-found`, listing what it does have |
| the release offers several worlds and none was named | refused, listing them, rather than guessing |
| the split has a gap in it | `manifest-invalid`, naming the two parts it jumps between |
| `SHA256SUMS` has a line that is not a digest | `manifest-invalid`; the file is refused whole rather than partly parsed |
| a part does not match its digest | `integrity-failed`, naming the part and both digests |
| the download folder cannot be written | `storage-unwritable`, pointing at the storage setting |
| the person cancelled | `cancelled`, which is not an error |

## Security notes

- **A public release needs no token and must never demand one.** The whole point of publishing a
  world is that anybody can fetch it. `GH_TOKEN` is used when it is there — a private repository and
  a rate-limited runner both need it — and when there is none the browser download URL is used
  instead, which needs no authentication and is not subject to the unauthenticated API's
  sixty-requests-an-hour limit. A twenty-part world would otherwise spend a third of that limit on
  one download.
- **A token never reaches a CDN.** With a token the API asset URL is used, and undici drops the
  `Authorization` header on the cross-origin redirect to storage.
- **Every name from a release is treated as hostile.** A `SHA256SUMS` line naming
  `../../../.ssh/authorized_keys`, or a part name with a separator in it, is refused rather than
  resolved: every one of those names is joined against the directory the parts were downloaded into.
- **Owner and repository are validated before they are put in an API path**, not escaped afterwards.
- **Archives are unpacked through the existing safe extractor**, which refuses an entry that would
  land outside the destination.
- The application never executes anything out of a downloaded world.

## Verification

`design/packages/app/src/main/worldsource/` has 51 tests, and not one of them needs the network, a
token or a GitHub account:

| File | What it proves |
|---|---|
| `repository.test.ts` | every URL spelling reads to the same pair; a tag in a release link survives; names GitHub could not have are refused |
| `checksums.test.ts` | the **real** Andyville `SHA256SUMS`, verbatim; GNU and BSD spellings; a partial parse is refused; a name that is not a plain file name is refused |
| `layout.test.ts` | the real four-part Andyville release reads as one 6.6 GB world; a gap is refused by name; a manifest beats a checksum list |
| `fetcher.test.ts` | the whole path end to end against a real zip, really split, really served: a cross-repository release, a part that fails its digest and is repaired, a part that stays wrong and leaves nothing behind, a part the list never mentions, the derived manifest, and a cancellation |
| `ipc.test.ts` | the channels register and dispose exactly, and no handler rejects |

The desktop UI's wiring to those channels - the part this section used to carry a warning
about - has its own coverage. `preload/worldSourceBridge.test.ts` has 8 tests proving the
mapping between what `worldsource:discover` answers and what the downloads panel has always
read (a checksum-list source becomes `split: true`, a `whole` one becomes `split: false`,
a failure carries its message through), free of every Electron import so a plain vitest run
exercises it directly rather than trusting the wiring. `ReleaseDownloads.test.ts` and
`downloads.test.ts` in `design/packages/ui/src/components/downloads/` cover the panel itself
end to end against a fake bridge: the "paste a link" field stays hidden without
`canParseLink`, a real release link fills the owner/repository/tag fields, and text that
resolves to nothing leaves them alone.

Run them with `npx vitest run packages/app` and `npx vitest run packages/ui` from `design/`.

The workflow is checked with `actionlint` **and** `shellcheck` installed. That pairing matters:
actionlint silently skips every shell check when shellcheck is absent and still exits 0, so a clean
run without it proves only that the YAML parsed.

Verified since, on a real dispatched run against the 6.6 GB Andyville release: the four parts and
`SHA256SUMS` downloaded cross-repo in 55 seconds, all four verified `OK`, a manifest derived from the
verified parts, the join checked against it, and the archive unpacked — 8.1 GB of world. The planner
then measured 1,461 region files and 929,898 chunks and produced a six-shard plan, and the first
shard rendered 3,462 hires tiles.

That run also exposed three defects this feature had been hiding rather than causing: the planner
looked for the overworld only at the world root while this save keeps every dimension under
`dimensions/`; every render job installed Java 21 to run a jar the build compiles with Java 25; and
the disk note above was simply false. All three are fixed.

Still not verified: the merge into a complete map, and where the disk ceiling actually is.

## Related reading

- [Large worlds and rendered maps](./large-worlds.md) — the parts manifest this reads first, and how
  this project publishes one.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — what happens to the world once it
  has arrived.
- [Rendering on a remote host](./remote-render.md) — the other way a world leaves this machine.
- [Finding worlds](./finding-worlds.md) — the worlds already on this computer.
