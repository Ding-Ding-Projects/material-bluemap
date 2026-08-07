# Changelog

Every entry here is one commit from this repository's history, carrying the full SHA of
that commit so the claim can be checked. Versions are the tags the release workflow
published; a version's entries are the commits reachable from its tag and from no earlier
tag. The date shown is the tagged commit's own date, because the tags are lightweight and
the GitHub Release for a tag is published minutes later by the same run.

Entries are grouped by the area of the repository they changed, which is derived from the
paths each commit touched. They are deliberately not classified as features or fixes: the
commits here carry no such marker, so any such label would be inferred from the wording of
a subject line, and a changelog that infers is a changelog that eventually says something
nobody wrote.

This file is generated. Run `node scripts/build-changelog.mjs` to rebuild it, and
`node scripts/build-changelog.mjs --check` to prove it is current. Generation fails rather
than emitting a reference to a commit that cannot be resolved. The same command writes
`design/packages/ui/src/components/changelog/changelogData.generated.ts`, which carries each commit's
full message for the in-app changelog viewer.

## Unreleased

### Build, release and tooling

- Seal the release trust chain - [`b2e433899a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b2e433899af775c9e9a4666619013f4bc671beca)
- Make release guards fail closed - [`6f53db19c0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6f53db19c019975e9f717b39207195769437554f)
- Limit release privileges and verify PNG structure - [`34a9a81f01`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/34a9a81f016ea7308fabc123d0f3483ef43cef23)
- Close workflow guard bypasses - [`19dc47ba47`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/19dc47ba47e5f02cdd9d321a874fb81c2433fc18)
- Harden release metadata boundaries - [`0a8c52cebd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0a8c52cebdbbaa1cfd020f4d5fb00eacf7459186)

## 0.1.0-build.682 - 2026-08-06

Tagged at [`e137779278`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e13777927876a3d7898778f18193e9465bc97cc2).

### Interface

- Index the project editor in application docs - [`15369ae9c0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/15369ae9c0180305b4e2e49093239d8078c69ead)
- Index the project editor in application docs - [`26b6a5fd39`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26b6a5fd39871f4cdf8c66863f5314d3a1bb9e6b)
- Add unique artwork to high-impact actions - [`a90ba4439d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a90ba4439d0f5056fb1061268fe3236c940e708f)
- Wire masks to measured world context - [`5d511478a1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5d511478a17d687971c4fcff506e3dca41801830)
- Teleport wizard errors to their exact settings - [`62027cfd9d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/62027cfd9d3f149579f1ea094405e9b0b774ce23)
- Make render-mask route parity visible in the editor - [`15ab02823e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/15ab02823e48dd11b851ec9654d146c2f7ceef55)
- Harden project and live-speed layouts - [`d25a6c9510`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d25a6c9510ba6f69177c18499b09361535bd262b)
- Reset nested panel pointer input - [`75540679ab`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/75540679abbbd713f4733220549ee9a0ccc87412)
- Bind panel pointer behavior directly - [`209e80789a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/209e80789a97437ffd8bbdf273dbadab697a87ef)
- Own shell panel pointer routing - [`313c858b7a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/313c858b7a826348704b40988897bf82f904e3ad)
- Activate nested tabs from the keyboard - [`92bb12ed91`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/92bb12ed916b57d9ea9988392c9ebbccad0be060)
- Restore project editor interactions - [`ea04164829`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ea04164829d8ca30280a0d8ece7391d9ba5a0920)
- Align tab tests with docked axes - [`e9050451f7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e9050451f754c54fecc41ddeb66d173193db087d)
- Add four-edge desktop tab docking - [`09b05a1c7b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/09b05a1c7b382fc99ee6d4b80e3fa18ac3ff5e19)
- Add unique artwork to high-impact actions - [`128bf214bb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/128bf214bb723c9618c01129ec9f618080384e7f)
- Wire masks to measured world context - [`d8cc7f23f8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d8cc7f23f82e1e480d4077194fb2ab5aae67aa5c)
- Harden project and live-speed layouts - [`bafe088f33`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bafe088f33397b6bd6d199d16a39b4ab9dce0df7)
- Reset nested panel pointer input - [`17c5c3fa4d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/17c5c3fa4d3a6d11d687d91571b6b1984b34bcfc)
- Bind panel pointer behavior directly - [`c4c02fbd80`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c4c02fbd801fa7996b9c76b488e5a2a9893d5408)
- Own shell panel pointer routing - [`f2bbef7da0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f2bbef7da02bb6d9403cfee2bf908c774d39356a)
- Activate nested tabs from the keyboard - [`b5f37029e7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b5f37029e75e240016a79e32e225da42b3684fe6)
- Restore project editor interactions - [`539b1317ce`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/539b1317ce3dc2ec68ca1ed8a6d03da2807db441)
- Teleport wizard errors to their exact settings - [`e9659423dc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e9659423dcba4964dc44fdcb0669eef6f48f593b)
- Align tab tests with docked axes - [`d051aedf22`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d051aedf224a76626b1bf73c3f0c6eadf1b46402)
- Add four-edge desktop tab docking - [`0e18bb4b1d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0e18bb4b1d8c4afacbaa5a7a69f0fd8f7bcd3c80)
- Make render-mask route parity visible in the editor - [`626137d7ff`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/626137d7ffff82348345e9adfefd30ff43c9dbb9)

### Rendering and world data

- Carry complete map configs through Actions renders - [`7e5ecc9f44`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7e5ecc9f444ac4c14378dacb03e7374e4d65a75a)
- Carry complete map configs through Actions renders - [`6f606918da`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6f606918da3c6e2a9eaaf1630735c206ec0a0775)

### Server, CLI and configuration

- Port every render-mask shape into cloud renders - [`88f50a2c99`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/88f50a2c999af47ae0410499135334c89fe2d8a5)
- Implement full TypeScript render-mask translation - [`3b9b283169`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3b9b28316966a5c87279635db0061675424d3481)

### Desktop shell

- Complete the packaged live-speed bridge - [`3c1ccd102f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3c1ccd102f9ee6fd8bcf24b2e854feb857ef10f7)
- Support linked worktrees in repository discovery - [`121f5e04a1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/121f5e04a14d2d46d6cbdcf385720a3ec407c07a)
- Complete the packaged live-speed bridge - [`dfc1b31818`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dfc1b318189f04861f5bc5476975d060a2c75c4f)
- Support linked worktrees in repository discovery - [`4c66cdab10`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4c66cdab10d0199f1c1acd8a6c8227d389f9e301)

### Landing page and documentation site

- Document and verify four-edge tabs - [`4fe11e7052`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4fe11e70524548647fd3b5a99d08de71b423fe82)
- Preserve topbar elevation across edge docking - [`26d142081a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26d142081a02b50698351cead2097e91cc147ca3)
- Dock site tabs on every edge - [`2cb8033592`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2cb8033592fb862b6cdde2e00c12b93079c58130)
- Document and verify four-edge tabs - [`56a7ab6410`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/56a7ab6410a4533fb89f852fecbc4854ac6f1151)
- Preserve topbar elevation across edge docking - [`4b79d5f64a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4b79d5f64abec0bbf4e20defe596f4d7c2b2462d)
- Dock site tabs on every edge - [`20cbaef19d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/20cbaef19d134510cd4c1359889c5e737930bfd7)

### Build, release and tooling

- Remove invalid canvas test dependencies - [`da20fd548d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/da20fd548dd31b7143fd07aa2d5063a688924454)
- fix: remove invalid @types_node entry from package.json - [`c55862b37f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c55862b37f9470482a9dcb544b4c3b342da59268)
- Remove invalid canvas test dependencies - [`7a94124051`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7a94124051bde902ef0e63e4b2c10c6446ae7b55)
- Merge pull request #54 from Ding-Ding-Projects/dingdingchae-refactored-funicular - [`0181d72c47`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0181d72c47e07bdb179334d6a16a93cfc24f72fb) _(summary of 2 commits, also listed here)_
- test: add canvas devDependency to satisfy HTMLCanvasElement.getContext in vitest (fix CI)\n\n測試：加入 canvas 開發相依以解決 HTMLCanvasElement.getContext() 在 Vitest 中未實作的錯誤。\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com> - [`25166b22db`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/25166b22db7ca258f450b3d52acaba7785732ac5)
- Merge pull request #53 from Ding-Ding-Projects/dingdingchae-refactored-funicular - [`83f56fa730`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/83f56fa7305172a1e0726c2a1b6712b32cc0d2fb) _(summary of 2 commits, also listed here)_
- ci: allow workflow to publish releases (grant contents write)\n\nci: 允許工作流程發佈版本，將 contents 權限改為 write。\n\nCo-authored-by: Copilot App <223556219+Copilot@users.noreply.github.com> - [`b9f6ba2298`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b9f6ba2298137324968fa998e23e7fbf5e17d227)

### Documentation

- Document action-specific artwork - [`26ce07f4b7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26ce07f4b7a0e896a9094b83c2ea1c53da1fa4f3)
- Document exact render-mask parity - [`6019c145b8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6019c145b8fe55eeb38f107493aa0d46ffd9bb1b)
- Document action-specific artwork - [`26286d9e2c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26286d9e2ca261acc73488d67a55dc9267469f9e)
- Document exact render-mask parity - [`f8261e5bf6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f8261e5bf6bf30fe9a437da9368ac05f12d845d0)

### Elsewhere in the repository

- Merge the documentation gate repair ancestry - [`9a3aa2fd6b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9a3aa2fd6bc23f11191094466e43b1e47e10043c) _(summary of 2 commits, also listed here)_
- Merge the dialog artwork phase ancestry - [`53dade7127`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/53dade712771471613bc79d98f4f75e216e0a4c4) _(summary of 5 commits, also listed here)_
- Merge the renderer-mask phase ancestry - [`cc0aae6290`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cc0aae6290fdba3a6b510cbaa0e54f18663932ef) _(summary of 8 commits, also listed here)_
- Merge the four-edge tab phase ancestry - [`767e15bddb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/767e15bddb0fdd45ddd9b856a945ba0fa9411623) _(summary of 13 commits, also listed here)_
- Merge the cloud-verdict phase ancestry - [`6caa0d9617`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6caa0d9617393fae142317d0cc6332a689501851) _(summary of 3 commits, also listed here)_
- Integrate upstream dependency repair - [`8b500ab182`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8b500ab182f864698b038c6272cabed32b69f953) _(summary of 3 commits, also listed here)_
- Merge pull request #55 from Ding-Ding-Projects/dingdingchae-refactored-funicular - [`76125ce006`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/76125ce006ce046b2e2f4d5c680def23aaea1f9d) _(summary of 2 commits, also listed here)_

## 0.1.0-build.613 - 2026-08-06

Tagged at [`aa5574ed65`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aa5574ed6560ff087e3f83eefe513c42e5343526).

### Interface

- Repair release gates for copy, docs, and watcher readiness - [`77c12224d2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/77c12224d20f76e691d72f2b943a2494be68d23e)
- Wrap compact Minecraft folder action - [`4f7c71c163`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4f7c71c163fea47509f28d4c8a56ad8a02eac959)
- Prove Docker world-source compact layout - [`7c343fbb84`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7c343fbb84176ddfed9c5687e085b6b5aa047732)
- Merge corrected main into Docker world-source phase - [`f876961f74`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f876961f74f4bc3ac22f397adef737c05a416add) _(summary of 6 commits, also listed here)_
- Separate generated changelog data from policy scans - [`af2d372754`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/af2d372754b336f22d65a6062d1fd2f102935b61)
- Wire Docker world sources into the map wizard - [`c977ad66ab`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c977ad66ab2c7bb255253e13e4e9e73bfdcaf996)
- Merge SSH phase into self-hosted CI bootstrap - [`bb56bd37a0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bb56bd37a0e4705ac5dc1711dd633e25dc06727e) _(summary of 4 commits, also listed here)_
- Merge SSH world sources into the map wizard - [`515a8cf524`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/515a8cf524d74cdb2b7722d80295bc713ff59ba8) _(summary of 3 commits, also listed here)_
- Wire SSH world sources into the map wizard - [`0db7a0d934`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0db7a0d9341be0a2be13bcbced8765af7a2a413c)
- Count destructive calls, not their declarations - [`26a2d49f7b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26a2d49f7bc02c3e7f947dcfa70564a99b4355b9)
- Wire the git-world-repository screen into the tab strip and the palette - [`6e7ee602a7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6e7ee602a7ab3bd671650dc4b52ef098dbbbe8a4)
- Give the git-world-repository host a screen: sync, track, and adopt from another computer - [`f97286af61`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f97286af6142670452afaa4fb77eab0348178156)
- Show the storage default's real userData leaf, not "Material BlueMap" - [`cfe44e73cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cfe44e73cd0ec2c56b05ad27f6464147e4e12757)

### Server, CLI and configuration

- cli: make -u/--watch actually watch, instead of apologising and leaving - [`61eee4a665`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/61eee4a66560402ce756b48638375f3dd3af8384)

### Desktop shell

- Fix gh release host and account routing - [`f4a3b6c9b2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f4a3b6c9b2787a6a346b6e76f4716c7f328063e0)
- Derive the update feed repository at build time instead of hardcoding it - [`6b8304ca59`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6b8304ca59b7cf20df5b2101374e7d32780013a2)
- Delete the four dead worldsource:* bridge methods duplicating discoverRelease's - [`c3abad0396`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c3abad0396df7217c63e801841071d1b7c11b9fa)
- Bridge dockerworld: wire up the ipc.ts nobody ever called - [`64c0f9a294`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/64c0f9a2948f1281508303f8b4d4955a4cc6d868)
- Bridge worldsource:ssh: a wizard step that could see the channel, not use it - [`76abb04b43`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/76abb04b43eb4f9fdd898be33e2d7d54939e35af)
- Bridge worldrepo: the 11-channel git world host that had no way in - [`639308d855`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/639308d8558a713ece5582519717028ad4aa0ae3)

### Build, release and tooling

- Make changelog checks independent of line endings - [`b061962e1d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b061962e1d3edce3277e5023cb46c0dbb1a97ce7)
- Preserve historical generated-only changelog commits - [`baee22be34`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/baee22be34dcbe4451f2465d2fc7d2b6561f818a)
- Bootstrap every self-hosted CI dependency - [`ee9087c2fb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ee9087c2fbd4f3f4c37270a12e0303ea0ab5945a)

### Documentation

- Record the recovered exact-SHA release gate - [`d3c6354e15`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d3c6354e15c83954672b27eeeeabf5882616cf14)
- Document and index the gh release repair - [`c6093b3914`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c6093b3914701b40744ff4893364b8409be54200)
- Merge cloud-runner phase into gh release repair - [`4a7ea0f843`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4a7ea0f8438612cd7a541eec64f0568a62f502fe) _(summary of 5 commits, also listed here)_
- Repair hosted-runner documentation links - [`7bf8e2a3d1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7bf8e2a3d1344d38e971ee54f4dad1ec0341d082)
- Restore GitHub-hosted workflow runners - [`b76c3d6a69`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b76c3d6a691d71a5ab0b5e2b36887262da41129a)
- Merge phase 1 super-confirmation coverage - [`ebf00b2d14`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ebf00b2d14ea8b5dc36afe9b34409f2680d320d4) _(summary of 3 commits, also listed here)_
- Guard world branch deletion with super confirmation - [`c1fef94f33`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c1fef94f33ab7d3d641fa3ad771b358d31c56fa3)
- Document that the git-world-repository and adoption features are now reachable - [`2b8bf0d9e0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2b8bf0d9e0ddebf43db1c2bd9557f2284d44eaf1)

## 0.1.0-build.612 - 2026-08-06

Tagged at [`7a2a3993a0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7a2a3993a08d917cf69c319f8aebaf3b22d497ea).

