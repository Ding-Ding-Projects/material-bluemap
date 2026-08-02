# Design decisions (ADR summary)

Decisions locked during planning (see `../../plan.md` for full context):

- **D1 — NBT**: hand-rolled `@material-bluemap/nbt` mirroring BlueNBT's adapter model
  (lazy/streaming reads on the chunk hot path, writer for renderstate/tasks.dat).
  `PackedIntArrayAccess` bit math on 32-bit halves; no per-block BigInt.
- **D2 — Compression**: gzip/deflate via `node:zlib`; zstd via `@bokuweb/zstd-wasm`;
  LZ4 = port of lz4-java **block** framing (`LZ4Block` magic, token, lengths, xxhash32)
  over `lz4js` — required for MC 1.20.5+ regions and `bluemap:lz4` storage compression.
- **D3 — Raster**: `pngjs` everywhere (texture decode, atlas ops, lowres encode, skins).
  PNG parity checked on decoded pixels, never bytes.
- **D4 — Render pool**: `worker_threads`, baked resource pack shared via SharedArrayBuffer,
  workers return PRBM bytes + lowres patches as transferables, host does all storage writes.
- **D5 — Mesh**: `ArrayTileModel` as SoA typed arrays; `PRBMWriter` byte-identical to Java.
- **D6 — Caching**: `lru-cache` with explicit byte budgets replacing Caffeine soft refs.
- **D7 — Zip**: `yauzl-promise` behind a VFS abstraction (dir/zip transparent).
- **D8 — Mojang assets**: runtime download (SHA-1 verified) after explicit consent; never bundled.
- **D9 — Config**: HOCON read-compat (`hocon-parser`) for upstream config dirs; app-native
  JSON validated by zod; locales stay HOCON.
- **D10 — Serving**: one ported HTTP server everywhere; Electron loads `http://127.0.0.1:<random>`
  with a per-launch token; same server backs `cli -w`.
- **D11 — Remote mode**: local reverse proxy `/remote/{profile}/…` (remote BlueMap servers
  send no CORS headers); gates remote scripts/styles default-deny.
- **D12 — Processes**: Electron main thin; engine+server in a `utilityProcess`; renderer
  sandboxed (contextIsolation, no nodeIntegration); typed preload bridge.
- **D13 — Security**: strict CSP, DOMPurify for marker HTML, popup onclick rewritten,
  navigation locked, electron-store persistence.
- **D14 — UI kit**: Vuetify 3 `md3` blueprint + `--md-sys-color-*` token bridge (tokens also
  style the viewer's raw-DOM markers); dark/light/contrast themes.
- **D15 — Config schema**: one zod schema in `shared` covers every upstream option with UI
  metadata; MD3 forms generated from it; serializes JSON⇄HOCON (drives upstream Java servers too).
- **D16 — Docker hosting**: `dockerode`; instance = container + managed volumes + ports;
  image selectable (ported image default, upstream `ghcr.io/bluemap-minecraft/bluemap` supported).
