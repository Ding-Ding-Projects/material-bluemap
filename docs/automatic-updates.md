# Automatic updates

The Windows installer has always been able to update this app, and until now the app never
asked it to. `design/packages/app/electron-builder.config.cjs` builds a Squirrel.Windows
target, and its own comment says why: Squirrel "also emits the RELEASES / .nupkg pair that
Electron's own autoUpdater consumes". Nothing consumed it. Every release shipped an update
mechanism that was never wired to anything, so the only way to move from one version to the
next was to notice a release existed and run the installer by hand.

This document covers the wiring, and three smaller closures that shipped in the same pass
and touch it: opening a folder the app wrote, keeping a tile tree out of OneDrive, and
putting a ceiling on the render JVM's memory. They share a page because they were built
together and because two of them are visible in the update flow — a render in progress is
what holds a restart, and the storage folder is one of the places a reveal is allowed to
open.

## Behaviour

### What happens, and when

| Moment | What the app does |
|---|---|
| 30 seconds after launch | Checks the feed. Delayed on purpose: an update check is the least urgent thing happening while the window, the embedded server and the render restore are all starting. |
| Every 6 hours after that | Checks again, unless an update is already staged. |
| After a failed check | Backs off — doubling from six hours, capped at a day. A machine offline for a week does not spend it making one DNS query every six hours. |
| Once an update is staged | Stops checking entirely. There is nothing left to discover; the installer is on disk and only the user's choice changes the situation. |
| **Check for updates** in settings | Checks now, whatever the schedule says. |

The download runs in the background and **the app never restarts itself**. Electron's
`autoUpdater` fetches and stages; installation happens only when the user presses **Restart
to install**.

### The banner

When an installer is downloaded, verified and staged, a persistent, non-blocking banner
appears (`design/packages/ui/src/components/update/UpdateBanner.vue`). It is modelled on
GitHub Desktop's: it sits in the layout rather than over it, never takes focus, never gates
anything, and stays until the user acts on it.

It names the exact version, links the release notes when the feed carried a link, and offers
**Restart to install** and **Later**.

That persistence is deliberate and is why this one message is a banner rather than a toast.
The project's rules put anything that merely *informs* in the notification corner, where it
auto-dismisses — and an offer that has to survive an hour of rendering so it can be taken at
a moment of the user's choosing cannot auto-dismiss. "Nothing new" and "the check failed"
still go to the notification corner and the settings row; only "ready to install" persists.

**Later is per version, and never permanent.** Dismissing writes that one version to
`material-bluemap.update.dismissed`, so the banner does not come back for it after a restart
— and the *next* release announces itself normally. The settings row carries **Show the
update banner again** so a dismissal is never a one-way door.

### A render in progress protects itself

A BlueMap render of a large world runs for hours. Quitting into an installer half way through
throws that time away with no route back to it, so a render is treated exactly as unsaved
work would be:

- while a render is running, **Restart to install** is disabled and the banner's body text
  changes to say why. A control that looks live and silently does nothing is
  indistinguishable from a broken one, so the copy moves as well as the button;
- the main process re-reads the render guard at the moment the button is pressed, not from
  the state the banner was drawn with, because a render can start in between;
- if the activity probe itself throws, the answer is "busy". Unknown must never be the
  reason an update installs over a render.

The refusal is a **value**, not an exception: `{ ok: false, code: "render-in-progress",
message: … }`. The staged update is untouched, so nothing is lost by trying.

### The visible states

The settings row (`UpdateStatusRow.vue`) always shows where things stand, and there is a
distinct state for each of: *nothing checked yet*, *checking*, *up to date*, *available*,
*downloading*, *ready*, *failed*, and *this build cannot update itself*.

`checking` is not a status — it is a flag laid over whatever is already known. The honest
thing to show while a check runs is "you are on 0.1.0, and I am looking", not a blank screen
that has forgotten what it knew a second ago. It also makes the next rule expressible:

