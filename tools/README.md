# tools

Build tooling that sits outside the TypeScript workspace in `design/`. Nothing here has
dependencies: every script runs on a plain Node 22 with no install step, which is why CI
can call them straight after `actions/setup-node`.

## The seven BlueMap jars

Local world rendering runs upstream BlueMap's Java engine, built from the vendored source
in `vendor/BlueMap`, rather than waiting for the TypeScript mesher in `packages/engine`
(decision D17). Once a JVM is in the product, upstream's six Minecraft-server adapters
become shippable too, so all seven implementations are product artefacts (decision D18).

They are **upstream's code, built unmodified**. This project drives the renderer; it does
not claim to be it. Everything published says so, including the release notes.

| Implementation | Artefact | Runs on |
| --- | --- | --- |
| `cli` | `bluemap-<version>-cli.jar` | Any machine with a Java runtime. No server involved. |
| `fabric` | `bluemap-<version>-fabric.jar` | A Fabric server, in `mods/`. |
| `forge` | `bluemap-<version>-forge.jar` | A Minecraft Forge server, in `mods/`. |
| `neoforge` | `bluemap-<version>-neoforge.jar` | A NeoForge server, in `mods/`. |
| `paper` | `bluemap-<version>-paper.jar` | Paper, Purpur and Folia servers, in `plugins/`. |
| `spigot` | `bluemap-<version>-spigot.jar` | Spigot, Bukkit and CraftBukkit servers, in `plugins/`. |
| `sponge` | `bluemap-<version>-sponge.jar` | A Sponge server, in `plugins/`. |

The supported Minecraft versions are **not** written down here. They live in each
implementation's `build.gradle.kts` in the vendored source and are read from there at
build time, so they cannot go stale when the submodule pointer moves.

### `build-jars.mjs`

Runs the Gradle build and copies each implementation's shadow jar out of the vendored
build tree.

```
node tools/build-jars.mjs                      # all seven
node tools/build-jars.mjs --only cli           # just the renderer
node tools/build-jars.mjs --only cli --offline # no dependency downloads
node tools/build-jars.mjs --no-build           # stage what is already built
```

Two things it deliberately does:

- It points `GRADLE_USER_HOME` at `tools/oracle/.gradle` inside the repository, so a build
  here never touches `~/.gradle` or another project's cached dependencies. That directory
  is gitignored and grows past a gigabyte, which is the price of not writing anything
  machine-wide. CI does not do this: on a disposable runner the default Gradle user home
  is the path the caching action knows how to restore.
- It uses **bare** Gradle project paths - `:cli:shadowJar`, not `:implementations:cli:shadowJar`.
  Upstream's `settings.gradle.kts` includes each implementation at the root and then
  relocates its `projectDir`, so the nested path does not exist and Gradle rejects it.

It exits non-zero when any requested implementation produced no shadow jar. That is on
purpose: a packaging step that quietly ships six of seven adapters produces a release
whose gap nobody notices until somebody on that platform goes looking for a download.

### `describe-jars.mjs`

Turns the staged jars into publishable release assets.

```
node tools/describe-jars.mjs --stage tools/oracle/out/jars --out jars
```

- Renames `paper-5.22-27-shadow.jar` to `bluemap-5.22-27-paper.jar`, which is upstream's
  own release naming. A Gradle artefact name tells a person nothing about which of the
  seven they need.
- Parses each jar's zip central directory, reads its manifest, and records the class-file
  version of its bytecode. A truncated or corrupt jar fails here rather than reaching a
  user as a download that does not run, and the release notes can state the Java version
  the builds actually require instead of guessing at it.
- Fails if the CLI jar declares no `Main-Class`, because that is the jar the application
  runs and `java -jar` on it would fail.
- Fails if the staged jars disagree about their version, or if `--expect-version` does not
  match what Gradle stamped on them.
- Writes `bluemap-jars.md` (the release-notes section), `bluemap-jars.json` (the same
  facts as data) and `bluemap-jars.sha256.txt` (checkable with `sha256sum -c`).

### In CI

`.github/workflows/build-jars.yml` builds all seven on `ubuntu-latest` with Java 25 and
uploads one artifact per implementation, so somebody running a Paper server downloads five
megabytes rather than forty. It is a reusable workflow with no push trigger of its own:
`ci.yml` calls it, which puts the jars in the same run as the Windows installer, and the
existing release job attaches both to one release.

Two details in that workflow are load-bearing and easy to lose:

- The checkout is `submodules: recursive` **and** `fetch-depth: 0`. BlueMap carries its own
  BlueMapAPI submodule at `api/`, and upstream derives its version from `git describe`, so
  a shallow checkout silently builds jars that call themselves `0.0`. The workflow proves
  the tags arrived before it spends a build on them.
- The version is resolved in the workflow with the same arithmetic as
  `vendor/BlueMap/buildSrc/src/main/kotlin/versioning.kt` and handed to `describe-jars.mjs`
  as `--expect-version`, so the name the artifacts are uploaded under and the name Gradle
  stamped on the jars cannot drift apart unnoticed.

## `oracle/`

The **Phase D gate** (`node tools/oracle/compare.mjs`) lives here: it renders one
generated world with upstream's Java engine and with this project's TypeScript engine
and compares the two outputs byte for byte. See [`oracle/README.md`](oracle/README.md).

Beside it, `oracle/.gradle/` and `oracle/out/` are gitignored working state: the Gradle
user home for the vendored build, the default jar staging directory, and the generated
worlds and cached renders the gate works from. None of it is source, and it is safe to
delete at the cost of a cold rebuild and one eighty-second reference render.
