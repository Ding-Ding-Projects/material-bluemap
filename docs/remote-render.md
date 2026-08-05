# Rendering on a remote host

A laptop is a bad place to render a large world. A Linux box with real cores and real disk is a good
one. This hands a render to that machine over SSH, runs it in a container there, and brings the map
back — and the interface reports the whole thing exactly as it reports a local render, because it
*is* the local reporting.

**Contents**

- [What it does](#what-it-does)
- [Configuring a target](#configuring-a-target)
- [Authentication: keys only, never a password](#authentication-keys-only-never-a-password)
- [The host key is a decision, not a default](#the-host-key-is-a-decision-not-a-default)
- [The preflight, and why its order matters](#the-preflight-and-why-its-order-matters)
- [What leaves this machine, and what is left behind](#what-leaves-this-machine-and-what-is-left-behind)
- [Progress, cancellation and failure](#progress-cancellation-and-failure)
- [Closing the app does not stop the render](#closing-the-app-does-not-stop-the-render)
- [Sending the world so an interruption does not cost it](#sending-the-world-so-an-interruption-does-not-cost-it)
- [What genuinely cannot be resumed](#what-genuinely-cannot-be-resumed)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Known limits](#known-limits)
- [Related reading](#related-reading)

## What it does

```
1  preflight     ssh, host key, Docker, disk. Nothing is sent until all four pass.
2  stage         create <workDir>/<renderId>/ on the remote host
3  config        written HERE with CONTAINER paths in it, then uploaded
4  upload        the engine jar, then each world
5  note          write the container's name and host to container.json, BEFORE starting it
6  render        ssh -> docker run, output read line by line as it arrives
7  collect       bring <web>/maps home into this render's own workspace
8  clean up      remove <workDir>/<renderId>/ and the note, unless the target keeps its files
```

The staging layout on the remote host is one directory per render, so an abandoned one is a single
folder somebody can delete:

```
<workDir>/<renderId>/
  config/           mounted at /bluemap/config
  data/             the client jar and the engine's logs
  web/              the tiles. web/maps is what comes home.
  worlds/<mapId>/   mounted READ-ONLY at /worlds/<mapId>
  cli.jar           mounted read-only at /bluemap/cli.jar
```

The container command is built from `main/runtime/` rather than restated: the CLI flags, the
container paths, the `-v` spelling, the container naming rule and the polite stop all come from
there. A remote render is a `docker run` on somebody else's machine, and a second opinion about what
that command should be is a second thing to get wrong.

## Configuring a target

| Field | Meaning |
|---|---|
| `host` | a host name, an IPv4 address, or an IPv6 address in brackets |
| `port` | 22 unless the host has moved SSH |
| `user` | the account to sign in as |
| `identityFile` | the **path** to a private key, or blank to use your SSH agent |
| `workDir` | where renders are staged there. `~/.material-bluemap/renders` by default |
| `image` | the container image. The same stock JRE the local Docker path uses |
| `docker` | the remote `docker` binary, for a host with a wrapper |
| `keepRemoteFiles` | off. On, the staging directory survives the render — and the app says so |

Every one of those ends up in an `ssh`, `scp` or `docker run` argument, so every one is validated
before anything is spawned. The refusals are not fussiness — they are the shapes that make an
argument mean something other than it appears to:

- a host beginning with `-` is read by `ssh` as an **option**, which is how a host field becomes a
  way to set `ProxyCommand` and run an arbitrary local command;
- a user or host with whitespace in it splits an argument;
- a work directory with a `:` in it ends the source half of a `-v src:dst:ro` early and mounts
  something else;
- a `..` that survives normalisation points somewhere that cannot be decided from the string.

`workDir` is checked by its own POSIX rules rather than by `runtime/mounts.ts`'s. That checker
refuses `/home` and `/var` outright, which is right for a laptop being asked to share a folder with
a container and wrong for a server whose accounts live in exactly those places. Running a laptop's
rules over a server's filesystem would refuse the only sensible place to stage and permit nothing.
The remote list refuses `/`, `/etc`, `/usr`, `/bin`, `/sbin`, `/lib`, `/boot`, `/dev`, `/proc` and
`/sys`.

## Authentication: keys only, never a password

**There is no password field and there is nowhere to put one.** That is the design, not an omission
to be filled in later.

- The app never asks for a password, never stores one and never passes one to `ssh`.
- Every invocation carries `PasswordAuthentication=no`, `KbdInteractiveAuthentication=no`,
  `PreferredAuthentications=publickey` and `BatchMode=yes`, so the client **cannot** fall back to
  one even if a host offers it, and cannot hang on a prompt in a background process.
- Authentication is your **agent** (the default) or an **identity file named by path**. The app
  records where the key is; it never reads it, never copies it, never writes one, and never puts its
  contents anywhere.
- A stored target holds a host, a port, a user name and a path. Nothing in one is a secret, so
  persisting it is safe by construction — and any `password`-shaped field an older build or a
  hand-edited settings file left behind is dropped rather than carried into an invocation.

A password that exists somewhere is a password that ends up in a config file, a log line, a crash
report or a screenshot. The way to not leak one is to not have one.

When a named identity file is used it is passed with `IdentitiesOnly=yes` beside it. Without that,
the agent's keys are offered first and a host with a low `MaxAuthTries` refuses before the named key
is ever reached — which reads as "the key does not work" for a key that does.

## The host key is a decision, not a default

SSH's whole guarantee rests on knowing that the machine answering is the machine that answered last
time. `StrictHostKeyChecking=accept-new` throws that away for the *first* connection to any host,
which is precisely the connection an interceptor needs to survive: after it, the wrong key is the
recorded key and every later connection looks fine.

So every connection uses `StrictHostKeyChecking=yes`, and there are three states:

| State | What happens |
|---|---|
| **trusted** | the key is already in a `known_hosts` the app reads. Nothing is asked. |
| **unknown** | never seen. Nothing is sent. The fingerprints are put in front of you to compare. |
| **changed** | seen, and different. **Refused**, with no button anywhere. |

`changed` has no button because a rebuilt server and an intercepted connection are indistinguishable
from here, and a button that resolves that ambiguity in the app's favour resolves it in an
attacker's favour too. Removing a recorded key is a deliberate act with a file path in it, and the
message says which file.

Two more details that are easy to get wrong and are not:

- **The app reads two trust stores and writes to one.** It reads its own `known_hosts` in the
  application data directory *and* your `~/.ssh/known_hosts`, so a host you already trust needs no
  second decision — but it only ever appends to its own. An app that writes to your personal trust
  store changes the trust of every other program on the machine, and a bug here would be a bug in
  your `git push`.
- **Accepting a key names one rather than supplying one.** What crosses from the interface is a
  `SHA256:` fingerprint. The main process then re-scans the host, recomputes the fingerprints itself,
  and writes a line only if one of them matches. Otherwise the renderer — the least trusted process
  in the application — would be one message away from appending an arbitrary line to a trust store.
  If the host has started offering a different key since you read the fingerprint, nothing is
  recorded and the app says so.

The fingerprint is computed the way `ssh-keygen -l` computes it: base64 of the SHA-256 of the raw
key blob, padding stripped. A fingerprint you cannot compare character-for-character with what the
server prints is a fingerprint nobody checks.

Keys are recorded under `[host]:port` whenever the port is not 22, because that is what OpenSSH
looks them up under. Recorded bare, a non-standard port would ask again every single time.

## The preflight, and why its order matters

Four checks, in this order, each running only when the one before it passed:

| Stage | Question | If it fails |
|---|---|---|
| `ssh` | can this app reach the host and sign in at all? | `unreachable`, `auth-refused`, `ssh-missing` |
| `host-key` | is this the machine that answered last time? | `host-key-unknown`, `host-key-changed` |
| `docker` | is there a Docker there, and is its daemon running? | `docker-missing`, `docker-daemon-down`, `docker-refused` |
| `disk` | is there room under the work directory? | `not-enough-disk` |

The order is not cosmetic. Asking about Docker before the connection works reports "Docker is not
installed" for a host that is simply switched off, which sends somebody to install software on a
machine that was never the problem.

Preflight runs **before anything is uploaded**. A render is gigabytes of upload and hours of compute;
discovering at the end of the upload that the host has no Docker is not a slow failure, it is a
wasted evening on a domestic connection.

The Docker check is `runtime/docker.ts` — the same classifier the local Docker path uses, with its
five distinct states — run over an SSH-backed command runner. There is one Docker classifier in this
repository; a second would drift, and the state it got wrong would be the one nobody tested. Two
translations make that reuse honest rather than merely convenient:

- a remote shell's **127** ("command not found") is reported the way a *locally* missing binary is,
  so "Docker is not installed on that host" does not arrive as "exit code 127";
- a failure of **`ssh` itself** is marked apart from a failure of the command it carried, so a dead
  server is never reported as a broken Docker.

That second one has a subtlety worth recording: **the exit code decides whose failure it is, and the
text only decides which one.** `ssh` exits 255 for its own failures and otherwise returns the remote
command's status. A `docker version` refused by its own daemon prints "permission denied", and
pattern-matching that as an SSH authentication failure turns "add this account to the docker group"
into "your key was rejected" — two problems with nothing in common and different machines to fix them
on. The first version of that classifier did exactly this.

The one thing preflight writes is `mkdir -p <workDir>`, because `df` on a directory that does not
exist yet answers about nothing. It is one empty directory, and it is the directory the render was
about to create anyway.

## What leaves this machine, and what is left behind

The app answers this before a render starts, so it can be put in front of you rather than beside a
log you read afterwards.

**Sent:**

- the world folders of the maps in this render, copied whole;
- the BlueMap engine jar this app runs;
- a generated config file naming those maps and their dimensions.

**Never sent:**

- any GitHub token or sign-in;
- any private key — authentication is your agent, or a key file that stays where it is;
- any password;
- any other world, map or setting from this computer.

**Left behind:** nothing. `<workDir>/<renderId>/` is removed when the render ends, whether it
succeeded, failed or was cancelled. With `keepRemoteFiles` on it is kept, and the app logs a warning
naming the directory and saying it includes a copy of the world — a copy of somebody's world sitting
on a server is a fact they are entitled to know rather than a detail.

A cleanup that fails never turns a finished render into a failed one: the map is already home. It is
reported as a warning naming the directory that is still there, which is what somebody needs to
remove it by hand.

## Progress, cancellation and failure

A remote render emits `RenderEvent` — the *same* union a local render emits — so the same progress
bar, the same log pane, the same cancel button and the same failure banner work with no knowledge
that a network was involved. That is not achieved by copying the event shapes; it is achieved by
using them, and by running the container's own output through the same `RenderOutputTracker` and the
same progress parser the local path uses. `updating map 'overworld': 25.663% (ETA: 47 seconds)`
arrives from a container two thousand miles away exactly as it arrives from a JVM on this desk.

Transfer steps report on the same channel with an honest description. Their percentage measures
**files staged, not bytes moved** — `scp` does not report the second, and inventing it would be a bar
that lies.

**Cancelling stops the container, not the conversation.** This is the one place the remote path
genuinely differs and the expensive kind of wrong to get wrong. Killing the local `ssh` kills a
viewer; the daemon on the other machine owns the container's lifetime and never hears about it, so
the JVM carries on rendering into somebody's disk with nothing left holding a handle to it. So a
cancel asks the *remote daemon*: `docker stop --time 8 <name>`, by name. `--init` in the launch is
what makes that SIGTERM reach the JVM at all — without it the JVM is PID 1, ignores SIGTERM by
default, and every cancellation waits out the full stop timeout before the container is killed,
losing the shutdown that saves the tiles already rendered. Cleanup then runs on the way out, so a
cancelled render does not leave a staging directory behind either.

A cancelled render is reported as **cancelled**, never as a failure with a code. A person who
pressed Cancel must not be shown a red banner saying something went wrong.

Failures carry two codes. `code` is the existing `RenderFailureCode`, so an interface that has never
heard of a remote target still renders and routes the failure; `remoteCode` is the precise reason,
for one that has. Anything found *before* the engine started maps to `invalid-request` — nothing was
spawned and nothing changed on either machine — and anything that started somewhere and stopped maps
to `cli-failed`.

## Closing the app does not stop the render

The same fact as cancellation, from the other side. If killing `ssh` does not stop the container,
then **quitting does not stop it either**: the render that was going when the app closed is still
going when it opens again, tiles still landing in `<workDir>/<renderId>/web/maps` on that host, with
nothing left holding a handle to it. Previously the app would have offered to send the whole world
again beside it.

What was missing was never the work — the work is fine, it is still running — it was the **name**.
So before the container is started, the app writes one down:

```
<storageDir>/<renderId>/
  render.json      which engine rendered this, and how it ended
  session.json     what is running right now, and how far it got
  container.json   which container is doing it, on which host, and where its output goes
```

`container.json` is written *before* the container starts, because the window between the two is
exactly the window in which being killed produces a container nothing can name. It is removed on
every way out of a run — success, failure, cancellation, or a thrown error — so a note left behind
never offers to reattach to something that has already ended. It carries the target's own fields
rather than a settings key, because a record naming only a target id becomes unreadable the moment
somebody renames that target, which is precisely the situation it exists to survive.

On the next launch, and whenever asked, the app puts each name to the daemon that owns it and gets
one of three answers:

| The daemon says | What happens | What you are told |
|---|---|---|
| still running | **reattach**: `docker logs --follow --tail all` is streamed over `ssh` and reported as a live render | *…is still going in container 'x' on renderer@host:2222… Picking it up rather than starting a second one beside it.* |
| exited | **collect**: the tiles are already on that host's disk, so they are fetched and the render finishes | *…finished while the app was closed (exit code 0). The tiles it wrote are still where it wrote them…* |
| no such container | **collect**, honestly: `--rm` removed it the moment it ended, taking its exit status | *…its exit status went with it… nothing here can say whether it got to the end, so run the render again if you need that confirmed. It will only redo what is missing.* |
| nothing (the host did not answer) | **neither.** Nothing is collected, nothing is discarded, the note is kept | *…may well still be going… Try again once that machine answers.* |

Three details worth being exact about:

- **Reattaching is a launch, not a second reporting path.** `docker logs --follow` becomes an
  ordinary `EngineLaunch` whose command is `ssh`, so the line reader, the phase tracker, the
  progress parser and the cancellation are the code the ordinary path already uses. A reattached
  render emits the same `RenderEvent` union, appears in the same list, moves the same bar and is
  stopped by the same button.
- **`--tail all` replays the log from its first line.** A render the app missed two hours of does not
  resume with a bar at zero and no map names: the tracker sees every line since the container
  started and arrives at the real percentage. Replaying costs a few thousand lines of parsing and
  buys a progress bar that is not a lie.
- **`docker logs` cannot tell you whether the render succeeded.** Its exit code is the *client's*,
  and it returns 0 both when a render finished and when it died. So a reattached run is judged the
  way a render is really judged — by whether the engine printed `Your maps are now all up-to-date!`
  — and a log that ended without that is reported as a failure, not a success.

Cancelling a reattached render asks the **remote daemon**, exactly as cancelling a live one does.
Killing the `ssh` carrying `docker logs` would stop only the reading, which is the situation this
whole feature exists to get out of.

A container named the way this app names them with **no record beside it** is reported and never
stopped automatically: without the record there is nothing to say which render it belongs to or
where its output was going, so the only honest thing is to name it and let a person decide.

## Sending the world so an interruption does not cost it

`scp` has no notion of a partial file. A copy that stops at nine gigabytes of ten leaves a
nine-gigabyte file that the next copy overwrites from byte zero. On a domestic connection that is
not an inconvenience — it is the difference between a render that happens and one that never does,
because the upload is longer than the interval between dropped connections.

So the app looks for `rsync` on **both** machines (it runs a copy of itself on each end, so one is
not enough) and uses it when both have it:

```
-a                  archive: recurse, keep times and permissions
--partial           keep a file that was cut off, instead of deleting it
--append-verify     carry it on from where it stopped, after checksumming what is already there
-e "<ssh …>"        the same ssh, with the same security options as everything else
```

`--partial` alone only *keeps* the fragment; `--append-verify` is what makes the next run use it. It
is deliberately not plain `--append`: it reads the bytes already at the destination and checksums
them against the same range of the source, so a fragment of a file that has changed since is re-sent
whole rather than producing a file that is half one version and half another. A world folder is
exactly the kind of source that gets edited between two attempts.

**The log says which tool moved the files, before a byte moves**, and says what an interruption
would cost either way:

> Sending with rsync 3.2.7 here and 3.1.3 on renderer@render.example, so a transfer that is
> interrupted carries on from where it stopped rather than starting again.

> Sending with scp, because render.example has no rsync. scp cannot carry a partial file on, so a
> transfer that is interrupted starts that file again from the beginning. Installing rsync on both
> machines is what changes that.

Which machine is missing it is named, rather than one sentence for both cases — "rsync is not
available" sends somebody to install it on the machine that already has it.

There is one sharp edge and it is handled at use time rather than assumed away. **rsync takes the
remote shell as a single string and splits it itself**, and this app's `known_hosts` lives under the
application data directory — on Windows, `…\Material BlueMap\known_hosts`, a path with a space in
it. Whether a given rsync build honours the quotes around that is a property of that build. So the
words are quoted, and if an rsync copy fails anyway the same copy is made with `scp` and the log
says so:

> rsync could not send C:\saves\world (…), so scp is being used for it instead. scp cannot carry a
> partial file on, so if this one is interrupted it starts again from the beginning.

A cancellation is never retried through `scp` — that would be a cancel button that starts a second
upload. The guarded remote `rm -rf` and the `mkdir -p` are still `transfer.ts`'s; rsync delegates
them rather than growing a second copy of the most destructive command this app can issue.

## What genuinely cannot be resumed

Some things cannot, and each says which and offers a clean restart as an explicit choice rather than
doing one silently.

| Situation | What the app says |
|---|---|
| the container was removed by `--rm` | the tiles are fetched; its exit status is gone, so nothing claims to know whether it finished |
| the staging directory was deleted on the host | *…could not be fetched… If the staging directory was removed there, the tiles are gone with it and the render has to be started again.* |
| the output folder on this computer was deleted | *…is not there, so there is nothing of this render left to pick up… Rendering it again is the only way forward, and it will start from nothing.* |
| **the host key changed** since the render started | refused, in the same words a fresh connection is refused in, with no button. A rebuilt server and an intercepted one are indistinguishable from here |
| the record itself will not parse, or names a host that is not a host | *…does not describe a host this app is willing to build an ssh command from… The render has to be started again.* |
| the host simply did not answer | nothing is collected and **nothing is discarded**; the note is kept, because it is the only evidence a still-running render exists |

The host, port, user and key path in a record end up in an `ssh` argument, so a record read off disk
goes back through the **same validation a freshly typed target gets**. A record is a file, and an
old build, a hand edit or a restored backup can have put `-oProxyCommand=…` in it.

## Failure modes

| `remoteCode` | What it means | Where the fix is |
|---|---|---|
| `invalid-target` | the target is not usable as written | the target's own fields |
| `ssh-missing` | no `ssh` on **this** computer | install the Windows OpenSSH client |
| `unreachable` | DNS, refused, timed out, no route | the host, the port, the network |
| `host-key-unknown` | never seen this key | compare the fingerprint, then accept it |
| `host-key-changed` | not the recorded key | deliberately, on the recorded key — never automatically |
| `host-key-unavailable` | the host offered no readable key | the host's SSH configuration |
| `auth-refused` | the key was refused | `authorized_keys` there, or your agent here |
| `docker-missing` | no `docker` on the remote PATH | install Docker there |
| `docker-daemon-down` | installed, daemon not running | start it there |
| `docker-refused` | daemon there, account not allowed | the docker group there |
| `docker-unusable` | Docker answered with something unrecognised | the detail carries Docker's own words |
| `not-enough-disk` | less free space than the render needs | free space there, or a bigger volume |
| `transfer-failed` | something did not make it either way | the detail carries `scp`'s own words |
| `remote-command-failed` | a command over SSH failed otherwise | the detail carries the exit code and the words |
| `render-failed` | the container ran and did not finish | the engine's own diagnostics |
| `cancelled` | you pressed Cancel | nothing; this is not an error |

`render-failed` also covers the case that looks like success: the engine prints a warning banner,
updates nothing, and exits **0**. Treating that exit code as the answer would report a render that
produced no tiles as a completed render, so the run is only a success when the engine also said
`Your maps are now all up-to-date!`.

## Security notes

- **No password, anywhere.** No field, no storage, no argument, and SSH options that make the client
  refuse one even when offered.
- **No private key is ever read, written or copied.** Only a path is recorded, and only `ssh` opens
  it.
- **No host key is trusted silently.** `StrictHostKeyChecking=yes` on every invocation; an unknown
  key is a decision for the person, a changed key is a refusal with no override.
- **The app writes only to its own trust store**, never to `~/.ssh/known_hosts`.
- **The renderer cannot supply a key**, only name a fingerprint it was shown.
- **Every remote word is quoted** with POSIX single quotes, which a shell has no way to reinterpret.
  `ssh host <words>` does not run an argv — it joins the words and hands the string to the remote
  login shell — so a world folder called `Saves, old (2)` is not an edge case, it is a broken command
  or, worse, a different one. The single exception is the leading `~` of the work directory, which is
  left outside the quotes for the one command that resolves it, because a quoted tilde is not
  expanded and the render would stage into a directory literally called `~`.
- **The world is mounted read-only** in the container, always. A render reads chunks and writes
  tiles.
- **No port is published.** A remote render has no web server; the tiles come home and are served by
  this app. Opening a port on somebody's server as a side effect of pressing Render is not a thing
  this app does.
- **The remote `rm -rf` is guarded on the remote side as well as on this one.** The path is already
  validated here; the remote script refuses `/`, an empty value and a `..` path before running. `rm
  -rf` with an unexpected variable is the single most destructive command a script can run, and the
  cost of it being wrong is somebody's server.

## Verification

`design/packages/app/src/main/remote/` has 154 tests, and not one of them needs an SSH client, a
container runtime, a server or a network:

| File | What it proves |
|---|---|
| `target.test.ts` | a `-oProxyCommand=` host is refused; a work directory with a `:` is refused; nothing password-shaped survives validation |
| `ssh.test.ts` | the options make a password impossible and never accept an unknown key silently; `ssh -p` versus `scp -P`; quoting a folder name a person would really have; the exit code decides whose failure it is |
| `hostkey.test.ts` | the fingerprint matches an independently computed `ssh-keygen -l` value; a key that was not offered cannot be recorded; recording appends rather than replaces |
| `preflight.test.ts` | an unreachable host never mentions Docker; Docker missing, daemon down and refused are three different sentences; a changed key produces no acceptable fingerprint; `df -Pk` parsing |
| `transfer.test.ts` | the destination's parent is created so a copy cannot land a level too deep; the remote `rm` guard; a cancelled transfer stops rather than finishing |
| `rsync.test.ts` | **an interrupted transfer resumes and sends only what did not arrive**, asserted against a fake host that counts bytes rather than against the presence of a flag; both "this computer has no rsync" and "that host has no rsync" as separate sentences; a `known_hosts` path with a space quoted; a failed rsync completing through `scp` **with the cost stated**; a cancelled copy never retried |
| `plan.test.ts` | the world is mounted read-only, nothing is published, the container is named and `--init`ed |
| `reattach.test.ts` | a record's host goes back through the same validation a typed one gets, and `-oProxyCommand=` in one is refused; a changed host key is reported as itself and never as a container that is gone; the log is streamed over `ssh` as an ordinary launch; the stop reaches the remote daemon; a staging directory that has gone is said to have gone |
| `orchestrator.test.ts` | the whole flow: what is uploaded and in what order, a config with container paths in it, the container's own progress reported as a local render's, a **cancelled** render that cleans up and is not reported as a failure, a refused preflight that uploads nothing, a failed transfer, a container that exits 0 without finishing, and **the container's name written down before it is started and removed however the run ended** |
| `ipc.test.ts` | the channels register and dispose exactly; no handler rejects; only a fingerprint reaches the trust step |

The container states themselves — still running, finished while the app was away, removed by the
daemon, and a cancel that reaches a reattached container — are proved in
`design/packages/app/src/main/runtime/`; see [Running the engine on this computer, or in a
container](./docker-and-local.md#picking-a-container-back-up-after-the-app-closes).

Run them with `npx vitest run packages/app` from `design/`, alongside
`npx tsc -p packages/app --noEmit` and `npx eslint packages/app`.

Not yet verified: an end-to-end render against a real remote host. Every command this builds is
asserted character-for-character and every failure path is exercised against a fake that answers the
way the real tools do, but no capture from a real server exists yet, and this section says so rather
than implying one does.

## Known limits

- **`scp` is still the floor, and it is the slow part.** It opens a channel per file and a world is
  tens of thousands of small region files. It is what is used when either machine has no rsync, and
  it is what the guarded remote delete and the `mkdir -p` always go through. A streamed `tar` would
  be faster than either and is not built.
- **rsync makes a transfer resumable, not incremental in BlueMap's sense.** It skips file content
  that already arrived; it does not know that a world was rendered before. BlueMap's own incremental
  render state lives in the staging directory, which is removed after a render unless
  `keepRemoteFiles` is on — so a second render of the same world is still a full render, and turning
  that setting on is what changes it.
- **A container with no record cannot be reattached, only reported.** Without the note there is
  nothing to say which render a container belongs to or where its output was going. Strays are also
  only looked for on the **local** daemon, because a stray is by definition a container whose record
  is gone, and without a record there is no host to ask.
- **One target at a time per render id**, exactly as a local render is.
- **A failure to reach a settings row.** `render/failure.ts` owns the settings anchors and has none
  for a remote target, so remote failures carry the fix in their message rather than a link. Adding
  one means editing that file.

## Related reading

- [Worlds from somebody else's release](./world-sources.md) — the other way a world moves between
  machines.
- [Worlds hosted on your own SSH server](./ssh-world-sources.md) — the read direction over this
  same connection, host-key and transfer machinery: a world fetched from a server you own
  rather than sent to one.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the other machine that can render
  for you, and the one that needs no server of your own.
- [Renders that survive being interrupted](./resumable-renders.md) — the same promise for a render
  on this computer, and the incremental behaviour that makes carrying one on cheap.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — where the
  reattachment machinery lives, and the local container it applies to just as much.