**A staged update survives a later failure.** Once an installer is downloaded and verified,
it installs whether or not the next scheduled check reaches the server. Letting a network
blip roll `ready` back to `failed` would take a working update away from somebody who was
about to restart into it. The failure is still recorded and still shown — hiding it would be
a lie in the other direction.

### Language and tone

Every sentence goes through the three language modes and both funny levels
(`updateCopy.ts`). The split that keeps that safe is structural rather than a convention:

- **version numbers travel as `{version}` placeholders** and are interpolated after the level
  has chosen the sentence, so no level can reach one. "0.2.0 has finished downloading and is
  tapping its foot" still says `0.2.0`, exactly;
- **every action label lives in a fixed catalogue** with one string per language, and the
  resolver never consults a level for it. There is no code path through which a funny level
  can reach the word "Restart".

Failure copy is styled like everything else — the rule is voice-not-facts, not a carve-out
for serious categories — and every level of it still says that nothing was installed and
nothing changed. A test walks all five levels in both languages and asserts both properties.

## Configuration

| Variable | Effect |
|---|---|
| `MATERIAL_BLUEMAP_UPDATE_FEED` | Points the updater at a different feed. Must be `https`, or `http` on loopback for a test server. Checked before the packaging and platform gates, so the seam is testable on the machine it is written on. |
| `MATERIAL_BLUEMAP_UPDATE_TOKEN` | Sent as `Authorization: Bearer …` to a private feed. See the security section. |
| `MATERIAL_BLUEMAP_DISABLE_UPDATES` | Switches checking off entirely on a machine that manages its own installs. |

With no override, a packaged Windows build resolves
`https://update.electronjs.org/<owner>/<repo>/win32-<arch>/<version>`, which speaks
Squirrel.Windows natively and needs no API token and no rate limit.

Three states are **refusals with a reason**, not silence: not packaged, not Windows, and no
release repository configured. Each produces a sentence the settings row shows in place of a
check result, because "this build cannot update itself, and here is why" is actionable and a
button that spins forever is not.

## Failure modes

Every error the updater raises is classified once
(`design/packages/app/src/main/update/failure.ts`) into a code and a sentence written for a
person. `getaddrinfo ENOTFOUND` is accurate and useless; "the update server could not be
reached, the app will try again by itself" is not.

| Code | What it means | Retried automatically |
|---|---|---|
| `offline` | No route to the update server. | Yes |
| `feed-unavailable` | The server answered with something that is not a release list. | Yes |
| `invalid-signature` | The installer is not signed by the expected publisher. **Nothing was installed.** | **No** |
| `corrupt-asset` | The bytes that arrived are not the bytes the feed described. | Yes |
| `not-installed` | This copy was not installed by its installer, so there is no updater beside it. | No |
| `staging-failed` | The disk is full, or the app's folder is not writable. | Yes |
| `unknown` | Recognised as nothing in particular. The updater's own words travel as detail. | Yes |

The signature rule is ordered first, ahead of the corrupt-asset rule, because Squirrel's
messages overlap and misreporting a tampered installer as a flaky network is the one mistake
here with a security consequence. It is also the one failure marked *not* retryable:
downloading a bad file on a schedule forever is not resilience.

An `unknown` failure says so rather than guessing. A confident wrong diagnosis is worse than
an admission.

**Nothing is ever hidden behind a spinner.** A check that fails clears the checking flag in
the same step that records the failure, and a test asserts exactly that.

## Security considerations

- **The credential never leaves the main process.** The feed token is read from the
  environment, attached as a request header, and never placed in any value that crosses IPC.
  `describeFeed` exists for that reason: the interface is told the *address* updates come
  from and whether one is authenticated, never the token. A test serialises the whole state
  object and asserts the token does not appear in it, because a header that leaks into a
  state object is invisible until somebody pastes a screenshot into an issue.
- **The feed must be `https`.** A plain-`http` override is refused with the reason, because
  an update fetched over plaintext can be replaced in transit. Loopback is the one exception,
  so a local test feed needs no certificate.
