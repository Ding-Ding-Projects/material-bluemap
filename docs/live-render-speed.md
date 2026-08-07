# Adjusting a render's speed while it runs

## Behaviour

Every render already carries a novice 1-5 "Speed" dial, set before a render starts (see
[Running the engine on this computer, or in a container](./docker-and-local.md) for the raw
`core.conf` fields it writes). This feature adds a second dial, drawn beside a render that is
**already running**, on `RenderRunPanel.vue`. It is a different control answering a different
question, and it does not pretend otherwise.

**The one fact that decides everything here: a JVM's thread pool is sized once, at startup, and
nothing this application or upstream exposes can resize it afterwards.** `render-thread-count`
and `render-thread-priority` — the two raw values the pre-render dial writes — are read by
BlueMap's engine exactly once, to build a fixed pool of worker threads. There is no reload hook,
no signal, no config-watch. So the live control never touches either value. What it changes
instead is coarser and sits outside the JVM entirely: **this machine's own opinion of how much of
itself the render gets.**

### Local route: OS process priority

A local render is one process — the JVM itself, spawned with no shell and no launcher script in
between (`main/render/runner.ts`). The live dial calls `os.setPriority(pid, priority)` against
that exact process id, using Node's own cross-platform priority constants
(`main/runtime/speedControl.ts`):

| Level | `os.constants.priority` | Label |
|---|---|---|
| 1 | `PRIORITY_LOW` (19) | Low (background) |
| 2 | `PRIORITY_BELOW_NORMAL` (10) | Below normal |
| 3 | `PRIORITY_NORMAL` (0) | Normal — the render's ordinary, unprioritised behaviour |
| 4 | `PRIORITY_ABOVE_NORMAL` (-7) | Above normal |
| 5 | `PRIORITY_HIGH` (-14) | High |

