# Handoff

## Plain-language summary (start here)

This section is written in short, plain sentences on purpose. It defines every term it
uses. Read it first. The rest of this document is a chronological log written for people
who were there; this section is for anyone who was not, including a small language model
with no other context.

### What this project is

Material BlueMap is a Windows desktop application. It shows 3D maps of Minecraft worlds.
It is a TypeScript rewrite ("port") of an existing Java program called BlueMap. The
original Java source code is kept in this repository at `vendor/BlueMap` as a git
submodule. The port must behave exactly like the original, down to the byte, where the
document says so.

### Glossary

| Term | Meaning |
|---|---|
| **The port** | Rewriting BlueMap's Java code as TypeScript, file by file |
| **`design/`** | The folder holding all the TypeScript code, as a pnpm monorepo of 12 packages |
| **The app** | The Electron desktop application (`design/packages/app` is the main process, `design/packages/ui` is the interface) |
| **The engine / the mesher** | `design/packages/engine`. Turns Minecraft world files into 3D map tiles. This is the largest and hardest part of the port |
| **Hires tile** | A 3D mesh file covering a small square of the world. Written in a binary format called **PRBM**, then gzipped. The file name looks like `tiles/0/x3/z7.prbm.gz` |
| **Lowres tile** | A PNG image used when the camera is far away. Lower level of detail |
| **`textures.json`** | A list of every block texture the map uses. Hires tiles refer to textures by their position (index) in this list |
| **Phase D** | The project phase that ports the mesher. Phases are named A through J; their status is in `ROADMAP.md` |
| **The gate** | Phase D's exit test: a whole world rendered by both engines must come out byte-identical (PRBM bytes equal, PNG pixels equal) |
| **The oracle** | `tools/oracle/compare.mjs`. Renders one generated world twice (Java engine, then TypeScript engine) and reports every byte that differs. This is how the gate is measured |
| **D17, D18** | Numbered project decisions, recorded in `design/docs/decisions.md`. D17: the app ships and uses the original Java engine until the TypeScript mesher passes the gate. D18: the six Minecraft server plugins are built and shipped too |
| **Squirrel** | The Windows installer technology the app ships with |
| **The contracts** | Product rules every user-facing surface must follow (regex builder on every search bar, browser-style tabs, appearance editors, language modes, super-confirmation for destructive actions). Tracked as GitHub issues #6 to #13 |
| **The recurring defect** | "Built, tested, unreachable": code that works and has green tests, but no user can reach it, because nothing mounts it or wires it. It has happened at least four times in this project. An audit on 2026-08-03 found and fixed nine more cases |

### What works right now

- The app installs from a real Windows installer and opens with a working interface.
- It can browse an existing BlueMap server and show its maps in 3D.
- It can render a world locally by driving the original Java engine (per decision D17).
- The interface includes: a world wizard (make a map in steps), a settings surface, a
  seven-tab options editor for BlueMap config files, GitHub sign-in, release downloads,
  a Java runtime settings row, notifications, and a custom window title bar. All of these
  are reachable by clicking, and all have tests.
- CI builds an installer, renders a test world, takes screenshots of the real app, and
  publishes a GitHub release on every green push to `main`.

### What does not work yet

