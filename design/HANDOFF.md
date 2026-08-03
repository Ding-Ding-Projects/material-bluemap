# Handoff

## State (2026-08-03, after decisions D17 and D18)

Read in this order: `docs/decisions.md` (D17 and D18 changed which engine renders),
`ROADMAP.md` (phase status, including the out-of-alphabet Phase J), then `../plan.md` and
its Amendment 1 at the end. The plan's original text is intact; the statements D17 and D18
falsified are marked in place rather than deleted, so anything unmarked in the plan is still
current.

Everything lives under `design/` (pnpm monorepo, 12 packages) except `plan.md`, the
top-level repository metadata, `scripts/`, `tools/` and the `vendor/BlueMap` reference
submodule. Reference sources: `vendor/BlueMap` @ `e664c1a` + nested `api/` submodule +
fetched tag `v0.10.3-mc1.12` (legacy 1.12 reference; re-extract single files with
`git show v0.10.3-mc1.12:<path>`).

### The one thing that changed everything

Local rendering runs **upstream BlueMap's Java engine**, built from the vendored source and
driven by the app. The TypeScript mesher in `packages/engine` keeps being written and takes
over when it passes the Phase D gate: decompressed PRBM bytes identical to Java's, lowres
PNGs identical pixel for pixel, on every fixture. Nothing switches silently; every render
writes `render.json` naming the engine that produced it.

`vendor/BlueMap` is therefore a **build input** now, not only a reading reference.

## What is proven

### The Java render path, by hand, on one Windows machine

| Step | Result |
|---|---|
| `./gradlew :cli:shadowJar` | `implementations/cli/build/libs/cli-5.22-27-shadow.jar`, 6.4 MB, 34s warm |
| Gradle project paths | bare: `:cli`, `:fabric`, `:forge`, `:neoforge`, `:paper`, `:spigot`, `:sponge`. **Not** `:implementations:cli` |
| Toolchain | host Temurin 25.0.3; upstream pins `JavaLanguageVersion.of(25)` |
| Gradle home | `GRADLE_USER_HOME` points at `tools/oracle/.gradle`, gitignored, already over a gigabyte. Nothing machine-wide is touched |
| `java -jar <jar> -c <configDir>` | writes `core.conf`, `webapp.conf`, `webserver.conf`, `maps/{overworld,nether,end}.conf`, `storages/{file,sql}.conf` |
| `java -jar <jar> -c <configDir> -r -g` | a generated 1000x1000 world rendered to **961 hires PRBM tiles** plus lowres PNGs and `textures.json.gz`, in 80 seconds |
| Progress format | `[11:28:40 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)`, ending `Your maps are now all up-to-date!` |

**Two sharp edges, both found the expensive way.** The CLI resolves its storage root and
data folder relative to the **working directory**, not the config folder: running it from
the repository root dumped 47 MB of tiles into `/web` and a 38 MB Mojang client jar into
`/data` at the top of the tree. Always pass absolute paths and set the working directory
deliberately; `render/config.ts` and `render/workspace.ts` both do, independently. And
rendering requires `accept-download: true` in `core.conf`, which is Mojang EULA acceptance,
which is why consent is a persisted first-class decision rather than a config default.

### The test suite

`npx vitest run` from `design/`, run 2026-08-03: **143 files, 2157 passed, 2 skipped**.

| Package | Tests | Package | Tests |
|---|---|---|---|
| `engine` | 882 (1 skipped) | `app` | 286 |
| `ui` | 311 | `shared` | 187 |
| `config` | 175 (1 skipped) | `site` | 107 |
| `render-actions` | 79 | `nbt` | 56 |
| `viewer` | 52 | `worldgen` | 19 |
| `server` | 5 | `cli` | none yet |

Green means the ported code does what its own tests say. It is not parity with upstream;
that is what the phase exit criteria in `ROADMAP.md` are for.

### Earlier phases, unchanged by D17

- **Phase 0** — scaffold, CI (`.github/workflows/ci.yml`), LICENSE/NOTICE, porting
  conventions (`docs/porting-conventions.md`), deviations log (`docs/deviations.md`).
