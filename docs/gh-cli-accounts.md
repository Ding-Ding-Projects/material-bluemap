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

### Install GitHub CLI and sign in from the same screen

When the account probe says `gh` is missing, the account section uses the existing system-dependency
bridge instead of sending somebody elsewhere or printing a command. It loads the dependency preview,
selects only the registry entry `githubCli`, and shows its resolved package-manager route (currently
`winget` package `GitHub.cli`) plus the registry's exact administrator-permission disclosure before
the button is enabled.

**Install GitHub CLI and sign in** is one guarded chain with one operation in flight:

1. Run `installSysdeps(["githubCli"])`, never the other selected dependencies from the full System
   dependencies screen.
2. Render the install event's real stage, message, and determinate percentage when one exists. A
   phase-only event remains indeterminate; the interface never invents a percentage.
3. Accept only an `installed` or `already-installed` outcome that the dependency engine verified.
   If the preview already verified an installed `gh`, skip package-manager mutation entirely.
4. Re-read the real `gh` account state. If `gh` is still unavailable on the app's PATH, stop and
   say so; never pretend the installation made the next stage possible.
5. Start the existing GUI device flow only after that re-probe proves `gh` is available.

Cancellation follows the stage that owns the work. During installation it calls the existing
`cancelSysdepInstall()` bridge and does not fall through to sign-in. Once device approval starts,
the existing **Cancel sign-in** action calls `ghCliCancelLogin()`. A cancellation between stages is
remembered and prevents the next stage from beginning.

### GUI sign-in and scope repair

The account section completes `gh` sign-in without asking somebody to run a terminal command. The
main process uses GitHub CLI's verified public OAuth client identity (`178c6fc778ccc68e1d6a`) to
request a device code, then shows only the one-time user code and GitHub approval URL in Settings.
It requests `repo`, `workflow`, `gist`, `read:org`, `read:project`, and `project` together so one
approval covers every permission this application can need through `gh`.

Pending approval, GitHub's `slow_down` response, denial, expiry, cancellation, credential storage,
and identity verification are distinct visible states. Before either opening or rendering an
address, the main process requires the exact HTTPS `github.com/login/device` route (and only the
matching `user_code` query on a complete URL); the code and URL remain visible if no browser
association exists.

After approval, the access token stays in the main process just long enough to be written over
stdin with the exact argument array below. The app removes inherited `GH_TOKEN`, `GITHUB_TOKEN`,
enterprise-token variants, `GH_HOST`, and `GH_DEBUG` from this command and both proof commands, so
an environment override cannot masquerade as the newly stored account, redirect host selection, or
print auth diagnostics:

```text
gh auth login --hostname github.com --git-protocol https --with-token
```

The app never places it in argv, an environment variable, an intermediary file, a log message, or
IPC. `gh` owns whichever operating-system keyring or CLI configuration storage it selects. The
main process then runs `gh auth status --hostname github.com --json hosts` and
`gh api --hostname github.com user --jq .login`; success is reported only when the stored active
account and effective API identity agree. The application retains no token copy.

The section still computes, per account, which operation-critical scopes (`repo` for backup and
`workflow` for CI dispatch) are missing. **Approve required permissions** starts the same GUI flow
with that account as the expected identity. If the browser approves somebody else, the interface
reports which account `gh` actually stored and activated; it never claims the requested account
changed.

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

The CI-render upload route applies the same switch automatically when a render was assigned to an
account that is signed in to `gh` but is not active there. It does not restore the previous account
afterwards: `gh auth switch` is a whole-computer choice, and silently switching it back would
contradict the account list's existing contract. The render card says this before the upload starts.
Immediately before every release read, create, or upload, the main process re-reads the signed-in
inventory, switches if needed, and verifies the effective login through
`gh api --hostname <host> user --jq .login`. This last check also catches an environment override
that would make the next command authenticate as somebody other than the selected account.