- **The TypeScript mesher matches the Java engine, and the Phase D gate passes.** On
  2026-08-04 the oracle rendered a 1000x1000 generated world with both engines and
  reported **identical**: 995 files matched, **961 of 961 hires tiles byte for byte after
  decompression**, all 24 lowres tiles pixel for pixel, all six render-state files
  agreeing on every decision, and neither side holding a file the other lacked. The
  200x200 fixture on a different seed reports the same.

  The first comparison had 49 of 57 files differing, and every cause turned out to be
  *outside* the mesher. That is the finding worth keeping:

  1. **The harness was feeding the two engines different resources.** BlueMap bundles its
     own resource pack, `resourceExtensions.zip`, and upstream loads it alongside the
     vanilla jar; the harness loaded only the jar, so the gallery was 839 textures short
     and every texture index after the first gap pointed at the wrong picture. The pack
     version was read from a file neither pack has, so it silently fell back to a number
     that selects different models.
  2. **The port had no per-tile update task.** `WorldRegionUpdateTask` is what decides a
     tile should be deleted rather than rendered, and what records the render state.
     Without it the port rendered and kept 253 tiles upstream deletes.
  3. **The comparison itself was grading the wrong things.** Render state was compared as
     raw bytes, so the first difference it ever found was a gzip header field; the gallery
     was compared as bytes, so two correct PNG encoders looked like a divergence.
  4. **A region-boundary defect only a large world could reach.** A tile at the edge of a
     region reads chunks belonging to the *next* region, and the port's synchronous
     `getChunk` answers a cache miss with an empty chunk, which reports itself as
     ungenerated - so 23 tiles were erased rather than rendered. Every tile the port did
     write was byte-identical even in that failing run. A mesher can be right about
     everything it emits and wrong about what to emit, and only a world with a second
     region asks that question.

  **What passing the gate does and does not mean.** It means the ported engine produces
  the same bytes as the engine it replaces, on these worlds, measured rather than argued.
  It does not by itself switch the product over: decision D17 says the app renders with
  upstream's Java engine until the mesher takes over, and making that switch is its own
  change with its own verification. Local rendering still uses the Java engine today.

- **A warning for anyone measuring the gate: build first.** `tools/oracle` runs the
  *compiled* engine, so a run measures the last build rather than the current source. It
  now compiles automatically, but a report older than 2026-08-03 late-evening may have been
  grading a stale build.
- Phases E, G, H, I are not started. Phase C has three unfinished exit checks.
- The contract issues (#6 to #13) are open: regex builder everywhere, tabs, appearance
  editors, language-mode completeness, the command palette, the changelog viewer, the
  notification centre.

### How to verify things yourself

Run these from the repository root. All should succeed today.

```bash
cd design && npx vitest run          # every unit test (about 3200, under 30 seconds)
cd design && pnpm typecheck          # type-checks all 13 packages (vue-tsc for the ui one)
cd design && pnpm lint
node tools/oracle/selftest.mjs       # proves the byte-comparison gate can detect planted differences
node tools/oracle/compare.mjs --seed 7 --size 200   # the gate on a small world; identical, exit 0
node tools/oracle/compare.mjs --seed 1 --size 1000  # the gate at full scale; identical, exit 0
```

The gate compiles the engine itself before rendering, so it always grades the current
source. That takes a few extra seconds and is deliberate — see the 2026-08-03 late section
at the bottom for the wrong conclusion its absence produced.

### If you are picking this up

1. Read this section, then `ROADMAP.md`, then the newest dated section at the bottom of
   this file.
2. The active work is making the oracle comparison come out identical. Start from the
   report at `tools/oracle/out/gate/report.json` and fix causes in
   `design/packages/engine/src`, comparing against the Java source in
   `vendor/BlueMap/core/src/main/java/de/bluecolored/bluemap/core/`.
3. Never weaken a comparison to make it pass. If something cannot be verified, write that
   it was not verified.
4. Every change: run the tests, run the linter, commit with a message that says what
   actually changed, push, and check CI.

---

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
  tested), so closing it is one handler plus one preload line. That wire has since landed;
  see "Landed since the sections above were written" at the end of this document.
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
landed with the fix and was proven to fail against a deliberate reintroduction of the
broken idiom before the tree was restored byte-identically; the proof is recorded in the
closing section of this document.

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

### Landed since the sections above were written

The workflow described above as in flight completed, and its result is in the tree:

- **All 69 broken fallback call sites are fixed** across 22 files in `packages/ui` (12 in
  `components/config`, 7 in `components/world`, 3 in `components/menu`). The broken idiom
  `t(key, "fallback with {arg}").replace("{arg}", v)` is replaced everywhere by the
  three-argument form `t(key, { arg: v }, "fallback with {arg}")`. Adversarial verification
  checked every site: no message changed wording, key, or meaning, and a whole-tree sweep
  found zero residual sites outside the guard's own deliberate fixtures.
- **The Java runtime wire is closed end to end.** `packages/app/src/main/java/ipc.ts` (with
  `ipc.test.ts`) registers `java:runtime` in `main/index.ts`, the preload exposes it, and
  `settingsBridge.ts` and `JavaRuntimeRow.vue` consume it. The settings row now shows the
  measured runtime instead of the honest empty state.
