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
| J | **Java render path** (D17): toolchain discovery/provisioning, jar resolution, config writer, CLI runner, progress parser, provenance record, local map serving | Built, proven by hand on one machine; see below |
| D | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks | **Done, and the gate is closed.** `tools/oracle/compare.mjs` rendered a generated 1000x1000 world with both engines on 2026-08-04 and reported **identical**: 995 files matched, 961 of 961 hires tiles byte for byte after decompression, 24 of 24 lowres tiles pixel for pixel, all render-state decisions equal, neither side holding a file the other lacked. A 200x200 fixture on a different seed reports the same. Passing the gate does not itself switch the product over; D17 keeps upstream's engine rendering until that switch is made and verified on its own |
| E | RenderManager worker pool, watch re-render, full HTTP routes + SSE, config schema (every option), standalone server CLI + Dockerfile | Pending. The config schema half landed early in `packages/config` |
| F | Full options GUI (all settings, map wizard, storage editors, config import) | **Reachable.** `App.vue` now mounts the Material title bar, the world wizard, first-run setup and the settings surface. Two gaps closed with it: the preload never exposed the window controls (a frameless window with no minimise or close), and only 6 of a map's 92 settings could reach a render |
| G | Docker hosting GUI (dockerode instance manager) | Pending |
| H | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade | Pending |
| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |
| Contracts | Regex builder everywhere · full tab system · per-element appearance editors · EN/HK-Cantonese/bilingual + funny-level · super confirmation (see `docs/contracts/`) | Pages now mounts the discovery searches, live-localized command palette, anchored changelog range picker, notification centre, and two-key gate; desktop-app contract work remains tracked in the open issues |
| Pages | Material 3 GitHub Pages shell, tabbed discovery, repository-backed changelog, command palette, notification centre and responsive documentation surface | **Source/type/lint/build gates pass; 38 focused site tests pass, including the complete article command catalog. Full monorepo evidence remains red: local CRLF HOCON and `@material-bluemap/nbt` failures plus remote world-mount assertion `.minecraft` versus `.` in run 30884892507. Runtime/headless capture is still separate** |
| Delivery | Sign-in, private worlds, split archives, resumable renders, Actions rendering, packaging pipeline | **Landed.** Not a plan phase; see below |

Phase **J** is not in `plan.md`: the plan had no Java render path because it had no JVM.
It is numbered out of the alphabet deliberately so the original lettering keeps meaning what
it meant.

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

What is **not** proven, and so keeps this phase honest:

- The end-to-end flow has been driven by hand on one Windows machine. It has not run in
  CI, on macOS, or on Linux.
- JDK provisioning has been unit tested against fakes. No real Temurin archive has been
  downloaded, verified and extracted by the app on a machine with no JDK.
- The 961-tile render was produced by invoking the jar directly. Reproducing it through
  the app's own orchestrator, from a render request to tiles the viewer opens, has not
  been captured as evidence.
- Only `:cli:shadowJar` has been built by hand on this machine. A reusable CI workflow that
  builds all seven (`.github/workflows/build-jars.yml`, called from `ci.yml`) is on the
  branch, but a green run of it is not something this entry can vouch for. No adapter jar
  has been loaded by a real Minecraft server.

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

`npx vitest run` from `design/`, 2026-08-03 (later the same day): **198 files, 2968
passed, 2 skipped**.

| Package | Tests | Package | Tests |
|---|---|---|---|
| `engine` | 1135 (1 skipped) | `app` | 522 |
| `ui` | 512 | `shared` | 196 |
| `config` | 176 (1 skipped) | `render-actions` | 147 |
| `site` | 118 | `viewer` | 57 |
| `nbt` | 56 | `parts` | 25 |
| `worldgen` | 19 | `server` | 5 |
| `cli` | none yet | | |

A green suite proves the ported code does what its tests say. It does not prove parity with
upstream, which is what the phase exit criteria above are for.

## Deferred verification

lz4-java block-framing constants and PRBM byte-exactness get oracle validation when the
golden harness stands up in Phase D. D17 changes how that harness is built rather than
whether it is needed: the upstream jars are now built from the vendored source with Gradle
rather than pulled as a Docker image, and because the same jar is what renders locally, the
reference implementation is exercised on every render instead of only when someone
remembers to run the harness. Tracked as
[#3](https://github.com/Ding-Ding-Projects/material-bluemap/issues/3).
