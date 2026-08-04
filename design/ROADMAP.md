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
| C | Resource-pack pipeline (VFS, blockstates/models/atlases, textures, legacy compat, Mojang downloader, textures.json) | Ported, exit criteria not yet proven |
| J | **Java render path** (D17): toolchain discovery/provisioning, jar resolution, config writer, CLI runner, progress parser, provenance record, local map serving | Built. CI builds all seven jars and renders a test world with them on every green run; the app's own end-to-end flow is still proven by hand on one Windows machine. See below |
| D | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks | **Done, and the gate is closed.** `tools/oracle/compare.mjs` rendered a generated 1000x1000 world with both engines on 2026-08-04 and reported **identical**: 995 files matched, 961 of 961 hires tiles byte for byte after decompression, 24 of 24 lowres tiles pixel for pixel, all render-state decisions equal, neither side holding a file the other lacked. A 200x200 fixture on a different seed reports the same. Passing the gate does not itself switch the product over; D17 keeps upstream's engine rendering until that switch is made and verified on its own |
| E | RenderManager worker pool, watch re-render, full HTTP routes + SSE, config schema (every option), standalone server CLI + Dockerfile | **Part done.** See below for the split |
| F | Full options GUI (all settings, map wizard, storage editors, config import) | **Reachable, and it now opens on settings.** `App.vue` mounts the Material title bar, the world wizard, first-run setup and the settings surface. Three gaps closed: the preload never exposed the window controls (a frameless window with no minimise or close); only 6 of a map's 92 settings could reach a render; and (`5c810d0`) the editor opened on "Nothing is open yet" with no tabs once it resolved a real bridge, so it now opens on the config folder BlueMap already uses, or on BlueMap's defaults labelled as unsaved. Its controls were swept in `6b8ef7b`: registry-key selects no longer render blank against values BlueMap writes, and both colour fields use the continuous picker with alpha, kept true by `packages/config/test/controlPolicy.test.ts` |
| G | Docker hosting GUI (dockerode instance manager) | Pending |
| H | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade | Pending |
| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |
| Contracts | Regex builder everywhere · full tab system · per-element appearance editors · EN/HK-Cantonese/bilingual + funny-level · super confirmation · local version history (see `docs/contracts/`) | Pages mounts the discovery searches, live-localized command palette, anchored changelog range picker, notification centre, and two-key gate. **Local version history landed for config folders** (`1b77779`, `docs/config-history.md`): an isolated git repository beside the app data directory, append-only including restore, a History tab, and trim behind the two-key gate. **Projects joined it on 2026-08-04** (`f4d3abd`, `packages/app/src/main/project/history.ts`), under their own repository root so one repository never mirrors two folders. It does not yet cover profiles, application settings or the maps-and-servers list. Remaining desktop-app contract work is tracked in the open issues |
| Pages | Material 3 GitHub Pages shell, tabbed discovery, repository-backed changelog, command palette, notification centre and responsive documentation surface | **Built and locally verified; the newest hosted proof is a Pages deployment, not a CI verdict.** The site adds every-rendered-element appearance coverage, dynamic per-group discovery searches, searchable tab/group/overflow menus with adjacent builders, cross-platform config line-ending preservation, and a site-owned super-confirmation gate for notification clearing, tab closes, group removal and bulk-close actions (`2ba959d`). Pages run `30949965713` succeeded for `ecc5168` on 2026-08-04, and run `30943812059` succeeded for `80369ec`, whose live site returned 200 with the menu-search, regex-builder, appearance-coverage and dynamic-group-search markers in the deployed bundle. The `site` package contributes 132 of the workspace's tests. A runtime/headless capture of the live site remains a separate boundary |
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

Not ported, and so keeping this phase open:

- **Watch-driven re-render.** `WatchService` and `MCAWorldRegionWatchService` exist in the
  engine, but nothing joins a file-system event to a render task.
- **The full HTTP routes and server-sent events.** `packages/server` is still four files: a
  static handler, an HTTP server, the remote proxy and the index.
- **The standalone server CLI and its Dockerfile.** `packages/cli` is a stub with no tests.

Not proven, and worth stating plainly:

- **Nothing outside `packages/engine` calls the render manager.** It is exported from
  `packages/engine/src/index.ts` and consumed only by its own tests. Local rendering still
  goes through upstream's Java engine per D17. This is the project's recurring
  "built, tested, unreachable" shape, named here rather than discovered later.