- **The regression guard exists and was proven the hard way.** `i18nFallback.test.ts`,
  `configMessages.test.ts` and `RenderRunPanel.test.ts` mount components and assert the
  rendered text of fallback messages — the assertion class this repository previously had
  none of. Reintroducing the broken idiom at one covered site (`StoragesScreen.vue`) made
  three guard tests fail, each naming that exact site; the file was then restored
  byte-identically (hash-checked) and the guard went green again.
- **Adversarial review then made the wire honest about paths.** Three real defects were
  found and fixed before this ever shipped: the reason sanitizer stopped each match at
  whitespace, so `C:\Program Files\…` leaked everything after the first space — including
  half a username from a profile path; the drive pattern matched the `s://` inside
  `https://`, mangling URLs that named no local path; and the 240-unit truncation could cut
  a surrogate pair in half and render mojibake. The sanitizer now anchors path starts,
  sweeps leftover backslash fragments, collapses repeated placeholders, and truncates on
  code points — each behaviour pinned by its own test. On the UI side, Electron's
  `Error invoking remote method 'java:runtime':` plumbing is stripped before a failure
  renders, and discovery no longer queues behind the unrelated render-list read: the row
  says `loading` from the first synchronous moment, so the button's guard actually guards.

The suite at this commit: **198 files, 2968 passed, 2 skipped**, from `npx vitest run` in
`design/`. The per-package table in `ROADMAP.md` is updated to match.

---

## Update, 2026-08-03, night — the audit, and the doors it found missing

A 12-agent reachability audit (mount graph from `App.vue`, three-way IPC parity over all 35
invoke channels, asset wiring) confirmed the recurring pattern at three layers at once:
**9 of 72 components were orphans** (the whole `ConfigScreen` subtree, `ConfigNotifications`,
`MenuChoice`), the **GitHub sign-in and release-download features were complete in main and
preload with zero renderer lines**, the `window.materialBluemap.config` bridge the options
GUI probes for **had never existed at all**, and the typefaces every stylesheet names —
Roboto and Roboto Mono — were bundled nowhere, so the whole chrome rendered in Arial.

Landed since, each verified and pushed separately:

- **Roboto ships** (32 woff2 subsets via @fontsource, `@font-face` verified in dist,
  Apache-2.0 in NOTICE). Roboto Mono is queued with the next wave.
- **The `config:*` bridge exists end to end**: `main/config/ipc.ts` (seven channels,
  75 tests, path-traversal/device-name/symlink refusals checked name-by-name before any
  write, all-or-nothing batches), preload namespace with `pathSeparator`, `bridge.d.ts`
  declaration. `testSqlConnection` is an honest feature-detected refusal: this build
  carries no SQL client and says so; it never fakes `ok: true`.
- **ConfigScreen has a door**: a third shell FAB opens it full-bleed over the shell, Escape
  closes and returns focus, the wizard stays mounted behind it (`inert`), viewer chrome
  yields while it is up. Its `consent` emit reuses the existing settings anchor; `saved`
  raises a shell notice.
- **Notices are shell-owned**: `stores/notices.ts` singleton, one `ConfigNotifications`
  corner mounted at `v-app` level, ConfigScreen injects the shared state rather than
  carrying a second corner.
- **MenuChoice is real**: MarkerMenu's hand-rolled sort row became the shared control, and
  MenuChoice itself gained `role="group"` + per-button `aria-pressed` (Vuetify marks
  selection with a class only, which a screen reader cannot hear).
- **The dead render wires are closed**: `firstRunFlow` now calls `mapStorageDirectory()`
  (the method that exists) and prefills with `current`; every ended render names the engine
  that produced it, preferring `render.json` as evidence over the event stream's
  expectation; `activeRenders()` is wrapped and in-flight renders are surfaced beside the
  interrupted ones without conflating the two.

CI note for whoever reads a red X: the first run that ever reached the rewritten publish
job died on `installer-out/Squirrel.exe`, a file electron-builder has never emitted, and
the workflow lint died on its own step's comment — `# shellcheck is present…` parses as a
malformed shellcheck *directive*. Both fixed; `.nupkg` + `RELEASES` stay hard requirements
and the comment no longer opens with the magic word.

