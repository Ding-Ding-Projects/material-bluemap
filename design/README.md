# material-bluemap (`design/`)

A full TypeScript port of [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap) — the
Minecraft 3D map renderer — shipped as:

- a **Material Design 3 Electron desktop app**: render local Minecraft worlds fully
  offline, connect to remote BlueMap servers, and host/manage dockerized BlueMap servers
  from a full GUI (every BlueMap option editable in the app, no config files), and
- a **standalone BlueMap server** (`@worldlens/cli`): headless render + HTTP server
  that serves the map webapp to ordinary browsers, drop-in compatible with upstream
  BlueMap HOCON configs.

Supported Minecraft world versions: **1.12.2 → 26.x** (legacy 1.12 chunk support combined
back from upstream tag `v0.10.3-mc1.12`).

## Packages

| Package | Purpose |
|---|---|
| `packages/shared` | Wire formats (settings/textures/markers/players), config schema, math, path codecs |
| `packages/nbt` | Binary NBT reader/writer with schema mapping (BlueNBT-subset port) |
| `packages/engine` | Render engine: MCA world parsing, resource packs, hires/lowres tile rendering, storage, render manager |
| `packages/server` | Server: service facade, config, HTTP server + SSE, live data, commands, addon API |
| `packages/cli` | Standalone BlueMap server CLI + Docker image |
| `packages/viewer` | three.js viewer library (port of the BlueMap webapp core) |
| `packages/ui` | Material Design 3 Vue UI |
| `packages/app` | Electron desktop app (embedded server, Docker hosting, options GUI) |

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm lint
```

Reference sources live in `../vendor/BlueMap` (upstream @ `e664c1a`, nested `api/`
submodule, plus fetched tag `v0.10.3-mc1.12` for legacy 1.12 support). See `../plan.md`
for the full port plan and `docs/` for design decisions.

## Ported-equivalent notes (differences from upstream)

- Java jar **addons** cannot load without a JVM; an equivalent JS/ESM addon system against
  the ported TS API replaces them.
- The six Minecraft-server **platform adapters** (paper/spigot/fabric/forge/neoforge/sponge)
  embed BlueMap inside a server JVM and have no desktop equivalent; live data comes from
  remote BlueMap servers, or (beyond upstream) from local `playerdata` / RCON polling.
- The Java **BlueMapAPI artifact** is not shipped; its wire formats and API surface are
  ported to TypeScript.
- **Metrics** are opt-in (upstream defaults opt-out).

## License

MIT — see `LICENSE`. This project is derived from BlueMap (MIT, Copyright (c) Blue
<https://bluecolored.de> and contributors); see `NOTICE`. Minecraft assets are downloaded
from Mojang at runtime only with explicit user consent and are never redistributed.
