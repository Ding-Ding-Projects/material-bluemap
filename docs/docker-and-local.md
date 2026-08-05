# Running the engine on this computer, or in a container

Rendering and the map web server each run one of two ways, and the choice is the user's:

- **Local** — the BlueMap engine runs as a program on this computer, on the Java runtime the
  app found or installed. This is the default and nothing needs to be installed for it beyond
  what the app already manages.
- **Docker** — the same engine, the same jar and the same arguments, inside a container.
  Opt-in, and only offered when Docker is genuinely usable.

Everything the local path reports, the Docker path reports identically: phases, per-map
progress with an estimate, every log line, every warning banner, the outcome, and
cancellation. That is not a promise kept by writing the same code twice — both modes produce
the same `EngineLaunch` and are run by the same `EngineProcess`, which reads output through
the same parser, so there is no second path for the reporting to differ on.

## What Docker changes, and what it does not

| | Local | Docker |
|---|---|---|
| Isolation from the rest of the computer | none beyond the account's own | the container sees the world (read-only), the output folder, the config and the jar, and nothing else |
| Java version | whatever the app found or installed | whatever the image ships, independent of this computer |
| Needs a JDK on this machine | yes | no |
| Speed | the machine's | the same machine, usually **slower** |
| Needs a daemon running | no | yes |

**Docker does not give a render more CPU, more memory or a faster disk.** It runs on the same
hardware. On Windows and macOS it runs inside a Linux virtual machine and reaches the world
folder through a file-sharing layer, which for a large world is measurably slower than reading
it directly. Anyone choosing Docker for speed has chosen it for the one thing it cannot do.

What it is genuinely good for: rendering on a machine with no Java, rendering on a Java version
this computer does not have, and keeping the engine away from everything on the disk that is
not a map.

## Detecting Docker, and saying which state it is in

"Docker is not available" is the sentence that sends somebody to download software they already
have. So the probe — `docker version --format {{json .}}`, which answers for the client and the
daemon at once — resolves to one of five states, each with its own sentence:

| State | What it means | What the app says |
|---|---|---|
| `available` | a container can be started now | *Docker 27.4.0 is installed and its daemon (27.4.0) is running.* |
| `daemon-unreachable` | the command is there, the engine behind it is not | *Docker 27.4.0 is installed, but its daemon is not running. Start Docker and try again.* |
| `refused` | the daemon is there, this account may not talk to it | *Docker 27.4.0 is installed, but this account is not allowed to talk to its daemon.* |
| `not-installed` | there is no `docker` on this account's `PATH` | *There is no 'docker' command on this account's PATH… Rendering locally does not need it.* |
| `unusable` | it ran and said something unrecognised | Docker's own words, quoted, rather than a guess |

Both Windows and Linux wordings for an unreachable daemon are recognised
(`open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified` and
`Cannot connect to the Docker daemon at unix:///var/run/docker.sock`), because matching only
one of them tells half of all users their installation is broken.

Nothing is cached. Docker Desktop is started and stopped while an app is open, and an answer
kept from launch is wrong exactly when somebody has just started Docker and pressed the button
again.

## What gets mounted

Only what a run needs:

```
<workspace>/config-container  ->  /bluemap/config   read-write
<workspace>/data             ->  /bluemap/data     read-write
<workspace>/web              ->  /bluemap/web      read-write
<the engine jar>             ->  /bluemap/cli.jar  read-only
<each world>                 ->  /worlds/<mapId>   read-only
```

**The world is always read-only.** A render reads chunks and writes tiles; nothing about it
should be able to write into somebody's save. Read-only is the difference between an engine bug
corrupting a region file and an engine bug producing an error message.

**A home directory is never mounted, and neither is anything containing one.** A folder picker
is one click away from `C:\Users\you` instead of `C:\Users\you\…\saves\world`, and mounting the
first would hand a container the whole profile — documents, browser data, keys. Drive roots,
filesystem roots, bare file-server shares and the well-known system folders are refused the same
way. A refusal is reported, not silently dropped: a quietly missing mount produces a container
that starts, renders nothing, and reports a missing world.

The jar is mounted rather than baked into an image, so "which engine rendered this map" stays a
question about the jar's own version rather than about a container tag, and the image is
interchangeable. The default image is a stock `eclipse-temurin:25-jre`.

