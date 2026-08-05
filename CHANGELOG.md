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
`design/packages/ui/src/components/changelog/changelogData.ts`, which carries each commit's
full message for the in-app changelog viewer.

## Unreleased

### Interface

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

## 0.1.0-build.123 - 2026-08-04

Tagged at [`f1b03475cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251).

### Build, release and tooling

- Let a repository that has never published Pages create its own site - [`f1b03475cd`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/f1b03475cdb565c74f3100ef0e4911691ae6e251)
- Let the site know which repository it is being served from - [`81715bf346`](https://github.com/Ding-Ding-Projects/material-bluemap/commit/81715bf34696542939948994e64f1c277f29d544)

## 0.1.0-build.121 - 2026-08-04

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
