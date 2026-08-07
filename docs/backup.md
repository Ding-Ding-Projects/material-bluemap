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

### What has actually been verified — format conformance only, permanently

`packages/app/src/main/backup/pointer.test.ts` copies the canonical regular expressions and the
head-field rules **verbatim** out of `app/src/lib/cheap-lfs/pointer.ts` and runs every pointer this
writer produces through them, line by line. That is a real, checkable claim: what is written here
satisfies the grammar the canonical parser applies.

This project states, permanently, that the claim stops there. It is **format conformance**, not
**interoperability**, and the two are not the same claim — a backup made by this application has
never been restored through Desktop Material's own restore path, and a backup made by Desktop
Material has never been restored by this application. See
[issue #36](https://github.com/Ding-Ding-Projects/material-bluemap/issues/36) for the full
accounting of what was checked before this was settled: Desktop Material was confirmed present on
the verifying machine and does share this exact canonical pointer format and a release-asset
backend, so a round trip is not blocked by the sibling application being unavailable. It was not
run because a genuine two-application, real-GitHub round trip in both directions, over both the
single-asset and the split pointer shapes, is a substantial cross-project integration effort that
was judged to be its own piece of work rather than something to attempt inside an unrelated pass.
Outcome B — stating the limit permanently rather than proving the stronger claim — is the
explicitly sanctioned resolution the issue itself offers for exactly this situation, and this
project has taken it. A future task that wants to attempt the live round trip instead starts from
this same file, `pointer.test.ts`, and `design/ROADMAP.md`'s Backups row.

Nothing here is claiming something false in the other direction either: the code, the tests, and
this documentation have always been accurate about the limit. This section exists so the boundary
reads as a permanent, deliberate decision instead of an open question nobody answered.

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

### Creating a repository, when nothing suitable exists yet

The repository picker used to be able to do exactly one thing: list what already existed. Somebody
with no repository to back up to had to leave the application, make one on GitHub by hand, and come
back to pick it — a dead end for the person this feature exists to help the most, the one who has
never done this before.

`createRepository` (`main/backup/github.ts`) closes that gap from the same "Where to keep it" card
the picker and the owner/repository fields already live on, rather than opening a second dialog:

- **The owner is either your own account or an organisation you belong to.** GitHub uses two
  different endpoints for the two cases — `POST /user/repos` for a personal repository, `POST
  /orgs/{org}/repos` for one under an organisation — so this screen asks which one applies with a
  two-choice picker rather than guessing from the typed name.
- **Visibility is a real choice, with the consequence stated in the same words as everywhere else
  on this screen:** PUBLIC means anybody can download it, private means only granted accounts can
  see it and is not free storage.
- **It is initialised with one starter commit.** A repository with no commits at all answers a very
  specific 422 the moment anything tries to create a release on it — `"Repository is empty."` — the
  exact trap the append-only design above already had to name once, discovered against a real,
  freshly created, never-pushed-to repository. `auto_init: true` sidesteps it entirely for the very
  first repository somebody creates from this screen.
- **A taken name is told apart from every other 422** GitHub answers with the same status — an
  invalid character, a name that is only punctuation, one past the length limit — and reported with
  its own `name-taken` code so the interface can point at the name field rather than showing a
  generic failure.
- **Creating never overwrites.** GitHub itself refuses a name that already exists, so there is no
  "re-initialise an existing repository" path anywhere in this feature that would need gating behind
  the destructive-action super-confirmation — the operation that would need it simply does not exist.
- **The new repository is selected automatically.** The owner and repository fields already name
  what was just created, and creating it re-reads the repository exactly as choosing an existing one
  from the list does, landing at the same "what uploading here would mean" report rather than
  leaving somebody to press Check themselves.

### Searching the repository list

`listWritableRepositories` reads up to three pages of `/user/repos` — 300 repositories, most
recently active first — and hands the whole, already-bounded set to the screen in one answer; there
is no further paging from the interface. The repository picker's search (the shared
`ConfigSearchField`, with its own anchored regex builder, plain text by default) is therefore
complete over what was loaded and says so: the summary line reads "showing N of 300 loaded
repositories" rather than implying it searched the whole account, and if the repository you want is
not among the 300 most recently active, the owner/repository text fields beside the list remain the
honest way to reach it. Three distinguishable states cover what the list can be: nothing loaded yet,
this account genuinely has none, and no loaded repository matched the current search.

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