- **Phase A** — `viewer`: all 65 upstream webapp JS files in strict TS (DOMPurify'd markers,
  CSP-safe popups, gated remote injection, `dataRoot` + `dispose()` port additions).
  `server`: token-gated localhost HTTP server + static handler + remote reverse proxy,
  live-verified against `https://bluecolored.de/bluemap`. `ui`: Vuetify MD3 shell, profile
  manager, 30 upstream locales. `app`: hardened Electron (sandbox/CSP/nav-lock), embedded
  server, typed preload bridge.
- **Phase B** — `shared` and `nbt` complete; `engine` compression registry
  (none/gzip/deflate/zstd/lz4-java block framing), full world model, MCA layer with decoders
  `Chunk_1_12/1_13/1_15/1_16/1_18` by DataVersion, legacy `BlockIdMapper` + 15 neighbour
  extensions from `v0.10.3-mc1.12`, MCAWorld/ChunkGrid/chokidar watch.
  **`packages/engine/test/world-e2e.test.ts` is the proof**: it builds synthetic 1.18 and
  1.12.2 worlds byte by byte and asserts exact decoding, including legacy fence-connection
  reconstruction.
- **Phase C** — every file in upstream's `resources` package ported and unit tested. The
  three exit criteria have **not** run, so "ported" is the honest word and "done" is not.
  The list is in `ROADMAP.md`.

## What is built but not proven

Say this plainly to whoever asks; none of it has a green check yet.

- **The Java render path has only ever been driven by hand, on Windows.** Not in CI, not on
  macOS, not on Linux. The 961-tile render came from invoking the jar directly, not from the
  app's orchestrator. Reproducing it end to end through `startRender` and opening the result
  in the viewer is the obvious next piece of evidence, and it does not exist yet.
- **JDK provisioning is unit tested against fakes only.** No real Temurin archive has been
  resolved, downloaded, verified and extracted by this code on a machine with no JDK.
- **Only `:cli:shadowJar` has been built by hand.** A reusable CI workflow that builds all
  seven and attaches them to the release is on the branch
  (`.github/workflows/build-jars.yml`, called from `ci.yml`), but this entry cannot vouch
  for a green run of it, and no adapter jar has been loaded by a real Minecraft server.
- **Phase C's three exit criteria.** `textures.json` semantic equality against Java's, a
  1.12.2 jar through the legacy compat path, and the live `minecraft:grass_block`
  resolution.
- **The mesher's parity gate.** Phase D is in flight; nothing about it is verified.

## In flight

Concurrent workflows are writing in these areas. Do not edit another workflow's files;
report the markup or the seam you need and let the orchestrator apply it.

| Area | Files | State |
|---|---|---|
| Phase D mesher | `packages/engine/src/map/hires/{block,entity}/`, `TileModelView.ts`, `map/mask/`, `map/TextureGallery.ts` | Being written. Expect these to move under you |
| Viewer UI | `packages/ui/src/components/{controlbar,controls,menu,markers}/`, `ui/src/App.vue`, `components/MapView.vue`, `styles/global.scss` | Owned by a separate workflow |
| Options GUI | `packages/ui/src/components/config/`, backed by `packages/config` | Landed and tested; Phase F continues |
| First-run and consent surfaces | `packages/ui/src/components/setup/` | Landed and tested |
| Java toolchain + render path | `packages/app/src/main/java/`, `packages/app/src/main/render/`, `consent.ts` | Landed and tested |
| Documentation site | `packages/site/` | Landed; articles updated per surface |

## Wave discipline (this is process, and it is load-bearing)

- **Session limits kill big fan-outs.** An eight-agent workflow died mid-run. The pattern
  that works is **waves of three or four agents, commit and push after every wave**, and a
  WIP commit to salvage partial files if a wave dies.
- **Install dependencies before launching a wave**, from the orchestrator, never from the
  agents. Concurrent `pnpm install` races the lockfile.
- **Give every agent a written ownership list, and name what it must not touch.** Two agents
  editing one file is how a wave's output is lost.
- **Agents do not commit, push or check out.** They create and edit files and report the
  verification output they actually ran. The orchestrator commits.
