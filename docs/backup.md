# Backing up a world or a rendered map

A rendered map is hours of work and a Minecraft world is not reproducible at all, so both are
worth keeping a copy of somewhere that is not the machine they live on. This is that copy: the
application packs the folder into one archive, cuts it into parts, and publishes the parts as the
assets of a **new GitHub release**, with a small pointer file beside them naming every part and its
SHA-256.

**Contents**

- [Why this is not Git LFS](#why-this-is-not-git-lfs)
- [The pointer format is not ours](#the-pointer-format-is-not-ours)
- [What a backup looks like on a release](#what-a-backup-looks-like-on-a-release)
- [Behaviour](#behaviour)
  - [What can be backed up](#what-can-be-backed-up)
  - [Public and private repositories](#public-and-private-repositories)
  - [What happens, in order](#what-happens-in-order)
  - [Restoring](#restoring)
  - [Stopping, and carrying on](#stopping-and-carrying-on)
  - [Backups are append-only](#backups-are-append-only)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)

## Why this is not Git LFS

Git LFS is the obvious answer and the expensive one. On GitHub a free account gets **1 GB of LFS
storage and 1 GB of bandwidth a month**; the bandwidth is metered against every *restore*, not just
every upload, and past it you buy data packs. A rendered map or a Minecraft world is routinely
several gigabytes, so:

- one backup exhausts the free storage tier outright;
- every restore of it is billed again, against a quota that resets monthly;
- an accidental second copy of a large world is a bill, not a warning.

GitHub **release assets** have a completely different cost model. They are free on a public
repository, they are capped at 2 GB *per asset* rather than in total, and downloading one is not
metered against an LFS bandwidth quota. The only thing they cannot do is hold a single file larger
than the cap — which is exactly the problem this project already solved, twice over:
[`@material-bluemap/parts`](./large-worlds.md) splits a file into checksummed parts and rejoins
them, and the downloads surface already fetches parts, verifies each one, rejoins them and unpacks
the result.

So Git LFS was not forgotten here. It was **rejected on cost, by name**, and the code says so in
`main/backup/pointer.ts`, the interface says so in one sentence above the form, and this document
says so first.

## The pointer format is not ours

The idea of "the pointer is committed, the bytes are a release asset" is a shipped subsystem of the
sibling application **Desktop Material**, where it is called **Cheap LFS**. This feature speaks that
format rather than inventing a rival one, so a backup made by either application is readable by the
other.

The canonical files, in that repository:

| File | What it is |
|---|---|
| `app/src/lib/cheap-lfs/pointer.ts` | The canonical v1 contract: the grammar, the bounds, the parser |
| `docs/features/repository-management/release-backed-cheap-lfs.md` | The design, and why it is deliberately not Git LFS |
| `docs/features/repository-management/cheap-lfs-release-payload-encryption.md` | The optional password encryption, which this application does not write |

A v1 pointer is five head lines, plus one line per part when the file was split:

```
version desktop-material/cheap-lfs/v1
release-tag mbm-backup-world-overworld-20260804T101500Z
asset-name world-overworld-20260804T101500Z.zip
size 1100000000
sha256 9f2c...
part 1a2b... 524288000 world-overworld-20260804T101500Z.zip.001-1a2b3c4d5e6f7a8b
part 3c4d... 524288000 world-overworld-20260804T101500Z.zip.002-3c4d5e6f7a8b9c0d
part 5e6f...  51424000 world-overworld-20260804T101500Z.zip.003-5e6f7a8b9c0d1e2f
```

A file small enough to be one asset omits the part lines entirely and is the original five-line
form, byte for byte.

Three rules are followed strictly, because the canonical file says to keep the format canonical
forever:

- **Nothing is added to a pointer.** Everything this application knows about a backup that the
  format does not carry — what kind of thing it was, when, which build made it, how many files went
  in — lives in a **separate `backup.json` asset** on the same release. A pointer with an extra
  field would not parse in the application it was copied from, which is the whole property being
  traded on.
- **New parts are 500 MiB**, which is `CHEAP_LFS_PART_SIZE_BYTES` in the canonical file, not this
  project's own 1.7 GB publish size. A failed part re-transfers its whole size, so a part near the
  2 GB ceiling turns one dropped connection into gigabytes of repeated upload.
- **The reader accepts more than the writer produces.** Parts up to 2 GiB are accepted, because
  pointers exist with parts of exactly that size, and a parser may widen what it accepts and must
  never narrow it.

### What this application does not write

Only plain `part` lines. The compressed (`part-deflate`) and password-encrypted
(`part-encrypted`, `part-encrypted-deflate`) forms are **recognised** — a backup listing names one
as encrypted and says Desktop Material restores it — but they are not written here and cannot be
restored here. That is stated at the surface rather than reported as a corrupt pointer, because
somebody holding an encrypted backup needs to be told this build has no password path, not that
their file is broken.

### What has actually been verified about the interoperability

`packages/app/src/main/backup/pointer.test.ts` copies the canonical regular expressions and the
head-field rules **verbatim** out of `app/src/lib/cheap-lfs/pointer.ts` and runs every pointer this
writer produces through them, line by line. That is a real, checkable claim: what is written here
satisfies the grammar the canonical parser applies.

What is **not** claimed: that a backup made by this application restores through Desktop Material's
own restore path end to end. That needs that application running against a real release, which this
test suite cannot do, and asserting it from a passing regular expression would be a claim about
software this repository does not build.

## What a backup looks like on a release

One backup is one release, tagged uniquely, marked as a prerelease so it never becomes the
repository's "latest release":

```
mbm-backup-world-overworld-20260804T101500Z

  world-overworld-20260804T101500Z.zip.001-1a2b3c4d5e6f7a8b   500 MiB
  world-overworld-20260804T101500Z.zip.002-3c4d5e6f7a8b9c0d   500 MiB
  world-overworld-20260804T101500Z.zip.003-5e6f7a8b9c0d1e2f    49 MiB
  backup.json                                                   1 KB
  world-overworld-20260804T101500Z.zip.cheaplfs                 1 KB
```

The digest in each part's asset name is the first sixteen hex characters of that part's own
SHA-256. It is there for a specific reason — see [resuming](#stopping-and-carrying-on).

## Behaviour

### What can be backed up

Two kinds, and the application refuses a folder that is not the kind it was offered as:

| Kind | What it is | What is checked |
|---|---|---|
| **World** | A Minecraft save: `level.dat` and the region folders | There is a `level.dat` directly inside |
| **Render** | One render workspace under the maps folder | There is a `render.json`, or a `web/` folder |

Picking the folder *above* a world is the most common mistake and the most expensive: without the
check, an hour is spent packing the wrong tree and the mistake surfaces as a restore that produces
a folder Minecraft will not open. The refusal names the folder and says what was looked for.

The folder is read before anything is packed, and the file count and byte total shown are the ones
the pack will actually use — not an estimate. Anything the pack will leave out is named on screen
with the reason, so a count that differs from a file manager's is explained rather than silent.

**Symbolic links are skipped, never followed.** A world folder with a link pointing at a home
directory would otherwise pack that home directory into a backup somebody is about to publish.

### Public and private repositories

The repository is read from GitHub — never guessed from its name — before anything is packed, and
what it is gets said plainly:

- **Public**: a loud warning. Everything uploaded can be downloaded by anybody, with no account and
  no link from you; a world carries your builds, your coordinates and whatever anyone left in a
  chest, and a rendered map carries the same information as pictures. The backup **will not
  proceed** until the acknowledgement is ticked, and the main process refuses an unacknowledged
  public repository as well — a guard that lives only in the renderer is not a guard.
- **Private**: a quieter note. Private is not the same as free: a private repository's releases
  still count against the account's storage limits, and a few large backups can reach them. The note
  says "cheap rather than free" rather than promising anything.

### What happens, in order

1. **Read the folder.** Count the files, total the bytes, name anything that will be left out.
2. **Read the repository.** Visibility, and whether this account may actually write to it.
3. **Pack** the folder into one deterministic Zip64 archive, streamed, hashing as it is written.
4. **Split** it into 500 MiB parts with `@material-bluemap/parts`, each with its own SHA-256.
5. **Publish** a new release under a unique tag.
6. **Upload** every part, then `backup.json`, then the pointer.

The pointer goes **last**, on purpose. It is the completion marker: a release that has one is a
backup that finished, and a release with parts and no pointer is an upload that stopped part-way.
Doing it the other way round — so the release looks complete while the parts are still going up —
produces the single worst failure this feature could have: a backup somebody trusts that restores as
an unverifiable fragment on the day they need it.

The archive is **deterministic**: the same folder packs to the same bytes every time, on any
machine. Entries are sorted by their UTF-8 bytes rather than a locale collation, every timestamp is
the same fixed value, modes and attributes are fixed, and nothing is compressed. Storing rather
than deflating is deliberate — a render is mostly PNG tiles and a world is mostly already-compressed
region files, so compression buys single-digit percentages while spending CPU on every byte of a
multi-gigabyte pack.

Once every part is on the release, the staged archive and its parts are deleted from disk. The
pointer and the sidecar stay: a couple of kilobytes, and the way somebody finds their backup again
when the thing that broke was the network.

### Restoring

**Restoring is the downloads surface**, not a second implementation. A backup restored is a release
downloaded, and this application already fetches parts, checks each one against its published
SHA-256, rejoins them, checks the whole file, and unpacks the result. Choosing **Restore this** in
the backup list hands that surface the release's owner, repository, tag and archive name with the
release already chosen; everything after that is the path documented in
[Large worlds and rendered maps](./large-worlds.md).

Every restored payload is hashed on arrival and must equal the pointer's digest and byte size before
it may replace anything. Downloaded bytes are untrusted input.

A backup whose upload never finished has no pointer, so there is nothing to verify a restore
against. It is **listed** — hiding it would leave somebody hunting for a backup they thought they
made — and marked as unfinished, with no restore button and a note saying that backing the same
folder up again carries it on.

### Stopping, and carrying on

Stopping is safe at any point. A cancelled backup keeps everything it has packed and everything it
has uploaded; starting again against the same release tag carries on rather than starting over.

A resumed upload skips a part when an asset of that **exact name** and **exact size** is already on
the release. The name is what makes that a digest match rather than a guess: it carries the first
sixteen hex characters of the part's own SHA-256, so an asset under that name is one whose content
hashed to that value when it was uploaded, and a re-run of the same backup produces the same names
because the archive is deterministic.

This is stated precisely rather than overclaimed. **GitHub publishes no checksum of its own for a
release asset.** The alternative to name-and-size is downloading every part back to hash it, which
on a resumed 20 GB upload costs more than uploading it again. A part whose stored size does not
match is re-uploaded rather than trusted.

### Backups are append-only

Every backup is its own new release under its own unique tag. Nothing in this application edits a
release, deletes one, deletes an asset, or replaces an asset's bytes — `main/backup/github.ts` has
no function that could, and a tag that already exists is refused rather than adopted, with a message
saying nothing was changed.

There is therefore **no delete button** in the interface, and that is a decision rather than an
omission. A backup somebody no longer wants is removed on GitHub, deliberately, where what is being
removed is in front of them. Adding one here would put an irreversible action behind the
[super-confirmation gate](./super-confirmation.md) and one accidental click; leaving it out means
the worst an accident can do is make one more release.

## Configuration

There is nothing to configure. The pieces that could be settings are decided by the format or by
the cost model:

| Thing | Value | Why it is not a setting |
|---|---|---|
| Part size | 500 MiB | The canonical Cheap LFS write size. Changing it would produce pointers that differ from the sibling application's for no benefit. |
| Compression | None | See above: the payload is already-compressed tiles and region files. |
| Release visibility | Prerelease | A backup quietly becoming somebody's "latest release" would break installer links and release feeds. |
| Where it is staged | `<map storage>/backups/<id>/` | Follows the map storage folder chosen during setup, so a backup does not fill a disk somebody moved away from. |

The GitHub sign-in is shared with the rest of the application and is configured in Settings. A
backup needs an account with **push access** to the chosen repository; the `repo` scope is what
publishing a release requires, and a refusal that is probably a missing scope says so rather than
reporting a bare 403.

## Failure modes

| What happens | What is reported | What is left behind |
|---|---|---|
| Nobody is signed in | "Sign in from Settings", before any network call is made | Nothing; no request was sent |
| The folder is not a world | The folder's path and what was looked for, before any network call | Nothing |
| The folder is empty | A refusal saying an empty backup is worse than none, because it looks like one | Nothing |
| The account cannot write to the repository | Named, with the repository | Nothing; no release was created |
| The repository is public and unacknowledged | The warning, and "Nothing was uploaded" | Nothing |
| The tag already exists | A refusal saying nothing was changed and the existing release was left alone | Nothing |
| The token is refused (401) | The refusal, plus a route to sign in again at the surface where it happened | Whatever had uploaded |
| The connection drops mid-upload | The failure, and the row offers to carry on | The staged archive, the parts, and every asset already uploaded |
| Cancelled | "Everything already packed and uploaded is kept" | The same |
| The pack is cancelled or fails | The failure | Nothing: a partial archive is deleted, because a half-written zip looks exactly like a finished one to anything that only checks the name |

Every failure is reported in the main process's own words. Nothing is retried silently, and no
failure is reported as a success.

## Security considerations

- **The token never crosses to the renderer.** The main process holds the GitHub session and
  resolves a token per operation. Nothing on the bridge carries a credential in either direction,
  and `ipc.test.ts` walks every channel's answer asserting the token does not appear in it.
- **Publishing a world is publishing everything in it.** The public-repository warning is the whole
  point: a save carries coordinates, builds, inventories and anything a guest left behind. Once it
  is up, assume somebody has a copy — deleting the release later does not recall what was
  downloaded.
- **Links are not followed.** A link inside a world folder is skipped and named, so a backup cannot
  be talked into packing a home directory.
- **Everything read back off a release is untrusted.** Anybody with write access to that repository
  could have replaced `backup.json` or the pointer. Both are size-bounded before they are fetched,
  every field is proved before a listing shows any of it, and anything doubtful makes the whole
  record unreadable rather than a half-populated row. Part names in a pointer are plain file names;
  nothing resolves one against a directory without that check.
- **No encryption is written here.** A backup on a public repository is public. If a world needs to
  be stored where its contents cannot be read, that is Desktop Material's encrypted Cheap LFS
  payload, or a private repository — not this feature pretending to offer either.
- **Nothing existing is ever changed.** The append-only rule is not a convention; the functions that
  would break it are not in the module, and a test watches every request across a full backup and a
  resume, asserting that the only methods used are `GET` and `POST`.

## Verification

Everything below runs from `design/`.

```
npx tsc -p packages/app/tsconfig.json --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
npx eslint packages/app packages/ui
npx vitest run packages/app packages/ui
```

The tests for this feature, and what each one is for:

| File | What it pins |
|---|---|
| `main/backup/pointer.test.ts` | The canonical v1 regular expressions, copied verbatim, applied to what this writer produces; the five-line single-asset form; the part-sum rule; encrypted and deflated pointers named as unsupported rather than broken |
| `main/backup/archive.test.ts` | The same folder packs to the same digest twice; what is written opens in this project's own `ZipReader` and unpacks through `extractZip` into an identical tree; a cancelled pack leaves nothing behind |
| `main/backup/source.test.ts` | A world without a `level.dat` is refused; the folder above a world is refused by name; an empty folder is refused; tags and archive names are safe for a tag, a file name and a URL at once |
| `main/backup/sidecar.test.ts` | Every field proved before a listing trusts it; a bad version, kind, digest or count makes the record null |
| `main/backup/github.test.ts` | Only repositories with push access are offered; a 422 on a taken tag says nothing was changed; an upload streams rather than buffering; no method other than `GET` or `POST` is ever sent |
| `main/backup/runner.test.ts` | A whole backup against real folders and a fake GitHub: the pointer's parts hash to what landed and rejoin to the promised archive; the pointer goes up last; a public repository is refused unacknowledged and uploads nothing; a resume skips digest-matched parts and re-uploads a truncated one; a cancel mid-part keeps what was already up and never leaves a pointer |
| `main/backup/ipc.test.ts` | Exactly the named channels are registered and removed; the token appears in no answer; being signed out is an answer rather than a crash |
| `components/backup/backups.test.ts` | Events land in the right row; a refusal with no id is reported beside the form, not as a phantom row; reading a repository clears the previous answer first |
| `components/backup/BackupScreen.test.ts` | A build with no bridge says what is needed; the public warning and its acknowledgement render; restoring emits the release's coordinates and fetches nothing itself; an unfinished backup offers no restore |

What has **not** been verified, stated plainly:

- No backup has been made against real GitHub from this branch. Every GitHub interaction here is
  exercised against a fake that records the whole conversation.
- The interoperability claim is checked at the level of the pointer grammar only. See
  [what has actually been verified](#what-has-actually-been-verified-about-the-interoperability).
- The largest archive packed in a test is a few megabytes. The Zip64 records are written for every
  entry rather than only for large ones precisely so the 4 GB boundary is not a code path that only
  runs on the archives nobody can afford to test with, but that boundary has not been crossed with
  real data here.

## Related reading

- [Large worlds and rendered maps](./large-worlds.md) — the split-and-rejoin machinery a backup
  uses, and the download half that restores one.
- [Rendering a world that lives in a private repository](./private-world-rendering.md) — the other
  place this project puts a world on GitHub, and what that does and does not protect.
- [Super confirmation](./super-confirmation.md) — the gate a delete would need, and why append-only
  means there is nothing here to gate.
- [Finding worlds](./finding-worlds.md) — where the worlds offered as backup sources come from.