Release subcommands keep the host through their supported repository grammar:
`gh release create ... --repo <host>/<owner>/<repository>` and the corresponding upload command.
They are never given `--hostname`; unlike `gh api` and `gh auth switch`, `gh release create` and
`gh release upload` do not define that flag.

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
the preload can list accounts. GUI login is enabled only when the preload exposes the complete
`ghCliStartLogin`, `ghCliCancelLogin`, and `onGhCliLoginState` trio, so an older shell never renders
a half-working sign-in button. The one-click installation path is enabled only when the preload also
exposes `sysdepsPreview`, `installSysdeps`, `cancelSysdepInstall`, and `onSysdepInstallEvent`; an older
or browser-only shell retains the link to the full System dependencies screen instead of drawing a
button that cannot run.

## Failure modes

| Situation                                                                                            | What is shown                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gh` is not on PATH at all                                                                           | The resolved `GitHub.cli` installer route, administrator-permission disclosure, and **Install GitHub CLI and sign in**. Older shells fall back to the System dependencies link. |
| The installer is cancelled                                                                           | Real cancellation progress followed by a stopped state. Account probing and device sign-in do not begin.                                                                        |
| The package manager finishes but `gh` verification fails                                             | The real verification failure is shown. Account probing and device sign-in do not begin.                                                                                        |
| The preview already verifies an installed `gh`                                                       | Package-manager mutation is skipped; the app re-probes accounts and proceeds to device sign-in.                                                                                 |
| `gh` is installed but nobody is signed in to it                                                      | An honest signed-out status plus **Sign in with gh**, which opens the GUI device flow.                                                                                          |
| `gh` answers a shape this build does not recognise (a very old or very new `gh`)                     | "gh answered … in a format this application does not recognise, so its accounts cannot be listed safely." Never reported as zero accounts.                                      |
| An account's token is short a scope this application needs                                           | A warning naming the missing scopes plus **Approve required permissions**, using the same GUI flow.                                                                             |
| Approval is pending or GitHub asks the client to slow down                                           | The code, URL, countdown, and current wait state remain visible; the polling interval only grows.                                                                               |
| Approval is denied, expires, or is cancelled                                                         | A terminal state names exactly what happened. No `gh` command runs before approval.                                                                                             |
| `gh` stores the credential but status or API identity cannot be proved                               | The UI says storage may have happened but verification failed; it never reports a successful sign-in.                                                                           |
| `gh auth switch` reports success but the account did not actually become active                      | Reported as a failure, with `gh`'s own message — never a false "Active" chip.                                                                                                   |
| The selected account is signed in but inactive when a release operation begins                       | The app switches to it with the exact host and login, re-reads the account inventory, verifies the effective API identity, and leaves it active machine-wide.                   |
| The selected account is missing, unhealthy, the switch is refused, or the effective identity differs | The release command is not run. The upload panel names the account and host, says no release data changed, and offers **Open GitHub accounts** beside the failure.              |
| An enterprise host is selected                                                                       | Release commands use `--repo <host>/<owner>/<repository>`; no unsupported `--hostname` flag is added.                                                                           |
| A search matches nothing, while accounts exist                                                       | "Nothing here matches that search. Clearing it brings the whole list back." — distinct from either "installed and signed in as nobody" or "not installed".                      |

## Security considerations

- **The token never crosses this boundary.** `gh auth status --show-token` is never passed, `gh`'s
  credential file is never read directly, and nothing in the account/login IPC channels, progress
  event, or renderer bridge types carries a token field. Every test in
  `main/ghcli/` asserts `--show-token` never appears in a spawned command's arguments.
- **Switching is disclosed, not hidden.** Because `gh auth switch` is genuinely machine-wide, the
  warning above the row actions is treated as safety-critical copy: it is pinned by
  `GHCLIACCOUNTS_FACTS` so no funny level or rewrite can soften "whole computer" away, and it is
  shown before the action is taken as well as confirmed in the result afterward.
- **The interactive `gh auth login` prompt is never scraped.** It suppresses its device code without
  a terminal. The app performs the documented device exchange, then invokes only the
  non-interactive `--with-token` storage form with the approved token on stdin.
- **The token has one secret-safe route.** It exists only inside the main-process login function,
  is redacted from every failure, and is absent from event, state, and result types. Tests assert it
  is present on stdin but absent from argv, inherited auth environment, IPC-shaped JSON, and
  rendered text. Account listing, switching, storage, status, and API proof all omit `GH_TOKEN`,
  `GITHUB_TOKEN`, their enterprise variants, `GH_HOST`, and `GH_DEBUG`; `GH_CONFIG_DIR` stays
  inherited because it identifies the user's real gh credential store.
- **The credential-routing fallback never authenticates as an unselected identity for a write.**
  `decideWriteRoute` is the one gate every write-capable caller of `routeWithFallback` goes through;
  it refuses automatically the moment the fallback account differs from the one selected, which is
  the one shape of "silent surprise" this feature could otherwise introduce.
- **Identity is checked at the write boundary, not only at preflight.** Packing thousands of files
  can take hours, during which another terminal can change `gh`'s active account. Every release
  read/create/upload rechecks the selected host and login and stops before mutation on any mismatch.

## Verification

- `design/packages/app/src/main/ghcli/accounts.test.ts` — 25 tests over real captured
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
- `design/packages/app/src/main/ghcli/login.test.ts` — direct device-flow coverage for pending,
  slow-down, denial, expiry, cancellation, stdin-only credential storage, status/API identity proof,
  account mismatch, strict approval-URL validation, inherited auth-environment removal, and token
  redaction.
- `design/packages/app/src/main/ghcli/ipc.test.ts` — channel registration/disposal, account handlers,
  secret-free progress events, explicit and renderer-close cancellation, and the
  one-process-wide-login guard.
- `design/packages/app/src/main/cirender/gh.test.ts` — a real child-process check proving omitted
  environment names are removed case-insensitively without putting their values in argv.
- `design/packages/ui/src/copy/surfaces/ghCliAccounts.test.ts` — 12 tests over the catalogue's shape
  (five levels, both languages, no em-dashes, no token ever quoted), the funny-level slider actually
  changing the text, the FACTS pin never dropping the "whole computer" warning or the "gh"/"separate"
  two-stores distinction at any level.
- `design/packages/ui/src/components/github/GhCliAccountsList.test.ts` — 19 tests mounting the real
  component against a scripted bridge: every account's host, active chip and permissions render; the
  machine-wide warning is always shown once accounts exist; a missing-scope warning starts the same
  GUI approval flow; the code, URL, countdown, and cancellation render; an unhealthy account is
  marked; switching reports the machine-wide outcome by
  name; a switch that does not take is reported as a failure; all three honest empty/unavailable
  states render their own distinct message; the not-installed state previews the exact route and
  elevation disclosure, selects only `githubCli`, renders real progress, cancels without starting
  login, and skips installation when the preview already verifies `gh`; older shells still reach
  `open-dependencies`; a search with no matches is distinguished from having no accounts at all; the
  two-stores explainer is always present; and nothing token-shaped ever renders.
- `design/packages/app/src/main/cirender/transport.test.ts` — 32 tests, including the exact
  `gh release create` and `gh release upload` argument arrays on github.com and an enterprise host;
  already-active and inactive selected accounts; the machine-wide auto-switch; missing-account,
  refused-switch and effective-identity-mismatch refusals; release-create failure; resume upload;
  and proof that no release command contains the unsupported `--hostname` flag or runs after an
  identity failure.
- `design/packages/ui/src/components/cirender/CiRenderScreen.test.ts` — the route refusal renders
  **Open GitHub accounts** on the same card and returns through the existing Settings action.

The account, login, and transport suites are all local fakes: they never mutate the machine's real
`gh` sign-in and never publish a release. Login asserts the exact `gh auth login` argument array and
asserts the approved token separately on stdin. A real browser approval remains external-account
runtime proof, not a claim made by these tests.
