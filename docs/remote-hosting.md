# Hosting a rendered map on your own server

A finished render lives at `http://127.0.0.1:<port>/local/<renderId>/`, an address that answers
for exactly one person, on exactly one machine, only while that machine is on.
[Publishing to GitHub Pages](./pages-hosting.md) turns it into a real address somebody else hosts,
for free, as static files. This feature is the other answer: put the map on a Linux server *you*
own, keep it running as a real web server, and know honestly whether it is actually reachable.

It reuses [rendering on a remote host](./remote-render.md)'s whole SSH/Docker foundation rather
than inventing a parallel one: the same `ssh` wrapper, the same TOFU host-key trust store, the
same `scp`/`rsync` transfer with its automatic fallback, and the same four-stage preflight (ssh,
host key, Docker, disk). What is genuinely new is what happens after a render already exists on
this computer: the map is sent the other way, the container is started **detached** rather than
disposable, and a published port has to be **verified**, not merely started.

The main-process half is `design/packages/app/src/main/remote/hostplan.ts` (the plan: paths,
container name, the `docker run` itself) and `remote/hosting.ts` (the orchestrator: preflight,
upload, replace-and-start, verify, and the persisted record of what is running). The IPC seam is
`remote/hostingIpc.ts`. The renderer half is `design/packages/ui/src/components/remote/
RemoteHostingPanel.vue` and its bridge, `hostingBridge.ts`.

## Why the world is sent again, for a map that already rendered

This surprises people the first time, so it is worth stating plainly rather than discovering it
from a failed container. The engine builds a real `BmMap` on every start of the process -
`-w`/web-server mode included - and that construction opens the world's own region files whether
or not anything is going to be re-rendered (`packages/cli/src/maps.ts`, `buildMaps`). So hosting a
map that finished rendering an hour ago still uploads the **world**, read-only, alongside the
already-rendered tiles. Nothing about this application invented that requirement; it is how the
engine this project ports is built, and the honest fix was to say so rather than to pretend a
tiles-only upload would work.

## What actually moves, and where it lands

Reusing `remote/plan.ts`'s `remotePaths` layout (a hosting run's id is `host-<hostingId>`, so a
render and a hosted publication of it can never collide in the same work directory):

```
<workDir>/host-<hostingId>/
  config/    core.conf, webapp.conf, webserver.conf (enabled, 0.0.0.0), storages/, maps/*.conf
  data/      empty at the start; the engine's own logs land here
  web/       the render's ENTIRE web/ output - settings.json, maps/, and the static webapp
             files ANY render already wrote there (see below), not merely the tiles
  worlds/<mapId>/   the world, read-only - the engine needs it, see above
  cli.jar    the same engine jar a local run uses
```

