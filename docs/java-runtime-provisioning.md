# Fetching a Java runtime for itself

Local rendering runs on BlueMap's own Java engine (decision D17), so the app needs a JVM. Until
now, "the app needs a JVM" meant a person had to go and install one themselves: the download,
verify, extract and install pipeline for a Temurin JDK existed in full, was unit-tested, and was
reachable from nothing a person could click. The settings row even said, in as many words, "the
app can fetch one for you" — and then offered a single button, **Look again**, that only re-ran
discovery. This document covers what closes that gap: an explicit **Download Java** button, the
one-time consent it is gated behind, and the real-network proof that the pipeline it calls
actually works against Adoptium's own servers rather than only against test fakes.

## Contents

- [Behaviour](#behaviour)
- [Consent, in the Mojang download's own shape](#consent-in-the-mojang-downloads-own-shape)
- [The pipeline the button calls](#the-pipeline-the-button-calls)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Suggested articles](#suggested-articles)

## Behaviour

The Java settings row (`packages/ui/src/components/settings/JavaRuntimeRow.vue`) always shows what
`java:runtime` actually found — `JAVA_HOME`, then `java` on `PATH`, then a copy the app installed
for itself, each one **run** before being believed, never merely assumed from a path. When none of
those is suitable, the row's `missing` state now offers a real action instead of only naming
`JAVA_HOME` as the fix:

1. **The explanation comes first.** Before any button does anything, the row states what will be
   fetched (Eclipse Temurin), from where (Adoptium's own servers), roughly how big the transfer is,
   and the three promises that make it safe to press: nothing is installed system-wide, `PATH` is
   never touched, and no administrator rights are asked for.
2. **Download Java** starts the transfer. The button is disabled and replaced by a progress bar for
   the whole run; the bar is indeterminate until Adoptium's response has named a real byte count,
   and becomes determinate once it has. A stage message underneath tracks the same
   `ProvisionEvent` stream the pipeline always emitted (`resolving`, `downloading`, `verifying`,
   `extracting`, `installing`, `done`) — this was already built and tested; what was missing was
   something in the interface reading it.
3. **On success the row reloads discovery itself.** Nobody has to press a second, unrelated "Look
   again" after watching a download finish; the row moves straight from `missing` to `found`.
4. **On failure the main process's own sentence is shown**, verbatim, in an alert beside the
   button, which stays ready to retry.

A build whose preload has not grown the three provisioning channels (an older desktop build, or a
browser tab with no main process at all) shows none of this: `canProvision` is feature-detected,
and the row falls back to the discovery-only behaviour it always had rather than a button that
would throw. This is the same "nothing here invents a capability" rule every other row in this
settings surface already follows.

## Consent, in the Mojang download's own shape

Principle: downloading and installing software is not a neutral act, and the app already has the
right precedent for how to ask about one — the Mojang download consent, asked once at first
launch, remembered forever, never asked again. The Java download follows that shape, adapted to
where it is actually decided:

- `main/java/consent.ts` records the decision as a small JSON file under
  `<userData>/java/download-consent.json`, written through a staging file and a rename so a crash
  mid-write cannot leave a half-written answer — the identical pattern `main/consent.ts` uses for
  the Mojang EULA, restated for this file rather than shared with it, because agreeing to fetch a
  JVM is not agreeing to Mojang's licence and the two records should never be able to answer for
  each other.
- Rather than a separate first-run screen, the *button itself* is where the explanation and the
  decision meet: pressing **Download Java** is what the row treats as consent, because the row has
  already shown the size and the source immediately above it. The first click records the
  acceptance (`java:acceptDownloadConsent`) and starts the download in the same action; every click
  after that skips straight to downloading, because the answer is already on record.
- **The main process is the actual gate, not merely the UI.** `java:provision` reads
  `readJavaDownloadConsent()` itself and refuses — with an honest message, never a thrown error —
  when no acceptance is on file, regardless of what called it or how. A caller that skipped the
  explanation still cannot start an unannounced download; the row's own bookkeeping only keeps its
  displayed state honest about what is about to happen.

## The pipeline the button calls

Nothing about the download-verify-extract-install pipeline itself is new; it predates this task and
was already unit-tested. What changed is that it is now reachable:

- `main/java/adoptium.ts` resolves the current Temurin release for the required feature version
  (`REQUIRED_JAVA_FEATURE`, currently 25) and the running platform/architecture from Adoptium's own
  API.
- `main/java/download.ts`'s `downloadVerified()` streams the archive to a `.part` file, resumes a
  partial one rather than restarting, and checks the finished file's SHA-256 against the digest
  Adoptium's own response carried — before a single byte is extracted.
- `main/java/extract.ts` unpacks into a staging directory and renames it into place only after a
  real `bin/java` has been found inside it, so a half-extracted archive is never mistaken for an
  install.
- `main/java/installation.ts` writes a record of exactly what was installed — version, vendor, OS,
  architecture, archive URL, the verified SHA-256, and the timestamp — so a settings row can state
  "Java 25.0.4+7, provisioned by the app" rather than a guess.
- `main/java/index.ts`'s `ensureJava()` ties it together: discovery first, and the download only
  runs when discovery found nothing suitable *and* `allowProvisioning` was explicitly set. The
  freshly installed JVM is then **probed like any other candidate** — run, not trusted — because an
  archive can unpack into something that does not launch, a disk can be full, or an antivirus can
  quarantine a binary between the rename and the first launch.

Three IPC channels put this behind the button (`main/java/ipc.ts`):

| Channel | What it does |
|---|---|
| `java:downloadConsent` | Reads the stored decision. |
| `java:acceptDownloadConsent` | Records agreement. Idempotent — calling it again keeps the original timestamp. |
| `java:provision` | Refuses without consent; otherwise calls `ensureJava({ allowProvisioning: true })` and streams every `ProvisionEvent` to `java:provisionEvent` on every open window, the same broadcast shape `bedrock:convert` already uses for a Chunker conversion's progress. |

Concurrent calls to `java:provision` are folded into one in-flight promise, the same rule
`java:runtime` already followed — a screen that mounts and immediately re-renders must not start a
second, redundant download racing the first.

## Configuration

There is nothing to configure. The install lands at `<userData>/java/temurin-25/` (keyed by
feature version rather than by exact patch release, so an update replaces the install instead of
accumulating a new folder per patch), and a machine that already has a suitable `JAVA_HOME` or
`java` on `PATH` is used ahead of anything provisioned — the button never appears unless discovery
already found nothing usable.

## Failure modes

| What happens | What the row does |
|---|---|
| The download button is pressed with no consent on record | Never actually reachable: pressing it *is* the first consent, recorded before the transfer starts. |
| `java:provision` is called with consent withdrawn or never given (a stale UI, a replayed call) | The main process refuses with an explanatory message; nothing is downloaded. |
| The digest does not match | `downloadVerified()` deletes the bad bytes and throws; the row shows the main process's own sentence and stays ready to retry. |
| The network drops mid-transfer | The partial `.part` file is kept; pressing the button again resumes rather than restarting. |
| The archive extracts but the resulting `java` will not run, or reports a version too old | The install record is withdrawn (`clearInstallRecord`) so a later launch does not offer a known-broken install as a candidate, and the failure names the exact executable and reason. |
| A build has no `ensure` wired into `java:provision` at all | `java:provision` answers "This build cannot download a Java runtime from here" rather than throwing. |
| A browser tab, or an older desktop build with no provisioning channels | `canProvision` is false; the row shows its pre-existing discovery-only text and no dead button. |

## Security considerations

- **User-scoped only.** Everything lands under Electron's `userData`; nothing is written to the
  registry, nothing is added to `PATH`, no installer runs, and no elevation is ever requested.
  Uninstalling the app takes the provisioned JDK with it.
- **Verified before use, every time.** The SHA-256 comes from the same Adoptium API response that
  carried the download link, checked against the finished file before extraction — never trusted
  from the URL or the response headers alone.
- **A crash cannot half-install.** The download writes to a `.part` file; extraction stages into a
  temporary directory and is renamed into place only once a real `java` binary is confirmed inside
  it.
- **Never a side effect.** `java:runtime` (the discovery a settings row loads on every visit, and
  every render checks before starting) never provisions anything on its own — only the explicit
  `java:provision` channel, reachable only from the button, ever downloads.

## Verification

`design/packages/app/src/main/java/` carries a large passing suite across the layer this document
describes, plus three real-network proofs gated behind `MBM_REAL_JDK_DOWNLOAD=1` (skipped by
default so ordinary CI runs do not depend on Adoptium's availability, and never download ~140 MB on
every push):

- `consent.test.ts` — every unhappy path for the download-consent record resolves to
  "not accepted": a missing file, malformed JSON, the wrong shape, a stale terms version. Only a
  well-formed record this module itself wrote reads as agreement.
- `ipc.test.ts` — the two consent channels, and `java:provision` refusing without consent,
  refusing honestly with no `ensure` wired in, provisioning and streaming progress through
  `broadcast` once consent is given, folding concurrent calls into one `ensure()` run, and cleaning
  a thrown failure's message the same way every other rejection on this channel is cleaned.
- `download.test.ts`, `extract.test.ts`, `installation.test.ts`, `adoptium.test.ts`, `jars.test.ts`,
  `discovery.test.ts`, `version.test.ts`, `packaging.test.ts`, `index.test.ts` — the pre-existing
  suite for the pipeline itself, unchanged by this task.
- **`download.realNetwork.test.ts`, `provision.realNetwork.test.ts`, `ensureJava.realNetwork.test.ts`**
  — opt-in proofs against Adoptium's real servers rather than fakes. The most recent run resolved a
  real release (`jdk-25.0.4+7`, Windows x64), downloaded **141,164,204 bytes** from GitHub's real
  release CDN, verified its real SHA-256, extracted it with the real bundled `tar.exe`, and ran the
  extracted `java` to confirm it reports `25.0.4`. The "roughly 140 MB" figure quoted in the
  settings row's own explanation, and pinned in the copy catalogue's `FACTS`, is that measured
  number rounded — not a guess.

On the interface side:

- `packages/ui/src/components/settings/javaSetting.test.ts` — `canProvision` feature
  detection, reading and treating a failed consent read as "not known" rather than "accepted",
  recording consent as part of the first download click and never re-recording it on a second,
  streaming and unsubscribing from progress events, refusing a second concurrent download while one
  is in flight, and reporting both a main-process refusal and a thrown error as `provisionFailure`
  rather than swallowing either.
- `packages/ui/src/components/settings/JavaRuntimeRow.test.ts` — the button, its explanation, the
  progress bar, and the "found" state the row lands on after a successful download.
- `packages/ui/src/copy/` — the catalogue-coverage guard that fails when a rendered `t(...)` key has
  no catalogue entry, and the FACTS guard that fails when a voiced entry drops a pinned fact (the
  size, the "Adoptium" source, "system-wide", "administrator") at any of its five funny levels.

Run locally with:

```sh
cd design
npx vitest run packages/app/src/main/java/ packages/ui/src/components/settings/javaSetting.test.ts packages/ui/src/components/settings/JavaRuntimeRow.test.ts

# Opt-in real-network proof against Adoptium's actual servers (~140 MB download):
MBM_REAL_JDK_DOWNLOAD=1 npx vitest run packages/app/src/main/java/provision.realNetwork.test.ts packages/app/src/main/java/ensureJava.realNetwork.test.ts packages/app/src/main/java/download.realNetwork.test.ts
```

## Suggested articles

- [Automatic dependency provisioning](./dependency-provisioning.md) — the shape this Java download
  follows, applied to Chunker and to `git`/`gh`/Docker Desktop/`rsync` through winget/Chocolatey,
  plus the dependencies that genuinely stay a manual install.
- [Bedrock Edition worlds](./bedrock-worlds.md) — Chunker follows the identical shape: a fully
  built, digest-verified download handler that had no button calling it, closed the same way.
- [The Minecraft licence and the consent that refers to it](./eula-and-consent.md) — the
  asked-once-remembered-forever consent shape this document's own consent record is built from.
- [Running the engine on this computer, or in a container](./docker-and-local.md) — the other route
  to a working JVM for a machine that would rather not provision one at all.
- [Automatic repair when a render or the web server fails to start](./automatic-repair.md) — what
  happens when a render still fails after this.
