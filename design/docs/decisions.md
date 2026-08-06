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

## D19 — Project CI moved to self-hosted runners; `pull_request` dropped from `ci.yml`

**Decided 2026-08-05.**

`ci.yml`, `pages.yml` and `build-jars.yml` — the workflows that build and test **this repository
itself** — now run on two of this developer's own machines, registered as GitHub Actions
self-hosted runners (`CLAUDE`, labelled `self-hosted, Linux, X64`, and `CLAUDE-Windows`, labelled
`self-hosted, X64, Windows`), targeted by their label sets rather than `ubuntu-latest` /
`windows-latest`. This is scoped to this project's own CI only. The render templates this
application commits into *users'* own repositories — `render-world.yml`, `render-shard-wave.yml`,
`render-private-world.yml`, `scheduled-render.yml` — stay on GitHub-hosted runners; pointing a
user's render queue at a runner only this developer owns would break rendering for everyone else
the moment this developer's machine is offline, and was never the intent of this change.

This repository is public, and a self-hosted runner on a public repository is a documented attack
path: anyone who can cause a workflow to run can execute code on the machine behind it. `ci.yml`
therefore no longer triggers on `pull_request` — that trigger is exactly the one reachable by
anyone who can open a PR, including from a fork with arbitrary workflow content, without needing
write access to this repository. `push` and `workflow_dispatch` both require write access, which
is the actual mitigation; see the trigger comment at the top of `ci.yml` for the fuller version.
`pages.yml` and `build-jars.yml` were audited for the same problem and found already clean: both
were already gated to `push`/`workflow_call`/`workflow_dispatch` with no `pull_request` trigger.

Two consequences follow directly and are handled in the workflows themselves rather than by a
separate document:

- **Nothing is preinstalled.** GitHub's hosted images arrive with Node, Java, pnpm, `shellcheck`,
  `zip`/`unzip` and `xvfb` already on them; a self-hosted machine has whatever it happens to have.
  Every changed job now installs what it needs — Node and pnpm at the exact versions
  `design/package.json` pins (`engines.node` and `packageManager`), Temurin where a job already
  needed Java, and a check-first, install-only-if-missing step for `shellcheck`, `zip`, `unzip`
  and `xvfb` where a job's existing steps assumed the hosted image's toolset. `shellcheck`
  installs into a per-job directory added to `PATH` with no `sudo`; the OS-packaged tools
  (`zip`/`unzip`/`xvfb`) go through `apt-get`, which does need `sudo` on this machine and is
  flagged as such at each call site — the genuinely canonical distribution channel for an OS
  utility, unlike a tool with its own upstream binary releases.
- **The workspace is not clean between runs.** `actions/checkout@v4`'s default `clean: true`
  (`git clean -ffdx && git reset --hard HEAD`) already wipes untracked and ignored files — stray
  `node_modules`, build output — from the checked-out tree at the start of every job, which covers
  most of this. What it does not cover: state outside `$GITHUB_WORKSPACE` (a stuck Electron
  process from a crashed capture, a stale Xvfb display), which the `screenshots` job now clears
  defensively at the start of its own run rather than assuming a fresh machine.

Tonight's push burst also queued 26 simultaneous runs against these same two machines — harmless
on free, disposable hosted runners, a real pileup against two real computers. `ci.yml` gained a
`concurrency` block on every job except `release` (`cancel-in-progress: true`, keyed per job on
`github.ref`), so a burst of pushes cancels each job's own stale predecessor rather than queuing
all of them. This is deliberately **not** a single workflow-level group: `ci.yml` tried that once
before (see the comment above `permissions:` in that file) and a shared group evicted queued runs
in a way that left long stretches of `main` with no verdict at all. `release` keeps its
pre-existing job-level group (`cancel-in-progress: false`) untouched — a queued publish should
wait, never be dropped, and a workflow-level group could have cancelled a release job mid-publish,
which is exactly the failure this decision must not reintroduce.