### Paths inside the file are not paths on this computer

A container cannot use the config a local run uses: `C:\Users\me\saves\world` does not exist
inside it. So a containerised run writes a **second config folder**, on this machine, whose
contents name container paths (`/worlds/overworld`, `/bluemap/web`), and mounts that at
`/bluemap/config`. Directories are created only for a local run, where the engine's paths really
are this machine's — creating `/bluemap/web/maps` on a Windows host silently produces
`C:\bluemap\web\maps`, and a render then reports an empty output folder nobody can find.

## Serving a rendered map (and the web server that does not run)

A render's output is a static web root the moment the engine exits, so this app never keeps a
second engine process alive to serve it. `LocalMapHandler` (`main/render/LocalMapHandler.ts`) is
mounted on the app's own embedded HTTP server at `/local/{renderId}/...` for every render this app
produces, **local or Docker** — the same `mount()` call in `render/orchestrator.ts` runs either
way. Reading the tiles directly off disk needs no port to publish out of a container and no probe
to prove a bind succeeded, because there is no second process whose binding could fail.

`main/runtime/plan.ts` still knows how to plan a launch for upstream's *own* `-w` web server —
`RuntimeRole: "web-server"` starts the engine with `-w`, writes `webserver.conf` with
`enabled: true` and a port, and (for Docker) publishes `-p 127.0.0.1:<hostPort>:<containerPort>`
exactly as a render's other container arguments are built. That machinery was originally paired
with a `WebServer` class that opened a TCP connection to prove the URL was actually listening
before reporting it, on the theory that upstream logs `Starting webserver …` before it binds and
only reports a bind failure afterward, so neither the log line nor a still-running process is
evidence on its own.

**That class was removed** (`runtime/webserver.ts`, decision D19 in `design/docs/decisions.md`):
nothing in this app ever planned a launch with `role: "web-server"`, because `LocalMapHandler`
already does the one job it existed for. The launch-planning code for that role is left in place,
typed and tested, in case a future feature genuinely needs upstream's own live server running
rather than a static read of what it already wrote — the day that happens is the day a class like
it earns a caller again.

Binding `0.0.0.0` inside a container is not a wider exposure than binding loopback locally, for
what it is worth to a launch that is never planned today: the publish rule is what decides who can
reach it, and it would publish to this machine's loopback only. Binding `127.0.0.1` *inside* the
container would be the container's own loopback — unreachable from the host even with the port
published, which is the most common way a containerised server "starts fine" and answers nothing.

## Cancelling

Locally, cancellation is SIGINT to the JVM with an escalation to SIGKILL, exactly as a render
has always been cancelled.

In a container it is different in a way that matters: **killing the `docker run` client does not
stop the container.** The daemon owns the container's lifetime and the client is a viewer
attached to it, so a killed client leaves a detached JVM rendering into somebody's disk with
nothing holding a handle to it. Cancellation therefore asks the daemon — `docker stop --time 8
<name>` — and the container is started with `--init` so that the daemon's SIGTERM actually
reaches the JVM rather than being ignored by a process that happens to be PID 1. The client is
then given the same polite signal and the same escalation, so an unresponsive daemon still ends
with this process letting go rather than waiting forever.

Every container is named, because a name is what `docker stop` and a person reading `docker ps`
both use, and an unnamed container can only be stopped by finding the id of a process the app has
already lost track of. `--rm` removes it when it ends.

## Picking a container back up after the app closes

The same fact as cancellation, taken one step further. If killing the client does not stop the
container, then **closing the app does not stop it either** — and unlike a cancel, nobody asked for
it to stop. The render carries on: tiles keep landing in the bind-mounted output folder, progress
lines keep being written to a log nobody is reading, and the app that comes back has no idea any of
it is happening. `render/runner.ts` refuses to put a shell between itself and the JVM precisely to
avoid an orphan like this; Docker re-creates it by a different route, and there is no way to refuse.

What is missing is never the work — the work is fine, it is still running — it is the **name**. So
the name is written down before the container starts, beside the render it belongs to:

```
<storageDir>/<renderId>/
  render.json      which engine rendered this, and how it ended
  session.json     what is running right now, and how far it got
  container.json   which container is doing it, and where its output goes
```

