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
