# material-bluemap

A from-scratch TypeScript port of [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap), the
Minecraft 3D map renderer and web viewer. It is built to ship as two things from one codebase:

- a **Material Design 3 Electron desktop app** that renders local Minecraft worlds offline and
  connects to remote BlueMap servers, and
- a **standalone headless server** (`@material-bluemap/cli`) that renders and serves the map
  webapp to ordinary browsers.

Target world versions: Minecraft **1.12.2 through 26.x**.

**How rendering works.** Local world rendering runs upstream BlueMap's own Java renderer, built
from the vendored source and driven by the app, so a world can be rendered today rather than
after the TypeScript mesher is finished. The TypeScript mesher is still being written and will
replace it, gated on producing byte-identical output. Everything around the renderer, the
viewer, the world reading layer, the resource-pack pipeline, the server and the whole interface,
is TypeScript. See [Rendering engines](#rendering-engines).

## Status: in development, and honest about it

**[Download the latest Windows installer](https://github.com/Ding-Ding-Projects/material-bluemap/releases/latest)**
· [all releases](https://github.com/Ding-Ding-Projects/material-bluemap/releases)
· [documentation site](https://ding-ding-projects.github.io/material-bluemap/)

The documentation site is a Material 3 tabbed application, not a plain scroll: `Search` owns
independent regex-builder-backed searches for documentation, settings, tabs, groups and bulk
close; `Changelog` reads the committed release history with date filters and export; `Settings`
persists language mode, both funny-level sliders and per-element appearance controls; and
`Ctrl+Shift+F` opens the searchable command palette. These surfaces are assembled in
`design/packages/site/src/main.ts` and verified with the site type checker, Vitest suite and
Vite production build.

Every push to the default branch that passes lint, build and the full test suite publishes a real
Squirrel.Windows installer with its own uniquely tagged release. Read what it can and cannot do
before installing it.

**What works today.** Browsing a **remote** BlueMap server end to end: the viewer, the three.js
scene, markers, the token-gated embedded server and its reverse proxy. The whole world-reading
layer (NBT, compression, region containers, chunk decoders for 1.12.2 through 26.x) and the
resource-pack pipeline are ported and unit tested.

> **Rendering a local world does not work yet.** The mesher is Phase D and has not been written,
> so the app cannot turn a Minecraft save into a map. It can only display a map somebody else's
> BlueMap server already rendered. Nothing in the app is a mock or a demo shell, which is why it
> currently does less than a finished product would.

Phases 0, A and B are complete and verified. Phase C is ported with its exit criteria not yet
run. D through I are pending. See [Phase status](#phase-status).

## Screenshots

Captures of the real running application, taken by the project's Playwright harness in CI. None
is a mockup. The world shown is served by a remote BlueMap server, not rendered by this project.

<img src="docs/screenshots/shell-1280x800.png" alt="The application showing a Minecraft world in 3D with point, area, volume and line markers" width="900">

<details>
<summary><b>More captures</b> (every window size, display scale and colour scheme)</summary>

| | |
|---|---|
| <img src="docs/screenshots/shell-1920x1080.png" alt="The application at 1920 by 1080" width="420"> | <img src="docs/screenshots/shell-800x600-narrow.png" alt="The application at 800 by 600" width="420"> |
| 1920x1080 | 800x600, the narrowest supported width |
| <img src="docs/screenshots/theme-light.png" alt="The application in the light colour scheme" width="420"> | <img src="docs/screenshots/theme-dark.png" alt="The application in the dark colour scheme" width="420"> |
| Light scheme | Dark scheme |
| <img src="docs/screenshots/shell-scale-1x.png" alt="The application at 100 percent display scale" width="420"> | <img src="docs/screenshots/shell-scale-2x.png" alt="The application at 200 percent display scale" width="420"> |
| 100% display scale | 200% display scale |

`docs/screenshots/manifest.json` records the commit, the CI run and the capture method for each
set, so any image here can be traced back to the build it came from.

</details>

## Build it

Requires **Node 22+** and **pnpm 10**. The upstream Java reference is a git submodule; the port
reads it directly.

```sh
git clone https://github.com/Ding-Ding-Projects/material-bluemap.git
cd material-bluemap
git submodule update --init --recursive

node scripts/bootstrap.mjs
```

That one command installs and **verifies** everything: workspace dependencies, the
Electron binary, a JDK matching upstream's toolchain, Gradle, the BlueMap jars built from the
vendored source, and the Playwright browsers the screenshot harness drives. It asks nothing and
needs no administrator rights, and every install is repository-local or user-scoped so no
machine-wide toolchain is touched.

It verifies rather than assumes, which is not pedantry: Electron once shipped a `dist/` folder
containing only `locales/`, with no binary at all, and its own installer kept exiting 0 because
the folder existed. A presence check passes that; running the binary does not. Where a
dependency's own installer is the thing that is broken, bootstrap repairs it.

```sh
node scripts/bootstrap.mjs --check       # verify only, install nothing
node scripts/bootstrap.mjs --skip-jars   # skip the slow first Gradle build

cd design
pnpm build
pnpm test
pnpm lint
```

Everything except `plan.md` and repository metadata lives in `design/`, a pnpm workspace of
ten packages.

Generate a test world without needing Minecraft, a server jar or a network connection:

```sh
node design/packages/worldgen/dist/cli.js --seed 1 --size 1000 --out ./test-world
```

That writes anvil format byte by byte: 3969 chunks across four region files, about 16 MB on disk
and 8 MB zipped, in a few seconds. The same seed always produces byte-identical output.

At the latest release the project is **97,723 lines** hand written across 607 files, or 112,977
lines across 1,021 files counting bundled data. Every release publishes the full breakdown,
generated at the tagged commit by `scripts/count-lines.mjs`.

## Documentation

**[ding-ding-projects.github.io/material-bluemap](https://ding-ding-projects.github.io/material-bluemap/)**
carries an article for every feature, each stating its behaviour, configuration, failure modes,
security considerations and verification, with a visible badge saying whether the subject is
shipped, ported but unverified, or only specified.

The source of truth lives in the repository:

| Document | What it covers |
|---|---|
| [`plan.md`](plan.md) | The approved full port plan. Read this first. |
| [`design/README.md`](design/README.md) | The workspace: packages, development, port notes |
| [`design/ROADMAP.md`](design/ROADMAP.md) | Phase table and status |
| [`design/HANDOFF.md`](design/HANDOFF.md) | Current state, wave plan, verify-from-clean checklist |
| [`design/docs/`](design/docs/) | Porting conventions, design decisions, deviations log |
| [`design/docs/contracts/`](design/docs/contracts/README.md) | The five product contracts and their status |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) · [`SECURITY.md`](SECURITY.md) · [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) · [`LICENSE`](LICENSE) | Repository policy, rendered as their own tabs above |
| [`AGENTS.md`](AGENTS.md) | Instructions for automated agents working in this repository |

## Contents

- [Rendering engines](#rendering-engines)
- [Phase status](#phase-status)
- [Packages](#packages)
- [Repository layout](#repository-layout)
- [Minecraft version support](#minecraft-version-support)
- [Differences from upstream BlueMap](#differences-from-upstream-bluemap)
- [Product contracts](#product-contracts)
- [Porting rules in one screen](#porting-rules-in-one-screen)
- [Attribution](#attribution)

---

<details id="rendering-engines">
<summary><b>Rendering engines</b> (why there are two, and which one runs)</summary>

Turning a Minecraft save into map tiles is the single largest and highest-risk part of this port.
The project ships two paths to it.

| | Java engine | TypeScript mesher |
|---|---|---|
| Status | **primary today** | in development |
| Source | upstream BlueMap, built from `vendor/BlueMap` | `design/packages/engine` |
| Needs a JDK | yes | no |
| Correctness | upstream's own output, by definition | must match the Java engine byte for byte before it takes over |

**Why the Java engine is primary.** It renders correctly today. Writing a mesher that produces
byte-identical geometry is months of work, and until it is finished a pure TypeScript app cannot
render anything at all. Driving upstream's renderer means a user can render a world now, and it
gives the TypeScript mesher an exact oracle to be checked against rather than a plausible-looking
approximation.

**Why the TypeScript mesher still exists.** The Java path needs a JDK and carries a JVM's memory
profile. When the mesher passes its gate, decompressed PRBM bytes identical to the Java engine's
and lowres PNGs identical pixel for pixel across every fixture world, it becomes the default and
the JDK requirement goes away.

The app tells you which engine rendered a map. It does not silently switch.

</details>

<details id="phase-status">
<summary><b>Phase status</b> (0/A/B done, C in progress, D through I pending)</summary>

Mirrored from [`design/ROADMAP.md`](design/ROADMAP.md), which is the source of truth.

| Phase | Scope | Status |
|---|---|---|
| 0 | `plan.md`, submodules (plus the `v0.10.3-mc1.12` legacy tag), monorepo scaffold, CI | **Done** |
| A | Viewer port (65 files to TS), MD3 shell, Electron shell, embedded server plus remote proxy, live-demo verification | **Done** |
| B | shared utils, NBT, compression, MCA parsing 1.12.2 to 26.x including legacy `Chunk_1_12`, e2e synthetic-world proofs | **Done** |
| C | Resource-pack pipeline (VFS, blockstates/models/atlases, textures, legacy compat, Mojang downloader, `textures.json`) | In progress |
| D | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks | Pending |
| E | RenderManager worker pool, watch re-render, full HTTP routes plus SSE, config schema, standalone server CLI and Dockerfile | Pending |
| F | Full options GUI (all settings, map wizard, storage editors, config import) | Pending |
| G | Docker hosting GUI (dockerode instance manager) | Pending |
| H | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade | Pending |
| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |
| Contracts | The five product contracts in [`design/docs/contracts/`](design/docs/contracts/README.md) | Pending, lands with F through I |

Deferred verification flag: the lz4-java block-framing constants and PRBM byte-exactness still
need oracle validation against a dockerized upstream Java CLI. That is recorded in
[`design/docs/deviations.md`](design/docs/deviations.md) and is a Phase B/D exit criterion.

</details>

<details id="packages">
<summary><b>Packages</b> (what the eight workspace packages are for)</summary>

| Package | Purpose |
|---|---|
| `design/packages/shared` | Wire formats (settings/textures/markers/players), config schema, math, path codecs |
| `design/packages/nbt` | Binary NBT reader/writer with schema mapping (a BlueNBT-subset port) |
| `design/packages/engine` | Render engine: MCA world parsing, resource packs, hires/lowres tile rendering, storage, render manager |
| `design/packages/server` | Service facade, config, HTTP server and SSE, live data, commands, addon API |
| `design/packages/cli` | Standalone server CLI and Docker image |
| `design/packages/viewer` | three.js viewer library, a port of the BlueMap webapp core |
| `design/packages/ui` | Material Design 3 Vue UI |
| `design/packages/app` | Electron desktop app (embedded server, Docker hosting, options GUI) |

</details>

<details id="repository-layout">
<summary><b>Repository layout</b> (where things live and why)</summary>

```
plan.md                  the approved full port plan
design/                  the pnpm workspace (all code)
  packages/              the eight packages above
  docs/                  porting conventions, decisions, deviations, contracts
  tools/                 the worker-isolated reference regex builder
  LICENSE, NOTICE        licence and upstream attribution for the ported code
vendor/BlueMap           upstream Java/JS reference, git submodule @ e664c1a
.github/workflows/ci.yml lint, build and test on push and pull request
```

`vendor/BlueMap` is a read-only reference. The port reads it file by file; nothing in it is
edited, and nothing from it is copied without attribution in `design/NOTICE`.

</details>

<details id="minecraft-version-support">
<summary><b>Minecraft version support</b> (1.12.2 through 26.x, and where legacy support came from)</summary>

Current upstream BlueMap decodes 1.13 and newer. Support for 1.12.2 is combined back in from
upstream tag `v0.10.3-mc1.12`, the last release that carried it: the `Chunk_1_12` decoder, the
legacy block-id mapper, and the 15 neighbour-derived block-state extensions (fence connections,
snowy grass, and the rest).

`design/packages/engine/test/world-e2e.test.ts` is the acceptance proof for this. It builds a
synthetic 1.18 world and a synthetic 1.12.2 world byte by byte, then asserts exact block state,
biome and light decoding through `MCAWorld`, including the legacy extension reconstruction.

</details>

<details id="differences-from-upstream-bluemap">
<summary><b>Differences from upstream BlueMap</b> (what a port cannot carry over, and the security fixes)</summary>

Structural differences, because a TypeScript port cannot reproduce them one for one:

- Java jar **addons** cannot load without a JVM. An equivalent JS/ESM addon system against the
  ported TypeScript API replaces them.
- The six Minecraft-server **platform adapters** (paper, spigot, fabric, forge, neoforge,
  sponge) embed BlueMap inside a server JVM and have no desktop equivalent. Live data comes
  from remote BlueMap servers, or from local `playerdata` and RCON polling, which is a capability
  beyond upstream.
- The Java **BlueMapAPI artifact** is not shipped. Its wire formats and API surface are ported
  to TypeScript.
- **Metrics** are opt-in here. Upstream defaults to opt-out.

Deliberate security deviations, mandated by the porting conventions:

- Marker and popup HTML is passed through DOMPurify before it reaches `innerHTML`. Upstream
  injects it raw.
- `PopupMarker` uses event listeners instead of inline `onclick`, so the viewer works under a
  strict Content-Security-Policy.

Every intentional difference, including the ones above, is recorded with its upstream file and
line in [`design/docs/deviations.md`](design/docs/deviations.md). That log is a hard rule, not a
convention: a port that diverges silently is a port nobody can check.

</details>

<details id="product-contracts">
<summary><b>Product contracts</b> (five cross-cutting UI requirements, none implemented yet)</summary>

Five contracts apply to every user-facing surface this project ships: a regex builder on every
search bar, full browser-style tabbed navigation, per-element appearance editors with an
infinite colour picker, English / Hong Kong Cantonese / bilingual language modes with
per-language funny-level sliders, and super confirmation for destructive actions.

**None of the five is implemented yet.** The `ui` package is currently a shell of 9 TypeScript
and Vue source files plus 2 stylesheets. The roadmap lands the contracts with Phases F through I.
Each contract has its own document, and
[`design/docs/contracts/README.md`](design/docs/contracts/README.md) is the index with the
per-contract status.

</details>

<details id="porting-rules-in-one-screen">
<summary><b>Porting rules in one screen</b> (the short version of the conventions)</summary>

The full text is [`design/docs/porting-conventions.md`](design/docs/porting-conventions.md).
The short version:

1. Fidelity first. Port file by file and preserve class, method, field and constant names and
   the control flow. The upstream file is the spec.
2. Same relative path and file name as upstream, with a `.ts` extension.
3. TypeScript strict. Avoid `any`; use `unknown` plus narrowing where upstream is dynamic.
4. Keep upstream logic comments. Drop upstream licence headers, since attribution lives in
   `design/NOTICE`.
5. No behavioural improvements during the port. Bug-for-bug compatibility unless the plan calls
   out a change, and every intentional deviation goes in `design/docs/deviations.md`.
6. Node packages are ESM with explicit `.js` extensions on relative imports (NodeNext).
   Browser-bundled packages use bundler resolution.
7. Preserve integer semantics where Java int/long maths matters.
8. Every ported module with non-trivial logic gets a colocated vitest.
9. Prettier with 4-space indent, to stay visually close to the upstream Java and JS.

</details>

<details id="attribution">
<summary><b>Attribution</b> (upstream copyright and the Minecraft asset position)</summary>

This project is derived from BlueMap, MIT licensed, Copyright (c) Blue
(<https://bluecolored.de>) and contributors. Full attribution, including the exact upstream
commit and the BlueMapAPI commit the wire formats come from, is in
[`design/NOTICE`](design/NOTICE). This repository is MIT licensed; see [`LICENSE`](LICENSE).

Minecraft assets (block models, textures) are the property of Mojang AB and are **not**
distributed with this project. The application downloads the Minecraft client jar from Mojang's
servers at runtime, only after explicit user consent, mirroring upstream BlueMap's
accept-download flow. BlueMap's own `resourceExtensions` JSONs are MIT and are bundled.

</details>