`container.json` is written *before* `docker run`, because the window between the two is exactly the
window in which the app being killed leaves a container nothing can name. It is removed on every way
out of a run, so a note left behind never offers to reattach to something that has already ended,
and it carries which app instance owns it — a fresh value on every launch, so a note owned by any
other value is by construction one whose app is gone. That is the same test `session.json` uses and
for the same reason: process ids are reused, and a stale one that happens to match something
unrelated would make a dead render look alive forever.

On launch, and whenever asked, each name is put to the daemon. Three answers, three things to do:

| The daemon says | What happens | What you are told |
|---|---|---|
| `running` (or `paused`, `restarting`, `created`) | **reattach**: `docker logs --follow --tail all` is streamed and reported as a live render | *…is still going in container 'x' on this computer: the app closed, the daemon carried on. Picking it up rather than starting a second one beside it.* |
| `exited` | **collect**: the output is a bind mount, so it is already on disk. The exit code is named | *…finished while the app was closed (exit code 137). The tiles it wrote are still where it wrote them…* |
| no such object | **collect**, honestly. `--rm` removed it the moment it ended | *…it is removed the moment it ends, which is what `--rm` does, and its exit status went with it… run the render again if you need that confirmed. It will only redo what is missing.* |
| nothing — the daemon is down, or there is no `docker` | **neither.** Nothing collected, nothing discarded, the note kept | *…could not say what became of container 'x'… may well still be going… Try again once that machine answers.* |

**A daemon that is down is never read as a container that is gone.** "The container has ended" means
collect the output and finish; "the machine that knows about the container did not answer" means the
render may well still be going. Reporting the second as the first writes off a running render, so an
unrecognised failure is `unknown` and says so.

Three things worth being exact about:

- **Reattaching is a launch, not a second reporting path.** `docker logs --follow` becomes an
  ordinary `EngineLaunch`, so the same `EngineProcess`, the same `RenderOutputTracker`, the same
  phase and progress parsing and the same cancellation apply. A reattached render emits the same
  `RenderEvent` union as any other: same list, same bar, same cancel button. A second reporting path
  would mean a render one half of the interface could see and the other could not stop.
- **`--tail all` replays the log from its first line**, so a render the app missed two hours of
  arrives at the real percentage rather than resuming with a bar at zero and no map names.
- **`docker logs` cannot say whether the render succeeded.** Its exit code is the *client's*, and it
  returns 0 both when a render finished and when it died. So a reattached run is judged by whether
  the engine printed `Your maps are now all up-to-date!`, and a log that ended without it is a
  failure rather than a success.

The cost of `--rm` is paid exactly here, and it is a real cost: a container that finished while the
app was closed has been removed, taking its logs and its exit status with it. Its **output** is
safe, because the output folder is a bind mount rather than anything inside the container. What is
not recoverable is the answer to "did it finish?", and the app says that in a sentence rather than
showing a green tick it cannot justify.

**Offered, never done.** Silently restarting hours of rendering because somebody reopened an app is
not a favour, and silently discarding the record throws away the only evidence the work exists. The
interface asks, and a declined offer is recorded so it is made once rather than on every launch.

### What genuinely cannot be picked up

| Situation | What the app says |
|---|---|
| the output folder was deleted, or the map storage directory changed | *…is not there, so there is nothing of this render left to pick up… Rendering it again is the only way forward, and it will start from nothing.* |
| the container was removed | its output is collected; its exit status is stated as unknowable |
| the daemon did not answer | nothing is collected and **nothing is discarded**; the note is kept, because it is the only evidence a still-running render exists |
| a container named like this app's, with no record beside it | reported and never stopped automatically: without the record there is no way to know which render it belongs to or where its output was going |

A collection that finds nothing is reported as a **failure**, not a quiet success. The one thing
worse than losing a render is telling somebody it is on their disk when it is not.

## Failure modes

