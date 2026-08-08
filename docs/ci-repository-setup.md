# Setting a repository up for CI rendering

**This is the piece that stops a repository without render workflows from being a dead end.** [Rendering a
world in GitHub Actions](./render-in-actions.md) needs `render-world.yml` committed to a
repository's default branch before anything can start — and before this existed, nothing in
this application ever put it there. A freshly created repository, or an existing project
that has never had the render workflow added to it, hit a permanently disabled render
button with a message that read like a permissions problem even when the real cause was
simply that nothing had been set up yet. This is the app doing that setup itself.

<details>
<summary><b>Contents</b></summary>

- [What "set up" means](#what-set-up-means)
- [The four states this handles](#the-four-states-this-handles)
- [What it never does](#what-it-never-does)
- [The marker, and why a foreign file is refused rather than replaced](#the-marker-and-why-a-foreign-file-is-refused-rather-than-replaced)
- [Token scopes, checked before anything is written](#token-scopes-checked-before-anything-is-written)
- [Actions enabled is a different question from the workflow existing](#actions-enabled-is-a-different-question-from-the-workflow-existing)
- [Runner minutes: public is free, private is not](#runner-minutes-public-is-free-private-is-not)
- [Running it twice](#running-it-twice)
- [Failure modes](#failure-modes)

</details>

## What "set up" means

Three files, committed together to the repository's default branch:

- `.github/workflows/render-world.yml` — the workflow a sync dispatches.
- `.github/workflows/render-shard-wave.yml` — the reusable workflow every sharded wave calls
  by local path (`uses: ./.github/workflows/render-shard-wave.yml`), so it has to be on the
  repository too, not only referenced from this project's own copy.
- `.github/workflows/scheduled-render.yml` — the scheduled check that decides whether a
  recorded world has changed and should be rendered again.

All three are written verbatim. A packaged installer must contain the complete set under its
own resources; if even one file is missing, setup fails closed and never borrows a file from a
developer checkout. Development runs may read the checkout's `.github/workflows/` directory.
See `cirender/workflowTemplates.ts`.

## The four states this handles

1. **Truly empty — no commits at all.** GitHub's Git Data API cannot create the first branch
   ref in an empty repository. Setup therefore fails closed before creating candidate objects
   and asks for one starter commit. Repositories created in this application already receive
   that starter commit automatically; an externally created empty repository needs one before
   retrying.
2. **Has content, no workflow.** One new tree is based on the current default-branch tree and
   adds the workflow set alongside it. Nothing else on the repository is changed — see
   [What it never does](#what-it-never-does) for why that is a guarantee rather than a
   promise.
3. **This application prepared it before, and the shipped workflow has moved on.** An update
   is allowed only when the current UTF-8 bytes still have the exact SHA-256 recorded when
   that file was installed. A hand edit, including a deletion, becomes a typed conflict and
   is never overwritten. A marker or template version newer than this build is never
   downgraded.
4. **Looks prepared, cannot run.** The workflow files can be present and current and GitHub
   Actions can still be off for the repository, or restricted by an organisation policy. That
   is reported honestly rather than smoothed into a ready state — see
   [Actions enabled is a different question](#actions-enabled-is-a-different-question-from-the-workflow-existing).

## What it never does

Every candidate blob, the complete tree, and the commit are built out of sight through the
Git Data API. The only repository-visible mutation is the final default-branch ref update,
made with `force: false` and guarded by the exact head SHA read before planning. Marker and
workflow ownership reads are pinned to that same SHA rather than to a moving branch name. If
another writer advances the branch, the update is a typed concurrent-update conflict and none
of the candidate bytes become visible. There is no force-push, branch replacement, sequential
single-file commit, or rollback that has to guess what another writer did.

## The marker, and why a foreign file is refused rather than replaced

Every file this writes is recorded in `.worldlens-ci.json`, at the repository root. Schema 2
records the marker schema version, a monotonic numeric template-set version, every managed
path, and the exact SHA-256 of the UTF-8 bytes installed at each path — the same pattern
[publishing to GitHub Pages](./pages-hosting.md) already uses for its own marker. Before a
file that already exists is touched, its content is compared to the template:

- **Identical and recorded by the marker** → left alone; nothing is written.
- **Different, recorded by the marker, and still equal to the marker's installed hash** →
  this is an unchanged older template, so it may be updated safely.
- **Different from the installed hash, or deleted after installation** → refused as a
  managed-file conflict. The application never treats its marker as permission to erase a
  later user edit.
- **Not recorded by the marker** → refused outright. Somebody's own
  file happens to share this exact path, and nothing here overwrites it without being told
  to. The whole run refuses, even when only one of several managed files conflicts — a
  half-prepared repository is worse than an unprepared one, because it looks finished.

## Token scopes, checked before anything is written

Writing under `.github/workflows/` needs the `workflow` OAuth scope; an ordinary repository
write only needs `repo`. A token carrying `repo` but not `workflow` would otherwise create
everything else and then fail specifically on the workflow file, leaving a repository half
set up with an error that does not explain why. Both scopes are checked — where the
credential can report them at all — **before the first byte is written**, so that failure
mode cannot happen: either both scopes are there and the whole run proceeds, or neither
scope check passes and nothing was touched. A credential that cannot report its scopes at
all (most fine-grained tokens, and every OAuth App or GitHub App installation token) is not
treated as missing anything — the run proceeds, with a note that a scope refusal, if it
happens, will show up as the workflow file specifically failing.

## Actions enabled is a different question from the workflow existing

`GET .../actions/permissions` is read once the files are in place, and its answer is
reported plainly:

- `enabled: true` → ready.
- `enabled: false` → **not** a green tick, however current the files are. The repository or
  an organisation policy has Actions switched off, and the message says exactly that, with
  the setting to change (Settings → Actions → General).
- **Could not be read at all** → this endpoint needs administrator access to the repository,
  which a token with ordinary write access may not have. Reported as "could not be
  determined" rather than either extreme — this is not evidence of a problem, and treating
  it as one would tell people to fix a policy that is not actually broken.

## Runner minutes: public is free, private is not

A public repository gets unlimited standard-runner minutes. A private one spends from the
account's own monthly allowance, and a sharded render spends one runner-minute per runner
per minute — a thirty-way split burns thirty times the wall-clock time. Preparing a private
repository carries a note saying exactly this, in as many words, before the first render is
started there.

## Running it twice

Idempotent by construction: a second run validates all three workflow hashes and the marker,
then performs no Git mutation at all. The CI-render screen runs this check immediately before
every dispatch, so a safe managed update lands first while a user-edit, downgrade, or
concurrent-update conflict stops before a workflow run is started. The detailed conflict is
shown at the control that initiated the render.

## Failure modes

Every refusal names the exact cause rather than a generic failure:

- **No credential can drive it at all** — nobody signed in to the application, and `gh` is
  either not installed or not signed in.
- **A scope is missing** — names the exact scope (`repo`, `workflow`, or both) and that
  signing in again is what would fix it.
- **The repository does not exist, or this credential cannot see it** — GitHub answers a
  private repository nobody has access to and a genuinely missing one the same way, which
  the message says plainly rather than guessing.
- **The credential can see the repository but cannot write to it.**
- **The repository has no first commit** — asks for one starter commit and changes nothing;
  the in-app repository creator already supplies it.
- **A foreign file is in the way** — see [the marker section](#the-marker-and-why-a-foreign-file-is-refused-rather-than-replaced)
  above.
- **A managed file was edited or deleted** — names the conflicting path; none of the three
  workflows or the marker are changed.
- **A newer marker schema or template version is present** — the older application refuses
  to downgrade it.
- **The default branch moved concurrently** — the expected-head check refuses the final ref
  update without force.
- **A network or GitHub-side failure partway through object creation** — the branch still
  points at its original tree. Candidate Git objects may be unreachable, but no partial
  workflow set or marker is visible and a later retry starts from the actual branch head.
- **A packaged resource is missing** — no checkout fallback is attempted and the repository
  is not contacted for a write.

None of these is a spinner that hides what happened. Every one names its cause and, where
there is one, the exact fix.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md) — what the workflow this
  prepares actually does, once it can run.
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the marker-file pattern
  this reuses, and the other place this project force-replaces a branch on purpose.
- [Scheduled re-rendering](./scheduled-render.md) — configuring the repository once a render
  has run at least once.
