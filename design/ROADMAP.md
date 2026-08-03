# Roadmap

Phases from `../plan.md`; status is updated as each phase lands on the branch.

| Phase | Scope | Status |
|---|---|---|
| 0 | plan.md, submodules (+`v0.10.3-mc1.12` legacy tag), monorepo scaffold, CI | **Done** |
| A | Viewer port (65 files → TS), MD3 shell, Electron shell, embedded server + remote proxy, live-demo verification | **Done** |
| B | shared utils, NBT, compression, MCA parsing 1.12.2→26.x incl. legacy Chunk_1_12, e2e synthetic-world proofs | **Done** |
| C | Resource-pack pipeline (VFS, blockstates/models/atlases, textures, legacy compat, Mojang downloader, textures.json) | Ported, exit criteria not yet proven |
| D | Hires mesher, byte-exact PRBM writer, lowres LOD cascade, renderstate, file storage, masks | Pending |
| E | RenderManager worker pool, watch re-render, full HTTP routes + SSE, config schema (every option), standalone server CLI + Dockerfile | Pending |
| F | Full options GUI (all settings, map wizard, storage editors, config import) | Pending |
| G | Docker hosting GUI (dockerode instance manager) | Pending |
| H | SQL storages, command palette, marker editor, JS addon system, static export, three.js upgrade | Pending |
| I | Local live players (playerdata/RCON), measurement/waypoints/gallery/scheduler/dashboard/update checker, packaging | Pending |
| Contracts | Regex builder everywhere · full tab system · per-element appearance editors · EN/HK-Cantonese/bilingual + funny-level · super confirmation (see `docs/contracts/`) | Pending (land with F–I) |

Deferred flags: lz4-java block-framing constants and PRBM byte-exactness get oracle
validation (dockerized upstream Java CLI) when the golden harness stands up in Phase B/D.
Tracked as [#3](https://github.com/Ding-Ding-Projects/material-bluemap/issues/3).

**Phase C, what is done and what is not.** Every file in upstream's `resources` package is
ported and tested: the VFS, `Pack` with its five-step mount and reverse-order overlays, both
`pack.mcmeta` eras, `MinecraftVersion` with a streamed SHA-1 and a defaultless accept-download
gate, `DataPack`, the blockstate/model/texture/entitystate data classes including the
coordinate-seeded variant PRNG, the `ResourcePack` orchestrator with its five phases and texture
filter, the seven-file atlas layer, and `TextureGallery` with `textures.json`. The engine carries
820 tests, up from 501 at Phase B exit, and the resources layer went from zero.

What is **not** yet proven, and so keeps this phase open:

- `textures.json` semantically equal to Java's for vanilla 1.21 and a modded pack
- a 1.12.2 jar loading through the legacy compat path (pre-atlas discovery, pre-flattening names)
- the end-to-end live check: download the 1.21 client jar with the consent flag set in dev and
  resolve `minecraft:grass_block` blockstate to variant to model to parent chain to texture

Until those run, "ported" is the honest word and "done" is not.