### The second wave: the two renderer-less features, and what the captures showed

- **GitHub sign-in has a surface** (`components/github/`, a fifth settings section):
  device-flow panel driven entirely by `onGitHubAuthEvent` (code shown large with a
  spelled-out `aria-label`, countdown from events with no local clock, every terminal
  state distinct), a personal-access-token path whose token goes from the field to the
  bridge and is held nowhere, sign-out that says both what is deleted and what revocation
  was attempted, and an honest no-bridge state with no controls at all. 47 tests.
- **Release downloads have a surface** (`components/downloads/`, entered from the world
  wizard's folder step): discovery of an asset's split parts, live rows from
  `onDownloadEvent` with real byte counts, reconciliation with `activeDownloads()` on
  open so a download started elsewhere is not invisible, cancel, and the honest
  unsupported state. `githubCheckRepository` stays deliberately unused here — it belongs
  to the private-render path when that is wired.
- **The version reaches the Info page** (feature-detected, Electron plumbing stripped),
  and **Roboto Mono ships** (400 + 500, the two weights the surfaces actually inherit).
  The NOTICE entries for both faces were corrected to **OFL-1.1** — Roboto was relicensed,
  and the earlier Apache-2.0 line described a version this repository does not bundle.
- **The green run's own captures caught a real overlap**: the viewer's floating control
  bar anchored at `top: 0` sat on the custom title bar — the menu button covered the logo
  and title, and the top-right cluster covered minimize/maximize/close. It now reads
  `--mb-titlebar-height`, the same property `#map-container` already consumes.

Merged-tree verification for the wave: **app + ui 1245 tests green**, `vue-tsc`, `tsc`
and `eslint` clean, both bundles built (12 Roboto Mono woff2 subsets in dist).

---

## Update, 2026-08-03, late — the gate was grading a stale build

The headline is a process defect, not a code one, and it invalidates two previously
recorded gate measurements.

**`tools/oracle/render-ts.mjs` imports the engine's built `dist/`**, because it runs as its
own node process and node does not read TypeScript. Nothing built it first. So a gate run
measured whatever was last compiled rather than what was in `src/` — and those differ for
exactly as long as somebody is editing the mesher, which is the whole time the harness is
useful.

This had already produced a wrong conclusion. The working tree carried two real fixes (the
textures-file number spelling, and the missing-chunk preload). A run after them returned a
report byte-identical to the one from before them: same first-differing offset (55), same
file sizes, same 48-of-57. The natural reading is "the fixes did nothing". The fixes were
fine; `dist/` was three hours old.

`lib/tsEngine.mjs` now compiles the engine before every render, and a compile failure is
thrown rather than reported as `unavailable` — "the engine cannot render yet" is an honest
statement about Phase D's progress, and source that does not compile is a different thing
that must not hide behind it. (`lib/util.mjs`'s `run` gained an opt-in `shell`, because
`pnpm` on Windows is a `.cmd` shim that `CreateProcess` will not execute directly.)

### What the gate actually says now, measured against a fresh build

| | before | after |
|---|---|---|
| `textures.json.gz` first differing byte | 55 | **499** |
| hires `tiles/0/x0/z0.prbm.gz` (ts bytes) | 193 116 | **232 740** |
| compared / differing | 57 / 48 | 57 / 49 |

The differing count went *up* by one because a lowres tile that previously matched by
accident now does not; the two headline numbers are real movement.

### textures.json: the writer is now gson-exact, and what remains is a png encoder

Two spelling divergences were closed, both in `map/TextureGallery.ts`, both pinned by new
tests (`javaDoubleToString`, `writeGsonString`; 36 tests in that file now):

- **numbers** — java writes a `double` as `1.0`/`0.0` and switches to `4.985044943168759E-4`
  outside `10^-3 <= |d| < 10^7`. Of the reference document's 8368 numeric tokens, 713 were
  spelled differently and **none** differed in the digits, so the port borrows javascript's
  shortest-round-trip digits and rebuilds only java's shell around them.
- **strings** — gson's default `htmlSafe` escapes `<`, `>`, `&`, `=` and `'`. The `=` is
  the one that mattered: every texture is a base64 data-url, and the reference document
  spells that padding `\u003d` 2074 times.

The divergence that remains at offset 499 was decoded from the base64 and is **not a
texture-data problem at all**. Both sides carry the same 16x16 image; their `IHDR` chunks
differ:

```
java (ImageIO)  : bitDepth 4, colourType 3   (palette)
port (pngjs)    : bitDepth 8, colourType 6   (truecolour + alpha)
```

Upstream's `Texture.from` encodes with `ImageIO.write(image, "png", os)`
(`resourcepack/texture/Texture.java:151`); the port uses `PNG.sync.write(image)`. Both
decode to identical pixels and `getTextureImage()` reads either back correctly, so nothing
in the renderer can tell them apart — but the gate compares bytes. Closing it means
reproducing `ImageIO`'s encoder (palette-vs-truecolour decision, filter choice, zlib
settings). Recorded in `docs/deviations.md`; it is its own piece of work, not a tweak.

The element-count gap is unrelated and still open: java 2092 entries, port 1253.

### The 253 extra tiles and the six missing `rstate/` files have one shared cause

Diagnosed and adversarially verified: **`WorldRegionUpdateTask` is not ported.**

- The tile-path codec is correct. `FileGridStorage.getItemPath` matches upstream exactly;
  the odd-looking `tiles/0/x1/0/z1.prbm.gz` is upstream's own digit-folder encoding.
- The port renders every tile in the region's bounds — 17x17 = **289**. Java renders the
  **36** fully backed by generated chunks. 289 − 36 = **253**, the exact `onlyInPorted`
  count. Upstream's gate is `checkTileRenderPreconditions`
  (`common/.../rendermanager/WorldRegionUpdateTask.java:341-384`), whose non-null return
  means `unrenderTile`, never `renderTile`.
- The `rstate/` files are empty for the same reason. The renderstate layer *is* ported and
  correctly wired into `BmMap` (constructed at `BmMap.ts:154-156`, saved at `:322-324`,
  paths and `SHIFT` values byte-matching upstream). But `CellStorage.saveCell` early-returns
  on an unmodified cell, and the only production callers of `set(...)` live in that same
  unported task (`:226-229`, `:239-244`, `:249-253`).

Everything the port needs already exists: `TileState`, `TileActionResolver`,
`RenderSettings.isInsideRenderBoundariesOfCell`, `Chunk.isGenerated`/`hasLightData`/
`getInhabitedTime`, `Region.iterateAllChunks`. The precondition checks have to become
`async` (the ported `getChunk` is sync-with-empty-fallback), exactly as the new
`HiresModelManager` preload already does. Note for whoever ports it: `renderTime` is
`System.currentTimeMillis()/1000`, so the comparator will need to normalise it or the three
`.tiles.dat` files will read as `differing` rather than `onlyInReference`.

### Two smaller things, both of the "built, tested, unreachable" family

- **`download/token.ts` existed and nothing called it.** It resolves a token from the
  sign-in first and `GH_TOKEN` second — written precisely so that signing in inside the
  application makes a private release fetchable — and `startDownloads` never used it, so
  the behaviour it was written for did not exist. Now wired through `main/index.ts`, with
  10 tests it did not have (`ipc.ts`'s `token` option widened to allow a promise).
- **The `ui` package was not type-checked by anything.** `pnpm build` runs it through Vite,
  which transpiles per file and never checks a template, and plain `tsc` cannot read a
  `.vue` import at all. A `vue-shim.d.ts` was briefly added to silence that and was
  **removed instead**: it typed every component as `any`, which is worse than the gap, and
  `vue-tsc` — already a devDependency — reads `.vue` natively and passes clean. Every
  package now has a `typecheck` script (`vue-tsc` for `ui`, `tsc` elsewhere), a root
  `pnpm typecheck` runs all 13, and CI runs it between `lint` and `build`.

Verification for this section: **209 files, 3204 passed, 2 skipped**; `pnpm typecheck`
clean across all 13 packages; `pnpm lint` clean.