- **Every agent verifies its own package before reporting**, and pastes the output:

  ```sh
  cd design && npx tsc -p packages/<pkg>/tsconfig.json --noEmit
  cd design && npx eslint packages/<pkg>
  cd design && npx vitest run packages/<pkg>
  ```

- **Deviations discipline**: every intentional difference from upstream goes in
  `docs/deviations.md`.

## Scope beyond the port (user-confirmed, do not drop)

Full options GUI (every BlueMap setting, no config files) · Docker hosting GUI (dockerode) ·
standalone server CLI + Dockerfile · MC 1.12.2 to 26.x · local live players (playerdata NBT +
RCON/Query) · desktop QoL (measurement, waypoints, screenshot gallery, scheduled renders,
multi-server dashboard, update checker) · nothing deferred (JS addon system, marker editor,
static export, three.js upgrade all in scope) · the five global product contracts in
`docs/contracts/` (regex builder on every search bar, full browser-style tabs, per-element
appearance editors + infinite colour picker, EN/HK-Cantonese/bilingual + funny-level,
super-confirmation for destructive actions) · copy rules (no em-dashes in UI strings, local
fonts, no AI-tell styling).

Since D18, add: the six Minecraft-server platform adapters and the Java addon loader ship as
release artifacts. Plan exclusions S2 and S4 are withdrawn; S1 and S3 stand.

## Verify from clean

```sh
cd design && pnpm install && pnpm build && pnpm lint && pnpm test
npx vitest run packages/engine/test/world-e2e.test.ts   # the Phase B acceptance proof
npx vitest run packages/worldgen                        # generates a world and reads it back
npx vitest run packages/app/src/main/consent.test.ts    # the consent record's failure modes
```

Building the Java engine, which is what local rendering needs:

```sh
cd vendor/BlueMap
GRADLE_USER_HOME=../../tools/oracle/.gradle ./gradlew :cli:shadowJar
# -> implementations/cli/build/libs/cli-<version>-shadow.jar
```

Rendering with it by hand, which is how the 961-tile figure above was obtained. Note the
working directory: it is the sharp edge described earlier, not a stylistic preference.

```sh
cd <an empty scratch directory>
java -jar <absolute path to cli-shadow.jar> -c <absolute config dir>   # writes the config set
# set accept-download: true in core.conf, and absolute paths everywhere
java -jar <absolute path to cli-shadow.jar> -c <absolute config dir> -r -g
```

---

## Update, later on 2026-08-03

Everything above still holds. What follows is what changed after it was written.

### The packaged app never launched, and nothing said so

The installer shipped **without the renderer**. `electron-builder` packaged only the app
package's own `dist/` and `package.json`; the UI is a separate workspace package, so `files`
could not reach it and the bundle was never in the installer. `resolveUiRoot` checked both
candidates, found no `index.html`, and threw.

That throw happened inside `createWindow`, invoked as `void createWindow()`. The rejection
went nowhere: no log, no dialog, exit code 0. A process with no window, indistinguishable
from the app failing to start.

Fixed by shipping the bundle through `extraResources` into `resources/ui`, which is exactly
where the second candidate already looked, and by giving startup failures an error dialog and
a non-zero exit. **Verified by installing the real Squirrel installer**, not by reasoning: it
lands in `%LOCALAPPDATA%\MaterialBlueMap` and opens a window titled
`BlueMap - Overworld (Default Settings)`. The capture is `docs/screenshots/installed-app-1920x1200.png`.

**Every release from `build.22` to `build.63` predates that fix and installs a non-launching
app.** Do not treat any of them as a working artifact.

The lesson worth keeping: the app was fine from source the whole time, which is why nothing
caught it. Tests, the screenshot harness and every manual launch all used the dev tree, where
the UI resolves through a relative path. Only the installer was broken, and only the installer
is what a user runs.

### The interface is now a real port rather than a shell

All 24 upstream webapp components are ported to Material Design 3: compass, position input,
controls switch, day/night, zoom buttons, mobile free-flight, the maps menu, the settings
menu and the whole marker tree. `packages/ui` went from 3 components and 682 lines to 55 files
and 8,111. Upstream's i18n keys are kept, so the 30 bundled locales work.