### Desktop shell

- Screenshots: reach the Pages tab through overflow when it does not fit - [`7a2a3993a0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7a2a3993a08d917cf69c319f8aebaf3b22d497ea)

## 0.1.0-build.611 - 2026-08-06

Tagged at [`a4ed52e69c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a4ed52e69c6bab8f4ceca221555535fa499e5b70).

### Interface

- Give App.test.ts its own 60s timeout, measured rather than doubled - [`674c1920d2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/674c1920d2db855f96d05f354ebb1fe8b4f7a9e6)
- Cover DimensionSelection.vue in the world.ts call-site inventory - [`8db5170afa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8db5170afadf6d25ac51e1fd4dd0aeb6b9066e7f)
- Exempt DiscoveredWorldsPanel.vue's rename field from the browse-button rule - [`7efa80c211`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7efa80c21147ff9eb730b390825b145360f8ee6d)
- Register four new context menus in the menu-search coverage inventory - [`abe78d04d6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/abe78d04d6a40079c7853bdb9210135a316095fc)
- Register two new AppearanceTarget wrappers in the overlay-dismissal inventory - [`d6ea6eb909`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d6ea6eb909ac6c6c35404b8572d277d57f2e1901)
- Declare three new destructive call sites in the super-confirm inventory - [`eed6990631`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/eed69906317e623766da834c2226f5b966401588)
- Warn once when a render-mask list exceeds the cloud renderer's one-box limit - [`8c6a356ce3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8c6a356ce3d9205214e8544ad2d76b82a1b37039)
- Restore 45 dropped safety facts in the renders-in-progress copy, kill an em-dash, remove a dead catalogue key - [`8559f81761`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8559f81761e8b135d32ff6729cbfcc20d82e2c09)
- Voice the backup screen's create-repository and repository-search copy - [`f552d7a983`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f552d7a983eb69c08ea2ed12b616be5c25216694)
- Give the mask canvas's slider handles a value, not just a name - [`734c7a804c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/734c7a804c863822f9982722d3a4c91cf84629c4)
- Wire the live speed dial into the interface and fix a broken build - [`459136c9b0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/459136c9b02bd202aab52c69ae6687a9bd3cf06b)
- Give the idle preview panel a real Not hosting chip - [`760153a9d6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/760153a9d64713e86c8b3f49270a40e62611b581)
- Give the render mask a drawing surface, so nobody has to already know the coordinates - [`c0d7633997`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c0d7633997449e2d0e58608df261195ab198ffe2)
- Bug-hunt fixes: id collisions, chip wrapping, a redundant tooltip - [`dca118e4a0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dca118e4a014bdc18b7d785bb958ea5025354868)
- Add the Watch it live tab, its copy, and the live-preview docs article - [`02304666e2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/02304666e2c67eb1a51cf8268f608b08dae8f7bd)
- Let the create-a-map wizard render several dimensions at once - [`6328f2d3de`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6328f2d3de0c8939ab36d93d0d7a934fee8df41c)
- Stop declaring Translate and T twice in one file - [`b9c56c419a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b9c56c419a2ace58dd90f01b8cc0e8e442cdd330)
- Give the download row's log its own auto-scroll checkbox - [`8426e7c6e0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8426e7c6e00cb1979c6f4c07af5b4fa560d6d14b)
- Give a running backup's log its own auto-scroll checkbox - [`e12bcd5ef3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e12bcd5ef3b30a5248fe81cc2d90f15cb433fbc6)
- Give the render console a real auto-scroll checkbox - [`28ee5db2f1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/28ee5db2f17159eaa1cf6f7ab80373a13d419163)
- Add shared sticky-scroll following for streaming logs - [`bdb7c5ac98`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bdb7c5ac9819d110b313657ab94b9e75e693c879)
- Test that a missing folder stays on the discovered-worlds panel - [`53b86e5d5c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/53b86e5d5cc2a3f0e2cb088419e934ea517afedc)
- Add a Renders in progress page: every render, every route, never lost to a tab change - [`4374cc85be`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4374cc85be4d59a366ebdd57db8f92f28ee4ebed)
- Show worlds ready to use on the Projects tab, discovered automatically - [`502767e4c7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/502767e4c7730c812de4181a9e0f2a2e1b2f900e)
- Wire the gh CLI accounts list into the GitHub settings section - [`28c1c623cb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/28c1c623cb37a6dac0b38ae1911758e80dd6be8c)
- Add the value layer for drawing a render mask: two-way binding, honest cost, cloud-fidelity check, export/import - [`7240bfc870`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7240bfc870982cd367abbb8d4aba1451e7a0f581)
- Register the gh CLI accounts copy surface into the merged catalogue - [`8d6aee27d7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8d6aee27d7a75ea4932e014dc9faebdb71c2ce7f)
- Surface local git history in notifications and settings, with real pruning and export - [`2406372b85`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2406372b8577690f9dccc482ab7eefb3c5e1d541)
- Unbreak the typecheck the overlay work left behind, and register two menus - [`5bbd3e3a1d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5bbd3e3a1d2782c9c5bda49a3fde7c8825fd1e35)
- Fix null-byte corruption in ghCliAccountsStore.ts - [`ba8930c07f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ba8930c07f2d56edeeeadbc86ebd421029247c88)
- Give the notification centre a date range, behind a collapsible filters row - [`75bdf0aa5e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/75bdf0aa5e7cbce5638668f6c65581ac4a9ff555)
- Give profile and app-settings history a search bar and a date picker - [`b647b15843`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b647b15843db83f5eeea0d78b4095063e90a1a53)
- Restore aria-owns on AppearanceTarget's hand-wired ARIA - [`45bf3c6c29`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/45bf3c6c297b65b5848eab09e4b27050b002f9f9)
- Restore keyboard focus into the appearance popup on ArrowDown/ArrowUp - [`6a099936ce`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6a099936ce3343850ab43a7e7cd7e5fe227ad5e6)
- Detect v-bind object-spread activator/target collision on v-menu - [`9b5dcf636b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9b5dcf636b92ac1b354c6b4a4ed4a25d07781744)
- Re-land kebab-case <appearance-target> fix lost to a concurrent stale-overwrite - [`f0dab6741c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f0dab6741ceca95ccd4baf64979d26d234bb8407)
- Add the claimAppearancePopup/releaseAppearancePopup pair AppearanceTarget.vue already imports - [`2f3f22eb2b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2f3f22eb2b175719645ff93f0f2cc88d75d7de78)
- Detect v-bind object-spread activator/target collision on v-menu - [`f92b4c8375`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f92b4c837508d5029340440f36bac0eb846aa375)
- Fix aria-haspopup staying "menu" when the popup is the editor, not a menu - [`c86f4b7b93`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c86f4b7b937b532d01746ce7332ec0f5f2228a26)
- Fix kebab-case <appearance-target> escaping the overlay-dismissal inventory guard - [`22db2013a5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/22db2013a5e982174222d96612208a5f11f108f2)
- Return focus after context menu closes via Escape or outside click - [`75f85dbaa9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/75f85dbaa91670b5631c7786c61cc84d2b6d77f2)
- Fix: context menu's Escape/outside-click close never returned focus - [`901d285473`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/901d285473904bb39295f9b3e3f2e66e2c26dc66)
- Recognise single-quoted :activator/:target in overlay collision detector - [`5205958ce5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5205958ce5c3bc52fb04396093979318c752075e)
- Add a guard: docs/README.md and docsModel.ts's category arrays must agree - [`e8319c7e49`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e8319c7e49b2d98f4604883b273f0566a4124b55)

### Server, CLI and configuration

- Extend the import-tracking guard to catch a missing export, not just a missing file - [`09c326be6e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/09c326be6e72b92d9263a5fd586128ba91e997a9)

### Desktop shell

- Gate the three real-Windows CurseForge/Bedrock discovery tests to win32 - [`be82630e90`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/be82630e90da48e1d4845042c279cbcf97cebbc2)
- Guard the downloads bridge's worldsource routing with a reachability test - [`27d98c36a8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/27d98c36a81753536733b908bc40431385c3d511)
- Remove three identifiers nobody was using - [`96cd2ca834`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/96cd2ca8348daf75c6137528094852d76ec994ba)
- Serve a render's own folder live, loopback by default, while it still runs - [`a97e06f8df`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a97e06f8dfc828d9bc1a5a673f119201ddac8ae0)
- Detect every dimension a world folder really has - [`3d0b5f083b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3d0b5f083b52948b31d69be11e579ced7930e1fe)
- Refuse a foreign file at the marker's own path, as the module already promised - [`5e933b2ca8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5e933b2ca8da50010edb4aafe5ddc6ca5b707dcf)
- Adjust a render's speed live, while it is still running - [`5b3573ec69`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5b3573ec6987127464aec451e251962938052d67)
- Let the app prepare an unready repository for CI rendering itself - [`68dc465900`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/68dc465900a3960cfaa4207d06b9499bc817e306)
- Let the app prepare an empty or unprepared repository for CI rendering - [`5e9ae2917a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5e9ae2917a6abcf3fa488652e6cfd16eae227910)
- Recognise and adopt a repository this app already prepared for CI rendering - [`7281721d2d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7281721d2d6e2e98feaffed13241869b7d8487aa)
- Discover Bedrock and CurseForge worlds, and multi-instance launcher roots - [`93ed8b919e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/93ed8b919e02e31b52af5419cd3a5e5033f70c5b)
- Let the backup screen create a new GitHub repository, not just pick one - [`c7197d8276`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c7197d82761c2455468211244b0715c6a994bed7)
- Add gh CLI account listing/switching and credential-routing fallback - [`4c44201e3f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4c44201e3f1abff4220ab0d8e4474b2eca9d4b19)
- Autosave projects into their local git history, debounced and quit-safe - [`72acd1da67`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/72acd1da6747c81fd279530971777ff7675cf4c7)

### Landing page and documentation site

- Stop picking your own repository from reading as a name collision - [`ff6ed2a544`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ff6ed2a54482b109ef80d145478fe08dd9fb5546)
- Add regression coverage for the appearance editor's own colour/font popovers - [`4c85b56631`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4c85b5663127de11fcf3f3702380a0f1aa8851ab)
- Give keyboard-only visitors a real Tab route into non-interactive appearance targets - [`44c2b7c9d3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/44c2b7c9d3ae735595b6ca6da73400043c852d36)
- Stop the AnchoredPanel sweep tripping over its own capture group - [`f14d2c6ab2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f14d2c6ab2f183bd3110f2994853c721f963a018)
- Add regression test for Escape closing only the nested regex builder - [`30fabfdd5d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/30fabfdd5d13172953d443d6a2c099b4714780f7)
- Add regression test for AnchoredPanel focus-return guard - [`fa02e95240`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fa02e95240c3d23d757067b57b614a64a5459c2a)
- Stop the element context menu closing under its own regex builder - [`3df11ad75e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3df11ad75e59f16fcaa7f5eb339a74d4eaba6f9d)
- Exempt a menu's own regex-builder popover from closing the menu - [`6b4a2d8550`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6b4a2d8550bc6348dc5e6c231571223af50d34b7)
- Resolve import aliases before sweeping AnchoredPanel construction sites - [`2c6077bd67`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2c6077bd67ade0a1d460ee4587947a46d957d8af)

### Build, release and tooling

- Put the GitHub CLI on the release job's PATH - [`a4ed52e69c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a4ed52e69c6bab8f4ceca221555535fa499e5b70)
- Give Electron its own GTK library and prove its binary exists before launching - [`2926d17560`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2926d175608f634569c5e195dbba984860c0bc23)
- Point the Windows job's bash steps at Git Bash instead of WSL - [`1b4f038ef3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1b4f038ef356c1b2a35829d8dc4c7b3b38d121d2)
- CI: stop reinstalling Playwright's apt deps on every single run - [`fa79fea41d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fa79fea41d1445d2a4ad18978be15a8c9b8df0a8)
- CI: give ForgeGradle a real JDK 8 so it stops downloading a broken one - [`f5df69ee06`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f5df69ee0612cd8d0554bb67729c69c5b3d70f39)
- Give the test run the same heap the typecheck step just needed - [`2773fc2729`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2773fc2729cd47433d076d9909d64f5c8b34fdde)
- Give the typecheck step enough heap to survive its own project - [`d8719ceb1e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d8719ceb1e54d117062c1868d38f480b8571974f)
- CI: move project workflows to self-hosted runners, drop pull_request, add per-job concurrency - [`778d703e05`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/778d703e05013c16dd7017acf48048fb94ebc413)

### Documentation

- Document the gh CLI accounts feature - [`5799697aa6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5799697aa62d69ec1dacc86e78516b52034013dd)
- Document repository adoption, and index it beside its sibling articles - [`9ae3e94ef6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9ae3e94ef63f3adbb132f86a1761050649b2f1d8)
- Document creating a backup repository and searching the picker - [`b68ab86f5f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b68ab86f5f327da5aad50dda5f8274504fc51a40)

## 0.1.0-build.548 - 2026-08-05

Tagged at [`cbd32528a7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cbd32528a7afa47da49df99d7d1b8c1b3081ee28).

### Server, CLI and configuration

- Add a guard: fail vitest when a committed import targets an untracked file - [`cbd32528a7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cbd32528a7afa47da49df99d7d1b8c1b3081ee28)

## 0.1.0-build.547 - 2026-08-05

Tagged at [`c9428a7699`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c9428a76995111fd9fe5dd06cfea91b611ba9064).

### Desktop shell

- Fix winget exit codes silently failing to match their own constants - [`c9428a7699`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c9428a76995111fd9fe5dd06cfea91b611ba9064)

## 0.1.0-build.546 - 2026-08-05

Tagged at [`c00a861bc6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c00a861bc658f585cb128cd9444ff5df03ced16a).

### Interface

- Land first-run setup on Home, not the wizard; make its guard test real - [`c00a861bc6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c00a861bc658f585cb128cd9444ff5df03ced16a)
- Re-index 9 shipped docs articles into the in-app docs browser's categories - [`ec86f50606`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ec86f506064673cd7962d88c2689085da4816a05)

## 0.1.0-build.544 - 2026-08-05

Tagged at [`8a6e8c56bf`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8a6e8c56bfb20dfb532b971c56184bcfad37a872).

### Interface

