# material-bluemap

A from-scratch TypeScript port of [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap), the
Minecraft 3D map renderer and web viewer. It is built to ship as two things from one codebase:

- a **Material Design 3 Electron desktop app** that renders local Minecraft worlds offline and
  connects to remote BlueMap servers, and
- a **standalone headless server** (`@material-bluemap/cli`) that renders and serves the map
  webapp to ordinary browsers.

Target world versions: Minecraft **1.12.2 through 26.x**. The renderer is pure
TypeScript/Node, with no JVM and no Java sidecar.

## Status: in development, nothing released yet

There are **no releases, no installers, and no published download** for this project. Phases 0,
A and B are complete and verified on the default branch. Phase C (the resource-pack pipeline) is
in progress, and parts of it are committed as work in progress. At the current commit all eight
packages still build and type-check clean; `design/HANDOFF.md` is where a known-red WIP state
would be recorded, so check it there before treating a build failure as a regression. See
[Phase status](#phase-status) below.

## Build it

Requires **Node 22+** and **pnpm 10**. The upstream Java reference is a git submodule; the port
reads it directly.

```sh
git clone https://github.com/Ding-Ding-Projects/material-bluemap.git
cd material-bluemap
git submodule update --init --recursive

cd design
pnpm install
pnpm build
pnpm test
pnpm lint
```

Everything except `plan.md` and repository metadata lives in `design/`, a pnpm workspace of
eight packages.

## Documentation

There is no published documentation site yet. The docs live in the repository:

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

- [Phase status](#phase-status)
- [Packages](#packages)
- [Repository layout](#repository-layout)
- [Minecraft version support](#minecraft-version-support)
- [Differences from upstream BlueMap](#differences-from-upstream-bluemap)
- [Product contracts](#product-contracts)
- [Porting rules in one screen](#porting-rules-in-one-screen)
- [Attribution](#attribution)

---

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