### Watching it happen

Each row's **Show what it reported** disclosure holds up to 100 log lines (`LOG_LIMIT` in
`backups.ts`), and once opened it carries a **Follow new lines** checkbox, on by default — a
backup can talk for an hour, and opening the disclosure while it is still running is opening it to
watch it happen. Scrolling up to read an earlier line pauses following automatically, without
unticking the checkbox; scrolling back down, or the **Newest lines** control that appears only
while paused, resumes it. The list carries `role="log"` with `aria-live="off"`, so it is reachable
and readable with the keyboard without a screen reader narrating every line as it arrives. The
preference is remembered across restarts, shared by every open backup row rather than kept per
row, and it is the same mechanism (`components/scroll/`) `RenderConsole.vue`'s own console and
`DownloadRowCard.vue`'s own log use — see [Render console](./render-console.md) for the full
reasoning behind the pause-on-scroll-up behaviour and the `aria-live="off"` choice.

### Restoring

**Restoring has its own engine, `main/backup/restore.ts`**, not the downloads surface. This section
used to say the opposite — that a backup restored is a release downloaded through the same path
[Large worlds and rendered maps](./large-worlds.md) documents — and that was never true. That path
understands exactly one split format: a `<name>.parts.json` manifest beside `<name>.001`,
`<name>.002`, … A backup's parts are named `<archive>.<index>-<sha16>` and no `.parts.json` is ever
published beside them — the Cheap LFS pointer *is* the manifest, in a shape that has to stay
byte-for-byte what `desktop-material`'s own parser accepts — so the downloads surface's own
discovery never recognised a Cheap LFS release as a split download at all, and nothing before
`restore.ts` existed had exercised the claim against a real release to find out.

`restore.ts` reads a release's sidecar and pointer, refuses one whose upload never finished (no
pointer, no whole-file digest to trust), fetches every part with a resumable ranged request,
translates the pointer into a `@material-bluemap/parts` manifest in memory so the existing rejoin —
per-part digest, resumable prefix verification, whole-file digest — is reused rather than
reimplemented, and then unpacks the verified archive. Every restored payload is hashed on arrival
and must equal the pointer's digest and byte size before it may replace anything; downloaded bytes
are untrusted input.

Proven against real `github.com`: `backup.realGithub.test.ts` (skipped without
`MBM_TEST_BACKUP_LIVE=1`) packs, publishes, cancels mid-upload, resumes under the same tag, and
restores — twice, once as a fresh backup and once as a resumed one — with the restored folder
checked byte-for-byte against the original. **Not yet done:** the application's own **Restore
this** button still only opens Downloads and asks the person to fetch the release by hand — the new
engine is not wired to a channel, a bridge method, or the button, so nobody can reach it from the
interface yet. That wiring is the one piece of this feature that remains.

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