- Register the dependency installer's context menu in the coverage guard - [`8a6e8c56bf`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8a6e8c56bfb20dfb532b971c56184bcfad37a872)
- Voice the dependency installer in both languages, at every funny level - [`c54ddf9db7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c54ddf9db73c533c7f5d07283b06df13d2022a12)
- Wire the dependency installer into the settings screen's own tabs - [`ae57308c82`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ae57308c82f4160ec09d4f94ef35549a30d4142a)
- Voice Home's own copy, and register it with the guard tests it needs - [`c8db5b5956`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c8db5b5956531d5d9c1802d5826e7a6998a7f997)
- Wire a Home tab: every capability in one place, opening menus not just tabs - [`156c0de173`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/156c0de17393c995f579ebbf9504e2dbdcb59c21)
- Build the one-button winget/Chocolatey installer panel - [`7046c8af4f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7046c8af4f1d50b98341225cdfb055a8f59e23f3)
- Cite the real Temurin download size, and document the Chunker button - [`12495923cb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/12495923cb1393edd7eef4a9c240960d7f0112eb)
- Give the Java row a real download button, and wire up the Chunker one too - [`547f29f10f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/547f29f10fa55661eaec574d4178282b0b5251d6)
- Add a Home tab and the pin-on-first-seen mechanics it needs - [`73921c4286`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/73921c428610cfe35bc9be144cf90102e19213e3)
- Fix right-click menus not closing on an outside click - [`412d9075c9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/412d9075c958c580de5f0688ff3c7b7f85730439)
- Guard every overlay's outside-click dismissal, in both packages - [`a2d22409c4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a2d22409c46af20de9bc4d8a6a43aa5a6699722d)

### Desktop shell

- Stop pinning stdout/stderr interleaving in the spawn runner test - [`4786eb0c02`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4786eb0c021c492da136ddee81ff3a83b3b9e5bf)
- Expose the sysdeps installer bridge, alongside the Java provisioning one - [`fe1d7b652a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fe1d7b652a073d293a94229d4fdbbe50f0c1b3d0)
- Wire the winget/Chocolatey installer into the app's main process - [`5caedc348b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5caedc348b968dffef81cd02120d9b44be1d25b7)
- Add the batch-install IPC channel for winget/Chocolatey dependencies - [`912abc7dbb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/912abc7dbb99e533ed9e1798057c94011684d3c8)
- Add winget/Chocolatey provisioning engine with honest progress - [`34906ca49c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/34906ca49c8c1ff218cb67fd72611708235d9cac)

### Documentation

- Document the one-button settings screen for system dependencies - [`c6f2e13063`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c6f2e13063819e21ab0e42047100c7389db67c78)
- Retire the "JDK provisioning is only fake-tested" caveat, which is now false - [`86afbd39fa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/86afbd39fa60aa925ab3ce394b1d663b2158fd9c)
- Restore the Java-provisioning deep-dive article lost to a merge - [`04cb4a2f65`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/04cb4a2f65d9142afa31b859ce7d6f2e916fb6cb)
- Document automatic dependency provisioning, and index it - [`31a572036d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/31a572036decc7d8c030d09b9ca2a4bce2cd08d4)

## 0.1.0-build.527 - 2026-08-05

Tagged at [`012d01ff54`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/012d01ff547225dfdf96c382b19c3911537dd247).

### Landing page and documentation site

- Fix appearance editor's anchor swallowing outside clicks and dropping focus - [`012d01ff54`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/012d01ff547225dfdf96c382b19c3911537dd247)

## 0.1.0-build.526 - 2026-08-05

Tagged at [`283bb64ff6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/283bb64ff670af0d7a8e131749803f43a4b79ac6).

### Desktop shell

- Prove JDK auto-provisioning against a real Adoptium download, not fakes - [`283bb64ff6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/283bb64ff670af0d7a8e131749803f43a4b79ac6)

## 0.1.0-build.525 - 2026-08-05

Tagged at [`aed41a42b2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aed41a42b2bdf3bbd408f593a94c02fe457ebff5).

### Desktop shell

- Wire Java provisioning behind explicit consent, not just discovery - [`aed41a42b2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aed41a42b2bdf3bbd408f593a94c02fe457ebff5)

## 0.1.0-build.522 - 2026-08-05

Tagged at [`b708d4236d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b708d4236da642c723e8fecd351c557703953782).

### Landing page and documentation site

- Make the changelog CSS test survive a CRLF checkout - [`b708d4236d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b708d4236da642c723e8fecd351c557703953782)

## 0.1.0-build.521 - 2026-08-05

Tagged at [`8796c5152a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8796c5152a66df07e86dc4920c31b468883e50b5).

### Interface

- Exempt the remote file browser's own path field from the local-dialog guard - [`8796c5152a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8796c5152a66df07e86dc4920c31b468883e50b5)
- Add a Settings control for how many parts a download fetches at once - [`e02dd349a2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e02dd349a28d5380258faf6c7c3892e057d655c2)
- Fix CI typecheck: narrow the remote hosting test mocks to their real union arms - [`6f0e9f7c97`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6f0e9f7c972a074e80d52c3b759b251b2da67123)
- Put a Scheduled re-rendering panel on the CI-render screen - [`df661a992b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/df661a992b8fcb43c7e8f0bd972a685be151a155)
- Fix CI lint: use the schedule fake's owner/repo, drop a leftover probe test - [`4e43d53c01`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4e43d53c015ba3c84c81042705885cde77ce0016)
- Give the render memory ceiling a place in the version history too - [`6be888404b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6be888404b8ce3ec6fed7f526defe65f87a1343c)
- Declare the remote file browser's dialog in the blocking-surface inventory - [`a756a47525`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a756a47525fbc91619d712359f28dbc38bcc893a)
- Let people choose how long a toast stays before it vanishes - [`85fcbd25f2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/85fcbd25f28a2a21c668bd5b394aa027b23ee0ba)
- Add an SSH file browser with world-folder recognition, Explorer-style - [`cb30adbb22`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cb30adbb2231523d3a59332eaff6e5434b5c81d0)
- Wire scheduled re-rendering's status and controls into the CI-render composable - [`8c34944d76`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8c34944d76a9aaff8f79b9978215f33ea517e6cd)
- Add the remote-hosting UI panel: publish, verify, and a gated stop - [`aa5a437c2c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aa5a437c2c102187b92caeb3f92bdebf91f4bf26)
- Give the render memory ceiling an actual settings row - [`6293d10592`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6293d1059207025c8493722bd36f26eedc8b09d0)
- Correct docs/backup.md and BackupScreen.vue's restore claims, and record the live proof - [`9a1af80561`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9a1af80561c60001561de1d9d2a81a64645ef92d)
- Saved SSH hosts: last-used ordering and a Duplicate action - [`5e404764d8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5e404764d8f734d1d3dffb2c1aba493b86269226)
- Fix a fakeBridge left behind by a lost edit, and cover the link field - [`e77e69b3f1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e77e69b3f16f2255ba1960cd909313693952db65)
- Cover the downloads bridge's new parseLink capability with tests - [`f2d7ff324e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f2d7ff324e33c1d71624a038b5b295f87220f20b)
- Let the downloads panel resolve a pasted link into owner/repo/tag - [`2b8b4012e2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2b8b4012e20bdf5c218235446d8e8d223c1c57d2)

### Rendering and world data

- Teach the scheduled-render change check a fourth world-source: git - [`8468933278`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/846893327859aadf5acf70c39d8f8c92620426d2)
- Add fingerprint/schedule-due/schedule-check to the render-actions CLI - [`7b81b7d4a6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7b81b7d4a6770e7af24514d07c75222418433372)
- Share one world-fingerprint function between the desktop app and CI - [`afe4969912`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/afe4969912b5ccb2ec79e6de5941868dcd09abd6)

### Server, CLI and configuration

- Gate release on the real Java config round-trip, fix stale CI comment - [`a6ffa75fbb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a6ffa75fbb0f69168703da6f3b7382ef9d4a6f49)

### Desktop shell

- Investigate the two upload part sizes; conclude neither is a user setting - [`f7445d408e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f7445d408e07025a2fbe2e478abc9fc3e7bbec92)
- Wire the download-concurrency store into main/index.ts - [`ce917dd1e8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ce917dd1e866b905623142d1c924f162d00901d9)
- Make part-fetch concurrency a live setting instead of a construction-time freeze - [`db0e0b47cc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/db0e0b47cc5ee6907252281d925812fbe8c06c68)
- Add a persisted download-concurrency store, read fresh like the render ceiling - [`df72c916a3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/df72c916a313dd56c567d82657f7fb853891432f)
- Fix the Docker world source's overclaimed test count, false no-override claim, and unwired change check - [`c29a9a60d7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c29a9a60d70d887c5e371ba6e463970131edeb12)
- Export REMOTE_HOSTING_EVENT_CHANNEL, wired to main/index.ts's broadcast - [`8103b6b59f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8103b6b59f871609a0424d61e5c1504b5a847d20)
- Carry scheduled re-rendering across the preload and into the UI bridge - [`beaf22f21c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/beaf22f21c684a47413dd8831802d84b42d51431)
- Expose scheduled re-rendering over IPC: cirender:scheduleRead/Write - [`f3f28000c0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f3f28000c0dfe3e7ebefacfcae399291c2130b7c)
- Wire the git world source into CI, the app, and prove it stays incremental - [`e5a34daa9f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e5a34daa9fa433df45985acb80719f64039e4839)
- Let the app read and write scheduled re-rendering's configuration - [`ea2638f5ad`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ea2638f5ad8fe626983ce0c5a0cf343ceadaeaad)
- Teach both CI-render credential routes to read and write repository variables - [`65c993281b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/65c993281bf916dea592f76c71247256a5adcaac)
- Expose the remote-hosting bridge from the preload script - [`26136a548a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26136a548a36f6d75d6224f6a4d82de18eef0021)
- Fix the live resume test's own cancellation timing, then run it for real - [`c29a7afd39`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c29a7afd394562776049f1a607e7912db5d58a35)
- Wire the SSH world source into the desktop app's IPC bootstrap - [`7dc95f1c0c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7dc95f1c0cd23d62b4b5534475de18d8312a6973)
- Test the Docker world source: 74 cases, no daemon and no Docker required - [`ad001e0de3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ad001e0de31679899d5f081a7b346d3f1f34a0a0)
- Fix a real bug found by testing backups against live GitHub: not every 422 is a taken tag - [`0e8646c980`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0e8646c980fe8c0688b0650c1c354f94e52f0e61)
- Wire the hosting IPC channel and export it from remote/index.ts - [`4d75529988`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4d755299888824f1b1b84822e5930ffc4814b6d0)
- Cover the SSH world-source IPC layer and its fetch tracker - [`dbed3a7069`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dbed3a7069cb6371d241ffb5de2bdf27aa6f28c2)
- Cover the hosting orchestrator against fakes: no SSH, no Docker, no server - [`b32550c7e2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b32550c7e2bb5b24b12360eba5380fe2a522263c)
- Add a git-repository world source: publish and sync a world incrementally - [`7823191120`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/78231911200cb154c3642618f922b4bd081ab5de)
- java-render-path: drive the orchestrator with a real JVM, not just java -jar - [`cde99fc5fa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cde99fc5fac2d9225768e01c1102a3a3f34cdeba)
- Fetch worlds over SSH, from Linux and from Windows - [`4b06a0ad75`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4b06a0ad75ca17eb9e61eb216d2f09020b049447)
- Reach a world that lives in Docker: bind mount, named volume, or a container copy - [`cf5e0b1437`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cf5e0b1437ec42054703d3fd15f3b5b970e0b95c)
- Correct the backup barrel's restore claim and export restore.ts - [`af66df04cf`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/af66df04cff7d38e6592576b3ae5199ffd77241d)
- Add the remote hosting plan and orchestrator (host a rendered map over SSH/Docker) - [`0c791cf3a5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0c791cf3a59aab37886f8cefc415c03ba26f17d0)
- Add the Cheap LFS restore engine backups never had - [`6aa433d4b5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6aa433d4b5fb19a4a22ebd78391aa7029728ca2a)
- Prove the memory ceiling reaches the JVM, not just the config file - [`45cdb6950e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/45cdb6950ef5040cb09fccd8b24c55e54f79f6d2)
- Apply the chosen render memory ceiling to every render, not just the setting file - [`1370791789`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1370791789f1f81f52b01bd9ad7eb6a4c7eda56a)
- Route release downloads through worldsource, so cross-repo actually works - [`08d5197f17`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/08d5197f17eb84909a5c48e3e479c280741f84b1)

### Landing page and documentation site

- Voice the downloads link field, and stop contract articles quoting stale test counts - [`d5136880a1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d5136880a10ac4cfa44363b3bfff296bcf2c96f3)
- Site: promote resource-packs and publishing-to-pages to shipped, add a status-drift guard - [`4577591f3b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4577591f3bed28382e35c9468f1977f2d8dee902)
- Document remote hosting: docs article, site article, and cross-links - [`7ccd96a505`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7ccd96a505df505f729284cee838a0bf23a9733b)
- Finish the site rebrand: colour the feature cards, fix the settings dead zone - [`1cb604b0d0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1cb604b0d003f7179e35ecda08df80a9a71945e8)
- Close the marker regex builder's silent key collision, finish two localization gaps, and correct five stale contract pages - [`e2fc5f1901`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e2fc5f190139b6d27e3140857fe3e053aa04b0b1)
- backups: promote to shipped, on real proof, and name the one real gap left - [`e319bc3096`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e319bc3096a1358a6edac31c2aa60e06f1ae5967)
- Bring the home page's release-downloads card in line with the article - [`302b9718dc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/302b9718dc577269fe17b33a96071861ff4cc432)
- Fix the release-downloads article: it described a field that did not exist - [`bbc8f12d9a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bbc8f12d9a8d6b643fcec52299cc55029780c1f6)
- options-gui: run the exit check and a real hand-driven save, correct stale test counts - [`414b63e81e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/414b63e81e7655fb4ccd928e73f58ec7b68c7da6)
- github-sign-in: prove the device flow and token check against real github.com - [`831258681e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/831258681e06f0f36c154ba17d72eaeaec61e430)

### Build, release and tooling

- CI: actually run the real Java CLI round-trip test, not skip it - [`3a90ca5af6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3a90ca5af6eec2aee383ec8ad0cc8cc27d711869)

### Documentation

- Document the git-repository world source - [`0f296e0715`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0f296e0715bd1bd739f3786edeec2458bfaaa14b)
- Document the Docker world source: three routes in, one refusal with no override - [`af0dfd2397`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/af0dfd239710d943c4c684a8837d1ed7d087981b)
- Document worlds hosted on your own SSH server - [`23cee21208`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/23cee212085c6b0de0606e7952b81753e1e85718)
- Wake up hourly, render only when the world actually changed - [`f6b9f5d927`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f6b9f5d927006af853440587833d76eb33f4b72a)
- Retire the world-sources doc's warning: the desktop UI is wired now - [`fb459c1b1e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fb459c1b1ecdd369fef5319baff4686cd72c0ec4)

## 0.1.0-build.463 - 2026-08-05

Tagged at [`9b0c43b553`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9b0c43b55389fcb5455d44e3147c97b879da2ccd).

### Desktop shell

- Bedrock worlds: run a real Chunker conversion, and stop saying "ported" - [`9b0c43b553`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9b0c43b55389fcb5455d44e3147c97b879da2ccd)

## 0.1.0-build.459 - 2026-08-05

Tagged at [`b61cc8a398`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b61cc8a398bd2f70c954882524129a84a7f5b6c4).

### Landing page and documentation site

