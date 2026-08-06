# The gh command-line tool's own accounts

This application already has its own GitHub sign-in, with its own multi-account store (see the
"Signed-in accounts" section under Settings → GitHub). This document is about a second, completely
separate thing: the accounts the `gh` command-line tool itself is signed in as, on the same
computer.

## Behaviour

### Two stores, never one list

`gh` keeps its own credential store — shared by every terminal, script and other tool on the
machine that shells out to `gh` — under its own control, in its own files. This application's own
account store is a set of encrypted files under the app's own data directory, managed entirely by
the app. The two can disagree at any moment: an account signed in to `gh` may never have touched
this application, an account signed in to this application may never have touched `gh`, and "the
active account" can be a different login in each store at the same time.

Settings → GitHub therefore shows two sections, one below the other, separated by a divider: the
app's own "Signed-in accounts" list, and a second "gh command-line tool accounts" section. The
second section carries its own explainer, in every language mode and at every funny level, saying
plainly that this is a different, separate account book. Nothing merges the two lists, and nothing
in either section reads or writes the other store.

### Listing gh's accounts

The main process (`design/packages/app/src/main/ghcli/accounts.ts`) reads `gh`'s account list
through `gh auth status --json hosts` — a stable, structured route confirmed present on the `gh`
version this feature was built against (2.96.0, July 2026). Unlike the plain-text form of the same
command, the JSON route answers **exit code 0 even when nobody is signed in to anything**; only a
genuinely fatal error makes it fail, so the application never has to guess whether an empty answer
means "nobody is signed in" or "the command itself broke".

When the JSON route cannot be parsed at all — an old `gh` that predates `--json` on this command —
the module falls back to parsing plain `gh auth status` text, isolated in its own function
(`parseGhAuthStatusText`) with its own tests over real captured output from both the current and a
legacy `gh` version. If neither route produces something recognisable, the list reports
`availability: "unrecognised"` rather than an empty list: a format this application does not
understand is never presented as "you have no accounts", because that would be a claim the
application has no basis for making.

Each account carries: its login, the host it is on (`github.com` or an enterprise host), whether it
is the one `gh` would use right now, its reported scopes (or an honest "not reported by this token"
for a token kind that does not carry a scope list at all), how it was signed in (`tokenSource` —
`keyring`, a plain file, and so on — never the credential itself), its git protocol, and whether
`gh`'s own per-account health check reported anything other than success.

### Scope gaps, shown where they matter

The section computes, per account, which of this application's own scopes of interest (`repo` for
the backup route, `workflow` for dispatching a CI render) that account's token is missing —
`APP_SCOPES_OF_INTEREST` in `main/ghcli/accounts.ts`. An account short a scope shows a warning right
on its own row, with the exact command to fix it: `gh auth refresh --hostname <host> --scopes
<missing scopes>`.

That command is shown, never run. `gh auth login` and `gh auth refresh` both suppress their
device-code prompt the instant standard input is not a real terminal, which is always true of a
process this application spawns — so driving either from inside the app would hang forever with
nothing printed. The section names the exact command, offers a copy-to-clipboard button, and a
"Check again" button to re-read the list once the person has run it themselves. The same route
covers "add an account": the section always shows a `gh auth login` command block, with the same
copy-and-check-again pattern, rather than a button that pretends to start a sign-in it cannot
finish.

`gh auth refresh` only ever affects the *active* account on a host, which the section's copy says
plainly beside the command when the account in question is not already active: switch to it first
(see below), then run the refresh command.

### Switching gh's active account

Pressing "Switch" on a row calls `gh auth switch --hostname <host> --user <login>` — both flags are
always supplied, so the call is never left to `gh`'s own interactive disambiguation prompt, which
this application could not answer anyway.

`gh auth switch`'s own exit code is **never** trusted as proof the switch happened. Immediately
after the command runs, `main/ghcli/accounts.ts` re-reads the whole account list and only reports
success once the requested login is genuinely the active one on that host. A switch that "succeeded"
by exit code but did not actually take is reported as a failure, with `gh`'s own message.

