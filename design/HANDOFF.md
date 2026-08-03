# Handoff

## State (2026-08-03, handoff on user request mid-Phase C)

Branch `claude/bluemap-design-port-8xs2dk`. Everything lives under `design/` (pnpm
monorepo, 8 packages) except `plan.md` (the approved full plan — read it first) and repo
metadata. Reference sources: `vendor/BlueMap` @ `e664c1a` + nested `api/` submodule +
fetched tag `v0.10.3-mc1.12` (legacy 1.12 reference; key files also extracted to the
session scratchpad, re-extract with `git show v0.10.3-mc1.12:<path>` if needed).

### Complete and verified (each phase committed + pushed, build/lint/tests green)

- **Phase 0** — scaffold, CI (`.github/workflows/ci.yml`), LICENSE/NOTICE, porting
  conventions (`docs/porting-conventions.md`), deviations log (`docs/deviations.md`).
- **Phase A** — `viewer`: all 65 upstream webapp JS files in strict TS (52 tests;
  DOMPurify'd markers, CSP-safe popups, gated remote injection, `dataRoot` + `dispose()`
  port additions). `server`: token-gated localhost HTTP server + static handler + remote
  reverse proxy (SSE streaming, 204/ETag passthrough; encoding handled for undici) —
  live-verified against https://bluecolored.de/bluemap. `ui`: Vuetify MD3 shell, profile
  manager, 30 upstream locales. `app`: hardened Electron (sandbox/CSP/nav-lock), embedded
  server, typed preload bridge; boots under `xvfb-run`, server answers 403 without token.
- **Phase B** — `shared` complete (Key/Registry/Grid/TilePathCodec + full immutable+
  mutable math). `nbt` complete (BlueNBT-subset: streaming reader/writer all 12 tag
  types, modified-UTF-8, schema mapping, paletted/lenient/registry adapters, gzip/zlib
  autodetect; validated against a real `level.dat`). `engine`: compression registry
  (none/gzip/deflate/zstd/**lz4-java block framing**), full world model (BlockState with
  exact Java parse/hash, chunk/region/dimension/biome), MCA layer (region reader `.mca`
  + linear + `.mcc`, `PackedIntArrayAccess` both layouts, decoders **Chunk_1_12/1_13/
  1_15/1_16/1_18** with DataVersion dispatch, legacy BlockIdMapper + 15 neighbor
  extensions from `v0.10.3-mc1.12`, MCAWorld/ChunkGrid/chokidar watch, anvil loader
  registration). **`packages/engine/test/world-e2e.test.ts` is the proof**: builds
  synthetic 1.18 + 1.12.2 worlds byte-by-byte and asserts exact decoding incl. legacy
  fence-connection reconstruction. Monorepo at Phase B exit: 501 tests / 50 files.

### In flight at handoff — Phase C Wave C1 (workflow running in background)

Three agents porting resource-pack foundations; partial output is committed as WIP in
the final handoff commit (see `git log`): resources root files (ResourcePath,
BlockColors/BlockPropertiesConfig, MissingResourcesError), `resources/adapter/`,
shared Vector3f/4d/4f, util Direction/BufferedImageUtil/math. **Expect the engine build
to be red on these WIP files** — that is the known state, not a regression.

Wave plan for whoever continues (prompts and structure in the workflow scripts under
`/root/.claude/projects/.../workflows/scripts/` if the session survives; otherwise
re-derive from `plan.md` Phase C):
- **C1** (was running): (a) VFS (dir/zip via yauzl-promise) + `Pack`/`PackMeta`/overlays +
  real `DataPack` port (must keep the placeholder call-surface in
  `src/resources/pack/datapack/DataPack.ts`); (b) gson adapter layer →
  `resources/adapter/`, MinecraftVersion/VersionManifest downloader (SHA-1 + explicit
  accept-download consent gate), Texture/AnimationMeta/ColorMap via pngjs; (c)
  blockstate/model data classes with the **exact coordinate-seeded weighted-variant
  PRNG** (Phase D mesh parity depends on it).
- **C2**: `ResourcePack.java` (397) real port replacing the placeholder, atlas layer
  (7 files incl. `paletted_permutations`, `unstitch` pixel ops via pngjs), legacy 1.12
  resource compat ("normal" variant key, pre-atlas, pre-flattening names).
- **C3**: integration to green + `TextureGallery`/`textures.json[.gz]` generation; live
  sanity check = download the 1.21 client jar (consent flag set in dev) and resolve
  `grass_block` blockstate→model→texture end to end.
- Then Phases D–I + the five product contracts per `plan.md` and `ROADMAP.md`.

### Process learnings (important for continuation)

- **Session limits kill big fan-outs**: an 8-agent workflow died mid-run ("session
  limit"). The working pattern: **waves of ≤3-4 agents, commit+push after every wave**,
  salvage partial files with a WIP commit if a wave dies. Deps must be installed by the
  orchestrator BEFORE launching agents (lockfile races).
- Deviations discipline: every intentional difference from upstream goes in
  `docs/deviations.md` (already covers Phases A+B comprehensively).
- Engine deps preinstalled: lru-cache, chokidar, @bokuweb/zstd-wasm, lz4js, xxhash-wasm,
  pngjs, yauzl-promise. resourceExtensions (363 files) + legacy blockIds/biomes/
  blockProperties JSONs already bundled under `packages/engine/assets/`.
- Oracle validation still pending (Phase B/D exit criteria): dockerized upstream Java
  CLI to byte-validate lz4 framing constants, PRBM output, chunk fixtures vs real
  vanilla worlds. Flagged in `docs/deviations.md`.

### User-confirmed scope beyond the port (do not drop)

Full options GUI (every BlueMap setting, no config files) · Docker hosting GUI
(dockerode) · standalone server CLI + Dockerfile · MC 1.12.2→26.x · local live players
(playerdata NBT + RCON/Query) · desktop QoL (measurement, waypoints, screenshot gallery,
scheduled renders, multi-server dashboard, update checker) · nothing deferred (JS addon
system, marker editor, static export, three.js upgrade all in scope) · the five global
product contracts in `docs/contracts/` (regex builder on every search bar, full
browser-style tabs, per-element appearance editors + infinite color picker,
EN/HK-Cantonese/bilingual + funny-level, super-confirmation for destructive actions) ·
kitstarter copy rules (no em-dashes in UI strings, local fonts, no AI-tell styling).

### Verify-from-clean checklist

```sh
cd design && pnpm install && pnpm build && pnpm lint && pnpm test   # WIP C1 files may break build — see above
pnpm vitest run packages/engine   # world-e2e is the Phase B acceptance proof
node --input-type=module -e "…"   # remote-proxy smoke: see HANDOFF history or packages/server/test
xvfb-run -a npx electron packages/app --no-sandbox --disable-gpu    # app boots, token-gated server on 127.0.0.1
```
