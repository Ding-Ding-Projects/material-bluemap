# A world that lives inside Docker

A world does not have to be a folder this computer can already see. It can be sitting inside a
Minecraft server that already runs in a container — a bind-mounted host folder, a named volume,
or nothing this machine can read directly at all, only Docker's own view of it. This is the input
side of that: reaching the world, whichever of those three shapes it turns out to be, without
asking anybody to know which one it is before they start.

**Contents**

- [The three ways in](#the-three-ways-in)
- [The one refusal that has no override](#the-one-refusal-that-has-no-override)
- [Local daemon, or one reached over SSH](#local-daemon-or-one-reached-over-ssh)
- [What is incremental, and what is not](#what-is-incremental-and-not)
- [A cheap change check, for the scheduled-render lane](#a-cheap-change-check-for-the-scheduled-render-lane)
- [Using it in the desktop application](#using-it-in-the-desktop-application)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## The three ways in

`main/dockerworld/resolve.ts` decides which of three routes a world is read through, and never
guesses: every claim is checked before it is trusted.

| Route | When | How the bytes move |
|---|---|---|
| `bind-direct` | a bind mount's host path answers a directory check, on whichever machine is doing the asking | straight off that filesystem — no Docker command touches the bytes at all |
| `container-copy` | a specific container has the world mounted, but its host path does not answer that check | `docker cp <container>:<path> <staging>`, which works whether the container is running or stopped and regardless of storage driver, because it reads through the container's filesystem view rather than whatever backs it |
| `volume-copy` | a bare volume, named without reference to any container | a disposable helper container binds the volume read-only and a staging directory read-write, and a plain `cp -a` inside it does the copy — one `docker run`, no pipe |

The reason a bind mount is *tried* rather than assumed matters more than it looks: Docker
Desktop on Windows runs containers inside a Linux VM, and a bind mount's reported host path is
frequently a path inside that VM, not a Windows path this process can open. A native Linux daemon
does not have that problem. Rather than guess which kind of host produced the report, every
bind-mount source is checked — `fs.stat` locally, `test -d` over the remote runner for an SSH
host — and only trusted once that check actually answers yes. Everything else falls back to
`docker cp`, which reads correctly either way because Docker itself is the one reading it.

A named volume's own `Mountpoint` is never trusted as directly readable, even on a native Linux
host where root genuinely could read it: this application does not run as root, and assuming
otherwise for the sake of one machine shape would be exactly the kind of guess the rest of this
module refuses to make.

## The one refusal that has no override

A running server may be writing to the exact region files being read. Reading them anyway can
produce a torn `.mca` file — one that opens without error, because the region format's own
compression does not notice a chunk written mid-copy, and corrupts a render three layers away
from anything that would point back here.

So a fetch of a **running** container's world refuses outright unless the caller explicitly says
`acknowledgeLiveRisk: true`. There is no silent default either way: not "always refuse," which
would make the common case — a Minecraft server nobody is going to stop for a backup — impossible
to use at all, and not "always allow," which would occasionally hand somebody a corrupted map with
nothing at copy time to say why. The warning names the container, states the actual risk in
words, and says the two honest alternatives: stop the server first, or point this at a backup
instead.

**What this project does not have yet** is an automatic safe route — a `save-off`/`save-all`
RCON command sent to the server before the copy and `save-on` after, which is how a careful
backup script protects itself without stopping the server. Building one means an RCON client and
somewhere to keep the server's RCON password, which is exactly the kind of secret this project's
own rules say never gets typed into a settings field — it would need the same ephemeral,
one-time-token intake flow the project uses for any other secret, and that has not been built.
Until it is, the fetcher's only honest options for a live world are the two named above.

## Local daemon, or one reached over SSH

Every function in `dockerworld/` takes a `CommandRunner` the same way `runtime/docker.ts` and
`remote/ssh.ts` already do, rather than assuming `docker` is on this machine's `PATH`. That is
what lets the identical logic answer for:

- **a local daemon** — the default, no configuration needed;
- **a Docker host reached over SSH** — pass `sshCommandRunner(...)` from the remote-render lane's
  own module as the runner, and a `FileTransfer` (rsync when both ends have it, `scp` otherwise —
  the exact same choice `remote/rsync.ts`'s `chooseTransfer` already makes) to bring the bytes
  back, for the `bind-direct` and staging-placement steps.

Nothing here spawns `ssh` itself or knows what a `RemoteTarget` is; that stays the SSH lane's own
concern, and this module reuses its result rather than a parallel implementation. This is fully
built and tested at the module level — see [Verification](#verification) — against a fake runner
and a fake `FileTransfer`, so none of it needs an actual remote host to prove out.

## What is incremental, and what is not

- **`bind-direct` is genuinely incremental.** `localIncrementalCopy` compares size and
  modification time and copies only what differs; a remote fetch gets the same property for free
  from rsync's `-a`, which does the identical comparison. A world with a thousand region files and
  six changed ones moves six files.
- **`container-copy` and `volume-copy` are not**, and this is an honest limitation rather than an
  oversight. Docker has no notion of "copy only what changed" — `docker cp` and a helper
  container's `cp -a` always read the whole thing. What incrementality this module *can* still
  offer is in the placement step: staging always lands in a scratch directory, and only the move
  from staging into the real destination is incremental, so a scheduled render that finds a
  volume-backed world unchanged does not rewrite files downstream of the destination — a
  git-tracked copy, a render cache — even though the `docker cp` itself still ran.
- **Nothing here ever deletes.** Every copy only adds and updates files; a region pruned or a
  dimension removed at the source leaves a stale file behind at the destination rather than
  losing data to a bug in a comparison. This is also why fetching a Docker world needs no
  destructive-action gate: nothing this module does is destructive.

## A cheap change check, for the scheduled-render lane

`dockerworld/change.ts` exports `dockerWorldFingerprint`, which answers "has this world changed"
by reading file **metadata** — region file names, sizes, modification times — and never a byte of
content, so a scheduler can ask before every scheduled run without paying for the fetch it might
decide is unnecessary.

**Only the `bind-direct` route gets a cheap answer.** That is the same line `resolve.ts` already
draws: a bind mount can be listed without touching Docker at all, locally with `readdir`/`stat` or
remotely in one `find <root> -name '*.mca' -exec stat --format=%n:%s:%Y {} +` round trip.
`container-copy` and `volume-copy` have no such vantage point — Docker's own filesystem view is
reachable only by reading it, and reading it is exactly the expensive step a change check exists
to avoid. Asking for a fingerprint of one of those routes returns `null`, plainly, rather than a
wrong or invented answer. A scheduler that wants incrementality out of a volume-backed world pays
for the copy every time until Docker grows a cheaper way to ask; there is no honest way around
that today.

`fingerprintsEqual` compares two fingerprints order-independently, so the scheduled-render lane
can keep the last fingerprint beside its render record and skip a render when the next one
matches — the same shape the git-repository world source's own change detection will want, for
the same reason.

## Using it in the desktop application

> [!WARNING]
> **This section describes `main/dockerworld/`, which is fully built and tested (see
> Verification below) but is not yet reachable from the desktop app's own UI or its IPC preload
> bridge.** `main/dockerworld/ipc.ts` registers six channels
> (`dockerworld:list`/`inspectContainer`/`inspectVolume`/`fetch`/`cancel`/`active`) exactly like
> `worldsource/ipc.ts` does for a release-hosted world, but nothing in `design/packages/app/src/preload`
> or `design/packages/ui` calls any of them yet, and no picker lists the containers or volumes
> actually present the way the guided-forms rule requires. This is the same gap
> [`world-sources.md`](./world-sources.md) records for the cross-repository release path, and it
> exists here for the same reason: the module and its 74 tests prove the *logic* is correct
> against fakes, independent of whether a button exists to reach it yet. Wiring the preload
> bridge, a container/volume picker component, and the copy-catalogue entries its strings need is
> the next piece of work on this feature, and it is deliberately not rushed into the same task
> that landed the logic while several other lanes were mid-edit on the exact preload and
> copy-catalogue files it would need to touch.

Once wired, the intended flow follows this project's guided-forms rule throughout: the picker
lists the containers and volumes Docker actually reports (`dockerworld:list`) rather than asking
for an id to be typed, a chosen container's mounts come from `dockerworld:inspectContainer` so the
world's own mount is picked from a real list rather than guessed, and a running container's
**Fetch** action is disabled with the exact torn-region-file sentence from
[the refusal above](#the-one-refusal-that-has-no-override) until the risk is explicitly accepted —
never a plain greyed-out button with no reason attached.

## Failure modes

| What happened | What is reported |
|---|---|
| there is no `docker` on the account's `PATH` | `not-installed` |
| the daemon is not running | `daemon-unreachable` |
| the daemon is there, this account may not talk to it | `refused` |
| Docker answered with something unrecognised | `unusable` |
| the named container or volume does not exist | `not-found` |
| the request names a mount destination the container does not have | `invalid-request` |
| the container is running and the risk was not accepted | `live-world-not-acknowledged` |
| `docker cp` or the helper container failed | `copy-failed` |
| what was copied out is not a Minecraft world | `not-a-world`, naming what `locateWorld` looked for and where |
| the destination folder could not be written | `storage-unwritable` |
| the person cancelled it | `cancelled` — whatever had already been copied stays; see below |

A cancellation leaves whatever was already written to the destination in place, because every
copy in this module is additive-only. It never corrupts existing good data; it simply leaves the
destination partially updated, exactly where the next fetch's incremental comparison picks back
up. A staging directory this fetch created for itself is still removed on the way out, cancelled
or not — it holds nothing a person asked to keep.

## Security notes

- **The world is always read, never written.** Nothing in this module issues a `docker cp` or a
  helper-container run in the direction of the container or volume; every copy moves from Docker
  toward the destination folder.
- **The helper-container idiom mounts the volume read-only.** `-v <volume>:/mb-source:ro` — a bug
  in the disposable container's own command cannot write into somebody's world, because the mount
  itself refuses the write at the kernel level regardless of what runs inside.
- **The helper container reuses the render engine's own default image** (`eclipse-temurin:*-jre`,
  from `runtime/plan.ts`) rather than pulling a second one, so this feature costs no extra image
  download on a machine that already renders through Docker.
- **No secret is asked for or stored.** There is no RCON password field, no daemon credential
  beyond whatever the account running this app already has configured for `docker` itself, and no
  new place for a secret to end up in a log or a config file.
- **The live-world refusal has no override flag that defaults to true anywhere in this module.**
  `acknowledgeLiveRisk` is read from the caller's own request each time; nothing persists a prior
  acceptance into a setting that would silently apply to every world after the first.

## Verification

`design/packages/app/src/main/dockerworld/` has 74 tests, none of which need a Docker
installation, a daemon, or a network connection:

| File | What it proves |
|---|---|
| `inventory.test.ts` | the five daemon states map correctly; container and volume listings parse real `docker ... --format {{json .}}` output, including a stray non-JSON line; mounts, running state and the zero-time "never started" case read correctly from `docker inspect` |
| `resolve.test.ts` | a mount at the wrong destination is refused; a reachable host path routes `bind-direct`; an unreachable one (the Docker Desktop VM-path case) falls back to `container-copy`; a bare volume always routes `volume-copy`; the running flag and its warning text carry through; `remoteDirectoryExists` runs `test -d` through the given runner |
| `copy.test.ts` | `localIncrementalCopy` copies once, touches nothing on an unchanged second pass, re-copies on a size or modification-time change, and — checked directly — never deletes a file the destination has that the source no longer does; `dockerCopyToStaging` and `volumeCopyToStaging` build the exact argv described above; `copyRemoteBindMount` creates the destination and calls the given `FileTransfer` |
| `fetch.test.ts` | no daemon, permission denied, a volume that does not exist, a stopped container's world fetched with no acknowledgement needed, a running container refused and confirmed to leave the destination untouched, the same container fetched successfully once the risk is accepted (with the warning event proven present), a copied-out folder that is not a world, both the `container-copy` and `volume-copy` staging routes with their staging directories proven cleaned up afterward, and a cancellation proven to leave the destination without the copy it interrupted |
| `change.test.ts` | the local and remote fingerprints agree on the same content; a size change is detected; `container-copy`/`volume-copy` candidates answer `null` rather than a guess; a remote fingerprint with no runner also answers `null` |
| `ipc.test.ts` | the six channels register and `dispose` exactly; a malformed request is refused rather than reaching the fetcher; the fetcher's own throw is turned into a reported failure rather than a rejection; `list` and `inspect*` thread an injected runner rather than reaching for whatever `docker` happens to be on the test machine |

Run them with `npx vitest run packages/app/src/main/dockerworld` from `design/`.

**Not verified**: against a real Docker daemon, a real Docker Desktop VM-path bind mount, or a
real remote host over SSH. Everything above is proven against fakes that behave the way real
Docker and a real `CommandRunner` are documented to behave; none of it has been run against the
genuine article yet.

## Related reading

- [Running the engine on this computer, or in a container](./docker-and-local.md) — the Docker
  path a *render* takes, including the mount rules `dockerworld/`'s own host-path checks are
  modelled on.
- [Rendering on a remote host](./remote-render.md) — the SSH primitives (`CommandRunner`,
  `FileTransfer`, `chooseTransfer`) this module reuses rather than reimplementing.
- [Worlds from somebody else's release](./world-sources.md) — the other input-side world source,
  and the same "fully built, not yet wired to the UI" gap this document names for the same reason.
- [Scheduled re-rendering](./scheduled-render.md) — the consumer `dockerWorldFingerprint` is
  built for.
- [Backing up a world or a rendered map](./backup.md) — why this project never reaches for Git
  LFS, including for a world's own storage.