This is disclosed, in words, at the point of switching — not only after. A persistent warning sits
directly above the row actions, visible before the button is ever pressed: switching here changes
`gh`'s active account **for the whole computer** — every terminal, script and other tool that uses
`gh`, not only this application. The warning is a fact and is pinned into every funny level and both
languages by `GHCLIACCOUNTS_FACTS` in `packages/ui/src/copy/surfaces/ghCliAccounts.ts`; the funny
level styles the surrounding voice, never the "whole computer" fact itself. A successful switch's own
confirmation message repeats that machine-wide consequence.

### Falling back to gh when the app's own sign-in fails

`main/ghcli/routing.ts` gives the rest of the application a shared way to retry a failed GitHub
operation through `gh` when it is safe to do so, rather than a dead end. It is a set of pure
decision functions plus one orchestrator (`routeWithFallback`); nothing in it spawns a process or
sees a token.

- **Only identity, permission or visibility failures are retried.** A 401 (the credential is no
  longer accepted), a 403 that is not a rate limit, a 404 (GitHub's own "either it does not exist
  or you cannot see it" — ambiguous by design, so trying a different credential is the only way to
  tell the two apart), or an explicit missing-scope failure all retry through `gh`. A network
  failure, a rate limit, or a malformed request never retries — every credential on the same network
  would hit those identically, and retrying only doubles the wait before the same answer.
- **A 404-then-success is reported as an access difference, never as "found it after all".** When
  the app's own sign-in gets a 404 and `gh` succeeds at the same operation, the honest reading is
  that the app's account cannot see the thing, not that it was missing — and the result says so in
  those words. A 404-then-404 is reported as genuinely missing instead, because two different
  accounts agreeing is real evidence.
- **A write never runs through a different account than the one selected, without asking first.**
  Reading is low-stakes enough to fall back on automatically. Creating a repository, pushing a
  workflow file, or dispatching a run as an identity nobody chose in the interface is a genuine
  surprise and could put something under the wrong account's name entirely, so `decideWriteRoute`
  refuses to proceed automatically the moment the fallback account differs from the selected one,
  and names both accounts so the interface can ask.
- **Route selection can use known scopes before ever failing.** `chooseAccountForScope` picks
  between two known credentials by which one is already known to hold a required scope, so an
  operation that always needs `workflow` can prefer the account that has it rather than discovering
  the gap by failing first.
- **When both routes fail, both failures are reported, distinctly** — the same side-by-side
  diagnostic value `cirender/transport.ts`'s own `resolveTransport` report already has, never
  collapsed into one generic apology.
- **`gh` not being available is degraded honestly.** When there is no fallback to try at all —
  `gh` is not installed, or has no ready account — the result names that and points at the System
  dependencies section of Settings, rather than promising a retry that cannot happen.

This module is a shared library other GitHub-touching surfaces (CI render, repository bootstrap,
backup) can call into; it does not itself decide when any particular screen should offer a retry.

## Configuration

There is nothing to configure. The section appears automatically inside Settings → GitHub whenever
the build's preload exposes the `ghCliListAccounts`/`ghCliSwitchAccount` methods (every current
build does); on an older build that predates this feature the section is simply absent, the same
rule the app's own account list already follows.

## Failure modes

| Situation | What is shown |
|---|---|
| `gh` is not on PATH at all | "gh is not on this computer's PATH…", plus a note that the app's own sign-in above is unaffected, plus a button to the System dependencies settings. |
| `gh` is installed but nobody is signed in to it | "gh is installed but nobody is signed in to it. Run `gh auth login`…", plus the same command shown as a copyable block. |
| `gh` answers a shape this build does not recognise (a very old or very new `gh`) | "gh answered … in a format this application does not recognise, so its accounts cannot be listed safely." Never reported as zero accounts. |
| An account's token is short a scope this application needs | A warning on that account's own row, naming the missing scopes and the exact `gh auth refresh` command. |
| `gh auth switch` reports success but the account did not actually become active | Reported as a failure, with `gh`'s own message — never a false "Active" chip. |
| A search matches nothing, while accounts exist | "Nothing here matches that search. Clearing it brings the whole list back." — distinct from either "installed and signed in as nobody" or "not installed". |

