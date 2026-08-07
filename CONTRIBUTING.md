# Contributing

Worldlens is a fidelity-first port of [BlueMap](https://github.com/BlueMap-Minecraft/BlueMap)
from Java and JavaScript into TypeScript. Most of the work is mechanical in the best sense: read
the upstream file, write the same thing in TypeScript, prove it behaves identically. That shapes
everything below.

Read [`plan.md`](plan.md) and [`design/docs/porting-conventions.md`](design/docs/porting-conventions.md)
before your first change. [`AGENTS.md`](AGENTS.md) carries the same rules for automated agents.

## Getting set up

Requires **Node 22+** and **pnpm 10** (the workspace pins `pnpm@10.33.0` via `packageManager`).

```sh
git clone https://github.com/Ding-Ding-Projects/material-bluemap.git
cd material-bluemap
git submodule update --init --recursive   # vendor/BlueMap, the upstream reference
cd design
pnpm install
```

The clone URL and directory above are the repository's current hosting path during the rename;
they are not the product name. Use the current host until the separate repository rename lands.

The submodule is not optional. It is the specification you are porting from, and it is pinned at
upstream commit `e664c1a`. Legacy Minecraft 1.12 sources come from upstream tag
`v0.10.3-mc1.12`; fetch them with `git fetch --tags` in `vendor/BlueMap` and read a file with
`git show v0.10.3-mc1.12:<path>`.

## Commands

All of these run from `design/`.

| Command             | What it does                         |
| ------------------- | ------------------------------------ |
| `pnpm build`        | Builds every package in `packages/*` |
| `pnpm test`         | Runs the full vitest suite once      |
| `pnpm test:watch`   | vitest in watch mode                 |
| `pnpm lint`         | ESLint over the workspace            |
| `pnpm format`       | Prettier write                       |
| `pnpm format:check` | Prettier check, no writes            |

Type-check a single package without building:

```sh
npx tsc -p packages/engine/tsconfig.json --noEmit
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `pnpm lint`, then `pnpm build`,
then `pnpm typecheck` and `pnpm test:ci` (among other jobs — the Windows installer, the vendored
Java engine build, a real rendered-world screenshot pass) on every push, pull request and manual
dispatch.
**Lint runs before the type check**, so a single unused variable fails the job before tsc ever
reports the real type errors underneath it. Run lint first locally too.

**Every executable job uses an explicit standard GitHub-hosted runner.** Linux work runs on
`ubuntu-latest`; the Squirrel.Windows package runs on `windows-latest`. The disposable runner
boundary is why pull-request validation is enabled again without executing contributor code on a
project-owned computer. A hand-written policy test inventories all workflow jobs and rejects
missing or non-standard labels. See decision D20 in
[`design/docs/decisions.md`](design/docs/decisions.md) and
[`docs/cloud-runners.md`](docs/cloud-runners.md) for the complete boundary.

> **Fixed: the Windows build that built nothing.** The `build` script used to quote its
> workspace filter with single quotes. `cmd.exe` does not strip those, and npm-scripts on
> Windows run through `cmd.exe`, so pnpm received the filter with the quotes still attached,
> matched nothing, printed `No projects matched the filters` and **exited 0** — indistinguishable
> from a successful build. POSIX `sh` does strip them, which is why Ubuntu CI never noticed.
>
> The script now uses double quotes, which both shells strip, and carries
> `--fail-if-no-match`, so a filter that selects zero projects exits 1 instead of 0. `pnpm build`
> is now trustworthy on Windows; if it ever prints `No projects matched the filters` again, it
> will fail rather than pass. Do not "fix" the double quotes into bare `./packages/**` — `sh`
> would expand the glob into one argument per package before pnpm ever saw it.

Phase C is in progress and some of its files are committed as work in progress. Where that leaves
the tree red, [`design/HANDOFF.md`](design/HANDOFF.md) records it. Check there before treating a
failure as something you caused, and check that it is still accurate before relying on it.

## Porting rules

The full list is in [`design/docs/porting-conventions.md`](design/docs/porting-conventions.md).
The parts that decide whether a change gets merged:

1. **Fidelity first.** Port file by file. Preserve upstream class, method, field and constant
   names and the control flow. Same relative path and file name as upstream, with a `.ts`
   extension: `webapp/src/js/map/Map.js` becomes `packages/viewer/src/map/Map.ts`.
2. **No behavioural improvements.** Bug-for-bug compatibility unless [`plan.md`](plan.md)
   explicitly calls out a change. A cleaner algorithm that produces different output is a defect
   here. Refactors that touch ported code are out of scope for the port phases.
3. **TypeScript strict**, from `design/tsconfig.base.json`: `strict`,
   `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`,
   `verbatimModuleSyntax`, `isolatedModules`, and NodeNext module resolution. In practice that
   means relative imports end in `.js` and type-only imports use `import type`. Avoid `any`; use
   `unknown` plus narrowing where upstream is dynamic.
4. **Where upstream uses Lombok `@Getter` or `@Delegate`, write the explicit method.** There is
   no annotation to lean on.
5. **Keep upstream comments that explain behaviour.** Drop upstream licence headers, since
   attribution lives in [`design/NOTICE`](design/NOTICE). Add a short `upstream: <File>.java`
   note at the top of each ported file. Do not add commentary about the porting process itself.
6. **Node packages** (`shared`, `nbt`, `engine`, `server`, `cli`) are ESM with explicit `.js`
   extensions on relative imports. Browser-bundled packages (`viewer`, `ui`, the `app` renderer)
   use bundler resolution and need no extensions.
7. **Numeric fidelity.** Mirror upstream primitive arrays with typed arrays, and preserve integer
   semantics (`| 0`, `>>> 0`, `Math.trunc`) wherever Java int or long maths matters. 64-bit
   handling is documented in [`design/docs/decisions.md`](design/docs/decisions.md).
8. **Tests.** Every ported module with non-trivial logic gets a vitest, colocated as `*.test.ts`
   or under `test/`, asserting behaviour against upstream-derived fixtures.
9. **Formatting.** Prettier, 4-space indent, 100 columns, double quotes, trailing commas. The
   wide indent is deliberate: it keeps the TypeScript visually close to the upstream Java and JS
   so the two can be read side by side.

Match the established idiom instead of inventing a parallel one. For a "Keyed plus Registry"
type, read `design/packages/shared/src/Registry.ts`, `design/packages/shared/src/Keyed.ts`, and
the canonical example `design/packages/engine/src/world/biome/GrassColorModifier.ts` first.

### Log every intentional divergence

Any deliberate difference from upstream gets an entry appended to
[`design/docs/deviations.md`](design/docs/deviations.md), naming the upstream file and line and
why the port differs. That log already covers the mandated security deviations and the structural
ones. A silent divergence is indistinguishable from a bug to everyone downstream of you.

## Commit messages

The convention in this repository, visible in `git log`:

- A concise imperative English subject line that says what changed. Someone scanning the log must
  learn what happened without decoding a joke.
- A body in English **and** playful Hong Kong-style Cantonese, both saying the same thing. Humour
  styles the telling; the body still names the real behaviour, the real cause, and the real fix in
  unambiguous words, with file and symbol names left exact in both languages. Roast the code, not
  a person.
- A `Co-Authored-By:` trailer for any agent that wrote part of the change.

Wrap the body at roughly 76 columns. Reference an issue as `Refs #N` while the work is
unverified; save `Fixes #N` for the push that carries verified work, because a closing keyword
closes the issue the moment the push lands.

A real example from the history:

```
Complete Phase B: engine world layer green with 1.18 + 1.12.2 e2e proofs

Tristate ported; typed Phase C/D placeholder contracts (DataPack,
ResourcePack, RenderSettings, Mask); anvil WorldLoaderType wiring
verified; world-e2e test builds synthetic 1.18 (padded paletted block
states) and 1.12.2 (nibble arrays) worlds byte-by-byte and asserts exact
BlockState/biome/light decoding through MCAWorld, including legacy
extension reconstruction (fence connections, snowy grass). Monorepo:
501 tests across 50 files, build+lint clean.
```

"WIP" is not a commit message. Where a commit genuinely is a half-finished checkpoint, say that,
and say what state it leaves the tree in, so the next person knows a red build is expected.

## Pull requests

- Branch from `main`. Task branches in this repository use the `claude/<topic>` prefix, which CI
  also builds.
- Keep a PR to one coherent change. A port of one upstream file, or one wave of related files, is
  the right size. Do not mix a port with a refactor of code you happened to read.
- Before opening it: `pnpm lint`, `pnpm build`, `pnpm test`, all green locally, and a per-package
  `tsc --noEmit` for anything you touched.
- Say in the description which upstream files the change ports, at which upstream commit or tag,
  and what evidence you have that the behaviour matches: the test names and counts, or the
  fixture the test asserts against.
- If the change diverges from upstream at all, link the `design/docs/deviations.md` entry you
  added. A PR that changes behaviour without one will be sent back for it.
- Update the documents the change makes stale in the same PR: `design/ROADMAP.md` when a phase
  moves, `design/HANDOFF.md` when the current state changes, and the relevant file under
  `design/docs/`.
- Never weaken `packages/engine/test/world-e2e.test.ts` to make a change pass. It is the Phase B
  acceptance proof, and it asserts byte-level decoding of synthetic 1.18 and 1.12.2 worlds on
  purpose.
- Do not commit Minecraft assets. They are Mojang's property and are downloaded at runtime with
  explicit user consent, never redistributed. See [`design/NOTICE`](design/NOTICE).

## Reporting

Security issues do not go in the public issue tracker. Follow [`SECURITY.md`](SECURITY.md).

Everything else goes in GitHub issues. For a rendering or decoding bug, the Minecraft version,
the world version (`DataVersion` from `level.dat` if you have it), and the smallest region file
that reproduces it are worth more than a description.

## Licence

Contributions are MIT licensed, matching [`LICENSE`](LICENSE) and the upstream project. By
contributing you agree your work ships under those terms.
