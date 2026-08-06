# Setting a repository up for CI rendering

**This is the piece that stops an empty repository from being a dead end.** [Rendering a
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

Two files, committed to the repository's default branch:

- `.github/workflows/render-world.yml` — the workflow a sync dispatches.
- `.github/workflows/render-shard-wave.yml` — the reusable workflow every sharded wave calls
  by local path (`uses: ./.github/workflows/render-shard-wave.yml`), so it has to be on the
  repository too, not only referenced from this project's own copy.

Both are written verbatim, read fresh off this build's own disk (a packaged installer ships
them under its resources; a development checkout reads them straight from `.github/workflows/`
— see `cirender/workflowTemplates.ts`), so the copy landing on the target repository is
always exactly the workflow this build actually drives, never a hand-typed approximation of
it.

## The four states this handles

1. **Truly empty — no commits at all.** A repository fresh out of `gh repo create` or the
   GitHub website has no default-branch ref until its first commit lands. GitHub's Contents
   API tolerates this directly: a `PUT .../contents/{path}` with no `sha` on an empty
   repository creates the very first commit and, with it, the default branch — there is no
   separate "initialize this repository" step to get wrong, and nothing here needs a branch
   to already exist first.
2. **Has content, no workflow.** The same call creates the workflow file alongside whatever
   is already there. Nothing else on the repository is read or written — see
   [What it never does](#what-it-never-does) for why that is a guarantee rather than a
   promise.
3. **This application prepared it before, and the shipped workflow has moved on.** The
   committed file's content is compared against the current template — not a version number
   alone, so a hand-edited copy still compares as changed — and updated with the file's
   current `sha`, GitHub's own optimistic-concurrency check against clobbering a write that
   landed after this one was read.
4. **Looks prepared, cannot run.** The workflow files can be present and current and GitHub
   Actions can still be off for the repository, or restricted by an organisation policy. That
   is reported honestly rather than smoothed into a ready state — see
   [Actions enabled is a different question](#actions-enabled-is-a-different-question-from-the-workflow-existing).

## What it never does

Every write is a single-file `PUT` through the Contents API, at one of exactly two workflow
paths plus a marker file. There is no force-push, no branch replacement, and nothing here
can touch a path it was not explicitly given — that follows from what the operation is
capable of calling, not from a rule remembered every time it runs. A repository with years
of history and an active default branch is exactly as safe to point this at as a repository
created thirty seconds ago.

## The marker, and why a foreign file is refused rather than replaced

Every file this writes is recorded in `.material-bluemap-ci.json`, at the repository root,
naming the tool, the template version, and which paths it placed — the same pattern
[publishing to GitHub Pages](./pages-hosting.md) already uses for its own marker. Before a
file that already exists is touched, its content is compared to the template:

- **Identical** → left alone; nothing is written.
- **Different, and the marker lists this path** → this application wrote the earlier copy,
  so it is updated.
- **Different, and the marker does not list this path** → refused outright. Somebody's own
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

Idempotent by construction, not by a special case: a second run reads the same content it
would write, finds it identical, and writes nothing. The marker is only rewritten when
something actually changed. Running the operation against an already-current repository is
therefore always safe, and the interface can offer "set this repository up" as a repeatable
action rather than a one-time step somebody has to get right the first time.

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
- **A foreign file is in the way** — see [the marker section](#the-marker-and-why-a-foreign-file-is-refused-rather-than-replaced)
  above.
- **A network or GitHub-side failure partway through** — whatever was already written stays
  written (the Contents API commits one file at a time; there is nothing to roll back), and
  running the operation again picks up from what is actually on the repository rather than
  from what the previous attempt assumed.

None of these is a spinner that hides what happened. Every one names its cause and, where
there is one, the exact fix.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md) — what the workflow this
  prepares actually does, once it can run.
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md) — the marker-file pattern
  this reuses, and the other place this project force-replaces a branch on purpose.
- [Scheduled re-rendering](./scheduled-render.md) — configuring the repository once a render
  has run at least once.