The map used to be painted over the app bar and drawer, so every control was in the DOM and
none was visible. Fixed in the same pass.

### Rendering somebody else's world is no longer how screenshots are taken

CI generates a 1000x1000 world with a different seed each push, renders it with the Java
engine built in the same run, and serves that to the harness. The harness fails the job if the
app reaches the public internet during capture. Closes the issue about leaning on
`bluecolored.de`, whose bandwidth every push was consuming.

### Rendering in GitHub Actions, including worlds too big for one job

`.github/workflows/render-world.yml` plus `packages/render-actions`. Two traps were found by
measuring rather than reasoning, and both would have shipped silently wrong maps:

- **Shard cuts must land on block 32k+2, not on region boundaries**, because the hires grid is
  `Grid(32, 2)`. Cutting at 512 lands inside tile 15; a two-shard render produced 31 tiles
  twice, in differing versions, with nothing to indicate it.
- **Shards erase each other.** `unrender` does not skip out-of-mask tiles; it deletes them and
  writes transparent black at height zero with the same alpha as real terrain. 509,409 lod-1
  pixels in a two-shard render were terrain in one shard and erasure in the other, so
  first-writer-wins would have kept the erasures. The merge ranks terrain above erasure above
  untouched, and lod 2 upward are rebuilt rather than unioned.

Proven: 961 of 961 hires tiles byte-identical to an unsharded reference, zero differences
across 6,024,024 lowres pixels, for two-shard and four-shard splits.

### Two tests that only passed on the author's machine

Both cost a red build and both are the same shape.

- The HOCON locale baseline encoded the line endings of the machine that recorded it. The repo
  checks out `text=auto`, so `.conf` files are CRLF on Windows and LF on Linux, and the parser
  preserves line endings inside multi-line strings, correctly. 27 of 30 locales failed in CI.
- `jars.test.ts` built its fixture root with `join("C:", "repo")`, which looks absolute and is
  not on POSIX, so `resolve()` prefixed the runner's working directory and the upward walk
  never found its anchor.

CI running on a platform nobody develops on is the only reason either surfaced. When adding a
test that touches paths or file contents, assume it will run somewhere else.

### Dependencies install themselves

`node scripts/bootstrap.mjs` installs and **verifies** node dependencies, the Electron binary,
a JDK matching upstream's toolchain, Gradle, the seven BlueMap jars and the Playwright
browsers. It verifies rather than checks for presence, which is not pedantry: Electron here
had a `dist/` holding only `locales/`, and its own installer kept exiting 0 because the folder
existed. The archive was fine and verified against Electron's published checksum; the
*extractor* was silently dying partway through, so bootstrap extracts it another way.

### In flight at the time of writing

- **Phase D**, four agents: the tile model and byte-exact PRBM writer, the block renderers,
  entity plus lowres plus renderstate plus masks, and `BmMap` plus file storage plus the
  oracle harness. The gate is unchanged and now has a real oracle, because D17 made upstream's
  engine a build input: `tools/oracle/` renders the same generated world both ways and
  compares tiles byte for byte.
- **Split release archives**: a GitHub release asset is capped at 2 GB, so large worlds and
  rendered maps ship as 1.7 GB parts with per-part and whole-file SHA-256, and the GUI
  downloads and rejoins them with resume.

### Still not done

The two agents killed by session limits in the mega wave left the planning-document refresh
(landed later) and the test-world CI job (landed later). What genuinely remains: Phases E
through I, the Phase C exit criteria, and the Phase J items listed above as unproven. See
`ROADMAP.md`, which is the source of truth for status.

---

## Update, end of 2026-08-03

### The options GUI was built and unreachable

`App.vue` mounted neither the config screens nor the first-run setup. `ConfigScreen`,
`MapsScreen`, `StoragesScreen`, `RunScreen` and `FirstRunSetup` all existed, all had tests, and
nothing routed to them. A fresh install showed a centred grey line reading "No map loaded." and
one floating button, with no way to create a map, render one, or reach any setting.

The backend was complete the whole time: `startRender`, live progress, cancel, resume, storage
directory, downloads, sign-in. None of it was wired to a button.

