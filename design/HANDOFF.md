# Handoff

## State (2026-08-02)

Branch `claude/bluemap-design-port-8xs2dk`. Everything lives under `design/` (pnpm
monorepo, 8 packages) except `plan.md` and repo metadata. Reference sources:
`vendor/BlueMap` @ `e664c1a` + nested `api/` submodule + fetched tag `v0.10.3-mc1.12`.

Verified so far (all on the branch, build+lint+tests green at each commit):
- **viewer**: all 65 upstream JS files ported to strict TS; 52 tests; security deviations
  (DOMPurify, CSP-safe popups, gated remote injection) in `docs/deviations.md`; port
  additions: `dataRoot` resolution, `dispose()`, reactivity/i18n adapter seams.
- **server**: token-gated localhost HTTP server, static handler (resolved-root traversal
  guard), remote reverse proxy (conditional headers, 204 passthrough, SSE streaming,
  undici-aware encoding handling). Live-verified against https://bluecolored.de/bluemap
  (settings/map settings/PRBM/PNG/textures.json through the proxy).
- **ui**: Vuetify MD3 shell, profile manager, 30 upstream HOCON locales, marker CSS
  theme bridge. Builds with Vite.
- **app**: hardened Electron (sandbox, CSP, nav lock, pointer-lock/fullscreen-only
  permissions), embedded server on 127.0.0.1:random with per-launch token, typed preload
  bridge. Boots under Xvfb; embedded server answers 403 without the token while running.

## In flight

Phase B workflow (engine foundations): shared utils/math/Grid/path codec, BlueNBT-subset
`@material-bluemap/nbt`, compression registry incl. lz4-java **block** framing, MCA
region reader (mca + linear), chunk decoders 1.13→26.x + legacy `Chunk_1_12` with
BlockIdMapper + 15 neighbor-property extensions (from `v0.10.3-mc1.12`), MCAWorld/
ChunkGrid/watch, end-to-end synthetic-world fixture test.

## Continue from here

1. When Phase B lands: verify `pnpm build && pnpm lint && pnpm test` in `design/`,
   commit, push; then Phase C (resource-pack pipeline) per `../plan.md`.
2. Oracle validation (deferred): stand up `tools/oracle` with the dockerized upstream
   Java CLI to byte-validate lz4 framing, PRBM output, and chunk decoding on fixture
   worlds — required before Phase D exits.
3. Global product contracts (`docs/contracts/`) land with Phases F–I; tasks #13–#16
   track them.

Known deferred items: viewer per-package `pnpm test` script (root vitest globs — run
`pnpm vitest run packages/viewer` from `design/`), UI bundle code-splitting, Electron
packaging (Phase I).