- **A release-notes link is only used when it is `https`.** Anything else is dropped rather
  than handed to the shell.
- **Squirrel verifies the package.** A signature that does not verify is a hard stop, not a
  retry, and the copy says plainly that nothing was installed and nothing on the machine
  changed.

## Opening a folder the app wrote

The app writes rendered tiles, config folders, downloaded worlds and backup staging
directories, and offered no route to any of them: the honest answer to "where did my map go"
was a path in a settings row somebody had to copy and paste.

`files:reveal` (`design/packages/app/src/main/files/reveal.ts`) closes that, and it is an
**allowlist** rather than a traversal check. Refusing `..` alone would still permit
`C:\Windows\System32\cmd.exe`, which contains no traversal at all. The rule is the other way
round: the path must resolve to somewhere inside a directory this application owns — its map
storage folder, its config folder, its own data directory — and everything else is refused by
name, with the reason naming what *can* be opened.

Three properties are worth stating because each one is a real escape that does not look like
one:

- **Links are resolved before the comparison.** `<storage>\maps\evil` may be a junction to
  `C:\Windows`. Both the candidate and each root go through `realpath` first, so what is
  checked is the directory that will actually be opened.
- **Containment is by path segment, never by string prefix.** `C:\data\maps-evil` starts with
  every character of `C:\data\maps` and is a completely different directory.
- **A file is selected, never launched.** `showItemInFolder` opens the file manager with the
  item highlighted; `openPath` on a `.exe` would run it, and this channel must never be able
  to do that. Only directories are ever passed to `openPath`.

The roots are read fresh on every call, because the map storage directory moves while the app
is running and a captured list would keep allowing the folder somebody moved away from.

## Keeping a tile tree out of OneDrive

A render of a mature world is hundreds of thousands of small `.png` files totalling tens of
gigabytes. Written into a synced folder, every one of them is a file the sync client uploads,
versions and re-downloads elsewhere: the render crawls, the cloud quota disappears overnight,
and the first the person hears of it is a full-drive warning.

Windows makes this easy to walk into. "Back up your folders" moves the real `Documents` to
`%USERPROFILE%\OneDrive\Documents` and leaves the shell folder pointing at the moved copy, so
an app that politely asks the operating system for Documents is handed a synced folder without
either side mentioning it.

`resolveDocumentsDirectory` (`design/packages/app/src/main/files/documents.ts`) notices and
redirects to the real local `Documents` — and **explains**, rather than doing it silently. The
resolution carries a sentence naming what was found and where the maps will go instead, the
setting shows it, and the person can override it. An app that quietly writes somewhere other
than where the user was told is a worse problem than the one it was avoiding.

Two guards:

- **A user actually named `OneDrive`.** `C:\Users\OneDrive\Documents` is that person's real,
  local Documents folder; a naive "does the path contain OneDrive" check sends them out of it,
  into itself, forever. Only the path segments *below* the home directory are considered, so
  the profile's own name is never one of them.
- **A local `Documents` that is not there.** The redirect is only made when the target
  directory exists. Otherwise the reported path is kept and the explanation says the app is
  writing into a synced folder, because moving somebody's maps into a directory that does not
  exist turns a performance problem into a failed render.

The idea comes from BlueMapGUI, which has the same guard. Nothing was copied from it — that
repository carries no licence, so all rights are reserved and only the observation travels.
See [the parity audit](./bluemapgui-parity.md).

## A memory ceiling for the render JVM

`render/orchestrator.ts` has always forwarded `jvmArgs` to `render/runner.ts`, which places
them before `-jar` exactly where a JVM wants them — and nothing ever passed any. The only
caller was a unit test asserting `-Xmx4G` reached the argument list. The plumbing shipped, the
setting did not, and every render this app has run used whatever heap the JVM picked for
itself.

