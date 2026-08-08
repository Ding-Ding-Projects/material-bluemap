# Scheduled re-rendering: only when the world actually changed

**This is for a world that changes on its own** — a survival server people keep playing on,
a world a separate backup job refreshes on a timer — where somebody would otherwise have to
remember to press "Render on GitHub" again. `scheduled-render.yml` wakes up on a schedule,
checks cheaply whether the configured world has changed since the last render, and only
starts [`render-world.yml`](./render-in-actions.md) when it has. A world that has not
changed costs a few seconds of a check job and nothing more — it is never downloaded, let
alone rendered, just to learn that nothing happened.

<details>
<summary><b>Contents</b></summary>

- [What triggers a check, and what triggers a render](#what-triggers-a-check-and-what-triggers-a-render)
- [Configuring it](#configuring-it)
- [How "changed" is decided, per world-source](#how-changed-is-decided-per-world-source)
- [What it reports, and where](#what-it-reports-and-where)
- [Cost](#cost)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)

</details>

## What triggers a check, and what triggers a render

Two different things trigger here, and they are easy to conflate:

- **A check** runs whenever `scheduled-render.yml`'s job executes. GitHub's `schedule:`
  trigger cannot read a repository variable to decide its own cron — a cron expression is
  fixed the moment this file is written — so the workflow always wakes up **hourly**, the
  finest supported interval, and then asks a small pure function
  (`design/packages/render-actions/src/schedule/cadence.ts`'s `isCadenceDue`) whether the
  *configured* cadence says a check is actually due yet. Most hourly wake-ups, on a daily,
  weekly, or custom multi-hour configuration, do nothing beyond that question — no metadata is even
  fetched.
- **A render** — dispatching [`render-world.yml`](./render-in-actions.md), the workflow
  documented separately — only happens when a due check's comparison says the world
  **changed**. `workflow_dispatch` with `force-check: true` runs a check immediately,
  ignoring the cadence, for testing or for "I know it changed, check right now."

Nothing here replaces the desktop app's own CI-render sync
(`design/packages/app/src/main/cirender/sync.ts`), which uploads a world and drives a
render from a person pressing a button. This workflow is the unattended path: it never
uploads anything, and it dispatches a render exactly like a person would from the Actions
tab.

## Configuring it

The workflow reads its configuration from **repository variables**, not from editing this
file. Set them by hand with `gh variable set`, or from the desktop app's CI-render screen —
see [the app-side configuration surface](#the-app-side-configuration-surface) below.

| Variable | Meaning |
|---|---|
| `CIRENDER_SCHEDULE_ENABLED` | `"true"` to turn scheduled checking on at all. Anything else, including unset, means every hourly wake-up does nothing and says so in its run summary. |
| `CIRENDER_SCHEDULE_CADENCE` | A guided preset (`hourly`, `sixHourly`, `daily`, `weekly`) or a custom whole-hour interval encoded as `hours:N`, where `N` is 1–168. Never a cron expression — the app presents a bounded number field and both the main process and workflow validate it. |
| `CIRENDER_SCHEDULE_WORLD_SOURCE` | `repository`, `release-asset`, `url` or `git` — the same choices [`render-world.yml`](./render-in-actions.md) accepts. |
| `CIRENDER_SCHEDULE_WORLD` | Same meaning as `render-world.yml`'s `world` input, **with one narrowing**: for `release-asset`, this must be one exact asset name (optionally `tag/name`), never a glob. A cheap check has to name a single asset to watch for changes; a glob that could resolve to a different asset next time is not something "did it change" can answer. For `git`, this is a branch (optionally `branch:subpath`). |
| `CIRENDER_SCHEDULE_WORLD_REPOSITORY` | `release-asset` (blank means this repository) and `git` (always required — a git source always names one repository). |
| `CIRENDER_SCHEDULE_DIMENSION`, `_MAP_ID`, `_MAP_NAME`, `_OUTPUT`, `_BUDGET_MINUTES`, `_MAX_JOBS` | Carried straight through as the matching `render-world.yml` input when a render is actually dispatched. Each falls back to that workflow's own default when unset. |

### The app-side configuration surface

The desktop app's CI-render screen (`design/packages/ui/src/components/cirender/`) offers a
**Scheduled re-rendering** section once a sync's repository is known: a switch for
`CIRENDER_SCHEDULE_ENABLED`, a preset or a custom 1–168 hour interval — never a free-text
cron field — and a status line reading `CIRENDER_SCHEDULE_LAST_CHECK_AT`,
`_LAST_CHECK_RESULT` and `_LAST_RENDER_AT` back. It writes through the same two GitHub
credential routes (the application's own sign-in, or the `gh` command-line tool) the rest of
the CI-render feature already uses — see
`design/packages/app/src/main/cirender/schedule.ts` and its `readRepositoryVariable`/
`writeRepositoryVariable` additions to `CiTransport` in `transport.ts`. World-source and the
render inputs are derived from the sync's own project rather than typed a second time.

## How "changed" is decided, per world-source

Every comparison is pure and lives in
`design/packages/render-actions/src/schedule/changeCheck.ts`'s `evaluateScheduleChange`,
covered by its own unit tests. The workflow's job only *gathers* two snapshots — this
check's and the last recorded one — and hands them to that one function.

- **`repository`**: the world is already checked out by the time the job runs (the workflow
  begins with `actions/checkout@v4`), so this reuses **the exact same function**
  (`fingerprintWorld`, in `design/packages/render-actions/src/world/fingerprint.ts`) the
  desktop app already runs before every upload — not a second, hand-rolled comparison.
  Hashing an already-present tree costs one `readdir`/`stat` pass, not a download. See that
  file's own documentation for what the fingerprint can miss (a file restored to an
  identical size and modification time reads as unchanged; Minecraft does not do that in
  practice).
- **`release-asset`**: downloading the asset to hash its bytes would defeat the entire point
  of checking cheaply, so this trusts what GitHub already publishes about it **without
  fetching the asset itself** — its own `digest` field (`sha256:...`) when GitHub sent one,
  and its `size` plus `updated_at` otherwise. This is a real, stated narrowing: two uploads
  landing on the same byte count in the same second would be missed on the fallback path.
  Prefer a build that publishes a digest.
- **`url`**: a `HEAD` request's headers are all that is read — `ETag` first, then
  `Content-Length`/`Last-Modified` together as a fallback. A server that sends **none** of
  those three is reported as `unknown`, never guessed at in either direction: the workflow
  does not render (a false "nothing changed" every hour would be worse than admitting it
  cannot tell) and does not skip silently either — the reason says exactly why, every time,
  so it is visible rather than a check that quietly never triggers.
- **`git`**: a world kept in a git repository has the cheapest signal of the four — one
  `gh api` call for the target branch's current commit SHA, nothing cloned and nothing
  downloaded. Two SHAs either match or they do not; there is no fallback to reach for the
  way `release-asset` and `url` need one.

## What it reports, and where

Every check — due or not, changed or not — writes to its own run summary
(`$GITHUB_STEP_SUMMARY`). A due check additionally writes three repository variables so the
outcome survives past that one run and reaches the app:

- `CIRENDER_SCHEDULE_LAST_CHECK_AT` — set only when a check actually ran, never on an
  hourly wake-up that decided nothing was due yet.
- `CIRENDER_SCHEDULE_LAST_CHECK_RESULT` — `changed`, `unchanged`, `unknown` or `error`.
- `CIRENDER_SCHEDULE_LAST_CHECK_REASON` — the one sentence `evaluateScheduleChange` gave.
- `CIRENDER_SCHEDULE_LAST_BASELINE` — the snapshot just compared, kept as the baseline for
  next time. Left untouched on `error` (the world could not be found this time) and on
  `unknown`, so a transient failure never erases a working comparison point.
- `CIRENDER_SCHEDULE_LAST_RENDER_AT` — set only when a render was actually dispatched.

GitHub does not hand back a run id from a `workflow_dispatch` call, so this workflow cannot
link the render it started directly; the summary points at the Actions tab instead, the same
honest gap `main/cirender/sync.ts` already documents for a dispatch it cannot immediately
find.

## Cost

Checking is cheap **regardless of cadence** — every check reads a small amount of metadata
(or, for `repository`, hashes files already on disk) and nothing about that gets more
expensive the more often it runs. `describeCadenceCost` in
`design/packages/render-actions/src/schedule/cadence.ts` reports the one number this feature
can state honestly: exactly how many times a month a cadence wakes the check up (720 for
hourly, 120 for six-hourly, 30 for daily, 4 for weekly, or the computed count for a custom
whole-hour interval) — never a fabricated runner-minute
estimate, because a check job's real duration depends on the world's source and this project
does not invent numbers it has not measured.

What cadence actually controls is **staleness**, not runner-minute spend: how long a real
change can sit before it is noticed and rendered. The real cost lever is a **false**
"changed" — every detector above is built to avoid one, but the `release-asset` fallback and
the deliberately conservative `url` handling are exactly where a false positive (or a
missed one) could still occur, and both are documented above rather than hidden.

## Failure modes

- **`CIRENDER_SCHEDULE_ENABLED` unset or not `"true"`**: every hourly wake-up says so in its
  summary and does nothing else. Not a failure — the default state.
- **The configured world cannot be found** (a repository path that no longer exists, a
  deleted release asset, an unreachable URL): recorded as `error`, never as `changed`. A
  render dispatched against a world that is not there would just fail a few minutes later
  inside `render-world.yml`'s own fetch step; refusing here is cheaper and clearer.
- **A `url` source sends no comparable header**: recorded as `unknown` on every check,
  forever, until the world moves to a `release-asset` or `repository` source or the server
  starts sending `ETag`/`Content-Length`/`Last-Modified`. The summary and
  `CIRENDER_SCHEDULE_LAST_CHECK_REASON` say this plainly each time rather than only once.
- **Repository-variable writes fail** (a token without the needed permission — see below):
  the check step itself has already run and its result is visible in the run summary even
  when the follow-up `gh api` write is refused; only the *persisted* last-check state is
  affected, not the decision made this run.

## Security considerations

- Writing a repository variable needs more than the ephemeral `GITHUB_TOKEN` grants — GitHub
  does not expose a `variables:` permission to workflow tokens at all. This workflow resolves
  `secrets.RELEASE_TOKEN || secrets.ORG_TOKEN || secrets.GITHUB_TOKEN`, the same chain every
  other workflow in this project falls back through, and if none of the first two secrets is
  configured the variable-write calls fail (harmlessly — see Failure modes above) rather than
  the check itself failing.
- Nothing this workflow reads or writes is a secret. Repository variables are visible to
  anyone who can see the repository's settings, which is the right visibility for "when was
  this last checked" and "what does it compare" — no token, credential or private URL query
  string belongs in `CIRENDER_SCHEDULE_WORLD`.
- A `url` source's `HEAD` request follows the same `curl --retry` shape the rest of this
  project's fetches use; it is a plain unauthenticated request; nothing about the response is
  executed, only three headers are read as text.

## Verification

- `design/packages/render-actions/src/schedule/cadence.test.ts` — the cadence set, due/not-due
  at and around the boundary, and the cost description's exact arithmetic.
- `design/packages/render-actions/src/schedule/changeCheck.test.ts` — every comparison per
  world-source kind, including the `unknown` and `error` cases.
- `design/packages/render-actions/src/schedule/cli.test.ts` — the `fingerprint`,
  `schedule-due` and `schedule-check` CLI commands this workflow calls, including their
  `$GITHUB_OUTPUT` writes.
- `design/packages/render-actions/src/world/fingerprint.test.ts` — the reused fingerprint
  function itself, unchanged from what `main/cirender/sync.ts` already relied on.
- `.github/workflows/scheduled-render.yml` passes `actionlint` (including its `shellcheck`
  pass) locally as part of this feature's own checks.
- The app-side repository-variable read/write and the schedule configuration screen are
  covered in `design/packages/app/src/main/cirender/transport.test.ts`,
  `design/packages/app/src/main/cirender/schedule.test.ts` and
  `design/packages/ui/src/components/cirender/CiRenderScreen.test.ts`.
