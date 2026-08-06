# A world that lives inside Docker

A world does not have to be a folder this computer can already see. It can be sitting inside a
Minecraft server that already runs in a container — a bind-mounted host folder, a named volume,
or nothing this machine can read directly at all, only Docker's own view of it. This is the input
side of that: reaching the world, whichever of those three shapes it turns out to be, without
asking anybody to know which one it is before they start.

**Contents**

- [The three ways in](#the-three-ways-in)
- [The refusal a running container earns](#the-refusal-a-running-container-earns)
- [Local daemon, or one reached over SSH](#local-daemon-or-one-reached-over-ssh)
- [What is incremental, and what is not](#what-is-incremental-and-not)
- [A cheap change check, and where it does and does not reach](#a-cheap-change-check-and-where-it-does-and-does-not-reach)
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

## The refusal a running container earns

A running server may be writing to the exact region files being read. Reading them anyway can
produce a torn `.mca` file — one that opens without error, because the region format's own
compression does not notice a chunk written mid-copy, and corrupts a render three layers away
from anything that would point back here.

So a fetch of a **running** container's world refuses outright unless the caller explicitly says
`acknowledgeLiveRisk: true`. That flag **is** an override, and it works: pass it, having read the
warning, and the fetch proceeds anyway. What this refusal does not have is a *silent* or
*standing* override — nothing "always allows" it by default, nothing persists a prior acceptance
into a setting that would apply to every world after the first, and nothing lets a caller skip
past it without the exact sentence naming the container and the risk. Every fetch of a live world
is acknowledged fresh, per call. Three honest options are named, every time: stop the server
first, point this at a backup instead, or accept the risk explicitly and fetch it live anyway.

**What this project does not have yet** is a fourth, *automatic* safe route — a `save-off`/`save-all`
RCON command sent to the server before the copy and `save-on` after, which is how a careful
backup script protects itself without stopping the server and without asking a person to accept
any risk at all. Building one means an RCON client and somewhere to keep the server's RCON
password, which is exactly the kind of secret this project's own rules say never gets typed into
a settings field — it would need the same ephemeral, one-time-token intake flow the project uses
for any other secret, and that has not been built. Until it is, the three options above are the
fetcher's only honest ones for a live world.

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

## A cheap change check, and where it does and does not reach

`dockerworld/change.ts` exports `dockerWorldFingerprint`, which answers "has this world changed"
by reading file **metadata** — region file names, sizes, modification times — and never a byte of
content, so a caller can ask before every fetch without paying for the copy it might decide is
unnecessary.

**Only the `bind-direct` route gets a cheap answer.** That is the same line `resolve.ts` already
draws: a bind mount can be listed without touching Docker at all, locally with `readdir`/`stat` or
remotely in one `find <root> -name '*.mca' -exec stat --format=%n:%s:%Y {} +` round trip.
`container-copy` and `volume-copy` have no such vantage point — Docker's own filesystem view is
reachable only by reading it, and reading it is exactly the expensive step a change check exists
to avoid. Asking for a fingerprint of one of those routes returns `null`, plainly, rather than a
wrong or invented answer. Whoever wants incrementality out of a volume-backed world pays for the
copy every time until Docker grows a cheaper way to ask; there is no honest way around that today.

`fingerprintsEqual` compares two fingerprints order-independently, so a caller can keep the last
fingerprint beside whatever record it keeps and skip a fetch when the next one matches.

**Exposed over IPC, the same way the git-repository and SSH routes expose theirs.**
`DockerWorldFetcher.fingerprint(source)` resolves the source and returns its fingerprint (or
`null`, honestly, for the two routes above), and `main/dockerworld/ipc.ts` puts that behind
`dockerworld:fingerprint` — the same shape `worldrepo:remoteTip` uses for a git-repository world.
`dockerworld:fingerprintsEqual` exposes the pure comparison the same way `worldsource:ssh:diff`
does. Both are counted among the eight channels the [desktop-application section
below](#using-it-in-the-desktop-application) says are not yet called from
`design/packages/ui` — the same documented gap the fetch, list and inspect channels already carry,
now including these two.

**What this is not connected to, and why not:** [Scheduled re-rendering](./scheduled-render.md)'s
`evaluateScheduleChange` gained a `"git"` comparator because a GitHub-hosted Actions runner can
reach a GitHub-hosted git branch directly — one `gh api` call. It has **no** `"docker"`
comparator, and `render-world.yml`'s own `world-source` choices are exactly `repository`, `url`,
`release-asset` and `git` — Docker is not among them, and this is not an oversight to fix later:
a GitHub-hosted runner has no route to a local Docker daemon or to a Docker host on somebody's own
network without exposing that daemon to the internet, which this project does not do. That is the
exact same reason the SSH world source's own `surveyRemoteWorld`/`diffRemoteWorldSurveys` — built
before this route, and already exposed over IPC the same way — never gained a matching kind
either. `dockerWorldFingerprint` is real, tested, and reachable through the IPC bridge for
whatever calls it locally on this computer; it is not, and structurally cannot become, an input to
the GitHub Actions scheduled-render workflow.

## Using it in the desktop application

The ordinary map wizard's **World** step now mounts a guided **World in local Docker** panel. It
uses only this computer's local IPC registration; it does not claim that a remote Docker daemon
is reachable. The flow is deliberately made of real pickers rather than identifier boxes:

1. **Check Docker and refresh.** The existing five-state Docker explanation distinguishes an
   absent command, a stopped daemon, a refused daemon socket, an unusable answer and a working
   daemon. The container and volume lists come from `dockerworld:list` on every refresh.
2. **Choose a source.** Container mode lists every running and stopped container, then calls
   `dockerworld:inspectContainer` and offers only its real bind and named-volume mounts. Volume
   mode lists Docker's real named volumes and inspects the chosen one. No container id, volume
   name or mount path is invented or accepted as free text.
3. **Review liveness and the route.** Running/stopped state is refreshed from Docker. A directly
   readable bind mount shows the real cheap metadata fingerprint and region count. Container-copy
   and volume-copy routes say that their fingerprint is `null` because Docker must read them to
   know whether they changed.
4. **Choose a local destination.** The shared `PathField` provides both free text and the native
   folder browser. This is the exact folder the fetched world becomes, not an implicit child
   whose name the interface guesses.
5. **Fetch and validate.** A stopped container or volume can start immediately. A running
   container requires the fresh, exact torn-`.mca` acknowledgement described above. The checkbox
   is consumed by one attempt and is never persisted. Success is then handed to the wizard's
   ordinary local inspection path, which reads `level.dat` and the actual region data before the
   wizard can continue.

The fetch button states its disabled reason beside it. The submitting handler refuses re-entry,
the button stays disabled during the operation, and cancellation reaches the child `docker cp`
or helper-container process through an abort signal. Progress is honest about the seam's actual
knowledge: Docker's source-copy phase is indeterminate because `docker cp` and `cp -a` expose no
file total, while the local additive-placement phase reports the real number of files checked and
the current relative path. A directly readable bind mount reports those real file counts from the
first phase. No timer-shaped percentage is presented as work completed.

This operation is not destructive, so the destructive-action super-confirmation gate does not
apply: the source side is read-only, the volume helper mounts `/mb-source:ro`, and local placement
only adds or updates. It never deletes a destination file. The running-container acknowledgement
is a different safety decision and remains mandatory per fetch.

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

`design/packages/app/src/main/dockerworld/` plus the preload/UI seam have focused tests, none of
which need a Docker
installation, a daemon, or a network connection:

| File | What it proves |
|---|---|
| `inventory.test.ts` | the five daemon states map correctly; container and volume listings parse real `docker ... --format {{json .}}` output, including a stray non-JSON line; mounts, running state and the zero-time "never started" case read correctly from `docker inspect` |
| `resolve.test.ts` | a mount at the wrong destination is refused; a reachable host path routes `bind-direct`; an unreachable one (the Docker Desktop VM-path case) falls back to `container-copy`; a bare volume always routes `volume-copy`; the running flag and its warning text carry through; `remoteDirectoryExists` runs `test -d` through the given runner |
| `copy.test.ts` | `localIncrementalCopy` copies once, touches nothing on an unchanged second pass, re-copies on a size or modification-time change, and — checked directly — never deletes a file the destination has that the source no longer does; `dockerCopyToStaging` and `volumeCopyToStaging` build the exact argv described above; `copyRemoteBindMount` creates the destination and calls the given `FileTransfer` |
| `fetch.test.ts` | no daemon, permission denied, a volume that does not exist, a stopped container's world fetched with no acknowledgement needed, a running container refused and confirmed to leave the destination untouched, the same container fetched successfully once the risk is accepted (with the warning event proven present), a copied-out folder that is not a world, both the `container-copy` and `volume-copy` staging routes with their staging directories proven cleaned up afterward, a cancellation proven to leave the destination without the copy it interrupted, and `fingerprint()` reading the bind-direct fingerprint with no copy invoked, answering `null` for a container-copy candidate, and surfacing the same resolve failure `inspect()` would |
| `change.test.ts` | the local and remote fingerprints agree on the same content; a size change is detected; `container-copy`/`volume-copy` candidates answer `null` rather than a guess; a remote fingerprint with no runner also answers `null` |
| `ipc.test.ts` | the eight channels register and `dispose` exactly; a malformed request is refused rather than reaching the fetcher; the fetcher's own throw is turned into a reported failure rather than a rejection; `list` and `inspect*` thread an injected runner rather than reaching for whatever `docker` happens to be on the test machine; `dockerworld:fingerprint` refuses a sourceless request, passes a well-formed one through, and never rejects on a fetcher throw; `dockerworld:fingerprintsEqual` compares order-independently and treats malformed input as an empty fingerprint rather than throwing |
| `dockerWorldBridge.test.ts` | all eight invokes use the exact channel and argument shape, and the event listener forwards `dockerworld:event` and removes only its own listener |
| `DockerWorldSourcePanel.test.ts` | mounted pickers receive real container/volume/mount data; a live fetch is refused until the fresh exact acknowledgement and consumes it after one attempt; a volume reports a null fingerprint honestly; real progress events render and cancellation reaches the active id |
| policy inventories | the surface's search opens the anchored full regex builder; its AppearanceTarget supplies the searchable context menu and editor; the destination is in the PathField inventory; overlays are bounded; copy facts are guarded at every funny level; the read-only/additive path is explicitly recorded as not destructive |

Run them with `npx vitest run packages/app/src/main/dockerworld` from `design/`.

**Not verified against a real source in this pass.** The host had Docker Desktop client 29.6.1,
but its `desktop-linux` daemon pipe did not exist: `docker version` returned a real client and
`Server: null`, then `docker ps` failed at
`npipe:////./pipe/dockerDesktopLinuxEngine`. No real container, volume or mount could be listed,
so no runtime fetch was simulated or claimed. A real Docker Desktop VM-path bind mount and a real
remote host over SSH also remain unverified. The cheap hidden UI proof separately verifies the
real built panel and the daemon-down guidance, not a successful source copy.

## Related reading

- [Running the engine on this computer, or in a container](./docker-and-local.md) — the Docker
  path a *render* takes, including the mount rules `dockerworld/`'s own host-path checks are
  modelled on.
- [Rendering on a remote host](./remote-render.md) — the SSH primitives (`CommandRunner`,
  `FileTransfer`, `chooseTransfer`) this module reuses rather than reimplementing.
- [Worlds from somebody else's release](./world-sources.md) — the other input-side world source,
  and the same "fully built, not yet wired to the UI" gap this document names for the same reason.
- [Scheduled re-rendering](./scheduled-render.md) — the GitHub Actions lane `dockerWorldFingerprint`
  is deliberately *not* wired into, and why: a GitHub-hosted runner has no route to a local
  Docker daemon.
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — the other locally-reachable,
  scheduled-render-shaped change check (`surveyRemoteWorld`/`diffRemoteWorldSurveys`) that carries
  the identical, structural gap with the GitHub Actions lane.
- [Backing up a world or a rendered map](./backup.md) — why this project never reaches for Git
  LFS, including for a world's own storage.