- Rebuild the landing page as a rebrand, not a retouch - [`b61cc8a398`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b61cc8a398bd2f70c954882524129a84a7f5b6c4)

## 0.1.0-build.458 - 2026-08-05

Tagged at [`3fb1586e69`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3fb1586e6942821c100da51e78855cbedfa73120).

### Landing page and documentation site

- Undo an accidental over-commit: main.ts had picked up unrelated in-flight work - [`3fb1586e69`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3fb1586e6942821c100da51e78855cbedfa73120)
- Give the chrome and settings surfaces the Beacon Cartography identity - [`46aff77464`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/46aff77464c68d4f140dbb73d71ff64e8fb155e1)

## 0.1.0-build.457 - 2026-08-05

Tagged at [`107a032e25`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/107a032e25e7bd56fef0137282d743245922e82f).

### Landing page and documentation site

- Rebrand the site's Material 3 identity system: Beacon Cartography - [`107a032e25`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/107a032e25e7bd56fef0137282d743245922e82f)

## 0.1.0-build.454 - 2026-08-05

Tagged at [`3e2d60da4a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3e2d60da4ace9f7426374c5b1eab5cd37e1d2727).

### Landing page and documentation site

- Extract commit links from changelog entries even when prose trails them - [`3e2d60da4a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3e2d60da4ace9f7426374c5b1eab5cd37e1d2727)

## 0.1.0-build.452 - 2026-08-05

Tagged at [`d3d523ee5a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d3d523ee5ab6e1baa6234184c3d06e36be902861).

### Landing page and documentation site

- Stop the Changelog page scrolling sideways at phone widths - [`d3d523ee5a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d3d523ee5ab6e1baa6234184c3d06e36be902861)

## 0.1.0-build.450 - 2026-08-05

Tagged at [`840bbc875b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/840bbc875b01dcb1069de1b5223dedfc3ef4af64).

### Landing page and documentation site

- Replace the phone-width tab strip's overflow menu with scrollable tabs - [`840bbc875b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/840bbc875b01dcb1069de1b5223dedfc3ef4af64)

## 0.1.0-build.449 - 2026-08-05

Tagged at [`5f9e069bff`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5f9e069bff952ce8fa02707008726ccf5f5c372c).

### Build, release and tooling

- Fix CI: pin vitest to two forks so the RPC heartbeat stops timing out - [`5f9e069bff`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5f9e069bff952ce8fa02707008726ccf5f5c372c)

## 0.1.0-build.444 - 2026-08-05

Tagged at [`e3cadaa135`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e3cadaa135bad327b4cbb24da2a69ce869f2ede0).

### Landing page and documentation site

- Give appearance presets real multi-select, bulk delete and a scoped export - [`e3cadaa135`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e3cadaa135bad327b4cbb24da2a69ce869f2ede0)

## 0.1.0-build.443 - 2026-08-05

Tagged at [`630f6ae9d8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/630f6ae9d8d0cb8cf67c5b9b04431fc472ae15d1).

### Landing page and documentation site

- Give the notification centre real multi-select, bulk delete and scoped export - [`630f6ae9d8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/630f6ae9d8d0cb8cf67c5b9b04431fc472ae15d1)

## 0.1.0-build.442 - 2026-08-05

Tagged at [`43e12111e9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/43e12111e9ea878af68f2eaf6a45144bf4ef3272).

### Server, CLI and configuration

- Fix Screenshots-job EULA capture and widen a real-timer debounce test's margin - [`43e12111e9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/43e12111e9ea878af68f2eaf6a45144bf4ef3272)

## 0.1.0-build.441 - 2026-08-05

Tagged at [`0f46fa5d21`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0f46fa5d21cf6e57863355ab40f8647a4ff90bd8).

### Landing page and documentation site

- Voice the site's chrome that content rendering adds: badges, page titles, error boundary - [`0f46fa5d21`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0f46fa5d21cf6e57863355ab40f8647a4ff90bd8)
- Fix: [hidden] tabs kept rendering, and settings clear buttons showed text not icons - [`3d7fda350b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3d7fda350bb25da72aa101d7b68149257c696dbc)
- Extend the destructive-action and blocking-dialog guards to the site - [`623db68ce7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/623db68ce7edb4aa1dce5a92c5da4467469525ce)

## 0.1.0-build.434 - 2026-08-05

Tagged at [`a6652d09f5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a6652d09f5594a1ca59df1b7b68816dd55b517f9).

### Landing page and documentation site

- Make every appearance target findable and teleportable, not just settings - [`a6652d09f5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a6652d09f5594a1ca59df1b7b68816dd55b517f9)

## 0.1.0-build.433 - 2026-08-05

Tagged at [`9bbedf6d9b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9bbedf6d9b8ea72ccbde2fe1583398dbfe8227c1).

### Landing page and documentation site

- Remove the site's dead shell/panels.ts, orphaned since its first commit - [`9bbedf6d9b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9bbedf6d9b8ea72ccbde2fe1583398dbfe8227c1)

## 0.1.0-build.432 - 2026-08-05

Tagged at [`00341f0985`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/00341f0985f587d64b157a4801d3a8e543eca7f6).

### Interface

- Test the tour's reduced-motion path directly, not just claim it in a comment - [`00341f0985`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/00341f0985f587d64b157a4801d3a8e543eca7f6)

## 0.1.0-build.430 - 2026-08-05

Tagged at [`9902962789`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/99029627890465794f862c40e0dfb2bb3d92fabb).

### Interface

- Register GlossaryTerm.vue's popover in the menu-coverage guard - [`9902962789`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/99029627890465794f862c40e0dfb2bb3d92fabb)
- Stop the tour's own doc comment tripping the catalogue scanner it explains - [`6e3204dac0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6e3204dac0651847e1e282da641af55f0cc716cd)
- Explain the vocabulary in place: a click-to-open glossary affordance beside every undefined term - [`21a1c1f596`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/21a1c1f596a4788641c7362b8b2b7ea1de17ca08)
- Add the interactive tour: a guided, anchored walkthrough of the real first-run path - [`5e492cd83f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5e492cd83f52bf2298bd54bb9ee6fd54f03b7615)
- Fix the viewer-menu search never filtering its own option lists; clear the settings-drawer search of any bug - [`261a5cb580`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/261a5cb580c32cad0de875a3ca3aba6075bce47f)
- Give the landing page a real hero, tonal stat cards, and a beginner's path - [`584a4ba0c1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/584a4ba0c1594ce9b838467269a27177d5edfc69)
- Fix the viewer-menu search never filtering its own option lists; clear the settings-drawer search of any bug - [`bdc36eb017`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bdc36eb01734a9e08d59a9c5bfbf412f40553462)
- Show containers left running from an earlier session, on the world screen - [`6cb22b54c1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6cb22b54c15b69a4a958be8cc1d702edfc34084b)

### Landing page and documentation site

- Restyle the settings tab row as an M3 segmented button group - [`2bc27c1ffc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2bc27c1ffce8ae3c327dfd5601ab3336b38375e3)

### Documentation

- Fix docs/world-sources.md: stop claiming the desktop app wires a channel it never calls - [`e59f4540b7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e59f4540b7aa46bf9ceda776cb2fdcf534969678)

### Elsewhere in the repository

- Merge origin/main: reconcile after a same-second local/remote commit race - [`f1a6e8d07e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1a6e8d07edbc6456934415bc434249a2731be3e) _(summary of 2 commits, also listed here)_

## 0.1.0-build.419 - 2026-08-05

Tagged at [`d704cf1771`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d704cf1771fb4559eeee98dc8affb83db6082a08).

### Interface

- Wire the project History tab: main-process history existed, nothing ever showed it - [`d704cf1771`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d704cf1771fb4559eeee98dc8affb83db6082a08)
- Make empty states teach: what a thing is, why you'd want one, and the button that fixes it - [`9421c31cdc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9421c31cdcb1ca6bea6acd77b8ef333a61062b8c)
- Wire cirender:active to the bridge; delete two channels nothing ever called - [`29383715b4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/29383715b47bddbbb100cd87f15b2467808d3745)
- Fix batch-2 audit findings: zstd main-process crash, stale README phases, stale coverage comment, GitHub sign-out gate - [`ea6528a3d8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ea6528a3d8e2321d0efe5ae39a6f7c40e143451a)

### Landing page and documentation site

- Wire the anchored regex builder into the two site search fields that skipped it - [`a1eb01a128`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a1eb01a1282438a9a3da726a23c9917b46eec0d9)

## 0.1.0-build.412 - 2026-08-05

Tagged at [`57a6476eaa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/57a6476eaa40a24a843979b3867dcb2fe5db42b9).

### Landing page and documentation site

- Give the site's command palette real inline setting controls, not just a link - [`a72fa8f43f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a72fa8f43f31a8677357a47424a6ee6d3ccb2e67)

### Build, release and tooling

- Publish RELEASES and the Squirrel .nupkg as their own release assets, not only zipped - [`e613e68439`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e613e68439ee22a87e00c4015fb7f2358c78a68d)

### Documentation

- Bring HANDOFF and ROADMAP up to the current tip after the UI-defect wave - [`b4e2879650`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b4e287965076e32e2d22c4901547a3abe181dab1)

### Elsewhere in the repository

- Publish RELEASES and the Squirrel .nupkg as their own release assets, not only zipped - [`b66725b7f7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b66725b7f7eaa375c7330c5e38f85fba1f066d6e)

## 0.1.0-build.407 - 2026-08-05

Tagged at [`9bf33b3c66`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9bf33b3c661c7d7ad6991e061f54cf4d133b210d).

### Interface

- Give the placement chooser, the new-tab picker and the overflow list a search field - [`9bf33b3c66`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9bf33b3c661c7d7ad6991e061f54cf4d133b210d)

### Landing page and documentation site

- Site: publish a newcomer glossary, reachable from the install article - [`67358ace08`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/67358ace083674a5917f26924016ae9115e9e071)

### Documentation

- Recapture the six render-*.png screenshots with real consent, and cite them in eula-and-consent.md - [`8ca84fa7f7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8ca84fa7f78653c5bf0fad019801a14834d06537)

## 0.1.0-build.403 - 2026-08-05

Tagged at [`1ce004035c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1ce004035c89ca4fb3cc1fa77ab25de878e6e8e4).

### Landing page and documentation site

- Site: cover appearance/colour, confirm gate, notifications and dim sum with tests - [`1ce004035c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1ce004035c89ca4fb3cc1fa77ab25de878e6e8e4)

## 0.1.0-build.402 - 2026-08-05

Tagged at [`dafbad470f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dafbad470fb88d8e05c21797014cb997ea328eec).

### Interface

- Fix the repair panel's agent chip clipping its own sentence at the docked-right width - [`56b12939f8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/56b12939f844f713f52dbde397324fc10c3c073a)
- Prove the settings drawer needs no FAB gutter: its z-index already wins - [`cf80e54a8c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cf80e54a8c4dbd2628c0a80449daf771e4a6424d)

### Landing page and documentation site

- Bring settings, content and search surfaces onto the M3 token layer - [`dafbad470f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dafbad470fb88d8e05c21797014cb997ea328eec)
- Site: document the world-sources release-downloads path, tidy two blank table headers - [`f18c50b9dc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f18c50b9dcd709f37f5fe492b98444fc36e3a7be)
- Fix four stale/missing claims: update copy, two render-location docs, and a Windows installer shipping no CLI jar - [`c13916cddc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c13916cddc24879c771fbfcc464ebf33e23de986)
- Give automatic repair a site article; fix two stale facts and a missing roadmap credit - [`aacfb707ff`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aacfb707ffd72af5d0fc4f23601992734b4ee883)
- Add site articles for world discovery and Bedrock conversion; correct a stale "pending" CI claim - [`2c2ae68ad6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2c2ae68ad6519b42434a259964ddfa2a18f2d47b)

### Documentation

- Make Java the standing render default, not a placeholder for the gate - [`be296c29b3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/be296c29b3df70ed5d7ed2982e7d1df856f07745)
- Audit the whole session against reality: 24 done, 2 partial, one stale summary caught - [`0ce6ed0c46`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0ce6ed0c468c150c83ee7d649f5f7c7ccea6683d)

## 0.1.0-build.393 - 2026-08-05

Tagged at [`c02e867cb0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c02e867cb02ab9592b00a157d72328564ca94e16).

### Interface

- Fix EULA export rows that dim with no stated reason: the doc comment already promised one - [`c02e867cb0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c02e867cb02ab9592b00a157d72328564ca94e16)

## 0.1.0-build.392 - 2026-08-05

Tagged at [`8e2c44b57f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8e2c44b57ffbce4380f54bd8fb11631dcf719655).

### Interface

- Fix the Cantonese funny-level caption landing on top of its own tick label - [`8e2c44b57f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8e2c44b57ffbce4380f54bd8fb11631dcf719655)
- Fix the bottom-left FAB stack painting over page text at every width and scale - [`26d74a8a28`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/26d74a8a28061adeb2d56de2d4a795f99df3d1f9)

### Documentation

- Document the test-and-capture pass: two real bugs, the cleared screenshot backlog - [`8ae6a0a7ba`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8ae6a0a7ba6a1950fed587074e9d10cb8fc58f15)

## 0.1.0-build.389 - 2026-08-05

Tagged at [`b3ab47a548`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b3ab47a548f50873e83a17fe5d427e37bee1fb9e).

### Interface

- Fix: the save gate could ellipsis a file path with no way to read it back - [`d7cda3bb41`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d7cda3bb419abc787a38944982b5f52a0d5b9685)

### Desktop shell

- Add a per-render account picker to CI render setup, no active-account switch - [`44e8453262`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/44e84532628bb9a623d45d9b1ff5a1fcc51c701b)

### Documentation

- Refresh both live-Pages screenshots against the real hosted proof sites - [`b3ab47a548`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b3ab47a548f50873e83a17fe5d427e37bee1fb9e)

## 0.1.0-build.386 - 2026-08-05

Tagged at [`7dbfc17754`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7dbfc177547db4456db22c7c9797822ade3d6a1a).

### Interface

- Fix: the docs browser's index and search results ellipsed titles with no recovery - [`7dbfc17754`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7dbfc177547db4456db22c7c9797822ade3d6a1a)
- Fix: a long marker set id could overflow its own panel header - [`7601828449`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/76018284492955b7a80d666bd6ec0c35cb9e3154)
- Fix: tab search results and the group picker lost long labels to a silent ellipsis - [`df1037d947`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/df1037d947098ea654f2b435a269a663d0b4fc1f)
- Fix the whole GUI wearing a hand cursor: answer Vuetify's [aria-controls] rule at the appearance wrapper - [`01d21eb901`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/01d21eb901c5785c08dd3b759780925c595c2210)

## 0.1.0-build.382 - 2026-08-05

Tagged at [`1074ea3325`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1074ea332537fbe9832085558553dba007bef4dc).

### Interface

- Fix docked panels not scrolling: floating panels had no real height, and the body's flex chain to nested content was broken - [`2b04a82f5b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2b04a82f5b9bc8198978904c508b2bcc5279c49c)

### Documentation

- Refresh 49 documentation screenshots against a quiet machine, fix the settings-tab capture gap the sweep exposed - [`1074ea3325`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1074ea332537fbe9832085558553dba007bef4dc)

## 0.1.0-build.380 - 2026-08-05

