# Adopting a repository this app already prepared

Move to a second computer, sign in to GitHub, and the account can still write to the same
repositories it always could - but the fresh install remembers none of them. Without this,
the repository picker is a bare list, and picking the wrong entry (or the right one, then
re-answering every question the wizard already answered once) is the ordinary outcome.
`worldrepo/adopt.ts` recognises the repositories this application has already prepared, and
reads back what can honestly be restored from one - reachable from the **World repository**
tab's own "Adopt a repository from another computer" section, alongside syncing a world
into a repository in the first place (see [A world kept in a git
repository](./world-git-repository.md)).

**Contents**

- [Reaching this from the application](#reaching-this-from-the-application)
- [The two markers, and what each one promises](#the-two-markers-and-what-each-one-promises)
- [Checking a list: a hedge, never a certainty](#checking-a-list-a-hedge-never-a-certainty)
- [Building a plan](#building-a-plan)
- [What crosses, and what is named instead of guessed](#what-crosses-and-what-is-named-instead-of-guessed)
- [Reverse compatibility: a marker or a project from the future](#reverse-compatibility-a-marker-or-a-project-from-the-future)
- [Never a duplicate, never a write](#never-a-duplicate-never-a-write)
- [Failure modes](#failure-modes)
- [Security notes](#security-notes)
- [Verification](#verification)
- [Related reading](#related-reading)

## Reaching this from the application

`WorldRepoScreen.vue` (`design/packages/ui/src/components/worldrepo/`) drives all of this
from the **World repository** tab. Its own candidate list comes from the same "repositories
this GitHub sign-in can write to" call `BackupScreen.vue` already exposes
(`listBackupRepositories`) rather than a second implementation of it - searchable, and
multi-selectable so "check these 12" is one bulk action rather than 12 clicks. Checking
returns each candidate's `AdoptionSignal` verbatim: the status becomes a chip
("Looks like yours", "Not one of yours", "Not checked", and so on) and the hedged sentence
itself is shown exactly as `adopt.ts` composed it, never rewritten into something more
confident. A `"prepared"` or `"prepared-newer-version"` row offers **View what could be
restored**, which reads the plan and shows:

- the project's name, its maps, its storages and its non-default render settings, read
  straight from `AdoptionPlan.restoring`;
- **every item in `needsAttention`**, each with its own icon and, where a concrete
  destination exists, its own button: the dependencies item opens Settings at the Java
  runtime row, and the remote-host item opens Settings plain. The world-folder item does
  not get a button of its own next to the others - it *is* the next step, answered by the
  native folder-browse field immediately below the list;
- `alreadyLocal`, when this computer already has a local project synced from the same
  repository, so adopting a second time is a decision made with that fact in front of it
  rather than discovered afterward.

**Adopting** writes only the local project file - through `ProjectHost.writeProject`, the
same call `ProjectsScreen.vue` already uses to save any project - into the world folder just
chosen. Nothing about the repository is touched: the whole flow up to and including this
button is `GET` requests, and the write that finally happens lands on this computer's own
disk, never GitHub's. The finished write hands the shell straight to the Projects page, open
at that world, the same landing spot a finished guide run already uses.

## The two markers, and what each one promises

Two different things get prepared, and this module checks for both:

| Marker | File | Where | What it proves |
|---|---|---|---|
| World-repo marker | `.material-bluemap-world.json` | Root of the `world` branch (see [A world kept in a git repository](./world-git-repository.md)) | This branch carries an incrementally-synced copy of the world - and, because the project file lives at the root of that same world folder, a project's maps, storages and render settings travelled with it. |
| CI-bootstrap marker | `.material-bluemap-ci.json` | Root of the repository's default branch | This application committed `.github/workflows/render-world.yml` (and whatever else its template set needs) so the ordinary "Render on GitHub" archive-upload flow can dispatch against it. Nothing about a project's settings is stored here - the render flow never persists them to the repository. |

A repository can carry either marker, both, or neither. `probeAdoptionCandidates` and
`buildAdoptionPlan` check both, and the difference between them decides what adoption can
honestly promise: only a repository carrying the world-repo marker has a project file to
restore. A repository bootstrapped only for CI rendering is genuinely recognisable as this
application's own, but there is nothing inside it to bring back beyond that recognition -
see [Building a plan](#building-a-plan).

## Checking a list: a hedge, never a certainty

`probeAdoptionCandidates(host, runner, candidates, options)` checks a bounded list of
`{ owner, repo }` pairs (`DEFAULT_MAX_ADOPTION_PROBES`, 24 by default) and answers one
`AdoptionSignal` per candidate:

- `"prepared"` - a marker was found, and this build understands its version.
- `"prepared-newer-version"` - a marker was found, written by a version of the app newer
  than this one (see [Reverse compatibility](#reverse-compatibility-a-marker-or-a-project-from-the-future)).
- `"not-prepared"` - checked, and neither marker exists.
- `"unknown"` - a network or permission failure meant the check could not tell either way.
- `"not-checked"` - past the bound; a longer list is never silently truncated without saying
  so.

Every `message` is worded with "looks like" rather than an assertion of certainty, mirroring
the same discipline `remote/browse.ts`'s Minecraft-world signal holds itself to for a folder
on an SSH host: a file matching this application's own tool string is real evidence, but it
is still a claim read out of a file's bytes, not proof that this is the repository the person
sitting at this computer means.

Candidates past the bound are answered `"not-checked"`, never silently dropped and never
folded into `"not-prepared"` - a person with hundreds of repositories should be able to tell
"we didn't look" apart from "we looked, and no."

## Building a plan

`buildAdoptionPlan(host, runner, { owner, repo, branch? })` reads a repository's markers and
its project file, and returns an `AdoptionPlan` a person can read *before* anything local
changes:

- **`ok: true`** - the world-repo marker and a readable project file were both found.
  `restoring` names the project's title, whether it was ever opened past the wizard, every
  map's id/name/dimension, every storage's id, and the render options that differ from
  BlueMap's defaults. `needsAttention` names what will not cross over (see below).
  `alreadyLocal` is populated when this computer has already synced the same repository, so
  adoption is never proposed as a second binding to something already local.
- **`ok: false`**, with a `reason`:
  - `"repository-unreadable"` - the repository itself could not be read.
  - `"not-prepared"` - neither marker was found.
  - `"ci-bootstrap-only"` - the CI-bootstrap marker was found but the world-repo marker was
    not: the repository is recognisably this application's, but has no project settings
    stored in it to restore. `bootstrapMarker` is populated so a caller can still say "this
    looks like yours" even though nothing can be restored automatically.
  - `"project-absent"` - the world-repo marker exists but no project file was ever written
    onto that branch.
  - `"project-unreadable"` - the project file exists but could not be parsed.
  - `"project-too-new"` - see [Reverse compatibility](#reverse-compatibility-a-marker-or-a-project-from-the-future).

Nothing in this function writes anything. Every network call it makes is a `GET` -
`repos/{owner}/{repo}`, a branch lookup, and a Contents API read, falling back to the Git
Blob API transparently for a project file past the Contents API's 1 MB inline limit
(`project/file.ts`'s own `MAX_PROJECT_BYTES` allows up to 4 MB, so this is a real, not
theoretical, path).

## What crosses, and what is named instead of guessed

`project.ts`'s own schema deliberately never carries the Minecraft world's path - "storing it
as well would create a second source of truth that goes wrong the moment somebody moves or
copies the folder." Adoption leans on exactly that design rather than working around it.
Every successful plan therefore names three gaps unconditionally, because none of them was
ever going to be in a project file to begin with:

1. **The world folder itself.** It will not be at the same path on the new computer, and may
   not exist there at all. The interface's job is to lead into the guided world-folder step
   once adoption reports this, not to guess a path.
2. **Local dependencies.** A Java runtime, Docker's availability, and anything else this
   build provisions or detects belong to the computer it runs on, never to a repository.
3. **Remote host or SSH configuration.** Tied to keys that belong to the old computer and are
   never written anywhere this module reads.

Two further gaps are reported only when a project's own settings would otherwise cross
silently as unusable paths from the old computer:

- **`output-folder`** - `render.outputFolder` is the one field in the schema that is
  genuinely allowed to be absolute (for a rendered map written outside the world). An
  absolute path from the old computer is named rather than quietly kept, because it will
  either fail to resolve here or, worse, resolve to an unrelated folder that happens to
  share a drive letter.
- **`linked-world`** - a map's `world` field may legitimately be an absolute path to a
  *different* world folder than the one this project lives in. The same old-computer-path
  problem applies, named per affected map by id.

## Reverse compatibility: a marker or a project from the future

A marker's own `version` field is compared against the constant this build was compiled
with (`WORLD_REPO_MARKER_VERSION`, `CI_BOOTSTRAP_MARKER_VERSION`). A marker from a newer
version is still recognised - "an unknown version is still *ours*", per `repo.ts`'s own
comment - and reported as `"prepared-newer-version"` with a sentence saying some of what it
holds may not be understood by this build.

A project file is held to a stricter rule, because it is the thing this module actually
promises to restore: `parseProjectFile` refuses outright when its `version` exceeds
`PROJECT_FORMAT_VERSION`, and `buildAdoptionPlan` turns that refusal into `reason:
"project-too-new"` with the found format version attached. Nothing is guessed at for fields
this build does not model; the honest answer is "update the app", not a partial restore that
silently drops whatever a newer format added.

## Never a duplicate, never a write

`alreadyLocal` cross-checks `WorldRepoHost.records()` - this computer's own memory of every
repository it has already synced - by owner and repository name, independent of branch. When
a match exists, the plan reports the existing local `worldPath`, `branch` and `syncedAt`
rather than proposing a second binding to the same remote target. Nothing here deletes,
merges, or otherwise resolves that collision on its own; it surfaces the fact so the
interface can ask.

Every call `buildAdoptionPlan` and `probeAdoptionCandidates` make is a `GET`. Adopting a
repository this way changes nothing about it - worth stating plainly, because `WorldRepoHost`
carries other methods on the same class (`sync`, `remove`) that very much do write.

## Failure modes

- **A network or permission failure mid-check** is reported as `"unknown"`, never folded into
  `"not-prepared"` - the same discipline `browse.ts`'s owner and repository-name-availability
  checks already hold themselves to elsewhere in this application.
- **A repository that does not exist, or that this account cannot see**, is reported as
  `"repository-unreadable"` for a plan, and `"not-prepared"` for a list signal - GitHub
  answers 404 identically for both, and this module does not pretend to tell them apart
  either.
- **A project file past the Contents API's 1 MB inline limit** falls back to the Git Blob
  API automatically; a failure at that stage is reported as `"project-unreadable"` with
  GitHub's own message.

## Security notes

Neither marker ever carries a path, a username, a hostname, or a credential -
`{ tool, version, branch, updatedAt }` for the world-repo marker,
`{ tool, version, templateVersion, files, preparedAt }` for the CI-bootstrap one. Both are
designed to sit in a **public** repository without leaking anything about the machine that
wrote them, the same discipline `pages/hosting.ts`'s identical marker already holds itself
to.

The project file that travels alongside the world-repo marker is not immune to this concern
by accident: `project.ts`'s schema deliberately excludes the world's own path and refuses a
storage block carrying `connection-properties`. The two fields the schema still permits to be
absolute (`render.outputFolder`, a map's `world` field) are exactly the ones
[named as needing attention](#what-crosses-and-what-is-named-instead-of-guessed) rather than
restored silently - an absolute path recorded on a since-reformatted machine is not a secret,
but it is still a detail about that machine's own layout that this module does not repeat
back as though it belonged here.

`fetchRepositoryFileText` never handles, prints, or logs a token; every call runs through
`gh api`, spawned with an argument array and never a shell, exactly like the rest of this
package.

## Verification

`worldrepo/adopt.test.ts` proves, against a fake `gh` (never a real network call): a
repository carrying either marker is told apart from one carrying neither; every signal's
wording hedges with "looks like" and never asserts certainty; the probe bound is honoured and
reported rather than silently truncated; a plan restores the exact maps, storages and render
notes a project holds; every unconditional attention item is present in every successful
plan; an absolute output folder and an absolute linked-world path are both flagged by name; a
marker and a project format from a newer app version both degrade to a plain sentence; a
repository already bound to a local `worldPath` is detected rather than duplicated; every
call this module makes is confirmed to carry no write flag; and a dedicated test runs a real
sync into a temp world folder under this OS's own profile-shaped path and reads the marker
back off disk to confirm it carries none of that path, no drive letter, no path separator,
and nothing token- or credential-shaped.

`worldrepo/ipc.test.ts` proves the two IPC channels this exposes -
`worldrepo:adoptionProbe` and `worldrepo:adoptionPlan` - refuse a malformed request and
report an unreachable repository honestly rather than inventing a plan for it.

`WorldRepoScreen.test.ts` (`design/packages/ui/src/components/worldrepo/`, part of that
screen's 37 tests - see [A world kept in a git repository](./world-git-repository.md)'s own
Verification section for the full breakdown) proves the interface side of the same
discipline: the rendered hedge text is never upgraded past what `adopt.ts` actually said;
checking and viewing a plan never call `sync` or `remove`, confirmed against a fake bridge
that records every call it receives; every `needsAttention` item renders, with the
dependencies and remote-host items routing to Settings at the anchor they name; and adopting
writes through `ProjectHost.writeProject` and nothing else, emitting the world path the shell
uses to land on the Projects page.

## Related reading

- [A world kept in a git repository](./world-git-repository.md) - the world-repo marker and
  the branch it lives on.
- [The project file](./config-history.md) - the local version history a restored project
  joins once it is saved into a world folder.
- [Finding worlds](./finding-worlds.md) - the guided world-folder step adoption's
  `"world-folder"` attention item leads into.
- [Rendering a world in GitHub Actions](./render-in-actions.md) - what a CI-bootstrap marker
  actually enables once a repository carries one.
