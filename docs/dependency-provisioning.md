# Automatic dependency provisioning

Local rendering runs on BlueMap's own Java engine, which means the app needs a JVM. Converting
a Bedrock Edition world needs Chunker, a separate open-source jar. Several optional routes —
publishing to GitHub, remote rendering over SSH, the app's own config-history — lean on `git`,
`gh`, `ssh` and `rsync` being present. None of that is something a person should have to go and
install by hand before the app will work: this document covers what the app fetches for itself,
how it tells you before it does, and what it does honestly instead when a dependency genuinely
cannot be installed this way.

## Contents

- [The rule this follows](#the-rule-this-follows)
- [The Java runtime](#the-java-runtime)
- [Chunker, for Bedrock world conversion](#chunker-for-bedrock-world-conversion)
- [System dependencies via winget/Chocolatey](#system-dependencies-via-wingetchocolatey)
- [What is not auto-installed, and why](#what-is-not-auto-installed-and-why)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Related reading](#related-reading)

## The rule this follows

Every provisioning path in this app follows the same four rules, and every section below is an
instance of them rather than an exception to them:

1. **User-scoped, never system-wide**, where that is possible at all. The JDK and Chunker land
   under Electron's own `userData` directory — no registry key, no `PATH` edit, no installer, no
   elevation. Uninstalling the app takes them with it.
2. **Told plainly, then it happens.** Nothing downloads as a side effect of asking a question.
   Every button that starts a real transfer states what will be fetched, roughly how big it is,
   and where it is going, before a single byte moves — the same shape the
   [Mojang download consent](./eula-and-consent.md) already uses, extended to every other tool
   the app can fetch for itself.
3. **Verified before it is trusted.** Every archive is checked against a digest before
   extraction; a mismatch deletes the bad bytes and refuses to install anything. A download that
   is interrupted resumes from where it stopped rather than restarting, and nothing partially
   written is ever executed.
4. **Some things genuinely cannot be auto-installed this way**, and the app says so rather than
   pretending: it names what is missing, why it cannot fetch it itself, points at the real
   installer, and offers a re-check — while everything that does not need that dependency keeps
   working.

## The Java runtime

Local rendering discovers a JVM in a fixed order — `JAVA_HOME`, then `java` on `PATH`, then a
copy the app provisioned for itself — and **runs each candidate before trusting it**, because a
path is not evidence: `JAVA_HOME` can outlive the JDK it once pointed at, and a folder named
`jdk-25` has contained a JDK 17 before now. When nothing suitable is found, the Java runtime
settings row shows a **Download Java (~140 MB)** button — the figure is a real measured number,
not a guess — that states the source, records agreement on the click itself, downloads with a
resumable and digest-verified transfer, extracts only after a real `bin/java` is confirmed
inside the archive, and then **runs the JDK it just installed** before reporting success, the
same discipline discovery already applies to a candidate it merely found.

[Fetching a Java runtime for itself](./java-runtime-provisioning.md) is the full account: the
consent shape, every IPC channel involved, the real-network proof against Adoptium's own
servers, and the complete failure-mode table. What follows in this document is the shape every
other tool below repeats.

## Chunker, for Bedrock world conversion

Converting a Bedrock Edition world needs Chunker, Hive Games' open-source converter
(MIT-licensed) — see [Bedrock Edition worlds](./bedrock-worlds.md) for what conversion does and
does not preserve. The app does not bundle it: about 30 MB in every installer for a feature most
people never use is a poor trade, and a bundled copy pins a converter version to an app release.

When a Bedrock world is detected and Chunker is not on the machine, the wizard's Bedrock note
shows a **Download Chunker (~30 MB)** button in the exact spot **Convert** would otherwise be —
never both, because a Convert button that is certain to fail is worse than one that is not
offered. Pressing it fetches the pinned release, verified against a SHA-256 committed in this
app's own source — the strongest check honestly available, since Hive Games publish no
detached signature or checksum file for the CLI jar — and reports progress the same way the Java
download does. See [Bedrock Edition worlds § Obtaining it, and what "verified" honestly
means](./bedrock-worlds.md#obtaining-it-and-what-verified-honestly-means) for the full account of
that verification story, including the weaker `digestTrust: "api"` path a newer release resolves
through.

## System dependencies via winget/Chocolatey

A handful of optional features lean on command-line tools that a Windows machine may or may not
already have: `git` (this app's own config-history), the GitHub CLI (an alternative sign-in
route), Docker Desktop (the container render path) and `rsync` (resumable remote-world uploads).
Where Windows' own package managers can install one of these for real, the app offers to run that
install directly rather than only linking to a download page.

`main/sysdeps/` detects whether `winget` and/or Chocolatey are present, resolves each dependency's
preferred manager and package id from a small reviewed table (`registry.ts`), and — before
anything installs — previews every row: which manager would be used, whether the package manager
already lists it as installed, and **exactly what administrator-permission prompt to expect**,
worded per dependency rather than as a generic warning. Git's and the GitHub CLI's official
Windows installers default to a machine-wide install and will trigger Windows' own elevation
prompt; Docker Desktop's WSL2/Hyper-V integration unavoidably needs it on every current Windows
setup. None of that is hidden behind a generic "this may require permission" — the exact reason
is stated before the button is pressed, and the app never suppresses, bypasses or auto-accepts the
elevation prompt itself.

The preview's presence check is cheap and read-only — it asks the package manager's own record
(`winget list`/`choco list`), which is fast enough to run for every row before anything is
decided. The install pass itself is stricter: before skipping a dependency it believes is already
present, it **actually runs the tool** and checks its output against a pattern (`git --version`
matching `/git version/i`, and so on) — the same discipline `java/probe.ts` applies to a
discovered JVM, because a package manager reporting success is not proof the tool works. Every
fresh install gets the identical check before it is reported as installed.

## What is not auto-installed, and why

Some dependencies stay in the honest-degradation bucket, either because installing them this way
would need elevation this app has no route to grant, or because auto-installing the binary alone
would not remove the remaining manual step:

| Dependency | Why it stays manual | What the app does instead |
|---|---|---|
| Windows' OpenSSH client | Enabling the optional feature needs administrator rights via DISM; there is no user-scoped install. | Names exactly what is missing (`ssh` is not on `PATH`) and that Windows ships it as an optional feature. |
| `gh` sign-in | Installing the binary would still leave it signed out — `gh`'s own device-code login cannot be driven headlessly from a spawned process. | Names the missing binary and points at the app's own in-app GitHub sign-in, which needs nothing installed. |
| Docker on a remote host | Reached only over SSH, with no privilege to install anything there even in principle. | Reports which of five distinct states applies (not installed, daemon unreachable, permission refused, and so on) with the next step named for each. |
| `opencode` (the local coding agent used for automatic repair) | Even a provisioned binary would still need the user's own model credentials configured before it could run anything. | Reports the fact plainly, not as an error — automatic repair still runs everything it can without it. |

## Configuration

| Thing | Where it lives | Default |
|---|---|---|
| Provisioned JDK | `<userData>/java/<feature>/` | absent until a download is agreed to |
| Java download agreement | `<userData>/java/download-consent.json` | not agreed |
| Downloaded Chunker jar | `<userData>/chunker/chunker-cli-<version>.jar` | absent until fetched |
| Chunker jar override | `CHUNKER_CLI_JAR` environment variable, or a path set in settings | unset |
| Pinned Chunker release and digest | `PINNED_CHUNKER` in `main/bedrock/chunker.ts` | reviewed source constant |
| System-dependency route table | `SYSDEP_DEPENDENCIES` in `main/sysdeps/registry.ts` | reviewed source constant |

## Failure modes

| What happens | What the app does |
|---|---|
| No network during a JDK or Chunker download | The stage reports the failure as an alert; nothing partial is left at the final path, and the button stays ready to retry. |
| Digest mismatch | The downloaded bytes are deleted; nothing is extracted or installed. Reported as a refusal, never a silent substitution. |
| Download interrupted mid-transfer | Resumes from the `.part` file already on disk on the next attempt, rather than restarting from zero. |
| A freshly extracted JDK will not run | The broken install record is withdrawn so a later launch does not keep offering it; the failure names the archive URL and install path so it can be inspected. |
| Consent not yet given | `java:provision`/`bedrock:fetchChunker` refuse server-side even if a caller skipped the button, and say so rather than downloading anyway. |
| winget/Chocolatey both absent | The preview reports the dependency as unavailable through either manager, naming both, rather than a single generic failure. |
| Elevation prompt declined | Reported as its own outcome, distinct from "not found" or "network failure", so the row can say plainly that the person said no rather than that something broke. |

## Security considerations

- **Nothing here ever runs as a side effect of looking at something.** Discovery, detection and
  preview are read-only; every download and every install is reachable only from an explicit
  button press.
- **Every archive is verified before extraction**, and every extracted binary is verified again by
  running it, not by trusting the archive's own claim about what it contains.
- **No credential ever crosses these paths.** Adoptium, GitHub's release CDN and the winget/
  Chocolatey manifests are all public, unauthenticated fetches.
- **The elevation prompt is never suppressed, bypassed or auto-accepted.** The app calls
  `winget`/`choco` the ordinary way and reports what they report; a declined prompt is a normal,
  reported outcome, not a retried one.
- **A digest is pinned in source for the one dependency (Chunker) with no publisher signature**,
  so the strongest check does not depend entirely on whichever answer the network gives that
  session.

## Verification

```
cd design
npx vitest run packages/app/src/main/java packages/app/src/main/bedrock packages/app/src/main/sysdeps
npx vitest run packages/ui/src/components/settings packages/ui/src/components/world
npx tsc -p packages/app --noEmit
(cd packages/ui && npx vue-tsc -p tsconfig.json --noEmit)
```

What the tests assert, specifically — the Java runtime's own suite is covered in full by
[Fetching a Java runtime for itself § Verification](./java-runtime-provisioning.md#verification);
this is the rest:

- **`packages/app/src/main/bedrock/ipc.test.ts`** and **`chunker.test.ts`** — the digest-verified
  fetch, and every state `findChunker` can report.
- **`packages/ui/src/components/world/BedrockConversionNote.test.ts`** — offers the download button
  instead of Convert when Chunker is missing; downloads, reports progress, and reveals Convert only
  once Chunker is actually there; reports a failed fetch as an alert with the button ready to retry.
- **`packages/app/src/main/sysdeps/`** — the preview's package-manager presence check; the install
  pass re-verifying a believed-present tool by actually running it before skipping; elevation
  disclosure per dependency; a declined elevation prompt; both package managers absent; and a
  fresh install verified by running it, the same as an already-present one.

## Related reading

- [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) — the
  asked-once-remembered-forever shape every download consent in this app follows.
- [Bedrock Edition worlds](./bedrock-worlds.md) — what Chunker converts, what it loses, and the
  full account of what "verified" means for a jar with no publisher signature.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — the honest,
  five-state account of what happens when Docker itself cannot be used, local or remote.
- [Language modes and funny levels](./language-and-tone.md) — why every download's explanation
  keeps the size, the source and the no-PATH/no-admin promise exact at every funny level.