Tagged at [`89702241b2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/89702241b2abf007af5138a03d8028dfce4d09cf).

### Documentation

- Record a screenshot-by-screenshot visual audit of the current build - [`89702241b2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/89702241b2abf007af5138a03d8028dfce4d09cf)

## 0.1.0-build.378 - 2026-08-05

Tagged at [`c533c8c8d4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c533c8c8d49655194057882a5896e583c35ffd8e).

### Rendering and world data

- Give the hyphenated-map-id resume test its own real-I/O timeout - [`623807459a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/623807459a7fe8325a9889144462f06ec5ad2c88)

### Desktop shell

- Fix #resume: a resumed backup renamed every part and re-uploaded all of them - [`c533c8c8d4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c533c8c8d49655194057882a5896e583c35ffd8e)

## 0.1.0-build.374 - 2026-08-05

Tagged at [`0e9b4edf53`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0e9b4edf53185ae3e12553ac29933274eb7cff29).

### Build, release and tooling

- Release notes: link the changelog they never mentioned - [`0e9b4edf53`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0e9b4edf53185ae3e12553ac29933274eb7cff29)

## 0.1.0-build.373 - 2026-08-05

Tagged at [`0ad90f07be`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0ad90f07be4fe747a0ad3453c56c4407669713ed).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.372 - 2026-08-05

Tagged at [`db9affde7c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/db9affde7cfa1bdf1cdefc95fe94c609fa0c6a62).

### Documentation

- Stamp HANDOFF and ROADMAP to the green tip: CI run 31013825875, release v0.1.0-build.370, zero open issues - [`db9affde7c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/db9affde7cfa1bdf1cdefc95fe94c609fa0c6a62)

## 0.1.0-build.370 - 2026-08-05

Tagged at [`9d8de68592`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9d8de685922f116d9d9215c5df15ebfbbac6c4c9).

### Interface

- Fix the second blocker CI queued behind the first: a collapsed tab strip and a wrong-tab menu button - [`9d8de68592`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9d8de685922f116d9d9215c5df15ebfbbac6c4c9)

## 0.1.0-build.368 - 2026-08-05

Tagged at [`3dc7ef57f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3dc7ef57f4f454e966987c981ac82c76d12e73d6).

### Desktop shell

- Fix Screenshots: the EULA panel has a hidden evil twin, and the wait was watching it - [`3dc7ef57f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3dc7ef57f4f454e966987c981ac82c76d12e73d6)

## 0.1.0-build.366 - 2026-08-05

Tagged at [`86277c5f37`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/86277c5f377cd9697f8398ee7a66942f08fc5e25).

### Rendering and world data

- Fix #47: mirror BlueMap's own map-id sanitiser instead of guessing at the hyphen - [`1dfe8a1f60`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1dfe8a1f607ac443ee15c24e8659d0a4303dd2a4)

## 0.1.0-build.364 - 2026-08-05

Tagged at [`a1f8172402`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a1f81724026d5d86b3f74eaef0e909cc7410a596).

### Interface

- Fix MarkerMenu.test.ts's flaky filters-open assertion: give it its own localStorage - [`a1f8172402`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a1f81724026d5d86b3f74eaef0e909cc7410a596)
- Add the missing test for MarkerMenu's settings-history mirror - [`2a06e1979f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2a06e1979f49938a43d6229126178a53bb931d63)

### Build, release and tooling

- Close issue #32: SQL storage proven cross-compatible with upstream's Java engine - [`b2c8261649`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b2c8261649b684454b47108e1617b62732d7d0b9)

### Documentation

- Record issue #39's real two-wave dispatch: df numbers, not arithmetic anymore - [`e4e62dba88`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e4e62dba88572575d2864a7c516b9fcf8cfe6593)

## 0.1.0-build.358 - 2026-08-05

Tagged at [`321e0cf634`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/321e0cf634c245fa9db7eceb46527bfc0a066f3b).

### Build, release and tooling

- Close issue #31: modded textures.json parity, proven offline - [`321e0cf634`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/321e0cf634c245fa9db7eceb46527bfc0a066f3b)

## 0.1.0-build.357 - 2026-08-05

Tagged at [`cfab9a1f73`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cfab9a1f736ac96ef3429386a4ab03efc1cf7979).

### Interface

- Fix four more stores: mirror settings history even with no local storage - [`cfab9a1f73`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cfab9a1f736ac96ef3429386a4ab03efc1cf7979)

## 0.1.0-build.356 - 2026-08-05

Tagged at [`e569e47831`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e569e478313b21fd84e5e789a76965f0fda56598).

### Interface