| What happens | What the app does |
|---|---|
| Docker is not installed | Docker is offered as unavailable with that reason; local still works |
| Docker's daemon is not running | the same, with the *different* sentence, and no suggestion to install anything |
| This account may not use the daemon | reported as a permission problem, not as a missing daemon |
| A world folder may not be mounted | the launch is refused with the reason, before anything starts |
| The image cannot be pulled | the run fails with Docker's own words; the automatic repair recognises it |
| The container is killed for using too much memory | exit 137, which the repair pass reads as an out-of-memory kill even though the JVM printed nothing |
| The web server never answers | the URL is not reported, and the reason says whether it exited or simply stayed quiet |
| `docker stop` fails during a cancel | the cancel still completes; this process never waits on a daemon that has gone |
| The app is closed while a container renders | the container carries on, and the next launch offers to pick it up by name rather than starting a second one |
| The container ended while the app was closed | its output is collected; its exit status is stated as gone, never guessed at |
| The daemon is down when the app looks for containers | nothing is collected and nothing is discarded; the note is kept and the offer is made again later |

## Security considerations

- Container mounts are the enumerated five and nothing else. There is no way to add one from the
  interface, and the refusals in `checkMountSource` are applied to every source, including the
  config and output folders.
- The world is read-only in every run.
- A published port is bound to a host address (loopback by default), never to every interface.
  `-p 8100:8100` on a laptop in a café would put somebody's world map on the local network.
- No shell is used anywhere on the launch path. Every argument is passed as its own argv element,
  so a world folder called `my world & something` is a folder name rather than a second command.
- Containers run with `--rm`, and with `--user` where the caller supplies one — on Linux a
  container writing as root leaves root-owned tiles in a folder the person's own account then
  cannot delete.

## Verification

`design/packages/app/src/main/runtime/` carries 119 tests, none of which need Docker installed:

- `docker.test.ts` — every state of the probe, including both platforms' wordings for an
  unreachable daemon, a permission refusal, output that is not the JSON it asked for, and a
  binary that is not there.
- `mounts.test.ts` — the home folder, a folder containing home, drive and filesystem roots,
  system folders, a bare UNC server, a relative path, a colon that would truncate a mount
  argument, and the ordinary world folder that must still be allowed.
- `plan.test.ts` — the exact mount list, which mounts are read-only, the arguments inside the
  container, `--init`, the publish rule, and the refusal to plan a launch that would mount a home
  folder.
- `process.test.ts` — that a local run and a containerised one produce **identical** signal
  streams from the same output, that cancellation asks the daemon for a container and does not
  for a local run, and that a failed stop never leaves the caller waiting.
- `config.test.ts` — container paths written into the files while the files are written here, and
  that the engine's own directories are never created on this machine.
- `handoff.test.ts` — a record round-trips everything a reattach needs; a truncated, version-bumped
  or name-less one reads as **absent** rather than as a guess; a remote record whose host will not
  parse is refused rather than degraded to a local one, so `docker stop` is never sent to this
  computer with a name only another machine has; ownership is taken when a record is picked up, so a
  second reattach cannot claim it; and a note that cannot be written never fails the render.
- `attach.test.ts` — the status and the exit code are asked for in **one** call, so they describe
  one moment; `--tail all`; every state of the inspection, including a daemon that is down never
  reading as a container that is gone; and the sentence each decision produces.
- `reattach.test.ts` — **a container still running when the app starts**, reported on the same
  events with the same percentage; **one that finished while it was away**, whose output is
  collected rather than thrown away; **one the daemon no longer has**, said plainly; **a cancel that
  reaches a reattached container**, asking the daemon and reporting cancellation rather than a
  failure; a log that ended without the engine finishing reported as a failure; a collection that
  found nothing reported as a failure; a daemon that went quiet leaving the record intact; and a
  container with no record named rather than stopped.
- `ipc.test.ts` — the channels, the honest per-mode availability, that no handler rejects, and that
  a build with no reattacher still answers the container channels rather than not having them.

The actual serving path — local or Docker — is covered separately in
`design/packages/app/src/main/render/LocalMapHandler.test.ts`: mounting and unmounting a render,
serving `settings.json` and everything under `maps/`, the `.prbm`/`.prbm.gz` compression fallback,
a missing tile answering 204 rather than 404, and path traversal refused.

## Suggested articles

- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — what
  happens next when one of these runs does not start.
- [Renders that survive being interrupted](./resumable-renders.md) — what a cancelled or crashed
  render leaves behind, and how the next one resumes.
- [Rendering on a remote host](./remote-render.md) — the same container problem over SSH, plus a
  world upload that can be interrupted and carried on.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the other place the engine runs
  somewhere that is not this computer.