`web/` is uploaded whole, not just `web/maps`. A render already leaves a complete static site
under its own `web/` root - the same fact
[publishing to Pages](./pages-hosting.md#the-fact-the-whole-feature-rests-on) relies on - so
reusing it here needed no extra step, and no `-g`/webapp-regeneration flag is passed on the remote
run.

## The container: detached, published, and a persistent name

The docker run this module builds (`remoteServeDockerRunArguments` in `hostplan.ts`) differs from
a render's own `remoteDockerRunArguments` in exactly three ways, and the doc comment on that
function says so directly:

- `-d --restart unless-stopped` in place of `--rm`. A render container is disposable on purpose;
  a hosted one is meant to keep answering after this application closes and after the remote host
  reboots, until somebody deliberately stops it.
- `-p <bind>:<port>:8100`, a port published on purpose, to an address the person chose.
- the engine runs `-w` rather than `-r -s`.

Every map's world is still mounted **read-only**. The already-rendered `web/` is mounted
read-write, because the upstream webapp writer touches files under it even when nothing is
re-rendered.

Publishing (and republishing - see below) always tears down any prior container of the same name
first (`docker rm -f`, one command, idempotent even when there is nothing to remove), so a second
publish never fails with "name already in use."

## Two bind modes, and neither is silently chosen for you

| Choice | What `docker run -p` binds to | Reachable from |
|---|---|---|
| **Loopback** (default) | `127.0.0.1:<port>` on the remote host | Only that server itself - open an SSH tunnel yourself (`ssh -L <port>:127.0.0.1:<port> user@host`) to reach it from elsewhere |
| **Public** | `0.0.0.0:<port>` on the remote host | The whole internet, at `http://<host>:<port>/`, over **plain HTTP** |

`docker-and-local.md`'s own local-server rule is "bound to loopback by default, never every
interface, because that is how a laptop in a café ends up putting somebody's world map on the
local network." Remote hosting exists specifically to invert that - the whole point is letting
somebody else reach the map - so the inversion is a real, informed choice rather than a changed
default: **loopback stays the default here too**, and choosing "public" shows the exact warning
this application will say at every funny level, in both languages: this server has **no TLS
anywhere in it**, publishing widely puts the map on the internet over plain HTTP, and fronting it
with a certificate is the person's own responsibility. The panel shows that sentence before
public is ever the selected value, not after.

The engine's own listen address inside the container is always `0.0.0.0` - a container's own
loopback is unreachable through `-p` forwarding from outside it, which is a completely different
fact from the *host-side* bind address above and is set unconditionally, matching
`runtime/config.ts`'s existing rule for a local containerised web server.

## "Live" is never claimed on Docker's word alone

`docker run -d` reports success the instant the container process starts. That is not the same
claim as "a browser can reach this," and the whole feature is built around not confusing the two -
the same honesty rule [`docker-and-local.md`](./docker-and-local.md) states for the local web
server: **a URL is reported only after it has actually been connected to.**

Remote hosting has one wrinkle a local server never has: two different networks can fail, and the
report has to say which one did.

- **Public bind**: this application makes a real TCP connection from *this* computer to
  `<host>:<port>`, the same way anybody else would reach it, using the same `tcpPortProbe` the
  local web server already proves itself with (`runtime/webserver.ts`). Only once that connection
  succeeds does the record carry a URL and `verified: true`.
- **Loopback bind**: this computer cannot reach `127.0.0.1` on somebody else's server at all -
  that is the whole point of choosing it. So the check instead runs **on the remote host itself**,
  over the SSH connection already open for everything else: a small `bash`/`/dev/tcp` script asks
  that machine's own kernel whether anything is listening on its loopback port, and the answer
  travels home over the already-trusted channel. `verified: true` here never carries a public URL
  - only a note with the exact `ssh -L` command that would open a tunnel to it.

Either way, a hosted map that never answers is reported exactly that way - `verified: false`, no
URL, a note naming which check ran and that it did not get an answer - rather than assumed live
because a container happened to start.

## Publishing again is what "update" is

There is no separate resume/update code path. Calling the same publish operation a second time:
preflights again, re-syncs the config/world/tiles (`rsync` where both machines have it, so only
what actually changed moves), tears down whatever container currently answers to that name, starts
a fresh one, and verifies again. The cost is a few seconds of downtime while the old container
stops and the new one binds - stated here rather than hidden behind a promise of zero-downtime
updates this module does not keep.

## Stopping is destructive, and is gated as such

Stopping a hosted map (`RemoteHostingOrchestrator.stopHosting`) tears the container down
(`docker rm -f`) and - unless the target is set to `keepRemoteFiles` - removes the whole remote
staging directory too, **world included**. Republishing after that costs the entire upload again,
not a resume.

The interface puts this behind `ConfigSuperConfirm`, the same anchored two-key-and-slider gate
every other destructive control in this application uses
([`super-confirmation.md`](./super-confirmation.md)), naming exactly that cost before the action
ever runs. The IPC handler itself (`hosting:stop`) performs the action without asking again; the
decision belongs to the gate, before the channel is ever called.

## Security, said plainly

- **Host keys**: exactly `remote-render.md`'s TOFU-with-fingerprint trust store, reused unchanged.
  `StrictHostKeyChecking=yes` always; an unknown key is a refusal with fingerprints to compare, a
  *changed* key is a refusal with no button at all.
- **Credentials**: no password field anywhere, ever. Authentication is the SSH agent or a named
  key file this application never opens, copies, or logs - see `target.ts`'s own doc comment for
  why a `RemoteTarget` is safe to persist whole, which is what the on-disk hosting record does.
- **Exposed ports**: loopback by default; a public bind is an explicit, warned choice, never
  silently widened.
- **Transport**: plain HTTP, always. This server has no TLS anywhere in it. A certificate in front
  of a publicly-bound host is the person's own responsibility to add - this application does not
  claim to provide one.

## Behaviour that is proven, and behaviour that is not

Everything above the network boundary is proven by the module's own test suite
(`hostplan.test.ts`, `hosting.test.ts`, `hostingIpc.test.ts`, `RemoteHostingPanel.test.ts`) against
the same fake command runner, fake file transfer, and injected verification probes the rest of
`remote/` is tested with - no SSH client, no Docker daemon, and no server anywhere in the run. That
proves the *shape* of every path: preflight refusing before a byte moves, the upload sequence, the
idempotent tear-down-and-restart, both verification paths reporting honestly when the address
never answers, loopback verification never inventing a public URL, and both branches of stopping
(with and without `keepRemoteFiles`).

What has **not** been run: an actual `ssh` connection, an actual Docker daemon publishing an
actual port, or an actual browser opening a hosted map. Nothing here has been proven against a
real remote host. Treat the shape as proven and the wiring against a genuine Linux server as the
next thing to verify by hand.

## What is deliberately not built yet

`RemoteHostingPanel.vue` is a complete, tested, standalone component, reachable through the main
process's `hosting:*` IPC channels and the preload bridge end to end - but it is **not yet wired
into the application's own tab navigation**. Mounting it into a discoverable screen, and giving it
the target-picker and map-list context a real screen would supply, is the next step; wiring it in
prematurely, in a shared checkout with several other screens under simultaneous construction, risked
a half-finished integration failing the several package-wide "every surface has X" invariants
(command palette coverage, tab search, menu coverage) that a genuinely new top-level screen has to
satisfy in full.