That default is a quarter of physical memory on most machines and BlueMap will use all of it.
A render with an unbounded heap is the classic "my whole computer froze" report: the JVM takes
the memory, the operating system starts swapping, and everything else on the machine stops
responding while a background render finishes.

`RenderMemoryStore` (`design/packages/app/src/main/files/renderMemory.ts`) is the setting.

- **`-Xmx`, not `-XX:MaxRAM`.** They are not the same control. `-XX:MaxRAM` tells the JVM how
  much memory to *pretend* the machine has when it derives its own defaults; the heap is then
  a fraction of that and may still grow past it. `-Xmx` is the hard ceiling, and a render that
  needs more fails with an `OutOfMemoryError` rather than taking the machine down with it. A
  failed render somebody can retry with a bigger number is a far better outcome than a frozen
  desktop.
- **The default is derived from the machine**: about half of physical memory, rounded to 256
  MB, never above 8 GB by the app's own choice, and never so much that less than 2 GB is left
  for everything else. The floor is 1 GB, below which BlueMap does not fail gracefully — it
  thrashes the collector for hours and then fails anyway.
- **Units are stated both ways** — `4096 MB (4.0 GB)` — so 4096 is never mistaken for 4, and
  the explanation beside the control says what the number does and what to do when a render
  runs out or the machine struggles.
- **A stored number the machine can no longer honour falls back to automatic.** A profile
  copied from a bigger machine, or memory removed, would otherwise hand a JVM a heap it
  refuses to start with — which looks exactly like a broken render.
- **A settings file that cannot be written never fails a render.** The choice applies for the
  session and the write failure is swallowed rather than raised into a render somebody
  started.

## Verification

Everything above is covered by unit tests that need **no update server, no Squirrel install,
no OneDrive and no particular amount of RAM**. Electron's `autoUpdater`, the shell, the file
system, the clock, the timers, the machine's memory and the render-activity probe are all
injected seams.

| Area | Where |
|---|---|
| Failure classification, every rule and the ordering between them | `main/update/failure.test.ts` |
| Feed resolution, the three refusals, the https rule, the token redaction | `main/update/feed.test.ts` |
| The state machine, including "ready survives a failure" and "unsupported is terminal" | `main/update/state.test.ts` |
| The schedule: interval, back-off, cap, floor, and stopping once staged | `main/update/schedule.test.ts` |
| No update, available, downloading, ready, restart declined, offline, invalid signature, corrupt asset, cancellation, and a render in progress | `main/update/controller.test.ts` |
| The channels, the push, and that no credential crosses them | `main/update/ipc.test.ts` |
| The OneDrive redirect and the user-called-OneDrive guard | `main/files/documents.test.ts` |
| The reveal allowlist: prefix siblings, links, relative paths, missing roots, files versus folders | `main/files/reveal.test.ts` |
| The memory ceiling: recommendation, bounds, persistence, corruption, and the arguments produced | `main/files/renderMemory.test.ts` |
| The banner and the settings row as pure models | `ui/components/update/updateModel.test.ts` |
| Three language modes, five levels each, and that no level touches a version or a button | `ui/components/update/updateCopy.test.ts` |
| The live controller and the bridge probe | `ui/components/update/useUpdates.test.ts` |
| The banner mounted: held Restart, dismissal, bilingual `lang`, exact version at level 5 | `ui/components/update/UpdateBanner.test.ts` |

**Not verified by running it.** No packaged build has been installed and updated end to end
by this work, so the claim that a released `Setup.exe` will find and install its successor
rests on the feed being correct and Squirrel behaving as documented, not on somebody having
watched it happen. That check needs two consecutive signed releases and is the first thing to
do once there are two.

## Related

- [Feature parity with BlueMapGUI](./bluemapgui-parity.md) — the audit that named these four gaps
- [Language modes and funny levels](./language-and-tone.md) — the voice-not-facts rule the update copy follows
- [Notification centre](./notification-centre.md) — where everything that only informs goes instead of the banner
- [Renders that survive being interrupted](./resumable-renders.md) — the other place a render in flight is protected
