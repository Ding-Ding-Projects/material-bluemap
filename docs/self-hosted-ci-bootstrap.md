# Self-hosted CI dependency bootstrap

The project CI uses Linux and Windows self-hosted runners, but it does not treat either
machine as a hand-maintained build image. Every self-hosted job selects one dependency
profile through `.github/actions/bootstrap-self-hosted`. That profile checks the tools the
job actually invokes, installs only what is missing, verifies the result, and then lets the
job continue. A new runner therefore needs the Actions runner itself and an operating-system
shell; it does not need a maintainer to preinstall this repository's build stack.

<details>
<summary><b>Contents</b></summary>

- [Behaviour](#behaviour)
- [Profiles and coverage](#profiles-and-coverage)
- [Configuration](#configuration)
- [Failure modes](#failure-modes)
- [Security considerations](#security-considerations)
- [Verification](#verification)
- [Suggested articles](#suggested-articles)

</details>

## Behaviour

Linux profiles collect missing OS commands and shared libraries first. Debian/Ubuntu,
Fedora/RHEL and Arch-family package managers are supported. Package installation is
non-interactive and occurs only after a command or library probe fails. A non-root runner
uses passwordless `sudo`; if that is unavailable, the step fails and names the exact packages
it could not install rather than waiting for a password prompt nobody can answer.

Tools that publish their own release binaries stay job-local instead of changing the
machine. `actionlint`, `shellcheck`, and `gh` are pinned to exact releases, downloaded from
their canonical upstream release pages, checked against committed SHA-256 digests, unpacked
under `RUNNER_TEMP`, and added to `GITHUB_PATH` for that job only. An installed copy is reused
when it is already the pinned version.

The Windows packaging profile removes the former Git-Bash dependency from every workflow
command: staging, version stamping, and Squirrel artifact collection now use PowerShell.
If Git is absent, the profile installs a pinned MinGit archive from Git for Windows into the
job's temporary directory after checking its SHA-256. Node 22, pnpm 10.33.0, Temurin 8/25,
and Java 25 continue to use the official setup actions and the versions declared by the
workspace and upstream Gradle build.

The screenshot profile provisions `unzip`, Xvfb, Xauthority, process tools, and Electron's
GTK 3 library. After the lockfile install, Playwright still derives Chromium's exact OS
library list from the installed Playwright version: a dry run proves whether those packages
are already satisfied, and only a failed check runs the real installer.

## Profiles and coverage

| Workflow | Job | Runner | Profile | Extra dependencies |
|---|---|---|---|---|
| `build-jars.yml` | `build` | Linux | `java-build` | Git and archive tools; Temurin 8 and 25 arrive through `setup-java` |
| `ci.yml` | `workflows` | Linux | `workflow-lint` | Pinned `shellcheck` and `actionlint` |
| `ci.yml` | `check` | Linux | `workspace` | Git and archive tools; Node/pnpm come from the manifest-backed setup actions |
| `ci.yml` | `package` | Windows | `windows-package` | Git when absent; PowerShell-native packaging helpers |
| `ci.yml` | `config-java-roundtrip` | Linux | `java-roundtrip` | Git, `find`, Node/pnpm, and Temurin 25 |
| `ci.yml` | `test-world` | Linux | `test-world` | `find`, `sed`, `zip`, Node/pnpm, and Temurin 25 |
| `ci.yml` | `screenshots` | Linux | `screenshots` | `pkill`, `unzip`, Xvfb, Xauthority, GTK 3, and Playwright-derived Chromium libraries |
| `ci.yml` | `release` | Linux | `release` | Pinned `gh`, `zip`, hashing/archive/text utilities, and Node/pnpm |
| `pages.yml` | `build` | Linux | `pages-build` | Pinned `gh`, Git, hashing/archive utilities, and Node/pnpm |
| `pages.yml` | `deploy` | Linux | `action-only` | No external executable; the deploy action uses the runner's action runtime |

The render workflows copied into users' repositories remain on GitHub-hosted runners. They
are deliberately outside this inventory: pointing them at project-owned machines would make
somebody else's render depend on those machines being online.

## Configuration

Profiles are declared at each job's bootstrap step. Add or rename a self-hosted job in three
places in the same change: the workflow job, the Linux or Windows profile implementation,
and the hand-written `SELF_HOSTED_JOBS` inventory in
`design/packages/shared/src/selfHostedCiPolicy.test.ts`. The test discovers every
`runs-on: [self-hosted, ...]` job and fails when either side has an entry the other lacks.

The profile scripts expose `--dry-run --fake-missing` on Linux and
`-DryRun -FakeMissing` on Windows. These modes are test hooks: they print the package or
canonical release install that would occur without changing the machine.

## Failure modes

- An unsupported profile or runner operating system fails before the job's build commands.
- A missing package manager names the packages that remain unavailable.
- A runner that needs elevation but has no non-interactive root route fails instead of
  opening a prompt.
- A canonical archive whose SHA-256 differs from the committed digest is refused.
- Every command and the GTK soname are checked again after installation; a package-manager
  exit code alone is never treated as proof that the dependency works.
- Playwright's dry run is trusted only for a positive result. Any failure falls through to
  the real dependency installation, so a future Playwright version cannot silently add a
  library the runner lacks.

## Security considerations

No self-hosted workflow has a `pull_request` trigger. `push`, `workflow_dispatch`, and the
reusable-workflow call paths require repository write access. Downloaded tools come only from
canonical project releases and are checksum-pinned. Secrets are not inputs to the bootstrap,
are never printed, and remain scoped to the later job steps that need them. Job-local tools
do not replace or upgrade an unrelated global installation.

OS libraries cannot be made job-local, so they are the narrow exception: the profile checks
first, installs only the missing distribution packages, and records the exact list in the
job log. Long-lived runners should still be isolated from unrelated production workloads.

## Verification

Run the focused policy suite from the workspace:

```sh
cd design
npx vitest run packages/shared/src/selfHostedCiPolicy.test.ts
```

Run workflow validation only after `shellcheck` is on `PATH`:

```sh
actionlint -color
```

The policy suite proves the ten-job inventory, the profile call in each job, the absence of
`pull_request` on self-hosted workflows, the hosted-runner boundary for render templates,
and isolated fake-missing dry runs. A local dry run proves control flow and planned package
names; only a real GitHub Actions run on each runner OS proves package-manager access,
network reachability, and the complete native toolchain on that machine.

## Suggested articles

- [Setting a repository up for CI rendering](./ci-repository-setup.md) — how the app places
  hosted render workflows in a user's repository without crossing this runner boundary.
- [Rendering a world in GitHub Actions](./render-in-actions.md) — the hosted-runner workflows
  that intentionally remain outside the self-hosted inventory.
- [Automatic dependency provisioning](./dependency-provisioning.md) — the separate app-side
  runtime provisioning path for end users.
