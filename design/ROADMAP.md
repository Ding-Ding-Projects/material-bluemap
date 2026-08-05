# Roadmap

Phases from `../plan.md`; status is updated as each phase lands on the branch. Read
`docs/decisions.md` first: decisions **D17** and **D18** (2026-08-03) changed which engine
renders, and that change reorders some of what follows.

## Which engine renders, today and later

| | |
|---|---|
| **Local rendering today** | Upstream BlueMap's **Java engine**, built from the vendored source at `vendor/BlueMap` and driven by the app as a child process |
| **Local rendering later** | The **TypeScript mesher** in `packages/engine`, which keeps being written and takes over when it passes the Phase D gate |
| **The gate** | Decompressed PRBM bytes identical to the Java engine's, and lowres PNGs identical pixel for pixel, on every fixture world |
| **How you can tell which ran** | Every render writes `render.json` beside its output naming the engine, its version and the JVM. The app shows it. Nothing switches silently |

This reverses the pure-TypeScript position in D5 for the interval, not for the end state.
The reasoning and the cost are in `docs/decisions.md` (D17) and in `../plan.md`
(Amendment 1). The short version: the mesher is the largest and highest-risk part of the
port, and until it is finished the app renders nothing at all. Driving upstream's engine
means a world renders now, and it gives the mesher an exact oracle to be checked against
instead of an approximation that looks plausible.

**What is proven, on the machine D17 was decided on.** `./gradlew :cli:shadowJar` produces
`implementations/cli/build/libs/cli-5.22-27-shadow.jar` (6.4 MB, 34s warm), and that jar
rendered a generated 1000x1000 world to **961 hires PRBM tiles** plus lowres PNGs and
`textures.json.gz` in 80 seconds. `GRADLE_USER_HOME` points at `tools/oracle/.gradle`, which
is gitignored, so no machine-wide toolchain is touched.

**What that costs.** A JDK is required for local rendering; the app provisions a verified
Temurin build into its own `userData` when the machine has none, so nobody installs one by
hand, but the download is real and is the user's decision. There are two rendering paths to
maintain until the mesher lands, and the project's JVM-free claim is conditional until then.