**Follow-up, 2026-08-06: `build-jars.yml`'s `jars` job failed every run on the new self-hosted
runner**, deterministically, on the `:forge` shadow jar. ForgeGradle 7 (the plugin behind that one
module) needs its own JDK 8 to run its build-time tools (the old MCP/AT tooling), separate from the
JavaLanguageVersion 25 the project itself compiles under. When ForgeGradle cannot find a JDK 8
already installed, it downloads one itself through a bundled "Disco" (foojay) client into its own
Gradle cache — and on this runner's container image, the downloaded tarball's `bin/java` fails to
even start: `error while loading shared libraries: libjli.so: cannot open shared object file`.
`libjli.so` ships inside the JDK archive itself, so the file is not missing; the dynamic loader
cannot resolve it via the JDK's own RPATH, which on this stripped image means the base
shared-library set that path points at isn't there. This never showed up before the self-hosted
move because GitHub's hosted images carry that base library set; it is exactly the kind of
"nothing is preinstalled" gap the bullet list above was written for, just one layer deeper than
`shellcheck`/`zip`/`xvfb` — a JDK a *build plugin* provisions for itself, not one this workflow
asks for directly.

Two fixes were available: chase down and install whatever base libraries the stripped image is
missing so the *downloaded* JDK 8 can run, or make ForgeGradle never need to download one at all.
The second is what shipped, because it does not depend on this specific container image's package
set staying the same, and because a properly-installed JDK is cached by the runner between runs
where a re-downloaded one is thrown away. `build-jars.yml`'s `build` job now installs a Temurin JDK
8 with `actions/setup-java` *before* its existing JDK 25 install (installing second is what keeps
`JAVA_HOME` — and therefore the JVM that launches Gradle itself — on 25, unchanged from before), and
passes `-Dorg.gradle.java.installations.fromEnv=JAVA_HOME_8_X64,JAVA_HOME_25_X64` on the `./gradlew`
invocation. That system property is Gradle's own mechanism for naming environment variables that
point at real JDK installs; `actions/setup-java` exports exactly such a variable
(`JAVA_HOME_<version>_X64`) for every JDK it installs in a job. ForgeGradle's own toolchain lookup
is built on that same Gradle installation registry, so once a real JDK 8 is a registered
installation, ForgeGradle finds it there and its Disco-download path — the one that was failing —
never runs. Nothing in `vendor/BlueMap` was touched: doing so would mark the vendored checkout
dirty and stamp every jar's version with a `-dirty` suffix (see the "Resolve the upstream version"
step in `build-jars.yml`), so the fix lives entirely in the workflow's own `-D` flag and installed
toolchains. The rest of `ci.yml` and `pages.yml` were re-audited at the same time for the same class
of "assumed the hosted image" failure and found already covered by the bullet list above; no other
job invokes a build plugin that provisions its own JDK.

The user separately authorised a scoped fallback for the `jars` job specifically, if the fix above
does not hold after a genuine attempt on the real runner: move `runs-on` for that one job only back
to `ubuntu-latest`, leaving every other job on the self-hosted labels. That fallback is not taken
unless the pushed fix is actually observed failing on the runner - this paragraph exists so the
condition and its scope are recorded before, not after, that observation.

**Same follow-up: `ci.yml`'s `screenshots` job's `Install Playwright browsers` step was already
flagged above (bullet list, "Nothing is preinstalled") as calling `apt-get`, with `sudo`,
unconditionally on every run - a known gap left for later because, at the time, Playwright's own
`install-deps` command does not check current system state before running `apt-get update && apt-get
install`. The later fix is not "skip it sometimes" but a genuine, cheap, self-updating check ahead of
it: `playwright install-deps chromium --dry-run` is an official, documented Playwright CLI mode that
touches nothing and simulates the install via `apt-get install -s` against whatever package list
*this installed Playwright version* currently requires, exiting non-zero the instant one package is
missing. Because that requirement list is recomputed from the live Playwright version on every run
rather than copied into this workflow once, a future Playwright upgrade that needs one more library
than this machine has is caught correctly - the dry run reports it missing, the real `install-deps`
step (gated on the dry run's result) runs and installs it. Any dry-run failure, for that reason or
any other, is treated as "not confirmed satisfied" and falls through to the real install, so the
check can only ever skip work it has verified is unnecessary, never the reverse.
