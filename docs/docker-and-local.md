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

## The web server

For the web-server role the engine is started with upstream's `-w`, and `webserver.conf` is
written with `enabled: true` and a port. The two modes differ in exactly one setting and one
argument:

- **Local**: the engine binds `127.0.0.1:<port>`. The URL is `http://127.0.0.1:<port>/`.
- **Docker**: the engine binds `0.0.0.0:<containerPort>` *inside the container*, and the port is
  published with `-p 127.0.0.1:<hostPort>:<containerPort>`. The URL is
  `http://127.0.0.1:<hostPort>/`.

Binding `0.0.0.0` inside a container is not a wider exposure than binding loopback locally,
because the publish rule is what decides who can reach it, and it publishes to this machine's
loopback only. Binding `127.0.0.1` *inside* the container would be the container's own loopback
— unreachable from the host even with the port published, which is the most common way a
containerised server "starts fine" and answers nothing.

**A URL is only reported after it has been connected to.** Upstream logs `Starting webserver …`
before it binds and reports a bind failure afterwards, so neither the log line nor a
still-running process is evidence. The app opens a TCP connection to the address a person would
type, from this machine, and reports the URL only once that succeeds. The three other outcomes —
the process exited first, the port never answered, there was no port to publish — are reported
as themselves, with the engine's own exit code and last words.

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

`design/packages/app/src/main/runtime/` carries 79 tests, none of which need Docker installed:

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
- `webserver.test.ts` — that a URL is reported only after a successful connection, that the
  container case probes the published host port, and the three ways a start can honestly fail.
- `ipc.test.ts` — the channels, the honest per-mode availability, and that no handler rejects.

## Suggested articles

- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — what
  happens next when one of these runs does not start.
- [Renders that survive being interrupted](./resumable-renders.md) — what a cancelled or crashed
  render leaves behind, and how the next one resumes.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the other place the engine runs
  somewhere that is not this computer.