This is the same failure as the installer that shipped without its renderer, and worth stating
as a pattern rather than an incident: **green tests over something no user can reach**. Both
passed everything and neither worked. A test suite proves a unit behaves; it does not prove the
product has a door.

### Three silent failures, all found by using the app rather than testing it

- **The installer did nothing.** electron-builder took its version from `package.json`, which
  never changed, so every release produced `app-0.1.0` and Squirrel correctly declined to install
  a version already present. No error. Each build is now stamped `0.1.<run number>`.
- **Copying from the map did nothing.** The viewer uses `navigator.clipboard`, and the permission
  handler allowed only pointer lock and fullscreen. Inconsistent as well as broken: the app
  already grants clipboard writes through IPC, so only the web API was shut.
- **A fresh install contacted a third party.** The public BlueMap demo was the *active* profile,
  so every launch of every copy fetched from a machine somebody else pays for before being asked.
  The offline guard in the capture harness caught it. It is still listed, one click away, no
  longer opened for you.

### The viewer still looked like upstream from the inside

`packages/ui/src/styles/markers.scss` is 179 lines with zero uses of `--md-sys-color-*`. The
chrome around the map was ported to Material Design; the POI labels, popups and player name tags
rendered inside it were not. Being rebuilt, keeping every `bm-*` class name exactly, because the
viewer's TypeScript queries that DOM and a tidier name would break markers silently.

### Delivery infrastructure the plan never described

Sign-in (OAuth device flow), private-world rendering on public runners, rendering in GitHub
Actions with sequential waves past the 256-job matrix cap, resumable renders, 1.7 GB split
release archives with in-app download and rejoin, and a test-world generator. See `ROADMAP.md`.

### Where Phase D actually stands

The mesher is ported and PRBM output is byte-identical to the Java writer **at the unit level**,
proven by building models with both out of the same jar. That is not the gate. The gate is a
fully rendered world compared end to end, and `tools/oracle/` exists to run it. Until it runs
green, Phase D is ported and not done, and no test here is named after a comparison it did not
make.

Four numeric findings from that work are worth keeping, because each was a byte:

- `Math.toRadians` is not `angdeg / 180.0 * PI`. JDK 9 made it a single multiply, and the two
  differ by an ulp at ordinary model rotations.
- Float intermediates round per operator. Accumulating in double and narrowing once is a
  different number.
- A cast to int saturates where a bitwise or wraps: a degenerate face writes `0xFF`, not `0x00`.
- `MatrixM3f` and `MatrixM4f` used `Math.sin`/`Math.cos` and double arithmetic where upstream
  uses flow-math's quantized table in float. `rotateYXZ` bakes every rotated model, so this was
  wrong for every rotated block; 30 of 52 liquid uv values differed.

### Tests that only pass where they were written

Three red builds came from this shape: a locale baseline that captured one machine's line
endings, a repository root built with `join("C:", "repo")` which is not absolute on POSIX, and
JDK discovery fixtures built with the native `join` while passing `"win32"`. The last one was a
real implementation bug as well: functions that take a `platform` argument were using node's
native `join` and `delimiter`, so a Windows PATH split through its drive letters.

CI running on a platform nobody develops on is the only reason any of them surfaced.

---

## Update, later still on 2026-08-03 — the shell, and three things that were dead

### Scope: this product is Windows only

Stated by the user. There is no macOS or Linux desktop target: Squirrel.Windows is the
installer and the only packaged artifact. CI already reflected this — the installer job is the
sole `windows-latest` runner and everything else is `ubuntu-latest` — so nothing had to be
removed.

**Cross-platform correctness still matters, for a different reason.** Lint, build and test run
on `ubuntu-latest`, so pure modules must behave on Linux even though the product never ships
there. That is what caught the `platform`-argument path bug recorded above, and it is worth not
"simplifying" away on the grounds that the app is Windows-only.

### The door was still missing

The previous entry named the pattern — *green tests over something no user can reach* — and
then the fix for it did not land: the wizard was written, tested at 87 tests, and `App.vue` was
never touched. A workflow reported success with one of its two agents having returned nothing.
**A partially-failed fan-out reads exactly like a completed one unless the output is checked
against the file system**, which is now the second time that has cost a session.

