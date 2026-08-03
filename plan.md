# Plan: Full Port of BlueMap into `design/` — Electron App + Standalone Server (Material Design 3)

> **Amended 2026-08-03.** Decisions D17 and D18 reversed two positions this plan takes:
> local rendering now runs upstream BlueMap's Java engine while the TypeScript mesher is
> finished, and exclusions S2 and S4 no longer hold. The original text below is kept as
> written; the statements those decisions falsified are marked in place and the reasoning,
> the cost and the exit gate are recorded in [Amendment 1](#amendment-1--2026-08-03-java-engine-first-d17-and-d18).
> Read that section before treating any sentence here as current.

## Context

`material-bluemap` is a fresh skeleton: two commits, no code, only an uninitialized
`vendor/BlueMap` submodule pinned at upstream commit `e664c1a`. The goal is to **port every
single line of BlueMap into a `design/` folder**, shipped as an Electron desktop app **and** a
standalone BlueMap server, supporting Minecraft worlds from **1.12.2 → 26.x (latest)**.

User decisions (confirmed):
1. **Engine**: full TypeScript rewrite — 100% runs in Electron/Node. No JVM, no sidecar.
   **Amended by D17 (2026-08-03):** the TypeScript rewrite is still the end state and still
   the thing being built, but it is no longer what renders today. Local rendering runs
   upstream's Java engine, driven by the app, until the mesher proves byte-identical output.
   A JDK is therefore a requirement for local rendering, and the app provisions one into its
   own `userData` when the machine has none. See [Amendment 1](#amendment-1--2026-08-03-java-engine-first-d17-and-d18).
2. **UI**: Material Design 3 from the start (rebuild, don't reproduce the old look).
3. **Use case**: both — render local worlds fully offline AND act as a desktop client for
   remote BlueMap servers.
4. **Server**: a real BlueMap *server* too — headless render + HTTP server that serves the
   Material webapp, tiles, and live data to ordinary browsers; standalone (Node CLI) and
   embedded in Electron (same code).
5. **1.12.2 → 26.x**: current upstream decodes 1.13+ only; 1.12.2 support is combined back in
   from upstream history (verified: tag `v0.10.3-mc1.12` — last release with 1.12 support).
6. **plan.md**: this plan is committed as `plan.md` at the repo root on
   `claude/bluemap-design-port-8xs2dk` and pushed — the first implementation step.
7. **Docker hosting GUI**: the app includes a full GUI to host a BlueMap server in Docker —
   create/start/stop/remove server containers, worlds/config/web volumes, port mapping,
   restart policy, live log streaming, health status; multiple named server instances.
8. **Full options GUI**: every option BlueMap has (core, webserver, webapp, plugin, per-map
   incl. masks, storages file/SQL) is editable in the GUI — users never hand-edit config
   files; the app owns config generation under the hood.
9. **Missing features in scope** (user confirmed all three groups): (a) nothing deferred —
   JS addon system, in-app marker editor, static-site export, and the three.js upgrade all
   ship in this plan; (b) **local live players** — a capability upstream's CLI lacks: player
   positions for local worlds read from `playerdata/*.dat` NBT, plus optional RCON/Query
   polling of a running Minecraft server for real-time markers; (c) **desktop QoL beyond
   upstream** — measurement/coordinate tools, waypoints/bookmarks, screenshot gallery,
   scheduled renders, multi-server dashboard, update checker.


License: upstream is MIT (Blue / bluecolored.de) — porting is fine with attribution (LICENSE +
NOTICE). Mojang client jars are downloaded at runtime with explicit user consent, never bundled.
BlueMap's own `resourceExtensions` (363 JSONs) are MIT and bundleable.

### Upstream inventory (measured at `e664c1a`; scratchpad clone + fetched legacy tags)

| Module | Content | Size |
|---|---|---|
| `core/` | MCA world parsing (`Chunk_1_13/1_15/1_16/1_18` by DataVersion), resource-pack pipeline (blockstates/models/atlases/textures), hires mesher → PRBM binary tiles, lowres PNG LOD cascade, renderstate, storage (file/SQL), compression (gzip/deflate/zstd/**lz4-java block framing** for 1.20.5+) | 244 Java files, ~27.2k LOC + 363 resourceExtensions JSONs (overlays through `mc26_1`) |
| `common/src/` | BlueMapService facade, HOCON config + templates, hand-rolled NIO HTTP server + SSE, RenderManager (thread pool, resumable `tasks.dat`), file watching, live players/markers, Mojang skins, `/bluemap` command tree (3.3k LOC), BlueMapAPI impl, jar-addon loader, metrics | 143 Java files, ~15.4k LOC |
| `common/webapp/` | Vue 3 + three.js r147 viewer SPA: `src/js` 11.8k-LOC viewer lib, `src/components` 24 UI components, 30 HOCON locales | 94 files, ~14.3k LOC |
| `implementations/` | `cli` (612 LOC standalone render+serve entry) + 6 Minecraft-server plugin adapters over `serverinterface` SPI (~4.8k LOC) | 45 files, ~6k LOC |
| `api/` | BlueMapAPI (nested submodule @ `e20166d`): marker types + MarkerGson wire codec | must init for reference |

Verified facts that shape the design:
- Viewer↔server contract is **HTTP GET only** (+ optional SSE `live/sse`: `tile`/`player`/`marker`
  events): `settings.json`, `maps/{id}/settings.json`, `textures.json[.gz]`,
  `tiles/{lod}/{digit-split}.prbm[.gz]|.png`, `live/players.json` (1s poll), `live/markers.json`
  (10s poll); missing tile = `204`. `webapp/public/sql.php` is a complete minimal reference
  implementation of the whole contract.
- Hires tile = PRBM custom little-endian binary (7 attributes: position f32×3, normal i8×3,
  color u8×3, uv f32×2, ao u8, blocklight i8, sunlight i8; material groups terminated by −1).
  Writer: `core/.../hires/PRBMWriter.java`; a JS reference decoder already exists
  (`webapp/src/js/map/hires/PRBMLoader.js`). Lowres tile = PNG, top half RGBA color, bottom
  half height+blocklight channels.
- No JVM-only tricks anywhere (no mmap/JNI/Unsafe; plain FileChannel IO) — the hard parts are
  the mesher (~4.4k LOC), resource-pack semantics (~2.7k LOC incl. `paletted_permutations`
  atlases), and the multithreaded render pool sharing an immutable ResourcePack.
- Webapp is Electron-friendly (`base:'./'`, hash routing, localStorage) but needs an http(s)
  origin (fetch/EventSource), IPC clipboard, CSP-safe popup rewrite, DOMPurify for marker HTML,
  and gating of remote `scripts[]`/`styles[]` injection from settings.json.

### Legacy 1.12.2 findings (upstream tag `v0.10.3-mc1.12`, fetched and inspected)

1.12 support ended there (v1.x dropped it). The tag contains everything needed to combine back:
- `ChunkAnvil112.java` (227 LOC): pre-flattening decoder — `Level.Sections[]` with
  `Blocks`/`Data`/`Add` nibble arrays, byte `Biomes`, `TerrainPopulated`/`LightPopulated`.
- `mapping/BlockIdMapper.java` + `config/BlockIdConfig.java` + `resources/blockIds.json`
  (1,537 entries): numeric `id:meta` → 1.12-era blockstate names (matching the 1.12 client
  jar's own blockstates/models).
- `mca/extensions/` (15 classes): reconstructs neighbor-dependent properties 1.12 doesn't store
  (fence/pane/wall connections, stair shape, doors, double chests, snowy, redstone, fire,
  tripwire, double plants).
- `resources/biomes.json` (legacy numeric biome ids), `blockProperties.json` (per-state hints).

Approach: for worlds ≤1.12.2, download the version-matched 1.12.2 client jar (existing
per-version mechanism), add `Chunk_1_12` + BlockIdMapper + extensions to the chunk layer, and a
legacy compat mode in the resource pipeline (`"normal"` variant key, pre-atlas textures,
pre-flattening names). Resulting version matrix:
**1.12.2** (new legacy decoder) · 1.13–1.14 (`Chunk_1_13`) · 1.15 (`Chunk_1_15`) ·
1.16–1.17 (`Chunk_1_16`) · **1.18–26.x** (`Chunk_1_18` + LZ4 regions + overlays
`mc1_20_3`/`mc1_21_9`/`mc26_1`).


### Global product contracts (added 2026-08-02, user-confirmed)

The user's global product contracts (source: agent-global-memory, copied to
`design/docs/contracts/`) apply to this app and its server web UI:

1. **Regex builder everywhere** (`contracts/regex-builder.md`): the app ships a complete
   worker-isolated regex builder (guided constructs, raw editor, flags, sample text, live
   highlighting, captures, copy/export, engine statement = JS RegExp); EVERY search bar
   (marker search, settings search, map/server lists, tab searches, text-close fields)
   opens it with two-way query/pattern/flags/mode sync; plain text stays the default.
   Reference implementation vendored at `design/tools/regex-builder-reference/`.
2. **Full browser-style tab contract** (`contracts/tab-navigation.md`): one tab per open
   server/world; persistent grouping (named, colored, decoratable, collapsible), protected
   pinning, overflow, reordering, persisted structure; four search scopes (current strip,
   per-group, group names, master all-tabs) each with its own regex builder; "Close tabs
   containing text" + inverse negating the same predicate, with preview, pinned-exclusion
   default, and unsaved-work protection.
3. **Full per-element appearance editors** (`contracts/appearance-editors.md`): every
   rendered element gets Edit appearance… (context menu + keyboard path; Shift+right-click
   direct on tabs/groups), anchored non-modal editor, Word-depth typography over all
   installed+bundled fonts (variable axes, CJK fallback), per-element persistence with
   inheritance/presets/reset levels/import-export, and the infinite color picker with
   bidirectional color translation (HEX/RGB/HSL/HSV/HWB/LAB/LCH/OKLab/OKLCH/CMYK),
   contrast reporting and gamut warnings.
4. **Localization modes** (`contracts/localization.md`): persisted language mode with
   English, playful Hong Kong-style Cantonese, and compact bilingual display, on top of
   the 30 upstream locales; per-language funny-level slider 1-5 (safety/error copy stays
   clear at every level); optional off-by-default TTS narrator (EN/Cantonese/Both,
   serialized queue, error narration never rate-limited).
5. **Super confirmation** (`contracts/super-confirmation.md`): destructive actions (map
   purge, storage delete, Docker instance removal, force re-render over existing tiles)
   use the in-app two-key + full-range-slider gate with arming/progress/completion
   animation, Emergency exit, reduced-motion and full a11y support. No external helpers.

Phase mapping: the regex builder core + search-bar integration and language modes land
with Phase F (options GUI is the first search-heavy surface; builder core is shared);
tabs + per-element appearance editors are Phase F/G UI infrastructure hardened through
Phase I; super confirmation ships with the first destructive action (Phase F map wizard
delete/purge). kitstarter copy rules (no em-dashes in product UI strings, local font
loading, no AI-tell styling) apply to all UI copy from Phase A onward.

---

## Target architecture

**Everything lives in the `design/` folder.** All ported code, the Electron app, the server,
the CLI, fixtures, tooling, and docs go under `design/` — the only files outside it are
`plan.md` at the repo root and repo metadata (`.gitmodules`, `vendor/BlueMap` reference
submodule). `design/` is a pnpm-workspaces TypeScript monorepo (TS 5 strict, ESM, vitest,
eslint+prettier; `tsc` for libs, Vite for viewer/ui, electron-vite + electron-builder for
the app):

```
design/
├── pnpm-workspace.yaml  package.json  tsconfig.base.json
├── docs/                 # ADRs, PRBM + wire-contract specs, parity checklist
├── packages/
│   ├── shared/   # wire types+zod schemas (settings/textures/markers/players, ported from
│   │             # BlueMapAPI MarkerGson), Key/Registry, Grid, digit-split path codec,
│   │             # mutable math (VectorM*, MatrixM3f/4f, Color), IPC message schemas
│   ├── nbt/      # BlueNBT-subset port: big-endian binary NBT reader+writer, streaming/lazy
│   │             # schema-mapped decode (paletted arrays, lenient lists), gzip/raw autodetect
│   ├── engine/   # port of core/: world+mca (region reader incl. linear, chunk decoders
│   │             # 1.12→26.x, level.dat/dimensions), resourcepack (VFS dir/zip via
│   │             # yauzl-promise, blockstates/models/atlases/textures/colormaps/datapacks,
│   │             # legacy-1.12 compat, Mojang downloader + SHA-1 + consent gate),
│   │             # hires mesher (block/liquid/entity passes, tints, AO, ArrayTileModel SoA
│   │             # typed arrays, byte-exact PRBMWriter), lowres LOD cascade, renderstate,
│   │             # masks, storage (file + sqlite/mysql/pg), compression registry,
│   │             # RenderManager on worker_threads + resumable tasks.dat
│   │   └── assets/  # resourceExtensions (copied) + legacy blockIds/biomes/blockProperties
│   ├── server/   # port of common/: service facade + lifecycle, config (reads upstream HOCON
│   │             # .conf dirs via hocon-parser; app-native JSON+zod), HTTP server on node:http
│   │             # (ported routing/ETag/content-negotiation/204/SSE semantics), live data
│   │             # suppliers, skins+playerheads, command module (port of the /bluemap tree →
│   │             # CLI stdin + in-app command palette), TS addon/public API (BlueMapAPI port),
│   │             # metrics (opt-in), state dump, static-site export (WebFilesManager successor)
│   ├── cli/      # port of BlueMapCLI (same flags: -r/-u/-w/-f/-e/-m/-g/-s/--markers …)
│   │             # = THE standalone BlueMap server; new Dockerfile
│   ├── viewer/   # TS port of webapp/src/js (three@0.147 pinned): BlueMapApp split into
│   │             # ViewerRuntime + app concerns, MapViewer, TileManager, PRBMLoader, controls
│   │             # (hammerjs), markers (DOMPurify'd, popup onclick → listeners),
│   │             # RevalidatingFileLoader as the single DataSource seam; framework-free
│   │             # (reactive() → small ObservableStore with a Vue adapter in ui)
│   ├── ui/       # Material Design 3 Vue 3 app: Vuetify 3 (md3 blueprint) + MD3 token bridge
│   │             # (tokens also drive the raw-DOM .bm-marker-* styles), app bar (compass,
│   │             # day/night, view switch, position), nav drawer (maps/markers/players/
│   │             # settings/console), marker tree w/ search, settings dialogs, command
│   │             # palette (Ctrl+K), render dashboard, welcome + world/server profile
│   │             # manager; FULL options GUI: generated MD3 forms covering every upstream
│   │             # option group (core/webserver/webapp/plugin/per-map+masks/storages) from
│   │             # the config schema — zero config-file editing; Docker hosting screens
│   │             # (instances list, create wizard, logs, status); vue-i18n + 30 ported
│   │             # locales (+ desktop.* namespace)
│   └── app/      # Electron: main (thin: windows/dialogs/IPC broker) + engine host in a
│                 # utilityProcess (runs server+engine, crash-isolated), preload typed bridge;
│                 # docker/ module (dockerode): image build/pull, container lifecycle,
│                 # volumes, port maps, log streams, health checks;
│                 # hardened: contextIsolation+sandbox, strict CSP, nav lock, electron-store
├── fixtures/     # tiny per-version worlds (1.12.2, 1.13, 1.15, 1.16, 1.18, 1.20.5-lz4,
│                 # 1.21, 26.x) + golden outputs
└── tools/oracle/ # upstream Java CLI (e664c1a; v0.10.3-mc1.12 for the 1.12 fixture)
                  # generating reference outputs + diff harness
```

**Amended by D17:** `tools/oracle/` is no longer dev-only and is no longer dockerized. The
jars are built from the vendored source with Gradle (`GRADLE_USER_HOME` pointed at
`tools/oracle/.gradle`, gitignored, so nothing machine-wide is touched), and the resulting
`cli-<version>-shadow.jar` is the engine the shipped app drives as well as the oracle the
mesher is checked against. That is a feature rather than an inconvenience: the reference
implementation is now exercised on every local render instead of only when someone
remembers to run the harness.

Dependency direction: `shared ← nbt ← engine ← server ← (cli, app)`; `shared ← viewer ← ui ← app`.
`viewer` never imports `engine` — it only speaks the HTTP wire contract, which is what makes
remote mode identical to local mode.

Key decisions (one each):
- **Serving (D10)**: one ported HTTP server everywhere. Electron main starts it on
  `127.0.0.1:<random>` (per-launch token) and the window loads `http://127.0.0.1:…/` — SSE,
  relative fetches, secure-context APIs all work; the identical server backs `cli -w` for real
  browsers (LAN/standalone server parity with upstream).
- **Remote mode via local reverse proxy (D11)**: remote BlueMap servers send no CORS headers,
  so the renderer cannot fetch them cross-origin. The embedded server exposes
  `/remote/{profile}/…` proxying the remote base URL (streams bodies, forwards ETag/If-None-Match
  and 204s, proxies SSE, attaches stored auth) — also neutralizes mixed content and gates remote
  `scripts[]`/`styles[]` (default-deny with explicit per-profile trust opt-in).
- **Render pool (D4)**: `worker_threads` pool sized like upstream (cores−1). The resource pack
  is baked once into flat typed-array structures on `SharedArrayBuffer` (read-only sharing);
  workers decode+mesh regions and return PRBM bytes + lowres patches as transferables; the host
  does all storage writes and lowres accumulation (keeps SQLite single-writer, mirrors
  upstream's synchronized LowresTileManager).
- **NBT (D1)**: hand-rolled `@bluemap/nbt` mirroring BlueNBT's adapter model (lazy/streaming
  reads on the chunk hot path, writer for renderstate/tasks.dat). `PackedIntArrayAccess` bit
  math on 32-bit halves, no per-block BigInt.
- **Compression (D2)**: gzip/deflate `node:zlib`; zstd `@bokuweb/zstd-wasm` (pure wasm, no
  native builds); LZ4 = port of lz4-java **block** framing (`LZ4Block` magic, token,
  lengths, xxhash32 via `xxhash-wasm`) over `lz4js` — required for MC 1.20.5+ regions.
- **Raster (D3)**: `pngjs` everywhere (texture decode, atlas pixel ops, lowres encode, skin
  crops) — pure JS, deterministic, no native packaging pain; PNG parity is checked on decoded
  pixels, not bytes.
- **Caching (D6)**: `lru-cache` with explicit byte-size budgets from one configurable memory
  budget (region/chunk/geometry/lowres caches) replacing Caffeine soft refs; pressure stats
  surfaced to UI/status.
- **UI kit (D14)**: Vuetify 3 `md3` blueprint + custom `--md-sys-color-*` token layer feeding
  both Vuetify themes and the viewer's raw-DOM marker CSS; 3 themes (dark/light/contrast)
  preserved.
- **Config (D9)**: server/cli read existing upstream HOCON config dirs directly
  (`hocon-parser`) for drop-in migration; app-native config is JSON validated by zod with
  defaults generated from the upstream `.conf` templates; locales stay HOCON.
- **Config schema drives the full options GUI (D15)**: one zod schema in `shared` is the
  single source of truth for **every** upstream option (core, webserver, webapp, plugin,
  per-map incl. render masks, storages file/SQL), annotated with UI metadata (group, label/
  description i18n keys mirroring the upstream `.conf` comments, widget type, constraints,
  advanced flag). The MD3 forms in `ui` are generated from it; the schema serializes
  bidirectionally JSON⇄HOCON, so GUI-authored config also runs the upstream Java server
  unchanged. Users never touch files; import-existing-config is one-click.
- **Docker hosting (D16)**: `app/docker` uses `dockerode` against the local Docker daemon
  (auto-detect socket/npipe; guided install hint if absent). A "server instance" = named
  container + managed volumes (worlds ro, config, web/storage) + port map, built from the
  GUI config (exported as HOCON into the config volume). Image selectable per instance:
  the ported `material-bluemap` server image (default once built) or upstream
  `ghcr.io/bluemap-minecraft/bluemap` (works from day one thanks to HOCON compat).
  Lifecycle: create/start/stop/restart/remove, restart policy, live log streaming (demux),
  health check on the HTTP port, "open in viewer" wiring the instance as a local profile.

### Java→TS disposition table (nothing dropped silently)

| Upstream | Disposition |
|---|---|
| `core/world/**`, `core/world/mca/**` | Port 1:1 + new `Chunk_1_12` (+BlockIdMapper +15 extensions) from `v0.10.3-mc1.12` |
| `core/resources/**` + resourceExtensions | Port 1:1 + legacy 1.12 data/compat; bundle MIT assets |
| `core/map/{hires,lowres,renderstate,mask}` | Port 1:1 (byte-exact PRBM; pixel-exact-decoded PNG) |
| `core/storage/**` (file, sql, compression) | Port 1:1 (better-sqlite3 / mysql2 / pg behind CommandSet dialects) |
| `core/util/**` (math/grid/key/streams/logger) | Port 1:1 (mutable math kept hand-rolled; streams → Node streams) |
| `common/web/**` | Handlers/routing/SSE semantics ported; the 914-LOC NIO socket layer replaced by `node:http` (~100 LOC adapter) |
| `common/rendermanager/**` + serialization | Port onto worker_threads incl. resumable `tasks.dat` (lives in `engine`) |
| `common/config/**` + templates | Port semantics; HOCON read-compat + JSON-native (D9) |
| `common/live/**`, `plugin/skins/**`, `plugin/` lifecycle | Port 1:1 (chokidar for watching) |
| `common/commands/**` (3.3k LOC in-game tree) + bluecommands subset | Port as command module: same tree (`status`, `update`, `purge`, `freeze`, `troubleshoot`, …) driven from CLI stdin and the in-app command palette |
| `common/api/**` + `api/` submodule | Port as public TS API + MarkerGson-compatible codecs in `shared`. Java BlueMapAPI artifact itself not shipped (JVM plugin API) — **signoff S1** |
| `common/addons/**` (jar classloading) | ~~Java jar loading impossible without JVM. Ported equivalent **ships in this plan**: JS/ESM addon loader against the TS API — **signoff S2** (Java-jar compat only)~~ **S2 withdrawn by D18 (2026-08-03):** there is a JVM in the product now, so the Java addon loader is built and shipped from the vendored source alongside the JS/ESM addon loader, which still ships as planned |
| `common/metrics` | Ported, flipped to **opt-in** (desktop norm) — **signoff S3** |
| `common/debug/StateDumper` | Port (JSON dump via `troubleshoot`) |
| `common/serverinterface/**` + 6 platform adapters | Contract becomes TS `LiveDataProvider` SPI with three providers: `RemoteProvider` (passthrough), **`LocalLiveProvider` (new, beyond upstream: playerdata NBT + optional RCON/Query polling)**, `NoneProvider`. ~~The Minecraft-server plugin glue itself has no desktop meaning — **signoff S4**~~ **S4 withdrawn by D18 (2026-08-03):** the same build that produces the render engine produces `fabric`, `forge`, `neoforge`, `paper`, `spigot` and `sponge`, so all six ship as release artifacts a user can drop into their own server. The TS SPI above is unaffected and still ships |
| `implementations/cli` | Port 1:1 (`@bluemap/cli` = standalone server). **Since D17** the upstream `cli` shadow jar is also built and shipped, because it is what renders locally today |
| Webapp `src/js` | Port to TS `viewer`, behavior-identical (three@0.147 pinned during the port; upgraded to current three.js in Phase H) |
| Webapp `src/components` + scss | Rebuilt as MD3 `ui`; feature-parity checklist derived from all 24 components; 30 locales ported |
| Gradle/buildSrc/Dockerfile | Replaced by pnpm/Vite/electron-builder + new server Dockerfile |

---

## Phases (each ends demoable/verifiable)

- **Phase 0 — Bootstrap**: commit this plan as `plan.md` (repo root) and push the branch.
  Init submodules (`vendor/BlueMap` + nested `api`); fetch `v0.10.3-mc1.12` tag for legacy
  reference. Scaffold `design/` monorepo, CI (lint+test+build), LICENSE/NOTICE attribution.
  Exit: empty hardened MD3 Electron window opens; CI green.
- **Phase A — Viewer port + remote mode (zero engine code)**: port `webapp/src/js` → `viewer`;
  MD3 shell in `ui`; embedded server with only the `/remote/*` proxy; profile manager +
  security gating. Exit demo: browse `https://bluecolored.de/bluemap` (maps, markers, live
  players, SSE) inside the desktop app.
- **Phase B — Engine foundations**: `shared`/`nbt` (+oracle round-trips), compression incl.
  lz4-block, region reader (mca + linear), chunk decoder matrix **1.12.2→26.x** (incl.
  `Chunk_1_12` port with id-mapper + extensions), level.dat/dimensions, ChunkGrid caches,
  chokidar watch; stand up `tools/oracle` + fixtures. Exit: TS block/biome/light probe dumps
  match the Java oracle on every fixture world (v0.10.3 oracle for 1.12.2).
- **Phase C — Resource-pack pipeline**: VFS, pack meta/overlays, blockstates/models/textures/
  animations, atlases (`paletted_permutations`, `unstitch`), colormaps, datapacks,
  resourceExtensions + legacy compat mode, Mojang downloader + consent, `textures.json`
  generation, baked-pack SharedArrayBuffer format. Exit: `textures.json` semantically equals
  Java's for vanilla 1.21 and a modded pack; 1.12.2 jar loads via compat mode.
- **Phase D — Mesher + map output (highest risk)**: hires block/liquid/entity renderers
  (weighted-variant PRNG matched exactly for determinism), tints + biome blending, AO/light,
  ArrayTileModel + material merge-sort, byte-exact PRBMWriter, lowres cascade, renderstate,
  file storage, masks. Exit: golden gate — PRBM byte-identical (decompressed), lowres PNG
  pixel-identical, on all 1.13+ fixtures; 1.12.2 fixture renders correctly (snapshot +
  visual verification — no modern Java oracle exists for it).
  **Amended by D17:** this gate is unchanged, but it is now a *handover* gate rather than
  the moment rendering starts working. Local rendering already works on the Java engine, so
  Phase D no longer blocks the product; passing this gate is what lets the TypeScript mesher
  take over from it. Nothing switches silently: every render records which engine produced
  it in `render.json`, and the app shows that.
- **Phase E — Orchestration + server + CLI + local flow**: RenderManager pool + resumable
  tasks, MapUpdateService watch re-render, full HTTP routes + SSE tile events, service +
  **full config schema (D15: every option, zod, HOCON⇄JSON)**, `cli` (`-r -u -w`) =
  **standalone BlueMap server** + its Dockerfile/image; app UX: open world → configure →
  render with progress dashboard → view; incremental updates while a world is being written.
  Exit demos: full offline flow in-app; `cli` renders+serves a fixture world to a normal
  browser in CI; schema round-trips every upstream `.conf` template.
- **Phase F — Full options GUI (D15)**: generated MD3 forms for every option group —
  core/webserver/webapp/plugin settings screens, per-map editor (worlds, bounds/masks,
  lighting, hires/lowres params), storage editors (file + SQL w/ connection test), map
  create/clone/delete wizard, validation + safe-apply (re-render prompts when a change
  invalidates tiles), one-click import of existing BlueMap config dirs. Exit: a user
  configures everything BlueMap supports without ever seeing a config file.
  **Amended by D17: this phase no longer waits for E.** The GUI writes BlueMap's own HOCON
  and invokes the CLI, so it needs the TypeScript render manager for nothing. Work on it
  started early and it is being built out of order, against the Java engine.
- **Phase G — Docker hosting GUI (D16)**: dockerode integration, instance manager screens
  (create wizard reusing the Phase-F config forms, status dashboard, live logs, start/stop/
  restart/remove, restart policy, health), volumes + port mapping, image choice (ported
  image default, upstream image supported), "open in viewer" profile wiring. Exit demo:
  from the GUI, spin up a dockerized BlueMap server hosting a fixture world and browse it
  from an external browser.
- **Phase H — Completeness**: SQL storages, command palette wired to all commands + 12
  diagnostic checks, markers API + **full in-app marker editor** (create/edit POI/shape/
  extrude/line/HTML markers, written via the ported markers API), skins updater, metrics
  (opt-in), static-site export (render + viewer as a deployable static bundle),
  **JS/ESM addon system** (sandboxed modules against the TS API, addon manager UI),
  **three.js upgrade** to current (shader/API migration, gated by the golden E2E suite).
  Exit: parity checklist fully green; no deferred items remain.
- **Phase I — Features beyond upstream**: **local live players** (`LocalLiveProvider`:
  `playerdata/*.dat` NBT reader for offline worlds + optional RCON/Query polling of a live
  Minecraft server, feeding the standard `live/players.json` pipeline), measurement/
  coordinate tools, waypoints/bookmarks (persisted, shareable via view links), screenshot
  gallery, scheduled renders (cron-like UI on the render manager), multi-server dashboard
  (all profiles + hosted Docker instances at a glance), update checker; then packaging
  (win/mac/linux) + notarization, docs (usage, exclusions ~~S1–S4~~ **S1 and S3 only, per
  D18**, attribution, Mojang consent). Exit: 1.0 candidate.

Relative effort: 0: 3% · A: 15% · B: 14% · C: 12% · D: 24% · E: 10% · F: 6% · G: 4% ·
H: 7% · I: 5%.
Top risks: mesher fidelity (mitigate: per-block-family golden fixtures, port with Java open
side-by-side) · chunk decoder matrix incl. 1.12 nibble arrays and LZ4 regions (mitigate:
probe-dump oracles in Phase B, not via wrong pixels later) · atlas pixel ops (pixel-diff units)
· throughput vs JVM (SoA typed arrays, no hot-path allocation, CI benchmarks from Phase D;
wasm escape hatch identified, not planned) · memory without soft refs (explicit budgets +
telemetry, big-world test early in E) · native deps (only better-sqlite3; prebuilds exist).

## Verification

- **Unit (vitest)** per package: nbt round-trips vs BlueNBT-generated fixtures, compression
  cross-fixtures (Java-written gzip/zstd/lz4-block ↔ TS), path codec, PRBM writer↔ported
  PRBMLoader round-trip, mesher micro-fixtures.
- **Golden/oracle (`tools/oracle`)**: upstream Java CLI (`e664c1a`; ~~dev/CI only, never
  shipped~~ **amended by D17: built from the vendored source with Gradle and shipped, because
  it is the engine that renders locally today**) renders `fixtures/` worlds → compare TS
  output: PRBM decompressed-byte-equal;
  PNG decoded-pixel-equal; settings/textures/markers/players JSON parse-equal (1e-6 float
  tolerance); renderstate NBT tag-equal. 1.12.2 fixture: chunk-decode probe vs `v0.10.3-mc1.12`
  oracle + rendered-output snapshot tests (no modern Java renderer exists for 1.12).
- **Server contract**: HTTP tests for every route (200/204/304, ETag, Accept-Encoding
  passthrough vs re-encode, SSE event framing) mirroring `MapStorageRequestHandler` semantics,
  cross-checked against recorded upstream webserver responses.
- **E2E (Playwright `_electron`, xvfb in CI)**: launch app → open fixture world → render →
  assert canvas renders tiles (pixel probe), map switch, markers; remote-mode smoke against a
  local upstream-BlueMap docker container (deterministic) + optional public-demo check;
  security assertions (no node in renderer, CSP, script-gating).
- **Config GUI + Docker**: schema round-trip tests (GUI JSON → HOCON → parsed by upstream
  configurate via the oracle container → equal values) prove GUI-authored config drives both
  servers; every upstream `.conf` template imports losslessly. Docker manager tested against
  a real daemon on Linux CI (create→start→health→logs→stop→remove of a fixture instance);
  dockerode mocked for unit tests elsewhere.
- **Manual per release**: remote mode on the public demo, one large real-world render, all
  three themes, 2–3 locales, packaged app on one platform.

## Execution notes

- Phase 0 starts by committing `plan.md` (this plan) to the repo root and pushing
  `claude/bluemap-design-port-8xs2dk` (`git push -u origin`, retry w/ backoff on network
  failure). One commit per milestone minimum; push after each phase.
- Explicit-exclusion signoffs surfaced in README + plan: S1 Java BlueMapAPI artifact,
  ~~S2 Java jar addons (JS addon API instead)~~, S3 metrics opt-in flip, ~~S4 the six
  Minecraft-server platform adapters~~. Everything else is ported or behavior-preserving-replaced
  per the disposition table.
  **Amended by D18 (2026-08-03): S2 and S4 are withdrawn.** Two signoffs remain, S1 and S3.
  Everything upstream ships is ported, and the six platform adapters and the Java addon
  loader are release artifacts rather than exclusions.
- Never bundle Mojang-downloaded assets; consent flag mirrors upstream `accept-download`.
- Reference sources for implementation: `vendor/BlueMap` @ `e664c1a` (+ tag `v0.10.3-mc1.12`,
  + nested `api/` submodule) — critical files: `core/.../map/hires/PRBMWriter.java`,
  `core/.../world/mca/MCAWorld.java`, `core/.../resources/pack/resourcepack/ResourcePack.java`,
  `common/.../rendermanager/RenderManager.java`, `common/.../web/MapStorageRequestHandler.java`,
  `common/webapp/src/js/BlueMapApp.js`, and (legacy) `ChunkAnvil112.java` + `mca/extensions/`.
  **Amended by D17:** the same tree is now a *build* input as well as a reading reference.

---

## Amendments

Everything above is the plan as approved. Nothing in it has been deleted; where a decision
later reversed a statement, the statement is marked in place and the reasoning lives here.
The canonical record of each decision is `design/docs/decisions.md`.

### Amendment 1 — 2026-08-03, Java engine first (D17 and D18)

**What changed.** Local world rendering runs upstream BlueMap's Java engine, built from the
vendored source at `vendor/BlueMap` and driven by the app. The TypeScript mesher in
`packages/engine` keeps being written and replaces it later, gated on byte-identical output.
Every implementation is ported and shipped, including the six Minecraft-server platform
adapters and the Java addon loader, so exclusions S2 and S4 are withdrawn.

**Why.** Point 1 of the user decisions and D5 committed to a pure TypeScript mesher with no
JVM. That is right for the end state and wrong for the interval. Until the mesher is
finished the app cannot render anything at all, and the mesher is the largest and
highest-risk part of the whole port: roughly 4.4k LOC of upstream Java whose output has to
match byte for byte. Driving upstream's renderer means a world can be rendered now, and it
gives the mesher an exact oracle rather than an approximation that looks plausible in a
screenshot. D18 follows from D17 rather than standing on its own: the six platform adapters
were excluded because they were inert without a JVM, and there is a JVM now, so the same
build that produces the renderer produces them and a user running a Minecraft server can
take the plugin for their platform from the same release.

**What it is measured to do, on the machine this was decided on.** These are recorded
because a plan amendment that says "it works" and nothing else is not evidence:

| Fact | Measurement |
|---|---|
| Build | `./gradlew :cli:shadowJar` produces `implementations/cli/build/libs/cli-5.22-27-shadow.jar`, 6.4 MB, 34s warm |
| Gradle project paths | bare: `:cli`, `:fabric`, `:forge`, `:neoforge`, `:paper`, `:spigot`, `:sponge` (not `:implementations:cli`) |
| Toolchain | host Temurin 25.0.3; upstream pins `JavaLanguageVersion.of(25)` |
| Nothing machine-wide | `GRADLE_USER_HOME` points at `tools/oracle/.gradle`, which is gitignored and already over a gigabyte |
| Config generation | `java -jar <shadow.jar> -c <configDir>` writes `core.conf`, `webapp.conf`, `webserver.conf`, `maps/{overworld,nether,end}.conf`, `storages/{file,sql}.conf` |
| Render | `-c <configDir> -r -g` over a generated 1000x1000 world produced **961 hires PRBM tiles** plus lowres PNGs and `textures.json.gz` in 80 seconds |
| Progress output | `[11:28:40 INFO] updating map 'overworld': 25.663% (ETA: 47 seconds)`, ending `Your maps are now all up-to-date!` |

**Sharp edges found while proving it, which the port has to defend against.** The CLI
resolves its storage root and data folder relative to the **working directory**, not the
config folder. Running it from the repository root dumped 47 MB of tiles into `/web` and a
38 MB Mojang client jar into `/data` at the top of the tree. Every path the app writes into
a config file is therefore absolute, and the child process is given a deliberate working
directory inside the render workspace as a second line of defence. Rendering also requires
`accept-download: true` in `core.conf`, which is Mojang EULA acceptance and is exactly why
consent is a first-class persisted decision rather than a config default.

**What this costs, stated rather than hidden.**

- A JDK becomes a requirement for local rendering. The app provisions a verified Temurin
  build into its own `userData` when the machine has none, so nobody is asked to install
  one by hand, but the download is real and is a decision the person makes.
- There are two rendering paths to maintain and test until the mesher lands.
- The headline claim of being JVM-free becomes conditional. The README says so rather than
  implying otherwise, and every rendered map records which engine produced it.
- Two engines mean two answers to "why does this tile look like that", which is precisely
  why `render.json` is written before a render starts and not only when one succeeds.

**How the mesher takes over.** The gate Phase D always had, unchanged: decompressed PRBM
bytes identical to the Java engine's, and lowres PNGs identical pixel for pixel, across
every fixture world. Nothing switches silently.

**What this amendment does not change.** The TypeScript port is still the goal and is still
being written. `viewer`, `ui`, `server`, `shared`, `nbt` and the whole world-reading and
resource-pack layer are unaffected. S1 (the Java BlueMapAPI artifact) and S3 (metrics
flipped to opt-in) still stand.
