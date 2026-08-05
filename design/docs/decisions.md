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

**Amendment, 2026-08-05 — the gate closed; the "until" is retired.** The Phase D parity gate
described above closed on 2026-08-04: `tools/oracle/compare.mjs` reported a generated
1000x1000 world byte-identical between the two engines (995 files matched, 961/961 hires
tiles equal after decompression, 24/24 lowres tiles equal pixel for pixel), and a 200x200
fixture on a different seed reported the same. That closes the condition this decision
originally wrote as "until it proves byte-identical output" — and the decision is amended
rather than superseded, because the answer is not "so it switches now."

The Java engine remains the default by a standing decision of 2026-08-05, not by the gate
being open. Nothing above this paragraph is rewritten: D17 was decided for the interval
before the gate closed, and it correctly drove that interval. What changes here is what
happens *after* the gate closes, which the original text left as "the mesher takes over."
It does not. The TypeScript mesher becomes the default only through a later, separately
verified switch decision — its own evidence, its own date, its own number — never as a
side effect of the oracle going green. `upstreamJavaEngine` is pinned as the production
`resolveEngine` by a named test beside the orchestrator's own
(`packages/app/src/main/render/engine.test.ts`), so that a future switch has to edit an
assertion on purpose rather than happen as drift in the wiring.

**Why amend instead of leaving it implicit.** A gate that closes and a product that
silently starts using the thing it gated is the switch nobody decided. The oracle proves
the mesher's *output*; it says nothing about operational readiness, rollout risk, or
whether anyone has verified the switch itself end to end. Closing the gate was Phase D's
job. Deciding to flip the default is a different, still-unmade decision, and this
amendment makes the gap between the two explicit instead of leaving a stale "until" for
the next reader to trip over.

## D18 — Port every implementation, including the six platform adapters

**Decided 2026-08-03, superseding exclusions S2 and S4 in `plan.md`.**

Everything upstream ships is ported, including the Spigot, Paper, Fabric, Forge, NeoForge and
Sponge adapters and the Java addon loader, which the plan had excluded as meaningless outside a
Minecraft server JVM.

Since D17 puts a real JVM in the product, those adapters are no longer inert: the same build that
produces the renderer produces them, and a user running a Minecraft server can take the plugin
for their platform from the same release. What was excluded as unusable is now a shipping
artifact.