`App.vue` now mounts, in this order: the Material title bar, the map view, the viewer chrome
*only when there is a map*, the world wizard when there is not, first-run setup, and the
settings surface. What was one grey line reading "No map loaded." is the screen that makes a
map.

### Locally rendered maps are profiles

Rather than a second code path, a finished render becomes an entry in the same list a remote
server uses: `ServerProfile` grew an optional `dataRoot`, which `LocalMapHandler` already serves
at `/local/{renderId}`. The viewer needs no idea which kind it is looking at, and switching,
persistence and the map list are reused rather than reimplemented.

Two details that are load-bearing rather than cosmetic:

- **Local profiles are excluded from `syncProfiles`.** That call registers a *remote proxy*
  target; registering a local map would hand it an empty base URL to forward to.
- **The list shows which kind each entry is.** A local map has no URL, so it would have rendered
  a blank subtitle — and two entries whose only visible difference is that one has an empty
  second row read as one of them being broken.

### The preload was the missing half of three finished features

Each of these had a complete main-process implementation and no way for the renderer to reach
it. This is the same shape as the unreachable options GUI, one layer lower down:

| Feature | Main process | Preload | Consequence |
|---|---|---|---|
| Window buttons | four `window:*` handlers + a `maximizedChanged` push | *nothing* | frameless window with no minimise or close — <kbd>Alt</kbd>+<kbd>F4</kbd> was the only exit |
| World folder check | — | *nothing* | wizard could not tell a world from any other folder |
| The map's 92 settings | `mapConf()` wrote 6 keys | no field to carry the rest | 86 settings collected by the wizard and silently discarded |

The third is the worst of the three, because the interface *said* it had applied them. The
request type now carries the whole `maps/<id>.conf` body as text, and the main process overrides
only the structural keys (`world`, `dimension`, `storage`) — a render whose storage points
somewhere the app does not serve produces tiles nobody can see.

### `Render world` was undispatchable, and had been all along

The workflow never appeared in the Actions list and `gh workflow run` reported it as not found.
Its only symptom was a zero-second "workflow file issue" failure hung on unrelated pushes. The
whole Actions rendering path — sequential waves, resumable shards, tree merges, everything in
`docs/render-in-actions.md` — was unreachable, and had never worked once.

**The cause was a single expression:** `${{ fromJSON(needs.plan.outputs.group-count) - 1 }}`.
GitHub's expression language has **no arithmetic operators** — only comparison and logic — so
`- 1` is a parse error, and a parse error anywhere in the file stops the *whole workflow* from
being registered. The value now crosses into the step as an env var and bash does the
subtraction.

> **I got this wrong first, and the wrong answer was plausible.** I saw the file had twelve
> `workflow_dispatch` inputs against a documented cap of ten, concluded that was the cause,
> merged the three location fields into one, committed it, pushed — and the run failed in zero
> seconds exactly as before. The input count was over the documented limit and reducing it was
> defensible, but it was **not** what broke the file, and I had asserted that it was.
>
> What found the real cause was `actionlint`, in one line, immediately. `yaml.safe_load()` had
> said the file was fine, because it *was* fine as YAML — the error was one level up, in the
> expression language embedded inside a string. **A YAML file that parses is not a workflow that
> registers**, and neither is one that a careful reading makes sense of.

`actionlint` now runs in CI over every workflow, because this class of error is invisible
locally and its only production symptom is a feature that quietly does not exist.

The `world` field consolidation is kept: for `release-asset` it accepts `tag/glob`, split on the
**last** slash, because a release asset's file name cannot contain one and a tag like
`release/1.4` can.

### `registerIpc()` could crash the app on reopen

`ipcMain.handle` throws on a channel that already has a handler, and `registerIpc()` is called
from `createWindow()`, which the `activate` path calls again when no windows are left. The three
stateful subsystems each guard against this; this function did not. Unreachable on Windows, and
fixed anyway — a function whose safety depends on a platform detail held nowhere near it is a
trap for whoever reads it next.

Found by a subagent reporting it as out-of-scope rather than fixing it silently, which is the
behaviour worth keeping.