## Security considerations

- **The token never crosses this boundary.** `gh auth status --show-token` is never passed, `gh`'s
  credential file is never read directly, and nothing in the IPC channel (`ghCli:listAccounts`,
  `ghCli:switchAccount`) or the renderer's bridge types carries a token field. Every test in
  `main/ghcli/` asserts `--show-token` never appears in a spawned command's arguments.
- **Switching is disclosed, not hidden.** Because `gh auth switch` is genuinely machine-wide, the
  warning above the row actions is treated as safety-critical copy: it is pinned by
  `GHCLIACCOUNTS_FACTS` so no funny level or rewrite can soften "whole computer" away, and it is
  shown before the action is taken as well as confirmed in the result afterward.
- **`gh auth login`/`gh auth refresh` are never spawned by this application.** Both hang forever
  when their stdin is not a real terminal, which is always true here — attempting to drive either
  would be indistinguishable from a hang with no way to recover except killing the process. The
  section only ever names the command and offers to copy it.
- **The credential-routing fallback never authenticates as an unselected identity for a write.**
  `decideWriteRoute` is the one gate every write-capable caller of `routeWithFallback` goes through;
  it refuses automatically the moment the fallback account differs from the one selected, which is
  the one shape of "silent surprise" this feature could otherwise introduce.

## Verification

- `design/packages/app/src/main/ghcli/accounts.test.ts` — 23 tests over real captured
  `gh auth status --json hosts` and plain-text output (multi-account, empty, the "not logged into
  any hosts" sentence, the legacy `Logged in to HOST as LOGIN` form, an unrecognised format, and the
  switch path re-reading rather than trusting the exit code), plus a `--show-token` never-appears
  check.
- `design/packages/app/src/main/ghcli/routing.test.ts` — 31 tests over the failure classifier, the
  scope-based chooser, the write-route gate, and the full `routeWithFallback` orchestrator (an
  authentication failure that falls back and succeeds; a network error and a rate limit that do not;
  a 404-then-success reported as an access difference; a 404-then-404 reported as genuinely missing;
  a write whose fallback account differs asking rather than proceeding, and one whose account matches
  proceeding; `gh` unavailable degrading honestly; no token-shaped string in any produced message).
- `design/packages/app/src/main/ghcli/ipc.test.ts` — 4 tests over channel registration/disposal and
  both handlers against a fake process runner.
- `design/packages/ui/src/copy/surfaces/ghCliAccounts.test.ts` — 12 tests over the catalogue's shape
  (five levels, both languages, no em-dashes, no token ever quoted), the funny-level slider actually
  changing the text, the FACTS pin never dropping the "whole computer" warning or the "gh"/"separate"
  two-stores distinction at any level.
- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` — 12 tests mounting the real
  component against a scripted bridge: every account's host, active chip and permissions render; the
  machine-wide warning is always shown once accounts exist; a missing-scope warning shows the exact
  refresh command; an unhealthy account is marked; switching reports the machine-wide outcome by
  name; a switch that does not take is reported as a failure; all three honest empty/unavailable
  states render their own distinct message (and the not-installed state's button reaches
  `open-dependencies`); a search with no matches is distinguished from having no accounts at all; the
  two-stores explainer is always present; and nothing token-shaped ever renders.

70 tests total, all passing against the code in this repository — none of them against a real `gh`
process or a real account, so a run of this suite never depends on, or changes, anything about the
machine's real `gh` sign-in.