- Fix writeEulaStrip: mirror the EULA tab layout even with no localStorage at all - [`e569e47831`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e569e478313b21fd84e5e789a76965f0fda56598)
- Finish wiring every localStorage settings store into the history mirror - [`cd0a78d2c1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cd0a78d2c101061341cadcc488c1449ed5c6a3f7)
- Chore: sync appearance store, palette prefs, remote targets, setup i18n, tabs storage, update model, settings dock placement, eula storage, marker menu, appSettingsHistorySync - [`20613ead77`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/20613ead7775d54bb522b6300ae97393dfef4766)
- CI: silence pointless vue-i18n warning flood that was tripping vitest's RPC timeout - [`e77f11ac22`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e77f11ac22350a73dbb5f8aca747073e62624118)
- Wire the two staged history/repair channels into their real mutation and failure sites - [`cae7ee86f3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cae7ee86f30d8f29c12e7503e79737b5e365ae93)
- Fix palette Debug-row test collision and the CLI e2e webapp-bundle gap - [`49160ef0c7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/49160ef0c75e289428a41ad88c7021f6950ff28c)
- Find the real bug behind a test left honestly red: TabGroupPicker's own trap was fine - [`711e534b7a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/711e534b7a583c93dac99e71411263c25b6adbef)
- Give the progress panel real tile-count honesty, real upload bytes, wave truth, and its route (#38) - [`d4f83fa540`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d4f83fa540d4782762974ccbc18f762340e58489)
- Bridge and mount automatic repair diagnostics - [`6981bf9ca4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6981bf9ca4f19896aef88872d32ccfb23ad4f66b)
- Register the last unwired copy surfaces and fix a genuine tab-group-picker search leak - [`f8e828318b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f8e828318befff17f9fdae4d340feb23fef874cd)
- Bridge and mount Bedrock world detection and conversion - [`bb94e7b39c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bb94e7b39c40e0275400c3111c299ea841f27b6d)
- Fix the History capture's stale Vuetify selectors, and settle #36 as format conformance - [`2a1405b9cb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2a1405b9cbd60bb07bf79466835d7e628f7dc5d0)
- Bridge and mount browse/restore for the profile-list and settings histories - [`a66e34a13a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a66e34a13a48f53e07164bdeecf66ea2c84325c6)
- Fix the notification bulk-delete gate's completion hold and surface hidden previews - [`b87c91deb6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b87c91deb6f15b3da68bb434a78b236b2c7f4803)
- Name the reason Go Fullscreen is disabled instead of leaving it blank - [`343285f5ac`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/343285f5acaef63496547efb232144fd8e8cdaec)
- Fix the typecheck errors the parse-crash fix had been hiding all along - [`e551d934d8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e551d934d883e5bed291ec1b8e185ee10ba09c9b)
- Fix the vue-tsc parse crash that was flunking every CI run since the sweep - [`d92b71c5ef`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d92b71c5ef2ff4c65bf1642ac016aacd6acddd7d)
- Fix CI-render sign-in wiring and add ARIA live regions - [`0ca1d645bd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0ca1d645bdb559a32bb8ff32ef7015492a3ac091)
- Give the wizard's downloads disclosure an aria-controls target - [`033bd8f916`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/033bd8f9165fbba9b336be22612fd66ba38f83ea)
- Make the save dialog's Escape and outside-click honour the in-flight guard - [`5e3104fe76`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5e3104fe768becdae434bf8e7e388c89d0b7f4db)
- Let Escape reach the settings regex builder's popover - [`dc8f2fe89e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dc8f2fe89e2e5df16280feba9749131cc7741232)
- Fix: small UI and config cleanup, align paths, fix test expectations - [`649869166c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/649869166cf58a84d1643d238dea2eda222ca41e)
- Auto commit 2026-08-05 04:37:15.299Z - [`78a87fbf39`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/78a87fbf39542ba9e4da99f470876a0183334efb)

### Rendering and world data

- Prove SQL storage against real MySQL/MariaDB/PostgreSQL servers (issue #32) - [`926ae2b5be`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/926ae2b5be36a987bc07ce327b3642a44c5ff4a5)
- Gate the flattening rename on both world AND pack era, not world alone (#46) - [`1642a29371`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1642a293718066fd59702b7775599fa7c06e5493)
- Prove Phase C check 2: a real 1.12.2 jar through the legacy compat path, and a genuine finding (issue #31) - [`965af52d6c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/965af52d6c2aaa9c4211148f1cd3e204792269cd)
- storage/sql: cover render-state grids and the always-uncompressed markers/players - [`250e7e700a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/250e7e700a6d2326d037ebf4bff76ab08bc1be52)
- storage: dialect resolution, driver-adapter and byte-fidelity tests; ROADMAP + deviations - [`b32f423b26`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b32f423b2687711f734fc2447fec132c5e194e33)
- storage: port upstream's SQL storage (sql.js/mysql2/pg, pure JS, no native modules) - [`0bc90c2c25`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0bc90c2c25dbc17dcf8c83f18cf9a75261b943b4)
- RenderManager: expose saveRenderTaskQueue / loadRenderTaskQueue (#30) - [`8f61600f44`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8f61600f44a1819bfc4f0c8e124c4754fe572866)
- Port SerializableRenderTask and the per-task Serialized forms (#30) - [`a5e5cf7ab7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a5e5cf7ab7e92b4cf123caea8f14ffe9fd03b478)
- Drop yauzl-promise from engine's ZipFileSystem: esbuild cannot bundle its native crc32 addon - [`e976ee9f6c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e976ee9f6c196d7bfe89499b558ef242ed040116)

### Server, CLI and configuration

- Make the vendor cross-checks loud, and stop grading a stale config build - [`da1f5057fe`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/da1f5057fe563990ca4f27bdebf627de493f21cb)
- cli: a real Dockerfile, actually built and run, plus the end-to-end proof - [`cbc135cbe7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cbc135cbe79f6f0adad8fbbe69d1a03c2a37a8a6)
- cli: build the real standalone server CLI, reusing the config package's own flag model - [`53e647469a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/53e647469aec343f30190895de520deb82bbdda6)
- test+docs: prove the head-of-queue race is safe, drop #40 from ROADMAP's gap list - [`d9486357ae`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d9486357aea445c51a5cec0263d81583e2f662b5)
- server: bridge region-file watch events to real WorldRegionUpdateTask scheduling (#40) - [`50e4b1abe8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/50e4b1abe8a79c50d8b67651e1a633e8c98b4f67)
- server: drive the real RenderManager from a map-update request - [`19103df5a9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/19103df5a9a481550726432eab9069c49263dc63)
- server: live/sse, live/players.json, live/markers.json with honest empty stubs - [`00261d4af0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/00261d4af0cc63b0d3f7a06757a258268d15f1f3)
- server: port MapStorageRequestHandler for real tiles/settings/textures/assets over HTTP - [`d78bbbce53`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d78bbbce534a102ef3a7d37a4961714b4c634e6f)

### Desktop shell

- Revert "Remove WebServer": that gap now belongs to a dedicated session - [`2e37bcb69e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2e37bcb69e7801bd69f5a5e4313ab2938c3e24ba)
- Remove WebServer: nothing ever asked the engine to run one twice - [`07bab3e294`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/07bab3e294f86207135df65b4d677d44c8e0bff6)

### Build, release and tooling

- CI: retry vitest's own RPC-heartbeat flake only, and fix a real dynamic-require crash the fix will now expose - [`3791655e07`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3791655e079bcd8dbf901bd3029cf1fe7cd83773)
- Fetch the vendored BlueMap submodule in CI, and let its absence fail loud - [`cb87a9fce0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cb87a9fce0256c979e877e56abd114670b10dbb9)
- Prove Phase C check 1: textures.json is semantically identical, java vs port (issue #31) - [`6ec9beac2d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6ec9beac2dd4fff32474dd79030260e7fef0b400)
- Record the server package's two deviations, and prove RenderDriver on a real generated world - [`2b86de90ca`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2b86de90ca8c9ff357e187d805c952d803ad9e4b)

### Documentation

- Record Phase C's exit-check disposition: 2 pass, 1 finds a real defect (issue #31) - [`9b3613f9c0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9b3613f9c016138be7063e00ba5d22e3c1c42520)
- docs: catch HANDOFF and ROADMAP up with the 2026-08-05 multi-agent pass - [`0047b713d2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0047b713d2ceef83e4e5704c5e09b3452af0e218)
- docs: refresh ROADMAP.md's Phase E entries for #41 and #29 - [`6a019e4e85`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6a019e4e85daedf58db11c93c90bbbe58b40f8e0)
- Add real captures of the five screens issue #34 asked for - [`dbbfa60d67`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/dbbfa60d671b67f7ed7dc10b954fb430c363a2a4)
- Refresh 34 documentation screenshots from a live capture of the current build - [`186b5d7c9d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/186b5d7c9da76c636d8d148dffc45a0c5b4f71a9)

## 0.1.0-build.300 - 2026-08-04

Tagged at [`00dafe826a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/00dafe826a6bdac8d531f686db9e84fbf281bd84).

### Interface

- Turn CI green: fix a self-flagging comment, a leaky test, a category gap - [`00dafe826a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/00dafe826a6bdac8d531f686db9e84fbf281bd84)
- Prove profile shortcuts in the rendered menu - [`9cbce505af`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9cbce505af08a45a94d713aa2bc4b54e281242c7)
- Show the real profile-row opening keys - [`ac5ac795d7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ac5ac795d751ab121f4c5b75103bcd7143b06deb)
- Prove profile shortcuts in the rendered menu - [`2b8595b9ea`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2b8595b9ead3c687a30b5926a1024cace0c3408b)
- Keep one profile keyboard hint in the catalogue - [`5f4bfee8cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5f4bfee8cd2c83942937bca7afc2f754a74b6089)
- Show the real profile-row opening keys - [`45a07d9bfd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/45a07d9bfd5dfc6684b7f22602771addc4669d28)
- Voice the config surfaces and harden capture cleanup - [`688bccec17`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/688bccec17ecda7727711cd926a46c5955c95c09)
- Document the fixed appearance editor tabs - [`17d0dc6b67`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/17d0dc6b67ca21f8d3f7733f9e7500ff0f53afa8)
- Complete tabbed material surfaces and resumable Pages publishing - [`1e9ae1b379`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1e9ae1b37973f169e010c759455fc8dbefe8f716)
- Wire the map control bar and the history panel into the appearance editor - [`796ac32b17`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/796ac32b178af46b10961f1d7aabb465c40200f0)
- Give every tab and group Edit appearance, not just the strip they sit in - [`cd09b84541`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cd09b845419eafeb1c4e87156038308516cb54ec)
- Voice the tab strip, appearance editor, downloads, console and menus - [`f1188a684f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1188a684f947395832f64081aa20b3191b71b78)
- Voice history, backups, GitHub runners, profiles and Pages - [`978c207072`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/978c207072d58b842e442bcc9190af36b6a2a87b)
- Test every door the palette now opens, and stop the docs describing the old one - [`cca197db50`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cca197db50a3a0f71f8e5a075254cfae41ddd8e8)
- Stop hardcoding "Enter", "Space" and "-marker" past the copy layer - [`3afccfcadb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3afccfcadb10797dff37396c03b219fc6973175f)
- Voice the changelog viewer, all 73 keys of it - [`af5ffeb7a3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/af5ffeb7a3cc15d5f0aff8c7fe38fa54dc6835f6)
- Assert catalogue coverage per surface, so a mute screen cannot ship quietly - [`24fa34e84d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/24fa34e84d4326ce928e943d70c3d1cf582d42c7)
- Give the Surface and Presets tabs a search, and teach the guard to miss one - [`1af2d86c59`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1af2d86c59f6bb955d6166ea226efdf4a00488ec)
- Split the copy catalogue into per-surface modules and voice the app chrome - [`99ffa877c1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/99ffa877c1eae4bd5bcd6b8a5a3eb76ddea3170e)
- Tell somebody why the backup button will not go, instead of just greying it - [`33371b2959`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/33371b2959f46618e9ead37d4179c3c4f1dcf55d)
- Add Pages capture and stale-build guard - [`54559eb4c7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/54559eb4c772b8778bfdda719cd0b8aae0a1558a)
- Localize Pages publishing copy - [`e7bd4038f0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e7bd4038f00bee5ab0f79e5f9c08fb3eb0b4bd16)
- Add the Pages publishing tab - [`22b475a8a2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/22b475a8a2b066299100ce4fc3909b279c9202cb)
- Add the Pages hosting state bridge - [`ddf388bc26`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ddf388bc26df276c3f4c52cfa7f574f9133e6f02)
- Offer to host a CI-rendered map on Pages, and make the map survive the trip - [`7e1adaaddd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7e1adaadddc2c9bd68af35111119417db7498767)
- Add guarded GitHub Pages map hosting - [`f7b2b7fa6d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f7b2b7fa6da0f66f41f3b9ae544e223f23051397)
- Close the missing screen capture gaps - [`6e17d09de5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6e17d09de58ca6c57b85a0e6e26ac0effea1ae29)

### Rendering and world data

- Test the complete-map planning boundary - [`fe4e38cbb3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fe4e38cbb3c29ae7494b093d117c4559dd58a6fa)
- Keep complete maps within merge capacity - [`526202c9f9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/526202c9f95583f017cef5c12ad2373d0b1b863f)
- Fix static-host summary mutation - [`b80ecd610c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b80ecd610cd5e522135c8f03c3fa19c3f454839d)
- Prepare a rendered map for a host that only ever serves files - [`4979978596`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4979978596cbfe036b6fe9f1b41076755d19192e)
- Plan render shards for useful parallel speed - [`1031cd97f9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1031cd97f9dde4e1a4e66818f60dd3c5fed0151f)
- Let the planner find an overworld where the renderer already looked - [`96a373e12d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/96a373e12d73e1ef2fb04360a1b58a5d16fe883b)

### Desktop shell

- Scope the tab finder capture to its visible instance - [`ba29f1a495`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ba29f1a495b747ee48d67d7d5fc01fce106e7f07)
- Give the anchored editor room to breathe - [`5f8e24d93f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5f8e24d93f382bff924d8e90a58865fa31051dce)
- Refuse to photograph a build that is older than the code - [`93a229834f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/93a229834f8e5168c3a5cb98528a9cca45225d0a)
- Test the Pages host safety gates - [`c68e1e3df0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c68e1e3df03c1ca42a3c144122dcab0e1bdf371a)
- Expose Pages hosting to the renderer - [`9f075acdb2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9f075acdb25bf405e2e7f954a198335ce90a7989)
- Expose Pages hosting through app IPC - [`c4bc76f7bc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c4bc76f7bc8596504861b0f30bf4ea2242f54f5d)
- Batch large Bedrock conversions safely - [`55bb19e860`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/55bb19e86055e8f5266861eddebdf6a82fcb18b3)

### Landing page and documentation site

- Document publishing a map to Pages, and say what is still unproven - [`e9febb435b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e9febb435be3b14637e70a4e07fead1615675ddc)

### Build, release and tooling

- Stop the no-tiles error reading as one run-on sentence, and unbreak the lint - [`39b869e16d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/39b869e16da9b1b1a7e717023ddc77c6d2054d03)
- Stop a new CI run cancelling the one before it - [`451304984a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/451304984aae74e84dc4b21b1e0f3faeab8029c1)
- Publish rendered maps to plain file hosts - [`bd63de8080`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bd63de80804b3913ff3b9c00c111cb6449158b9a)

### Documentation

- Hand off: what is proven, what is not, and the two traps that cost hours - [`cf4d2dc5fa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cf4d2dc5fa5d67409b2df05f29f3dfddaca68852)
- Write down which surfaces actually mounted the tab strip, and why one did not - [`51f7ccad79`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/51f7ccad79422ef1f836a77d9ef50566c76fbdcc)
- Record the map the application itself published to Pages - [`d8e1ee15b0`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d8e1ee15b08b82f3cb294150eead80f6e8274d0a)
- Show the map hosted on Pages, with the evidence and the trap - [`a8276c8a42`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a8276c8a42a5188df2610b110ea53030f6eaecc7)
- Add a real hosted map capture - [`e571a49a46`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e571a49a46def0d43c19391e00d16c73b3a21c5e)
- Document static Pages map hosting - [`c85a3bf686`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c85a3bf68674f10bf5a3a144f43be737a5fc3df8)

### Elsewhere in the repository

- Merge the preserved profile shortcut branch - [`f940fd2fef`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f940fd2fef4d50770d20b3ad11c219efa5fb57be) _(summary of 3 commits, also listed here)_

## 0.1.0-build.257 - 2026-08-04

Tagged at [`e680b40540`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e680b405403153d9621ff9a4e75b8953e28155fa).

### Interface

- Stop fetching Mojang's licence nobody asked for, and show a render in detail - [`969ae1ae97`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/969ae1ae97a057ae837136e26dff26e31a97d705)
- Give every render route a door, and stop a broken shard reporting success - [`73caa95b09`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/73caa95b097153af987ca9e7d74e9b3ce3306efc)

### Rendering and world data

- Port the render tasks, and fix a strategy that scheduled every region twice - [`9f34cff887`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9f34cff887bac82af440bc651d02ad3bb9208d87)
- Port the render manager, and let the part size be a choice - [`311942567f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/311942567f8390c9d261665160381f0fe160b9a0)

### Desktop shell

- Keep renderer defaults alive and name converter memory limits - [`d90d12b2ed`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d90d12b2ed37f0591713927037cef12b55fbff58)
- Port Bedrock worlds and keep render choices honest - [`16705f6b0f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/16705f6b0fadeb159b408526ee5d71e8fe9356c9)
- Let a render be asked to run in a container, and refuse rather than pretend - [`f9b412be2a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f9b412be2a0e595818307d77f7ae4d47035fd59e)
- Make the gh CLI a route that can finish the job, and record a render that really ran - [`7bc28c89b9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7bc28c89b98525e2dba562a48a95ac5bc7c3e3a2)

### Build, release and tooling

- Add measured timing to release notes - [`aac39451c1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aac39451c1172691b029863852869e9e3f07420d)

### Documentation

- Capture the render location before it can lie - [`e680b40540`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e680b405403153d9621ff9a4e75b8953e28155fa)
- Document Bedrock conversion honestly - [`216024ae7b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/216024ae7bfa937076abb9d2278a56796e0a0ec1)
- Record render checkpoint parity - [`1e036c1aac`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1e036c1aacb7fb093a3356565040648306ed0cc0)

## 0.1.0-build.11 - 2026-08-04

Tagged at [`de209a13a1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/de209a13a1bd1cbadab48dded613725582b32702).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.7 - 2026-08-04

Tagged at [`e68c670ea3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e68c670ea32df8fbe5891393deb4037499894fc8).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.244 - 2026-08-04

Tagged at [`ecc5168e94`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ecc5168e94234f87ebdcd595a1655dfebfa723b6).

### Interface

- Put the licence in front of people, and let them decide where a panel sits - [`80369ec080`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/80369ec080d1fda83376e0ccc026e9ccd3045b8c)
- Make a project the thing you edit, and the wizard the quick way in - [`f4d3abd693`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f4d3abd6936b52ebd0c6daa7c13ca054dde6ba85)
- Let the palette find the History tab, and stop the README claiming seven - [`2437bc69a7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2437bc69a750aa19cc96b14dec775495ac48df34)

### Server, CLI and configuration

- Preserve config line endings across Windows and Unix - [`c386e76272`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c386e76272bf9810fef3c0c65c236aa06e33e2a2)
- Let one project cover several worlds, without pretending to know where they are - [`88924b0a44`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/88924b0a4438f718aafd20524db3b8c33d6e81c8)
- Give a world a project file, so its settings outlive one render - [`1eb15bc46e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1eb15bc46edcc51de18cedd3395e3ba3064a0fce)

### Desktop shell

- Register the two subsystems nobody could reach, and show the update banner - [`56fcd97fc6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/56fcd97fc6f00e9675a4e1fd70992f3e203bb77c)
- Read the scan result, not the wrapper around it - [`92c392ff0d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/92c392ff0d3f86081211951f00bf1c13b36d819e)
- Remote renders over SSH, worlds from any release, and a test that stopped asserting its own platform - [`897ecad166`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/897ecad1662c59e5a87affd1d89627b289d91d71)
- Complete CI render project-map fixtures - [`7c07514aba`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7c07514aba98258c0d774eae2c63623d1ee86651)
- Merge current default history into Pages continuation - [`857a16da4a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/857a16da4af93c85647fdad172695d852ab1c2c6) _(summary of 5 commits, also listed here)_
- Merge current default history into Pages continuation - [`0e4f831538`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0e4f831538a2d0b9f3b02e98a83fb0711dd905fe) _(summary of 3 commits, also listed here)_
- Let the renderer ask for a render it will not run itself - [`b600dc3e2f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b600dc3e2f75e333b3c967ed9b37c2731c0e70e4)
- Hand a render to GitHub's machines, for people whose own machine cannot - [`180c8627b3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/180c8627b3b56283306da72e8489814efbc8b0f4)
- Turn the updater on, and put rendered maps somewhere a person can find - [`039ee266ce`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/039ee266ce6737c1f056c1827c763ff469ef85c8)
- Consume the update feed the installer has been producing all along - [`4a8a5703cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4a8a5703cd03d64b0de40f7dd5a62fee75b7146a)
- Wire the project and the deeper history across to the renderer - [`55a6f41400`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/55a6f414005f537b19380caff43fcaea3ad5e13a)
- Render in a container or on this machine, and diagnose a failure before guessing at it - [`d7cbd34ab3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d7cbd34ab36616ec160a6bb7369366d43fdcaca5)
- Photograph the backup screen, which shipped without a picture - [`fc9679098b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fc9679098b1fd6d8aa7850da409d312a720c54eb)

### Landing page and documentation site

- Gate destructive Pages actions - [`2ba959d91f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2ba959d91fba9603c75e81b9e9602622a475a1de)
- Document the render console and hosted Pages gate - [`28bcd3a124`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/28bcd3a124bd2c6321d529569d5447528d33a73c)
- Merge pull request #26 from Ding-Ding-Projects/pages-material3-full-continuation - [`5c1254ce44`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5c1254ce44e227d2f383d8d67f01dfbee65964d3) _(summary of 20 commits, also listed here)_
- Preserve regex mode when reopening bulk close builder - [`acd7674aa3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/acd7674aa3c648c5658b756790fda58d0299e718)
- Wire searchable menus and shell regex builder - [`5499b828e8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5499b828e8ee073b801ca02342fdbeee4aaa6930)
- Close Pages appearance and discovery gaps - [`6b5fdd7f82`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6b5fdd7f824bbfac05976142e14341059ee860a3)

### Documentation

- Document gated Pages cleanup - [`70caf29017`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/70caf29017334d88604903d0dd3104531c5ec2bb)
- Record the latest registered flows in the handoff - [`6e3260fd9e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6e3260fd9ed421a8f407d96b6e3eba891119df08)
- Align handoff with the current default tip - [`cee6779b6b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cee6779b6b3eb2e5bbda4f365e983fb466c060d5)
- Record the fresh full workspace gate - [`393401be9f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/393401be9f1dd8a0bf49506267dda5cd028fa0fa)
- Document current workspace verification - [`ab2ae1ee02`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ab2ae1ee0213ac83af5d5e2355c0275690f22011)
- Merge current default branch into Pages continuation - [`76153d0965`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/76153d0965556208e9095faf8bee43046801308a) _(summary of 3 commits, also listed here)_
- Photograph a real render, from an empty field to tiles on screen - [`c37c2be9ce`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c37c2be9ce7875636014a4c46a0432627442a8e3)
- Audit BlueMapGUI feature by feature, from its source rather than its readme - [`0a99147394`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0a99147394dbe1e719df9f3399da8e953a45eb3e)
- Merge pull request #25 from Ding-Ding-Projects/pages-material3-continuation - [`8fd2fc5b1f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8fd2fc5b1f03fa7c4a06e0618b1a1a688825a466) _(summary of 5 commits, also listed here)_
- Merge current default work before integrating Pages docs - [`12432939ae`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/12432939aec0a423693303b1f35719a3a18027ed) _(summary of 16 commits, also listed here)_
- Mention the Pages tab appearance editor - [`542e7eeeaa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/542e7eeeaaac172737a1d093cade00ddc6d57c3a)
- Photograph the History tab, and every wizard step, from a green run - [`531b817588`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/531b8175889dfd9c7f50de9683dba48b5f84dc1e)

## 0.1.0-build.6 - 2026-08-04

Tagged at [`691e5769c8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/691e5769c8238bf6947814f2a5952438b59c91ed).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.196 - 2026-08-04

Tagged at [`0008dd4df1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0008dd4df1e57a29327cf1772e719fb5307ee11f).

### Build, release and tooling

- Refresh the committed captures with a command instead of a memory - [`0008dd4df1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0008dd4df1e57a29327cf1772e719fb5307ee11f)

## 0.1.0-build.193 - 2026-08-04

Tagged at [`a796eab97f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a796eab97fde7252401ed0f25de729485b4dd68d).

### Build, release and tooling

- Find the world archive instead of parsing ls, which shellcheck refuses - [`a796eab97f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a796eab97fde7252401ed0f25de729485b4dd68d)

## 0.1.0-build.192 - 2026-08-04

Tagged at [`715d5c4c52`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/715d5c4c526d940abb21ff4cb996d615c948518c).

### Desktop shell

- Generate the world the wizard needs instead of noting its absence - [`49af1816f7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/49af1816f77c5dcd796c883985692342890617bb)

### Landing page and documentation site

- Document three shipped features, and stop betting tests on the runner's disk - [`715d5c4c52`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/715d5c4c526d940abb21ff4cb996d615c948518c)

## 0.1.0-build.189 - 2026-08-04

Tagged at [`8491f0d3c3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8491f0d3c39a02358fe0adf213fece51603bdf90).

### Desktop shell

- Point the capture harness at controls that still exist - [`8491f0d3c3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8491f0d3c39a02358fe0adf213fece51603bdf90)

## 0.1.0-build.187 - 2026-08-04

Tagged at [`5c810d0277`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5c810d0277fc4cafbbcf76bafc3dca80c3d441e6).

### Interface

- Open the options editor on settings, not on a locked door - [`5c810d0277`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5c810d0277fc4cafbbcf76bafc3dca80c3d441e6)

### Desktop shell

- Back a world up to release assets, in the pointer format the sibling app already speaks - [`8cbac63341`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8cbac6334136948301c8f83d8e57702ff71fdaf6)

## 0.1.0-build.183 - 2026-08-04

Tagged at [`157f4c3eb3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/157f4c3eb3cacff1d82b0010f59a5f5827d7710a).

### Interface

- Give every config folder a memory it cannot lose, even about being restored - [`1b77779a41`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1b77779a4144ef97271c6727c9894e5d1646e724)

### Documentation

- Document the config-folder history, promises and betrayals both - [`157f4c3eb3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/157f4c3eb3cacff1d82b0010f59a5f5827d7710a)

## 0.1.0-build.181 - 2026-08-04

Tagged at [`6b8ef7bd00`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6b8ef7bd0075a2a817f33e68e0292a11d9649ff1).

### Server, CLI and configuration

- Show the file's own value in every select, and every colour in the real picker - [`6b8ef7bd00`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6b8ef7bd0075a2a817f33e68e0292a11d9649ff1)

## 0.1.0-build.177 - 2026-08-04

Tagged at [`f3fb53e8de`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f3fb53e8dee31c0669a602c78528fda195fb06c2).

### Landing page and documentation site

- Wire Pages tab appearance editors - [`79b286f959`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/79b286f959bbb55ef4434d12c110eae3af1e9195)

### Documentation

- Merge pull request #24 from Ding-Ding-Projects/pages-material3-continuation - [`f3fb53e8de`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f3fb53e8dee31c0669a602c78528fda195fb06c2) _(summary of 5 commits, also listed here)_
- Record the verified Pages deployment - [`2b861490a7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2b861490a76ad62c2a32578210ea30398629741d)

## 0.1.0-build.171 - 2026-08-04

Tagged at [`7c52520e24`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7c52520e247e94a08f9c439b16c0bf2c05d17aea).

### Desktop shell

- Merge current default fixes into Pages continuation - [`e95d6f2ccd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e95d6f2ccdca73a54ca8632cad589ad8abd8a0db) _(summary of 3 commits, also listed here)_
- Follow the wizard tab in screenshot capture - [`4bd233808c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4bd233808c4f521e0b3acda3c7ef058f6caaa90d)
- Keep mounted folder labels cross-platform - [`b9391b8584`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b9391b858476c6aa7aebdda23088567bb6c95c7e)

### Landing page and documentation site

- Merge remote-tracking branch 'origin/main' into pages-material3-continuation - [`8e6875b8c5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8e6875b8c557d83a3aa2289b09674afdaeaccd42) _(summary of 4 commits, also listed here)_
- Search the settings page's own tabs, and pin it with a test - [`3ccd32c636`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3ccd32c636571e34e86a59b1920ba7aac9716273)

### Build, release and tooling

- Check the PR head for generated changelog drift - [`f6307576db`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f6307576dbcedec562a91aac60d7e297e4474e27)

### Documentation

- Merge pull request #23 from Ding-Ding-Projects/pages-material3-continuation - [`7c52520e24`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7c52520e247e94a08f9c439b16c0bf2c05d17aea) _(summary of 16 commits, also listed here)_
- Record the screenshot verification boundary - [`65ee28815a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/65ee28815a4925414dd9bfd53bb10985077fd189)
- Give every settings tab its own search - [`4c20d5ced2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4c20d5ced2d0e77e0d52f99a20327a796e2822b1)

## 0.1.0-build.165 - 2026-08-04

Tagged at [`cf5358eba5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cf5358eba55ce7ca1ae5775b53c9991d3db59f7b).

### Desktop shell

- Open the tab before photographing what is behind it - [`cf5358eba5`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/cf5358eba55ce7ca1ae5775b53c9991d3db59f7b)

## 0.1.0-build.160 - 2026-08-04

Tagged at [`d95dccb0ff`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d95dccb0ffd6c922940adb2385b0cdb48a356460).

### Interface

- Merge remote-tracking branch 'origin/main' into pages-material3-continuation - [`7582eb7d21`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7582eb7d21b01e3357335649679d015078eff5cf) _(summary of 3 commits, also listed here)_
- Offer the worlds people already have, from every Minecraft folder they own - [`638c0b1b9d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/638c0b1b9dbe31d85766097aa044c7dfc59948ec)

### Desktop shell

- Name a Windows mount on a Linux runner, and stop asking CI for the impossible - [`d95dccb0ff`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d95dccb0ffd6c922940adb2385b0cdb48a356460)

### Landing page and documentation site

- Put the tabs on screen, and stop offering two doors to one room - [`19a51466fc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/19a51466fcd67126459429eac088ae106958e6c7)
- Merge pull request #22 from Ding-Ding-Projects/pages-material3-continuation - [`183b7be957`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/183b7be957217f9aa253788ca0190be0f25a10bf) _(summary of 3 commits, also listed here)_
- Index every article in the command palette - [`6080c4be7f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6080c4be7f3de2304a18db298efd00b95a5096ec)
- Merge pull request #19 from Ding-Ding-Projects/pages-material3-continuation - [`6b319f9547`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6b319f954784c995f64ccda27f78181d746d94f1) _(summary of 6 commits, also listed here)_
- Test localized Pages controls - [`a5c10d70ab`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a5c10d70ab37a1faef614ae6bfdc97f8a2ba552b)
- Localize Pages shell and anchor changelog ranges - [`5375a9195c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5375a9195c05a6fbd584c20751fb5d2cc17c195d)

### Documentation

- Bring the changelog, the handoff and the world docs up to what shipped - [`553b532617`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/553b5326177a9a9cf4ee3f8d247685da4ae5be38)
- Merge pull request #21 from Ding-Ding-Projects/pages-material3-continuation - [`21a35bc524`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/21a35bc52487069ef0e5f04db2f9d87bfec2547d) _(summary of 3 commits, also listed here)_
- Record the current Pages CI boundary - [`decd78179e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/decd78179e70d59d628c3f93b825d543348f3d53)
- Merge pull request #20 from Ding-Ding-Projects/pages-material3-continuation - [`352a2b1bf6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/352a2b1bf6c836075f0596683d5a57cc6e4f3a8a) _(summary of 4 commits, also listed here)_
- Make notification history searchable and exportable - [`52f0fb318a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/52f0fb318a46cc1a42931a6d0ccb165696ca4f0f)
- Merge remote-tracking branch 'origin/main' into pages-material3-continuation - [`f31bd13e38`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f31bd13e3876a0f5eda3be9ba189c207e39035e2) _(summary of 3 commits, also listed here)_

## 0.1.0-build.137 - 2026-08-04

Tagged at [`e32de9f1aa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e32de9f1aac14873ec15781645a589869b6621c0).

### Interface

- Make the maps and servers list a listbox, and let each map be restyled - [`e32de9f1aa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e32de9f1aac14873ec15781645a589869b6621c0)
- Make "the builder is on every search bar" a test rather than a memory - [`a23b5409a3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a23b5409a389521af96b03f50581cbf090258cf4)

### Documentation

- Photograph the render guide end to end, from the installed build - [`ecfa1d122b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ecfa1d122bc79edf891f05bdfe1adea990cf61eb)

## 0.1.0-build.132 - 2026-08-04

Tagged at [`9523d9197e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9523d9197e56fcf6ff5c6eaa616d7e24f104ac2a).

### Interface

- Make every colour continuous, every typeface adjustable, and every refusal loud - [`9523d9197e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9523d9197e56fcf6ff5c6eaa616d7e24f104ac2a)

### Documentation

- Photograph every screen, gate every delete, and unblock the options editor - [`6c4fb6fecc`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6c4fb6fecc12aaa5ab4508c0cae6dc3f18bb2f6a)

## 0.1.0-build.130 - 2026-08-04

Tagged at [`970d2a1eb4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/970d2a1eb4a18b93a96529b88c43cfdb16662a0e).

### Interface

- Refresh the generated changelog for Pages - [`46456772c4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/46456772c4baac6c5c0e6dfef2b405e20e483f09)

### Landing page and documentation site

- Merge the Material 3 Pages rewrite - [`fe747eedb8`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fe747eedb811fbdffdd1caabe0660869f5cc5407) _(summary of 2 commits, also listed here)_
- Wire the Material 3 Pages feature surfaces - [`5550ff5f6a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5550ff5f6a34e6807ba603f960a4bb0ad4dd635a)

### Build, release and tooling

- Exclude changelog-only maintenance commits - [`0286c386b7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0286c386b771f8e8eadd1e6f0b24490994006cdf)

### Documentation

- Document the desktop capture matrix - [`d3a28999df`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d3a28999df31459e44e6228586be9dee388ba422)

## 0.1.0-build.126 - 2026-08-04

Tagged at [`fc084e8b8d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fc084e8b8d17e86bf3c082de208f9e5d36e168b2).

### Interface

- Give the app a palette, a notice history, a changelog, and a builder on every search - [`fc084e8b8d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/fc084e8b8d17e86bf3c082de208f9e5d36e168b2)

## 0.1.0-build.3 - 2026-08-04

Tagged at [`f1b03475cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.123 - 2026-08-04

Tagged at [`f1b03475cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251).

### Build, release and tooling

- Let a repository that has never published Pages create its own site - [`f1b03475cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251)
- Let the site know which repository it is being served from - [`81715bf346`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/81715bf34696542939948994e64f1c277f29d544)

## 0.1.0-build.121 - 2026-08-04

Tagged at [`1997278fcb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1997278fcba1143fd525eacdb033cbccadea4c11).

_No changes were recorded for this version: its tag points at a commit that an earlier tag already covered._

## 0.1.0-build.1 - 2026-08-04

Tagged at [`1997278fcb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1997278fcba1143fd525eacdb033cbccadea4c11).

### Documentation

- The Phase D gate is closed: 961 of 961 tiles, byte for byte - [`1997278fcb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1997278fcba1143fd525eacdb033cbccadea4c11)

## 0.1.0-build.119 - 2026-08-04

Tagged at [`499e338a0a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/499e338a0a3d543d8f05d2a23afb126c87d630dc).

### Rendering and world data

- Load a boundary tile's chunks before judging it ungenerated - [`499e338a0a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/499e338a0a3d543d8f05d2a23afb126c87d630dc)

## 0.1.0-build.117 - 2026-08-04

Tagged at [`7a56827727`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7a568277270903c18ff7a92c1e55d8c9d74fa3a6).

### Build, release and tooling

- Compare the gallery on the pictures, and the Phase D gate passes - [`7a56827727`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7a568277270903c18ff7a92c1e55d8c9d74fa3a6)

## 0.1.0-build.114 - 2026-08-03

Tagged at [`23af24364e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/23af24364eec20d7d6eaabc71583f2d06f4a7a2a).

### Build, release and tooling

- Compare render state on what it decided, not on when it decided it - [`23af24364e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/23af24364eec20d7d6eaabc71583f2d06f4a7a2a)

## 0.1.0-build.112 - 2026-08-03

Tagged at [`4b481f6a69`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4b481f6a696cd5478fbfc8ee623369e600b3f17f).

### Rendering and world data

- Port the task that decides a tile should not be rendered at all - [`4b481f6a69`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4b481f6a696cd5478fbfc8ee623369e600b3f17f)

## 0.1.0-build.111 - 2026-08-03

Tagged at [`b353c77b25`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b353c77b2501e4b88a2fe64003f6476f3b2e38f9).

### Build, release and tooling

- Feed the ported engine the same resources java gets, and every shared tile matches - [`b353c77b25`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b353c77b2501e4b88a2fe64003f6476f3b2e38f9)

## 0.1.0-build.109 - 2026-08-03

Tagged at [`e8ee16788d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e8ee16788d5d7012b33a866221deab435c7aa33a).

### Build, release and tooling

- Type-check after the build, since that is what emits the types it reads - [`e8ee16788d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e8ee16788d5d7012b33a866221deab435c7aa33a)
- Make the gate grade the source it was handed, not the build from three hours ago - [`0dcebcfe70`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0dcebcfe702596b45e39f57116729b0d0e199f64)

## 0.1.0-build.105 - 2026-08-03

Tagged at [`a2ea79fe2c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a2ea79fe2c020406498be3b4747bd687a9a6277e).

### Landing page and documentation site

- Document every door this session opened, and correct four articles that undersold the app - [`a2ea79fe2c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a2ea79fe2c020406498be3b4747bd687a9a6277e)

## 0.1.0-build.102 - 2026-08-03

Tagged at [`78ee15e102`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/78ee15e1020703962f8a6c3fe171a5ec7d9ac586).

### Documentation

- Open the handoff with a plain-language summary any reader can follow - [`78ee15e102`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/78ee15e1020703962f8a6c3fe171a5ec7d9ac586)

## 0.1.0-build.100 - 2026-08-03

Tagged at [`744f7da508`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/744f7da5086de7a4fb99baed0b9e196eae2be125).

### Interface

- Give sign-in and downloads their screens, and the version a page to stand on - [`25e178edaa`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/25e178edaa42bd8f46a4e63745893691e2e7ee32)

### Documentation

- Record the Material title bar, unobstructed, from the packaged app - [`744f7da508`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/744f7da5086de7a4fb99baed0b9e196eae2be125)

## 0.1.0-build.98 - 2026-08-03

Tagged at [`1421c93316`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1421c933161f1d94931ae8ebb7382c9a94223535).

### Build, release and tooling

- Float the control bar below the title bar it was sitting on - [`1421c93316`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1421c933161f1d94931ae8ebb7382c9a94223535)

## 0.1.0-build.96 - 2026-08-03

Tagged at [`d30b2833af`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d30b2833afbeb8752f787762283eb1f8ff7634d7).

### Interface

- Open the doors the audit found painted shut, and build the bridge behind one - [`f6e3099042`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f6e3099042d058fae7a6606813b44d574394aba4)

### Desktop shell

- Assert the maps folder's one true spelling through readdir, not exists() - [`d30b2833af`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d30b2833afbeb8752f787762283eb1f8ff7634d7)

## 0.1.0-build.93 - 2026-08-03

Tagged at [`3d0cf8948a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3d0cf8948afb43431b5d9ffe58ba421c394687eb).

### Interface

- Give 69 messages their values back, and wire the Java runtime row - [`8de0f5ad71`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8de0f5ad71240a2db1efcbffe86b898a3455a191)
- Name the settings region distinctly for screen readers - [`c19088d681`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c19088d68119f00416f08b1dd6b52cf78c723e3f)
- Give the app a door: title bar, map wizard and settings, all mounted - [`a4658378b3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a4658378b3ff986b9cd4341d6b1c29890d61535e)
- Reconnect three finished features the preload never exposed - [`9a9bb81cae`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9a9bb81caeb5719956f30ce6366baeaeb89a7536)

### Desktop shell

- Let the map copy to the clipboard, and give the window a Material title bar - [`b3b75269c1`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b3b75269c119fb6bd789374f254d3a0578d8e8d5)
- Sign in to GitHub, and render a private world without exposing it - [`a06d9f4d92`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a06d9f4d92f796dfdba4adc811d461453e292723)

### Build, release and tooling

- Unbreak CI on its own lint comment and a Squirrel.exe that never existed - [`3d0cf8948a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3d0cf8948afb43431b5d9ffe58ba421c394687eb)
- Bundle Roboto, the typeface every surface asked for and no file provided - [`5c89904b5b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5c89904b5badf85aea6bb47722d9a04c45a12e92)
- Register Render world by removing arithmetic GitHub cannot do - [`a6c6cb245b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a6c6cb245b255a3e631d7192b624b71ecb3ec6ec)
- Give every build its own version, and cut the release to three downloads - [`db926cb665`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/db926cb66534d77bec53542c752d94a3d64750b8)

### Documentation

- Record the settings surface, and 69 messages missing their values - [`3493cde861`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3493cde86162535966af1c7c368146fbaa74d15a)
- Bring the roadmap and handoff up to date, including what is not done - [`c799918500`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c799918500ed304df8568922ab3889e8fff140e0)

## 0.1.0-build.79 - 2026-08-03

Tagged at [`069c5f6c0b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/069c5f6c0becb8b96ff34d66857e397fb9a0ac10).

### Rendering and world data

- Phase D: the mesher, byte-identical to the Java writer it replaces - [`069c5f6c0b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/069c5f6c0becb8b96ff34d66857e397fb9a0ac10)
- Split oversized release assets into rejoinable parts - [`adc17568f2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/adc17568f295c252d6a67284453c7bf8b56ee42a)

## 0.1.0-build.76 - 2026-08-03

Tagged at [`e4da154157`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e4da154157f262058e14a78ac78111b43f639cef).

### Rendering and world data

- Make rendering survive being interrupted, and stop capping worlds at 256 shards - [`e4da154157`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/e4da154157f262058e14a78ac78111b43f639cef)

## 0.1.0-build.75 - 2026-08-03

Tagged at [`141260cd18`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/141260cd18d5decab10f1573f101d4d9fbcc0e97).

### Interface

- Stop a fresh install from contacting a stranger's server unasked - [`141260cd18`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/141260cd18d5decab10f1573f101d4d9fbcc0e97)

## 0.1.0-build.73 - 2026-08-03

Tagged at [`ec1e8b40f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ec1e8b40f49a1176a2ac6ed394bb3d5373d16343).

### Interface

- Land the JVM product: config schema, toolchain, render path, options GUI, setup - [`89d7e57774`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/89d7e577746dc247461ced4b47570789f7da1172)

### Rendering and world data

- Render a world in GitHub Actions, splitting it across jobs when it is too big - [`2585d0ba56`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2585d0ba5697aea41c3a4fb48895ecd4cd61a420)

### Desktop shell

- Make JDK discovery honour the platform it is asked about - [`d0d28eba06`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d0d28eba06776abbbfd273c9cedc93349e2a3abe)
- Stop a path test from passing only on the author's operating system - [`3d32f6ec6b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3d32f6ec6bda039e988abbaa6eacb44878a85ff1)
- Fix the installed app not launching: it shipped without its renderer - [`900a1236f7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/900a1236f712709847b5dfe586e614ae422b962a)

### Build, release and tooling

- Resolve the CLI jar absolutely, since the render runs from elsewhere - [`ec1e8b40f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ec1e8b40f49a1176a2ac6ed394bb3d5373d16343)
- Render our own test world in CI instead of borrowing someone's demo server - [`8e8477f74a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8e8477f74a1ea29506f791f79d6214fcb4510ade)

### Documentation

- Bring the handoff up to date with the last few hours - [`eb5d18ca0b`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/eb5d18ca0b50c7f29a17e1cfb47c4358d0eef0eb)
- Unbreak CI on a stale lockfile, and record the installed app running - [`ae4375f99c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ae4375f99c0a5f60b85c3c375e1bc5b3df431dc2)

## 0.1.0-build.63 - 2026-08-03

Tagged at [`6c64985d4c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6c64985d4cd46708a5a8aa38755115686818d2de).

### Build, release and tooling

- Install every dependency automatically, and verify each one works - [`6c64985d4c`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6c64985d4cd46708a5a8aa38755115686818d2de)

## 0.1.0-build.61 - 2026-08-03

Tagged at [`da9308ef5a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/da9308ef5ab675c0619ee6db8dac02d55b8296cd).

### Desktop shell

- Wait for the map to draw before photographing it - [`da9308ef5a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/da9308ef5ab675c0619ee6db8dac02d55b8296cd)

## 0.1.0-build.59 - 2026-08-03

Tagged at [`8ff4e5348f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8ff4e5348f1be3e560c95f5f681841d7f80677aa).

### Interface

- Port every upstream webapp component to Material Design 3 - [`8ff4e5348f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8ff4e5348f1be3e560c95f5f681841d7f80677aa)

## 0.1.0-build.56 - 2026-08-03

Tagged at [`0268451592`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0268451592fab2e707ce6dd157bcf89b9c83e272).

### Landing page and documentation site

- Fix the blank documentation site: it mounted on the wrong element - [`0268451592`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0268451592fab2e707ce6dd157bcf89b9c83e272)

## 0.1.0-build.55 - 2026-08-03

Tagged at [`64e516a3f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/64e516a3f4a819d3c280c5a6095631c1cd4a110a).

### Desktop shell

- Ask for Mojang consent once at first launch, and never again - [`64e516a3f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/64e516a3f4a819d3c280c5a6095631c1cd4a110a)

## 0.1.0-build.53 - 2026-08-03

Tagged at [`79236eb9c9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/79236eb9c91532c7d946dfa89c7e043281e10557).

### Build, release and tooling

- Prove the Java render path end to end, and stop it writing into the repo - [`79236eb9c9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/79236eb9c91532c7d946dfa89c7e043281e10557)

## 0.1.0-build.50 - 2026-08-03

Tagged at [`6474fc0447`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6474fc0447d749b60bcb784a989e1420fd6b2eaf).

### Documentation

- Switch local rendering to the Java engine, and say so plainly - [`6474fc0447`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/6474fc0447d749b60bcb784a989e1420fd6b2eaf)

## 0.1.0-build.49 - 2026-08-03

Tagged at [`aa316fdcb7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aa316fdcb7a07c0af33810b5cf5992ca55711e61).

### Documentation

- Bring the README up to date with what actually shipped - [`aa316fdcb7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/aa316fdcb7a07c0af33810b5cf5992ca55711e61)

## 0.1.0-build.47 - 2026-08-03

Tagged at [`f3a7715beb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f3a7715beb845c1f40cecbaf05898876caae6a6c).

### Landing page and documentation site

- Add the worldgen package and the Pages site, salvaged from a session limit - [`f3a7715beb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f3a7715beb845c1f40cecbaf05898876caae6a6c)

## 0.1.0-build.45 - 2026-08-03

Tagged at [`074a59e9cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/074a59e9cd8fdb11d9b734afacec1a97506c5197).

### Documentation

- The app renders, and here is the proof - [`074a59e9cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/074a59e9cd8fdb11d9b734afacec1a97506c5197)

## 0.1.0-build.43 - 2026-08-03

Tagged at [`f59ca091f2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f59ca091f2fd2c28f3aaf888a93b2db260e00a68).

### Rendering and world data

- Phase C wave 3: legacy 1.12 compat, the closing proofs, and two CSP landmines - [`f59ca091f2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f59ca091f2fd2c28f3aaf888a93b2db260e00a68)

## 0.1.0-build.41 - 2026-08-03

Tagged at [`9f9177cd14`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9f9177cd14f0541328c03a303a7fd1c16ad5825b).

### Server, CLI and configuration

- Stop the locale baseline from depending on which machine read the files - [`9f9177cd14`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/9f9177cd14f0541328c03a303a7fd1c16ad5825b)
- Replace the eval-based HOCON parser so the UI can actually render - [`bcb371913d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bcb371913d18d366b0081088f47ae18eba11ab17)

## 0.1.0-build.37 - 2026-08-03

Tagged at [`98988e3c2e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/98988e3c2ec6b8af1101e2c97363dfcb41031d72).

### Documentation

- Say "ported" where the roadmap wanted to say "done" - [`98988e3c2e`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/98988e3c2ec6b8af1101e2c97363dfcb41031d72)

## 0.1.0-build.36 - 2026-08-03

Tagged at [`12da79a249`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/12da79a249315e387b042c7041843c948467b8bc).

### Rendering and world data

- Phase C wave 2: ResourcePack orchestrator, atlas layer, texture gallery - [`12da79a249`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/12da79a249315e387b042c7041843c948467b8bc)

## 0.1.0-build.33 - 2026-08-03

Tagged at [`97a1888e77`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/97a1888e770272fa653aecbe6eba9b0e219de36a).

### Desktop shell

- Stop the embedded server from 403ing the app's own bundle - [`97a1888e77`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/97a1888e770272fa653aecbe6eba9b0e219de36a)

## 0.1.0-build.31 - 2026-08-03

Tagged at [`bbc7634fe2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bbc7634fe267812f01447b6f9c03b1d745f05faa).

### Rendering and world data

- Phase C wave 1: pack foundations, version acquisition, blockstates, models, textures - [`bbc7634fe2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/bbc7634fe267812f01447b6f9c03b1d745f05faa)

## 0.1.0-build.30 - 2026-08-03

Tagged at [`94725e3d0f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/94725e3d0fef496c4850c365e4172e51545c7091).

### Rendering and world data

- Merge origin/main into claude/goofy-leakey-804933 - [`2e55fd26e6`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/2e55fd26e6dc4690281e4aa4c7b8a6c8e3906451) _(summary of 4 commits, also listed here)_

### Desktop shell

- Merge remote-tracking branch 'origin/main' into claude/goofy-leakey-804933 - [`94725e3d0f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/94725e3d0fef496c4850c365e4172e51545c7091) _(summary of 2 commits, also listed here)_

### Build, release and tooling

- Fix pnpm build filter that silently matched nothing on Windows - [`c9321b6a08`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c9321b6a08a508c933c78176788b431e296f502b)

### Documentation

- Make a build that matches no packages fail instead of pass - [`4fa01b0cb2`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4fa01b0cb225cc3ccaf44a747dba344b7448e81b)

## 0.1.0-build.27 - 2026-08-03

Tagged at [`0a67c35222`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0a67c352225125561dcb0dbcc5b25463d4bebcf0).

### Desktop shell

- Make the screenshot harness report what it saw instead of just timing out - [`0a67c35222`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0a67c352225125561dcb0dbcc5b25463d4bebcf0)

## 0.1.0-build.24 - 2026-08-03

Tagged at [`c40913434d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c40913434db89cd935f6ca4be15c6e0f655b8e1b).

### Build, release and tooling

- Capture screenshots of the real app in CI, not of a mockup - [`c40913434d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c40913434db89cd935f6ca4be15c6e0f655b8e1b)

## 0.1.0-build.22 - 2026-08-03

Tagged at [`1a22cbb695`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1a22cbb695cadb968ffd761437b381fcb41febbc).

### Interface

- Add MD3 UI shell and hardened Electron app shell (Phase A) - [`47e37d90f4`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/47e37d90f4ebb93df09a24d024fcc00fa4c5b443)

### Rendering and world data

- Make main green, and give the repo a front door and a release pipeline - [`3072b71f36`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/3072b71f369453a0632be27890585f91446f2269)
- Merge pull request #1 from Ding-Ding-Projects/claude/bluemap-design-port-8xs2dk - [`4484b03b90`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/4484b03b905d515781ee7dd34e5aaca3c245a3a2) _(summary of 18 commits, also listed here)_
- WIP: Wave C1 ZipFileSystem (workflow still writing) - [`ee9a7ab80f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/ee9a7ab80f13b8e78e8bfc9bd6ca3833e83f3ae6)
- Handoff: Phase C Wave 1 WIP salvage + full handoff doc - [`b293d4825d`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b293d4825dba2233ff467f416b28733977fdf767)
- Prep Phase C: pngjs + yauzl-promise deps, bundle resourceExtensions assets - [`a66d879960`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a66d879960db51ffb691c5daa1339270f6c10b67)
- Complete Phase B: engine world layer green with 1.18 + 1.12.2 e2e proofs - [`5704048830`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/5704048830d495f43e145660dd7cf63f720f6739)
- Phase B Wave 2: world model + MCA decoders 1.12.2-26.x (WIP: integration pending) - [`8b652f4538`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8b652f4538fcb98c5a4456b15d068635169fa235)
- Phase B Wave 1: complete shared foundations, NBT package, compression layer - [`c8d4f0bf59`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c8d4f0bf5947d5405bcd9509e9466093e262916d)
- Add ROADMAP/HANDOFF docs and legacy 1.12 mapping data - [`b7680d01e3`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/b7680d01e36bdadd22267ff2db011ccd5eba9dae)
- Complete Phase A: full viewer port integrated, remote mode end-to-end - [`c4832c84dd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/c4832c84dda428d8c8cdb496e579db49e897e9df)
- WIP: viewer port in progress (util, map loaders, PRBM parser) - [`0933934d54`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/0933934d543ed2b99baa4e853400daa8bc60a10e)

### Server, CLI and configuration

- Fix unused-param lint in salvaged Grid.ts - [`8ae9eee5cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/8ae9eee5cda0392cdf297e20eaa7f006b2e82b1a)
- Salvage partial Phase B foundations (shared Key/Registry/Grid/math, nbt TagType) - [`a9e9396476`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/a9e93964760f6d5ff432363d9ce09f3cab15e285)
- Add Phase A embedded server: localhost HTTP server + remote reverse proxy - [`095bd69adb`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/095bd69adb5d59c9c08209efc2aff6a926375ecc)

### Desktop shell

- Give Squirrel the icon it refuses to build without - [`1a22cbb695`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/1a22cbb695cadb968ffd761437b381fcb41febbc)

### Build, release and tooling

- Add engine package dependencies for Phase B - [`100b008e9a`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/100b008e9ae84187106e5feaa231702a393ee4d0)
- Scaffold design/ TypeScript monorepo (Phase 0) - [`70f58523b9`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/70f58523b9243623d3991ef6fc1224cf09e0eed2)
- Add BlueMap submodule under vendor/BlueMap - [`d48a1987e7`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/d48a1987e718662587bafded05d09f37eb8d7f60)
- Initial commit - [`07698ecd42`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/07698ecd423853684fad51c9bc34f9b152844578)

### Documentation

- Adopt global product contracts: regex builder, tabs, appearance, i18n, super-confirm - [`71fd14e788`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/71fd14e788a38ac167cc96fb1dc2b8c976c2353c)
- Add plan.md: full BlueMap port plan (design/ monorepo, Electron + server, MD3) - [`307d798460`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/307d798460f986336b51e59b15285df56b082e14)

### Elsewhere in the repository

- Unbreak lint and strip a private repo link from the public tree - [`7205b1242f`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/7205b1242f28da27b2bff472778f2bc3264f885b)