### The viewer's own surfaces, and the landing page

`markers.scss` went from 179 lines with zero `--md-sys-color-*` uses to ~470 with no literal
colour but M3's own shadow token. POI labels, popups and player name tags are now opaque MD3
cards; the copy-to-clipboard groups became real `<button>`s with screen-reader text, reachable
by keyboard, and popups no longer dismiss on <kbd>Tab</kbd>. Verified against the **built**
artifact in headless Chromium across 36 viewport/theme/motion combinations: zero page errors,
worst-case text contrast 8.06:1.

The landing page had **no stylesheet at all** — every `mb-*` class landed on an unstyled
element, which is most of why it read as a stub. It now has one, plus honesty guards in the
content tests: no feature card may claim more than the article behind it, and exactly one engine
may be marked as running.

### The settings surface, and an honest empty state that is about to become real

`AppSettings` is mounted and carries the four anchors a failed render points at. Three notes on
what is real in it and what is not, because the distinction is the point:

- **Mojang consent** mounts the *existing* `ConsentSettingsRow` rather than a copy of it.
- **The storage folder** validates and writes, asking the bridge *before* the local store so a
  refusal leaves neither side changed.
- **The Java runtime** says plainly that this build cannot read it. `discoverJava()` exists and
  is tested; there was simply no IPC handler and no preload method. The honest empty state was
  the right answer over a fabricated version number — and `settingsBridge.ts` already mirrors the
  exact shape (`javaRuntime(): Promise<JavaDiscovery>`, feature-detected, rendering written and
  tested), so closing it is one handler plus one preload line. That wire is in flight.
- **The world folder** is per-map, not global. The section says so instead of rendering a control
  that would change nothing.

### 69 messages were rendering with the value missing

Found while building the settings surface, and it is worth stating carefully because **every
test passed the whole time**.

This codebase's fallback idiom is `t("some.key", "Rendered on: {engine}.")`, used because the
locale files are upstream's and a shell-only key often has no entry. Interpolation was then done
with `.replace("{engine}", value)`. That does not work:

```
broken idiom -> "The most recent render ran on: ."      // the value is gone
named-args   -> "The most recent render ran on: BlueMap 5.22."
```

vue-i18n compiles the **default message** as a message format too, so it consumes `{engine}`
before `.replace` ever runs. The correct call is the three-argument form,
`t(key, { engine: value }, fallback)`.

**69 call sites across 22 files** — 12 files in `components/config`, 7 in `components/world`,
3 in `components/menu`. These are validation errors, render failure reasons, chunk counts,
durations and file paths: the messages where a missing value turns *"Storage 'sql' is already
defined"* into *"Storage '' is already defined"*, and a render failure into one that names
nothing.

Nothing caught it because **nothing ever asserted the rendered text of a fallback message**. A
suite that mounts no component and reads no rendered string cannot see this class of bug at all;
this repository had 187 test files and not one of them mounted a component until now. A guard
is being added with the fix, and it has to fail against the pre-fix tree to count.

### Still not done

- **Phase D's gate.** Unchanged: unit-level PRBM byte-identity is not a rendered world compared
  end to end. `tools/oracle/` exists to run it and has not been run green.
- **Phase C exit criteria**, and Phases E, G, H, I.
- **The remaining product contracts** — issues #6 through #13: the regex builder wired to every
  search bar, tabs, per-element appearance editors, the super-confirmation gate, language modes
  and funny-level sliders, the command palette, the changelog viewer, the notification centre.
- **A day/night toggle logo and settings logos**, asked for and never started.
- **No screenshot of the running window.** Issue #5 stays open for exactly this: the title bar
  has lint, types, 13 unit tests and a clean build behind it, and no capture of the real
  artifact. Claiming a visible fix without showing it is the gap this repository keeps finding.

### In flight at the time of writing

A workflow is fixing the 69 call sites (one agent per subsystem), wiring the Java runtime
bridge, and building the regression guard, with three adversarial verifiers checking that no
message changed meaning, that no site was missed, and that the guard actually fails on a
deliberate reintroduction. Its result is not in this document yet, and nothing here claims it
landed.