This is real and immediate: `os.setPriority` reaches the live process the moment it is called,
and every level from 1 to 5 genuinely differs. **Level 5 deliberately never reaches
`PRIORITY_HIGHEST`** (Windows' `REALTIME_PRIORITY_CLASS`). Node's own documentation warns that an
unprivileged process asking for it is silently downgraded, and this application never asks for
administrator rights to raise it further — so the dial's own top rung is named after the level an
unprivileged process can actually hold, rather than a request that would quietly become a
different one while claiming to have landed. `applyLocalPriority` reads the priority back after
setting it and reports a `priority-refused` outcome, with the level the OS actually granted, when
Windows held the process at something lower than what was asked for.

### Docker route: the container's own CPU quota

A container render is different in one specific way (`main/runtime/process.ts`'s own header
comment): the process this application spawned is the `docker run` **client**, not the JVM inside
the container. The client's own OS priority is irrelevant — cancelling already asks the *daemon*,
by container name, for exactly this reason. So the live dial does the same thing: it asks the
daemon to change the running container's CPU quota, by name, with `docker update --cpus`.

| Level | `docker update --cpus` | Why |
|---|---|---|
| 1 | 25% of this machine's logical cores (never below half a core) | Genuine throttle |
| 2 | 50% of this machine's logical cores | Genuine throttle |
| 3, 4, 5 | `0` — Docker's own spelling for "no limit" | See below |

**Levels 3 through 5 all resolve to the same, unthrottled quota**, and this is not a limitation
this feature works around quietly — it is stated on the control itself. A container has never had
`--cpus` set on it before this feature existed, so its real starting condition already is "every
core the host has." Docker's CPU quota can only throttle a container **down** from that; there is
no equivalent of asking a container to run *above* its ordinary, unthrottled share — `--cpu-shares`
only matters when something else is contending for the same cores, and nothing else is, because
this application runs one render per container. Inventing a number past the host's own core count
to make level 5 look different from level 3 would be exactly the "control that moves and changes
nothing real" defect this feature exists to avoid. The dial says this in as many words rather than
leaving it a silent gap: *"Docker cannot give a container more than that, so levels 3 through 5 all
mean the same thing here."*

### GitHub Actions and remote-over-SSH: not adjustable from here

A render on GitHub's own runners has no lever this application can reach — the machine belongs to
GitHub, not to this app, full stop. The control shows **disabled**, with that exact reason named
beside it, rather than hidden or left clickable and inert (the project's guided-forms rule: a
disabled control always names its unmet condition). A render over SSH to a Docker host is a fourth
route this application has (`main/remote/orchestrator.ts`); `docker update --cpus` would work
there too in principle, one hop further away over the same SSH tunnel, but it is not wired yet.
The control says exactly that — not implemented for this route yet — rather than silently doing
nothing while looking active.

### What always stays deferred

No matter which route or which level, **the thread count and thread priority baked into this
render's own launch never move**. The panel says so beside every single outcome, in the same
breath as reporting what genuinely did change. A "Restart at this level" button is offered next to
that fact — never triggered automatically — which stops the current render, waits for it to
genuinely end, and starts a fresh one with the same maps and the chosen level's own
`render-thread-count` **and** `render-thread-priority` (`speedLevels.ts`'s own table, the same one
the pre-render dial writes). BlueMap's storage is incremental, so a restart loses no tile already
drawn; it only re-launches the JVM with both deferred values actually in the config this time.

### Live throughput

Dragging a level is worthless if nothing on screen shows it did anything. Beside the dial,
`RenderThroughput.vue` shows a live, real rate: percent of the whole render completed per minute,
over a short recent window (two minutes by default). This is deliberately **not** a tile, chunk or
region count — upstream's own progress line for a map or a region is a percentage only, and this
port has never had a count to show beside it (see `progress/progressModel.ts`'s own `notes`). The
rate is real and it is exactly as precise as the engine's own reporting allows, no more.

## Configuration

The live click is not a persisted setting. It is a one-off request against the render in flight,
answered by `main/render/orchestrator.ts`'s `adjustSpeed(renderId, level)` and reported back as a
structured fact — which route, whether it applied now, whether a restart is still needed, and the
main process's own sentence explaining why. The interface never guesses at that sentence; it reads
the structured fields and builds its own translated line from them, with the backend's exact words
shown alongside as a quote, the same way an engine failure's own message is always shown verbatim
elsewhere in this application.

The explicit restart is different because it creates a new render request. That request carries
both `renderThreadCount` and `renderThreadPriority` through the UI bridge, preload contract and main
orchestrator. Local and Docker config generation write those values as `render-thread-count` and
`render-thread-priority`; priority must be an integer from 1 through 10. The request/session shape
retains the values needed by that replacement render rather than trying to mutate the already
running JVM.

## Failure modes

- **The process already exited** between the click and the priority change reaching it (local
  route): reported as `process-exited`, applied nothing, and a restart is still the only way to
  change the deferred half.
- **The container already stopped** (Docker route): `docker update` refuses, reported as
  `container-stopped`, and nothing was applied.
- **Windows refused the raise** without administrator privileges: reported as `priority-refused`
  with the level actually granted, never silently accepted as though the higher level landed.
- **No render is running under that id**: reported as `not-running`, whether the id is stale or
  the render already ended.
- **An unsupported route** (GitHub Actions, remote-over-SSH today): the control is disabled before
  a click is even possible, naming the exact reason.
- **A broken bridge promise**: `renderRun.ts`'s `adjustSpeed` never lets a rejected promise become
  an unhandled rejection — it is turned into the same refusal shape any other outcome uses.
- **A stale packaged preload**: the UI's world-bridge resolver requires `adjustRenderSpeed`. A
  preload exposing the older shape is rejected as unavailable instead of presenting a live-speed
  button whose call can only fail later.
- **An invalid deferred priority**: config generation rejects non-integers and values outside
  1-10 before it writes a partial render configuration.

## Security considerations

The live adjustment reads or writes no config or session record. The local route changes only this
OS's bookkeeping about a live process id; the Docker route changes only the daemon's cgroup quota
for a live container name, addressed by the exact name this application itself gave it. Neither
can reach a process or container this application did not start. Only the explicit restart writes
a replacement render configuration, using the same bounded config path and request validation as
an ordinary pre-render launch.

## Verification

- `main/runtime/speedControl.test.ts` (22 tests): the priority table's own values against Node's
  real `os.constants.priority`, the monotonic climb from level 1 to 5, the deliberate stop short of
  `PRIORITY_HIGHEST`, the Docker CPU-quota fractions and their floor, the `docker update --cpus`
  command built exactly, and a refused priority raise reported honestly rather than silently
  accepted.
- `components/config/speedLevels.test.ts`: `matchThreadCount`'s coarser, thread-count-only
  question, distinguishing "automatic" (nobody set one), a matched level, and "custom" (an explicit
  count matching none of the five).
- `components/world/renderRun.test.ts`: `renderThreads` reflecting exactly what a request named
  (or `null` when it named nothing), `adjustSpeed` reaching the bridge with this render's real id
  and reporting the bridge's exact outcome unedited, a broken bridge promise turned into a refusal,
  and `restartWithLevel` genuinely cancelling first, waiting for the real end, then relaunching
  with the chosen level's thread count and thread priority.
- `packages/app/src/preload/liveSpeedBridge.test.ts`: loads the real preload entry, captures the
  object exposed through `contextBridge`, gives that exact object to the real UI resolver, and
  proves `adjustRenderSpeed` crosses the packaged preload seam rather than only an injected unit
  stub.
- `main/render/config.test.ts`: local and Docker config output contains both deferred fields, and
  an invalid `renderThreadPriority` is refused before output is accepted.
- `components/world/LiveSpeedControl.test.ts` (10 tests): every disabled route naming its own exact
  reason and refusing every click, an enabled route offering every level, the extremes stated in
  words, a click reaching the bridge with the right id and level, the live-versus-deferred outcome
  shown honestly for both an applied and a blocked result, and the restart offer appearing only
  after a click — never on its own.
- `components/progress/throughputModel.test.ts` (8 tests) and `RenderThroughput.test.ts` (3 tests):
  the windowed rate never reports before two samples exist far enough apart, never reports a
  negative rate when percent briefly moves backwards, drops samples that age out of the window, and
  the component's own reading genuinely re-renders as new samples arrive.

## Suggested articles

- [Running the engine on this computer, or in a container](./docker-and-local.md) for the
  pre-render novice dial this feature deliberately does not touch, and the raw `core.conf` fields
  it writes.
- [Render console](./render-console.md) for the live log this panel sits beside.
- [Renders that survive being interrupted](./resumable-renders.md) for why a restart loses no tile
  already drawn.
- [Rendering a world in GitHub Actions](./render-in-actions.md) for why that route has no lever
  this control can reach.
- [Rendering on a remote host](./remote-render.md) for the SSH-over-Docker route this control does
  not adjust yet, and why.
