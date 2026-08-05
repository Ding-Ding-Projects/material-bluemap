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

## D17 — Java engine first for local rendering, TypeScript mesher as its replacement

**Decided 2026-08-03, superseding the pure-TypeScript renderer position in D5.**

Local world rendering runs upstream BlueMap's Java renderer, built from the vendored source at
`vendor/BlueMap` and driven by the app. The TypeScript mesher in `packages/engine` continues to
be written and replaces it once it proves byte-identical output.

**Why.** D5 committed to a pure TypeScript mesher with no JVM. That decision is sound for the end
state and wrong for the interval: until the mesher is finished the app cannot render anything at
all, and the mesher is the largest and highest-risk part of the whole port. Driving upstream's
renderer means a world can be rendered now, and it gives the mesher an exact oracle to be checked
against rather than an approximation that looks plausible.

**What this costs, stated rather than hidden.** A JDK becomes a requirement for local rendering.
There are two rendering paths to maintain and test until the mesher lands. The project's headline
claim of being JVM-free becomes conditional, and the README says so rather than implying
otherwise.

**How the mesher takes over.** The same gate Phase D always had: decompressed PRBM bytes
identical to the Java engine's, and lowres PNGs identical pixel for pixel, across every fixture
world. Nothing switches silently; the application states which engine rendered a map.

**Consequences.**
- The Java toolchain is provisioned into a repository-local, gitignored directory, so no
  machine-wide toolchain is touched. See issue #3.
- The oracle harness that D5 deferred is no longer optional infrastructure: it is the same build
  the product uses, so it is exercised continuously rather than only when someone remembers.
- The options GUI is unblocked ahead of schedule. It writes BlueMap's own HOCON configuration and
  invokes the CLI, so it no longer waits for the TypeScript render manager in Phase E.

## D18 — Port every implementation, including the six platform adapters

**Decided 2026-08-03, superseding exclusions S2 and S4 in `plan.md`.**

Everything upstream ships is ported, including the Spigot, Paper, Fabric, Forge, NeoForge and
Sponge adapters and the Java addon loader, which the plan had excluded as meaningless outside a
Minecraft server JVM.

Since D17 puts a real JVM in the product, those adapters are no longer inert: the same build that
produces the renderer produces them, and a user running a Minecraft server can take the plugin
for their platform from the same release. What was excluded as unusable is now a shipping
artifact.

## D19 — `runtime/webserver.ts`'s `WebServer` removed: `LocalMapHandler` is the one serving path

**Decided 2026-08-05.**

`main/runtime/webserver.ts` exported a `WebServer` class that started the upstream engine a
second time with `-w` (upstream's own live web server, `RuntimeRole: "web-server"` in
`runtime/plan.ts`) and refused to report its URL until a real TCP connection proved it was
listening. It was thorough and well tested (7 tests, `docker-and-local.md` documented it at
length), and it had zero callers anywhere in the app: not the local render path, not the Docker
render path, not the remote-render path, not the IPC layer. A repository-wide search for
`RuntimeRole: "web-server"` and `new WebServer(` outside its own test found nothing.

**Why that is correct, not an oversight.** D10 already settled how a rendered map is served:
"one ported HTTP server everywhere; Electron loads `http://127.0.0.1:<random>`... same server
backs `cli -w`." That server is `@material-bluemap/server`'s `HttpServer`, and `main/index.ts`
mounts `LocalMapHandler` on it at `/local/{renderId}/...` for every render this app produces,
local or Docker — `render/orchestrator.ts` calls `LocalMapHandler.setMount` from the one `mount()`
method both paths share. A locally rendered map is a static web root the moment the engine exits;
reading it directly costs nothing and needs no second JVM kept alive, no second port to publish
out of a container, and no probe to prove it bound. `WebServer` duplicated that role with more
machinery for the same outcome, which is why nothing ever called it.

**What is kept, and what is gone.** `WebServer`, `webserver.ts` and `webserver.test.ts` are
deleted, along with their re-export from `runtime/index.ts`. `RuntimeRole`'s `"web-server"` value,
`EngineLaunch.url`/`hostPort`, `DockerPublish`, `EngineWebServerSettings` and `RepairSubject`'s
`"web-server"` value all stay in `runtime/plan.ts`, `runtime/config.ts` and `repair/evidence.ts` —
they are typed, tested plumbing that `planLocalLaunch`/`planDockerLaunch` still accept, and
removing a type union member ripples through files this decision does not need to touch. They are
simply never reached by a `role: "render"` call, which is the only role any orchestrator plans.

**If a live upstream web server is ever wanted** — for a feature `LocalMapHandler` genuinely
cannot do, such as proxying upstream's own live player-position endpoint — the launch shape is
already there in `plan.ts` and the day it is needed is the day a class like `WebServer` earns a
caller again. Until then a class with no caller does not get to sit in the tree unexplained.
