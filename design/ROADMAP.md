# Roadmap

Phases from `../plan.md`; status is updated as each phase lands on the branch.

| Phase | Scope | Status |
|---|---|---|
| 0 | plan.md, submodules (+`v0.10.3-mc1.12` legacy tag), monorepo scaffold, CI | **Done** |
| A | Viewer port (65 files → TS), MD3 shell, Electron shell, embedded server + remote proxy, live-demo verification | **Done** |
| B | shared utils, NBT library, compression (gzip/deflate/zstd/lz4-block), MCA parsing 1.12.2→26.x incl. legacy `Chunk_1_12` + extensions, MCAWorld/ChunkGrid/watch | In progress |
| C | Resource-pack pipeline (VFS, blockstates/models/atlases/textures, legacy compat, Mojang downloader + consent, baked-pack SAB) | Pending |
| D | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks | Pending |
| E | RenderManager worker pool, watch re-render, full HTTP routes + SSE, config schema (every option), standalone server CLI + Dockerfile | Pending |
| F | Full options GUI (all settings, map wizard, storage editors, config import) | Pending |
| G | Docker hosting GUI (dockerode instance manager) | Pending |
| H | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade | Pending |
| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |
| Contracts | Regex builder everywhere · full tab system · per-element appearance editors · EN/HK-Cantonese/bilingual + funny-level · super confirmation (see `docs/contracts/`) | Pending (land with F–I) |

Deferred flags: lz4-java block-framing constants and PRBM byte-exactness get oracle
validation (dockerized upstream Java CLI) when the golden harness stands up in Phase B/D.