- **Two known differences from upstream remain in `WorldRegionUpdateTask`**, recorded during
  the port and deliberately not changed, because that file's `run()` path is what the closed
  Phase D gate measured: the periodic map checkpoint (upstream's 60-second `map.save`) is
  missing from `complete()`, and `run()` calls `complete()` even for a region with nothing to
  do, writing chunk hashes upstream would not. Both are observable only on an incremental
  re-render, which is why a first-render oracle never caught them. Fixing them means
  re-running `tools/oracle/compare.mjs` at both sizes to prove the gate still closes.

## Delivery, which the plan never described

None of this is in `plan.md`, because the plan assumed a single desktop application rendering
locally in TypeScript. All of it is on the branch and tested.

| | |
|---|---|
| **Sign-in** | OAuth device flow, OAuth app by default with the GitHub app behind an override. Token in the OS credential store, refused rather than written in the clear when that is unavailable, never crossing the bridge, scrubbed from every error path |
| **Rendering in GitHub Actions** | Worlds too large for one job split across a matrix, in sequential waves past the 256-job cap. 961 of 961 tiles byte-identical to an unsharded reference, zero differences across 6,024,024 lowres pixels |
| **Private worlds** | Sealed with AES-256-GCM and rendered on public runners, opaque HMAC-keyed identifiers, output published only to the private repository, no artifacts |
| **Resumable renders** | A crash, a shutdown or a six hour ceiling costs one wave rather than everything. Crash detection by app-instance id, not pid, which is reused |
| **Large downloads** | A release asset is capped at 2 GB, so oversized archives ship as 1.7 GB parts with per-part and whole-file digests, and the app downloads and rejoins them with resume |
| **Test worlds** | Generated in anvil format with no Minecraft and no network, a fresh seed every build, attached to every release |
| **Backups** | A world or a rendered map packed, split and published as the assets of a new GitHub release, with a pointer naming every part and its SHA-256 (`8cbac63`, `docs/backup.md`). The pointer is Desktop Material's Cheap LFS v1 rather than a rival format. Restore verifies each part and the whole file; an upload that stopped before its pointer went up is listed as unfinished and offered no restore. Git LFS was rejected on cost, by name. Interoperability is proven against a fixture copy of the canonical patterns, **not** by a round trip through the other application |

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

What is **not** yet proven, and so keeps this phase open:

- `textures.json` semantically equal to Java's for vanilla 1.21 and a modded pack
- a 1.12.2 jar loading through the legacy compat path (pre-atlas discovery, pre-flattening
  names)
- the end-to-end live check: download the 1.21 client jar with the consent flag set in dev
  and resolve `minecraft:grass_block` blockstate to variant to model to parent chain to
  texture

Until those run, "ported" is the honest word and "done" is not.

## Test counts

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
| `cli` | none yet | | | | |

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

No CI run on `main` has produced a verdict for the current tip. The last one that did is
[30943812775](https://github.com/Ding-Ding-Projects/material-bluemap/actions/runs/30943812775)
at `80369ec` — **failure**, `Could not resolve "../console/annotations.js" from
"src/components/world/renderRun.ts"` during `pnpm build` of `packages/ui`. The cause is worth
knowing exactly, because it is invisible on a developer machine where the file is simply
present: `f4d3abd` committed the import, and the file it imports was not committed until
`897ecad`, three commits later. `80369ec` sits between them. The console files are tracked now
(seven of them, per `git ls-files packages/ui/src/components/console/`), and
`pnpm --filter @material-bluemap/ui build` succeeds locally, so that cause is gone. Every CI
run since — `897ecad`, `92c392f`, `2887d71`, `cee6779`, `56fcd97`, `6e90336`, `6e3260f`,
`c01aab6`, `3119425` — was **cancelled by the next push**, which has been arriving every 30
to 60 seconds. The runs for `ecc5168` and `9f34cff` had not finished when this was written.

The honest statement is therefore neither "green" nor "failing": the local gate passes and no
hosted verdict for the current tip exists. Getting one requires pausing pushes long enough
for a run to survive.

## Revealed by the 2026-08-04 work, still open

- **Drive the render manager from something.** Phase E's pool and task layer are ported,
  tested and exported, and no code outside `packages/engine` calls them. Until that changes,
  a local render still goes through the Java engine and the port's own render loop is
  unexercised outside its unit tests.
- **Fix the two `WorldRegionUpdateTask` differences** named in the Phase E section above, then
  re-run the oracle at both sizes to prove the Phase D gate still closes.
- **Give the History tab a capture step**, and add it to `REQUIRED_SURFACES` in
  `packages/app/test/screenshots.spec.ts`. `Backup screen` was added; `History` was not, so
  the harness will not notice if that tab stops opening — precisely the failure the gate added
  in `5c810d0` exists to catch. The projects screen, the render console, the EULA viewer and
  the CI-render screen also have no capture step yet.
- **Extend the version history past config folders and projects** to profiles, application
  settings and the maps-and-servers list, so a mistaken deletion there can also be undone.
- **Round-trip a backup through Desktop Material**, or state permanently that the claim is
  format conformance only.
- **Assert the options editor's setting count.** The `154 settings across eight tabs` figure
  is recorded in `5c810d0`'s message and in no test, so it will drift silently.

## Deferred verification

lz4-java block-framing constants and PRBM byte-exactness get oracle validation when the
golden harness stands up in Phase D. D17 changes how that harness is built rather than
whether it is needed: the upstream jars are now built from the vendored source with Gradle
rather than pulled as a Docker image, and because the same jar is what renders locally, the
reference implementation is exercised on every render instead of only when someone
remembers to run the harness. Tracked as
[#3](https://github.com/Ding-Ding-Projects/material-bluemap/issues/3).
