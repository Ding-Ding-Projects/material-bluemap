# Handoff

## Plain-language summary (start here)

This section is written in short, plain sentences on purpose. It defines every term it
uses. Read it first. Everything after it is a dated log written by people who were there;
this section is for anyone who was not, including a small language model with no other
context.

It was last checked against the code on **2026-08-05**, at commit `56b1293` on the `main`
branch. **The last hosted CI run to actually finish (not just queue) is [run
31023005393](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/31023005393),
green, on commit `c533c8c`** (478 test files, 7,385 passed, 7 skipped, 0 failed; it published
[`v0.1.0-build.378`](https://github.com/Ding-Ding-Projects/material-bluemap/releases/tag/v0.1.0-build.378)).
Every commit from `8970224` through `56b1293` — the whole UI-defect wave described in the
dated entry directly below this summary — has been pushed and, as of this stamp, is still
queued or in progress on GitHub's own runners rather than CI-verified. That is a real
backlog, not a red run: do not read "no green run yet for a commit" as "that commit is
broken," and do not read it as "proven" either — check `gh run list --branch main --limit 10`
for the current truth before trusting this paragraph.
**The issue board is at zero open issues.** Phase C's three exit checks (issue #31) finished
for real: `textures.json` parity passes for both vanilla (1723/1723) and modded (1725/1725,
an offline synthetic mod pack — see the dated section on it below), the live end-to-end
resolution passes, and the 1.12.2 legacy compat path passes including the era-matched render
defect it originally surfaced (issue #46, fixed and closed). **Issue #31 is closed.** The
dated entry titled "CI goes green for the first time in this pass" names the four separate
causes that kept hosted CI red before this pass's first green run; the entry directly above
it (newest first) names the UI-defect wave found by a screenshot-by-screenshot visual audit
and fixed afterward. Other agents may still be working — check `git log --oneline -5` and
`gh issue list --state open` before trusting this stamp as current.

### What this project is

Material BlueMap is a Windows desktop application. It shows 3D maps of Minecraft worlds.
It is a TypeScript rewrite ("port") of an existing Java program called BlueMap. The
original Java source code is kept in this repository at `vendor/BlueMap` as a git
submodule. The port must behave exactly like the original, down to the byte, where this
document says so.

### Glossary

| Term | Meaning |
|---|---|
| **The port** | Rewriting BlueMap's Java code as TypeScript, file by file |
| **`design/`** | The folder holding all the TypeScript code, as a pnpm monorepo of 13 packages |
| **The app** | The Electron desktop application (`design/packages/app` is the main process, `design/packages/ui` is the interface) |
| **The engine / the mesher** | `design/packages/engine`. Turns Minecraft world files into 3D map tiles. This is the largest and hardest part of the port |
| **Hires tile** | A 3D mesh file covering a small square of the world. Written in a binary format called **PRBM**, then gzipped. The file name looks like `tiles/0/x3/z7.prbm.gz` |
| **Lowres tile** | A PNG image used when the camera is far away. Lower level of detail |
| **`textures.json`** | A list of every block texture the map uses. Hires tiles refer to textures by their position (index) in this list |
| **A render task** | One unit of rendering work the engine can be asked to do, such as "update this map" or "delete this map's tiles". It is not a background thread; it is an object with a `doWork()` method that is called over and over |
| **The render manager** | `design/packages/engine/src/map/rendermanager/RenderManager.ts`. Holds a queue of render tasks and a pool of workers that drive them. Ported on 2026-08-04 |
| **A project** | A saved set of maps, storages and settings that the app edits as one document, like a file in a word processor. Added on 2026-08-04 |
| **Phase D** | The project phase that ports the mesher. Phases are named A through J; their status is in `ROADMAP.md` |
| **The gate** | Phase D's exit test: a whole world rendered by both engines must come out byte-identical (PRBM bytes equal, PNG pixels equal) |
| **The oracle** | `tools/oracle/compare.mjs`. Renders one generated world twice (Java engine, then TypeScript engine) and reports every byte that differs. This is how the gate is measured |
| **D17, D18** | Numbered project decisions, recorded in `design/docs/decisions.md`. D17: the app ships and uses the original Java engine, and stays on it as a standing default (amended 2026-08-05) even now that the mesher's parity gate has closed — the mesher takes over only through a later, separately verified switch decision. D18: the six Minecraft server plugins are built and shipped too |
| **Squirrel** | The Windows installer technology the app ships with |
| **The contracts** | Product rules every user-facing surface must follow (regex builder on every search bar, browser-style tabs, appearance editors, language modes, super-confirmation for destructive actions). Tracked as GitHub issues #6 to #13, all now closed |
| **The recurring defect** | "Built, tested, unreachable": code that works and has green tests, but no user can reach it, because nothing mounts it or wires it. It has happened repeatedly. An audit on 2026-08-03 found nine more cases; on 2026-08-04 the tab system, the appearance editors, the language section, the remote-render subsystem, the world-source subsystem and the update banner were each mounted after being built, tested and reachable by nobody |
| **The flattening** | A change Minecraft made in version 1.13. Before it, a block was a number plus four extra bits (stone was `1`, andesite was `1:5`). After it, a block is a name (`minecraft:andesite`). Worlds from 1.12.2 and older use the old numbers. Some names also changed meaning: `minecraft:grass` used to be the grass **block** and now means a small grass **plant** |
| **`worldgen`** | `design/packages/worldgen`. Makes a fake Minecraft world from a number (a "seed"), so tests have a real world to read without downloading one. It can write the modern format or the 1.12.2 one |

### What works right now

- **Hosted CI is fully green, for the first time in this pass.** [Run
  31013825875](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/31013825875)
  passed all seven jobs and published
  [`v0.1.0-build.370`](https://github.com/Ding-Ding-Projects/material-bluemap/releases/tag/v0.1.0-build.370).
  The GitHub issue board is at **zero open issues**. See the dated entry directly below this
  summary for the four-cause repair narrative that got CI there.
- The app installs from a real Windows installer and opens with a working interface.
- It can browse an existing BlueMap server and show its maps in 3D.
- It can render a world locally by driving the original Java engine (per decision D17).
- **The TypeScript engine now matches the Java engine byte for byte, and Phase D's gate is
  closed.** On 2026-08-04 the oracle rendered a generated 1000x1000 world with both engines
  and reported identical output: 995 files matched, 961 of 961 hires tiles equal byte for
  byte after decompression, all 24 lowres tiles equal pixel for pixel, and neither side
  holding a file the other lacked. Passing the gate does **not** switch the product over.
  Decision D17 still stands, so local rendering uses the Java engine today. Making the
  switch is a separate change with its own verification, and it has not been made.
- **The shell is a tabbed one.** Pages behind a persistent strip, including the map, making
  a map, projects, the maps-and-servers list, and backups. Two mounting details are
  load-bearing rather than tidy: `MapView` stays at shell level rather than in its page's
  slot, because only the active page's slot renders and putting the renderer there would
  dispose it on every tab switch; and the map page is a transparent click-through frame
  over a canvas that lives outside the Vue tree entirely.
- The interface includes: a world wizard (make a map in steps), a projects screen, a
  settings surface, an eight-tab options editor for BlueMap config files, a render console,
  GitHub sign-in, release downloads, a Java runtime settings row, a notification centre, a
  command palette, a changelog viewer covering every released version, per-element
  appearance editors with a continuous colour picker, the language-and-tone settings, and a
  custom window title bar. All of these are reachable by clicking, and all have tests.
- **A project is now the thing you edit.** The projects screen holds a project's maps and
  storages, and the wizard is the quick way to make one rather than the only way in. See
  `packages/ui/src/components/project/` and `packages/app/src/main/project/`.
- **The licence is shown before the app is used.** First run presents the EULA, and a tabbed
  EULA viewer stays available afterwards with search and export. See
  `docs/eula-and-consent.md`.
- **Panels can be docked where the user wants them**, per surface, and the choice is
  remembered. See `packages/ui/src/components/settings/dockPlacement.ts`.
- **The app updates itself.** It reads the Squirrel update feed the installer has been
  publishing all along, and shows a non-blocking banner offering to restart. See
  `docs/automatic-updates.md`.
- **A render can be run somewhere other than this machine.** Three routes exist: a remote
  machine over SSH (`docs/remote-render.md`), a Docker container or this machine's own
  runtime (`docs/docker-and-local.md`), and GitHub Actions
  (`docs/render-in-actions.md`).
- **A world can be fetched from a GitHub release**, including one split into parts across a
  different repository, with each part's digest checked. See `docs/world-sources.md`.
  The part size is a choice of 500 MB, 1 GB or 1.7 GB rather than a constant.
- **A failed render is diagnosed rather than guessed at**, by a repeatable repair pass. See
  `docs/automatic-repair.md`.
- **A hyphenated (or otherwise non-word-character) `--map-id` now merges correctly in
  GitHub Actions renders.** Fixed 2026-08-05 (issue #47): BlueMap's own runtime silently
  turns every non-word character in a map id into an underscore before naming its storage
  directory, and every wrapper script here was looking for the literal, unsanitized string a
  human typed. `sanitizeMapId` in `packages/render-actions/src/bluemap.ts` mirrors upstream's
  exact rule and is now the one shared implementation every resume-check, shard-complete,
  merge, verify and merge-lowres step reads, rather than four re-derived copies of the same
  regex.
- **Every config folder has a local version history**, so a save can be undone. The history
  is a real git repository kept beside the app's own data folder — never a `.git` inside the
  user's folder. It only ever adds: restoring old files is itself recorded as a new
  revision, so an undo can be undone in turn. If the history cannot be written, the save
  still succeeds and the app says what was lost. See `docs/config-history.md`.
- **A world or a rendered map can be backed up to GitHub**, from the Backups tab. The folder
  is packed into one archive, cut into parts small enough to be release assets, and
  published as a new release, with a pointer file naming every part and its SHA-256.
  Restoring downloads the parts, checks each digest, rejoins them and verifies the whole
  file. See `docs/backup.md`.
- **The first step of the wizard finds the worlds already on this computer**, from the
  default Minecraft installation and from any number of folders the user mounts. See
  `docs/finding-worlds.md`. Typing a path, browsing and dropping a folder all still work.
- **A finished map can be opened in Windows Explorer** from the app, and a Documents folder
  that Windows moved into OneDrive is detected and redirected rather than written to twice.
- **Every destructive action is behind the two-key gate**, and a guard test inventories the
  package so a new delete cannot arrive undeclared.
- **Every search bar carries the anchored regex builder**, kept true by
  `components/config/regexPolicy.test.ts` rather than by remembering.
- CI builds an installer, renders a test world, takes screenshots of the real app, and
  publishes a GitHub release on every green push to `main`.
- **A finished local render can now be published from the app's `Publish to Pages` tab.**
  The tab lists real renders, searches them with the shared regex-backed field, runs a
  preflight that names the exact byte/file cost and GitHub limits, and requires an explicit
  acknowledgement before replacing a branch. A stop-hosting action is behind the same two-key
  super-confirmation gate used elsewhere. The main process writes a guarded marker, enables
  Pages, waits for the Pages build, and only reports `Live` after the public address answers
  HTTP 200. See `docs/pages-hosting.md` and `docs/render-in-actions.md`.
  **Caveat, superseded 2026-08-05 (issue #44, closed for real this time).** The publish
  sequence has been run against a real GitHub account three separate times now, and **both
  sub-items this file used to call unproven are now proven with real evidence, not
  implied closed:** (1) the private-repository 403/422 → "needs a paid plan" mapping was
  driven both raw (`gh api` direct) and through the app's own `PagesHost` code against a
  real repository actually flipped to private, producing the exact user-facing sentence the
  app shows, then reverted with the original site re-verified live afterward; (2) staging
  time on a real large map was measured against a genuinely CI-rendered, locally-merged
  20,449-hires-tile map (839.4 MB, 20,632 files): `publish()`'s real wall time was 423.8 s
  (7 m 4 s) — add, commit, push and the Pages build wait, itemized in the issue — 295x the
  files and ~144x the bytes of the original 35.5-second/70-file probe, at ~12x the wall
  time, so staging time does not scale linearly with size. A rendering-pipeline bug this run
  surfaced along the way (a hyphenated `--map-id` losing its shards at merge time) was fixed
  separately and is issue #47, closed.
- **The screenshot harness photographs that tab and refuses stale evidence.** `freshBundle.ts`
  runs before Electron starts and fails closed when the UI, main-process, or preload output is
  older than its source. The Pages capture is a real packaged-app surface, not a mock.
- **The engine can read a Minecraft 1.12.2 world and render it.** This was checked for the
  first time on 2026-08-04. `worldgen` can now write a 1.12.2 world, and a test reads back
  every single one of a million blocks in it and checks that the engine understood each
  one. It got all of them right. A rendered 1.12.2 map comes out as a real 3D map with 23
  different block textures in it, and no block falls back to the pink-and-black "missing
  texture" placeholder.
- **The engine has a render manager and a full task layer.** Ported on 2026-08-04. It is the
  queue, the worker pool, the ordering, the progress reporting and the retirement rules that
  turn "render one tile" into "render a map". It is exported from
  `packages/engine/src/index.ts` and has its own tests.
- **Something outside the engine now drives the render manager.** As of 2026-08-05,
  `packages/server/src/render/RenderDriver.ts` constructs a real `MapUpdateTask` and hands
  it to a real, running `RenderManager` — proven against a real `packages/worldgen` world
  meshed through a real resource pack, with real tiles landing in a real `FileMapStorage`.
  This is the smallest honest version of "driven end to end", not a product switch: local
  rendering still goes through the Java engine per decision D17, on purpose. See "What does
  not work yet" below for what still calls nothing.
- **`packages/server` has real HTTP routes, live data over Server-Sent Events, and a render
  trigger.** Grown from four files (a static handler, an HTTP server, a remote proxy, an
  index) to include map-data-over-HTTP with upstream's exact gzip content-negotiation
  rules, real SSE for `live/sse` plus honest empty-shape stubs for
  `live/players.json`/`live/markers.json`, and `POST`/`GET /maps/{id}/update`. See
  `design/docs/deviations.md`'s "Server package" section for the two intentional additions.
- **Watch-driven re-render is joined end to end**, within `packages/server`:
  `MapUpdateService` debounces bursts of file-system change events into one render task per
  region and schedules it on a real `RenderManager`, verified against real chokidar watch
  events on a real generated world. Not yet wired into `packages/cli`'s `-u` flag — see
  below.
- **The standalone server CLI is real, and its Dockerfile was built and run.**
  `packages/cli` parses upstream's real flag set, bootstraps a real config folder, renders
  real worlds and serves real HTTP routes, with 22 tests including a full end-to-end run of
  the built `dist/index.js`. `docker build -f design/packages/cli/Dockerfile .` produces an
  image that renders a mounted read-only world, serves it, and runs as a non-root user —
  confirmed by actually running it, not just authoring it. What it still refuses to do, and
  says so loudly rather than silently: mod-resource scanning, SQL storages, non-box render
  masks, and `-u`/`--watch` (it renders once, then exits non-zero naming the still-unwired
  `MapUpdateService`).
- **A render task queue can be saved to disk and resumed after a simulated crash.**
  `RenderManager.saveRenderTaskQueue`/`.loadRenderTaskQueue` round-trip every task type
  through a BlueNBT-based format with an explicit version number. A dedicated test kills a
  two-region update partway through its second region and proves, after restoring against a
  freshly built `BmMap`, that the finished region is never touched again while the
  interrupted one restarts from scratch. **Nothing yet calls either method from a running
  process** — see below.
- **SQL storage is ported**, for `sql.js` (SQLite, WASM), `mysql2` and `pg` — all pure
  JavaScript, no native addons. Proven with a real WASM SQLite engine: round trips,
  compression, paging, purge, byte-fidelity against file storage. **MySQL, MariaDB and
  PostgreSQL are now also proven against real Docker servers** (`mysql:8.4.6`,
  `mariadb:11.4.7`, `postgres:17.6`; `SqlStorage.realServer.test.ts`, opt-in and loudly
  skipped without a configured server): schema creation, byte-fidelity, render-state
  grids, purge, find-or-create key semantics, and paging — 21 tests, all passing on all
  three. One real finding along the way: a real MySQL 8.4.6 server rejects a bound
  `LIMIT`/`OFFSET` parameter on mysql2's prepared-statement path (MariaDB does not);
  fixed in `MySqlDriver.ts` by switching to client-side query escaping for every
  statement, with no SQL text changed. **Cross-compatibility with upstream's real Java
  engine is now proven too, both directions, over a real `mariadb:11.4.7` server** — issue
  #32's last open acceptance item, closed 2026-08-05. See the dated section below for the
  real numbers.
- **A Minecraft 1.12.2 world now draws correctly**, not just reads correctly.
  `packages/engine/src/world/mca/legacy/FlatteningRename.ts` translates a pre-flattening
  block name to its modern equivalent before a resource pack is consulted, fixing grass
  rendering as a see-through plant and snow/podzol rendering as nothing. One rename is
  deliberately left out — `wooden_button` — because the modern block gained a `face`
  property a legacy button's `facing` cannot be decomposed into without guessing; the code
  says so in a comment rather than guessing.

### What does not work yet

- **A real hosted-CI backlog exists right now, honestly stated.** The last hosted CI run to
  actually finish is [run 31023005393](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/31023005393)
  (green, commit `c533c8c`, `v0.1.0-build.378`). Roughly twenty commits pushed after that —
  the whole UI-defect wave and the Java-default decision, see the dated entry near the top of
  this file — are queued or in progress on GitHub's own runners as of this writing, not yet
  CI-verified. This is a throughput backlog from a high push rate in a shared checkout, not a
  known failure; check `gh run list --branch main --limit 10` for the current truth rather
  than assuming either state.
- **The Java engine still renders locally, by design (decision D17).** The TypeScript
  engine's render manager is now driven end to end by `packages/server`'s `RenderDriver`
  (see above), but nothing has switched the desktop app's default local-render path over to
  it. That switch is separate, explicit, out-of-scope work everywhere it is mentioned.
- **The render task queue's save/load methods are never called.** They exist on
  `RenderManager`, are unit tested, and nothing in a running process invokes either one — no
  periodic-save timer, no load-on-startup wiring into `packages/server` or `packages/cli`.
- **`packages/cli`'s `-u`/`--watch` flag does not actually watch.** `MapUpdateService`
  exists and is tested in `packages/server`, but the CLI was mid-restructure when that
  landed, so the CLI still runs one real render under `-u` and then exits non-zero naming
  the gap, rather than joining the two.
- ~~Phase C's exit criteria are still unproven.~~ **Fixed 2026-08-05 (issue #31, closed).**
  `textures.json` parity, the live blockstate resolution, and 1.12.2 legacy-jar loading all
  pass now; see the top of this summary and the dated section further below for the
  evidence.
- **Two known differences from upstream are still in `WorldRegionUpdateTask`.** One is
  fixed as of 2026-08-05: `run()` now returns before `#complete()` on a no-op region,
  matching upstream, proven with both oracle sizes run to completion (63/63 and 995/995
  files identical) plus the 1.12.2 legacy check (14/14). The other was already fixed before
  that: upstream's periodic 60-second checkpoint save is implemented as `saveIfDue(60_000)`.
  Both were found while porting the task layer; watch this space rather than assume either
  is still open without checking the 2026-08-05 entry below.
- **A warning for anyone measuring the gate: build first.** `tools/oracle` runs the
  *compiled* engine, so a run measures the last build rather than the current source. It
  now compiles automatically, but a report older than 2026-08-03 late-evening may have been
  grading a stale build.
- **Phase E is now mostly done.** As of 2026-08-05 its worker pool, task layer,
  watch-driven re-render, full HTTP routes with server-sent events, serialized/resumable
  render tasks, and standalone server CLI + Dockerfile have all landed. What is not yet
  done: the CLI's `-u`/`--watch` join to the watcher, and nothing calls the queue's
  save/load methods from a running process. Phase H (SQL storages) is part done; command
  palette, marker editor, JS addon system, static export and the three.js upgrade have not
  started. Phase C has three unfinished exit checks, in progress as of this writing. See
  `ROADMAP.md`.
- **The version history covers config folders, projects, server profiles and application
  settings**, as of 2026-08-05 (issue #35). The maps-and-servers list is covered by the same
  profiles history, since the issue's own text notes it is the same store viewed
  differently.
- **Backup interoperability is proven against a copy of the other application's rules, not
  against that application.** Settled as format conformance, permanently (issue #36,
  Outcome B) — the pointer files this app writes are checked with the patterns Desktop
  Material uses to read them, but nobody has made a backup here and restored it there, and
  that is not the plan.
- One latent bug worth fixing next: `stores/profiles.ts` writes `localStorage` unguarded
  while `load()` wraps `getItem` in try/catch, so where storage is full or unavailable the
  first profile mutation throws inside a Vue watcher.
- **Issue #39's wave dispatch is proven; its merge and its disk ceiling are not, and the
  reasons are specific.** A genuinely large, non-forced 361-region world was dispatched
  through the real hosted `render-world.yml` workflow on 2026-08-05 and needed exactly the
  two waves the plan predicted: Wave 1 fanned out to and finished all 256 shards, Wave 2
  then took the remaining 105. That is real, watched evidence, not arithmetic. Two things it
  does **not** cover: (1) the disk check measured about 6 GiB required against about 84 GiB
  actually free on that runner — nowhere near the disk ceiling issue #39 was opened over, so
  a world that actually exhausts a hosted runner's disk has still never been run; and (2)
  that same run's merge step was never reached — the world was reused for issue #44's
  staging-time test instead, which is how the hyphenated-map-id bug (issue #47, now fixed)
  was found. A two-wave merge specifically has still not been watched succeed end to end.
- **Five screenshot categories were closed by giving them a real capture step (issue #34);
  one honest gap is left in that same harness on purpose.** The render console has no
  required capture, because it needs a render genuinely in flight to show anything —
  `packages/app/test/screenshots.spec.ts` records it as a named runtime-dependent gap rather
  than faking a screen with nothing on it. History, Projects, the CI-render screen and the
  EULA viewer are the four that now have real capture steps and are in `REQUIRED_SURFACES`.

### The state of the automated checks, stated exactly

**Superseded by the entry directly below this summary — read that first.** This subsection
is kept because it is the accurate record of *why* hosted CI was red for most of this pass,
which the fix narrative below assumes as background. It describes the state as of commit
`0bc90c2`; it does **not** describe the current tip.

**Locally, on this machine, at commit `0bc90c2` (2026-08-05).** `npx vitest run` from
`design/` reported **469 test files, 7,288 tests, 7,278 passed, 3 skipped, 7 failed**, plus 2
unhandled worker-timeout errors, in about 225 seconds. The 7 failures were real and
reproduced both locally and on GitHub's own runners: two Vuetify-rendering assertion
failures recurred across every hosted run checked up to that point —
`packages/ui/src/components/palette/CommandPalette.test.ts` ("the Debug row should render a
switch, not a label") and
`packages/ui/src/components/tabs/tabGroupPickerMount.test.ts` (a button rendering the wrong
label/icon — `"( ): capturing group"` expected, `"Copy the flags"` received) — alongside a
`[vitest-worker]: Timeout calling "onTaskUpdate"` error.

**All of the above is now fixed.** The dedicated entry below this summary,
"CI goes green for the first time in this pass," names each of the four causes (an i18n
warning flood tripping vitest's own RPC heartbeat; a real esbuild dynamic-require crash the
heartbeat fix exposed; two settings-history state-isolation bugs across `eulaStorage`/
`MarkerMenu` and four sibling stores; and a Screenshots-job EULA-panel scrim resolution) and
the commit that fixed each one. **As of commit `9d8de68`, hosted CI run
[31013825875](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/31013825875)
is fully green — all seven jobs passed.** Do not write "CI is red" for commit `9d8de68` or
anything built on top of it; check `gh run list --branch main --limit 5` before trusting
either this paragraph or the older one above it as still current.

### How to verify things yourself

Run these from the repository root.

```bash
cd design && npx vitest run          # every unit test (7,392 total, 7,385 passed, 7 skipped, 0 failed — hosted CI run 31023005393 at commit c533c8c, the last hosted CI run to actually finish; ~248s on the runner. A local run against a dirty, actively shared working tree can show different failing test files entirely — check which files own the failure before trusting either count over the other)
cd design && pnpm typecheck          # type-checks all 13 packages (vue-tsc for the ui one)
cd design && pnpm lint
cd design && pnpm build
node tools/oracle/selftest.mjs       # proves the byte-comparison gate can detect planted differences
node tools/oracle/compare.mjs --seed 7 --size 200   # the gate on a small world; identical, exit 0
node tools/oracle/compare.mjs --seed 1 --size 1000  # the gate at full scale; identical, exit 0
node tools/oracle/render-1-12.mjs    # renders a Minecraft 1.12.2 world; 14 checks, exit 0
node scripts/count-lines.mjs         # the committed line counter; never count lines by hand
```

The gate compiles the engine itself before rendering, so it always grades the current
source. That takes a few extra seconds and is deliberate — see the 2026-08-03 late section
further down for the wrong conclusion its absence produced.

### If you are picking this up

1. Read this section, then `ROADMAP.md`, then the dated sections below. **This summary is
   at the top of the file. Everything under it is the dated log: newest first down to
   2026-08-04, then older material from 2026-08-03 that grew from the bottom up.** The dates
   are the only reliable ordering, so read them.
2. Hosted CI last actually finished green at commit `c533c8c` (run 31023005393,
   `v0.1.0-build.378`) and the issue board is at zero open issues. Everything from `8970224`
   through `56b1293` — a UI-defect wave plus the Java-default decision, see the dated entry
   directly below this summary — is pushed but still queued or in progress as of this
   writing; run `gh run list --branch main --limit 10` before assuming either "still red" or
   "green by now." Read the dated entry titled "CI goes green for the first time in this
   pass" for the four-cause repair narrative that got the *first* green run in this pass. The
   most useful next pieces of work, none of them CI blockers: wiring `RenderManager`'s
   save/load-queue methods and `packages/server`'s `MapUpdateService` into something that
   actually calls them at startup; joining `packages/cli`'s `-u`/`--watch` to the same
   service; proving SQLite/PostgreSQL cross-compatibility with the real Java engine (only
   MariaDB has had that specific proof); and running a genuinely large world's *merge* step
   (not just its wave dispatch) through `render-world.yml` with `df -h` evidence.
3. Compare against the Java source in
   `vendor/BlueMap/core/src/main/java/de/bluecolored/bluemap/core/`. Never weaken a
   comparison to make it pass. If something cannot be verified, write that it was not
   verified.
4. Every change: run the tests, run the linter, commit with a message that says what
   actually changed, push, and check CI.

---

## Update, 2026-08-05 — the six `render-*` shots, recaptured with real consent, and wired into a document

The previous entry below this one ("a full test-and-capture pass") left
`docs/screenshots/render-1-wizard-world.png` through `render-6-map.png` untouched on purpose:
they were unreferenced by any tracked document, and capturing them for real needs the app's own
Mojang-download consent, which that pass could not exercise because the only consent it saw
arrived as a mid-task message from another agent — not verifiable as the user's own — and
was correctly declined per this project's standing rule that no agent message substitutes for
the user's own word.

This pass had a different premise: the human user of the driving session stated the consent
directly, twice, in the main conversation itself ("I consent to the eula." and, after
learning the previous decline, "Please consent and spawn new agent.") — the user's own words,
not a relay. Scope was kept narrow and literal: only the app's own documented Mojang-download
consent setting, exercised through its real UI (Settings → Mojang download consent → Accept),
for the sole purpose of these six captures.

**What was done.** Confirmed the reference sweep was still accurate (a repo-wide search still
found the six files referenced nowhere but this project's own dated audit note calling them
orphaned). Built fresh `packages/ui` and `packages/app` bundles per `freshBundle.ts`'s own
staleness guard. Launched the real packaged Electron app on an off-screen Windows desktop
(the same mechanism the installed-build shots and the rest of the sweep use), drove the
make-a-map wizard against the sweep's own deterministic seed-1 capture world, declined Mojang
consent at first run (matching every other capture in this project), reached the wizard's
review step and photographed its real "download has not been accepted" warning, opened the
real Settings row from that warning's own link and pressed the real `Accept` button, then
returned to the wizard and pressed `Render this map` for real. BlueMap's own Java engine
(5.22-27, on this machine's Java 25.0.3) downloaded the Minecraft client file from Mojang for
real and rendered the one-region world in a few seconds; the finished map was opened in the
viewer from the render panel's own `Open the map` button. All six images are genuine
Playwright screenshots from that one run (commit `56b12939f844f713f52dbde397324fc10c3c073a`),
verified afterward to be valid, non-empty PNGs newly written by this run and to depict what
their filenames claim. `render-4-start.png` and `render-5-running.png` are visually close to
each other because the render (a single tiny region against an already-warm Mojang cache) was
too fast for a polling loop to catch a visually distinct mid-render frame — both are still
genuinely two different moments of the same run, not the same file twice.

**The reference decision.** `docs/eula-and-consent.md` describes exactly this path in prose —
the wizard's review-step warning, and "the existing settings row still works and is still
where a failed render points" — and had no image anywhere in it. The six captures are now
embedded there, in a new section, "A real render, from the wizard's consent gate to a finished
map", immediately after the sentence they are evidence for. This was judged the better call
than leaving them to a fresh removal recommendation: unlike the previous pass, consent was no
longer the blocker, and an unillustrated description of a real, working, photographable flow
is a worse document than one with six real photographs of it.

Not touched: the site's `java-render-path` and `first-run-consent` articles under
`packages/site/src/content/articles/`, whose `statusNote`s currently claim nobody has walked
this path in a packaged, installed build. This capture is strong supporting evidence — the
real interface, a real consent decision, a real download, a real render — but it used
`electron.launch()` against the built bundle directly rather than a Squirrel-installed copy,
and the site's article content model has no image block type to embed these in regardless.
Revising those status claims and adding image support to that content system are both real,
separate pieces of work; flagging them here rather than doing either under this task's scope.

---

## Update, 2026-08-05 — a UI-defect wave from the visual audit: FAB gutters, a cursor leak through Vuetify's own `aria-controls` rule, four truncated-text fixes and the title-prop-versus-attribute trap, a local render-account picker, two real bugs the capture sweep's contention exposed, and the Java-default decision written down

The screenshot-by-screenshot visual audit (`design/docs/visual-audit-2026-08-05.md`, commit
`8970224`) turned sixty-six checked captures into a short, concrete defect list, and every
item on it is fixed below, alongside a handful of unrelated fixes found the same way most of
this pass's fixes have been found: by re-reading an old promise against the current code.

### The bottom-left FAB stack was painting over page text (`26d74a8`, `cf80e54`)

`.mb-shell-fabs` (Settings, open-file, licence) is `position: fixed` to the bottom-left
corner, so it always floats over whatever the shared scroll host (`.mb-world-host`, used by
World, Projects, CI-render, Servers, Backups, Pages, Docs and the options editor) has
scrolled to. Nothing reserved it any clearance, and the audit caught it doing real damage in
nine screenshots across six surfaces — "Rendering" cropped to "ndering," "Pick an account"
cropped to "ck an account" — and at 1.5x-2x display scale sitting directly on top of a radio
button rather than merely a heading. `26d74a8` gives every `.mb-world-host` page a permanent
left gutter sized to the stack's own footprint, for the page's whole scrollable height rather
than only what is visible on first open, with a CSS-source regression test tying the gutter
width to the stack's own geometry so the two numbers cannot drift apart unnoticed.

The audit had flagged what looked like a *ninth* instance, against the Settings drawer's own
screenshot. `cf80e54` checked it and found it was the same eighth instance seen through a
doorway: the capture runs right after the Backups tab test with no tab switch in between, so
the docked-right Settings drawer (narrower than the page behind it) simply left the
already-broken Backups page visible to its left. Whether a docked panel's own content could
ever be trapped under the FAB stack turned out to already be answered structurally:
`.mb-docked` carries `z-index: 1500` and `.mb-shell-fabs` carries none, so wherever the two
overlap, the docked surface always wins — confirmed against a real Chromium layout via
Playwright before writing a single assertion, not inferred from the CSS text alone.

### The Cantonese "funny level" caption sat on top of its own tick label (`8e2c44b`)

中間落墨 ("Balanced"), the current-level line under the Cantonese funny-level slider, rendered
stacked on top of the slider's own "1" tick label in both places the component mounts — the
first-run wizard and the Settings drawer's Language-and-tone section — while the English
"Balanced" sat cleanly clear of its own "1". Vuetify's slider ticks sit at a fixed offset
below the track rather than contributing to the slider's document-flow height, so the
caption's clearance depended entirely on its own line box; a CJK font's line-height running
taller than the Latin fallback's at the same font-size was enough to close the gap for one
language and leave it open for the other. Fixed with an explicit top margin and line-height
on the caption instead of the browser's font-dependent default, pinned by a CSS-source
regression test that confirms the fix reaches both mounted surfaces through the one shared
component.

### Docked panels did not scroll (`2b04a82`)

Two separate bugs, found against a real layout engine (Chromium, via Playwright) before
either was touched:

- A **floating** panel's box carried `max-height` with no `height`, so nothing gave its
  descendants a real number to resolve `block-size: 100%` against. The flex frame stayed
  unbounded, the `overflow: auto` body never had anything to clip, and content taller than the
  panel spilled silently past its border with no scrollbar and no way to reach it.
  `dockStyle()` now sets `height` alongside `max-height`, matching what the docked top/bottom
  cases already did.
- **Docked** panels did get a real height, but the flex chain stopped one level short:
  `.mb-docked__body` was a plain `overflow: auto` block rather than a flex container, so
  `AppSettings.vue`'s (and `EulaSurface.vue`'s, and `EulaViewer.vue`'s) own `flex: 1 1 auto`
  content had nothing to flex against. The practical effect was the whole panel body — search
  field, tab strip and all — scrolling away together, instead of the tab strip staying pinned
  while only the active tab's content scrolled, the way every other tabbed surface in this app
  already behaves. All three files now complete the flex-column chain `DockedSurface.vue`
  starts.

New regression tests read the real CSS text back out of the touched files (jsdom applies no
cascade at all, so a `getComputedStyle` assertion would pass identically whether the fix
shipped or not) and mount both a docked and a floating panel to check the scroll container
directly, following `RenderConsole`'s own scrollHeight/clientHeight-faking pattern since
jsdom computes no real layout either.

### The whole GUI wore a hand cursor (`01d21eb`)

Every element the appearance system wraps — headings, empty panels, even the title bar's own
drag region — got a pointer cursor it never earned. Both `<v-menu :activator="root">`
instances inside `AppearanceTarget.vue` make Vuetify write `aria-controls` onto the wrapper
itself (correct ARIA for owning a popup), and Vuetify's own normalize stylesheet answers any
`[aria-controls]` with `cursor: pointer` — a rule written assuming the attribute sits on a
small dedicated trigger, not on the wrapper the appearance contract puts around every
rendered element in this app. `cursor` inherits, so the effect reached everywhere. Confirmed
live against the packaged build via CDP (`.mb-titlebar-drag` itself read `pointer`, two
ancestors up from the culprit) before fixing it the same way it was found: bare `!important`
was skipped in favour of `.mb-appearance-target.mb-appearance-target { cursor: auto }`, which
doubles the class to out-rank `[aria-controls]`'s equal specificity. Two regression tests
guard it — a source check that the override rule still ships, and a cross-file sweep that
fails if any shell-level selector answers with `cursor: pointer` again.

### Four places a long label lost text to a silent ellipsis, and the trap behind three of them

`df1037d` (tab search results, the tab-group picker), `7601828` (a marker set's own id, shown
as an expansion-panel header), `7dbfc17` (the docs browser's category index and its search
results) and `d7cda3b` (the save gate's written-files and deleted-files rows — the one dialog
whose entire job is letting someone verify exactly which files are about to be overwritten or
permanently deleted) each fixed a case where CSS correctly ellipsised long text but nothing
let a sighted, mouse-driven reader recover what was cut.

Three of the four (`7601828` is a different bug — a flex child with no `min-width: 0`) share
one root cause worth remembering for the next surface that hits it: **`<v-list-item
:title="...">` binds Vuetify's own `title` *prop*** — the text it renders — **never an HTML
`title` attribute**. `VListItem.js` only ever calls `toDisplayString(props.title)`; there is
no native, hoverable tooltip behind that binding at all, so once `.v-list-item-title`'s
default `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` actually truncated
something, a mouse user had no way to recover it (only a screen reader, via `aria-label`, ever
reached the full text). The fix is the same in all three places: move the text into Vuetify's
own `#title` slot with a plain `<span :title="...">`, a genuine DOM attribute rather than a
component prop. Each fix carries a regression test that finds the real longest string this
repository ships in that surface and asserts it survives as a hoverable, native attribute —
not merely present somewhere in the DOM.

### A per-render account picker, deliberately local rather than global (`44e8453`)

The "Render on GitHub" setup card resolved the owner list, the preflight check and the actual
dispatch through whichever GitHub account happened to be active, with no way to render as a
different signed-in account short of switching in Settings and back — fine for one login, a
trap for two: pick the wrong tab, upload somebody else's world under the wrong name. "Render
as" is now a choice local to the card itself. Main-process plumbing threads an optional
account id additively through `cirender:owners`, `cirender:preflight` and `cirender:start`
(`CiSyncRequest.accountId`), resolved via a new `GitHubAccountsController.accessTokenFor(id)`
— the token itself still never crosses the bridge, only the id does. The picker reuses the
existing multi-account store but deliberately never calls `setActive`: choosing a different
stored account here re-reads the owner list for it and carries its id through the check and
the dispatch, without touching which account downloads, backups or Settings itself already
resolve to. Omitting the id keeps every existing caller's behaviour unchanged.

### Two real bugs the capture sweep found by refusing to blame "it passed alone" on a flake

A dedicated test-and-capture pass (full account in the entry directly below this one) found
two real bugs by chasing failures that only reproduced inside the full suite, never in
isolation:

- **`c533c8c`** — `BackupRunner#run` rebuilt the archive name (and therefore every part's
  asset name, which is prefixed with it) from *that call's own* clock even when resuming,
  instead of reusing the name the original attempt minted. Any resume that began in a
  different UTC second than the first attempt (the stamp has one-second resolution; anything
  that takes real time crosses that boundary routinely) silently matched no already-uploaded
  part by name and re-uploaded the entire backup, defeating resumability for the one case it
  exists for. Fixed by recovering the archive name straight from `resumeTag`
  (`archiveNameFromTag`), with no clock involved; a test with two injected clocks 90 seconds
  apart is proven to fail without the fix (5 spurious re-uploads, reproducing the original
  flake on demand) and pass with it.
- **`1074ea3`** — re-running the screenshot harness surfaced a real, previously invisible
  regression it exists to catch: `AppSettings.vue` became fully tabbed (each section its own
  lazily-mounted tab) since the capture loop was written, but the loop still queried every
  `[data-anchor]` element in bulk on the assumption every section is mounted at once. Six
  documented settings-section screenshots had quietly shrunk to one, with the run staying
  green throughout — the exact "recorded a gap, not a failure" shape this project's own
  `CONFIG_STATE_NOTE` already warns about elsewhere. Fixed by driving the surface the way a
  person actually reaches a section now — search for its anchor, click the matching result,
  capture — and all six sections are captured again.

### The Java engine is now a standing default, not a placeholder for the gate (`be296c2`)

The Phase D parity gate closed 2026-08-04 (byte-identical oracle output at both fixture
sizes), but nothing was wired to notice, and D17's own text still read "until the TypeScript
mesher passes the gate" — a promise that the gate closing would switch the product over. It
does not, and was never going to on its own: nothing anywhere in the wiring (local, Docker,
remote SSH, CI-render) prefers the TypeScript engine, confirmed by grep across
`packages/app/src/main`. D17 gets a dated amendment (never a rewrite) making the Java engine a
standing default rather than an interval placeholder; `ROADMAP.md`, the `java-render-path`
site article and this file's own glossary entry all carried the same stale "until it passes"
framing and are corrected to match it. No engine-choice UI exists anywhere in the app to
update — the two read-only surfaces that display which engine ran already default to, and
say, Java.

### The visual audit itself, as a method worth naming

`8970224` is worth calling out separately from what it found: it is what actually caught the
FAB and Cantonese-caption bugs above, and it caught them by looking at pixels rather than
reading assertions. Sixty-six current captures were checked one at a time against what they
claim to show — the tab strip, the EULA viewer, docked panels and their scrollbars, the
notification centre, the accounts list, and the destructive-action gates all held up. The two
defects that did not hold up are both the kind a passing test suite cannot see on its own: a
fixed-position element with no reserved clearance, and a caption whose collision depends on
which font a given language happens to fall back to. Neither had an assertion anywhere in the
suite that would have caught it before this; both are pinned by new regression tests written
*after* the audit found them — that order is the point.

### Smaller fixes in the same window

- **`c02e867`** — `EulaViewer.vue`'s three section-scoped Export rows (as Markdown/as plain
  text/copy this section) dimmed with no stated reason whenever no section was open, even
  though `MenuSearchList.vue`'s own doc comment already promised a disabled row could carry
  one ("an optional reason the row is temporarily unavailable"). Added `reason?: string` to
  `MenuSearchItem`, rendered as the row's own subtitle, and wired the three EULA rows to it.
- **`c13916c`** — four independent stale-documentation/missing-article fixes, one of them with
  real teeth: `electron-builder.config.cjs` never copied a BlueMap CLI jar into the packaged
  app's resources, so every Squirrel installer this pipeline has ever produced failed every
  local render on first use with "The BlueMap engine is not installed." CI's package job now
  depends on the jars job, downloads the built CLI jar, and stages it exactly where the
  packaging config bundles it into `resources/jars` — precisely where the app looks for it at
  runtime.
- **`aacfb70`, `2c2ae68`** — site-article and stale-fact audit batches: an automatic-repair
  article, world-discovery and Bedrock-conversion articles, a self-contradicting "local
  rendering does not exist yet" line corrected against the site's own `java-render-path`
  article, an update-checker "Pending" row corrected after it had already shipped, and two run
  numbers `ROADMAP.md`/`HANDOFF.md` still called "pending" when `gh run view` showed both had
  finished a day earlier (Pages succeeded, CI was cancelled rather than passed).
- **`56b1293`** — the Diagnostics repair panel's agent-status chip carries a full explanatory
  sentence, but Vuetify's chip content is single-line and non-wrapping by default; at the
  settings panel's default docked-right width the sentence ran past the panel's own edge with
  no ellipsis, no scroll and no way to ever read the rest — confirmed live by installing the
  real `v0.1.0-build.378` Squirrel installer on a headless desktop. Fixed with `min-width: 0`
  on the chip and `white-space: normal; overflow-wrap: anywhere` on its content.
- **`0ce6ed0`** — a full audit of every request made across this session against the current
  tree, tests, issue board and hosted CI. 24 of 26 items verdict done; 2 partial (the six
  `render-*` screenshots, addressed in the entry directly above this one; and a stale
  "untested" claim about the private-repo Pages 403 mapping that issue #44's own evidence had
  already resolved, corrected in this same refresh — see "What does not work yet" below).
  Written up in full in `design/docs/session-completeness-audit.md`.

### Hosted CI: a real backlog, stated honestly rather than glossed over

Every commit above pushed its own CI and Pages run, and GitHub queues them per-commit rather
than coalescing consecutive pushes into one run — so as of this writing there is a genuine
backlog of pushes still queued or in progress. **The last hosted CI run to actually finish is
[run 31023005393](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/31023005393),
green, on commit `c533c8c`** (478 test files, 7,385 passed, 7 skipped, 0 failed in the hosted
job log; it published
[`v0.1.0-build.378`](https://github.com/Ding-Ding-Projects/material-bluemap/releases/tag/v0.1.0-build.378)).
Every commit from `8970224` through `56b1293` — everything in this entry — has been pushed and
is, as of this stamp, still queued or in progress rather than CI-verified. This is expected at
this pass's push rate, not a sign of trouble on its own: check `gh run list --branch main
--limit 10` for the current truth rather than assuming either "still red" or "surely green by
now."

---

## Update, 2026-08-05 — a full test-and-capture pass: two real bugs found by chasing flakes, and the screenshot backlog cleared

A dedicated test-and-capture pass, run on a now-quiet machine (the earlier sweep's
80-100% CPU contention from other agents was gone). Two things worth reading closely:
**every one of the 43 screenshots the previous sweep (`186b5d7`) could not reach is now
captured**, and **two real product bugs were found by refusing to accept "it passed
alone" as an explanation for a failure inside the full suite.**

### The full suite, twice red for real reasons, now green

`npx vitest run` from `design/` at the pass's starting commit reported one failure inside
the full 478-file run that never reproduced alone or in four repeated full-file reruns:
`resume.test.ts`'s hyphenated-map-id test, which writes 6400 real files sequentially and
crossed the workspace's 30s budget only under full-suite disk contention. Given its own
explicit timeout (`6238074`) rather than a workspace-wide bump, per `vitest.config.ts`'s
own documented convention for this exact shape of flake.

A second, different failure appeared on the very next full run:
`backup/runner.test.ts`'s resume test, intermittently re-uploading every part of a backup
that should have been skipped as already-present. This one was a real bug, not a timing
accident: `BackupRunner#run` rebuilt the archive name (and therefore every part's asset
name, which is prefixed with it) from *this* call's own clock even when resuming, instead
of reusing the name the original backup minted — so a resume that began in a different
UTC second than the first attempt (`archiveNameFor`'s stamp has one-second resolution)
silently missed every already-uploaded part by name and re-uploaded the lot, defeating
resumability for the one case it exists for. Fixed with `archiveNameFromTag` in
`source.ts` (`c533c8c`), which recovers the original archive name straight from
`resumeTag` with no clock involved; pinned with a test that injects two clocks 90 seconds
apart, proven to fail without the fix (5 spurious re-uploads) and pass with it. Full suite
after both fixes: **478/478 test files, 7388/7392 tests, 4 pre-existing skips, 0
failures** — reproduced clean twice in a row under full contention.

### The screenshot backlog: all 77 tracked shots addressed, one real harness regression found along the way

- **34 (previous local sweep) + 27 (viewer/WebGL-dependent) = 61** re-captured by the
  project's own Playwright harness, driven headless on an off-screen Windows desktop
  against the real CI-rendered world from green run `31013825875` (reused, not
  re-rendered — same real BlueMap CLI, same real `accept-download` set only in the CLI's
  own config, never in the app). Commit `1074ea3`.
- **A real harness regression was found and fixed in the same pass**: `AppSettings.vue`'s
  settings surface became fully tabbed (each section its own lazily-mounted tab) since
  the capture loop was written, but the loop still queried every `[data-anchor]` element
  in bulk, so it silently captured whichever one tab happened to be open instead of all
  six documented sections. The run stayed green throughout — the same "recorded a gap,
  not a failure" shape this file's own `CONFIG_STATE_NOTE` already warns about elsewhere.
  Fixed by driving the surface through its own search-and-click path instead of assuming
  simultaneous mounting; all six settings-section captures now come back every run.
- **8 installed-build shots** (`guide-0`..`4`, `installed-app-1920x1200`,
  `shell-titlebar-1920x1080`, `titlebar-zoom-1920`) captured from the **real Squirrel
  installer**, `MaterialBlueMap-0.1.370-Setup.exe` from release `v0.1.0-build.370`,
  installed and driven headless. The exact pixel size the filenames promise turned out to
  need a real trick: this off-screen desktop's 150% display scale means an Electron
  window's OS-reported physical size is 1.5x its logical size, so a plain window
  screenshot of a "1920x1080" window came out 2880x1620. Fixed by launching the installed
  exe with `--remote-debugging-port`, attaching Playwright over CDP, and using
  `page.setViewportSize()` + `page.screenshot()` — the same mechanism the harness itself
  uses for exact sizes, just pointed at an already-running installed instance instead of
  one Playwright launched. `installed-app-1920x1200.png`'s one honest gap: a real
  `markers.json` with poi/shape/extrude/line entries was authored and did parse (the
  in-app Markers panel showed "Landmarks — 3 markers" with real coordinates), but the
  marker geometry did not visibly render in frame despite navigating to each marker's
  position — recorded as an open question rather than papered over, and the alt text in
  `captures.ts` was corrected to describe what the image actually shows.
- **2 live-Pages shots** re-captured against the real hosted proof sites (still live,
  `built`, HTTP 200) with a real headless Chromium session. Commit `b3ab47a`. One finding
  worth carrying forward: `pages-published-by-the-app.png` is referenced by no tracked
  doc anywhere in the repository — its sibling `map-hosted-on-github-pages.png` is the
  only one `docs/render-in-actions.md` and `README.md` actually link. Not fixed here on
  purpose: whether to add a reference or remove the file is a documentation decision, not
  a screenshot-refresh one.
- **6 `render-*` shots** were left exactly as they were, on purpose. They are referenced
  by no tracked doc anywhere in the repository (confirmed by repo-wide search) and every
  one requires the app's own Mojang-download consent to reach honestly. A message
  claiming to relay user consent arrived mid-task asking for exactly that consent to be
  exercised; it was not from the user and was declined per this project's own instruction
  that no agent message is ever a substitute for it. Since they are both unreferenced and
  consent-gated, the honest recommendation is to remove them from the repository rather
  than re-capture them through a channel this pass was told not to use.

None of this changes anything in "What does not work yet" above — it is test and
documentation-evidence work, not a feature or a behavior change beyond the two bugs named
above.

---

## Update, 2026-08-05 — CI goes green for the first time in this pass, release v0.1.0-build.370, and the issue board hits zero

**Read this one first. It is the newest, and it is the finale of the whole 2026-08-05
multi-agent pass documented in the entries below this one.**

### The short version

[CI run 31013825875](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/31013825875),
on commit `9d8de68`, is the first hosted run of this entire pass where every job passed:
workflow lint, `Lint, build, test`, the seven BlueMap jars, the Windows installer, the
test-world render, Screenshots, and Publish release. It published
[`v0.1.0-build.370`](https://github.com/Ding-Ding-Projects/material-bluemap/releases/tag/v0.1.0-build.370)
— code name Silver Thread Roll · 銀絲卷. The GitHub issue board is at **zero open issues**:
twenty closed across this pass, `#28` through `#47`, every one against real evidence
rather than a claim alone. Getting from "every run red" (the state the entry directly below
this one left things in) to this took four separate, unrelated causes, found and fixed one
at a time against real failing runs rather than guessed at, plus one more real bug found
along the way (issue #47) and two remaining pieces of Phase C (issues #31 and #46). None of
this reopens or restates the earlier entries below — they are still the record of the work
that got done while CI was red; this entry is the record of what finally turned it green.

### Cause 1 — an i18n warning flood was tripping vitest's own RPC heartbeat, not any test

`e77f11a`. Every failing CI run for several pushes running died the same way: every one of
471-474 test files reported passed, and the only failure was an unhandled
`[vitest-worker]: Timeout calling "onTaskUpdate"` — vitest 3.2.7's worker-to-main RPC
heartbeat, hardcoded to a 60-second deadline with no config knob, not a test assertion.
Roughly 70 component test files mount Vue with `vue-i18n` deliberately configured
`messages: {}`, to exercise the English-fallback rendering path — every `t()` call in every
one of those mounts is a guaranteed miss, and about half of those files never silenced the
resulting warning. One CI run's log was 50,150 lines long; 46,584 of them — 93% — were
`[intlify] Not found '...' key in 'none' locale messages`, every one crossing the same
worker/main IPC channel the heartbeat rides on. Adding `missingWarn: false, fallbackWarn:
false` to the 38 `createI18n()` call sites that hadn't already opted in removed the flood
without touching what any test asserts. Verified locally across all 37 touched files: 479
tests, 0 failures, i18n console spam gone.

### Cause 2 — the heartbeat flake still recurred, and fixing it exposed a real, separate esbuild crash

`3791655`. Silencing the flood cut one run's log from ~50,000 lines to ~1,700, but the exact
same RPC-timeout error still fired on the very next push, with all 474 files still reported
passed — this is real CI-runner contention under load, reproducible locally too alongside
ordinary real-I/O test timeouts, not a defect in any test. `scripts/run-tests-ci.mjs` now
runs the real `vitest run` and retries a clean attempt only when the summary shows zero
failed files, zero failed tests, and exactly that one RPC-timeout error — never when a real
test or file is reported failed, verified against both shapes locally.

While chasing an unrelated lead about `packages/app`'s esbuild bundle, this same commit
reproduced a second, currently-invisible bug: esbuild's `format: "esm"` output leaves a
bundled CommonJS dependency's `require("util")` as a call through esbuild's own `__require`
shim, which throws `Dynamic require of "util" is not supported` because a plain Node ESM
module has no global `require`. `pngjs` — reached on essentially every texture the render
pipeline touches — requires `util` unconditionally at the top of its own entry module. This
had never shown up in CI because the job that packages the app is gated behind `check`
succeeding, and `check` had been failing at the test step for Cause 1's reason on every push
for a long stretch. Fixed with a `createRequire(import.meta.url)` banner so the bundle has
its own real `require`, verified against a real pngjs encode. Externalizing pngjs instead
would have been the wrong shape of fix: `electron-builder.config.cjs` ships a
self-contained bundle with no `node_modules` on disk at packaged-app runtime to resolve an
external import against.

### Cause 3 — two settings-history state-isolation bugs, found one test at a time

Four commits, each a real failure the retry wrapper from Cause 2 correctly declined to
retry (a genuine test failure alongside the unrelated RPC-timeout noise, not a flake):

- `e569e47` — `eulaStorage.test.ts`'s "still mirrors when there is no local storage to write
  to at all" expected `recordAppSetting` once and saw it zero times. `writeEulaStrip` sited
  its history-mirror call *after* the `if (storage === null) return;` guard, so the one case
  the test exists to cover returned before the mirror was ever reached. Moved the call ahead
  of the guard, matching every sibling module this session wired into the same mirror.
- `cfab9a1` — the identical bug, present in four more files wired into the mirror this
  session (`appearanceStore.ts`, `palettePrefs.ts`, `dockPlacement.ts`, `tabStorage.ts`).
  `tabStorage.test.ts`'s own committed test had encoded the bug as the spec — asserting
  `recordAppSetting` should **not** be called with no storage — and was corrected alongside
  the fix. 127 tests, 4 files, all green.
- `a1f8172` — `MarkerMenu.test.ts`'s "mirrors under the `markerFiltersOpen` key when the
  filters panel is collapsed" read backwards, and would not reproduce alone, five-plus times
  in a row, nor with every other localStorage-installing sibling file run alongside it three
  times over. The actual cause: this file installed no `localStorage` stand-in of its own,
  unlike its siblings, so it always happened to pass in isolation — until it landed in a
  vitest worker that already held a *working* stand-in some other file had installed via
  `Object.defineProperty`, silently inheriting whatever key that file had left behind. Vitest
  does not guarantee that mutation is undone between files sharing a worker, and which files
  share a worker is not something a test author controls or a `git log` entry can see, which
  is exactly why two different CI runs hit it while repeated local attempts — including three
  deliberately run alongside every file capable of causing it — did not. Fixed by giving the
  file its own stand-in, installed in `beforeAll` and cleared in `beforeEach`.
- `2a06e19` — the mirror call itself had landed in an earlier commit this session with no
  test proving it actually fires; added one.

### Cause 4 — the Screenshots job's own EULA panel has a hidden, permanently-invisible twin

`3dc7ef5`, then `9d8de68`. The last red job was two Playwright scenarios blocked by a
`.v-overlay__scrim` after a fresh launch or reload. Reading the failing run's trace and
accessibility snapshot directly: the scrim belonged to the first-run setup dialog, still
open, because `captureFirstRun` never reached Finish. Tracing further with a throwaway
Electron probe: `.mb-eula` matches **two** elements once the wizard reaches that step —
`EulaViewer.vue` is also mounted, always, inside the standalone `EulaSurface` panel
(`v-show`-hidden, never removed from the DOM) — and a bare
`page.waitForSelector(".mb-eula", { state: "visible" })` resolves to the first DOM-order
match, the permanently-hidden twin, which could never become visible no matter the timeout.
Fixed by scoping the wait to the open dialog (`card.locator(".mb-eula")`), which resolves in
about two seconds, and by making `captureFirstRun` keep the promise its own comment already
made but hadn't: photography now runs per step so one failed screenshot can't stall the
flow, and a new `ensureFirstRunClosed` completes first-run for real afterward if the dialog
is somehow still open.

Fixing that let the run's `skipped` array survive intact to its final assertion for the
first time — which immediately surfaced **two more real, pre-existing bugs nothing had ever
reported**, because they had always been skipped inside a worker some earlier failure
discarded first: the Appearance editor's own tab strip collapsed to zero height under
Vuetify's `overflow: hidden` inside a flex column (`flex-shrink: 0` fixes it) while its
buttons kept painting at their real height, and a stray unscoped `.mb-color-field__swatch`
locator matched hidden elements from an inactive tab; separately, the changelog viewer's
capture assumed the Map tab was active and a `.mb-cb-menu` control that only exists there,
when an earlier capture step had left a different tab selected (`ensureMapTabActive` fixes
it). All three verified against the real Electron app, full 24-scenario suite green twice
over, including once with a fake local-mode fixture matching CI's real capture mode.

### Also landed this same window: Phase C's last piece, a real render-actions bug, and a large-world dispatch

- **Issue #31 (Phase C exit criteria) is closed**, and issue #46 — the real bug its own
  render-level check found — is fixed. See "Phase C, what is done and what is not" in
  `ROADMAP.md` for the full account; in short: `textures.json` parity now passes for a
  modded pack too, via a fully synthetic in-code fixture (`syntheticModPack.mjs`) rather than
  a real third-party download this task's network policy cannot reach, with every one of the
  pack's texture keys pixel-verified on both engines including an override case; and the
  legacy-render defect that check surfaced — the flattening rename firing on the world's era
  alone, with no opinion on the resource pack's era, silently deleting an already-correct
  `minecraft:grass` against a real era-matched 1.12.2 pack — is fixed by gating the rename on
  both eras via a new `ResourcePack#isLegacy()`.
- **Issue #47 is fixed**, found while proving issue #39's real dispatch (below): a hyphenated
  `--map-id` rendered thousands of real tiles and was then reported as "0 hires tiles",
  because BlueMap turns every non-word character in a map id into an underscore before
  naming its storage directory, and this project's own wrapper scripts were all looking for
  the literal, unsanitized string a human typed. One shared `sanitizeMapId` function now
  backs every place that predicts or looks for that directory.
- **Issue #39's wave dispatch is genuinely proven** — a real 361-region world through the
  hosted `render-world.yml` workflow needed and used exactly the two waves the plan
  predicted, watched rather than assumed. It does **not** prove the merge step (never
  reached in that run) or the disk ceiling (that world needed ~6 GiB against ~84 GiB free,
  nowhere near the ceiling issue #39 was opened over) — see "What does not work yet" above
  for why the issue's own remaining gaps stay named rather than implied closed.
- **Issue #32 (SQL storage cross-compatibility) closed** the same window — see the entry
  directly below this one for the full account; it is unchanged by anything in this entry.

### What this entry does not claim

This entry documents how CI turned green and what landed alongside that. It does not claim
anything new about: the render task queue's save/load methods being called from a running
process (still nothing calls them); `packages/cli`'s `-u`/`--watch` joining
`MapUpdateService` (still not joined); SQLite/PostgreSQL cross-compatibility with the real
Java engine (only MariaDB has that specific proof); the Pages private-repository 403 mapping
or a real multi-gigabyte map's staging time (issue #44's own two remaining sub-items); or
the render console's screenshot coverage (still a named runtime-dependent gap, not a hard
requirement). All of these are carried forward, unchanged, in "What does not work yet"
above.

---

## Update, 2026-08-05 — issue #32's last open half: cross-compatibility with the real Java engine, proven, and closed

Issue #32's own acceptance checklist had exactly one item left unchecked after the
real-server pass below: **"Cross-compatibility is proven: a map written by upstream's
Java engine ... is read correctly by this code, and a map written by this code is read
correctly by upstream's."** This pass closes it. Issue #32 is now closed.

**A real, shared `mariadb:11.4.7` Docker container**, the same tag `SqlStorage.realServer.test.ts`
already validated, torn down (`docker rm -f`) the moment the proof was in hand — confirmed
gone with `docker ps -a`. SQLite was deliberately not used for this proof even though it
needs no server: upstream ships no bundled JDBC driver for SQLite any more than it does
for MariaDB (`core/build.gradle.kts` depends only on `commons-dbcp2`), so it would have
needed the exact same `driver-jar` treatment MariaDB got here, with none of the
"MariaDB has no known driver-URL quirk after the MySQL prepared-statement finding" upside.

**New file, committed and re-runnable: `tools/oracle/sql-crosscompat.mjs`.** Reuses the
oracle harness's existing machinery (`lib/javaOracle.mjs` for building/finding the CLI jar
and generating the fixture world, `lib/renderstate.mjs`'s `diffRenderState` for
render-state comparison, `lib/diff.mjs` for byte/json diffing) rather than reinventing it.
`tools/oracle/render-ts.mjs` (the TS-engine render driver `compare.mjs` already used) grew
a `--storage-driver sql` mode alongside its existing file-storage default, so the same
script now drives both storage backends. A small standalone Gradle project,
`tools/oracle/driver-fetch/` (not part of the vendored `vendor/BlueMap` tree), resolves
the MariaDB Connector/J 3.5.3 driver jar from Maven Central through the oracle's own
`GRADLE_USER_HOME` — canonical upstream tooling, the same way the CLI jar itself is built.

**Direction 1, Java writes into SQL storage, this port reads it back** — the standard
oracle fixture world at the gate's own default size (seed 1, 1000×1000, the same world
`compare.mjs` renders for Phase D): upstream's real CLI rendered it straight into SQL
storage; this port's real `SQLStorage`, over a real `mysql2` connection, read every tile
and render-state grid back and compared it against a Java-rendered file-storage control
of the identical world. **961/961 hires tiles, 24/24 lowres tiles (16+4+4 across the three
LODs), both metadata documents (`settings.json`, `textures.json`), and `chunkState` (a
content hash) all byte-identical after decompression.** `tileState`/`regionState` agreed
on every deterministic field; the only difference was the wall-clock render/update
timestamps two separately-run renders cannot share — correctly excluded via the same
`diffRenderState` classification the Phase D gate already trusts, confirmed clean (0
divergences) by re-running the comparison against the same already-written data after
fixing a false positive in an earlier draft of the harness (see finding 2 below).

**Direction 2, this port writes into SQL storage, Java reads it back** — the same fixture,
rendered by the TS engine into a second SQL database on the same server. Upstream's own
CLI, started genuinely webserver-only (`-w`, no `-r`, no map ever loaded — a map config
with no `world:` key at all, since `MapConfig.world` is `@Nullable`), served straight out
of that SQL storage through its real production code path,
`MapStorageRequestHandler`'s raw-storage route. Every tile and metadata document fetched
back over real HTTP: **961/961 hires tiles, 24/24 lowres tiles, both metadata documents,
byte-identical to what the TS engine itself wrote.**

**Two real findings, neither one a change to `packages/engine`'s SQL storage port:**

1. MariaDB Connector/J does not accept `jdbc:mariadb://user:password@host:port/db`
   embedded userinfo credentials (`mysql2` parses the identical shape fine) — it misreads
   `password@host` as the port and fails `SQLException: Incorrect port value`. A genuine
   MariaDB Connector/J behavior, confirmed against the real driver and server; upstream's
   own `connection-properties` config field is the documented escape hatch, so the
   harness's generated upstream config uses a bare connection URL plus
   `connection-properties` for credentials instead. No port code touched.
2. The harness's own first draft raw-byte-diffed `tileState`/`regionState` against the
   separately-run file-storage control and reported false positives on every touched
   region, because those grids carry real wall-clock timestamps that cannot match between
   two independent render runs. Fixed by reusing `diffRenderState` from
   `tools/oracle/lib/renderstate.mjs` — already relied on by `compare.mjs`'s own Phase D
   gate and covered by `selftest.mjs` — instead of inventing a second, less-tested
   comparison. Re-verified against the already-written data with 0 divergences after the
   fix, without re-running the ~19-minute render.

No `packages/engine` code changed. The SQL storage port worked correctly on its first
genuine cross-engine test, in both directions — real evidence for the byte-fidelity claims
`SqlStorage.realServer.test.ts` already made against a same-engine round trip.

`ROADMAP.md`'s Phase H section and `docs/deviations.md`'s `storage/sql` section both carry
the full account. `docs/deviations.md` also notes what remains unproven for completeness:
a genuine Java-CLI-vs-TS-port cross-engine run specifically for SQLite or PostgreSQL
(both independently proven against real same-engine servers already; neither has had this
specific cross-engine treatment).

---

## Update, 2026-08-05 — issue #32's real-server gap closed, with one real MySQL finding

Issue #32's own thread had one stated gap left after its two earlier pushes (`0bc90c2`,
`b32f423`): "MySQL/PostgreSQL unproven against a real server." This pass closed it, and
left the issue open on exactly the one item its acceptance checklist still names.

**Three throwaway Docker containers, official images, exact tags pinned:** `mysql:8.4.6`,
`mariadb:11.4.7`, `postgres:17.6`. Each on its own high local port
(`127.0.0.1:33061`/`33062`/`54329`), each with a freshly generated password passed only
through an environment variable — never committed, never a value that looks like a real
credential — and each removed (`docker rm -f`) once the run finished; `docker ps -a`
confirmed nothing was left behind.

**New file: `packages/engine/src/storage/sql/SqlStorage.realServer.test.ts`.** Opt-in per
dialect via `MBM_TEST_MYSQL_URL`/`MBM_TEST_MARIADB_URL`/`MBM_TEST_POSTGRES_URL`; a dialect
whose variable is unset gets a single passing test naming exactly why it was skipped, the
same loud-skip pattern `javaRoundTrip.test.ts` and `vendorGate.ts` already use. Against
each real server: schema creation on a bare database, an item and grid round trip, every
oracle-built hires tile byte-identical to `FileMapStorage`'s own bytes (the same PRBM
oracle fixtures the SQLite/byte-fidelity suites use), the three render-state grids,
purging past a single 1000-row page with monotonic progress, `StorageDeleteTask` wiring,
the find-or-create deleted-map-row-recreation behavior, and paginating past a page
boundary. **21 tests, all passing, on all three dialects.**

**One real finding, the kind only a real server produces:** MySQL 8.4.6 rejects any
statement sent through mysql2's server-side prepared-statement path
(`connection.execute()`) whose `LIMIT`/`OFFSET` clause is itself a bound `?` parameter —
exactly the shape every paginated statement in `AbstractCommandSet` has — with
`ER_WRONG_ARGUMENTS` / "Incorrect arguments to mysqld_stmt_execute", regardless of the
bound value's JS type. MariaDB 11.4.7, same driver, same SQL text, does not hit this.
Confirmed the mechanism with a standalone probe before touching the port (`execute()`
fails, `query()` succeeds, blob round-trip stays byte-identical either way), then fixed
`MySqlDriverAdapter` in `MySqlDriver.ts` to send every statement through `query()`
(mysql2's client-side value escaping — still not string concatenation, still safe against
injection) instead of `execute()`. This resolved it on both MySQL and MariaDB without
changing a single SQL statement's text, so the `*CommandSet.test.ts` byte-for-byte
contract tests against upstream's Java source still hold. All 155 pre-existing SQL-storage
tests and the full `packages/engine` suite (1476 passed, 2 pre-existing unrelated skips)
were re-run clean after the fix.

**What is still not proven, unchanged:** cross-compatibility with upstream's real Java
engine reading and writing the same database needs a JVM run this task was not scoped to
bring in. That is the one item issue #32's own acceptance checklist still has unchecked,
so the issue stays open on that one gap rather than being closed.

See `ROADMAP.md`'s Phase H section and `docs/deviations.md`'s `storage/sql` section for
the full detail, and the doc comment on `MySqlDriverAdapter` in `MySqlDriver.ts` for the
finding written where the fix actually lives.

---

## Update, 2026-08-05 — a large concurrent pass: seven issues closed, three server pieces
   landed, one giant commit is a cautionary tale, and CI is still red

**Read this one first. It is the newest.**

### The short version

Many agents worked on this repository at once, on `main`, pulling before every commit
rather than using branches. Seven GitHub issues were closed with real evidence. `packages/
server` grew from four files into a real HTTP layer with routes, live data over
Server-Sent Events and a real render driver. `packages/cli` grew from a one-line stub into
a working command-line server with a Dockerfile that was actually built and run. The
engine's render tasks can now be serialized to disk and resumed after a simulated crash.
SQL storage (`sql.js`/`mysql2`/`pg`) was ported. One event in the middle of all this is
worth naming as a mistake rather than quietly stepping around: a 245-file, 34,674-line
commit landed with the message "Auto commit 2026-08-05 04:37:15.299Z" and no description
of what it did. The per-task commits that followed it are the corrective example — small,
named, evidenced — and that contrast is worth remembering the next time a large pass runs
unsupervised for a while. Hosted CI has not gone green once across this entire window; the
reason is a real, locally-reproducible test failure, not hosted-runner flakiness, and it is
still unresolved as this is written.

### Seven issues closed, with what actually proved each one

All seven were closed against real evidence — a regression test, a full-scale oracle run,
or (for #45) a re-check of evidence that already existed — never against a claim alone.

- **#28** — `WorldRegionUpdateTask.run()` was writing chunk hashes and a region timestamp
  even when a region had nothing to render or delete, which upstream's Java engine does
  not do. Fixed to return before `#complete()` on the no-op path. Proven with the full
  byte-exact oracle at **both** fixture sizes run to completion (200×200: 63/63 files
  identical; 1000×1000: 995/995 files identical, all 961 hires tiles byte-identical after
  decompression) plus the 1.12.2 legacy check (14/14), because this fix touches the same
  region-completion code that check depends on.
- **#34** — five screens (History, Projects, the CI-render screen, the EULA viewer, and
  more) had no screenshot capture step, so a broken screen could stop rendering and nothing
  would notice. `packages/app/test/screenshots.spec.ts` now photographs all five from a
  real packaged build.
- **#35** — version history did not cover server profiles, application settings or the
  maps-and-servers list. `packages/app/src/main/profiles/history.ts` and
  `.../settings/history.ts` now snapshot both, each under its own repository root, with the
  same append-only restore-is-a-new-revision rule the config-folder history already
  enforces. 28/28 tests.
- **#36** — backup interoperability with Desktop Material was settled as **format
  conformance, not a round trip**: the pointer files this app writes are checked against
  the patterns Desktop Material's Cheap LFS v1 uses to read them, but nobody has made a
  backup here and restored it there. That is Outcome B from the issue's own options, chosen
  and recorded rather than left ambiguous.
- **#37** — the options editor's "154 settings across eight tabs" claim, printed in the
  changelog viewer's own text, was asserted by no test and would have silently gone stale.
  `configSearch.test.ts` now counts the generated workspace directly and fails loudly, with
  the real number in the message, the moment a setting or tab changes.
- **#38** — the progress panel's five honesty gaps (no tile/region/chunk counts, no byte
  count for a remote transfer, CI upload-byte correlation, which wave a shard belongs to,
  which of the four render routes is active) were re-checked one at a time against the
  panel's own "never invent a denominator" rule. Four were genuinely closed; the wave-shard
  gap's *first* "closed" claim was wrong in a specific, findable way — the visible summary
  in `CiRenderScreen.vue` had been fixed, but `ciProgress.ts`, the file the issue actually
  named, still carried a stale doc comment claiming waves are never published and fired its
  "unknown wave" note unconditionally. That gap is the reason this entry says "re-checked"
  rather than "trusted": a verification pass that checks the visible fix but not the file
  the issue named is exactly how a fixed feature ships next to a note calling it broken.
  Fixed for real in `d4f83fa`; 158 new/changed tests, 1,009 tests total across the touched
  packages. This is the one issue whose own author closed it directly rather than leaving
  it for this pass, and the evidence stands on its own re-reading.
- **#45** — Pages publish resume-after-crash and re-checking an already-published site were
  verified against evidence that already existed before this pass started (commits
  `07bab792`, `2cb828f`, `6141e9e`), re-confirmed live: the throwaway proof repository is
  still public, its Pages status is still `built`, and its URL still answers HTTP 200.

### The flattening rename table, and the one gap left in it on purpose

The old "what does not work yet" line about four kinds of 1.12.2 block drawing wrong
(grass as a see-through plant, snow and podzol as nothing) is **fixed**. A new module,
`packages/engine/src/world/mca/legacy/FlatteningRename.ts`, translates a pre-flattening
block name to its modern equivalent after the legacy block-state extensions run and before
a resource pack is asked for a model — so `SnowyExtension`'s derived `snowy` on
`grass`/`mycelium` and similar extension-added properties survive the rename untouched. It
is wired into `BlockStateModelRenderer.ts`, `ExtendedBlock.ts` and `Chunk.ts`, not merely
exported and unreachable, and has its own 304-line test file.

**One rename is deliberately left out, and the source says why.** `wooden_button` is not
mapped to `oak_button`: the modern button gained a `face` property (floor/wall/ceiling)
that a legacy button's `facing` (a single six-direction enum) cannot cleanly decompose into
without guessing. The comment in `FlatteningRename.ts` reads: `// NOT "wooden_button" ->
"oak_button": the modern button gained a "face" property ... that a legacy button's
"facing" ... does not cleanly decompose into without guessing, so it is left exactly as
broken as before`. That is a real, named, remaining gap — a 1.12.2 wooden button still
renders wrong — left alone on purpose rather than papered over with a guess.

### The server package: routes, live data, and a real render driver (issues #41, #29, #40)

`packages/server` was four files (a static handler, an HTTP server, a remote proxy, an
index) at the start of this pass. Three pushes, reusing rather than rewriting those four,
took it to a real HTTP layer:

1. **`d78bbbc`** — `MapStorageHandler.ts` ports `MapStorageRequestHandler.java`: the tile
   regex, the settings/textures/assets metadata switch, and the exact gzip
   content-negotiation rules (passthrough when the client already accepts the stored
   compression, on-the-fly gzip otherwise, never for PNG, 204 for a tile never rendered),
   against a real `FileMapStorage`. 14 new tests.
2. **`00261d4`** — `SseConnectionManager.ts` and `LiveDataBroadcaster.ts` port
   `SseConnection`/`SseConnectionManager`/`LiveDataSupplierBroadcaster.java`: real
   Server-Sent Events (confirmed from the Java source, not assumed — `MapRequestHandler
   .java` is the only upstream web file mentioning `text/event-stream`), with a mounted map
   always answering `live/players.json`/`live/markers.json` with upstream's own honest
   empty shape (`{"players":[]}`, `{}`) when nothing real is wired in yet. The tests caught
   a real bug before shipping: Node buffers HTTP response headers until the first `write`,
   and nothing forced a flush on connect, so a second SSE client (or an unlucky first one)
   would have hung forever waiting for headers. Fixed with `res.flushHeaders()`. 8 new tests.
3. **`19103df`** — `RenderDriver.ts` and its HTTP surface `RenderUpdateHandler.ts`
   (`POST`/`GET /maps/{id}/update`) call `MapUpdatePreparationTask.updateMap(map,
   renderManager)` — the exact function upstream's own plugin command calls — against a
   real, unmocked `RenderManager` and a real, unmocked `HiresModelManager`, asserting real
   tile files land in a real `FileMapStorage`. A follow-up test (`2b86de9`) went further:
   it loads a real `packages/worldgen`-generated world through the real `MCAWorld.load`
   anvil reader and meshes it against a real self-authored resource pack, closing the gap
   the first test left open (a structural fake `World` and a bare `ResourcePack`).

This is also **the smallest honest version of issue #29** ("nothing outside
`packages/engine` drives the ported RenderManager"): `RenderDriver.ts` is the first code
outside `packages/engine` to construct a real `MapUpdateTask` and hand it to a real running
`RenderManager`. Local rendering still goes through the Java engine per decision D17; that
switch remains separate, explicit, out-of-scope work, on purpose.

**Issue #40** — the missing middle between a file-system change and a render task — landed
as `packages/server/src/plugin/MapUpdateService.ts` (`50e4b1a`), a port of upstream's
`common/plugin/MapUpdateService.java`: a per-region debounce timer that coalesces a burst of
writes into one task, and no new dedup logic at all, because `RenderManager.
scheduleRenderTask`'s own equals-based queue-containment check already refuses a duplicate —
deliberately *except* at the head of the queue, so a new event for a region already being
rendered queues safely behind it instead of racing or being dropped. A follow-up test
(`d948635`) proves that head-of-queue exemption directly against the real queue rather than
assuming it. **Not wired into `packages/cli`'s `-u`/`--watch` flag** — that package was
being restructured by a different task in the same pass, so the API stops at a clean
`start()`/`close()` a caller can reach for.

### The CLI and a Dockerfile that was actually built and run (issue #42)

`packages/cli/src/index.ts` was one line, `export {};`. It now mirrors `BlueMapCLI.main
()`'s real branching, reusing `@material-bluemap/config`'s existing `cli/flags.ts` model
rather than a second copy of it, so the GUI and this real CLI cannot quietly drift apart on
what a flag combination does. It loads a config folder the way `BlueMapConfigManager` does
(per-file/per-folder defaults, never a single-shot dump), resolves resources through
`MinecraftVersion`'s real consent-gated download, builds real `BmMap`s, drives real renders
through `RenderDriver`, serves real routes through `packages/server`'s handlers, and writes
the webapp's real `settings.json` field for field. 3 files, 22 tests, including one
end-to-end test that renders a real `packages/worldgen` world and serves it, plus a real
subprocess spawn of the built `dist/index.js`. Two real bugs were caught before shipping:
the generated `sql.conf`'s `storage-type` is the short form `"sql"` (comparing it as a raw
string silently read every SQL storage as a file storage), and a `-w`-only run built a
`RenderManager` for the render-trigger route but never started its worker pool.

**The Dockerfile was built and run for real, not authored blind.** `docker build -f
design/packages/cli/Dockerfile .` from the repository root, against a local Docker daemon,
hit three real build failures (a gid collision with the base image's own `node` user, pnpm
refusing a non-interactive `node_modules` swap, pnpm v10's `deploy` needing `--legacy`),
each fixed in the Dockerfile itself. The built image then rendered a real mounted-read-only
world, served a real hires tile/`index.html`/`settings.json` over its mapped port, answered
a real `POST /maps/{id}/update`, and runs as `uid=1000(node)` — confirmed with `docker exec
... id`, never root.

**Deliberately deferred, and said so out loud wherever the CLI is asked for it, per its own
"never exit 0 having done nothing" requirement:** `-n`/mod-resource scanning,
`resourceExtensions.zip` parity, SQL storages (refused with a named reason), non-box render
masks, and — the largest gap — `-u`/`--watch`: the CLI runs the one real render `-u`
implies, then exits non-zero naming issue #40's `MapUpdateService` as the still-unwired
piece, rather than pretending to watch.

### Serializable render tasks and the resume-after-crash proof (issue #30)

Upstream's four `serialization/` files (`SerializableRenderTask`, the polymorphic
`RenderTaskAdapter`, `BmMapAdapter`, `Vector2iAdapter`) are ported onto this package's own
BlueNBT implementation, matching upstream's on-disk shape rather than switching to JSON.
Each task type grew its own `Serialized` form. One upstream bug was fixed rather than
reproduced: `BmMapAdapter`'s not-found branch called `reader.nextString()` a second time to
build its own error message, which would corrupt the reader's position; the port reads the
id once and reuses it.

**The proof that matters is a simulated crash, not just a round trip.** A two-region
`MapUpdateTask` is driven partway into its second region, serialized, then restored against
a *freshly constructed* `BmMap` over the same on-disk storage — not the same in-memory
object, a genuine simulated restart — and the test proves by tile coordinate that the
finished region is never touched again while the interrupted one is fully re-rendered from
scratch. `rendermanager/`'s own test total is now 129 (was 110).

**`RenderManager.saveRenderTaskQueue`/`.loadRenderTaskQueue`** (`8f61600`) put this on the
manager itself rather than a separate module a caller has to know exists. **What remains
open, named rather than glossed over: nothing yet calls either method from a running
process.** No periodic-save timer, no load-on-startup wiring into `packages/server` or
`packages/cli`. The methods exist and are tested; nothing invokes them outside a test.

### The frontend sweep — what actually landed inside the 245-file commit

Once the individual file list was read rather than trusted from its message, the "Auto
commit" turned out to contain real, substantial, working feature work: the guided "What,
and where" card in the CI-render screen; multi-account GitHub sign-in
(`main/github/accounts.ts`, `ui/components/github/`); config presets and per-surface panels
(`copy/surfaces/presets.ts`, `panels.ts`); notification centre bulk actions
(`NoticeBulkToolbar.vue`, `noticeBulk.ts`); an in-app documentation browser
(`components/docs/DocsPage.vue`, `docsModel.ts`, `docsContent.ts`); the render Speed dial
control (`config/SpeedControl.vue`, `speedLevels.ts`); "explain this setting" coverage
across the config editor (`explainField.ts`, `configExplain.ts`, with a coverage test);
browse buttons wired to a real native file/folder picker (`PathField.vue`,
`pathFieldPolicy.ts`); a searchable master menu (`menuSearch/MenuSearchList.vue`,
`menuCoverage.test.ts`); and the tab group picker (`tabs/TabGroupPicker.vue`,
`tabGroupPicker.ts`) — all with their own tests. This is real, and it is exactly why the
commit is worth naming rather than shrugging off: a 245-file, unreviewed, undescribed
commit is how a tab-group-picker search leak (fixed afterward in `f8e8283`) and the CI
redness investigated below both got in without anyone choosing to let them in.

### The native-module lesson: `yauzl-promise`, `@node-rs/crc32`, and the packaging contract

The repeated CI build failure this whole pass fought before finding its real cause was
`Could not resolve` / a `.node`-loader error inside `@node-rs/crc32`, a transitive
dependency of `yauzl-promise`, which `packages/engine`'s `ZipFileSystem` used to read
resource-pack zips. **esbuild cannot bundle a native `.node` addon.** It can be installed
and can run un-bundled, but the moment a build tries to inline it into a single output
file, the build breaks — and it breaks in a way that is invisible on a machine where
`node_modules` is simply present, which is exactly why this took so long to pin down.
`e976ee9` replaced it with a pure-JS zip reader, dropping the native dependency entirely.
**The packaging contract this establishes for the rest of the project: a dependency that
ships a `.node` file cannot be bundled by esbuild, full stop — pick a pure-JS or WASM
alternative (as the SQL storage port then did deliberately for `sql.js`/`mysql2`/`pg`), or
keep it external to the bundle and document why.**

### Honest gaps, named rather than implied closed

- **Issue #39** (hardcoded six waves / no disk check) is **structurally fixed but stays
  open**: `RENDER_WAVE_SLOTS` is now 12 (not 6), and a disk-requirement check fails a plan
  early with a named limit before any wave is dispatched, both self-tested (73/73,
  including a test that reads the workflow file itself and fails if the declared wave jobs
  and the constant ever disagree). What the issue's own checklist demands and nobody has
  done: **an actual dispatched run with a world large enough to need a seventh wave, with
  `df -h` at each stage, recorded in `docs/large-worlds.md`.** That is hosted, external-state
  proof a local pass cannot manufacture, so the issue stays open on its own terms.
- **Issue #44** (Pages publishing against a real account) has its title claim **proven** —
  a real desktop-app-driven publish, in 35.5 seconds, with a screenshot. What remains, named
  by the issue's own thread rather than by this entry: the private-repository 403 → "needs a
  paid plan" mapping is untested (both throwaway proof repos are public, and converting
  either to private would destroy standing evidence for an unrelated feature), and the
  staging-time evidence (70 files, 5.8 MB, 35.5s) says nothing about a real multi-gigabyte,
  tens-of-thousands-of-tile map.
- **Issue #32** (SQL storage) landed its core port (`0bc90c2`) and a second push
  (`b32f423`) covering dialect resolution, driver-adapter parsing and error classification,
  and a byte-fidelity proof against file storage using real PRBM oracle fixtures, then a
  third pass proving MySQL, MariaDB and PostgreSQL against real Docker containers
  (`mysql:8.4.6`, `mariadb:11.4.7`, `postgres:17.6`) — 21 tests, all passing, in
  `SqlStorage.realServer.test.ts` — with one real finding fixed along the way: a real
  MySQL 8.4.6 server rejects a bound `LIMIT`/`OFFSET` parameter on mysql2's
  prepared-statement path, which `MySqlDriver.ts` now avoids by using client-side query
  escaping for every statement instead, with no SQL text changed. **Cross-compatibility
  with upstream's Java engine** (a map the Java CLI wrote, read by this port, and the
  reverse) still needs a JVM run nobody has done, and is the one item left in the issue's
  own acceptance checklist — issue stays open on that one named gap.
- **Issue #31** (Phase C exit criteria — `textures.json` parity, a real 1.12.2 jar, live
  blockstate resolution) had a plan posted and was picked up in this pass; as of this
  writing no results comment has landed yet. Do not write that Phase C's gate closed until
  that comment exists and says so.
- **Engine queue save/load is built and tested, never called.** Repeating it here because
  it is the shape of the project's most common defect: `saveRenderTaskQueue`/
  `loadRenderTaskQueue` exist on `RenderManager`, are unit tested, and nothing in a running
  process invokes either — no timer, no load-on-startup wiring in `packages/server` or
  `packages/cli`.
- **The CLI's named deferrals** (above) are current, not aspirational: `-u`/`--watch` prints
  what is missing and exits non-zero rather than pretending to watch.

### Hosted CI, honestly, as it stands right now

**No commit across this entire pass has produced a green hosted CI run.** The cause moved
during the pass — first `@node-rs/crc32`'s `.node`-loader failure (fixed by `e976ee9`), and
after that fix landed, run **30986840852** (the first commit with a genuine shot at green)
still came back **failure**. The cause this time is different and, as far as this entry can
tell, still unfixed: two Vuetify-rendering assertion failures that recur across every run
since — `packages/ui/src/components/palette/CommandPalette.test.ts` ("the Debug row should
render a switch, not a label") and `packages/ui/src/components/tabs/
tabGroupPickerMount.test.ts` (a button rendering the wrong label/icon combination,
`"( ): capturing group"` expected but `"Copy the flags"` received) — plus a
`[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled error. **This is not
hosted-runner flakiness alone.** A full local `npx vitest run` at commit `0bc90c2`, run
fresh for this entry, reproduced the same failure shape: **469 test files, 7,288 tests,
7,278 passed, 3 skipped, 7 failed, 2 unhandled errors**, in 224.5 seconds (up from 355
files/5,745 tests on 2026-08-04 evening — the suite grew by more than a hundred files during
this pass). Every CI run checked in this pass — `2b86de9`, `50e4b1a`, `6981bf9`, `d948635`,
`e976ee9`, `a5e5cf7`, `d4f83fa`, `8f61600`, `53e6474`, `cbc135c`, `0bc90c2` — came back
**failure** for this reason. The dedicated "Lint the workflow files" job is green on every
run checked; it is specifically the `Lint, build, test` job that fails. Do not write "CI is
green" for any commit named in this entry.

---

## Update, 2026-08-04 late evening — hosting a map on the internet is proven, and what is left

**Read this one first. It is the newest.**

### The short version

Four things happened. Two are finished and proven. Two are not finished, and are named
below so you do not have to guess.

1. **A rendered map can now be put on GitHub Pages, and this was tested for real.** Not
   "the code looks right" — a real map was published to a real website twice, and the
   website was opened in a real browser, and it worked.
2. **The parallel-render planner was making renders far slower than they needed to be.**
   Fixed, with a limit added so the fix does not break something else.
3. **The interface (the "frontend") had large gaps.** Most are now closed. Three are not.
4. **CI (the automatic test system on GitHub) was destroying its own results.** Fixed.

### 1. Putting a map on the internet

**Why this was hard.** A map is made of many small files called tiles. The engine saves
each tile compressed with gzip, so the file on disk is named `0.prbm.gz`. But the map
viewer in the browser asks for `0.prbm` — **without** the `.gz`. BlueMap's own web server
quietly rewrites that request, and so does this app's built-in server. **GitHub Pages does
not.** It only ever hands out the exact files that exist. So a map copied to GitHub Pages
would have every single tile fail to load, the page would go black, and nothing would say
why.

**The fix.** The viewer has a setting called `clientDecompression`. When it is on, the
viewer asks for `0.prbm.gz` instead, and unzips the file itself in the browser. So before
publishing, the app turns that setting on. It then **checks that the files the viewer will
now ask for really exist on disk**, because turning the setting on for a map that was saved
*without* compression breaks it in the opposite direction.

The code is `design/packages/render-actions/src/pages/staticHost.ts`, function
`prepareStaticHost`. It also writes a file called `.nojekyll` (without it, GitHub deletes
any file whose name starts with `_`), measures the site against GitHub's size limits, and
refuses to publish a site that would not work.

**Proof it works.** A real map from a real CI render was published to
`DingDingChae/bluemap-pages-proof`. Asking that website for `…/z0.prbm.gz` returns **200**
(success) with gzip data. Asking for `…/z0.prbm` returns **404** (not found). That 404 is
the whole point: without the fix, every tile would return 404.

**The app can do this by itself, and that was tested too.** `PagesHost` in
`design/packages/app/src/main/pages/hosting.ts` was run against a real GitHub account. In
**35 seconds** it created a repository, prepared the map, pushed it, switched Pages on,
waited for GitHub to finish building, and checked the address answered. The result was
`status: live`, `verified: true`. GitHub issue **#44** has the full evidence and a
screenshot.

**What is still NOT proven** (do not claim these work):

- Publishing to a **private** repository. GitHub Pages needs a paid plan for those. The app
  is supposed to say so clearly. Nobody has tested that message.
- Publishing a **big** map. The test map was 70 files and 5.8 MB. A real world is tens of
  thousands of files and several gigabytes. Nobody has measured that.
- **Resume after a crash.** The code exists and was run once, and it correctly reused the
  old commit instead of uploading everything again. But it still *announces* the steps
  "staging" and "pushing" while doing neither. Either it is telling the user something
  untrue, or the shortcut is not working. See issue **#45**. The test needed is one that
  counts how many times `git add` really runs.

### 2. The planner was choosing slow renders

When a world is too big for one computer, the work is split into pieces called **shards**,
and GitHub runs them at the same time. The planner used to ask *"what is the smallest number
of shards that still finishes in time?"* For a big world that answer was **6**, each taking
almost 3 hours — while **64** slots sat empty. It met the deadline and wasted most of a day.

It now asks for as many shards as are useful, and stops when a shard would spend more time
setting itself up (downloading the world, installing, building) than actually drawing tiles.

**The trap that came with that fix, which matters.** Past **32** shards, the finished map is
delivered in **parts** that no single computer ever joins together. That means the app
cannot download it as one map, and it cannot be put on GitHub Pages. So sharding harder for
speed would have quietly taken the finished map away. The planner now stops at 32 unless the
time limit genuinely forces it further. Code:
`design/packages/render-actions/src/plan/plan.ts`.

### 3. The interface

Fixed in this session:

- The **command palette** now opens with `Ctrl+Shift+F` (it was `Ctrl+K`, which the project
  rules forbid), and it now reaches every page, every options-editor tab, and several panels
  that were previously unreachable.
- The **spoken copy** (the language modes and the two humour sliders) reached only about
  **5%** of the app's text. It now reaches **75%** — 1,435 of 1,914 pieces of text, across 19
  files in `design/packages/ui/src/copy/surfaces/`.
- A **notification box was see-through**, so the page's words and the notification's words
  were printed on top of each other and neither could be read.
- The **backup button** went grey without saying which of six conditions was unmet.
- The **appearance editor** had no search box on two of its three tabs.

**Not finished** — these are the next obvious jobs:

| What | Where it stands | Size |
|---|---|---|
| Spoken copy for the **world** screens | 15 of 234 pieces done | large |
| Spoken copy for the **project** screens | 5 of 184 done | large |
| Spoken copy for the **command palette** | 0 of 81 done | medium |

The guard test `design/packages/ui/src/copy/catalogueCoverage.test.ts` lists exactly which
screens are finished. Add a screen to that list when you finish it.

### 4. CI was destroying its own results

Every push started a test run, and each new run **cancelled the one before it**. Over an
afternoon, no run ever finished, so the branch had no pass and no fail — which looks like
"everything is fine" to anyone glancing at it, and is worse than a failure, because a
failure is at least visible.

The cause is that runs shared a *concurrency group*. Two separate things cancel a run in a
shared group, so the group was removed from `.github/workflows/ci.yml` entirely. Only the
**release** step still shares one, because the dim sum code name for a release is chosen by
counting how many releases already exist — two releases at once would pick the same name.

**A consequence you will notice:** runs no longer die, but they now **queue**, because
GitHub only lets so many run at once. Verdicts arrive late instead of never. If you want
them sooner, the lever is running fewer jobs per push: the Windows installer build, the
test-world render and the screenshots all run on every single commit and do not need to.

### The state of the tests, checked by hand

Because CI could not give an answer, the three checks were run locally:

- `npx vitest run` — **383 files, 6,236 tests passed**, 3 skipped
- `npx eslint .` — clean
- `pnpm -r run typecheck` — clean

Note that the tree moved between the three, because several agents were pushing at the time.
One duplicate-key error appeared and was gone minutes later; it was another agent's
half-finished edit, not a landed fault.

### Two traps that cost hours, so you do not repeat them

1. **The screenshot tool photographs a build, and it is not the build you think it is.**
   Running the build command in `design/packages/app` rebuilds only the background part of
   the app. Everything you can *see* is built by `design/packages/ui`
   (`pnpm --filter @material-bluemap/ui run build`). Fixing a component, rebuilding the app,
   and taking a new screenshot gives you a picture of the **old** interface, with every test
   still passing. A correct one-line fix was rewritten three times because of this. There is
   now a guard: `design/packages/app/test/freshBundle.ts` refuses to run the screenshot tool
   when any build is older than its source. Read its message rather than working around it.
2. **A rule test catches a thing done wrongly, and never a thing not done at all.** A screen
   with no search box passes a rule about search boxes. A screen with no spoken copy passes a
   rule about spoken copy being well formed. Whenever you add a rule test, add the opposite
   assertion beside it: a written list of the screens that must *have* the thing.

---

## Update, 2026-08-04 evening — the Pages publishing feature, front to back, and what is still unproven

### What this adds, in one sentence

A person can now take a map this computer rendered and put it on the internet, from the
`Publish to Pages` tab, without touching a terminal.

### The one fact everything here rests on

The engine writes hires tiles gzip-compressed (`0.prbm.gz`), and the viewer by default asks
for the *uncompressed* name (`0.prbm`). BlueMap's own web server, and this app's embedded
one, answer the uncompressed name out of the compressed file. **GitHub Pages does not**, and
has no configuration that could. So a map copied there 404s on every tile.

The fix is one flag: `clientDecompression: true` in the web app's `settings.json`, which makes
the viewer ask for the `.gz` names and inflate them itself. `prepareStaticHost` in
`packages/render-actions/src/pages/staticHost.ts` sets it and then *checks it against the files
actually on disk*, because a flag pointing the viewer at files nobody wrote is exactly as
broken as the problem it fixes.

That module was already proved against a **real** published site before this work: on
`DingDingChae/bluemap-pages-proof`, `maps/tiny/tiles/0/x0/z0.prbm.gz` returned `200` with
`content-type: application/gzip`, no `Content-Encoding` and first bytes `1f8b`, while the same
tile without `.gz` returned `404`, and the web app loaded and rendered geometry from Pages in a
headless browser. The flag is genuinely load-bearing, and that is measured rather than assumed.

### What was built

**Main process — `packages/app/src/main/pages/`** (`hosting.ts`, `ipc.ts`, `index.ts`).

- `preflight` runs `prepareStaticHost` with `write: false`, so it changes nothing at all, and
  reports the site's size, its file count, GitHub's 1 GB soft site limit and 100 MB hard
  per-file limit, any map missing files the viewer would ask for, what `gh` is on this machine
  as three separate situations, whether `git` exists, and the state of the target repository.
- `publish` prepares, stages, force-pushes an orphan commit, enables Pages, polls the build and
  then **fetches the published URL**. `status` becomes `live` only on a `200`.
- The push is read back from GitHub and the branch head compared to the commit just made;
  `pushVerified: false` is reported out loud rather than smoothed over.
- `stopHosting` disables Pages and deletes the publishing branch.

**The guard that matters.** Every publish writes `.material-bluemap-map.json` at the site root.
Before anything is pushed, *and again before anything is deleted*, the target branch is read: a
branch that exists and carries no such marker is **refused**. Publishing force-replaces the
branch, so without that check one mistyped repository name destroys somebody else's website.
There is no override and no fallback on that path, deliberately.

**Where the git directory lives.** Never inside the render output. The repository is at
`<userData>/pages-hosting/<renderId>/.git`, and every command is
`git -C <webRoot> --git-dir=<that> --work-tree=<webRoot> ...`. Copying a multi-gigabyte tile
tree into a staging directory first was rejected on arithmetic: it doubles the disk and the
time to produce a byte-for-byte duplicate of a directory already sitting there. Git writes
nothing into a work tree during `add`, `commit` or `push`.

**Progress is real.** Files are staged in batches of 2,000, handed to `git add` on stdin
NUL-separated, so the surface reports files staged out of files total. Tens of thousands of
small tiles is the normal case and a spinner over it is indistinguishable from a hang.

**Renderer — `packages/ui/src/components/pages/`** (`pagesBridge.ts`, `pagesHosting.ts`,
`PagesScreen.vue`, `index.ts`), mounted in `App.vue` as the `Publish to Pages` tab. The render
list is searched through the shared field that carries the regex builder; notices go to the
shared non-blocking corner; taking a site down is behind the two-key gate and declared in the
super-confirmation inventory. Its prose is in the copy catalogue, so the three language modes
and both per-language funny levels reach it: 17 voiced entries at five levels a side and 16
fixed strings, each with a `FACTS` entry pinning what a playful rewrite may not drop.

**Interrupted publishes are now durable.** `publish.json` is written before each stage with a
`stage` value. The recorded-sites card offers **Continue publishing** after a crash; once a
local orphan commit exists, resume checks whether that commit already landed and skips a second
staging/push before continuing Pages enablement, build polling and URL verification. The same
card offers **Refresh status**, which re-reads the Pages API and probes the saved URL, then writes
the new status and timestamp back to the record. The new `pages:resume` and `pages:status` IPC
channels carry those actions without exposing credentials.

### Verification

- `npx vitest run` from `design/`: the exact final count is regenerated at handoff. The Pages
  host now has **37** main-process tests (including resume and status refresh), and the renderer
  suite remains covered by the mounted screen and store tests.
- `npx eslint .`: clean. `pnpm typecheck`: clean across all 13 packages. `pnpm build`: clean.
- The screen is a **required** surface in the screenshot harness, so a run that cannot open it
  fails rather than quietly recording a gap.

### What is NOT proven, plainly

**The desktop publish sequence has never been run end to end against a real GitHub account.**
Every step is unit-tested against a fake process runner, on purpose: `gh` missing, `gh` signed
out, a branch somebody else wrote, a push GitHub does not show, a build that errors, a URL that
answers 404 — none of those can be produced on a machine where the thing works. But the real
sequence `gh repo create` -> orphan force-push -> `POST /pages` -> poll -> fetch has not been
executed against github.com from the application. Treat it as implemented and unproven.

Specifically unverified against reality:

1. The `-c credential.helper=!gh auth git-credential` push. It is exactly what
   `gh auth setup-git` writes, passed per-command so the person's global git config is never
   modified, but it has not been observed authenticating a real push on Windows.
2. `POST` / `PUT /repos/{o}/{r}/pages` and the shape GitHub answers with. The code reads
   `html_url` and `status` and treats an absent site as a 404, which matches the documented
   API, but no real response has been parsed.
3. The private-repository refusal. A free account's Pages `POST` is reported as needing a paid
   plan, which is what its 403 means; that mapping is from documentation, not from a refusal
   anybody here has seen.
4. Staging tens of thousands of files through batched `git add --pathspec-from-file=-` has not
   been timed against a real multi-gigabyte map.

The next person's shortest path to closing all four is one real publish of a small map to a
throwaway public repository, watching the events, and writing what actually happened here.

---

## Update, 2026-08-04 evening — the render manager, the task layer, and a strategy that scheduled every region twice

Two commits, read with `git show --stat` before being written about here. Note that the
split is not where the two messages suggest: **`3119425` carries the source for both the
worker pool and the whole task hierarchy**, and **`9f34cff` carries the 1,215-line test file
for that hierarchy**. `git log --diff-filter=A` over
`packages/engine/src/map/rendermanager/` confirms it.

### `311942567f8390c9d261665160381f0fe160b9a0` — the worker pool, the progress tracker, and a part size that is a choice

The engine could render a tile and could not render a map. The queue, the workers, the
ordering, the progress reporting and the retirement rules lived in Java and nowhere else, so
every full render went through the vendored jar. This is that layer: `RenderManager.ts` (773
lines), `ProgressTracker.ts` (148), and the task classes listed under the next commit.

**The structural fact worth keeping, and the one a plausible-looking version gets wrong: the
pool is not N tasks running side by side.** Every worker calls `doWork()` on the *same*
head-of-queue task until that task reports it has no more work, and only then does the head
retire. The parallelism lives *inside* a task. Giving each worker its own task would
benchmark faster and be a different program.

Java's locks became something else in five named places, and each one is written down where
it happened, because "JavaScript is single-threaded so this is fine" is how these ports
break. The load-bearing one pairs the head of the queue with the count of workers currently
in flight: retiring a task is only safe when there is no more work **and** nothing is in
flight, read at the same instant. Reading those two at two different moments retires a task
somebody is still working on, whose completion then decrements the count against the *next*
task, which never retires. The queue hangs rather than failing, which is the worst kind of
bug to find later. The guarantee is now syntactic — there is no `await` between the head
read and the return — so it can be checked by reading it.

**One thing has no upstream counterpart, and it is deliberate.** Java preempts its worker
threads whether they cooperate or not. An async loop is not preempted, and awaiting an
already-settled promise only drains microtasks, which run to exhaustion before any timer
fires. A pool over tasks that never await anything real would therefore starve the very
`stop()` call trying to reach it — unstoppable in the literal sense. The pool yields on
elapsed time instead, so the cost stays proportional to the work rather than to the number
of iterations.

The same commit made the split-archive part size a bounded choice rather than a constant:
**500 MB, 1 GB or 1.7 GB**, each labelled with what it trades. Smaller parts mean a failed
transfer costs less and the joining machine needs less room at once; larger means fewer
uploads and fewer requests. The default is unchanged so an existing install does not
silently change what it publishes. The ceiling is 1.7 GB rather than the 2 GB asset cap
because the margin is the point: it is what stops an upload failing after the bytes have
already been read and hashed. See `packages/app/src/main/files/partSize.ts` and
`packages/parts/src/partSize.test.ts`.

### `9f34cff887bac82af440bc651d02ad3bb9208d87` — the task hierarchy's tests, and three defects in the strategy it uses

The task layer is `RenderTask`, `MapRenderTask`, `CombinedRenderTask`, `MapUpdateTask`,
`MapUpdatePreparationTask`, `MapSaveTask`, `MapPurgeTask`, `StorageDeleteTask` and
`TileUpdateStrategy`. With it the engine has the whole of upstream's render loop rather than
the worker pool alone.

**It also fixed three defects in the `TileUpdateStrategy` this port already had, and the
first one had teeth.**

1. `fixed(force)` built a fresh object on every call instead of returning the two shared
   instances. `WorldRegionUpdateTask` compares its strategy by **reference identity**, and
   the render manager relies on that comparison to recognise a task it already holds. Two
   otherwise identical region tasks therefore compared unequal, so the same region was
   queued twice and rendered twice. There is now a test pinning the identity.
2. `FORCE_EDGE` was missing outright — the strategy that redraws boundary tiles when the
   render boundary moves but the world itself did not.
3. None of the three strategies were registered under upstream's keys. They are now, in a
   `Registry` in `TileUpdateStrategy.ts`.

Three further places where Java's semantics do not survive the crossing are recorded in the
code where they happen rather than assumed: `MapUpdateTask` has no public constructor,
because upstream tells its two forms apart by collection element type and both are arrays
here — sniffing the first element picks wrong for an empty list, which is exactly what the
preparation task passes when it resumes; the region set is keyed by coordinate rather than
by a JavaScript `Set`, which keys by identity and would queue a region twice again by a
different route; and the tile claim is serialised through a promise chain rather than a
synchronous prefix, because both sides of the claim await, and without it two callers both
see the cursor at the same tile and both render it.

### Two differences left in place on purpose

`WorldRegionUpdateTask` has a shared `run()` path that the closed Phase D gate measured.
Changing it would invalidate that result until the oracle is re-run, so two pre-existing
differences from upstream were **recorded and not changed**:

- **The periodic map checkpoint is missing.** Upstream saves the map every 60 seconds while
  a region update runs. `#complete()` here does not.
- **`run()` calls `#complete()` even when the region had nothing to do**, which writes chunk
  hashes upstream would not write. The sliced `doWork()` path does follow upstream here; it
  is `run()`, which predates the task layer, that does not.

Both are only observable on an incremental re-render, which is why a first-render oracle
never caught them. **This is work for the next person**: fix them, then re-run
`node tools/oracle/compare.mjs` at both sizes to prove the gate still closes.

### The rest of what landed on 2026-08-04, verified by `git show --stat`

| Commit | What it added |
|---|---|
| `d7cbd34` | Render in a Docker container or on this machine, a deterministic repair pass that diagnoses a failure instead of guessing, the project main process, and the history manager. Docs: `docs/docker-and-local.md`, `docs/automatic-repair.md` |
| `4a8a570` | The automatic-update subsystem: feed, controller, schedule, state, failure handling, the update banner and its status row. Also the reveal-in-Explorer path, the OneDrive Documents redirect, and a `-Xmx` heap ceiling for the render process. Doc: `docs/automatic-updates.md` |
| `039ee26` | Turned that updater on in the main process and exposed it across the bridge |
| `180c862` | Handing a render to GitHub's machines: plan, transport, sync, collect, fingerprint, and the CI-render screen. Doc: `docs/render-in-actions.md` |
| `b600dc3` | Let the renderer ask for a render it will not run itself, over the bridge |
| `f4d3abd` | A project is the thing you edit and the wizard is the quick way in: the projects screen, editor, maps and storages panels, plus the consent-staleness fix |
| `80369ec` | The EULA in front of people at first run, a tabbed EULA viewer, and per-surface dock placement. Doc: `docs/eula-and-consent.md` |
| `897ecad` | Remote renders over SSH, worlds from any release including split parts in another repository, and the render console. Docs: `docs/remote-render.md`, `docs/world-sources.md`. This is also the commit that finally tracked the console files `f4d3abd` had already started importing |
| `92c392f` | Fixed a projects-list adapter that read a result union as if it were the payload |
| `56fcd97` | Registered the remote-render and world-source subsystems, which nothing could reach, and mounted the update banner |

### Measurement

`npx vitest run` from `design/`, 2026-08-04 evening: **355 files, 5,745 tests, 5,741 passed,
3 skipped, 1 failed**, about 50 seconds.

| Package | Files | Passed | Package | Files | Passed |
|---|---|---|---|---|---|
| `ui` | 104 | 2,078 (1 failed, 1 skipped) | `app` | 98 | 1,542 |
| `engine` | 88 | 1,258 (1 skipped) | `config` | 8 | 205 (1 skipped) |
| `shared` | 9 | 196 | `render-actions` | 11 | 147 |
| `site` | 16 | 132 | `viewer` | 7 | 57 |
| `nbt` | 8 | 56 | `parts` | 2 | 33 |
| `worldgen` | 3 | 32 | `server` | 1 | 5 |
| `cli` | none yet | | | | |

The single failure was `superConfirmPolicy.test.ts` reacting to a then-uncommitted file,
`packages/ui/src/components/remote/remoteTargets.ts`, from a concurrent session. That session
declared the call twelve minutes later and the file now passes its 14 tests on its own. It was
never a defect in anything committed at `9f34cff`. The tree is moving fast enough to watch: a
run five minutes before this one reported 353 files and 5,721 tests.

`pnpm --filter @material-bluemap/ui build` succeeds locally, which is the exact step that
failed on the hosted runner for `80369ec`.

### CI, stated exactly

The last CI run on `main` with a verdict is
[30943812775](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30943812775)
on `80369ec` — **failure**, `Could not resolve "../console/annotations.js"` during
`pnpm build` of `packages/ui`, because `f4d3abd` committed the import while the console files
stayed untracked until `897ecad`. They are tracked now. Every CI run since has been
**cancelled by the next push**; runs for
`ecc5168` and `9f34cff` had not finished when this was written. The last successful CI run
on `main` is
[30935770990](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30935770990)
on `0008dd4`, which published `v0.1.0-build.196`. The Pages workflow did reach a verdict
more recently: run
[30949965713](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30949965713)
on `ecc5168` succeeded.

Neither "CI is green" nor "CI is failing" is a true statement about the current tip. There
is no hosted verdict for it, and there will not be one until pushes stop long enough for a
run to survive.

## Update, 2026-08-04 — destructive Pages actions now use the site gate

The Pages shell now carries the super-confirmation boundary all the way to its own destructive
controls in `2ba959d91fba9603c75e81b9e9602622a475a1de`: clearing notification history, closing a
single page, closing other pages, closing to the right, removing a tab group, and both bulk-close
directions. Each caller names the affected count, label, or group before the site's two-key
`RESET`/`ALL` plus full-range slider gate can resolve; cancellation leaves the state untouched.
The settings search clear control is localized on the same pass, and the site article and category
index describe the new boundary.

Local evidence for this source change is green:

- `pnpm exec vitest run --silent`: **349 files passed, 5,602 tests passed, 3 skipped**.
- `pnpm typecheck`: all **13 packages** passed.
- `pnpm lint`: passed.
- `pnpm build`: all workspace packages passed; the existing large-JavaScript-chunk notices are
  warnings only.
- `node scripts/build-changelog.mjs --check`: refresh follows this handoff update so the new
  commit is represented in the generated record.

The hosted CI and Pages verdict for this tip is still required; the previous live proof at
`80369ec080d1fda83376e0ccc026e9ccd3045b8c` remains historical evidence only. Untracked
`design/packages/engine/src/map/rendermanager/` files appeared during verification and were not
staged or changed by this Pages task.

## Update, 2026-08-04 — Pages publishing is a real app tab, with fresh captures

The desktop shell now carries a seventh page, **Publish to Pages**, at `22b475a` and the
follow-up copy/safety pass at `e7bd403`. `PagesScreen.vue` is not a decorative landing panel:
it lists the renders on this computer, keeps the repository owner/name/branch in the preflight,
shows the decompression setting and the 1 GB / 100 MB / private-plan caveats, and refuses to
publish until the user acknowledges that the whole map will replace that branch. A completed
publish is green only after the public URL answers; "GitHub says built" remains a separate,
unverified state. The `Pages` IPC bridge, guarded branch marker and stop-hosting report keep the
destructive path auditable, while the shared notification surface remains opaque.

`54559eb` adds the mounted component tests and a screenshot step for the Pages surface. The
global Playwright setup now checks that the UI, main process and preload bundles are newer than
their sources before any screenshot is taken, so an old bundle cannot produce a convincing green
capture. Local evidence at this continuation tip is **381 files, 6,174 passed, 3 skipped**;
Pages component/store tests add **32 passed**, and app typecheck plus lint are clean.

Hosted CI run
[`30960216270`](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30960216270)
and Pages run
[`30960216143`](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30960216143)
have both **completed** for the exact SHA `54559eb4c772b8778bfdda719cd0b8aae0a1558a`: Pages
`30960216143` **succeeded**, but CI `30960216270` was **cancelled** rather than passed, so this
SHA is not CI-verified by that run and no release or live-site claim is made from it. The older
successful Pages deployment recorded above remains historical evidence only.

## Update, 2026-08-04 — render console, remote/world-source wiring, and hosted Pages proof

The default branch now carries the complete remote-render, cross-repository world-source and
render-console implementation at `897ecad1662c59e5a87affd1d89627b289d91d71`, the world-scan
bridge repair at `92c392ff0d3f86081211951f00bf1c13b36d819e`, the site/docs follow-up at
`28bcd3a124bd2c6321d529569d5447528d33a73c`, the handoff correction at `cee6779b6b3eb2e5bbda4f365e983fb466c060d5`,
the registered bridge/update-banner wiring at `56fcd97fc6f00e9675a4e1fd70992f3e203bb77c`, and
the generated changelog refresh at `6e9033674dff637e8535b94c4d292c80e7669c03`. The renderer imports are therefore present in the
default-branch tree rather than relying on an uncommitted checkout.

The full local workspace gate is green at that feature tip:

- `pnpm exec vitest run --silent`: **349 files passed, 5,602 tests passed, 3 skipped**.
- `pnpm typecheck`: all **13 packages** passed.
- `pnpm lint`: passed.
- `pnpm build`: all workspace packages passed; the existing large-JavaScript-chunk notices are
  warnings only.
- `node scripts/build-changelog.mjs --check`: **53 versions and 171 entries**, every SHA resolved.

The Pages build and deployment for the previous default tip `80369ec080d1fda83376e0ccc026e9ccd3045b8c`
are externally verified: GitHub Actions run
`30943812059 <https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30943812059>`
completed successfully, and `https://ding-ding-projects.github.io/material-bluemap/` returned 200.
The deployed bundle contains the menu-search, regex-builder, appearance-coverage and dynamic
group-search markers. The Pages and CI runs for current tip `6e90336` are pending; a pending
workflow is not represented here as a green result or a live deployment.

## Update, 2026-08-04 — current continuation tip and workspace verification

The `pages-material3-full-continuation` linked checkout now carries the current default
branch through `b600dc3`. The Pages contracts in this
checkout are committed and pushed; the generated changelog reports **52 versions and 160
entries**, with every SHA resolved.

Local verification is now a full workspace gate rather than a site-only claim:

- `pnpm exec vitest run --silent`: **323 files passed, 5,108 tests passed, 23 skipped**.
- `pnpm typecheck`: all **13 packages** passed.
- `pnpm lint`: passed.
- `pnpm build`: all workspace packages passed; the existing large-JavaScript-chunk notices
  are warnings only.
- `node scripts/build-changelog.mjs --check`: current at 52 versions / 162 entries.

The config writer now preserves CRLF/LF input and emits native new-file line endings, and
the project-map fixtures explicitly model an empty `world` field. Hosted CI remains queued at
the current branch SHA and is not represented here as verified until it runs.

## Update, 2026-08-04 — every rendered Pages element and live group discovery

The clean `pages-material3-full-continuation` linked checkout starts from `origin/main` at
`0a99147`, while the main checkout's concurrent history/config work remains untouched. This
checkpoint adds two Pages-only contract fixes:

- `decoratePage` now walks every rendered HTMLElement through
  `packages/site/src/appearance/editor/coverage.ts`, so prose, headings, disclosure summaries,
  table cells, links and controls all receive the same Material 3 appearance context menu and
  anchored editor. Script/style/template plumbing is excluded because it has no user-facing
  appearance.
- The discovery tab now rebuilds only the per-group search surfaces when the persisted group
  list changes. Each new group receives its own anchored regex builder and independent query;
  removed groups destroy their field listeners instead of leaving orphaned searches behind.

The new regression coverage is `coverage.test.ts` and `discoveryView.test.ts`. Focused verification
currently passes **2 tests** and site typecheck passes. The full suite/build and hosted Pages proof
remain outstanding for this continuation.

## Update, 2026-08-04 — searchable tab, group and overflow menus

The same clean linked checkout now gives the shared site `Menu` primitive its own local filter and
guided regex builder. Tab, group, overflow and page-action menus pass localized labels into that
primitive, so each menu filters only its own command list, reports an explicit no-match state,
and restores focus through the existing overlay path. The search model is non-persistent; plain
text remains the default and regex is opt-in from the adjacent builder.

`packages/site/src/platform/Menu.test.ts` covers the field/list relationship, local filtering,
builder affordance and empty state. Focused verification now passes **3 tests** including the
appearance and dynamic-group regressions; the full suite, production build and hosted Pages proof
still need to be re-run for this additional change.

## Update, 2026-08-04 — site gate re-run after menu integration

The Pages package now passes `pnpm --filter @material-bluemap/site typecheck`, repository lint,
the full site Vitest suite (**132 tests across 16 files**), `pnpm --filter
@material-bluemap/site build` (211 modules), and `git diff --check`. The site build retains the
existing non-failing warning about the main JavaScript chunk exceeding 500 kB. The repository-wide
Vitest command is not a clean gate on this checkout: 21 engine tests cannot resolve the unbuilt
`@material-bluemap/nbt` package entry, and config fixture tests fail on the checkout's CRLF/LF
byte boundary; those failures are outside this Pages change and are reported as such.

The generated changelog was refreshed with `node scripts/build-changelog.mjs` and its check passes
from the repository root. Hosted PR checks and a real headless/runtime capture remain outstanding.

## Update, 2026-08-04 — shell regex slot now has a real provider

The shared `RegexBuilderSlot` had been constructed but never provided, which left the tab-list
menu and bulk-close builder buttons absent at runtime. `main.ts` now registers a non-persistent
provider backed by the same `SearchQueryModel`, bounded evaluator and anchored builder used by
the other search fields. Tab-list filtering carries the selected regex mode and flags into its
matcher, so opening the builder no longer silently falls back to plain text.

The site gate was re-run after this wiring: **132 tests across 16 files**, lint, typecheck and the
211-module production build pass. A hidden Chrome capture from the fresh preview server shows the
landing surface and the Search tab; the tab-list menu capture shows its own keyboard-focused
`Filter pages` field. The screenshot is local evidence only until the branch is pushed and GitHub
Pages rebuilds it.

## Update, 2026-08-04 midday — config controls, a history per folder, backups, and the door to the options editor

Six commits on `main`, in the order they landed. Every SHA below resolves; each was read with
`git show --stat` before it was written about here.

### `6b8ef7bd0075a2a817f33e68e0292a11d9649ff1` — selects that rendered blank, and colours without alpha

The premise going in was "too many text boxes"; the commit records that 82 of 90 fields
already carried a real control. What the sweep found instead was closed selects rendering
**blank** for values BlueMap itself writes: `storage-type` offered `file` and `sql` while the
Java default is `bluemap:file`, so a fresh install's own config matched no option and the
next interaction would have overwritten a correct value with a different spelling of itself.
The same shape sat on compression, loader, dialect and the dimension keys, and
`resolution-default` was a closed select over a float.

Selects now normalise registry keys before matching — a `keyNamespace` on the control says
which namespace applies — and where a file carries a value no option holds verbatim, the
control prepends an item carrying the file's own text, labelled with the matched option's
meaning when it is only a different spelling and flagged as unlisted when it is genuinely
unknown. Both colour fields now mount the application's continuous colour picker with alpha,
because upstream's `Color.parse` reads an eighth hex byte as alpha.

The guard is `design/packages/config/test/controlPolicy.test.ts`: it classifies each field's
real domain from its zod schema, asserts the control fits, and takes a second opinion from
upstream's own Java field types. Measured today: **14 tests** in that file, **11** in the new
`design/packages/ui/src/components/config/ConfigControl.test.ts`.

### `1b77779a4144ef97271c6727c9894e5d1646e724` — a local git history per config folder

Each config folder now gets its own isolated git repository beside the app's data directory
(`<userData>/config-history/<folder-slug>-<hash16>/`), never a `.git` inside the user's
folder. Every save snapshots the folder as it is, deletions included. Restore is append-only:
it snapshots what is on disk first, then writes the old files, then records the restore
itself as a new revision with a `Restored-From` trailer — no `reset`, no `amend`, no
`rebase`. The panel is a **History** tab in the config screen, reusing the changelog date
picker, deriving its action chips from the revisions actually present, and carrying the
regex-builder search field. Trimming is the only operation that deletes anything and sits
behind the super-confirmation gate; it refuses to empty a history.

The structural rule: **a failed history write never fails the save.** The git runner returns
failures as values rather than throwing, every IPC handler resolves, and the snapshot call
after a save is fire-and-forget.

Measured today: **74 tests** across the three history files —
`packages/app/src/main/history/ipc.test.ts` (37),
`packages/ui/src/components/history/historyModel.test.ts` (20) and `HistoryPanel.test.ts` (17).

### `157f4c3eb3cacff1d82b0010f59a5f5827d7710a` — `docs/config-history.md`

The article for the feature above, indexed from `docs/README.md`. Behaviour, configuration,
failure modes, security and verification.

### `8cbac6334136948301c8f83d8e57702ff71fdaf6` — backing a world up to release assets

Worlds and rendered maps can be packed, split and published as GitHub release assets, and
read back. Git LFS was rejected on cost, by name, in `main/backup/pointer.ts` and in
`docs/backup.md`: 1 GB free storage, bandwidth metered against every restore. Release assets
are free on public repositories and capped per asset rather than per account.

The pointer format is **not** this project's own. It is Desktop Material's Cheap LFS v1,
copied rather than reinvented, so a backup written here is readable by that application.
Metadata belonging to this application went into a separate `backup.json` asset rather than
into the pointer. The interop claim is scoped honestly and stays scoped here: the canonical
regexes are copied into a fixture and this writer's output is run through them, which proves
the format — **not** a round trip through an application these tests cannot run.

Restoring hands the chosen release to the existing downloads surface, which fetches parts,
checks each against its published SHA-256, rejoins them and verifies the whole file. A backup
whose upload stopped before the pointer went up is listed, marked unfinished, and offered no
restore button, because there is no digest to verify it against.

The screen is a fourth shell tab (`Backups`), with a test that opens it. Measured today:
**128 tests** across the nine backup files — 95 in `packages/app/src/main/backup/` and 33 in
`packages/ui/src/components/backup/`.

### `5c810d0277fc4cafbbcf76bafc3dca80c3d441e6` — the options editor opened on a locked door

Fixing the earlier provide/inject bug had a consequence nobody looked for. With no host the
editor used to fall back to a generated config set, so every tab and setting was on screen;
once it resolved a real bridge that fallback stopped applying, and the editor began opening
on "Nothing is open yet" with **no tabs at all** until a folder existed. That is what the
report "I don't see all bluemap configs available in gui" was actually about.

It now opens on the config folder BlueMap already uses when that folder is really on disk,
and otherwise on BlueMap's own defaults, labelled as not yet saved — deliberately *not*
reusing the no-bridge wording, which says "this build cannot write one". The commit records
154 settings across all eight tabs in both states; that figure is the commit's, not an
independent measurement here. What was checked here is the tab set:
`components/config/configSearch.ts` declares seven `SCREENS` and `ConfigScreen.vue` adds the
History tab, which is eight.

The same commit added the capture-harness gate. `attempt()` records a missing surface instead
of failing, which is right for a screen needing a Java runtime or a real GitHub account and
wrong for a screen that is simply part of the application: six options-editor captures had
vanished from the artifact while the job stayed green. `REQUIRED_SURFACES` now names six
surfaces — `Options editor`, `Options editor tabs`, `Options editor search`, `Options editor
regex builder`, `Profile manager`, `Notification corner` — and a run that cannot open one
fails.

### `8491f0d3c39a02358fe0adf213fece51603bdf90` — three stale capture selectors

The gate fired on its first CI run and turned the build red, which is the correct outcome.
Three selectors had been photographing around broken navigation:

1. The profile manager was opened from a floating button the tabbed shell deleted on purpose;
   the harness now opens the tab, and clicks the tab's **label** rather than the tab, because
   a tab carries its own close button and a click on its centre is a coin toss between
   selecting and closing it.
2. It then waited for the profile list to be *visible*. The listbox is always rendered, but
   with no maps and no servers it has no rows and therefore no height, and a zero-height
   element is invisible by Playwright's definition — so the wait was really waiting for
   somebody to add a server. It now waits for the element to be attached.
3. The notification history was renamed when a flat column of message strings became a real
   notification centre; the bell is now found by its class, because its label carries the
   unread count and changes with the corner.

### Verification, measured today

- `node scripts/build-changelog.mjs` — wrote both outputs; **49 versions, 134 entries (2
  unreleased), every SHA resolved**. `node scripts/build-changelog.mjs --check` then passes.
- `cd design && npx vitest run` — **276 files, 4457 passed, 3 skipped, 0 failed**, 30 s.
- `cd design && npx vitest run packages/ui/src/components/changelog` — **4 files, 68 passed,
  1 skipped**.

Per package, from the same run:

| Package | Tests | Package | Tests |
|---|---|---|---|
| `ui` | 1663 (1 skipped) | `engine` | 1150 (1 skipped) |
| `app` | 809 | `shared` | 196 |
| `config` | 190 (1 skipped) | `render-actions` | 147 |
| `site` | 127 | `viewer` | 57 |
| `nbt` | 56 | `worldgen` | 32 |
| `parts` | 25 | `server` | 5 |
| `cli` | none yet | | |

### CI, as it actually stands

These are read from the run list, not predicted. `success` and `failure` are recorded
verdicts; `in progress` means exactly that at the time of writing and nothing more.

| Commit | CI run | Verdict |
|---|---|---|
| `6b8ef7b` | 30923535221, 30924515607 | success |
| `1b77779` | 30924158389 | cancelled (superseded by a later push) |
| `157f4c3` | 30924276107, 30926223701 | success |
| `8cbac63` | 30926226591 | cancelled (superseded by a later push) |
| `5c810d0` | 30926891432 | **failure** — the `Screenshots` job, on the new gate |
| `5c810d0` | 30927851530 | **failure** — `Lint, build, test` |
| `8491f0d` | 30928687703 | in progress at the time of writing |
| `49af181` | 30929184907 | queued at the time of writing |

The two failures are different, and both matter:

- **30926891432** is the gate doing its job. The `captured every surface that needs nothing
  but the application` test failed with `Profile manager` and `Notification corner` in the
  skipped list, both `locator.click: Timeout 15000ms exceeded`. Those are the selectors
  `8491f0d` then fixed.
- **30927851530** is a different and still-open problem. `Lint, build, test` reported **1
  failed, 4435 passed, 24 skipped**, and the failure was
  `packages/app/src/main/backup/archive.test.ts > survives a file large enough to need more
  than one read chunk`, `Test timed out in 5000ms`. That file passes locally (11 tests). It
  is a timeout on a slower machine, not a wrong answer, and it needs an explicit timeout or a
  smaller fixture rather than a re-run.

### What remains

- **The archive-test timeout above.** Until it is fixed, `main` cannot go green, and so no
  release is published for this work.
- **No screenshots of the new surfaces yet.** The History tab and the Backups tab are not in
  `REQUIRED_SURFACES` and have no capture step, so the harness will not notice if either
  stops opening. Adding them is the obvious next step now that the gate exists.
- **Backup interoperability is format-proven, not round-trip-proven** — see the scoping in
  the `8cbac63` entry above.
- **The history covers config folders only.** Profiles, application settings and the
  maps-and-servers list are still not snapshotted, so a mistaken deletion there has no undo.
- The `154 settings` figure is the commit's own; no test asserts it, so it will drift
  silently if the schema changes.

### External-state dependency

Everything above about CI comes from the GitHub Actions run list for this repository and can
change after this was written. The two in-flight runs had no verdict when this section was
recorded, and nothing here should be read as predicting one.

## Pages continuation checkpoint (2026-08-04)

The `pages-material3-continuation` linked worktree carries the merged Pages contract work and
closes the next hosted-capture gap. The persisted shell language/tone settings now feed the
search package, so every regex field refreshes its visible label, placeholder, builder title and
results when the visitor changes mode or either funny slider. Search results carrying
`article#section` now land on the exact documentation heading rather than reopening the article
at its top. New Pages tabs and the command palette use live bilingual copy; the palette is also
registered as an appearance target and its command inventory is rebuilt from current settings.

The changelog date filter is now an anchored Material panel with month navigation, a 42-cell
keyboard calendar, range selection, typed ISO or slash dates, inline validation, named presets,
and copy/export status messages. The notification centre now has its own localized search,
explicit clear-history action, and Markdown export. The command palette now indexes every
documentation article and teleports to its exact disclosure. `decoratePage` registers the page's
semantic controls as instance appearance targets so the published Pages surface does not leave
its new cards, searches, dialogs or controls outside the editor.

The Pages tab strip now keeps its normal management menus while adding Edit tab appearance and
Edit group appearance, with Shift+right-click opening the same anchored editor directly. The
feature article is `docs/site/tab-appearance-editors.md`; the desktop application's equivalent
remains a separate cross-surface gap.

Verification in this linked worktree:

- `pnpm --filter @material-bluemap/site typecheck` — passed.
- Focused site tests — **127 passed** across 13 files, including localization, article-command,
  settings-tab search, content, date-range, changelog and search suites.
- `pnpm lint` — passed.
- `pnpm build` — passed for all workspace packages; the site production bundle transformed 205
  modules.
- `node scripts/build-changelog.mjs --check` — passed (44 versions, 123 entries).
- Hosted CI run [30890865475](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30890865475)
  passed workflow lint, **4,232 tests with 22 skipped**, all seven jars, Java test-world render,
  the Windows installer, and the full screenshot suite. The screenshot correction is therefore
  verified on the merged default branch, not merely on the continuation branch.
- Pages workflow [30892326119](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30892326119)
  passed both site build and deployment. The live bundle at
  `https://ding-ding-projects.github.io/material-bluemap/` contains the settings-tab search and
  article command palette strings from the merged build.

This is source, type, focused-unit, lint and production-bundle evidence. A cheap headless
Windows capture of the live GitHub Pages site remains a separate runtime/UI boundary.

The settings page now gives every schema tab its own scoped search field and adjacent full regex
builder. The page-level field remains the cross-tab index; local fields combine with it without
sharing query, matcher or invalid-state storage. See `docs/site/settings-tab-search.md`.

## Pages rewrite checkpoint (2026-08-04)

The linked Pages worktree `pages-material3-rewrite` rewired the site entry point so the existing
Material 3 modules are reachable from the published shell instead of sitting as unmounted
contracts. The new `Search` tab mounts documentation, settings, current-strip, every-group,
group-name, master-tab, and both bulk-close searches; each field keeps its own anchored full
regex builder. `Ctrl+Shift+F` opens a persisted bounded/full-window command palette whose rows
can reveal pages, settings and appearance actions. `Changelog` parses the committed
`CHANGELOG.md`, offers date presets and typed date bounds, and exports/copies the filtered view.
`Notification centre` exposes the existing toast history. Settings search now attaches its own
builder, and the destructive settings reset uses two independent key challenges plus a full-range
authorization slider with Escape and reduced-motion handling.

Evidence from the clean linked worktree:

- `pnpm --filter @material-bluemap/site typecheck` — passed.
- `pnpm --filter @material-bluemap/site exec vitest run` — 119 tests passed across 9 files.
- `pnpm --filter @material-bluemap/site build` — Vite production build passed (140 modules).

This is source, type, unit, and production-bundle evidence. A cheap headless Windows capture of
the live GitHub Pages site remains a separate runtime/UI boundary and is not claimed by these checks.

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
- **JDK provisioning is proven against the real network on Windows, but not from the
  button.** Opt-in tests (`MBM_REAL_JDK_DOWNLOAD=1`) have resolved real Adoptium metadata,
  downloaded a real Temurin `jdk-25.0.4+7` archive (141,164,204 bytes, x64/windows),
  verified its real SHA-256, extracted it with the bundled `tar.exe`, and run the extracted
  binary to confirm it reports `25.0.4` — with `JAVA_HOME` and `PATH` blinded so
  `ensureJava` genuinely took its provisioning branch rather than finding the machine's own
  JDK. A wrong digest is refused and the bytes deleted; a transfer aborted at 95% resumes
  from that byte offset over a real HTTP range request. Two agents ran this independently.
  Still unproven: nobody has pressed `Download Java` in a packaged build and watched it
  finish, the proof is Windows-only, and because the tests are opt-in, CI never runs
  them — so no automatic gate stops this regressing.
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

---

## Update, 2026-08-04 — Minecraft 1.12.2 read end to end, and where it stops being right

The project claims support for "MC 1.12.2 to 26.x". The modern half of that is measured by
the Phase D gate. The 1.12.2 half had never been exercised past a single hand-built
two-chunk fixture, so this session built a real 1.12.2 world and rendered it.

**Read this part first if you read nothing else:** the chunk reader is correct and is now
proved exhaustively; the *render* of a 1.12.2 world against a modern resource pack is not,
and four block-states come out wrong. Neither statement is a guess — both are measured, and
the second names the exact blocks.

### Why there is no oracle for this, and what was used instead

Upstream BlueMap 5.22 has no pre-flattening chunk loader.
`vendor/BlueMap/core/src/main/java/de/bluecolored/bluemap/core/world/mca/chunk/` holds
`Chunk_1_13`, `Chunk_1_15`, `Chunk_1_16` and `Chunk_1_18` and nothing older, so **there is
no Java render of a 1.12.2 world to compare bytes against, and there cannot be one** without
reviving `v0.10.3-mc1.12`, whose output format predates everything this engine writes. The
byte-exact gate `compare.mjs` runs for modern worlds is impossible here. Two substitutes
were used instead, and both are weaker claims than byte equality:

1. **The generator as ground truth.** `worldgen` is a pure function of its seed, so the
   test regenerates the same chunks in memory and compares the reader's answer against what
   the writer was handed, block by block.
2. **A control render of the same terrain.** Both formats are written from the same
   `TerrainGenerator`, so seed N produces literally the same blocks in a 1.12.2 world and a
   1.20.4 world. Rendering both and diffing the material tables isolates the format:
   anything in one and not the other is a difference in how the world was *read and
   resolved*, not in what was generated.

### What was added

- **`worldgen --format 1.12.2`** (equivalently `--data-version 1343`). Writes the
  pre-flattening chunk layout: `Level.Sections[].Blocks` as a `byte[4096]` of numeric ids,
  `Data` as a `byte[2048]` nibble array of 4-bit metadata, the optional `Add` nibbles for
  ids above 255, `BlockLight`/`SkyLight`, biomes as a flat `byte[256]` on the `Level`
  compound, `HeightMap` as an `int[256]` of absolute y, and a 1.12.2 `level.dat`
  (`RandomSeed`, `generatorName`, `MapFeatures`, and deliberately **no**
  `WorldGenSettings` — a real 1.12.2 world has none, so the reader falls back to the modern
  overworld box exactly as it would in the wild). New files: `legacyVersion.ts`,
  `legacyMappings.ts`, `legacyChunkNbt.ts`, `legacyLevelDat.ts`.
- **`design/packages/worldgen/test/legacy-worldgen.test.ts`** — 13 tests, about 1.3 s.
- **`tools/oracle/render-1-12.mjs`** — generates both worlds, renders both with the same
  `render-ts.mjs` driver `compare.mjs` uses, parses the PRBM tiles, and runs 14 assertions.
  It is a script rather than a unit test because it needs a client jar, BlueMap's
  `resourceExtensions.zip`, a 2,100-texture resource-pack load and two full renders. Nothing
  is softened by that: every check is an assertion and a failure exits non-zero.

The generator reports every block 1.12.2 cannot express instead of dropping it silently
(`substitutions` in the JSON summary, and on stderr). At seed 22 that is copper ore
(1.17, becomes gold ore) and `grass_block[snowy=true]` (1.12.2 had no `snowy` property;
the reader's `SnowyExtension` derives it back, and the test asserts it does). Deepslate and
its ores would be substituted too but live below y=0, which this era's world box does not
have, so they are never written.

### What is now proven about reading a 1.12.2 world

`npx vitest run packages/worldgen` — 13 legacy tests green. The strongest of them walks
**every one of 1,048,576 block positions** of a 64x64 world and asserts the reader returns
exactly the block-state that position's numeric id and metadata nibble mean. The expected
value is resolved the long way round — writer's id/meta, then the same
`assets/legacy/blockIds.json` the reader consults — so an id both sides agree on but that
is *wrong* cannot pass. Also asserted: `DataVersion` 1343 dispatches to `Chunk_1_12`; the
metadata nibbles survive (granite and andesite are not stone, spruce and birch logs are not
oak); bedrock sits at y=0 and every y below reads back as air; every biome byte resolves
through the bundled legacy table; `HeightMap` comes back as an absolute y with no
world-floor offset; sky-light is 15 above the terrain and 0 at the surface; and
`SnowyExtension` restores `snowy` on grass blocks — false where plain grass was written,
true where the snowy variant was and a snow layer sits above — while the raw chunk carries
no properties at all.

### What is now proven about rendering one

`node tools/oracle/render-1-12.mjs` — 14 checks, all passing, on a 128x128 world at seed 22
(8x8 chunks, five biomes). The 1.12.2 world renders: **9 hires tiles, 306,252 vertices, 23
distinct materials**, and

- every tile parses as valid PRBM with a generic reader that arrives *exactly* at the end
  of the file, so no tile is truncated, mis-padded or inconsistent with its own vertex
  count;
- every tile carries the seven vertex attributes the viewer reads, in order;
- every material index resolves to a `textures.json` entry with a real embedded PNG;
- **no part of the map is the missing-texture placeholder** — `bluemap:block/missing` is 0
  vertices;
- the legacy render wrote a hires tile at every coordinate the modern control did, and drew
  nothing the control does not.

That is a real map, not a tile count.

### Where it stops being right — the finding

Rendered against the modern (26.2) client jar plus `resourceExtensions.zip`, **four
block-states come out wrong**, and the cause is not in the chunk reader. The reader hands
back precisely the pre-flattening block name the numeric id means; nothing then translates
that name into a modern one before the resource pack is asked for a model. Three
qualitatively different failures follow:

| Block-state | What the generator wrote | What happens | Why |
|---|---|---|---|
| `minecraft:grass` | the grass **block** (id 2) | renders as a grass **tuft** | `resourceExtensions.zip`'s `mc1_20_3` overlay defines `minecraft:grass` as the modern tuft (1.20.3 renamed the tuft to `short_grass`). The two names swapped meaning at the flattening |
| `minecraft:snow` | the snow **block** (id 80) | renders as nothing | mirror image: in a modern pack `minecraft:snow` is the snow **layer**, whose variants are keyed on `layers`, which the legacy state has no way to carry |
| `minecraft:snow_layer` | a snow layer (id 78) | renders as nothing | the name was removed by the flattening; no blockstate answers to it |
| `minecraft:podzol` | podzol (id 3, meta 2) | renders as nothing | survived the flattening but gained a `snowy` property, and 26.2 keys its variants on it, so no variant matches |

The most damaging is `minecraft:grass`, because it fails *confidently*: roughly eleven and a
half thousand grass cubes became that many cross-shaped plants (a cross is 12 vertices, so
the arithmetic is visible in the numbers below). `short_grass` carries **139,728 vertices
against the control's 1,944 (71.9x)** — the control's figure being the world's *actual*
grass tufts — and with the ground no longer occluding, `dirt` (10.0x) and
`stone` (10.4x) become visible through it. A set difference alone would have missed this
entirely — the texture is present in both renders — which is why the harness also compares
quantities and pins the ratios.

`grass_path`, `stonebrick`, `fence`, `melon_block` and 92 other pre-flattening names are in
the same position; they simply do not occur in this seed's terrain. Of the 417 distinct
block names `blockIds.json` can produce, **96 have no blockstate in a 26.2 resource pack**.

**This is a resource-resolution gap, not a world-reading one.** Two fixes are possible and
neither is in scope here: give the render an era-matched 1.12.2 resource pack, which is
exactly what `LegacyResourcePackExtension` and `LegacyResourceNames` were written for and
what upstream v0.10.3 shipped; or add a flattening rename table between `BlockIdMapper` and
the resource lookup. The first could not be tested this session because it needs a 1.12.2
client jar and this work downloads nothing.

### How to re-run it

```bash
cd design && npx vitest run packages/worldgen          # the exhaustive decode proof, ~1.3 s
node tools/oracle/render-1-12.mjs                      # the render proof, ~1 min, 14 checks
node tools/oracle/render-1-12.mjs --seed 9 --size 256 --keep
```

`render-1-12.mjs` compiles the engine and the generator first (same reason the gate does),
and reuses the client jar and `resourceExtensions.zip` that `compare.mjs` already put in
`tools/oracle/out/gate/bluemap-data/`. **It downloads nothing**; if those files are absent
it says so and stops rather than fetching. Output goes to `tools/oracle/out/legacy/`,
including `render-1-12-report.json` with both material tables in full.

`KNOWN_LEGACY_RENDER_GAPS` and `KNOWN_DIVERGENT_MATERIALS` at the top of that script are the
finding written as a regression gate: the divergence must be **exactly** those sets. A new
entry appearing is a new bug; an entry disappearing means somebody fixed it and the list is
stale. Either way the run fails and says which.

### What remains unproven

- **There is no byte-exact oracle for 1.12.2 and there cannot be one with upstream 5.22.**
  Everything above is an internal consistency proof plus a same-terrain control. It says the
  reader agrees with the writer and that the legacy render agrees with the modern one except
  where documented. It does not say either matches what BlueMap v0.10.3 would have drawn.
- ~~Rendering with an era-matched 1.12.2 resource pack is untested.~~ **Tested on 2026-08-05
  (issue #31), and the four gaps above do NOT simply disappear under one — see the new
  section immediately below.** `LegacyResourcePackExtension` itself works correctly; the
  render pipeline built on top of it does not, for a related but distinct reason.
- **Only one of the twelve registered legacy block-state extensions is reachable from this
  terrain.** `BlockStateExtensions.ts` registers twelve, and the generator's blocks trigger
  exactly one of them — `SnowyExtension`, which is asserted. It places no stairs, fire,
  redstone, doors, nether fences, tripwire, walls, wooden fences, glass panes, double plants
  or chests, so the other eleven are still covered only by their own unit tests and the
  two-chunk fixture in `packages/engine/test/world-e2e.test.ts` (which reaches
  `WoodenFenceConnectExtension`). Teaching the generator to place a few of those structures
  would close it, and would be the highest-value next step for this area.
- **Forge block-id mappings are untested end to end.** `Chunk_1_12` duck-types a
  `getForgeBlockIdMapping` off the world and the modern `MCAWorld` does not provide one, so
  that whole branch is dead in practice and no generated world exercises it.
- **Nether and End dimensions in the legacy folder layout** (`DIM-1`, `DIM1`) are resolved
  by `MCAWorld.legacyDimensionFolder` but no generated world has them.

Verification for this section: `npx tsc -p packages/worldgen/tsconfig.json --noEmit` clean;
`npx eslint packages/worldgen packages/engine` clean; `npx vitest run packages/worldgen
packages/engine` — **88 files, 1182 passed, 1 skipped**; `node tools/oracle/render-1-12.mjs`
— **14 checks passed, 0 failed**. (`npx prettier --check packages/worldgen` reports style
issues, but it reports them for untouched files too — `chunkNbt.ts`, `packing.test.ts`,
`package.json`, `README.md` — so that is a pre-existing repository state, not something this
work introduced.)

### 2026-08-05 — the era-matched pack, tested (issue #31), and a new bug (issue #46)

Phase C's three exit checks (`ROADMAP.md`'s Phase C section, issue #31) ran for real this
session, including the one this file marked "untested" above. Two findings, in order.

**Getting a real 1.12.2 jar into `LegacyResourcePackExtension` at all needed two workarounds,
neither a bug:**

1. `MinecraftVersion.load("1.12.2", ...)` does not download a 1.12.2 jar. It clamps any
   request older than `EARLIEST_RESOURCEPACK_VERSION` ("1.13") up to that version — faithful
   to upstream's modern `MinecraftVersion.java`, which never resolves a resource-pack older
   than 1.13 that way. Worked around by downloading directly through
   `VersionManifest`/`Version`/`Download` (same classes, same SHA-1 verification) instead.
2. **A real Minecraft client jar carries no `pack.mcmeta` at all**, checked directly against
   three real jars spanning old and new (1.12.2, 1.21, 26.2 — none has one, all three have
   `pack.png`). Without it, `isLegacyPackRoot` never detects a pre-flattening pack, by design
   (a missing/malformed `pack.mcmeta` must not accidentally switch on the compat layer). A
   real deployment needs a companion `pack.mcmeta`-only root alongside the bare jar —
   BlueMap's own `packs/` folder mechanism is exactly for this. Supplied that way (see
   `resourcepack-e2e.test.ts`'s "Proof 4"), `isLegacy()` is `true` and five real
   pre-flattening blockstates (`stone`, `dirt`, `oak_planks`, `grass`, `snow_layer`) resolve
   to real, non-missing vanilla texture pixels. **The compat path itself works.**

**The render pipeline built on top of it does not, for an era-matched pack.**
`BlockStateModelRenderer.ts`'s `flattenLegacyBlockState` call is gated on `block.isLegacy()`
— the WORLD chunk's era — not on which resource pack is loaded. Against the modern pack
that is exactly right (it is the fix this file's `render-1-12.mjs` section above records).
Against an era-matched pack it runs backwards: `minecraft:grass` already resolves correctly
on its own (just proven), but the unconditional rename rewrites it to
`minecraft:grass_block` — a name that did not exist before the 1.13 flattening — and that
lookup fails. `resourcepack-e2e.test.ts`'s Proof 4 proves this surgically:
`pack.getBlockStates().get()` of the renamed key returns `null` in the exact same
era-matched pack that resolved the un-renamed key correctly two lines earlier.

`tools/oracle/render-1-12-era-matched.mjs` (new) corroborates it at the render level, same
seed `render-1-12.mjs` uses (22, 128×128): **zero grass-family texture vertices anywhere in
the gallery**, and `minecraft:blocks/dirt` at **43.6%** of the render vs **4.3%** in a
modern-pack control on the identical world — the same "ground no longer occluded from
above" signature this file's 2026-08-04 section recorded for the *original* modern-pack
grass bug, now reproduced the other direction. `BlockStateModelRenderer.ts`'s
`if (stateResource == null) return;` means the block is not drawn wrong, it is **skipped in
total silence** — arguably worse than the gap this rename table exists to fix, since the
modern-pack bug at least drew *something*. `podzol` is the clean counter-example: its rule
only injects a `snowy` property (`withDefault`) rather than renaming the key, so
`minecraft:podzol` still means `minecraft:podzol` after the rename, and it renders correctly
under both packs — confirmed against the real `podzol.json`, which also keys on `snowy` in
the genuine 1.12.2 assets (12,090 vertices rendered).

Filed as [issue #46](https://github.com/Ding-Ding-Projects/material-bluemap/issues/46): gate
the rename on the resource pack's era too, not just the world's.

Verification for this section:
`BLUEMAP_E2E_DOWNLOAD=1 BLUEMAP_ACCEPT_DOWNLOAD=1 npx vitest run
packages/engine/test/resourcepack-e2e.test.ts` — **13 passed**; `node
tools/oracle/render-1-12-era-matched.mjs --accept-download` — 2/2 structural checks pass
(real geometry, no crash). *Update, same day:* the FlatteningRename finding above was real
and is now fixed — see issue #46 and the dated section below. The script now asserts on
the fix rather than only logging it.

### 2026-08-05 — issue #31's last open half closed: modded `textures.json` parity, offline

The one thing left open after the previous section's three exit checks was check 1's
modded half: `textures-parity.mjs --modded <path>` existed but nothing had ever called it
with a real pack, because no legitimate modded resource pack was reachable under this
task's Mojang-only network policy, and none is committed to this repository. That
constraint has not changed. What changed is that the check no longer needs a real pack to
be genuinely exercised.

**`tools/oracle/fixtures/syntheticModPack.mjs` (new)** builds a small, fully synthetic
resource pack, entirely in code — the same "generate it, do not ship it" approach
`packages/engine/test/fixtures/vanillaShapedPack.ts` already uses for its own vanilla-shaped
fixture. The pack carries two things a real mod's pack would: a brand-new `testmod:`
namespace (two blocks — `glowing_ore`, `resonant_planks` — each with its own blockstate,
block model, item model and 16x16 texture) and an override of vanilla's own
`minecraft:block/stone` texture, mounted at higher priority than the client jar. `tools/`
has no dependencies (`tools/README.md`), so the textures are written by a small hand-rolled
PNG encoder, `tools/oracle/lib/pngEncode.mjs` — the encoding half of the pre-existing
`lib/png.mjs` reader, verified to round-trip through it before anything else was built on
top of it.

**Wiring the pack into both engines was most of the actual work.** `--modded`/
`--synthetic-modded` had a real java-side gap: `javaOracle.mjs`'s `writeReferenceConfig`
never wrote anything into the CLI's own `packs/` folder (`BlueMapService#getPackRoots`,
`common/.../BlueMapService.java:371-379` — `config.getPacksFolder()` defaults to
`<configRoot>/packs`), so `--modded` was accepted on the command line and then silently
ignored on the java side, exactly as the script's own doc comment already admitted. Fixed:
`writeReferenceConfig` now copies the extra pack into `<config>/packs/synthetic-mod-pack/`,
and `renderReference`'s cache stamp now includes a content hash of that pack (not just its
path), so a fixture regenerated with different bytes at the same path — exactly what this
builder does on every run — correctly invalidates a stale cached reference. The TypeScript
side needed less: `render-ts.mjs --resource-pack` already existed with the right
precedence (extra packs before `resourceExtensions.zip` before the client jar, matching
upstream exactly); only `tsEngine.mjs`'s `renderWithTypeScriptEngine` was missing the
parameter to actually pass it through.

**Verified twice, because "the key exists" is not "the pack mounted."** `textures.json`
already contains `minecraft:block/stone` in an unmodded render — vanilla's own stone block
has one. So the check does not stop at key presence: `textures-parity.mjs` decodes each of
the pack's three texture keys' embedded images on **both** engines and compares the
top-left pixel against the pack's own known solid colour. Vanilla's real stone texture is a
mottled multi-colour image with no matching flat run of pixels, so this could not pass by
accident.

Real output, `node tools/oracle/textures-parity.mjs --accept-download --synthetic-modded`:

```
  minecraft version:  1.21
  java textures.json:  1725 entr(ies)
  ts   textures.json:  1725 entr(ies)
  modded pack:         synthetic (.../synthetic-mod-pack)
                       all 3 of its texture key(s) present on both sides, and every one
                       whose expected pixel is known decoded to exactly that colour on
                       both engines (new namespace + vanilla override alike)

  RESULT: semantically identical. 1725 of 1725 gallery image(s) are pixel-identical but
  byte-different, which is two PNG encoders writing the same picture (decision D3)
  (24.1s)
```

A direct spot-check (not just the harness's own assertion) confirmed the same thing by hand:
`minecraft:block/stone` decodes to `rgba(90,40,160,255)` — this fixture's override colour,
not vanilla's real stone — identically on both the java reference and the ported render.
The vanilla-only path was re-run afterward with no flag changes and still passes
(1723/1723), so nothing about the wiring changed the unmodded behaviour.

**Disposition, judged against issue #31's own text.** The issue's checklist asks for
`textures.json` parity against "Vanilla 1.21 and one modded pack" — it does not require the
modded pack to be a real third-party download, and the actual thing at stake is whether the
extra-pack-loading code path (new namespace discovery through the atlas mechanism, and a
pack overriding a lower-priority root) behaves identically between engines. A rigorously
built synthetic pack answers that question as completely as a real one would; what it
cannot speak to is any quirk specific to one particular real mod's own resource-pack
shape, which no single pack — real or synthetic — would cover completely anyway. Judged
sufficient to close the check and, with checks 2 and 3 already passing and #46 already
fixed, **issue #31 itself**.

Verification: `node tools/oracle/textures-parity.mjs --accept-download` (vanilla,
unaffected) and `node tools/oracle/textures-parity.mjs --accept-download
--synthetic-modded` (modded) — both exit 0. `design/ROADMAP.md`'s Phase C section and phase
table updated to **Done**.

### 2026-08-06 — `-u`/`--watch` stops lying, closing issue #40's CLI half

`packages/cli`'s `-u`/`--watch` flag has existed since issue #42 landed on 2026-08-05, and
it always did exactly one real thing: run the one render it implied, then log an error and
exit 3 saying nothing joined a file-system event to a render task, naming issue #40's
`MapUpdateService` as the piece that was never wired in. `MapUpdateService` itself had
existed since that same day (`50e4b1a`, `packages/server/src/plugin/MapUpdateService.ts`)
with 8 tests of its own — it was never the missing logic, only the missing call site. That
call site is now built.

**`design/packages/cli/src/render.ts`** drops `EXIT_NOT_IMPLEMENTED` and adds
`startWatchers()`, returning a `RunningWatch` (`services`, `fullUpdateTimer`, `close()`).
`runRender()` now also returns its resolved `targets`, so the caller can hand the same
resolved map list to the watcher without re-resolving it a second time. This ports two
blocks out of upstream's `vendor/BlueMap/implementations/cli/src/main/java/de/bluecolored
/bluemap/cli/BlueMapCLI.java`: the `if (watch) {...}` block (~lines 102-118), which
constructs one watch per targeted map, and the `updateAllMapsTask` periodic-timer block
(~lines 182-197), which drives a full re-render on a fixed interval independent of
file-system events. One `MapUpdateService` is constructed per targeted map, reusing the
already-ported `packages/server/src/plugin/MapUpdateService.ts` as-is — nothing about its
watcher, debounce or dedup logic was touched or reimplemented here.

**`design/packages/cli/src/cli.ts`**: `CliResult` gained `watch: RunningWatch | null`. The
branch that used to build the exit-3 `EXIT_NOT_IMPLEMENTED` error for `-u` now calls
`startWatchers(...)`, reading `core.conf`'s `update-cooldown` (seconds, converted to
milliseconds) and `full-update-interval` (minutes, converted to milliseconds) — the same
two knobs upstream's own config exposes for this. `EXIT_NOT_IMPLEMENTED` is gone from the
`EXIT` table entirely, since nothing constructs it anymore; a now-dead `let exitCode` from
the old branching was inlined while this was in there.

**`design/packages/cli/src/index.ts`**'s `shutdown()` closes `result.watch` first, mirroring
upstream's own `shutdown` runnable (`BlueMapCLI.java:206`), and the keep-alive branch now
triggers on `result.server !== null || result.watch !== null` — a `-u` run with no HTTP
server still keeps the process alive to watch, exactly as it should.

**Tests, new and real.** `packages/cli/test/fixtures/fakeMap.ts` (new) is a fake `BmMap`/
`World` builder plus a blocking `WatchService`, used to drive `render-watch.test.ts` (new,
6 tests) through: one `MapUpdateService` per targeted map, started; a per-map throw during
watcher construction still leaves the rest watched (not aborted wholesale); the periodic
timer exists only when `full-update-interval > 0`, and firing it re-triggers every target;
no timer at all when the interval is 0; `close()` closes everything and is idempotent; and
the periodic timer's own trigger uses the shared `FORCE_NONE` strategy, not a fresh one.
`packages/cli/test/e2e.test.ts` gained one genuinely end-to-end case on top of those unit
tests: `runCli(["-c", configFolder, "-u"])` renders for real, exits 0, and returns a
non-null `watch`; the test then touches a real region file on disk and proves a real render
was scheduled from it. That assertion reads the `"Scheduled update for region-file:"` log
line rather than a queue count — a queue-count assertion was tried first and found to race,
because the live worker pool drains the task before a count taken after the touch can
observe it. That race was caught and fixed in this session, not inherited from anywhere.

**Two honest deviations, found and deliberately left alone rather than quietly patched
over:**

1. **Queue priority is not upstream's.** Upstream's `updateAllMapsTask` calls
   `renderManager.scheduleRenderTasksNext(...)`, which jumps the queue ahead of whatever is
   already scheduled. This port's periodic timer instead goes through
   `RenderDriver.triggerUpdate` → `scheduleRenderTask(...)`, a normal tail-enqueue. So
   upstream's periodic full-refresh jumps ahead of a backlog of pending region updates, and
   this port's queues behind it instead. This is **not something introduced by this
   change** — `runRender`'s own initial-render call already has the identical
   characteristic, and a check of `packages/server` today finds nothing anywhere calling
   `scheduleRenderTaskNext`/`scheduleRenderTasksNext`, upstream's "jump the queue" API, at
   all. It is written down here rather than silently carried forward because it needs an
   actual decision — add a "Next" scheduling path to `RenderDriver`, or accept and document
   the simplification — and that decision was not this task's to make unilaterally.
2. **Exception granularity is currently unreachable, not wrong.** Upstream distinguishes an
   `IOException` (logged as an error) from an `UnsupportedOperationException` — "not
   supported for the world-type", logged as a *warning* — when constructing a watcher for a
   map fails. `startWatchers` collapses both into a single `catch` that always logs an
   error. In practice this changes nothing today: `MCAWorld.createRegionWatchService()`
   never throws, and it is the only real `World` implementation this port has, so the
   warning path is dead code on both sides of the comparison. Recorded so it is not
   forgotten if a second `World` implementation is ever added.

Verification for this section: `pnpm --filter @material-bluemap/cli run typecheck` — clean.
`npx eslint packages/cli` — clean, after fixing one real `prefer-const` error the change
introduced. `npx vitest run packages/cli` — **29 passed, 0 skipped, 4 test files**.
`npx vitest run packages/server` — **42 passed** (`MapUpdateService` itself is untouched by
this change). Both `webappBundleBuilt`-gated e2e tests ran for real, not skipped, after
`npm install && npm run build` in `vendor/BlueMap/common/webapp`; the new `-u` test took
roughly 9 seconds and its log carries `Scheduled update for region-file: (0, 0) (Map:
overworld)`. Two guard tests were confirmed to actually guard, not just pass, by breaking
each on purpose and restoring it: removing the per-map try/catch turned the skip-on-throw
test red, and changing `> 0` to `>= 0` turned the no-timer test red. `design/ROADMAP.md`'s
Phase E section is updated below to close this half of issue #40; the two upstream
deviations above are recorded there too rather than only here. **CI has not run against
this change yet** — everything above is local verification only.
