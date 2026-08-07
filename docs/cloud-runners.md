# GitHub-hosted cloud runners

## Behaviour

Every executable job in the repository's seven GitHub Actions workflows runs on an explicit
standard hosted label. Linux build, test, render, release and Pages work uses `ubuntu-latest`;
the Squirrel.Windows packaging job uses `windows-latest`. Reusable-workflow call jobs name the
checked-in workflow they call and cannot declare `runs-on` under GitHub Actions syntax.

This restores disposable, isolated environments for a public repository. A failed or cancelled
run leaves no process, package, or toolchain state on a maintainer's computer, and a pull request
can be validated without executing contributor-controlled code on a project-owned runner.

## Configuration

Runner selection lives beside each executable job in `.github/workflows/`. The workflows retain
the project's ordinary declared setup:

- `pnpm/action-setup@v4` reads the exact `pnpm@10.33.0` package-manager pin from
  `design/package.json`;
- `actions/setup-node@v4` selects Node 22, matching the workspace engine requirement;
- `actions/setup-java@v4` selects the Temurin versions required by the vendored BlueMap build;
- `pnpm install --frozen-lockfile` resolves exactly `design/pnpm-lock.yaml`;
- the workflow-lint job downloads actionlint 1.7.12 from its canonical release, verifies its
  committed SHA-256 digest, and uses shellcheck already present on hosted Ubuntu.

The hand-written inventory in
`design/packages/shared/src/cloudRunnerPolicy.test.ts` names every workflow and all 36 jobs.
Twenty-three executable jobs declare their expected hosted label; thirteen reusable call jobs
declare their exact checked-in target.

## Failure modes

- A new workflow file or job fails the guard until the inventory deliberately names it.
- A missing `runs-on`, an expression, a private runner label, or a non-standard hosted label fails
  the guard for executable jobs.
- A reusable call with a runner label, or an executable job replaced by a reusable call, fails
  because the inventoried job kind no longer matches.
- Any `self-hosted` text or reference to the removed bootstrap action in a workflow fails the
  guard. The deleted action, Linux/Windows scripts, and obsolete bootstrap article are also
  asserted absent.
- A setup action or locked dependency install that fails stops that job. There is no fallback to
  a maintainer machine and no hidden mutation of another environment.

## Security considerations

Hosted runners are ephemeral GitHub-managed virtual machines. Pull-request code executes there,
not on a computer that also holds a maintainer's files or long-lived processes. Workflow tokens
still follow least privilege: read by default, with write permission only on the release or Pages
operation that needs it. Secrets remain unavailable to ordinary fork pull requests under GitHub's
standard event model.

The private-world render path is unchanged. Its payload remains encrypted before upload and its
workflow continues to use standard hosted Ubuntu jobs. This runner change neither weakens that
encryption nor redirects private-builder output.

## Verification

Run the focused policy test from `design/`:

```sh
npx vitest run packages/shared/src/cloudRunnerPolicy.test.ts
```

Then parse all workflow YAML, run actionlint with shellcheck available, and run the workspace
typecheck and site build. These checks prove the checked-in labels, job inventory, workflow
syntax, and rendered documentation; an actual hosted run remains the runtime proof after the
commit reaches the default branch.

## Suggested articles

- [Rendering a world in GitHub Actions](./render-in-actions.md)
- [Rendering a private world](./private-world-rendering.md)
- [Publishing a rendered map to GitHub Pages](./pages-hosting.md)
