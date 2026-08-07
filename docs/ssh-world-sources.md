# Worlds hosted on your own SSH server

A world does not have to be zipped up, uploaded and re-downloaded every time it changes. If it
already lives on a machine you own — a home server, a VPS, a Windows box running a Minecraft
server — and that machine answers SSH, this reads the world from where it already is.

This is the read side. [Rendering on a remote host](./remote-render.md) is the other
direction — sending a render _to_ a machine over SSH — and both share the same connection,
host-key and transfer code in `main/remote/`. This feature adds nothing new to that trust
model; it reuses it.

**Contents**

- [What it does](#what-it-does)
- [Linux and Windows, one honest difference](#linux-and-windows-one-honest-difference)
- [The host key is a decision, not a default](#the-host-key-is-a-decision-not-a-default)
- [The cheap change check](#the-cheap-change-check)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## What it does

```
1  connect       ssh, with the host key checked exactly as a remote render checks it
2  detect        which kind of shell answered - POSIX, Windows, or genuinely unknown
3  check path    the given remote path, read in that host's own grammar
4  transfer      rsync where both ends have it, scp everywhere else - and it says which
```

Nothing is written to the remote host at any point. This is a read, and only a read: no
staging directory is created there, nothing is deleted, and a failure at any stage leaves the
remote host exactly as it was found.

## Linux and Windows, one honest difference

A Linux host very likely has `rsync`, and the existing `chooseTransfer` machinery already
prefers it: an interrupted fetch of a world's tens of thousands of small region files resumes
from where it stopped rather than starting the whole world over.

A Windows host very likely does **not** have `rsync` — it does not ship with Windows and is
rarely installed there — so the transfer falls back to `scp`, exactly as it already does for
any host missing either end of the pair, and says so in the message it returns:

> Sending with scp, because renderer@host has no rsync. scp cannot carry a partial file on, so
> a transfer that is interrupted starts that file again from the beginning.

Nothing new was built for that fallback; it is `main/remote/rsync.ts`'s own honesty, reused.

What Windows _does_ need that Linux does not is a way to even ask "what kind of host is this"
without knowing in advance which shell answers an SSH command. OpenSSH Server on Windows
defaults its login shell to `cmd.exe`; an administrator can configure it to PowerShell instead.
Writing quoting for "the" Windows shell would mean guessing which of those two a given host
runs — and being wrong about a shell is how a path with a space in it becomes a different
command.

The way out is `-EncodedCommand`: PowerShell's own way of taking a script as Base64 of
UTF-16LE text, with **no quoting step in between**. The remote command line built for a
Windows host is:

```
powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -EncodedCommand <base64>
```

Base64's alphabet is `A-Za-z0-9+/=` — no space, no quote, no shell metacharacter — so this one
line survives being split on whitespace by `cmd.exe`, by PowerShell itself, or by anything
else that merely tokenises a command line the plain way. The login shell's own quoting dialect
stops mattering, because nothing sent to it ever needs quoting.

Detection itself costs at most two round trips: `uname -s` first, because it is the common
case and answers in one. When that fails with the shell simply not recognising the command —
not a connection failure, a **command** failure, which `ssh`'s own exit code distinguishes —
the PowerShell probe runs next. A host that answers neither is reported as `unknown`, honestly,
and every caller downstream degrades from there: the survey below refuses to guess a shell it
was never shown working.

## The host key is a decision, not a default

Exactly the same rule [remote rendering](./remote-render.md#the-host-key-is-a-decision-not-a-default)
already documents, because it is the same code: `StrictHostKeyChecking=yes`, always. A host
this application has never seen offers its fingerprints for a person to compare against the
machine itself; a host whose key has _changed_ is refused outright, with no button anywhere,
because a rebuilt server and an intercepted connection look identical from here.

## The cheap change check

Reading a world's actual files can be expensive even before a single byte transfers, if the
only way to know whether anything changed is to transfer it. `surveyRemoteWorld` answers that
question for the cost of one remote command: a listing of every file's size and modification
time, `find -printf` on a POSIX host and a `Get-ChildItem` one-liner run through the
PowerShell trick above on a Windows one.

`diffRemoteWorldSurveys` compares two such listings — pure functions, no SSH client, no
network — and says what was added, changed, removed, or left alone. `remoteWorldChanged`
answers the yes/no question a scheduled render actually wants before it does anything else.
All three are exported from `main/remote/worldsource.ts` and `main/remote/index.js`, so a
render that only wants to know "is this worth rendering again" never has to fetch the world to
find out.

## Failure modes

| What happened                                                 | What is reported                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| the host never answers                                        | `unreachable`, the same code an unreachable remote-render target uses            |
| the host key is unknown                                       | `host-key-unknown`, with fingerprints to compare                                 |
| the host key has changed                                      | `host-key-changed`, refused, no button                                           |
| the account is refused                                        | `auth-refused` — this app never offers a password                                |
| the given path is not shaped like a path on the detected host | `invalid-target`, naming the grammar it expected                                 |
| a transfer is interrupted                                     | `transfer-failed`, with whatever `rsync` or `scp` said; nothing local is deleted |
| the person cancelled                                          | `cancelled`, which is not an error                                               |

## Security notes

- **No password, ever.** The SSH options this reuses make the client refuse one even when a
  host offers it — see [remote rendering](./remote-render.md#authentication-keys-only-never-a-password)
  for the exact flags. Authentication is an SSH agent or a named identity file; neither is
  ever read, copied or logged by this application.
- **Nothing is written to the remote host.** No staging directory, no PowerShell script left
  behind — `-EncodedCommand` runs the script and exits; nothing is saved there.
- **The remote path is validated in the grammar its own host actually uses**, not guessed from
  the string. A Windows-shaped path offered against a POSIX host, or the reverse, is refused
  before anything is sent, rather than silently reinterpreted.
- **The app's own `known_hosts`, never the person's.** Exactly the file remote rendering
  already writes, so trusting a host once covers both directions without touching the user's
  own SSH configuration.

## Verification

`design/packages/app/src/main/remote/worldsource.ts`, `windowsShell.ts`, and
`design/packages/app/src/main/worldsource/sshFetcher.ts` / `sshIpc.ts` have **64 main-process
tests**, all of them against fake SSH and process runners. The reachable wizard path adds
**15 focused UI/preload tests** (three renderer seam/likelihood tests, two mounted guided-flow
tests, and the existing ten preload channel tests):

| File                                   | What it proves                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `windowsShell.test.ts`                 | PowerShell single-quote escaping, Base64 round-trips, and that the encoded form contains no shell metacharacter                                                                                                                                                                                                                                            |
| `worldsource.test.ts`                  | host detection (POSIX, Windows, unknown), path grammar per host kind, the POSIX and PowerShell survey parsers, survey diffing, and the full fetch orchestration — an unreachable host, a host-key mismatch, a Windows host falling back to scp, a partial/interrupted transfer, permission denied, an invalid path for the detected host, and cancellation |
| `sshFetcher.test.ts`                   | id assignment, active-fetch tracking, and that cancelling aborts the signal the transfer is actually awaiting                                                                                                                                                                                                                                              |
| `sshIpc.test.ts`                       | the nine channels register and dispose exactly, no handler rejects, and a host key is only ever trusted by re-scanned fingerprint                                                                                                                                                                                                                          |
| `sshWorldSourceBridge.test.ts`         | the renderer resolves the real nested `window.worldlens.sshWorldSource` namespace only when all ten methods exist, and a survey needs both `level.dat` and a real region file before it is called a world                                                                                                                                                  |
| `SshWorldSourcePanel.test.ts`          | mounted unknown-key review, explicit trust, POSIX detection, survey, transfer events, local destination calculation and the final handoff into the ordinary wizard path                                                                                                                                                                                    |
| `preload/sshWorldSourceBridge.test.ts` | all nine invoke channels and the event listener keep the exact positional shape the main-process handlers read                                                                                                                                                                                                                                             |

Run them with `npx vitest run packages/app` from `design/`.

**Not yet run against a real host of either kind.** Every scenario above — including the
Windows detection and survey, and the scp fallback — is proven against fakes that answer
exactly as OpenSSH, PowerShell and `find` are documented to, not against a genuine Windows
OpenSSH server or a real Linux box. The connection, host-key and transfer _code paths_ are the
same ones `remote-render.md` already reports verified against a real Linux host; the
Windows-specific probe and survey scripts in `windowsShell.ts` have not had that same real-host
pass yet.

The desktop application registers this at startup (`startSshWorldSources()` in
`main/index.ts`) and the map wizard's World step now reaches it through
`SshWorldSourcePanel.vue`. The panel deliberately reuses the same saved-target editor and
Explorer-style remote browser as remote rendering: one list of SSH machines, actual directory
data, the same host-key trust store, and the same world-likelihood signals. An unknown key shows
the offered fingerprints and records only the exact one the person reviewed; a changed key stays
refused with no trust action. A surveyed and fetched folder rejoins the existing local-folder
inspection path instead of creating a second kind of wizard world.

The focused UI suite and a real production UI build prove that preload-to-renderer seam and the
mounted interactions. A cheap headless run also opened the built panel at 390 CSS pixels and
200% scale with zero horizontal overflow, viewport escapes, or clipped buttons. The real-host
limitation above still stands: neither a Linux nor Windows host has completed this whole path
through a packaged build yet.

## Related reading

- [Rendering on a remote host](./remote-render.md) — the other direction over the same SSH
  connection, host-key and transfer machinery.
- [Worlds from somebody else's release](./world-sources.md) — a world from a GitHub release
  instead of a machine you run yourself.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — where a scheduled render's
  change detection would use the cheap survey this feature exposes.
- [Renders that survive being interrupted](./resumable-renders.md) — the same "carry on, do
  not restart" promise, for a render on this computer rather than a fetch from one.