When the CI-render surface uses `gh` as its credential route, it still uses this same packer,
splitter, pointer and resume logic. Before a release is read, created or uploaded, the selected
account is matched against `gh`'s real signed-in inventory, switched active when necessary, and
verified through `gh api user`. That switch affects the whole computer and is left active. Release
commands carry an enterprise host through `--repo <host>/<owner>/<repository>`; they never receive
the unsupported `--hostname` flag.

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
| The selected `gh` account is missing, unhealthy, cannot be switched, or verifies as a different identity | The exact account/host refusal and **Open GitHub accounts** beside it | Existing uploaded parts remain; no new release command runs under the wrong identity |
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
- **A CLI fallback cannot drift to another identity.** The selected host/login is sourced from
  `gh auth status --json hosts`, auto-switched with `gh auth switch`, re-read, then verified with
  `gh api user` immediately before release operations. No token appears in arguments or messages.

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
| `main/backup/github.test.ts` | Only repositories with push access are offered; a genuine taken-tag 422 (matched by GitHub's own `errors[].code`) says nothing was changed; an *empty-repository* 422 — the same status, a different body — is told apart and named correctly rather than reported as a taken tag; an upload streams rather than buffering; no method other than `GET` or `POST` is ever sent |
| `main/backup/runner.test.ts` | A whole backup against real folders and a fake GitHub: the pointer's parts hash to what landed and rejoin to the promised archive; the pointer goes up last; a public repository is refused unacknowledged and uploads nothing; a resume skips digest-matched parts and re-uploads a truncated one; a cancel mid-part keeps what was already up and never leaves a pointer |
| `main/backup/restore.ts` (`restore.test.ts`) | A real `BackupRunner` upload round-tripped through the real restorer, byte for byte, including the single-asset (unsplit) form; a stopped upload with parts but no pointer is refused as incomplete rather than restored; a corrupted part is caught before anything unpacks; cancellation is reported as cancellation, not failure |
| `main/backup/backup.realGithub.test.ts` | Skipped unless `MBM_TEST_BACKUP_LIVE=1`. Packs, publishes, cancels mid-upload, resumes under the same tag, and restores — against real `api.github.com` and `uploads.github.com`, not a fake — with the restored folder checked byte-for-byte against the original both times |
| `main/backup/ipc.test.ts` | Exactly the named channels are registered and removed; the token appears in no answer; being signed out is an answer rather than a crash |
| `components/backup/backups.test.ts` | Events land in the right row; a refusal with no id is reported beside the form, not as a phantom row; reading a repository clears the previous answer first |
| `components/backup/BackupScreen.test.ts` | A build with no bridge says what is needed; the public warning and its acknowledgement render; restoring emits the release's coordinates and fetches nothing itself; an unfinished backup offers no restore |
| `components/backup/BackupRunCard.test.ts` | The log toggle's `aria-controls` names the revealed list; the auto-scroll checkbox is on by default with a real accessible name; the log is a `role="log"` region with `aria-live="off"`; new lines scroll the view while checked and do not once unchecked; scrolling away pauses without unticking the checkbox and shows a jump control; scrolling back to the bottom resumes and hides it; an active text selection inside the log is never scrolled away from; keyboard focus is never moved; the preference survives a fresh mount |
| `main/cirender/transport.test.ts` | The shared upload transport's exact `gh release` command shape on github.com and enterprise hosts; auto-switch and identity verification; success, refusal and resume; and no release call after missing-account, switch-failure or identity-mismatch guards |
| `components/cirender/CiRenderScreen.test.ts` | A blocked selected `gh` account exposes **Open GitHub accounts** beside the route failure, not in a distant menu |

What has **not** been verified, stated plainly:

- The application's **Restore this** button is not wired to `restore.ts`. Pressing it today still
  only opens Downloads and asks the person to fetch the release by hand; see
  [Restoring](#restoring) above.
- The interoperability claim is checked at the level of the pointer grammar only. See
  [what has actually been verified](#what-has-actually-been-verified-about-the-interoperability).
  Nobody has restored a backup made here through Desktop Material's own restore path, or the other
  way round.
- The largest archive packed in a test — including the live one — is a few megabytes. The Zip64
  records are written for every entry rather than only for large ones precisely so the 4 GB
  boundary is not a code path that only runs on the archives nobody can afford to test with, but
  that boundary has not been crossed with real data here.
- The repaired CLI route has not uploaded the reported 1.99 GB / 6,472-piece world, and no test
  changes the machine's real active `gh` account. Command shape, account switching and failure
  containment are locally proven; a real account/network run remains external verification.

## Related reading

- [Large worlds and rendered maps](./large-worlds.md) — the split-and-rejoin machinery a backup
  uses, and the download half that restores one.
- [Rendering a world that lives in a private repository](./private-world-rendering.md) — the other
  place this project puts a world on GitHub, and what that does and does not protect.
- [Super confirmation](./super-confirmation.md) — the gate a delete would need, and why append-only
  means there is nothing here to gate.
- [Finding worlds](./finding-worlds.md) — where the worlds offered as backup sources come from.