**D18** follows from D17: since there is a JVM in the product, the six Minecraft-server
platform adapters (`fabric`, `forge`, `neoforge`, `paper`, `spigot`, `sponge`) and the Java
addon loader are no longer inert, so they are built and shipped rather than excluded. Plan
exclusions **S2 and S4 are withdrawn**; S1 and S3 still stand.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 0 | plan.md, submodules (+`v0.10.3-mc1.12` legacy tag), monorepo scaffold, CI | **Done** |
| A | Viewer port (65 files → TS), MD3 shell, Electron shell, embedded server + remote proxy, live-demo verification | **Done** |
| B | shared utils, NBT, compression, MCA parsing 1.12.2→26.x incl. legacy Chunk_1_12, e2e synthetic-world proofs | **Done** |
| C | Resource-pack pipeline (VFS, blockstates/models/atlases, textures, legacy compat, Mojang downloader, textures.json) | Ported. Exit criteria run 2026-08-05 (issue #31): textures.json parity **passes** (vanilla; modded unproven), live end-to-end resolution **passes**, legacy-jar loading **passes** but the era-matched render on top of it has a real, filed defect (#46). Not Done |
| J | **Java render path** (D17): toolchain discovery/provisioning, jar resolution, config writer, CLI runner, progress parser, provenance record, local map serving | Built. CI builds all seven jars and renders a test world with them on every green run; the app's own end-to-end flow is still proven by hand on one Windows machine. See below |
| D | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks | **Done, and the gate is closed.** `tools/oracle/compare.mjs` rendered a generated 1000x1000 world with both engines on 2026-08-04 and reported **identical**: 995 files matched, 961 of 961 hires tiles byte for byte after decompression, 24 of 24 lowres tiles pixel for pixel, all render-state decisions equal, neither side holding a file the other lacked. A 200x200 fixture on a different seed reports the same. Passing the gate does not itself switch the product over; D17 keeps upstream's engine rendering until that switch is made and verified on its own |
| E | RenderManager worker pool, watch re-render, full HTTP routes + SSE, config schema (every option), standalone server CLI + Dockerfile | **Part done.** See below for the split |
| F | Full options GUI (all settings, map wizard, storage editors, config import) | **Reachable, and it now opens on settings.** `App.vue` mounts the Material title bar, the world wizard, first-run setup and the settings surface. Three gaps closed: the preload never exposed the window controls (a frameless window with no minimise or close); only 6 of a map's 92 settings could reach a render; and (`5c810d0`) the editor opened on "Nothing is open yet" with no tabs once it resolved a real bridge, so it now opens on the config folder BlueMap already uses, or on BlueMap's defaults labelled as unsaved. Its controls were swept in `6b8ef7b`: registry-key selects no longer render blank against values BlueMap writes, and both colour fields use the continuous picker with alpha, kept true by `packages/config/test/controlPolicy.test.ts` |
| G | Docker hosting GUI (dockerode instance manager) | Pending |
| H | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade | **Part done.** SQL storages ported (issue #32, see below); command palette, marker editor, JS addon system, static export and the three.js upgrade remain Pending |
| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |
| Contracts | Regex builder everywhere · full tab system · per-element appearance editors · EN/HK-Cantonese/bilingual + funny-level · super confirmation · local version history (see `docs/contracts/`) | Pages mounts the discovery searches, live-localized command palette, anchored changelog range picker, notification centre, and two-key gate. **Local version history landed for config folders** (`1b77779`, `docs/config-history.md`): an isolated git repository beside the app data directory, append-only including restore, a History tab, and trim behind the two-key gate. **Projects joined it on 2026-08-04** (`f4d3abd`, `packages/app/src/main/project/history.ts`), under their own repository root so one repository never mirrors two folders. **Server profiles and application settings joined it on 2026-08-05** (issue #35, `profiles/history.ts` and `settings/history.ts`), each under their own repository root; the maps-and-servers list is covered by the same profiles history, per the issue's own text that it is one store viewed two ways. Remaining desktop-app contract work is tracked in the open issues |
| Pages | Material 3 GitHub Pages shell, tabbed discovery, repository-backed changelog, command palette, notification centre and responsive documentation surface | **Built and locally verified; the newest hosted proof is still a Pages deployment, not a CI verdict.** The site adds every-rendered-element appearance coverage, dynamic per-group discovery searches, searchable tab/group/overflow menus with adjacent builders, cross-platform config line-ending preservation, and a site-owned super-confirmation gate for notification clearing, tab closes, group removal and bulk-close actions (`2ba959d`). The desktop app now also has a `Publish to Pages` tab (`22b475a`, `e7bd403`) with preflight size/limit facts, guarded branch ownership, live-only status, durable resume checkpoints, recorded-site status refresh and a two-key stop-hosting gate. The screenshot harness captures it and refuses stale UI/main/preload bundles (`54559eb`). Local continuation verification is **381 files, 6,174 passed, 3 skipped** before this follow-up; the Pages host now adds 37 main-process tests for resume and refresh. Site typecheck/build and repository lint remain required. Pages run `30949965713` succeeded for `ecc5168` and run `30943812059` succeeded for `80369ec`, whose live site returned 200 with the menu-search, regex-builder, appearance-coverage and dynamic-group-search markers. The exact latest CI `30960216270` and Pages `30960216143` runs for `54559eb` remain pending. The `site` package contributes 132 of the workspace's tests. A runtime/headless capture of the live site remains a separate boundary |
| Delivery | Sign-in, private worlds, split archives, resumable renders, Actions rendering, packaging pipeline | **Landed.** Not a plan phase; see below |

Phase **J** is not in `plan.md`: the plan had no Java render path because it had no JVM.
It is numbered out of the alphabet deliberately so the original lettering keeps meaning what
it meant.

## Phase E, what is ported and what is not

Ported on 2026-08-04, in `packages/engine/src/map/rendermanager/`:

- **The RenderManager worker pool** (`3119425`, `RenderManager.ts`, `ProgressTracker.ts`).
  The queue, the workers, the ordering, the progress reporting and the retirement rules.
  The structure that has to survive review: every worker calls `doWork()` on the *same*
  head-of-queue task until it reports no more work, so the parallelism lives inside a task
  rather than across tasks. Java's locks became something else in five named places, each
  documented where it happened. One construct has no upstream counterpart — a yield on
  elapsed time — because an async loop that never awaits anything real starves the `stop()`
  trying to reach it.
- **The render task hierarchy** (source in `3119425`, its 1,215-line test file in
  `9f34cff`): `RenderTask`, `MapRenderTask`, `CombinedRenderTask`, `MapUpdateTask`,
  `MapUpdatePreparationTask`, `MapSaveTask`, `MapPurgeTask`, `StorageDeleteTask` and
  `TileUpdateStrategy`.
- **Three defects fixed in the existing `TileUpdateStrategy`.** `fixed(force)` returned a
  fresh object per call instead of the two shared instances, and because
  `WorldRegionUpdateTask` compares its strategy by reference identity — which the render
  manager relies on to recognise a task it already holds — the same region was queued and
  rendered twice. `FORCE_EDGE` was missing outright. None of the three were registered under
  upstream's keys.
- **The config schema half**, which landed early in `packages/config`.

Not fully ported, and so keeping this phase open:

- **The standalone server CLI and its Dockerfile — built on 2026-08-05 (issue #42), still
  short of what upstream's CLI does.** `packages/cli` was a one-line stub with no tests; it
  now mirrors `BlueMapCLI.main()`'s real branching (reusing `@material-bluemap/config`'s
  `cli/flags.ts` model, not a second copy of it), loads a real config folder the way
  `BlueMapConfigManager` does — writing upstream's own per-file/per-folder defaults, never
  a single-shot dump — resolves real resources through `MinecraftVersion`'s real
  consent-gated download, builds real `BmMap`s over `MCAWorld`/`FileStorage`, drives real
  renders through `RenderDriver`, serves real routes through `packages/server`'s handlers,
  and writes the webapp's real `settings.json` (`WebFilesManager.Settings`, field for
  field). Deliberately deferred, and said so out loud where the CLI is asked for it rather
  than silently doing nothing: `-n`/mod-resource scanning, `resourceExtensions.zip`
  parity, SQL storages, non-box render masks, and — the largest gap — `-u`/`--watch`,
  which exits non-zero naming issue #40's `MapUpdateService` as the still-unwired piece
  rather than pretending to watch. 3 files, 22 tests (`packages/cli/test`), including one
  end-to-end test that renders a real `packages/worldgen` world through a real resource
  pack and serves it, and a real subprocess spawn of the built `dist/index.js`.
  **`packages/cli/Dockerfile` was built and run for real**, not authored blind: `docker
  build -f design/packages/cli/Dockerfile .` from the repository root (`pnpm --filter
  "@material-bluemap/cli..." install`/`build`, then a `pnpm deploy --legacy` prune) produced
  a runtime image that rendered a real `packages/worldgen` world mounted read-only, served
  a real hires tile, `index.html` and `settings.json` over its mapped port, answered a real
  `POST /maps/{id}/update`, and — checked with `docker exec ... id` — runs as `uid=1000
  (node)`, never root.

Ported on 2026-08-05 (issue #40), in `packages/server/src/plugin/MapUpdateService.ts`
(`50e4b1a`):

- **The missing middle between a file-system event and a render task.** `WatchService` and
  `MCAWorldRegionWatchService` existed in the engine and `RenderManager`/`RenderDriver`
  existed to drive a render, but nothing joined the two. `MapUpdateService` is a port of
  upstream's `common/plugin/MapUpdateService.java`: it reads batches of changed
  region-positions off a map's `createRegionWatchService()` and, once a region has been
  quiet for a debounce window, constructs a real `WorldRegionUpdateTask` and schedules it on
  a real `RenderManager` — reusing `RenderDriver`'s exact task/scheduling layer rather than
  adding a second one.
- **Both hard parts the issue called out are upstream's own answers, not new inventions.**
  Bursts coalesce because `updateRegion` cancels and replaces whatever timer is already
  pending for a region (upstream's own `max(regionUpdateCooldown - timeSinceLastUpdate,
  5000)` delay formula, kept as constructor-overridable options so tests need not sit
  through 5+ real seconds). Dedup needs no new logic at all: every fire constructs
  `new WorldRegionUpdateTask(map, regionPos)` with the shared `TileUpdateStrategy.FORCE_NONE`
  singleton, so `RenderManager.scheduleRenderTask`'s own equals-based queue-containment
  refuses a region already queued — and a region already **at the head** (i.e. currently
  being worked on) is deliberately *not* refused, so a new event for it queues safely behind
  the running one instead of racing or being dropped, verified against the real
  `RenderManager`'s queue rather than assumed.
- **Tests are against real fixtures throughout** (`packages/server/test/map-update-service
  .test.ts`, 8 tests): a real `packages/worldgen`-generated world's real region file,
  touched, schedules exactly its own region; a real chokidar-backed watch service (not a
  mock) drives every burst/coalescing/cooldown/head-of-queue/error-surfacing case, the last
  proven with a live `process.on('unhandledRejection')` guard that never fires.
- **Not wired into `packages/cli`.** That package was mid-restructure by a different task in
  the same pass this landed in, so the bridge stops at a clean `start()`/`close()` API
  (`new MapUpdateService(renderManager, map).start()` per watched map,
  `await service.close()` on shutdown) rather than fighting over a file someone else was
  actively editing. The CLI hookup itself remains open.

Ported on 2026-08-05 (issue #41), in `packages/server/`:

- **The full HTTP routes and server-sent events.** `packages/server` was four files: a
  static handler, an HTTP server, the remote proxy and the index. Three commits added a
  fifth and sixth handler and a live-data layer alongside them, extending rather than
  rewriting the four: `MapStorageHandler.ts` (`d78bbbc`) ports
  `MapStorageRequestHandler.java`'s tile/settings/textures/assets routes and its exact
  gzip-negotiation rules against a real `MapStorage`; `SseConnectionManager.ts` and
  `LiveDataBroadcaster.ts` (`00261d4`) port `SseConnection`/`SseConnectionManager`/
  `LiveDataSupplierBroadcaster.java` — real Server-Sent Events, confirmed from the Java
  rather than assumed, since `MapRequestHandler.java` is the only upstream web file
  mentioning `text/event-stream`. `live/players.json` and `live/markers.json` answer with
  upstream's own empty shape (`{"players":[]}`, `{}`) rather than 404ing, honest stubs since
  local live-player tracking is still Phase I. `design/docs/deviations.md` now carries the
  formal entry for this phase's two intentional additions under "Server package
  (`packages/server`)": the `/maps/{id}/update` trigger below, and the
  `res.flushHeaders()` fix the SSE tests caught — Node buffers response headers until the
  first write, and nothing forced a flush on connect.

Not proven, made less true on 2026-08-05 (issue #29, landed with #41 above):

- **Something outside `packages/engine` now calls the render manager.**
  `packages/server/src/render/RenderDriver.ts` (`19103df`) constructs a real
  `MapUpdateTask` (via upstream's own `MapUpdatePreparationTask.updateMap`) and schedules it
  on a real `RenderManager`, exercised by a test that is not mocked at any layer
  `packages/engine`'s own `rendertasks.test.ts` leaves mocked — it drives a real
  `HiresModelManager` and reads real tiles back from a real `FileMapStorage`. A second test
  added on 2026-08-05 (issue #29, `packages/cli` work) closes the specific gap that one left
  open: it loads a real `packages/worldgen`-generated world through the real `MCAWorld.load`
  anvil reader, meshes it against a real (self-authored) `ResourcePack` loaded off a real
  directory, and asserts real hires tiles appeared in a real `FileMapStorage` — exactly what
  issue #29's own "done" checklist asks for, at the scale ("a tiny world is fine") it asks
  for. What is still true, and deliberately: local rendering still goes through upstream's
  Java engine per D17; the desktop app was not switched over to this driver, on purpose —
  that remains a separate, explicit piece of work issue #29 itself calls out of scope.
- **Both known differences from upstream in `WorldRegionUpdateTask` are now fixed.**
  Upstream's periodic 60-second `map.save` was implemented first, as `saveIfDue(60_000)` at
  completion. The second — `run()` calling `complete()` even for a region with nothing to
  do, writing chunk hashes upstream would not, observable only on an incremental re-render
  — was fixed on 2026-08-05 (issue #28): `run()` now returns before `#complete()` on the
  no-op path. Both fixes are proven by the full byte-exact oracle run to completion at both
  sizes after the second fix landed: the 200x200 fixture compared 63 files identically and
  the 1000x1000 fixture compared 995 files identically, including all 961 hires tiles, plus
  the 1.12.2 legacy check (14/14) since it depends on the same region-completion code.

Ported on 2026-08-05 (issue #30), in `packages/engine/src/map/rendermanager/serialization/`:

- **`SerializableRenderTask`, the polymorphic `RenderTaskAdapter`, `BmMapAdapter` and
  `Vector2iAdapter`** — upstream's four `serialization/` files, ported onto this package's
  own `@material-bluemap/nbt` (BlueNBT) implementation rather than JSON, matching upstream's
  on-disk shape. `RenderTaskAdapter` dispatches by a stable `{ type, data }` key
  (`map-purge`/`map-save`/`map-update`/`region-update`, upstream's own keys); an unknown
  `type` on read is refused with a readable `IOException` rather than guessed at.
  `BmMapAdapter` resolves a saved map id against a live `maps` set handed in by the caller —
  a name that no longer exists fails clearly instead of silently rendering nothing. One
  upstream bug was fixed rather than reproduced: `BmMapAdapter`'s not-found branch calls
  `reader.nextString()` a second time to build its own error message, which would corrupt
  the reader's position; the port reads the id once and reuses it.
- **Each task's `Serialized` form** — `MapPurgeTaskSerialized`, `MapSaveTaskSerialized`,
  `MapUpdateTaskSerialized`, `WorldRegionUpdateTaskSerialized` — added beside their tasks
  in the existing files, each with its own `ObjectSchema` (this port's stand-in for
  upstream's reflection) and a `deserialize()` that refuses a truncated/missing required
  field with an `IOException` instead of building a half-formed task. `MapUpdateTask`'s
  carries its full sub-task list and `currentTaskIndex`, so a resumed update skips every
  already-finished region rather than re-running it — the same checkpoint granularity
  upstream's own `Serialized` gives, no finer: a region that was mid-render when the process
  stopped restarts that region's tiles from the top on resume, because neither this port nor
  upstream saves the tile cursor.
- **Whole-queue persistence**: `saveRenderTaskQueue`/`loadRenderTaskQueue`
  (`RenderTaskQueueStorage.ts`), written and read through this package's own
  atomic-write convention (`<file>.filepart` then rename, `util/FileHelper.ts`) rather than
  upstream's `FileHelper.createFilepartOutputStream`. The file carries an explicit format
  `version`; a version that does not match, or a top-level structure that fails to parse at
  all (a genuinely truncated write), is refused and deleted wholesale rather than
  half-applied. A task with no `Serialized` form at all (`StorageDeleteTask`,
  `MapUpdatePreparationTask`) is filtered out *before* the list is written — writing it
  through the shared `LenientListAdapter`'s per-element skip, the way upstream's own
  `RenderTaskAdapter`/`LenientListAdapter` pairing would, commits to the pre-filter element
  count in the nbt stream and produces a corrupt file if any element writes nothing; this is
  closed at the one call site that matters rather than carried forward unverified from the
  Java. Individual bad entries elsewhere in the queue (an unloaded map, an unknown type) are
  still dropped one at a time and reported, exactly as upstream's own `LenientListAdapter`
  usage does.
- **`RenderManager.saveRenderTaskQueue`/`.loadRenderTaskQueue`** — thin methods added to
  `RenderManager.ts` itself (upstream has no equivalent; `Plugin#save`/`Plugin#load` reach
  directly for `getScheduledRenderTasks()`/`scheduleRenderTasks()`) purely so "can the
  render manager write its own queue out and read it back" — the issue's own wording — does
  not require knowing a separate module exists. Loading goes through
  `scheduleRenderTasks`, so the manager's own containment rule still applies to a restored
  task exactly as it would to a freshly-built one — including the documented exemption for
  whatever sits at the head, which a dedicated test exercises deliberately rather than
  fighting.
- **Round trip is the test, 19 of them** (`RenderTaskSerialization.test.ts`): every adapter
  and every task type serialize-then-deserialize back to a functionally identical task,
  including `TileUpdateStrategy` identity — a deserialized `fixed(true)` is asserted `.toBe`
  the shared `FORCE_ALL` singleton, not merely `.equal`, which is exactly the bug this
  repository's own history already produced once (see the `TileUpdateStrategy` entry
  above). A dedicated resume-after-crash test drives a two-region `MapUpdateTask` partway
  into its second region, serializes it, restores it against a *freshly constructed* `BmMap`
  over the same on-disk storage (not the same in-memory object — a genuine simulated
  restart), and proves by tile coordinate that the finished region is never touched again
  while the interrupted one is fully re-rendered from scratch. A further pair drives a real
  `RenderManager` end to end: schedule real tasks, save through the manager, restore into a
  fresh one, and confirm a task already queued behind the head is correctly refused rather
  than duplicated. The existing `rendertasks.test.ts`/`RenderManager.test.ts`/
  `ProgressTracker.test.ts` suites are untouched at 110 tests; `rendermanager/`'s own total
  is now 129.
- **Not this**: the app's own resumable-render machinery for GitHub Actions renders
  (`docs/resumable-renders.md`) is unrelated and untouched — that survives a crash by
  remembering which shards finished, not by serializing an engine `RenderTask` queue.
  `RenderManager` can now save and load its own queue, but nothing yet *calls* either method
  from a running process — no periodic-save timer, no load-on-startup wiring into
  `packages/server` or `packages/cli`. Wiring that in (upstream's `Plugin#load`/`Plugin#save`,
  on a timer and at shutdown) remains open, tracked separately from this issue's own scope.

## Delivery, which the plan never described

None of this is in `plan.md`, because the plan assumed a single desktop application rendering
locally in TypeScript. All of it is on the branch and tested.

| | |
|---|---|
| **Sign-in** | OAuth device flow, OAuth app by default with the GitHub app behind an override. Token in the OS credential store, refused rather than written in the clear when that is unavailable, never crossing the bridge, scrubbed from every error path |
| **Rendering in GitHub Actions** | Worlds too large for one job split across a matrix, in sequential waves past the 256-job cap. 961 of 961 tiles byte-identical to an unsharded reference, zero differences across 6,024,024 lowres pixels. **Issue #39 (2026-08-05):** the wave ceiling was hardcoded at 6 (1,536 shards max); it is now 12 (3,072 shards), driven by the plan rather than a constant, with a test that reads `render-world.yml` itself and fails if the declared wave jobs and `RENDER_WAVE_SLOTS` disagree. A new early disk-requirement check measures the runner's actual free disk against the plan's estimate and fails with a named limit before any wave dispatches, rather than letting a runner die mid-render. 73/73 tests pass. **Still unproven, and the issue stays open on this alone:** no dispatch of a genuinely large world has been run with `df -h` evidence recorded in `docs/large-worlds.md` — this is real, hosted-runner-only proof a local pass cannot manufacture |
| **Private worlds** | Sealed with AES-256-GCM and rendered on public runners, opaque HMAC-keyed identifiers, output published only to the private repository, no artifacts |
| **Resumable renders** | A crash, a shutdown or a six hour ceiling costs one wave rather than everything. Crash detection by app-instance id, not pid, which is reused |
| **Large downloads** | A release asset is capped at 2 GB, so oversized archives ship as 1.7 GB parts with per-part and whole-file digests, and the app downloads and rejoins them with resume |
| **Test worlds** | Generated in anvil format with no Minecraft and no network, a fresh seed every build, attached to every release |
| **Backups** | A world or a rendered map packed, split and published as the assets of a new GitHub release, with a pointer naming every part and its SHA-256 (`8cbac63`, `docs/backup.md`). The pointer format conforms to Desktop Material's Cheap LFS v1 rather than a rival format. Restore verifies each part and the whole file; an upload that stopped before its pointer went up is listed as unfinished and offered no restore. Git LFS was rejected on cost, by name. This is **format conformance, permanently** — checked against a fixture copy of the canonical patterns — and **not** interoperability: no round trip through the other application has been run in either direction. Settled as issue #36's Outcome B; see `docs/backup.md` |

Added on 2026-08-04. Each row was read with `git show --stat` before it was written here.
All of it is built and unit tested; what is **not** claimed is a hosted CI verdict or a
runtime capture, both of which are stated separately below.

| | |
|---|---|
| **Remote rendering over SSH** | `897ecad`, `packages/app/src/main/remote/`, `docs/remote-render.md`. Host-key handling, a preflight, a transfer step, a plan and an orchestrator, with the failure path reported rather than swallowed. Registered in the main process by `56fcd97`, which is what made it reachable at all |
| **Docker or this machine** | `d7cbd34`, `packages/app/src/main/runtime/`, `docs/docker-and-local.md`. One render plan that resolves to a container or to the local runtime, with its mounts, its process supervision and its web server |
| **Deterministic repair pass** | `d7cbd34`, `packages/app/src/main/repair/`, `docs/automatic-repair.md`. Diagnoses a failed render and proposes an edit, behind guardrails, with the evidence it used |
| **Cross-repository world sources** | `897ecad`, `packages/app/src/main/worldsource/`, `docs/world-sources.md`. A world fetched from any GitHub release, including one split into parts held in a different repository, with per-part and whole-file digests. The part size is a bounded choice of 500 MB, 1 GB or 1.7 GB (`3119425`) rather than a constant |
| **Rendering in GitHub Actions, driven from the app** | `180c862` and `b600dc3`, `packages/app/src/main/cirender/`, `docs/render-in-actions.md`. Plan, transport, sync, collect and fingerprint, plus the CI-render screen. Drives GitHub through the app's own sign-in or through an authenticated `gh` CLI, and says which credential is in play |
| **Automatic updates** | `4a8a570` and `039ee26`, `packages/app/src/main/update/`, `docs/automatic-updates.md`. The Squirrel feed the installer had been publishing since the beginning is finally consumed: feed, controller, schedule, state and failure handling, with a non-blocking banner offering a restart. The same pass added reveal-in-Explorer, a redirect for a Documents folder Windows moved into OneDrive, and a `-Xmx` heap ceiling for the render process |
| **Projects** | `f4d3abd`, `packages/ui/src/components/project/` and `packages/app/src/main/project/`. A project is the document the app edits — its maps, its storages, its settings — and the wizard is the quick way to make one rather than the only way in. Project saves are snapshotted by the same version history the config folders use, under their own repository root. `92c392f` fixed a projects-list adapter that read a result union as if it were the payload |
| **EULA and dock placement** | `80369ec`, `docs/eula-and-consent.md`. The licence is presented at first run and stays available afterwards in a tabbed viewer with search and export. Separately, each surface's dock position is a persisted per-surface choice |
| **The render console** | `897ecad`, `packages/ui/src/components/console/`, `docs/render-console.md`. Annotated engine output rather than a raw log. It is also the cause of the last red CI run: `f4d3abd` committed the *import* of `../console/annotations.js` into `renderRun.ts` while the console files themselves stayed untracked until `897ecad`, three commits later, so the hosted checkout at `80369ec` had an importer and no file to import |

## Phase J, what is built and what is proven

Built, unit tested and on the branch, in `packages/app/src/main/`:

- `java/` — JVM discovery (`JAVA_HOME`, then `PATH`, then the app's own copy, every
  candidate *run* rather than trusted by path), version checking against upstream's
  `JavaLanguageVersion.of(25)` pin, Adoptium metadata resolution, a resumable SHA-256
  verified download, staged extraction, and jar resolution for all seven implementations
  in both a packaged app and a checkout.
- `render/` — the config writer (every path absolute, HOCON strings escaped through
  `JSON.stringify`), the child-process runner and its cancellation path, the CLI log and
  progress parser, the orchestrator (consent checked first, before anything is spawned),
  the `render.json` provenance record, and `LocalMapHandler`, which serves a finished
  render to the viewer exactly as the remote proxy serves a remote one.
- `consent.ts` — the Mojang download decision: asked once at first launch, remembered
  forever, never asked again.

Since this section was first written, two of its four gaps have closed. What is proven now:

- **All seven jars are built by CI and attached to every release.**
  `.github/workflows/build-jars.yml`, called from `ci.yml`, compiles them from the
  `vendor/BlueMap` submodule at `e664c1a`. Release `v0.1.0-build.196` carries all seven with
  their SHA-256 digests.
- **CI renders a test world with the Java engine on every green run.** `ci.yml` has a
  `Generate and render a test world` job that generates a world with `worldgen`, renders it
  with the CLI jar, records what rendered it, and hands the result to the screenshot job.

What is still **not** proven, and so keeps this phase honest:

- The desktop app's own end-to-end flow has been driven by hand on one Windows machine. It
  has not run on macOS or on Linux.
- JDK provisioning has been unit tested against fakes. No real Temurin archive has been
  downloaded, verified and extracted by the app on a machine with no JDK.
- The 961-tile render was produced by invoking the jar directly. Reproducing it through
  the app's own orchestrator, from a render request to tiles the viewer opens, has not
  been captured as evidence.
- No adapter jar has been loaded by a real Minecraft server. They are built and published;
  nobody has run one.

## Phase C, what is done and what is not

Every file in upstream's `resources` package is ported and tested: the VFS, `Pack` with its
five-step mount and reverse-order overlays, both `pack.mcmeta` eras, `MinecraftVersion` with
a streamed SHA-1 and a defaultless accept-download gate, `DataPack`, the
blockstate/model/texture/entitystate data classes including the coordinate-seeded variant
PRNG, the `ResourcePack` orchestrator with its five phases and texture filter, the seven-file
atlas layer, and `TextureGallery` with `textures.json`.

**2026-08-05: all three exit checks have now actually run (issue #31), and the honest
result is mixed — 2 pass, 1 reveals a real defect.** "Ported" is still the more accurate
word than "Done"; see below for exactly which is which, and issue #31 stays open.

- **Check 1, `textures.json` semantic parity — PASS for vanilla, unproven for modded.**
  `tools/oracle/textures-parity.mjs` (new, `--accept-download`) pins Minecraft 1.21, renders
  a minimal world with both engines against the same downloaded-and-verified jar, and diffs
  their `textures.json` with the existing semantic comparator (`tools/oracle/lib/textures.mjs`
  — every field but the image and the entry order compared exactly, the embedded PNG on
  decoded pixels per decision D3): **1723 of 1723 gallery entries agree**, the only
  differences pixel-identical PNG re-encodes. No legitimate modded pack is reachable under
  this task's Mojang-only network policy, and none is committed to this repository, so that
  half is recorded as still unproven rather than faked. Two small oracle-harness bugs
  (`render-ts.mjs`'s `version.json` key handling; `renderReference`'s missing version-pin
  parameter) were found and fixed along the way — not port bugs.
- **Check 2, a 1.12.2 jar through the legacy compat path — the path itself works, the
  render on top of it does not.** `resourcepack-e2e.test.ts`'s new "Proof 4" downloads a
  real 1.12.2 client jar directly from the version manifest (`MinecraftVersion.load` clamps
  any pre-1.13 request up to 1.13 by design, so it cannot be the download vehicle here),
  discovers that **a real client jar carries no `pack.mcmeta` at all** (checked against
  three real jars), supplies the one missing file as a companion root the way a real
  deployment's `packs/` folder would, and proves `LegacyResourcePackExtension` then resolves
  five real pre-flattening blockstates (`stone`, `dirt`, `oak_planks`, `grass`,
  `snow_layer`) to real vanilla texture pixels. That part is a clean pass. But
  `tools/oracle/render-1-12-era-matched.mjs` (new) renders the same 1.12.2 world against
  that real era-matched pack and finds `BlockStateModelRenderer.ts`'s
  `flattenLegacyBlockState` still fires unconditionally on the world's era regardless of the
  pack's — rewriting an already-correct `minecraft:grass` into `minecraft:grass_block` (a
  name that did not exist pre-flattening), which the era pack cannot resolve, so the block
  is silently skipped rather than drawn: zero grass-family texture vertices, and
  `minecraft:blocks/dirt` at 43.6% of the render vs 4.3% in the modern-pack control on the
  identical world — the same "ground no longer occluded" signature this table was written to
  fix, now reproduced the other direction. `podzol`'s rule only injects a property rather
  than renaming the key and is unaffected. This closes the "era-matched resource pack
  untested" gap in this file's earlier legacy-render section with a real answer, and that
  answer is a bug — filed separately as
  [#46](https://github.com/Ding-Ding-Projects/material-bluemap/issues/46).
- **Check 3, the live end-to-end resolution — PASS.** This check already had a working,
  committed implementation ("Proof 2" in `resourcepack-e2e.test.ts`) — the issue's finding
  was that it had genuinely never been *run* with the consent flags set. It has now been
  run for real: a freshly downloaded, SHA-1-verified 1.21 client jar resolves
  `minecraft:grass_block[snowy=false]` blockstate → variant → model → parent chain → every
  face's texture → real, non-missing decoded pixels. 12/12 tests passed.

Verification for this section: `BLUEMAP_E2E_DOWNLOAD=1 BLUEMAP_ACCEPT_DOWNLOAD=1 npx vitest
run packages/engine/test/resourcepack-e2e.test.ts` — **13 passed**; `node
tools/oracle/textures-parity.mjs --accept-download` — **PASS, 1723/1723**; `node
tools/oracle/render-1-12-era-matched.mjs --accept-download` — runs clean (2/2 structural
checks pass, real geometry, no crash) but the FINDING above is real and unresolved.

## Phase H, SQL storages: what is ported and what is not

Ported on 2026-08-05 (issue #32), in `packages/engine/src/storage/sql/`: `SQLStorage`,
`SQLMapStorage`, `SQLGridStorage`, `SQLItemStorage`, `Database` and the four-dialect
registry (`MySQL`, `MariaDB` — sharing `MySQLCommandSet`, exactly as upstream's
`Dialect.java` shares one `Impl` between them — `PostgreSQL`, `SQLite`), implementing the
same `Storage`/`MapStorage`/`GridStorage`/`ItemStorage` interfaces `FileStorage` already
does. Every dialect's SQL text is transcribed verbatim from `AbstractCommandSet.java` and
the three `*CommandSet.java` files, checked by a 90-assertion statement-for-statement
contract test rather than eyeballed. `packages/engine/src/storage/StorageFactory.ts` is
new: the seam that turns a parsed `FileStorageConfig`/`SqlStorageConfig` from
`@material-bluemap/config` into a real, working `Storage` — before this, nothing built an
SQL storage from config at all, which was the defect issue #32 opened over.

Drivers are optional dependencies (`sql.js`, `mysql2`, `pg` — all pure JavaScript/WASM, no
native N-API code, consistent with the packaging constraint fixed in `e976ee9`), loaded
through a non-literal dynamic `import()` so esbuild cannot inline them into the app
bundle; a missing driver raises `MissingSqlDriverError` naming the package rather than
surfacing a raw module-resolution stack trace.

**Proven, with a real (WASM) SQLite engine**, not a hand-rolled fake: item and grid
round trips, gzip compression byte-identical between two independent compress calls
(Node's `zlib.gzip` embeds no timestamp), paging past 1000 rows for both grid tiles and
map ids, purge across multiple 1000-row rounds with monotonic progress, real file
persistence across a storage reopen, `StorageDeleteTask` wired against `SQLMapStorage`
exactly as it already is against `FileMapStorage`, and byte-for-byte identical hires
`.prbm.gz` tiles between file storage and SQL storage using the engine's own real PRBM
oracle fixtures (the same tiles `PRBMWriter.test.ts` checks against the real Java writer).

**Not proven — stated rather than glossed over:**

- **MySQL and PostgreSQL against a real server.** No server was available on this
  machine. What *is* checked: the exact SQL text (contract tests against upstream's Java
  source), connection-URL parsing, the `?` → `$1, $2, ...` placeholder translation
  node-postgres needs, and driver-error classification against synthetic errors carrying
  the documented codes (`ER_DUP_ENTRY`, SQLSTATE `23505`, etc.) — not against errors a
  real server actually produced.
- **Cross-compatibility with upstream's Java engine** — a map upstream's CLI wrote into
  SQLite read correctly by this port, and the reverse — which needs a JVM run this
  environment does not have. The schema and every statement are transcribed exactly from
  the Java source so that this *should* hold; "should" is deliberate, not "does".
- **`driver-jar`/`driver-class`** (a custom JDBC driver jar): there is no javascript
  equivalent of loading an arbitrary classpath jar at runtime, so `StorageFactory` refuses
  a config that sets either, by name, rather than silently ignoring the setting.

## Test counts

**Current: `npx vitest run` from `design/`, freshly run 2026-08-05, at `0bc90c2`: 469 files,
7,288 tests, 7,278 passed, 3 skipped, 7 failed, in about 225 seconds.** The per-package
breakdown below is the 2026-08-04-evening figure and is now stale in its totals — the suite
grew by more than a hundred files during the 2026-08-05 pass (`packages/server` and
`packages/cli` in particular went from a handful of tests to real suites; see their own
sections above) — but is kept for package-shape context until a fresh per-package count is
taken. The 7 current failures are `CommandPalette.test.ts`/`tabGroupPickerMount.test.ts` and
their neighbours; see "Hosted CI, the 2026-08-05 pass" above.

`npx vitest run` from `design/`, 2026-08-04 evening, at `9f34cff`: **355 files, 5,745 tests,
5,741 passed, 3 skipped, 1 failed**, in about 50 seconds.

| Package | Files | Tests | Package | Files | Tests |
|---|---|---|---|---|---|
| `ui` | 104 | 2,078 passed (1 failed, 1 skipped) | `app` | 98 | 1,542 |
| `engine` | 88 | 1,258 (1 skipped) | `config` | 8 | 205 (1 skipped) |
| `shared` | 9 | 196 | `render-actions` | 11 | 147 |
| `site` | 16 | 132 | `viewer` | 7 | 57 |
| `nbt` | 8 | 56 | `parts` | 2 | 33 |
| `worldgen` | 3 | 32 | `server` | 1 | 5 |
| `cli` | 3 | 22 (`npx vitest run packages/cli/test`, 2026-08-05, issue #42) | | | |

**Read the one failure before treating this as a broken tree, and note that it is already
gone.** It was `packages/ui/src/components/confirm/superConfirmPolicy.test.ts`, the guard that
refuses an undeclared destructive action, objecting to
`packages/ui/src/components/remote/remoteTargets.ts` — a file a concurrent session had not
committed yet. That session declared the call twelve minutes later, and the file now passes
its 14 tests on its own; the full suite has not been re-run since, so the totals above are the
earlier figure. The tree is moving fast enough to watch: a run five minutes before that one
reported 353 files and 5,721 tests.

The rule the guard enforces is worth stating plainly, since this is the second time it has
fired: a commit that adds a destructive call site must declare it in `DESTRUCTIVE_FILES` in
that same commit, or CI fails on that commit.

A green suite proves the ported code does what its tests say. It does not prove parity with
upstream, which is what the phase exit criteria above are for.

**The archive-test timeout is fixed.** `packages/app/src/main/backup/archive.test.ts >
survives a file large enough to need more than one read chunk` used to pass on a developer
machine and time out after 5 seconds on the hosted Linux runner (CI run 30927851530). It now
carries an explicit `{ timeout: 60_000 }`, and CI has since gone green on `main` — most
recently run 30935770990 at `0008dd4`, which published `v0.1.0-build.196`.

## Hosted CI, as it actually stands

**Superseded by the 2026-08-05 pass below — this paragraph describes an older window and is
kept only so the `80369ec` cause (a since-fixed import/file split across two commits) is not
lost.** For the current, honest CI state, read the next section instead of this one.

No CI run on `main` produced a verdict for that older tip. The last one that did was
[30943812775](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30943812775)
at `80369ec` — **failure**, `Could not resolve "../console/annotations.js" from
"src/components/world/renderRun.ts"` during `pnpm build` of `packages/ui`. The cause is worth
knowing exactly, because it is invisible on a developer machine where the file is simply
present: `f4d3abd` committed the import, and the file it imports was not committed until
`897ecad`, three commits later. `80369ec` sits between them. The console files were tracked
correctly by the time this pass started, and `pnpm --filter @material-bluemap/ui build`
succeeds locally, so that specific cause is gone — but a *different* cause has kept every run
in the pass below red, and it is real, not a re-run of this one.

## Hosted CI, the 2026-08-05 pass, as it actually stands

**No commit across this entire multi-agent pass has produced a green hosted CI run.** The
last CI run on `main` that **succeeded** is still
[30935770990](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30935770990)
on commit `0008dd4`, which published release `v0.1.0-build.196` — checked against the 100
most recent CI runs on `main`, none of which report `success`.

The cause is a real, locally-reproducible test failure, not hosted-runner-only flakiness.
Run [30986840852](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30986840852)
on commit `e976ee9` — the native-module fix expected to finally clear the way to green —
still came back **failure**, for a different reason than the one it fixed: two recurring
Vuetify-rendering assertion failures, `packages/ui/src/components/palette/
CommandPalette.test.ts` ("the Debug row should render a switch, not a label") and
`packages/ui/src/components/tabs/tabGroupPickerMount.test.ts` (a button rendering the wrong
label/icon), plus a `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled error. Every
CI run checked after it — `d948635`, `6981bf9`, `50e4b1a`, `2b86de9`, `a5e5cf7`, `d4f83fa`,
`8f61600`, `53e6474`, `cbc135c`, `0bc90c2` — also came back **failure**, all for the same
recurring pair. A full local `npx vitest run` at `0bc90c2` reproduces the same shape: 469
files, 7,288 tests, 7,278 passed, 3 skipped, **7 failed**, in ~225s. The dedicated "Lint the
workflow files" job (a separate `actionlint` step) is green on every run checked; it is
specifically the `Lint, build, test` job that fails. This has not been root-caused or fixed
by this pass — it is named here as the single most valuable next task, because it is the
reason the entire pass has shipped with no hosted verdict.

## Revealed by the 2026-08-04 work, now resolved

Kept for the record; every item below was open when this section was first written and is
closed now. See the 2026-08-05 HANDOFF.md entry for the evidence behind each.

- ~~Drive the render manager from something.~~ **Done (issues #29/#41).**
  `packages/server/src/render/RenderDriver.ts` constructs a real `MapUpdateTask` and drives
  it through a real `RenderManager`, proven against a real `packages/worldgen` world and a
  real resource pack. Local rendering still goes through the Java engine per D17, on
  purpose — that is a separate, explicit switch, not this item.
- ~~Decide whether to match upstream's empty-region completion semantics~~ **Done (issue
  #28).** `WorldRegionUpdateTask.run()` now returns before `#complete()` on a no-op region,
  matching upstream; the incremental parity check was re-run at both oracle sizes and both
  report identical output.
- **The first-class screen capture gate is now complete.** `packages/app/test/screenshots.spec.ts`
  photographs History, Projects, the CI-render screen and the EULA viewer as required local
  surfaces, and records the render console as an explicit runtime-dependent gap when no render
  is in flight. The captions name the real state instead of substituting a mock screen.
- ~~Extend the version history past config folders and projects~~ **Done (issue #35).**
  Server profiles and application settings are now snapshotted; the maps-and-servers list is
  covered by the same profiles history, per the issue's own text that it is one store viewed
  two ways.
- **The options editor inventory is pinned.** `configSearch.test.ts` now asserts the generated
  workspace exposes 154 settings across the seven configuration tabs, with History as the
  eighth navigation tab, so a schema change cannot quietly make the published screenshot and
  README lie.

## Open going into the next pass

- **Fix the recurring `CommandPalette.test.ts`/`tabGroupPickerMount.test.ts` CI failure**
  described above — this is what has kept every hosted run red through the whole
  2026-08-05 pass.
- **Wire `RenderManager.saveRenderTaskQueue`/`.loadRenderTaskQueue` into something that
  actually calls them** — a periodic-save timer and load-on-startup, in `packages/server`
  or `packages/cli` (issue #30's own follow-on, not closed by it).
- **Join `packages/cli`'s `-u`/`--watch` to `packages/server`'s `MapUpdateService`** — both
  exist; nothing calls the second from the first yet.
- **Prove MySQL and PostgreSQL storage against a real server**, and prove
  cross-compatibility with upstream's Java engine, both named as open in issue #32.
- **Fix `FlatteningRename` firing unconditionally on the world's era instead of also
  checking the resource pack's** (issue #46, found running Phase C's exit checks): it
  breaks an era-matched 1.12.2 render for every key-renaming rule (grass, snow, snow_layer,
  and ~90 more), silently skipping blocks a real 1.12.2 pack already resolves correctly.
  `tools/oracle/render-1-12-era-matched.mjs` is the regression gate to re-run afterward.
- **Obtain a legitimate modded resource pack and complete check 1's modded half** (issue
  #31) — `tools/oracle/textures-parity.mjs --modded <path>` is wired for it but nothing has
  fetched one, since this task's network use was limited to Mojang's own manifest/jar CDN.
- **Dispatch a genuinely large world through the render-world workflow** with `df -h`
  evidence at each stage, recorded in `docs/large-worlds.md` (issue #39's own remaining
  checklist item).
- **Test the private-repository Pages 403 mapping, and staging time on a real large map**
  (issue #44's two remaining sub-items).

## Deferred verification

lz4-java block-framing constants and PRBM byte-exactness get oracle validation when the
golden harness stands up in Phase D. D17 changes how that harness is built rather than
whether it is needed: the upstream jars are now built from the vendored source with Gradle
rather than pulled as a Docker image, and because the same jar is what renders locally, the
reference implementation is exercised on every render instead of only when someone
remembers to run the harness. Tracked as
[#3](https://github.com/Ding-Ding-Projects/material-bluemap/issues/3).
