# A world kept in a git repository

A world does not have to be zipped, split into parts, and republished as a release every
time it changes. It can live in a git repository instead, and be kept up to date the way
this project already keeps its own releases up to date: **incrementally**, with nothing
re-uploaded that has not changed.

**Contents**

- [The fact this rests on](#the-fact-this-rests-on)
- [Why this is not the Pages publisher's design, copied](#why-this-is-not-the-pages-publishers-design-copied)
- [Publishing and updating from the application](#publishing-and-updating-from-the-application)
- [Using one in GitHub Actions](#using-one-in-github-actions)
- [The cheap change check](#the-cheap-change-check)
- [Sharding and sparse checkout: evaluated, and rejected](#sharding-and-sparse-checkout-evaluated-and-rejected)
- [Honesty: limits, and what a rejected push does](#honesty-limits-and-what-a-rejected-push-does)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## The fact this rests on

git deduplicates by content hash. A Minecraft world is thousands of `.mca` region files;
when a world changes, only a handful of them do. git already knows this, and a push already
only sends the objects the remote does not have. Kept in a repository, a world updates the
same way — no repacking, no re-zipping, no re-uploading of unchanged regions, which is
exactly the cost the release-asset route (see [Worlds from somebody else's
release](./world-sources.md)) has when a world is republished whole every time.

Git LFS was considered and rejected here for the same reason it was rejected for the
project's own backups — see [Backing up a world or a rendered map](./backup.md). 1 GB of
free storage and bandwidth metered against every restore make it the wrong tool for
something that is meant to be synced often and cloned freely.

## Why this is not the Pages publisher's design, copied

[Publishing a rendered map to GitHub Pages](./pages-hosting.md) solved a structurally
identical problem first: a git directory kept outside the payload, a marker file that
proves ownership before a branch is ever touched, batched staging so a person watching
thousands of files sees a moving number, a push read back from GitHub rather than assumed,
and a durable resume record. `WorldRepoHost`
(`design/packages/app/src/main/worldrepo/repo.ts`) reuses every one of those, in the same
shape.

What is worth stating precisely is why an **orphan commit is still correct for a world**,
and is not merely inherited from copying the map's code:

- **The remote never grows.** Every sync force-replaces the target branch with one fresh
  commit, so a world synced daily for a year is one commit on GitHub, not 365. That is the
  exact trap the Pages publisher's own design note warns about — a plain repository that
  keeps every historical version of every changed file forever — solved the same way a
  second time.
- **The push still only sends what changed.** git's push negotiation excludes every object
  reachable from a ref the remote currently advertises, **independent of whether the new
  commit is a child of the old one**. All the client needs is to still know those old
  objects locally, and `WorldRepoHost` keeps the same git directory — the same object
  database — across every sync of the same target, deleting only the branch ref and the
  index before each one. That is what makes an "orphan" commit still cost only the bytes
  that changed, and it is proven directly in `incremental.test.ts` (see
  [Verification](#verification) below), not merely argued.
- **The one gap that leaves** is a local git directory that has never seen the remote's
  current state — the first sync from a new computer, or a repository something else
  already published to. `WorldRepoHost` closes it with the one thing `pages/hosting.ts`
  does not need: before resetting the branch, it fetches the remote branch's objects into
  the local database first, best-effort. A failure there costs one sync's worth of
  bandwidth; it never costs correctness, because the orphan reset and force-push after it
  are correct either way.

## Publishing and updating from the application

The **World repository** tab drives this end to end — `WorldRepoScreen.vue`
(`design/packages/ui/src/components/worldrepo/`), reached from the tab strip beside
**Publish to Pages**, the other direction the identical trick runs in. Nothing about the
main-process host below is exclusive to that screen: `WorldRepoHost` takes a world folder
path directly — the same folder a render already reads, which may be an actively-running
server's save folder — and a repository to keep it in:

1. **Preflight** (`WorldRepoHost.preflight`) reads the world folder, the target repository
   and branch, and reports what syncing would do without writing a byte: file count and
   total size, whether anything past GitHub's 100 MB per-file limit exists, whether the
   folder even looks like a Minecraft world (a `level.dat`, not required — a folder without
   one is still synced, just with a warning), and whether the target branch already carries
   this application's marker or somebody else's.
2. **Sync** (`WorldRepoHost.sync`) requires an explicit acknowledgement of that preflight —
   the same `acknowledgeSync`/`acknowledgePublish` pattern the Pages publisher uses — then
   fetches the remote's objects if needed, stages the world's files in batches, commits,
   force-pushes, and reads the branch back from GitHub to confirm the push actually landed
   rather than assuming a zero exit code meant it did.
3. **Resume** picks an interrupted sync back up from a durable stage record, the same way
   an interrupted Pages publish does.
4. **Remove** deletes the target branch — but only after reading it back and confirming it
   still carries this application's marker, checked again independently of whatever the
   preflight said minutes earlier.

The marker (`.material-bluemap-world.json`) is written into the world folder itself, right
beside `level.dat`, because it has to be part of the pushed tree for the guard to read it
back through GitHub's contents API — the same reason the Pages publisher's marker lives
inside the rendered map rather than beside it.

On screen, those four steps read as: a world folder chosen through the native browse
affordance every path field in this application offers; an owner picked from a real list
(the signed-in account plus every organisation it can write to, via `WorldRepoHost.owners`)
rather than typed blind; **an explicit "Create this repository" button**, reusing the exact
capability `BackupScreen.vue` already offers for the same reason that screen has one — a
person presses a button that says it creates a repository, and never discovers that Sync did
it silently; a **Check before anything is pushed** button that runs the preflight and shows
its blockers and warnings before the acknowledgement checkbox can even be ticked; and a
searchable, bulk-selectable list of **worlds this computer is tracking**, each with its own
Open-on-GitHub, resume-if-interrupted and stop-tracking actions, the last one gated behind
the same two-key destructive-action confirmation every other irreversible action in this
application uses.

## Using one in GitHub Actions

`Render world` (`.github/workflows/render-world.yml`) takes a fourth `world-source` choice,
`git`, alongside `repository`, `url` and `release-asset`:

| Input | Value |
|---|---|
| `world-source` | `git` |
| `world-repository` | `cafepromenade/Andyville-World` |
| `world` | `world` (a branch), or `world:worlds/main` (a branch, and a subpath inside it) |

The fetch step does a **shallow, single-branch clone** — `git clone --depth 1
--single-branch --branch <branch>` — which is the whole saving a plain clone misses: no
history at all, just the one commit's worth of tree, which is also all there ever is on a
branch this application publishes to. `git-repository` reuses the existing
`world-source`/`world`/`world-repository` triad rather than adding an eleventh
`workflow_dispatch` input past [GitHub's documented cap of
ten](./world-sources.md#using-one-in-github-actions).

A branch name cannot contain a colon, so `branch:subpath` splits unambiguously on the first
one — unlike a slash, which real branch names (`release/1.4`) use routinely.

## The cheap change check

A world kept in a git repository has the single cheapest "did anything change" signal of
every world source this project supports: **the target branch's current commit SHA**. No
clone, no download, not even a `HEAD` request against the world itself — one `gh api
repos/<owner>/<repo>/branches/<branch>` call.

`WorldRepoHost.remoteTip(owner, repo, branch)` exposes exactly that on the desktop side, and
[Scheduled re-rendering](./scheduled-render.md)'s `evaluateScheduleChange` in
`design/packages/render-actions/src/schedule/changeCheck.ts` gained a matching `"git"` kind
that compares two branch-tip SHAs directly — no fallback needed the way `release-asset` and
`url` each need one, because a git branch either has a commit or the source could not be
found at all. `.github/workflows/scheduled-render.yml`'s own git snapshot step makes the
identical `gh api .../branches/<branch>` call in bash, so the desktop app and the scheduled
workflow read the same signal the same cheap way.

## Sharding and sparse checkout: evaluated, and rejected

A sharded render's shards are literal region-file bounding boxes (see [Rendering a world in
GitHub Actions](./render-in-actions.md)), which made a per-shard `git sparse-checkout` —
fetching only the region files one shard's bounds cover — look like a natural further
saving. It was evaluated and is **not** implemented, for a reason specific to how sharding
already works rather than a limitation of sparse checkout itself:

- The world is fetched **once**, by the `plan` job, from whichever source is configured —
  including `git`. It is then uploaded as a single GitHub Actions artifact and every shard
  job downloads that same artifact. That fan-out already solves the "does a thirty-way
  split re-fetch the same world thirty times" problem, and it solves it with GitHub's own
  internal artifact storage, which is faster and free of the world repository's own rate
  limits.
- A per-shard sparse clone would **replace** that one fast internal transfer with several
  slower external clones straight from the world's git host — worse, not better, under the
  architecture this project actually has.
- Separately, the `plan` job's own measurement (`design/packages/render-actions/src/world/measure.ts`)
  reads the real chunk-location table out of every region file's header to build the shard
  plan in the first place — real bytes, not just file names — so even the *first* fetch
  cannot be narrowed by sparse-checkout without changing the plan step to run before the
  world is fully present, which is a materially larger change than this feature's scope.

If GitHub Actions artifact fan-out is ever removed in favour of every shard fetching
directly, this evaluation should be revisited — the answer changes with the architecture,
not with git's own capabilities.

## Honesty: limits, and what a rejected push does

- **GitHub blocks any single file over 100 MB outright.** `WorldRepoHost.preflight` and
  `WorldRepoHost.sync` both check every file's size before anything is staged, and a sync
  refuses cleanly with the exact file and its size rather than discovering the limit from a
  rejected push.
- **GitHub recommends repositories stay under roughly 1 GB**, and gets noticeably slower to
  clone and work with well past that. `preflight` warns past 1 GB and warns more strongly
  past 5 GB, and says plainly that a world that large may not belong in a repository at
  all — the release-asset route this application also offers has no such limit.
- **A push GitHub refuses** — a branch protection rule, an expired sign-in, an
  organization policy — is reported with GitHub's own stderr text attached, the same way
  the Pages publisher reports it, never guessed at or summarised into something vaguer.
- **A live server's world folder is being written to while a sync reads it.** A region file
  mid-save can be caught torn. `preflight` says so plainly and suggests turning
  auto-save off, or syncing between server stops, rather than silently syncing a
  possibly-inconsistent copy.

## Failure modes

| What happened | What is reported |
|---|---|
| the world folder does not exist | `world-missing`, naming the path |
| a file is past GitHub's 100 MB limit | `file-too-large`, naming the file and its size |
| the branch already carries a world this application did not publish | `not-ours`, refusing to touch it |
| `gh` is not installed or not signed in | `gh-missing` / `gh-signed-out`, with the exact command to run |
| `git` is not on this computer | `git-missing` |
| the repository cannot be created | `repo-refused`, with GitHub's own message |
| GitHub refuses the push | `push-refused`, with GitHub's own stderr |
| syncing was stopped | `cancelled`, which is not an error |

## Security notes

- No token is read, held, logged or passed as an argument, anywhere in this feature.
  Authentication for both the API and the push is `gh`'s own credential store, reached
  through `gh api` and through git's `credential.helper` pointed at `gh auth
  git-credential` for the one command that needs it — exactly the Pages publisher's rule,
  restated because a second feature copying the shape without copying the discipline would
  be the failure worth naming.
- **A branch without this application's marker is never pushed to and never deleted.** That
  guard has no override, for the same reason the Pages publisher's does not: a mistyped
  repository or branch name must not be able to destroy something that was never this
  application's to touch.
- Owner, repository and branch names are validated against GitHub's own grammar before they
  are ever put in an API path or a push URL.

## Verification

`design/packages/app/src/main/worldrepo/` has 29 tests:

| File | What it proves |
|---|---|
| `repo.test.ts` | preflight blockers and warnings (oversized file, non-world folder, gh states, git missing, a branch this application did not write); sync refuses without acknowledgement, refuses a branch it does not own, reports a push GitHub refuses with GitHub's own words, resumes an interrupted sync, and the marker round-trips |
| `ipc.test.ts` | every channel registers and disposes exactly, and `acknowledgeSync` is read strictly — a truthy string is not an agreement |
| `incremental.test.ts` | **real git**, against a real local bare repository: a second sync after changing one region file lands only a handful of new objects in the bare repository's own object database, both when the local git directory persisted between syncs and when it did not (the fetch-before-orphan step) |

`design/packages/render-actions/src/schedule/changeCheck.test.ts` covers the new `"git"`
comparator: unchanged when two branch-tip SHAs match, changed when they differ, and an
error — never a guess — when a SHA is missing from either side.

The interface has 37 tests of its own, in `design/packages/ui/src/components/worldrepo/`:
`worldRepoBridge.test.ts` (5) proves the preload bridge is genuinely all-or-nothing across
its eleven channels; `worldRepo.test.ts` (15) proves a sync row appears the instant Sync is
pressed rather than waiting on the first IPC round-trip, that `pushVerified: false` is never
silently upgraded to a plain success, and that removal is tracked through its own state
rather than the sync event stream, because `WorldRepoHost.remove` is a plain call rather than
a phased operation; `WorldRepoScreen.test.ts` (17) proves the explicit create-repository
button never calls `sync` and the Sync button never calls `createBackupRepository`, that the
acknowledgement genuinely gates the button and the disabled button names why, that bulk
stop-tracking sits behind the two-key gate, and that every step of the adoption flow — the
probe and viewing a plan — never calls `sync` or `remove`.

Run them with `npx vitest run packages/app` and `npx vitest run packages/render-actions`
from `design/`, and `npx vitest run packages/ui/src/components/worldrepo` for the interface.
The two touched workflow files are checked with `actionlint` and `shellcheck` installed.

## Related reading

- [Adopting a repository this app already prepared](./repository-adoption.md) — the other
  half of the same tab: recognising, on a second computer, a repository this application
  already synced a world into on the first one.
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the design this
  feature reuses, for the opposite direction: a rendered map going out, rather than a world
  coming in.
- [Worlds from somebody else's release](./world-sources.md) — the other way a world can live
  outside this computer, and when a repository is not the right choice.
- [Scheduled re-rendering](./scheduled-render.md) — what reads the cheap change check this
  feature exposes.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the sharded render this
  feature's world feeds into, and why sparse checkout was rejected for it.
- [Backing up a world or a rendered map](./backup.md) — why Git LFS was rejected on cost,
  here and there.
